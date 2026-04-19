import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import { UndoManager } from '../db/undo-manager.ts'
import { deleteUndoDatabase } from '../db/undo-persistence.ts'
import { getUndoManager, setUndoManager } from '../db/undo-provider.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { getDatabaseService, setDatabaseService } from './service-provider.ts'
import { redo, restoreToPoint, undo } from './undo.ts'

describe('undo API', () => {
  let service: DatabaseService

  beforeEach(async () => {
    await deleteDatabase()
    await deleteUndoDatabase()
    service = await DatabaseService.create()
    setDatabaseService(service)
    const manager = await UndoManager.create()
    setUndoManager(manager)
    await manager.captureInitialState()
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(async () => {
    getDatabaseService().close()
    await deleteDatabase()
    await deleteUndoDatabase()
  })

  it('undoes a club creation', async () => {
    getDatabaseService().clubs.create({ name: 'SK Lund' })
    await getDatabaseService().save()
    await getUndoManager().pushState('Ny klubb', 'SK Lund')

    expect(getDatabaseService().clubs.list()).toHaveLength(1)

    const success = await undo()
    expect(success).toBe(true)
    expect(getDatabaseService().clubs.list()).toHaveLength(0)
  })

  it('redoes after undo', async () => {
    getDatabaseService().clubs.create({ name: 'SK Lund' })
    await getDatabaseService().save()
    await getUndoManager().pushState('Ny klubb', 'SK Lund')

    await undo()
    expect(getDatabaseService().clubs.list()).toHaveLength(0)

    const success = await redo()
    expect(success).toBe(true)
    expect(getDatabaseService().clubs.list()).toHaveLength(1)
    expect(getDatabaseService().clubs.list()[0].name).toBe('SK Lund')
  })

  it('returns false when nothing to undo', async () => {
    const success = await undo()
    expect(success).toBe(false)
  })

  it('returns false when nothing to redo', async () => {
    const success = await redo()
    expect(success).toBe(false)
  })

  it('restores to a specific point in history', async () => {
    getDatabaseService().clubs.create({ name: 'A' })
    await getDatabaseService().save()
    await getUndoManager().pushState('Klubb A', 'A')

    getDatabaseService().clubs.create({ name: 'B' })
    await getDatabaseService().save()
    await getUndoManager().pushState('Klubb B', 'B')

    getDatabaseService().clubs.create({ name: 'C' })
    await getDatabaseService().save()
    await getUndoManager().pushState('Klubb C', 'C')

    expect(getDatabaseService().clubs.list()).toHaveLength(3)

    // Restore to after "Klubb A" was added
    const timeline = getUndoManager().getTimeline()
    const firstEntry = timeline[0]
    const success = await restoreToPoint(firstEntry.snapshotIndex)
    expect(success).toBe(true)
    expect(getDatabaseService().clubs.list()).toHaveLength(1)
    expect(getDatabaseService().clubs.list()[0].name).toBe('A')
  })

  it('handles a full undo-redo sequence with tournament data', async () => {
    // Create a tournament
    const t = getDatabaseService().tournaments.create({
      name: 'Test',
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
    await getDatabaseService().save()
    await getUndoManager().pushState('Ny turnering', 'Test')

    // Add a player
    getDatabaseService().tournamentPlayers.add(t.id, {
      lastName: 'Carlsen',
      firstName: 'Magnus',
      ratingI: 2830,
    })
    await getDatabaseService().save()
    await getUndoManager().pushState('Lägg till spelare', 'Magnus Carlsen')

    expect(getDatabaseService().tournamentPlayers.list(t.id)).toHaveLength(1)

    // Undo player addition
    await undo()
    expect(getDatabaseService().tournamentPlayers.list(t.id)).toHaveLength(0)
    // Tournament still exists
    expect(getDatabaseService().tournaments.list()).toHaveLength(1)

    // Undo tournament creation
    await undo()
    expect(getDatabaseService().tournaments.list()).toHaveLength(0)

    // Redo tournament creation
    await redo()
    expect(getDatabaseService().tournaments.list()).toHaveLength(1)

    // Redo player addition
    await redo()
    const players = getDatabaseService().tournamentPlayers.list(t.id)
    expect(players).toHaveLength(1)
    expect(players[0].lastName).toBe('Carlsen')
  })
})
