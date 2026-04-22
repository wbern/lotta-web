import type { PairingsPublishInput, StandingsPublishInput } from '../domain/html-publisher.ts'
import {
  publishPairings,
  publishRefereePairings,
  publishStandings,
} from '../domain/html-publisher.ts'
import { getP2PService } from '../services/p2p-provider.ts'
import type { AuditLogEntry, PageUpdateMessage, ResultSubmitMessage } from '../types/p2p.ts'
import { buildPairingsInput, buildStandingsInput } from './publish-data.ts'
import { setResult } from './results.ts'

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
  tournamentName: string,
  roundNr: number,
  html: string,
): PageUpdateMessage {
  return { pageType, tournamentName, roundNr, html, timestamp: Date.now() }
}

function broadcastPairings(input: PairingsPublishInput): void {
  if (!isP2PActive()) return
  const html = publishPairings(input)
  getP2PService().broadcastPageUpdate(
    buildMessage('pairings', input.tournamentName, input.roundNr, html),
  )
}

function broadcastStandings(input: StandingsPublishInput): void {
  if (!isP2PActive()) return
  const html = publishStandings(input)
  getP2PService().broadcastPageUpdate(
    buildMessage('standings', input.tournamentName, input.roundNr, html),
  )
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
    buildMessage('refereePairings', input.tournamentName, roundNr, html),
  )
}

/** Broadcast pairings and standings after a result is entered/changed. */
export async function broadcastAfterResultChange(
  tournamentId: number,
  roundNr: number,
): Promise<void> {
  if (!isP2PActive()) return

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) broadcastPairings(pairingsInput)

  broadcastRefereePairings(tournamentId, roundNr)

  const standingsInput = await buildStandingsInput(tournamentId, roundNr)
  if (standingsInput) broadcastStandings(standingsInput)
}

/** Broadcast pairings after a new round is paired. */
export async function broadcastAfterPairing(tournamentId: number, roundNr: number): Promise<void> {
  if (!isP2PActive()) return

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) broadcastPairings(pairingsInput)

  broadcastRefereePairings(tournamentId, roundNr)
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

  const pairingsInput = buildPairingsInput(tournamentId, roundNr)
  if (pairingsInput) {
    const html = publishPairings(pairingsInput)
    service.sendPageUpdateTo(
      buildMessage('pairings', pairingsInput.tournamentName, roundNr, html),
      peerId,
    )
  }

  // Send referee pairings for late-joining referees
  if (pairingsInput) {
    const refHtml = publishRefereePairings({ ...pairingsInput, tournamentId })
    service.sendPageUpdateTo(
      buildMessage('refereePairings', pairingsInput.tournamentName, roundNr, refHtml),
      peerId,
    )
  }

  const standingsInput = await buildStandingsInput(tournamentId, roundNr)
  if (standingsInput) {
    const html = publishStandings(standingsInput)
    service.sendPageUpdateTo(
      buildMessage('standings', standingsInput.tournamentName, roundNr, html),
      peerId,
    )
  }
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
