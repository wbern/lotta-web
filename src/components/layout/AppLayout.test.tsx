// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('../dialogs/ConfirmDialog', () => ({ ConfirmDialog: () => null }))
vi.mock('../dialogs/EditBoardDialog', () => ({ EditBoardDialog: () => null }))
vi.mock('../dialogs/BackupExportDialog', () => ({ BackupExportDialog: () => null }))
vi.mock('../dialogs/BackupRestoreDialog', () => ({ BackupRestoreDialog: () => null }))
vi.mock('../dialogs/SeedPlayersDialog', () => ({ SeedPlayersDialog: () => null }))
vi.mock('../dialogs/RollbackDialog', () => ({ RollbackDialog: () => null }))

// Mock router
const mockSearch: { tournamentId?: number; round?: number; tab?: string } = {
  tournamentId: 1,
}
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
  Outlet: () => null,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('../../hooks/useTournaments', () => ({
  useTournaments: () => ({ data: [{ id: 1, name: 'Test' }] }),
  useTournament: () => ({ data: { id: 1, name: 'Test' } }),
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

vi.mock('../../api/tournaments', () => ({
  exportTournamentPlayers: vi.fn(),
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
  // Reset search params
  mockSearch.round = undefined
  mockSearch.tab = undefined
  mockSearch.tournamentId = 1
})

describe('AppLayout round prop', () => {
  it('passes latest round to TabPanel when no round URL param is set', () => {
    // No ?round= in URL — currentRound is undefined
    mockSearch.round = undefined
    mockSearch.tournamentId = 1

    render(<AppLayout />)

    // activeRound should fall back to latest round (3)
    expect(tabPanelProps.round).toBe(3)
  })

  it('passes explicit round to TabPanel when round URL param is set', () => {
    mockSearch.round = 2
    mockSearch.tournamentId = 1

    render(<AppLayout />)

    expect(tabPanelProps.round).toBe(2)
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
      render(<AppLayout />)

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
