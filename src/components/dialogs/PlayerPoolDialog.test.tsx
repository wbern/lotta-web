// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockPlayer } from '../../test/mock-player'
import { PlayerPoolDialog } from './PlayerPoolDialog'

const mockMutate = vi.fn()
const mockMutation = { mutate: mockMutate, mutateAsync: vi.fn() }

const testPlayer = mockPlayer({ id: 1, firstName: 'Anna', lastName: 'Svensson', ratingI: 1500 })
const testPlayer2 = mockPlayer({ id: 2, firstName: 'Karl', lastName: 'Nilsson', ratingI: 1700 })

const mockBatchDeleteMutate = vi.fn()
const mockBatchDeleteMutation = { mutate: mockBatchDeleteMutate, mutateAsync: vi.fn() }

vi.mock('../../hooks/usePlayers', () => ({
  usePoolPlayers: () => ({ data: [testPlayer, testPlayer2] }),
  useAddPoolPlayer: () => mockMutation,
  useUpdatePoolPlayer: () => mockMutation,
  useDeletePoolPlayers: () => mockBatchDeleteMutation,
}))

vi.mock('../../hooks/useClubs', () => ({
  useClubs: () => ({ data: [] }),
  useAddClub: () => mockMutation,
  useRenameClub: () => mockMutation,
  useDeleteClub: () => mockMutation,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDialog() {
  render(<PlayerPoolDialog open onClose={vi.fn()} />)
}

describe('PlayerPoolDialog default sort', () => {
  it('sorts pool players by first name, not last name', () => {
    renderDialog()
    const rows = screen.getByTestId('data-table').querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('Anna Svensson')
    expect(rows[1].textContent).toContain('Karl Nilsson')
  })
})

describe('PlayerPoolDialog reset button', () => {
  it('shows "Rensa formulär (ny spelarinmatning)" button label instead of "Ny spelare"', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))

    expect(screen.getByText('Rensa formulär (ny spelarinmatning)')).toBeTruthy()
    expect(screen.queryByText('Ny spelare')).toBeNull()
  })
})

describe('PlayerPoolDialog update validation', () => {
  it('shows error when updating player with empty names', () => {
    renderDialog()

    // Select the existing player in the pool table
    fireEvent.click(screen.getByText('Anna Svensson'))

    // Switch to edit tab
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))

    // Clear both name fields
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: '' } })

    // Click update button
    fireEvent.click(screen.getByTestId('update-player'))

    expect(screen.getByTestId('name-error')).toBeTruthy()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('PlayerPoolDialog add validation', () => {
  it('shows error when adding player without any name', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))

    const addButtons = screen.getAllByText('Lägg till')
    const playerAddButton = addButtons.find((b) => b.classList.contains('btn-primary'))!
    fireEvent.click(playerAddButton)

    expect(screen.getByTestId('name-error')).toBeTruthy()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('PlayerPoolDialog discard-changes confirm', () => {
  it('shows a confirm dialog when double-clicking a player while the edit form has unsaved input', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Spelarpool'))

    fireEvent.doubleClick(screen.getByText('Anna Svensson'))

    expect(screen.getByText('Osparade ändringar')).toBeTruthy()
  })

  it('discards the pending changes and loads the chosen player when confirming', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Spelarpool'))
    fireEvent.doubleClick(screen.getByText('Anna Svensson'))

    fireEvent.click(screen.getByText('OK'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Anna')
  })

  it('keeps the in-progress form when cancelling', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Spelarpool'))
    fireEvent.doubleClick(screen.getByText('Anna Svensson'))

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Pending')
  })

  it('does not prompt when the form is clean (double-click loads immediately)', () => {
    renderDialog()

    fireEvent.doubleClick(screen.getByText('Anna Svensson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Anna')
  })

  it('does not prompt when reverting edits back to the loaded player', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Anna Svensson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Anna2' } })
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Anna' } })

    fireEvent.click(screen.getByText('Spelarpool'))
    fireEvent.doubleClick(screen.getByText('Karl Nilsson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
  })

  it('does not prompt after single-click loading a different player', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Pending' } })
    fireEvent.click(screen.getByText('Spelarpool'))
    fireEvent.click(screen.getByText('Anna Svensson'))

    fireEvent.doubleClick(screen.getByText('Karl Nilsson'))

    expect(screen.queryByText('Osparade ändringar')).toBeNull()
  })
})

describe('PlayerPoolDialog reset on reopen', () => {
  it('returns to a fresh form on the pool tab when the dialog is reopened after editing a player', () => {
    const { rerender } = render(<PlayerPoolDialog open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Anna Svensson'))
    fireEvent.click(screen.getByText('Skapa eller editera spelare'))
    expect((screen.getByTestId('first-name-input') as HTMLInputElement).value).toBe('Anna')

    rerender(<PlayerPoolDialog open={false} onClose={vi.fn()} />)
    rerender(<PlayerPoolDialog open onClose={vi.fn()} />)

    expect(screen.queryByTestId('first-name-input')).toBeNull()
    expect(screen.getByTestId('data-table')).toBeTruthy()
    const rows = screen.getByTestId('data-table').querySelectorAll('tbody tr')
    for (const row of rows) {
      expect(row.className).not.toContain('selected')
    }
  })
})

describe('PlayerPoolDialog multi-select', () => {
  it('plain click selects only that pool player', () => {
    renderDialog()

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

  it('calls batch delete with all selected pool players', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Anna Svensson'))
    fireEvent.click(screen.getByText('Karl Nilsson'), { shiftKey: true })
    fireEvent.click(screen.getByTestId('delete-from-pool'))

    expect(mockBatchDeleteMutate).toHaveBeenCalledTimes(1)
    const [ids] = mockBatchDeleteMutate.mock.calls[0]
    expect(ids.sort()).toEqual([1, 2])
  })

  it('disables delete button when no players selected', () => {
    renderDialog()

    const deleteButton = screen.getByTestId('delete-from-pool') as HTMLButtonElement
    expect(deleteButton.disabled).toBe(true)
  })
})
