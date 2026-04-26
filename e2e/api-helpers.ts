import { expect, type Page } from '@playwright/test'

// ── API client (calls in-browser API via page.evaluate) ─────────────────

export interface ApiClient {
  get(path: string): Promise<any>
  post(path: string, body?: any): Promise<any>
  put(path: string, body: any): Promise<any>
  del(path: string): Promise<any>
}

/**
 * Route an /api/... path to the corresponding in-browser function call.
 * The app exposes `window.__lottaApi` in dev mode (see e2e-bridge.ts).
 */
async function callApi(page: Page, method: string, path: string, body?: any): Promise<any> {
  // Playwright's page.evaluate cannot serialize `undefined` — strip undefined values
  const safeBody = body === undefined ? null : JSON.parse(JSON.stringify(body))
  return page.evaluate(
    async ({ method, path, body }) => {
      const api = (window as any).__lottaApi
      if (!api) throw new Error('__lottaApi not available — is the app loaded?')

      // Parse route patterns
      // GET    /api/clubs
      // POST   /api/clubs
      // PUT    /api/clubs/{id}
      // DELETE /api/clubs/{id}
      // GET    /api/tournaments
      // POST   /api/tournaments
      // GET    /api/tournaments/{id}
      // PUT    /api/tournaments/{id}
      // DELETE /api/tournaments/{id}
      // GET    /api/tournaments/{id}/players
      // POST   /api/tournaments/{id}/players
      // PUT    /api/tournaments/{id}/players/{pid}
      // DELETE /api/tournaments/{id}/players/{pid}
      // GET    /api/tournaments/{id}/rounds
      // GET    /api/tournaments/{id}/rounds/{nr}
      // POST   /api/tournaments/{id}/pair?confirm=true
      // DELETE /api/tournaments/{id}/rounds/latest?confirm=true
      // PUT    /api/tournaments/{id}/rounds/{nr}/games/{boardNr}/result
      // GET    /api/tournaments/{id}/standings?round={nr}
      // GET    /api/tournaments/{id}/club-standings?round={nr}
      // GET    /api/tournaments/{id}/chess4-standings?round={nr}
      // GET    /api/tournaments/{id}/export/players
      // GET    /api/tournaments/{id}/export/livechess
      // GET    /api/tournaments/{id}/export/fide
      // POST   /api/players/import
      // GET    /api/players
      // POST   /api/players
      // PUT    /api/players/{id}
      // DELETE /api/players/{id}
      // GET    /api/settings
      // PUT    /api/settings
      // GET    /api/tournaments/{id}/publish/{type}?round={nr}

      const url = new URL(path, 'http://localhost')
      const p = url.pathname
      const params = url.searchParams

      // Clubs
      const clubsMatch = p.match(/^\/api\/clubs$/)
      if (clubsMatch) {
        if (method === 'GET') return api.listClubs()
        if (method === 'POST') return api.addClub(body)
      }
      const clubIdMatch = p.match(/^\/api\/clubs\/(\d+)$/)
      if (clubIdMatch) {
        const id = Number(clubIdMatch[1])
        if (method === 'PUT') return api.renameClub(id, body)
        if (method === 'DELETE') return api.deleteClub(id)
      }

      // Settings
      if (p === '/api/settings') {
        if (method === 'GET') return api.getSettings()
        if (method === 'PUT') return api.updateSettings(body)
      }

      // Pool players
      if (p === '/api/players') {
        if (method === 'GET') return api.listPoolPlayers()
        if (method === 'POST') return api.addPoolPlayer(body)
      }
      const playerIdMatch = p.match(/^\/api\/players\/(\d+)$/)
      if (playerIdMatch) {
        const id = Number(playerIdMatch[1])
        if (method === 'PUT') return api.updatePoolPlayer(id, body)
        if (method === 'DELETE') return api.deletePoolPlayer(id)
      }

      // Player import
      if (p === '/api/players/import' && method === 'POST') {
        // body is expected to be the TSV content as a string
        const file = new File([body], 'import.tsv', {
          type: 'text/tab-separated-values',
        })
        return api.importPlayers(file)
      }

      // Tournaments
      const tournamentsMatch = p.match(/^\/api\/tournaments$/)
      if (tournamentsMatch) {
        if (method === 'GET') return api.listTournaments()
        if (method === 'POST') return api.createTournament(body)
      }

      // Tournament by ID
      const tournamentIdMatch = p.match(/^\/api\/tournaments\/(\d+)$/)
      if (tournamentIdMatch) {
        const id = Number(tournamentIdMatch[1])
        if (method === 'GET') return api.getTournament(id)
        if (method === 'PUT') return api.updateTournament(id, body)
        if (method === 'DELETE') return api.deleteTournament(id)
      }

      // Pair next round
      const pairMatch = p.match(/^\/api\/tournaments\/(\d+)\/pair$/)
      if (pairMatch && method === 'POST') {
        const id = Number(pairMatch[1])
        return api.pairNextRound(id, true)
      }

      // Tournament players
      const tPlayersMatch = p.match(/^\/api\/tournaments\/(\d+)\/players$/)
      if (tPlayersMatch) {
        const tid = Number(tPlayersMatch[1])
        if (method === 'GET') return api.listTournamentPlayers(tid)
        if (method === 'POST') return api.addTournamentPlayer(tid, body)
      }
      const tPlayerIdMatch = p.match(/^\/api\/tournaments\/(\d+)\/players\/(\d+)$/)
      if (tPlayerIdMatch) {
        const tid = Number(tPlayerIdMatch[1])
        const pid = Number(tPlayerIdMatch[2])
        if (method === 'PUT') return api.updateTournamentPlayer(tid, pid, body)
        if (method === 'DELETE') return api.removeTournamentPlayer(tid, pid)
      }

      // Rounds
      const roundsMatch = p.match(/^\/api\/tournaments\/(\d+)\/rounds$/)
      if (roundsMatch) {
        const tid = Number(roundsMatch[1])
        if (method === 'GET') return api.listRounds(tid)
      }
      const roundNrMatch = p.match(/^\/api\/tournaments\/(\d+)\/rounds\/(\d+)$/)
      if (roundNrMatch) {
        const tid = Number(roundNrMatch[1])
        const nr = Number(roundNrMatch[2])
        if (method === 'GET') return api.getRound(tid, nr)
      }

      // Unpair last round
      const unpairMatch = p.match(/^\/api\/tournaments\/(\d+)\/rounds\/latest$/)
      if (unpairMatch && method === 'DELETE') {
        const tid = Number(unpairMatch[1])
        return api.unpairLastRound(tid, true)
      }

      // Game result
      const resultMatch = p.match(
        /^\/api\/tournaments\/(\d+)\/rounds\/(\d+)\/games\/(\d+)\/result$/,
      )
      if (resultMatch && method === 'PUT') {
        const tid = Number(resultMatch[1])
        const roundNr = Number(resultMatch[2])
        const boardNr = Number(resultMatch[3])
        return api.setResult(tid, roundNr, boardNr, body)
      }

      // Standings
      const standingsMatch = p.match(/^\/api\/tournaments\/(\d+)\/standings$/)
      if (standingsMatch && method === 'GET') {
        const tid = Number(standingsMatch[1])
        const round = params.get('round') ? Number(params.get('round')) : undefined
        return api.getStandings(tid, round)
      }
      const clubStandingsMatch = p.match(/^\/api\/tournaments\/(\d+)\/club-standings$/)
      if (clubStandingsMatch && method === 'GET') {
        const tid = Number(clubStandingsMatch[1])
        const round = params.get('round') ? Number(params.get('round')) : undefined
        return api.getClubStandings(tid, round)
      }
      const chess4StandingsMatch = p.match(/^\/api\/tournaments\/(\d+)\/chess4-standings$/)
      if (chess4StandingsMatch && method === 'GET') {
        const tid = Number(chess4StandingsMatch[1])
        const round = params.get('round') ? Number(params.get('round')) : undefined
        return api.getChess4Standings(tid, round)
      }

      // Export
      const exportPlayersMatch = p.match(/^\/api\/tournaments\/(\d+)\/export\/players$/)
      if (exportPlayersMatch && method === 'GET') {
        const tid = Number(exportPlayersMatch[1])
        const blob = await api.exportTournamentPlayers(tid)
        return blob.text()
      }
      const exportLiveChessMatch = p.match(/^\/api\/tournaments\/(\d+)\/export\/livechess$/)
      if (exportLiveChessMatch && method === 'GET') {
        const tid = Number(exportLiveChessMatch[1])
        const blob = await api.exportLiveChess(tid)
        return blob.text()
      }

      // Publish HTML
      const publishMatch = p.match(/^\/api\/tournaments\/(\d+)\/publish\/(.+)$/)
      if (publishMatch && method === 'GET') {
        const tid = Number(publishMatch[1])
        const type = publishMatch[2]
        const round = params.get('round') ? Number(params.get('round')) : undefined
        const blob = await api.publishHtml(tid, type, round)
        return blob.text()
      }

      // Undo/Redo
      if (p === '/api/undo' && method === 'POST') return api.undo()
      if (p === '/api/redo' && method === 'POST') return api.redo()
      const restoreMatch = p.match(/^\/api\/undo\/restore\/(\d+)$/)
      if (restoreMatch && method === 'POST') {
        return api.restoreToPoint(Number(restoreMatch[1]))
      }
      if (p === '/api/undo/state' && method === 'GET') return api.getUndoState()
      if (p === '/api/undo/timeline' && method === 'GET') return api.getTimeline()
      if (p === '/api/undo/clear' && method === 'POST') return api.clearUndo()
      if (p === '/api/undo/capture-initial' && method === 'POST')
        return api.captureInitialUndoState()

      throw new Error(`Unmatched API route: ${method} ${path}`)
    },
    { method, path, body: safeBody },
  )
}

export function apiClient(page: Page): ApiClient {
  return {
    get: (path) => callApi(page, 'GET', path),
    post: (path, body) => callApi(page, 'POST', path, body),
    put: (path, body) => callApi(page, 'PUT', path, body),
    del: (path) => callApi(page, 'DELETE', path),
  }
}

// ── Ensure API is loaded before calling ─────────────────────────────────

export async function waitForApi(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__lottaApi != null)
}

// ── Seed: "Hjälteturneringen 2025" + "Min Testturnering" ────────────────
// 8 players in 3 clubs, 7-round Monrad, all rounds played with
// HIGHER_RATED_WINS — Ragnar is highest-rated → wins out, first place
// in standings. Used by navigation/app/menus/dialogs specs.
// Idempotent: skips seeding if it's already there.

const HERO_CLUBS = [{ name: 'Kattegats SK' }, { name: 'Vikings SK' }, { name: 'Uppsala SK' }]

const HERO_PLAYERS: PlayerInput[] = [
  { lastName: 'Lothbrok', firstName: 'Ragnar', ratingI: 2200 },
  { lastName: 'Benlös', firstName: 'Ivar', ratingI: 2100 },
  { lastName: 'Järnsida', firstName: 'Björn', ratingI: 2000 },
  { lastName: 'Ormöga', firstName: 'Sigurd', ratingI: 1900 },
  { lastName: 'Vitserk', firstName: 'Hvitserk', ratingI: 1800 },
  { lastName: 'Ragnarsson', firstName: 'Ubbe', ratingI: 1700 },
  { lastName: 'Sköldmö', firstName: 'Lagertha', ratingI: 1600, sex: 'F' },
  { lastName: 'Drottning', firstName: 'Aslaug', ratingI: 1500, sex: 'F' },
]

export async function seedHeroTournament(page: Page): Promise<number> {
  await waitForApi(page)
  const $ = apiClient(page)

  const existing: { id: number; name: string }[] = await $.get('/api/tournaments')
  const found = existing.find((t) => t.name === 'Hjälteturneringen 2025')
  if (found) return found.id

  const clubIds = await ensureClubs($, HERO_CLUBS)
  const players = HERO_PLAYERS.map((p, i) => ({
    ...p,
    clubIndex: clubIds[i % clubIds.length],
  }))

  const { tid } = await createTournament(
    $,
    {
      name: 'Hjälteturneringen 2025',
      group: 'Alla',
      pairingSystem: 'Monrad',
      nrOfRounds: 7,
    },
    players,
  )
  for (let r = 1; r <= 7; r++) {
    const round = await pairRound($, tid)
    await setResults($, tid, r, round.games, HIGHER_RATED_WINS)
  }

  // Second, minimal tournament for "switch between tournaments" tests.
  if (!existing.find((t) => t.name === 'Min Testturnering')) {
    await createTournament(
      $,
      {
        name: 'Min Testturnering',
        group: '',
        pairingSystem: 'Monrad',
        nrOfRounds: 3,
      },
      HERO_PLAYERS.slice(0, 4).map((p, i) => ({ ...p, clubIndex: clubIds[i % clubIds.length] })),
    )
  }

  return tid
}

// ── Result strategies ───────────────────────────────────────────────────

export type ResultFn = (g: any) => string

export const HIGHER_RATED_WINS: ResultFn = (g) =>
  g.whitePlayer.rating > g.blackPlayer.rating ? 'WHITE_WIN' : 'BLACK_WIN'

export const ALL_DRAWS: ResultFn = () => 'DRAW'

/**
 * Scripted results: maps round number → board number → result type.
 * Example: { 1: { 1: 'WHITE_WIN', 2: 'BLACK_WIN' }, 2: { 1: 'DRAW' } }
 */
export function SCRIPTED_RESULTS(
  script: Record<number, Record<number, string>>,
): (roundNr: number) => ResultFn {
  return (roundNr: number) => (g: any) => {
    const roundScript = script[roundNr]
    if (!roundScript) throw new Error(`No script for round ${roundNr}`)
    const result = roundScript[g.boardNr]
    if (!result) throw new Error(`No script for round ${roundNr} board ${g.boardNr}`)
    return result
  }
}

// ── Player input type ───────────────────────────────────────────────────

export interface PlayerInput {
  lastName: string
  firstName: string
  ratingI?: number
  ratingN?: number
  ratingQ?: number
  ratingB?: number
  ratingK?: number
  ratingKQ?: number
  ratingKB?: number
  clubIndex?: number
  title?: string
  sex?: string
  federation?: string
  fideId?: number
  ssfId?: number
  playerGroup?: string
  birthdate?: string
}

// ── Tournament creation ─────────────────────────────────────────────────

export interface TournamentOptions {
  name: string
  group?: string
  pairingSystem: string
  nrOfRounds: number
  initialPairing?: string
  pointsPerGame?: number
  chess4?: boolean
  ratingChoice?: string
  showELO?: boolean
  showGroup?: boolean
  barredPairing?: boolean
  compensateWeakPlayerPP?: boolean
  selectedTiebreaks?: string[]
  city?: string
  startDate?: string
  endDate?: string
  chiefArbiter?: string
  deputyArbiter?: string
  timeControl?: string
  federation?: string
  roundDates?: { round: number; date: string }[]
}

export async function createTournament(
  $: ApiClient,
  opts: TournamentOptions,
  players: PlayerInput[],
) {
  const tournament = await $.post('/api/tournaments', {
    name: opts.name,
    group: opts.group ?? 'Snapshot',
    pairingSystem: opts.pairingSystem,
    initialPairing: opts.initialPairing ?? 'Rating',
    nrOfRounds: opts.nrOfRounds,
    barredPairing: opts.barredPairing ?? false,
    compensateWeakPlayerPP: opts.compensateWeakPlayerPP ?? false,
    pointsPerGame: opts.pointsPerGame ?? 1,
    chess4: opts.chess4 ?? false,
    ratingChoice: opts.ratingChoice ?? 'ELO',
    showELO: opts.showELO ?? true,
    showGroup: opts.showGroup ?? false,
    selectedTiebreaks: opts.selectedTiebreaks,
    city: opts.city,
    startDate: opts.startDate,
    endDate: opts.endDate,
    chiefArbiter: opts.chiefArbiter,
    deputyArbiter: opts.deputyArbiter,
    timeControl: opts.timeControl,
    federation: opts.federation,
    roundDates: opts.roundDates,
  })

  const addedPlayers: any[] = []
  for (const p of players) {
    const added = await $.post(`/api/tournaments/${tournament.id}/players`, {
      firstName: p.firstName,
      lastName: p.lastName,
      ratingI: p.ratingI ?? 0,
      ratingN: p.ratingN ?? 0,
      ratingQ: p.ratingQ ?? 0,
      ratingB: p.ratingB ?? 0,
      ratingK: p.ratingK ?? 0,
      ratingKQ: p.ratingKQ ?? 0,
      ratingKB: p.ratingKB ?? 0,
      clubIndex: p.clubIndex ?? 0,
      title: p.title ?? '',
      sex: p.sex ?? '',
      federation: p.federation ?? 'SWE',
      fideId: p.fideId ?? 0,
      ssfId: p.ssfId ?? 0,
      playerGroup: p.playerGroup ?? '',
      withdrawnFromRound: -1,
      manualTiebreak: 0,
      birthdate: p.birthdate ?? '',
    })
    addedPlayers.push(added)
  }

  return { tid: tournament.id, addedPlayers }
}

// ── Round helpers ───────────────────────────────────────────────────────

export async function pairRound($: ApiClient, tid: number): Promise<any> {
  return $.post(`/api/tournaments/${tid}/pair?confirm=true`)
}

export async function setResults(
  $: ApiClient,
  tid: number,
  roundNr: number,
  games: any[],
  resultFn: ResultFn,
) {
  for (const g of games) {
    if (!g.whitePlayer || !g.blackPlayer) continue
    await $.put(`/api/tournaments/${tid}/rounds/${roundNr}/games/${g.boardNr}/result`, {
      resultType: resultFn(g),
    })
  }
}

export async function setResultsFromScript(
  $: ApiClient,
  tid: number,
  roundNr: number,
  games: any[],
  script: Record<number, string>,
) {
  for (const g of games) {
    if (!g.whitePlayer || !g.blackPlayer) continue
    const resultType = script[g.boardNr]
    if (!resultType) throw new Error(`No script for board ${g.boardNr} in round ${roundNr}`)
    await $.put(`/api/tournaments/${tid}/rounds/${roundNr}/games/${g.boardNr}/result`, {
      resultType,
    })
  }
}

// ── Standings helpers ───────────────────────────────────────────────────

export async function fetchStandings($: ApiClient, tid: number, round: number) {
  return $.get(`/api/tournaments/${tid}/standings?round=${round}`)
}

export async function fetchClubStandings($: ApiClient, tid: number, round: number) {
  return $.get(`/api/tournaments/${tid}/club-standings?round=${round}`)
}

export async function fetchChess4Standings($: ApiClient, tid: number, round: number) {
  return $.get(`/api/tournaments/${tid}/chess4-standings?round=${round}`)
}

// ── Club helpers ────────────────────────────────────────────────────────

/**
 * Ensure clubs exist, creating only if missing. Returns club IDs in order.
 * Optionally sets chess4Members via PUT.
 */
export async function ensureClubs(
  $: ApiClient,
  clubs: { name: string; chess4Members?: number }[],
): Promise<number[]> {
  const existing: any[] = await $.get('/api/clubs')
  const ids: number[] = []
  for (const c of clubs) {
    const found = existing.find((e: any) => e.name === c.name)
    if (found) {
      if (c.chess4Members != null) {
        await $.put(`/api/clubs/${found.id}`, { name: c.name, chess4Members: c.chess4Members })
      }
      ids.push(found.id)
    } else {
      const created = await $.post('/api/clubs', { name: c.name })
      if (c.chess4Members != null) {
        await $.put(`/api/clubs/${created.id}`, { name: c.name, chess4Members: c.chess4Members })
      }
      ids.push(created.id)
      existing.push(created) // avoid duplicates within the same call
    }
  }
  return ids
}

// ── Play rounds helper ──────────────────────────────────────────────────

export async function playRounds(
  $: ApiClient,
  tid: number,
  nrOfRounds: number,
  resultFn: ResultFn | ((roundNr: number) => ResultFn),
) {
  for (let r = 1; r <= nrOfRounds; r++) {
    const round = await pairRound($, tid)
    expect(round.roundNr).toBe(r)
    const fn =
      typeof resultFn === 'function' && resultFn.length > 1
        ? resultFn
        : (resultFn as (roundNr: number) => ResultFn)(r)
    await setResults($, tid, r, round.games, fn as ResultFn)
  }
}

/**
 * Play rounds using a per-round script of board→result mappings.
 */
export async function playRoundsScripted(
  $: ApiClient,
  tid: number,
  script: Record<number, Record<number, string>>,
) {
  const rounds = Object.keys(script)
    .map(Number)
    .sort((a, b) => a - b)
  for (const r of rounds) {
    const round = await pairRound($, tid)
    expect(round.roundNr).toBe(r)
    await setResultsFromScript($, tid, r, round.games, script[r])
  }
}

// ── Undo helpers ────────────────────────────────────────────────────────

export async function performUndo($: ApiClient): Promise<boolean> {
  return $.post('/api/undo')
}

export async function performRedo($: ApiClient): Promise<boolean> {
  return $.post('/api/redo')
}

export async function getUndoState($: ApiClient): Promise<{
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}> {
  return $.get('/api/undo/state')
}

export async function getTimeline($: ApiClient): Promise<any[]> {
  return $.get('/api/undo/timeline')
}

/** Clear undo history and capture a fresh initial state for test isolation */
export async function clearUndoHistory($: ApiClient): Promise<void> {
  await $.post('/api/undo/clear')
  await $.post('/api/undo/capture-initial')
}
