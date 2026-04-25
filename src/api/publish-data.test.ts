import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import {
  buildAlphabeticalPairingsInput,
  buildPairingsInput,
  buildStandingsInput,
} from './publish-data.ts'
import { setResult } from './results.ts'
import { pairNextRound } from './rounds.ts'
import { setDatabaseService } from './service-provider.ts'

describe('publish-data builders', () => {
  let service: DatabaseService
  let tournamentId: number

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())

    const t = service.tournaments.create({
      name: 'Testturneringen',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Rating',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })
    tournamentId = t.id

    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Andersson',
      firstName: 'Anna',
      ratingI: 1800,
    })
    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Björk',
      firstName: 'Bo',
      ratingI: 1700,
    })
  })

  afterEach(async () => {
    service.close()
    await deleteDatabase()
  })

  describe('buildPairingsInput', () => {
    it('returns null when tournament does not exist', () => {
      expect(buildPairingsInput(999, 1)).toBeNull()
    })

    it('returns null when round does not exist', () => {
      expect(buildPairingsInput(tournamentId, 1)).toBeNull()
    })

    it('builds pairings input after a round is paired', async () => {
      await pairNextRound(tournamentId)

      const input = buildPairingsInput(tournamentId, 1)
      expect(input).not.toBeNull()
      expect(input!.tournamentName).toBe('Testturneringen')
      expect(input!.roundNr).toBe(1)
      expect(input!.games).toHaveLength(1)
      expect(input!.games[0].boardNr).toBe(1)
      expect(input!.games[0].whiteName).toBeTruthy()
      expect(input!.games[0].blackName).toBeTruthy()
    })

    it('includes currentResult when a result has been entered', async () => {
      await pairNextRound(tournamentId)
      await setResult(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })

      const input = buildPairingsInput(tournamentId, 1)
      expect(input!.games[0].currentResult).toBe('WHITE_WIN')
    })

    it('omits currentResult when no result is entered', async () => {
      await pairNextRound(tournamentId)

      const input = buildPairingsInput(tournamentId, 1)
      expect(input!.games[0].currentResult).toBeUndefined()
    })
  })

  describe('buildAlphabeticalPairingsInput', () => {
    it('groups Schackfyran players by their school class (stored as club)', async () => {
      const t = service.tournaments.create({
        name: 'Schack4an',
        group: 'A',
        pairingSystem: 'Monrad',
        initialPairing: 'Rating',
        nrOfRounds: 4,
        barredPairing: false,
        compensateWeakPlayerPP: false,
        pointsPerGame: 4,
        chess4: true,
        ratingChoice: 'ELO',
        showELO: false,
        showGroup: false,
      })
      const club4A = service.clubs.create({ name: '4A' })
      const club4B = service.clubs.create({ name: '4B' })

      service.tournamentPlayers.add(t.id, {
        firstName: 'Anna',
        lastName: 'Andersson',
        clubIndex: club4A.id,
        ratingI: 1000,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Bo',
        lastName: 'Björk',
        clubIndex: club4A.id,
        ratingI: 1000,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Cilla',
        lastName: 'Carlsson',
        clubIndex: club4B.id,
        ratingI: 1000,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Dan',
        lastName: 'Dahl',
        clubIndex: club4B.id,
        ratingI: 1000,
      })

      await pairNextRound(t.id)

      const input = buildAlphabeticalPairingsInput(t.id, 1)
      expect(input).not.toBeNull()
      expect(input!.classes.map((c) => c.className)).toEqual(['4A', '4B'])
    })

    it('groups non-chess4 players by club so the per-page handout works', async () => {
      const lund = service.clubs.create({ name: 'SK Lund' })
      const malmo = service.clubs.create({ name: 'Malmö SS' })
      // Overwrite the beforeEach seeds with clubbed players.
      const t = service.tournaments.create({
        name: 'Klubbturnering',
        group: 'A',
        pairingSystem: 'Monrad',
        initialPairing: 'Rating',
        nrOfRounds: 4,
        barredPairing: false,
        compensateWeakPlayerPP: false,
        pointsPerGame: 1,
        chess4: false,
        ratingChoice: 'ELO',
        showELO: true,
        showGroup: true,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Anna',
        lastName: 'Andersson',
        clubIndex: lund.id,
        ratingI: 1800,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Bo',
        lastName: 'Björk',
        clubIndex: malmo.id,
        ratingI: 1700,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Cilla',
        lastName: 'Carlsson',
        clubIndex: lund.id,
        ratingI: 1600,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Dan',
        lastName: 'Dahl',
        clubIndex: malmo.id,
        ratingI: 1500,
      })

      await pairNextRound(t.id)

      const input = buildAlphabeticalPairingsInput(t.id, 1)
      expect(input!.classes.map((c) => c.className)).toEqual(['Malmö SS', 'SK Lund'])
    })

    it('exposes the actual game board number, not the seeding lot number', async () => {
      // 4 players in Monrad → 2 games on boards 1 and 2, but lotNrs run 1..4.
      // Lower-seeded players will have lotNr (3 or 4) ≠ their actual boardNr.
      service.tournamentPlayers.add(tournamentId, {
        lastName: 'Carlsson',
        firstName: 'Cilla',
        ratingI: 1600,
      })
      service.tournamentPlayers.add(tournamentId, {
        lastName: 'Dahl',
        firstName: 'Dan',
        ratingI: 1500,
      })

      await pairNextRound(tournamentId)
      const round = service.games.getRound(tournamentId, 1)!

      const expectedBoardByName = new Map<string, number>()
      for (const g of round.games) {
        if (g.whitePlayer) expectedBoardByName.set(g.whitePlayer.name, g.boardNr)
        if (g.blackPlayer) expectedBoardByName.set(g.blackPlayer.name, g.boardNr)
      }

      const input = buildAlphabeticalPairingsInput(tournamentId, 1)!
      const allPlayers = input.classes.flatMap((c) => c.players)
      expect(allPlayers).toHaveLength(4)

      for (const p of allPlayers) {
        const fullName = `${p.firstName} ${p.lastName}`
        expect(p.boardNr).toBe(expectedBoardByName.get(fullName))
      }
    })

    it('sorts players within a class by first name, not last name', async () => {
      const t = service.tournaments.create({
        name: 'Schack4an',
        group: 'A',
        pairingSystem: 'Monrad',
        initialPairing: 'Rating',
        nrOfRounds: 4,
        barredPairing: false,
        compensateWeakPlayerPP: false,
        pointsPerGame: 4,
        chess4: true,
        ratingChoice: 'ELO',
        showELO: false,
        showGroup: false,
      })
      const club = service.clubs.create({ name: '4A' })

      service.tournamentPlayers.add(t.id, {
        firstName: 'Björn',
        lastName: 'Andersson',
        clubIndex: club.id,
        ratingI: 1000,
      })
      service.tournamentPlayers.add(t.id, {
        firstName: 'Adam',
        lastName: 'Öberg',
        clubIndex: club.id,
        ratingI: 1000,
      })

      await pairNextRound(t.id)

      const input = buildAlphabeticalPairingsInput(t.id, 1)
      const firstNames = input!.classes[0].players.map((p) => p.firstName)
      expect(firstNames).toEqual(['Adam', 'Björn'])
    })
  })

  describe('buildStandingsInput', () => {
    it('returns null when tournament does not exist', async () => {
      expect(await buildStandingsInput(999, 1)).toBeNull()
    })

    it('builds standings input after a round with results', async () => {
      await pairNextRound(tournamentId)
      await setResult(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })

      const input = await buildStandingsInput(tournamentId, 1)
      expect(input).not.toBeNull()
      expect(input!.tournamentName).toBe('Testturneringen')
      expect(input!.roundNr).toBe(1)
      expect(input!.showELO).toBe(true)
      expect(input!.standings).toHaveLength(2)
      expect(input!.standings[0].place).toBeDefined()
      expect(input!.standings[0].name).toBeTruthy()
      expect(input!.standings[0].scoreDisplay).toBeTruthy()
    })
  })
})
