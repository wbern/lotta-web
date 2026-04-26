// @vitest-environment jsdom
import { joinRoom } from '@trystero-p2p/mqtt'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultSubmitMessage } from '../types/p2p.ts'
import { P2PService } from './p2p-service.ts'

type PeerCallback = (id: string) => void

function createMockRoom() {
  const handlers: Record<string, PeerCallback> = {}
  const actions: Record<
    string,
    { send: ReturnType<typeof vi.fn>; receive: ReturnType<typeof vi.fn> }
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
    getPeers: () => ({}),
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
  defaultRelayUrls: ['wss://relay1.test'],
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

async function flush() {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('P2PService beforeunload guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRooms.length = 0
  })
  afterEach(() => {
    // Belt-and-braces: clear any lingering listeners between tests.
    window.onbeforeunload = null
  })

  it('blocks page unload while submissions are pending', async () => {
    const mockRoom = createMockRoom()
    mockJoinRoom.mockReturnValueOnce(mockRoom as unknown as ReturnType<typeof joinRoom>)
    const service = new P2PService('referee')
    service.joinRoom('test-room')
    await flush()

    const empty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(empty)
    expect(empty.defaultPrevented).toBe(false)

    const submission: ResultSubmitMessage = {
      tournamentId: 1,
      roundNr: 2,
      boardNr: 3,
      resultType: 'WHITE_WIN',
      refereeName: 'Anna',
      timestamp: Date.now(),
    }
    service.submitResult(submission)

    const blocked = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)

    service.leave()
  })
})
