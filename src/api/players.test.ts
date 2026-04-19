import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { addPoolPlayer, deletePoolPlayer, listPoolPlayers, updatePoolPlayer } from './players.ts'
import { setDatabaseService } from './service-provider.ts'

describe('players API (local)', () => {
  let service: DatabaseService

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(() => {
    service.close()
  })

  it('CRUD operations on pool players', async () => {
    const empty = await listPoolPlayers()
    expect(empty).toEqual([])

    const created = await addPoolPlayer({ lastName: 'Carlsen', firstName: 'Magnus' })
    expect(created.lastName).toBe('Carlsen')

    const updated = await updatePoolPlayer(created.id, { ratingN: 2850 })
    expect(updated.ratingN).toBe(2850)

    await deletePoolPlayer(created.id)
    const afterDelete = await listPoolPlayers()
    expect(afterDelete).toEqual([])
  })
})
