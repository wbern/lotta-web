import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { type ShowToastInput, ToastContext } from './useToast'

interface ActiveToast extends ShowToastInput {
  id: number
}

interface AutoDismiss {
  timer: ReturnType<typeof setTimeout>
  remaining: number
  startedAt: number
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(0)
  const timersRef = useRef<Map<number, AutoDismiss>>(new Map())

  const dismiss = useCallback((id: number) => {
    const existing = timersRef.current.get(id)
    if (existing) clearTimeout(existing.timer)
    timersRef.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const scheduleDismiss = useCallback(
    (id: number, ms: number) => {
      timersRef.current.set(id, {
        timer: setTimeout(() => dismiss(id), ms),
        remaining: ms,
        startedAt: Date.now(),
      })
    },
    [dismiss],
  )

  const pause = useCallback((id: number) => {
    const entry = timersRef.current.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    const elapsed = Date.now() - entry.startedAt
    timersRef.current.set(id, {
      ...entry,
      remaining: Math.max(0, entry.remaining - elapsed),
    })
  }, [])

  const resume = useCallback(
    (id: number) => {
      const entry = timersRef.current.get(id)
      if (!entry) return
      scheduleDismiss(id, entry.remaining)
    },
    [scheduleDismiss],
  )

  const show = useCallback(
    (input: ShowToastInput) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { ...input, id }])
      if (input.autoDismissMs !== undefined) {
        scheduleDismiss(id, input.autoDismissMs)
      }
      return () => dismiss(id)
    },
    [scheduleDismiss, dismiss],
  )

  const contextValue = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.id}
              data-testid="toast"
              role={t.variant === 'error' ? 'alert' : 'status'}
              className={t.variant ? `toast toast--${t.variant}` : 'toast'}
              onMouseEnter={() => pause(t.id)}
              onMouseLeave={() => resume(t.id)}
              onFocus={() => pause(t.id)}
              onBlur={() => resume(t.id)}
            >
              <span>{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    t.action?.onClick?.()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                className="toast-dismiss"
                data-testid="toast-dismiss"
                aria-label="Stäng"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
