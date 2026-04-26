import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
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

interface PlayerKey {
  lastName: string
  firstName: string
  club: string
}

/**
 * Compare pairings via (lastName, firstName, club) instead of `name` —
 * the DTO's `name` field is shaped by the `playerPresentation` setting
 * (FIRST_LAST vs LAST_FIRST), so comparing by name silently couples the
 * test to that setting. Pulling lastName/firstName off the tournament
 * player roster decouples it.
 */
async function buildPlayerLookup($: ApiClient, tid: number): Promise<Map<number, PlayerKey>> {
  const players: {
    id: number
    lastName: string
    firstName: string
    club: string | null
  }[] = await $.get(`/api/tournaments/${tid}/players`)
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

test.describe('Lördag em — replay', () => {
  // The recorded R1 pairing comes from `Slumpad` (random) and is not
  // reproducible by re-running the algorithm. We seed from the backup
  // captured right after R1 was paired, then replay R1–R5 deterministically.
  test('replay R1–R5 from backup-r1-paired matches backup-final-r5', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)

    let tid: number = -1
    let lookup: Map<number, PlayerKey> = new Map()

    await test.step('restore seed (backup-r1-paired)', async () => {
      const seed = readFileSync(join(FIXTURES, 'backup-r1-paired.sqlite'))
      await restoreBackupFile(page, seed)

      tid = await findEmTournamentId($)
      lookup = await buildPlayerLookup($, tid)

      const t = await $.get(`/api/tournaments/${tid}`)
      expect(t.chess4).toBe(true)
      expect(t.pointsPerGame).toBe(4)
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
        `pairings for round ${roundNr} should match the recorded tournament`,
      ).toEqual(want.map(summarizeFixture))
    }

    await test.step('round 1: verify seed pairing then enter results', async () => {
      const r1 = await $.get(`/api/tournaments/${tid}/rounds/1`)
      expectPairingsMatch(1, r1.games)
      await setBoardResults($, tid, 1, roundsFixture['1'])
    })

    // Rounds 2–5: each round's pairing is generated by the app (Monrad is
    // deterministic given identical inputs), checked against the recorded
    // backup, then results are entered.
    for (const roundNr of [2, 3, 4, 5]) {
      await test.step(`round ${roundNr}: generate pairing, verify, enter results`, async () => {
        const round = await pairRound($, tid)
        expect(round.roundNr).toBe(roundNr)
        expectPairingsMatch(roundNr, round.games)
        await setBoardResults($, tid, roundNr, roundsFixture[String(roundNr)])
      })
    }

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

    await test.step('standings totals match the recorded score sum', async () => {
      // Bye games have no black player, so the recorded blackScore doesn't
      // accrue to anyone — see scoring.ts.
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
})
