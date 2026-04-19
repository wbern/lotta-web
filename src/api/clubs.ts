import type { ClubDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService, withSave } from './service-provider'

export async function listClubsLocal(): Promise<ClubDto[]> {
  return getDatabaseService().clubs.list()
}

export async function addClubLocal(dto: Partial<ClubDto>): Promise<ClubDto> {
  return withSave(
    () => getDatabaseService().clubs.create({ name: dto.name ?? '' }),
    'Ny klubb',
    dto.name ?? '',
  )
}

export async function renameClubLocal(id: number, dto: Partial<ClubDto>): Promise<ClubDto> {
  return withSave(
    () => getDatabaseService().clubs.update(id, dto),
    'Byt namn på klubb',
    dto.name ?? '',
  )
}

export async function deleteClubLocal(id: number): Promise<void> {
  const club = getDatabaseService()
    .clubs.list()
    .find((c) => c.id === id)
  return withSave(() => getDatabaseService().clubs.delete(id), 'Ta bort klubb', club?.name ?? '')
}

export async function listClubs(): Promise<ClubDto[]> {
  return getDataProvider().clubs.list()
}

export async function addClub(dto: Partial<ClubDto>): Promise<ClubDto> {
  return getDataProvider().clubs.add(dto)
}

export async function renameClub(id: number, dto: Partial<ClubDto>): Promise<ClubDto> {
  return getDataProvider().clubs.rename(id, dto)
}

export async function deleteClub(id: number): Promise<void> {
  return getDataProvider().clubs.delete(id)
}
