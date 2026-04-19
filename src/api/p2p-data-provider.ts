import { generateClubCodeMap } from '../domain/club-codes'
import type { DataProvider } from './data-provider'
import { clearCurrentActor, setCurrentActor } from './peer-actor'
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
  onPeerLeave?: ((peerId: string) => void) | null
}

export function createP2pClientProvider(service: RpcSender): DataProvider {
  return createRpcClient(
    (req) => service.sendRpcRequest(req),
    (cb) => {
      service.onRpcResponse = cb
    },
  )
}

const READ_METHODS = new Set(['list', 'get', 'getClub', 'getChess4'])

/** Per-method permission record. Only explicitly `true` methods are allowed. */
export type RpcPermissions = Partial<Record<string, boolean>>

const peerPermissions = new Map<string, RpcPermissions>()
const peerAuthorizedClubs = new Map<string, string[]>()
const peerClubCodeFailures = new Map<string, number>()

const CLUB_CODE_FAILURE_LIMIT = 20
const CLUB_AUTHORIZATION_LIMIT = 2

export function setPeerPermissions(peerId: string, perms: RpcPermissions): void {
  peerPermissions.set(peerId, perms)
}

export function setPeerAuthorizedClubs(peerId: string, clubs: string[]): void {
  peerAuthorizedClubs.set(peerId, clubs)
}

export function clearAllPeerPermissions(): void {
  peerPermissions.clear()
  peerAuthorizedClubs.clear()
  peerClubCodeFailures.clear()
}

export function clearPeerPermissions(peerId: string): void {
  peerPermissions.delete(peerId)
  peerAuthorizedClubs.delete(peerId)
  peerClubCodeFailures.delete(peerId)
}

export function createFullPermissions(): RpcPermissions {
  return {
    'tournaments.list': true,
    'tournaments.get': true,
    'tournamentPlayers.list': true,
    'tournamentPlayers.add': true,
    'tournamentPlayers.addMany': true,
    'tournamentPlayers.update': true,
    'tournamentPlayers.remove': true,
    'tournamentPlayers.removeMany': true,
    'rounds.list': true,
    'rounds.get': true,
    'rounds.pairNext': true,
    'rounds.unpairLast': true,
    'results.set': true,
    'results.addGame': true,
    'results.updateGame': true,
    'results.deleteGame': true,
    'results.deleteGames': true,
    'standings.get': true,
    'standings.getClub': true,
    'standings.getChess4': true,
    'commands.setResult': true,
    'auth.redeemClubCode': true,
  }
}

export function createViewPermissions(): RpcPermissions {
  return {
    'tournaments.list': true,
    'tournaments.get': true,
    'tournamentPlayers.list': true,
    'rounds.list': true,
    'rounds.get': true,
    'standings.get': true,
    'standings.getClub': true,
    'standings.getChess4': true,
    'clubs.list': true,
    'settings.get': true,
    'auth.redeemClubCode': true,
  }
}

interface RpcServerOptions {
  onMutation?: () => void
  clubCodeSecret?: string
  getAllClubEntries?: () => string[]
  clubFilterEnabled?: boolean
  getPeerLabel?: (peerId: string) => string | undefined
}

const ADMIN_ONLY_PERMISSIONS = ['tournamentPlayers.update', 'rounds.pairNext']

function isClubScopedRole(perms: RpcPermissions | undefined): boolean {
  if (!perms) return false
  return !ADMIN_ONLY_PERMISSIONS.some((m) => perms[m] === true)
}

function getProviderForPeer(
  base: DataProvider,
  peerId: string,
  clubFilterEnabled: boolean,
): DataProvider {
  const perms = peerPermissions.get(peerId)
  if (!isClubScopedRole(perms)) return base
  if (!clubFilterEnabled) return base
  return createViewScopedProvider(base, peerAuthorizedClubs.get(peerId) ?? [])
}

function isAllowed(method: string, peerId: string): boolean {
  const perms = peerPermissions.get(peerId)
  if (!perms) return false
  return perms[method] === true
}

export function startP2pRpcServer(
  service: RpcReceiver,
  provider: DataProvider,
  options?: RpcServerOptions,
): void {
  service.onRpcRequest = async (req, peerId) => {
    const label = options?.getPeerLabel?.(peerId)
    if (label) setCurrentActor(label)
    try {
      if (!isAllowed(req.method, peerId)) {
        service.sendRpcResponse({ id: req.id, error: `Permission denied: ${req.method}` }, peerId)
        return
      }

      const clubFilterEnabled = options?.clubFilterEnabled ?? true
      const peerProvider = getProviderForPeer(provider, peerId, clubFilterEnabled)

      let result: unknown
      let isMutation = false
      if (req.method === 'commands.setResult') {
        const commandDeps = createCommandDeps(peerProvider)
        const outcome = await handleSetResult(req.args[0] as SetResultCommand, commandDeps)
        result = outcome
        isMutation = outcome.status === 'applied'
      } else if (req.method === 'auth.redeemClubCode') {
        const rawCode = String(req.args[0] ?? '').replace(/[-\s]/g, '')
        const secret = options?.clubCodeSecret
        const clubs = options?.getAllClubEntries?.()
        if (!secret || !clubs) {
          result = { status: 'error', reason: 'not-configured' }
        } else if ((peerClubCodeFailures.get(peerId) ?? 0) >= CLUB_CODE_FAILURE_LIMIT) {
          result = { status: 'error', reason: 'rate-limited' }
        } else {
          const map = generateClubCodeMap(clubs, secret)
          const matchedClub = Object.entries(map).find(([, c]) => c === rawCode)?.[0]
          const matched = matchedClub ? [matchedClub] : null
          if (!matched) {
            peerClubCodeFailures.set(peerId, (peerClubCodeFailures.get(peerId) ?? 0) + 1)
            result = { status: 'error', reason: 'invalid-code' }
          } else {
            const existing = peerAuthorizedClubs.get(peerId) ?? []
            const mergedSet = new Set([...existing, ...matched])
            if (mergedSet.size > CLUB_AUTHORIZATION_LIMIT) {
              result = { status: 'error', reason: 'club-limit-reached' }
            } else {
              const merged = [...mergedSet].sort()
              setPeerAuthorizedClubs(peerId, merged)
              result = { status: 'ok', clubs: merged }
            }
          }
        }
      } else {
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
    } finally {
      if (label) clearCurrentActor()
    }
  }
  const existingOnPeerLeave = service.onPeerLeave
  service.onPeerLeave = (peerId) => {
    clearPeerPermissions(peerId)
    existingOnPeerLeave?.(peerId)
  }
}
