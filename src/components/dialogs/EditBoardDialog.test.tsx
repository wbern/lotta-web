// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockPlayer } from '../../test/mock-player'
import { ToastProvider } from '../toast/ToastProvider'
import { EditBoardDialog } from './EditBoardDialog'

const players = [
  mockPlayer({ id: 1, firstName: 'Anna', lastName: 'Svensson', ratingI: 1500 }),
  mockPlayer({ id: 2, firstName: 'Erik', lastName: 'Johansson', ratingI: 1400 }),
]

const existingGame = {
  boardNr: 1,
  whitePlayer: players[0],
  blackPlayer: players[1],
  result: '',
}

vi.mock('../../hooks/useTournamentPlayers', () => ({
  useTournamentPlayers: () => ({ data: players }),
}))

vi.mock('../../hooks/useRounds', () => ({
  useRound: () => ({ data: { games: [existingGame] } }),
}))

const mockUpdateGame = vi.fn()

vi.mock('../../api/results', () => ({
  addGame: vi.fn(),
  updateGame: (...args: unknown[]) => mockUpdateGame(...args),
}))

function renderDialog(props: Partial<React.ComponentProps<typeof EditBoardDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EditBoardDialog
          open
          tournamentId={1}
          roundNr={1}
          mode="edit"
          boardNr={1}
          onClose={vi.fn()}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EditBoardDialog save error', () => {
  it('surfaces save failure via the global error toast', async () => {
    mockUpdateGame.mockRejectedValue(new Error('DB error'))

    renderDialog()

    await waitFor(() => {
      const okButton = screen.getByText('Ok') as HTMLButtonElement
      expect(okButton.disabled).toBe(false)
    })

    screen.getByText('Ok').click()

    await waitFor(() => {
      expect(mockUpdateGame).toHaveBeenCalled()
    })

    const toast = await screen.findByTestId('toast')
    expect(toast.className).toContain('toast--error')
    expect(toast.textContent).toContain('DB error')
  })
})
