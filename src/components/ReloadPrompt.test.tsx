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

  it('shows update toast alongside offline-ready toast when both flags are set', () => {
    mockOfflineReady = true
    mockNeedRefresh = true
    renderWithToast()
    const messages = screen.getAllByTestId('toast').map((t) => t.textContent ?? '')
    expect(messages.some((m) => m.includes('Appen är redo offline'))).toBe(true)
    expect(messages.some((m) => m.includes('Ny version tillgänglig'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Uppdatera' })).toBeTruthy()
  })

  it('shows update button when only needRefresh is set', () => {
    mockNeedRefresh = true
    renderWithToast()
    expect(screen.getByText('Ny version tillgänglig')).toBeTruthy()
    expect(screen.getByText('Uppdatera')).toBeTruthy()
  })

  it('renders the version-update prompt as a toast with primary Uppdatera action', () => {
    mockNeedRefresh = true
    renderWithToast()
    const toast = screen.getByTestId('toast')
    expect(toast.textContent).toContain('Ny version tillgänglig')
    const updateBtn = screen.getByRole('button', { name: 'Uppdatera' })
    expect(updateBtn.className).toContain('btn-primary')
    // The bespoke panel must not coexist.
    expect(document.querySelector('.pwa-toast')).toBeNull()
  })

  it('shows "Visa ändringar" button instead of rendering the changelog inline', () => {
    mockNeedRefresh = true
    renderWithToast()
    expect(screen.getByText('Visa ändringar')).toBeTruthy()
  })
})
