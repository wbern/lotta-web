import { DatabaseService } from '../db/database-service'
import { deleteDatabase } from '../db/persistence'
import { UndoManager } from '../db/undo-manager'
import { setUndoManager } from '../db/undo-provider'
import { setLocalProviderFactory } from './active-provider'
import { addClubLocal, deleteClubLocal, listClubsLocal, renameClubLocal } from './clubs'
import type { DataProvider, DataProviderSetup } from './data-provider'
import {
  addPoolPlayerLocal,
  deletePoolPlayerLocal,
  deletePoolPlayersLocal,
  listPoolPlayersLocal,
  updatePoolPlayerLocal,
} from './players'
import {
  addGameLocal,
  deleteGameLocal,
  deleteGamesLocal,
  setResultLocal,
  updateGameLocal,
} from './results'
import { getRoundLocal, listRoundsLocal, pairNextRoundLocal, unpairLastRoundLocal } from './rounds'
import { setDatabaseService } from './service-provider'
import { getSettingsLocal, updateSettingsLocal } from './settings'
import { getChess4StandingsLocal, getClubStandingsLocal, getStandingsLocal } from './standings'
import {
  addTournamentPlayerLocal,
  addTournamentPlayersLocal,
  listTournamentPlayersLocal,
  removeTournamentPlayerLocal,
  removeTournamentPlayersLocal,
  updateTournamentPlayerLocal,
} from './tournament-players'
import {
  createTournamentLocal,
  deleteTournamentLocal,
  getTournamentLocal,
  listTournamentsLocal,
  updateTournamentLocal,
} from './tournaments'
import { redoLocal, restoreToPointLocal, undoLocal } from './undo'

export function getLocalProvider(): DataProvider {
  return {
    tournaments: {
      list: () => listTournamentsLocal(),
      get: (id) => getTournamentLocal(id),
      create: (req) => createTournamentLocal(req),
      update: (id, req) => updateTournamentLocal(id, req),
      delete: (id) => deleteTournamentLocal(id),
    },
    tournamentPlayers: {
      list: (tid) => listTournamentPlayersLocal(tid),
      add: (tid, dto) => addTournamentPlayerLocal(tid, dto),
      addMany: (tid, dtos) => addTournamentPlayersLocal(tid, dtos),
      update: (tid, pid, dto) => updateTournamentPlayerLocal(tid, pid, dto),
      remove: (tid, pid) => removeTournamentPlayerLocal(tid, pid),
      removeMany: (_tid, pids) => removeTournamentPlayersLocal(_tid, pids),
    },
    rounds: {
      list: (tid) => listRoundsLocal(tid),
      get: (tid, roundNr) => getRoundLocal(tid, roundNr),
      pairNext: (tid) => pairNextRoundLocal(tid),
      unpairLast: (tid) => unpairLastRoundLocal(tid),
    },
    results: {
      set: (tid, roundNr, boardNr, req) => setResultLocal(tid, roundNr, boardNr, req),
      addGame: (tid, roundNr, whiteId, blackId) => addGameLocal(tid, roundNr, whiteId, blackId),
      updateGame: (tid, roundNr, boardNr, whiteId, blackId) =>
        updateGameLocal(tid, roundNr, boardNr, whiteId, blackId),
      deleteGame: (tid, roundNr, boardNr) => deleteGameLocal(tid, roundNr, boardNr),
      deleteGames: (tid, roundNr, boardNrs) => deleteGamesLocal(tid, roundNr, boardNrs),
    },
    standings: {
      get: (tid, round) => getStandingsLocal(tid, round),
      getClub: (tid, round) => getClubStandingsLocal(tid, round),
      getChess4: (tid, round) => getChess4StandingsLocal(tid, round),
    },
    clubs: {
      list: () => listClubsLocal(),
      add: (dto) => addClubLocal(dto),
      rename: (id, dto) => renameClubLocal(id, dto),
      delete: (id) => deleteClubLocal(id),
    },
    settings: {
      get: () => getSettingsLocal(),
      update: (dto) => updateSettingsLocal(dto),
    },
    poolPlayers: {
      list: () => listPoolPlayersLocal(),
      add: (dto) => addPoolPlayerLocal(dto),
      update: (id, dto) => updatePoolPlayerLocal(id, dto),
      delete: (id) => deletePoolPlayerLocal(id),
      deleteMany: (ids) => deletePoolPlayersLocal(ids),
    },
    undo: {
      perform: () => undoLocal(),
      redo: () => redoLocal(),
      restoreToPoint: (idx) => restoreToPointLocal(idx),
    },
  }
}

export async function createLocalProvider(): Promise<DataProviderSetup> {
  const service = await DatabaseService.create()
  setDatabaseService(service)

  const undoManager = await UndoManager.create()
  setUndoManager(undoManager)
  await undoManager.captureInitialState()

  setLocalProviderFactory(() => getLocalProvider())

  return {
    provider: getLocalProvider(),
    teardown: async () => {
      service.close()
      await undoManager.clear()
      await deleteDatabase()
    },
  }
}
