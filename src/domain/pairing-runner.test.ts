import { describe, expect, it, vi } from 'vitest'
import {
  type PairingExecutor,
  type PairingRequest,
  PairingTimeoutError,
  runPairingWithDeadline,
} from './pairing-runner'

function hangingExecutor(): PairingExecutor {
  return {
    run: () => new Promise(() => {}),
    cancel: vi.fn(),
  }
}

const REQ: PairingRequest = {
  kind: 'monrad',
  args: {
    players: [],
    history: { meetings: new Set(), whiteCounts: new Map() },
    barredPairing: false,
  },
}

describe('runPairingWithDeadline', () => {
  it('throws PairingTimeoutError when the executor does not finish before the deadline', async () => {
    const executor = hangingExecutor()

    await expect(runPairingWithDeadline(executor, REQ, 10)).rejects.toBeInstanceOf(
      PairingTimeoutError,
    )
  })

  it('resolves with the executor result when it finishes before the deadline', async () => {
    const expected = { games: [{ whitePlayerId: 1, blackPlayerId: 2 }] }
    const executor: PairingExecutor = {
      run: () => Promise.resolve(expected),
      cancel: vi.fn(),
    }

    const result = await runPairingWithDeadline(executor, REQ, 1000)

    expect(result).toEqual(expected)
  })

  it('calls cancel() on the executor when the deadline is exceeded', async () => {
    const executor = hangingExecutor()

    await expect(runPairingWithDeadline(executor, REQ, 10)).rejects.toBeInstanceOf(
      PairingTimeoutError,
    )

    expect(executor.cancel).toHaveBeenCalledTimes(1)
  })

  it('does not call cancel() when the executor resolves before the deadline', async () => {
    const executor: PairingExecutor = {
      run: () => Promise.resolve({ games: [] }),
      cancel: vi.fn(),
    }

    await runPairingWithDeadline(executor, REQ, 1000)

    expect(executor.cancel).not.toHaveBeenCalled()
  })
})
