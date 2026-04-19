import { describe, expect, it } from 'vitest'
import type { DataProvider } from './data-provider'
import { dispatch } from './rpc'

describe('dispatch', () => {
  it('rejects prototype-chain method lookups', async () => {
    const provider = {} as DataProvider
    await expect(dispatch(provider, 'constructor.name', [])).rejects.toThrow(
      'Unknown method: constructor.name',
    )
    await expect(dispatch(provider, 'toString.call', [])).rejects.toThrow(
      'Unknown method: toString.call',
    )
  })
})
