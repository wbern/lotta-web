import { describe, expect, it } from 'vitest'
import type { RpcPermissions } from '../api/p2p-data-provider'
import { createGrant } from './grants'

describe('createGrant', () => {
  it('stores the provided permissions directly on the grant', () => {
    const permissions: RpcPermissions = {
      'standings.get': true,
      'results.set': true,
      'commands.setResult': true,
    }
    const grant = createGrant({ label: 'Sofia — KSS', permissions })

    expect(grant.permissions).toEqual(permissions)
  })
})
