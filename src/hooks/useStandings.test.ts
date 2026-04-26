// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedMutationOptions: Record<string, unknown> = {}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useMutation: (options: Record<string, unknown>) => {
      capturedMutationOptions = options
      return (actual as { useMutation: (opts: Record<string, unknown>) => unknown }).useMutation(
        options,
      )
    },
  }
})

vi.mock('../api/results', () => ({
  setResult: vi.fn(),
}))

vi.mock('../api/standings', () => ({
  getStandings: vi.fn(),
  getClubStandings: vi.fn(),
  getChess4Standings: vi.fn(),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { useSetResult } from './useStandings'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSetResult', () => {
  beforeEach(() => {
    capturedMutationOptions = {}
  })

  it('does not override networkMode locally so it inherits the global default', () => {
    renderHook(() => useSetResult(1, 1), { wrapper: createWrapper() })
    expect(capturedMutationOptions.networkMode).toBeUndefined()
  })

  it('serializes mutations with scope', () => {
    renderHook(() => useSetResult(1, 1), { wrapper: createWrapper() })
    expect(capturedMutationOptions.scope).toEqual({ id: 'set-result' })
  })
})
