// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ToastProvider', () => {
  it('renders the message after a single show() call', () => {
    function Trigger() {
      const { show } = useToast()
      return (
        <button type="button" onClick={() => show({ message: 'Sparat' })}>
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    act(() => {
      screen.getByText('trigger').click()
    })

    expect(screen.getByTestId('toast').textContent).toContain('Sparat')
  })

  it('applies a variant class so colors can be styled per kind', () => {
    function VariantTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ message: 'Kunde inte spara', variant: 'error' })}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <VariantTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const toast = screen.getByTestId('toast')
    expect(toast.className).toContain('toast--error')
  })

  it('renders an action button that runs onClick and dismisses the toast', () => {
    const onClick = vi.fn()
    function ActionTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() =>
            show({
              message: 'Webbläsaren kan radera turneringsdata...',
              action: { label: 'OK', onClick },
            })
          }
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <ActionTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const actionBtn = screen.getByRole('button', { name: 'OK' })
    act(() => {
      actionBtn.click()
    })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('auto-dismisses a toast after the configured duration', () => {
    vi.useFakeTimers()
    function AutoTrigger() {
      const { show } = useToast()
      return (
        <button type="button" onClick={() => show({ message: 'gone soon', autoDismissMs: 1000 })}>
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <AutoTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })
    expect(screen.getByTestId('toast')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('removes only the dismissed toast, leaving the rest in place', () => {
    function MultiTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            show({ message: 'first' })
            show({ message: 'second' })
            show({ message: 'third' })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const toasts = screen.getAllByTestId('toast')
    const dismissOnSecond = toasts[1].querySelector(
      '[data-testid="toast-dismiss"]',
    ) as HTMLButtonElement
    act(() => {
      dismissOnSecond.click()
    })

    const remaining = screen.getAllByTestId('toast')
    expect(remaining).toHaveLength(2)
    expect(remaining[0].textContent).toContain('first')
    expect(remaining[1].textContent).toContain('third')
    expect(screen.queryByText('second')).toBeNull()
  })

  it('pauses auto-dismiss while the toast is hovered', () => {
    vi.useFakeTimers()
    function HoverTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ message: 'should pause', autoDismissMs: 1000 })}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <HoverTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })
    const toast = screen.getByTestId('toast')

    // Hover before the timer would fire.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.mouseEnter(toast)
    // Past the original deadline — should still be visible because hover paused.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()

    // Leaving resumes the remaining 500ms.
    fireEvent.mouseLeave(toast)
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('uses role="status" for non-error variants so screen readers announce politely', () => {
    function WarningTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ message: 'Lagring kan rensas', variant: 'warning' })}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <WarningTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    expect(screen.getByTestId('toast').getAttribute('role')).toBe('status')
  })

  it('stacks multiple toasts in the order they were shown', () => {
    function MultiTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            show({ message: 'first' })
            show({ message: 'second' })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )

    act(() => {
      screen.getByText('trigger').click()
    })

    const toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(2)
    expect(toasts[0].textContent).toContain('first')
    expect(toasts[1].textContent).toContain('second')
  })
})
