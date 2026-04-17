import { useSyncExternalStore } from 'react'
import { MAX_CHAT_HISTORY } from '../lib/chat'
import type { DiagnosticEntry } from '../services/p2p-service'
import type { AnnouncementMessage, ChatMessage, PeerCountMessage } from '../types/p2p'

interface ClientP2PState {
  chatMessages: ChatMessage[]
  chatOpen: boolean
  unreadChat: number
  chatEnabled: boolean
  announcement: AnnouncementMessage | null
  kicked: boolean
  peerCount: PeerCountMessage | null
  diagnosticLog: DiagnosticEntry[]
  showDiagnostics: boolean
  shareMode: 'full' | 'view' | null
  clubFilter: string[] | null
  clubFilterEnabled: boolean | null
  roomCode: string | null
  pendingClubCode: string | null
  hostRefreshing: boolean
}

const INITIAL: ClientP2PState = {
  chatMessages: [],
  chatOpen: false,
  unreadChat: 0,
  chatEnabled: true,
  announcement: null,
  kicked: false,
  peerCount: null,
  diagnosticLog: [],
  showDiagnostics: false,
  shareMode: null,
  clubFilter: null,
  clubFilterEnabled: null,
  roomCode: null,
  pendingClubCode: null,
  hostRefreshing: false,
}

let current: ClientP2PState = { ...INITIAL }
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

function update(partial: Partial<ClientP2PState>): void {
  current = { ...current, ...partial }
  notify()
}

// Rate limit map — module-level, not in React state
export const chatRateLimitMap = new Map<string, number>()

export function appendChatMessage(msg: ChatMessage): void {
  update({
    chatMessages: [...current.chatMessages.slice(-MAX_CHAT_HISTORY), msg],
  })
}

export function deleteChatMessage(id: string): void {
  update({
    chatMessages: current.chatMessages.filter((m) => m.id !== id),
  })
}

export function incrementUnread(): void {
  update({ unreadChat: current.unreadChat + 1 })
}

export function clearUnread(): void {
  update({ unreadChat: 0 })
}

export function toggleChat(): void {
  const opening = !current.chatOpen
  update({
    chatOpen: opening,
    unreadChat: opening ? 0 : current.unreadChat,
  })
}

export function setAnnouncement(msg: AnnouncementMessage): void {
  update({ announcement: msg })
}

export function dismissAnnouncement(): void {
  update({ announcement: null })
}

export function setKicked(): void {
  update({ kicked: true })
}

export function setPeerCount(msg: PeerCountMessage): void {
  update({
    peerCount: msg,
    chatEnabled: msg.chatEnabled ?? current.chatEnabled,
    clubFilterEnabled: msg.clubFilterEnabled ?? current.clubFilterEnabled,
  })
}

export function appendDiagnostic(entry: DiagnosticEntry): void {
  update({
    diagnosticLog: [...current.diagnosticLog.slice(-99), entry],
  })
}

export function toggleDiagnostics(): void {
  update({ showDiagnostics: !current.showDiagnostics })
}

export function setShareMode(mode: 'full' | 'view'): void {
  update({ shareMode: mode })
}

export function setClubFilter(clubs: string[] | null): void {
  update({ clubFilter: clubs })
}

export function setClubFilterEnabled(enabled: boolean | null): void {
  update({ clubFilterEnabled: enabled })
}

export function setRoomCode(code: string): void {
  update({ roomCode: code })
}

export function setPendingClubCode(code: string | null): void {
  update({ pendingClubCode: code })
}

export function setHostRefreshing(refreshing: boolean): void {
  update({ hostRefreshing: refreshing })
}

export function resetClientStore(): void {
  current = { ...INITIAL }
  chatRateLimitMap.clear()
  notify()
}

export function getClientP2PState(): ClientP2PState {
  return current
}

export function useClientP2PStore(): ClientP2PState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
