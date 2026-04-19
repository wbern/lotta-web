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
