// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransientSuccess } from './useTransientSuccess'

describe('useTransientSuccess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when isSuccess is false', () => {
    const { result } = renderHook(() => useTransientSuccess(false))
    expect(result.current).toBe(false)
  })

  it('does not flash on initial mount when isSuccess is already true (no rising edge)', () => {
    // Guards against re-flashing when the dialog re-mounts and TanStack
    // Query's mutation hasn't been reset — `isSuccess` is still `true` from
    // the previous mutation, but no fresh transition has occurred.
    const { result } = renderHook(() => useTransientSuccess(true))
    expect(result.current).toBe(false)
  })

  it('returns true immediately after isSuccess flips from false to true', () => {
    const { result, rerender } = renderHook(
      ({ isSuccess }: { isSuccess: boolean }) => useTransientSuccess(isSuccess),
      { initialProps: { isSuccess: false } },
    )
    expect(result.current).toBe(false)
    rerender({ isSuccess: true })
    expect(result.current).toBe(true)
  })

  it('reverts to false after the configured duration elapses', () => {
    const ms = 100
    const { result, rerender } = renderHook(
      ({ isSuccess }: { isSuccess: boolean }) => useTransientSuccess(isSuccess, ms),
      { initialProps: { isSuccess: false } },
    )
    rerender({ isSuccess: true })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(ms - 1)
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(false)
  })

  it('fires again on a second rising edge after fading', () => {
    const ms = 100
    const { result, rerender } = renderHook(
      ({ isSuccess }: { isSuccess: boolean }) => useTransientSuccess(isSuccess, ms),
      { initialProps: { isSuccess: false } },
    )

    rerender({ isSuccess: true })
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(ms)
    })
    expect(result.current).toBe(false)

    // Mutation resets and succeeds again — rising edge from false → true.
    rerender({ isSuccess: false })
    rerender({ isSuccess: true })
    expect(result.current).toBe(true)
  })

  it('cancels its timer on unmount and does not warn about state on unmounted node', () => {
    const ms = 100
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender, unmount } = renderHook(
      ({ isSuccess }: { isSuccess: boolean }) => useTransientSuccess(isSuccess, ms),
      { initialProps: { isSuccess: false } },
    )
    rerender({ isSuccess: true })
    unmount()

    act(() => {
      vi.advanceTimersByTime(ms * 2)
    })

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('still flashes once and reverts under React.StrictMode (double-invoked effects)', () => {
    const ms = 100
    const { result, rerender } = renderHook(
      ({ isSuccess }: { isSuccess: boolean }) => useTransientSuccess(isSuccess, ms),
      { initialProps: { isSuccess: false }, wrapper: StrictMode },
    )

    rerender({ isSuccess: true })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(ms)
    })
    expect(result.current).toBe(false)
  })
})
