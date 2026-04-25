import { useCallback, useEffect, useRef, useState } from 'react'
import { useAddClub, useClubs, useDeleteClub, useRenameClub } from '../../hooks/useClubs'
import {
  useAddPoolPlayer,
  useDeletePoolPlayers,
  usePoolPlayers,
  useUpdatePoolPlayer,
} from '../../hooks/usePlayers'
import { useShiftSelect } from '../../hooks/useShiftSelect'
import { useTableSort } from '../../hooks/useTableSort'
import { sv } from '../../lib/swedish-text'
import type { PlayerDto } from '../../types/api'
import { SortableHeader } from '../SortableHeader'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { PlayerEditor } from './PlayerEditor'
import { samePlayer } from './playerForm'

interface Props {
  open: boolean
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
}

export function PlayerPoolDialog({ open, onClose }: Props) {
  const { data: players } = usePoolPlayers()
  const { data: clubs } = useClubs()
  const addPlayer = useAddPoolPlayer()
  const updatePlayer = useUpdatePoolPlayer()
  const deletePlayers = useDeletePoolPlayers()
  const addClub = useAddClub()
  const renameClub = useRenameClub()
  const deleteClub = useDeleteClub()

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editPlayer, setEditPlayer] = useState<Partial<PlayerDto>>({ ...emptyPlayer })
  const [baseline, setBaseline] = useState<Partial<PlayerDto>>({ ...emptyPlayer })
  const [isNew, setIsNew] = useState(true)
  const [activeTab, setActiveTab] = useState<'edit' | 'pool'>('pool')
  const [nameError, setNameError] = useState('')
  const [pendingPlayer, setPendingPlayer] = useState<PlayerDto | null>(null)

  const isDirty = !samePlayer(editPlayer, baseline)

  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelectedIds(new Set())
      setEditPlayer({ ...emptyPlayer })
      setBaseline({ ...emptyPlayer })
      setIsNew(true)
      setActiveTab('pool')
      setNameError('')
      setPendingPlayer(null)
    }
    wasOpen.current = open
  }, [open])

  const getValue = useCallback((p: PlayerDto, col: string): string | number | null => {
    if (col === 'name') return `${p.firstName}, ${p.lastName}`
    if (col === 'club') return p.club
    if (col === 'group') return p.playerGroup
    if (col === 'rating') return p.ratingI
    return null
  }, [])

  const { sorted, sort, toggleSort } = useTableSort(
    players || [],
    { column: 'name', direction: 'asc' },
    getValue,
  )

  const { handleClick: shiftSelectClick, handleMouseDown: shiftSelectMouseDown } = useShiftSelect(
    sorted,
    setSelectedIds,
  )

  const handleSelectPlayer = (p: PlayerDto, event: React.MouseEvent) => {
    shiftSelectClick(p.id, event)
    setEditPlayer({ ...p })
    setBaseline({ ...p })
    setIsNew(false)
  }

  const handleNew = () => {
    setSelectedIds(new Set())
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
          setActiveTab('pool')
        },
      })
    } else {
      setNameError(sv.player.nameRequired)
    }
  }

  const handleUpdate = () => {
    const singleSelected = selectedIds.size === 1 ? [...selectedIds][0] : null
    if (singleSelected != null) {
      if (editPlayer.firstName || editPlayer.lastName) {
        setNameError('')
        updatePlayer.mutate(
          { id: singleSelected, dto: editPlayer },
          { onSuccess: () => setBaseline({ ...editPlayer }) },
        )
      } else {
        setNameError(sv.player.nameRequired)
      }
    }
  }

  const handleDelete = () => {
    if (selectedIds.size > 0) {
      deletePlayers.mutate([...selectedIds], { onSuccess: () => handleNew() })
    }
  }

  return (
    <Dialog
      title={sv.player.editPoolTitle}
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
                disabled={isNew || selectedIds.size !== 1}
              >
                {sv.common.change}
              </button>
              <div style={{ flex: 1 }} />
            </>
          )}
          {activeTab === 'pool' && (
            <>
              <span className="footer-count">
                {players?.length || 0} {sv.player.playersInPool}
              </span>
              <button
                className="btn"
                onClick={() => setActiveTab('edit')}
                disabled={selectedIds.size !== 1}
              >
                Editera
              </button>
              <button
                className="btn btn-danger"
                data-testid="delete-from-pool"
                onClick={handleDelete}
                disabled={selectedIds.size === 0}
              >
                {sv.common.delete}
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

      {activeTab === 'pool' && (
        <table className="data-table" data-testid="data-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>Nr</th>
              <SortableHeader
                column="name"
                label={sv.columns.name}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortableHeader
                column="group"
                label={sv.columns.group}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortableHeader
                column="club"
                label={sv.columns.club}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortableHeader
                column="rating"
                label={sv.columns.rating}
                sort={sort}
                onToggle={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.id}
                className={selectedIds.has(p.id) ? 'selected' : ''}
                onMouseDown={shiftSelectMouseDown}
                onClick={(e) => handleSelectPlayer(p, e)}
                onDoubleClick={(e) => {
                  if (isDirty && !selectedIds.has(p.id)) {
                    setPendingPlayer(p)
                    return
                  }
                  handleSelectPlayer(p, e)
                  setActiveTab('edit')
                }}
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
      )}
      <ConfirmDialog
        open={pendingPlayer !== null}
        title={sv.player.discardChangesTitle}
        message={sv.player.discardChangesMessage}
        onConfirm={() => {
          if (pendingPlayer) {
            setSelectedIds(new Set([pendingPlayer.id]))
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
  )
}
