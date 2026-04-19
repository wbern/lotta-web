import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../db/database-service.ts'
import { setLocalProviderFactory } from './active-provider.ts'
import { getLocalProvider } from './local-data-provider.ts'
import { setDatabaseService } from './service-provider.ts'
import { getSettings, updateSettings } from './settings.ts'

describe('settings API (local)', () => {
  let service: DatabaseService

  beforeEach(async () => {
    service = await DatabaseService.create()
    setDatabaseService(service)
    setLocalProviderFactory(() => getLocalProvider())
  })

  afterEach(() => {
    service.close()
  })

  it('gets default settings and updates them', async () => {
    const defaults = await getSettings()
    expect(defaults.nrOfRows).toBe(20)

    const updated = await updateSettings({ nrOfRows: 50 })
    expect(updated.nrOfRows).toBe(50)

    const reloaded = await getSettings()
    expect(reloaded.nrOfRows).toBe(50)
  })
})
