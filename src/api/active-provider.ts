import type { DataProvider } from './data-provider'

let provider: DataProvider | null = null
let localFactory: (() => DataProvider) | null = null

export function setActiveDataProvider(p: DataProvider | null): void {
  provider = p
}

export function getActiveDataProvider(): DataProvider | null {
  return provider
}

/**
 * Register the factory that returns the local (IndexedDB-backed) provider.
 * Call this once on bootstrap (see main.tsx / createLocalProvider).
 */
export function setLocalProviderFactory(factory: (() => DataProvider) | null): void {
  localFactory = factory
}

/**
 * Returns the active provider (P2P remote) if one is set, otherwise falls back
 * to the local provider. Always returns a usable provider — throws only if
 * no local provider has been registered (i.e., before bootstrap).
 */
export function getDataProvider(): DataProvider {
  if (provider) return provider
  if (!localFactory) {
    throw new Error('Local provider factory not registered. Did you bootstrap the app?')
  }
  return localFactory()
}
