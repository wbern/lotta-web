import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import {
  type ApiClient,
  apiClient,
  pairRound,
  performRedo,
  performUndo,
  waitForApi,
} from './api-helpers'
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

async function restoreBackupFile(page: Page, sqliteBytes: Buffer): Promise<void> {
  const bytes = Array.from(sqliteBytes)
  await page.evaluate(async (byteArray: number[]) => {
    const api = (window as any).__lottaApi
    if (!api?.restoreDbBytes) throw new Error('restoreDbBytes not available on __lottaApi')
    await api.restoreDbBytes(new Uint8Array(byteArray))
  }, bytes)
}

/**
 * Export current DB bytes, then restore the exact same bytes. Should be a
 * no-op — anything that depends on in-memory state outside the DB (caches,
 * subscriptions, undo manager) gets a chance to misbehave here.
 */
async function backupRoundtrip(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = (window as any).__lottaApi
    if (!api?.exportDbBytes || !api?.restoreDbBytes) {
      throw new Error('exportDbBytes/restoreDbBytes not available on __lottaApi')
    }
    const bytes: Uint8Array = api.exportDbBytes()
    await api.restoreDbBytes(bytes)
  })
}

async function findEmTournamentId($: ApiClient): Promise<number> {
  const list: { id: number; name: string; group: string }[] = await $.get('/api/tournaments')
  const t = list.find((x) => x.name === 'Regionfinal Schackfyran 2' && x.group === 'Lördag em')
  if (!t) throw new Error('Lördag em tournament not found in restored DB')
  return t.id
}

interface PlayerKey {
  lastName: string
  firstName: string
  club: string
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

// Mulberry32 PRNG — seeded so failures reproduce.
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

const WRONG_RESULTS: ResultType[] = ['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'NO_RESULT']

/**
 * Apply the canonical results for a round, but route every write through
 * a quirky sequence that should converge to the same state.
 *
 * Each board is handled by one of these strategies (chosen by seeded RNG):
 *   - direct:        set the canonical result, done.
 *   - wrong-first:   set a different result, then overwrite with canonical.
 *   - undo-redo:     set canonical, undo, redo.
 *   - undo-reapply:  set canonical, undo, set canonical again.
 *   - double-set:    set canonical twice in a row (idempotency).
 */
async function setBoardResultsChaotically(
  $: ApiClient,
  tid: number,
  roundNr: number,
  expected: FixtureGame[],
  rand: () => number,
): Promise<void> {
  for (const fg of expected) {
    const boardUrl = `/api/tournaments/${tid}/rounds/${roundNr}/games/${fg.boardNr}/result`
    const canonical = { resultType: fg.resultType }
    const strategy = Math.floor(rand() * 5)

    switch (strategy) {
      case 0:
        await $.put(boardUrl, canonical)
        break
      case 1: {
        const wrong = WRONG_RESULTS.find((r) => r !== fg.resultType) ?? 'NO_RESULT'
        await $.put(boardUrl, { resultType: wrong })
        await $.put(boardUrl, canonical)
        break
      }
      case 2:
        await $.put(boardUrl, canonical)
        await performUndo($)
        await performRedo($)
        break
      case 3:
        await $.put(boardUrl, canonical)
        await performUndo($)
        await $.put(boardUrl, canonical)
        break
      case 4:
        await $.put(boardUrl, canonical)
        await $.put(boardUrl, canonical)
        break
    }
  }
}

/**
 * Mid-round read-only noise that should not change state: fetch standings,
 * fetch round, fetch players. If any of these mutate the DB we want to know.
 */
async function readOnlyNoise($: ApiClient, tid: number, roundNr: number): Promise<void> {
  await $.get(`/api/tournaments/${tid}/standings?round=${roundNr}`)
  await $.get(`/api/tournaments/${tid}/rounds/${roundNr}`)
  await $.get(`/api/tournaments/${tid}/players`)
}

/**
 * Withdraw a non-bye player from a *future* round, immediately un-withdraw,
 * then proceed. The next pairing should not be affected by the transient
 * withdrawal — `withdrawnFromRound = -1` is the original neutral value.
 */
async function withdrawRevertOne(
  $: ApiClient,
  tid: number,
  futureRoundNr: number,
  rand: () => number,
): Promise<void> {
  const players: { id: number; withdrawnFromRound: number }[] = await $.get(
    `/api/tournaments/${tid}/players`,
  )
  if (players.length === 0) return
  const p = players[Math.floor(rand() * players.length)]
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, {
    withdrawnFromRound: futureRoundNr,
  })
  await $.get(`/api/tournaments/${tid}/players`)
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, { withdrawnFromRound: -1 })
}

/**
 * Toggle a presentation-only setting and revert. Should be invisible to
 * pairings, scoring, and standings totals.
 */
async function flipSettingAndRevert($: ApiClient): Promise<void> {
  const before: { playerPresentation?: string } = await $.get('/api/settings')
  const original = before.playerPresentation ?? 'FIRST_LAST'
  const flipped = original === 'FIRST_LAST' ? 'LAST_FIRST' : 'FIRST_LAST'
  await $.put('/api/settings', { ...before, playerPresentation: flipped })
  await $.put('/api/settings', { ...before, playerPresentation: original })
}

/**
 * Clear undo history mid-round. After this, prior operations are no longer
 * undoable, but the *current* DB state must be preserved exactly.
 */
async function clearUndoMidRound($: ApiClient): Promise<void> {
  await $.post('/api/undo/clear')
  await $.post('/api/undo/capture-initial')
}

/**
 * Mutate a non-protected tournament field (city/chiefArbiter) and revert.
 * The app's `tournaments.ts:111` guard correctly forbids changing
 * chess4/pointsPerGame after results exist, so we don't touch those.
 */
async function flipTournamentMetadataAndRevert($: ApiClient, tid: number): Promise<void> {
  const before: any = await $.get(`/api/tournaments/${tid}`)
  await $.put(`/api/tournaments/${tid}`, {
    ...before,
    city: `${before.city ?? ''}_chaos`,
    chiefArbiter: `${before.chiefArbiter ?? ''}_chaos`,
  })
  await $.get(`/api/tournaments/${tid}/standings`)
  await $.put(`/api/tournaments/${tid}`, before)
}

/**
 * Bump a club's `chess4Members` and revert. Drives chess4-standings math.
 */
async function flipClubChess4MembersAndRevert($: ApiClient, rand: () => number): Promise<void> {
  const clubs: { id: number; name: string; chess4Members: number }[] = await $.get('/api/clubs')
  if (clubs.length === 0) return
  const c = clubs[Math.floor(rand() * clubs.length)]
  const original = c.chess4Members
  await $.put(`/api/clubs/${c.id}`, { name: c.name, chess4Members: original + 99 })
  await $.put(`/api/clubs/${c.id}`, { name: c.name, chess4Members: original })
}

/**
 * Create a new pool player (in the global pool, not added to the tournament)
 * and immediately delete them. This is NOT a symmetric flip+revert — it
 * creates real id-allocation pressure. If anything downstream indexes by
 * max(id)+1 or assumes id contiguity, transient inserts will shift later ids.
 */
async function transientPoolPlayer($: ApiClient, rand: () => number): Promise<void> {
  const created: { id: number } = await $.post('/api/players', {
    firstName: `Chaos${Math.floor(rand() * 1e6)}`,
    lastName: 'TransientPlayer',
    ratingI: 0,
    ratingN: 0,
    ratingQ: 0,
    ratingB: 0,
    ratingK: 0,
    ratingKQ: 0,
    ratingKB: 0,
    clubIndex: 0,
    title: '',
    sex: '',
    federation: 'SWE',
    fideId: 0,
    ssfId: 0,
    playerGroup: '',
    birthdate: '',
  })
  await $.del(`/api/players/${created.id}`)
}

/**
 * Create a new club and immediately delete it. Same id-pressure rationale
 * as transientPoolPlayer.
 */
async function transientClub($: ApiClient, rand: () => number): Promise<void> {
  const created: { id: number } = await $.post('/api/clubs', {
    name: `ChaosClub_${Math.floor(rand() * 1e9)}`,
  })
  await $.del(`/api/clubs/${created.id}`)
}

/**
 * Bump a player's rating and revert. Shouldn't affect Monrad pairings after
 * R1 (uses scores, not rating) but pushes the rating-display path.
 */
async function flipPlayerRatingAndRevert(
  $: ApiClient,
  tid: number,
  rand: () => number,
): Promise<void> {
  const players: { id: number; ratingI: number }[] = await $.get(`/api/tournaments/${tid}/players`)
  if (players.length === 0) return
  const p = players[Math.floor(rand() * players.length)]
  const original = p.ratingI
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, { ratingI: original + 500 })
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, { ratingI: original })
}

/**
 * Unpair the latest round and re-pair. The re-paired round must produce
 * identical pairings (Monrad is deterministic given identical inputs).
 * Returns the re-paired round so the caller can continue with results.
 */
async function unpairAndRepair(
  $: ApiClient,
  tid: number,
  expectedRoundNr: number,
): Promise<{ roundNr: number; games: any[] }> {
  await $.del(`/api/tournaments/${tid}/rounds/latest?confirm=true`)
  const rounds: { roundNr: number }[] = await $.get(`/api/tournaments/${tid}/rounds`)
  expect(
    rounds.map((r) => r.roundNr).includes(expectedRoundNr),
    `unpair should have removed round ${expectedRoundNr}`,
  ).toBe(false)
  return pairRound($, tid)
}

/**
 * Rename a tournament player to a chaos name, read standings (which may
 * cache the formatted display name), then rename back. If the standings
 * cache outlives the rename-revert, the recorded fixture will diverge.
 */
async function renameRevertOne($: ApiClient, tid: number, rand: () => number): Promise<void> {
  const players: { id: number; lastName: string; firstName: string }[] = await $.get(
    `/api/tournaments/${tid}/players`,
  )
  if (players.length === 0) return
  const p = players[Math.floor(rand() * players.length)]
  const original = p.lastName
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, {
    lastName: `${original}_chaos`,
  })
  await $.get(`/api/tournaments/${tid}/standings`)
  await $.get(`/api/tournaments/${tid}/players`)
  await $.put(`/api/tournaments/${tid}/players/${p.id}`, { lastName: original })
}

/**
 * Cross-round undo/redo: walk K steps backwards in the timeline (which may
 * cross into the previous round's result entries or even unpair the round)
 * and then walk forwards K steps. State should be identical afterwards.
 *
 * We refuse to undo if it would cost the seed-restored R1 pairing (Slumpad,
 * not reproducible by re-running the algorithm). Practically: we leave at
 * least `floor` snapshots un-undone.
 */
async function crossRoundUndoRedo($: ApiClient, k: number, floor: number = 50): Promise<void> {
  let undone = 0
  for (let i = 0; i < k; i++) {
    const state: { canUndo: boolean } = await $.get('/api/undo/state')
    if (!state.canUndo) break
    const timeline: any[] = await $.get('/api/undo/timeline')
    if (timeline.length <= floor) break
    const ok = await performUndo($)
    if (!ok) break
    undone++
  }
  for (let i = 0; i < undone; i++) {
    const ok = await performRedo($)
    if (!ok) break
  }
}

// Generates one test case per seed so a break shows the failing seed by name
// and the green seeds keep running. Override at the CLI with --grep "seed=N".
const SEEDS = process.env.CHAOS_SEEDS
  ? process.env.CHAOS_SEEDS.split(',').map(Number)
  : Array.from({ length: 25 }, (_, i) => i + 1)

test.describe('Lördag em — chaos replay', () => {
  for (const seed of SEEDS) {
    runChaosTest(seed)
  }
})

function runChaosTest(seed: number): void {
  // Same R1→R5 trajectory as em-replay, but each result write is routed
  // through a quirky sequence (wrong-first, undo/redo, etc). The final
  // standings + per-round pairings must still match the recorded fixture.
  test(`seed=${seed}: chaotic R1–R5 still matches recorded final state`, async ({ page }) => {
    test.setTimeout(120_000)

    const rand = mulberry32(seed)
    test.info().annotations.push({ type: 'chaos-seed', description: String(seed) })

    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)

    let tid: number = -1
    let lookup: Map<number, PlayerKey> = new Map()
    // Captured right after restore so end-of-test invariant checks can prove
    // every flip+revert chaos op actually reverted (not just that final
    // standings happen to come out right).
    let baselineSettings: any
    let baselineTournament: any
    let baselineClubs: { id: number; name: string; chess4Members: number }[] = []
    let baselineRatings: { id: number; ratingI: number; ratingN: number; ratingQ: number }[] = []

    await test.step('restore seed (backup-r1-paired) and capture baseline', async () => {
      const bytes = readFileSync(join(FIXTURES, 'backup-r1-paired.sqlite'))
      await restoreBackupFile(page, bytes)
      tid = await findEmTournamentId($)
      lookup = await buildPlayerLookup($, tid)

      baselineSettings = await $.get('/api/settings')
      baselineTournament = await $.get(`/api/tournaments/${tid}`)
      baselineClubs = await $.get('/api/clubs')
      const players: any[] = await $.get(`/api/tournaments/${tid}/players`)
      baselineRatings = players.map((p) => ({
        id: p.id,
        ratingI: p.ratingI,
        ratingN: p.ratingN,
        ratingQ: p.ratingQ,
      }))
    })

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

    await test.step('round 1: chaotic results on seeded pairing', async () => {
      const r1 = await $.get(`/api/tournaments/${tid}/rounds/1`)
      expectPairingsMatch(1, r1.games)
      // Pre-results chaos: rename a couple of players, withdraw-and-restore
      // someone from a future round, flip a presentation setting.
      const preNoise = 1 + Math.floor(rand() * 4)
      for (let i = 0; i < preNoise; i++) await renameRevertOne($, tid, rand)
      if (rand() < 0.5) await withdrawRevertOne($, tid, 2 + Math.floor(rand() * 4), rand)
      if (rand() < 0.5) await flipSettingAndRevert($)
      if (rand() < 0.5) await flipTournamentMetadataAndRevert($, tid)
      if (rand() < 0.5) await flipClubChess4MembersAndRevert($, rand)
      if (rand() < 0.5) await flipPlayerRatingAndRevert($, tid, rand)
      if (rand() < 0.5) await transientPoolPlayer($, rand)
      if (rand() < 0.5) await transientClub($, rand)
      await setBoardResultsChaotically($, tid, 1, roundsFixture['1'], rand)
      await readOnlyNoise($, tid, 1)
      if (rand() < 0.2) await clearUndoMidRound($)
      await crossRoundUndoRedo($, 1 + Math.floor(rand() * 8))
    })

    for (const roundNr of [2, 3, 4, 5]) {
      await test.step(`round ${roundNr}: pair, verify, chaotic results`, async () => {
        let round = await pairRound($, tid)
        expect(round.roundNr).toBe(roundNr)
        expectPairingsMatch(roundNr, round.games)
        // Unpair + re-pair up to twice; pairings must reproduce each time.
        const repairCycles = Math.floor(rand() * 3)
        for (let i = 0; i < repairCycles; i++) {
          round = await unpairAndRepair($, tid, roundNr)
          expect(round.roundNr).toBe(roundNr)
          expectPairingsMatch(roundNr, round.games)
        }
        // Pre-results chaos density 1–4
        const preNoise = 1 + Math.floor(rand() * 4)
        for (let i = 0; i < preNoise; i++) await renameRevertOne($, tid, rand)
        if (roundNr < 5 && rand() < 0.5) {
          await withdrawRevertOne($, tid, roundNr + 1, rand)
        }
        if (rand() < 0.5) await flipSettingAndRevert($)
        if (rand() < 0.3) await flipTournamentMetadataAndRevert($, tid)
        if (rand() < 0.3) await flipClubChess4MembersAndRevert($, rand)
        if (rand() < 0.3) await flipPlayerRatingAndRevert($, tid, rand)
        if (rand() < 0.3) await transientPoolPlayer($, rand)
        if (rand() < 0.3) await transientClub($, rand)
        await setBoardResultsChaotically($, tid, roundNr, roundsFixture[String(roundNr)], rand)
        // Backup roundtrip on ~half the rounds — export current bytes, restore them.
        if (rand() < 0.5) {
          await backupRoundtrip(page)
          // After restore the lookup ids may have shifted; rebuild it.
          lookup = await buildPlayerLookup($, tid)
        }
        await readOnlyNoise($, tid, roundNr)
        if (rand() < 0.2) await clearUndoMidRound($)
        // K big enough to potentially cross back into the previous round.
        await crossRoundUndoRedo($, 5 + Math.floor(rand() * 40))
      })
    }

    await test.step('no player retains a _chaos rename after revert', async () => {
      const players: { lastName: string }[] = await $.get(`/api/tournaments/${tid}/players`)
      const stuck = players.filter((p) => p.lastName.includes('_chaos'))
      expect(stuck, `players with leftover _chaos suffix: ${JSON.stringify(stuck)}`).toEqual([])
    })

    await test.step('no player remains withdrawn after revert', async () => {
      const players: { id: number; withdrawnFromRound: number }[] = await $.get(
        `/api/tournaments/${tid}/players`,
      )
      const withdrawn = players.filter((p) => p.withdrawnFromRound !== -1)
      expect(withdrawn, `withdrawn after revert: ${JSON.stringify(withdrawn)}`).toEqual([])
    })

    await test.step('final state: 5 complete rounds, every board has a result', async () => {
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

    await test.step('per-round result types match recorded fixture', async () => {
      const rounds: { roundNr: number; games: { boardNr: number; resultType: ResultType }[] }[] =
        await $.get(`/api/tournaments/${tid}/rounds`)
      for (const r of rounds) {
        const got = [...r.games].sort((a, b) => a.boardNr - b.boardNr)
        const want = [...roundsFixture[String(r.roundNr)]].sort((a, b) => a.boardNr - b.boardNr)
        expect(
          got.map((g) => ({ boardNr: g.boardNr, resultType: g.resultType })),
          `result types for round ${r.roundNr}`,
        ).toEqual(want.map((g) => ({ boardNr: g.boardNr, resultType: g.resultType })))
      }
    })

    await test.step('invariants: settings unchanged from baseline', async () => {
      const settings = await $.get('/api/settings')
      expect(settings).toEqual(baselineSettings)
    })

    await test.step('invariants: tournament config unchanged from baseline', async () => {
      // Strip derived fields that legitimately change as the tournament
      // progresses (roundsPlayed, hasRecordedResults, finished) — we only
      // care that configuration fields survived the chaos.
      const stripDerived = (t: any) => {
        const { roundsPlayed, hasRecordedResults, finished, ...rest } = t
        return rest
      }
      const t = await $.get(`/api/tournaments/${tid}`)
      expect(stripDerived(t)).toEqual(stripDerived(baselineTournament))
    })

    await test.step('invariants: clubs.chess4Members + count unchanged from baseline', async () => {
      const clubs: { id: number; name: string; chess4Members: number }[] = await $.get('/api/clubs')
      // Catch leftover transient clubs and missing original ones.
      expect(clubs).toHaveLength(baselineClubs.length)
      expect(clubs.filter((c) => c.name.startsWith('ChaosClub_'))).toEqual([])
      const got = [...clubs].sort((a, b) => a.id - b.id)
      const want = [...baselineClubs].sort((a, b) => a.id - b.id)
      expect(got.map((c) => ({ id: c.id, chess4Members: c.chess4Members }))).toEqual(
        want.map((c) => ({ id: c.id, chess4Members: c.chess4Members })),
      )
    })

    await test.step('invariants: no leftover transient pool players', async () => {
      const pool: { id: number; lastName: string }[] = await $.get('/api/players')
      const stuck = pool.filter((p) => p.lastName === 'TransientPlayer')
      expect(stuck, `transient pool players left over: ${JSON.stringify(stuck)}`).toEqual([])
    })

    await test.step('invariants: player ratings unchanged from baseline', async () => {
      const players: any[] = await $.get(`/api/tournaments/${tid}/players`)
      const got = players
        .map((p) => ({ id: p.id, ratingI: p.ratingI, ratingN: p.ratingN, ratingQ: p.ratingQ }))
        .sort((a, b) => a.id - b.id)
      const want = [...baselineRatings].sort((a, b) => a.id - b.id)
      expect(got).toEqual(want)
    })

    await test.step('standings totals match the recorded score sum', async () => {
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
  })
}
