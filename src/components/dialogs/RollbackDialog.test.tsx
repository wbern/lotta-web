// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RollbackDialog } from './RollbackDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof RollbackDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RollbackDialog open onClose={() => {}} onSwitch={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

describe('RollbackDialog', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('shows an empty-state message when no versions are available', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ versions: [] }), { status: 200 }),
    )
    renderDialog()
    expect(await screen.findByTestId('rollback-empty')).toBeDefined()
  })

  it('renders a row per available version with the version string', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          versions: [
            { version: '1.2.0', date: '2026-03-01', hash: 'abc' },
            { version: '1.1.0', date: '2026-02-01', hash: 'def' },
          ],
        }),
        { status: 200 },
      ),
    )
    renderDialog()
    expect(await screen.findByTestId('rollback-version-1.2.0')).toBeDefined()
    expect(screen.getByTestId('rollback-version-1.1.0')).toBeDefined()
  })

  it('renders a warning that explains the per-version DB isolation and the backup-and-import path', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ versions: [{ version: '1.0.0', date: null, hash: null }] }), {
        status: 200,
      }),
    )
    renderDialog()
    const warning = await screen.findByTestId('rollback-warning')
    expect(warning).toBeDefined()
    // The older version runs against its own IDB, so the warning should tell
    // the user their current data is untouched but also invisible from there.
    expect(warning.textContent).toMatch(/egen databas/i)
    // And point them at the backup → import escape hatch if they want to
    // bring data across, with a clear "own risk" caveat.
    expect(warning.textContent).toMatch(/säkerhetskopia/i)
    expect(warning.textContent).toMatch(/importera/i)
    expect(warning.textContent).toMatch(/egen risk/i)
  })

  it('invokes onSwitch with the target version when the switch button is clicked', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ versions: [{ version: '1.0.0', date: null, hash: null }] }), {
        status: 200,
      }),
    )
    const onSwitch = vi.fn()
    renderDialog({ onSwitch })
    await screen.findByTestId('rollback-version-1.0.0')

    fireEvent.click(screen.getByTestId('rollback-switch-1.0.0'))
    expect(onSwitch).toHaveBeenCalledWith('1.0.0')
  })
})
