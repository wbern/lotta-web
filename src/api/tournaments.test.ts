import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { broadcastAfterTournamentDelete } from './p2p-broadcast.ts'
import { setDatabaseService } from './service-provider.ts'
import {
  createTournament,
  deleteTournament,
  exportTournamentPlayers,
  getTournament,
  importPlayers,
  listTournaments,
  updateTournament,
} from './tournaments.ts'

vi.mock('./p2p-broadcast.ts', () => ({
  broadcastAfterTournamentDelete: vi.fn(),
}))

describe('tournaments API (local)', () => {
  let service: DatabaseService

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(async () => {
    service.close()
    await deleteDatabase()
  })

  it('creates, reads, updates, and deletes a tournament', async () => {
    const created = await createTournament({
      name: 'Höstturneringen',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })

    expect(created.name).toBe('Höstturneringen')

    const list = await listTournaments()
    expect(list).toHaveLength(1)

    const fetched = await getTournament(created.id)
    expect(fetched.name).toBe('Höstturneringen')

    const updated = await updateTournament(created.id, {
      name: 'Vårturneringen',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: 9,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })
    expect(updated.nrOfRounds).toBe(9)

    await deleteTournament(created.id)
    const afterDelete = await listTournaments()
    expect(afterDelete).toEqual([])
  })

  it('broadcasts a tournament-delete notice after deleting through the API', async () => {
    const created = await createTournament({
      name: 'Broadcast Test',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })

    vi.mocked(broadcastAfterTournamentDelete).mockClear()
    await deleteTournament(created.id)

    expect(broadcastAfterTournamentDelete).toHaveBeenCalledWith(created.id)
  })

  it('exports tournament players as TSV with UTF-8 BOM', async () => {
    const t = await createTournament({
      name: 'Export Test',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })

    // Add a club first
    const club = service.clubs.create({ name: 'SK Linköping' })

    // Add players to the tournament
    service.tournamentPlayers.add(t.id, {
      lastName: 'Andersson',
      firstName: 'Anna',
      clubIndex: club.id,
    })
    service.tournamentPlayers.add(t.id, {
      lastName: 'Björk',
      firstName: 'Bo',
    })

    const blob = await exportTournamentPlayers(t.id)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // Check UTF-8 BOM
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)

    // Check content (after BOM)
    const text = new TextDecoder().decode(bytes.slice(3))
    const lines = text.split('\n').filter((l) => l !== '')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Andersson\tAnna\tSK Linköping')
    expect(lines[1]).toBe('Björk\tBo\t')
  })

  it('exports empty TSV for tournament with no players', async () => {
    const t = await createTournament({
      name: 'Empty',
      group: 'A',
      pairingSystem: 'Monrad',
      initialPairing: 'Slumpad',
      nrOfRounds: 7,
      barredPairing: false,
      compensateWeakPlayerPP: false,
      pointsPerGame: 1,
      chess4: false,
      ratingChoice: 'ELO',
      showELO: true,
      showGroup: true,
    })

    const blob = await exportTournamentPlayers(t.id)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // Should still have BOM
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)

    // No content after BOM
    const text = new TextDecoder().decode(bytes.slice(3))
    expect(text).toBe('')
  })

  it('imports players from TSV file', async () => {
    const tsv = 'Andersson\tAnna\tSK Linköping\nBjörk\tBo\n'
    const file = new File([tsv], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    const result = await importPlayers(file)
    expect(result.imported).toBe(2)

    // Verify players were added to the available players pool
    const players = service.availablePlayers.list()
    expect(players).toHaveLength(2)
    expect(players[0].lastName).toBe('Andersson')
    expect(players[0].firstName).toBe('Anna')
    expect(players[0].club).toBe('SK Linköping')
    expect(players[1].lastName).toBe('Björk')
    expect(players[1].firstName).toBe('Bo')
  })

  it('import skips duplicate players (case-insensitive)', async () => {
    // Pre-create a player
    service.availablePlayers.create({
      lastName: 'Andersson',
      firstName: 'Anna',
    })

    const tsv = 'andersson\tanna\tSK Lund\nBjörk\tBo\n'
    const file = new File([tsv], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    const result = await importPlayers(file)
    expect(result.imported).toBe(1) // Only Björk imported

    const players = service.availablePlayers.list()
    expect(players).toHaveLength(2)
  })

  it('import auto-creates clubs', async () => {
    const tsv = 'Andersson\tAnna\tSK Norrköping\n'
    const file = new File([tsv], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    await importPlayers(file)

    // Verify club was created
    const clubs = service.clubs.list()
    expect(clubs.some((c) => c.name === 'SK Norrköping')).toBe(true)

    // Verify player has club association
    const players = service.availablePlayers.list()
    expect(players[0].club).toBe('SK Norrköping')
  })

  it('import handles UTF-8 BOM', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const content = new TextEncoder().encode('Åkesson\tÖrjan\n')
    const combined = new Uint8Array(bom.length + content.length)
    combined.set(bom)
    combined.set(content, bom.length)

    const file = new File([combined], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    const result = await importPlayers(file)
    expect(result.imported).toBe(1)

    const players = service.availablePlayers.list()
    expect(players[0].lastName).toBe('Åkesson')
    expect(players[0].firstName).toBe('Örjan')
  })

  it('import skips lines with fewer than 2 columns', async () => {
    const tsv = 'OnlyLastName\nAndersson\tAnna\n\n'
    const file = new File([tsv], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    const result = await importPlayers(file)
    expect(result.imported).toBe(1)

    const players = service.availablePlayers.list()
    expect(players).toHaveLength(1)
    expect(players[0].lastName).toBe('Andersson')
  })

  it('import reuses existing clubs', async () => {
    service.clubs.create({ name: 'SK Lund' })

    const tsv = 'Andersson\tAnna\tSK Lund\nBjörk\tBo\tSK Lund\n'
    const file = new File([tsv], 'spelare.tsv', {
      type: 'text/tab-separated-values',
    })

    await importPlayers(file)

    // Should still have only 1 club
    const clubs = service.clubs.list()
    expect(clubs.filter((c) => c.name === 'SK Lund')).toHaveLength(1)

    // Both players should reference the same club
    const players = service.availablePlayers.list()
    expect(players[0].club).toBe('SK Lund')
    expect(players[1].club).toBe('SK Lund')
  })
})
