import { describe, expect, it } from 'vitest'
import { queryClient } from './query-client'

describe('queryClient defaults', () => {
  it('queries default to networkMode "always" so navigator.onLine cannot pause them', () => {
    const defaults = queryClient.getDefaultOptions()
    expect(defaults.queries?.networkMode).toBe('always')
  })

  it('mutations default to networkMode "always" so writes never silently queue', () => {
    const defaults = queryClient.getDefaultOptions()
    expect(defaults.mutations?.networkMode).toBe('always')
  })
})
