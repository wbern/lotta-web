import type { PairingsPublishInput, StandingsPublishInput } from '../domain/html-publisher.ts'
import {
  publishPairings,
  publishRefereePairings,
  publishStandings,
} from '../domain/html-publisher.ts'
import { getP2PService } from '../services/p2p-provider.ts'
import type { AuditLogEntry, PageUpdateMessage, ResultSubmitMessage } from '../types/p2p.ts'
import { getLiveContext } from './live-context.ts'
import { buildPairingsInput, buildStandingsInput } from './publish-data.ts'
import { setResult } from './results.ts'
import { getDatabaseService } from './service-provider.ts'

function isP2PActive(): boolean {
  try {
    const service = getP2PService()
    return service.connectionState === 'connected' && service.role === 'organizer'
  } catch {
    return false
  }
}

function buildMessage(
  pageType: PageUpdateMessage['pageType'],
  tournamentId: number,
  tournamentName: string,
  roundNr: number,
  html: string,
): PageUpdateMessage {
  return { pageType, tournamentId, tournamentName, roundNr, html, timestamp: Date.now() }
}

function broadcastPairings(tournamentId: number, input: PairingsPublishInput): void {
  if (!isP2PActive()) return
  const html = publishPairings(input)
  getP2PService().broadcastPageUpdate(
    buildMessage('pairings', tournamentId, input.tournamentName, input.roundNr, html),
  )
}

function broadcastStandings(tournamentId: number, input: StandingsPublishInput): void {
  if (!isP2PActive()) return
  const html = publishStandings(input)
  getP2PService().broadcastPageUpdate(
    buildMessage('standings', tournamentId, input.tournamentName, input.roundNr, html),
  )
}

function broadcastRoundManifest(tournamentId: number): void {
  if (!isP2PActive()) return
  const roundNrs = getDatabaseService()
    .games.listRounds(tournamentId)
    .map((r) => r.roundNr)
  getP2PService().broadcastRoundManifest({ tournamentId, roundNrs, timestamp: Date.now() })
}

function broadcastRefereePairings(tournamentId: number, roundNr: number): void {
  if (!isP2PActive()) return
  const input = buildPairingsInput(tournamentId, roundNr)
  if (!input) return
  const html = publishRefereePairings({
    ...input,
    tournamentId,
  })
  getP2PService().broadcastPageUpdate(
    buildMessage('refereePairings', tournamentId, input.tournamentName, roundNr, html),
  )
}

/** Broadcast pairings and standings after a result is entered/changed. */
export async function broadcastAfterResultChange(
  tournamentId: number,
  roundNr: number,
): Promise<void> {
  if (!isP2PActive()) return

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) broadcastPairings(tournamentId, pairingsInput)

  broadcastRefereePairings(tournamentId, roundNr)

  const standingsInput = await buildStandingsInput(tournamentId, roundNr)
  if (standingsInput) broadcastStandings(tournamentId, standingsInput)

  broadcastRoundManifest(tournamentId)
}

/** Broadcast pairings after a new round is paired. */
export async function broadcastAfterPairing(tournamentId: number, roundNr: number): Promise<void> {
  if (!isP2PActive()) return

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) broadcastPairings(tournamentId, pairingsInput)

  broadcastRefereePairings(tournamentId, roundNr)

  broadcastRoundManifest(tournamentId)
}

/**
 * Rebroadcast pairings/referee pairings/standings after the host restores from
 * a snapshot (undo/redo/restoreToPoint). Uses the currently-live tournament
 * and round. If the snapshot removed the selected round, falls back to the
 * latest remaining round. No-op when P2P is inactive or no live context is set.
 */
export async function broadcastAfterRestore(): Promise<void> {
  if (!isP2PActive()) return
  const ctx = getLiveContext()
  if (!ctx) return

  broadcastRoundManifest(ctx.tournamentId)

  const db = getDatabaseService()
  const rounds = db.games.listRounds(ctx.tournamentId)
  if (rounds.length === 0) return

  const roundNrs = rounds.map((r) => r.roundNr)
  const roundNr =
    ctx.round != null && roundNrs.includes(ctx.round) ? ctx.round : roundNrs[roundNrs.length - 1]

  const pairingsInput = buildPairingsInput(ctx.tournamentId, roundNr)
  if (pairingsInput) broadcastPairings(ctx.tournamentId, pairingsInput)

  broadcastRefereePairings(ctx.tournamentId, roundNr)

  const standingsInput = await buildStandingsInput(ctx.tournamentId, roundNr)
  if (standingsInput) broadcastStandings(ctx.tournamentId, standingsInput)
}

/**
 * Broadcast an empty round manifest for a tournament that the host has just
 * deleted. Viewers currently showing that tournament reconcile by dropping
 * all cached rounds; viewers on a different tournament ignore the manifest.
 */
export function broadcastAfterTournamentDelete(tournamentId: number): void {
  if (!isP2PActive()) return
  const ctx = getLiveContext()
  if (!ctx) return
  const shared = ctx.sharedTournamentIds ?? [ctx.tournamentId]
  if (!shared.includes(tournamentId)) return
  getP2PService().broadcastRoundManifest({
    tournamentId,
    roundNrs: [],
    timestamp: Date.now(),
  })
}

/** Send the shared tournament set to a specific peer. */
export function sendSharedTournamentsToPeer(
  peerId: string,
  tournamentIds: number[],
  includeFutureTournaments: boolean,
): void {
  if (!isP2PActive()) return
  getP2PService().sendSharedTournamentsTo(
    { tournamentIds, includeFutureTournaments, timestamp: Date.now() },
    peerId,
  )
}

/** Send the latest-round state of a given tournament to a specific peer. */
export async function sendLatestStateToPeer(peerId: string, tournamentId: number): Promise<void> {
  if (!isP2PActive()) return
  const rounds = getDatabaseService().games.listRounds(tournamentId)
  if (rounds.length === 0) return
  const latest = rounds[rounds.length - 1].roundNr
  await sendCurrentStateToPeer(peerId, tournamentId, latest)
}

/**
 * Build the full set of PageUpdate messages that together represent the
 * current tournament state for a given round. Shared by the host-push path
 * (sendCurrentStateToPeer) and the client-pull bootstrap (getCurrentPageUpdates).
 */
async function buildCurrentStateMessages(
  tournamentId: number,
  roundNr: number,
): Promise<PageUpdateMessage[]> {
  const messages: PageUpdateMessage[] = []

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) {
    messages.push(
      buildMessage(
        'pairings',
        tournamentId,
        pairingsInput.tournamentName,
        roundNr,
        publishPairings(pairingsInput),
      ),
    )
    messages.push(
      buildMessage(
        'refereePairings',
        tournamentId,
        pairingsInput.tournamentName,
        roundNr,
        publishRefereePairings({ ...pairingsInput, tournamentId }),
      ),
    )
  }

  const standingsInput = await buildStandingsInput(tournamentId, roundNr)
  if (standingsInput) {
    messages.push(
      buildMessage(
        'standings',
        tournamentId,
        standingsInput.tournamentName,
        roundNr,
        publishStandings(standingsInput),
      ),
    )
  }

  return messages
}

/** Send current tournament state to a specific peer (for late joiners). */
export async function sendCurrentStateToPeer(
  peerId: string,
  tournamentId: number,
  roundNr: number | undefined,
): Promise<void> {
  if (roundNr == null) return
  if (!isP2PActive()) return

  const service = getP2PService()
  const messages = await buildCurrentStateMessages(tournamentId, roundNr)
  for (const msg of messages) {
    service.sendPageUpdateTo(msg, peerId)
  }
  const roundNrs = getDatabaseService()
    .games.listRounds(tournamentId)
    .map((r) => r.roundNr)
  service.sendRoundManifestTo({ tournamentId, roundNrs, timestamp: Date.now() }, peerId)
}

/**
 * Return the full set of PageUpdate messages representing the host's current
 * live state. Used by the client-pull bootstrap RPC (lt-zqe) so viewers can
 * recover state without relying on host push events. Resolves the live
 * tournament/round from live-context; returns [] if no live context, no
 * rounds exist, or P2P is inactive. Falls back to the latest remaining round
 * if the previously-selected round is gone.
 */
export async function getCurrentPageUpdates(): Promise<PageUpdateMessage[]> {
  if (!isP2PActive()) return []
  const ctx = getLiveContext()
  if (!ctx) return []

  const db = getDatabaseService()
  const rounds = db.games.listRounds(ctx.tournamentId)
  if (rounds.length === 0) return []

  const roundNrs = rounds.map((r) => r.roundNr)
  const latest = roundNrs[roundNrs.length - 1]
  const roundNr = ctx.round != null && roundNrs.includes(ctx.round) ? ctx.round : latest
  if (import.meta.env.DEV && ctx.round != null && roundNr !== ctx.round) {
    console.warn(
      `getCurrentPageUpdates: ctx.round=${ctx.round} not in rounds, falling back to ${roundNr}`,
    )
  }

  return buildCurrentStateMessages(ctx.tournamentId, roundNr)
}

/** Handle a result submission from a referee peer. */
export async function handleResultSubmission(
  msg: ResultSubmitMessage,
  peerId: string,
  onLog?: (entry: AuditLogEntry) => void,
): Promise<void> {
  const service = getP2PService()

  if (!service.isPeerVerifiedReferee(peerId)) {
    service.sendResultAck(
      { boardNr: msg.boardNr, roundNr: msg.roundNr, accepted: false, reason: 'Not authorized' },
      peerId,
    )
    onLog?.({
      timestamp: Date.now(),
      refereeName: msg.refereeName,
      boardNr: msg.boardNr,
      roundNr: msg.roundNr,
      resultType: msg.resultType,
      resultDisplay: msg.resultDisplay,
      accepted: false,
      reason: 'Not authorized',
    })
    return
  }

  try {
    await setResult(msg.tournamentId, msg.roundNr, msg.boardNr, {
      resultType: msg.resultType,
    })
    service.sendResultAck({ boardNr: msg.boardNr, roundNr: msg.roundNr, accepted: true }, peerId)
    onLog?.({
      timestamp: Date.now(),
      refereeName: msg.refereeName,
      boardNr: msg.boardNr,
      roundNr: msg.roundNr,
      resultType: msg.resultType,
      resultDisplay: msg.resultDisplay,
      accepted: true,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error'
    service.sendResultAck(
      {
        boardNr: msg.boardNr,
        roundNr: msg.roundNr,
        accepted: false,
        reason,
      },
      peerId,
    )
    onLog?.({
      timestamp: Date.now(),
      refereeName: msg.refereeName,
      boardNr: msg.boardNr,
      roundNr: msg.roundNr,
      resultType: msg.resultType,
      resultDisplay: msg.resultDisplay,
      accepted: false,
      reason,
    })
  }
}
