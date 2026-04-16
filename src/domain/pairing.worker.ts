/// <reference lib="webworker" />

import { pairMonrad } from './pairing-monrad'
import { pairNordic } from './pairing-nordic'
import type { PairingRequest, PairingResult } from './pairing-runner'

type WorkerResponse = { ok: true; result: PairingResult } | { ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<PairingRequest>) => {
  const req = e.data
  try {
    let games
    if (req.kind === 'monrad') {
      games = pairMonrad(req.args.players, req.args.history, req.args.barredPairing)
    } else {
      games = pairNordic(
        req.args.players,
        req.args.history,
        req.args.barredPairing,
        req.args.roundsPlayed,
      )
    }
    const response: WorkerResponse = { ok: true, result: { games } }
    ctx.postMessage(response)
  } catch (err) {
    const response: WorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(response)
  }
}
