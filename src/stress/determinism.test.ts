/**
 * Stress + determinism test: creates a large schack4an tournament, runs many
 * rounds with chaotic results and withdrawals, exports the DB, then runs the
 * exact same scenario again and asserts the DB bytes are identical.
 *
 * Gated on RUN_STRESS env var so it stays out of the default vitest run.
 * Example: RUN_STRESS=1 pnpm vitest run src/stress/determinism.test.ts
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocalProviderFactory } from '../api/active-provider.ts'
import { getLocalProvider } from '../api/local-data-provider.ts'
import { setResult } from '../api/results.ts'
import { pairNextRound } from '../api/rounds.ts'
import { setDatabaseService } from '../api/service-provider.ts'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import type { ResultType } from '../types/api.ts'

// mulberry32 — tiny seeded PRNG. Same seed → same sequence.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Install a seeded RNG globally. Any call to Math.random (ours or the app's,
// including the one in assignLotNumbers for Slumpad) draws from this stream.
function installSeededRandom(seed: number): () => void {
  const original = Math.random
  const rng = mulberry32(seed)
  Math.random = rng
  return () => {
    Math.random = original
  }
}

type ChaosResult = {
  hash: string
  bytes: Uint8Array
  totalGames: number
  totalResults: number
  withdrawals: number
  byeRounds: number
}

// Result distribution (chess4 allows all of these, incl. WO variants)
const RESULT_POOL: ResultType[] = [
  'WHITE_WIN',
  'WHITE_WIN',
  'WHITE_WIN',
  'BLACK_WIN',
  'BLACK_WIN',
  'BLACK_WIN',
  'DRAW',
  'DRAW',
  'WHITE_WIN_WO',
  'BLACK_WIN_WO',
]

async function runStressTournament(opts: {
  seed: number
  numPlayers: number
  numRounds: number
  withdrawRatePerRound: number
}): Promise<ChaosResult> {
  const restoreRandom = installSeededRandom(opts.seed)

  try {
    const service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())

    // Create schack4an tournament (chess4 + pointsPerGame 4). Initial pairing
    // 'Slumpad' so we exercise the one Math.random path in the app too.
    const t = service.tournaments.create({
      name: 'Stress schack4an',
      group: 'Stress',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: opts.numRounds,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 4,
      chess4: true,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: false,
    })

    // Build players with deterministic names + ratings. We avoid relying on
    // the built-in seed helper because it uses Math.random internally (which
    // is seeded, but the order of calls couples player generation to the
    // rest of the run — simpler to generate directly here).
    const playerDtos = []
    for (let i = 0; i < opts.numPlayers; i++) {
      playerDtos.push({
        firstName: `First${i.toString().padStart(4, '0')}`,
        lastName: `Last${i.toString().padStart(4, '0')}`,
        ratingI: 1200 + ((i * 37) % 1200),
        ratingQ: 0,
        ratingB: 0,
        clubIndex: 0,
      })
    }
    const added = service.tournamentPlayers.addMany(t.id, playerDtos)
    const activeIds = new Set(added.map((p) => p.id))

    let totalGames = 0
    let totalResults = 0
    let withdrawals = 0
    let byeRounds = 0

    for (let r = 1; r <= opts.numRounds; r++) {
      // Chaos: a fraction of active players withdraw from THIS round onward.
      if (r > 1 && opts.withdrawRatePerRound > 0) {
        const targets = [...activeIds]
        for (const id of targets) {
          if (Math.random() < opts.withdrawRatePerRound) {
            service.tournamentPlayers.update(id, { withdrawnFromRound: r })
            activeIds.delete(id)
            withdrawals++
          }
        }
      }

      let round
      try {
        round = await pairNextRound(t.id)
      } catch (e) {
        console.warn(`Round ${r} pairing failed (likely pigeonhole): ${(e as Error).message}`)
        break
      }
      totalGames += round.games.length

      for (const g of round.games) {
        if (!g.whitePlayer || !g.blackPlayer) {
          byeRounds++
          continue
        }
        const result = RESULT_POOL[Math.floor(Math.random() * RESULT_POOL.length)]
        await setResult(t.id, r, g.boardNr, { resultType: result })
        totalResults++
      }
    }

    // Persist + export raw SQLite bytes.
    await service.save()
    const bytes = service.export()
    const hash = createHash('sha256').update(bytes).digest('hex')

    service.close()
    await deleteDatabase()

    return { hash, bytes, totalGames, totalResults, withdrawals, byeRounds }
  } finally {
    restoreRandom()
  }
}

describe('Stress: schack4an determinism', () => {
  beforeEach(() => {})

  afterEach(async () => {
    try {
      await deleteDatabase()
    } catch {}
  })

  it.skipIf(!process.env.RUN_STRESS)(
    'two identical runs produce byte-identical DB exports',
    async () => {
      const numPlayers = Number(process.env.STRESS_PLAYERS ?? 1000)
      const numRounds = Number(process.env.STRESS_ROUNDS ?? 50)
      const withdrawRate = Number(process.env.STRESS_WITHDRAW_RATE ?? 0.01)
      const seed = Number(process.env.STRESS_SEED ?? 0xc0ffee)

      console.log(
        `[stress] players=${numPlayers} rounds=${numRounds} ` +
          `withdrawRate=${withdrawRate} seed=0x${seed.toString(16)}`,
      )

      const t1Start = Date.now()
      const run1 = await runStressTournament({
        seed,
        numPlayers,
        numRounds,
        withdrawRatePerRound: withdrawRate,
      })
      const t1 = Date.now() - t1Start
      console.log(
        `[stress] run 1: ${t1}ms games=${run1.totalGames} results=${run1.totalResults} ` +
          `withdrawals=${run1.withdrawals} byes=${run1.byeRounds} sha=${run1.hash.slice(0, 16)}`,
      )

      const t2Start = Date.now()
      const run2 = await runStressTournament({
        seed,
        numPlayers,
        numRounds,
        withdrawRatePerRound: withdrawRate,
      })
      const t2 = Date.now() - t2Start
      console.log(
        `[stress] run 2: ${t2}ms games=${run2.totalGames} results=${run2.totalResults} ` +
          `withdrawals=${run2.withdrawals} byes=${run2.byeRounds} sha=${run2.hash.slice(0, 16)}`,
      )

      expect(run1.bytes.length).toBe(run2.bytes.length)
      expect(run1.hash).toBe(run2.hash)
    },
    30 * 60_000, // 30 min ceiling
  )
})
