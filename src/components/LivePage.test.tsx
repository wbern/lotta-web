// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatMessage,
  PageUpdateMessage,
  ResultAckMessage,
  ResultSubmitMessage,
  RoundManifestMessage,
  SharedTournamentsMessage,
  ViewerSelectTournamentMessage,
} from '../types/p2p'
import { LivePage } from './LivePage'

let mockOnPageUpdate: ((msg: PageUpdateMessage) => void) | null = null
let mockOnResultAck: ((msg: ResultAckMessage) => void) | null = null
let mockOnConnectionStateChange: ((state: string) => void) | null = null
let mockJoinRoomCalls: string[] = []
let mockLeaveCalled = false
let mockSubmitResultCalls: unknown[] = []
let mockConstructorRole: string | null = null
let mockConstructorToken: string | undefined = undefined
let mockOnChatMessage: ((msg: ChatMessage, peerId: string) => void) | null = null
let mockOnSharedTournaments: ((msg: SharedTournamentsMessage) => void) | null = null
let mockOnRoundManifest: ((msg: RoundManifestMessage) => void) | null = null
let mockOnPendingChange: ((pending: ResultSubmitMessage[]) => void) | null = null
let mockSendViewerSelectCalls: ViewerSelectTournamentMessage[] = []
const mockServiceRef: { current: { connectionState: string } | null } = { current: null }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../services/p2p-service', () => {
  return {
    getIceProbeResult: () => 'ok',
    P2PService: class {
      connectionState = 'disconnected'
      role: string
      reconnectAttempts = 0

      constructor(role: string, token?: string) {
        this.role = role
        mockConstructorRole = role
        mockConstructorToken = token
      }

      joinRoom(roomCode: string) {
        this.connectionState = 'connected'
        mockJoinRoomCalls.push(roomCode)
        mockServiceRef.current = this
      }

      leave() {
        mockLeaveCalled = true
      }

      getPeers() {
        return []
      }

      submitResult(msg: unknown) {
        mockSubmitResultCalls.push(msg)
      }

      set onPageUpdate(cb: ((msg: PageUpdateMessage) => void) | null) {
        mockOnPageUpdate = cb
      }
      get onPageUpdate() {
        return mockOnPageUpdate
      }

      set onResultAck(cb: ((msg: ResultAckMessage) => void) | null) {
        mockOnResultAck = cb
      }
      get onResultAck() {
        return mockOnResultAck
      }

      set onConnectionStateChange(cb: ((state: string) => void) | null) {
        mockOnConnectionStateChange = cb
      }
      get onConnectionStateChange() {
        return mockOnConnectionStateChange
      }

      set onPeerCount(_cb: unknown) {}
      get onPeerCount() {
        return null
      }
      set onAnnouncement(_cb: unknown) {}
      get onAnnouncement() {
        return null
      }
      set onChatMessage(cb: ((msg: ChatMessage, peerId: string) => void) | null) {
        mockOnChatMessage = cb
      }
      get onChatMessage() {
        return mockOnChatMessage
      }
      broadcastChatMessage() {}
      set onKicked(_cb: unknown) {}
      get onKicked() {
        return null
      }
      set onSharedTournaments(cb: ((msg: SharedTournamentsMessage) => void) | null) {
        mockOnSharedTournaments = cb
      }
      get onSharedTournaments() {
        return mockOnSharedTournaments
      }
      set onRoundManifest(cb: ((msg: RoundManifestMessage) => void) | null) {
        mockOnRoundManifest = cb
      }
      get onRoundManifest() {
        return mockOnRoundManifest
      }
      sendViewerSelectTournament(msg: ViewerSelectTournamentMessage) {
        mockSendViewerSelectCalls.push(msg)
      }
      set onPendingChange(cb: ((pending: ResultSubmitMessage[]) => void) | null) {
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

const mockPlaySound = vi.fn()
vi.mock('../lib/notification-sounds', () => ({
  playSound: (...args: unknown[]) => mockPlaySound(...args),
}))

afterEach(cleanup)

describe('LivePage', () => {
  beforeEach(() => {
    mockOnPageUpdate = null
    mockOnResultAck = null
    mockOnConnectionStateChange = null
    mockJoinRoomCalls = []
    mockLeaveCalled = false
    mockSubmitResultCalls = []
    mockConstructorRole = null
    mockConstructorToken = undefined
    mockOnChatMessage = null
    mockOnSharedTournaments = null
    mockOnRoundManifest = null
    mockOnPendingChange = null
    mockSendViewerSelectCalls = []
    mockServiceRef.current = null
    mockPlaySound.mockClear()
    localStorage.clear()
  })

  it('plays chat sound when receiving a chat message', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnChatMessage?.(
        {
          id: 'lp-1',
          senderName: 'Test',
          senderRole: 'organizer',
          text: 'Hello',
          timestamp: Date.now(),
        },
        'peer-1',
      )
    })

    expect(mockPlaySound).toHaveBeenCalledWith('chat')
  })

  it('plays round sound when new round pairings arrive', () => {
    render(<LivePage roomCode="test" />)

    // First round data
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>round 1</html>',
        timestamp: Date.now(),
      })
    })
    mockPlaySound.mockClear()

    // New round data arrives
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 2,
        html: '<html>round 2</html>',
        timestamp: Date.now(),
      })
    })

    expect(mockPlaySound).toHaveBeenCalledWith('round')
  })

  it('shows new round alert when a higher round arrives', () => {
    vi.useFakeTimers()
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>round 1</html>',
        timestamp: Date.now(),
      })
    })

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 2,
        html: '<html>round 2</html>',
        timestamp: Date.now(),
      })
    })

    expect(screen.getByText(/Rond 2 har lottats/)).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(screen.queryByText(/Rond 2 har lottats/)).toBeNull()
    vi.useRealTimers()
  })

  it('does not show new round alert for first round received', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>round 1</html>',
        timestamp: Date.now(),
      })
    })

    expect(screen.queryByText(/har lottats/)).toBeNull()
  })

  it('shows room code when no tournament name is known', () => {
    render(<LivePage roomCode="abc123" />)
    expect(screen.getByText('abc123')).toBeTruthy()
  })

  it('joins the room on mount', () => {
    render(<LivePage roomCode="my-room" />)
    expect(mockJoinRoomCalls).toContain('my-room')
  })

  it('normalizes room code to lowercase', () => {
    render(<LivePage roomCode="MyRoom" />)
    expect(mockJoinRoomCalls).toContain('myroom')
  })

  it('renders received pairings HTML in an iframe', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Spring Open',
        roundNr: 1,
        html: '<html><body>Pairings content</body></html>',
        timestamp: Date.now(),
      })
    })

    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toContain('Pairings content')
  })

  it('shows tournament name from received page', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Grand Prix',
        roundNr: 1,
        html: '<html></html>',
        timestamp: Date.now(),
      })
    })

    expect(screen.getByText('Grand Prix')).toBeTruthy()
  })

  it('shows tabs for each received page type', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings</html>',
        timestamp: Date.now(),
      })
    })

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'standings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>standings</html>',
        timestamp: Date.now(),
      })
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].textContent).toBe('Lottning')
    expect(tabs[1].textContent).toBe('Ställning')
  })

  it('caches received pages in localStorage', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Cached',
        roundNr: 1,
        html: '<html>cached pairings</html>',
        timestamp: 1000,
      })
    })

    const cached = localStorage.getItem('lotta-p2p-test-pairings-r1')
    expect(cached).toBeTruthy()
    const parsed = JSON.parse(cached!)
    expect(parsed.html).toContain('cached pairings')
  })

  it('loads cached pages on mount', () => {
    localStorage.setItem(
      'lotta-p2p-myroom-pairings-r1',
      JSON.stringify({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'From Cache',
        roundNr: 1,
        html: '<html>cached</html>',
        timestamp: 1000,
      }),
    )

    render(<LivePage roomCode="myroom" />)

    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toContain('cached')
  })

  it('leaves the room on unmount', () => {
    const { unmount } = render(<LivePage roomCode="test" />)
    unmount()
    expect(mockLeaveCalled).toBe(true)
  })

  it('shows offline banner when host goes offline with cached data', () => {
    render(<LivePage roomCode="test" />)

    // Receive some data first
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings data</html>',
        timestamp: Date.now(),
      })
    })

    // Simulate host going offline
    act(() => {
      if (mockServiceRef.current) {
        mockServiceRef.current.connectionState = 'host-offline'
      }
      mockOnConnectionStateChange?.('host-offline')
    })

    expect(screen.getByText('Värden är offline — visar senaste kända data')).toBeTruthy()
    expect(screen.getByText('Värd offline')).toBeTruthy()
    // Data is still shown
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('srcdoc')).toContain('pairings data')
  })

  it('shows reconnecting status', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      if (mockServiceRef.current) {
        mockServiceRef.current.connectionState = 'reconnecting'
      }
      mockOnConnectionStateChange?.('reconnecting')
    })

    expect(screen.getAllByText('Återansluter...').length).toBeGreaterThanOrEqual(1)
  })

  it('shows connecting message when no data is available yet', () => {
    render(<LivePage roomCode="test" />)
    expect(screen.getByText('Ansluter till turneringen...')).toBeTruthy()
  })

  it('shows waiting message when connected but no data received', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnConnectionStateChange?.('connected')
    })

    expect(screen.getByText('Väntar på turneringsdata...')).toBeTruthy()
  })

  it('switches tabs when clicking a different tab', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings html</html>',
        timestamp: Date.now(),
      })
    })

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'standings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>standings html</html>',
        timestamp: Date.now(),
      })
    })

    // Initially shows pairings
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('srcdoc')).toContain('pairings html')

    // Click standings tab
    act(() => {
      screen.getByText('Ställning').click()
    })

    const iframeAfter = document.querySelector('iframe')
    expect(iframeAfter?.getAttribute('srcdoc')).toContain('standings html')
  })

  it('uses empty string sandbox for non-referee tabs', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings</html>',
        timestamp: Date.now(),
      })
    })

    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('sandbox')).toBe('')
  })

  it('falls back to first available tab when active has no data', () => {
    render(<LivePage roomCode="test" />)

    // Only standings data received, but default tab for viewer is pairings
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'standings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>standings only</html>',
        timestamp: Date.now(),
      })
    })

    // Should show standings since pairings has no data
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('srcdoc')).toContain('standings only')
  })
})

function confirmRefereeName(name = 'Anna') {
  const input = screen.getByPlaceholderText('Ditt namn')
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(screen.getByText('Anslut'))
}

describe('LivePage referee mode', () => {
  beforeEach(() => {
    mockOnPageUpdate = null
    mockOnResultAck = null
    mockOnConnectionStateChange = null
    mockJoinRoomCalls = []
    mockLeaveCalled = false
    mockSubmitResultCalls = []
    mockConstructorRole = null
    mockConstructorToken = undefined
    mockOnChatMessage = null
    mockOnSharedTournaments = null
    mockOnRoundManifest = null
    mockOnPendingChange = null
    mockSendViewerSelectCalls = []
    mockServiceRef.current = null
    mockPlaySound.mockClear()
    localStorage.clear()
  })

  it('creates P2PService with referee role when refereeToken is provided', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')
    expect(mockConstructorRole).toBe('referee')
  })

  it('shows name entry screen before connecting as referee', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    expect(screen.getByPlaceholderText('Ditt namn')).toBeTruthy()
    expect(screen.getByText('Anslut')).toBeTruthy()
    // Not yet connected
    expect(mockConstructorRole).toBeNull()
  })

  it('creates P2PService with viewer role when no refereeName', () => {
    render(<LivePage roomCode="test" />)
    expect(mockConstructorRole).toBe('viewer')
  })

  it('shows pending submission count in the connection pill', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      mockOnPendingChange?.([
        {
          tournamentId: 1,
          roundNr: 1,
          boardNr: 5,
          resultType: 'WHITE_WIN',
          refereeName: 'Anna',
          timestamp: 0,
        },
      ])
    })

    const pill = screen.getByTestId('live-status-pill')
    expect(pill.textContent).toContain('1')
    expect(pill.className).toContain('live-status--pending')
  })

  it('submits result via P2PService after confirmation', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'referee-result',
            tournamentId: 1,
            roundNr: 2,
            boardNr: 3,
            resultType: 'WHITE_WIN',
          },
        }),
      )
    })

    // Should show confirmation bar, not submit yet
    expect(mockSubmitResultCalls).toHaveLength(0)
    expect(screen.getByText(/Bord 3.*1-0.*Bekräfta\?/)).toBeTruthy()

    // Confirm
    act(() => {
      fireEvent.click(screen.getByText('Bekräfta'))
    })

    expect(mockSubmitResultCalls).toHaveLength(1)
    const call = mockSubmitResultCalls[0] as Record<string, unknown>
    expect(call.tournamentId).toBe(1)
    expect(call.roundNr).toBe(2)
    expect(call.boardNr).toBe(3)
    expect(call.resultType).toBe('WHITE_WIN')
    expect(call.refereeName).toBe('Anna')
  })

  it('forwards expectedPrior from postMessage so the host can detect cross-ref conflicts', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'referee-result',
            tournamentId: 1,
            roundNr: 2,
            boardNr: 3,
            resultType: 'WHITE_WIN',
            expectedPrior: 'NO_RESULT',
          },
        }),
      )
    })

    act(() => {
      fireEvent.click(screen.getByText('Bekräfta'))
    })

    const call = mockSubmitResultCalls[0] as Record<string, unknown>
    expect(call.expectedPrior).toBe('NO_RESULT')
  })

  it('shows Schack4an resultDisplay in confirm dialog and forwards it on submit', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'referee-result',
            tournamentId: 1,
            roundNr: 2,
            boardNr: 3,
            resultType: 'WHITE_WIN',
            resultDisplay: '3-1',
          },
        }),
      )
    })

    expect(screen.getByText(/Bord 3.*3-1.*Bekräfta\?/)).toBeTruthy()

    act(() => {
      fireEvent.click(screen.getByText('Bekräfta'))
    })

    const call = mockSubmitResultCalls[0] as Record<string, unknown>
    expect(call.resultDisplay).toBe('3-1')
  })

  it('ignores postMessage when not in referee mode', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'referee-result',
            tournamentId: 1,
            roundNr: 2,
            boardNr: 3,
            resultType: 'WHITE_WIN',
          },
        }),
      )
    })

    expect(mockSubmitResultCalls).toHaveLength(0)
  })

  it('shows accepted ack feedback', () => {
    render(<LivePage roomCode="test" refereeName="Anna" />)

    act(() => {
      mockOnResultAck?.({
        boardNr: 3,
        roundNr: 2,
        accepted: true,
      })
    })

    expect(screen.getByText('Bord 3: Resultat registrerat')).toBeTruthy()
  })

  it('shows rejected ack feedback with reason', () => {
    render(<LivePage roomCode="test" refereeName="Anna" />)

    act(() => {
      mockOnResultAck?.({
        boardNr: 5,
        roundNr: 1,
        accepted: false,
        reason: 'Board not found',
      })
    })

    expect(screen.getByText('Bord 5: Board not found')).toBeTruthy()
  })

  it('auto-dismisses ack feedback after 3 seconds', () => {
    vi.useFakeTimers()
    render(<LivePage roomCode="test" refereeName="Anna" />)

    act(() => {
      mockOnResultAck?.({
        boardNr: 1,
        roundNr: 1,
        accepted: true,
      })
    })

    expect(screen.getByText('Bord 1: Resultat registrerat')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText('Bord 1: Resultat registrerat')).toBeNull()
    vi.useRealTimers()
  })

  it('ignores postMessage with wrong type', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'some-other-type', boardNr: 1 },
        }),
      )
    })

    expect(mockSubmitResultCalls).toHaveLength(0)
  })

  it('ignores postMessage with non-object data', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: 'just a string',
        }),
      )
    })

    expect(mockSubmitResultCalls).toHaveLength(0)
  })

  it('shows rejected ack without reason', () => {
    render(<LivePage roomCode="test" refereeName="Anna" />)

    act(() => {
      mockOnResultAck?.({
        boardNr: 2,
        roundNr: 1,
        accepted: false,
      })
    })

    expect(screen.getByText('Bord 2: Avvisad')).toBeTruthy()
  })

  it('passes referee token to P2PService constructor', () => {
    render(<LivePage roomCode="test" refereeToken="secret-token-123" />)
    confirmRefereeName('Anna')
    expect(mockConstructorToken).toBe('secret-token-123')
  })

  it('passes no token for viewer', () => {
    render(<LivePage roomCode="test" />)
    expect(mockConstructorToken).toBeUndefined()
  })

  it('uses allow-scripts sandbox for refereePairings tab', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'refereePairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>referee pairings</html>',
        timestamp: Date.now(),
      })
    })

    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
  })

  it('handles postMessage with null event.source from sandboxed iframe', () => {
    render(<LivePage roomCode="test" refereeToken="test-token" />)
    confirmRefereeName('Anna')

    // First, render the iframe by sending a page update
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'refereePairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>referee pairings</html>',
        timestamp: Date.now(),
      })
    })

    // Verify iframe is rendered (iframeRef.current will be non-null)
    expect(document.querySelector('iframe')).toBeTruthy()

    // Dispatch postMessage without source (simulates sandboxed srcdoc iframe
    // on Android Chrome where event.source can be null)
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'referee-result',
            tournamentId: 1,
            roundNr: 1,
            boardNr: 2,
            resultType: 'DRAW',
          },
        }),
      )
    })

    // Should still show confirmation bar despite null event.source
    expect(screen.getByText(/Bord 2.*½-½.*Bekräfta\?/)).toBeTruthy()
  })
})

describe('LivePage kiosk mode', () => {
  beforeEach(() => {
    mockOnPageUpdate = null
    mockOnResultAck = null
    mockOnConnectionStateChange = null
    mockJoinRoomCalls = []
    mockLeaveCalled = false
    mockSubmitResultCalls = []
    mockConstructorRole = null
    mockConstructorToken = undefined
    mockOnChatMessage = null
    mockOnSharedTournaments = null
    mockOnRoundManifest = null
    mockOnPendingChange = null
    mockSendViewerSelectCalls = []
    mockServiceRef.current = null
    mockPlaySound.mockClear()
    localStorage.clear()
  })

  it('adds kiosk class when kiosk prop is true', () => {
    render(<LivePage roomCode="test" kiosk />)
    expect(document.querySelector('.live-page--kiosk')).toBeTruthy()
  })

  it('hides chat toggle in kiosk mode', () => {
    render(<LivePage roomCode="test" kiosk />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings</html>',
        timestamp: Date.now(),
      })
    })

    expect(screen.queryByText(/Chatt/)).toBeNull()
  })

  it('auto-rotates between page types in kiosk mode', () => {
    vi.useFakeTimers()
    render(<LivePage roomCode="test" kiosk />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>pairings content</html>',
        timestamp: Date.now(),
      })
    })
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'standings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>standings content</html>',
        timestamp: Date.now(),
      })
    })

    // Initially shows pairings
    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('pairings content')

    // After rotation interval, should switch to standings
    act(() => {
      vi.advanceTimersByTime(15000)
    })

    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('standings content')

    // After another rotation, should switch back to pairings
    act(() => {
      vi.advanceTimersByTime(15000)
    })

    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('pairings content')
    vi.useRealTimers()
  })

  it('does not auto-rotate when only one page type is available', () => {
    vi.useFakeTimers()
    render(<LivePage roomCode="test" kiosk />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Test',
        roundNr: 1,
        html: '<html>only pairings</html>',
        timestamp: Date.now(),
      })
    })

    act(() => {
      vi.advanceTimersByTime(15000)
    })

    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('only pairings')
    vi.useRealTimers()
  })

  it('exposes a toggle button that enters kiosk mode from the normal viewer', () => {
    render(<LivePage roomCode="test" />)

    // Not in kiosk mode on initial render
    expect(document.querySelector('.live-page--kiosk')).toBeNull()

    // A toggle button is available for spectators to switch into kiosk/projector mode
    const toggle = screen.getByTestId('kiosk-toggle')
    expect(toggle).toBeTruthy()

    act(() => {
      toggle.click()
    })

    // After clicking, the viewer enters kiosk mode (class applied, behaviors kick in)
    expect(document.querySelector('.live-page--kiosk')).toBeTruthy()

    // Clicking again leaves kiosk mode
    act(() => {
      screen.getByTestId('kiosk-toggle').click()
    })
    expect(document.querySelector('.live-page--kiosk')).toBeNull()
  })
})

describe('LivePage shared tournaments', () => {
  beforeEach(() => {
    mockOnPageUpdate = null
    mockOnResultAck = null
    mockOnConnectionStateChange = null
    mockJoinRoomCalls = []
    mockLeaveCalled = false
    mockSubmitResultCalls = []
    mockConstructorRole = null
    mockConstructorToken = undefined
    mockOnChatMessage = null
    mockOnSharedTournaments = null
    mockOnRoundManifest = null
    mockOnPendingChange = null
    mockSendViewerSelectCalls = []
    mockServiceRef.current = null
    mockPlaySound.mockClear()
    localStorage.clear()
  })

  it('does not show tournament dropdown when shared set has only one tournament', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7],
        includeFutureTournaments: false,
        timestamp: Date.now(),
      })
    })

    expect(screen.queryByTestId('shared-tournaments-select')).toBeNull()
  })

  it('shows tournament dropdown when shared set has multiple tournaments', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7, 9],
        includeFutureTournaments: true,
        timestamp: Date.now(),
      })
    })

    const select = screen.getByTestId('shared-tournaments-select') as HTMLSelectElement
    expect(select).toBeTruthy()
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toEqual(['7', '9'])
  })

  it('sends ViewerSelectTournament message when user selects a different tournament', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7, 9],
        includeFutureTournaments: true,
        timestamp: Date.now(),
      })
    })

    const select = screen.getByTestId('shared-tournaments-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '9' } })

    expect(mockSendViewerSelectCalls).toEqual([{ tournamentId: 9 }])
  })

  it('labels options with the tournament name once a page update has been received', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7, 9],
        includeFutureTournaments: true,
        timestamp: Date.now(),
      })
    })
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 7,
        tournamentName: 'Spring Open',
        roundNr: 1,
        html: '<html>r1</html>',
        timestamp: Date.now(),
      })
    })

    const select = screen.getByTestId('shared-tournaments-select') as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((o) => o.text)
    expect(optionTexts).toContain('Spring Open')
    expect(optionTexts).toContain('Turnering 9')
  })

  it('flashes the dropdown when a new tournament is added to the shared set', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7],
        includeFutureTournaments: true,
        timestamp: Date.now(),
      })
    })
    act(() => {
      mockOnSharedTournaments?.({
        tournamentIds: [7, 9],
        includeFutureTournaments: true,
        timestamp: Date.now() + 1,
      })
    })

    const select = screen.getByTestId('shared-tournaments-select')
    expect(select.className).toContain('shared-tournaments-select--flash')
  })
})

describe('LivePage round manifest reconciliation', () => {
  beforeEach(() => {
    mockOnPageUpdate = null
    mockOnResultAck = null
    mockOnConnectionStateChange = null
    mockJoinRoomCalls = []
    mockLeaveCalled = false
    mockSubmitResultCalls = []
    mockConstructorRole = null
    mockConstructorToken = undefined
    mockOnChatMessage = null
    mockOnSharedTournaments = null
    mockOnRoundManifest = null
    mockOnPendingChange = null
    mockSendViewerSelectCalls = []
    mockServiceRef.current = null
    mockPlaySound.mockClear()
    localStorage.clear()
  })

  it('drops cached rounds that are no longer in the host manifest', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Cup',
        roundNr: 1,
        html: '<html>round 1</html>',
        timestamp: Date.now(),
      })
    })
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Cup',
        roundNr: 2,
        html: '<html>round 2</html>',
        timestamp: Date.now(),
      })
    })

    const roundSelectBefore = document.querySelector(
      'select.live-round-select',
    ) as HTMLSelectElement | null
    const roundValuesBefore = roundSelectBefore
      ? Array.from(roundSelectBefore.options).map((o) => o.value)
      : []
    expect(roundValuesBefore).toEqual(['1', '2'])

    // Host broadcasts a manifest that no longer contains round 1 (e.g. snapshot undo).
    act(() => {
      mockOnRoundManifest?.({
        tournamentId: 1,
        roundNrs: [2],
        timestamp: Date.now(),
      })
    })

    const roundSelectAfter = document.querySelector(
      'select.live-round-select',
    ) as HTMLSelectElement | null
    const roundValuesAfter = roundSelectAfter
      ? Array.from(roundSelectAfter.options).map((o) => o.value)
      : []
    // Selector hides when <2 rounds — so either no selector, or only round 2.
    expect(roundValuesAfter).not.toContain('1')
  })

  it('clears all cached rounds when host broadcasts an empty manifest', () => {
    render(<LivePage roomCode="test" />)

    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Cup',
        roundNr: 1,
        html: '<html>round 1 html</html>',
        timestamp: Date.now(),
      })
    })
    act(() => {
      mockOnPageUpdate?.({
        pageType: 'pairings',
        tournamentId: 1,
        tournamentName: 'Cup',
        roundNr: 2,
        html: '<html>round 2 html</html>',
        timestamp: Date.now(),
      })
    })

    act(() => {
      mockOnRoundManifest?.({
        tournamentId: 1,
        roundNrs: [],
        timestamp: Date.now(),
      })
    })

    const roundSelect = document.querySelector(
      'select.live-round-select',
    ) as HTMLSelectElement | null
    expect(roundSelect).toBeNull()
    // Cache entries removed from localStorage too.
    expect(localStorage.getItem('lotta-p2p-test-pairings-r1')).toBeNull()
    expect(localStorage.getItem('lotta-p2p-test-pairings-r2')).toBeNull()
  })
})
