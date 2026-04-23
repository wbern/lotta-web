import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as p2pProvider from '../services/p2p-provider.ts'
import type { PageUpdateMessage, ResultSubmitMessage } from '../types/p2p.ts'
import { setLiveContext } from './live-context.ts'
import {
  broadcastAfterPairing,
  broadcastAfterRestore,
  broadcastAfterResultChange,
  handleResultSubmission,
  sendCurrentStateToPeer,
} from './p2p-broadcast.ts'

const mockBroadcastPageUpdate = vi.fn()
const mockSendPageUpdateTo = vi.fn()
const mockSendResultAck = vi.fn()
const mockIsPeerVerifiedReferee = vi.fn()

vi.mock('../services/p2p-provider.ts', () => ({
  getP2PService: vi.fn(() => ({
    connectionState: 'connected',
    broadcastPageUpdate: mockBroadcastPageUpdate,
    sendPageUpdateTo: mockSendPageUpdateTo,
    sendResultAck: mockSendResultAck,
    isPeerVerifiedReferee: mockIsPeerVerifiedReferee,
    role: 'organizer',
  })),
}))

vi.mock('../domain/html-publisher.ts', () => ({
  publishPairings: (input: { tournamentName: string }) =>
    `<html>${input.tournamentName} pairings</html>`,
  publishStandings: (input: { tournamentName: string }) =>
    `<html>${input.tournamentName} standings</html>`,
  publishRefereePairings: (input: { tournamentName: string }) =>
    `<html>${input.tournamentName} referee pairings</html>`,
}))

const mockGetDatabaseService = vi.fn()
vi.mock('./service-provider.ts', () => ({
  getDatabaseService: () => mockGetDatabaseService(),
}))

const mockGetStandings = vi.fn()
vi.mock('./standings.ts', () => ({
  getStandings: (...args: unknown[]) => mockGetStandings(...args),
}))

const mockSetResult = vi.fn()
vi.mock('./results.ts', () => ({
  setResult: (...args: unknown[]) => mockSetResult(...args),
}))

function createMockDb(overrides?: {
  tournamentName?: string
  roundNr?: number
  showELO?: boolean
  selectedTiebreaks?: string[]
  games?: {
    boardNr: number
    whitePlayer: { name: string } | null
    blackPlayer: { name: string } | null
    resultDisplay: string
  }[]
}) {
  const tournamentName = overrides?.tournamentName ?? 'Test Tournament'
  const roundNr = overrides?.roundNr ?? 1
  const games = overrides?.games ?? [
    { boardNr: 1, whitePlayer: { name: 'Alice' }, blackPlayer: { name: 'Bob' }, resultDisplay: '' },
  ]
  return {
    tournaments: {
      get: vi.fn(() => ({
        name: tournamentName,
        showELO: overrides?.showELO ?? false,
        selectedTiebreaks: overrides?.selectedTiebreaks ?? [],
      })),
    },
    games: {
      listRounds: vi.fn(() => [{ roundNr }]),
      getRound: vi.fn(() => ({ roundNr, games })),
    },
    tournamentPlayers: { list: vi.fn(() => []) },
    settings: { get: vi.fn(() => ({ playerPresentation: 'FIRST_LAST' })) },
    clubs: { list: vi.fn(() => []) },
  }
}

describe('P2P broadcast guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when P2P is disconnected', async () => {
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'disconnected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)

    const db = createMockDb()
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await broadcastAfterResultChange(1, 1)

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when role is viewer (not organizer)', async () => {
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      role: 'viewer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)

    const db = createMockDb()
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await broadcastAfterResultChange(1, 1)

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })
})

describe('broadcastAfterResultChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      sendPageUpdateTo: mockSendPageUpdateTo,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)
  })

  it('broadcasts pairings, referee pairings, and standings after a result change', async () => {
    const db = createMockDb({ tournamentName: 'Spring Open' })
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await broadcastAfterResultChange(1, 1)

    expect(mockBroadcastPageUpdate).toHaveBeenCalledTimes(3)
    const pageTypes = mockBroadcastPageUpdate.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).pageType,
    )
    expect(pageTypes).toContain('pairings')
    expect(pageTypes).toContain('refereePairings')
    expect(pageTypes).toContain('standings')
  })

  it('does nothing when P2P is not active', async () => {
    vi.mocked(p2pProvider.getP2PService).mockImplementation(() => {
      throw new Error('P2PService not initialized')
    })

    await broadcastAfterResultChange(1, 1)

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })

  it('does not throw when tournament is not found', async () => {
    const db = createMockDb()
    db.tournaments.get.mockReturnValue(null as never)
    mockGetDatabaseService.mockReturnValue(db)

    await expect(broadcastAfterResultChange(999, 1)).resolves.not.toThrow()
    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })
})

describe('broadcastAfterPairing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      sendPageUpdateTo: mockSendPageUpdateTo,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)
  })

  it('broadcasts pairings and referee pairings for the new round', async () => {
    const db = createMockDb({ tournamentName: 'Cup', roundNr: 2 })
    mockGetDatabaseService.mockReturnValue(db)

    await broadcastAfterPairing(1, 2)

    expect(mockBroadcastPageUpdate).toHaveBeenCalledTimes(2)
    const pageTypes = mockBroadcastPageUpdate.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).pageType,
    )
    expect(pageTypes).toContain('pairings')
    expect(pageTypes).toContain('refereePairings')
    expect(mockBroadcastPageUpdate.mock.calls[0][0].roundNr).toBe(2)
  })
})

describe('sendCurrentStateToPeer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      sendPageUpdateTo: mockSendPageUpdateTo,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)
  })

  it('sends pairings and standings to a specific peer', async () => {
    const db = createMockDb({ tournamentName: 'Sync Test' })
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await sendCurrentStateToPeer('new-peer', 1, 1)

    expect(mockSendPageUpdateTo).toHaveBeenCalled()
    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()

    const pageTypes = mockSendPageUpdateTo.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).pageType,
    )
    expect(pageTypes).toContain('pairings')
    expect(pageTypes).toContain('refereePairings')
    expect(pageTypes).toContain('standings')

    const peerIds = mockSendPageUpdateTo.mock.calls.map((c: unknown[]) => c[1] as string)
    expect(peerIds.every((id: string) => id === 'new-peer')).toBe(true)
  })

  it('does nothing when P2P is not active', async () => {
    vi.mocked(p2pProvider.getP2PService).mockImplementation(() => {
      throw new Error('P2PService not initialized')
    })

    await sendCurrentStateToPeer('peer', 1, 1)

    expect(mockSendPageUpdateTo).not.toHaveBeenCalled()
  })
})

describe('broadcastAfterRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      sendPageUpdateTo: mockSendPageUpdateTo,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)
  })

  afterEach(() => {
    setLiveContext(null)
  })

  it('broadcasts pairings, referee pairings, and standings for the live round', async () => {
    setLiveContext({ tournamentId: 1, round: 2 })
    const db = createMockDb({ tournamentName: 'Restore Cup', roundNr: 2 })
    db.games.listRounds.mockReturnValue([{ roundNr: 1 }, { roundNr: 2 }] as never)
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await broadcastAfterRestore()

    expect(mockBroadcastPageUpdate).toHaveBeenCalledTimes(3)
    const pageTypes = mockBroadcastPageUpdate.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).pageType,
    )
    expect(pageTypes).toContain('pairings')
    expect(pageTypes).toContain('refereePairings')
    expect(pageTypes).toContain('standings')
    const rounds = mockBroadcastPageUpdate.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).roundNr,
    )
    expect(rounds.every((r: number) => r === 2)).toBe(true)
  })

  it('falls back to latest remaining round when snapshot removed the selected round', async () => {
    setLiveContext({ tournamentId: 1, round: 3 })
    const db = createMockDb({ tournamentName: 'Rollback', roundNr: 2 })
    db.games.listRounds.mockReturnValue([{ roundNr: 1 }, { roundNr: 2 }] as never)
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await broadcastAfterRestore()

    expect(mockBroadcastPageUpdate).toHaveBeenCalled()
    const rounds = mockBroadcastPageUpdate.mock.calls.map(
      (c: unknown[]) => (c[0] as PageUpdateMessage).roundNr,
    )
    expect(rounds.every((r: number) => r === 2)).toBe(true)
  })

  it('does nothing when live context is not set', async () => {
    setLiveContext(null)
    const db = createMockDb()
    mockGetDatabaseService.mockReturnValue(db)

    await broadcastAfterRestore()

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when the tournament has no rounds', async () => {
    setLiveContext({ tournamentId: 1, round: null })
    const db = createMockDb()
    db.games.listRounds.mockReturnValue([] as never)
    mockGetDatabaseService.mockReturnValue(db)

    await broadcastAfterRestore()

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when P2P is not active', async () => {
    setLiveContext({ tournamentId: 1, round: 1 })
    vi.mocked(p2pProvider.getP2PService).mockImplementation(() => {
      throw new Error('P2PService not initialized')
    })

    await broadcastAfterRestore()

    expect(mockBroadcastPageUpdate).not.toHaveBeenCalled()
  })
})

describe('handleResultSubmission', () => {
  const baseMsg: ResultSubmitMessage = {
    tournamentId: 1,
    roundNr: 2,
    boardNr: 3,
    resultType: 'WHITE_WIN',
    refereeName: 'Anna',
    timestamp: Date.now(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPeerVerifiedReferee.mockReturnValue(true)
    vi.mocked(p2pProvider.getP2PService).mockReturnValue({
      connectionState: 'connected',
      broadcastPageUpdate: mockBroadcastPageUpdate,
      sendPageUpdateTo: mockSendPageUpdateTo,
      sendResultAck: mockSendResultAck,
      isPeerVerifiedReferee: mockIsPeerVerifiedReferee,
      role: 'organizer',
    } as unknown as ReturnType<typeof p2pProvider.getP2PService>)
  })

  it('rejects result submission from unverified peer', async () => {
    mockIsPeerVerifiedReferee.mockReturnValue(false)

    await handleResultSubmission(baseMsg, 'unknown-peer')

    expect(mockSetResult).not.toHaveBeenCalled()
    expect(mockSendResultAck).toHaveBeenCalledWith(
      expect.objectContaining({
        boardNr: 3,
        roundNr: 2,
        accepted: false,
        reason: 'Not authorized',
      }),
      'unknown-peer',
    )
  })

  it('applies the result via setResult and sends accepted ack', async () => {
    mockSetResult.mockResolvedValue({ boardNr: 3, resultDisplay: '1-0' })
    const db = createMockDb()
    mockGetDatabaseService.mockReturnValue(db)
    mockGetStandings.mockResolvedValue([])

    await handleResultSubmission(baseMsg, 'referee-peer')

    expect(mockSetResult).toHaveBeenCalledWith(1, 2, 3, { resultType: 'WHITE_WIN' })
    expect(mockSendResultAck).toHaveBeenCalledWith(
      expect.objectContaining({
        boardNr: 3,
        roundNr: 2,
        accepted: true,
      }),
      'referee-peer',
    )
  })

  it('sends rejected ack when setResult throws', async () => {
    mockSetResult.mockRejectedValue(new Error('Board not found'))

    await handleResultSubmission(baseMsg, 'referee-peer')

    expect(mockSendResultAck).toHaveBeenCalledWith(
      expect.objectContaining({
        boardNr: 3,
        roundNr: 2,
        accepted: false,
        reason: 'Board not found',
      }),
      'referee-peer',
    )
  })

  it('sends rejected ack with "Unknown error" when non-Error is thrown', async () => {
    mockSetResult.mockRejectedValue('string error')

    await handleResultSubmission(baseMsg, 'referee-peer')

    expect(mockSendResultAck).toHaveBeenCalledWith(
      expect.objectContaining({
        boardNr: 3,
        roundNr: 2,
        accepted: false,
        reason: 'Unknown error',
      }),
      'referee-peer',
    )
  })

  it('calls setResult which triggers broadcast internally', async () => {
    mockSetResult.mockResolvedValue({ boardNr: 3, resultDisplay: '1-0' })

    await handleResultSubmission(baseMsg, 'referee-peer')

    // setResult() internally calls broadcastAfterResultChange — verify it was called with correct args
    expect(mockSetResult).toHaveBeenCalledWith(1, 2, 3, { resultType: 'WHITE_WIN' })
  })
})
