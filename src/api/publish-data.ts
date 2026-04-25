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

  for (const game of roundData.games) {
    const addRow = (selfId: number, opponentId: number | null, selfColor: 'V' | 'S') => {
      const self = playerById.get(selfId)
      if (!self) return
      const opponent = opponentId != null ? playerById.get(opponentId) : undefined
      const row: PlayerRow = {
        firstName: self.firstName,
        lastName: self.lastName,
        boardNr: game.boardNr,
        color: selfColor,
        opponent: opponent
          ? {
              firstName: opponent.firstName,
              lastName: opponent.lastName,
              color: selfColor === 'V' ? 'S' : 'V',
            }
          : null,
      }
      // The checkbox is labeled "Gruppera per klubb på egen sida" in both modes,
      // so group by club. Non-chess4 tournaments previously grouped by
      // playerGroup, which collapsed to a single section whenever all players
      // shared the same group — making the checkbox look broken.
      const group = self.club ?? ''
      const list = byGroup.get(group) ?? []
      list.push(row)
      byGroup.set(group, list)
    }

    if (game.whitePlayer) addRow(game.whitePlayer.id, game.blackPlayer?.id ?? null, 'V')
    if (game.blackPlayer) addRow(game.blackPlayer.id, game.whitePlayer?.id ?? null, 'S')
  }

  const classes = Array.from(byGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'sv'))
    .map(([className, rows]) => ({
      className,
      players: rows.sort(
        (a, b) =>
          a.firstName.localeCompare(b.firstName, 'sv') ||
          a.lastName.localeCompare(b.lastName, 'sv'),
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
