import { joinRoom } from '@trystero-p2p/mqtt'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultAckMessage } from '../types/p2p.ts'
import { _resetTurnCache, P2PService } from './p2p-service.ts'

const mswServer = setupServer(
  http.get('https://lotta-web.metered.live/api/v1/turn/credentials', () => {
    return HttpResponse.json([
      { urls: 'turn:test.metered.live:443', username: 'test', credential: 'test' },
    ])
  }),
)

beforeAll(() => {
  vi.stubEnv('VITE_METERED_API_KEY', 'test-api-key')
  mswServer.listen({ onUnhandledRequest: 'bypass' })
})
afterAll(() => {
  mswServer.close()
  vi.unstubAllEnvs()
})

type PeerCallback = (id: string) => void

function createMockRoom() {
  const handlers: Record<string, PeerCallback> = {}
  const actions: Record<
    string,
    { send: ReturnType<typeof vi.fn>; receive: ReturnType<typeof vi.fn> }
  > = {}
  const mockPeerConnections: Record<
    string,
    { restartIce: ReturnType<typeof vi.fn>; connectionState: string }
  > = {}
  return {
    onPeerJoin: (cb: PeerCallback) => {
      handlers['peerJoin'] = cb
    },
    onPeerLeave: (cb: PeerCallback) => {
      handlers['peerLeave'] = cb
    },
    makeAction: (name: string) => {
      const send = vi.fn()
      const receive = vi.fn()
      actions[name] = { send, receive }
      return [send, receive]
    },
    leave: vi.fn(),
    getPeers: () => mockPeerConnections,
    _simulatePeerJoin: (id: string) => {
      mockPeerConnections[id] = { restartIce: vi.fn(), connectionState: 'connected' }
      handlers['peerJoin']?.(id)
    },
    _simulatePeerLeave: (id: string) => {
      delete mockPeerConnections[id]
      handlers['peerLeave']?.(id)
    },
    _getSendFn: (name: string) => actions[name]?.send,
    _getReceiveFn: (name: string) => actions[name]?.receive,
    _simulateReceive: (name: string, data: unknown, peerId: string) => {
      const receiveFn = actions[name]?.receive
      if (receiveFn) {
        const cb = receiveFn.mock.calls[0]?.[0]
        if (typeof cb === 'function') cb(data, peerId)
      }
    },
  }
}

const mockRooms: ReturnType<typeof createMockRoom>[] = []

vi.mock('trystero', () => ({
  joinRoom: vi.fn(() => {
    const room = createMockRoom()
    mockRooms.push(room)
    return room
  }),
  selfId: 'mock-self-id',
  getRelaySockets: vi.fn(() => ({})),
  defaultRelayUrls: ['wss://relay1.test', 'wss://relay2.test', 'wss://relay3.test'],
}))

vi.mock('@trystero-p2p/mqtt', () => ({
  joinRoom: vi.fn(() => {
    const room = createMockRoom()
    mockRooms.push(room)
    return room
  }),
  getRelaySockets: vi.fn(() => ({})),
}))

const mockJoinRoom = vi.mocked(joinRoom)

/** Flush async work spawned by connectToRoom (TURN fetch via MSW + ICE probe) */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('P2PService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRooms.length = 0
    mswServer.resetHandlers()
  })

  it('can be instantiated with a role', () => {
    const service = new P2PService('organizer')
    expect(service.role).toBe('organizer')
  })

  it('starts in disconnected state', () => {
    const service = new P2PService('organizer')
    expect(service.connectionState).toBe('disconnected')
  })

  it('starts with no peers', () => {
    const service = new P2PService('organizer')
    expect(service.getPeers()).toEqual([])
  })

  it('tracks a peer when added', () => {
    const service = new P2PService('organizer')
    service.addPeer('peer-1', 'viewer')
    const peers = service.getPeers()
    expect(peers).toHaveLength(1)
    expect(peers[0].id).toBe('peer-1')
    expect(peers[0].role).toBe('viewer')
  })

  it('sets verified to false by default when adding a peer', () => {
    const service = new P2PService('organizer')
    service.addPeer('peer-1', 'viewer')
    expect(service.getPeers()[0].verified).toBe(false)
  })

  it('removes a peer', () => {
    const service = new P2PService('organizer')
    service.addPeer('peer-1', 'viewer')
    service.addPeer('peer-2', 'referee', 'Anna')
    service.removePeer('peer-1')
    const peers = service.getPeers()
    expect(peers).toHaveLength(1)
    expect(peers[0].id).toBe('peer-2')
    expect(peers[0].label).toBe('Anna')
  })

  it('joins a room when startHosting is called', async () => {
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()
    expect(mockJoinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'lotta-chess-pairer' }),
      'test-room',
    )
    expect(service.connectionState).toBe('connected')
  })

  it('adds peers automatically when they join the room', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('new-peer')
    expect(service.getPeers()).toHaveLength(1)
    expect(service.getPeers()[0].id).toBe('new-peer')
  })

  it('removes peers automatically when they leave the room', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('peer-a')
    mockRoom._simulatePeerJoin('peer-b')
    expect(service.getPeers()).toHaveLength(2)

    mockRoom._simulatePeerLeave('peer-a')
    expect(service.getPeers()).toHaveLength(1)
    expect(service.getPeers()[0].id).toBe('peer-b')
  })

  it('leaves the room and resets state', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()
    mockRoom._simulatePeerJoin('peer-1')

    service.leave()
    expect(mockRoom.leave).toHaveBeenCalled()
    expect(service.connectionState).toBe('disconnected')
    expect(service.getPeers()).toEqual([])
  })

  it('joins a room as viewer in connecting state', async () => {
    const service = new P2PService('viewer')
    service.joinRoom('test-room')
    await flush()
    expect(mockJoinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'lotta-chess-pairer' }),
      'test-room',
    )
    // Viewers start as 'connecting' until first heartbeat proves host is live
    expect(service.connectionState).toBe('connecting')
  })

  function stubSessionStorage(initial: Record<string, string> = {}) {
    const store: Record<string, string> = { ...initial }
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const k in store) delete store[k]
      },
      get length() {
        return Object.keys(store).length
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    })
    return store
  }

  it('caches TURN credentials in sessionStorage after fetching', async () => {
    stubSessionStorage()
    _resetTurnCache()

    const service = new P2PService('viewer')
    service.joinRoom('test-room')
    await flush()

    const cached = sessionStorage.getItem('lotta-turn-servers')
    expect(cached).not.toBeNull()
    const entry = JSON.parse(cached!)
    expect(entry.servers).toEqual([
      { urls: 'turn:test.metered.live:443', username: 'test', credential: 'test' },
    ])
    expect(entry.timestamp).toBeGreaterThan(0)

    vi.unstubAllGlobals()
  })

  it('uses cached TURN credentials from sessionStorage without fetching', async () => {
    const cachedServers = [
      { urls: 'turn:cached.example:443', username: 'cached', credential: 'cached' },
    ]
    const entry = { servers: cachedServers, timestamp: Date.now() }
    stubSessionStorage({ 'lotta-turn-servers': JSON.stringify(entry) })
    _resetTurnCache()

    const service = new P2PService('viewer')
    service.joinRoom('test-room')
    await flush()

    expect(mockJoinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ turnConfig: cachedServers }),
      'test-room',
    )

    vi.unstubAllGlobals()
  })

  it('ignores expired TURN credentials in sessionStorage and re-fetches', async () => {
    const staleServers = [
      { urls: 'turn:stale.example:443', username: 'stale', credential: 'stale' },
    ]
    const staleEntry = {
      servers: staleServers,
      timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    }
    stubSessionStorage({ 'lotta-turn-servers': JSON.stringify(staleEntry) })
    _resetTurnCache()

    const service = new P2PService('viewer')
    service.joinRoom('test-room')
    await flush()

    // Should have fetched fresh servers from MSW, not used the stale ones
    expect(mockJoinRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        turnConfig: [{ urls: 'turn:test.metered.live:443', username: 'test', credential: 'test' }],
      }),
      'test-room',
    )

    vi.unstubAllGlobals()
  })

  it('broadcasts a page update to all peers', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    const message = {
      pageType: 'pairings' as const,
      tournamentName: 'Test Tournament',
      roundNr: 1,
      html: '<html><body>Pairings</body></html>',
      timestamp: Date.now(),
    }
    service.broadcastPageUpdate(message)
    expect(mockRoom._getSendFn('page-update')).toHaveBeenCalledWith(message, null)
  })

  it('invokes onPageUpdate callback when a page update is received', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('viewer')

    const received: { pageType: string; html: string }[] = []
    service.onPageUpdate = (msg) => {
      received.push({ pageType: msg.pageType, html: msg.html })
    }

    service.joinRoom('test-room')
    await flush()
    mockRoom._simulateReceive(
      'page-update',
      {
        pageType: 'standings',
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>Standings</html>',
        timestamp: 1000,
      },
      'host-peer',
    )

    expect(received).toHaveLength(1)
    expect(received[0].pageType).toBe('standings')
  })

  it('sends a result submission to the organizer', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('referee')
    service.joinRoom('test-room')
    await flush()

    const submission = {
      tournamentId: 1,
      roundNr: 2,
      boardNr: 3,
      resultType: 'WHITE_WIN' as const,
      refereeName: 'Anna',
      timestamp: Date.now(),
    }
    service.submitResult(submission)
    expect(mockRoom._getSendFn('result-submit')).toHaveBeenCalledWith(submission, null)
  })

  it('invokes onResultSubmit when organizer receives a result', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')

    const received: { boardNr: number; peerId: string }[] = []
    service.onResultSubmit = (msg, peerId) => {
      received.push({ boardNr: msg.boardNr, peerId })
    }

    service.startHosting('test-room')
    await flush()
    mockRoom._simulateReceive(
      'result-submit',
      {
        tournamentId: 1,
        roundNr: 1,
        boardNr: 5,
        resultType: 'DRAW',
        refereeName: 'Erik',
        timestamp: 1000,
      },
      'referee-peer',
    )

    expect(received).toHaveLength(1)
    expect(received[0].boardNr).toBe(5)
    expect(received[0].peerId).toBe('referee-peer')
  })

  it('exposes the room ID after connecting', async () => {
    const service = new P2PService('organizer')
    expect(service.roomId).toBeNull()
    service.startHosting('my-room')
    await flush()
    expect(service.roomId).toBe('my-room')
    service.leave()
    expect(service.roomId).toBeNull()
  })

  it('sends a page update to a specific peer', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    const message = {
      pageType: 'pairings' as const,
      tournamentName: 'Test',
      roundNr: 1,
      html: '<html>Pairings</html>',
      timestamp: Date.now(),
    }
    service.sendPageUpdateTo(message, 'target-peer')
    expect(mockRoom._getSendFn('page-update')).toHaveBeenCalledWith(message, 'target-peer')
  })

  it('sends a result ack to a specific peer', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    const ack: ResultAckMessage = {
      boardNr: 3,
      roundNr: 1,
      accepted: true,
    }
    service.sendResultAck(ack, 'referee-peer')
    expect(mockRoom._getSendFn('result-ack')).toHaveBeenCalledWith(ack, 'referee-peer')
  })

  it('invokes onResultAck when a referee receives an ack', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('referee')

    const received: ResultAckMessage[] = []
    service.onResultAck = (msg) => {
      received.push(msg)
    }

    service.joinRoom('test-room')
    await flush()
    mockRoom._simulateReceive(
      'result-ack',
      {
        boardNr: 5,
        roundNr: 2,
        accepted: false,
        reason: 'Result already recorded',
      },
      'organizer-peer',
    )

    expect(received).toHaveLength(1)
    expect(received[0].boardNr).toBe(5)
    expect(received[0].accepted).toBe(false)
    expect(received[0].reason).toBe('Result already recorded')
  })

  it('announces role to peer on join and updates peer role on receipt', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    // Simulate a peer joining
    mockRoom._simulatePeerJoin('ref-peer')
    expect(service.getPeers()[0].role).toBe('viewer') // Default

    // Peer announces as referee
    mockRoom._simulateReceive('role-announce', { role: 'referee' }, 'ref-peer')
    expect(service.getPeers()[0].role).toBe('referee')
  })

  it('sends own role to new peer on join', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('new-peer')
    const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
    expect(sendRoleAnnounce).toHaveBeenCalledWith({ role: 'organizer' }, 'new-peer')
  })

  it('invokes onNewPeerJoin with peerId when a peer joins', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    const onJoin = vi.fn()
    service.onNewPeerJoin = onJoin
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('peer-1')
    expect(onJoin).toHaveBeenCalledWith('peer-1')

    mockRoom._simulatePeerJoin('peer-2')
    expect(onJoin).toHaveBeenCalledWith('peer-2')
    expect(onJoin).toHaveBeenCalledTimes(2)
  })

  it('notifies onPeersChange when peers join, leave, or change role', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    const onChange = vi.fn()
    service.onPeersChange = onChange
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('peer-1')
    expect(onChange).toHaveBeenCalledTimes(1)

    mockRoom._simulateReceive('role-announce', { role: 'referee' }, 'peer-1')
    expect(onChange).toHaveBeenCalledTimes(2)

    mockRoom._simulatePeerLeave('peer-1')
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('broadcastPageUpdate is a no-op before connecting to a room', () => {
    const service = new P2PService('organizer')
    // Should not throw when no room is connected
    service.broadcastPageUpdate({
      pageType: 'pairings',
      tournamentName: 'Test',
      roundNr: 1,
      html: '<html></html>',
      timestamp: Date.now(),
    })
  })

  it('submitResult is a no-op before connecting', () => {
    const service = new P2PService('referee')
    service.submitResult({
      tournamentId: 1,
      roundNr: 1,
      boardNr: 1,
      resultType: 'WHITE_WIN',
      refereeName: 'A',
      timestamp: Date.now(),
    })
  })

  it('does not notify onPeersChange for duplicate role announcement', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    const onChange = vi.fn()
    service.onPeersChange = onChange
    service.startHosting('test-room')
    await flush()

    mockRoom._simulatePeerJoin('peer-1')
    expect(onChange).toHaveBeenCalledTimes(1)

    // Announce same role as default — should not trigger change
    mockRoom._simulateReceive('role-announce', { role: 'viewer' }, 'peer-1')
    expect(onChange).toHaveBeenCalledTimes(1) // still 1
  })

  it('ignores role announcement for unknown peer', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    // Should not throw for unknown peer
    mockRoom._simulateReceive('role-announce', { role: 'referee' }, 'nonexistent-peer')
    expect(service.getPeers()).toHaveLength(0)
  })

  describe('referee token verification', () => {
    it('verifies referee peer with correct token', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'secret-token-123')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('ref-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'referee', token: 'secret-token-123' },
        'ref-peer',
      )

      const peer = service.getPeers()[0]
      expect(peer.role).toBe('referee')
      expect(peer.verified).toBe(true)
    })

    it('rejects referee peer with wrong token', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'correct-token')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('bad-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'referee', token: 'wrong-token' },
        'bad-peer',
      )

      const peer = service.getPeers()[0]
      expect(peer.role).toBe('referee')
      expect(peer.verified).toBe(false)
    })

    it('rejects referee peer with no token', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'some-token')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('no-token-peer')
      mockRoom._simulateReceive('role-announce', { role: 'referee' }, 'no-token-peer')

      expect(service.getPeers()[0].verified).toBe(false)
    })

    it('referee includes token in role announcement', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('referee', 'my-token')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('organizer-peer')
      const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
      expect(sendRoleAnnounce).toHaveBeenCalledWith(
        { role: 'referee', token: 'my-token' },
        'organizer-peer',
      )
    })

    it('referee includes label in role announcement', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('referee', 'my-token', 'Anna')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('organizer-peer')
      const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
      expect(sendRoleAnnounce).toHaveBeenCalledWith(
        { role: 'referee', token: 'my-token', label: 'Anna' },
        'organizer-peer',
      )
    })

    it('sets peer label from role announcement', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'token')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('ref-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'referee', token: 'token', label: 'Erik' },
        'ref-peer',
      )

      const peer = service.getPeers()[0]
      expect(peer.label).toBe('Erik')
    })

    it('viewer does not include token in role announcement', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('organizer-peer')
      const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
      expect(sendRoleAnnounce).toHaveBeenCalledWith({ role: 'viewer' }, 'organizer-peer')
    })

    it('isPeerVerifiedReferee returns true for verified referee', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'token')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('ref-peer')
      mockRoom._simulateReceive('role-announce', { role: 'referee', token: 'token' }, 'ref-peer')

      expect(service.isPeerVerifiedReferee('ref-peer')).toBe(true)
    })

    it('invokes onPeerToken when a peer sends a token in role-announce', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'host-token')
      service.startHosting('test-room')
      await flush()

      const tokenCallback = vi.fn()
      service.onPeerToken = tokenCallback

      mockRoom._simulatePeerJoin('view-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'viewer', token: 'view-tok-123' },
        'view-peer',
      )

      expect(tokenCallback).toHaveBeenCalledWith('view-peer', 'view-tok-123')
    })

    it('isPeerVerifiedReferee returns false for unverified peer', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', 'token')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('bad-peer')
      mockRoom._simulateReceive('role-announce', { role: 'referee', token: 'wrong' }, 'bad-peer')

      expect(service.isPeerVerifiedReferee('bad-peer')).toBe(false)
    })

    it('isPeerVerifiedReferee returns false for unknown peer', () => {
      const service = new P2PService('organizer', 'token')
      expect(service.isPeerVerifiedReferee('nonexistent')).toBe(false)
    })
  })

  describe('hostId propagation', () => {
    it('organizer includes hostId in role announcement to joining peer', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer', undefined, undefined, 'host-uuid-123')
      service.startHosting('test-room')
      await flush()

      mockRoom._simulatePeerJoin('viewer-peer')
      const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
      expect(sendRoleAnnounce).toHaveBeenCalledWith(
        { role: 'organizer', hostId: 'host-uuid-123' },
        'viewer-peer',
      )
    })

    it('viewer records hostId on peer when organizer announces', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('host-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'host-uuid-abc' },
        'host-peer',
      )

      const peer = service.getPeers()[0]
      expect(peer.hostId).toBe('host-uuid-abc')
    })

    it('getObservedHostId returns own hostId for organizer', () => {
      const service = new P2PService('organizer', undefined, undefined, 'my-host-id')
      expect(service.getObservedHostId()).toBe('my-host-id')
    })

    it('getObservedHostId returns organizer peer hostId for viewer', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      expect(service.getObservedHostId()).toBeUndefined()

      mockRoom._simulatePeerJoin('host-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'observed-host' },
        'host-peer',
      )

      expect(service.getObservedHostId()).toBe('observed-host')
    })

    it('logs Host ID to diagnostic log when organizer peer announces it', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('host-peer')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'logged-host-id' },
        'host-peer',
      )

      const hasHostIdLog = service
        .getDiagnosticLog()
        .some((entry) => entry.message.includes('Host ID: logged-host-id'))
      expect(hasHostIdLog).toBe(true)
    })

    it('omits hostId from role announcement when not set (viewer)', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('host-peer')
      const sendRoleAnnounce = mockRoom._getSendFn('role-announce')
      expect(sendRoleAnnounce).toHaveBeenCalledWith({ role: 'viewer' }, 'host-peer')
    })
  })

  describe('host-refresh grace', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function setupViewerWithHost(hostId = 'host-uuid-1'): Promise<{
      mockRoom: ReturnType<typeof createMockRoom>
      service: P2PService
    }> {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      mockRoom._simulatePeerJoin('host-peer-1')
      mockRoom._simulateReceive('role-announce', { role: 'organizer', hostId }, 'host-peer-1')
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer-1')
      return { mockRoom, service }
    }

    it('defers host-offline during grace window when organizer peer leaves', async () => {
      const { mockRoom, service } = await setupViewerWithHost()
      expect(service.connectionState).toBe('connected')

      mockRoom._simulatePeerLeave('host-peer-1')

      // Stale peer kept in map during grace so connection UI stays stable.
      expect(service.getPeers().some((p) => p.id === 'host-peer-1')).toBe(true)
      // Just under grace window: still connected (not host-offline).
      vi.advanceTimersByTime(19_000)
      expect(service.connectionState).toBe('connected')
    })

    it('silently rebinds when new organizer peer announces matching hostId', async () => {
      const { mockRoom, service } = await setupViewerWithHost('host-uuid-shared')
      mockRoom._simulatePeerLeave('host-peer-1')

      // Part-way through grace, a new peer joins with the same hostId.
      vi.advanceTimersByTime(5_000)
      mockRoom._simulatePeerJoin('host-peer-2')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'host-uuid-shared' },
        'host-peer-2',
      )

      expect(service.connectionState).toBe('connected')
      const peers = service.getPeers()
      expect(peers.some((p) => p.id === 'host-peer-1')).toBe(false)
      const rebound = peers.find((p) => p.id === 'host-peer-2')
      expect(rebound?.role).toBe('organizer')
      expect(rebound?.hostId).toBe('host-uuid-shared')

      // Advancing past the original grace window must not trip host-offline now.
      vi.advanceTimersByTime(30_000)
      // New heartbeat arrives to keep the connection alive (normal behavior).
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer-2')
      expect(service.connectionState).toBe('connected')
    })

    it('logs a diagnostic entry when rebind succeeds', async () => {
      const { mockRoom, service } = await setupViewerWithHost('host-uuid-rb')
      mockRoom._simulatePeerLeave('host-peer-1')
      mockRoom._simulatePeerJoin('host-peer-2')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'host-uuid-rb' },
        'host-peer-2',
      )

      const reboundLog = service
        .getDiagnosticLog()
        .some((e) => e.message.startsWith('Host rebound:'))
      expect(reboundLog).toBe(true)
    })

    it('fires onHostRefreshing(false) when rebind succeeds', async () => {
      const { mockRoom, service } = await setupViewerWithHost('host-uuid-rb2')
      const calls: boolean[] = []
      service.onHostRefreshing = (v) => calls.push(v)

      mockRoom._simulatePeerLeave('host-peer-1')
      mockRoom._simulatePeerJoin('host-peer-2')
      mockRoom._simulateReceive(
        'role-announce',
        { role: 'organizer', hostId: 'host-uuid-rb2' },
        'host-peer-2',
      )

      expect(calls).toEqual([false])
    })

    it('falls through to host-offline after grace expires without rebind', async () => {
      const { mockRoom, service } = await setupViewerWithHost()
      mockRoom._simulatePeerLeave('host-peer-1')

      vi.advanceTimersByTime(20_000)
      expect(service.connectionState).toBe('host-offline')
      expect(service.getPeers().some((p) => p.id === 'host-peer-1')).toBe(false)
    })

    it('heartbeat timeout firing during grace does not transition to host-offline', async () => {
      const { mockRoom, service } = await setupViewerWithHost()
      // Consume most of the heartbeat-timeout budget before the peer leaves,
      // so heartbeat-timeout (25s) would fire inside the 20s grace window.
      vi.advanceTimersByTime(24_000)
      mockRoom._simulatePeerLeave('host-peer-1')

      // Heartbeat-timeout fires 1s into grace — should be suppressed.
      vi.advanceTimersByTime(2_000)
      expect(service.connectionState).toBe('connected')
    })

    it('leave() clears host-refresh grace state', async () => {
      const { mockRoom, service } = await setupViewerWithHost()
      mockRoom._simulatePeerLeave('host-peer-1')

      service.leave()
      vi.advanceTimersByTime(60_000)
      expect(service.connectionState).toBe('disconnected')
    })
  })

  describe('host-refreshing hint', () => {
    it('organizer broadcasts host-refreshing to all peers', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer')
      service.startHosting('test-room')
      await flush()

      service.broadcastHostRefreshing()
      expect(mockRoom._getSendFn('host-refreshing')).toHaveBeenCalledWith(
        expect.objectContaining({ ts: expect.any(Number) }),
        null,
      )
    })

    it('viewer fires onHostRefreshing(true) when hint is received', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      const calls: boolean[] = []
      service.onHostRefreshing = (v) => calls.push(v)
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('host-peer')
      mockRoom._simulateReceive('role-announce', { role: 'organizer' }, 'host-peer')
      mockRoom._simulateReceive('host-refreshing', { ts: Date.now() }, 'host-peer')
      expect(calls).toEqual([true])
    })

    it('ignores host-refreshing from non-organizer peers', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      const calls: boolean[] = []
      service.onHostRefreshing = (v) => calls.push(v)
      service.joinRoom('test-room')
      await flush()

      // Peer joins as viewer (default role from addPeer)
      mockRoom._simulatePeerJoin('viewer-peer')
      mockRoom._simulateReceive('host-refreshing', { ts: Date.now() }, 'viewer-peer')
      expect(calls).toEqual([])
    })

    it('viewer fires onHostRefreshing(false) when heartbeat arrives after hint', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      const calls: boolean[] = []
      service.onHostRefreshing = (v) => calls.push(v)
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulatePeerJoin('host-peer')
      mockRoom._simulateReceive('role-announce', { role: 'organizer' }, 'host-peer')
      mockRoom._simulateReceive('host-refreshing', { ts: Date.now() }, 'host-peer')
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      expect(calls).toEqual([true, false])
      vi.useRealTimers()
    })
  })

  it('broadcasts a chat message to all peers', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    const chatMsg = {
      id: 'chat-1',
      senderName: 'Arrangör',
      senderRole: 'organizer' as const,
      text: 'Hello everyone',
      timestamp: Date.now(),
    }
    service.broadcastChatMessage(chatMsg)
    expect(mockRoom._getSendFn('chat-message')).toHaveBeenCalledWith(chatMsg, null)
  })

  it('invokes onChatMessage with peerId when chat data is received', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('viewer')

    const received: { text: string; senderName: string; peerId: string }[] = []
    service.onChatMessage = (msg, peerId) => {
      received.push({ text: msg.text, senderName: msg.senderName, peerId })
    }

    service.joinRoom('test-room')
    await flush()
    mockRoom._simulateReceive(
      'chat-message',
      {
        id: 'chat-2',
        senderName: 'Arrangör',
        senderRole: 'organizer',
        text: 'Welcome!',
        timestamp: 1000,
      },
      'host-peer',
    )

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Welcome!')
    expect(received[0].senderName).toBe('Arrangör')
    expect(received[0].peerId).toBe('host-peer')
  })

  it('broadcastChatMessage is a no-op before connecting', () => {
    const service = new P2PService('organizer')
    service.broadcastChatMessage({
      id: 'chat-3',
      senderName: 'Arrangör',
      senderRole: 'organizer',
      text: 'test',
      timestamp: Date.now(),
    })
  })

  it('clears sendResultAck on leave', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('organizer')
    service.startHosting('test-room')
    await flush()

    service.leave()
    // Should not throw, just silently no-op
    service.sendResultAck({ boardNr: 1, roundNr: 1, accepted: true }, 'peer')
    // No send function call since room was left
  })

  describe('heartbeat', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('organizer sends heartbeat every 15 seconds after hosting', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer')
      service.startHosting('test-room')
      await flush()

      const sendHeartbeat = mockRoom._getSendFn('heartbeat')
      expect(sendHeartbeat).toBeDefined()

      // Advance 10 seconds — first heartbeat
      vi.advanceTimersByTime(10000)
      expect(sendHeartbeat).toHaveBeenCalledTimes(1)
      expect(sendHeartbeat).toHaveBeenCalledWith({ ts: expect.any(Number) }, null)

      // Advance another 10s — second heartbeat
      vi.advanceTimersByTime(10000)
      expect(sendHeartbeat).toHaveBeenCalledTimes(2)
    })

    it('organizer stops heartbeat on leave', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('organizer')
      service.startHosting('test-room')
      await flush()

      const sendHeartbeat = mockRoom._getSendFn('heartbeat')
      vi.advanceTimersByTime(10000)
      expect(sendHeartbeat).toHaveBeenCalledTimes(1)

      service.leave()
      vi.advanceTimersByTime(30000)
      // No more heartbeats after leave
      expect(sendHeartbeat).toHaveBeenCalledTimes(1)
    })

    it('viewer detects host offline after timeout without heartbeat', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      // Simulate receiving a heartbeat
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      expect(service.connectionState).toBe('connected')

      // After 25s without heartbeat → host-offline
      vi.advanceTimersByTime(25000)
      expect(service.connectionState).toBe('host-offline')
    })

    it('viewer resets timeout when heartbeat is received', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      // First heartbeat
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')

      // At 20s, receive another heartbeat
      vi.advanceTimersByTime(20000)
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')

      // At 35s (15s after second heartbeat), still connected
      vi.advanceTimersByTime(15000)
      expect(service.connectionState).toBe('connected')

      // At 45s (25s after second heartbeat), host-offline
      vi.advanceTimersByTime(10000)
      expect(service.connectionState).toBe('host-offline')
    })

    it('viewer recovers from host-offline when heartbeat resumes', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      vi.advanceTimersByTime(25000)
      expect(service.connectionState).toBe('host-offline')

      // Heartbeat resumes
      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      expect(service.connectionState).toBe('connected')
    })

    it('viewer cleans up heartbeat timeout on leave', async () => {
      const mockRoom = createMockRoom()
      mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()

      mockRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      service.leave()

      // Advancing time should not change state after leave
      vi.advanceTimersByTime(60000)
      expect(service.connectionState).toBe('disconnected')
    })
  })

  describe('auto-reconnect', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('viewer enters reconnecting state and retries after host goes offline', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const initialRoom = mockRooms[mockRooms.length - 1]

      initialRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      vi.advanceTimersByTime(25000) // host-offline
      expect(service.connectionState).toBe('host-offline')

      // After 2s (first backoff), should attempt reconnect (full teardown, no RTC peers)
      vi.advanceTimersByTime(2000)
      await flush()
      expect(service.connectionState).toBe('reconnecting')
      expect(mockJoinRoom).toHaveBeenCalledTimes(2)
    })

    it('recovers when heartbeat arrives after reconnect', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const initialRoom = mockRooms[mockRooms.length - 1]

      initialRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      vi.advanceTimersByTime(25000) // host-offline

      // First reconnect at 2s (full teardown, no RTC peers)
      vi.advanceTimersByTime(2000)
      await flush()
      expect(service.connectionState).toBe('reconnecting')

      // Heartbeat arrives on new room
      const newRoom = mockRooms[mockRooms.length - 1]
      newRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      expect(service.connectionState).toBe('connected')
      expect(service.reconnectAttempts).toBe(0)
    })

    it('gives up after max reconnect attempts', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const initialRoom = mockRooms[mockRooms.length - 1]

      initialRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      await vi.advanceTimersByTimeAsync(25_000) // heartbeat timeout

      // Advance enough total time for all reconnect cycles to complete
      // Each cycle: backoff delay + 25s heartbeat timeout + async TURN race
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(50_000)
      }

      expect(service.connectionState).toBe('disconnected')
      expect(service.reconnectAttempts).toBeGreaterThanOrEqual(10)

      const callsBefore = mockJoinRoom.mock.calls.length
      await vi.advanceTimersByTimeAsync(120_000) // Should not reconnect further
      expect(mockJoinRoom.mock.calls.length).toBe(callsBefore)
    }, 15_000)

    it('organizer does not auto-reconnect', async () => {
      const service = new P2PService('organizer')
      service.startHosting('test-room')
      await flush()

      // Organizer should not schedule reconnect even if state changes
      service.leave()
      vi.advanceTimersByTime(120_000)
      expect(mockJoinRoom).toHaveBeenCalledTimes(1) // Only the original
    })

    it('uses exponential backoff for reconnect delays', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const room0 = mockRooms[mockRooms.length - 1]

      room0._simulateReceive('heartbeat', { ts: Date.now() }, 'host')
      room0._simulatePeerJoin('host')
      vi.advanceTimersByTime(25_000) // host-offline
      expect(service.connectionState).toBe('host-offline')

      // 1st reconnect: 2s backoff → ICE restart (peers exist)
      vi.advanceTimersByTime(2000)
      await flush()
      expect(service.reconnectAttempts).toBe(1)
      expect(service.connectionState).toBe('reconnecting')

      // ICE restart didn't help → times out again
      vi.advanceTimersByTime(25_000)

      // 2nd reconnect: 4s backoff → full teardown
      vi.advanceTimersByTime(4000)
      await flush()
      expect(service.reconnectAttempts).toBe(2)
    })

    it('tries ICE restart before full teardown when peers exist', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const room0 = mockRooms[mockRooms.length - 1]

      room0._simulateReceive('heartbeat', { ts: Date.now() }, 'host')
      room0._simulatePeerJoin('host')
      const roomsBefore = mockRooms.length

      // Host goes offline → 1st attempt triggers ICE restart
      vi.advanceTimersByTime(25_000)
      vi.advanceTimersByTime(2000)
      await flush()
      expect(service.reconnectAttempts).toBe(1)
      expect(service.connectionState).toBe('reconnecting')

      // ICE restart was called on the peer connection
      const peerConns = room0.getPeers()
      expect(peerConns['host'].restartIce).toHaveBeenCalledTimes(1)

      // No new room was created (ICE restart reuses existing connection)
      expect(mockRooms.length).toBe(roomsBefore)
    })

    it('clears stale peers on full teardown reconnect', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const room0 = mockRooms[mockRooms.length - 1]

      room0._simulateReceive('heartbeat', { ts: Date.now() }, 'host')
      room0._simulatePeerJoin('peer-a')
      room0._simulatePeerJoin('peer-b')
      expect(service.getPeers()).toHaveLength(2)

      const onChange = vi.fn()
      service.onPeersChange = onChange

      // Host goes offline → 1st attempt is ICE restart (peers still exist)
      vi.advanceTimersByTime(25_000)
      vi.advanceTimersByTime(2000)
      await flush()
      expect(service.reconnectAttempts).toBe(1)
      expect(service.getPeers()).toHaveLength(2) // ICE restart preserves peers

      // ICE restart fails → 2nd attempt is full teardown
      vi.advanceTimersByTime(25_000)
      vi.advanceTimersByTime(4000)
      await flush()
      expect(service.connectionState).toBe('reconnecting')
      expect(service.getPeers()).toHaveLength(0)
      expect(onChange).toHaveBeenCalled()
    })

    it('does not auto-reconnect after manual leave', async () => {
      const service = new P2PService('viewer')
      service.joinRoom('test-room')
      await flush()
      const initialRoom = mockRooms[mockRooms.length - 1]

      initialRoom._simulateReceive('heartbeat', { ts: Date.now() }, 'host-peer')
      service.leave()

      vi.advanceTimersByTime(60000) // No reconnect after manual leave
      expect(mockJoinRoom).toHaveBeenCalledTimes(1) // Only the original
    })
  })

  describe('RPC actions', () => {
    it('registers rpc-request and rpc-response actions when joining a room', async () => {
      const service = new P2PService('organizer')
      service.startHosting('rpc-room')
      await flush()

      const room = mockRooms[mockRooms.length - 1]
      expect(room._getSendFn('rpc-request')).toBeDefined()
      expect(room._getSendFn('rpc-response')).toBeDefined()
    })

    it('calls onRpcRequest when an rpc-request is received', async () => {
      const service = new P2PService('organizer')
      service.startHosting('rpc-room')
      await flush()

      const received: { req: unknown; peerId: string }[] = []
      service.onRpcRequest = (req, peerId) => {
        received.push({ req, peerId })
      }

      const room = mockRooms[mockRooms.length - 1]
      room._simulateReceive(
        'rpc-request',
        { id: 1, method: 'tournaments.create', args: [{}] },
        'peer-1',
      )

      expect(received).toHaveLength(1)
      expect(received[0].req).toEqual({ id: 1, method: 'tournaments.create', args: [{}] })
      expect(received[0].peerId).toBe('peer-1')
    })

    it('sends rpc-response to a specific peer', async () => {
      const service = new P2PService('organizer')
      service.startHosting('rpc-room')
      await flush()

      const room = mockRooms[mockRooms.length - 1]
      service.sendRpcResponse({ id: 1, result: { name: 'Test' } }, 'peer-1')

      expect(room._getSendFn('rpc-response')).toHaveBeenCalledWith(
        { id: 1, result: { name: 'Test' } },
        'peer-1',
      )
    })
  })

  describe('data-changed', () => {
    it('registers data-changed action and broadcasts to all peers', async () => {
      const service = new P2PService('organizer')
      service.startHosting('sync-room')
      await flush()

      const room = mockRooms[mockRooms.length - 1]
      service.broadcastDataChanged()

      expect(room._getSendFn('data-changed')).toHaveBeenCalledWith({ ts: expect.any(Number) }, null)
    })

    it('fires onDataChanged when data-changed action is received', async () => {
      const service = new P2PService('viewer')
      const callback = vi.fn()
      service.onDataChanged = callback

      service.joinRoom('sync-room')
      await flush()

      const room = mockRooms[mockRooms.length - 1]
      room._simulateReceive('data-changed', { ts: Date.now() }, 'host-peer')

      expect(callback).toHaveBeenCalledOnce()
    })
  })
})
