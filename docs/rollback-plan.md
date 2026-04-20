# Offline Rollback — Single-PWA Approach

Handoff document for building an emergency-rollback feature: users can switch the
currently-installed Lotta PWA to an older build if a new release is broken,
without leaving the installed app, and keep working offline.

**Status**: design finalized, partial groundwork shipped, UI + SW routing + CI
deployment not yet built.

---

## 1. Problem

Lotta is used mid-tournament on random laptops and phones, often behind flaky
venue wifi or fully offline. If a bad deploy ships, an organizer stranded
offline cannot wait for the maintainer to redeploy the previous commit — they
need a working fallback already on their device.

The feature: the installed mainline PWA can switch to any previously-deployed
version on demand, offline, without reinstalling anything. The user's tournament
data survives the switch via a forced SQLite export before the transition.

## 2. Architecture: single-PWA with runtime-cached rollback bundles

One installed PWA. One service worker registration at scope `/`. Older builds
live at `/v/<version>/` on the gh-pages branch. The mainline SW intercepts
requests to `/v/**` and caches them via Workbox runtime caching. A version
picker inside the mainline app lists all available versions (read from
`/versions.json`) and navigates to the chosen one; the SW serves it from cache
on subsequent visits, so it works offline.

Rollback bundles are **not** installable PWAs. They ship without a web
manifest or SW registration — just static HTML/JS/CSS/WASM served through
the mainline SW. That sidesteps `manifest.id` + nested-scope ambiguity (which
is underspecified in the W3C manifest spec and notoriously inconsistent on
iOS Safari).

Each rollback bundle reads/writes a namespaced IndexedDB (`lotta-chess-v<ver>`)
so an older build cannot corrupt the mainline DB. This is already implemented.

### Why this shape

Considered and rejected alternatives:

| Option | Why not |
|---|---|
| Each `/v/X/` is its own installable PWA (nested scope) | Relies on `manifest.id` semantics that are unresolved in W3C; iOS Safari behavior unverifiable without device testing; storage quota shared anyway so no durability advantage |
| Rollback by redeploying the previous commit to `/` | Simple, standard, but does not help an offline user — their broken SW stays in cache until they're online |
| Bundle one frozen "safe mode" version inside mainline | Only one fallback version; bundle size grows; doesn't support arbitrary older versions |
| Separate subdomain (`stable.lotta.bernting.se`) | Most industry precedent, but DNS/cert overhead and second install ceremony; user must remember to install it ahead of time |

The single-PWA approach trades the "install-time precache" durability of the
nested-PWA approach for UX-driven precaching: a "pin this version for offline"
button in the picker. Storage persistence is per-origin, so once mainline is
installed, everything the SW caches (including runtime-cached rollbacks)
inherits the origin's persistent-storage grant.

## 3. What already exists

### Shipped (on `main`)

- `src/db/db-name.ts` — pure helper. `dbName(base, version) = base` when
  version is null, `${base}-v${version}` otherwise. Tested in
  `src/db/db-name.test.ts`.
- `src/db/persistence.ts` and `src/db/undo-persistence.ts` — use `dbName`
  to namespace the IDB database when `__ROLLBACK_VERSION__` is set at build
  time.
- `src/globals.d.ts` — declares `__ROLLBACK_VERSION__: string | null`.
- `src/build/rollback-config.ts` + `.test.ts` — pure helper that derives
  build parameters (`base`, `cacheId`, `manifestId`, `manifestName`,
  `manifestShortName`) from the rollback version string. Returns `null` for
  mainline builds. **Note**: the manifest fields are now dead weight and
  should be removed in slice 1 (see below).
- `vite.config.ts` — reads `ROLLBACK_VERSION` env, defines
  `__ROLLBACK_VERSION__`, wires the rollback-config output into `base`,
  Workbox `cacheId`, and manifest `id`/`name`/`short_name`.
- `package.json` — `build:rollback` script runs Vite with
  `--outDir dist-rollback`.
- `.gitignore` — excludes `dist-rollback`.

### Uncommitted on disk, NEEDS REVERTING before starting

The previous session drafted two CI workflows for a different architecture
(nested-PWA subpath snapshots). They do not match the current plan.

- `.github/workflows/deploy.yml` — modified
- `.github/workflows/rollback-deploy.yml` — new, untracked

**Before starting slice 1, run:**

```bash
git checkout -- .github/workflows/deploy.yml
rm .github/workflows/rollback-deploy.yml
```

The CI workflows will be rebuilt from scratch in slice 6 below.

## 4. Implementation plan — ordered slices

Each slice is independent enough to commit and push separately. Write the test
first, confirm it fails for the right reason, then make it pass with the
smallest change that works. Do not anticipate the next slice's needs.

Run after every slice:

```bash
pnpm test --run
pnpm exec tsc -b
```

Commit when green, using Conventional Commits (`feat:`, `fix:`, etc.). No
AI-attribution trailers.

### Slice 1 — strip dead manifest fields from rollback-config

The rollback-config helper currently returns `manifestId`, `manifestName`,
`manifestShortName`. None of those will be used once rollback bundles stop
installing as PWAs. Remove them now to prevent future drift.

**Files**: `src/build/rollback-config.ts`, `src/build/rollback-config.test.ts`,
`vite.config.ts`.

**Expected shape**:

```ts
// After
interface RollbackBuildConfig {
  base: string
  cacheId: string
}
export function rollbackBuildConfig(version: string | null): RollbackBuildConfig | null
```

In `vite.config.ts`, remove the spread `...(rollback ? { id: rollback.manifestId } : {})`
from the manifest block and drop the `rollback?.manifestName` / `rollback?.manifestShortName`
fallbacks (since the whole VitePWA block will be removed from rollback builds
in slice 2, this is more about tidiness for mainline).

**Test update**: update the existing test in
`src/build/rollback-config.test.ts` to expect only `{ base, cacheId }`.

### Slice 2 — disable VitePWA in rollback builds

Rollback bundles must not register a service worker (would fight the mainline
SW over scope) and must not emit a web manifest (would prompt users to install
them as separate PWAs). When `ROLLBACK_VERSION` is set, skip the VitePWA
plugin entirely, and skip the `<link rel="manifest">` injection.

**Files**: `vite.config.ts`, `index.html`.

**Implementation sketch**: in `vite.config.ts`, conditionally include
`VitePWA(...)` in the `plugins` array only when `rollback` is null. Check
`index.html` for `<link rel="manifest">` — if present and static, leave it
(a missing manifest.webmanifest in the rollback build is harmless) or add a
build-time transform to strip it from rollback builds.

**Verification**:

```bash
rm -rf dist dist-rollback
ROLLBACK_VERSION=0.0.0-test pnpm build:rollback
ls dist-rollback/sw.js                     # Should NOT exist
ls dist-rollback/manifest.webmanifest      # Should NOT exist
test -f dist-rollback/index.html           # Must still exist
```

No tests need updating unless there's a unit test touching VitePWA config
specifically (there shouldn't be).

### Slice 3 — mainline SW runtime-caches `/v/**`

The mainline SW's scope is `/` so it already intercepts fetches to `/v/**`.
Add a Workbox `runtimeCaching` rule so those responses land in a dedicated
cache that outlives precache-manifest rotations.

**Files**: `vite.config.ts` (the `VitePWA` block's `workbox` config).

**Implementation**:

```ts
workbox: {
  // ... existing
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/v/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'lotta-rollback-bundles',
        expiration: {
          // No maxAgeSeconds. Rollback bundles should persist indefinitely
          // under the PWA install's persistent-storage grant.
        },
      },
    },
  ],
}
```

**Caveats to preserve in a comment near the rule**: the cache name is stable
across mainline releases so pinned rollbacks don't get wiped; `NetworkFirst`
ensures a fresh copy when online but still serves cached bytes offline.

**Tests**: none automated here — SW runtime behavior is hard to unit-test
inside Vitest. The e2e test in slice 7 covers the behavior.

### Slice 4 — generate `versions.json`

The version picker reads `/versions.json` from the site root to know which
rollback versions are available. This file must reflect the actual state of
the `gh-pages` branch, so it is generated during mainline's deploy step in CI.
Locally, during dev, a fallback empty or synthetic list is fine.

**Files**:
- new: `scripts/build-versions-json.mjs` — reads the current `gh-pages`
  checkout (or a directory argument) and emits a JSON file listing `v/*/`
  subdirs with their commit hash and date if available.
- `vite.config.ts` — during mainline build, write a dev-mode stub to
  `public/versions.json` (e.g. `{"versions":[]}`). The real one gets
  overwritten at deploy time.
- `.gitignore` — exclude `public/versions.json` similar to existing
  `public/version.json`, `public/changelog.json` entries.

**Shape**:

```json
{
  "versions": [
    { "version": "1.2.3", "date": "2026-03-10", "hash": "abc1234" },
    { "version": "1.2.4", "date": "2026-03-25", "hash": "def5678" }
  ]
}
```

Order: newest first. Empty on fresh deploy.

**Tests**: unit-test the pure function inside `build-versions-json.mjs` that
converts a list of directory names to the JSON structure. Integration with
the filesystem can be exercised with a temp dir.

### Slice 5 — version picker UI + forced export flow

Add a "Switch to older version" action somewhere in the app menu. Clicking
it opens a dialog that:

1. Fetches `/versions.json`, lists versions.
2. For each version, shows status: `available offline` (in SW cache) or
   `online required` (not yet cached).
3. Has a "Pin for offline use" button per version — triggers a background
   fetch of that version's `index.html` and all its assets so the SW caches
   them.
4. Has a "Switch to this version" button — gated behind a forced DB export
   step. The user must click "Download backup" and complete the download
   before the switch button enables.
5. On switch: `window.location.assign('/v/<version>/')`.

**Files**:
- new: `src/components/dialogs/RollbackDialog.tsx`
- new: `src/components/dialogs/RollbackDialog.test.tsx`
- new: `src/hooks/useVersions.ts` — TanStack Query hook that fetches
  `/versions.json`.
- menu integration: find where "Database backup" / "Print" live (recent
  commits mention the dialogs pattern — see `0cf674f`) and add the entry
  alongside.

**Acceptance**:
- Dialog opens with loading, then shows the version list.
- Offline or no `versions.json`: shows a friendly empty state, not a crash.
- Export-then-switch is one forced ordering. User cannot switch without
  first exporting.
- "Pin offline" triggers fetches and updates the status to "available
  offline" when done.

**Testing**: component tests for render states (empty, loading, populated),
for the forced-export gate, for the pin-offline interaction. Use
`data-testid` attributes for selectors.

### Slice 6 — CI deploy to gh-pages with `clean-exclude: v/**`

Switch from the current `actions/deploy-pages`-based deploy to
`JamesIves/github-pages-deploy-action@v4` pushing to a `gh-pages` branch.
`clean-exclude: v/**` preserves rollback subdirs when mainline redeploys.

**Files**: `.github/workflows/deploy.yml`, new
`.github/workflows/rollback-deploy.yml`.

**Mainline deploy (replace current `deploy` job)**:

```yaml
- uses: actions/download-artifact@v4
  with:
    name: dist
    path: dist

- name: Generate versions.json from existing gh-pages
  run: node scripts/build-versions-json.mjs --from-branch gh-pages --out dist/versions.json

- uses: JamesIves/github-pages-deploy-action@v4
  with:
    branch: gh-pages
    folder: dist
    clean: true
    clean-exclude: |
      v/**
```

Permissions change: drop `pages: write` and `id-token: write`; add
`contents: write`. Drop `environment: github-pages` on the deploy job
(keep it on `build` if secrets depend on it).

**Rollback deploy** (new file):

```yaml
name: Deploy rollback bundle
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version string without leading v'
        required: true
        type: string

permissions:
  contents: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Resolve version
        id: ver
        run: |
          if [ -n "${{ inputs.version }}" ]; then
            echo "value=${{ inputs.version }}" >> "$GITHUB_OUTPUT"
          else
            tag="${GITHUB_REF_NAME}"
            echo "value=${tag#v}" >> "$GITHUB_OUTPUT"
          fi
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build:rollback
        env:
          ROLLBACK_VERSION: ${{ steps.ver.outputs.value }}
          VITE_METERED_API_KEY: ${{ secrets.VITE_METERED_API_KEY }}
      - run: cp dist-rollback/index.html dist-rollback/404.html
      - uses: JamesIves/github-pages-deploy-action@v4
        with:
          branch: gh-pages
          folder: dist-rollback
          target-folder: v/${{ steps.ver.outputs.value }}
          clean: true
      - name: Regenerate versions.json
        run: |
          # Check out gh-pages, run scripts/build-versions-json.mjs against
          # the live branch, commit versions.json back to gh-pages root.
          # Implementation: see scripts/build-versions-json.mjs docstring.
```

**Security hygiene**: pin both third-party actions by commit SHA, not `@v4`,
once satisfied they work. (The `tj-actions` supply-chain incident in 2025 is
why.)

**One-time manual step after merge**: in GitHub repo Settings → Pages,
switch source from "GitHub Actions" to "Deploy from a branch" → `gh-pages`,
folder `/`. The custom domain `lotta.bernting.se` persists via its CNAME.

**Known footgun**: `JamesIves` treats `clean-exclude` patterns as also
excluded from *syncing in* (issues #1827, #672). The source folder (`dist`)
must never contain a `v/**` subdir, or those files would be dropped.

### Slice 7 — e2e verification and manual iOS test

**Automated e2e** (Playwright, Tier 1):
- Deploy a fake `/v/fake-1.0.0/` bundle in the test harness (small
  fixture).
- Test: open mainline, open rollback dialog, see the fake version, export
  DB, switch, land at `/v/fake-1.0.0/`, observe a namespaced IDB is open.
- Test: go offline, navigate back to mainline at `/`, still loads.
- Test: go offline before pinning the rollback, switch fails gracefully.

**Manual iOS test** — gate before shipping to production:
- Install mainline on an actual iPhone via Safari Add to Home Screen.
- Confirm rollback dialog opens and lists versions.
- Pin a version, go airplane-mode, confirm it still loads.
- Confirm DB namespacing survives app quit/relaunch.

If any of these fail on iOS, escalate before continuing — the feature is
premature to ship.

## 5. Testing strategy summary

- **Unit tests (Vitest, colocated)**: pure functions only —
  `rollback-config`, `db-name`, `versions.json` builder, pure parts of the
  dialog component (prop handling, forced-export gate logic).
- **Component tests (Vitest + Testing Library)**: `RollbackDialog` render
  states, interactions, `data-testid` selectors.
- **E2E (Playwright, Tier 1)**: the switch flow end-to-end with a local
  fixture bundle. Add as a new project in `playwright.config.ts` to avoid
  leaking into unrelated suites.
- **Manual iOS device test**: before merging the final slice.

## 6. Known risks and open questions

- **Router basepath**: the rollback bundle's TanStack Router must know it's
  running at `/v/<version>/` not `/`. Check `src/main.tsx` / the router
  config — may need to read `import.meta.env.BASE_URL` and pass as
  `basepath`. Verify during slice 2.
- **Subresource fan-out on first visit**: when a user switches to an
  uncached version while partially connected, they can end up with cached
  HTML but missing asset chunks → white screen. The "Pin for offline"
  button is the mitigation; make sure it fetches every precached asset,
  not just the HTML.
- **Schema drift across versions**: an older build cannot safely read a
  newer DB. The namespaced DB (`lotta-chess-v<ver>`) starts empty on first
  switch; the user must re-import their exported backup. Document this
  clearly in the dialog copy.
- **versions.json race condition**: if a rollback deploy and mainline
  deploy run concurrently, the mainline job might regenerate
  `versions.json` before the rollback's `v/X/` subdir appears, missing
  the new version. The `concurrency: pages` group serializes them, which
  should prevent this. Verify.
- **Retention**: versions accumulate on `gh-pages` forever. Not urgent,
  but add a retention policy (e.g. keep last 10) as a follow-up once the
  feature stabilizes.
- **Bundle identity for existing mainline users**: the mainline manifest
  is unchanged by this plan, so existing installed PWAs keep working
  exactly as before. Confirm by diffing `dist/manifest.webmanifest`
  before/after slice 1+2.

## 7. Out of scope

- Automated schema migration reversal. Users must export-then-import.
- Rollback versions as their own installable PWAs. If a future need forces
  this, revisit the nested-PWA approach with iOS device testing.
- Per-user staged rollout (Cloudflare-Workers-Version-Key style). Requires
  leaving GitHub Pages.
- Rolling back the mainline deployment itself. This feature is
  client-side; rolling back the server-side `/` deploy is a separate
  maintainer workflow (`git revert` + push).

## 8. References

### Project-internal
- `CLAUDE.md` — project overview
- `src/db/` — DB layer with `dbName` namespacing
- `src/build/rollback-config.ts` — build-parameter helper
- `vite.config.ts` — build config with `__ROLLBACK_VERSION__` define
- Recent commits:
  - `582bba6 fix(build): use /v/<version>/ base for rollback bundles`
  - the preceding rollback groundwork commit introducing `build:rollback`

### External
- Workbox precaching + runtime caching:
  <https://developer.chrome.com/docs/workbox/precaching-with-workbox>
- VitePWA inject-manifest docs (in case slice 3 requires switching modes):
  <https://vite-pwa-org.netlify.app/workbox/inject-manifest>
- JamesIves action (v4, maintained, not impacted by tj-actions incident):
  <https://github.com/JamesIves/github-pages-deploy-action>
  - Issue #1827 — `clean-exclude` also filters syncing-in (relevant footgun)
- vite-plugin-pwa discussion #821 — rollback-as-cache-swap patterns:
  <https://github.com/vite-pwa/vite-plugin-pwa/discussions/821>
- W3C manifest `id` at nested scopes (underspecified — reason for picking
  single-PWA over nested):
  <https://github.com/w3c/manifest/issues/449>
  <https://github.com/w3c/manifest/issues/539>

## 9. Commit hygiene

- Conventional Commits: `feat(build):`, `fix(sw):`, etc.
- No AI-attribution trailers in commit messages.
- One logical change per commit where possible. Slices 1–5 can each be
  their own commit; slice 6 may land as one because the two workflow files
  are tightly coupled.
- Run `pnpm test --run` and `pnpm exec tsc -b` before every commit. The
  pre-commit hook also runs lint / knip / jscpd / tsc — do not `--no-verify`.
- Do not push to `main` without the user's review of the PR.
