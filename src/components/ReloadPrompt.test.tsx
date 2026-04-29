// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './toast/ToastProvider'

let mockNeedRefresh = false
let mockOfflineReady = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mockNeedRefresh, vi.fn()],
    offlineReady: [mockOfflineReady, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.stubGlobal('__COMMIT_HASH__', 'abc123')
vi.stubGlobal('__COMMIT_DATE__', '2026-04-09 12:00:00 +0200')

import { ReloadPrompt } from './ReloadPrompt'

function renderWithToast() {
  return render(
    <ToastProvider>
      <ReloadPrompt />
    </ToastProvider>,
  )
}

describe('ReloadPrompt', () => {
  beforeEach(() => {
    mockNeedRefresh = false
    mockOfflineReady = false
  })

  afterEach(cleanup)

  it('routes the offline-ready notice through the global toast (no inline panel)', () => {
    mockOfflineReady = true
    renderWithToast()
    const toast = screen.getByTestId('toast')
    expect(toast.textContent).toContain('Appen är redo offline')
    expect(toast.className).toContain('toast--success')
    // The bespoke .pwa-toast panel must not render when only offline-ready is set.
    expect(document.querySelector('.pwa-toast')).toBeNull()
  })

  it('shows update panel alongside offline-ready toast when both flags are set', () => {
    mockOfflineReady = true
    mockNeedRefresh = true
    renderWithToast()
    // Offline-ready announcement surfaces via toast.
    expect(screen.getByTestId('toast').textContent).toContain('Appen är redo offline')
    // Update panel still renders so the user can act on the available update.
    expect(screen.getByText('Uppdatera')).toBeTruthy()
  })

  it('shows update button when only needRefresh is set', () => {
    mockNeedRefresh = true
    renderWithToast()
    expect(screen.getByText('Ny version tillgänglig')).toBeTruthy()
    expect(screen.getByText('Uppdatera')).toBeTruthy()
  })

  it('shows "Visa ändringar" button instead of rendering the changelog inline', () => {
    mockNeedRefresh = true
    renderWithToast()
    expect(screen.getByText('Visa ändringar')).toBeTruthy()
  })
})
