import { CLUBLESS_KEY } from '../domain/club-filter'
import type {
  Chess4StandingDto,
  ClubDto,
  ClubStandingDto,
  GameDto,
  PlayerSummaryDto,
  RoundDto,
  StandingDto,
} from '../types/api'
import type { DataProvider } from './data-provider'

function isPlayerInClubs(player: PlayerSummaryDto | null, clubSet: Set<string>): boolean {
  if (!player) return false
  if (player.club != null) return clubSet.has(player.club)
  return clubSet.has(CLUBLESS_KEY)
}

function isClubAuthorized(club: string | null, clubSet: Set<string>): boolean {
  if (club == null) return clubSet.has(CLUBLESS_KEY)
  return clubSet.has(club)
}

function redactPlayer(player: PlayerSummaryDto | null): PlayerSummaryDto | null {
  if (!player) return null
  return {
    ...player,
    name: player.name.split(' ')[0],
    club: null,
  }
}

function scopeRound(round: RoundDto, authorizedClubs: string[]): RoundDto {
  if (authorizedClubs.length === 0) return { ...round, gameCount: 0, games: [] }
  const clubSet = new Set(authorizedClubs)
  const games: GameDto[] = round.games
    .filter(
      (g) => isPlayerInClubs(g.whitePlayer, clubSet) || isPlayerInClubs(g.blackPlayer, clubSet),
    )
    .map((g) => ({
      ...g,
      whitePlayer: isPlayerInClubs(g.whitePlayer, clubSet)
        ? g.whitePlayer
        : redactPlayer(g.whitePlayer),
      blackPlayer: isPlayerInClubs(g.blackPlayer, clubSet)
        ? g.blackPlayer
        : redactPlayer(g.blackPlayer),
    }))
  return { ...round, gameCount: games.length, games }
}

export function createViewScopedProvider(
  base: DataProvider,
  authorizedClubs: string[],
): DataProvider {
  const clubSet = new Set(authorizedClubs)
  const empty = authorizedClubs.length === 0
  return {
    ...base,
    tournamentPlayers: {
      ...base.tournamentPlayers,
      list: async (tournamentId) => {
        if (empty) return []
        const players = await base.tournamentPlayers.list(tournamentId)
        return players.filter((p) => p.club != null && clubSet.has(p.club))
      },
    },
    rounds: {
      ...base.rounds,
      list: async (tournamentId) => {
        const rounds = await base.rounds.list(tournamentId)
        return rounds.map((r) => scopeRound(r, authorizedClubs))
      },
      get: async (tournamentId, roundNr) => {
        const round = await base.rounds.get(tournamentId, roundNr)
        return scopeRound(round, authorizedClubs)
      },
    },
    standings: {
      ...base.standings,
      get: async (tournamentId, round) => {
        if (empty) return []
        const rows = await base.standings.get(tournamentId, round)
        return rows.filter((r: StandingDto) => isClubAuthorized(r.club, clubSet))
      },
      getClub: async (tournamentId, round) => {
        if (empty) return []
        const rows = await base.standings.getClub(tournamentId, round)
        return rows.filter((r: ClubStandingDto) => clubSet.has(r.club))
      },
      getChess4: async (tournamentId, round) => {
        if (empty) return []
        const rows = await base.standings.getChess4(tournamentId, round)
        return rows.filter((r: Chess4StandingDto) => clubSet.has(r.club))
      },
    },
    clubs: {
      ...base.clubs,
      list: async () => {
        if (empty) return []
        const clubs = await base.clubs.list()
        return clubs.filter((c: ClubDto) => clubSet.has(c.name))
      },
    },
  }
}
