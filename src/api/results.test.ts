import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as activeProviderModule from './active-provider'
import type { DataProvider } from './data-provider'
import { createLocalProvider } from './local-data-provider'
import { ResultConflictError } from './result-command'
import { setResult as apiSetResult } from './results'
import { PROVIDERS } from './test-providers'

describe.each(PROVIDERS)('results API (%s)', (_name, factory) => {
  let provider: DataProvider
  let teardown: () => Promise<void>
  let tournamentId: number

  beforeEach(async () => {
    const setup = await factory()
    provider = setup.provider
    teardown = setup.teardown

    const t = await provider.tournaments.create({
      name: 'Test',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
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

    await provider.tournamentPlayers.add(tournamentId, {
      lastName: 'White',
      firstName: 'Player',
      ratingI: 1500,
    })
    await provider.tournamentPlayers.add(tournamentId, {
      lastName: 'Black',
      firstName: 'Player',
      ratingI: 1400,
    })

    await provider.rounds.pairNext(tournamentId)
  })

  afterEach(async () => {
    await teardown()
  })

  it('sets a result on a game', async () => {
    const game = await provider.results.set(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })
    expect(game.resultType).toBe('WHITE_WIN')
    expect(game.resultDisplay).toBe('1-0')
  })

  it('allows idempotent result set when current matches desired', async () => {
    await provider.results.set(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })

    const game = await provider.results.set(tournamentId, 1, 1, {
      resultType: 'WHITE_WIN',
      expectedPrior: 'WHITE_WIN',
    })
    expect(game.resultType).toBe('WHITE_WIN')
  })
})

describe('result conflict detection (local)', () => {
  let provider: DataProvider
  let teardown: () => Promise<void>
  let tournamentId: number

  beforeEach(async () => {
    const setup = await createLocalProvider()
    provider = setup.provider
    teardown = setup.teardown

    const t = await provider.tournaments.create({
      name: 'Conflict Test',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
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

    await provider.tournamentPlayers.add(tournamentId, {
      lastName: 'White',
      firstName: 'Player',
      ratingI: 1500,
    })
    await provider.tournamentPlayers.add(tournamentId, {
      lastName: 'Black',
      firstName: 'Player',
      ratingI: 1400,
    })

    await provider.rounds.pairNext(tournamentId)
  })

  afterEach(async () => {
    await teardown()
  })

  it('throws ResultConflictError when expectedPrior mismatches', async () => {
    await provider.results.set(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })

    await expect(
      provider.results.set(tournamentId, 1, 1, {
        resultType: 'BLACK_WIN',
        expectedPrior: 'NO_RESULT',
      }),
    ).rejects.toThrow(ResultConflictError)
  })

  it('includes current result in conflict error', async () => {
    await provider.results.set(tournamentId, 1, 1, { resultType: 'WHITE_WIN' })

    try {
      await provider.results.set(tournamentId, 1, 1, {
        resultType: 'BLACK_WIN',
        expectedPrior: 'NO_RESULT',
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ResultConflictError)
      expect((e as ResultConflictError).current).toBe('WHITE_WIN')
    }
  })
})

describe('client path with expectedPrior', () => {
  let spy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    spy?.mockRestore()
  })

  it('routes through commands.setResult RPC when expectedPrior is set', async () => {
    const mockCommandSetResult = vi.fn().mockResolvedValue({ status: 'applied' })
    const mockResultsSet = vi.fn()
    const mockRoundsGet = vi.fn().mockResolvedValue({
      roundNr: 1,
      hasAllResults: false,
      gameCount: 1,
      games: [{ boardNr: 1, resultType: 'WHITE_WIN', resultDisplay: '1-0' }],
    })

    spy = vi.spyOn(activeProviderModule, 'getActiveDataProvider').mockReturnValue({
      commands: { setResult: mockCommandSetResult },
      results: { set: mockResultsSet },
      rounds: { get: mockRoundsGet },
    } as never)

    await apiSetResult(1, 1, 1, { resultType: 'WHITE_WIN', expectedPrior: 'NO_RESULT' })

    expect(mockCommandSetResult).toHaveBeenCalledWith({
      tournamentId: 1,
      roundNr: 1,
      boardNr: 1,
      resultType: 'WHITE_WIN',
      expectedPrior: 'NO_RESULT',
    })
    expect(mockResultsSet).not.toHaveBeenCalled()
  })

  it('throws ResultConflictError on conflict from remote command', async () => {
    const mockCommandSetResult = vi.fn().mockResolvedValue({
      status: 'conflict',
      current: 'WHITE_WIN',
    })

    spy = vi.spyOn(activeProviderModule, 'getActiveDataProvider').mockReturnValue({
      commands: { setResult: mockCommandSetResult },
      results: { set: vi.fn() },
      rounds: { get: vi.fn() },
    } as never)

    await expect(
      apiSetResult(1, 1, 1, { resultType: 'BLACK_WIN', expectedPrior: 'NO_RESULT' }),
    ).rejects.toThrow(ResultConflictError)
  })

  it('falls through to plain results.set when no expectedPrior', async () => {
    const mockResultsSet = vi.fn().mockResolvedValue({
      boardNr: 1,
      resultType: 'WHITE_WIN',
      resultDisplay: '1-0',
    })

    spy = vi.spyOn(activeProviderModule, 'getDataProvider').mockReturnValue({
      results: { set: mockResultsSet },
      rounds: { get: vi.fn() },
    } as never)

    await apiSetResult(1, 1, 1, { resultType: 'WHITE_WIN' })

    expect(mockResultsSet).toHaveBeenCalledWith(1, 1, 1, { resultType: 'WHITE_WIN' })
  })
})
