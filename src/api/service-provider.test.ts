import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { deleteDatabase } from '../db/persistence.ts'
import { UndoManager } from '../db/undo-manager.ts'
import { deleteUndoDatabase } from '../db/undo-persistence.ts'
import { getUndoManager, setUndoManager } from '../db/undo-provider.ts'
import { clearCurrentActor, setCurrentActor } from './peer-actor.ts'
import { setDatabaseService, withSave } from './service-provider.ts'

describe('withSave peer actor label', () => {
  let service: DatabaseService

  beforeEach(async () => {
    await deleteDatabase()
    await deleteUndoDatabase()
    service = await DatabaseService.create()
    setDatabaseService(service)
    const manager = await UndoManager.create()
    setUndoManager(manager)
    await manager.captureInitialState()
  })

  afterEach(async () => {
    clearCurrentActor()
    service.close()
    await deleteDatabase()
    await deleteUndoDatabase()
  })

  it('uses unmodified detail when no actor is set', async () => {
    await withSave(() => service.clubs.create({ name: 'SK Lund' }), 'Ny klubb', 'SK Lund')
    const timeline = getUndoManager().getTimeline()
    const last = timeline[timeline.length - 1]
    expect(last.detail).toBe('SK Lund')
  })

  it('appends the current actor label to detail when set', async () => {
    setCurrentActor('Domare Sofia')
    await withSave(() => service.clubs.create({ name: 'SK Lund' }), 'Ny klubb', 'SK Lund')
    const timeline = getUndoManager().getTimeline()
    const last = timeline[timeline.length - 1]
    expect(last.detail).toBe('SK Lund · Domare Sofia')
  })

  it('does not append after the actor is cleared', async () => {
    setCurrentActor('Domare Sofia')
    clearCurrentActor()
    await withSave(() => service.clubs.create({ name: 'SK Lund' }), 'Ny klubb', 'SK Lund')
    const timeline = getUndoManager().getTimeline()
    const last = timeline[timeline.length - 1]
    expect(last.detail).toBe('SK Lund')
  })

  it('omits separator when detail is empty', async () => {
    setCurrentActor('Domare Sofia')
    await withSave(() => service.clubs.create({ name: 'SK Lund' }), 'Ny klubb', '')
    const timeline = getUndoManager().getTimeline()
    const last = timeline[timeline.length - 1]
    expect(last.detail).toBe('Domare Sofia')
  })
})
