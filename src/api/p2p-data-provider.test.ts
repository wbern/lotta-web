import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateClubCodeMap } from '../domain/club-codes'
import {
  clearAllPeerPermissions,
  clearPeerPermissions,
  createFullPermissions,
  createP2pClientProvider,
  createViewPermissions,
  setPeerAuthorizedClubs,
  setPeerPermissions,
  startP2pRpcServer,
} from './p2p-data-provider'
import { createMockProvider } from './test-mock-provider'

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

    const mockProvider = createMockProvider({
      tournaments: {
        create: vi.fn().mockResolvedValue({ id: 99, name: 'Remote Tournament' }),
      },
    })

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
    const provider = createMockProvider({
      tournaments: {
        create: vi.fn().mockResolvedValue({ id: 1, name: 'Created' }),
      },
    })

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
    const provider = createMockProvider({
      tournaments: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1 }),
        create: vi.fn().mockResolvedValue({ id: 1, name: 'New' }),
      },
      results: {
        set: vi.fn().mockResolvedValue({}),
      },
    })

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
    const provider = createMockProvider({
      rounds: {
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
      },
      results: {
        set: vi.fn().mockResolvedValue({ boardNr: 1, resultType: 'WHITE_WIN' }),
      },
    })

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

  it('denies all methods for peers without explicit permissions', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      tournaments: {
        list: vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }]),
      },
    })

    startP2pRpcServer(service, provider)
    // No explicit permissions set for peer-1

    service._simulateRequest({ id: 30, method: 'tournaments.list', args: [] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 30, error: 'Permission denied: tournaments.list' },
        'peer-1',
      )
    })
    expect(provider.tournaments.list).not.toHaveBeenCalled()
  })

  it('rejects commands.setResult when peer has view-only permissions', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
      },
    })

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
    const provider = createMockProvider({
      tournaments: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    })

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
    const provider = createMockProvider({
      rounds: {
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
      },
    })

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
    const provider = createMockProvider({
      rounds: {
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
      },
    })

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
    const provider = createMockProvider({
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Jonsson', club: 'Club B' },
          { id: 3, firstName: 'Eva', lastName: 'Andersson', club: 'Club A' },
        ]),
      },
    })

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
    const provider = createMockProvider({
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Jonsson', club: 'Club B' },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 50, method: 'tournamentPlayers.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith({ id: 50, result: [] }, 'peer-1')
    })
  })

  it('allows standings.get for peers with view-only permissions', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        get: vi.fn().mockResolvedValue([]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 40, method: 'standings.get', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith({ id: 40, result: [] }, 'peer-1')
    })
  })

  it('allows commands.setResult for peers with full permissions', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
      },
      results: {
        set: vi.fn().mockResolvedValue({ boardNr: 1, resultType: 'WHITE_WIN' }),
      },
    })

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

  it('rejects commands.setResult after the peer permissions have been cleared', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'NO_RESULT' }],
        }),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createFullPermissions())
    clearPeerPermissions('peer-1')

    service._simulateRequest(
      {
        id: 26,
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
        { id: 26, error: 'Permission denied: commands.setResult' },
        'peer-1',
      )
    })
    expect(provider.results.set).not.toHaveBeenCalled()
  })

  it('returns conflict from commands.setResult when expectedPrior mismatches', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        get: vi.fn().mockResolvedValue({
          roundNr: 1,
          hasAllResults: false,
          gameCount: 1,
          games: [{ boardNr: 1, resultType: 'BLACK_WIN' }],
        }),
      },
    })

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
    const provider = createMockProvider({
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Linnea', lastName: 'Jonsson', club: 'Club A' },
          { id: 2, firstName: 'Anna', lastName: 'Karlsson', club: 'Club B' },
        ]),
      },
    })

    const allClubs = ['Club A', 'Club B']
    const secret = 'host-session-secret-xyz'
    const code = generateClubCodeMap(allClubs, secret)['Club A']

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

  it('view-role peers see unfiltered data when clubFilterEnabled is false', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      tournamentPlayers: {
        list: vi.fn().mockResolvedValue([
          { id: 1, firstName: 'Anna', lastName: 'S', club: 'Club A' },
          { id: 2, firstName: 'Erik', lastName: 'J', club: 'Club B' },
        ]),
      },
    })

    startP2pRpcServer(service, provider, { clubFilterEnabled: false })
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 100, method: 'tournamentPlayers.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 100,
          result: [
            { id: 1, firstName: 'Anna', lastName: 'S', club: 'Club A' },
            { id: 2, firstName: 'Erik', lastName: 'J', club: 'Club B' },
          ],
        },
        'peer-1',
      )
    })
  })

  it('auth.redeemClubCode accumulates clubs across multiple redemptions on the same peer', async () => {
    const service = createMockServerService()
    const provider = createMockProvider()

    const allClubs = ['Club A', 'Club B', 'Club C']
    const secret = 'accum-secret'
    const map = generateClubCodeMap(allClubs, secret)

    startP2pRpcServer(service, provider, {
      clubCodeSecret: secret,
      getAllClubEntries: () => allClubs,
    })
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest(
      { id: 90, method: 'auth.redeemClubCode', args: [map['Club A']] },
      'peer-1',
    )
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 90, result: { status: 'ok', clubs: ['Club A'] } },
        'peer-1',
      )
    })

    service._simulateRequest(
      { id: 91, method: 'auth.redeemClubCode', args: [map['Club C']] },
      'peer-1',
    )
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 91, result: { status: 'ok', clubs: ['Club A', 'Club C'] } },
        'peer-1',
      )
    })
  })

  it('auth.redeemClubCode resolves a per-club code from the code map', async () => {
    const service = createMockServerService()
    const provider = createMockProvider()

    const allClubs = ['Club A', 'Club B', 'Club C']
    const secret = 'map-secret'
    const map = generateClubCodeMap(allClubs, secret)
    const codeForClubB = map['Club B']

    startP2pRpcServer(service, provider, {
      clubCodeSecret: secret,
      getAllClubEntries: () => allClubs,
    })
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest(
      { id: 80, method: 'auth.redeemClubCode', args: [codeForClubB] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 80, result: { status: 'ok', clubs: ['Club B'] } },
        'peer-1',
      )
    })
  })
})

describe('view-scoped filtering across all view methods', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  const pA = {
    id: 1,
    name: 'Anna Andersson',
    club: 'Club A',
    rating: 1500,
    lotNr: 1,
  }
  const pB = {
    id: 2,
    name: 'Bo Berg',
    club: 'Club B',
    rating: 1500,
    lotNr: 2,
  }
  const baseGame = {
    resultType: 'NO_RESULT' as const,
    whiteScore: 0,
    blackScore: 0,
    resultDisplay: '',
  }

  it('rounds.list filters games per round to authorized clubs and redacts opponents', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        list: vi.fn().mockResolvedValue([
          {
            roundNr: 1,
            hasAllResults: false,
            gameCount: 1,
            games: [{ boardNr: 1, roundNr: 1, whitePlayer: pA, blackPlayer: pB, ...baseGame }],
          },
          {
            roundNr: 2,
            hasAllResults: false,
            gameCount: 1,
            games: [
              {
                boardNr: 1,
                roundNr: 2,
                whitePlayer: { ...pB, id: 3 },
                blackPlayer: { ...pB, id: 4 },
                ...baseGame,
              },
            ],
          },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 200, method: 'rounds.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    const response = service.sendRpcResponse.mock.calls[0][0]
    expect(response.id).toBe(200)
    const rounds = response.result as Array<{
      roundNr: number
      gameCount: number
      games: Array<{ blackPlayer: { name: string; club: string | null } | null }>
    }>
    expect(rounds).toHaveLength(2)
    expect(rounds[0].gameCount).toBe(1)
    expect(rounds[0].games[0].blackPlayer).toEqual({
      id: 2,
      name: 'Bo',
      club: null,
      rating: 1500,
      lotNr: 2,
    })
    expect(rounds[1].gameCount).toBe(0)
    expect(rounds[1].games).toEqual([])
  })

  it('rounds.list returns empty-games rounds when peer has no club authorization', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
        list: vi.fn().mockResolvedValue([
          {
            roundNr: 1,
            hasAllResults: false,
            gameCount: 1,
            games: [{ boardNr: 1, roundNr: 1, whitePlayer: pA, blackPlayer: pB, ...baseGame }],
          },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 201, method: 'rounds.list', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 201,
          result: [{ roundNr: 1, hasAllResults: false, gameCount: 0, games: [] }],
        },
        'peer-1',
      )
    })
  })

  it('standings.get filters to rows whose club is authorized', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        get: vi.fn().mockResolvedValue([
          {
            place: 1,
            name: 'Anna',
            playerGroup: '',
            club: 'Club A',
            rating: 1500,
            score: 2,
            scoreDisplay: '2',
            tiebreaks: {},
          },
          {
            place: 2,
            name: 'Bo',
            playerGroup: '',
            club: 'Club B',
            rating: 1500,
            score: 1,
            scoreDisplay: '1',
            tiebreaks: {},
          },
          {
            place: 3,
            name: 'Cleo',
            playerGroup: '',
            club: null,
            rating: 1500,
            score: 0,
            scoreDisplay: '0',
            tiebreaks: {},
          },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 210, method: 'standings.get', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    const response = service.sendRpcResponse.mock.calls[0][0]
    expect(response.id).toBe(210)
    expect((response.result as Array<{ club: string | null }>).map((r) => r.club)).toEqual([
      'Club A',
    ])
  })

  it('standings.getClub filters to authorized clubs', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        getClub: vi.fn().mockResolvedValue([
          { place: 1, club: 'Club A', score: 5 },
          { place: 2, club: 'Club B', score: 3 },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 220, method: 'standings.getClub', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 220, result: [{ place: 1, club: 'Club A', score: 5 }] },
        'peer-1',
      )
    })
  })

  it('standings.getChess4 filters to authorized clubs', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        getChess4: vi.fn().mockResolvedValue([
          { place: 1, club: 'Club A', playerCount: 4, chess4Members: 4, score: 10 },
          { place: 2, club: 'Club B', playerCount: 4, chess4Members: 4, score: 8 },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 230, method: 'standings.getChess4', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 230,
          result: [{ place: 1, club: 'Club A', playerCount: 4, chess4Members: 4, score: 10 }],
        },
        'peer-1',
      )
    })
  })

  it('clubs.list filters to authorized clubs', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      clubs: {
        list: vi.fn().mockResolvedValue([
          { id: 1, name: 'Club A', chess4Members: 4 },
          { id: 2, name: 'Club B', chess4Members: 4 },
          { id: 3, name: 'Club C', chess4Members: 0 },
        ]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A', 'Club C'])

    service._simulateRequest({ id: 240, method: 'clubs.list', args: [] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        {
          id: 240,
          result: [
            { id: 1, name: 'Club A', chess4Members: 4 },
            { id: 3, name: 'Club C', chess4Members: 0 },
          ],
        },
        'peer-1',
      )
    })
  })

  it('standings and clubs return empty lists when peer has no club authorization', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        get: vi.fn().mockResolvedValue([
          {
            place: 1,
            name: 'Anna',
            playerGroup: '',
            club: 'Club A',
            rating: 1500,
            score: 0,
            scoreDisplay: '0',
            tiebreaks: {},
          },
        ]),
        getClub: vi.fn().mockResolvedValue([{ place: 1, club: 'Club A', score: 5 }]),
        getChess4: vi
          .fn()
          .mockResolvedValue([
            { place: 1, club: 'Club A', playerCount: 4, chess4Members: 4, score: 10 },
          ]),
      },
      clubs: {
        list: vi.fn().mockResolvedValue([{ id: 1, name: 'Club A', chess4Members: 4 }]),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createViewPermissions())

    for (const [id, method] of [
      [250, 'standings.get'],
      [251, 'standings.getClub'],
      [252, 'standings.getChess4'],
      [253, 'clubs.list'],
    ] as const) {
      service._simulateRequest({ id, method, args: [1] }, 'peer-1')
    }

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(4)
    })
    for (const call of service.sendRpcResponse.mock.calls) {
      expect(call[0].result).toEqual([])
    }
  })

  it('view-scoped filtering is bypassed when clubFilterEnabled is false', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      standings: {
        get: vi.fn().mockResolvedValue([
          {
            place: 1,
            name: 'Anna',
            playerGroup: '',
            club: 'Club A',
            rating: 1500,
            score: 0,
            scoreDisplay: '0',
            tiebreaks: {},
          },
          {
            place: 2,
            name: 'Bo',
            playerGroup: '',
            club: 'Club B',
            rating: 1500,
            score: 0,
            scoreDisplay: '0',
            tiebreaks: {},
          },
        ]),
      },
    })

    startP2pRpcServer(service, provider, { clubFilterEnabled: false })
    setPeerPermissions('peer-1', createViewPermissions())
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest({ id: 260, method: 'standings.get', args: [1] }, 'peer-1')

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    const rows = service.sendRpcResponse.mock.calls[0][0].result as Array<{ club: string | null }>
    expect(rows.map((r) => r.club)).toEqual(['Club A', 'Club B'])
  })

  it('commands.setResult is rejected when board is outside the peer authorized clubs', async () => {
    const service = createMockServerService()
    const provider = createMockProvider({
      rounds: {
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
                name: 'Anna Andersson',
                club: 'Club A',
                rating: 1500,
                lotNr: 1,
              },
              blackPlayer: {
                id: 2,
                name: 'Ada Andersson',
                club: 'Club A',
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
              whitePlayer: { id: 3, name: 'Bo Berg', club: 'Club B', rating: 1500, lotNr: 3 },
              blackPlayer: { id: 4, name: 'Beata Berg', club: 'Club B', rating: 1500, lotNr: 4 },
              resultType: 'NO_RESULT' as const,
              whiteScore: 0,
              blackScore: 0,
              resultDisplay: '',
            },
          ],
        }),
      },
      results: {
        set: vi.fn().mockResolvedValue({ boardNr: 2, resultType: 'WHITE_WIN' }),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', { ...createViewPermissions(), 'commands.setResult': true })
    setPeerAuthorizedClubs('peer-1', ['Club A'])

    service._simulateRequest(
      {
        id: 270,
        method: 'commands.setResult',
        args: [
          {
            tournamentId: 1,
            roundNr: 1,
            boardNr: 2,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        ],
      },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    const response = service.sendRpcResponse.mock.calls[0][0]
    expect(response.id).toBe(270)
    expect(response.error ?? (response.result as { status?: string })?.status).not.toBe('applied')
    expect(response.result).not.toEqual({ status: 'applied' })
    expect(provider.results.set).not.toHaveBeenCalled()
  })
})

describe('auth.redeemClubCode rate limiting', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('clearPeerPermissions resets the failure counter for that peer', async () => {
    const service = createMockServerService()
    const provider = createMockProvider()
    startP2pRpcServer(service, provider, {
      clubCodeSecret: 'secret',
      getAllClubEntries: () => ['Club A'],
    })
    setPeerPermissions('peer-1', createViewPermissions())

    for (let i = 0; i < 20; i++) {
      service._simulateRequest({ id: i, method: 'auth.redeemClubCode', args: ['0000'] }, 'peer-1')
    }
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(20)
    })

    clearPeerPermissions('peer-1')
    setPeerPermissions('peer-1', createViewPermissions())

    service._simulateRequest({ id: 500, method: 'auth.redeemClubCode', args: ['0000'] }, 'peer-1')
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(21)
    })
    expect(service.sendRpcResponse.mock.calls[20][0]).toEqual({
      id: 500,
      result: { status: 'error', reason: 'invalid-code' },
    })
  })

  it('returns rate-limited after 20 failed redemptions from the same peer', async () => {
    const service = createMockServerService()
    const provider = createMockProvider()
    startP2pRpcServer(service, provider, {
      clubCodeSecret: 'secret',
      getAllClubEntries: () => ['Club A'],
    })
    setPeerPermissions('peer-1', createViewPermissions())

    for (let i = 0; i < 20; i++) {
      service._simulateRequest({ id: i, method: 'auth.redeemClubCode', args: ['0000'] }, 'peer-1')
    }
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(20)
    })
    for (const call of service.sendRpcResponse.mock.calls) {
      expect(call[0].result).toEqual({ status: 'error', reason: 'invalid-code' })
    }

    service._simulateRequest({ id: 999, method: 'auth.redeemClubCode', args: ['0000'] }, 'peer-1')
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(21)
    })
    expect(service.sendRpcResponse.mock.calls[20][0]).toEqual({
      id: 999,
      result: { status: 'error', reason: 'rate-limited' },
    })
  })
})

describe('createFullPermissions defaults', () => {
  it('includes referee-level read and write methods for tournaments, players, rounds, results', () => {
    const perms = createFullPermissions()
    expect(perms['tournaments.list']).toBe(true)
    expect(perms['tournaments.get']).toBe(true)
    expect(perms['tournamentPlayers.list']).toBe(true)
    expect(perms['tournamentPlayers.add']).toBe(true)
    expect(perms['tournamentPlayers.addMany']).toBe(true)
    expect(perms['tournamentPlayers.update']).toBe(true)
    expect(perms['tournamentPlayers.remove']).toBe(true)
    expect(perms['tournamentPlayers.removeMany']).toBe(true)
    expect(perms['rounds.list']).toBe(true)
    expect(perms['rounds.get']).toBe(true)
    expect(perms['rounds.pairNext']).toBe(true)
    expect(perms['rounds.unpairLast']).toBe(true)
    expect(perms['results.set']).toBe(true)
    expect(perms['results.addGame']).toBe(true)
    expect(perms['results.updateGame']).toBe(true)
    expect(perms['results.deleteGame']).toBe(true)
    expect(perms['results.deleteGames']).toBe(true)
    expect(perms['standings.get']).toBe(true)
    expect(perms['standings.getClub']).toBe(true)
    expect(perms['standings.getChess4']).toBe(true)
    expect(perms['commands.setResult']).toBe(true)
    expect(perms['auth.redeemClubCode']).toBe(true)
  })

  it('defaults organizer-scope methods to off (clubs, pool, settings, undo, tournament create/delete)', () => {
    const perms = createFullPermissions()
    expect(perms['tournaments.create']).toBeUndefined()
    expect(perms['tournaments.update']).toBeUndefined()
    expect(perms['tournaments.delete']).toBeUndefined()
    expect(perms['clubs.add']).toBeUndefined()
    expect(perms['clubs.rename']).toBeUndefined()
    expect(perms['clubs.delete']).toBeUndefined()
    expect(perms['settings.update']).toBeUndefined()
    expect(perms['poolPlayers.add']).toBeUndefined()
    expect(perms['poolPlayers.update']).toBeUndefined()
    expect(perms['poolPlayers.delete']).toBeUndefined()
    expect(perms['poolPlayers.deleteMany']).toBeUndefined()
    expect(perms['undo.perform']).toBeUndefined()
    expect(perms['undo.redo']).toBeUndefined()
    expect(perms['undo.restoreToPoint']).toBeUndefined()
  })
})

describe('RPC server peer label threading', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('sets the current actor to the peer label during a mutation dispatch', async () => {
    const { getCurrentActor } = await import('./peer-actor.ts')
    const service = createMockServerService()
    let actorDuringCall: string | null = null
    const provider = createMockProvider({
      clubs: {
        add: vi.fn().mockImplementation(async () => {
          actorDuringCall = getCurrentActor()
          return { id: 1, name: 'SK Lund' }
        }),
      },
    })

    startP2pRpcServer(service, provider, {
      getPeerLabel: (peerId) => (peerId === 'peer-1' ? 'Domare Sofia' : undefined),
    })
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'clubs.add': true })

    service._simulateRequest(
      { id: 100, method: 'clubs.add', args: [{ name: 'SK Lund' }] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 100, result: { id: 1, name: 'SK Lund' } },
        'peer-1',
      )
    })
    expect(actorDuringCall).toBe('Domare Sofia')
  })

  it('clears the current actor after dispatch completes', async () => {
    const { getCurrentActor } = await import('./peer-actor.ts')
    const service = createMockServerService()
    const provider = createMockProvider({
      clubs: {
        add: vi.fn().mockResolvedValue({ id: 1, name: 'SK Lund' }),
      },
    })

    startP2pRpcServer(service, provider, {
      getPeerLabel: () => 'Domare Sofia',
    })
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'clubs.add': true })

    service._simulateRequest(
      { id: 101, method: 'clubs.add', args: [{ name: 'SK Lund' }] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    expect(getCurrentActor()).toBeNull()
  })

  it('does not set an actor when getPeerLabel is not provided', async () => {
    const { getCurrentActor } = await import('./peer-actor.ts')
    const service = createMockServerService()
    let actorDuringCall: string | null = null
    const provider = createMockProvider({
      clubs: {
        add: vi.fn().mockImplementation(async () => {
          actorDuringCall = getCurrentActor()
          return { id: 1, name: 'SK Lund' }
        }),
      },
    })

    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'clubs.add': true })

    service._simulateRequest(
      { id: 102, method: 'clubs.add', args: [{ name: 'SK Lund' }] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalled()
    })
    expect(actorDuringCall).toBeNull()
  })

  it('clears the actor even if dispatch throws', async () => {
    const { getCurrentActor } = await import('./peer-actor.ts')
    const service = createMockServerService()
    const provider = createMockProvider({
      clubs: {
        add: vi.fn().mockRejectedValue(new Error('boom')),
      },
    })

    startP2pRpcServer(service, provider, {
      getPeerLabel: () => 'Domare Sofia',
    })
    setPeerPermissions('peer-1', { ...createFullPermissions(), 'clubs.add': true })

    service._simulateRequest(
      { id: 103, method: 'clubs.add', args: [{ name: 'SK Lund' }] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith({ id: 103, error: 'boom' }, 'peer-1')
    })
    expect(getCurrentActor()).toBeNull()
  })
})

describe('createViewPermissions defaults', () => {
  it('includes read-only methods needed to render the UI', () => {
    const perms = createViewPermissions()
    expect(perms['tournaments.list']).toBe(true)
    expect(perms['tournaments.get']).toBe(true)
    expect(perms['tournamentPlayers.list']).toBe(true)
    expect(perms['rounds.list']).toBe(true)
    expect(perms['rounds.get']).toBe(true)
    expect(perms['standings.get']).toBe(true)
    expect(perms['standings.getClub']).toBe(true)
    expect(perms['standings.getChess4']).toBe(true)
    expect(perms['clubs.list']).toBe(true)
    expect(perms['settings.get']).toBe(true)
    expect(perms['auth.redeemClubCode']).toBe(true)
  })

  it('excludes all write methods', () => {
    const perms = createViewPermissions()
    expect(perms['tournaments.create']).toBeUndefined()
    expect(perms['tournamentPlayers.add']).toBeUndefined()
    expect(perms['rounds.pairNext']).toBeUndefined()
    expect(perms['results.set']).toBeUndefined()
    expect(perms['commands.setResult']).toBeUndefined()
    expect(perms['clubs.add']).toBeUndefined()
    expect(perms['settings.update']).toBeUndefined()
    expect(perms['poolPlayers.add']).toBeUndefined()
    expect(perms['undo.perform']).toBeUndefined()
  })
})

describe('auth.redeemClubCode per-peer club cap', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('rejects a third club redemption from the same peer', async () => {
    const service = createMockServerService()
    const provider = createMockProvider()
    const entries = ['Club A', 'Club B', 'Club C']
    startP2pRpcServer(service, provider, {
      clubCodeSecret: 'secret',
      getAllClubEntries: () => entries,
    })
    setPeerPermissions('peer-1', createViewPermissions())
    const map = generateClubCodeMap(entries, 'secret')

    service._simulateRequest(
      { id: 1, method: 'auth.redeemClubCode', args: [map['Club A']] },
      'peer-1',
    )
    service._simulateRequest(
      { id: 2, method: 'auth.redeemClubCode', args: [map['Club B']] },
      'peer-1',
    )
    service._simulateRequest(
      { id: 3, method: 'auth.redeemClubCode', args: [map['Club C']] },
      'peer-1',
    )

    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledTimes(3)
    })
    expect(service.sendRpcResponse.mock.calls[2][0]).toEqual({
      id: 3,
      result: { status: 'error', reason: 'club-limit-reached' },
    })
  })
})

describe('startP2pRpcServer peer-leave cleanup', () => {
  beforeEach(() => {
    clearAllPeerPermissions()
  })

  it('preserves an onPeerLeave handler set before startP2pRpcServer', () => {
    const service: ReturnType<typeof createMockServerService> & {
      onPeerLeave: ((peerId: string) => void) | null
    } = Object.assign(createMockServerService(), { onPeerLeave: null })
    const prior = vi.fn()
    service.onPeerLeave = prior
    const provider = createMockProvider()
    startP2pRpcServer(service, provider)

    service.onPeerLeave?.('peer-9')

    expect(prior).toHaveBeenCalledWith('peer-9')
  })

  it('clears a peer\u2019s permissions when the service fires onPeerLeave', async () => {
    const service: ReturnType<typeof createMockServerService> & {
      onPeerLeave: ((peerId: string) => void) | null
    } = Object.assign(createMockServerService(), { onPeerLeave: null })
    const provider = createMockProvider()
    startP2pRpcServer(service, provider)
    setPeerPermissions('peer-1', createFullPermissions())

    service.onPeerLeave?.('peer-1')

    service._simulateRequest({ id: 1, method: 'tournaments.list', args: [] }, 'peer-1')
    await vi.waitFor(() => {
      expect(service.sendRpcResponse).toHaveBeenCalledWith(
        { id: 1, error: 'Permission denied: tournaments.list' },
        'peer-1',
      )
    })
  })
})
