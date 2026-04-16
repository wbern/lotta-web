import { pairMonrad } from '../domain/pairing-monrad'
import { pairNordic } from '../domain/pairing-nordic'
import type { PairingExecutor, PairingRequest, PairingResult } from '../domain/pairing-runner'

class DirectPairingExecutor implements PairingExecutor {
  run(req: PairingRequest): Promise<PairingResult> {
    if (req.kind === 'monrad') {
      const games = pairMonrad(req.args.players, req.args.history, req.args.barredPairing)
      return Promise.resolve({ games })
    }
    const games = pairNordic(
      req.args.players,
      req.args.history,
      req.args.barredPairing,
      req.args.roundsPlayed,
    )
    return Promise.resolve({ games })
  }
  cancel(): void {}
}

let instance: PairingExecutor = new DirectPairingExecutor()

export function setPairingExecutor(executor: PairingExecutor): void {
  instance = executor
}

export function getPairingExecutor(): PairingExecutor {
  return instance
}
