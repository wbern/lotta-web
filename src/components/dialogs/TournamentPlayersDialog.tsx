import { useCallback, useEffect, useRef, useState } from 'react'
import { tournamentLockState } from '../../domain/tournament-lock'
import { useAddClub, useClubs, useDeleteClub, useRenameClub } from '../../hooks/useClubs'
import { usePoolPlayers } from '../../hooks/usePlayers'
import { useShiftSelect } from '../../hooks/useShiftSelect'
import { useTableSort } from '../../hooks/useTableSort'
import {
  useAddTournamentPlayer,
  useAddTournamentPlayers,
  useRemoveTournamentPlayers,
  useTournamentPlayers,
  useUpdateTournamentPlayer,
} from '../../hooks/useTournamentPlayers'
import { useTournament } from '../../hooks/useTournaments'
import { useTransientSuccess } from '../../hooks/useTransientSuccess'
import { sv } from '../../lib/swedish-text'
import type { PlayerDto } from '../../types/api'
import { SortableHeader } from '../SortableHeader'
import { useToast } from '../toast/useToast'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { PlayerEditor } from './PlayerEditor'
import { samePlayer } from './playerForm'

interface Props {
  open: boolean
  tournamentId: number
  tournamentName?: string
  onClose: () => void
}

const emptyPlayer: Partial<PlayerDto> = {
  firstName: '',
  lastName: '',
  clubIndex: 0,
  ratingN: 0,
  ratingI: 0,
  ratingQ: 0,
  ratingB: 0,
  ratingK: 0,
  ratingKQ: 0,
  ratingKB: 0,
  title: '',
  sex: '',
  federation: 'SWE',
  fideId: 0,
  ssfId: 0,
  playerGroup: '',
  withdrawnFromRound: -1,
  manualTiebreak: 0,
}

export function TournamentPlayersDialog({ open, tournamentId, tournamentName, onClose }: Props) {
  const { data: tournamentPlayers } = useTournamentPlayers(tournamentId)
  const { data: tournament } = useTournament(tournamentId)
  const { data: poolPlayers } = usePoolPlayers()
  const { data: clubs } = useClubs()
  // While `tournament` is loading, treat the gate as engaged so the destructive
  // button stays disabled rather than briefly flashing enabled before resolving.
  const removeBlocked = tournament
    ? tournamentLockState({
        roundsPlayed: tournament.roundsPlayed,
        hasRecordedResults: tournament.hasRecordedResults,
        nrOfRounds: tournament.nrOfRounds,
      }) !== 'draft'
    : true
  const addPlayer = useAddTournamentPlayer(tournamentId)
  const addPlayers = useAddTournamentPlayers(tournamentId)
  const updatePlayer = useUpdateTournamentPlayer(tournamentId)
  // Hold this dialog's "Uppdatera uppgifter" confirmation visible long enough
  // to read — 2s feels like a status flash, the 1.5s default reads as a wink.
  const updateSaved = useTransientSuccess(updatePlayer.isSuccess, 2000)
  const removePlayers = useRemoveTournamentPlayers(tournamentId)
  const addClub = useAddClub()
  const renameClub = useRenameClub()
  const deleteClub = useDeleteClub()

  const [selectedTournamentPlayers, setSelectedTournamentPlayers] = useState<Set<number>>(new Set())
  const [selectedPoolPlayers, setSelectedPoolPlayers] = useState<Set<number>>(new Set())
  const [editPlayer, setEditPlayer] = useState<Partial<PlayerDto>>({ ...emptyPlayer })
  const [baseline, setBaseline] = useState<Partial<PlayerDto>>({ ...emptyPlayer })
  const [isNew, setIsNew] = useState(true)
  const [activeTab, setActiveTab] = useState<'edit' | 'tournament' | 'pool'>('tournament')
  const [nameError, setNameError] = useState('')
  const [pendingPlayer, setPendingPlayer] = useState<PlayerDto | null>(null)
  const { show: showToast } = useToast()

  const isDirty = !samePlayer(editPlayer, baseline)

  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelectedTournamentPlayers(new Set())
      setSelectedPoolPlayers(new Set())
      setEditPlayer({ ...emptyPlayer })
      setBaseline({ ...emptyPlayer })
      setIsNew(true)
      setActiveTab('tournament')
      setNameError('')
      setPendingPlayer(null)
    }
    wasOpen.current = open
  }, [open])

  // Available = pool players not already in tournament.
  // Pool and tournament tables have independent auto-increment IDs, so we match
  // by SSF ID when available (unique per federation member), otherwise by
  // name + club + birthdate to avoid filtering out different people who share a name.
  const tournamentBySsfId = new Set(
    (tournamentPlayers || []).filter((p) => p.ssfId > 0).map((p) => p.ssfId),
  )
  const tournamentByKey = new Set(
    (tournamentPlayers || [])
      .filter((p) => !p.ssfId)
      .map((p) => `${p.lastName}\0${p.firstName}\0${p.clubIndex}\0${p.birthdate ?? ''}`),
  )
  const available = (poolPlayers || []).filter((p) => {
    if (p.ssfId > 0) return !tournamentBySsfId.has(p.ssfId)
    return !tournamentByKey.has(
      `${p.lastName}\0${p.firstName}\0${p.clubIndex}\0${p.birthdate ?? ''}`,
    )
  })

  const getValue = useCallback((p: PlayerDto, col: string): string | number | null => {
    if (col === 'name') return `${p.firstName}, ${p.lastName}`
    if (col === 'club') return p.club
    if (col === 'group') return p.playerGroup
    if (col === 'rating') return p.ratingI
    return null
  }, [])

  const {
    sorted: sortedTournament,
    sort: sortT,
    toggleSort: toggleSortT,
  } = useTableSort(tournamentPlayers || [], { column: 'name', direction: 'asc' }, getValue)

  const {
    sorted: sortedAvailable,
    sort: sortA,
    toggleSort: toggleSortA,
  } = useTableSort(available, { column: 'name', direction: 'asc' }, getValue)

  const tournamentShiftSelect = useShiftSelect(sortedTournament, setSelectedTournamentPlayers)
  const poolShiftSelect = useShiftSelect(sortedAvailable, setSelectedPoolPlayers)

  const handleSelectTournamentPlayer = (p: PlayerDto, event: React.MouseEvent) => {
    tournamentShiftSelect.handleClick(p.id, event)
    setSelectedPoolPlayers(new Set())
    setEditPlayer({ ...p })
    setBaseline({ ...p })
    setIsNew(false)
  }

  const handleSelectPoolPlayer = (id: number, event: React.MouseEvent) => {
    poolShiftSelect.handleClick(id, event)
    setSelectedTournamentPlayers(new Set())
  }

  const handleNew = () => {
    setSelectedTournamentPlayers(new Set())
    setEditPlayer({ ...emptyPlayer })
    setBaseline({ ...emptyPlayer })
    setIsNew(true)
  }

  const handleAdd = () => {
    if (editPlayer.firstName || editPlayer.lastName) {
      setNameError('')
      addPlayer.mutate(editPlayer, {
        onSuccess: () => {
          handleNew()
          setActiveTab('tournament')
        },
      })
    } else {
      setNameError(sv.player.nameRequired)
    }
  }

  const handleUpdate = () => {
    const singleSelected =
      selectedTournamentPlayers.size === 1 ? [...selectedTournamentPlayers][0] : null
    if (singleSelected != null) {
      if (editPlayer.firstName || editPlayer.lastName) {
        setNameError('')
        updatePlayer.mutate(
          { playerId: singleSelected, dto: editPlayer },
          {
            onSuccess: () => setBaseline({ ...editPlayer }),
            onError: () => showToast({ message: sv.player.saveFailed, variant: 'error' }),
          },
        )
      } else {
        setNameError(sv.player.nameRequired)
      }
    }
  }

  const handleAddFromPool = () => {
    if (selectedPoolPlayers.size > 0) {
      const players = available.filter((p) => selectedPoolPlayers.has(p.id))
      if (players.length > 0) {
        addPlayers.mutate(players, {
          onSuccess: () => {
            setSelectedPoolPlayers(new Set())
            setActiveTab('tournament')
          },
        })
      }
    }
  }

  const handleRemove = () => {
    if (selectedTournamentPlayers.size > 0) {
      removePlayers.mutate([...selectedTournamentPlayers], {
        onSuccess: () => handleNew(),
      })
    }
  }

  const title = tournamentName
    ? `${sv.player.editTournamentPlayersTitle} ${tournamentName}`
    : sv.player.editTournamentPlayersTitle

  return (
    <>
      <Dialog
        title={title}
        open={open}
        onClose={onClose}
        width={800}
        height={520}
        noPadding
        isDirty={isDirty}
        footer={
          <>
            {activeTab === 'edit' && (
              <>
                <button className="btn" onClick={handleNew}>
                  {sv.player.reset}
                </button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={!isNew}>
                  {sv.common.add}
                </button>
                <button
                  className="btn"
                  data-testid="update-player"
                  onClick={handleUpdate}
                  disabled={isNew || updateSaved}
                >
                  <span className="btn-label-stack">
                    <span aria-hidden={updateSaved}>{sv.player.updateData}</span>
                    <span aria-hidden={!updateSaved}>{sv.player.updateDataSaved}</span>
                  </span>
                </button>
                <div style={{ flex: 1 }} />
              </>
            )}
            {activeTab === 'tournament' && (
              <>
                <span className="footer-count">
                  {tournamentPlayers?.length || 0} {sv.player.playersRegistered}
                </span>
                <button
                  className="btn"
                  onClick={() => setActiveTab('edit')}
                  disabled={selectedTournamentPlayers.size !== 1}
                >
                  Editera
                </button>
                <button
                  className="btn btn-danger"
                  data-testid="remove-player"
                  onClick={handleRemove}
                  disabled={selectedTournamentPlayers.size === 0 || removeBlocked}
                  title={removeBlocked ? sv.player.removeBlockedUseWithdraw : undefined}
                >
                  {sv.common.delete}
                </button>
                <div style={{ flex: 1 }} />
              </>
            )}
            {activeTab === 'pool' && (
              <>
                <button
                  className="btn btn-primary"
                  data-testid="add-from-pool"
                  onClick={handleAddFromPool}
                  disabled={selectedPoolPlayers.size === 0}
                >
                  {sv.common.addToTournament}
                </button>
                <div style={{ flex: 1 }} />
              </>
            )}
            <button className="btn" onClick={onClose}>
              {sv.common.close}
            </button>
          </>
        }
      >
        <div className="dialog-tabs">
          <button
            className={`dialog-tab ${activeTab === 'edit' ? 'active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            {sv.player.createOrEdit}
          </button>
          <button
            className={`dialog-tab ${activeTab === 'tournament' ? 'active' : ''}`}
            onClick={() => setActiveTab('tournament')}
          >
            {sv.menu.tournamentPlayers}
          </button>
          <button
            className={`dialog-tab ${activeTab === 'pool' ? 'active' : ''}`}
            onClick={() => setActiveTab('pool')}
          >
            {sv.menu.playerPool}
          </button>
        </div>

        {activeTab === 'edit' && (
          <div style={{ padding: 16 }}>
            <PlayerEditor
              player={editPlayer}
              clubs={clubs || []}
              onChange={(p) => {
                setEditPlayer(p)
                if (nameError) setNameError('')
              }}
              nameError={nameError}
              showTournamentFields
              onAddClub={async (name) => {
                try {
                  const club = await addClub.mutateAsync({ name })
                  return club.id
                } catch {
                  return undefined
                }
              }}
              onRenameClub={(id, name) => renameClub.mutate({ id, dto: { name } })}
              onDeleteClub={(id) => deleteClub.mutate(id)}
            />
            <div
              style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--color-text-muted)',
                margin: '8px 0',
                lineHeight: 1.4,
              }}
            >
              {sv.player.poolNote}
            </div>
          </div>
        )}

        {activeTab === 'tournament' && (
          <>
            <table className="data-table" data-testid="data-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>Nr</th>
                  <SortableHeader
                    column="name"
                    label={sv.columns.name}
                    sort={sortT}
                    onToggle={toggleSortT}
                  />
                  <SortableHeader
                    column="group"
                    label={sv.columns.group}
                    sort={sortT}
                    onToggle={toggleSortT}
                  />
                  <SortableHeader
                    column="club"
                    label={sv.columns.club}
                    sort={sortT}
                    onToggle={toggleSortT}
                  />
                  <SortableHeader
                    column="rating"
                    label={sv.columns.rating}
                    sort={sortT}
                    onToggle={toggleSortT}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedTournament.map((p, i) => (
                  <tr
                    key={p.id}
                    className={selectedTournamentPlayers.has(p.id) ? 'selected' : ''}
                    onMouseDown={tournamentShiftSelect.handleMouseDown}
                    onClick={(e) => handleSelectTournamentPlayer(p, e)}
                    onDoubleClick={(e) => {
                      if (isDirty && !selectedTournamentPlayers.has(p.id)) {
                        setPendingPlayer(p)
                        return
                      }
                      handleSelectTournamentPlayer(p, e)
                      setActiveTab('edit')
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="number-cell">{i + 1}</td>
                    <td>
                      {p.firstName} {p.lastName}
                      {p.withdrawnFromRound >= 0 ? ` (utgått r${p.withdrawnFromRound})` : ''}
                    </td>
                    <td>{p.playerGroup || ''}</td>
                    <td>{p.club || ''}</td>
                    <td className="number-cell">{p.ratingI || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {activeTab === 'pool' && (
          <>
            <table className="data-table" data-testid="data-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>Nr</th>
                  <SortableHeader
                    column="name"
                    label={sv.columns.name}
                    sort={sortA}
                    onToggle={toggleSortA}
                  />
                  <SortableHeader
                    column="group"
                    label={sv.columns.group}
                    sort={sortA}
                    onToggle={toggleSortA}
                  />
                  <SortableHeader
                    column="club"
                    label={sv.columns.club}
                    sort={sortA}
                    onToggle={toggleSortA}
                  />
                  <SortableHeader
                    column="rating"
                    label={sv.columns.rating}
                    sort={sortA}
                    onToggle={toggleSortA}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedAvailable.map((p, i) => (
                  <tr
                    key={p.id}
                    className={selectedPoolPlayers.has(p.id) ? 'selected' : ''}
                    onMouseDown={poolShiftSelect.handleMouseDown}
                    onClick={(e) => handleSelectPoolPlayer(p.id, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="number-cell">{i + 1}</td>
                    <td>
                      {p.firstName} {p.lastName}
                    </td>
                    <td>{p.playerGroup || ''}</td>
                    <td>{p.club || ''}</td>
                    <td className="number-cell">{p.ratingI || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <ConfirmDialog
          open={pendingPlayer !== null}
          title={sv.player.discardChangesTitle}
          message={sv.player.discardChangesMessage}
          onConfirm={() => {
            if (pendingPlayer) {
              setSelectedTournamentPlayers(new Set([pendingPlayer.id]))
              setSelectedPoolPlayers(new Set())
              setEditPlayer({ ...pendingPlayer })
              setBaseline({ ...pendingPlayer })
              setIsNew(false)
              setActiveTab('edit')
              setNameError('')
            }
            setPendingPlayer(null)
          }}
          onCancel={() => setPendingPlayer(null)}
        />
      </Dialog>
    </>
  )
}
