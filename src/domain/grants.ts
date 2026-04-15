import type { RpcPermissions } from '../api/p2p-data-provider'

export interface Grant {
  id: string
  label: string
  permissions: RpcPermissions
  token: string
  createdAt: number
}

export function createGrant(input: { label: string; permissions: RpcPermissions }): Grant {
  return {
    id: crypto.randomUUID(),
    label: input.label,
    permissions: input.permissions,
    token: crypto.randomUUID(),
    createdAt: Date.now(),
  }
}
