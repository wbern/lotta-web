# Lotta Chess Pairer

Swedish chess tournament management app. A fully client-side web application.

## Architecture

- **Frontend-only:** React 19 + Vite + TanStack Router/Query + TypeScript. Plain CSS. No backend server required.
- **Database:** sql.js (SQLite compiled to WebAssembly) running in-browser, persisted to IndexedDB. All data lives locally in the user's browser.
- **PWA:** Service worker (vite-plugin-pwa) precaches all assets including WASM for offline use. Uses `registerType: 'prompt'` so users choose when to update.
- **Always use pnpm** (never npm) — the project uses `pnpm-lock.yaml` and CI builds with `pnpm install --frozen-lockfile`.
- **Encoding:** Player TSV export includes UTF-8 BOM for Windows compatibility. Import auto-detects encoding (tries UTF-8, falls back to Windows-1252).

## Running

```bash
pnpm dev    # Dev server on port 5173
```

## Key files

- `src/db/` — Database layer: sql.js init, schema, IndexedDB persistence, repositories
- `src/db/database-service.ts` — `DatabaseService` singleton: creates DB, exposes repositories
- `src/db/repositories/` — Repository classes: clubs, tournaments, settings, available-players, tournament-players, games
- `src/api/` — API layer: thin async wrappers around DatabaseService (used by React hooks)
- `src/domain/` — Pure domain logic: scoring, tiebreaks, standings, pairing algorithms, HTML publishing, LiveChess PGN
- `src/hooks/` — TanStack Query hooks (useTournaments, useRounds, useStandings, etc.)
- `src/components/` — React components: layout, tabs, dialogs
- `src/types/api.ts` — Shared TypeScript interfaces (DTOs)
- `src/main.tsx` — App entry point: initializes DatabaseService from IndexedDB, renders React app

## Database layer

The app uses sql.js (SQLite in WebAssembly). On startup, `DatabaseService.create()` loads a previously saved database from IndexedDB, or creates a fresh one with the schema. All writes go through `withSave()` which auto-persists to IndexedDB after each mutation.

Key patterns:
- `getDatabaseService()` / `setDatabaseService()` — service locator in `api/service-provider.ts`
- `withSave(fn)` — runs sync function, then saves DB to IndexedDB
- Repository classes wrap raw SQL queries and return typed DTOs

## Domain modules

Pure functions with no DB dependency, tested independently:

- `domain/scoring.ts` — Result-to-score mapping (normal, WO, chess4 variants)
- `domain/tiebreaks.ts` — Buchholz, Sonneborn-Berger, median, etc.
- `domain/standings.ts` — Full standings calculation, club standings, chess4 standings
- `domain/pairing.ts` — Shared pairing prep (filter withdrawn, assign bye)
- `domain/pairing-berger.ts` — Berger round-robin pairing
- `domain/pairing-monrad.ts` — Monrad (Swiss) pairing
- `domain/pairing-nordic-schweizer.ts` — Nordic Schweizer pairing
- `domain/html-publisher.ts` — Generate standalone HTML pages for pairings, standings, etc.
- `domain/livechess.ts` — Generate PGN for LiveChess export

## Tests

Unit tests via Vitest, **colocated** with source (`foo.ts` → `foo.test.ts`).
Use `fake-indexeddb` for persistence; each test gets a fresh in-memory SQLite DB.

```bash
pnpm test              # run all unit tests
pnpm test:watch        # watch mode
```

## E2E tests

Playwright, **one project per spec file** (see `playwright.config.ts`). Split into tiers:

- **Tier 1 — default** (21 projects): non-p2p, localhost-only. Runs on every push to `main` via CI.
- **Tier 2 — p2p** (7 projects): needs MQTT broker + HTTPS + second dev server. Opt-in only. New p2p specs **must** be added inside the `runningP2P` conditional spread in `playwright.config.ts` — otherwise they leak into Tier 1 / CI.
- **Tier 3 — browserstack**: real devices, paid. Only runs when `BROWSERSTACK_USERNAME` is set.

```bash
pnpm test:e2e              # Tier 1 (same as CI)
pnpm test:e2e:p2p          # Tier 1 + Tier 2 — run before releases
pnpm test:e2e:browserstack # real devices — NEVER run without explicit ask
pnpm test:e2e:video        # Tier 1 + concat into showcase.mp4
pnpm exec playwright show-report    # open HTML report with per-test videos
```

**BrowserStack**: credentials are stored in macOS Keychain and loaded via `~/.zshrc`. Each run costs real minutes from a limited budget. Edit `browserstack.yml` to change target devices.

### Replay pattern (recorded-tournament tests)

Some e2e specs reproduce a real recorded tournament round-by-round to verify
deterministic behavior end-to-end (`em-setup.spec.ts`, `em-replay.spec.ts`).
The pattern, which is also the baseline for upcoming p2p chaos tests:

1. Capture SQLite backups + JSON fixtures under `e2e/fixtures/<name>/` —
   see that folder's `README.md` for what's required and how to regenerate.
2. Seed the app via `window.__lottaApi.restoreDbBytes(Uint8Array)` (exposed
   in dev mode by `src/dev/e2e-bridge.ts`). Use this when the starting state
   isn't reproducible from the algorithm — e.g. R1 of a `Slumpad` (random)
   pairing. Subsequent rounds are deterministic given identical inputs.
3. Drive each round through `apiClient(page)` (`/api/...` calls routed to
   the in-browser API), wrap each round in `await test.step(...)` for
   per-round failure isolation.
4. Compare app-generated pairings to the recorded fixture by
   `(lastName, firstName, club)` — **never** by the formatted `name` field,
   which is shaped by the `playerPresentation` setting and would silently
   couple the test to that setting. Build a `Map<id, PlayerKey>` from
   `/api/tournaments/:tid/players` and use it to tag both sides for
   comparison.

## Deployment & CI

GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on push to `main`:

1. `build` job — `pnpm test` (unit) + `pnpm build`
2. `test-e2e` job — `pnpm test:e2e` (Tier 1, in parallel with build)
3. `deploy` job — gated on both, publishes to GitHub Pages

No backend required — the app is fully static. Tier 2/3 e2e tests are **not** run in CI.

The **pre-commit hook does NOT run any test suite** (only lint/typecheck/knip/jscpd). If you change e2e specs or code they cover, run `pnpm test:e2e` manually before pushing.

## Commit hooks & code quality

Pre-commit and commit-msg hooks via Husky. Linting/formatting is **Biome** (not ESLint/Prettier).

```bash
pnpm format              # Biome: format all files
pnpm format:check        # Biome: check without writing
pnpm lint                # Biome: lint
pnpm check               # Biome: lint + format with --write
pnpm knip                # Dead code detection (unused files, exports, dependencies)
pnpm jscpd               # Copy-paste detection
pnpm secretlint '**/*'   # Secret scanning
```

**Pre-commit hook** (`.husky/pre-commit`): lint-staged (Biome on staged files) → secretlint → knip → jscpd → `tsc -b`. **No test runner.**

**Commit-msg hook** (`.husky/commit-msg`): commitlint enforces [Conventional Commits](https://www.conventionalcommits.org/) format (`feat:`, `fix:`, `chore:`, etc.).

## Domain notes

- 3 pairing algorithms: Berger (round-robin), Monrad (Swiss), NordicSchweizer
- Database backup/restore: download/upload raw SQLite binary
- HTML publishing: standalone HTML pages with embedded CSS
- LiveChess export: PGN format for unfinished games
- TSV import/export: player data with club associations
