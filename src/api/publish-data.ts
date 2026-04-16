import type {
  AlphabeticalPairingsPublishInput,
  PairingsPublishInput,
  StandingsPublishInput,
} from '../domain/html-publisher'
import { getDatabaseService } from './service-provider'
import { getStandings } from './standings'

/** Build pairings input from DB. Returns null if tournament or round not found. */
export function buildPairingsInput(
  tournamentId: number,
  roundNr: number,
): PairingsPublishInput | null {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) return null

  const roundData = db.games.getRound(tournamentId, roundNr)
  if (!roundData) return null

  return {
    tournamentName: tournament.name,
    roundNr,
    games: roundData.games.map((g) => ({
      boardNr: g.boardNr,
      whiteName: g.whitePlayer?.name ?? null,
      blackName: g.blackPlayer?.name ?? null,
      resultDisplay: g.resultDisplay,
      currentResult: g.resultType !== 'NO_RESULT' ? g.resultType : undefined,
    })),
  }
}

/** Build alphabetical pairings input from DB. Returns null if tournament or round not found. */
export function buildAlphabeticalPairingsInput(
  tournamentId: number,
  roundNr: number,
): AlphabeticalPairingsPublishInput | null {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) return null

  const roundData = db.games.getRound(tournamentId, roundNr)
  if (!roundData) return null

  const players = db.tournamentPlayers.list(tournamentId)
  const playerById = new Map(players.map((p) => [p.id, p]))

  type PlayerRow = AlphabeticalPairingsPublishInput['classes'][number]['players'][number]
  const byGroup = new Map<string, PlayerRow[]>()

  // Lot numbers live on the game record (assigned at pairing time), not on the
  // tournament player record — player.lotNr is always the 2147483647 sentinel.
  for (const game of roundData.games) {
    const addRow = (
      selfSummary: { id: number; lotNr: number },
      opponentSummary: { id: number; lotNr: number } | null,
      selfColor: 'V' | 'S',
    ) => {
      const self = playerById.get(selfSummary.id)
      if (!self) return
      const opponent = opponentSummary ? playerById.get(opponentSummary.id) : undefined
      const row: PlayerRow = {
        firstName: self.firstName,
        lastName: self.lastName,
        lotNr: selfSummary.lotNr,
        color: selfColor,
        opponent:
          opponent && opponentSummary
            ? {
                firstName: opponent.firstName,
                lastName: opponent.lastName,
                lotNr: opponentSummary.lotNr,
                color: selfColor === 'V' ? 'S' : 'V',
              }
            : null,
      }
      const group = tournament.chess4 ? (self.club ?? '') : (self.playerGroup ?? '')
      const list = byGroup.get(group) ?? []
      list.push(row)
      byGroup.set(group, list)
    }

    if (game.whitePlayer) addRow(game.whitePlayer, game.blackPlayer, 'V')
    if (game.blackPlayer) addRow(game.blackPlayer, game.whitePlayer, 'S')
  }

  const classes = Array.from(byGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'sv'))
    .map(([className, rows]) => ({
      className,
      players: rows.sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'sv') ||
          a.firstName.localeCompare(b.firstName, 'sv'),
      ),
    }))

  return {
    tournamentName: tournament.name,
    roundNr,
    classes,
  }
}

/** Build standings input from DB. Returns null if tournament not found. */
export async function buildStandingsInput(
  tournamentId: number,
  roundNr: number,
): Promise<StandingsPublishInput | null> {
  const db = getDatabaseService()
  const tournament = db.tournaments.get(tournamentId)
  if (!tournament) return null

  const standings = await getStandings(tournamentId, roundNr)

  return {
    tournamentName: tournament.name,
    roundNr,
    showELO: tournament.showELO,
    tiebreakNames: tournament.selectedTiebreaks,
    standings: standings.map((s) => ({
      place: s.place,
      name: s.name,
      club: s.club,
      rating: s.rating,
      scoreDisplay: s.scoreDisplay,
      tiebreaks: s.tiebreaks,
    })),
  }
}
