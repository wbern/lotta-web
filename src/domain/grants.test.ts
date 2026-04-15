import { describe, expect, it } from 'vitest'
import { createFullPermissions, createViewPermissions } from '../api/p2p-data-provider'
import { createGrant, resolveGrantPermissions } from './grants'

describe('createGrant', () => {
  it('returns a grant with id, label, preset, token, createdAt', () => {
    const grant = createGrant({ label: 'Sofia — KSS', preset: 'full' })

    expect(grant.label).toBe('Sofia — KSS')
    expect(grant.preset).toBe('full')
    expect(typeof grant.id).toBe('string')
    expect(grant.id.length).toBeGreaterThan(0)
    expect(typeof grant.token).toBe('string')
    expect(grant.token.length).toBeGreaterThan(0)
    expect(grant.id).not.toBe(grant.token)
    expect(typeof grant.createdAt).toBe('number')
  })
})

describe('resolveGrantPermissions', () => {
  it('maps preset "full" to full permissions and "view" to view permissions', () => {
    const fullGrant = createGrant({ label: 'Domare', preset: 'full' })
    const viewGrant = createGrant({ label: 'Avläsare', preset: 'view' })

    expect(resolveGrantPermissions(fullGrant)).toEqual(createFullPermissions())
    expect(resolveGrantPermissions(viewGrant)).toEqual(createViewPermissions())
  })
})

describe('Grant JSON round-trip', () => {
  it('survives JSON.stringify/parse with every field intact', () => {
    const original = createGrant({ label: 'Sofia — KSS', preset: 'full' })
    const round = JSON.parse(JSON.stringify(original))

    expect(round).toEqual(original)
  })
})
