import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveDataProvider,
  getDataProvider,
  setActiveDataProvider,
  setLocalProviderFactory,
} from './active-provider'
import { createMockProvider } from './test-mock-provider'

describe('getDataProvider', () => {
  beforeEach(() => {
    setActiveDataProvider(null)
    setLocalProviderFactory(null)
  })

  afterEach(() => {
    setActiveDataProvider(null)
    setLocalProviderFactory(null)
  })

  it('returns the active provider when one is set', () => {
    const active = createMockProvider()
    setActiveDataProvider(active)
    expect(getDataProvider()).toBe(active)
  })

  it('falls back to the registered local factory when no active provider is set', () => {
    const local = createMockProvider()
    setLocalProviderFactory(() => local)
    expect(getDataProvider()).toBe(local)
  })

  it('getActiveDataProvider still returns raw active (null when unset)', () => {
    expect(getActiveDataProvider()).toBeNull()
    const active = createMockProvider()
    setActiveDataProvider(active)
    expect(getActiveDataProvider()).toBe(active)
  })
})
