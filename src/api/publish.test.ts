import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import {
  publishClubStandingsHtml,
  publishCrossTableHtml,
  publishHtml,
  publishPairingsHtml,
  publishPlayerListHtml,
  publishStandingsHtml,
} from './publish.ts'
import { setResult } from './results.ts'
import { pairNextRound } from './rounds.ts'
import { setDatabaseService } from './service-provider.ts'

describe('publish API (local)', () => {
  let service: DatabaseService
  let tournamentId: number

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())

    const t = service.tournaments.create({
      name: 'Testturneringen',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Rating',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })
    tournamentId = t.id

    const club = service.clubs.create({ name: 'SK Lund' })
    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Andersson',
      firstName: 'Anna',
      ratingI: 1800,
      clubIndex: club.id,
    })
    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Björk',
      firstName: 'Bo',
      ratingI: 1700,
    })
    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Carlsson',
      firstName: 'Cilla',
      ratingI: 1600,
      clubIndex: club.id,
    })
    service.tournamentPlayers.add(tournamentId, {
      lastName: 'Dahl',
      firstName: 'Dan',
      ratingI: 1500,
    })
  })

  afterEach(async () => {
    service.close()
    await deleteDatabase()
  })

  it('publishPlayerListHtml generates HTML with all players', async () => {
    const blob = await publishPlayerListHtml(tournamentId)
    const html = await blob.text()

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Spelarlista')
    expect(html).toContain('Testturneringen')
    expect(html).toContain('Anna Andersson')
    expect(html).toContain('Bo Björk')
    expect(html).toContain('SK Lund')
    expect(html).toContain('1800')
  })

  it('publishPairingsHtml generates HTML after pairing', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishPairingsHtml(tournamentId)
    const html = await blob.text()

    expect(html).toContain('Lottning rond 1')
    expect(html).toContain('Testturneringen')
    expect(html).toContain('Bord')
    expect(html).toContain('Vit')
    expect(html).toContain('Svart')
  })

  it('publishStandingsHtml generates HTML after round with results', async () => {
    const round = await pairNextRound(tournamentId)
    for (const g of round.games) {
      await setResult(tournamentId, 1, g.boardNr, { resultType: 'WHITE_WIN' })
    }

    const blob = await publishStandingsHtml(tournamentId)
    const html = await blob.text()

    expect(html).toContain('Ställning efter rond 1')
    expect(html).toContain('Plac')
    expect(html).toContain('Poäng')
  })

  it('publishClubStandingsHtml generates HTML', async () => {
    const round = await pairNextRound(tournamentId)
    for (const g of round.games) {
      await setResult(tournamentId, 1, g.boardNr, { resultType: 'DRAW' })
    }

    const blob = await publishClubStandingsHtml(tournamentId)
    const html = await blob.text()

    expect(html).toContain('Klubbställning efter rond 1')
    expect(html).toContain('SK Lund')
  })

  it('publishCrossTableHtml generates cross table', async () => {
    const round = await pairNextRound(tournamentId)
    for (const g of round.games) {
      await setResult(tournamentId, 1, g.boardNr, { resultType: 'WHITE_WIN' })
    }

    const blob = await publishCrossTableHtml(tournamentId)
    const html = await blob.text()

    expect(html).toContain('Korstabell')
    expect(html).toContain('R1')
    expect(html).toContain('Poäng')
    // Should contain opponent references with color
    expect(html).toMatch(/\d[vs]/)
  })

  it('publishHtml dispatches correctly', async () => {
    await pairNextRound(tournamentId)

    const pairingsBlob = await publishHtml(tournamentId, 'pairings', 1)
    const pairingsHtml = await pairingsBlob.text()
    expect(pairingsHtml).toContain('Lottning')

    const playersBlob = await publishHtml(tournamentId, 'players')
    const playersHtml = await playersBlob.text()
    expect(playersHtml).toContain('Spelarlista')
  })

  it('publishHtml alphabetical default renders table per class with real board numbers', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical', 1)
    const html = await blob.text()

    expect(html).toContain('CP_AlphabeticalClass')
    expect(html).not.toContain('2147483647')
    // 4 players → 2 games on boards 1 and 2. Each player's row shows the
    // board they actually sit at (must match the on-screen pairings list).
    const round = service.games.getRound(tournamentId, 1)!
    const boardByName = new Map<string, number>()
    for (const g of round.games) {
      if (g.whitePlayer) boardByName.set(g.whitePlayer.name, g.boardNr)
      if (g.blackPlayer) boardByName.set(g.blackPlayer.name, g.boardNr)
    }
    for (const [name, board] of boardByName) {
      const re = new RegExp(
        `<td class="CP_Player">${name}</td><td class="CP_Board">${board} [VS]</td>`,
      )
      expect(html).toMatch(re)
    }
  })

  it('publishHtml alphabetical honors groupByClass=0 + columns query params', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical?groupByClass=0&columns=3', 1)
    const html = await blob.text()

    expect(html).toContain('CP_AlphabeticalFlat')
    expect(html).toContain('column-count: 3')
    // The per-class wrapper div should not be emitted in the flat layout
    // (the class name may still appear inside the inline CSS block)
    expect(html).not.toContain('class="CP_AlphabeticalClass"')
    const annaBoard = service.games
      .getRound(tournamentId, 1)!
      .games.find(
        (g) => g.whitePlayer?.name === 'Anna Andersson' || g.blackPlayer?.name === 'Anna Andersson',
      )!.boardNr
    expect(html).toMatch(
      new RegExp(`Anna Andersson <span class="CP_RowBoard">${annaBoard} [VS]</span>`),
    )
  })

  it('publishHtml alphabetical ignores non-numeric columns values', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical?groupByClass=0&columns=foo', 1)
    const html = await blob.text()

    // Should fall back to the default (1 column) rather than emitting NaN.
    expect(html).not.toContain('column-count: NaN')
    expect(html).toContain('column-count: 1')
  })

  it('publishHtml alphabetical hides opponent last names when hideOppLast=1', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical?hideOppLast=1', 1)
    const html = await blob.text()

    // Anna's opponent in rating-desc pairing should be Bo Björk — with the
    // flag on, only "Bo" should appear as her opponent cell. Players' own
    // rows still keep their full names.
    expect(html).toContain('<td class="CP_Player">Anna Andersson</td>')
    expect(html).toContain('<td class="CP_Player">Bo Björk</td>')
    // Only Bo's own row should contain "Bo Björk" — Anna's opponent cell
    // should have been shortened to "Bo".
    const boBjorkMatches = html.match(/<td class="CP_Player">Bo Björk<\/td>/g) ?? []
    expect(boBjorkMatches).toHaveLength(1)
    expect(html).toMatch(/<td class="CP_Player">Bo<\/td>/)
  })

  it('publishHtml alphabetical applies CP_compact when compact=1', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical?compact=1', 1)
    const html = await blob.text()

    expect(html).toContain('<body class="CP_compact">')
  })

  it('publishPairingsHtml throws with no rounds', async () => {
    await expect(publishPairingsHtml(tournamentId)).rejects.toThrow('No rounds available')
  })
})
