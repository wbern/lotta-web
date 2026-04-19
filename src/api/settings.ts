import type { SettingsDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService, withSave } from './service-provider'

export async function getSettingsLocal(): Promise<SettingsDto> {
  return getDatabaseService().settings.get()
}

export async function updateSettingsLocal(dto: Partial<SettingsDto>): Promise<SettingsDto> {
  return withSave(
    () => getDatabaseService().settings.update(dto),
    'Uppdatera inställningar',
    'Inställningar',
  )
}

export async function getSettings(): Promise<SettingsDto> {
  return getDataProvider().settings.get()
}

export async function updateSettings(dto: Partial<SettingsDto>): Promise<SettingsDto> {
  return getDataProvider().settings.update(dto)
}
