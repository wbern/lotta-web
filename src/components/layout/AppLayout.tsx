import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import {
  downloadBackup,
  downloadEncryptedBackup,
  downloadLegacyBackup,
  EncryptedBackupError,
  restoreBackup,
} from '../../api/backup'
import { publishHtml } from '../../api/publish'
import { deleteGame } from '../../api/results'
import { exportTournamentPlayers, importPlayers } from '../../api/tournaments'
import { tournamentLockState } from '../../domain/tournament-lock'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useLiveStatus } from '../../hooks/useLiveStatus'
import { useRounds, useUnpairLastRound } from '../../hooks/useRounds'
import { useSettings } from '../../hooks/useSettings'
import { useDeleteTournament, useTournament, useTournaments } from '../../hooks/useTournaments'
import { useTimeline, useUndoActions, useUndoState } from '../../hooks/useUndo'
import { useClientP2PStore } from '../../stores/client-p2p-store'
import { ClientOverlay } from '../ClientOverlay'
import { AddGroupDialog } from '../dialogs/AddGroupDialog'
import { BackupExportDialog } from '../dialogs/BackupExportDialog'
import { BackupRestoreDialog } from '../dialogs/BackupRestoreDialog'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import { EditBoardDialog } from '../dialogs/EditBoardDialog'
import { PlayerPoolDialog } from '../dialogs/PlayerPoolDialog'
import { RollbackDialog } from '../dialogs/RollbackDialog'
import { SeedPlayersDialog } from '../dialogs/SeedPlayersDialog'
import { SettingsDialog } from '../dialogs/SettingsDialog'
import { TournamentDialog } from '../dialogs/TournamentDialog'
import { TournamentPlayersDialog } from '../dialogs/TournamentPlayersDialog'
import { SpectatorLayout } from '../SpectatorLayout'
import { useToast } from '../toast/useToast'
import { MenuBar } from './MenuBar'
import { StatusBar } from './StatusBar'
import { TabPanel } from './TabPanel'
import { TimelinePanel } from './TimelinePanel'
import { TournamentSelector } from './TournamentSelector'

export function AppLayout() {
  const search = useSearch({ strict: false }) as {
    tournamentId?: number
    round?: number
    tab?: string
  }
  const navigate = useNavigate()

  const { data: tournaments } = useTournaments()
  const tournamentId = search.tournamentId
  const { data: tournament } = useTournament(tournamentId)
  const { data: rounds } = useRounds(tournamentId)
  const deleteTournament = useDeleteTournament()
  const unpairMutation = useUnpairLastRound(tournamentId)
  const { data: settings } = useSettings()
  const queryClient = useQueryClient()
  const { canUndo, canRedo } = useUndoState()
  const { performUndo, performRedo, restoreToPoint } = useUndoActions()
  const { timeline, currentSnapshotIndex } = useTimeline()
  const [showTimeline, setShowTimeline] = useState(false)
  const liveStatus = useLiveStatus()
  const { shareMode } = useClientP2PStore()

  const handleUndo = useCallback(() => {
    void performUndo()
  }, [performUndo])

  const handleRedo = useCallback(() => {
    void performRedo()
  }, [performRedo])

  const handleRestoreToPoint = useCallback(
    (snapshotIndex: number) => {
      void restoreToPoint(snapshotIndex)
    },
    [restoreToPoint],
  )

  useKeyboardShortcuts({ onUndo: handleUndo, onRedo: handleRedo })

  const currentRound = search.round
  const currentTab = search.tab === 'domare' ? 'live' : search.tab || 'pairings'

  // Derive latest round number
  const latestRoundNr = rounds && rounds.length > 0 ? rounds[rounds.length - 1].roundNr : undefined
  const activeRound = currentRound ?? latestRoundNr

  // Dialog state
  const [showTournamentDialog, setShowTournamentDialog] = useState(false)
  const [tournamentDialogEditId, setTournamentDialogEditId] = useState<number | undefined>()
  const [tournamentDialogInitialName, setTournamentDialogInitialName] = useState<
    string | undefined
  >()
  const [tournamentDialogPresetFromId, setTournamentDialogPresetFromId] = useState<
    number | undefined
  >()
  const [showAddGroupDialog, setShowAddGroupDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPlayerPool, setShowPlayerPool] = useState(false)
  const [showTournamentPlayers, setShowTournamentPlayers] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showUnpairConfirm, setShowUnpairConfirm] = useState(false)
  const [showEditBoard, setShowEditBoard] = useState(false)
  const [editBoardMode, setEditBoardMode] = useState<'add' | 'edit'>('add')
  const [editBoardNr, setEditBoardNr] = useState<number | undefined>()
  const { show: showToast } = useToast()
  const showActionError = useCallback(
    (message: string) => {
      showToast({ message, variant: 'error' })
    },
    [showToast],
  )
  const [showBackupExport, setShowBackupExport] = useState(false)
  const [showBackupRestore, setShowBackupRestore] = useState(false)
  const [showSeedPlayers, setShowSeedPlayers] = useState(false)
  const [showRollbackDialog, setShowRollbackDialog] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  // Selected board for edit/delete operations
  const [selectedBoard, setSelectedBoard] = useState<number | undefined>()

  const setTournamentId = (id: number | undefined) => {
    navigate({ to: '/', search: { tournamentId: id, round: currentRound, tab: currentTab } })
  }

  const setRound = (round: number | undefined) => {
    navigate({ to: '/', search: { tournamentId, round, tab: currentTab } })
  }

  const setTab = (tab: string) => {
    navigate({ to: '/', search: { tournamentId, round: currentRound, tab } })
  }

  const handleNewTournament = () => {
    setTournamentDialogEditId(undefined)
    setTournamentDialogInitialName(undefined)
    setTournamentDialogPresetFromId(undefined)
    setShowTournamentDialog(true)
  }

  const handleEditTournament = () => {
    setTournamentDialogEditId(tournamentId)
    setTournamentDialogInitialName(undefined)
    setTournamentDialogPresetFromId(undefined)
    setShowTournamentDialog(true)
  }

  const handleAddGroup = () => {
    setShowAddGroupDialog(true)
  }

  const handleAddGroupConfirm = ({
    name,
    presetFromId,
  }: {
    name: string
    presetFromId: number | undefined
  }) => {
    setShowAddGroupDialog(false)
    setTournamentDialogEditId(undefined)
    setTournamentDialogInitialName(name)
    setTournamentDialogPresetFromId(presetFromId)
    setShowTournamentDialog(true)
  }

  const handleDeleteTournament = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    if (tournamentId != null) {
      deleteTournament.mutate(tournamentId, {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          navigate({
            to: '/',
            search: { tournamentId: undefined, round: undefined, tab: currentTab },
          })
        },
      })
    }
  }

  const tournamentFullName = tournament
    ? `${tournament.name}${tournament.group ? ' ' + tournament.group : ''}`
    : ''
  const tournamentIsLocked = !!tournament && tournamentLockState(tournament) !== 'draft'

  const [alphaPrintOptions, setAlphaPrintOptions] = useState({
    groupByClass: true,
    compact: false,
    hideOpponentLastName: false,
  })

  const handlePrint = (what: string) => {
    const [baseName, query = ''] = what.split('?')
    if (baseName === 'alphabetical') {
      const params = new URLSearchParams(query)
      setAlphaPrintOptions({
        groupByClass: params.get('groupByClass') !== '0',
        compact: params.get('compact') === '1',
        hideOpponentLastName: params.get('hideOppLast') === '1',
      })
    }

    // Switch to the appropriate tab first, then print
    const tabMap: Record<string, string> = {
      pairings: 'pairings',
      standings: 'standings',
      players: 'players',
      alphabetical: 'alphabetical',
      'club-standings': 'club-standings',
      'chess4-standings': 'chess4-standings',
    }
    const tab = tabMap[baseName]
    if (tab && tab !== currentTab) {
      navigate({ to: '/', search: { tournamentId, round: currentRound, tab } })
      // Small delay to let the tab render before printing
      setTimeout(() => window.print(), 200)
    } else if (baseName === 'alphabetical') {
      // Alphabetical prints read alphaPrintOptions, which we just scheduled
      // an update for. Defer so React commits the state before window.print
      // snapshots the DOM — otherwise the preview shows the previous options.
      setTimeout(() => window.print(), 50)
    } else {
      window.print()
    }
  }

  const handleAddBoard = () => {
    setEditBoardMode('add')
    setEditBoardNr(undefined)
    setShowEditBoard(true)
  }

  const handleEditBoard = () => {
    if (selectedBoard != null) {
      setEditBoardMode('edit')
      setEditBoardNr(selectedBoard)
      setShowEditBoard(true)
    }
  }

  const handleEditBoardByNr = (boardNr: number) => {
    setEditBoardMode('edit')
    setEditBoardNr(boardNr)
    setShowEditBoard(true)
  }

  const handleDeleteBoard = async () => {
    if (selectedBoard == null) return
    if (tournamentId != null && activeRound != null) {
      if (confirm(`Är du säker på att du vill ta bort bord ${selectedBoard}?`)) {
        await deleteGame(tournamentId, activeRound, selectedBoard)
        queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'rounds'] })
      }
    }
  }

  const handleExportPlayers = async () => {
    if (tournamentId == null) return
    try {
      const blob = await exportTournamentPlayers(tournamentId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tournament?.name || 'spelare'}.tsv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showActionError('Exportfel: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handlePublish = async (what: string) => {
    if (tournamentId == null) return
    try {
      const blob = await publishHtml(tournamentId, what, activeRound ?? undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = what.split('?')[0]
      a.download = `${baseName}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showActionError('Publiceringsfel: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleImportPlayers = () => {
    importFileRef.current?.click()
  }

  const handleCheckUpdates = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      showToast({
        message: 'Den här webbläsaren stöder inte uppdateringar.',
        variant: 'error',
      })
      return
    }
    const dismissSearching = showToast({
      message: 'Söker efter uppdateringar…',
      variant: 'info',
    })
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      dismissSearching()
      if (!reg) {
        showToast({ message: 'Ingen uppdateringstjänst registrerad ännu.', variant: 'info' })
        return
      }
      await reg.update()
      if (reg.installing || reg.waiting) {
        showToast({
          message: 'Ny version hittades. Uppdateringen visas strax.',
          variant: 'success',
        })
      } else {
        showToast({ message: 'Appen är redan uppdaterad.', variant: 'success' })
      }
    } catch {
      dismissSearching()
      showToast({ message: 'Kunde inte söka efter uppdateringar.', variant: 'error' })
    }
  }, [showToast])

  const backupFileRef = useRef<HTMLInputElement>(null)

  const handleBackup = () => {
    setShowBackupExport(true)
  }

  const handleExport = async (password: string | undefined, legacyCompat: boolean) => {
    try {
      let blob: Blob
      let filename: string
      if (password) {
        blob = await downloadEncryptedBackup(password, legacyCompat)
        filename = legacyCompat ? 'lotta-backup-gammal.sqlite.enc' : 'lotta-backup.sqlite.enc'
      } else if (legacyCompat) {
        blob = await downloadLegacyBackup()
        filename = 'lotta-backup-gammal.sqlite'
      } else {
        blob = await downloadBackup()
        filename = 'lotta-backup.sqlite'
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showActionError('Säkerhetskopieringsfel: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleRestore = () => {
    backupFileRef.current?.click()
  }

  const handleRollbackSwitch = (version: string) => {
    window.location.assign(`${import.meta.env.BASE_URL}v/${version}/`)
  }

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      await restoreBackup(file)
      queryClient.invalidateQueries()
      navigate({ to: '/', search: { tournamentId: undefined, round: undefined, tab: currentTab } })
    } catch (err) {
      if (err instanceof EncryptedBackupError) {
        setPendingRestoreFile(file)
        setRestoreError('')
        setShowBackupRestore(true)
      } else {
        showActionError('Återställningsfel: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

  const handleRestoreWithPassword = async (password: string) => {
    if (!pendingRestoreFile) return
    try {
      await restoreBackup(pendingRestoreFile, password)
      setShowBackupRestore(false)
      setPendingRestoreFile(null)
      setRestoreError('')
      queryClient.invalidateQueries()
      navigate({ to: '/', search: { tournamentId: undefined, round: undefined, tab: currentTab } })
    } catch {
      setRestoreError('Fel lösenord eller skadad fil')
    }
  }

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await importPlayers(file)
      showToast({
        message: `${res.imported} nya spelare tillagda som tillgängliga spelare.`,
        variant: 'success',
        autoDismissMs: 4000,
      })
      queryClient.invalidateQueries({ queryKey: ['players'] })
    } catch (err) {
      showActionError('Fel vid import: ' + (err instanceof Error ? err.message : String(err)))
    }
    // Reset file input so same file can be selected again
    e.target.value = ''
  }

  if (shareMode === 'view') {
    return (
      <div className="app-layout">
        <SpectatorLayout />
        <StatusBar
          tournament={undefined}
          round={undefined}
          liveState={liveStatus?.state}
          liveRole={liveStatus?.role}
          livePeerCount={liveStatus?.peerCount}
          livePendingCount={liveStatus?.pendingCount}
        />
        <ClientOverlay />
      </div>
    )
  }

  return (
    <div className="app-layout">
      <MenuBar
        tournamentId={tournamentId}
        roundNr={activeRound}
        chess4={tournament?.chess4}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShowTimeline={() => setShowTimeline(true)}
        onNewTournament={handleNewTournament}
        onEditTournament={handleEditTournament}
        onAddGroup={handleAddGroup}
        onDeleteTournament={handleDeleteTournament}
        onPlayerPool={() => setShowPlayerPool(true)}
        onTournamentPlayers={() => setShowTournamentPlayers(true)}
        onSettings={() => setShowSettings(true)}
        onBackup={handleBackup}
        onRestore={handleRestore}
        onAddBoard={handleAddBoard}
        onEditBoard={handleEditBoard}
        onDeleteBoard={handleDeleteBoard}
        onPrint={handlePrint}
        onExportPlayers={handleExportPlayers}
        onImportPlayers={handleImportPlayers}
        onSeedPlayers={() => setShowSeedPlayers(true)}
        onPublish={handlePublish}
        onUnpair={() => setShowUnpairConfirm(true)}
        onCheckUpdates={handleCheckUpdates}
        onRollback={() => setShowRollbackDialog(true)}
        onPaired={() =>
          navigate({ to: '/', search: { tournamentId, round: undefined, tab: 'pairings' } })
        }
      />
      <TournamentSelector
        tournaments={tournaments || []}
        selectedTournamentId={tournamentId}
        onSelectTournament={setTournamentId}
        rounds={rounds || []}
        selectedRound={activeRound}
        onSelectRound={setRound}
      />
      <TabPanel
        activeTab={currentTab}
        onTabChange={setTab}
        tournamentId={tournamentId}
        tournamentName={tournament?.name}
        round={activeRound}
        rounds={rounds || []}
        onBoardSelect={setSelectedBoard}
        onEditBoard={handleEditBoardByNr}
        chess4={tournament?.chess4}
        showELO={tournament?.showELO}
        showGroup={tournament?.showGroup}
        pointsPerGame={tournament?.pointsPerGame}
        maxPointsImmediately={settings?.maxPointsImmediately}
        alphaPrintGroupByClass={alphaPrintOptions.groupByClass}
        alphaPrintCompact={alphaPrintOptions.compact}
        alphaPrintHideOpponentLastName={alphaPrintOptions.hideOpponentLastName}
      />
      <StatusBar
        tournament={tournament}
        round={currentRound}
        liveState={liveStatus?.state}
        liveRole={liveStatus?.role}
        livePeerCount={liveStatus?.peerCount}
        livePendingCount={liveStatus?.pendingCount}
        onLiveClick={() =>
          navigate({
            to: '/',
            search: { tournamentId, round: currentRound, tab: 'live' },
          })
        }
      />
      {liveStatus?.role === 'client' && <ClientOverlay />}
      <Outlet />

      {/* Dialogs */}
      <TournamentDialog
        open={showTournamentDialog}
        tournamentId={tournamentDialogEditId}
        initialName={tournamentDialogInitialName}
        presetFromTournamentId={tournamentDialogPresetFromId}
        onClose={() => setShowTournamentDialog(false)}
        onCreated={(id) => setTournamentId(id)}
      />
      <AddGroupDialog
        open={showAddGroupDialog}
        tournaments={tournaments || []}
        currentTournamentId={tournamentId}
        onClose={() => setShowAddGroupDialog(false)}
        onConfirm={handleAddGroupConfirm}
      />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <PlayerPoolDialog open={showPlayerPool} onClose={() => setShowPlayerPool(false)} />
      {tournamentId != null && (
        <TournamentPlayersDialog
          open={showTournamentPlayers}
          tournamentId={tournamentId}
          tournamentName={tournament?.name}
          onClose={() => setShowTournamentPlayers(false)}
        />
      )}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Radera turnering"
        message={
          tournamentIsLocked
            ? `Turneringen ${tournamentFullName} är lottad. All data (lottningar, resultat, spelare) raderas permanent och kan inte återställas.`
            : `Är du säker på att du vill ta bort turneringen ${tournamentFullName}?`
        }
        confirmText={tournamentIsLocked ? tournamentFullName : undefined}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmDialog
        open={showUnpairConfirm}
        title="Ångra lottning"
        message="Är du säker på att du vill ångra lottningen för den senaste ronden? Om resultat finns så kommer de att tas bort."
        onConfirm={() => {
          unpairMutation.mutate(undefined, {
            onSuccess: () => setShowUnpairConfirm(false),
            onError: (err) => {
              setShowUnpairConfirm(false)
              showActionError(err.message)
            },
          })
        }}
        onCancel={() => setShowUnpairConfirm(false)}
      />
      {tournamentId != null && activeRound != null && (
        <EditBoardDialog
          open={showEditBoard}
          tournamentId={tournamentId}
          roundNr={activeRound}
          mode={editBoardMode}
          boardNr={editBoardNr}
          onClose={() => setShowEditBoard(false)}
        />
      )}
      <BackupExportDialog
        open={showBackupExport}
        onClose={() => setShowBackupExport(false)}
        onExport={handleExport}
      />
      <BackupRestoreDialog
        open={showBackupRestore}
        onClose={() => {
          setShowBackupRestore(false)
          setPendingRestoreFile(null)
          setRestoreError('')
        }}
        onSubmit={handleRestoreWithPassword}
        error={restoreError}
      />
      <SeedPlayersDialog
        open={showSeedPlayers}
        onClose={() => setShowSeedPlayers(false)}
        tournamentId={tournamentId}
      />
      <RollbackDialog
        open={showRollbackDialog}
        onClose={() => setShowRollbackDialog(false)}
        onSwitch={handleRollbackSwitch}
      />
      <input
        ref={importFileRef}
        type="file"
        accept=".tsv,.txt,.csv"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />
      <input
        ref={backupFileRef}
        type="file"
        accept=".sqlite,.db,.enc"
        style={{ display: 'none' }}
        onChange={handleRestoreFileChange}
      />
      <TimelinePanel
        open={showTimeline}
        onClose={() => setShowTimeline(false)}
        entries={timeline}
        currentSnapshotIndex={currentSnapshotIndex}
        onRestoreToPoint={handleRestoreToPoint}
      />
    </div>
  )
}
