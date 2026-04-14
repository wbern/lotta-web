import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateClubCode } from '../domain/club-codes'
import type { DataProvider } from './data-provider'
import {
  clearAllPeerPermissions,
  createFullPermissions,
  createP2pClientProvider,
  createViewPermissions,
  setPeerAuthorizedClubs,
  setPeerPermissions,
  startP2pRpcServer,
} from './p2p-data-provider'

function createMockService() {
  let rpcResponseHandler: ((res: { id: number; result?: unknown; error?: string }) => void) | null =
    null

  return {
    sendRpcRequest: vi.fn(),
    set onRpcResponse(cb: typeof rpcResponseHandler) {
      rpcResponseHandler = cb
    },
    get onRpcResponse() {
      return rpcResponseHandler
    },
    _simulateResponse(res: { id: number; result?: unknown; error?: string }) {
      rpcResponseHandler?.(res)
    },
  }
}

describe('createP2pClientProvider', () => {
  it('sends RPC request via service and resolves with response', async () => {
    const service = createMockService()
    const provider = createP2pClientProvider(service)

    const promise = provider.tournaments.create({
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
      showGroup: false,
    })

    expect(service.sendRpcRequest).toHaveBeenCalledTimes(1)
    const sentReq = service.sendRpcRequest.mock.calls[0][0]
    expect(sentReq.method).toBe('tournaments.create')

    service._simulateResponse({ id: sentReq.id, result: { id: 1, name: 'Test' } })

    const result = await promise
    expect(result).toEqual({ id: 1, name: 'Test' })
  })
})

function createMockServerService() {
  let rpcRequestHandler:
    | ((req: { id: number; method: string; args: unknown[] }, peerId: string) => void)
    | null = null

  return {
    sendRpcResponse: vi.fn(),
    set onRpcRequest(cb: typeof rpcRequestHandler) {
      rpcRequestHandler = cb
    },
    get onRpcRequest() {
      return rpcRequestHandler
    },
    _simulateRequest(req: { id: number; method: string; args: unknown[] }, peerId: string) {
      rpcRequestHandler?.(req, peerId)
    },
  }
}

describe('round-trip: client + server over simulated P2P', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('client calls provider method and gets result via server dispatch', async () => {
    // Simulate the P2P link: client sends → server receives, server sends → client receives
    let serverOnRequest:
      | ((req: { id: number; method: string; args: unknown[] }, peerId: string) => void)
      | null = null
    let clientOnResponse: ((res: { id: number; result?: unknown; error?: string }) => void) | null =
      null

    const clientService = {
      sendRpcRequest: vi.fn((req: { id: number; method: string; args: unknown[] }) => {
        // Simulate network: forward to server
        serverOnRequest?.(req, 'client-peer')
      }),
      onRpcResponse: null as typeof clientOnResponse,
    }

    const serverService = {
      sendRpcResponse: vi.fn((res: { id: number; result?: unknown; error?: string }) => {
        // Simulate network: forward to client
        clientOnResponse?.(res)
      }),
      set onRpcRequest(cb: typeof serverOnRequest) {
        serverOnRequest = cb
      },
      get onRpcRequest() {
        return serverOnRequest
      },
    }

    const mockProvider: DataProvider = {
      tournaments: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 99, name: 'Remote Tournament' }),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    // Wire up server
    startP2pRpcServer(serverService, mockProvider)
    setPeerPermissions('client-peer', { ...createFullPermissions(), 'tournaments.create': true })

    // Wire up client — must capture onRpcResponse AFTER createP2pClientProvider sets it
    const clientProvider = createP2pClientProvider(clientService)
    clientOnResponse = clientService.onRpcResponse

    // Call through the client provider
    const result = await clientProvider.tournaments.create({
      name: 'Remote Tournament',
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
      showGroup: false,
    })

    expect(result).toEqual({ id: 99, name: 'Remote Tournament' })
    expect(mockProvider.tournaments.create).toHaveBeenCalledWith({
      name: 'Remote Tournament',
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
      showGroup: false,
    })
  })
})

describe('startP2pRpcServer', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('dispatches RPC request to provider and sends response', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 1, name: 'Created' }),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'tournaments.create': true })

    service._simulateRequest(
      { id: 42, method: 'tournaments.create', args: [{ name: 'Created' }] },
      'peer-1',
    )

    // Wait for async dispatch
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 42, result: { id: 1, name: 'Created' } },
        'peer-1',
      )
    })
  })

  it('calls onMutation after a write operation succeeds', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1 }),
        create: vi.fn().mockResolvedValue({ id: 1, name: 'New' }),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn().mockResolvedValue({}) },
      standings: { get: vi.fn() },
    }

    const onMutation = vi.fn()
    startP2pRpcServer(service, provider, { onMutation })
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'tournaments.create': true })

    // A mutation (create) should trigger onMutation
    service._simulateRequest(
      { id: 1, method: 'tournaments.create', args: [{ name: 'New' }] },
      'peer-1',
    )
    await vi.waitFor(() => {
      expect(onMutation).toHaveBeenCalledTimes(1)
    })

    // A read (list) should NOT trigger onMutation
    service._simulateRequest({ id: 2, method: 'tournaments.list', args: [] }, 'peer-1')
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(2)
    })
    expect(onMutation).toHaveBeenCalledTimes(1) // Still 1
  })

  it('dispatches commands.setResult through the command handler', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: {
        set: vi.fn().mockResolvedValue({ boardNr: 1, resultType: 'WHITE_WIN' }),
      },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createFullPermissions())

    service._simulateRequest(
      {
        id: 10,
        method: 'commands.setResult',
        args: [
          {
            tournamentId: 1,
            roundNr: 1,
            boardNr: 1,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        ],
      },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 10, result: { status: 'applied' } },
        'peer-1',
      )
    })
    expect(provider.results.set).toHaveBeenCalledWith(1, 1, 1, { resultType: 'WHITE_WIN' })
  })

  it('allows read methods for peers without explicit permissions (fallback)', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: {
        list: vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }]),
        get: vi.fn(),
        create: vi.fn(),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    // No explicit permissions set for peer-1 — fallback allows reads

    service._simulateRequest({ id: 30, method: 'tournaments.list', args: [] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 30, result: [{ id: 1, name: 'Test' }] },
        'peer-1',
      )
    })
  })

  it('rejects commands.setResult when peer has view-only permissions', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest(
      {
        id: 21,
        method: 'commands.setResult',
        args: [
          {
            tournamentId: 1,
            roundNr: 1,
            boardNr: 1,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        ],
      },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 21, error: 'Permission denied: commands.setResult' },
        'peer-1',
      )
    })
    expect(provider.results.set).not.toHaveBeenCalled()
  })

  it('rejects methods not in peer permissions', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    // tournaments.create is not in view permissions — should be rejected
    service._simulateRequest(
      { id: 20, method: 'tournaments.create', args: [{ name: 'Hacked' }] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 20, error: 'Permission denied: tournaments.create' },
        'peer-1',
      )
    })
    expect(provider.tournaments.create).not.toHaveBeenCalled()
  })

  it('filters rounds.get games to authorized clubs and redacts opponent names for view peers', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 3,
          games: [
            {
              boardNr: 1,
              roundNr: 1,
              whitePlayer: {
                id: 1,
                name: 'Linnea Jonsson',
                club: 'Club A',
                rating: 1500,
                lotNr: 1,
              },
              blackPlayer: {
                id: 2,
                name: 'Anna Karlsson',
                club: 'Club B',
                rating: 1500,
                lotNr: 2,
              },
              resultType: 'NO_RESULT' as const,
              whiteScore: 0,
              blackScore: 0,
              resultDisplay: '',
            },
            {
              boardNr: 2,
              roundNr: 1,
              whitePlayer: {
                id: 3,
                name: 'Olof Svensson',
                club: 'Club C',
                rating: 1500,
                lotNr: 3,
              },
              blackPlayer: {
                id: 4,
                name: 'Per Olsson',
                club: 'Club D',
                rating: 1500,
                lotNr: 4,
              },
              resultType: 'NO_RESULT' as const,
              whiteScore: 0,
              blackScore: 0,
              resultDisplay: '',
            },
            {
              boardNr: 3,
              roundNr: 1,
              whitePlayer: {
                id: 5,
                name: 'Eva Andersson',
                club: 'Club A',
                rating: 1500,
                lotNr: 5,
              },
              blackPlayer: {
                id: 6,
                name: 'Sara Berg',
                club: 'Club A',
                rating: 1500,
                lotNr: 6,
              },
              resultType: 'NO_RESULT' as const,
              whiteScore: 0,
              blackScore: 0,
              resultDisplay: '',
            },
          ],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 61, method: 'rounds.get', args: [1, 1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 61,
          result: {
            roundNr: 1,
            hasAllResults: false,
            gameCount: 2,
            games: [
              {
                boardNr: 1,
                roundNr: 1,
                whitePlayer: {
                  id: 1,
                  name: 'Linnea Jonsson',
                  club: 'Club A',
                  rating: 1500,
                  lotNr: 1,
                },
                blackPlayer: {
                  id: 2,
                  name: 'Anna',
                  club: null,
                  rating: 1500,
                  lotNr: 2,
                },
                resultType: 'NO_RESULT',
                whiteScore: 0,
                blackScore: 0,
                resultDisplay: '',
              },
              {
                boardNr: 3,
                roundNr: 1,
                whitePlayer: {
                  id: 5,
                  name: 'Eva Andersson',
                  club: 'Club A',
                  rating: 1500,
                  lotNr: 5,
                },
                blackPlayer: {
                  id: 6,
                  name: 'Sara Berg',
                  club: 'Club A',
                  rating: 1500,
                  lotNr: 6,
                },
                resultType: 'NO_RESULT',
                whiteScore: 0,
                blackScore: 0,
                resultDisplay: '',
              },
            ],
          },
        },
        'peer-1',
      )
    })
  })

  it('returns empty games for rounds.get to view peers with no club authorization', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 2,
          games: [
            {
              boardNr: 1,
              roundNr: 1,
              whitePlayer: {
                id: 1,
                name: 'Linnea Jonsson',
                club: 'Club A',
                rating: 1500,
                lotNr: 1,
              },
              blackPlayer: {
                id: 2,
                name: 'Anna Jonsson',
                club: 'Club B',
                rating: 1500,
                lotNr: 2,
              },
              resultType: 'NO_RESULT' as const,
              whiteScore: 0,
              blackScore: 0,
              resultDisplay: '',
            },
          ],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 60, method: 'rounds.get', args: [1, 1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 60,
          result: { roundNr: 1, hasAllResults: false, gameCount: 0, games: [] },
        },
        'peer-1',
      )
    })
  })

  it('filters tournamentPlayers.list to authorized clubs for view peers', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Jonsson', club: 'Club B' },
          { id: 3, firstName: 'Eva', lastName: 'Andersson', club: 'Club A' },
        ]),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 52, method: 'tournamentPlayers.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 52,
          result: [
            { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
            { id: 3, firstName: 'Eva', lastName: 'Andersson', club: 'Club A' },
          ],
        },
        'peer-1',
      )
    })
  })

  it('returns empty tournamentPlayers.list to view peers with no club authorization', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Jonsson', club: 'Club B' },
        ]),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 50, method: 'tournamentPlayers.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith({ id: 50, result: [] }, 'peer-1')
    })
  })

  it('rejects standings.get for peers with view-only permissions', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 40, method: 'standings.get', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 40, error: 'Permission denied: standings.get' },
        'peer-1',
      )
    })
    expect(provider.standings.get).not.toHaveBeenCalled()
  })

  it('allows commands.setResult for peers with full permissions', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: {
        set: vi.fn().mockResolvedValue({ boardNr: 1, resultType: 'WHITE_WIN' }),
      },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createFullPermissions())

    service._simulateRequest(
      {
        id: 25,
        method: 'commands.setResult',
        args: [
          {
            tournamentId: 1,
            roundNr: 1,
            boardNr: 1,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        ],
      },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 25, result: { status: 'applied' } },
        'peer-1',
      )
    })
    expect(provider.results.set).toHaveBeenCalled()
  })

  it('returns conflict from commands.setResult when expectedPrior mismatches', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn(),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'BLACK_WIN' }],
        }),
        pairNext: vi.fn(),
        unpairLast: vi.fn(),
      },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createFullPermissions())

    service._simulateRequest(
      {
        id: 11,
        method: 'commands.setResult',
        args: [
          {
            tournamentId: 1,
            roundNr: 1,
            boardNr: 1,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        ],
      },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 11, result: { status: 'conflict', current: 'BLACK_WIN' } },
        'peer-1',
      )
    })
    expect(provider.results.set).not.toHaveBeenCalled()
  })

  it('auth.redeemClubCode authorizes the peer when code is valid', async () => {
    const service = createMockServerService()
    const provider: DataProvider = {
      tournaments: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Karlsson', club: 'Club B' },
        ]),
        add: vi.fn(),
        addMany: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        removeMany: vi.fn(),
      },
      rounds: { list: vi.fn(), get: vi.fn(), pairNext: vi.fn(), unpairLast: vi.fn() },
      results: { set: vi.fn() },
      standings: { get: vi.fn() },
    }

    const allClubs = ['Club A', 'Club B']
    const secret = 'host-session-secret-xyz'
    const code = generateClubCode(['Club A'], allClubs, secret)

    startP2pRpcServer(service, provider, {
      clubCodeSecret: secret,
      getAllClubEntries: () => allClubs,
    })
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 70, method: 'auth.redeemClubCode', args: [code] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 70, result: { status: 'ok', clubs: ['Club A'] } },
        'peer-1',
      )
    })

    // After redemption, the peer should see players filtered to Club A
    service._simulateRequest({ id: 71, method: 'tournamentPlayers.list', args: [1] }, 'peer-1')
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 71,
          result: [{ id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' }],
        },
        'peer-1',
      )
    })
  })
})
