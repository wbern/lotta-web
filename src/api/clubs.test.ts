import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { addClub, deleteClub, listClubs, renameClub } from './clubs.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { setDatabaseService } from './service-provider.ts'

describe('clubs API (local)', () => {
  let service: DatabaseService

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(() => {
    service.close()
  })

  it('lists clubs from local database', async () => {
    const clubs = await listClubs()
    expect(clubs).toEqual([])
  })

  it('creates, renames, and deletes a club through API functions', async () => {
    const created = await addClub({ name: 'SK Rockaden' })
    expect(created.name).toBe('SK Rockaden')

    const renamed = await renameClub(created.id, { name: 'SK Rockaden Göteborg' })
    expect(renamed.name).toBe('SK Rockaden Göteborg')

    const afterRename = await listClubs()
    expect(afterRename).toHaveLength(1)
    expect(afterRename[0].name).toBe('SK Rockaden Göteborg')

    await deleteClub(created.id)
    const afterDelete = await listClubs()
    expect(afterDelete).toEqual([])
  })

  it('persists mutations to IndexedDB', async () => {
    await addClub({ name: 'SK Rockaden' })
    service.close()

    service = await DatabaseService.create()
    setDatabaseService(service)
    const clubs = await listClubs()
    expect(clubs).toHaveLength(1)
    expect(clubs[0].name).toBe('SK Rockaden')
  })
})
