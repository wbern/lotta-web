// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnnouncementMessage, ChatMessage, PeerCountMessage } from '../types/p2p'
import {
  appendChatMessage,
  appendDiagnostic,
  chatRateLimitMap,
  clearUnread,
  deleteChatMessage,
  dismissAnnouncement,
  getClientP2PState,
  incrementUnread,
  resetClientStore,
  setAnnouncement,
  setHostRefreshing,
  setKicked,
  setPeerCount,
  toggleChat,
  toggleDiagnostics,
  useClientP2PStore,
} from './client-p2p-store'

function makeChatMsg(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: crypto.randomUUID(),
    senderName: 'Test',
    senderRole: 'viewer',
    text: 'hello',
    timestamp: Date.now(),
    ...overrides,
  }
}

afterEach(() => {
  resetClientStore()
})

describe('client-p2p-store', () => {
  describe('chat messages', () => {
    it('appends a chat message', () => {
      const msg = makeChatMsg({ text: 'hej' })
      appendChatMessage(msg)

      const state = getClientP2PState()
      expect(state.chatMessages).toHaveLength(1)
      expect(state.chatMessages[0].text).toBe('hej')
    })

    it('caps history at MAX_CHAT_HISTORY', () => {
      for (let i = 0; i < 210; i++) {
        appendChatMessage(makeChatMsg({ text: `msg-${i}` }))
      }

      const state = getClientP2PState()
      expect(state.chatMessages.length).toBeLessThanOrEqual(200)
      expect(state.chatMessages[state.chatMessages.length - 1].text).toBe('msg-209')
    })

    it('deletes a chat message by id', () => {
      const msg = makeChatMsg({ id: 'del-me' })
      appendChatMessage(msg)
      appendChatMessage(makeChatMsg({ id: 'keep-me' }))

      deleteChatMessage('del-me')

      const state = getClientP2PState()
      expect(state.chatMessages).toHaveLength(1)
      expect(state.chatMessages[0].id).toBe('keep-me')
    })
  })

  describe('unread count', () => {
    it('increments and clears unread', () => {
      incrementUnread()
      incrementUnread()
      expect(getClientP2PState().unreadChat).toBe(2)

      clearUnread()
      expect(getClientP2PState().unreadChat).toBe(0)
    })
  })

  describe('toggleChat', () => {
    it('opens chat and clears unread', () => {
      incrementUnread()
      incrementUnread()

      toggleChat() // opens

      const state = getClientP2PState()
      expect(state.chatOpen).toBe(true)
      expect(state.unreadChat).toBe(0)
    })

    it('closes chat and preserves unread', () => {
      toggleChat() // open
      incrementUnread()
      toggleChat() // close

      const state = getClientP2PState()
      expect(state.chatOpen).toBe(false)
      expect(state.unreadChat).toBe(1)
    })
  })

  describe('announcements', () => {
    it('sets and dismisses an announcement', () => {
      const ann: AnnouncementMessage = { text: 'Rond 2 börjar!', timestamp: Date.now() }
      setAnnouncement(ann)
      expect(getClientP2PState().announcement).toEqual(ann)

      dismissAnnouncement()
      expect(getClientP2PState().announcement).toBeNull()
    })
  })

  describe('kicked', () => {
    it('sets kicked state', () => {
      expect(getClientP2PState().kicked).toBe(false)
      setKicked()
      expect(getClientP2PState().kicked).toBe(true)
    })
  })

  describe('setPeerCount', () => {
    it('stores peer count and updates chatEnabled', () => {
      const msg: PeerCountMessage = { total: 5, viewers: 3, referees: 2, chatEnabled: false }
      setPeerCount(msg)

      const state = getClientP2PState()
      expect(state.peerCount).toEqual(msg)
      expect(state.chatEnabled).toBe(false)
    })

    it('preserves chatEnabled when not provided', () => {
      const msg: PeerCountMessage = { total: 3, viewers: 2, referees: 1 }
      setPeerCount(msg)

      expect(getClientP2PState().chatEnabled).toBe(true)
    })

    it('applies clubFilterEnabled from the peer count message', () => {
      const msg: PeerCountMessage = {
        total: 1,
        viewers: 1,
        referees: 0,
        clubFilterEnabled: false,
      }
      setPeerCount(msg)

      expect(getClientP2PState().clubFilterEnabled).toBe(false)
    })
  })

  describe('diagnostics', () => {
    it('appends diagnostic entries and caps at 100', () => {
      for (let i = 0; i < 110; i++) {
        appendDiagnostic({ timestamp: i, message: `diag-${i}` })
      }

      const log = getClientP2PState().diagnosticLog
      expect(log.length).toBeLessThanOrEqual(100)
      expect(log[log.length - 1].message).toBe('diag-109')
    })

    it('toggles diagnostics visibility', () => {
      expect(getClientP2PState().showDiagnostics).toBe(false)
      toggleDiagnostics()
      expect(getClientP2PState().showDiagnostics).toBe(true)
      toggleDiagnostics()
      expect(getClientP2PState().showDiagnostics).toBe(false)
    })
  })

  describe('resetClientStore', () => {
    it('resets all state to initial values', () => {
      appendChatMessage(makeChatMsg())
      incrementUnread()
      setKicked()
      setAnnouncement({ text: 'test', timestamp: 1 })
      chatRateLimitMap.set('peer-1', Date.now())

      resetClientStore()

      const state = getClientP2PState()
      expect(state.chatMessages).toHaveLength(0)
      expect(state.unreadChat).toBe(0)
      expect(state.kicked).toBe(false)
      expect(state.announcement).toBeNull()
      expect(chatRateLimitMap.size).toBe(0)
    })

    it('resets hostRefreshing to false', () => {
      setHostRefreshing(true)
      expect(getClientP2PState().hostRefreshing).toBe(true)

      resetClientStore()
      expect(getClientP2PState().hostRefreshing).toBe(false)
    })
  })

  describe('useClientP2PStore hook', () => {
    it('returns current state and reacts to updates', () => {
      const { result } = renderHook(() => useClientP2PStore())
      expect(result.current.chatMessages).toHaveLength(0)

      act(() => {
        appendChatMessage(makeChatMsg({ text: 'live update' }))
      })

      expect(result.current.chatMessages).toHaveLength(1)
      expect(result.current.chatMessages[0].text).toBe('live update')
    })
  })
})
