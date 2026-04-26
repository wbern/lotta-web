import { useSyncExternalStore } from 'react'
import type { LiveConnectionState, LiveRole } from '../components/layout/StatusBar'

interface LiveStatus {
  state: LiveConnectionState
  role: LiveRole
  peerCount: number
  pendingCount?: number
}

let current: LiveStatus | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export function setLiveStatus(status: LiveStatus | null): void {
  current = status
  notify()
}

export function useLiveStatus(): LiveStatus | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
