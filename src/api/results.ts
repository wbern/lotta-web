import type { GameDto, SetResultRequest } from '../types/api'
import { getActiveDataProvider, getDataProvider } from './active-provider'
import { broadcastAfterResultChange } from './p2p-broadcast'
import { createCommandDeps, handleSetResult, ResultConflictError } from './result-command'
import { getDatabaseService, withSave } from './service-provider'

export async function setResultLocal(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
  req: SetResultRequest,
): Promise<GameDto> {
  if (req.expectedPrior != null) {
    const deps = createCommandDeps({
      rounds: { get: (tid, rn) => Promise.resolve(getDatabaseService().games.getRound(tid, rn)!) },
      results: {
        set: (tid, rn, bn, r) =>
          withSave(
            () => getDatabaseService().games.setResult(tid, rn, bn, r),
            'Ange resultat',
            (game) => `Bord ${bn}: ${game.resultDisplay}`,
          ),
      },
    })

    const outcome = await handleSetResult(
      {
        tournamentId,
        roundNr,
        boardNr,
        resultType: req.resultType,
        expectedPrior: req.expectedPrior,
      },
      deps,
    )

    if (outcome.status === 'conflict') {
      throw new ResultConflictError(outcome.current)
    }

    if (outcome.status === 'idempotent') {
      const round = getDatabaseService().games.getRound(tournamentId, roundNr)!
      return round.games.find((g) => g.boardNr === boardNr)!
    }

    // applied
    void broadcastAfterResultChange(tournamentId, roundNr).catch((e) =>
      console.warn('P2P broadcast failed after result change:', e),
    )
    const round = getDatabaseService().games.getRound(tournamentId, roundNr)!
    return round.games.find((g) => g.boardNr === boardNr)!
  }

  const result = await withSave(
    () => getDatabaseService().games.setResult(tournamentId, roundNr, boardNr, req),
    'Ange resultat',
    (game) => `Bord ${boardNr}: ${game.resultDisplay}`,
  )
  void broadcastAfterResultChange(tournamentId, roundNr).catch((e) =>
    console.warn('P2P broadcast failed after result change:', e),
  )
  return result
}

export async function deleteGameLocal(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
): Promise<void> {
  return withSave(
    () => getDatabaseService().games.deleteGame(tournamentId, roundNr, boardNr),
    'Ta bort bord',
    `Bord ${boardNr}`,
  )
}

export async function deleteGamesLocal(
  tournamentId: number,
  roundNr: number,
  boardNrs: number[],
): Promise<void> {
  const detail =
    boardNrs.length <= 5 ? boardNrs.map((n) => `Bord ${n}`).join(', ') : `${boardNrs.length} bord`
  return withSave(
    () => getDatabaseService().games.deleteGames(tournamentId, roundNr, boardNrs),
    'Ta bort bord',
    detail,
  )
}

export async function addGameLocal(
  tournamentId: number,
  roundNr: number,
  whitePlayerId: number | null,
  blackPlayerId: number | null,
): Promise<void> {
  const db = getDatabaseService()
  const boardNr = db.games.getNextBoardNr(tournamentId, roundNr)
  return withSave(
    () => {
      db.games.insertGame(tournamentId, roundNr, boardNr, whitePlayerId, blackPlayerId)
    },
    'Lägg till bord',
    `Bord ${boardNr}`,
  )
}

export async function updateGameLocal(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
  whitePlayerId: number | null,
  blackPlayerId: number | null,
): Promise<void> {
  return withSave(
    () =>
      getDatabaseService().games.updateGame(
        tournamentId,
        roundNr,
        boardNr,
        whitePlayerId,
        blackPlayerId,
      ),
    'Uppdatera bord',
    `Bord ${boardNr}`,
  )
}

export async function setResult(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
  req: SetResultRequest,
): Promise<GameDto> {
  // If a remote (P2P) provider is active and supports the setResult command
  // protocol, route through the command path to get conflict detection.
  const active = getActiveDataProvider()
  if (active && req.expectedPrior != null && active.commands) {
    const outcome = await active.commands.setResult({
      tournamentId,
      roundNr,
      boardNr,
      resultType: req.resultType,
      expectedPrior: req.expectedPrior,
    })
    if (outcome.status === 'conflict') throw new ResultConflictError(outcome.current)
    const round = await active.rounds.get(tournamentId, roundNr)
    return round.games.find((g) => g.boardNr === boardNr)!
  }
  return getDataProvider().results.set(tournamentId, roundNr, boardNr, req)
}

export async function deleteGame(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
): Promise<void> {
  return getDataProvider().results.deleteGame(tournamentId, roundNr, boardNr)
}

export async function deleteGames(
  tournamentId: number,
  roundNr: number,
  boardNrs: number[],
): Promise<void> {
  return getDataProvider().results.deleteGames(tournamentId, roundNr, boardNrs)
}

export async function addGame(
  tournamentId: number,
  roundNr: number,
  whitePlayerId: number | null,
  blackPlayerId: number | null,
): Promise<void> {
  return getDataProvider().results.addGame(tournamentId, roundNr, whitePlayerId, blackPlayerId)
}

export async function updateGame(
  tournamentId: number,
  roundNr: number,
  boardNr: number,
  whitePlayerId: number | null,
  blackPlayerId: number | null,
): Promise<void> {
  return getDataProvider().results.updateGame(
    tournamentId,
    roundNr,
    boardNr,
    whitePlayerId,
    blackPlayerId,
  )
}
