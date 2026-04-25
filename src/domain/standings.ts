import type { Chess4StandingDto, ClubStandingDto, ResultType, StandingDto } from '../types/api.ts'
import { formatScore, getActualScores } from './scoring.ts'
import type { TiebreakContext, TiebreakGameInfo } from './tiebreaks.ts'
import {
  tiebreakBerger,
  tiebreakBlacks,
  tiebreakBuchholz,
  tiebreakInternalMeeting,
  tiebreakManual,
  tiebreakMedianBuchholz,
  tiebreakProgressive,
  tiebreakRatingPerformance,
  tiebreakSSFBuchholz,
  tiebreakWins,
} from './tiebreaks.ts'

export interface StandingsPlayerInfo {
  id: number
  name: string
  playerGroup: string
  club: string | null
  clubId: number
  rating: number
  manualTiebreak: number
  lotNr: number
}

export interface StandingsGameInfo {
  roundNr: number
  boardNr: number
  whitePlayerId: number | null
  blackPlayerId: number | null
  resultType: ResultType
  whiteScore: number
  blackScore: number
}

export interface StandingsInput {
  roundNr: number
  pointsPerGame: number
  chess4: boolean
  compensateWeakPlayerPP: boolean
  selectedTiebreaks: string[]
  players: StandingsPlayerInfo[]
  games: StandingsGameInfo[]
}

interface PlayerData {
  info: StandingsPlayerInfo
  games: TiebreakGameInfo[]
  score: number
  tiebreakValues: number[]
}

const TIEBREAK_SHORT_NAMES: Record<string, string> = {
  Berger: 'Berg',
  Buchholz: 'Buch',
  'Median Buchholz': 'M.Buch',
  'SSF Buchholz': 'SSFBuch',
  'Inbördes möte': 'Inb',
  Progressiv: 'Prog',
  Vinster: 'Vin',
  'Prestationsrating LASK': 'Pres',
  'Svarta partier': 'Svart',
  Manuell: 'Man',
}

const INT_FORMAT_TIEBREAKS = new Set([
  'Vinster',
  'Prestationsrating LASK',
  'Svarta partier',
  'Manuell',
])

function buildPlayerGames(
  playerId: number,
  games: StandingsGameInfo[],
  roundNr: number,
  players: Map<number, StandingsPlayerInfo>,
): TiebreakGameInfo[] {
  const result: TiebreakGameInfo[] = []
  for (const g of games) {
    if (g.roundNr > roundNr) continue
    let side: 'white' | 'black'
    let opponentId: number | null
    let isBye: boolean

    if (g.whitePlayerId === playerId) {
      side = 'white'
      opponentId = g.blackPlayerId
      isBye = g.blackPlayerId == null
    } else if (g.blackPlayerId === playerId) {
      side = 'black'
      opponentId = g.whitePlayerId
      isBye = g.whitePlayerId == null
    } else {
      continue
    }

    const opponentInfo = opponentId != null ? players.get(opponentId) : null
    result.push({
      roundNr: g.roundNr,
      side,
      resultType: g.resultType,
      whiteScore: g.whiteScore,
      blackScore: g.blackScore,
      opponentId,
      opponentRating: opponentInfo?.rating ?? 0,
      isBye,
    })
  }
  return result
}

function calculatePlayerScore(playerGames: TiebreakGameInfo[]): number {
  let score = 0
  for (const game of playerGames) {
    const actual = getActualScores(game.resultType, game.whiteScore, game.blackScore, {
      hasWhitePlayer: true,
      hasBlackPlayer: !game.isBye,
    })
    score += game.side === 'white' ? actual.whiteScore : actual.blackScore
  }
  return score
}

function calculateTiebreakValue(
  tbName: string,
  playerData: PlayerData,
  roundNr: number,
  ctx: TiebreakContext,
  allPlayerData: Map<number, PlayerData>,
): number {
  const { games, info } = playerData

  switch (tbName) {
    case 'Berger':
      return tiebreakBerger(games, roundNr, ctx)
    case 'Buchholz':
      return tiebreakBuchholz(games, roundNr, ctx)
    case 'Median Buchholz':
      return tiebreakMedianBuchholz(games, roundNr, ctx)
    case 'SSF Buchholz':
      return tiebreakSSFBuchholz(games, roundNr, ctx)
    case 'Progressiv':
      return tiebreakProgressive(games, roundNr)
    case 'Vinster':
      return tiebreakWins(games, roundNr)
    case 'Svarta partier':
      return tiebreakBlacks(games, roundNr)
    case 'Manuell':
      return tiebreakManual(info.manualTiebreak)
    case 'Prestationsrating LASK':
      return tiebreakRatingPerformance(games, roundNr, playerData.score)
    case 'Inbördes möte': {
      const playerScores: Record<number, number> = {}
      const previousTiebreaks: Record<number, number[]> = {}
      for (const [id, pd] of allPlayerData) {
        playerScores[id] = pd.score
        previousTiebreaks[id] = pd.tiebreakValues
      }
      return tiebreakInternalMeeting(info.id, games, roundNr, playerScores, previousTiebreaks)
    }
    default:
      return 0
  }
}

function comparePlayerData(a: PlayerData, b: PlayerData): number {
  if (a.score !== b.score) return b.score - a.score
  for (let i = 0; i < a.tiebreakValues.length; i++) {
    const av = a.tiebreakValues[i] ?? 0
    const bv = b.tiebreakValues[i] ?? 0
    if (av !== bv) return bv - av
  }
  return 0
}

export function calculateStandings(input: StandingsInput): StandingDto[] {
  const {
    roundNr,
    pointsPerGame,
    chess4,
    compensateWeakPlayerPP,
    selectedTiebreaks,
    players,
    games,
  } = input

  const playerMap = new Map<number, StandingsPlayerInfo>()
  for (const p of players) {
    playerMap.set(p.id, p)
  }

  // Build game data per player
  const allPlayerData = new Map<number, PlayerData>()
  for (const p of players) {
    const playerGames = buildPlayerGames(p.id, games, roundNr, playerMap)
    allPlayerData.set(p.id, {
      info: p,
      games: playerGames,
      score: calculatePlayerScore(playerGames),
      tiebreakValues: [],
    })
  }

  // Build tiebreak context
  const ctx: TiebreakContext = {
    pointsPerGame,
    chess4,
    compensateWeakPlayerPP,
    getPlayerGames: (playerId: number) => allPlayerData.get(playerId)?.games ?? [],
  }

  // Calculate tiebreaks in order (important for internal meeting)
  for (const tbName of selectedTiebreaks) {
    for (const [, pd] of allPlayerData) {
      const value = calculateTiebreakValue(tbName, pd, roundNr, ctx, allPlayerData)
      pd.tiebreakValues.push(value)
    }
  }

  // Sort
  const sorted = [...allPlayerData.values()].sort(comparePlayerData)

  // Assign places and build DTOs
  const standings: StandingDto[] = []
  for (let i = 0; i < sorted.length; i++) {
    const pd = sorted[i]
    let place: number
    if (i > 0 && comparePlayerData(pd, sorted[i - 1]) === 0) {
      place = standings[i - 1].place
    } else {
      place = i + 1
    }

    const tiebreaks: Record<string, string> = {}
    for (let j = 0; j < selectedTiebreaks.length; j++) {
      const tbName = selectedTiebreaks[j]
      const shortName = TIEBREAK_SHORT_NAMES[tbName] ?? tbName
      const value = pd.tiebreakValues[j]
      tiebreaks[shortName] = INT_FORMAT_TIEBREAKS.has(tbName)
        ? Math.floor(value).toString()
        : value.toString()
    }

    standings.push({
      place,
      name: pd.info.name,
      playerGroup: pd.info.playerGroup,
      club: pd.info.club,
      rating: pd.info.rating,
      score: pd.score,
      scoreDisplay: formatScore(pd.score),
      tiebreaks,
    })
  }

  return standings
}

export function calculateClubStandings(input: StandingsInput): ClubStandingDto[] {
  const { roundNr, players, games } = input

  const playerMap = new Map<number, StandingsPlayerInfo>()
  for (const p of players) playerMap.set(p.id, p)

  // Calculate player scores
  const playerScores = new Map<number, number>()
  for (const p of players) {
    const playerGames = buildPlayerGames(p.id, games, roundNr, playerMap)
    playerScores.set(p.id, calculatePlayerScore(playerGames))
  }

  // Aggregate by club
  const clubScores = new Map<string, number>()
  for (const p of players) {
    if (!p.club) continue
    const current = clubScores.get(p.club) ?? 0
    clubScores.set(p.club, current + (playerScores.get(p.id) ?? 0))
  }

  const sorted = [...clubScores.entries()].sort((a, b) => b[1] - a[1])

  const standings: ClubStandingDto[] = []
  for (let i = 0; i < sorted.length; i++) {
    const [club, score] = sorted[i]
    let place: number
    if (i > 0 && score === sorted[i - 1][1]) {
      place = standings[i - 1].place
    } else {
      place = i + 1
    }
    standings.push({ place, club, score })
  }
  return standings
}

interface ClubInfo {
  name: string
  chess4Members: number
}

export function calculateChess4Standings(
  input: StandingsInput,
  clubs: ClubInfo[],
): Chess4StandingDto[] {
  const { roundNr, players, games } = input

  const playerMap = new Map<number, StandingsPlayerInfo>()
  for (const p of players) playerMap.set(p.id, p)

  // Calculate player scores
  const playerScores = new Map<number, number>()
  for (const p of players) {
    const playerGames = buildPlayerGames(p.id, games, roundNr, playerMap)
    playerScores.set(p.id, calculatePlayerScore(playerGames))
  }

  // Build club data
  const clubMap = new Map<string, { playerCount: number; chess4Members: number; points: number }>()
  for (const c of clubs) {
    clubMap.set(c.name, { playerCount: 0, chess4Members: c.chess4Members, points: 0 })
  }

  for (const p of players) {
    if (!p.club) continue
    const clubData = clubMap.get(p.club)
    if (!clubData) continue
    clubData.playerCount++
    clubData.points += playerScores.get(p.id) ?? 0
  }

  const entries = [...clubMap.entries()]
    .filter(([, data]) => data.playerCount > 0)
    .map(([name, data]) => {
      const members = Math.max(10, data.chess4Members)
      const score = Math.round((40 / members) * data.points)
      return { club: name, playerCount: data.playerCount, chess4Members: data.chess4Members, score }
    })

  entries.sort((a, b) => b.score - a.score)

  const standings: Chess4StandingDto[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    let place: number
    if (i > 0 && e.score === entries[i - 1].score) {
      place = standings[i - 1].place
    } else {
      place = i + 1
    }
    standings.push({
      place,
      club: e.club,
      playerCount: e.playerCount,
      chess4Members: e.chess4Members,
      score: e.score,
    })
  }
  return standings
}
