import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick?: () => void
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ShowToastInput {
  message: string
  autoDismissMs?: number
  action?: ToastAction
  variant?: ToastVariant
}

interface ToastContextValue {
  show: (input: ShowToastInput) => () => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
