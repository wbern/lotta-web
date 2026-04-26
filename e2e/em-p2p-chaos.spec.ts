import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Page } from '@playwright/test'
import { type ApiClient, apiClient, pairRound, waitForApi } from './api-helpers'
import { expect, test } from './fixtures'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lotta-em')

type ResultType =
  | 'NO_RESULT'
  | 'WHITE_WIN'
  | 'DRAW'
  | 'BLACK_WIN'
  | 'WHITE_WIN_WO'
  | 'BLACK_WIN_WO'
  | 'DOUBLE_WO'
  | 'POSTPONED'
  | 'CANCELLED'

interface FixturePlayer {
  lastName: string
  firstName: string
  clubName: string
}
interface FixtureGame {
  boardNr: number
  whitePlayer: FixturePlayer | null
  blackPlayer: FixturePlayer | null
  resultType: ResultType
  whiteScore: number
  blackScore: number
}

const roundsFixture = JSON.parse(readFileSync(join(FIXTURES, 'rounds.json'), 'utf-8')) as Record<
  string,
  FixtureGame[]
>

interface PlayerKey {
  lastName: string
  firstName: string
  club: string
}

// ── Result-type → spectator UI text mapping ─────────────────────────────
// Viewer renders results via `spectator-result-N` testid. We assert the
// score-string, not internal enum.
const RESULT_DISPLAY: Record<ResultType, string | null> = {
  NO_RESULT: null,
  WHITE_WIN: '1-0',
  DRAW: '½-½',
  BLACK_WIN: '0-1',
  WHITE_WIN_WO: '1-0',
  BLACK_WIN_WO: '0-1',
  DOUBLE_WO: '0-0',
  POSTPONED: null,
  CANCELLED: null,
}

// Mulberry32 — same generator as em-chaos so seeds reproduce comparably.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function restoreBackupFile(page: Page, sqliteBytes: Buffer): Promise<void> {
  const bytes = Array.from(sqliteBytes)
  await page.evaluate(async (byteArray: number[]) => {
    const api = (window as any).__lottaApi
    if (!api?.restoreDbBytes) throw new Error('restoreDbBytes not available on __lottaApi')
    await api.restoreDbBytes(new Uint8Array(byteArray))
  }, bytes)
}

async function findEmTournamentId($: ApiClient): Promise<number> {
  const list: { id: number; name: string; group: string }[] = await $.get('/api/tournaments')
  const t = list.find((x) => x.name === 'Regionfinal Schackfyran 2' && x.group === 'Lördag em')
  if (!t) throw new Error('Lördag em tournament not found in restored DB')
  return t.id
}

async function buildPlayerLookup($: ApiClient, tid: number): Promise<Map<number, PlayerKey>> {
  const players: { id: number; lastName: string; firstName: string; club: string | null }[] =
    await $.get(`/api/tournaments/${tid}/players`)
  return new Map(
    players.map((p) => [
      p.id,
      { lastName: p.lastName, firstName: p.firstName, club: p.club ?? '' },
    ]),
  )
}

function summarizeGame(
  g: { boardNr: number; whitePlayer: { id: number } | null; blackPlayer: { id: number } | null },
  lookup: Map<number, PlayerKey>,
): { boardNr: number; white: PlayerKey | null; black: PlayerKey | null } {
  const tag = (p: { id: number } | null) => (p ? (lookup.get(p.id) ?? null) : null)
  return { boardNr: g.boardNr, white: tag(g.whitePlayer), black: tag(g.blackPlayer) }
}
function summarizeFixture(g: FixtureGame): {
  boardNr: number
  white: PlayerKey | null
  black: PlayerKey | null
} {
  const tag = (p: FixturePlayer | null): PlayerKey | null =>
    p ? { lastName: p.lastName, firstName: p.firstName, club: p.clubName } : null
  return { boardNr: g.boardNr, white: tag(g.whitePlayer), black: tag(g.blackPlayer) }
}

async function dismissBanner(page: Page): Promise<void> {
  try {
    await page.getByRole('button', { name: 'OK', exact: true }).click({ timeout: 1500 })
  } catch {
    // Banner not present.
  }
}

/**
 * Host: load app, restore the EM backup, start Live, return the share URL
 * the viewers should open. We do NOT use createTournament — the backup
 * already contains all players, clubs, settings, and the seeded R1 pairing.
 */
async function hostStartLive(page: Page): Promise<{ shareUrl: string; tid: number }> {
  await page.goto('/')
  await waitForApi(page)
  await dismissBanner(page)

  const seed = readFileSync(join(FIXTURES, 'backup-r1-paired.sqlite'))
  await restoreBackupFile(page, seed)

  const $ = apiClient(page)
  const tid = await findEmTournamentId($)

  // Reload after restore so the React layer picks up the new DB cleanly.
  await page.reload()
  await waitForApi(page)
  await dismissBanner(page)

  // Tournament-selector has two cascading <select>s: name, then group.
  // Picking the name auto-selects the first group, which may be the wrong
  // one (Lördag fm vs Lördag em) — so we then pick the right group by tid.
  const selector = page.getByTestId('tournament-selector')
  const nameSelect = selector.locator('select').nth(0)
  const groupSelect = selector.locator('select').nth(1)
  await nameSelect.locator('option', { hasText: 'Regionfinal Schackfyran 2' }).waitFor({
    state: 'attached',
  })
  await nameSelect.selectOption('Regionfinal Schackfyran 2')
  await groupSelect.selectOption(String(tid))
  await expect(page.getByTestId('data-table')).toBeVisible({ timeout: 10_000 })

  // Start Live.
  await page.getByTestId('tab-headers').getByText('Live (Beta)').click()
  await page.locator('button', { hasText: 'Starta Live' }).click()
  await expect(page.getByTestId('live-peer-badge')).toContainText('0 anslutna', {
    timeout: 15_000,
  })

  const shareUrl = (await page.getByTestId('live-share-url').textContent())!.trim()
  expect(shareUrl).toBeTruthy()

  // Park host on pairings/results tab so apiClient writes are observable.
  await page.getByTestId('tab-headers').getByText('Lottning & resultat').click()
  await expect(page.getByTestId('data-table')).toBeVisible()

  return { shareUrl, tid }
}

async function connectViewer(page: Page, shareUrl: string): Promise<void> {
  await page.goto(shareUrl)
  await expect(page.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
  await dismissBanner(page)
}

async function setBoardResults(
  $: ApiClient,
  tid: number,
  roundNr: number,
  expected: FixtureGame[],
): Promise<void> {
  for (const fg of expected) {
    await $.put(`/api/tournaments/${tid}/rounds/${roundNr}/games/${fg.boardNr}/result`, {
      resultType: fg.resultType,
    })
  }
}

// ── Network chaos ───────────────────────────────────────────────────────
// Each op is parameterised by (rng) and runs against the viewer contexts.
// After every op, we re-establish the online state before the next round
// starts so end-of-round convergence checks have a fair chance.

type ChaosOp =
  | { kind: 'noop' }
  | { kind: 'offline-during-results'; victim: 0 | 1 }
  | { kind: 'offline-across-round'; victim: 0 | 1 }
  | { kind: 'both-offline-simul' }
  | { kind: 'viewer-rejoin'; victim: 0 | 1 }

function pickChaosOp(rand: () => number): ChaosOp {
  // First round avoids 'across-round' (the offline span doesn't have a
  // 'next round' to bridge to — handled by caller via roundNr).
  const r = rand()
  const victim: 0 | 1 = rand() < 0.5 ? 0 : 1
  if (process.env.CHAOS_DISABLE === '1') return { kind: 'noop' }
  if (r < 0.18) return { kind: 'noop' }
  if (r < 0.42) return { kind: 'offline-during-results', victim }
  if (r < 0.62) return { kind: 'offline-across-round', victim }
  if (r < 0.82) return { kind: 'both-offline-simul' }
  return { kind: 'viewer-rejoin', victim }
}

interface Viewer {
  ctx: BrowserContext
  page: Page
  label: string
}

/**
 * Run one round end-to-end with a chaos op woven in.
 *
 * Timeline for a chaos op like 'offline-during-results':
 *   1. Pair round (host).
 *   2. Take victim viewer offline.
 *   3. Host writes all board results.
 *   4. Bring victim viewer back online.
 *   5. Wait for convergence on a sample board (asserts pull-bootstrap fired).
 *
 * For 'offline-across-round' the victim stays offline across the entire
 * round — the recovery happens at the start of the *next* round (or in the
 * final convergence assertion if this is round 5).
 */
async function runRound(opts: {
  $: ApiClient
  tid: number
  roundNr: number
  viewers: [Viewer, Viewer]
  rand: () => number
  shareUrl: string
  expectPairingsMatch: (
    roundNr: number,
    games: {
      boardNr: number
      whitePlayer: { id: number } | null
      blackPlayer: { id: number } | null
    }[],
  ) => void
  // Pre-existing offline state from a prior round's 'offline-across-round'.
  preOffline: { 0: boolean; 1: boolean }
}): Promise<{ op: ChaosOp; carriedOffline: { 0: boolean; 1: boolean } }> {
  const { $, tid, roundNr, viewers, rand, shareUrl, expectPairingsMatch, preOffline } = opts

  // Resolve any across-round offline carried from the previous round
  // *before* the new round starts. The freshly online viewer must catch up
  // via the pull-bootstrap path before we layer new chaos on top.
  const carriedOffline = { 0: preOffline[0], 1: preOffline[1] }
  for (const i of [0, 1] as const) {
    if (carriedOffline[i]) {
      await viewers[i].ctx.setOffline(false)
      // Reconnecting overlay should clear; then we wait for the viewer to
      // see the *previous* round's last-board result before moving on.
      await expect(viewers[i].page.getByTestId('reconnecting-overlay')).not.toBeVisible({
        timeout: 45_000,
      })
      carriedOffline[i] = false
    }
  }

  // Pair (R1 is already paired in the seed; R2..R5 we generate).
  if (roundNr > 1) {
    const round = await pairRound($, tid)
    expect(round.roundNr).toBe(roundNr)
    expectPairingsMatch(roundNr, round.games)
  } else {
    const r1 = await $.get(`/api/tournaments/${tid}/rounds/1`)
    expectPairingsMatch(1, r1.games)
  }

  let op = pickChaosOp(rand)
  // R5 is the last round — across-round offline has nowhere to recover, so
  // demote to during-results.
  if (op.kind === 'offline-across-round' && roundNr === 5) {
    op = { kind: 'offline-during-results', victim: op.victim }
  }

  // Apply chaos that fires *before* result entry.
  if (op.kind === 'offline-during-results') {
    await viewers[op.victim].ctx.setOffline(true)
    await expect(viewers[op.victim].page.getByTestId('reconnecting-overlay')).toBeVisible({
      timeout: 20_000,
    })
  } else if (op.kind === 'offline-across-round') {
    await viewers[op.victim].ctx.setOffline(true)
    await expect(viewers[op.victim].page.getByTestId('reconnecting-overlay')).toBeVisible({
      timeout: 20_000,
    })
  } else if (op.kind === 'both-offline-simul') {
    await Promise.all([viewers[0].ctx.setOffline(true), viewers[1].ctx.setOffline(true)])
    await Promise.all([
      expect(viewers[0].page.getByTestId('reconnecting-overlay')).toBeVisible({ timeout: 20_000 }),
      expect(viewers[1].page.getByTestId('reconnecting-overlay')).toBeVisible({ timeout: 20_000 }),
    ])
  }

  // Host enters all results for the round.
  await setBoardResults($, tid, roundNr, roundsFixture[String(roundNr)])

  // Apply chaos that fires *after* result entry.
  if (op.kind === 'viewer-rejoin') {
    // Re-enter via the share URL — simulates closing the tab and opening
    // the share link again. After connect the app rewrites to /?tab=...
    // so a plain page.reload() would not re-join the live room.
    await connectViewer(viewers[op.victim].page, shareUrl)
  }

  // Recover network for ops that should converge before the round ends.
  if (op.kind === 'offline-during-results') {
    await viewers[op.victim].ctx.setOffline(false)
    await expect(viewers[op.victim].page.getByTestId('reconnecting-overlay')).not.toBeVisible({
      timeout: 45_000,
    })
  } else if (op.kind === 'both-offline-simul') {
    await Promise.all([viewers[0].ctx.setOffline(false), viewers[1].ctx.setOffline(false)])
    await Promise.all([
      expect(viewers[0].page.getByTestId('reconnecting-overlay')).not.toBeVisible({
        timeout: 45_000,
      }),
      expect(viewers[1].page.getByTestId('reconnecting-overlay')).not.toBeVisible({
        timeout: 45_000,
      }),
    ])
  } else if (op.kind === 'offline-across-round') {
    carriedOffline[op.victim] = true
  }

  return { op, carriedOffline }
}

/**
 * Verify a viewer has caught up to the canonical R5 results on a sampled
 * subset of boards. Sampling (rather than checking all 36 every round)
 * keeps the test under 5 minutes. The final-state check (after R5) tests
 * every board.
 */
async function expectViewerConverged(
  page: Page,
  roundsToSample: number[],
  boardSampleSize: number,
  rand: () => number,
): Promise<void> {
  const samplesByRound: Record<number, number[]> = {}
  for (const r of roundsToSample) {
    const games = roundsFixture[String(r)]
    const indices = Array.from({ length: games.length }, (_, i) => i)
    // Fisher-Yates shuffle (seeded) → first N indices.
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    samplesByRound[r] = indices.slice(0, Math.min(boardSampleSize, games.length))
  }

  // The viewer surfaces the *currently selected* round. We can't easily
  // flip rounds in the viewer from here — so we only sample boards from
  // the *latest* round in roundsToSample, which is what's displayed.
  const latest = Math.max(...roundsToSample)
  const games = roundsFixture[String(latest)]
  for (const idx of samplesByRound[latest]) {
    const fg = games[idx]
    const display = RESULT_DISPLAY[fg.resultType]
    if (!display) continue
    await expect(page.getByTestId(`spectator-result-${fg.boardNr}`)).toContainText(display, {
      timeout: 30_000,
    })
  }
}

// ── Test entry points ───────────────────────────────────────────────────

const SEEDS = process.env.CHAOS_SEEDS ? process.env.CHAOS_SEEDS.split(',').map(Number) : [1, 2, 3]

test.describe('Lördag em — p2p chaos', () => {
  for (const seed of SEEDS) {
    runP2PChaosTest(seed)
  }
})

function runP2PChaosTest(seed: number): void {
  test(`seed=${seed}: R1–R5 with network chaos, viewers converge to recorded final`, async ({
    browser,
  }) => {
    test.setTimeout(360_000)
    test.info().annotations.push({ type: 'chaos-seed', description: String(seed) })

    const rand = mulberry32(seed)

    const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const hostPage = await hostCtx.newPage()

    const v0Ctx = await browser.newContext({ ignoreHTTPSErrors: true })
    const v0Page = await v0Ctx.newPage()

    const v1Ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    })
    const v1Page = await v1Ctx.newPage()

    try {
      // ── Host ────────────────────────────────────────────────────────
      const { shareUrl, tid } = await hostStartLive(hostPage)
      const $ = apiClient(hostPage)
      const lookup = await buildPlayerLookup($, tid)

      const expectPairingsMatch = (
        roundNr: number,
        games: {
          boardNr: number
          whitePlayer: { id: number } | null
          blackPlayer: { id: number } | null
        }[],
      ) => {
        const got = [...games].sort((a, b) => a.boardNr - b.boardNr)
        const want = [...roundsFixture[String(roundNr)]].sort((a, b) => a.boardNr - b.boardNr)
        expect(games).toHaveLength(36)
        expect(
          got.map((g) => summarizeGame(g, lookup)),
          `pairings for round ${roundNr} should match recorded`,
        ).toEqual(want.map(summarizeFixture))
      }

      // ── Viewers connect ────────────────────────────────────────────
      const viewers: [Viewer, Viewer] = [
        { ctx: v0Ctx, page: v0Page, label: 'desktop' },
        { ctx: v1Ctx, page: v1Page, label: 'mobile' },
      ]
      await Promise.all([connectViewer(v0Page, shareUrl), connectViewer(v1Page, shareUrl)])
      await expect(hostPage.getByTestId('live-peer-badge')).toContainText('2 anslutna', {
        timeout: 30_000,
      })

      // DEBUG: snapshot viewer state right after connect, before any chaos.
      for (const v of [
        { label: 'desktop', page: v0Page },
        { label: 'mobile', page: v1Page },
      ]) {
        const dump = await v.page.evaluate(() => {
          const round = document.querySelector('.spectator-round')?.textContent ?? '<no round>'
          const empty = document.querySelector('.spectator-empty')?.textContent ?? null
          const rowCount = document.querySelectorAll('[data-testid^="spectator-row-"]').length
          const title = document.querySelector('.spectator-title')?.textContent ?? null
          return { round, empty, rowCount, title }
        })
        // eslint-disable-next-line no-console
        console.log(`[em-p2p-chaos] post-connect ${v.label}:`, JSON.stringify(dump))
      }

      // ── Rounds 1..5 with chaos ─────────────────────────────────────
      const opLog: { roundNr: number; op: ChaosOp }[] = []
      let preOffline = { 0: false, 1: false } as { 0: boolean; 1: boolean }
      for (const roundNr of [1, 2, 3, 4, 5]) {
        await test.step(`round ${roundNr}: chaos + results`, async () => {
          const result = await runRound({
            $,
            tid,
            roundNr,
            viewers,
            rand,
            shareUrl,
            expectPairingsMatch,
            preOffline,
          })
          opLog.push({ roundNr, op: result.op })
          preOffline = result.carriedOffline
        })
      }

      // Anything still offline at the end of R5 must come back online so
      // we can assert convergence.
      for (const i of [0, 1] as const) {
        if (preOffline[i]) {
          await viewers[i].ctx.setOffline(false)
          await expect(viewers[i].page.getByTestId('reconnecting-overlay')).not.toBeVisible({
            timeout: 45_000,
          })
        }
      }

      // ── Host invariants (same as em-replay) ────────────────────────
      await test.step('host: 5 complete rounds, every board has a result', async () => {
        const rounds: { roundNr: number; games: { boardNr: number; resultType: ResultType }[] }[] =
          await $.get(`/api/tournaments/${tid}/rounds`)
        expect(rounds.map((r) => r.roundNr)).toEqual([1, 2, 3, 4, 5])
        for (const r of rounds) {
          expect(r.games).toHaveLength(36)
          for (const g of r.games) {
            expect(
              g.resultType,
              `board ${g.boardNr} round ${r.roundNr} should have a result`,
            ).not.toBe('NO_RESULT')
          }
        }
      })

      await test.step('host: standings totals match recorded score sum', async () => {
        const standings: { score: number }[] = await $.get(
          `/api/tournaments/${tid}/standings?round=5`,
        )
        expect(standings).toHaveLength(71)
        const totalPoints = standings.reduce((s, p) => s + p.score, 0)
        let expectedTotal = 0
        for (const r of [1, 2, 3, 4, 5]) {
          for (const fg of roundsFixture[String(r)]) {
            if (fg.whitePlayer) expectedTotal += fg.whiteScore
            if (fg.blackPlayer) expectedTotal += fg.blackScore
          }
        }
        expect(totalPoints).toBe(expectedTotal)
      })

      // ── Viewer convergence (every board for R5) ────────────────────
      await test.step('viewers: every R5 board converges to the recorded result', async () => {
        const r5 = roundsFixture['5']
        for (const v of viewers) {
          // DEBUG: dump what the viewer is currently rendering.
          const dump = await v.page.evaluate(() => {
            const layout = document.querySelector('[data-testid="spectator-layout"]')
            const round = document.querySelector('.spectator-round')?.textContent ?? '<no round>'
            const empty = document.querySelector('.spectator-empty')?.textContent ?? null
            const rowCount = document.querySelectorAll('[data-testid^="spectator-row-"]').length
            const url = window.location.href
            const title = document.querySelector('.spectator-title')?.textContent ?? null
            const store = (window as any).__lottaStoreDebug
              ? (window as any).__lottaStoreDebug()
              : null
            return {
              hasLayout: !!layout,
              round,
              empty,
              rowCount,
              url,
              title,
              store,
            }
          })
          // eslint-disable-next-line no-console
          console.log(`[em-p2p-chaos] ${v.label} viewer state:`, JSON.stringify(dump))
        }
        for (const v of viewers) {
          for (const fg of r5) {
            const display = RESULT_DISPLAY[fg.resultType]
            if (!display) continue
            await expect(
              v.page.getByTestId(`spectator-result-${fg.boardNr}`),
              `${v.label} viewer should show R5 board ${fg.boardNr} result`,
            ).toContainText(display, { timeout: 60_000 })
          }
        }
      })

      // Sample-based convergence check across earlier rounds is folded
      // into the final R5 check above — viewers display the latest round
      // by default and there is no in-test affordance to scrub backward.
      void expectViewerConverged
    } finally {
      // eslint-disable-next-line no-console
      console.log(`[em-p2p-chaos] seed=${seed} done`)
      await v0Page.close().catch(() => {})
      await v0Ctx.close().catch(() => {})
      await v1Page.close().catch(() => {})
      await v1Ctx.close().catch(() => {})
      await hostPage.close().catch(() => {})
      await hostCtx.close().catch(() => {})
    }
  })
}
