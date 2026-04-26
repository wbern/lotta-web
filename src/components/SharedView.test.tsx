// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getClientP2PState, resetClientStore } from '../stores/client-p2p-store'
import { SharedView } from './SharedView'

let mockJoinRoomCalls: string[] = []
let mockOnConnectionStateChange: ((state: string) => void) | null = null
let mockOnRpcResponse: ((res: unknown) => void) | null = null
let mockOnDataChanged: (() => void) | null = null
let mockOnChatMessage: ((msg: unknown, peerId: string) => void) | null = null
let mockOnChatDelete: ((msg: { id: string }) => void) | null = null
let mockOnAnnouncement: ((msg: { text: string; timestamp: number }) => void) | null = null
let mockOnKicked: (() => void) | null = null
let mockOnPeerCount:
  | ((msg: { total: number; viewers: number; referees: number; chatEnabled?: boolean }) => void)
  | null = null
let mockOnDiagnosticEvent: ((entry: { timestamp: number; message: string }) => void) | null = null
let mockOnPendingChange: ((pending: unknown[]) => void) | null = null
const mockSendRpcRequest = vi.fn()
const mockLeave = vi.fn()
const mockNavigate = vi.fn()
const mockSetLiveStatus = vi.fn()

vi.mock('../hooks/useLiveStatus', () => ({
  setLiveStatus: (s: unknown) => mockSetLiveStatus(s),
}))

vi.mock('../services/p2p-service', () => {
  return {
    P2PService: class {
      joinRoom(roomCode: string) {
        mockJoinRoomCalls.push(roomCode)
      }

      leave() {
        mockLeave()
      }

      getPeers() {
        return [{ id: 'peer-1', role: 'organizer', label: 'Värd', connectedAt: 0, verified: true }]
      }

      sendRpcRequest(...args: unknown[]) {
        mockSendRpcRequest(...args)
      }

      set onRpcResponse(cb: typeof mockOnRpcResponse) {
        mockOnRpcResponse = cb
      }
      get onRpcResponse() {
        return mockOnRpcResponse
      }
      set onConnectionStateChange(cb: typeof mockOnConnectionStateChange) {
        mockOnConnectionStateChange = cb
      }
      get onConnectionStateChange() {
        return mockOnConnectionStateChange
      }
      set onDataChanged(cb: typeof mockOnDataChanged) {
        mockOnDataChanged = cb
      }
      get onDataChanged() {
        return mockOnDataChanged
      }
      set onPageUpdate(_cb: unknown) {}
      get onPageUpdate() {
        return null
      }
      set onResultSubmit(_cb: unknown) {}
      get onResultSubmit() {
        return null
      }
      set onResultAck(_cb: unknown) {}
      get onResultAck() {
        return null
      }
      set onPeersChange(_cb: unknown) {}
      get onPeersChange() {
        return null
      }
      set onNewPeerJoin(_cb: unknown) {}
      get onNewPeerJoin() {
        return null
      }
      set onChatMessage(cb: typeof mockOnChatMessage) {
        mockOnChatMessage = cb
      }
      get onChatMessage() {
        return mockOnChatMessage
      }
      set onChatDelete(cb: typeof mockOnChatDelete) {
        mockOnChatDelete = cb
      }
      get onChatDelete() {
        return mockOnChatDelete
      }
      set onAnnouncement(cb: typeof mockOnAnnouncement) {
        mockOnAnnouncement = cb
      }
      get onAnnouncement() {
        return mockOnAnnouncement
      }
      set onKicked(cb: typeof mockOnKicked) {
        mockOnKicked = cb
      }
      get onKicked() {
        return mockOnKicked
      }
      set onPeerCount(cb: typeof mockOnPeerCount) {
        mockOnPeerCount = cb
      }
      get onPeerCount() {
        return mockOnPeerCount
      }
      set onRpcRequest(_cb: unknown) {}
      get onRpcRequest() {
        return null
      }
      set onDiagnosticEvent(cb: typeof mockOnDiagnosticEvent) {
        mockOnDiagnosticEvent = cb
      }
      get onDiagnosticEvent() {
        return mockOnDiagnosticEvent
      }
      set onPendingChange(cb: typeof mockOnPendingChange) {
        mockOnPendingChange = cb
      }
      get onPendingChange() {
        return mockOnPendingChange
      }
      getPendingSubmissions() {
        return []
      }
    },
  }
})

vi.mock('../api/p2p-data-provider', async () => {
  const actual = await vi.importActual('../api/p2p-data-provider')
  return actual
})

vi.mock('../api/active-provider', () => ({
  setActiveDataProvider: vi.fn(),
}))

const mockSetP2PService = vi.fn()
const mockClearP2PService = vi.fn()
vi.mock('../services/p2p-provider', () => ({
  setP2PService: (...args: unknown[]) => mockSetP2PService(...args),
  clearP2PService: () => mockClearP2PService(),
}))

vi.mock('../lib/notification-sounds', () => ({
  playSound: vi.fn(),
}))

const mockGetCompatWarnings = vi.fn(
  () => [] as { id: string; severity: string; message: string; suggestion: string }[],
)
vi.mock('../lib/device-compat', () => ({
  getCompatWarnings: () => mockGetCompatWarnings(),
}))

const { mockInvalidateQueries, mockResumePausedMutations } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockResumePausedMutations: vi.fn(),
}))
vi.mock('../query-client', () => ({
  queryClient: {
    invalidateQueries: mockInvalidateQueries,
    resumePausedMutations: mockResumePausedMutations,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

afterEach(cleanup)

describe('SharedView', () => {
  beforeEach(() => {
    mockGetCompatWarnings.mockReturnValue([])
    mockJoinRoomCalls = []
    mockOnConnectionStateChange = null
    mockOnRpcResponse = null
    mockOnDataChanged = null
    mockOnChatMessage = null
    mockOnChatDelete = null
    mockOnAnnouncement = null
    mockOnKicked = null
    mockOnPeerCount = null
    mockOnDiagnosticEvent = null
    mockOnPendingChange = null
    mockSetLiveStatus.mockReset()
    mockNavigate.mockReset()
    mockLeave.mockReset()
    mockSetP2PService.mockReset()
    mockClearP2PService.mockReset()
    mockInvalidateQueries.mockReset()
    mockResumePausedMutations.mockReset()
    resetClientStore()
    localStorage.setItem('lotta-live-name', 'Test User')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows connecting screen and joins room on mount', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    expect(screen.getByText(/Förbereder anslutning/)).toBeTruthy()
    expect(mockJoinRoomCalls).toContain('ABC123')
  })

  it('shows name entry gate for full-mode when no stored name', () => {
    localStorage.removeItem('lotta-live-name')
    render(<SharedView roomCode="ABC123" token="tok-1" mode="full" />)

    expect(screen.getByPlaceholderText('Ditt namn')).toBeTruthy()
    expect(mockJoinRoomCalls).toEqual([])

    fireEvent.change(screen.getByPlaceholderText('Ditt namn'), { target: { value: 'Anna' } })
    fireEvent.click(screen.getByText('Anslut'))

    expect(mockJoinRoomCalls).toEqual(['ABC123'])
    expect(localStorage.getItem('lotta-live-name')).toBe('Anna')
  })

  it('keeps Anslut disabled and does not join on empty input', () => {
    localStorage.removeItem('lotta-live-name')
    render(<SharedView roomCode="ABC123" token="tok-1" mode="full" />)

    const button = screen.getByText('Anslut') as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.click(button)
    expect(mockJoinRoomCalls).toEqual([])
    expect(localStorage.getItem('lotta-live-name')).toBeNull()
  })

  it('skips name entry gate for view-mode (Avläsare)', () => {
    localStorage.removeItem('lotta-live-name')
    render(<SharedView roomCode="ABC123" token="tok-1" mode="view" />)

    expect(screen.queryByPlaceholderText('Ditt namn')).toBeNull()
    expect(mockJoinRoomCalls).toEqual(['ABC123'])
  })

  it('sets active provider and wires up RPC on mount', async () => {
    const { setActiveDataProvider } = await import('../api/active-provider')
    render(<SharedView roomCode="ABC123" token="tok-1" />)
    expect(setActiveDataProvider).toHaveBeenCalled()
  })

  it('navigates to app route after P2P connection succeeds', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/',
      search: { tournamentId: undefined, round: undefined, tab: 'pairings' },
    })
  })

  it('wires up RPC so provider calls go through P2P service', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    expect(mockOnRpcResponse).not.toBeNull()
  })

  it('resumes paused mutations when connection state becomes connected', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    expect(mockResumePausedMutations).toHaveBeenCalled()
  })

  it('resumes paused mutations on reconnect (not just initial connect)', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })
    mockResumePausedMutations.mockReset()

    act(() => {
      mockOnConnectionStateChange?.('reconnecting')
    })
    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    expect(mockResumePausedMutations).toHaveBeenCalled()
  })

  it('invalidates queries when host broadcasts data-changed', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    expect(mockOnDataChanged).not.toBeNull()

    act(() => {
      mockOnDataChanged?.()
    })

    expect(mockInvalidateQueries).toHaveBeenCalled()
  })

  it('registers P2PService globally on mount', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)
    expect(mockSetP2PService).toHaveBeenCalled()
  })

  it('wires onChatMessage that appends to client store', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)
    expect(mockOnChatMessage).not.toBeNull()

    act(() => {
      mockOnChatMessage?.(
        {
          id: 'msg-1',
          senderName: 'Värd',
          senderRole: 'organizer',
          text: 'Hej!',
          timestamp: Date.now(),
        },
        'peer-1',
      )
    })

    const state = getClientP2PState()
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].text).toBe('Hej!')
    expect(state.unreadChat).toBe(1)
  })

  it('wires onChatDelete that removes from client store', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnChatMessage?.(
        { id: 'del-target', senderName: 'A', senderRole: 'viewer', text: 'x', timestamp: 1 },
        'peer-1',
      )
    })
    expect(getClientP2PState().chatMessages).toHaveLength(1)

    act(() => {
      mockOnChatDelete?.({ id: 'del-target' })
    })
    expect(getClientP2PState().chatMessages).toHaveLength(0)
  })

  it('wires onAnnouncement that sets announcement in client store', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnAnnouncement?.({ text: 'Rond 2 börjar!', timestamp: Date.now() })
    })

    expect(getClientP2PState().announcement?.text).toBe('Rond 2 börjar!')
  })

  it('wires onKicked that sets kicked state and cleans up', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnKicked?.()
    })

    expect(getClientP2PState().kicked).toBe(true)
    expect(mockLeave).toHaveBeenCalled()
    expect(mockClearP2PService).toHaveBeenCalled()
  })

  it('wires onPeerCount that updates peer count in client store', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnPeerCount?.({ total: 5, viewers: 3, referees: 2, chatEnabled: false })
    })

    const state = getClientP2PState()
    expect(state.peerCount?.total).toBe(5)
    expect(state.chatEnabled).toBe(false)
  })

  it('wires onDiagnosticEvent that appends to diagnostic log', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnDiagnosticEvent?.({ timestamp: Date.now(), message: 'Joining room' })
    })

    expect(getClientP2PState().diagnosticLog).toHaveLength(1)
  })

  it('sets shareMode in store for view-mode connections', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" mode="view" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    const state = getClientP2PState()
    expect(state.shareMode).toBe('view')
  })

  it('stores the incoming code prop as pendingClubCode on mount', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" mode="view" code="123456" />)

    expect(getClientP2PState().pendingClubCode).toBe('123456')
  })

  it('does not touch pendingClubCode when no code prop is provided', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" mode="view" />)

    expect(getClientP2PState().pendingClubCode).toBeNull()
  })

  it('resets client store on disconnect', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    // Put some state in the store first
    act(() => {
      mockOnChatMessage?.(
        { id: 'x', senderName: 'A', senderRole: 'viewer', text: 'hi', timestamp: 1 },
        'peer-1',
      )
      mockOnConnectionStateChange?.('connected')
    })
    expect(getClientP2PState().chatMessages).toHaveLength(1)

    act(() => {
      mockOnConnectionStateChange?.('disconnected')
    })

    expect(getClientP2PState().chatMessages).toHaveLength(0)
    expect(mockClearP2PService).toHaveBeenCalled()
  })

  it('does not attempt P2P connection when blocking compat warning exists', () => {
    mockGetCompatWarnings.mockReturnValue([
      { id: 'opera-mini', severity: 'blocking', message: 'No WebRTC', suggestion: 'Use Chrome' },
    ])
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    expect(mockJoinRoomCalls).toHaveLength(0)
    expect(mockSetP2PService).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
    const countdown = screen.getByText(/\(\d+s\)/)
    expect(countdown.closest('.connecting-countdown')!.getAttribute('style')).toContain('hidden')
  })

  it('connects when user clicks override on blocked screen', () => {
    mockGetCompatWarnings.mockReturnValue([
      { id: 'opera-mini', severity: 'blocking', message: 'No WebRTC', suggestion: 'Use Chrome' },
    ])
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    expect(mockJoinRoomCalls).toHaveLength(0)

    const override = screen.getByText('Försök ansluta ändå')
    act(() => {
      override.click()
    })

    expect(mockJoinRoomCalls).toContain('ABC123')
    expect(mockSetP2PService).toHaveBeenCalled()
  })

  it('navigates to main app when user clicks solo mode on blocked screen', () => {
    mockGetCompatWarnings.mockReturnValue([
      { id: 'opera-mini', severity: 'blocking', message: 'Blocked', suggestion: 'Use Chrome' },
    ])
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    const solo = screen.getByText('Använd Lotta själv')
    act(() => {
      solo.click()
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/',
      search: { tournamentId: undefined, round: undefined, tab: 'pairings' },
    })
    expect(mockJoinRoomCalls).toHaveLength(0)
  })

  it('fills the logo progressively as connection stages advance', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    const fill = () => screen.getByTestId('logo-fill')

    // init stage — no fill
    expect(fill().style.clipPath).toBe('inset(100% 0 0 0)')

    // Diagnostic: joining room → turn stage
    act(() => {
      mockOnDiagnosticEvent?.({ timestamp: Date.now(), message: 'Joining room "abc123"' })
    })
    expect(fill().style.clipPath).toBe('inset(75% 0 0 0)')

    // Diagnostic: TURN status → room stage
    act(() => {
      mockOnDiagnosticEvent?.({ timestamp: Date.now(), message: 'TURN: ok (3 servers)' })
    })
    expect(fill().style.clipPath).toBe('inset(50% 0 0 0)')

    // Diagnostic: peer joined → heartbeat stage
    act(() => {
      mockOnDiagnosticEvent?.({ timestamp: Date.now(), message: 'Peer joined: abc12345...' })
    })
    expect(fill().style.clipPath).toBe('inset(25% 0 0 0)')

    // Connection state → connected
    act(() => {
      mockOnConnectionStateChange?.('connected')
    })
    expect(fill().style.clipPath).toBe('inset(0% 0 0 0)')
  })

  it('forwards pending submission count to setLiveStatus when onPendingChange fires', () => {
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })
    mockSetLiveStatus.mockReset()

    act(() => {
      mockOnPendingChange?.([
        { roundNr: 1, boardNr: 2 },
        { roundNr: 1, boardNr: 3 },
      ])
    })

    const calls = mockSetLiveStatus.mock.calls
    const lastCall = calls[calls.length - 1]?.[0] as { pendingCount?: number } | undefined
    expect(lastCall?.pendingCount).toBe(2)
  })

  it('shows solo mode link alongside warning when connection proceeds', () => {
    mockGetCompatWarnings.mockReturnValue([
      { id: 'amazon-silk', severity: 'warning', message: 'May fail', suggestion: 'Try Chrome' },
    ])
    render(<SharedView roomCode="ABC123" token="tok-1" />)

    expect(mockJoinRoomCalls).toContain('ABC123')
    expect(screen.getByText('Använd Lotta själv')).toBeTruthy()
    expect(screen.queryByText('Anslut ändå')).toBeNull()
  })
})
