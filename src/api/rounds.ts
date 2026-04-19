import type { PairingPlayerInfo } from '../domain/pairing'
import { preparePairing } from '../domain/pairing'
import { pairBergerRound } from '../domain/pairing-berger'
import type { MonradGameHistory, MonradPlayerInfo } from '../domain/pairing-monrad'
import type { NordicPlayerInfo } from '../domain/pairing-nordic'
import {
  type PairingRequest,
  PairingTimeoutError,
  runPairingWithDeadline,
} from '../domain/pairing-runner'
import { getPlayerRating } from '../domain/ratings'
import type { RoundDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { broadcastAfterPairing } from './p2p-broadcast'
import { getPairingExecutor } from './pairing-executor-provider'
import { getDatabaseService, withSave } from './service-provider'

const PAIRING_TIMEOUT_MS = 10_000

export async function listRoundsLocal(tournamentId: number): Promise<RoundDto[]> {
  return getDatabaseService().games.listRounds(tournamentId)
}

export async function getRoundLocal(tournamentId: number, roundNr: number): Promise<RoundDto> {
  const result = getDatabaseService().games.getRound(tournamentId, roundNr)
  if (!result) throw new Error(`Round ${roundNr} not found`)
  return result
}

function insertGames(
  tournamentId: number,
  roundNr: number,
  games: { whitePlayerId: number | null; blackPlayerId: number | null }[],
  lotNrMap: Map<number, number>,
): void {
  const db = getDatabaseService()
  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    db.games.insertGame(
      tournamentId,
      roundNr,
      i + 1, // boardNr is 1-indexed
      g.whitePlayerId,
      g.blackPlayerId,
      g.whitePlayerId != null ? (lotNrMap.get(g.whitePlayerId) ?? 0) : 0,
      g.blackPlayerId != null ? (lotNrMap.get(g.blackPlayerId) ?? 0) : 0,
    )
  }
}

function assignLotNumbers(players: PairingPlayerInfo[], initialPairing: string): void {
  // Sort by rating descending
  players.sort((a, b) => b.rating - a.rating)

  if (initialPairing === 'Slumpad' || initialPairing === 'Random') {
    for (const p of players) {
      p.lotNr = Math.floor(Math.random() * 1000000000)
    }
  } else {
    for (let i = 0; i < players.length; i++) {
      players[i].lotNr = i + 1
    }
  }
}

function sortByScoreAndLotNr(players: PairingPlayerInfo[]): void {
  // For Berger: sort by score (descending), then lotNr (ascending)
  // Since we don't track score in PairingPlayerInfo, we assume lotNr order
  // is the initial order (players already have lotNr assigned)
  players.sort((a, b) => {
    if (a.lotNr !== b.lotNr) return a.lotNr - b.lotNr
    return 0
  })
}

// Reads tournament state, awaits pairing (up to PAIRING_TIMEOUT_MS), then writes.
// Safe because pairing is triggered by a single TD per client; there's no local
// UI path to mutate the tournament mid-await. P2P replication only applies
// inbound changes between explicit user actions, not during this function.
export async function pairNextRoundLocal(tournamentId: number): Promise<RoundDto> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const players = db.tournamentPlayers.list(tournamentId)
  const rounds = db.games.listRounds(tournamentId)
  const roundsPlayed = rounds.length
  const nextRoundNr = roundsPlayed + 1

  const allResultsEntered = rounds.every((r) => r.hasAllResults)

  const pairingPlayers: PairingPlayerInfo[] = players.map((p) => ({
    id: p.id,
    rating: getPlayerRating(p, tournament.ratingChoice),
    withdrawnFromRound: p.withdrawnFromRound,
    lotNr: p.lotNr,
  }))

  // Berger is a deterministic round-robin; keep the legacy synchronous path.
  if (tournament.pairingSystem === 'Berger') {
    const result = await withSave(
      () => pairBerger(tournamentId, tournament, pairingPlayers, roundsPlayed),
      'Lotta rond',
      (r) => `Rond ${r.roundNr}`,
    )
    void broadcastAfterPairing(tournamentId, result.roundNr).catch((e) =>
      console.warn('P2P broadcast failed after pairing:', e),
    )
    return result
  }

  const activePlayers = preparePairing({
    nrOfRounds: tournament.nrOfRounds,
    roundsPlayed,
    nextRoundNr,
    initialPairing: tournament.initialPairing,
    allResultsEntered,
    players: pairingPlayers,
  })

  // Monrad round 2+: restore lot numbers from the previous round's game
  // records rather than re-assigning by rating. NordicSchweizer always
  // re-initializes (rating-based) regardless of round.
  if (roundsPlayed > 0 && tournament.pairingSystem === 'Monrad') {
    activePlayers.sort((a, b) => b.rating - a.rating)
    restoreLotNrsFromRound(activePlayers, rounds[rounds.length - 1])
  } else {
    assignLotNumbers(activePlayers, tournament.initialPairing)
  }

  const playerScores = buildPlayerScores(activePlayers, rounds)
  activePlayers.sort((a, b) => {
    const scoreA = playerScores.get(a.id) ?? 0
    const scoreB = playerScores.get(b.id) ?? 0
    if (scoreA !== scoreB) return scoreB - scoreA
    return a.lotNr - b.lotNr
  })
  for (let i = 0; i < activePlayers.length; i++) {
    activePlayers[i].lotNr = i + 1
  }

  // Capture lotNrs for DB storage BEFORE bye removal: stored lotNrs
  // must reflect the pre-removal state so subsequent rounds can restore
  // the correct order.
  const lotNrMap = new Map<number, number>()
  for (const p of activePlayers) {
    lotNrMap.set(p.id, p.lotNr)
  }

  let bye: PairingPlayerInfo | null = null
  if (activePlayers.length % 2 === 1) {
    bye = findByePlayer(activePlayers, rounds)
    if (bye) {
      const idx = activePlayers.indexOf(bye)
      activePlayers.splice(idx, 1)
      for (let i = 0; i < activePlayers.length; i++) {
        activePlayers[i].lotNr = i + 1
      }
    }
  }

  const history = buildGameHistory(rounds)
  const isNordic =
    tournament.pairingSystem === 'Nordisk Schweizer' ||
    tournament.pairingSystem === 'Nordic Schweizer'

  const req: PairingRequest = isNordic
    ? {
        kind: 'nordic',
        args: {
          players: activePlayers.map<NordicPlayerInfo>((p) => ({
            id: p.id,
            lotNr: p.lotNr,
            clubId: players.find((pl) => pl.id === p.id)?.clubIndex ?? 0,
            score: playerScores.get(p.id) ?? 0,
          })),
          history,
          barredPairing: tournament.barredPairing,
          roundsPlayed,
        },
      }
    : {
        kind: 'monrad',
        args: {
          players: activePlayers.map<MonradPlayerInfo>((p) => ({
            id: p.id,
            lotNr: p.lotNr,
            clubId: players.find((pl) => pl.id === p.id)?.clubIndex ?? 0,
          })),
          history,
          barredPairing: tournament.barredPairing,
        },
      }

  let games: { whitePlayerId: number | null; blackPlayerId: number | null }[] | null
  try {
    const result = await runPairingWithDeadline(getPairingExecutor(), req, PAIRING_TIMEOUT_MS)
    games = result.games
  } catch (err) {
    if (err instanceof PairingTimeoutError) {
      throw new Error(
        'Det gick inte att lotta rundan i tid. Försök igen eller kontakta support om problemet kvarstår.',
      )
    }
    throw err
  }

  if (!games) {
    throw new Error('Kan inte lotta. Inga giltiga lottningar finns.')
  }

  const allGames = [...games]
  if (bye) {
    allGames.push({ whitePlayerId: bye.id, blackPlayerId: null })
  }

  const result = await withSave(
    () => {
      insertGames(tournamentId, nextRoundNr, allGames, lotNrMap)
      if (bye) {
        db.games.setResult(tournamentId, nextRoundNr, allGames.length, {
          resultType: 'WHITE_WIN_WO',
        })
      }
      return db.games.getRound(tournamentId, nextRoundNr)!
    },
    'Lotta rond',
    (r) => `Rond ${r.roundNr}`,
  )

  void broadcastAfterPairing(tournamentId, result.roundNr).catch((e) =>
    console.warn('P2P broadcast failed after pairing:', e),
  )
  return result
}

/**
 * Restore lot numbers from the previous round's game records. Reads the
 * lotNr stored at pairing time. Players not found in the round (e.g. newly
 * un-withdrawn) get MAX_VALUE so they sort to the end.
 */
function restoreLotNrsFromRound(players: PairingPlayerInfo[], round: RoundDto): void {
  for (const p of players) {
    let found = false
    for (const g of round.games) {
      if (g.whitePlayer?.id === p.id) {
        p.lotNr = g.whitePlayer.lotNr
        found = true
        break
      }
      if (g.blackPlayer?.id === p.id) {
        p.lotNr = g.blackPlayer.lotNr
        found = true
        break
      }
    }
    if (!found) {
      p.lotNr = 2147483647
    }
  }
}

/**
 * From the end of the score+lotNr-sorted list, pick the first player
 * who has NOT already had a bye.
 */
function findByePlayer(
  sortedPlayers: PairingPlayerInfo[],
  rounds: RoundDto[],
): PairingPlayerInfo | null {
  const hadBye = new Set<number>()
  for (const round of rounds) {
    for (const g of round.games) {
      if (g.whitePlayer && !g.blackPlayer) {
        hadBye.add(g.whitePlayer.id)
      }
      if (g.blackPlayer && !g.whitePlayer) {
        hadBye.add(g.blackPlayer.id)
      }
    }
  }

  for (let i = sortedPlayers.length - 1; i >= 0; i--) {
    if (!hadBye.has(sortedPlayers[i].id)) {
      return sortedPlayers[i]
    }
  }

  return null
}

function buildPlayerScores(players: PairingPlayerInfo[], rounds: RoundDto[]): Map<number, number> {
  const scores = new Map<number, number>()
  for (const p of players) scores.set(p.id, 0)

  for (const round of rounds) {
    for (const g of round.games) {
      if (g.whitePlayer) {
        scores.set(g.whitePlayer.id, (scores.get(g.whitePlayer.id) ?? 0) + g.whiteScore)
      }
      if (g.blackPlayer) {
        scores.set(g.blackPlayer.id, (scores.get(g.blackPlayer.id) ?? 0) + g.blackScore)
      }
    }
  }
  return scores
}

function buildGameHistory(rounds: RoundDto[]): MonradGameHistory {
  const meetings = new Set<string>()
  const whiteCounts = new Map<number, number>()

  for (const round of rounds) {
    for (const g of round.games) {
      const wId = g.whitePlayer?.id
      const bId = g.blackPlayer?.id

      if (wId != null && bId != null) {
        const key = wId < bId ? `${wId}-${bId}` : `${bId}-${wId}`
        meetings.add(key)
      }

      if (wId != null) {
        whiteCounts.set(wId, (whiteCounts.get(wId) ?? 0) + 1)
      }
    }
  }

  return { meetings, whiteCounts }
}

interface TournamentInfo {
  nrOfRounds: number
  initialPairing: string
}

function pairBerger(
  tournamentId: number,
  tournament: TournamentInfo,
  players: PairingPlayerInfo[],
  roundsPlayed: number,
): RoundDto {
  const db = getDatabaseService()

  if (roundsPlayed > 0) {
    throw new Error('Det finns redan lottade ronder! Berger lottar alla ronder i ett svep!')
  }

  // Filter withdrawn (for first round, nobody should be withdrawn, but check anyway)
  const activePlayers = players.filter(
    (p) => p.withdrawnFromRound === -1 || 1 < p.withdrawnFromRound,
  )

  if (activePlayers.length < 2) {
    throw new Error('Lägg till några spelare först!')
  }

  // Berger requires nrOfRounds >= players.size() - 1
  const minRounds = activePlayers.length - 1
  if (tournament.nrOfRounds < minRounds) {
    throw new Error(
      `För att lotta en Berger-turnering med ${activePlayers.length} spelare krävs minst ${minRounds} ronder.`,
    )
  }

  // Assign lot numbers
  assignLotNumbers(activePlayers, tournament.initialPairing)
  sortByScoreAndLotNr(activePlayers)

  // Build lotNr map for DB storage
  const lotNrMap = new Map<number, number>()
  for (const p of activePlayers) {
    lotNrMap.set(p.id, p.lotNr)
  }

  // Build player ID list (add null for bye if odd)
  const playerIds: (number | null)[] = activePlayers.map((p) => p.id)
  if (playerIds.length % 2 === 1) {
    playerIds.push(null)
  }

  // Generate all rounds
  const hasBye = playerIds.includes(null)
  for (let roundNr = 1; roundNr <= tournament.nrOfRounds; roundNr++) {
    const games = pairBergerRound(playerIds, roundNr)
    insertGames(tournamentId, roundNr, games, lotNrMap)

    // Auto-set bye game result to WHITE_WIN_WO
    if (hasBye) {
      const byeGame = games.findIndex((g) => g.blackPlayerId === null)
      if (byeGame !== -1) {
        db.games.setResult(tournamentId, roundNr, byeGame + 1, {
          resultType: 'WHITE_WIN_WO',
        })
      }
    }
  }

  return db.games.getRound(tournamentId, 1)!
}

export async function unpairLastRoundLocal(tournamentId: number): Promise<void> {
  const db = getDatabaseService()
  const rounds = db.games.listRounds(tournamentId)
  const lastRoundNr = rounds.length > 0 ? rounds[rounds.length - 1].roundNr : 0
  return withSave(
    () => {
      const tournament = db.tournaments.get(tournamentId)
      if (rounds.length === 0) throw new Error('No rounds to unpair')

      if (tournament?.pairingSystem === 'Berger') {
        // Berger: remove all rounds
        for (const r of rounds) {
          db.games.unpairRound(tournamentId, r.roundNr)
        }
      } else {
        db.games.unpairRound(tournamentId, lastRoundNr)
      }
    },
    'Ångra lottning',
    `Rond ${lastRoundNr}`,
  )
}

export async function listRounds(tournamentId: number): Promise<RoundDto[]> {
  return getDataProvider().rounds.list(tournamentId)
}

export async function getRound(tournamentId: number, roundNr: number): Promise<RoundDto> {
  return getDataProvider().rounds.get(tournamentId, roundNr)
}

export async function pairNextRound(tournamentId: number): Promise<RoundDto> {
  return getDataProvider().rounds.pairNext(tournamentId)
}

export async function unpairLastRound(tournamentId: number): Promise<void> {
  return getDataProvider().rounds.unpairLast(tournamentId)
}
