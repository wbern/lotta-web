import type { AvailablePlayerRepository } from '../db/repositories/available-players'
import type { ClubRepository } from '../db/repositories/clubs'
import type { ClubDto, PlayerDto } from '../types/api'
import { getDatabaseService, withSave } from './service-provider'

const SWEDISH_FIRST_NAMES = [
  'Erik',
  'Lars',
  'Karl',
  'Anders',
  'Johan',
  'Per',
  'Nils',
  'Lennart',
  'Emil',
  'Hans',
  'Olof',
  'Gunnar',
  'Sven',
  'Fredrik',
  'Magnus',
  'Gustav',
  'Axel',
  'Oscar',
  'Viktor',
  'Henrik',
  'Anna',
  'Maria',
  'Karin',
  'Eva',
  'Sara',
  'Kristina',
  'Ingrid',
  'Elisabeth',
  'Elin',
  'Sofia',
  'Astrid',
  'Margareta',
  'Linnea',
  'Hanna',
  'Clara',
  'Johanna',
  'Maja',
  'Frida',
  'Lena',
  'Birgitta',
]

const SWEDISH_LAST_NAMES = [
  'Andersson',
  'Johansson',
  'Karlsson',
  'Nilsson',
  'Eriksson',
  'Larsson',
  'Olsson',
  'Persson',
  'Svensson',
  'Gustafsson',
  'Pettersson',
  'Jonsson',
  'Jansson',
  'Hansson',
  'Bengtsson',
  'Jönsson',
  'Lindberg',
  'Jakobsson',
  'Magnusson',
  'Lindström',
  'Lindqvist',
  'Lindgren',
  'Berglund',
  'Fredriksson',
  'Sandberg',
  'Henriksson',
  'Forsberg',
  'Sjöberg',
  'Wallin',
  'Engström',
  'Eklund',
  'Danielsson',
  'Lundgren',
  'Håkansson',
  'Bergström',
  'Fransson',
  'Nyström',
  'Holmberg',
  'Arvidsson',
  'Löfgren',
]

const SWEDISH_CLUB_PREFIXES = ['SK', 'SS', 'SF', 'Schack', 'KSS', 'MSS']

const SWEDISH_CLUB_NAMES = [
  'Rockaden',
  'Tornet',
  'Springaren',
  'Damen',
  'Kungen',
  'Centrala',
  'Bonden',
  'Löparen',
  'Gambit',
  'Caissa',
  'Passanten',
  'Schacklaget',
  'Nordvästra',
  'Södra',
  'Västra',
  'Östra',
]

const SWEDISH_CITY_NAMES = [
  'Stockholm',
  'Göteborg',
  'Malmö',
  'Uppsala',
  'Linköping',
  'Örebro',
  'Västerås',
  'Helsingborg',
  'Norrköping',
  'Lund',
  'Umeå',
  'Jönköping',
  'Gävle',
  'Borås',
  'Sundsvall',
  'Eskilstuna',
  'Karlstad',
  'Växjö',
  'Halmstad',
  'Trollhättan',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const MAX_CLUB_COMBINATIONS =
  SWEDISH_CLUB_PREFIXES.length * SWEDISH_CLUB_NAMES.length * SWEDISH_CITY_NAMES.length

export function generateClubNames(count: number): string[] {
  const capped = Math.min(count, MAX_CLUB_COMBINATIONS)
  const names = new Set<string>()
  while (names.size < capped) {
    const prefix = pickRandom(SWEDISH_CLUB_PREFIXES)
    const name = pickRandom(SWEDISH_CLUB_NAMES)
    const city = pickRandom(SWEDISH_CITY_NAMES)
    names.add(`${prefix} ${name} ${city}`)
  }
  return [...names]
}

export function seedFakeClubs(count: number, clubRepo: ClubRepository): ClubDto[] {
  const names = generateClubNames(count)
  return names.map((name) => clubRepo.create({ name }))
}

function randomRating(): number {
  // Generate ratings roughly between 1200-2400 with a normal-ish distribution
  const base = 1200
  const range = 1200
  // Sum of 3 uniform randoms approximates normal distribution
  const r = (Math.random() + Math.random() + Math.random()) / 3
  return Math.round(base + r * range)
}

function generateFakePlayer(
  clubIndex: number,
  firstName: string,
  lastName: string,
): Partial<PlayerDto> {
  const rating = randomRating()
  return {
    firstName,
    lastName,
    clubIndex,
    ratingN: rating,
    ratingI: 0,
    ratingQ: 0,
    ratingB: 0,
    ratingK: 0,
    ratingKQ: 0,
    ratingKB: 0,
    title: '',
    sex: null,
    federation: 'SWE',
    fideId: 0,
    ssfId: 0,
    playerGroup: '',
  }
}

const MAX_UNIQUE_NAMES = SWEDISH_FIRST_NAMES.length * SWEDISH_LAST_NAMES.length

function generateUniqueNames(count: number): Array<{ firstName: string; lastName: string }> {
  // The DB has UNIQUE(lastname, firstname, clubindex); pre-dedup to avoid INSERT conflicts.
  const keys = new Set<string>()
  const names: Array<{ firstName: string; lastName: string }> = []
  while (names.length < count) {
    const firstName = pickRandom(SWEDISH_FIRST_NAMES)
    const lastName = pickRandom(SWEDISH_LAST_NAMES)
    const key = `${firstName}|${lastName}`
    if (keys.has(key)) continue
    keys.add(key)
    names.push({ firstName, lastName })
  }
  return names
}

export function generateFakePlayers(
  count: number,
  clubIds: number[],
  playerRepo: AvailablePlayerRepository,
): PlayerDto[] {
  const capped = Math.min(count, MAX_UNIQUE_NAMES)
  const names = generateUniqueNames(capped)
  const players: PlayerDto[] = []
  for (let i = 0; i < capped; i++) {
    const clubIndex = clubIds.length > 0 ? clubIds[i % clubIds.length] : 0
    const { firstName, lastName } = names[i]
    players.push(playerRepo.create(generateFakePlayer(clubIndex, firstName, lastName)))
  }
  return players
}

interface SeedResult {
  players: PlayerDto[]
  clubs: ClubDto[]
}

export async function seedFakePlayers(
  count: number,
  options: { clubCount?: number } = {},
): Promise<SeedResult> {
  return withSave(
    () => {
      const db = getDatabaseService()
      let clubs: ClubDto[] = []
      let clubIds: number[] = []
      if (options.clubCount && options.clubCount > 0) {
        clubs = seedFakeClubs(options.clubCount, db.clubs)
        clubIds = clubs.map((c) => c.id)
      }
      const players = generateFakePlayers(count, clubIds, db.availablePlayers)
      return { players, clubs }
    },
    'Skapa testspelare',
    (r) => `${r.players.length} spelare, ${r.clubs.length} klubbar`,
  )
}
