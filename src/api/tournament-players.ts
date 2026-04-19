import type { PlayerDto } from '../types/api'
import { getDataProvider } from './active-provider'
import { getDatabaseService, withSave } from './service-provider'

export async function listTournamentPlayersLocal(tournamentId: number): Promise<PlayerDto[]> {
  return getDatabaseService().tournamentPlayers.list(tournamentId)
}

export async function addTournamentPlayerLocal(
  tournamentId: number,
  dto: Partial<PlayerDto>,
): Promise<PlayerDto> {
  return withSave(
    () => getDatabaseService().tournamentPlayers.add(tournamentId, dto),
    'Lägg till turneringsspelare',
    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim(),
  )
}

export async function addTournamentPlayersLocal(
  tournamentId: number,
  dtos: Partial<PlayerDto>[],
): Promise<PlayerDto[]> {
  const detail =
    dtos.length <= 3
      ? dtos.map((d) => `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()).join(', ')
      : `${dtos.length} spelare`
  return withSave(
    () => getDatabaseService().tournamentPlayers.addMany(tournamentId, dtos),
    'Lägg till turneringsspelare',
    detail,
  )
}

export async function updateTournamentPlayerLocal(
  _tournamentId: number,
  playerId: number,
  dto: Partial<PlayerDto>,
): Promise<PlayerDto> {
  return withSave(
    () => getDatabaseService().tournamentPlayers.update(playerId, dto),
    'Uppdatera turneringsspelare',
    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim(),
  )
}

export async function removeTournamentPlayerLocal(
  tournamentId: number,
  playerId: number,
): Promise<void> {
  const player = getDatabaseService()
    .tournamentPlayers.list(tournamentId)
    .find((p) => p.id === playerId)
  const detail = player ? `${player.firstName} ${player.lastName}`.trim() : ''
  return withSave(
    () => getDatabaseService().tournamentPlayers.remove(playerId),
    'Ta bort turneringsspelare',
    detail,
  )
}

export async function removeTournamentPlayersLocal(
  tournamentId: number,
  playerIds: number[],
): Promise<void> {
  const players = getDatabaseService()
    .tournamentPlayers.list(tournamentId)
    .filter((p) => playerIds.includes(p.id))
  const detail =
    players.length <= 3
      ? players.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ')
      : `${playerIds.length} spelare`
  return withSave(
    () => getDatabaseService().tournamentPlayers.removeMany(playerIds),
    'Ta bort turneringsspelare',
    detail,
  )
}

export async function listTournamentPlayers(tournamentId: number): Promise<PlayerDto[]> {
  return getDataProvider().tournamentPlayers.list(tournamentId)
}

export async function addTournamentPlayer(
  tournamentId: number,
  dto: Partial<PlayerDto>,
): Promise<PlayerDto> {
  return getDataProvider().tournamentPlayers.add(tournamentId, dto)
}

export async function addTournamentPlayers(
  tournamentId: number,
  dtos: Partial<PlayerDto>[],
): Promise<PlayerDto[]> {
  return getDataProvider().tournamentPlayers.addMany(tournamentId, dtos)
}

export async function updateTournamentPlayer(
  tournamentId: number,
  playerId: number,
  dto: Partial<PlayerDto>,
): Promise<PlayerDto> {
  return getDataProvider().tournamentPlayers.update(tournamentId, playerId, dto)
}

export async function removeTournamentPlayer(
  tournamentId: number,
  playerId: number,
): Promise<void> {
  return getDataProvider().tournamentPlayers.remove(tournamentId, playerId)
}

export async function removeTournamentPlayers(
  tournamentId: number,
  playerIds: number[],
): Promise<void> {
  return getDataProvider().tournamentPlayers.removeMany(tournamentId, playerIds)
}
