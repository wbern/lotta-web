// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateClubCode } from '../../domain/club-codes'
import type {
  AuditLogEntry,
  ChatDeleteMessage,
  ChatMessage,
  ResultSubmitMessage,
} from '../../types/p2p'
import { LiveTab } from './LiveTab'

let mockStartHostingCalls: string[] = []
let mockLeaveCalled = false
let mockOnResultSubmit: ((msg: ResultSubmitMessage, peerId: string) => void) | null = null
let mockOnPeersChange: (() => void) | null = null
let mockOnNewPeerJoin: ((peerId: string) => void) | null = null
let mockConnectionState = 'disconnected'
let mockPeers: { id: string; role: string; connectedAt: number; label?: string }[] = []
let mockRoomId: string | null = null
let mockConstructorArgs: unknown[] = []
let mockOnChatMessage: ((msg: ChatMessage, peerId: string) => void) | null = null
let mockBroadcastChatMessageCalls: ChatMessage[] = []
let mockSendChatToPeerCalls: { msg: ChatMessage; peerId: string }[] = []
let mockBroadcastChatDeleteCalls: ChatDeleteMessage[] = []

vi.mock('../../services/p2p-service', () => {
  return {
    P2PService: class {
      connectionState = mockConnectionState
      role = 'organizer'
      roomId = mockRoomId

      constructor(...args: unknown[]) {
        mockConstructorArgs = args
      }

      startHosting(roomId: string) {
        this.connectionState = 'connected'
        this.roomId = roomId
        mockConnectionState = 'connected'
        mockRoomId = roomId
        mockStartHostingCalls.push(roomId)
      }

      leave() {
        this.connectionState = 'disconnected'
        this.roomId = null
        mockConnectionState = 'disconnected'
        mockRoomId = null
        mockLeaveCalled = true
      }

      getPeers() {
        return mockPeers
      }

      set onPageUpdate(_cb: unknown) {}
      get onPageUpdate() {
        return null
      }

      set onResultSubmit(cb: ((msg: ResultSubmitMessage, peerId: string) => void) | null) {
        mockOnResultSubmit = cb
      }
      get onResultSubmit() {
        return mockOnResultSubmit
      }

      set onResultAck(_cb: unknown) {}
      get onResultAck() {
        return null
      }

      set onPeersChange(cb: (() => void) | null) {
        mockOnPeersChange = cb
      }
      get onPeersChange() {
        return mockOnPeersChange
      }

      set onNewPeerJoin(cb: ((peerId: string) => void) | null) {
        mockOnNewPeerJoin = cb
      }
      get onNewPeerJoin() {
        return mockOnNewPeerJoin
      }

      set onChatMessage(cb: ((msg: ChatMessage, peerId: string) => void) | null) {
        mockOnChatMessage = cb
      }
      get onChatMessage() {
        return mockOnChatMessage
      }

      broadcastPeerCount() {}
      broadcastAnnouncement() {}
      broadcastChatMessage(msg: ChatMessage) {
        mockBroadcastChatMessageCalls.push(msg)
      }
      sendChatMessageToPeer(msg: ChatMessage, peerId: string) {
        mockSendChatToPeerCalls.push({ msg, peerId })
      }
      broadcastChatDelete(msg: ChatDeleteMessage) {
        mockBroadcastChatDeleteCalls.push(msg)
      }
      kickPeer() {}
      set onPeerToken(_cb: unknown) {}
      get onPeerToken() {
        return null
      }
    },
  }
})

vi.mock('../../services/p2p-provider', () => ({
  setP2PService: vi.fn(),
  clearP2PService: vi.fn(),
  getP2PService: vi.fn(),
}))

vi.mock('../../api/p2p-broadcast', () => ({
  handleResultSubmission: vi.fn(),
  sendCurrentStateToPeer: vi.fn(),
}))

vi.mock('../../api/p2p-data-provider', async () => {
  const actual = await vi.importActual('../../api/p2p-data-provider')
  return {
    ...actual,
    startP2pRpcServer: vi.fn(),
  }
})

vi.mock('../../hooks/useLiveStatus', () => ({
  setLiveStatus: vi.fn(),
}))

const mockTournamentPlayers = [
  { id: 1, firstName: 'Anna', lastName: 'Svensson', club: 'Skara SK', clubIndex: 1 },
  { id: 2, firstName: 'Erik', lastName: 'Johansson', club: 'Lidköping SS', clubIndex: 2 },
  { id: 3, firstName: 'Maria', lastName: 'Lindberg', club: 'Skara SK', clubIndex: 1 },
  { id: 4, firstName: 'Karl', lastName: 'Nilsson', club: 'Lidköping SS', clubIndex: 2 },
  { id: 5, firstName: 'Nils', lastName: 'Persson', club: null, clubIndex: 0 },
]

vi.mock('../../hooks/useTournamentPlayers', () => ({
  useTournamentPlayers: vi.fn(() => ({ data: mockTournamentPlayers })),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}))

const mockPlaySound = vi.fn()
vi.mock('../../lib/notification-sounds', () => ({
  playSound: (...args: unknown[]) => mockPlaySound(...args),
}))

afterEach(cleanup)

function renderLiveTab(
  props?: Partial<{
    tournamentName: string
    tournamentId: number
    round: number | undefined
  }>,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const merged = {
    tournamentName: 'Test',
    tournamentId: 1,
    round: 1 as number | undefined,
    ...props,
  }
  return render(
    <QueryClientProvider client={qc}>
      <LiveTab
        tournamentName={merged.tournamentName}
        tournamentId={merged.tournamentId}
        round={merged.round}
      />
    </QueryClientProvider>,
  )
}

describe('LiveTab', () => {
  beforeEach(() => {
    mockStartHostingCalls = []
    mockLeaveCalled = false
    mockOnResultSubmit = null
    mockOnPeersChange = null
    mockOnNewPeerJoin = null
    mockOnChatMessage = null
    mockBroadcastChatMessageCalls = []
    mockSendChatToPeerCalls = []
    mockBroadcastChatDeleteCalls = []
    mockConnectionState = 'disconnected'
    mockPeers = []
    mockRoomId = null
    mockConstructorArgs = []
    mockPlaySound.mockClear()
    sessionStorage.clear()
  })

  it('shows start hosting button when not hosting', () => {
    renderLiveTab()
    expect(screen.getByText('Starta Live')).toBeTruthy()
  })

  it('starts hosting when button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    expect(mockStartHostingCalls.length).toBeGreaterThan(0)
  })

  it('shows room code and QR after starting', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    expect(screen.getByTestId('qr-code')).toBeTruthy()
    expect(screen.getByText('Stoppa Live')).toBeTruthy()
  })

  it('stops hosting when stop button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByText('Stoppa Live'))
    expect(mockLeaveCalled).toBe(true)
    expect(screen.getByText('Starta Live')).toBeTruthy()
  })

  it('generates a 6-char alphanumeric room code', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    expect(mockStartHostingCalls[0]).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it('cleans up P2P service on unmount', () => {
    const { unmount } = renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    unmount()
    expect(mockLeaveCalled).toBe(true)
  })

  it('displays peers when onPeersChange fires', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [
        { id: 'peer-abc12345', role: 'viewer', connectedAt: Date.now() - 5000 },
        { id: 'peer-def67890', role: 'referee', connectedAt: Date.now() - 120000 },
      ]
      mockOnPeersChange?.()
    })

    // Should show peer table
    expect(screen.getByText('Peer')).toBeTruthy() // table header
    expect(screen.getByText('peer-abc...')).toBeTruthy() // truncated id (slice 0,8)
    expect(screen.getByText('peer-def...')).toBeTruthy()
    // Should show roles
    const roles = screen.getAllByText('Åskådare')
    expect(roles.length).toBeGreaterThanOrEqual(1)
    // "Domare" appears in the peer role column
    const domareElements = screen.getAllByText('Domare')
    expect(domareElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows referee count in badge when referees are connected', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [
        { id: 'v1', role: 'viewer', connectedAt: Date.now() },
        { id: 'r1', role: 'referee', connectedAt: Date.now() },
        { id: 'r2', role: 'referee', connectedAt: Date.now() },
      ]
      mockOnPeersChange?.()
    })

    expect(screen.getByText(/3 anslutna/)).toBeTruthy()
    // "2 domare" appears in both badge and summary — check the badge specifically
    const badge = screen.getByText(/anslutna/).closest('.live-tab-badge')!
    expect(badge.textContent).toContain('2 domare')
  })

  it('shows peer summary with viewer and referee counts', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [
        { id: 'v1', role: 'viewer', connectedAt: Date.now() },
        { id: 'r1', role: 'referee', connectedAt: Date.now() },
      ]
      mockOnPeersChange?.()
    })

    expect(screen.getByText(/1 åskådare, 1 domare/)).toBeTruthy()
  })

  it('shows waiting message when no peers are connected', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(screen.getByText('Väntar på anslutningar...')).toBeTruthy()
  })

  it('shows peer label instead of truncated ID when available', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'peer-abc12345', role: 'referee', connectedAt: Date.now(), label: 'Anna' }]
      mockOnPeersChange?.()
    })

    expect(screen.getByText('Anna')).toBeTruthy()
  })

  it('generates spectator URL with random room code in QR code', () => {
    renderLiveTab({ tournamentName: 'Cup' })
    fireEvent.click(screen.getByText('Starta Live'))

    const qr = screen.getByTestId('qr-code')
    expect(qr.textContent).toContain('/live/')
    expect(qr.textContent).not.toContain('lotta-t5')
  })

  it('registers onPeersChange callback on start', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(mockOnPeersChange).not.toBeNull()
  })

  it('passes referee token to P2PService constructor', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Constructor should be called with ('organizer', token)
    expect(mockConstructorArgs[0]).toBe('organizer')
    expect(mockConstructorArgs[1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('sends current state to newly joined peer', async () => {
    const { sendCurrentStateToPeer } = await import('../../api/p2p-broadcast')
    const mockSend = vi.mocked(sendCurrentStateToPeer)
    mockSend.mockClear()

    renderLiveTab({ tournamentId: 5, round: 3 })
    fireEvent.click(screen.getByText('Starta Live'))

    expect(mockOnNewPeerJoin).not.toBeNull()

    act(() => {
      mockOnNewPeerJoin?.('new-peer-123')
    })

    expect(mockSend).toHaveBeenCalledWith('new-peer-123', 5, 3)
  })

  it('does not send state to new peer when no round is active', async () => {
    const { sendCurrentStateToPeer } = await import('../../api/p2p-broadcast')
    const mockSend = vi.mocked(sendCurrentStateToPeer)
    mockSend.mockClear()

    renderLiveTab({ tournamentId: 5, round: undefined })
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockOnNewPeerJoin?.('new-peer-456')
    })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows Dela vy sub-tab when hosting and switching to it does not destroy session', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Dela vy sub-tab should be visible when hosting
    const delaVyTab = screen.getByRole('tab', { name: 'Dela vy' })
    expect(delaVyTab).toBeTruthy()

    // Switch to Dela vy sub-tab
    mockLeaveCalled = false
    fireEvent.click(delaVyTab)

    // P2P session should NOT have been torn down
    expect(mockLeaveCalled).toBe(false)

    // Should still show the stop button (session is alive)
    expect(screen.getByText('Stoppa Live')).toBeTruthy()
  })

  it('clears peers on stop hosting', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'v1', role: 'viewer', connectedAt: Date.now() }]
      mockOnPeersChange?.()
    })

    expect(screen.getByText('v1...')).toBeTruthy()

    fireEvent.click(screen.getByText('Stoppa Live'))
    // Back to start state — no peer table
    expect(screen.getByText('Starta Live')).toBeTruthy()
  })

  it('shows system message in chat when result is submitted', async () => {
    const { handleResultSubmission } = await import('../../api/p2p-broadcast')
    const mockHandle = vi.mocked(handleResultSubmission)
    mockHandle.mockClear()
    mockHandle.mockImplementation((_msg, _peerId, onLog) => {
      onLog?.({
        timestamp: 1000,
        refereeName: 'Anna',
        boardNr: 3,
        roundNr: 1,
        resultType: 'WHITE_WIN',
        accepted: true,
      } as AuditLogEntry)
      return Promise.resolve()
    })

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Switch to Chatt tab
    fireEvent.click(screen.getByRole('tab', { name: /Chatt/ }))

    // Trigger result submit
    act(() => {
      mockOnResultSubmit?.(
        {
          tournamentId: 1,
          roundNr: 1,
          boardNr: 3,
          resultType: 'WHITE_WIN',
          refereeName: 'Anna',
          timestamp: 1000,
        },
        'ref-peer',
      )
    })

    // System message should appear in chat
    expect(screen.getByText(/Anna rapporterade 1-0 på bord 3/)).toBeTruthy()

    // Should have broadcast the system message
    expect(mockBroadcastChatMessageCalls).toHaveLength(1)
    expect(mockBroadcastChatMessageCalls[0].isSystem).toBe(true)
    expect(mockBroadcastChatMessageCalls[0].text).toContain('Anna rapporterade 1-0 på bord 3')
  })

  it('uses the audit resultDisplay so Schack4an chat messages render as 3-1 not 1-0', async () => {
    const { handleResultSubmission } = await import('../../api/p2p-broadcast')
    const mockHandle = vi.mocked(handleResultSubmission)
    mockHandle.mockClear()
    mockHandle.mockImplementation((_msg, _peerId, onLog) => {
      onLog?.({
        timestamp: 1000,
        refereeName: 'Anna',
        boardNr: 3,
        roundNr: 1,
        resultType: 'WHITE_WIN',
        resultDisplay: '3-1',
        accepted: true,
      } as AuditLogEntry)
      return Promise.resolve()
    })

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: /Chatt/ }))

    act(() => {
      mockOnResultSubmit?.(
        {
          tournamentId: 1,
          roundNr: 1,
          boardNr: 3,
          resultType: 'WHITE_WIN',
          resultDisplay: '3-1',
          refereeName: 'Anna',
          timestamp: 1000,
        },
        'ref-peer',
      )
    })

    expect(screen.getByText(/Anna rapporterade 3-1 på bord 3/)).toBeTruthy()
    expect(mockBroadcastChatMessageCalls[0].text).toContain('Anna rapporterade 3-1 på bord 3')
  })

  it('shows rejection in system message when result is rejected', async () => {
    const { handleResultSubmission } = await import('../../api/p2p-broadcast')
    const mockHandle = vi.mocked(handleResultSubmission)
    mockHandle.mockClear()
    mockHandle.mockImplementation((_msg, _peerId, onLog) => {
      onLog?.({
        timestamp: 1000,
        refereeName: 'Erik',
        boardNr: 5,
        roundNr: 2,
        resultType: 'DRAW',
        accepted: false,
        reason: 'Not authorized',
      } as AuditLogEntry)
      return Promise.resolve()
    })

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: /Chatt/ }))

    act(() => {
      mockOnResultSubmit?.(
        {
          tournamentId: 1,
          roundNr: 2,
          boardNr: 5,
          resultType: 'DRAW',
          refereeName: 'Erik',
          timestamp: 1000,
        },
        'bad-peer',
      )
    })

    expect(screen.getByText(/Erik.*½-½ bord 5 — Not authorized/)).toBeTruthy()
    expect(mockBroadcastChatMessageCalls[0].isSystem).toBe(true)
  })

  it('renders system messages with system styling', async () => {
    const { handleResultSubmission } = await import('../../api/p2p-broadcast')
    const mockHandle = vi.mocked(handleResultSubmission)
    mockHandle.mockClear()
    mockHandle.mockImplementation((_msg, _peerId, onLog) => {
      onLog?.({
        timestamp: 1000,
        refereeName: 'Anna',
        boardNr: 1,
        roundNr: 1,
        resultType: 'BLACK_WIN',
        accepted: true,
      } as AuditLogEntry)
      return Promise.resolve()
    })

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: /Chatt/ }))

    act(() => {
      mockOnResultSubmit?.(
        {
          tournamentId: 1,
          roundNr: 1,
          boardNr: 1,
          resultType: 'BLACK_WIN',
          refereeName: 'Anna',
          timestamp: 1000,
        },
        'ref-peer',
      )
    })

    // Should have system CSS class
    const systemText = screen.getByText(/Anna rapporterade 0-1 på bord 1/)
    const messageDiv = systemText.closest('.live-chat-message--system')
    expect(messageDiv).toBeTruthy()

    // Should NOT have a role badge (system messages skip it)
    expect(messageDiv?.querySelector('.live-tab-role')).toBeNull()
  })

  it('plays chat sound when receiving a chat message from a peer', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    act(() => {
      mockOnChatMessage?.(
        {
          id: 'c1',
          senderName: 'Kalle',
          senderRole: 'viewer',
          text: 'Hej!',
          timestamp: Date.now(),
        },
        'peer-1',
      )
    })

    expect(mockPlaySound).toHaveBeenCalledWith('chat')
  })

  it('plays result sound when a result is submitted', async () => {
    const { handleResultSubmission } = await import('../../api/p2p-broadcast')
    const mockHandle = vi.mocked(handleResultSubmission)
    mockHandle.mockClear()
    mockHandle.mockImplementation((_msg, _peerId, onLog) => {
      onLog?.({
        timestamp: 1000,
        refereeName: 'Anna',
        boardNr: 1,
        roundNr: 1,
        resultType: 'WHITE_WIN',
        accepted: true,
      } as AuditLogEntry)
      return Promise.resolve()
    })

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockOnResultSubmit?.(
        {
          tournamentId: 1,
          roundNr: 1,
          boardNr: 1,
          resultType: 'WHITE_WIN',
          refereeName: 'Anna',
          timestamp: 1000,
        },
        'ref-peer',
      )
    })

    expect(mockPlaySound).toHaveBeenCalledWith('result')
  })

  it('mutes a peer and suppresses their chat messages', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Add a peer
    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    // Click the mute button
    fireEvent.click(screen.getByText('Tysta'))

    // Send a chat message from the muted peer
    mockPlaySound.mockClear()
    act(() => {
      mockOnChatMessage?.(
        {
          id: 'c2',
          senderName: 'Kalle',
          senderRole: 'viewer',
          text: 'Spam!',
          timestamp: Date.now(),
        },
        'peer-1',
      )
    })

    // Should NOT have played a sound or added the message
    expect(mockPlaySound).not.toHaveBeenCalled()

    // Switch to chat tab to verify no message
    fireEvent.click(screen.getByRole('tab', { name: /Chatt/ }))
    expect(screen.queryByText('Spam!')).toBeNull()
  })

  it('shows unmute button for muted peers', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    // Mute the peer
    fireEvent.click(screen.getByText('Tysta'))

    // Should show unmute button
    expect(screen.getByText('Avtysta')).toBeTruthy()

    // Unmute
    fireEvent.click(screen.getByText('Avtysta'))

    // Should show mute button again
    expect(screen.getByText('Tysta')).toBeTruthy()
  })

  it('saves session to sessionStorage when hosting starts', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const saved = sessionStorage.getItem('lotta-live-session')
    expect(saved).toBeTruthy()
    const parsed = JSON.parse(saved!)
    expect(parsed.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(parsed.refereeToken).toBeTruthy()
  })

  it('clears session from sessionStorage when hosting stops', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    expect(sessionStorage.getItem('lotta-live-session')).toBeTruthy()

    fireEvent.click(screen.getByText('Stoppa Live'))
    expect(sessionStorage.getItem('lotta-live-session')).toBeNull()
  })

  it('shows resume button when a saved session exists', () => {
    sessionStorage.setItem(
      'lotta-live-session',
      JSON.stringify({ roomCode: 'ABC123', refereeToken: 'tok-123' }),
    )

    renderLiveTab()
    expect(screen.getByText('Återuppta Live')).toBeTruthy()
    expect(screen.getByText(/ABC123/)).toBeTruthy()
  })

  it('resumes with saved room code and token', () => {
    sessionStorage.setItem(
      'lotta-live-session',
      JSON.stringify({ roomCode: 'XYZ789', refereeToken: 'tok-456' }),
    )

    renderLiveTab()
    fireEvent.click(screen.getByText('Återuppta Live'))

    expect(mockStartHostingCalls).toContain('XYZ789')
    expect(mockConstructorArgs[1]).toBe('tok-456')
  })

  it('can start fresh instead of resuming', () => {
    sessionStorage.setItem(
      'lotta-live-session',
      JSON.stringify({ roomCode: 'OLD123', refereeToken: 'tok-old' }),
    )

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta ny'))

    // Should use a NEW room code, not the saved one
    expect(mockStartHostingCalls[0]).not.toBe('OLD123')
    expect(mockStartHostingCalls[0]).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it('sends recent chat history to newly joined peer', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Simulate some chat messages
    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    const realDateNow = Date.now
    let fakeNow = realDateNow()
    Date.now = () => fakeNow

    try {
      act(() => {
        mockOnChatMessage?.(
          { id: 'c3', senderName: 'Kalle', senderRole: 'viewer', text: 'Hej!', timestamp: 1000 },
          'peer-1',
        )
      })
      fakeNow += 1500
      act(() => {
        mockOnChatMessage?.(
          {
            id: 'c4',
            senderName: 'Kalle',
            senderRole: 'viewer',
            text: 'Hur går det?',
            timestamp: 2000,
          },
          'peer-1',
        )
      })
    } finally {
      Date.now = realDateNow
    }

    // New peer joins
    mockSendChatToPeerCalls = []
    act(() => {
      mockOnNewPeerJoin?.('new-peer-99')
    })

    // Should have sent the 2 chat messages to the new peer
    expect(mockSendChatToPeerCalls.length).toBe(2)
    expect(mockSendChatToPeerCalls[0].peerId).toBe('new-peer-99')
    expect(mockSendChatToPeerCalls[0].msg.text).toBe('Hej!')
    expect(mockSendChatToPeerCalls[1].msg.text).toBe('Hur går det?')
  })

  it('deletes a chat message when organizer clicks delete button', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    act(() => {
      mockOnChatMessage?.(
        {
          id: 'c5',
          senderName: 'Kalle',
          senderRole: 'viewer',
          text: 'Olämpligt meddelande',
          timestamp: 1000,
        },
        'peer-1',
      )
    })

    // Switch to chat tab
    act(() => {
      fireEvent.click(screen.getByText(/Chatt/))
    })

    expect(screen.getByText('Olämpligt meddelande')).toBeTruthy()

    // Click delete button
    const deleteBtn = screen.getByTitle('Ta bort meddelande')
    act(() => {
      fireEvent.click(deleteBtn)
    })

    expect(screen.queryByText('Olämpligt meddelande')).toBeNull()
  })

  it('broadcasts chat deletion to peers when organizer deletes a message', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    act(() => {
      mockPeers = [{ id: 'peer-1', role: 'viewer', connectedAt: Date.now(), label: 'Kalle' }]
      mockOnPeersChange?.()
    })

    act(() => {
      mockOnChatMessage?.(
        {
          id: 'msg-to-delete',
          senderName: 'Kalle',
          senderRole: 'viewer',
          text: 'Delete me',
          timestamp: 1000,
        },
        'peer-1',
      )
    })

    // Switch to chat tab
    act(() => {
      fireEvent.click(screen.getByText(/Chatt/))
    })

    // Click delete button
    const deleteBtn = screen.getByTitle('Ta bort meddelande')
    act(() => {
      fireEvent.click(deleteBtn)
    })

    expect(mockBroadcastChatDeleteCalls).toHaveLength(1)
    expect(mockBroadcastChatDeleteCalls[0].id).toBe('msg-to-delete')
  })

  it('shows Dela vy panel with QR code and share link when subtab is active', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Dela vy' }))

    expect(screen.getByRole('heading', { name: 'Dela vy' })).toBeTruthy()
    // Should have QR code
    const qrCodes = screen.getAllByTestId('qr-code')
    expect(qrCodes.length).toBeGreaterThanOrEqual(1)
    // Should have share URL
    const urlEl = screen.getByTestId('vydelning-url')
    expect(urlEl).toBeTruthy()
    const url = new URL(urlEl.textContent!)
    expect(url.searchParams.get('share')).toBe('full')
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(url.pathname).toContain('/live/')
  })

  it('shows club checkboxes with generated access codes when hosting', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const skaraCheckbox = screen.getByLabelText('Skara SK', { exact: false })
    const lidkopingCheckbox = screen.getByLabelText('Lidköping SS', { exact: false })

    expect(skaraCheckbox).toBeTruthy()
    expect(lidkopingCheckbox).toBeTruthy()
  })

  it('generates a code when a club checkbox is checked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // No code shown initially
    expect(screen.queryByTestId('club-code-value')).toBeNull()

    // Check a club
    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))

    // Code should appear
    const codeEl = screen.getByTestId('club-code-value')
    expect(codeEl.textContent).toMatch(/^\d{3} \d{3}$/)
  })

  it('shows a Clubless checkbox when there are players without clubs', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const clublessCheckbox = screen.getByLabelText('Klubblösa', { exact: false })
    expect(clublessCheckbox).toBeTruthy()

    // Check it and verify a code appears
    fireEvent.click(clublessCheckbox)
    expect(screen.getByTestId('club-code-value')).toBeTruthy()
  })

  it('shows an "Alla" parent checkbox that selects all clubs and clubless', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Check the "Alla" parent
    fireEvent.click(screen.getByLabelText('Alla', { exact: false }))

    // Both individual clubs and clubless should now be checked
    expect((screen.getByLabelText('Skara SK', { exact: false }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(
      (screen.getByLabelText('Lidköping SS', { exact: false }) as HTMLInputElement).checked,
    ).toBe(true)
    expect((screen.getByLabelText('Klubblösa', { exact: false }) as HTMLInputElement).checked).toBe(
      true,
    )

    // A code should be generated
    expect(screen.getByTestId('club-code-value')).toBeTruthy()
  })

  it('nests club leaves inside a child container while keeping the parent outside', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const children = screen.getByTestId('club-picker-children')
    expect(children.contains(screen.getByLabelText('Skara SK', { exact: false }))).toBe(true)
    expect(children.contains(screen.getByLabelText('Lidköping SS', { exact: false }))).toBe(true)
    expect(children.contains(screen.getByLabelText('Klubblösa', { exact: false }))).toBe(true)
    expect(children.contains(screen.getByLabelText('Alla', { exact: false }))).toBe(false)
  })

  it('shows total player count next to the "Alla" parent label', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const allaLabel = screen.getByLabelText('Alla', { exact: false }).closest('label')
    // 2 Skara + 2 Lidköping + 1 clubless = 5
    expect(allaLabel?.textContent).toContain('5 st')
  })

  it('shows player count next to each club name', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const skaraLabel = screen.getByLabelText('Skara SK', { exact: false }).closest('label')
    const lidkopingLabel = screen.getByLabelText('Lidköping SS', { exact: false }).closest('label')
    const klubblosaLabel = screen.getByLabelText('Klubblösa', { exact: false }).closest('label')

    expect(skaraLabel?.textContent).toContain('2 st')
    expect(lidkopingLabel?.textContent).toContain('2 st')
    expect(klubblosaLabel?.textContent).toContain('1 st')
  })

  it('renders player count in a dedicated muted element so it can be styled', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const skaraLabel = screen.getByLabelText('Skara SK', { exact: false }).closest('label')
    const count = skaraLabel?.querySelector('.live-tab-club-count')
    expect(count).toBeTruthy()
    expect(count?.textContent).toBe('(2 st)')
  })

  it('renders a share button next to each club row', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(screen.getByTestId('share-club-btn-Skara SK')).toBeTruthy()
    expect(screen.getByTestId('share-club-btn-Lidköping SS')).toBeTruthy()
    expect(screen.getByTestId('share-club-btn-__CLUBLESS__')).toBeTruthy()
  })

  it('opens a share dialog when the share button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(screen.queryByTestId('share-club-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('share-club-btn-Skara SK'))
    expect(screen.getByTestId('share-club-dialog')).toBeTruthy()
  })

  it('opens a share dialog when the Klubblösa share button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(screen.queryByTestId('share-club-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('share-club-btn-__CLUBLESS__'))
    expect(screen.getByTestId('share-club-dialog')).toBeTruthy()
  })

  it('share dialog contains a QR code and a URL with the club code', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByTestId('share-club-btn-Skara SK'))

    const dialog = screen.getByTestId('share-club-dialog')
    // QR inside the dialog (mocked QRCodeSVG renders data-testid="qr-code")
    expect(dialog.querySelector('[data-testid="qr-code"]')).toBeTruthy()

    // URL input inside the dialog with a code= param
    const urlInput = screen.getByTestId('share-club-url') as HTMLInputElement
    expect(urlInput).toBeTruthy()
    expect(urlInput.value).toContain('share=view')
    expect(urlInput.value).toContain('token=')
    expect(urlInput.value).toMatch(/[?&]code=\d{6}/)
  })

  it('marks the parent checkbox as indeterminate when some but not all children are selected', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const parent = screen.getByLabelText('Alla', { exact: false }) as HTMLInputElement
    expect(parent.indeterminate).toBe(false)
    expect(parent.checked).toBe(false)

    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))
    expect(parent.indeterminate).toBe(true)
    expect(parent.checked).toBe(false)

    // Select the remaining two children → parent becomes fully checked, no longer indeterminate
    fireEvent.click(screen.getByLabelText('Lidköping SS', { exact: false }))
    fireEvent.click(screen.getByLabelText('Klubblösa', { exact: false }))
    expect(parent.indeterminate).toBe(false)
    expect(parent.checked).toBe(true)
  })

  it('shows no code when no clubs are selected', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // No clubs checked — no code should appear
    expect(screen.queryByTestId('club-code-value')).toBeNull()

    // Check and uncheck a club — code should disappear again
    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))
    expect(screen.getByTestId('club-code-value')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))
    expect(screen.queryByTestId('club-code-value')).toBeNull()
  })

  it('generates different codes for different club selections', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Check only Skara SK
    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))
    const code1 = screen.getByTestId('club-code-value').textContent!

    // Uncheck Skara, check Lidköping
    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))
    fireEvent.click(screen.getByLabelText('Lidköping SS', { exact: false }))
    const code2 = screen.getByTestId('club-code-value').textContent!

    expect(code1).not.toBe(code2)
  })

  it('does not derive club code from publicly known tournament metadata', () => {
    const allClubs = ['Lidköping SS', 'Skara SK', '__CLUBLESS__']
    const insecureCode = generateClubCode(['Skara SK'], allClubs, 'Test/')

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByLabelText('Skara SK', { exact: false }))

    const displayedCode = screen.getByTestId('club-code-value').textContent!.replace(/\s/g, '')
    expect(displayedCode).not.toBe(insecureCode)
    expect(displayedCode).toMatch(/^\d{6}$/)
  })

  it('starts RPC server when hosting begins', async () => {
    const { startP2pRpcServer } = await import('../../api/p2p-data-provider')
    const mockStart = vi.mocked(startP2pRpcServer)
    mockStart.mockClear()

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockStart).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ onMutation: expect.any(Function) }),
    )
  })

  it('sets live status to connected when hosting starts', async () => {
    const { setLiveStatus } = await import('../../hooks/useLiveStatus')
    const mockSet = vi.mocked(setLiveStatus)
    mockSet.mockClear()

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected', role: 'host' }),
    )
  })

  it('clears live status when hosting stops', async () => {
    const { setLiveStatus } = await import('../../hooks/useLiveStatus')
    const mockSet = vi.mocked(setLiveStatus)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    mockSet.mockClear()

    fireEvent.click(screen.getByText('Stoppa Live'))

    expect(mockSet).toHaveBeenCalledWith(null)
  })
})
