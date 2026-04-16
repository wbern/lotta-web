import {
  type ApiClient,
  apiClient,
  createTournament,
  ensureClubs,
  fetchChess4Standings,
  HIGHER_RATED_WINS,
  type PlayerInput,
  pairRound,
  setResults,
  setResultsFromScript,
  waitForApi,
} from './api-helpers'
import {
  CHESS4_GAME_SCORING,
  CHESS4_PUBLISH_HTML,
  CHESS4_STANDINGS_BY_ROUND,
  CHESS4_STANDINGS_FINAL,
} from './chess4-snapshots'
import { expect, test } from './fixtures'

const CLUBS = [
  { name: 'SK Alfa', chess4Members: 12 },
  { name: 'SK Beta', chess4Members: 8 },
  { name: 'SK Gamma', chess4Members: 15 },
  { name: 'SK Delta', chess4Members: 10 },
]

// 8 players, 2 per club
const BASE_PLAYERS: PlayerInput[] = [
  { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100 },
  { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950 },
  { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800 },
  { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750 },
  { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600 },
  { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500 },
  { lastName: 'Stjärnljus', firstName: 'Freja', ratingI: 1400 },
  { lastName: 'Nattskärm', firstName: 'Sigrid', ratingI: 1300 },
]

const CHESS4_OPTS = {
  name: 'Chess4-rr',
  pairingSystem: 'Monrad',
  nrOfRounds: 4,
  chess4: true,
  pointsPerGame: 4,
} as const

async function createChess4Players($: ApiClient) {
  const clubIds = await ensureClubs($, CLUBS)
  return BASE_PLAYERS.map((p, i) => ({
    ...p,
    clubIndex: clubIds[Math.floor(i / 2)],
  }))
}

test.describe('Chess4 mode', () => {
  test('Chess4 game scoring (WIN=3-1, DRAW=2-2)', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    const players = await createChess4Players($)

    const { tid } = await createTournament(
      $,
      {
        ...CHESS4_OPTS,
        name: 'Chess4-scoring',
      },
      players,
    )

    // Round 1: mix of wins and draws to verify scoring
    const r1 = await pairRound($, tid)
    expect(r1.roundNr).toBe(1)
    await setResultsFromScript($, tid, 1, r1.games, {
      1: 'WHITE_WIN',
      2: 'BLACK_WIN',
      3: 'DRAW',
      4: 'WHITE_WIN',
    })

    const round1 = await $.get(`/api/tournaments/${tid}/rounds/1`)
    const gameSummaries = round1.games.map((g: any) => ({
      boardNr: g.boardNr,
      resultType: g.resultType,
      whiteScore: g.whiteScore,
      blackScore: g.blackScore,
    }))
    expect(gameSummaries).toEqual(CHESS4_GAME_SCORING)
  })

  test('Chess4 standings final round', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    const players = await createChess4Players($)

    const { tid } = await createTournament(
      $,
      {
        ...CHESS4_OPTS,
        group: 'Snapshot final',
      },
      players,
    )

    for (let r = 1; r <= 4; r++) {
      const round = await pairRound($, tid)
      expect(round.roundNr).toBe(r)
      await setResults($, tid, r, round.games, HIGHER_RATED_WINS)
    }

    const standings = await fetchChess4Standings($, tid, 4)
    const snapshot = standings.map((s: any) => ({
      place: s.place,
      club: s.club,
      playerCount: s.playerCount,
      chess4Members: s.chess4Members,
      score: s.score,
    }))
    expect(snapshot).toEqual(CHESS4_STANDINGS_FINAL)
  })

  test('Chess4 standings round-by-round', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    const players = await createChess4Players($)

    const { tid } = await createTournament(
      $,
      {
        ...CHESS4_OPTS,
        group: 'Snapshot rr',
      },
      players,
    )

    const allStandings: any[][] = []
    for (let r = 1; r <= 4; r++) {
      const round = await pairRound($, tid)
      expect(round.roundNr).toBe(r)
      await setResults($, tid, r, round.games, HIGHER_RATED_WINS)
      const standings = await fetchChess4Standings($, tid, r)
      allStandings.push(
        standings.map((s: any) => ({
          place: s.place,
          club: s.club,
          playerCount: s.playerCount,
          chess4Members: s.chess4Members,
          score: s.score,
        })),
      )
    }
    expect(allStandings).toEqual(CHESS4_STANDINGS_BY_ROUND)
  })

  test('Alphabetical pairings puts each school class on its own page', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)

    // In Schack4an the school class (4A, 4B, …) is represented as the player's club.
    const classClubs = [
      { name: '4A', chess4Members: 10 },
      { name: '4B', chess4Members: 10 },
      { name: '4C', chess4Members: 10 },
    ]
    const clubIds = await ensureClubs($, classClubs)
    const players: PlayerInput[] = [
      { lastName: 'Andersson', firstName: 'Anna', ratingI: 1000, clubIndex: clubIds[0] },
      { lastName: 'Björk', firstName: 'Bo', ratingI: 1000, clubIndex: clubIds[0] },
      { lastName: 'Carlsson', firstName: 'Cilla', ratingI: 1000, clubIndex: clubIds[1] },
      { lastName: 'Dahl', firstName: 'Dan', ratingI: 1000, clubIndex: clubIds[1] },
      { lastName: 'Ek', firstName: 'Eva', ratingI: 1000, clubIndex: clubIds[2] },
      { lastName: 'Falk', firstName: 'Frida', ratingI: 1000, clubIndex: clubIds[2] },
    ]
    const { tid } = await createTournament($, { ...CHESS4_OPTS, name: 'Chess4-pages' }, players)
    await pairRound($, tid)

    const html = await $.get(`/api/tournaments/${tid}/publish/alphabetical?round=1`)

    await page.setContent(html)
    await page.emulateMedia({ media: 'print' })
    const perClass = await page.$$eval('.CP_AlphabeticalClass', (els) =>
      els.map((el) => ({
        heading: el.querySelector('h3')?.textContent ?? '',
        breakBefore: getComputedStyle(el).breakBefore,
      })),
    )
    expect(perClass).toEqual([
      { heading: '4A', breakBefore: 'auto' },
      { heading: '4B', breakBefore: 'page' },
      { heading: '4C', breakBefore: 'page' },
    ])
  })

  test('Publish chess4 standings HTML', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    const players = await createChess4Players($)

    // Use name="Chess4-rr" + group="Snapshot" so toString() = "Chess4-rr Snapshot"
    const { tid } = await createTournament($, CHESS4_OPTS, players)

    for (let r = 1; r <= 4; r++) {
      const round = await pairRound($, tid)
      expect(round.roundNr).toBe(r)
      await setResults($, tid, r, round.games, HIGHER_RATED_WINS)
    }

    const html = await $.getText(`/api/tournaments/${tid}/publish/chess4-standings`)
    expect(html).toEqual(CHESS4_PUBLISH_HTML)
  })
})
