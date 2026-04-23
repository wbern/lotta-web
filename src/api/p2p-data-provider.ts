import { generateClubCodeMap } from '../domain/club-codes'
import type { DataProvider } from './data-provider'
import { getCurrentPageUpdates } from './p2p-broadcast'
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
let clubCodeFailures = 0
let clubCodeLockoutUntil = 0
let clubCodeLockoutTier = 0

const CLUB_CODE_FAILURE_LIMIT = 20
const CLUB_CODE_LOCKOUT_TIERS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]
const CLUB_AUTHORIZATION_LIMIT = 2

export function setPeerPermissions(peerId: string, perms: RpcPermissions): void {
  peerPermissions.set(peerId, perms)
}

export function setPeerAuthorizedClubs(peerId: string, clubs: string[]): void {
  peerAuthorizedClubs.set(peerId, clubs)
}

export function resetClubCodeRateLimit(): void {
  clubCodeFailures = 0
  clubCodeLockoutUntil = 0
  clubCodeLockoutTier = 0
}

export function clearAllPeerPermissions(): void {
  peerPermissions.clear()
  peerAuthorizedClubs.clear()
  resetClubCodeRateLimit()
}

export function clearPeerPermissions(peerId: string): void {
  peerPermissions.delete(peerId)
  peerAuthorizedClubs.delete(peerId)
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
    'pages.getCurrent': true,
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
    'pages.getCurrent': true,
  }
}

interface RpcServerOptions {
  onMutation?: () => void
  clubCodeSecret?: string
  getAllClubEntries?: () => string[]
  clubFilterEnabled?: () => boolean
  getPeerLabel?: (peerId: string) => string | undefined
  onClubCodeRateLimit?: () => void
}

// Peers with any of these permissions are acting as referees/admins, not
// spectators — they bypass club-code scoping even when the host has enabled
// the club filter for spectator viewers.
export const WRITE_PERMISSIONS: readonly string[] = [
  'results.set',
  'results.addGame',
  'results.updateGame',
  'results.deleteGame',
  'results.deleteGames',
  'commands.setResult',
  'tournamentPlayers.add',
  'tournamentPlayers.addMany',
  'tournamentPlayers.update',
  'tournamentPlayers.remove',
  'tournamentPlayers.removeMany',
  'rounds.pairNext',
  'rounds.unpairLast',
]

// Everything in createFullPermissions must be partitioned into WRITE_PERMISSIONS
// or this list. The partition is asserted in unit tests so that new methods
// cannot silently slip through and be misclassified as spectator-only.
export const NON_WRITE_PERMISSIONS: readonly string[] = [
  'tournaments.list',
  'tournaments.get',
  'tournamentPlayers.list',
  'rounds.list',
  'rounds.get',
  'standings.get',
  'standings.getClub',
  'standings.getChess4',
  'auth.redeemClubCode',
  'pages.getCurrent',
]

function isSpectatorRole(perms: RpcPermissions | undefined): boolean {
  if (!perms) return false
  return !WRITE_PERMISSIONS.some((m) => perms[m] === true)
}

function getProviderForPeer(
  base: DataProvider,
  peerId: string,
  clubFilterEnabled: boolean,
): DataProvider {
  const perms = peerPermissions.get(peerId)
  const authorizedClubs = peerAuthorizedClubs.get(peerId)
  // Referees/admins without an explicit club-code scope see everything. Any
  // peer that has redeemed a code keeps its scope as a defensive check, even
  // if they also hold write permissions.
  if (!isSpectatorRole(perms) && authorizedClubs === undefined) return base
  if (!clubFilterEnabled) return base
  return createViewScopedProvider(base, authorizedClubs ?? [])
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

      const clubFilterEnabled = options?.clubFilterEnabled?.() ?? true
      const peerProvider = getProviderForPeer(provider, peerId, clubFilterEnabled)

      let result: unknown
      let isMutation = false
      if (req.method === 'commands.setResult') {
        const commandDeps = createCommandDeps(peerProvider)
        const outcome = await handleSetResult(req.args[0] as SetResultCommand, commandDeps)
        result = outcome
        isMutation = outcome.status === 'applied'
      } else if (req.method === 'pages.getCurrent') {
        result = await getCurrentPageUpdates()
      } else if (req.method === 'auth.redeemClubCode') {
        const rawCode = String(req.args[0] ?? '').replace(/[-\s]/g, '')
        const secret = options?.clubCodeSecret
        const clubs = options?.getAllClubEntries?.()
        if (!secret || !clubs) {
          result = { status: 'error', reason: 'not-configured' }
        } else if (Date.now() < clubCodeLockoutUntil) {
          result = { status: 'error', reason: 'rate-limited' }
        } else {
          if (clubCodeLockoutUntil !== 0) {
            clubCodeFailures = 0
            clubCodeLockoutUntil = 0
          }
          const map = generateClubCodeMap(clubs, secret)
          const matchedClub = Object.entries(map).find(([, c]) => c === rawCode)?.[0]
          const matched = matchedClub ? [matchedClub] : null
          if (!matched) {
            clubCodeFailures += 1
            if (clubCodeFailures >= CLUB_CODE_FAILURE_LIMIT) {
              const tierIdx = Math.min(clubCodeLockoutTier, CLUB_CODE_LOCKOUT_TIERS_MS.length - 1)
              clubCodeLockoutUntil = Date.now() + CLUB_CODE_LOCKOUT_TIERS_MS[tierIdx]
              clubCodeLockoutTier += 1
              options?.onClubCodeRateLimit?.()
            }
            result = { status: 'error', reason: 'invalid-code' }
          } else {
            const existing = peerAuthorizedClubs.get(peerId) ?? []
            const mergedSet = new Set([...existing, ...matched])
            if (mergedSet.size > CLUB_AUTHORIZATION_LIMIT) {
              result = { status: 'error', reason: 'club-limit-reached' }
            } else {
              const merged = [...mergedSet].sort()
              setPeerAuthorizedClubs(peerId, merged)
              clubCodeFailures = 0
              clubCodeLockoutTier = 0
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
