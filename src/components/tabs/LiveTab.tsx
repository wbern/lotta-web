import QRCode from 'qrcode'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLocalProvider } from '../../api/local-data-provider'
import { handleResultSubmission, sendCurrentStateToPeer } from '../../api/p2p-broadcast'
import type { RpcPermissions } from '../../api/p2p-data-provider'
import {
  clearAllPeerPermissions,
  createFullPermissions,
  createViewPermissions,
  setPeerPermissions,
  startP2pRpcServer,
} from '../../api/p2p-data-provider'
import { generateClubCodeMap } from '../../domain/club-codes'
import { buildClubCodesPdf } from '../../domain/club-codes-pdf'
import { CLUBLESS_KEY } from '../../domain/club-filter'
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { setLiveStatus } from '../../hooks/useLiveStatus'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useTournamentPlayers } from '../../hooks/useTournamentPlayers'
import {
  isRateLimited,
  MAX_CHAT_HISTORY,
  MAX_CHAT_TEXT,
  resolveResultLabel,
  verifyChatMessage,
} from '../../lib/chat'
import { getKioskUrl, getShareUrl, getViewUrl, getViewUrlWithCode } from '../../lib/live-urls'
import { playSound } from '../../lib/notification-sounds'
import { queryClient } from '../../query-client'
import { subscribeMutationBroadcast } from '../../services/mutation-broadcast'
import { clearP2PService, setP2PService } from '../../services/p2p-provider'
import { type DiagnosticEntry, P2PService, type RelaySocketInfo } from '../../services/p2p-service'
import type { AuditLogEntry, ChatMessage, P2PPeer } from '../../types/p2p'
import { ChatMessageItem } from '../ChatMessageItem'
import { ConnectionDiagnostics } from '../ConnectionDiagnostics'
import { Dialog } from '../dialogs/Dialog'
import { EmptyState } from '../EmptyState'

type LiveSubTab = 'delning' | 'vydelning' | 'logg' | 'chatt'

interface Props {
  tournamentName: string
  tournamentId: number
  round: number | undefined
}

const SESSION_KEY = 'lotta-live-session'
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface SavedSession {
  roomCode: string
  refereeToken: string
}

function getSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedSession
  } catch {
    return null
  }
}

function saveSession(roomCode: string, refereeToken: string): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, refereeToken }))
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

function generateRoomCode(): string {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('')
}

function generateRefereeToken(): string {
  return crypto.randomUUID()
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function LiveTab({ tournamentName, tournamentId, round }: Props) {
  const online = useOnlineStatus()
  const serviceRef = useRef<P2PService | null>(null)
  const tournamentIdRef = useRef(tournamentId)
  const roundRef = useRef(round)
  const [isHosting, setIsHosting] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [refereeToken, setRefereeToken] = useState('')
  const [peers, setPeers] = useState<P2PPeer[]>([])
  const [peerTimestamp, setPeerTimestamp] = useState(() => Date.now())
  const [copied, setCopied] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<LiveSubTab>('delning')
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [announcementText, setAnnouncementText] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [unreadChat, setUnreadChat] = useState(0)
  const [chatEnabled, setChatEnabled] = useState(true)
  const [qrFullscreen, setQrFullscreen] = useState<string | null>(null)
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set())
  const mutedPeersRef = useRef<Set<string>>(new Set())
  const chatMessagesRef = useRef<ChatMessage[]>([])
  const chatEnabledRef = useRef(true)
  const activeSubTabRef = useRef<LiveSubTab>('delning')
  const chatRateLimitRef = useRef(new Map<string, number>())
  const mutationUnsubRef = useRef<(() => void) | null>(null)
  const [viewToken, setViewToken] = useState('')
  const [clubCodeSecret, setClubCodeSecret] = useState<string | null>(null)
  const tokenPermissionsRef = useRef(new Map<string, RpcPermissions>())
  const allClubEntriesRef = useRef<string[]>([])
  const [clubFilterEnabled, setClubFilterEnabled] = useState(false)
  const clubFilterEnabledRef = useRef(false)
  const [shareClubDialog, setShareClubDialog] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnosticLog, setDiagnosticLog] = useState<DiagnosticEntry[]>([])
  const [relayStatus, setRelayStatus] = useState<RelaySocketInfo[]>([])
  const [rtcPeerStates, setRtcPeerStates] = useState<{ peerId: string; state: string }[]>([])
  const [diagInfo, setDiagInfo] = useState({ roomId: '', selfId: '', role: '', strategy: '' })
  const { scrollRef: chatScrollRef, bottomRef: chatBottomRef } = useChatAutoScroll(chatMessages)
  const { data: tournamentPlayersData } = useTournamentPlayers(tournamentId)
  const clubPlayerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    let clubless = 0
    for (const p of tournamentPlayersData ?? []) {
      if (p.club) counts.set(p.club, (counts.get(p.club) ?? 0) + 1)
      else clubless++
    }
    return { counts, clubless }
  }, [tournamentPlayersData])
  const clubs = useMemo(() => [...clubPlayerCounts.counts.keys()].sort(), [clubPlayerCounts.counts])
  const hasClublessPlayers = clubPlayerCounts.clubless > 0
  const allClubEntries = useMemo(() => {
    const entries = [...clubs]
    if (hasClublessPlayers) entries.push(CLUBLESS_KEY)
    return entries
  }, [clubs, hasClublessPlayers])
  const clubCodeMap = useMemo(() => {
    if (!clubCodeSecret) return {}
    return generateClubCodeMap(allClubEntries, clubCodeSecret)
  }, [allClubEntries, clubCodeSecret])

  useDocumentTitle(unreadChat, `Live: ${tournamentName}`)
  useEffect(() => {
    tournamentIdRef.current = tournamentId
    roundRef.current = round
  }, [tournamentId, round])
  useEffect(() => {
    chatEnabledRef.current = chatEnabled
  }, [chatEnabled])
  useEffect(() => {
    activeSubTabRef.current = activeSubTab
  }, [activeSubTab])
  useEffect(() => {
    mutedPeersRef.current = mutedPeers
  }, [mutedPeers])
  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])
  useEffect(() => {
    allClubEntriesRef.current = allClubEntries
  }, [allClubEntries])

  const startHosting = useCallback((saved?: SavedSession) => {
    if (serviceRef.current) return // Prevent double-start
    const code = saved?.roomCode ?? generateRoomCode()
    const token = saved?.refereeToken ?? generateRefereeToken()
    const vToken = crypto.randomUUID()
    const secret = crypto.randomUUID()
    saveSession(code, token)
    const service = new P2PService('organizer', token)
    serviceRef.current = service
    setP2PService(service)
    setClubCodeSecret(secret)

    // Set up token → permissions mapping
    const tokenPerms = tokenPermissionsRef.current
    tokenPerms.clear()
    tokenPerms.set(token, createFullPermissions())
    tokenPerms.set(vToken, createViewPermissions())

    // When a peer presents a token, assign per-peer permissions
    service.onPeerToken = (peerId: string, peerToken: string) => {
      const perms = tokenPerms.get(peerToken)
      if (perms) {
        setPeerPermissions(peerId, perms)
      }
    }

    setViewToken(vToken)

    service.onResultSubmit = (msg, peerId) => {
      handleResultSubmission(msg, peerId, (entry) => {
        setAuditLog((prev) => [entry, ...prev])
        playSound('result')
        const resultLabel = resolveResultLabel(entry.resultType, entry.resultDisplay)
        const statusText = entry.accepted
          ? `${entry.refereeName} rapporterade ${resultLabel} på bord ${entry.boardNr}`
          : `${entry.refereeName}: ${resultLabel} bord ${entry.boardNr} — ${entry.reason ?? 'avvisad'}`
        const systemMsg: ChatMessage = {
          id: crypto.randomUUID(),
          senderName: '',
          senderRole: 'organizer',
          text: statusText,
          timestamp: entry.timestamp,
          isSystem: true,
        }
        if (serviceRef.current) {
          serviceRef.current.broadcastChatMessage(systemMsg)
        }
        setChatMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), systemMsg])
      })
    }

    service.onPeersChange = () => {
      if (serviceRef.current) {
        const currentPeers = serviceRef.current.getPeers()
        setPeers([...currentPeers])
        setPeerTimestamp(Date.now())
        const refs = currentPeers.filter((p) => p.role === 'referee').length
        const viewers = currentPeers.filter((p) => p.role !== 'referee').length
        serviceRef.current.broadcastPeerCount({
          total: currentPeers.length + 1,
          viewers,
          referees: refs,
          chatEnabled: chatEnabledRef.current,
          clubFilterEnabled: clubFilterEnabledRef.current,
        })
        setLiveStatus({ state: 'connected', role: 'host', peerCount: currentPeers.length })
      }
    }

    service.onChatMessage = (msg: ChatMessage, peerId: string) => {
      if (!chatEnabledRef.current) return
      if (mutedPeersRef.current.has(peerId)) return
      if (isRateLimited(peerId, chatRateLimitRef.current)) return
      const peers = serviceRef.current?.getPeers() ?? []
      const verifiedMsg = verifyChatMessage(msg, peerId, peers)
      setChatMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), verifiedMsg])
      playSound('chat')
      if (activeSubTabRef.current !== 'chatt') {
        setUnreadChat((prev) => prev + 1)
      }
    }

    service.onDiagnosticEvent = (entry: DiagnosticEntry) => {
      setDiagnosticLog((prev) => [...prev.slice(-99), entry])
    }

    service.onNewPeerJoin = (peerId: string) => {
      if (roundRef.current != null) {
        sendCurrentStateToPeer(peerId, tournamentIdRef.current, roundRef.current)
      }
      for (const msg of chatMessagesRef.current) {
        serviceRef.current?.sendChatMessageToPeer(msg, peerId)
      }
    }

    startP2pRpcServer(service, getLocalProvider(), {
      onMutation: () => {
        queryClient.invalidateQueries()
        service.broadcastDataChanged()
      },
      clubCodeSecret: secret,
      getAllClubEntries: () => allClubEntriesRef.current,
    })

    mutationUnsubRef.current = subscribeMutationBroadcast(queryClient, () =>
      service.broadcastDataChanged(),
    )

    service.startHosting(code)
    setRoomCode(code)
    setRefereeToken(token)
    setIsHosting(true)
    setActiveSubTab('delning')
    setLiveStatus({ state: 'connected', role: 'host', peerCount: 0 })
  }, [])

  const stopHosting = useCallback(() => {
    mutationUnsubRef.current?.()
    mutationUnsubRef.current = null
    if (serviceRef.current) {
      serviceRef.current.leave()
      serviceRef.current = null
      clearP2PService()
    }
    clearSession()
    clearAllPeerPermissions()
    tokenPermissionsRef.current.clear()
    setLiveStatus(null)
    setIsHosting(false)
    setRoomCode('')
    setRefereeToken('')
    setPeers([])
    setActiveSubTab('delning')
    setChatMessages([])
    setUnreadChat(0)
    setChatEnabled(true)
    chatEnabledRef.current = true
    chatRateLimitRef.current.clear()
    setMutedPeers(new Set())
    mutedPeersRef.current = new Set()
    setViewToken('')
    setClubCodeSecret(null)
    setClubFilterEnabled(false)
    clubFilterEnabledRef.current = false
    setShowDiagnostics(false)
    setDiagnosticLog([])
    setRelayStatus([])
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mutationUnsubRef.current?.()
      mutationUnsubRef.current = null
      setLiveStatus(null)
      clearAllPeerPermissions()
      if (serviceRef.current) {
        serviceRef.current.leave()
        serviceRef.current = null
        clearP2PService()
      }
    }
  }, [])

  // Poll relay status and diagnostic info while panel is visible
  useEffect(() => {
    if (!isHosting || !showDiagnostics) return
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
        })
      }
    }
    updateDiagnostics()
    const timer = setInterval(updateDiagnostics, 3000)
    return () => clearInterval(timer)
  }, [isHosting, showDiagnostics])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(label)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => {
        // Clipboard API may fail in insecure contexts
      })
  }, [])

  const printMainQr = useCallback(async () => {
    if (!roomCode || !viewToken) return
    const url = getViewUrl(roomCode, viewToken)
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 })
    const doc = buildClubCodesPdf({
      tournamentName,
      entries: [{ label: tournamentName, code: roomCode, url, qrDataUrl }],
    })
    doc.save(`live-${tournamentName}.pdf`)
  }, [roomCode, viewToken, tournamentName])

  const printClubCodes = useCallback(async () => {
    if (!roomCode || !viewToken) return
    const entries = await Promise.all(
      allClubEntries.map(async (entry) => {
        const code = clubCodeMap[entry] ?? ''
        const url = getViewUrlWithCode(roomCode, viewToken, code)
        const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 })
        const label = entry === CLUBLESS_KEY ? 'Klubblösa' : entry
        return { label, code, url, qrDataUrl }
      }),
    )
    const doc = buildClubCodesPdf({ tournamentName, entries })
    doc.save(`klubbkoder-${tournamentName}.pdf`)
  }, [allClubEntries, clubCodeMap, roomCode, viewToken, tournamentName])

  const setClubFilterAndBroadcast = useCallback((enabled: boolean) => {
    clubFilterEnabledRef.current = enabled
    setClubFilterEnabled(enabled)
    if (serviceRef.current) {
      const currentPeers = serviceRef.current.getPeers()
      const refs = currentPeers.filter((p) => p.role === 'referee').length
      const viewers = currentPeers.filter((p) => p.role !== 'referee').length
      serviceRef.current.broadcastPeerCount({
        total: currentPeers.length + 1,
        viewers,
        referees: refs,
        chatEnabled: chatEnabledRef.current,
        clubFilterEnabled: enabled,
      })
    }
  }, [])

  const toggleChat = useCallback(() => {
    setChatEnabled((prev) => {
      const next = !prev
      chatEnabledRef.current = next
      if (serviceRef.current) {
        const currentPeers = serviceRef.current.getPeers()
        const refs = currentPeers.filter((p) => p.role === 'referee').length
        const viewers = currentPeers.filter((p) => p.role !== 'referee').length
        serviceRef.current.broadcastPeerCount({
          total: currentPeers.length + 1,
          viewers,
          referees: refs,
          chatEnabled: next,
        })
      }
      return next
    })
  }, [])

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim()
    if (!text || !serviceRef.current || !chatEnabledRef.current) return
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      senderName: 'Arrangör',
      senderRole: 'organizer',
      text,
      timestamp: Date.now(),
    }
    serviceRef.current.broadcastChatMessage(msg)
    setChatMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), msg])
    setChatInput('')
  }, [chatInput])

  const viewUrl = roomCode && viewToken ? getViewUrl(roomCode, viewToken) : ''

  const refereeCount = peers.filter((p) => p.role === 'referee').length
  const viewerCount = peers.filter((p) => p.role !== 'referee').length

  const savedSession = getSavedSession()

  if (!isHosting) {
    return (
      <div className="live-tab-container">
        <div className="live-tab-intro">
          <EmptyState
            icon="broadcast"
            title="Live-delning (Beta)"
            description="Starta live-delning för att låta åskådare följa turneringen i realtid på sina telefoner och datorer. Domare kan också rapportera resultat direkt."
          />
          {savedSession ? (
            <div className="live-tab-resume">
              <p>
                En tidigare session hittades (rum <code>{savedSession.roomCode}</code>).
              </p>
              <div className="live-tab-resume-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => startHosting(savedSession)}
                  disabled={!online}
                >
                  Återuppta Live
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    clearSession()
                    startHosting()
                  }}
                  disabled={!online}
                >
                  Starta ny
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => startHosting()} disabled={!online}>
              Starta Live
            </button>
          )}
          {!online && (
            <p style={{ color: 'var(--color-status-error)', marginTop: 8 }}>
              Ingen internetanslutning — live-delning kräver nätverk.
            </p>
          )}
        </div>
      </div>
    )
  }

  const shareUrl = refereeToken ? getShareUrl(roomCode, refereeToken) : ''

  return (
    <div className="live-tab-container">
      <div className="live-tab-hosting">
        <div className="live-tab-header">
          <h3>
            Live: {tournamentName}{' '}
            <button
              className="live-tab-badge"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              title="Visa anslutningsdiagnostik"
            >
              {peers.length} anslutna
              {refereeCount > 0 && ` (${refereeCount} domare)`}
            </button>
          </h3>
          <button className="btn btn-danger" onClick={stopHosting}>
            Stoppa Live
          </button>
        </div>

        {showDiagnostics && (
          <ConnectionDiagnostics
            diagInfo={diagInfo}
            relayStatus={relayStatus}
            diagnosticLog={diagnosticLog}
            peerCount={peers.length}
            rtcPeerStates={rtcPeerStates}
          />
        )}

        <div className="live-tab-subtabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeSubTab === 'delning'}
            className={`live-tab-subtab ${activeSubTab === 'delning' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('delning')}
          >
            Delning
          </button>
          <button
            role="tab"
            aria-selected={activeSubTab === 'vydelning'}
            className={`live-tab-subtab ${activeSubTab === 'vydelning' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('vydelning')}
          >
            Dela vy
          </button>
          <button
            role="tab"
            aria-selected={activeSubTab === 'logg'}
            className={`live-tab-subtab ${activeSubTab === 'logg' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('logg')}
          >
            Logg{auditLog.length > 0 ? ` (${auditLog.length})` : ''}
          </button>
          <button
            role="tab"
            aria-selected={activeSubTab === 'chatt'}
            className={`live-tab-subtab ${activeSubTab === 'chatt' ? 'active' : ''}`}
            onClick={() => {
              setActiveSubTab('chatt')
              setUnreadChat(0)
            }}
          >
            Chatt{unreadChat > 0 ? ` (${unreadChat})` : ''}
          </button>
        </div>

        {activeSubTab === 'delning' && (
          <div className="live-tab-panels">
            <div className="live-tab-share">
              <h4>Dela med åskådare</h4>
              <div className="live-tab-qr">
                <QRCodeSVG value={viewUrl} size={180} />
                <p className="live-tab-tournament-label">{tournamentName}</p>
                <div className="live-tab-qr-actions">
                  <button
                    className="btn btn-small"
                    onClick={() => setQrFullscreen(viewUrl)}
                    title="Visa i helskärm"
                  >
                    ⛶
                  </button>
                  <button
                    className="btn btn-small"
                    data-testid="print-main-qr"
                    onClick={printMainQr}
                    title="Ladda ner PDF"
                  >
                    Skriv ut
                  </button>
                </div>
              </div>
              <div className="live-tab-links">
                <div className="live-tab-link-row">
                  <span className="live-tab-link-label">Rumskod:</span>
                  <code>{roomCode}</code>
                  <button
                    className="btn btn-small btn-icon"
                    onClick={() => copyToClipboard(roomCode, 'roomCode')}
                    title="Kopiera"
                  >
                    {copied === 'roomCode' ? '✓' : '📋'}
                  </button>
                </div>
                <div className="live-tab-link-row">
                  <span className="live-tab-link-label">Länk:</span>
                  <code className="live-tab-url">{viewUrl}</code>
                  <button
                    className="btn btn-small btn-icon"
                    onClick={() => copyToClipboard(viewUrl, 'viewUrl')}
                    title="Kopiera"
                  >
                    {copied === 'viewUrl' ? '✓' : '📋'}
                  </button>
                </div>
                <div className="live-tab-link-row">
                  <span className="live-tab-link-label">Projektor:</span>
                  <code className="live-tab-url">{getKioskUrl(roomCode)}</code>
                  <button
                    className="btn btn-small btn-icon"
                    onClick={() => copyToClipboard(getKioskUrl(roomCode), 'kioskUrl')}
                    title="Kopiera"
                  >
                    {copied === 'kioskUrl' ? '✓' : '📋'}
                  </button>
                </div>
              </div>
            </div>

            <div className="live-tab-peers">
              {clubs.length > 0 && !clubFilterEnabled && (
                <div className="live-tab-club-codes" data-testid="club-codes">
                  <h4>Klubbkoder</h4>
                  <p>
                    Aktivera klubbfilter för att ge varje klubb en egen kod. Åskådare som anger
                    koden ser bara sin egen klubbs placeringar.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setClubFilterAndBroadcast(true)}
                  >
                    Aktivera klubbfilter
                  </button>
                </div>
              )}
              {clubs.length > 0 && clubFilterEnabled && (
                <div className="live-tab-club-codes" data-testid="club-codes">
                  <h4>Klubbkoder</h4>
                  <p>
                    Varje klubb har en egen kod som klubbledaren anger vid anslutning för att se
                    sina spelares placeringar.
                  </p>
                  <div className="live-tab-club-codes-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setClubFilterAndBroadcast(false)}
                    >
                      Inaktivera klubbfilter
                    </button>
                    <button type="button" className="btn btn-small" onClick={printClubCodes}>
                      Skriv ut klubbkoder
                    </button>
                  </div>
                  <div className="live-tab-club-list">
                    {clubs.map((club) => (
                      <div key={club} className="live-tab-club-row">
                        <span className="live-tab-club-name">{club}</span>
                        <span className="live-tab-club-count">
                          ({clubPlayerCounts.counts.get(club) ?? 0} st)
                        </span>
                        <code className="live-tab-club-code" data-testid={`club-code-${club}`}>
                          {clubCodeMap[club]}
                        </code>
                        <button
                          type="button"
                          className="btn btn-icon btn-small"
                          data-testid={`share-club-btn-${club}`}
                          title="Dela denna klubb"
                          onClick={() => setShareClubDialog(club)}
                        >
                          ⛶
                        </button>
                      </div>
                    ))}
                    {hasClublessPlayers && (
                      <div className="live-tab-club-row">
                        <span className="live-tab-club-name">Klubblösa</span>
                        <span className="live-tab-club-count">
                          ({clubPlayerCounts.clubless} st)
                        </span>
                        <code
                          className="live-tab-club-code"
                          data-testid={`club-code-${CLUBLESS_KEY}`}
                        >
                          {clubCodeMap[CLUBLESS_KEY]}
                        </code>
                        <button
                          type="button"
                          className="btn btn-icon btn-small"
                          data-testid={`share-club-btn-${CLUBLESS_KEY}`}
                          title="Dela klubblösa"
                          onClick={() => setShareClubDialog(CLUBLESS_KEY)}
                        >
                          ⛶
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <h4>
                Anslutna ({peers.length})
                {peers.length > 0 && (
                  <span className="live-tab-peer-summary">
                    {' '}
                    — {viewerCount} åskådare, {refereeCount} domare
                  </span>
                )}
              </h4>
              {peers.length === 0 ? (
                <p className="live-tab-empty">Väntar på anslutningar...</p>
              ) : (
                <table className="live-tab-peer-table">
                  <thead>
                    <tr>
                      <th>Peer</th>
                      <th>Roll</th>
                      <th>Ansluten</th>
                      <th>Åtgärd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map((peer) => (
                      <tr key={peer.id}>
                        <td>{peer.label || peer.id.slice(0, 8) + '...'}</td>
                        <td>
                          <span
                            className={`live-tab-role live-tab-role--${peer.role === 'referee' ? 'referee' : 'viewer'}`}
                          >
                            {peer.role === 'referee' ? 'Domare' : 'Åskådare'}
                          </span>
                        </td>
                        <td>{formatDuration(peerTimestamp - peer.connectedAt)}</td>
                        <td className="live-tab-peer-actions">
                          <button
                            className="btn btn-small"
                            onClick={() => {
                              setMutedPeers((prev) => {
                                const next = new Set(prev)
                                if (next.has(peer.id)) {
                                  next.delete(peer.id)
                                } else {
                                  next.add(peer.id)
                                }
                                return next
                              })
                            }}
                          >
                            {mutedPeers.has(peer.id) ? 'Avtysta' : 'Tysta'}
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => serviceRef.current?.kickPeer(peer.id)}
                          >
                            Avsluta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="live-tab-announce">
                <input
                  type="text"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && announcementText.trim()) {
                      serviceRef.current?.broadcastAnnouncement({
                        text: announcementText.trim(),
                        timestamp: Date.now(),
                      })
                      setAnnouncementText('')
                    }
                  }}
                  placeholder="Skicka meddelande till alla..."
                />
                <button
                  className="btn btn-primary"
                  disabled={!announcementText.trim()}
                  onClick={() => {
                    if (announcementText.trim()) {
                      serviceRef.current?.broadcastAnnouncement({
                        text: announcementText.trim(),
                        timestamp: Date.now(),
                      })
                      setAnnouncementText('')
                    }
                  }}
                >
                  Skicka
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'vydelning' && (
          <div className="live-tab-panels">
            <div className="live-tab-share">
              <h4>Dela vy</h4>
              <p>
                Dela denna länk med domare eller andra som ska kunna se och rapportera resultat i
                turneringen.
              </p>
              <div className="live-tab-qr">
                <QRCodeSVG value={shareUrl} size={180} />
                <p className="live-tab-tournament-label">{tournamentName}</p>
                <button
                  className="btn btn-small live-tab-qr-expand"
                  onClick={() => setQrFullscreen(shareUrl)}
                  title="Visa i helskärm"
                >
                  ⛶
                </button>
              </div>
              <div className="live-tab-links">
                <div className="live-tab-link-row">
                  <span className="live-tab-link-label">Rumskod:</span>
                  <code>{roomCode}</code>
                  <button
                    className="btn btn-small btn-icon"
                    onClick={() => copyToClipboard(roomCode, 'shareRoomCode')}
                    title="Kopiera"
                  >
                    {copied === 'shareRoomCode' ? '✓' : '📋'}
                  </button>
                </div>
                <div className="live-tab-link-row">
                  <span className="live-tab-link-label">Delningslänk:</span>
                  <code className="live-tab-url" data-testid="vydelning-url">
                    {shareUrl}
                  </code>
                  <button
                    className="btn btn-small btn-icon"
                    onClick={() => copyToClipboard(shareUrl, 'shareUrl')}
                    title="Kopiera"
                  >
                    {copied === 'shareUrl' ? '✓' : '📋'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'logg' && (
          <div>
            {auditLog.length === 0 ? (
              <p className="live-tab-empty">Inga resultatrapporter ännu.</p>
            ) : (
              <table className="live-tab-peer-table">
                <thead>
                  <tr>
                    <th>Tid</th>
                    <th>Domare</th>
                    <th>Bord</th>
                    <th>Resultat</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i}>
                      <td>{new Date(entry.timestamp).toLocaleTimeString('sv-SE')}</td>
                      <td>{entry.refereeName}</td>
                      <td>{entry.boardNr}</td>
                      <td>{resolveResultLabel(entry.resultType, entry.resultDisplay)}</td>
                      <td>
                        <span
                          className={`live-tab-role ${entry.accepted ? 'live-tab-role--viewer' : 'live-tab-role--referee'}`}
                        >
                          {entry.accepted ? 'OK' : (entry.reason ?? 'Avvisad')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeSubTab === 'chatt' && (
          <div className="live-chat-panel">
            <div className="live-chat-header">
              <button
                className={`btn btn-small ${chatEnabled ? '' : 'btn-danger'}`}
                onClick={toggleChat}
              >
                {chatEnabled ? 'Stäng av chatt' : 'Aktivera chatt'}
              </button>
              {!chatEnabled && (
                <span className="live-chat-disabled-label">Chatten är avstängd för deltagare</span>
              )}
            </div>
            <div className="live-chat-messages" ref={chatScrollRef}>
              {chatMessages.length === 0 ? (
                <p className="live-tab-empty">Inga meddelanden ännu.</p>
              ) : (
                chatMessages.map((msg) => (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    onDelete={() => {
                      setChatMessages((prev) => prev.filter((m) => m.id !== msg.id))
                      serviceRef.current?.broadcastChatDelete({ id: msg.id })
                    }}
                  />
                ))
              )}
              <div ref={chatBottomRef} />
            </div>
            {chatEnabled && (
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
            )}
          </div>
        )}
      </div>

      {qrFullscreen && (
        <div className="qr-fullscreen-overlay" onClick={() => setQrFullscreen(null)}>
          <div className="qr-fullscreen-content" onClick={(e) => e.stopPropagation()}>
            <QRCodeSVG
              value={qrFullscreen}
              size={Math.min(window.innerWidth, window.innerHeight) * 0.7}
            />
            <p className="qr-fullscreen-label">{tournamentName}</p>
            <button className="btn qr-fullscreen-close" onClick={() => setQrFullscreen(null)}>
              Stäng
            </button>
          </div>
        </div>
      )}

      <Dialog
        title={
          shareClubDialog === CLUBLESS_KEY ? 'Dela klubblösa' : `Dela ${shareClubDialog ?? ''}`
        }
        open={shareClubDialog !== null}
        onClose={() => setShareClubDialog(null)}
        width={360}
      >
        {shareClubDialog !== null &&
          roomCode &&
          viewToken &&
          clubCodeSecret &&
          (() => {
            const code = clubCodeMap[shareClubDialog] ?? ''
            const url = getViewUrlWithCode(roomCode, viewToken, code)
            return (
              <div className="share-club-dialog-body" data-testid="share-club-dialog">
                <div className="share-club-dialog-qr">
                  <QRCodeSVG value={url} size={220} />
                </div>
                <p className="share-club-dialog-hint" data-testid="share-club-dialog-hint">
                  Om du blir ombedd att ange kod:
                </p>
                <code className="share-club-dialog-code" data-testid="share-club-dialog-code">
                  {code}
                </code>
                <button
                  type="button"
                  className="btn share-club-dialog-copy"
                  data-testid="share-club-dialog-copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url)
                  }}
                >
                  Kopiera länk
                </button>
              </div>
            )
          })()}
      </Dialog>
    </div>
  )
}
