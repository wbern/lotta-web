// @vitest-environment jsdom
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVersions } from './useVersions'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useVersions', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  it('returns the list of versions from /versions.json', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          versions: [
            { version: '1.2.0', date: '2026-03-01', hash: 'abc' },
            { version: '1.1.0', date: '2026-02-01', hash: 'def' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const { result } = renderHook(() => useVersions(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([
      { version: '1.2.0', date: '2026-03-01', hash: 'abc' },
      { version: '1.1.0', date: '2026-02-01', hash: 'def' },
    ])
  })

  it('returns an empty list when the manifest is missing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('', { status: 404 }))

    const { result } = renderHook(() => useVersions(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('returns an empty list when fetch rejects', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useVersions(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('opts back into networkMode "online" so it pauses while offline', async () => {
    // The global queryClient default is 'always' (so IDB-backed queries don't
    // pause); useVersions does a real HTTP fetch and must opt back into the
    // online gate. Inheriting the global default would skip this.
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, networkMode: 'always' },
      },
    })
    const localWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    onlineManager.setOnline(false)
    try {
      const { result } = renderHook(() => useVersions(), { wrapper: localWrapper })
      await waitFor(() => expect(result.current.fetchStatus).toBe('paused'))
      expect(globalThis.fetch).not.toHaveBeenCalled()
    } finally {
      onlineManager.setOnline(true)
    }
  })
})
