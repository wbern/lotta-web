// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateClubCodeMap } from '../../domain/club-codes'
import type {
  AuditLogEntry,
  ChatDeleteMessage,
  ChatMessage,
  ResultSubmitMessage,
} from '../../types/p2p'
import type { LiveConnectionState, LiveRole } from '../layout/StatusBar'
import { LiveTab } from './LiveTab'

let mockStartHostingCalls: string[] = []
let mockLeaveCalled = false
let mockOnResultSubmit: ((msg: ResultSubmitMessage, peerId: string) => void) | null = null
let mockOnPeersChange: (() => void) | null = null
let mockOnNewPeerJoin: ((peerId: string) => void) | null = null
let mockOnPeerToken: ((peerId: string, token: string) => void) | null = null
let mockConnectionState = 'disconnected'
let mockPeers: { id: string; role: string; connectedAt: number; label?: string }[] = []
let mockRoomId: string | null = null
let mockConstructorArgs: unknown[] = []
let mockOnChatMessage: ((msg: ChatMessage, peerId: string) => void) | null = null
let mockBroadcastChatMessageCalls: ChatMessage[] = []
let mockSendChatToPeerCalls: { msg: ChatMessage; peerId: string }[] = []
let mockBroadcastChatDeleteCalls: ChatDeleteMessage[] = []
let mockBroadcastPeerCountCalls: unknown[] = []

interface PdfSaveCall {
  filename: string
  entries: { label?: string; code?: string; url: string; qrDataUrl: string }[]
  tournamentName: string
}
let mockPdfSaveCalls: PdfSaveCall[] = []

vi.mock('../../domain/club-codes-pdf', () => ({
  buildClubCodesPdf: (opts: Omit<PdfSaveCall, 'filename'>) => ({
    save: (filename: string) =>
      mockPdfSaveCalls.push({
        filename,
        entries: opts.entries,
        tournamentName: opts.tournamentName,
      }),
  }),
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: async (_text: string) => 'data:image/png;base64,AAAA',
  },
}))

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

      broadcastPeerCount(msg: unknown) {
        mockBroadcastPeerCountCalls.push(msg)
      }
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
      set onPeerToken(cb: ((peerId: string, token: string) => void) | null) {
        mockOnPeerToken = cb
      }
      get onPeerToken() {
        return mockOnPeerToken
      }
    },
  }
})

vi.mock('../../services/p2p-provider', () => ({
  setP2PService: vi.fn(),
  clearP2PService: vi.fn(),
  getP2PService: vi.fn(),
}))

vi.mock('../../api/p2p-session', () => ({
  disconnectFromHost: vi.fn(),
  cleanupClientSession: vi.fn(),
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
    setPeerPermissions: vi.fn(),
    clearPeerPermissions: vi.fn(),
  }
})

let mockLiveStatusValue: {
  state: LiveConnectionState
  role: LiveRole
  peerCount: number
} | null = null
vi.mock('../../hooks/useLiveStatus', () => ({
  setLiveStatus: vi.fn(),
  useLiveStatus: () => mockLiveStatusValue,
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
    mockOnPeerToken = null
    mockOnChatMessage = null
    mockBroadcastChatMessageCalls = []
    mockSendChatToPeerCalls = []
    mockBroadcastChatDeleteCalls = []
    mockBroadcastPeerCountCalls = []
    mockPdfSaveCalls = []
    mockConnectionState = 'disconnected'
    mockPeers = []
    mockRoomId = null
    mockConstructorArgs = []
    mockPlaySound.mockClear()
    mockLiveStatusValue = null
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

  it('Dela med åskådare panel shows only the view link — no room code or projector URL', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    // Room code is implicit in the QR/link — no dedicated row
    expect(screen.queryByText(/^Rumskod:/)).toBeNull()
    // Kiosk/projector mode is offered inside the viewer, not as a separate URL
    expect(screen.queryByText(/^Projektor:/)).toBeNull()
    // The normal view link row is still there
    expect(screen.getByText(/^Länk:/)).toBeTruthy()
  })

  it('groups the QR, share actions, and view link inside one share-box container', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const shareBox = screen.getByTestId('live-tab-share-box')
    // QR code lives inside the box
    expect(shareBox.querySelector('[data-testid="qr-code"]')).toBeTruthy()
    // Fullscreen + print buttons live inside the box
    expect(shareBox.querySelector('[data-testid="print-main-qr"]')).toBeTruthy()
    // The view link URL is grouped inside the same box (not a free row below)
    const linkCode = shareBox.querySelector('.live-tab-url')
    expect(linkCode?.textContent).toMatch(/^https?:\/\//)
  })

  it('labels the print button so it explains what the PDF contains', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    const printBtn = screen.getByTestId('print-main-qr')
    expect(printBtn.textContent).toBe('Skriv ut QR-kod med instruktioner')
  })

  it('uses an icon-only fullscreen button in the share box', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    const fullscreenBtn = screen.getByRole('button', { name: 'Visa i fullskärm' })
    expect(fullscreenBtn.textContent?.trim()).toBe('⛶')
  })

  it('stacks the Länk label above the URL instead of inline beside it', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    const shareBox = screen.getByTestId('live-tab-share-box')
    const label = shareBox.querySelector('.live-tab-link-label')
    const urlCode = shareBox.querySelector('.live-tab-url')
    // The label must not share a parent flex row with the URL code.
    expect(label?.parentElement).not.toBe(urlCode?.parentElement)
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

  it('shows empty-state hint in Domarstyrning panel when no grants exist', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const panel = screen.getByTestId('live-tab-grants-panel')
    expect(panel.textContent).toMatch(/Lägg till en åtkomst/i)
    expect(panel.querySelectorAll('[data-testid^="grant-row-"]').length).toBe(0)
  })

  it('renders the grant form with label input, preset radios, and submit button', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const labelInput = screen.getByTestId('grant-label-input') as HTMLInputElement
    expect(labelInput).toBeTruthy()
    expect(labelInput.value).toBe('')

    const fullRadio = screen.getByTestId('grant-preset-full') as HTMLInputElement
    const viewRadio = screen.getByTestId('grant-preset-view') as HTMLInputElement
    expect(fullRadio.type).toBe('radio')
    expect(viewRadio.type).toBe('radio')

    const submitBtn = screen.getByTestId('grant-submit')
    expect(submitBtn.tagName.toLowerCase()).toBe('button')
  })

  it('adds a grant row when the form is submitted', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const labelInput = screen.getByTestId('grant-label-input') as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'Sofia — KSS' } })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const panel = screen.getByTestId('live-tab-grants-panel')
    const rows = panel.querySelectorAll('[data-testid^="grant-row-"]')
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toContain('Sofia — KSS')
    // Form should clear
    expect(labelInput.value).toBe('')
  })

  it('authorizes a peer presenting a live grant token with the grant preset permissions', async () => {
    const { setPeerPermissions, createFullPermissions } = await import(
      '../../api/p2p-data-provider'
    )
    const mockSet = vi.mocked(setPeerPermissions)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Sofia' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const row = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid^="grant-row-"]') as HTMLElement
    const qr = row.querySelector('[data-testid="qr-code"]') as HTMLElement
    const token = new URL(qr.textContent!).searchParams.get('token')!

    mockSet.mockClear()
    act(() => {
      mockOnPeerToken?.('peer-abc', token)
    })

    expect(mockSet).toHaveBeenCalledWith('peer-abc', createFullPermissions())
  })

  it('stops authorizing peers presenting a revoked grant token', async () => {
    const { setPeerPermissions } = await import('../../api/p2p-data-provider')
    const mockSet = vi.mocked(setPeerPermissions)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Sofia' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const row = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid^="grant-row-"]') as HTMLElement
    const qr = row.querySelector('[data-testid="qr-code"]') as HTMLElement
    const token = new URL(qr.textContent!).searchParams.get('token')!

    const revokeBtn = row.querySelector('[data-testid^="grant-revoke-"]') as HTMLElement
    fireEvent.click(revokeBtn)

    mockSet.mockClear()
    act(() => {
      mockOnPeerToken?.('peer-xyz', token)
    })

    expect(mockSet).not.toHaveBeenCalled()
  })

  it('clears permissions for already-connected peers when their grant is revoked', async () => {
    const { clearPeerPermissions } = await import('../../api/p2p-data-provider')
    const mockClear = vi.mocked(clearPeerPermissions)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Sofia' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const row = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid^="grant-row-"]') as HTMLElement
    const qr = row.querySelector('[data-testid="qr-code"]') as HTMLElement
    const token = new URL(qr.textContent!).searchParams.get('token')!

    // Peer connects and presents the grant token before revoke
    act(() => {
      mockOnPeerToken?.('peer-abc', token)
    })

    mockClear.mockClear()
    const revokeBtn = row.querySelector('[data-testid^="grant-revoke-"]') as HTMLElement
    fireEvent.click(revokeBtn)

    expect(mockClear).toHaveBeenCalledWith('peer-abc')
  })

  it('only clears peers authenticated with the revoked grant, not others', async () => {
    const { clearPeerPermissions } = await import('../../api/p2p-data-provider')
    const mockClear = vi.mocked(clearPeerPermissions)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    // Grant 1 — will be revoked
    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Sofia' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    // Grant 2 — must NOT be affected
    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Lisa' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const panel = screen.getByTestId('live-tab-grants-panel')
    const rows = Array.from(panel.querySelectorAll('[data-testid^="grant-row-"]')) as HTMLElement[]
    const [row1, row2] = rows
    const token1 = new URL(
      (row1.querySelector('[data-testid="qr-code"]') as HTMLElement).textContent!,
    ).searchParams.get('token')!
    const token2 = new URL(
      (row2.querySelector('[data-testid="qr-code"]') as HTMLElement).textContent!,
    ).searchParams.get('token')!

    act(() => {
      mockOnPeerToken?.('peer-sofia', token1)
      mockOnPeerToken?.('peer-lisa', token2)
    })

    mockClear.mockClear()
    const revokeBtn = row1.querySelector('[data-testid^="grant-revoke-"]') as HTMLElement
    fireEvent.click(revokeBtn)

    expect(mockClear).toHaveBeenCalledWith('peer-sofia')
    expect(mockClear).not.toHaveBeenCalledWith('peer-lisa')
  })

  it('removes a grant row when its revoke button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const labelInput = screen.getByTestId('grant-label-input') as HTMLInputElement

    fireEvent.change(labelInput, { target: { value: 'First' } })
    fireEvent.click(screen.getByTestId('grant-submit'))
    fireEvent.change(labelInput, { target: { value: 'Second' } })
    fireEvent.click(screen.getByTestId('grant-submit'))

    const panel = screen.getByTestId('live-tab-grants-panel')
    expect(panel.querySelectorAll('[data-testid^="grant-row-"]').length).toBe(2)

    const firstRow = panel.querySelector('[data-testid^="grant-row-"]') as HTMLElement
    const revokeBtn = firstRow.querySelector('[data-testid^="grant-revoke-"]') as HTMLElement
    fireEvent.click(revokeBtn)

    const remaining = panel.querySelectorAll('[data-testid^="grant-row-"]')
    expect(remaining.length).toBe(1)
    expect(remaining[0].textContent).toContain('Second')
  })

  it('grant row contains a QR code, fullscreen button, and copy button tied to a /live share URL', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Anna' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    const row = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid^="grant-row-"]') as HTMLElement
    // QR code lives inside the row
    const qr = row.querySelector('[data-testid="qr-code"]')
    expect(qr).toBeTruthy()
    // QR value is a /live share URL carrying a token
    const url = new URL(qr!.textContent!)
    expect(url.pathname).toContain('/live/')
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(url.searchParams.get('share')).toBe('full')
    // Fullscreen + copy buttons inside the row
    expect(row.querySelector('[data-testid^="grant-fullscreen-"]')).toBeTruthy()
    expect(row.querySelector('[data-testid^="grant-copy-"]')).toBeTruthy()
  })

  it('grant row copy button exposes an aria-label for screen readers', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Lisa' },
    })
    fireEvent.click(screen.getByTestId('grant-submit'))

    const row = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid^="grant-row-"]') as HTMLElement
    const copyBtn = row.querySelector('[data-testid^="grant-copy-"]')
    expect(copyBtn?.getAttribute('aria-label')).toBe('Kopiera länk')
  })

  it('pressing Enter in the grant label input adds a grant', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const labelInput = screen.getByTestId('grant-label-input') as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'Enter Test' } })

    const form = labelInput.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    const panel = screen.getByTestId('live-tab-grants-panel')
    const rows = panel.querySelectorAll('[data-testid^="grant-row-"]')
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toContain('Enter Test')
    expect(labelInput.value).toBe('')
  })

  it('synthesizes a single Domare grant from a legacy session payload without grants', () => {
    sessionStorage.setItem(
      'lotta-live-session',
      JSON.stringify({ roomCode: 'LEGACY', refereeToken: 'legacy-token-abc' }),
    )

    renderLiveTab()
    fireEvent.click(screen.getByText('Återuppta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const rows = screen
      .getByTestId('live-tab-grants-panel')
      .querySelectorAll('[data-testid^="grant-row-"]')
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toContain('Domare')

    // The synthesized grant must carry the legacy referee token so existing
    // QR codes still resolve to the same session
    const qr = rows[0].querySelector('[data-testid="qr-code"]') as HTMLElement
    expect(new URL(qr.textContent!).searchParams.get('token')).toBe('legacy-token-abc')
  })

  it('repopulates peer authorization for restored grants after resuming', async () => {
    const { setPeerPermissions, createFullPermissions } = await import(
      '../../api/p2p-data-provider'
    )
    const mockSet = vi.mocked(setPeerPermissions)

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Domare Kalle' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    // Capture token before remount
    const qrBefore = screen
      .getByTestId('live-tab-grants-panel')
      .querySelector('[data-testid="qr-code"]') as HTMLElement
    const token = new URL(qrBefore.textContent!).searchParams.get('token')!

    cleanup()
    mockConnectionState = 'disconnected'
    mockRoomId = null

    renderLiveTab()
    fireEvent.click(screen.getByText('Återuppta Live'))

    mockSet.mockClear()
    act(() => {
      mockOnPeerToken?.('peer-after-restore', token)
    })

    expect(mockSet).toHaveBeenCalledWith('peer-after-restore', createFullPermissions())
  })

  it('restores saved grants from sessionStorage when resuming a live session', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    fireEvent.change(screen.getByTestId('grant-label-input'), {
      target: { value: 'Persisted Domare' },
    })
    fireEvent.click(screen.getByTestId('grant-preset-full'))
    fireEvent.click(screen.getByTestId('grant-submit'))

    // Simulate a tab refresh by unmounting and remounting
    cleanup()
    mockConnectionState = 'disconnected'
    mockRoomId = null

    renderLiveTab()
    fireEvent.click(screen.getByText('Återuppta Live'))
    fireEvent.click(screen.getByRole('tab', { name: 'Domarstyrning' }))

    const rows = screen
      .getByTestId('live-tab-grants-panel')
      .querySelectorAll('[data-testid^="grant-row-"]')
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toContain('Persisted Domare')
  })

  it('shows Domarstyrning sub-tab when hosting and switching to it does not destroy session', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    const refereeTab = screen.getByRole('tab', { name: 'Domarstyrning' })
    expect(refereeTab).toBeTruthy()

    mockLeaveCalled = false
    fireEvent.click(refereeTab)

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

  it('hides club codes until the organizer enables club filtering', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Opt-in by default — no codes visible
    expect(screen.queryByTestId('club-code-Skara SK')).toBeNull()

    // Organizer enables club filter
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    // Codes appear for every club and clubless
    expect(screen.getByTestId('club-code-Skara SK').textContent).toMatch(/^\d{4}$/)
    expect(screen.getByTestId('club-code-Lidköping SS').textContent).toMatch(/^\d{4}$/)
    expect(screen.getByTestId('club-code-__CLUBLESS__').textContent).toMatch(/^\d{4}$/)
  })

  it('shows player count next to each club row', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    const skaraRow = screen.getByTestId('club-code-Skara SK').closest('.live-tab-club-row')
    const lidkopingRow = screen.getByTestId('club-code-Lidköping SS').closest('.live-tab-club-row')
    const klubblosaRow = screen.getByTestId('club-code-__CLUBLESS__').closest('.live-tab-club-row')

    expect(skaraRow?.textContent).toContain('2 st')
    expect(lidkopingRow?.textContent).toContain('2 st')
    expect(klubblosaRow?.textContent).toContain('1 st')
  })

  it('renders player count in a dedicated muted element so it can be styled', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    const skaraRow = screen.getByTestId('club-code-Skara SK').closest('.live-tab-club-row')
    const count = skaraRow?.querySelector('.live-tab-club-count')
    expect(count).toBeTruthy()
    expect(count?.textContent).toBe('(2 st)')
  })

  it('renders a share button next to each club row', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    expect(screen.getByTestId('share-club-btn-Skara SK')).toBeTruthy()
    expect(screen.getByTestId('share-club-btn-Lidköping SS')).toBeTruthy()
    expect(screen.getByTestId('share-club-btn-__CLUBLESS__')).toBeTruthy()
  })

  it('opens a share dialog when the share button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    expect(screen.queryByTestId('share-club-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('share-club-btn-Skara SK'))
    expect(screen.getByTestId('share-club-dialog')).toBeTruthy()
  })

  it('opens a share dialog when the Klubblösa share button is clicked', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    expect(screen.queryByTestId('share-club-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('share-club-btn-__CLUBLESS__'))
    expect(screen.getByTestId('share-club-dialog')).toBeTruthy()
  })

  it('share dialog contains a QR code and a URL with a 4-digit club code', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))
    fireEvent.click(screen.getByTestId('share-club-btn-Skara SK'))

    const dialog = screen.getByTestId('share-club-dialog')
    const qr = dialog.querySelector('[data-testid="qr-code"]')
    expect(qr).toBeTruthy()
    const url = new URL(qr!.textContent!)
    expect(url.searchParams.get('share')).toBe('view')
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(url.searchParams.get('code')).toMatch(/^\d{4}$/)
  })

  it('share dialog displays the 4-digit club code prominently with helper text and a copy link button', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))
    fireEvent.click(screen.getByTestId('share-club-btn-Skara SK'))

    const dialog = screen.getByTestId('share-club-dialog')

    // Prominent code element — rendered as a semantic <code> tag so it reads as a code block
    const codeEl = dialog.querySelector('[data-testid="share-club-dialog-code"]')
    expect(codeEl).toBeTruthy()
    expect(codeEl!.tagName.toLowerCase()).toBe('code')
    expect(codeEl!.textContent).toMatch(/^\d{4}$/)

    // Helper text above the code explains when it's needed (the QR embeds the code,
    // but manual-entry users need to know where to type it)
    const helper = dialog.querySelector('[data-testid="share-club-dialog-hint"]')
    expect(helper).toBeTruthy()
    expect(helper!.textContent).toMatch(/ombedd|fråga|prompt|kod/i)

    // Copy-link button replaces the raw URL input — cleaner visual
    const copyBtn = dialog.querySelector('[data-testid="share-club-dialog-copy"]')
    expect(copyBtn).toBeTruthy()
    expect(copyBtn!.tagName.toLowerCase()).toBe('button')
  })

  it('broadcasts clubFilterEnabled=false on start and flips to true when organizer enables it', () => {
    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))

    // Trigger a peer-count broadcast with no opt-in yet
    mockBroadcastPeerCountCalls = []
    act(() => {
      mockOnPeersChange?.()
    })
    expect(mockBroadcastPeerCountCalls.at(-1)).toMatchObject({ clubFilterEnabled: false })

    // Organizer enables opt-in — should re-broadcast with the new value
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))
    expect(mockBroadcastPeerCountCalls.at(-1)).toMatchObject({ clubFilterEnabled: true })
  })

  it('downloads a PDF of the main viewer QR when its print button is clicked', async () => {
    renderLiveTab({ tournamentName: 'Main Cup' })
    fireEvent.click(screen.getByText('Starta Live'))

    fireEvent.click(screen.getByTestId('print-main-qr'))

    await waitFor(() => {
      expect(mockPdfSaveCalls.length).toBe(1)
    })
    const call = mockPdfSaveCalls[0]
    expect(call.filename).toMatch(/\.pdf$/i)
    expect(call.tournamentName).toBe('Main Cup')
    expect(call.entries.length).toBe(1)
    const entry = call.entries[0]
    expect(entry.qrDataUrl).toMatch(/^data:image\//)
    // Main viewer URL never prompts for a code — skip the manual-entry fallback
    expect(entry.code).toBeUndefined()
    // URL is the viewer share URL
    expect(entry.url).toContain('/live/')
  })

  it('downloads a PDF of club codes when "Skriv ut klubbkoder" is clicked', async () => {
    renderLiveTab({ tournamentName: 'Test Cup' })
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    fireEvent.click(screen.getByRole('button', { name: /Skriv ut klubbkoder/i }))

    await waitFor(() => {
      expect(mockPdfSaveCalls.length).toBe(1)
    })
    const { filename, entries } = mockPdfSaveCalls[0]
    expect(filename).toMatch(/\.pdf$/i)
    expect(filename.toLowerCase()).toContain('klubbkod')
    // One entry per club + clubless
    const labels = entries.map((e) => e.label)
    expect(labels).toContain('Skara SK')
    expect(labels).toContain('Lidköping SS')
    expect(labels).toContain('Klubblösa')
    // Each entry carries a pre-rendered QR data URL
    for (const entry of entries) {
      expect(entry.qrDataUrl).toMatch(/^data:image\//)
    }
    // Each entry carries its 4-digit club code
    const skaraCode = screen.getByTestId('club-code-Skara SK').textContent!
    const skaraEntry = entries.find((e) => e.label === 'Skara SK')
    expect(skaraEntry?.code).toBe(skaraCode)
  })

  it('does not derive club codes from publicly known tournament metadata', () => {
    const allClubs = ['Lidköping SS', 'Skara SK', '__CLUBLESS__']
    const insecureMap = generateClubCodeMap(allClubs, 'Test/')

    renderLiveTab()
    fireEvent.click(screen.getByText('Starta Live'))
    fireEvent.click(screen.getByRole('button', { name: /Aktivera klubbfilter/i }))

    const displayedCode = screen.getByTestId('club-code-Skara SK').textContent!
    expect(displayedCode).not.toBe(insecureMap['Skara SK'])
    expect(displayedCode).toMatch(/^\d{4}$/)
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

  it('shows disconnect button instead of start when connected to another host as client', () => {
    mockLiveStatusValue = { state: 'connected', role: 'client', peerCount: 1 }
    renderLiveTab()
    expect(screen.queryByText('Starta Live')).toBeNull()
    expect(screen.getByText('Koppla från')).toBeTruthy()
  })

  it('disconnects from the host when Koppla från is clicked', async () => {
    const { disconnectFromHost } = await import('../../api/p2p-session')
    const mockDisconnect = vi.mocked(disconnectFromHost)
    mockDisconnect.mockClear()

    mockLiveStatusValue = { state: 'connected', role: 'client', peerCount: 1 }
    renderLiveTab()

    fireEvent.click(screen.getByText('Koppla från'))

    expect(mockDisconnect).toHaveBeenCalled()
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
