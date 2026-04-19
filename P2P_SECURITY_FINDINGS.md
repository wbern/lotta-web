# P2P Security Findings — handoff doc

Findings from a fresh-context security review of the uncommitted DataProvider
refactor (and adjacent pre-existing P2P code). Written so a new agent can pick
this up without prior session context.

## TL;DR

- **CRIT-1 fixed in-session** (see below). The view-scoped provider now filters
  `rounds.list`, `standings.get/getClub/getChess4`, and `clubs.list` in addition
  to the methods it already wrapped.
- **HIGH-1 partially fixed in-session**: `auth.redeemClubCode` is now rate-limited
  per peer — 20 failed attempts locks the peer out of further redeems. Entropy
  upgrade (HIGH-1a) still open: codes are still 4 decimal digits, so a fresh peer
  connection resets the cap. Must be addressed before any real-user release.
- **MED-1, MED-2, MED-3, LOW-1 fixed in-session.** See each finding below.
- One other bug was already fixed in-session: the permissive no-perms fallback
  in `isAllowed` now denies all methods when a peer has no permissions set.

## Background a new agent needs

Lotta is a Swedish chess tournament management PWA. All data is client-side
(sql.js → IndexedDB). "Live" mode uses WebRTC P2P (trystero) to expose
tournament state from a **host** (the tournament director's browser) to
**peers** (viewers, referees, role-grants).

Peers authenticate by presenting a token baked into a share URL. Tokens map
to roles:

- **Organizer** (host only): full control, via session-restored `token`
- **View** (public): read-only subset, via `vToken`
- **Grant** (e.g. "klubbassistent"): per-recipient, configurable permissions

A separate concept — **club filtering** — lets viewers see only data for
their club. Viewers redeem a 4-digit **club code** (one per club, minted from
a host secret) to authorize specific clubs for themselves.

### Key files

- `src/api/p2p-data-provider.ts` — RPC server + client, permission checks
- `src/api/view-scoped-provider.ts` — club-filter wrapper around DataProvider
- `src/api/result-command.ts` — setResult conflict protocol
- `src/api/rpc.ts` — dispatch/serialization
- `src/api/peer-actor.ts` — tags undo entries with acting peer label
- `src/domain/club-codes.ts` — club code minting + verification
- `src/components/tabs/LiveTab.tsx` — host setup, grant UI, token handling

### What this uncommitted refactor does

Introduces a `DataProvider` interface so local DB access and P2P access share
one shape. Every `api/*.ts` operation is split into `xLocal()` (direct DB) +
`x()` (routes via `getDataProvider()`). Also adds a `peer-actor` module that
lets `withSave` tag undo-timeline entries with the acting peer's label.

As a side-effect, this refactor **expands `createViewPermissions()`** to
include methods that aren't covered by the view-scoped provider — see CRIT-1.

### Already fixed in-session

- `p2p-data-provider.ts:121-125` `isAllowed` — the permissive no-perms
  fallback (`if (!perms) return method ends with list/get/getClub/getChess4`)
  was replaced with `if (!perms) return false`. Previously, any peer that
  connected without presenting a valid token could still call
  `poolPlayers.list`, `tournaments.list`, etc. (test at
  `p2p-data-provider.test.ts:274` updated accordingly).

---

## Findings

Legend:
- **scope=pre-existing** — in already-committed code, not introduced by this
  refactor, though this refactor may widen impact.
- **scope=introduced** — newly added or made materially worse by the
  uncommitted changes.

---

### CRIT-1 — View-scoped provider does not filter `list` / `standings.*` / `clubs.list` / `tournaments.get` — FIXED

**Severity**: critical
**Status**: FIXED in-session — `view-scoped-provider.ts` now wraps
`rounds.list`, `standings.get`, `standings.getClub`, `standings.getChess4`,
and `clubs.list`. Coverage tests added to `p2p-data-provider.test.ts`
(`describe('view-scoped filtering across all view methods')`).
`tournaments.get` left pass-through — TournamentDto is tournament-level
metadata (name/dates/arbiters/roundsPlayed) with no per-club fields; if new
club-sensitive fields are ever added, wrap then.
**Scope**: pre-existing; **widened** by this refactor
**File**: `src/api/view-scoped-provider.ts` (unchanged)
**Related**: `src/api/p2p-data-provider.ts:82-96` (`createViewPermissions`) —
**expanded** in this refactor

`createViewScopedProvider` wraps a base `DataProvider` to filter by
authorized clubs. It only overrides:

- `tournamentPlayers.list`
- `rounds.get`

Every other method on the returned provider is **pass-through to the
unfiltered base**. But `createViewPermissions()` grants:

- `tournaments.list`, `tournaments.get`
- `tournamentPlayers.list` ✅ (wrapped)
- `rounds.list`, `rounds.get` ✅ (only `get` wrapped)
- `standings.get`, `standings.getClub`, `standings.getChess4`
- `clubs.list`
- `settings.get`
- `auth.redeemClubCode`

Each unwrapped method dispatches straight through `dispatch(base, method,
args)`, returning full tournament data.

**Impact widening by this refactor** — diff of `createViewPermissions`:

Before:
```ts
{ tournaments.list, tournaments.get, tournamentPlayers.list,
  rounds.list, rounds.get, standings.get, auth.redeemClubCode }
```

After (uncommitted):
```ts
{ tournaments.list, tournaments.get, tournamentPlayers.list,
  rounds.list, rounds.get, standings.get, standings.getClub,
  standings.getChess4, clubs.list, settings.get, auth.redeemClubCode }
```

Four new unfiltered methods are added to the view role.

**Exploit sketch**

A peer holds a legitimate view token + one legit club code (so
`peerAuthorizedClubs = ['KlubbA']`). They expect to see only KlubbA rounds/
standings. Instead:

```js
// Works even though "klubbfilter" is on:
await provider.rounds.list(tournamentId)
// → every round with every player's full name, rating, and club
await provider.standings.get(tournamentId, roundNr)
// → entire field standings, not just KlubbA
```

Chains with HIGH-1 (below) so no club code is even required — any view URL
is enough.

**Fix**

Extend `view-scoped-provider.ts` so that in view-scoped mode these methods
also filter or refuse:

- `rounds.list` — map over the list and filter `games[]` via the same
  `scopeRound` logic used in `rounds.get`
- `standings.get` / `getClub` / `getChess4` — either scope rows by club or
  refuse in view-scoped mode
- `tournamentPlayers.list` — already wrapped; verify coverage
- `tournaments.get` — decide what fields a view-scoped peer may see
- `clubs.list` — arguably acceptable (club names aren't that sensitive), but
  leaks the full club roster of the tournament; consider filtering to
  authorized clubs only

Add tests in `p2p-data-provider.test.ts` asserting scoping applies to every
method in `createViewPermissions()`.

---

### HIGH-1 — Club code is 4 decimal digits with no rate limiting — PARTIALLY FIXED

**Severity**: high
**Status**: Rate-limit portion FIXED in-session. `auth.redeemClubCode` now
tracks per-peer failure count; after 20 failed attempts the peer is locked
out (`status: 'error', reason: 'rate-limited'`). Counter clears on
`clearPeerPermissions` / `clearAllPeerPermissions`. Tests in
`p2p-data-provider.test.ts` (`describe('auth.redeemClubCode rate limiting')`).
**Caveat**: rate-limit is per-peer — a fresh peer connection (new peerId
from trystero) resets the cap. Combined with 4-digit entropy, a determined
attacker who reconnects gets another 20 guesses per connection. **Entropy
upgrade is still required** (tracked as HIGH-1a below).
**Scope**: pre-existing (file unchanged)
**Files**:
- `src/domain/club-codes.ts:9-24` — code minting
- `src/api/p2p-data-provider.ts:149-168` — `auth.redeemClubCode` handler

Codes are 4 decimal digits generated via a DJB2-style hash modulo 10000. The
`redeemClubCode` handler has **no attempt counter, no lockout, no per-peer
throttle, no global cap, no fail logging**.

**Exploit sketch**

```js
for (let i = 0; i < 10000; i++) {
  const code = String(i).padStart(4, '0')
  const r = await provider.auth.redeemClubCode(code)
  if (r.status === 'ok') console.log('hit', r.clubs)
}
```

~10,000 RPCs over WebRTC = seconds. Every success grants that club's
filter scope. Combined with MED-2 (no per-peer club cap), one peer can
accumulate every club in the tournament.

Today, this result is mooted by CRIT-1 (the scoper is broken anyway), but
fixing CRIT-1 alone still leaves this open.

**Fix**

1. Increase entropy: at minimum 8 chars, ideally HMAC-SHA256 → base32
   prefix. Consider a real random per-session secret (already exists as
   `clubCodeSecret`, just tune the output space).
2. Rate limit: per-peer exponential backoff + hard cap (e.g. 20 failures
   → kick peer). Sliding window also works.
3. Telemetry: surface to host UI when a peer crosses a threshold.
4. Consider making codes time-limited (regenerate on hosting restart).

---

### MED-1 — `commandDeps` captures the unfiltered base provider — FIXED

**Severity**: medium
**Status**: FIXED in-session. `startP2pRpcServer` now builds `commandDeps`
per-dispatch from the per-peer (possibly scoped) provider.
`createCommandDeps.getCurrentResult` now throws when the board is not found
in the round view (instead of defaulting to `NO_RESULT`), so a scoped peer
attempting `commands.setResult` on a board outside their authorized clubs
gets an error response and the write is not dispatched. Role check for
scoping changed from "no `commands.setResult`" to "no admin-only markers
(`tournamentPlayers.update` or `rounds.pairNext`)" so hybrid roles (e.g. a
future club-captain) scope correctly. Test added at
`p2p-data-provider.test.ts` ("commands.setResult is rejected when board is
outside the peer authorized clubs").
**Scope**: pre-existing (logic unchanged; structure carries over)
**File**: `src/api/p2p-data-provider.ts:132`

```ts
const commandDeps = createCommandDeps(provider) // captured once, base provider
```

`handleSetResult` runs through `commandDeps`, which was set up with the
unfiltered base provider. Today safe because `buildGrantPermissions` never
combines `commands.setResult` with club-filter-only grants; a future
"club captain" grant role that mixes scoped reads with setResult would
silently allow cross-club writes.

**Fix**

Resolve command deps per peer inside the dispatch handler:

```ts
const peerProvider = getProviderForPeer(provider, peerId, clubFilterEnabled)
const commandDeps = createCommandDeps(peerProvider)
const outcome = await handleSetResult(..., commandDeps)
```

Add a test: peer with club-filtered role attempts `commands.setResult` on
a board outside their authorized clubs → should reject.

---

### MED-2 — `auth.redeemClubCode` accumulates clubs without a ceiling — FIXED

**Severity**: medium
**Status**: FIXED in-session. `auth.redeemClubCode` caps per-peer authorized
clubs at `CLUB_AUTHORIZATION_LIMIT` (2). Attempting to add a third club
returns `{ status: 'error', reason: 'club-limit-reached' }` and does not
mutate `peerAuthorizedClubs`. Test in `p2p-data-provider.test.ts`
(`describe('auth.redeemClubCode per-peer club cap')`).
**Scope**: pre-existing
**File**: `src/api/p2p-data-provider.ts:161-166`

```ts
const existing = peerAuthorizedClubs.get(peerId) ?? []
const mergedSet = new Set([...existing, ...matched])
const merged = [...mergedSet].sort()
setPeerAuthorizedClubs(peerId, merged)
```

No cap on how many clubs a single peer may authorize. Combined with HIGH-1,
one brute-forcer eventually holds every club.

**Fix**

Cap per-peer authorized clubs (1 or 2 is probably the real-world ceiling),
or scope authorization to a single club per redeem (no merge).

---

### MED-3 — Peer permission maps never cleared on leave — FIXED

**Severity**: medium
**Status**: FIXED in-session. `P2PService` now exposes an `onPeerLeave`
callback that fires from `removePeer`. `startP2pRpcServer` subscribes and
calls `clearPeerPermissions(peerId)`, clearing `peerPermissions`,
`peerAuthorizedClubs`, and `peerClubCodeFailures` when a peer disconnects.
Tests: `p2p-data-provider.test.ts` (`describe('startP2pRpcServer
peer-leave cleanup')`) and `p2p-service.test.ts` ("fires onPeerLeave when
a peer disconnects from the room").
**Scope**: pre-existing
**File**: `src/api/p2p-data-provider.ts:34-53`

`peerPermissions` and `peerAuthorizedClubs` are module-level `Map`s. They're
cleared only on `stopHosting` (`clearAllPeerPermissions`) or on explicit
grant revoke (`clearPeerPermissions`). On peer disconnect, entries stay.

If trystero ever hands back a colliding peerId to a new peer (cryptographically
unlikely but not impossible for a long-lived session), the new peer inherits
the old peer's permissions without presenting a token.

**Fix**

Hook `service.onPeersChange` / `onPeerLeave` (whichever trystero exposes) to
call `clearPeerPermissions(peerId)` on disconnect.

---

### LOW-1 — `dispatch` doesn't guard against prototype chain lookups — FIXED

**Severity**: low (defense in depth)
**Status**: FIXED in-session. `dispatch` now gates both the domain and
method lookup with `Object.hasOwn`, so inputs like `constructor.name` or
`toString.call` throw `Unknown method: …`. Test in `src/api/rpc.test.ts`.
**Scope**: pre-existing
**File**: `src/api/rpc.ts` — `dispatch` function

`dispatch(provider, 'constructor.name', [])` — if a future `perms` map ever
allowed such a key (e.g. via deserialized untrusted data), the call would
reach the prototype chain. Today neutralized because `isAllowed` uses exact
string match and all permission builders use hardcoded method keys.

**Fix**

```ts
if (!Object.hasOwn(provider, domain)) return undefined
const target = provider[domain]
if (!Object.hasOwn(target, fn)) return undefined
```

Or replace with an explicit registry keyed by allowed method strings.

---

### LOW-2 — No constant-time compare in `redeemClubCode`

**Severity**: low (theoretical)
**Scope**: pre-existing
**File**: `src/api/p2p-data-provider.ts:149-172`

The handler compares codes via `Object.entries(map).find`. JS isn't really
vulnerable to timing attacks at RPC granularity (network jitter >> string
compare), but a constant-time compare would also help mask the difference
between "not-configured" and "invalid-code" branches.

**Fix** — low priority, only worth doing once HIGH-1 is also addressed.

---

### LOW-3 — `peer-actor` module-global is only safe under single-inflight dispatch

**Severity**: low (integrity, not confidentiality)
**Scope**: introduced (new module)
**File**: `src/api/peer-actor.ts`

`setCurrentActor` / `clearCurrentActor` are module globals. Comment already
added in this refactor documenting the invariant. If the RPC dispatcher is
ever parallelized (e.g. `Promise.all` over requests), undo entries get
mis-attributed.

**Fix**

If parallel dispatch is ever needed, switch to either:
- Passing `actorLabel` explicitly through `withSave` context
- `AsyncLocalStorage`-style per-request storage (works in browser via async
  context)

No change required today — comment is sufficient.

---

### LOW-4 — Session-stored tokens

**Severity**: low
**Scope**: pre-existing
**File**: `src/components/tabs/LiveTab.tsx:79` (saved session schema)

`sessionStorage` holds `refereeToken` + all grant tokens for hosting
restoration across page refresh. `sessionStorage` is origin-scoped and
cleared on tab close — acceptable — but any future XSS gives full host
keys. Worth noting for the threat model document.

---

## Non-findings (things checked that were OK)

- **Unauthenticated RPC**: locked down after the in-session fix to
  `isAllowed`. Verified that `isAllowed` now returns `false` for peers with
  no `peerPermissions` entry. Test updated at
  `p2p-data-provider.test.ts:274`.
- **Prototype pollution in dispatch**: not exploitable today (exact-match
  gate). See LOW-1.
- **Token leakage via logs**: `logDiagnostic` logs only peer IDs and host
  IDs (sliced), no tokens. Verified by grepping diagnostic call sites.
- **Label injection / XSS**: all labels rendered as React children
  (`{entry.label}` etc.), no `dangerouslySetInnerHTML`. Peer-supplied
  `data.label` in role-announce goes through the same path.
- **`onMutation` loop**: for `commands.setResult`, `isMutation = outcome.status === 'applied'`
  — idempotent/conflict outcomes correctly do not fire broadcasts. Generic
  methods gated by `!READ_METHODS`. Host broadcasts to peers; peers don't
  rebroadcast to other peers.
- **Timing window before permission grant**: after the in-session fix,
  requests sent before `onPeerToken` fires return `Permission denied`.
  Client must wait for acknowledgment — correct behavior.
- **Settings leak via view role**: `SettingsDto` (see `src/types/api.ts:139`)
  contains only UI preferences (`playerPresentation`, `maxPointsImmediately`,
  `searchForUpdate`, `nrOfRows`). No secrets. `clubCodeSecret` lives
  separately on the `LiveTab` component state.
- **Merge conflict resolution** (`src/main.tsx`, `src/api/rounds.ts`):
  verified in a prior pass — typecheck clean, 997/997 tests pass.

---

## Recommended path forward

Two options for the uncommitted work:

### Option A — Narrow-and-ship (smaller patch, preferred)

Before committing the DataProvider refactor:

1. Revert `createViewPermissions()` to the pre-existing narrow set:
   ```ts
   { tournaments.list, tournaments.get, tournamentPlayers.list,
     rounds.list, rounds.get, standings.get, auth.redeemClubCode }
   ```
   i.e. drop the new `standings.getClub`, `standings.getChess4`,
   `clubs.list`, `settings.get`.
2. File follow-up beads for CRIT-1, HIGH-1, MED-1, MED-2, MED-3, LOW-1.
3. Commit the refactor.

**Pros**: keeps the refactor focused on its stated goal (DataProvider
abstraction for future thin-client), doesn't ship a widening. **Cons**:
pre-existing bugs stay unfixed until follow-up.

### Option B — Fix-and-ship (bigger patch)

Extend this PR to fix CRIT-1 as part of the refactor:

1. Extend `view-scoped-provider.ts` to wrap `rounds.list`, `standings.get*`,
   `clubs.list`, `tournaments.get`.
2. Add tests asserting scoping coverage for every method in
   `createViewPermissions()`.
3. File follow-up beads for HIGH-1 (separate concern).

**Pros**: closes the critical bug and leaves the new view-permission
expansions safe. **Cons**: bigger patch, mixes refactor with security fix,
riskier to review.

Either way, **HIGH-1 must be fixed before any real-user release** — it
turns a public share URL into unbounded club-data exfiltration even after
CRIT-1 is fixed (MED-2 amplifies, they chain).

---

## Reproducibility

To re-run the review on a fresh agent, give them:

1. This document
2. The uncommitted diff: `git diff` at the project root
3. The prompt: "verify each finding, suggest fixes, flag anything I missed"

Files worth re-reading in order:

1. `src/api/p2p-data-provider.ts` — the gate
2. `src/api/view-scoped-provider.ts` — the filter (and its gaps)
3. `src/domain/club-codes.ts` — the auth bottleneck
4. `src/api/rpc.ts` — the dispatcher
5. `src/components/tabs/LiveTab.tsx` — host-side wiring
