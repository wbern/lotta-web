import {
  getRelaySockets as getMqttRelaySockets,
  joinRoom as mqttJoinRoom,
} from '@trystero-p2p/mqtt'
import type { Room } from 'trystero'
import {
  defaultRelayUrls,
  getRelaySockets as getNostrRelaySockets,
  joinRoom as nostrJoinRoom,
  selfId,
} from 'trystero'
import type {
  AnnouncementMessage,
  ChatDeleteMessage,
  ChatMessage,
  P2PConnectionState,
  P2PPeer,
  P2PRole,
  PageUpdateMessage,
  PeerCountMessage,
  PeerKickMessage,
  ResultAckMessage,
  ResultSubmitMessage,
  RoundManifestMessage,
  SharedTournamentsMessage,
  ViewerSelectTournamentMessage,
} from '../types/p2p.ts'

const APP_ID = 'lotta-chess-pairer'
const P2P_STRATEGY = import.meta.env.VITE_P2P_STRATEGY ?? 'mqtt'

function pendingKey(tournamentId: number | undefined, roundNr: number, boardNr: number): string {
  return `${tournamentId ?? '?'}-${roundNr}-${boardNr}`
}

// Replicate trystero's internal shuffle so we can derive the same 5 relays
// that old cached clients (without explicit relayUrls) would connect to.
function strToNum(str: string, limit = Number.MAX_SAFE_INTEGER): number {
  return str.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % limit
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let i = a.length
  while (i) {
    const x = Math.sin(seed++) * 1e4
    const j = Math.floor((x - Math.floor(x)) * i--)
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

// Derive the 5 relays trystero selects by default for our appId, then add
// extra reliable relays. This keeps backward compat with older cached versions.
const TRYSTERO_DERIVED = shuffled(defaultRelayUrls, strToNum(APP_ID)).slice(0, 5)
const EXTRA_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://purplerelay.com']
const NOSTR_RELAY_URLS = [...new Set([...TRYSTERO_DERIVED, ...EXTRA_RELAYS])]

// TURN fallback for networks where direct connections fail (AP isolation,
// symmetric NAT, mobile carriers). Geo-nearest servers are fetched lazily from
// metered.ca on first P2PService construction when VITE_METERED_API_KEY is
// set; otherwise we fall back to openrelay's public shared credentials.
// Passed via turnConfig so trystero's built-in STUN servers (Google +
// Cloudflare) are preserved.
const FALLBACK_TURN_SERVERS = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

type TurnServer = { urls: string | string[]; username?: string; credential?: string }
let cachedTurnServers: TurnServer[] | null = null

let turnFetchStatus: 'pending' | 'fetched' | 'fallback' | 'error' = 'pending'
let turnFetchPromise: Promise<void> | null = null

/** @internal — test-only reset for module-level P2P cache */
export function _resetTurnCache(): void {
  cachedTurnServers = null
  turnFetchStatus = 'pending'
  turnFetchPromise = null
  iceProbeResult = 'pending'
  iceProbePromise = null
}

const TURN_CACHE_KEY = 'lotta-turn-servers'
const TURN_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

export function prefetchTurnServers(): Promise<void> {
  if (turnFetchPromise) return turnFetchPromise
  const apiKey = import.meta.env.VITE_METERED_API_KEY
  if (!apiKey) {
    cachedTurnServers = FALLBACK_TURN_SERVERS
    turnFetchStatus = 'fallback'
    turnFetchPromise = Promise.resolve()
    return turnFetchPromise
  }

  // Use cached credentials from sessionStorage if still fresh
  try {
    const raw = sessionStorage.getItem(TURN_CACHE_KEY)
    if (raw) {
      const entry = JSON.parse(raw)
      if (
        entry.timestamp &&
        Date.now() - entry.timestamp < TURN_CACHE_TTL_MS &&
        Array.isArray(entry.servers) &&
        entry.servers.length > 0
      ) {
        cachedTurnServers = entry.servers
        turnFetchStatus = 'fetched'
        turnFetchPromise = Promise.resolve()
        return turnFetchPromise
      }
    }
  } catch {
    // sessionStorage unavailable (e.g. private browsing on some devices)
  }

  turnFetchPromise = fetch(
    `https://lotta-web.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
  )
    .then((res) => {
      if (!res.ok) {
        turnFetchStatus = 'fallback'
        cachedTurnServers = FALLBACK_TURN_SERVERS
        return
      }
      return res.json()
    })
    .then((servers) => {
      if (servers) {
        cachedTurnServers = servers
        turnFetchStatus = 'fetched'
        try {
          sessionStorage.setItem(TURN_CACHE_KEY, JSON.stringify({ servers, timestamp: Date.now() }))
        } catch {
          // sessionStorage full or unavailable
        }
      }
    })
    .catch(() => {
      turnFetchStatus = 'error'
    })
  return turnFetchPromise
}

function getTurnServers(): TurnServer[] {
  return cachedTurnServers ?? FALLBACK_TURN_SERVERS
}

function getTurnStatus(): { status: string; serverCount: number } {
  return {
    status: turnFetchStatus,
    serverCount: getTurnServers().length,
  }
}

// Probe WebRTC ICE candidate gathering to detect Brave's restrictive policies.
// When fingerprinting protection is on, Brave forces "Disable Non-Proxied UDP"
// which suppresses host and srflx candidates, leaving only TURN relay over TCP.
let iceProbeResult: 'pending' | 'ok' | 'restricted' = 'pending'
let iceProbePromise: Promise<'ok' | 'restricted'> | null = null

function probeIceCandidates(): Promise<'ok' | 'restricted'> {
  if (iceProbePromise) return iceProbePromise

  iceProbePromise = new Promise<'ok' | 'restricted'>((resolve) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      let foundUsable = false
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        iceProbeResult = foundUsable ? 'ok' : 'restricted'
        pc.close()
        resolve(iceProbeResult)
      }

      const timeout = setTimeout(finish, 3000)

      pc.onicecandidate = (e) => {
        if (e.candidate && (e.candidate.type === 'host' || e.candidate.type === 'srflx')) {
          foundUsable = true
          clearTimeout(timeout)
          finish()
        }
      }

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          finish()
        }
      }

      pc.createDataChannel('probe')
      void pc.createOffer().then((o) => pc.setLocalDescription(o))
    } catch {
      iceProbeResult = 'restricted'
      resolve('restricted')
    }
  })

  return iceProbePromise
}

export function getIceProbeResult(): 'pending' | 'ok' | 'restricted' {
  return iceProbeResult
}

const HEARTBEAT_INTERVAL_MS = 10_000
const HEARTBEAT_TIMEOUT_MS = 25_000
const HEARTBEAT_INITIAL_TIMEOUT_MS = 60_000
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BACKOFF_BASE_MS = 2000
const RECONNECT_BACKOFF_CAP_MS = 30_000
const RELAY_CHECK_INTERVAL_MS = 10_000
const RELAY_DEAD_THRESHOLD = 2
// Grace window for a host peer to rebind after refresh. Kept below the
// heartbeat timeout so we only defer, never truly mask, a real host outage.
const HOST_REFRESH_GRACE_MS = 20_000

type ActionSender<T> = (data: T, targetPeers?: string | string[] | null) => void

type HeartbeatMessage = {
  ts: number
}

type RoleAnnounceMessage = {
  role: P2PRole
  token?: string
  label?: string
  hostId?: string
}

type RpcRequest = {
  id: number
  method: string
  args: unknown[]
}

type RpcResponse = {
  id: number
  result?: unknown
  error?: string
}

export interface RelaySocketInfo {
  url: string
  readyState: number // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
}

export interface DiagnosticEntry {
  timestamp: number
  message: string
}

export class P2PService {
  readonly role: P2PRole
  readonly strategy = P2P_STRATEGY
  connectionState: P2PConnectionState
  roomId: string | null = null
  onPageUpdate: ((message: PageUpdateMessage) => void) | null = null
  onResultSubmit: ((message: ResultSubmitMessage, peerId: string) => void) | null = null
  onResultAck: ((message: ResultAckMessage) => void) | null = null
  onConnectionStateChange: ((state: P2PConnectionState) => void) | null = null
  onPeersChange: (() => void) | null = null
  onNewPeerJoin: ((peerId: string) => void) | null = null
  onPeerReconnected: ((peerId: string) => void) | null = null
  onPeerLeave: ((peerId: string) => void) | null = null
  onPeerCount: ((message: PeerCountMessage) => void) | null = null
  onAnnouncement: ((message: AnnouncementMessage) => void) | null = null
  onKicked: ((message: PeerKickMessage) => void) | null = null
  onChatMessage: ((message: ChatMessage, peerId: string) => void) | null = null
  onChatDelete: ((message: ChatDeleteMessage, peerId: string) => void) | null = null
  onRpcRequest: ((request: RpcRequest, peerId: string) => void) | null = null
  onRpcResponse: ((response: RpcResponse) => void) | null = null
  onDataChanged: (() => void) | null = null
  onPeerToken: ((peerId: string, token: string) => void) | null = null
  onHostRefreshing: ((refreshing: boolean) => void) | null = null
  onDiagnosticEvent: ((entry: DiagnosticEntry) => void) | null = null
  onSharedTournaments: ((message: SharedTournamentsMessage) => void) | null = null
  onViewerSelectTournament:
    | ((message: ViewerSelectTournamentMessage, peerId: string) => void)
    | null = null
  onRoundManifest: ((message: RoundManifestMessage) => void) | null = null
  onPendingChange: ((pending: ResultSubmitMessage[]) => void) | null = null
  private diagnosticLog: DiagnosticEntry[] = []
  private peers: Map<string, P2PPeer> = new Map()
  private room: Room | null = null
  private sendPageUpdate: ActionSender<PageUpdateMessage> | null = null
  private sendResultSubmit: ActionSender<ResultSubmitMessage> | null = null
  private _sendResultAck: ActionSender<ResultAckMessage> | null = null
  private _sendPeerCount: ActionSender<PeerCountMessage> | null = null
  private _sendAnnouncement: ActionSender<AnnouncementMessage> | null = null
  private _sendPeerKick: ActionSender<PeerKickMessage> | null = null
  private _sendChatMessage: ActionSender<ChatMessage> | null = null
  private _sendChatDelete: ActionSender<ChatDeleteMessage> | null = null
  private _sendRpcRequest: ActionSender<RpcRequest> | null = null
  private _sendRpcResponse: ActionSender<RpcResponse> | null = null
  private _sendDataChanged: ActionSender<{ ts: number }> | null = null
  private _sendHostRefreshing: ActionSender<{ ts: number }> | null = null
  private _sendHeartbeat: ActionSender<HeartbeatMessage> | null = null
  private _sendSharedTournaments: ActionSender<SharedTournamentsMessage> | null = null
  private _sendViewerSelectTournament: ActionSender<ViewerSelectTournamentMessage> | null = null
  private _sendRoundManifest: ActionSender<RoundManifestMessage> | null = null
  private _reconnectAttempts = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private relayCheckInterval: ReturnType<typeof setInterval> | null = null
  private relayDeadCount = 0
  private receivedFirstHeartbeat = false
  private manualLeave = false
  private hostRefreshGraceTimer: ReturnType<typeof setTimeout> | null = null
  private hostRefreshPeerId: string | null = null
  private hostRefreshHostId: string | null = null
  private refereeToken: string | null = null
  private pendingResultSubmissions = new Map<
    string,
    { message: ResultSubmitMessage; timer: ReturnType<typeof setTimeout>; attempts: number }
  >()
  private static RESULT_RESUBMIT_INTERVAL_MS = 3_000
  private static RESULT_MAX_ATTEMPTS = 5
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null
  readonly label: string | undefined
  readonly hostId: string | undefined

  constructor(role: P2PRole, refereeToken?: string, label?: string, hostId?: string) {
    this.role = role
    this.refereeToken = refereeToken ?? null
    this.label = label
    this.hostId = hostId
    this.connectionState = 'disconnected'
    // Kick off TURN fetch and ICE probe early — connectToRoom waits briefly for results
    void prefetchTurnServers()
    void probeIceCandidates()
  }

  get reconnectAttempts(): number {
    return this._reconnectAttempts
  }

  startHosting(roomId: string): void {
    this.installUnloadGuard()
    void this.connectToRoom(roomId)
  }

  joinRoom(roomId: string): void {
    this.manualLeave = false
    this.installUnloadGuard()
    void this.connectToRoom(roomId)
  }

  private installUnloadGuard(): void {
    if (this.beforeUnloadHandler) return
    if (typeof window === 'undefined') return
    this.beforeUnloadHandler = (e) => {
      if (this.pendingResultSubmissions.size > 0) e.preventDefault()
    }
    window.addEventListener('beforeunload', this.beforeUnloadHandler)
  }

  private removeUnloadGuard(): void {
    if (!this.beforeUnloadHandler) return
    if (typeof window === 'undefined') return
    window.removeEventListener('beforeunload', this.beforeUnloadHandler)
    this.beforeUnloadHandler = null
  }

  leave(): void {
    this.manualLeave = true
    this.removeUnloadGuard()
    if (this.room) {
      this.room.leave()
      this.room = null
    }
    this.peers.clear()
    this.sendPageUpdate = null
    this.sendResultSubmit = null
    this._sendResultAck = null
    this._sendPeerCount = null
    this._sendAnnouncement = null
    this._sendPeerKick = null
    this._sendChatMessage = null
    this._sendChatDelete = null
    this._sendRpcRequest = null
    this._sendRpcResponse = null
    this._sendDataChanged = null
    this._sendHostRefreshing = null
    this._sendHeartbeat = null
    this._sendSharedTournaments = null
    this._sendViewerSelectTournament = null
    this._sendRoundManifest = null
    this.roomId = null
    this.clearHeartbeatTimers()
    this.clearReconnectTimer()
    this.clearRelayHealthCheck()
    this.clearHostRefreshGrace()
    this.clearPendingSubmissions()
    this._reconnectAttempts = 0
    this.receivedFirstHeartbeat = false
    this.setConnectionState('disconnected')
  }

  private clearPendingSubmissions(): void {
    for (const pending of this.pendingResultSubmissions.values()) {
      clearTimeout(pending.timer)
    }
    this.pendingResultSubmissions.clear()
    this.notifyPendingChange()
  }

  private clearHostRefreshGrace(): void {
    if (this.hostRefreshGraceTimer) {
      clearTimeout(this.hostRefreshGraceTimer)
      this.hostRefreshGraceTimer = null
    }
    this.hostRefreshPeerId = null
    this.hostRefreshHostId = null
  }

  broadcastPageUpdate(message: PageUpdateMessage): void {
    this.sendPageUpdate?.(message, null)
  }

  sendPageUpdateTo(message: PageUpdateMessage, peerId: string): void {
    this.sendPageUpdate?.(message, peerId)
  }

  submitResult(message: ResultSubmitMessage): void {
    this.sendResultSubmit?.(message, null)
    const key = pendingKey(message.tournamentId, message.roundNr, message.boardNr)
    const existing = this.pendingResultSubmissions.get(key)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(
      () => this.resubmitPendingResult(key),
      P2PService.RESULT_RESUBMIT_INTERVAL_MS,
    )
    this.pendingResultSubmissions.set(key, { message, timer, attempts: 1 })
    this.notifyPendingChange()
  }

  getPendingSubmissions(): ResultSubmitMessage[] {
    return Array.from(this.pendingResultSubmissions.values()).map((p) => p.message)
  }

  private notifyPendingChange(): void {
    this.onPendingChange?.(this.getPendingSubmissions())
  }

  private resubmitPendingResult(key: string): void {
    const pending = this.pendingResultSubmissions.get(key)
    if (!pending) return
    if (pending.attempts >= P2PService.RESULT_MAX_ATTEMPTS) {
      this.pendingResultSubmissions.delete(key)
      this.notifyPendingChange()
      this.onResultAck?.({
        tournamentId: pending.message.tournamentId,
        boardNr: pending.message.boardNr,
        roundNr: pending.message.roundNr,
        accepted: false,
        reason: 'No response from host',
      })
      return
    }
    this.sendResultSubmit?.(pending.message, null)
    pending.attempts += 1
    pending.timer = setTimeout(
      () => this.resubmitPendingResult(key),
      P2PService.RESULT_RESUBMIT_INTERVAL_MS,
    )
  }

  sendResultAck(message: ResultAckMessage, peerId: string): void {
    this._sendResultAck?.(message, peerId)
  }

  broadcastPeerCount(message: PeerCountMessage): void {
    this._sendPeerCount?.(message, null)
  }

  broadcastAnnouncement(message: AnnouncementMessage): void {
    this._sendAnnouncement?.(message, null)
  }

  broadcastChatMessage(message: ChatMessage): void {
    this._sendChatMessage?.(message, null)
  }

  sendChatMessageToPeer(message: ChatMessage, peerId: string): void {
    this._sendChatMessage?.(message, peerId)
  }

  broadcastChatDelete(message: ChatDeleteMessage): void {
    this._sendChatDelete?.(message, null)
  }

  sendRpcRequest(request: RpcRequest, peerId?: string): void {
    this._sendRpcRequest?.(request, peerId ?? null)
  }

  sendRpcResponse(response: RpcResponse, peerId: string): void {
    this._sendRpcResponse?.(response, peerId)
  }

  broadcastDataChanged(): void {
    this._sendDataChanged?.({ ts: Date.now() }, null)
  }

  broadcastHostRefreshing(): void {
    this._sendHostRefreshing?.({ ts: Date.now() }, null)
  }

  broadcastSharedTournaments(message: SharedTournamentsMessage): void {
    this._sendSharedTournaments?.(message, null)
  }

  sendSharedTournamentsTo(message: SharedTournamentsMessage, peerId: string): void {
    this._sendSharedTournaments?.(message, peerId)
  }

  sendViewerSelectTournament(message: ViewerSelectTournamentMessage): void {
    const hostId = this.getObservedHostId()
    if (!hostId) return
    this._sendViewerSelectTournament?.(message, hostId)
  }

  broadcastRoundManifest(message: RoundManifestMessage): void {
    this._sendRoundManifest?.(message, null)
  }

  sendRoundManifestTo(message: RoundManifestMessage, peerId: string): void {
    this._sendRoundManifest?.(message, peerId)
  }

  kickPeer(peerId: string, reason?: string): void {
    this._sendPeerKick?.({ reason }, peerId)
    this.removePeer(peerId)
  }

  getPeers(): P2PPeer[] {
    return Array.from(this.peers.values())
  }

  addPeer(id: string, role: P2PRole, label?: string): void {
    this.peers.set(id, {
      id,
      role,
      connectedAt: Date.now(),
      label,
      verified: false,
    })
    this.onPeersChange?.()
  }

  removePeer(id: string): void {
    this.peers.delete(id)
    this.onPeerLeave?.(id)
    this.onPeersChange?.()
  }

  isPeerVerifiedReferee(peerId: string): boolean {
    const peer = this.peers.get(peerId)
    return peer?.role === 'referee' && peer.verified === true
  }

  getSelfId(): string {
    return selfId
  }

  getObservedHostId(): string | undefined {
    if (this.role === 'organizer') return this.hostId
    for (const peer of this.peers.values()) {
      if (peer.role === 'organizer' && peer.hostId) return peer.hostId
    }
    return undefined
  }

  getRelayStatus(): RelaySocketInfo[] {
    try {
      const getRelaySockets = P2P_STRATEGY === 'mqtt' ? getMqttRelaySockets : getNostrRelaySockets
      const sockets = getRelaySockets()
      return Object.entries(sockets).map(([url, socket]) => ({
        url,
        readyState: (socket as WebSocket).readyState,
      }))
    } catch {
      return []
    }
  }

  getDiagnosticLog(): DiagnosticEntry[] {
    return this.diagnosticLog
  }

  getRtcPeerStates(): { peerId: string; state: string }[] {
    try {
      if (!this.room) return []
      const rtcPeers = this.room.getPeers()
      return Object.entries(rtcPeers).map(([id, pc]) => ({
        peerId: id.slice(0, 8),
        state: (pc as RTCPeerConnection).connectionState,
      }))
    } catch {
      return []
    }
  }

  private logDiagnostic(message: string): void {
    const entry: DiagnosticEntry = { timestamp: Date.now(), message }
    this.diagnosticLog.push(entry)
    if (this.diagnosticLog.length > 100) {
      this.diagnosticLog.shift()
    }
    this.onDiagnosticEvent?.(entry)
  }

  private setConnectionState(state: P2PConnectionState): void {
    this.logDiagnostic(`State: ${this.connectionState} → ${state}`)
    this.connectionState = state
    this.onConnectionStateChange?.(state)
  }

  private clearHeartbeatTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private startHeartbeatSending(sendFn: ActionSender<HeartbeatMessage>): void {
    this.heartbeatInterval = setInterval(() => {
      sendFn({ ts: Date.now() }, null)
    }, HEARTBEAT_INTERVAL_MS)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
    }
    // Use longer timeout for initial connection (ICE negotiation can be slow)
    const timeout = this.receivedFirstHeartbeat
      ? HEARTBEAT_TIMEOUT_MS
      : HEARTBEAT_INITIAL_TIMEOUT_MS
    this.heartbeatTimeout = setTimeout(() => {
      // Host-refresh grace defers host-offline so a refreshing host rebinds silently.
      if (this.hostRefreshGraceTimer !== null) return
      this.setConnectionState('host-offline')
      this.scheduleReconnect()
    }, timeout)
  }

  private clearRelayHealthCheck(): void {
    if (this.relayCheckInterval) {
      clearInterval(this.relayCheckInterval)
      this.relayCheckInterval = null
    }
    this.relayDeadCount = 0
  }

  private startRelayHealthCheck(): void {
    this.relayCheckInterval = setInterval(() => {
      this.checkRelayHealth()
    }, RELAY_CHECK_INTERVAL_MS)
  }

  private checkRelayHealth(): void {
    const relays = this.getRelayStatus()
    // No relay sockets means the strategy doesn't use them (e.g. MQTT) — skip
    if (relays.length === 0) return
    const anyOpen = relays.some((r) => r.readyState === 1)

    if (!anyOpen) {
      this.relayDeadCount++
      this.logDiagnostic(
        `Relay health: 0/${relays.length} open (dead count: ${this.relayDeadCount}/${RELAY_DEAD_THRESHOLD})`,
      )
      if (this.relayDeadCount >= RELAY_DEAD_THRESHOLD) {
        this.logDiagnostic('All relays dead — scheduling reconnect')
        this.clearRelayHealthCheck()
        this.scheduleReconnect()
      }
    } else {
      this.relayDeadCount = 0
    }
  }

  private scheduleReconnect(): void {
    if (this.manualLeave) return
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setConnectionState('disconnected')
      return
    }

    const delay = Math.min(
      RECONNECT_BACKOFF_BASE_MS * Math.pow(2, this._reconnectAttempts),
      RECONNECT_BACKOFF_CAP_MS,
    )

    this.reconnectTimer = setTimeout(() => {
      this._reconnectAttempts++
      this.attemptReconnect()
    }, delay)
  }

  private attemptReconnect(): void {
    const roomId = this.roomId
    if (!roomId) return

    // First attempt: try ICE restart on existing peer connections (preserves DTLS session)
    if (this._reconnectAttempts === 1 && this.room) {
      const peers = this.room.getPeers()
      const peerIds = Object.keys(peers)
      if (peerIds.length > 0) {
        this.logDiagnostic(`ICE restart on ${peerIds.length} peer(s)`)
        for (const pc of Object.values(peers)) {
          pc.restartIce()
        }
        this.setConnectionState('reconnecting')
        this.resetHeartbeatTimeout()
        return
      }
    }

    // Full teardown: leave old room and rebuild connection from scratch
    if (this.room) {
      this.room.leave()
      this.room = null
    }
    this.clearHeartbeatTimers()
    this.clearRelayHealthCheck()
    this.clearHostRefreshGrace()
    this.sendPageUpdate = null
    this.sendResultSubmit = null
    this._sendResultAck = null
    this._sendPeerCount = null
    this._sendAnnouncement = null
    this._sendPeerKick = null
    this._sendChatMessage = null
    this._sendChatDelete = null
    this._sendRpcRequest = null
    this._sendRpcResponse = null
    this._sendDataChanged = null
    this._sendHostRefreshing = null
    this._sendHeartbeat = null
    this._sendSharedTournaments = null
    this._sendViewerSelectTournament = null
    this._sendRoundManifest = null
    this.peers.clear()
    this.onPeersChange?.()

    this.setConnectionState('reconnecting')
    void this.connectToRoom(roomId).catch((err) => {
      this.logDiagnostic(`Reconnect error: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  private async connectToRoom(roomId: string): Promise<void> {
    const normalizedId = roomId.toLowerCase()
    this.roomId = normalizedId
    if (this.connectionState !== 'reconnecting') {
      this.setConnectionState(this.role === 'organizer' ? 'connected' : 'connecting')
    }
    this.logDiagnostic(
      `Joining room "${normalizedId}" as ${this.role} [${P2P_STRATEGY}] (selfId: ${selfId}${
        this.hostId ? `, hostId: ${this.hostId}` : ''
      })`,
    )
    // Wait for both TURN servers and ICE probe, but don't block longer than 500ms.
    // Both start in the constructor (and route-level prefetch for TURN), so they've
    // usually finished by now. The timeout is a safety net for slow networks.
    await Promise.race([
      Promise.all([prefetchTurnServers(), probeIceCandidates()]),
      new Promise<void>((r) => setTimeout(r, 500)),
    ])
    const forceRelay = iceProbeResult === 'restricted'
    const turnServers = getTurnServers()
    const turnStatus = getTurnStatus()
    this.logDiagnostic(
      `TURN: ${turnStatus.status} (${turnStatus.serverCount} servers)` +
        (forceRelay ? ' [relay-only: WebRTC restricted]' : ''),
    )
    const joinRoom = P2P_STRATEGY === 'mqtt' ? mqttJoinRoom : nostrJoinRoom
    const rtcConfig = forceRelay ? { iceTransportPolicy: 'relay' as const } : undefined
    const config =
      P2P_STRATEGY === 'mqtt'
        ? { appId: APP_ID, turnConfig: turnServers, rtcConfig }
        : { appId: APP_ID, relayUrls: NOSTR_RELAY_URLS, turnConfig: turnServers, rtcConfig }
    this.room = joinRoom(config, normalizedId)

    // Role announcement: peers exchange roles on join
    const [sendRoleAnnounce, receiveRoleAnnounce] =
      this.room.makeAction<RoleAnnounceMessage>('role-announce')

    receiveRoleAnnounce((data: RoleAnnounceMessage, peerId: string) => {
      const peer = this.peers.get(peerId)
      if (!peer) return

      const roleChanged = peer.role !== data.role
      if (roleChanged) {
        peer.role = data.role
      }

      if (data.label) {
        peer.label = data.label
      }

      if (data.hostId && peer.hostId !== data.hostId) {
        peer.hostId = data.hostId
        if (data.role === 'organizer') {
          this.logDiagnostic(`Host ID: ${data.hostId}`)
        }
      }

      // If we're in a host-refresh grace window and this role-announce is from
      // a different peerId with the matching hostId, silently rebind: drop the
      // stale peer entry and clear the timer. The new entry (under peerId) is
      // already in place from addPeer() and now has role=organizer.
      if (
        data.role === 'organizer' &&
        data.hostId &&
        this.hostRefreshHostId === data.hostId &&
        this.hostRefreshPeerId !== null &&
        this.hostRefreshPeerId !== peerId
      ) {
        this.logDiagnostic(
          `Host rebound: ${this.hostRefreshPeerId.slice(0, 8)}... → ${peerId.slice(0, 8)}...`,
        )
        this.peers.delete(this.hostRefreshPeerId)
        if (this.hostRefreshGraceTimer) {
          clearTimeout(this.hostRefreshGraceTimer)
          this.hostRefreshGraceTimer = null
        }
        this.hostRefreshPeerId = null
        this.hostRefreshHostId = null
        this.onPeersChange?.()
        this.onHostRefreshing?.(false)
      }

      // Organizer validates referee token
      if (this.role === 'organizer' && data.role === 'referee') {
        peer.verified = this.refereeToken != null && data.token === this.refereeToken
      }

      // Notify host when a peer presents a token (for permission assignment)
      if (this.role === 'organizer' && data.token) {
        this.onPeerToken?.(peerId, data.token)
      }

      if (roleChanged || peer.verified || data.label) {
        this.onPeersChange?.()
      }
    })

    this.room.onPeerJoin((peerId: string) => {
      this.logDiagnostic(`Peer joined: ${peerId.slice(0, 8)}...`)
      this.addPeer(peerId, 'viewer')
      const pc = this.room?.getPeers()[peerId]
      if (pc) {
        let wasDisrupted = false
        pc.addEventListener('connectionstatechange', () => {
          const s = pc.connectionState
          if (s === 'disconnected' || s === 'failed') {
            wasDisrupted = true
          } else if (s === 'connected' && wasDisrupted) {
            wasDisrupted = false
            this.logDiagnostic(`Peer recovered: ${peerId.slice(0, 8)}...`)
            this.onPeerReconnected?.(peerId)
          }
        })
      }
      // Announce our role, token, label, and hostId to the new peer
      sendRoleAnnounce(
        {
          role: this.role,
          ...(this.refereeToken ? { token: this.refereeToken } : {}),
          ...(this.label ? { label: this.label } : {}),
          ...(this.hostId ? { hostId: this.hostId } : {}),
        },
        peerId,
      )
      // Send immediate heartbeat so the peer doesn't wait up to 15s
      if (this.role === 'organizer' && this._sendHeartbeat) {
        this._sendHeartbeat({ ts: Date.now() }, peerId)
      }
      this.onNewPeerJoin?.(peerId)
    })

    this.room.onPeerLeave((peerId: string) => {
      this.logDiagnostic(`Peer left: ${peerId.slice(0, 8)}...`)
      const peer = this.peers.get(peerId)
      if (
        this.role !== 'organizer' &&
        peer?.role === 'organizer' &&
        peer.hostId &&
        this.hostRefreshGraceTimer === null
      ) {
        this.hostRefreshPeerId = peerId
        this.hostRefreshHostId = peer.hostId
        this.logDiagnostic(
          `Host peer left — awaiting rebind for hostId ${peer.hostId.slice(0, 8)}...`,
        )
        this.onPeersChange?.()
        this.hostRefreshGraceTimer = setTimeout(() => {
          this.logDiagnostic('Host refresh grace expired — host-offline')
          this.hostRefreshGraceTimer = null
          const waitingPeerId = this.hostRefreshPeerId
          this.hostRefreshPeerId = null
          this.hostRefreshHostId = null
          if (waitingPeerId) this.removePeer(waitingPeerId)
          this.setConnectionState('host-offline')
          this.scheduleReconnect()
        }, HOST_REFRESH_GRACE_MS)
        return
      }
      this.removePeer(peerId)
    })

    const [sendPageUpdate, receivePageUpdate] =
      this.room.makeAction<PageUpdateMessage>('page-update')
    this.sendPageUpdate = sendPageUpdate
    receivePageUpdate((data: PageUpdateMessage) => {
      this.onPageUpdate?.(data)
    })

    const [sendResultSubmit, receiveResultSubmit] =
      this.room.makeAction<ResultSubmitMessage>('result-submit')
    this.sendResultSubmit = sendResultSubmit
    receiveResultSubmit((data: ResultSubmitMessage, peerId: string) => {
      this.onResultSubmit?.(data, peerId)
    })

    const [sendResultAck, receiveResultAck] = this.room.makeAction<ResultAckMessage>('result-ack')
    this._sendResultAck = sendResultAck
    receiveResultAck((data: ResultAckMessage) => {
      const key = pendingKey(data.tournamentId, data.roundNr, data.boardNr)
      const pending = this.pendingResultSubmissions.get(key)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingResultSubmissions.delete(key)
        this.notifyPendingChange()
      }
      this.onResultAck?.(data)
    })

    // Peer count: organizer broadcasts, viewers/referees listen
    const [sendPeerCount, receivePeerCount] = this.room.makeAction<PeerCountMessage>('peer-count')
    this._sendPeerCount = sendPeerCount
    receivePeerCount((data: PeerCountMessage) => {
      this.onPeerCount?.(data)
    })

    // Announcements: organizer broadcasts, viewers/referees listen
    const [sendAnnouncement, receiveAnnouncement] =
      this.room.makeAction<AnnouncementMessage>('announcement')
    this._sendAnnouncement = sendAnnouncement
    receiveAnnouncement((data: AnnouncementMessage) => {
      this.onAnnouncement?.(data)
    })

    // Chat: bidirectional messages between all peers
    const [sendChatMessage, receiveChatMessage] = this.room.makeAction<ChatMessage>('chat-message')
    this._sendChatMessage = sendChatMessage
    receiveChatMessage((data: ChatMessage, peerId: string) => {
      this.onChatMessage?.(data, peerId)
    })

    // Chat delete: organizer broadcasts, viewers/referees remove the message
    const [sendChatDelete, receiveChatDelete] =
      this.room.makeAction<ChatDeleteMessage>('chat-delete')
    this._sendChatDelete = sendChatDelete
    receiveChatDelete((data: ChatDeleteMessage, peerId: string) => {
      this.onChatDelete?.(data, peerId)
    })

    // RPC: bidirectional request/response for shared view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sendRpcRequest, receiveRpcRequest] = this.room.makeAction<any>('rpc-request')
    this._sendRpcRequest = sendRpcRequest
    receiveRpcRequest((data: RpcRequest, peerId: string) => {
      this.onRpcRequest?.(data, peerId)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sendRpcResponse, receiveRpcResponse] = this.room.makeAction<any>('rpc-response')
    this._sendRpcResponse = sendRpcResponse
    receiveRpcResponse((data: RpcResponse) => {
      this.onRpcResponse?.(data)
    })

    // Data-changed: host broadcasts after mutations, clients listen to invalidate cache
    const [sendDataChanged, receiveDataChanged] = this.room.makeAction<{ ts: number }>(
      'data-changed',
    )
    this._sendDataChanged = sendDataChanged
    receiveDataChanged(() => {
      this.onDataChanged?.()
    })

    // Host-refreshing: organizer broadcasts on pagehide, viewers show a friendly hint
    const [sendHostRefreshing, receiveHostRefreshing] = this.room.makeAction<{ ts: number }>(
      'host-refreshing',
    )
    this._sendHostRefreshing = sendHostRefreshing
    receiveHostRefreshing((_data: { ts: number }, peerId: string) => {
      const peer = this.peers.get(peerId)
      if (peer?.role !== 'organizer') return
      this.logDiagnostic('Host sent refresh hint')
      this.onHostRefreshing?.(true)
    })

    // Shared tournaments: host broadcasts/sends-to-peer, viewer/referee listens
    const [sendSharedTournaments, receiveSharedTournaments] =
      this.room.makeAction<SharedTournamentsMessage>('shared-tournaments')
    this._sendSharedTournaments = sendSharedTournaments
    receiveSharedTournaments((data: SharedTournamentsMessage) => {
      this.onSharedTournaments?.(data)
    })

    // Viewer → host: viewer announces which shared tournament they're watching
    const [sendViewerSelectTournament, receiveViewerSelectTournament] =
      this.room.makeAction<ViewerSelectTournamentMessage>('viewer-select-tournament')
    this._sendViewerSelectTournament = sendViewerSelectTournament
    receiveViewerSelectTournament((data: ViewerSelectTournamentMessage, peerId: string) => {
      this.onViewerSelectTournament?.(data, peerId)
    })

    // Round manifest: host broadcasts authoritative round list after mutations,
    // viewers reconcile cached rounds against it (dropping rounds no longer present).
    const [sendRoundManifest, receiveRoundManifest] =
      this.room.makeAction<RoundManifestMessage>('round-manifest')
    this._sendRoundManifest = sendRoundManifest
    receiveRoundManifest((data: RoundManifestMessage) => {
      this.onRoundManifest?.(data)
    })

    // Kick: organizer sends to specific peer, that peer listens
    const [sendPeerKick, receivePeerKick] = this.room.makeAction<PeerKickMessage>('peer-kick')
    this._sendPeerKick = sendPeerKick
    receivePeerKick((data: PeerKickMessage) => {
      this.onKicked?.(data)
    })

    // Heartbeat: organizer sends, viewer/referee listens
    const [sendHeartbeat, receiveHeartbeat] = this.room.makeAction<HeartbeatMessage>('heartbeat')

    if (this.role === 'organizer') {
      this._sendHeartbeat = sendHeartbeat
      this.startHeartbeatSending(sendHeartbeat)
      this.startRelayHealthCheck()
    } else {
      receiveHeartbeat(() => {
        if (
          this.connectionState === 'connecting' ||
          this.connectionState === 'host-offline' ||
          this.connectionState === 'reconnecting'
        ) {
          this.setConnectionState('connected')
        }
        this.receivedFirstHeartbeat = true
        this._reconnectAttempts = 0
        this.clearReconnectTimer()
        this.resetHeartbeatTimeout()
        this.onHostRefreshing?.(false)
      })
      // Start timeout immediately — if no heartbeat arrives within 45s, host is offline
      this.resetHeartbeatTimeout()
    }
  }
}
