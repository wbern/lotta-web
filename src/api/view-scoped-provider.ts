import { CLUBLESS_KEY } from '../domain/club-filter'
import type { GameDto, PlayerSummaryDto, RoundDto } from '../types/api'
import type { DataProvider } from './data-provider'

function isPlayerInClubs(player: PlayerSummaryDto | null, clubSet: Set<string>): boolean {
  if (!player) return false
  if (player.club != null) return clubSet.has(player.club)
  return clubSet.has(CLUBLESS_KEY)
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
  return {
    ...base,
    tournamentPlayers: {
      ...base.tournamentPlayers,
      list: async (tournamentId) => {
        if (authorizedClubs.length === 0) return []
        const players = await base.tournamentPlayers.list(tournamentId)
        return players.filter((p) => p.club != null && clubSet.has(p.club))
      },
    },
    rounds: {
      ...base.rounds,
      get: async (tournamentId, roundNr) => {
        const round = await base.rounds.get(tournamentId, roundNr)
        return scopeRound(round, authorizedClubs)
      },
    },
  }
}
