// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../toast/ToastProvider'
import { AppLayout } from './AppLayout'

// Track props passed to TabPanel
let tabPanelProps: Record<string, unknown> = {}

vi.mock('./TabPanel', () => ({
  TabPanel: (props: Record<string, unknown>) => {
    tabPanelProps = props
    return <div data-testid="tab-panel" />
  },
}))

let menuBarProps: Record<string, unknown> = {}
vi.mock('./MenuBar', () => ({
  MenuBar: (props: Record<string, unknown>) => {
    menuBarProps = props
    return <div data-testid="menu-bar" />
  },
}))

vi.mock('./TournamentSelector', () => ({
  TournamentSelector: () => <div data-testid="tournament-selector" />,
}))

vi.mock('./StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}))

// Mock all dialogs to avoid deep dependency chains
vi.mock('../dialogs/TournamentDialog', () => ({ TournamentDialog: () => null }))
vi.mock('../dialogs/SettingsDialog', () => ({ SettingsDialog: () => null }))
vi.mock('../dialogs/PlayerPoolDialog', () => ({ PlayerPoolDialog: () => null }))
vi.mock('../dialogs/TournamentPlayersDialog', () => ({ TournamentPlayersDialog: () => null }))
const confirmDialogProps: Record<string, unknown>[] = []
vi.mock('../dialogs/ConfirmDialog', () => ({
  ConfirmDialog: (props: Record<string, unknown>) => {
    confirmDialogProps.push(props)
    return null
  },
}))
vi.mock('../dialogs/EditBoardDialog', () => ({ EditBoardDialog: () => null }))
vi.mock('../dialogs/BackupExportDialog', () => ({ BackupExportDialog: () => null }))
vi.mock('../dialogs/BackupRestoreDialog', () => ({ BackupRestoreDialog: () => null }))
vi.mock('../dialogs/SeedPlayersDialog', () => ({ SeedPlayersDialog: () => null }))
vi.mock('../dialogs/RollbackDialog', () => ({ RollbackDialog: () => null }))

// Mock router
const mockSearch: { tournamentId?: number; round?: number; tab?: string } = {
  tournamentId: 1,
}
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
  Outlet: () => null,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const DEFAULT_TOURNAMENT: Record<string, unknown> = { id: 1, name: 'Test' }
let currentTournament: Record<string, unknown> = { ...DEFAULT_TOURNAMENT }
vi.mock('../../hooks/useTournaments', () => ({
  useTournaments: () => ({ data: [currentTournament] }),
  useTournament: () => ({ data: currentTournament }),
  useDeleteTournament: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../hooks/useRounds', () => ({
  useRounds: () => ({
    data: [{ roundNr: 1 }, { roundNr: 2 }, { roundNr: 3 }],
  }),
  useUnpairLastRound: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ data: {} }),
}))

const mockExportTournamentPlayers = vi.fn()
vi.mock('../../api/tournaments', () => ({
  exportTournamentPlayers: (...args: unknown[]) => mockExportTournamentPlayers(...args),
  importPlayers: vi.fn(),
}))

vi.mock('../../api/backup', () => ({
  downloadBackup: vi.fn(),
  downloadEncryptedBackup: vi.fn(),
  restoreBackup: vi.fn(),
  EncryptedBackupError: class extends Error {},
}))

vi.mock('../../api/results', () => ({
  deleteGame: vi.fn(),
}))

vi.mock('../../api/publish', () => ({
  publishHtml: vi.fn(),
}))

vi.mock('../../hooks/useUndo', () => ({
  useUndoState: () => ({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }),
  useUndoActions: () => ({
    performUndo: vi.fn(),
    performRedo: vi.fn(),
    restoreToPoint: vi.fn(),
  }),
  useTimeline: () => ({ timeline: [], currentSnapshotIndex: -1 }),
}))

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))

afterEach(() => {
  cleanup()
  mockNavigate.mockClear()
  // Reset search params
  mockSearch.round = undefined
  mockSearch.tab = undefined
  mockSearch.tournamentId = 1
  // Reset tournament fixture (fresh object each test, no shared mutable state)
  currentTournament = { ...DEFAULT_TOURNAMENT }
  confirmDialogProps.length = 0
})

describe('AppLayout round prop', () => {
  it('passes latest round to TabPanel when no round URL param is set', () => {
    // No ?round= in URL — currentRound is undefined
    mockSearch.round = undefined
    mockSearch.tournamentId = 1

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    // activeRound should fall back to latest round (3)
    expect(tabPanelProps.round).toBe(3)
  })

  it('passes explicit round to TabPanel when round URL param is set', () => {
    mockSearch.round = 2
    mockSearch.tournamentId = 1

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    expect(tabPanelProps.round).toBe(2)
  })
})

describe('AppLayout pairing focus', () => {
  it('clears explicit round and switches to pairings tab when MenuBar reports a successful pairing', () => {
    mockSearch.tournamentId = 1
    mockSearch.round = 2
    mockSearch.tab = 'standings'

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    const onPaired = menuBarProps.onPaired as () => void
    expect(onPaired).toBeDefined()
    act(() => {
      onPaired()
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/',
      search: { tournamentId: 1, round: undefined, tab: 'pairings' },
    })
  })
})

describe('AppLayout delete tournament gate', () => {
  const findDeleteDialog = () =>
    confirmDialogProps.find((p) => p.open === true && p.title === 'Radera turnering')

  it('requires typed name confirmation when tournament is past draft', () => {
    mockSearch.tournamentId = 1
    currentTournament = {
      id: 1,
      name: 'Skol-DM 2026',
      group: 'A',
      roundsPlayed: 1,
      hasRecordedResults: false,
      nrOfRounds: 7,
    }

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    const onDelete = menuBarProps.onDeleteTournament as () => void
    act(() => {
      onDelete()
    })

    const deleteDialog = findDeleteDialog()
    expect(deleteDialog).toBeDefined()
    expect(deleteDialog?.confirmText).toBe('Skol-DM 2026 A')
  })

  it('does not require typed confirmation for draft tournaments', () => {
    mockSearch.tournamentId = 1
    currentTournament = {
      id: 1,
      name: 'Skol-DM 2026',
      group: 'A',
      roundsPlayed: 0,
      hasRecordedResults: false,
      nrOfRounds: 7,
    }

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    const onDelete = menuBarProps.onDeleteTournament as () => void
    act(() => {
      onDelete()
    })

    const deleteDialog = findDeleteDialog()
    expect(deleteDialog).toBeDefined()
    expect(deleteDialog?.confirmText).toBeUndefined()
  })
})

describe('AppLayout action errors', () => {
  it('surfaces the unsupported-browser update check via an error toast', async () => {
    mockSearch.tournamentId = 1
    const swDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    // jsdom defines navigator.serviceWorker, so deleting it makes the
    // `'serviceWorker' in navigator` guard fall into the unsupported branch.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker

    try {
      render(
        <ToastProvider>
          <AppLayout />
        </ToastProvider>,
      )

      const onCheckUpdates = menuBarProps.onCheckUpdates as () => Promise<void>
      await act(async () => {
        await onCheckUpdates()
      })

      const toast = await waitFor(() => screen.getByTestId('toast'))
      expect(toast.className).toContain('toast--error')
      expect(toast.textContent).toContain('stöder inte uppdateringar')
    } finally {
      if (swDescriptor) {
        Object.defineProperty(navigator, 'serviceWorker', swDescriptor)
      }
    }
  })

  it('surfaces import success via the global success toast', async () => {
    mockSearch.tournamentId = 1
    const { importPlayers: mockImportPlayers } = await import('../../api/tournaments')
    vi.mocked(mockImportPlayers).mockResolvedValue({ imported: 7 })

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    const importInput = document.querySelector(
      'input[type="file"][accept*=".tsv"], input[type="file"][accept*="text/tab-separated-values"]',
    ) as HTMLInputElement | null
    const fileInput =
      importInput ?? (document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement)
    const file = new File(['x'], 'players.tsv', { type: 'text/tab-separated-values' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const toast = await waitFor(() => screen.getByTestId('toast'))
    expect(toast.className).toContain('toast--success')
    expect(toast.textContent).toContain('7')
  })

  it('surfaces export failure via the global error toast', async () => {
    mockSearch.tournamentId = 1
    mockExportTournamentPlayers.mockRejectedValue(new Error('disk full'))

    render(
      <ToastProvider>
        <AppLayout />
      </ToastProvider>,
    )

    const onExportPlayers = menuBarProps.onExportPlayers as () => Promise<void>
    await act(async () => {
      await onExportPlayers()
    })

    const toast = await waitFor(() => screen.getByTestId('toast'))
    expect(toast.className).toContain('toast--error')
    expect(toast.textContent).toContain('Exportfel')
    expect(toast.textContent).toContain('disk full')
  })
})

describe('AppLayout alphabetical print options', () => {
  it('defers window.print so the options state commits before the snapshot', () => {
    mockSearch.tournamentId = 1
    mockSearch.tab = 'alphabetical'
    const printSpy = vi.fn()
    const originalPrint = window.print
    window.print = printSpy
    vi.useFakeTimers()

    try {
      render(
        <ToastProvider>
          <AppLayout />
        </ToastProvider>,
      )

      const onPrint = menuBarProps.onPrint as (what: string) => void
      act(() => {
        onPrint('alphabetical?groupByClass=0&compact=1')
      })

      // Must NOT print synchronously — React state would not be committed yet,
      // and the preview would reflect the previous run's options.
      expect(printSpy).not.toHaveBeenCalled()

      act(() => {
        vi.runAllTimers()
      })
      expect(printSpy).toHaveBeenCalledTimes(1)
      expect(tabPanelProps.alphaPrintGroupByClass).toBe(false)
      expect(tabPanelProps.alphaPrintCompact).toBe(true)
    } finally {
      vi.useRealTimers()
      window.print = originalPrint
    }
  })
})
