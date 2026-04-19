import type { PlayerDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService, withSave } from './service-provider'

export async function listPoolPlayersLocal(): Promise<PlayerDto[]> {
  return getDatabaseService().availablePlayers.list()
}

export async function addPoolPlayerLocal(dto: Partial<PlayerDto>): Promise<PlayerDto> {
  return withSave(
    () => getDatabaseService().availablePlayers.create(dto),
    'Ny spelare i pool',
    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim(),
  )
}

export async function updatePoolPlayerLocal(
  id: number,
  dto: Partial<PlayerDto>,
): Promise<PlayerDto> {
  return withSave(
    () => getDatabaseService().availablePlayers.update(id, dto),
    'Uppdatera poolspelare',
    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim(),
  )
}

export async function deletePoolPlayerLocal(id: number): Promise<void> {
  const player = getDatabaseService()
    .availablePlayers.list()
    .find((p) => p.id === id)
  const detail = player ? `${player.firstName} ${player.lastName}`.trim() : ''
  return withSave(
    () => getDatabaseService().availablePlayers.delete(id),
    'Ta bort poolspelare',
    detail,
  )
}

export async function deletePoolPlayersLocal(ids: number[]): Promise<void> {
  const players = getDatabaseService()
    .availablePlayers.list()
    .filter((p) => ids.includes(p.id))
  const detail =
    players.length <= 3
      ? players.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ')
      : `${ids.length} spelare`
  return withSave(
    () => getDatabaseService().availablePlayers.deleteMany(ids),
    'Ta bort poolspelare',
    detail,
  )
}

export async function listPoolPlayers(): Promise<PlayerDto[]> {
  return getDataProvider().poolPlayers.list()
}

export async function addPoolPlayer(dto: Partial<PlayerDto>): Promise<PlayerDto> {
  return getDataProvider().poolPlayers.add(dto)
}

export async function updatePoolPlayer(id: number, dto: Partial<PlayerDto>): Promise<PlayerDto> {
  return getDataProvider().poolPlayers.update(id, dto)
}

export async function deletePoolPlayer(id: number): Promise<void> {
  return getDataProvider().poolPlayers.delete(id)
}

export async function deletePoolPlayers(ids: number[]): Promise<void> {
  return getDataProvider().poolPlayers.deleteMany(ids)
}
