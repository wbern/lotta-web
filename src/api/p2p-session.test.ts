// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLeave = vi.fn()
const mockGetP2PService = vi.fn(() => ({ leave: mockLeave }))
const mockClearP2PService = vi.fn()
const mockSetActiveDataProvider = vi.fn()
const mockResetClientStore = vi.fn()
const mockSetLiveStatus = vi.fn()

vi.mock('../services/p2p-provider', () => ({
  getP2PService: () => mockGetP2PService(),
  clearP2PService: () => mockClearP2PService(),
  setP2PService: vi.fn(),
}))

vi.mock('./active-provider', () => ({
  setActiveDataProvider: (p: unknown) => mockSetActiveDataProvider(p),
  getActiveDataProvider: vi.fn(),
}))

vi.mock('../stores/client-p2p-store', () => ({
  resetClientStore: () => mockResetClientStore(),
}))

vi.mock('../hooks/useLiveStatus', () => ({
  setLiveStatus: (s: unknown) => mockSetLiveStatus(s),
}))

describe('p2p-session', () => {
  beforeEach(() => {
    mockLeave.mockClear()
    mockGetP2PService.mockClear()
    mockGetP2PService.mockReturnValue({ leave: mockLeave })
    mockClearP2PService.mockClear()
    mockSetActiveDataProvider.mockClear()
    mockResetClientStore.mockClear()
    mockSetLiveStatus.mockClear()
  })
  afterEach(() => {
    vi.resetModules()
  })

  describe('cleanupClientSession', () => {
    it('releases the active provider, P2P service, client store, and live status', async () => {
      const { cleanupClientSession } = await import('./p2p-session')

      cleanupClientSession()

      expect(mockSetActiveDataProvider).toHaveBeenCalledWith(null)
      expect(mockClearP2PService).toHaveBeenCalled()
      expect(mockResetClientStore).toHaveBeenCalled()
      expect(mockSetLiveStatus).toHaveBeenCalledWith(null)
    })

    it('does not call leave on the P2P service', async () => {
      const { cleanupClientSession } = await import('./p2p-session')

      cleanupClientSession()

      expect(mockLeave).not.toHaveBeenCalled()
    })
  })

  describe('disconnectFromHost', () => {
    it('calls leave on the P2P service then cleans up', async () => {
      const { disconnectFromHost } = await import('./p2p-session')

      disconnectFromHost()

      expect(mockLeave).toHaveBeenCalled()
      expect(mockSetActiveDataProvider).toHaveBeenCalledWith(null)
      expect(mockClearP2PService).toHaveBeenCalled()
      expect(mockResetClientStore).toHaveBeenCalled()
      expect(mockSetLiveStatus).toHaveBeenCalledWith(null)
    })

    it('still cleans up when the P2P service is already torn down', async () => {
      mockGetP2PService.mockImplementation(() => {
        throw new Error('P2PService not initialized')
      })
      const { disconnectFromHost } = await import('./p2p-session')

      expect(() => disconnectFromHost()).not.toThrow()
      expect(mockClearP2PService).toHaveBeenCalled()
      expect(mockSetLiveStatus).toHaveBeenCalledWith(null)
    })
  })
})
