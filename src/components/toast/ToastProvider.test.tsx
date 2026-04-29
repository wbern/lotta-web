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

  it('renders multiple action buttons via actions array, each running its own onClick', () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()
    function MultiActionTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() =>
            show({
              message: 'Ny version tillgänglig',
              actions: [
                { label: 'Uppdatera', onClick: onPrimary },
                { label: 'Visa ändringar', onClick: onSecondary },
              ],
            })
          }
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <MultiActionTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const primary = screen.getByRole('button', { name: 'Uppdatera' })
    const secondary = screen.getByRole('button', { name: 'Visa ändringar' })
    expect(primary).toBeTruthy()
    expect(secondary).toBeTruthy()

    act(() => {
      secondary.click()
    })
    expect(onSecondary).toHaveBeenCalledTimes(1)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('renders a primary action with btn-primary styling', () => {
    function PrimaryTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() =>
            show({
              message: 'Ny version tillgänglig',
              actions: [{ label: 'Uppdatera', primary: true }, { label: 'Visa ändringar' }],
            })
          }
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <PrimaryTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const primary = screen.getByRole('button', { name: 'Uppdatera' })
    const secondary = screen.getByRole('button', { name: 'Visa ändringar' })
    expect(primary.className).toContain('btn-primary')
    expect(secondary.className).not.toContain('btn-primary')
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
              actions: [{ label: 'OK', onClick }],
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

  it('pauses auto-dismiss while the toast has keyboard focus', () => {
    vi.useFakeTimers()
    function FocusTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ message: 'should pause on focus', autoDismissMs: 1000 })}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <FocusTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })
    const toast = screen.getByTestId('toast')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.focus(toast)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()

    fireEvent.blur(toast)
    act(() => {
      vi.advanceTimersByTime(500)
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

  it('shows loading then replaces with success message when promise resolves', async () => {
    let resolveFn: (v: string) => void = () => {}
    const pending = new Promise<string>((resolve) => {
      resolveFn = resolve
    })

    function PromiseTrigger() {
      const { promise } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            promise(pending, {
              loading: 'Sparar...',
              success: (v) => `Sparat: ${v}`,
              error: 'Kunde inte spara',
            })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <PromiseTrigger />
      </ToastProvider>,
    )

    act(() => {
      screen.getByText('trigger').click()
    })

    let toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain('Sparar...')

    await act(async () => {
      resolveFn('OK')
      await pending
    })

    toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain('Sparat: OK')
    expect(toasts[0].className).toContain('toast--success')
  })

  it('replaces loading with error toast when promise rejects, and rethrows', async () => {
    let rejectFn: (e: Error) => void = () => {}
    const pending = new Promise<string>((_, reject) => {
      rejectFn = reject
    })

    let caught: unknown
    function FailTrigger() {
      const { promise } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            promise(pending, {
              loading: 'Sparar...',
              success: 'ok',
              error: (e) => `Fel: ${(e as Error).message}`,
            }).catch((e) => {
              caught = e
            })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <FailTrigger />
      </ToastProvider>,
    )

    act(() => {
      screen.getByText('trigger').click()
    })

    await act(async () => {
      rejectFn(new Error('disk full'))
      await pending.catch(() => {})
    })

    const toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain('Fel: disk full')
    expect(toasts[0].className).toContain('toast--error')
    expect((caught as Error).message).toBe('disk full')
  })

  it('returns the original resolved value so callers can chain', async () => {
    const pending = Promise.resolve(42)
    let received: number | undefined
    function Trigger() {
      const { promise } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            promise(pending, {
              loading: 'l',
              success: 'ok',
              error: 'no',
            }).then((v) => {
              received = v
            })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('trigger').click()
      await pending
    })
    expect(received).toBe(42)
  })

  it('keeps concurrent promise toasts independent', async () => {
    let resolveA: (v: string) => void = () => {}
    let resolveB: (v: string) => void = () => {}
    const pendingA = new Promise<string>((r) => {
      resolveA = r
    })
    const pendingB = new Promise<string>((r) => {
      resolveB = r
    })

    function Trigger() {
      const { promise } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            promise(pendingA, { loading: 'A loading', success: 'A done', error: 'A err' })
            promise(pendingB, { loading: 'B loading', success: 'B done', error: 'B err' })
          }}
        >
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

    let toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(2)
    expect(toasts[0].textContent).toContain('A loading')
    expect(toasts[1].textContent).toContain('B loading')

    await act(async () => {
      resolveB('B-val')
      await pendingB
    })
    toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(2)
    expect(toasts[0].textContent).toContain('A loading')
    expect(toasts[1].textContent).toContain('B done')

    await act(async () => {
      resolveA('A-val')
      await pendingA
    })
    toasts = screen.getAllByTestId('toast')
    expect(toasts[0].textContent).toContain('A done')
    expect(toasts[1].textContent).toContain('B done')
  })

  it('caps visible toasts at maxVisible and queues the rest', () => {
    function MaxTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            show({ message: 'first' })
            show({ message: 'second' })
            show({ message: 'third' })
            show({ message: 'fourth' })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider maxVisible={2}>
        <MaxTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    let visible = screen.getAllByTestId('toast')
    expect(visible).toHaveLength(2)
    expect(visible[0].textContent).toContain('first')
    expect(visible[1].textContent).toContain('second')

    const dismissFirst = visible[0].querySelector(
      '[data-testid="toast-dismiss"]',
    ) as HTMLButtonElement
    act(() => {
      dismissFirst.click()
    })
    visible = screen.getAllByTestId('toast')
    expect(visible).toHaveLength(2)
    expect(visible[0].textContent).toContain('second')
    expect(visible[1].textContent).toContain('third')
  })

  it('pauses auto-dismiss while the document is hidden', () => {
    vi.useFakeTimers()
    function VisibilityTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ message: 'pauses on hide', autoDismissMs: 1000 })}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <VisibilityTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.queryByTestId('toast')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('replaces an existing toast when show() is called with the same id', () => {
    function DedupTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            show({ id: 'save', message: 'Sparar...' })
            show({ id: 'save', message: 'Sparat', variant: 'success' })
          }}
        >
          trigger
        </button>
      )
    }
    render(
      <ToastProvider>
        <DedupTrigger />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('trigger').click()
    })

    const toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain('Sparat')
    expect(toasts[0].className).toContain('toast--success')
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
