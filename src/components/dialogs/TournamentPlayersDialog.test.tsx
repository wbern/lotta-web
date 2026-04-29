// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockPlayer } from '../../test/mock-player'
import { ToastProvider } from '../toast/ToastProvider'
import { TournamentPlayersDialog } from './TournamentPlayersDialog'

const poolPlayer = mockPlayer({
  id: 100,
  firstName: 'Anna',
  lastName: 'Svensson',
  club: 'SK Alfa',
  clubIndex: 1,
  ratingI: 1500,
})
const poolPlayer2 = mockPlayer({
  id: 101,
  firstName: 'Karl',
  lastName: 'Nilsson',
  club: 'SK Beta',
  clubIndex: 2,
  ratingI: 1700,
})
const tournamentPlayer = mockPlayer({
  id: 200,
  firstName: 'Erik',
  lastName: 'Johansson',
  club: 'SK Alfa',
  clubIndex: 1,
  ratingI: 1500,
})
const tournamentPlayer2 = mockPlayer({
  id: 201,
  firstName: 'Lisa',
  lastName: 'Persson',
  club: 'SK Alfa',
  clubIndex: 1,
  ratingI: 1600,
})
const withdrawnPlayer = mockPlayer({
  id: 202,
  firstName: 'Siv',
  lastName: 'Åberg',
  club: 'SK Gamma',
  clubIndex: 3,
  ratingI: 1400,
  withdrawnFromRound: 2,
})

const mockMutate = vi.fn()
const mockMutation = { mutate: mockMutate, mutateAsync: vi.fn() }
const mockBatchMutate = vi.fn()
const mockBatchMutation = { mutate: mockBatchMutate, mutateAsync: vi.fn() }

const mockBatchRemoveMutate = vi.fn()
const mockBatchRemoveMutation = { mutate: mockBatchRemoveMutate, mutateAsync: vi.fn() }

// Module-level mutable flag — flipped by `mockUpdateMutate` and read by the
// `useUpdateTournamentPlayer` mock factory on each render. Reset in afterEach.
let updateMutationIsSuccess = false
let updateMutationShouldFail = false
const mockUpdateMutate = vi.fn(
  (_args: unknown, opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => {
    if (updateMutationShouldFail) {
      opts?.onError?.(new Error('mock failure'))
      return
    }
    updateMutationIsSuccess = true
    opts?.onSuccess?.()
  },
)

vi.mock('../../hooks/useTournamentPlayers', () => ({
  useTournamentPlayers: () => ({ data: [tournamentPlayer, tournamentPlayer2, withdrawnPlayer] }),
  useAddTournamentPlayer: () => mockMutation,
  useAddTournamentPlayers: () => mockBatchMutation,
  useUpdateTournamentPlayer: () => ({
    mutate: mockUpdateMutate,
    mutateAsync: vi.fn(),
    isSuccess: updateMutationIsSuccess,
  }),
  useRemoveTournamentPlayers: () => mockBatchRemoveMutation,
}))

vi.mock('../../hooks/usePlayers', () => ({
  usePoolPlayers: () => ({ data: [poolPlayer, poolPlayer2] }),
}))

vi.mock('../../hooks/useClubs', () => ({
  useClubs: () => ({ data: [] }),
  useAddClub: () => mockMutation,
  useRenameClub: () => mockMutation,
  useDeleteClub: () => mockMutation,
}))

// Module-level mutable state — relies on Vitest running tests within a file
// serially. Do NOT switch this file to `describe.concurrent` / `it.concurrent`
// without first migrating to `vi.mocked().mockReturnValueOnce()` per test.
let phaseMode: 'draft' | 'seeded' | 'in_progress' | 'finalized' | 'loading' = 'draft'
vi.mock('../../hooks/useTournaments', () => ({
  useTournament: () => {
    if (phaseMode === 'loading') return { data: undefined }
    return {
      data: {
        id: 1,
        nrOfRounds: 7,
        roundsPlayed: phaseMode === 'draft' ? 0 : phaseMode === 'finalized' ? 7 : 1,
        hasRecordedResults: phaseMode === 'in_progress',
      },
    }
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  phaseMode = 'draft'
  updateMutationIsSuccess = false
  updateMutationShouldFail = false
})

function renderDialog() {
  render(
    <ToastProvider>
      <TournamentPlayersDialog open tournamentId={1} tournamentName="Test" onClose={vi.fn()} />
    </ToastProvider>,
  )
}

describe('TournamentPlayersDialog default sort', () => {
  it('sorts pool players by first name, not last name', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Spelarpool'))

    const rows = screen.getByTestId('data-table').querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('Anna Svensson')
    expect(rows[1].textContent).toContain('Karl Nilsson')
  })
})

describe('TournamentPlayersDialog reset button', () => {
  it('shows "Rensa formulär (ny spelarinmatning)" button label instead of "Ny spelare"', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))

    expect(screen.getByText('Rensa formulär (ny spelarinmatning)')).toBeTruthy()
    expect(screen.queryByText('Ny spelare')).toBeNull()
  })
})

describe('TournamentPlayersDialog discard-changes confirm', () => {
  it('shows a confirm dialog when double-clicking a tournament player while the form has unsaved input', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Turneringsspelare'))

    fireEvent.doubleClick(screen.getByText('Erik Johansson'))

    expect(screen.getByText('Osparade ändringar')).toBeTruthy()
  })

  it('discards the pending changes and loads the chosen player when confirming', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Turneringsspelare'))
    fireEvent.doubleClick(screen.getByText('Erik Johansson'))

    fireEvent.click(screen.getByText('OK'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Erik')
  })

  it('keeps the in-progress form when cancelling', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Turneringsspelare'))
    fireEvent.doubleClick(screen.getByText('Erik Johansson'))

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Pending')
  })

  it('does not prompt when the form is clean (double-click loads immediately)', () => {
    renderDialog()

    fireEvent.doubleClick(screen.getByText('Erik Johansson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Erik')
  })

  it('does not prompt when reverting edits back to the loaded player', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Erik2' } })
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Erik' } })

    fireEvent.click(screen.getByText('Turneringsspelare'))
    fireEvent.doubleClick(screen.getByText('Lisa Persson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
  })

  it('does not prompt after single-click loading a different player', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Turneringsspelare'))
    fireEvent.click(screen.getByText('Erik Johansson'))

    fireEvent.doubleClick(screen.getByText('Lisa Persson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
  })
})

describe('TournamentPlayersDialog reset on reopen', () => {
  it('returns to a fresh form on the tournament tab when the dialog is reopened after editing a player', () => {
    const { rerender } = render(
      <ToastProvider>
        <TournamentPlayersDialog open tournamentId={1} tournamentName="Test" onClose={vi.fn()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByText('Erik Johansson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Erik')

    rerender(
      <ToastProvider>
        <TournamentPlayersDialog
          open={false}
          tournamentId={1}
          tournamentName="Test"
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
    rerender(
      <ToastProvider>
        <TournamentPlayersDialog open tournamentId={1} tournamentName="Test" onClose={vi.fn()} />
      </ToastProvider>,
    )

    expect(screen.queryByTestId('first-name-input')).toBeNull()
    expect(screen.getByTestId('data-table')).toBeTruthy()
    const rows = screen.getByTestId('data-table').querySelectorAll('tbody tr')
    for (const row of rows) {
      expect(row.className).not.toContain('selected')
    }
  })
})

describe('TournamentPlayersDialog update validation', () => {
  it('shows error when updating player with empty names', () => {
    renderDialog()

    // Select the tournament player
    fireEvent.click(screen.getByText('Erik Johansson'))

    // Switch to edit tab
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))

    // Clear both name fields
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: '' } })

    // Click update button
    fireEvent.click(screen.getByTestId('update-player'))

    expect(screen.getByTestId('name-error')).toBeTruthy()
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })
})

describe('TournamentPlayersDialog update success feedback', () => {
  it('disables Uppdatera-uppgifter and reveals the "Sparat" label after a successful update', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Erika' } })

    fireEvent.click(screen.getByTestId('update-player'))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const updateBtn = screen.getByTestId('update-player') as HTMLButtonElement
    expect(updateBtn.disabled).toBe(true)
    // Both labels are always in the DOM (grid-stacked to avoid layout shift);
    // the visible one is the span without aria-hidden.
    const savedSpan = updateBtn.querySelector(`span[aria-hidden="false"]`)
    expect(savedSpan?.textContent).toMatch(/sparat/i)
  })

  it('surfaces the failure via the global toast system, not an inline error', () => {
    updateMutationShouldFail = true
    render(
      <ToastProvider>
        <TournamentPlayersDialog open tournamentId={1} tournamentName="Test" onClose={vi.fn()} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByText('Erik Johansson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Erika' } })

    fireEvent.click(screen.getByTestId('update-player'))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const toast = screen.getByTestId('toast')
    expect(toast.textContent).toMatch(/kunde inte spara/i)
    expect(toast.className).toContain('toast--error')
    // The dialog must not render its own inline error toast anymore.
    expect(screen.queryByTestId('error-toast')).toBeNull()
  })
})

describe('TournamentPlayersDialog pool tab', () => {
  it('shows add-to-tournament button with descriptive label', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Spelarpool'))

    const addButton = screen.getByTestId('add-from-pool')
    expect(addButton.textContent).toBe('Lägg till i turneringen')
  })

  it('disables add-from-pool button when no pool player is selected', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Spelarpool'))

    const addButton = screen.getByTestId('add-from-pool') as HTMLButtonElement
    expect(addButton.disabled).toBe(true)
  })
})

describe('TournamentPlayersDialog pool multi-select', () => {
  it('plain click selects only that pool player', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Spelarpool'))

    const rowA = screen.getByText('Anna Svensson').closest('tr')!
    const rowB = screen.getByText('Karl Nilsson').closest('tr')!

    fireEvent.click(rowA)
    expect(rowA.className).toContain('selected')
    expect(rowB.className).not.toContain('selected')

    // Plain click on B replaces selection
    fireEvent.click(rowB)
    expect(rowA.className).not.toContain('selected')
    expect(rowB.className).toContain('selected')
  })

  it('calls batch mutate with all selected pool players', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Spelarpool'))

    fireEvent.click(screen.getByText('Anna Svensson'))
    fireEvent.click(screen.getByText('Karl Nilsson'), { shiftKey: true })
    fireEvent.click(screen.getByTestId('add-from-pool'))

    expect(mockBatchMutate).toHaveBeenCalledTimes(1)
    const [players] = mockBatchMutate.mock.calls[0]
    expect(players).toHaveLength(2)
    expect(players.map((p: { lastName: string }) => p.lastName).sort()).toEqual([
      'Nilsson',
      'Svensson',
    ])
  })
})

describe('TournamentPlayersDialog withdrawn players', () => {
  it('shows (utgått rN) marker next to withdrawn player in tournament tab', () => {
    renderDialog()

    expect(screen.getByText('Siv Åberg (utgått r2)')).toBeTruthy()
  })
})

describe('TournamentPlayersDialog tournament multi-select', () => {
  it('plain click selects only that tournament player', () => {
    renderDialog()

    const rowA = screen.getByText('Erik Johansson').closest('tr')!
    const rowB = screen.getByText('Lisa Persson').closest('tr')!

    fireEvent.click(rowA)
    expect(rowA.className).toContain('selected')

    // Plain click on B replaces selection
    fireEvent.click(rowB)
    expect(rowA.className).not.toContain('selected')
    expect(rowB.className).toContain('selected')
  })

  it('calls batch remove with all selected tournament players', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))
    fireEvent.click(screen.getByText('Lisa Persson'), { shiftKey: true })
    fireEvent.click(screen.getByTestId('remove-player'))

    expect(mockBatchRemoveMutate).toHaveBeenCalledTimes(1)
    const [ids] = mockBatchRemoveMutate.mock.calls[0]
    expect(ids.sort()).toEqual([200, 201])
  })
})

describe('TournamentPlayersDialog phase gating', () => {
  it('enables remove button in draft phase when a player is selected', () => {
    // phaseMode default is 'draft' — verify the gate does NOT engage there.
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))

    const removeButton = screen.getByTestId('remove-player') as HTMLButtonElement
    expect(removeButton.disabled).toBe(false)
  })

  it('disables remove button when tournament is in_progress, with the Swedish withdraw tooltip', () => {
    phaseMode = 'in_progress'
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))

    const removeButton = screen.getByTestId('remove-player') as HTMLButtonElement
    expect(removeButton.disabled).toBe(true)
    expect(removeButton.title).toBe(
      'Du kan inte ta bort en spelare som är inlottad i turneringen — använd "utgår från rond" istället.',
    )
  })

  it('disables remove button when tournament is seeded (round 1 lottad, no results yet)', () => {
    phaseMode = 'seeded'
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))

    const removeButton = screen.getByTestId('remove-player') as HTMLButtonElement
    expect(removeButton.disabled).toBe(true)
  })

  it('disables remove button when tournament is finalized', () => {
    phaseMode = 'finalized'
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))

    const removeButton = screen.getByTestId('remove-player') as HTMLButtonElement
    expect(removeButton.disabled).toBe(true)
  })

  it('keeps remove button disabled when tournament data is unavailable', () => {
    // Covers both the brief loading window and any error state where
    // `useTournament` hands back `{ data: undefined }`.
    phaseMode = 'loading'
    renderDialog()

    fireEvent.click(screen.getByText('Erik Johansson'))

    const removeButton = screen.getByTestId('remove-player') as HTMLButtonElement
    expect(removeButton.disabled).toBe(true)
  })
})
