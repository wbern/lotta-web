import { formatPlayerName, type NamePresentation } from '../db/format-name'
import type {
  Chess4StandingsPublishInput,
  ClubStandingsPublishInput,
  CrossTablePublishInput,
  PlayerListPublishInput,
} from '../domain/html-publisher'
import {
  publishAlphabeticalPairings,
  publishChess4Standings,
  publishClubStandings,
  publishCrossTable,
  publishPairings,
  publishPlayerList,
  publishStandings,
} from '../domain/html-publisher'
import { getPlayerRating } from '../domain/ratings'
import { formatScore } from '../domain/scoring'
import {
  buildAlphabeticalPairingsInput,
  buildPairingsInput,
  buildStandingsInput,
} from './publish-data'
import { getDatabaseService } from './service-provider'
import { getChess4Standings, getClubStandings } from './standings'

function htmlBlob(html: string): Blob {
  return new Blob([html], { type: 'text/html; charset=UTF-8' })
}

function resolveRound(tournamentId: number, round?: number): number {
  const db = getDatabaseService()
  const rounds = db.games.listRounds(tournamentId)
  const roundNr = round ?? rounds.length
  if (roundNr < 1 || roundNr > rounds.length) {
    throw new Error('No rounds available')
  }
  return roundNr
}

export async function publishPairingsHtml(tournamentId: number, round?: number): Promise<Blob> {
  const roundNr = resolveRound(tournamentId, round)
  const input = buildPairingsInput(tournamentId, roundNr)
  if (!input) throw new Error(`Tournament ${tournamentId} or round ${roundNr} not found`)
  return htmlBlob(publishPairings(input))
}

interface AlphabeticalPublishOptions {
  groupByClass?: boolean
  columns?: number
  compact?: boolean
}

async function publishAlphabeticalPairingsHtml(
  tournamentId: number,
  round: number | undefined,
  options: AlphabeticalPublishOptions,
): Promise<Blob> {
  const roundNr = resolveRound(tournamentId, round)
  const input = buildAlphabeticalPairingsInput(tournamentId, roundNr)
  if (!input) throw new Error(`Tournament ${tournamentId} or round ${roundNr} not found`)
  return htmlBlob(publishAlphabeticalPairings({ ...input, ...options }))
}

function parseAlphabeticalOptions(query: string): AlphabeticalPublishOptions {
  const params = new URLSearchParams(query)
  const options: AlphabeticalPublishOptions = {}
  const columns = params.get('columns')
  if (columns != null) options.columns = Number(columns)
  const groupByClass = params.get('groupByClass')
  if (groupByClass != null) options.groupByClass = groupByClass === '1'
  const compact = params.get('compact')
  if (compact != null) options.compact = compact === '1'
  return options
}

export async function publishStandingsHtml(tournamentId: number, round?: number): Promise<Blob> {
  const db = getDatabaseService()
  const rounds = db.games.listRounds(tournamentId)
  const roundNr = round ?? rounds.length
  if (roundNr < 1) throw new Error('No rounds available')

  const input = await buildStandingsInput(tournamentId, roundNr)
  if (!input) throw new Error(`Tournament ${tournamentId} not found`)
  return htmlBlob(publishStandings(input))
}

export async function publishPlayerListHtml(tournamentId: number): Promise<Blob> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const settings = db.settings.get()
  const presentation: NamePresentation =
    settings.playerPresentation === 'LAST_FIRST' ? 'LAST_FIRST' : 'FIRST_LAST'

  const players = db.tournamentPlayers.list(tournamentId)

  const input: PlayerListPublishInput = {
    tournamentName: tournament.name,
    players: players.map((p) => ({
      name: formatPlayerName(p.firstName, p.lastName, presentation),
      club: p.club,
      rating: getPlayerRating(p, tournament.ratingChoice),
    })),
  }

  return htmlBlob(publishPlayerList(input))
}

export async function publishClubStandingsHtml(
  tournamentId: number,
  round?: number,
): Promise<Blob> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const rounds = db.games.listRounds(tournamentId)
  const roundNr = round ?? rounds.length
  if (roundNr < 1) throw new Error('No rounds available')

  const standings = await getClubStandings(tournamentId, roundNr)

  const input: ClubStandingsPublishInput = {
    tournamentName: tournament.name,
    roundNr,
    standings: standings.map((s) => ({
      place: s.place,
      club: s.club,
      scoreDisplay: formatScore(s.score),
    })),
  }

  return htmlBlob(publishClubStandings(input))
}

async function publishChess4StandingsHtml(tournamentId: number, round?: number): Promise<Blob> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const rounds = db.games.listRounds(tournamentId)
  const roundNr = round ?? rounds.length
  if (roundNr < 1) throw new Error('No rounds available')

  const standings = await getChess4Standings(tournamentId, roundNr)

  const input: Chess4StandingsPublishInput = {
    tournamentName: tournament.name,
    roundNr,
    standings: standings.map((s) => ({
      place: s.place,
      club: s.club,
      playerCount: s.playerCount,
      chess4Members: s.chess4Members,
      score: s.score,
    })),
  }

  return htmlBlob(publishChess4Standings(input))
}

export async function publishCrossTableHtml(tournamentId: number): Promise<Blob> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const settings = db.settings.get()
  const presentation: NamePresentation =
    settings.playerPresentation === 'LAST_FIRST' ? 'LAST_FIRST' : 'FIRST_LAST'

  const rounds = db.games.listRounds(tournamentId)
  if (rounds.length === 0) throw new Error('No rounds available')

  const players = db.tournamentPlayers.list(tournamentId)

  const crossTablePlayers: CrossTablePublishInput['players'] = players.map((p, i) => {
    const roundEntries: { opponentNr: number | null; color: string }[] = []

    for (const round of rounds) {
      const game = round.games.find((g) => g.whitePlayer?.id === p.id || g.blackPlayer?.id === p.id)

      if (game) {
        if (game.whitePlayer?.id === p.id) {
          const oppIdx = players.findIndex((pl) => pl.id === game.blackPlayer?.id)
          roundEntries.push({
            opponentNr: oppIdx >= 0 ? oppIdx + 1 : null,
            color: 'v',
          })
        } else {
          const oppIdx = players.findIndex((pl) => pl.id === game.whitePlayer?.id)
          roundEntries.push({
            opponentNr: oppIdx >= 0 ? oppIdx + 1 : null,
            color: 's',
          })
        }
      } else {
        roundEntries.push({ opponentNr: null, color: '' })
      }
    }

    // Calculate total score from all rounds
    let totalScore = 0
    for (const round of rounds) {
      for (const g of round.games) {
        if (g.whitePlayer?.id === p.id) totalScore += g.whiteScore
        if (g.blackPlayer?.id === p.id) totalScore += g.blackScore
      }
    }

    return {
      nr: i + 1,
      name: formatPlayerName(p.firstName, p.lastName, presentation),
      rounds: roundEntries,
      totalScore: formatScore(totalScore),
    }
  })

  const input: CrossTablePublishInput = {
    tournamentName: tournament.name,
    roundCount: rounds.length,
    players: crossTablePlayers,
  }

  return htmlBlob(publishCrossTable(input))
}

export async function publishHtml(
  tournamentId: number,
  what: string,
  round?: number,
): Promise<Blob> {
  const [baseName, query = ''] = what.split('?')

  switch (baseName) {
    case 'pairings':
      return publishPairingsHtml(tournamentId, round)
    case 'standings':
      return publishStandingsHtml(tournamentId, round)
    case 'players':
      return publishPlayerListHtml(tournamentId)
    case 'club-standings':
      return publishClubStandingsHtml(tournamentId, round)
    case 'chess4-standings':
      return publishChess4StandingsHtml(tournamentId, round)
    case 'cross-table':
      return publishCrossTableHtml(tournamentId)
    case 'alphabetical':
      return publishAlphabeticalPairingsHtml(tournamentId, round, parseAlphabeticalOptions(query))
    default:
      throw new Error(`Unknown publish type: ${what}`)
  }
}
