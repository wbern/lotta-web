// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setLiveStatus, useLiveStatus } from './useLiveStatus'

afterEach(() => {
  setLiveStatus(null)
})

describe('useLiveStatus', () => {
  it('returns null when no live session is active', () => {
    const { result } = renderHook(() => useLiveStatus())
    expect(result.current).toBeNull()
  })

  it('returns current status after setLiveStatus', () => {
    const { result } = renderHook(() => useLiveStatus())

    act(() => {
      setLiveStatus({ state: 'connected', role: 'host', peerCount: 3 })
    })

    expect(result.current).toEqual({ state: 'connected', role: 'host', peerCount: 3 })
  })

  it('updates when status changes', () => {
    const { result } = renderHook(() => useLiveStatus())

    act(() => {
      setLiveStatus({ state: 'connecting', role: 'host', peerCount: 0 })
    })
    expect(result.current?.state).toBe('connecting')

    act(() => {
      setLiveStatus({ state: 'connected', role: 'host', peerCount: 2 })
    })
    expect(result.current?.state).toBe('connected')
    expect(result.current?.peerCount).toBe(2)
  })

  it('returns null after clearing', () => {
    const { result } = renderHook(() => useLiveStatus())

    act(() => {
      setLiveStatus({ state: 'connected', role: 'client', peerCount: 1 })
    })
    expect(result.current).not.toBeNull()

    act(() => {
      setLiveStatus(null)
    })
    expect(result.current).toBeNull()
  })

  it('carries pendingCount through to consumers', () => {
    const { result } = renderHook(() => useLiveStatus())

    act(() => {
      setLiveStatus({ state: 'connected', role: 'client', peerCount: 1, pendingCount: 2 })
    })

    expect(result.current?.pendingCount).toBe(2)
  })
})
