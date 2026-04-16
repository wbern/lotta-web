import type { PairingExecutor, PairingRequest, PairingResult } from '../domain/pairing-runner'

type WorkerResponse = { ok: true; result: PairingResult } | { ok: false; error: string }

export class WorkerPairingExecutor implements PairingExecutor {
  private worker: Worker | null = null

  run(req: PairingRequest): Promise<PairingResult> {
    return new Promise<PairingResult>((resolve, reject) => {
      const worker = new Worker(new URL('../domain/pairing.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker = worker

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.dispose()
        if (e.data.ok) resolve(e.data.result)
        else reject(new Error(e.data.error))
      }

      worker.onerror = (e) => {
        this.dispose()
        reject(new Error(e.message || 'Pairing worker crashed'))
      }

      worker.postMessage(req)
    })
  }

  cancel(): void {
    this.dispose()
  }

  private dispose(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
