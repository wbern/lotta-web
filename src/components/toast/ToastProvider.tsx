import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ShowPromiseOptions, type ShowToastInput, ToastContext } from './useToast'

interface ActiveToast extends ShowToastInput {
  internalId: number
}

interface AutoDismiss {
  timer: ReturnType<typeof setTimeout>
  remaining: number
  startedAt: number
}

export function ToastProvider({
  children,
  maxVisible,
}: {
  children: ReactNode
  maxVisible?: number
}) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(0)
  const timersRef = useRef<Map<number, AutoDismiss>>(new Map())
  const queueRef = useRef<ActiveToast[]>([])

  const toastsRef = useRef<ActiveToast[]>([])
  toastsRef.current = toasts

  const scheduleDismissRef = useRef<(internalId: number, ms: number) => void>(() => {})

  const dismiss = useCallback(
    (internalId: number) => {
      const existing = timersRef.current.get(internalId)
      if (existing) clearTimeout(existing.timer)
      timersRef.current.delete(internalId)
      const wasVisible = toastsRef.current.some((t) => t.internalId === internalId)
      const target =
        toastsRef.current.find((t) => t.internalId === internalId) ??
        queueRef.current.find((t) => t.internalId === internalId)
      if (wasVisible) {
        let next = toastsRef.current.filter((t) => t.internalId !== internalId)
        if (queueRef.current.length > 0 && (maxVisible === undefined || next.length < maxVisible)) {
          const promoted = queueRef.current.shift() as ActiveToast
          next = [...next, promoted]
          if (promoted.autoDismissMs !== undefined) {
            scheduleDismissRef.current(promoted.internalId, promoted.autoDismissMs)
          }
        }
        toastsRef.current = next
        setToasts(next)
      } else {
        queueRef.current = queueRef.current.filter((t) => t.internalId !== internalId)
      }
      target?.onDismiss?.()
    },
    [maxVisible],
  )

  const scheduleDismiss = useCallback(
    (internalId: number, ms: number) => {
      timersRef.current.set(internalId, {
        timer: setTimeout(() => dismiss(internalId), ms),
        remaining: ms,
        startedAt: Date.now(),
      })
    },
    [dismiss],
  )
  scheduleDismissRef.current = scheduleDismiss

  const pause = useCallback((internalId: number) => {
    const entry = timersRef.current.get(internalId)
    if (!entry) return
    clearTimeout(entry.timer)
    const elapsed = Date.now() - entry.startedAt
    timersRef.current.set(internalId, {
      ...entry,
      remaining: Math.max(0, entry.remaining - elapsed),
    })
  }, [])

  const resume = useCallback(
    (internalId: number) => {
      const entry = timersRef.current.get(internalId)
      if (!entry) return
      scheduleDismiss(internalId, entry.remaining)
    },
    [scheduleDismiss],
  )

  const show = useCallback(
    (input: ShowToastInput) => {
      if (input.id !== undefined) {
        const existingVisible = toastsRef.current.find((t) => t.id === input.id)
        if (existingVisible) {
          const internalId = existingVisible.internalId
          const timer = timersRef.current.get(internalId)
          if (timer) clearTimeout(timer.timer)
          timersRef.current.delete(internalId)
          const next = toastsRef.current.map((t) =>
            t.id === input.id ? { ...input, internalId } : t,
          )
          toastsRef.current = next
          setToasts(next)
          if (input.autoDismissMs !== undefined) {
            scheduleDismiss(internalId, input.autoDismissMs)
          }
          return () => dismiss(internalId)
        }
        const existingQueued = queueRef.current.find((t) => t.id === input.id)
        if (existingQueued) {
          const internalId = existingQueued.internalId
          queueRef.current = queueRef.current.map((t) =>
            t.id === input.id ? { ...input, internalId } : t,
          )
          return () => dismiss(internalId)
        }
      }
      const internalId = nextId.current++
      const newToast: ActiveToast = { ...input, internalId }
      if (maxVisible !== undefined && toastsRef.current.length >= maxVisible) {
        queueRef.current.push(newToast)
        return () => dismiss(internalId)
      }
      const next = [...toastsRef.current, newToast]
      toastsRef.current = next
      setToasts(next)
      if (input.autoDismissMs !== undefined) {
        scheduleDismiss(internalId, input.autoDismissMs)
      }
      return () => dismiss(internalId)
    },
    [scheduleDismiss, dismiss, maxVisible],
  )

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        for (const id of timersRef.current.keys()) pause(id)
      } else {
        for (const id of timersRef.current.keys()) resume(id)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause, resume])

  const promiseSeq = useRef(0)
  const promise = useCallback(
    <T,>(p: Promise<T>, opts: ShowPromiseOptions<T>): Promise<T> => {
      const toastId = `__promise_${promiseSeq.current++}`
      show({ id: toastId, message: opts.loading, variant: 'info' })
      return p.then(
        (value) => {
          const message = typeof opts.success === 'function' ? opts.success(value) : opts.success
          show({
            id: toastId,
            message,
            variant: 'success',
            autoDismissMs: opts.successDismissMs ?? 4000,
          })
          return value
        },
        (err) => {
          const message = typeof opts.error === 'function' ? opts.error(err) : opts.error
          show({
            id: toastId,
            message,
            variant: 'error',
            autoDismissMs: opts.errorDismissMs,
          })
          throw err
        },
      )
    },
    [show],
  )

  const contextValue = useMemo(() => ({ show, promise }), [show, promise])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.internalId}
              data-testid="toast"
              role={t.variant === 'error' ? 'alert' : 'status'}
              className={t.variant ? `toast toast--${t.variant}` : 'toast'}
              onMouseEnter={() => pause(t.internalId)}
              onMouseLeave={() => resume(t.internalId)}
              onFocus={() => pause(t.internalId)}
              onBlur={() => resume(t.internalId)}
            >
              <span>{t.message}</span>
              {t.actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className={a.primary ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    a.onClick?.()
                    dismiss(t.internalId)
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                className="toast-dismiss"
                data-testid="toast-dismiss"
                aria-label="Stäng"
                onClick={() => dismiss(t.internalId)}
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
