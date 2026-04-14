import { verifyClubCode } from '../domain/club-codes'
import type { DataProvider } from './data-provider'
import type { SetResultCommand } from './result-command'
import { createCommandDeps, handleSetResult } from './result-command'
import type { RpcRequest, RpcResponse } from './rpc'
import { createRpcClient, dispatch } from './rpc'
import { createViewScopedProvider } from './view-scoped-provider'

interface RpcSender {
  sendRpcRequest(request: RpcRequest): void
  onRpcResponse: ((response: RpcResponse) => void) | null
}

interface RpcReceiver {
  sendRpcResponse(response: RpcResponse, peerId: string): void
  onRpcRequest: ((request: RpcRequest, peerId: string) => void) | null
}

export function createP2pClientProvider(service: RpcSender): DataProvider {
  return createRpcClient(
    (req) => service.sendRpcRequest(req),
    (cb) => {
      service.onRpcResponse = cb
    },
  )
}

const READ_METHODS = new Set(['list', 'get'])

/** Per-method permission record. Only explicitly `true` methods are allowed. */
export type RpcPermissions = Partial<Record<string, boolean>>

const peerPermissions = new Map<string, RpcPermissions>()
const peerAuthorizedClubs = new Map<string, string[]>()

export function setPeerPermissions(peerId: string, perms: RpcPermissions): void {
  peerPermissions.set(peerId, perms)
}

export function setPeerAuthorizedClubs(peerId: string, clubs: string[]): void {
  peerAuthorizedClubs.set(peerId, clubs)
}

export function clearAllPeerPermissions(): void {
  peerPermissions.clear()
  peerAuthorizedClubs.clear()
}

export function createFullPermissions(): RpcPermissions {
  return {
    'tournaments.list': true,
    'tournaments.get': true,
    'tournamentPlayers.list': true,
    'rounds.list': true,
    'rounds.get': true,
    'standings.get': true,
    'results.set': true,
    'commands.setResult': true,
    'auth.redeemClubCode': true,
  }
}

export function createViewPermissions(): RpcPermissions {
  return {
    'tournaments.list': true,
    'tournaments.get': true,
    'rounds.list': true,
    'rounds.get': true,
    'tournamentPlayers.list': true,
    'auth.redeemClubCode': true,
  }
}

interface RpcServerOptions {
  onMutation?: () => void
  clubCodeSecret?: string
  getAllClubEntries?: () => string[]
}

function isViewRole(perms: RpcPermissions | undefined): boolean {
  return perms !== undefined && perms['commands.setResult'] !== true
}

function getProviderForPeer(base: DataProvider, peerId: string): DataProvider {
  const perms = peerPermissions.get(peerId)
  if (!isViewRole(perms)) return base
  return createViewScopedProvider(base, peerAuthorizedClubs.get(peerId) ?? [])
}

function isAllowed(method: string, peerId: string): boolean {
  const perms = peerPermissions.get(peerId)
  if (!perms) {
    // Fallback: if no per-peer permissions set, allow reads only
    const methodName = method.split('.')[1]
    return READ_METHODS.has(methodName)
  }
  return perms[method] === true
}

export function startP2pRpcServer(
  service: RpcReceiver,
  provider: DataProvider,
  options?: RpcServerOptions,
): void {
  const commandDeps = createCommandDeps(provider)

  service.onRpcRequest = async (req, peerId) => {
    try {
      if (!isAllowed(req.method, peerId)) {
        service.sendRpcResponse({ id: req.id, error: `Permission denied: ${req.method}` }, peerId)
        return
      }

      let result: unknown
      let isMutation = false
      if (req.method === 'commands.setResult') {
        const outcome = await handleSetResult(req.args[0] as SetResultCommand, commandDeps)
        result = outcome
        isMutation = outcome.status === 'applied'
      } else if (req.method === 'auth.redeemClubCode') {
        const rawCode = String(req.args[0] ?? '')
        const secret = options?.clubCodeSecret
        const clubs = options?.getAllClubEntries?.()
        if (!secret || !clubs) {
          result = { status: 'error', reason: 'not-configured' }
        } else {
          const matched = verifyClubCode(rawCode, clubs, secret)
          if (!matched) {
            result = { status: 'error', reason: 'invalid-code' }
          } else {
            setPeerAuthorizedClubs(peerId, matched)
            result = { status: 'ok', clubs: matched }
          }
        }
      } else {
        const peerProvider = getProviderForPeer(provider, peerId)
        result = await dispatch(peerProvider, req.method, req.args)
        const methodName = req.method.split('.')[1]
        isMutation = !READ_METHODS.has(methodName)
      }
      service.sendRpcResponse({ id: req.id, result }, peerId)
      if (options?.onMutation && isMutation) {
        options.onMutation()
      }
    } catch (e) {
      service.sendRpcResponse(
        { id: req.id, error: e instanceof Error ? e.message : String(e) },
        peerId,
      )
    }
  }
}
