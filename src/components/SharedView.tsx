import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { setActiveDataProvider } from '../api/active-provider'
import { createP2pClientProvider } from '../api/p2p-data-provider'
import { cleanupClientSession } from '../api/p2p-session'
import { setLiveStatus } from '../hooks/useLiveStatus'
import { isRateLimited, verifyChatMessage } from '../lib/chat'
import { getCompatWarnings } from '../lib/device-compat'
import { LIVE_NAME_STORAGE_KEY } from '../lib/live-name'
import { playSound } from '../lib/notification-sounds'
import { queryClient } from '../query-client'
import { clearP2PService, setP2PService } from '../services/p2p-provider'
import { P2PService } from '../services/p2p-service'
import {
  appendChatMessage,
  appendDiagnostic,
  chatRateLimitMap,
  deleteChatMessage,
  getClientP2PState,
  incrementUnread,
  setAnnouncement,
  setHostRefreshing,
  setHostSharedTournamentId,
  setKicked,
  setPeerCount,
  setPendingClubCode,
  setRoomCode,
  setShareMode,
} from '../stores/client-p2p-store'
import type { P2PConnectionState } from '../types/p2p'
import { CompatWarnings } from './CompatWarnings'
import { LiveNameEntry } from './LiveNameEntry'

const CONNECTION_TIMEOUT_S = 90

type ConnectionStage = 'init' | 'turn' | 'room' | 'heartbeat' | 'connected'

const STAGE_LABELS: Record<ConnectionStage, string> = {
  init: 'Förbereder anslutning\u2026',
  turn: 'Kontaktar servrar\u2026',
  room: 'Söker värd\u2026',
  heartbeat: 'Värd hittad, ansluter\u2026',
  connected: 'Ansluten!',
}

const STAGE_FILL: Record<ConnectionStage, number> = {
  init: 0,
  turn: 25,
  room: 50,
  heartbeat: 75,
  connected: 100,
}

interface SharedViewProps {
  roomCode: string
  token: string
  mode?: 'full' | 'view'
  code?: string
}

export function SharedView({ roomCode, token, mode = 'full', code }: SharedViewProps) {
  const navigate = useNavigate()
  const initialized = useRef(false)

  useEffect(() => {
    if (code) setPendingClubCode(code)
  }, [code])
  const [connectionState, setConnectionState] = useState<P2PConnectionState>('disconnected')
  const [stage, setStage] = useState<ConnectionStage>('init')
  const [countdown, setCountdown] = useState(CONNECTION_TIMEOUT_S)
  const [compatWarnings] = useState(() => getCompatWarnings())
  const [blocked, setBlocked] = useState(() =>
    compatWarnings.some((w) => w.severity === 'blocking'),
  )
  // View-mode (Avläsare) doesn't chat, so no name needed. Full-mode (Domare) does.
  const [confirmedName, setConfirmedName] = useState<string | null>(() =>
    mode === 'view' ? '' : localStorage.getItem(LIVE_NAME_STORAGE_KEY),
  )
  const hasWarnings = compatWarnings.length > 0

  const updateStageFromDiagnostic = useCallback((message: string) => {
    // "Joining room" fires first → we're fetching TURN/ICE
    if (message.includes('Joining room')) {
      setStage('turn')
    }
    // "TURN:" fires after TURN+ICE complete → now joining room/signaling
    else if (message.includes('TURN:')) {
      setStage('room')
    }
    // A peer joining means signaling worked → waiting for heartbeat
    else if (message.includes('Peer joined')) {
      setStage('heartbeat')
    }
  }, [])

  useEffect(() => {
    if (initialized.current || blocked || confirmedName === null) return
    initialized.current = true

    const label = confirmedName || undefined
    const service = new P2PService('viewer', token, label)
    setP2PService(service)
    const provider = createP2pClientProvider(service)
    setActiveDataProvider(provider)

    service.onDiagnosticEvent = (entry) => {
      updateStageFromDiagnostic(entry.message)
      appendDiagnostic(entry)
    }

    let lastConnectionState: P2PConnectionState = 'disconnected'

    const pushLiveStatus = (state: P2PConnectionState, pendingCount: number) => {
      setLiveStatus({
        state: state === 'host-offline' ? 'reconnecting' : state,
        role: 'client',
        peerCount: state === 'connected' ? 1 : 0,
        pendingCount,
      })
    }

    service.onConnectionStateChange = (state) => {
      setConnectionState(state as P2PConnectionState)
      lastConnectionState = state as P2PConnectionState
      if (state === 'connected') {
        setStage('connected')
        setShareMode(mode)
        setRoomCode(roomCode)
      }
      if (state === 'disconnected') {
        cleanupClientSession()
      } else {
        pushLiveStatus(lastConnectionState, service.getPendingSubmissions().length)
      }
      if (state === 'connected') {
        void queryClient.resumePausedMutations()
      }
    }

    service.onPendingChange = (pending) => {
      if (lastConnectionState === 'disconnected') return
      pushLiveStatus(lastConnectionState, pending.length)
    }

    service.onDataChanged = () => {
      void queryClient.invalidateQueries()
    }

    service.onSharedTournaments = (msg) => {
      setHostSharedTournamentId(msg.tournamentIds[0] ?? null)
    }

    service.onChatMessage = (msg, peerId) => {
      const state = getClientP2PState()
      if (!state.chatEnabled) return
      if (isRateLimited(peerId, chatRateLimitMap)) return
      const peers = service.getPeers()
      const verified = verifyChatMessage(msg, peerId, peers)
      appendChatMessage(verified)
      playSound('chat')
      if (!state.chatOpen) incrementUnread()
    }

    service.onChatDelete = (msg) => {
      deleteChatMessage(msg.id)
    }

    service.onAnnouncement = (msg) => {
      setAnnouncement(msg)
    }

    service.onHostRefreshing = (refreshing) => setHostRefreshing(refreshing)
    service.onKicked = () => {
      setKicked()
      service.leave()
      setLiveStatus(null)
      setActiveDataProvider(null)
      clearP2PService()
    }

    service.onPeerCount = (msg) => {
      setPeerCount(msg)
    }

    service.joinRoom(roomCode)
  }, [roomCode, token, mode, blocked, confirmedName, updateStageFromDiagnostic])

  // Countdown timer
  useEffect(() => {
    if (stage === 'connected') return
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      const remaining = Math.max(0, CONNECTION_TIMEOUT_S - elapsed)
      setCountdown(remaining)
    }, 1000)
    return () => clearInterval(interval)
  }, [stage])

  // Navigate on connected
  useEffect(() => {
    if (connectionState !== 'connected') return
    navigate({ to: '/', search: { tournamentId: undefined, round: undefined, tab: 'pairings' } })
  }, [connectionState, navigate])

  if (confirmedName === null) {
    return <LiveNameEntry title="Domare" onConfirm={setConfirmedName} />
  }

  return (
    <div className="connecting-screen" data-testid="shared-provider-ready">
      <div className="connecting-spacer" />
      <div className={`connecting-logo-wrapper${blocked ? ' connecting-logo--blocked' : ''}`}>
        <img
          src="/lotta-icon-512.png"
          alt="Lotta"
          className="connecting-logo connecting-logo--base"
        />
        <img
          src="/lotta-icon-512.png"
          alt=""
          className="connecting-logo connecting-logo--fill"
          data-testid="logo-fill"
          style={{ clipPath: `inset(${100 - STAGE_FILL[stage]}% 0 0 0)` }}
        />
      </div>
      <div className="connecting-below">
        <div className="connecting-status" style={blocked ? { visibility: 'hidden' } : undefined}>
          {STAGE_LABELS[stage]}
        </div>
        {stage !== 'connected' && (
          <div
            className="connecting-countdown"
            style={blocked ? { visibility: 'hidden' } : undefined}
          >
            ({countdown}s)
          </div>
        )}
        {stage !== 'connected' && <CompatWarnings />}
        {blocked && (
          <button className="compat-override-link" onClick={() => setBlocked(false)}>
            Försök ansluta ändå
          </button>
        )}
        {hasWarnings && stage !== 'connected' && (
          <button
            className="compat-override-link"
            onClick={() =>
              navigate({
                to: '/',
                search: { tournamentId: undefined, round: undefined, tab: 'pairings' },
              })
            }
          >
            Använd Lotta själv
          </button>
        )}
      </div>
    </div>
  )
}
