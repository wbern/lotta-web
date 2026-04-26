import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  apiClient,
  createTournament,
  ensureClubs,
  type PlayerInput,
  waitForApi,
} from './api-helpers'
import { expect, test } from './fixtures'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lotta-em')

interface ClubFixture {
  clubIndex: number
  name: string
  chess4Members: number | null
}
interface PlayerFixture {
  lastName: string
  firstName: string
  clubName: string
  ratingN: number
  ratingI: number
  ratingQ: number
  ratingB: number
  ratingK: number
  ratingKQ: number
  ratingKB: number
  sex: string | null
  federation: string
  fideId: number
  ssfId: number
  birthdate: string | null
  playerGroup: string
}
interface TournamentConfigFixture {
  name: string
  group: string
  pairingSystem: string
  initialPairing: string
  nrOfRounds: number
  barredPairing: string
  compensateWeakPlayerPP: string
  chess4: string
  pointsPerGame: number
  ratingChoice: string
  showELO: string
  showGroup: string
  federation: string | null
}

const clubsFixture = JSON.parse(
  readFileSync(join(FIXTURES, 'clubs.json'), 'utf-8'),
) as ClubFixture[]
const playersFixture = JSON.parse(
  readFileSync(join(FIXTURES, 'players-pre-r1.json'), 'utf-8'),
) as PlayerFixture[]
const configFixture = JSON.parse(
  readFileSync(join(FIXTURES, 'tournament-config.json'), 'utf-8'),
) as TournamentConfigFixture[]

// Reproduces the state captured in `backup-pre-r1.sqlite` (lotta-backup (16)):
// the Regionfinal Schackfyran 2 / Lördag em chess4 tournament right before
// round 1 was paired — 12 schools registered, 70 players entered, 0 games.
test.describe('Lördag em — replay', () => {
  test('setup: 12 clubs, 70 players, tournament configured, no rounds yet', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)

    const clubInputs = clubsFixture.map((c) => ({
      name: c.name,
      chess4Members: c.chess4Members ?? undefined,
    }))
    await ensureClubs($, clubInputs)
    const clubs: { id: number; name: string }[] = await $.get('/api/clubs')
    const clubIdByName = new Map(clubs.map((c) => [c.name, c.id]))

    const players: PlayerInput[] = playersFixture.map((p) => {
      const clubIndex = clubIdByName.get(p.clubName)
      if (clubIndex == null) throw new Error(`Club not found: ${p.clubName}`)
      return {
        lastName: p.lastName,
        firstName: p.firstName,
        clubIndex,
        ratingN: p.ratingN ?? 0,
        ratingI: p.ratingI ?? 0,
        ratingQ: p.ratingQ ?? 0,
        ratingB: p.ratingB ?? 0,
        ratingK: p.ratingK ?? 0,
        ratingKQ: p.ratingKQ ?? 0,
        ratingKB: p.ratingKB ?? 0,
        sex: p.sex ?? '',
        federation: p.federation ?? 'SWE',
        fideId: p.fideId ?? 0,
        ssfId: p.ssfId ?? 0,
        birthdate: p.birthdate ?? '',
        playerGroup: p.playerGroup ?? '',
      }
    })

    const cfg = configFixture[0]
    const { tid } = await createTournament(
      $,
      {
        name: cfg.name,
        group: cfg.group,
        pairingSystem: cfg.pairingSystem,
        initialPairing: cfg.initialPairing,
        nrOfRounds: cfg.nrOfRounds,
        barredPairing: cfg.barredPairing === 'true',
        compensateWeakPlayerPP: cfg.compensateWeakPlayerPP === 'true',
        chess4: cfg.chess4 === 'true',
        pointsPerGame: cfg.pointsPerGame,
        ratingChoice: cfg.ratingChoice,
        showELO: cfg.showELO === 'true',
        showGroup: cfg.showGroup === 'true',
        federation: cfg.federation ?? 'SWE',
      },
      players,
    )

    const t = await $.get(`/api/tournaments/${tid}`)
    expect(t.name).toBe(cfg.name)
    expect(t.group).toBe(cfg.group)
    expect(t.pairingSystem).toBe(cfg.pairingSystem)
    expect(t.initialPairing).toBe(cfg.initialPairing)
    expect(t.nrOfRounds).toBe(cfg.nrOfRounds)
    expect(t.chess4).toBe(true)
    expect(t.pointsPerGame).toBe(cfg.pointsPerGame)

    const tplayers: any[] = await $.get(`/api/tournaments/${tid}/players`)
    expect(tplayers).toHaveLength(70)

    // Players are spread across exactly the 12 schools from the fixture
    const usedClubIds = new Set(tplayers.map((p) => p.clubIndex))
    expect(usedClubIds.size).toBe(12)

    const rounds: any[] = await $.get(`/api/tournaments/${tid}/rounds`)
    expect(rounds).toHaveLength(0)
  })
})
