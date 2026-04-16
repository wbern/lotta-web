import type { PairingGame } from './pairing'
import type { MonradGameHistory, MonradPlayerInfo } from './pairing-monrad'
import type { NordicPlayerInfo } from './pairing-nordic'

export class PairingTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Pairing did not complete within ${timeoutMs}ms`)
    this.name = 'PairingTimeoutError'
  }
}

export type PairingRequest =
  | {
      kind: 'monrad'
      args: {
        players: MonradPlayerInfo[]
        history: MonradGameHistory
        barredPairing: boolean
      }
    }
  | {
      kind: 'nordic'
      args: {
        players: NordicPlayerInfo[]
        history: MonradGameHistory
        barredPairing: boolean
        roundsPlayed: number
      }
    }

export interface PairingResult {
  games: PairingGame[] | null
}

export interface PairingExecutor {
  run(req: PairingRequest): Promise<PairingResult>
  cancel(): void
}

export function runPairingWithDeadline(
  executor: PairingExecutor,
  req: PairingRequest,
  timeoutMs: number,
): Promise<PairingResult> {
  return new Promise<PairingResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      executor.cancel()
      reject(new PairingTimeoutError(timeoutMs))
    }, timeoutMs)

    executor.run(req).then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
