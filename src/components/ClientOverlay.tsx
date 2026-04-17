import { useCallback, useEffect, useState } from 'react'
import { useChatAutoScroll } from '../hooks/useChatAutoScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLiveStatus } from '../hooks/useLiveStatus'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { MAX_CHAT_TEXT } from '../lib/chat'
import { getP2PService } from '../services/p2p-provider'
import type { RelaySocketInfo } from '../services/p2p-service'
import {
  appendChatMessage,
  clearUnread,
  dismissAnnouncement,
  toggleChat,
  toggleDiagnostics,
  useClientP2PStore,
} from '../stores/client-p2p-store'
import type { ChatMessage } from '../types/p2p'
import { ChatMessageItem } from './ChatMessageItem'
import { ConnectionDiagnostics } from './ConnectionDiagnostics'

export function ClientOverlay() {
  const store = useClientP2PStore()
  const liveStatus = useLiveStatus()
  const online = useOnlineStatus()
  const [chatInput, setChatInput] = useState('')
  const [relayStatus, setRelayStatus] = useState<RelaySocketInfo[]>([])
  const [rtcPeerStates, setRtcPeerStates] = useState<{ peerId: string; state: string }[]>([])
  const [diagInfo, setDiagInfo] = useState({
    roomId: '',
    selfId: '',
    role: '',
    strategy: '',
    hostId: '',
  })
  const { scrollRef: chatScrollRef, bottomRef: chatBottomRef } = useChatAutoScroll(
    store.chatMessages,
  )
  useDocumentTitle(store.unreadChat, 'Lotta')

  // Poll diagnostics when panel is visible
  useEffect(() => {
    if (!store.showDiagnostics) return
    function updateDiagnostics() {
      try {
        const svc = getP2PService()
        setRelayStatus(svc.getRelayStatus())
        setRtcPeerStates(svc.getRtcPeerStates())
        setDiagInfo({
          roomId: svc.roomId ?? '',
          selfId: svc.getSelfId(),
          role: svc.role,
          strategy: svc.strategy,
          hostId: svc.getObservedHostId() ?? '',
        })
      } catch {
        // Service may not be available
      }
    }
    updateDiagnostics()
    const timer = setInterval(updateDiagnostics, 3000)
    return () => clearInterval(timer)
  }, [store.showDiagnostics])

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim()
    if (!text || !store.chatEnabled) return
    let senderName = ''
    try {
      senderName = getP2PService().label ?? ''
    } catch {
      // Service unavailable
    }
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      senderName,
      senderRole: 'viewer',
      text,
      timestamp: Date.now(),
    }
    try {
      getP2PService().broadcastChatMessage(msg)
    } catch {
      // Service unavailable
    }
    appendChatMessage(msg)
    setChatInput('')
  }, [chatInput, store.chatEnabled])

  const handleChatToggle = useCallback(() => {
    toggleChat()
    clearUnread()
  }, [])

  const isReconnecting =
    liveStatus?.role === 'client' &&
    (liveStatus.state !== 'connected' || !online) &&
    liveStatus.state !== 'disconnected'

  // --- Kicked overlay ---
  if (store.kicked) {
    return (
      <div className="client-overlay-kicked">
        <div className="client-overlay-kicked-content">
          <h2>Frånkopplad</h2>
          <p>Du har kopplats bort av arrangören.</p>
        </div>
      </div>
    )
  }

  const hideChat = store.shareMode === 'view'

  return (
    <>
      {/* Reconnecting overlay */}
      {isReconnecting && (
        <div className="reconnecting-overlay" data-testid="reconnecting-overlay">
          <img src="/lotta-icon-512.png" alt="Lotta" className="reconnecting-logo" />
          <div className="reconnecting-status">{'Återansluter\u2026'}</div>
        </div>
      )}

      {/* Host-refreshing hint */}
      {store.hostRefreshing && !isReconnecting && (
        <div className="client-refreshing-banner">
          <span>{'Värden laddar om\u2026'}</span>
        </div>
      )}

      {/* Announcement banner */}
      {store.announcement && (
        <div className="client-announcement">
          <span>{store.announcement.text}</span>
          <button className="btn btn-small" onClick={dismissAnnouncement}>
            Stäng
          </button>
        </div>
      )}

      {/* Chat toggle button */}
      {!hideChat && (
        <button className="client-chat-toggle" onClick={handleChatToggle}>
          <span className={store.unreadChat > 0 ? 'live-chat-unread' : ''}>
            Chatt{store.unreadChat > 0 ? ` (${store.unreadChat})` : ''}
          </span>
          <span>{store.chatOpen ? '▼' : '▲'}</span>
        </button>
      )}

      {/* Chat panel */}
      {!hideChat && store.chatOpen && (
        <div className="client-chat-panel">
          <div className="client-chat-header">
            <button
              className={`btn btn-small ${store.showDiagnostics ? 'btn-primary' : ''}`}
              onClick={toggleDiagnostics}
            >
              Diagnostik
            </button>
            {!store.chatEnabled && (
              <span className="live-chat-disabled-label">Chatten är avstängd</span>
            )}
          </div>

          {store.showDiagnostics && (
            <ConnectionDiagnostics
              diagInfo={diagInfo}
              relayStatus={relayStatus}
              diagnosticLog={store.diagnosticLog}
              peerCount={store.peerCount?.total}
              rtcPeerStates={rtcPeerStates}
            />
          )}

          <div className="live-chat-messages" ref={chatScrollRef}>
            {store.chatMessages.length === 0 ? (
              <p className="live-tab-empty">Inga meddelanden ännu.</p>
            ) : (
              store.chatMessages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
            )}
            <div ref={chatBottomRef} />
          </div>

          {store.chatEnabled && (
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
    </>
  )
}
