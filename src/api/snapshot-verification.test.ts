/**
 * Snapshot verification: exercises ALL e2e snapshot scenarios through the
 * frontend-only service layer and compares with existing e2e snapshot data.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import type { GameDto, PlayerDto, ResultType, RoundDto } from '../types/api.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { setResult } from './results.ts'
import { pairNextRound } from './rounds.ts'
import { setDatabaseService } from './service-provider.ts'
import { getStandings } from './standings.ts'

// ── Helpers ──────────────────────────────────────────────────────────────

const PLAYERS_8 = [
  { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100 },
  { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950 },
  { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800 },
  { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750 },
  { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600 },
  { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500 },
  { lastName: 'Stjärnljus', firstName: 'Freja', ratingI: 1400 },
  { lastName: 'Nattskärm', firstName: 'Sigrid', ratingI: 1300 },
]
const PLAYERS_7 = PLAYERS_8.slice(0, 7)
const PLAYERS_4 = PLAYERS_8.slice(0, 4)

type ResultFn = (g: GameDto) => ResultType
const HRW: ResultFn = (g) =>
  (g.whitePlayer!.rating > g.blackPlayer!.rating ? 'WHITE_WIN' : 'BLACK_WIN') as ResultType
const ALL_DRAWS: ResultFn = () => 'DRAW'

function getPairings(round: RoundDto): [string, string][] {
  return round.games.map((g) => [g.whitePlayer?.name ?? '(bye)', g.blackPlayer?.name ?? '(bye)'])
}

async function setResultsFn(tid: number, roundNr: number, games: GameDto[], fn: ResultFn) {
  for (const g of games) {
    if (!g.whitePlayer || !g.blackPlayer) continue
    await setResult(tid, roundNr, g.boardNr, { resultType: fn(g) })
  }
}

async function setResultsScript(
  tid: number,
  roundNr: number,
  games: GameDto[],
  script: Record<number, ResultType>,
) {
  for (const g of games) {
    if (!g.whitePlayer || !g.blackPlayer) continue
    await setResult(tid, roundNr, g.boardNr, { resultType: script[g.boardNr] })
  }
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('Snapshot verification: frontend vs e2e (API-generated)', () => {
  let service: DatabaseService

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(async () => {
    service.close()
    await deleteDatabase()
  })

  // Helper to create tournament + players
  function createTournament(opts: {
    name: string
    pairingSystem: string
    nrOfRounds: number
    initialPairing?: string
    barredPairing?: boolean
    compensateWeakPlayerPP?: boolean
    pointsPerGame?: number
    chess4?: boolean
    ratingChoice?: string
    selectedTiebreaks?: string[]
  }) {
    return service.tournaments.create({
      name: opts.name,
      group: 'Snapshot',
      pairingSystem: opts.pairingSystem,
      initialPairing: opts.initialPairing ?? 'Rating',
      nrOfRounds: opts.nrOfRounds,
      barredPairing: opts.barredPairing ?? false,
      compensateWeakPlayerPP: opts.compensateWeakPlayerPP ?? false,
      pointsPerGame: opts.pointsPerGame ?? 1,
      chess4: opts.chess4 ?? false,
      ratingChoice: opts.ratingChoice ?? 'ELO',
      showELO: true,
      showGroup: false,
    })
  }

  function addPlayers(
    tid: number,
    players: {
      lastName: string
      firstName: string
      ratingI?: number
      ratingQ?: number
      ratingB?: number
      clubIndex?: number
    }[],
  ) {
    const added: PlayerDto[] = []
    for (const p of players) {
      added.push(
        service.tournamentPlayers.add(tid, {
          lastName: p.lastName,
          firstName: p.firstName,
          ratingI: p.ratingI ?? 0,
          ratingQ: p.ratingQ ?? 0,
          ratingB: p.ratingB ?? 0,
          clubIndex: p.clubIndex ?? 0,
        }),
      )
    }
    return added
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAIRINGS SNAPSHOTS
  // ════════════════════════════════════════════════════════════════════════

  describe('pairings-snapshots', () => {
    it('MONRAD_8P_BASE — 7 rounds, 8 players, HRW', async () => {
      const t = createTournament({ name: 'M8P', pairingSystem: 'Monrad', nrOfRounds: 7 })
      addPlayers(t.id, PLAYERS_8)

      const allPairings: [string, string][][] = []
      for (let r = 1; r <= 7; r++) {
        const round = await pairNextRound(t.id)
        allPairings.push(getPairings(round))
        await setResultsFn(t.id, r, round.games, HRW)
      }
      const standings = (await getStandings(t.id, 7)).map((s) => ({
        place: s.place,
        name: s.name,
        score: s.score,
      }))

      // E2E snapshot (API-generated) pairings for comparison
      const apiPairings_R3 = [
        ['Frej Stormöga', 'Thor Ödinson'],
        ['Björn Järnsida', 'Loki Läufeyson'],
        ['Freja Stjärnljus', 'Tyr Svärdhand'],
        ['Sigrid Nattskärm', 'Odin Åskväder'],
      ]
      const frontendR3 = allPairings[2]

      console.log('MONRAD_8P_BASE:')
      console.log(
        '  R1 matches API:',
        JSON.stringify(allPairings[0]) ===
          JSON.stringify([
            ['Loki Läufeyson', 'Thor Ödinson'],
            ['Odin Åskväder', 'Björn Järnsida'],
            ['Tyr Svärdhand', 'Frej Stormöga'],
            ['Sigrid Nattskärm', 'Freja Stjärnljus'],
          ]),
      )
      console.log(
        '  R2 matches API:',
        JSON.stringify(allPairings[1]) ===
          JSON.stringify([
            ['Björn Järnsida', 'Thor Ödinson'],
            ['Freja Stjärnljus', 'Frej Stormöga'],
            ['Odin Åskväder', 'Loki Läufeyson'],
            ['Sigrid Nattskärm', 'Tyr Svärdhand'],
          ]),
      )
      console.log(
        '  R3 matches API:',
        JSON.stringify(frontendR3) === JSON.stringify(apiPairings_R3),
      )
      console.log('  R3 frontend:', JSON.stringify(frontendR3))
      console.log('  R3 API:     ', JSON.stringify(apiPairings_R3))

      // Print all rounds for reference
      for (let i = 0; i < 7; i++) {
        console.log(`  R${i + 1}: ${JSON.stringify(allPairings[i])}`)
      }
      console.log('  Standings:', JSON.stringify(standings))

      // Verify rounds 1-2 match (they should be identical)
      expect(allPairings[0]).toEqual([
        ['Loki Läufeyson', 'Thor Ödinson'],
        ['Odin Åskväder', 'Björn Järnsida'],
        ['Tyr Svärdhand', 'Frej Stormöga'],
        ['Sigrid Nattskärm', 'Freja Stjärnljus'],
      ])
      expect(allPairings[1]).toEqual([
        ['Björn Järnsida', 'Thor Ödinson'],
        ['Freja Stjärnljus', 'Frej Stormöga'],
        ['Odin Åskväder', 'Loki Läufeyson'],
        ['Sigrid Nattskärm', 'Tyr Svärdhand'],
      ])

      // Round 3+ should differ from API
      expect(frontendR3).not.toEqual(apiPairings_R3)
    })

    it('MONRAD_7P_ODD — 6 rounds, 7 players, HRW', async () => {
      const t = createTournament({ name: 'M7P', pairingSystem: 'Monrad', nrOfRounds: 6 })
      addPlayers(t.id, PLAYERS_7)

      const allPairings: [string, string][][] = []
      for (let r = 1; r <= 6; r++) {
        const round = await pairNextRound(t.id)
        allPairings.push(getPairings(round))
        await setResultsFn(t.id, r, round.games, HRW)
      }
      const standings = (await getStandings(t.id, 6)).map((s) => ({
        place: s.place,
        name: s.name,
        score: s.score,
      }))

      // API round 2 pairing
      const apiR2 = [
        ['Thor Ödinson', 'Freja Stjärnljus'],
        ['Frej Stormöga', 'Björn Järnsida'],
        ['Odin Åskväder', 'Loki Läufeyson'],
        ['Tyr Svärdhand', '(bye)'],
      ]

      console.log('MONRAD_7P_ODD:')
      for (let i = 0; i < 6; i++) {
        console.log(`  R${i + 1}: ${JSON.stringify(allPairings[i])}`)
      }
      console.log('  Standings:', JSON.stringify(standings))
      console.log('  R2 matches API:', JSON.stringify(allPairings[1]) === JSON.stringify(apiR2))

      // Round 1 matches
      expect(allPairings[0]).toEqual([
        ['Loki Läufeyson', 'Thor Ödinson'],
        ['Odin Åskväder', 'Björn Järnsida'],
        ['Tyr Svärdhand', 'Frej Stormöga'],
        ['Freja Stjärnljus', '(bye)'],
      ])
      // Round 2+ should differ from API (bye handling + lotNr)
      expect(allPairings[1]).not.toEqual(apiR2)
    })

    it('MONRAD_8P_DRAWS — 7 rounds, 8 players, all draws', async () => {
      const t = createTournament({ name: 'M8D', pairingSystem: 'Monrad', nrOfRounds: 7 })
      addPlayers(t.id, PLAYERS_8)

      const allPairings: [string, string][][] = []
      for (let r = 1; r <= 7; r++) {
        const round = await pairNextRound(t.id)
        allPairings.push(getPairings(round))
        await setResultsFn(t.id, r, round.games, ALL_DRAWS)
      }

      // API pairings
      const apiR3 = [
        ['Thor Ödinson', 'Odin Åskväder'],
        ['Björn Järnsida', 'Loki Läufeyson'],
        ['Frej Stormöga', 'Sigrid Nattskärm'],
        ['Freja Stjärnljus', 'Tyr Svärdhand'],
      ]

      console.log('MONRAD_8P_DRAWS:')
      for (let i = 0; i < 7; i++) {
        console.log(`  R${i + 1}: ${JSON.stringify(allPairings[i])}`)
      }
      console.log('  R3 matches API:', JSON.stringify(allPairings[2]) === JSON.stringify(apiR3))
    })

    it('MONRAD_8P_WITHDRAW — 4 rounds, withdrawal after R2', async () => {
      const t = createTournament({ name: 'M8W', pairingSystem: 'Monrad', nrOfRounds: 4 })
      const added = addPlayers(t.id, PLAYERS_8)

      const allPairings: [string, string][][] = []
      for (let r = 1; r <= 4; r++) {
        if (r === 3) {
          // Sigrid withdraws after round 2
          service.tournamentPlayers.update(added[7].id, { withdrawnFromRound: 3 })
        }
        const round = await pairNextRound(t.id)
        allPairings.push(getPairings(round))
        await setResultsFn(t.id, r, round.games, HRW)
      }

      // API round 3 pairing
      const apiR3 = [
        ['Frej Stormöga', 'Thor Ödinson'],
        ['Björn Järnsida', 'Loki Läufeyson'],
        ['Freja Stjärnljus', 'Tyr Svärdhand'],
        ['Odin Åskväder', '(bye)'],
      ]

      console.log('MONRAD_8P_WITHDRAW:')
      for (let i = 0; i < 4; i++) {
        console.log(`  R${i + 1}: ${JSON.stringify(allPairings[i])}`)
      }
      console.log('  R3 matches API:', JSON.stringify(allPairings[2]) === JSON.stringify(apiR3))
    })

    it('NS_8P_BASE — 7 rounds, NS (should match API)', async () => {
      const t = createTournament({
        name: 'NS8P',
        pairingSystem: 'Nordisk Schweizer',
        nrOfRounds: 7,
      })
      addPlayers(t.id, PLAYERS_8)

      const allPairings: [string, string][][] = []
      for (let r = 1; r <= 7; r++) {
        const round = await pairNextRound(t.id)
        allPairings.push(getPairings(round))
        await setResultsFn(t.id, r, round.games, HRW)
      }

      // NS should NOT be affected by lotNr fix (always uses initialize())
      const apiR1 = [
        ['Frej Stormöga', 'Thor Ödinson'],
        ['Tyr Svärdhand', 'Loki Läufeyson'],
        ['Freja Stjärnljus', 'Björn Järnsida'],
        ['Sigrid Nattskärm', 'Odin Åskväder'],
      ]

      console.log('NS_8P_BASE:')
      for (let i = 0; i < 7; i++) {
        console.log(`  R${i + 1}: ${JSON.stringify(allPairings[i])}`)
      }

      expect(allPairings[0]).toEqual(apiR1)
    })

    it('BERGER_8P_BASE — 7 rounds (should match API)', async () => {
      const t = createTournament({ name: 'B8P', pairingSystem: 'Berger', nrOfRounds: 7 })
      addPlayers(t.id, PLAYERS_8)

      const round = await pairNextRound(t.id) // Berger pairs all rounds at once
      // Verify round 1 matches
      const r1Pairings = getPairings(round)

      const apiR1 = [
        ['Thor Ödinson', 'Sigrid Nattskärm'],
        ['Odin Åskväder', 'Frej Stormöga'],
        ['Loki Läufeyson', 'Freja Stjärnljus'],
        ['Björn Järnsida', 'Tyr Svärdhand'],
      ]

      console.log(
        'BERGER_8P_BASE: R1 matches API:',
        JSON.stringify(r1Pairings) === JSON.stringify(apiR1),
      )
      expect(r1Pairings).toEqual(apiR1)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // RESULTS SNAPSHOTS (discover-snapshots: discoverResults)
  // ════════════════════════════════════════════════════════════════════════

  describe('results-snapshots', () => {
    it('Results: 3-round Monrad with scripted results', async () => {
      const t = createTournament({
        name: 'Results-test',
        pairingSystem: 'Monrad',
        nrOfRounds: 3,
      })
      addPlayers(t.id, PLAYERS_8)

      const r1 = await pairNextRound(t.id)
      await setResultsFn(t.id, 1, r1.games, HRW)

      const r2 = await pairNextRound(t.id)
      await setResultsScript(t.id, 2, r2.games, {
        1: 'WHITE_WIN_WO',
        2: 'BLACK_WIN_WO',
        3: 'DOUBLE_WO',
        4: 'POSTPONED',
      })

      const r3 = await pairNextRound(t.id)
      await setResultsScript(t.id, 3, r3.games, {
        1: 'CANCELLED',
        2: 'WHITE_WIN',
        3: 'DRAW',
        4: 'BLACK_WIN',
      })

      // Capture round 2 & 3 pairings to see if they match API
      console.log('RESULTS:')
      console.log('  R2 pairings:', JSON.stringify(getPairings(r2)))
      console.log('  R3 pairings:', JSON.stringify(getPairings(r3)))

      const s2 = (await getStandings(t.id, 2)).map((s) => ({
        place: s.place,
        name: s.name,
        score: s.score,
        tiebreaks: s.tiebreaks,
      }))
      const s3 = (await getStandings(t.id, 3)).map((s) => ({
        place: s.place,
        name: s.name,
        score: s.score,
        tiebreaks: s.tiebreaks,
      }))

      console.log('  Standings R2:', JSON.stringify(s2))
      console.log('  Standings R3:', JSON.stringify(s3))

      // R2 pairings same as API (round 2 not affected by lotNr fix)
      // R3 MAY differ
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // STANDINGS SNAPSHOTS (discover-snapshots: discoverStandings)
  // ════════════════════════════════════════════════════════════════════════

  describe('standings-snapshots', () => {
    it('Standings-8TB: 5 rounds, 8 tiebreaks, scripted results', async () => {
      const t = createTournament({
        name: 'Standings-8TB',
        pairingSystem: 'Monrad',
        nrOfRounds: 5,
      })
      addPlayers(t.id, PLAYERS_8)

      const scripted: Record<number, Record<number, ResultType>> = {
        1: { 1: 'WHITE_WIN', 2: 'BLACK_WIN', 3: 'WHITE_WIN', 4: 'DRAW' },
        2: { 1: 'BLACK_WIN', 2: 'WHITE_WIN', 3: 'DRAW', 4: 'WHITE_WIN' },
        3: { 1: 'WHITE_WIN', 2: 'DRAW', 3: 'BLACK_WIN', 4: 'WHITE_WIN' },
        4: { 1: 'DRAW', 2: 'WHITE_WIN', 3: 'WHITE_WIN', 4: 'BLACK_WIN' },
        5: { 1: 'WHITE_WIN', 2: 'BLACK_WIN', 3: 'DRAW', 4: 'WHITE_WIN' },
      }

      console.log('STANDINGS_8TB:')
      for (let r = 1; r <= 5; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsScript(t.id, r, round.games, scripted[r])
      }
    })

    it('Standings-Inbordes: 4 rounds, 6 players', async () => {
      const t = createTournament({
        name: 'Standings-Inbordes',
        pairingSystem: 'Monrad',
        nrOfRounds: 4,
      })
      const players6 = [
        { lastName: 'Alfa', firstName: 'A', ratingI: 2000 },
        { lastName: 'Beta', firstName: 'B', ratingI: 1900 },
        { lastName: 'Gamma', firstName: 'C', ratingI: 1800 },
        { lastName: 'Delta', firstName: 'D', ratingI: 1700 },
        { lastName: 'Epsilon', firstName: 'E', ratingI: 1600 },
        { lastName: 'Zeta', firstName: 'F', ratingI: 1500 },
      ]
      addPlayers(t.id, players6)

      const scripted: Record<number, Record<number, ResultType>> = {
        1: { 1: 'WHITE_WIN', 2: 'BLACK_WIN', 3: 'WHITE_WIN' },
        2: { 1: 'BLACK_WIN', 2: 'WHITE_WIN', 3: 'DRAW' },
        3: { 1: 'WHITE_WIN', 2: 'DRAW', 3: 'BLACK_WIN' },
        4: { 1: 'DRAW', 2: 'WHITE_WIN', 3: 'BLACK_WIN' },
      }

      console.log('STANDINGS_INBORDES:')
      for (let r = 1; r <= 4; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsScript(t.id, r, round.games, scripted[r])
      }
    })

    it('Standings-Manuell: 3 rounds, 8 players', async () => {
      const t = createTournament({
        name: 'Standings-Manuell',
        pairingSystem: 'Monrad',
        nrOfRounds: 3,
      })
      addPlayers(t.id, PLAYERS_8)

      const scripted: Record<number, Record<number, ResultType>> = {
        1: { 1: 'WHITE_WIN', 2: 'BLACK_WIN', 3: 'DRAW', 4: 'DRAW' },
        2: { 1: 'WHITE_WIN', 2: 'DRAW', 3: 'WHITE_WIN', 4: 'BLACK_WIN' },
        3: { 1: 'DRAW', 2: 'WHITE_WIN', 3: 'BLACK_WIN', 4: 'WHITE_WIN' },
      }

      console.log('STANDINGS_MANUELL:')
      for (let r = 1; r <= 3; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsScript(t.id, r, round.games, scripted[r])
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // CLUB STANDINGS SNAPSHOTS
  // ════════════════════════════════════════════════════════════════════════

  describe('club-standings-snapshots', () => {
    it('Club standings: 4 rounds, 6 players, 3 clubs', async () => {
      const club1 = service.clubs.create({ name: 'SK Vit' })
      const club2 = service.clubs.create({ name: 'SK Svart' })
      const club3 = service.clubs.create({ name: 'SK Grön' })

      const t = createTournament({
        name: 'ClubStandings-base',
        pairingSystem: 'Monrad',
        nrOfRounds: 4,
      })
      const players6 = [
        { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100, clubIndex: club1.id },
        { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950, clubIndex: club1.id },
        { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800, clubIndex: club2.id },
        { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750, clubIndex: club2.id },
        { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600, clubIndex: club3.id },
        { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500, clubIndex: club3.id },
      ]
      addPlayers(t.id, players6)

      const scripted: Record<number, Record<number, ResultType>> = {
        1: { 1: 'WHITE_WIN', 2: 'BLACK_WIN', 3: 'WHITE_WIN' },
        2: { 1: 'BLACK_WIN', 2: 'WHITE_WIN', 3: 'DRAW' },
        3: { 1: 'WHITE_WIN', 2: 'DRAW', 3: 'BLACK_WIN' },
        4: { 1: 'DRAW', 2: 'WHITE_WIN', 3: 'BLACK_WIN' },
      }

      console.log('CLUB_STANDINGS:')
      for (let r = 1; r <= 4; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsScript(t.id, r, round.games, scripted[r])
      }
    })

    it('Club standings all draws: 4 rounds', async () => {
      // Use existing clubs or create new ones
      const clubs = service.clubs.list()
      let c1 = clubs.find((c) => c.name === 'SK Vit')
      let c2 = clubs.find((c) => c.name === 'SK Svart')
      let c3 = clubs.find((c) => c.name === 'SK Grön')
      if (!c1) c1 = service.clubs.create({ name: 'SK Vit' })
      if (!c2) c2 = service.clubs.create({ name: 'SK Svart' })
      if (!c3) c3 = service.clubs.create({ name: 'SK Grön' })

      const t = createTournament({
        name: 'ClubStandings-draws',
        pairingSystem: 'Monrad',
        nrOfRounds: 4,
      })
      const players6 = [
        { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100, clubIndex: c1.id },
        { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950, clubIndex: c1.id },
        { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800, clubIndex: c2.id },
        { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750, clubIndex: c2.id },
        { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600, clubIndex: c3.id },
        { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500, clubIndex: c3.id },
      ]
      addPlayers(t.id, players6)

      console.log('CLUB_STANDINGS_DRAWS:')
      for (let r = 1; r <= 4; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsFn(t.id, r, round.games, ALL_DRAWS)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // SETTINGS SNAPSHOTS
  // ════════════════════════════════════════════════════════════════════════

  describe('settings-snapshots', () => {
    it('Settings PPG2: 3 rounds, 4 players, HRW', async () => {
      const t = createTournament({
        name: 'Settings-ppg2',
        pairingSystem: 'Monrad',
        nrOfRounds: 3,
        pointsPerGame: 2,
      })
      addPlayers(t.id, PLAYERS_4)

      console.log('SETTINGS_PPG2:')
      for (let r = 1; r <= 3; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsFn(t.id, r, round.games, HRW)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // BARRED PAIRING SNAPSHOTS
  // ════════════════════════════════════════════════════════════════════════

  describe('barred-pairing-snapshots', () => {
    it('Barred Monrad: 4 rounds, 8 players, 4 clubs', async () => {
      const c1 = service.clubs.create({ name: 'BP-A' })
      const c2 = service.clubs.create({ name: 'BP-B' })
      const c3 = service.clubs.create({ name: 'BP-C' })
      const c4 = service.clubs.create({ name: 'BP-D' })

      const t = createTournament({
        name: 'Barred-Monrad',
        pairingSystem: 'Monrad',
        nrOfRounds: 4,
        barredPairing: true,
      })
      const players = [
        { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100, clubIndex: c1.id },
        { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950, clubIndex: c1.id },
        { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800, clubIndex: c2.id },
        { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750, clubIndex: c2.id },
        { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600, clubIndex: c3.id },
        { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500, clubIndex: c3.id },
        { lastName: 'Stjärnljus', firstName: 'Freja', ratingI: 1400, clubIndex: c4.id },
        { lastName: 'Nattskärm', firstName: 'Sigrid', ratingI: 1300, clubIndex: c4.id },
      ]
      addPlayers(t.id, players)

      console.log('BARRED_MONRAD:')
      for (let r = 1; r <= 4; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r} pairings: ${JSON.stringify(getPairings(round))}`)
        await setResultsFn(t.id, r, round.games, HRW)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // PAIRING EDGE CASES SNAPSHOTS
  // ════════════════════════════════════════════════════════════════════════

  describe('pairing-edge-cases-snapshots', () => {
    it('BYE_ROTATION: 5 rounds, 5 players Monrad', async () => {
      const t = createTournament({ name: 'Bye-rot', pairingSystem: 'Monrad', nrOfRounds: 5 })
      const players5 = PLAYERS_8.slice(0, 5)
      addPlayers(t.id, players5)

      console.log('BYE_ROTATION:')
      for (let r = 1; r <= 5; r++) {
        const round = await pairNextRound(t.id)
        const pairings = getPairings(round)
        const byeGame = round.games.find((g) => !g.blackPlayer)
        console.log(
          `  R${r}: bye=${byeGame?.whitePlayer?.name ?? 'none'} pairings=${JSON.stringify(pairings)}`,
        )
        await setResultsFn(t.id, r, round.games, HRW)
      }
    })

    it('MONRAD_COLOR: 7 rounds color balance', async () => {
      const t = createTournament({ name: 'M-color', pairingSystem: 'Monrad', nrOfRounds: 7 })
      addPlayers(t.id, PLAYERS_8)

      const colorCounts: Record<string, { whites: number; blacks: number }> = {}
      for (const p of PLAYERS_8) {
        colorCounts[`${p.firstName} ${p.lastName}`] = { whites: 0, blacks: 0 }
      }

      console.log('MONRAD_COLOR:')
      for (let r = 1; r <= 7; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r}: ${JSON.stringify(getPairings(round))}`)
        for (const g of round.games) {
          if (g.whitePlayer) colorCounts[g.whitePlayer.name].whites++
          if (g.blackPlayer) colorCounts[g.blackPlayer.name].blacks++
        }
        await setResultsFn(t.id, r, round.games, HRW)
      }
      console.log('  Color counts:', JSON.stringify(colorCounts))
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // EXPORTS SNAPSHOTS (7-round Monrad)
  // ════════════════════════════════════════════════════════════════════════

  describe('exports-snapshots', () => {
    it('Export tournament: 7 rounds, 8 players, HRW', async () => {
      const t = createTournament({
        name: 'Export-test',
        pairingSystem: 'Monrad',
        nrOfRounds: 7,
      })
      addPlayers(t.id, PLAYERS_8)

      console.log('EXPORT_TOURNAMENT:')
      for (let r = 1; r <= 7; r++) {
        const round = await pairNextRound(t.id)
        console.log(`  R${r}: ${JSON.stringify(getPairings(round))}`)
        await setResultsFn(t.id, r, round.games, HRW)
      }
    })
  })
})
