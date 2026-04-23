import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createP2pClientProvider } from '../api/p2p-data-provider'
import { useChatAutoScroll } from '../hooks/useChatAutoScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import {
  isRateLimited,
  MAX_CHAT_HISTORY,
  MAX_CHAT_TEXT,
  resolveResultLabel,
  verifyChatMessage,
} from '../lib/chat'
import { playSound } from '../lib/notification-sounds'
import {
  type DiagnosticEntry,
  getIceProbeResult,
  P2PService,
  type RelaySocketInfo,
} from '../services/p2p-service'
import type {
  AnnouncementMessage,
  ChatMessage,
  P2PConnectionState,
  PageType,
  PageUpdateMessage,
  PeerCountMessage,
  ResultAckMessage,
  ResultSubmitMessage,
} from '../types/p2p'
import { ChatMessageItem } from './ChatMessageItem'
import { CompatWarnings } from './CompatWarnings'
import { ConnectionDiagnostics } from './ConnectionDiagnostics'
import { LiveNameEntry } from './LiveNameEntry'

interface LivePageProps {
  roomCode: string
  refereeName?: string
  refereeToken?: string
  kiosk?: boolean
  hostVersion?: string
}

interface CachedPage {
  pageType: PageType
  tournamentName: string
  roundNr: number
  html: string
  timestamp: number
}

interface AckFeedback {
  boardNr: number
  accepted: boolean
  reason?: string
  timestamp: number
}

interface PendingResult {
  tournamentId: number
  roundNr: number
  boardNr: number
  resultType: string
  resultDisplay?: string
}

/** Page types that are actually broadcast by the organizer. */
const BROADCAST_PAGE_TYPES: PageType[] = ['pairings', 'standings', 'refereePairings']

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  pairings: 'Lottning',
  standings: 'Ställning',
  refereePairings: 'Domare',
}

function cacheKey(roomCode: string, pageType: PageType, roundNr: number): string {
  return `lotta-p2p-${roomCode}-${pageType}-r${roundNr}`
}

function legacyCacheKey(roomCode: string, pageType: PageType): string {
  return `lotta-p2p-${roomCode}-${pageType}`
}

function loadCachedRounds(roomCode: string): Map<number, Map<PageType, CachedPage>> {
  const rounds = new Map<number, Map<PageType, CachedPage>>()
  // Scan localStorage for round-keyed entries
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(`lotta-p2p-${roomCode}-`)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const page = JSON.parse(raw) as CachedPage
      if (!page.roundNr || !page.pageType) continue
      let roundMap = rounds.get(page.roundNr)
      if (!roundMap) {
        roundMap = new Map()
        rounds.set(page.roundNr, roundMap)
      }
      roundMap.set(page.pageType, page)
    } catch {
      // Ignore invalid entries
    }
  }
  // Also try legacy keys (no round suffix) for backward compat
  for (const pt of BROADCAST_PAGE_TYPES) {
    const raw = localStorage.getItem(legacyCacheKey(roomCode, pt))
    if (!raw) continue
    try {
      const page = JSON.parse(raw) as CachedPage
      if (!page.roundNr) continue
      let roundMap = rounds.get(page.roundNr)
      if (!roundMap) {
        roundMap = new Map()
        rounds.set(page.roundNr, roundMap)
      }
      if (!roundMap.has(page.pageType)) {
        roundMap.set(page.pageType, page)
      }
    } catch {
      // Ignore
    }
  }
  return rounds
}

function saveCachedPage(roomCode: string, page: CachedPage): void {
  try {
    localStorage.setItem(cacheKey(roomCode, page.pageType, page.roundNr), JSON.stringify(page))
  } catch {
    // Ignore storage errors (quota exceeded, private browsing, etc.)
  }
}

function getConnectionLabel(state: P2PConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Live'
    case 'connecting':
      return 'Ansluter...'
    case 'disconnected':
      return 'Frånkopplad'
    case 'reconnecting':
      return 'Återansluter...'
    case 'host-offline':
      return 'Värd offline'
  }
}

function RoomCodeEntry() {
  const [codeInput, setCodeInput] = useState('')
  const navigate = useNavigate()

  const handleJoin = () => {
    const code = codeInput.trim().toUpperCase()
    if (code) {
      navigate({
        to: '/live/$roomCode',
        params: { roomCode: code },
        search: {
          ref: undefined,
          token: undefined,
          kiosk: undefined,
          share: undefined,
          v: undefined,
          code: undefined,
        },
      })
    }
  }

  return (
    <div className="live-page">
      <header className="live-header">
        <div className="live-title">Lotta Live</div>
      </header>
      <main className="live-content">
        <div className="live-room-entry">
          <label htmlFor="room-code-input">Ange rumskod:</label>
          <input
            id="room-code-input"
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoin()
            }}
            placeholder="T.ex. K7X3P2"
            maxLength={6}
            autoFocus
            className="live-room-code-input"
          />
          <button className="btn btn-primary" onClick={handleJoin} disabled={!codeInput.trim()}>
            Anslut
          </button>
        </div>
      </main>
    </div>
  )
}

export function LivePage({
  roomCode,
  refereeName,
  refereeToken,
  kiosk,
  hostVersion,
}: LivePageProps) {
  if (!roomCode) {
    return <RoomCodeEntry />
  }

  return (
    <LivePageInner
      roomCode={roomCode}
      refereeName={refereeName}
      refereeToken={refereeToken}
      kiosk={kiosk}
      hostVersion={hostVersion}
    />
  )
}

const KIOSK_ROTATE_MS = 15_000

function LivePageInner({
  roomCode,
  refereeName,
  refereeToken,
  kiosk: kioskFromUrl,
  hostVersion,
}: LivePageProps) {
  const normalizedRoom = roomCode.toLowerCase()
  const isReferee = !!refereeToken
  const versionMismatch = !!(hostVersion && __COMMIT_HASH__ && hostVersion !== __COMMIT_HASH__)
  const [mismatchDismissed, setMismatchDismissed] = useState(false)
  const [kiosk, setKiosk] = useState(!!kioskFromUrl)
  const serviceRef = useRef<P2PService | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [confirmedName, setConfirmedName] = useState<string | null>(isReferee ? null : '')
  const [rounds, setRounds] = useState<Map<number, Map<PageType, CachedPage>>>(() =>
    loadCachedRounds(normalizedRoom),
  )
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [latestRound, setLatestRound] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<PageType>(isReferee ? 'refereePairings' : 'pairings')
  const [tournamentName, setTournamentName] = useState<string>('')
  const [ackFeedback, setAckFeedback] = useState<AckFeedback | null>(null)
  const [connectionState, setConnectionState] = useState<P2PConnectionState>('connecting')
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null)
  const [peerCount, setPeerCount] = useState<PeerCountMessage | null>(null)
  const [announcement, setAnnouncement] = useState<AnnouncementMessage | null>(null)
  const [kicked, setKicked] = useState(false)
  const [newRoundAlert, setNewRoundAlert] = useState<number | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [unreadChat, setUnreadChat] = useState(0)
  const [chatEnabled, setChatEnabled] = useState(true)
  const [hostRefreshing, setHostRefreshing] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnosticLog, setDiagnosticLog] = useState<DiagnosticEntry[]>([])
  const [relayStatus, setRelayStatus] = useState<RelaySocketInfo[]>([])
  const [rtcPeerStates, setRtcPeerStates] = useState<{ peerId: string; state: string }[]>([])
  const [diagInfo, setDiagInfo] = useState({
    roomId: '',
    selfId: '',
    role: '',
    strategy: '',
    reconnects: 0,
    hostId: '',
  })
  const chatOpenRef = useRef(false)
  const chatEnabledRef = useRef(true)
  const chatRateLimitRef = useRef(new Map<string, number>())
  const highestRoundRef = useRef<number | null>(null)
  const { scrollRef: chatScrollRef, bottomRef: chatBottomRef } = useChatAutoScroll(chatMessages)
  useDocumentTitle(unreadChat, tournamentName || normalizedRoom)

  const handlePageUpdate = useCallback(
    (msg: PageUpdateMessage) => {
      const page: CachedPage = {
        pageType: msg.pageType,
        tournamentName: msg.tournamentName,
        roundNr: msg.roundNr,
        html: msg.html,
        timestamp: msg.timestamp,
      }
      setRounds((prev) => {
        const next = new Map(prev)
        let roundMap = next.get(msg.roundNr)
        if (!roundMap) {
          roundMap = new Map()
          next.set(msg.roundNr, roundMap)
        } else {
          roundMap = new Map(roundMap)
          next.set(msg.roundNr, roundMap)
        }
        roundMap.set(msg.pageType, page)
        return next
      })
      // Auto-select latest incoming round
      setLatestRound((prev) => (prev === null || msg.roundNr >= prev ? msg.roundNr : prev))
      setSelectedRound((prev) => (prev === null || msg.roundNr > (prev ?? 0) ? msg.roundNr : prev))
      if (
        msg.pageType === 'pairings' &&
        highestRoundRef.current !== null &&
        msg.roundNr > highestRoundRef.current
      ) {
        playSound('round')
        setNewRoundAlert(msg.roundNr)
        setTimeout(() => setNewRoundAlert(null), 8000)
      }
      if (highestRoundRef.current === null || msg.roundNr > highestRoundRef.current) {
        highestRoundRef.current = msg.roundNr
      }
      saveCachedPage(normalizedRoom, page)
      if (msg.tournamentName) {
        setTournamentName(msg.tournamentName)
      }
    },
    [normalizedRoom],
  )

  const handleResultAck = useCallback((msg: ResultAckMessage) => {
    setAckFeedback({
      boardNr: msg.boardNr,
      accepted: msg.accepted,
      reason: msg.reason,
      timestamp: Date.now(),
    })
  }, [])

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim()
    if (!text || !serviceRef.current || !chatEnabledRef.current) return
    const senderName = isReferee
      ? confirmedName || refereeName || 'Domare'
      : confirmedName || 'Åskådare'
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      senderName,
      senderRole: isReferee ? 'referee' : 'viewer',
      text,
      timestamp: Date.now(),
    }
    serviceRef.current.broadcastChatMessage(msg)
    setChatMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), msg])
    setChatInput('')
  }, [chatInput, isReferee, confirmedName, refereeName])

  useEffect(() => {
    // Wait for referee to confirm their name before connecting
    if (confirmedName === null) return

    const role = isReferee ? 'referee' : 'viewer'
    const label = isReferee && confirmedName ? confirmedName : undefined
    const service = new P2PService(role, refereeToken, label)
    serviceRef.current = service
    service.onPageUpdate = handlePageUpdate
    service.onResultAck = handleResultAck
    const rpcProvider = createP2pClientProvider(service)
    service.onConnectionStateChange = (state) => {
      setConnectionState(state)
      if (state === 'connected') {
        void rpcProvider.pages
          ?.getCurrent()
          .then((messages) => {
            for (const msg of messages) handlePageUpdate(msg)
          })
          .catch((err: unknown) => {
            // Old hosts don't grant pages.getCurrent → "Permission denied"
            // comes back as a string. Swallow that case; surface anything else
            // so a misconfiguration isn't invisible.
            const msg = err instanceof Error ? err.message : String(err)
            if (!msg.includes('Permission denied')) {
              console.warn('pages.getCurrent bootstrap failed:', msg)
            }
          })
      }
    }
    service.onPeerCount = (msg) => {
      setPeerCount(msg)
      if (msg.chatEnabled !== undefined) {
        setChatEnabled(msg.chatEnabled)
        chatEnabledRef.current = msg.chatEnabled
      }
    }
    service.onAnnouncement = (msg) => setAnnouncement(msg)
    service.onChatMessage = (msg: ChatMessage, peerId: string) => {
      if (!chatEnabledRef.current) return
      if (isRateLimited(peerId, chatRateLimitRef.current)) return
      const verifiedMsg = verifyChatMessage(msg, peerId, service.getPeers())
      setChatMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), verifiedMsg])
      playSound('chat')
      if (!chatOpenRef.current) {
        setUnreadChat((prev) => prev + 1)
      }
    }
    service.onChatDelete = (msg, peerId) => {
      const peer = service.getPeers().find((p) => p.id === peerId)
      if (peer?.role !== 'organizer') return
      setChatMessages((prev) => prev.filter((m) => m.id !== msg.id))
    }
    service.onHostRefreshing = (refreshing) => setHostRefreshing(refreshing)
    service.onKicked = () => {
      setKicked(true)
      service.leave()
    }
    service.onDiagnosticEvent = (entry: DiagnosticEntry) => {
      setDiagnosticLog((prev) => [...prev.slice(-99), entry])
    }
    service.joinRoom(normalizedRoom)

    return () => {
      service.leave()
      serviceRef.current = null
    }
  }, [normalizedRoom, handlePageUpdate, handleResultAck, isReferee, refereeToken, confirmedName])

  // Listen for postMessage from referee pairings iframe
  useEffect(() => {
    if (!isReferee || confirmedName === null) return

    function handleMessage(event: MessageEvent) {
      // event.source can be null in sandboxed srcdoc iframes on some browsers (Android Chrome)
      if (iframeRef.current && event.source && event.source !== iframeRef.current.contentWindow)
        return
      const data = event.data
      if (data?.type !== 'referee-result') return
      setPendingResult({
        tournamentId: data.tournamentId,
        roundNr: data.roundNr,
        boardNr: data.boardNr,
        resultType: data.resultType,
        resultDisplay: data.resultDisplay,
      })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isReferee, confirmedName])

  // Auto-dismiss ack feedback after 3 seconds
  useEffect(() => {
    if (!ackFeedback) return
    const timer = setTimeout(() => setAckFeedback(null), 3000)
    return () => clearTimeout(timer)
  }, [ackFeedback])

  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  // Poll relay status and diagnostic info while panel is visible
  useEffect(() => {
    if (!showDiagnostics || confirmedName === null) return
    function updateDiagnostics() {
      const svc = serviceRef.current
      if (svc) {
        setRelayStatus(svc.getRelayStatus())
        setRtcPeerStates(svc.getRtcPeerStates())
        setDiagInfo({
          roomId: svc.roomId ?? '',
          selfId: svc.getSelfId(),
          role: svc.role,
          strategy: svc.strategy,
          reconnects: svc.reconnectAttempts,
          hostId: svc.getObservedHostId() ?? '',
        })
      }
    }
    updateDiagnostics()
    const timer = setInterval(updateDiagnostics, 3000)
    return () => clearInterval(timer)
  }, [showDiagnostics, confirmedName])

  // Kiosk auto-rotation between available page types
  const availableTabsForRotation = Array.from(
    (rounds.get(selectedRound ?? latestRound ?? 0) ?? new Map()).keys(),
  ).filter((pt) => pt !== 'refereePairings')
  const kioskTabsRef = useRef(availableTabsForRotation)
  useEffect(() => {
    kioskTabsRef.current = availableTabsForRotation
  }, [availableTabsForRotation])
  useEffect(() => {
    if (!kiosk || availableTabsForRotation.length < 2) return
    const timer = setInterval(() => {
      setActiveTab((prev) => {
        const tabs = kioskTabsRef.current
        const idx = tabs.indexOf(prev)
        return tabs[(idx + 1) % tabs.length]
      })
    }, KIOSK_ROTATE_MS)
    return () => clearInterval(timer)
  }, [kiosk, availableTabsForRotation.length])

  // Kicked screen
  if (kicked) {
    return (
      <div className="live-page">
        <header className="live-header">
          <div className="live-title">Frånkopplad</div>
        </header>
        <main className="live-content">
          <div className="live-kicked">Du har kopplats bort av arrangören.</div>
        </main>
      </div>
    )
  }

  // Round selector: available rounds sorted
  const availableRounds = Array.from(rounds.keys()).sort((a, b) => a - b)
  const effectiveRound = selectedRound ?? latestRound ?? availableRounds[availableRounds.length - 1]
  const pages: Map<PageType, CachedPage> =
    effectiveRound != null
      ? (rounds.get(effectiveRound) ?? new Map<PageType, CachedPage>())
      : new Map<PageType, CachedPage>()

  // Derive tournament name from cached pages if not set from live data
  const displayName =
    tournamentName ||
    Array.from(pages.values()).find((p) => p.tournamentName)?.tournamentName ||
    // Also check other rounds
    Array.from(rounds.values())
      .flatMap((m) => Array.from(m.values()))
      .find((p) => p.tournamentName)?.tournamentName ||
    ''

  const availableTabs = Array.from(pages.keys())
  const activePage = pages.get(activeTab)

  // If active tab has no data, switch to first available
  const effectiveTab = activePage ? activeTab : (availableTabs[0] ?? 'pairings')
  const effectivePage = pages.get(effectiveTab)

  // Referee pairings iframe needs allow-scripts for postMessage interaction
  const iframeSandbox = effectiveTab === 'refereePairings' ? 'allow-scripts' : ''

  // Referee name entry screen
  if (isReferee && confirmedName === null) {
    return (
      <LiveNameEntry
        title="Domare"
        onConfirm={setConfirmedName}
        warning={
          versionMismatch ? (
            <div className="live-version-warning">
              Arrangörens version ({hostVersion}) skiljer sig från din ({__COMMIT_HASH__}). Det kan
              uppstå oväntade problem.
            </div>
          ) : null
        }
      />
    )
  }

  return (
    <div className={`live-page${kiosk ? ' live-page--kiosk' : ''}`}>
      <header className="live-header">
        <div className="live-title">
          {displayName || normalizedRoom}
          <span className="live-room-code">{roomCode.toUpperCase()}</span>
          {availableRounds.length >= 2 && (
            <select
              className="live-round-select"
              value={effectiveRound ?? ''}
              onChange={(e) => setSelectedRound(Number(e.target.value))}
            >
              {availableRounds.map((r) => (
                <option key={r} value={r}>
                  Rond {r}
                  {r === latestRound ? ' (senaste)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="live-header-actions">
          <button
            type="button"
            className="btn btn-small live-kiosk-toggle"
            data-testid="kiosk-toggle"
            onClick={() => setKiosk((prev) => !prev)}
            title={kiosk ? 'Avsluta projektorläge' : 'Projektorläge'}
            aria-pressed={kiosk}
          >
            ⛶
          </button>
          <button
            className={`live-status live-status--${connectionState}`}
            onClick={() => setShowDiagnostics((prev) => !prev)}
            title="Visa anslutningsdiagnostik"
          >
            <span className="live-status-dot" />
            {getConnectionLabel(connectionState)}
            {peerCount && <span className="live-peer-count">{peerCount.total} anslutna</span>}
            {__COMMIT_HASH__ && <span className="live-version-label">{__COMMIT_HASH__}</span>}
          </button>
        </div>
      </header>

      {showDiagnostics && (
        <ConnectionDiagnostics
          diagInfo={diagInfo}
          relayStatus={relayStatus}
          diagnosticLog={diagnosticLog}
          reconnectAttempts={diagInfo.reconnects}
          rtcPeerStates={rtcPeerStates}
        />
      )}

      {versionMismatch && !mismatchDismissed && (
        <div className="live-version-warning-banner">
          <span>
            Arrangörens version ({hostVersion}) skiljer sig från din ({__COMMIT_HASH__}). Det kan
            uppstå oväntade problem.
          </span>
          <button onClick={() => setMismatchDismissed(true)}>Stäng</button>
        </div>
      )}

      {newRoundAlert && (
        <div className="live-new-round-alert">Rond {newRoundAlert} har lottats!</div>
      )}

      {announcement && (
        <div className="live-announcement">
          <span>{announcement.text}</span>
          <button onClick={() => setAnnouncement(null)}>Stäng</button>
        </div>
      )}

      {availableTabs.length > 0 && (
        <nav className="live-tabs" role="tablist">
          {availableTabs.map((pt) => (
            <button
              key={pt}
              role="tab"
              aria-selected={effectiveTab === pt}
              className={`live-tab ${effectiveTab === pt ? 'live-tab--active' : ''}`}
              onClick={() => setActiveTab(pt)}
            >
              {PAGE_TYPE_LABELS[pt] || pt}
            </button>
          ))}
        </nav>
      )}

      <main className="live-content">
        {hostRefreshing && connectionState === 'connected' && (
          <div className="live-refreshing-banner">Värden laddar om\u2026</div>
        )}
        {connectionState === 'host-offline' && effectivePage && (
          <div className="live-offline-banner">Värden är offline — visar senaste kända data</div>
        )}
        {effectivePage ? (
          <iframe
            ref={iframeRef}
            srcDoc={effectivePage.html}
            title={PAGE_TYPE_LABELS[effectiveTab] || effectiveTab}
            className="live-iframe"
            sandbox={iframeSandbox}
          />
        ) : (
          <div className="live-waiting">
            {connectionState === 'connecting'
              ? 'Ansluter till turneringen...'
              : connectionState === 'host-offline'
                ? 'Värden är offline — visar senaste data...'
                : connectionState === 'reconnecting'
                  ? 'Återansluter...'
                  : 'Väntar på turneringsdata...'}
            {connectionState === 'connecting' && getIceProbeResult() === 'restricted' && (
              <p className="live-webrtc-warning">
                Din webbläsare begränsar WebRTC. Anslutning sker via relä, vilket kan ta längre tid.
                Om det inte fungerar, prova Chrome eller ändra WebRTC-inställningarna i webbläsaren.
              </p>
            )}
            {connectionState === 'connecting' && <CompatWarnings />}
          </div>
        )}
      </main>

      {chatEnabled && !kiosk && (
        <div className="live-chat-toggle">
          <button
            className={`btn btn-small${unreadChat > 0 ? ' live-chat-unread' : ''}`}
            onClick={() => {
              setChatOpen((prev) => !prev)
              if (!chatOpen) setUnreadChat(0)
            }}
          >
            Chatt{unreadChat > 0 ? ` (${unreadChat})` : ''} {chatOpen ? '▼' : '▲'}
          </button>
        </div>
      )}

      {chatOpen && chatEnabled && (
        <div className="live-chat-panel live-chat-panel--viewer">
          <div className="live-chat-messages" ref={chatScrollRef}>
            {chatMessages.length === 0 ? (
              <p className="live-tab-empty">Inga meddelanden ännu.</p>
            ) : (
              chatMessages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="live-chat-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChatMessage()
              }}
              placeholder="Skriv ett meddelande..."
              maxLength={MAX_CHAT_TEXT}
            />
            <button
              className="btn btn-primary"
              disabled={!chatInput.trim()}
              onClick={sendChatMessage}
            >
              Skicka
            </button>
          </div>
        </div>
      )}

      {pendingResult && (
        <div className="live-confirm">
          <span>
            Bord {pendingResult.boardNr}:{' '}
            {resolveResultLabel(pendingResult.resultType, pendingResult.resultDisplay)} — Bekräfta?
          </span>
          <button
            className="btn-confirm"
            onClick={() => {
              serviceRef.current?.submitResult({
                tournamentId: pendingResult.tournamentId,
                roundNr: pendingResult.roundNr,
                boardNr: pendingResult.boardNr,
                resultType: pendingResult.resultType as ResultSubmitMessage['resultType'],
                resultDisplay: pendingResult.resultDisplay,
                refereeName: confirmedName || refereeName || '',
                timestamp: Date.now(),
              })
              setPendingResult(null)
            }}
          >
            Bekräfta
          </button>
          <button className="btn-cancel" onClick={() => setPendingResult(null)}>
            Avbryt
          </button>
        </div>
      )}

      {ackFeedback && (
        <div
          className={`live-ack ${ackFeedback.accepted ? 'live-ack--accepted' : 'live-ack--rejected'}`}
        >
          {ackFeedback.accepted
            ? `Bord ${ackFeedback.boardNr}: Resultat registrerat`
            : `Bord ${ackFeedback.boardNr}: ${ackFeedback.reason ?? 'Avvisad'}`}
        </div>
      )}
    </div>
  )
}
