import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick?: () => void
  primary?: boolean
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ShowToastInput {
  message: string
  autoDismissMs?: number
  actions?: ToastAction[]
  variant?: ToastVariant
  /** Fired when the toast is removed for any reason (× click, action click, auto-dismiss, programmatic dismiss). */
  onDismiss?: () => void
  /** Stable id. Calling show() again with the same id replaces the existing toast in place. */
  id?: string
}

type MessageOrFn<T> = string | ((value: T) => string)

export interface ShowPromiseOptions<T> {
  loading: string
  success: MessageOrFn<T>
  error: MessageOrFn<unknown>
  successDismissMs?: number
  errorDismissMs?: number
}

interface ToastContextValue {
  show: (input: ShowToastInput) => () => void
  promise: <T>(p: Promise<T>, opts: ShowPromiseOptions<T>) => Promise<T>
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
