import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CreateTournamentRequest, PlayerDto } from '../types/api'
import type { DataProvider } from './data-provider'
import { PROVIDERS } from './test-providers'

const NS_TOURNAMENT: CreateTournamentRequest = {
  name: 'NS-contract',
  group: 'Contract',
  pairingSystem: 'Nordisk Schweizer',
  initialPairing: 'Rating',
  nrOfRounds: 7,
  barredPairing: false,
  compensateWeakPlayerPP: false,
  pointsPerGame: 1,
  chess4: false,
  ratingChoice: 'ELO',
  showELO: true,
  showGroup: false,
}

const PLAYERS: Partial<PlayerDto>[] = [
  { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100 },
  { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950 },
  { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800 },
  { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750 },
  { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600 },
  { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500 },
  { lastName: 'Stjärnljus', firstName: 'Freja', ratingI: 1400 },
  { lastName: 'Nattskärm', firstName: 'Sigrid', ratingI: 1300 },
]

const EXPECTED_PAIRINGS = [
  [
    ['Frej Stormöga', 'Thor Ödinson'],
    ['Tyr Svärdhand', 'Loki Läufeyson'],
    ['Freja Stjärnljus', 'Björn Järnsida'],
    ['Sigrid Nattskärm', 'Odin Åskväder'],
  ],
  [
    ['Thor Ödinson', 'Björn Järnsida'],
    ['Loki Läufeyson', 'Odin Åskväder'],
    ['Frej Stormöga', 'Freja Stjärnljus'],
    ['Tyr Svärdhand', 'Sigrid Nattskärm'],
  ],
  [
    ['Loki Läufeyson', 'Thor Ödinson'],
    ['Björn Järnsida', 'Frej Stormöga'],
    ['Odin Åskväder', 'Tyr Svärdhand'],
    ['Sigrid Nattskärm', 'Freja Stjärnljus'],
  ],
  [
    ['Thor Ödinson', 'Odin Åskväder'],
    ['Björn Järnsida', 'Loki Läufeyson'],
    ['Frej Stormöga', 'Sigrid Nattskärm'],
    ['Freja Stjärnljus', 'Tyr Svärdhand'],
  ],
  [
    ['Tyr Svärdhand', 'Thor Ödinson'],
    ['Loki Läufeyson', 'Frej Stormöga'],
    ['Sigrid Nattskärm', 'Björn Järnsida'],
    ['Odin Åskväder', 'Freja Stjärnljus'],
  ],
  [
    ['Thor Ödinson', 'Freja Stjärnljus'],
    ['Loki Läufeyson', 'Sigrid Nattskärm'],
    ['Björn Järnsida', 'Odin Åskväder'],
    ['Frej Stormöga', 'Tyr Svärdhand'],
  ],
  [
    ['Sigrid Nattskärm', 'Thor Ödinson'],
    ['Freja Stjärnljus', 'Loki Läufeyson'],
    ['Tyr Svärdhand', 'Björn Järnsida'],
    ['Odin Åskväder', 'Frej Stormöga'],
  ],
]

const EXPECTED_FINAL_STANDINGS = [
  { place: 1, name: 'Thor Ödinson', score: 7 },
  { place: 2, name: 'Loki Läufeyson', score: 6 },
  { place: 3, name: 'Björn Järnsida', score: 5 },
  { place: 4, name: 'Odin Åskväder', score: 4 },
  { place: 5, name: 'Frej Stormöga', score: 3 },
  { place: 6, name: 'Tyr Svärdhand', score: 2 },
  { place: 7, name: 'Freja Stjärnljus', score: 1 },
  { place: 8, name: 'Sigrid Nattskärm', score: 0 },
]

describe.each(PROVIDERS)('DataProvider contract (%s)', (_name, factory) => {
  let provider: DataProvider
  let teardown: () => Promise<void>

  beforeEach(async () => {
    const setup = await factory()
    provider = setup.provider
    teardown = setup.teardown
  })

  afterEach(async () => {
    await teardown()
  })

  it('full lifecycle: create → add players → pair 7 rounds → results → standings', async () => {
    const tournament = await provider.tournaments.create(NS_TOURNAMENT)

    for (const p of PLAYERS) {
      await provider.tournamentPlayers.add(tournament.id, p)
    }

    for (let roundIdx = 0; roundIdx < 7; roundIdx++) {
      const round = await provider.rounds.pairNext(tournament.id)
      expect(round.roundNr).toBe(roundIdx + 1)
      expect(round.gameCount).toBe(4)

      const pairings = round.games.map((g) => [
        g.whitePlayer?.name ?? '(bye)',
        g.blackPlayer?.name ?? '(bye)',
      ])
      expect(pairings, `Round ${roundIdx + 1} pairings`).toEqual(EXPECTED_PAIRINGS[roundIdx])

      for (const g of round.games) {
        if (!g.whitePlayer || !g.blackPlayer) continue
        const resultType = g.whitePlayer.rating > g.blackPlayer.rating ? 'WHITE_WIN' : 'BLACK_WIN'
        await provider.results.set(tournament.id, roundIdx + 1, g.boardNr, { resultType })
      }
    }

    const standings = await provider.standings.get(tournament.id, 7)
    const summary = standings.map((s) => ({ place: s.place, name: s.name, score: s.score }))
    expect(summary).toEqual(EXPECTED_FINAL_STANDINGS)
  })

  it('tournaments.update mutates fields; tournaments.delete removes the row', async () => {
    const tournament = await provider.tournaments.create(NS_TOURNAMENT)

    const updated = await provider.tournaments.update(tournament.id, {
      ...NS_TOURNAMENT,
      name: 'Renamed',
      nrOfRounds: 9,
    })
    expect(updated.name).toBe('Renamed')
    expect(updated.nrOfRounds).toBe(9)

    await provider.tournaments.delete(tournament.id)
    const list = await provider.tournaments.list()
    expect(list.find((t) => t.id === tournament.id)).toBeUndefined()
  })

  it('listRounds returns all rounds after pairing', async () => {
    const tournament = await provider.tournaments.create(NS_TOURNAMENT)
    for (const p of PLAYERS) {
      await provider.tournamentPlayers.add(tournament.id, p)
    }

    // Pair and complete round 1
    const round = await provider.rounds.pairNext(tournament.id)
    for (const g of round.games) {
      if (!g.whitePlayer || !g.blackPlayer) continue
      await provider.results.set(tournament.id, 1, g.boardNr, { resultType: 'DRAW' })
    }

    // Pair round 2
    await provider.rounds.pairNext(tournament.id)

    const rounds = await provider.rounds.list(tournament.id)
    expect(rounds).toHaveLength(2)
    expect(rounds[0].roundNr).toBe(1)
    expect(rounds[1].roundNr).toBe(2)
  })

  it('results.addGame/updateGame/deleteGame manipulates boards directly', async () => {
    const tournament = await provider.tournaments.create(NS_TOURNAMENT)
    const players: number[] = []
    for (const p of PLAYERS) {
      const created = await provider.tournamentPlayers.add(tournament.id, p)
      players.push(created.id)
    }
    await provider.rounds.pairNext(tournament.id)

    await provider.results.addGame(tournament.id, 1, players[0], players[1])
    let round = await provider.rounds.get(tournament.id, 1)
    const addedBoard = round.games.length
    expect(round.games.at(-1)?.whitePlayer?.id).toBe(players[0])

    await provider.results.updateGame(tournament.id, 1, addedBoard, players[2], players[3])
    round = await provider.rounds.get(tournament.id, 1)
    expect(round.games.find((g) => g.boardNr === addedBoard)?.whitePlayer?.id).toBe(players[2])

    await provider.results.deleteGame(tournament.id, 1, addedBoard)
    round = await provider.rounds.get(tournament.id, 1)
    expect(round.games.find((g) => g.boardNr === addedBoard)).toBeUndefined()
  })

  it('clubs CRUD and settings.update round-trip', async () => {
    const club = await provider.clubs.add({ name: 'Testklubb' })
    expect(club.name).toBe('Testklubb')
    const renamed = await provider.clubs.rename(club.id, { name: 'Testklubb II' })
    expect(renamed.name).toBe('Testklubb II')
    const list = await provider.clubs.list()
    expect(list.find((c) => c.id === club.id)?.name).toBe('Testklubb II')

    const settings = await provider.settings.get()
    const updated = await provider.settings.update({
      ...settings,
      playerPresentation: 'LAST_FIRST',
    })
    expect(updated.playerPresentation).toBe('LAST_FIRST')

    await provider.clubs.delete(club.id)
    const afterDelete = await provider.clubs.list()
    expect(afterDelete.find((c) => c.id === club.id)).toBeUndefined()
  })

  it('poolPlayers CRUD round-trip', async () => {
    const player = await provider.poolPlayers.add({
      firstName: 'Pool',
      lastName: 'Player',
      ratingI: 1600,
    })
    expect(player.firstName).toBe('Pool')

    const updated = await provider.poolPlayers.update(player.id, {
      firstName: 'Pool',
      lastName: 'Player-Updated',
    })
    expect(updated.lastName).toBe('Player-Updated')

    await provider.poolPlayers.delete(player.id)
    const remaining = await provider.poolPlayers.list()
    expect(remaining.find((p) => p.id === player.id)).toBeUndefined()
  })

  it('undo.perform rolls the last mutation back', async () => {
    const tournament = await provider.tournaments.create(NS_TOURNAMENT)
    const before = await provider.tournaments.list()
    expect(before.find((t) => t.id === tournament.id)).toBeDefined()

    await provider.tournaments.delete(tournament.id)
    const mid = await provider.tournaments.list()
    expect(mid.find((t) => t.id === tournament.id)).toBeUndefined()

    const ok = await provider.undo.perform()
    expect(ok).toBe(true)
    const after = await provider.tournaments.list()
    expect(after.find((t) => t.id === tournament.id)).toBeDefined()
  })
})
