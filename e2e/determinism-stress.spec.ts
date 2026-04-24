/**
 * Browser equivalent of src/stress/determinism.test.ts.
 *
 * Runs a large schack4an tournament twice, in two fresh browser contexts
 * (so each starts from an empty IndexedDB), and asserts that the exported
 * raw SQLite bytes are byte-identical across runs.
 *
 * The entire stress loop is executed inside `page.evaluate` — we can't afford
 * per-call IPC for ~20k setResult calls over the Playwright wire.
 *
 * Gated on RUN_STRESS=1 so it doesn't run in Tier 1 CI.
 *   RUN_STRESS=1 pnpm exec playwright test determinism-stress.spec.ts
 *
 * Tunables:
 *   STRESS_PLAYERS       default 1000
 *   STRESS_ROUNDS        default 50
 *   STRESS_WITHDRAW_RATE default 0.01
 *   STRESS_SEED          default 0xc0ffee
 */
import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'

const RUN = process.env.RUN_STRESS === '1'

const NUM_PLAYERS = Number(process.env.STRESS_PLAYERS ?? 1000)
const NUM_ROUNDS = Number(process.env.STRESS_ROUNDS ?? 50)
const WITHDRAW_RATE = Number(process.env.STRESS_WITHDRAW_RATE ?? 0.01)
const SEED = Number(process.env.STRESS_SEED ?? 0xc0ffee)

// Runs in the browser. Kept as a string so we can inject it via addInitScript
// before any page script executes — this guarantees the seeded RNG is in
// place before the app's one Math.random call (lotNr assignment for Slumpad).
const installSeededRandomScript = (seed: number) => `(() => {
  let a = ${seed} >>> 0;
  Math.random = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`

type RunStats = {
  totalGames: number
  totalResults: number
  withdrawals: number
  byes: number
  bytes: number[] // serialized Uint8Array (Playwright can't return TypedArray)
  durationMs: number
}

async function runOnce(browser: import('@playwright/test').Browser): Promise<RunStats> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.addInitScript(installSeededRandomScript(SEED))
    await page.goto('/')
    await page.waitForFunction(() => (window as Record<string, unknown>).__lottaApi != null, null, {
      timeout: 30_000,
    })

    const stats = await page.evaluate(
      async ({ numPlayers, numRounds, withdrawRate }) => {
        const t0 = performance.now()
        const api = (window as Record<string, unknown>).__lottaApi as {
          createTournament: (dto: unknown) => Promise<{ id: number }>
          addTournamentPlayer: (tid: number, dto: unknown) => Promise<{ id: number }>
          updateTournamentPlayer: (tid: number, pid: number, dto: unknown) => Promise<unknown>
          pairNextRound: (tid: number) => Promise<{
            games: Array<{
              boardNr: number
              whitePlayer: { id: number } | null
              blackPlayer: { id: number } | null
            }>
          }>
          setResult: (
            tid: number,
            rn: number,
            bn: number,
            req: { resultType: string },
          ) => Promise<unknown>
          exportDbBytes: () => Uint8Array
        }

        const t = await api.createTournament({
          name: 'Stress schack4an',
          group: 'Stress',
          pairingSystem: 'Monrad',
          initialPairing: 'Slumpad',
          nrOfRounds: numRounds,
          barredPairing: false,
          compensateWeakPlayerPP: false,
          pointsPerGame: 4,
          chess4: true,
          ratingChoice: 'ELO',
          showELO: true,
          showGroup: false,
        })

        const playerIds: number[] = []
        for (let i = 0; i < numPlayers; i++) {
          const p = await api.addTournamentPlayer(t.id, {
            firstName: `First${String(i).padStart(4, '0')}`,
            lastName: `Last${String(i).padStart(4, '0')}`,
            ratingI: 1200 + ((i * 37) % 1200),
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
            withdrawnFromRound: -1,
            manualTiebreak: 0,
            birthdate: '',
          })
          playerIds.push(p.id)
        }
        const active = new Set(playerIds)

        const RESULT_POOL = [
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

        let totalGames = 0
        let totalResults = 0
        let withdrawals = 0
        let byes = 0

        for (let r = 1; r <= numRounds; r++) {
          if (r > 1 && withdrawRate > 0) {
            const targets = [...active]
            for (const id of targets) {
              if (Math.random() < withdrawRate) {
                await api.updateTournamentPlayer(t.id, id, { withdrawnFromRound: r })
                active.delete(id)
                withdrawals++
              }
            }
          }

          let round
          try {
            round = await api.pairNextRound(t.id)
          } catch (e) {
            console.warn(`Round ${r} pairing failed:`, (e as Error).message)
            break
          }
          totalGames += round.games.length

          for (const g of round.games) {
            if (!g.whitePlayer || !g.blackPlayer) {
              byes++
              continue
            }
            const result = RESULT_POOL[Math.floor(Math.random() * RESULT_POOL.length)]
            await api.setResult(t.id, r, g.boardNr, { resultType: result })
            totalResults++
          }
        }

        const bytes = api.exportDbBytes()
        // Serialize as a plain number array for IPC — Playwright can't
        // round-trip Uint8Array directly.
        const arr = Array.from(bytes)
        return {
          totalGames,
          totalResults,
          withdrawals,
          byes,
          bytes: arr,
          durationMs: performance.now() - t0,
        }
      },
      { numPlayers: NUM_PLAYERS, numRounds: NUM_ROUNDS, withdrawRate: WITHDRAW_RATE },
    )

    return stats
  } finally {
    await context.close()
  }
}

test.describe('Stress: schack4an determinism (browser)', () => {
  test.skip(!RUN, 'Set RUN_STRESS=1 to enable this test')
  test.setTimeout(30 * 60_000)

  test('two identical runs produce byte-identical DB exports', async ({ browser }) => {
    console.log(
      `[stress] players=${NUM_PLAYERS} rounds=${NUM_ROUNDS} ` +
        `withdrawRate=${WITHDRAW_RATE} seed=0x${SEED.toString(16)}`,
    )

    const r1 = await runOnce(browser)
    const h1 = createHash('sha256').update(Buffer.from(r1.bytes)).digest('hex')
    console.log(
      `[stress] run 1: ${r1.durationMs.toFixed(0)}ms games=${r1.totalGames} ` +
        `results=${r1.totalResults} withdrawals=${r1.withdrawals} byes=${r1.byes} ` +
        `bytes=${r1.bytes.length} sha=${h1.slice(0, 16)}`,
    )

    const r2 = await runOnce(browser)
    const h2 = createHash('sha256').update(Buffer.from(r2.bytes)).digest('hex')
    console.log(
      `[stress] run 2: ${r2.durationMs.toFixed(0)}ms games=${r2.totalGames} ` +
        `results=${r2.totalResults} withdrawals=${r2.withdrawals} byes=${r2.byes} ` +
        `bytes=${r2.bytes.length} sha=${h2.slice(0, 16)}`,
    )

    expect(r1.bytes.length).toBe(r2.bytes.length)
    expect(h1).toBe(h2)
  })
})
