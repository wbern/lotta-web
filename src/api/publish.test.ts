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

  it('publishHtml alphabetical default renders table per class with real lotNrs', async () => {
    await pairNextRound(tournamentId)

    const blob = await publishHtml(tournamentId, 'alphabetical', 1)
    const html = await blob.text()

    expect(html).toContain('CP_AlphabeticalClass')
    // Must surface the real lot numbers assigned at pairing time, not the
    // 2147483647 sentinel returned by tournamentPlayers.list().
    expect(html).not.toContain('2147483647')
    // Ratings 1800, 1700, 1600, 1500 → lotNrs 1, 2, 3, 4 by rating-desc.
    expect(html).toMatch(
      /<td class="CP_Player">Anna Andersson<\/td><td class="CP_Board">1 [VS]<\/td>/,
    )
    expect(html).toMatch(/<td class="CP_Player">Bo Björk<\/td><td class="CP_Board">2 [VS]<\/td>/)
    expect(html).toMatch(
      /<td class="CP_Player">Cilla Carlsson<\/td><td class="CP_Board">3 [VS]<\/td>/,
    )
    expect(html).toMatch(/<td class="CP_Player">Dan Dahl<\/td><td class="CP_Board">4 [VS]<\/td>/)
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
    expect(html).toMatch(/Anna Andersson <span class="CP_RowBoard">1 [VS]<\/span>/)
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
