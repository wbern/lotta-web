import { formatPlayerName, type NamePresentation } from '../db/format-name'
import { getPlayerRating } from '../domain/ratings'
import type { StandingsGameInfo, StandingsInput } from '../domain/standings'
import {
  calculateChess4Standings,
  calculateClubStandings,
  calculateStandings,
} from '../domain/standings'
import type { Chess4StandingDto, ClubStandingDto, StandingDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService } from './service-provider'

function buildStandingsInput(tournamentId: number, round?: number): StandingsInput {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

  const roundNr = round ?? tournament.roundsPlayed
  if (roundNr === 0) {
    return {
      roundNr: 0,
      pointsPerGame: tournament.pointsPerGame,
      chess4: tournament.chess4,
      compensateWeakPlayerPP: tournament.compensateWeakPlayerPP,
      selectedTiebreaks: tournament.selectedTiebreaks,
      players: [],
      games: [],
    }
  }

  const settings = db.settings.get()
  const presentation: NamePresentation =
    settings.playerPresentation === 'LAST_FIRST' ? 'LAST_FIRST' : 'FIRST_LAST'

  const players = db.tournamentPlayers.list(tournamentId)
  const rounds = db.games.listRounds(tournamentId)

  const allGames: StandingsGameInfo[] = []
  for (const r of rounds) {
    if (r.roundNr > roundNr) continue
    for (const g of r.games) {
      allGames.push({
        roundNr: g.roundNr,
        boardNr: g.boardNr,
        whitePlayerId: g.whitePlayer?.id ?? null,
        blackPlayerId: g.blackPlayer?.id ?? null,
        resultType: g.resultType,
        whiteScore: g.whiteScore,
        blackScore: g.blackScore,
      })
    }
  }

  return {
    roundNr,
    pointsPerGame: tournament.pointsPerGame,
    chess4: tournament.chess4,
    compensateWeakPlayerPP: tournament.compensateWeakPlayerPP,
    selectedTiebreaks: tournament.selectedTiebreaks,
    players: players.map((p) => ({
      id: p.id,
      name: formatPlayerName(p.firstName, p.lastName, presentation),
      playerGroup: p.playerGroup,
      club: p.club,
      clubId: p.clubIndex,
      rating: getPlayerRating(p, tournament.ratingChoice),
      manualTiebreak: p.manualTiebreak,
      lotNr: p.lotNr,
    })),
    games: allGames,
  }
}

export async function getStandingsLocal(
  tournamentId: number,
  round?: number,
): Promise<StandingDto[]> {
  const input = buildStandingsInput(tournamentId, round)
  if (input.roundNr === 0) return []
  return calculateStandings(input)
}

export async function getClubStandingsLocal(
  tournamentId: number,
  round?: number,
): Promise<ClubStandingDto[]> {
  const input = buildStandingsInput(tournamentId, round)
  if (input.roundNr === 0) return []
  return calculateClubStandings(input)
}

export async function getChess4StandingsLocal(
  tournamentId: number,
  round?: number,
): Promise<Chess4StandingDto[]> {
  const input = buildStandingsInput(tournamentId, round)
  if (input.roundNr === 0) return []

  const db = getDatabaseService()
  const clubs = db.clubs.list().map((c) => ({
    name: c.name,
    chess4Members: c.chess4Members,
  }))
  return calculateChess4Standings(input, clubs)
}

export async function getStandings(tournamentId: number, round?: number): Promise<StandingDto[]> {
  return getDataProvider().standings.get(tournamentId, round)
}

export async function getClubStandings(
  tournamentId: number,
  round?: number,
): Promise<ClubStandingDto[]> {
  return getDataProvider().standings.getClub(tournamentId, round)
}

export async function getChess4Standings(
  tournamentId: number,
  round?: number,
): Promise<Chess4StandingDto[]> {
  return getDataProvider().standings.getChess4(tournamentId, round)
}
