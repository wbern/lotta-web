# P2P Security — next-agent handoff

## Start here

Read `P2P_SECURITY_FINDINGS.md` first. It has full context, fix rationale, and
the full exploit-path analysis. This file is just the "what to do next" layer.

All test runs with `pnpm test` — vitest, 1012 currently passing. Lotta is a
client-side React PWA; P2P goes via trystero/WebRTC from a host browser to
viewer/grant peers.

## Already fixed in prior sessions

- **CRIT-1** — view-scoped provider now filters `rounds.list`, `standings.get/getClub/getChess4`, `clubs.list`
- **HIGH-1 (rate-limit)** — `auth.redeemClubCode` rate-limited to 20 failures per peer
- **MED-1** — `commands.setResult` honors view scope (per-peer `commandDeps`, broader "admin-only" role marker)
- **MED-2** — per-peer authorized clubs capped at 2; third redeem returns `club-limit-reached`
- **MED-3** — `P2PService.onPeerLeave` wired to `clearPeerPermissions(peerId)` so perms/authorized-clubs/failures clear on disconnect
- **LOW-1** — `dispatch` uses `Object.hasOwn` for both domain and method so prototype-chain lookups throw
- **isAllowed no-perms fallback** — deny instead of permit

## Pick one

### 1. HIGH-1a — entropy upgrade for club codes **(release blocker)**

Codes are still 4 decimal digits. With the per-peer rate limit, a fresh
WebRTC connection resets the counter, so a determined attacker with many
connections can still exfiltrate. Essential before any real-user release.

Scope:
- `src/domain/club-codes.ts` — replace djb2+mod-10000 with something stronger
  (suggested: 8-char Crockford-alphanum, ≈40 bits). Must stay **sync** and
  deterministic (LiveTab uses `useMemo`).
- `src/domain/club-codes.test.ts` — update regex (`/^\d{4}$/` → new format)
- `src/components/tabs/LiveTab.tsx` — the display formatter that currently
  inserts a space mid-code (rendered as `XX XX`); decide on new grouping
- `src/domain/club-codes-pdf.ts` — likely pins format
- `e2e/club-code.spec.ts:427` — regex `/\d+ \d+/`
- `e2e/delning.spec.ts:456` — `replace(/\s/g, '')` is format-agnostic so
  probably fine, but read through
- Verify `auth.redeemClubCode` handler's `rawCode = ...replace(/[-\s]/g, '')`
  still makes sense (add alphabet canonicalization if needed — upper-case,
  `O→0` etc., for user-typed codes)

TDD approach: start with a failing unit test asserting the new format
(length + alphabet + uniqueness at scale). ~half-day.

### 2. LOW-2 — constant-time compare in `redeemClubCode`

Low priority, only worth doing once HIGH-1a lands. Masks timing-side-channel
between "not-configured" and "invalid-code" branches.

### 3. LOW-3 — `peer-actor` module global safety

Only if RPC dispatch is ever parallelized. Today single-inflight, comment
is sufficient. See finding for AsyncLocalStorage alternative.

### 4. LOW-4 — session-stored tokens

`sessionStorage` holds `refereeToken` + grant tokens for restoration
across refresh. Acceptable today; worth noting for any future XSS threat-model
doc.

## Guardrails

- TDD one test at a time — red → green → refactor.
- Don't break the 1012 passing tests. Full suite runs in ~10s.
- Biome (not ESLint). `pnpm exec biome check --write <files>` to auto-fix.
- `src/` tests are Vitest, colocated. E2e is Playwright — tier-1 runs in CI,
  tier-2 (p2p) needs MQTT broker.
- If in doubt about scope, ask Will — some fixes (HIGH-1a) touch UI/PDFs
  and deserve a check-in before diving.
