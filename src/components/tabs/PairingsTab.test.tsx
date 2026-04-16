// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDeleteGames, mockMutate, mockMutationState } = vi.hoisted(() => ({
  mockDeleteGames: vi.fn(),
  mockMutate: vi.fn(),
  mockMutationState: {
    error: null as unknown,
    variables: undefined as unknown,
    reset: vi.fn(),
  },
}))

// Mock all the hooks used by PairingsTab
vi.mock('../../hooks/useRounds', () => ({
  useRound: () => ({
    data: {
      games: [
        {
          boardNr: 1,
          whitePlayer: { name: 'White A', rating: 1500 },
          blackPlayer: { name: 'Black A', rating: 1400 },
          resultDisplay: '1-0',
          whiteScore: 1,
          blackScore: 0,
        },
        {
          boardNr: 2,
          whitePlayer: { name: 'White B', rating: 1600 },
          blackPlayer: { name: 'Black B', rating: 1300 },
          resultDisplay: '',
          whiteScore: 0,
          blackScore: 0,
        },
        {
          boardNr: 3,
          whitePlayer: { name: 'White C', rating: 1700 },
          blackPlayer: { name: 'Black C', rating: 1200 },
          resultDisplay: '',
          whiteScore: 0,
          blackScore: 0,
        },
      ],
    },
  }),
}))

vi.mock('../../hooks/useStandings', () => ({
  useSetResult: () => ({ mutate: mockMutate, ...mockMutationState }),
}))

vi.mock('../../api/results', () => ({
  deleteGame: vi.fn(),
  deleteGames: mockDeleteGames,
}))

import { PairingsTab } from './PairingsTab'

function renderTab(props?: {
  pointsPerGame?: number
  maxPointsImmediately?: boolean
  chess4?: boolean
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <PairingsTab
        tournamentId={1}
        round={1}
        rounds={[{ roundNr: 1, hasAllResults: false, gameCount: 0, games: [] }]}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('PairingsTab result cell', () => {
  afterEach(() => cleanup())

  it('renders a dropdown indicator on the result cell', () => {
    renderTab()

    const indicator = screen.getByTestId('result-dropdown-1')
    expect(indicator).toBeTruthy()
  })
})

describe('PairingsTab multi-select', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('plain click selects only that board', () => {
    renderTab()

    const rowA = screen.getByText('White A').closest('tr')!
    const rowB = screen.getByText('White B').closest('tr')!

    fireEvent.click(rowA)
    expect(rowA.className).toContain('selected')
    expect(rowB.className).not.toContain('selected')

    // Plain click on B replaces selection
    fireEvent.click(rowB)
    expect(rowA.className).not.toContain('selected')
    expect(rowB.className).toContain('selected')

    // Clicking already-selected item keeps it selected
    fireEvent.click(rowB)
    expect(rowB.className).toContain('selected')
  })
})

describe('PairingsTab arrow key navigation', () => {
  afterEach(() => {
    cleanup()
    mockMutate.mockClear()
  })

  it('moves selection to the next row when ArrowDown is pressed on a focused row', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowA)
    expect(rowA.className).toContain('selected')

    fireEvent.keyDown(rowA, { key: 'ArrowDown' })

    expect(rowA.className).not.toContain('selected')
    expect(rowB.className).toContain('selected')
  })

  it('moves selection to the previous row when ArrowUp is pressed on a focused row', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowB)
    expect(rowB.className).toContain('selected')

    fireEvent.keyDown(rowB, { key: 'ArrowUp' })

    expect(rowB.className).not.toContain('selected')
    expect(rowA.className).toContain('selected')
  })

  it('clamps at the first and last row instead of wrapping', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowC = screen.getByText('White C').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowA)
    fireEvent.keyDown(rowA, { key: 'ArrowUp' })
    expect(rowA.className).toContain('selected')
    expect(rowC.className).not.toContain('selected')

    fireEvent.click(rowC)
    fireEvent.keyDown(rowC, { key: 'ArrowDown' })
    expect(rowC.className).toContain('selected')
    expect(rowA.className).not.toContain('selected')
  })

  it('moves focus to the new row so result-entry keys continue to work', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    rowA.focus()
    fireEvent.click(rowA)
    expect(document.activeElement).toBe(rowA)

    fireEvent.keyDown(rowA, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(rowB)
  })

  it('ignores arrow keys when focus is outside the table', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowA)
    expect(rowA.className).toContain('selected')

    // Arrow key dispatched on document (focus elsewhere) should not move selection
    fireEvent.keyDown(document, { key: 'ArrowDown' })

    expect(rowA.className).toContain('selected')
    expect(rowB.className).not.toContain('selected')
  })

  it('focuses the next row after a finished result auto-advances selection', () => {
    renderTab()
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement
    const rowC = screen.getByText('White C').closest('tr') as HTMLTableRowElement

    rowB.focus()
    fireEvent.click(rowB)
    expect(document.activeElement).toBe(rowB)

    // 'v' with default ppg=1 sets WHITE_WIN, sum=1 → finished → auto-advance
    fireEvent.keyDown(document, { key: 'v' })

    expect(rowC.className).toContain('selected')
    expect(document.activeElement).toBe(rowC)
  })
})

describe('PairingsTab keyboard score entry', () => {
  afterEach(() => {
    cleanup()
    mockMutate.mockClear()
  })

  it('ignores numeric keys outside the scoring system (key 5 with ppg=4)', () => {
    renderTab({ pointsPerGame: 4, maxPointsImmediately: false })

    // Select board 2 (no result yet)
    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    // Press '5' — ppg=4, so 5 is out of range and should be ignored
    fireEvent.keyDown(document, { key: '5' })

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('accepts numeric keys matching pointsPerGame even with maxPointsImmediately off (Skollags-DM)', () => {
    // Skollags-DM default: ppg=2, maxPointsImmediately=false.
    // Keybinds must match the visible 2-0/1-1/0-2 labels.
    renderTab({ pointsPerGame: 2, maxPointsImmediately: false })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '2' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 2, blackScore: 0, expectedPrior: 'NO_RESULT' },
    })
  })

  it('accepts numeric key 1 as draw with maxPointsImmediately off (Skollags-DM)', () => {
    renderTab({ pointsPerGame: 2, maxPointsImmediately: false })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '1' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'DRAW', whiteScore: 1, blackScore: 1, expectedPrior: 'NO_RESULT' },
    })
  })

  it('accepts numeric key 3 as white win (3-1) in Schackfyran (chess4, ppg=4)', () => {
    renderTab({ pointsPerGame: 4, chess4: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '3' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 3, blackScore: 1, expectedPrior: 'NO_RESULT' },
    })
  })

  it('accepts numeric key 2 as draw (2-2) in Schackfyran (chess4, ppg=4)', () => {
    renderTab({ pointsPerGame: 4, chess4: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '2' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'DRAW', whiteScore: 2, blackScore: 2, expectedPrior: 'NO_RESULT' },
    })
  })

  it('accepts numeric key 0 as clear (NO_RESULT) in Schackfyran', () => {
    renderTab({ pointsPerGame: 4, chess4: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '0' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'NO_RESULT', whiteScore: 0, blackScore: 0, expectedPrior: 'NO_RESULT' },
    })
  })

  it('ignores numeric key exceeding ppg even when maxPointsImmediately is on', () => {
    renderTab({ pointsPerGame: 2, maxPointsImmediately: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: '3' })

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('r key produces a draw with scaled scores when maxPointsImmediately is on with ppg=4', () => {
    renderTab({ pointsPerGame: 4, maxPointsImmediately: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: 'r' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'DRAW', whiteScore: 2, blackScore: 2, expectedPrior: 'NO_RESULT' },
    })
  })

  it('v key produces white win with scaled scores when maxPointsImmediately is on with ppg=4', () => {
    renderTab({ pointsPerGame: 4, maxPointsImmediately: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: 'v' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 4, blackScore: 0, expectedPrior: 'NO_RESULT' },
    })
  })

  it('f key produces black win with scaled scores when maxPointsImmediately is on with ppg=4', () => {
    renderTab({ pointsPerGame: 4, maxPointsImmediately: true })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: 'f' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'BLACK_WIN', whiteScore: 0, blackScore: 4, expectedPrior: 'NO_RESULT' },
    })
  })

  it('semantic keys use pointsPerGame scale even when maxPointsImmediately is off (ppg>1)', () => {
    // When ppg > 1 the tournament is opting into a multi-point scoring system,
    // so V / R / F must produce scaled scores that match the displayed labels
    // regardless of the maxPointsImmediately setting.
    renderTab({ pointsPerGame: 4, maxPointsImmediately: false })

    const row = screen.getByText('White B').closest('tr')!
    fireEvent.click(row)

    fireEvent.keyDown(document, { key: 'v' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 4, blackScore: 0, expectedPrior: 'NO_RESULT' },
    })
  })
})

describe('ContextMenuPopup keyboard hints', () => {
  afterEach(() => cleanup())

  it('shows shortcut hints next to result menu items (standard 1-½-0)', () => {
    renderTab()

    const resultCell = screen.getByTestId('result-dropdown-2')
    fireEvent.contextMenu(resultCell)

    // Standard scoring: V/1 for white, R/Ö for draw (no numeric — ½ isn't typeable),
    // F/0 for black, Space for no-result.
    expect(screen.getByTestId('shortcut-no-result').textContent).toBe('Space')
    expect(screen.getByTestId('shortcut-white-win').textContent).toBe('V / 1')
    expect(screen.getByTestId('shortcut-draw').textContent).toBe('R / Ö')
    expect(screen.getByTestId('shortcut-black-win').textContent).toBe('F / 0')
  })

  it('shows numeric shortcut hints adapted to Schackfyran (chess4)', () => {
    renderTab({ chess4: true, pointsPerGame: 4 })

    const resultCell = screen.getByTestId('result-dropdown-2')
    fireEvent.contextMenu(resultCell)

    expect(screen.getByTestId('shortcut-no-result').textContent).toBe('Space / 0')
    expect(screen.getByTestId('shortcut-white-win').textContent).toBe('V / 3')
    expect(screen.getByTestId('shortcut-draw').textContent).toBe('R / Ö / 2')
    expect(screen.getByTestId('shortcut-black-win').textContent).toBe('F / 1')
  })

  it('shows numeric shortcut hints adapted to Skollags-DM (ppg=2)', () => {
    renderTab({ pointsPerGame: 2, maxPointsImmediately: false })

    const resultCell = screen.getByTestId('result-dropdown-2')
    fireEvent.contextMenu(resultCell)

    expect(screen.getByTestId('shortcut-white-win').textContent).toBe('V / 2')
    expect(screen.getByTestId('shortcut-draw').textContent).toBe('R / Ö / 1')
    expect(screen.getByTestId('shortcut-black-win').textContent).toBe('F / 0')
  })
})

describe('ContextMenuPopup viewport positioning', () => {
  afterEach(() => cleanup())

  it('flips menu upward when opened near the bottom of the viewport', () => {
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      value: 500,
      writable: true,
      configurable: true,
    })
    try {
      renderTab()

      const resultCell = screen.getByTestId('result-dropdown-2')
      fireEvent.contextMenu(resultCell, { clientX: 10, clientY: 400 })

      const menu = document.querySelector('.context-menu') as HTMLElement
      expect(menu).toBeTruthy()
      expect(menu.style.bottom).toBe('100px')
      expect(menu.style.top).toBe('')
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        value: originalHeight,
        writable: true,
        configurable: true,
      })
    }
  })
})

describe('ContextMenuPopup sends correct scores for ppg>1', () => {
  afterEach(() => {
    cleanup()
    mockMutate.mockClear()
  })

  it('passes scaled scores when selecting white win via context menu with ppg=4 chess4', () => {
    renderTab({ pointsPerGame: 4, chess4: true })

    // Right-click on board 2 to open context menu
    const resultCell = screen.getByTestId('result-dropdown-2')
    fireEvent.contextMenu(resultCell)

    // Click "Vit vinst"
    const whiteWinBtn = screen.getByTestId('shortcut-white-win').closest('button')!
    fireEvent.click(whiteWinBtn)

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 3, blackScore: 1, expectedPrior: 'NO_RESULT' },
    })
  })
})

describe('PairingsTab keyboard focus restriction', () => {
  afterEach(() => {
    cleanup()
    mockMutate.mockClear()
  })

  it('ignores result-entry keys when focus is outside a pairings row', () => {
    renderTab()
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowB)
    expect(document.activeElement).toBe(rowB)

    rowB.blur()
    expect(document.activeElement).not.toBe(rowB)

    fireEvent.keyDown(document, { key: 'v' })

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('handles result keys on the row that auto-advanced after a finished result', () => {
    renderTab()
    const rowA = screen.getByText('White A').closest('tr') as HTMLTableRowElement
    const rowB = screen.getByText('White B').closest('tr') as HTMLTableRowElement

    fireEvent.click(rowA)
    expect(document.activeElement).toBe(rowA)

    fireEvent.keyDown(document, { key: 'v' })
    expect(rowB.className).toContain('selected')
    expect(document.activeElement).toBe(rowB)

    mockMutate.mockClear()
    fireEvent.keyDown(document, { key: 'v' })

    expect(mockMutate).toHaveBeenCalledWith({
      boardNr: 2,
      req: { resultType: 'WHITE_WIN', whiteScore: 1, blackScore: 0, expectedPrior: 'NO_RESULT' },
    })
  })
})

describe('PairingsTab conflict notification', () => {
  afterEach(() => {
    cleanup()
    mockMutationState.error = null
    mockMutationState.variables = undefined
    mockMutationState.reset.mockClear()
  })

  it('shows conflict notification when ResultConflictError occurs', async () => {
    const { ResultConflictError } = await import('../../api/result-command')
    mockMutationState.error = new ResultConflictError('WHITE_WIN')
    mockMutationState.variables = { boardNr: 1 }

    renderTab()

    const notification = screen.getByTestId('conflict-notification')
    expect(notification.textContent).toContain('Bord 1')
    expect(notification.textContent).toContain('1-0')
  })

  it('uses chess4 labels in conflict notification so Schack4an shows 3-1 not 1-0', async () => {
    const { ResultConflictError } = await import('../../api/result-command')
    mockMutationState.error = new ResultConflictError('WHITE_WIN')
    mockMutationState.variables = { boardNr: 1 }

    renderTab({ chess4: true, pointsPerGame: 4 })

    const notification = screen.getByTestId('conflict-notification')
    expect(notification.textContent).toContain('3-1')
    expect(notification.textContent).not.toContain('1-0')
  })

  it('does not show notification when no conflict error', () => {
    mockMutationState.error = null
    renderTab()

    expect(screen.queryByTestId('conflict-notification')).toBeNull()
  })
})
