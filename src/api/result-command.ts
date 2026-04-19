import type { ResultType } from '../types/api'

export interface SetResultCommand {
  tournamentId: number
  roundNr: number
  boardNr: number
  resultType: ResultType
  expectedPrior: ResultType
}

export type CommandOutcome =
  | { status: 'applied' }
  | { status: 'idempotent' }
  | { status: 'conflict'; current: ResultType }

export class ResultConflictError extends Error {
  readonly current: ResultType

  constructor(current: ResultType) {
    super(`Result conflict: board already has ${current}`)
    this.name = 'ResultConflictError'
    this.current = current
  }
}

interface CommandDeps {
  getCurrentResult: (tournamentId: number, roundNr: number, boardNr: number) => Promise<ResultType>
  applyResult: (
    tournamentId: number,
    roundNr: number,
    boardNr: number,
    resultType: ResultType,
  ) => Promise<void>
}

export async function handleSetResult(
  cmd: SetResultCommand,
  deps: CommandDeps,
): Promise<CommandOutcome> {
  const current = await deps.getCurrentResult(cmd.tournamentId, cmd.roundNr, cmd.boardNr)

  if (current === cmd.resultType) {
    return { status: 'idempotent' }
  }

  if (current !== cmd.expectedPrior) {
    return { status: 'conflict', current }
  }

  await deps.applyResult(cmd.tournamentId, cmd.roundNr, cmd.boardNr, cmd.resultType)
  return { status: 'applied' }
}

export function createCommandDeps(provider: {
  rounds: Pick<import('./data-provider').DataProvider['rounds'], 'get'>
  results: Pick<import('./data-provider').DataProvider['results'], 'set'>
}): CommandDeps {
  return {
    getCurrentResult: async (tournamentId, roundNr, boardNr) => {
      const round = await provider.rounds.get(tournamentId, roundNr)
      const game = round.games.find((g) => g.boardNr === boardNr)
      if (!game) throw new Error(`Board ${boardNr} not found in round ${roundNr}`)
      return game.resultType
    },
    applyResult: async (tournamentId, roundNr, boardNr, resultType) => {
      await provider.results.set(tournamentId, roundNr, boardNr, { resultType })
    },
  }
}
