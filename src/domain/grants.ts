import {
  createFullPermissions,
  createViewPermissions,
  type RpcPermissions,
} from '../api/p2p-data-provider'

interface Grant {
  id: string
  label: string
  preset: 'full' | 'view'
  token: string
  createdAt: number
}

export function createGrant(input: { label: string; preset: 'full' | 'view' }): Grant {
  return {
    id: crypto.randomUUID(),
    label: input.label,
    preset: input.preset,
    token: crypto.randomUUID(),
    createdAt: Date.now(),
  }
}

export function resolveGrantPermissions(grant: Grant): RpcPermissions {
  return grant.preset === 'full' ? createFullPermissions() : createViewPermissions()
}
