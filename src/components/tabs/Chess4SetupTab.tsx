import { useCallback, useMemo, useRef } from 'react'
import { useClubs, useRenameClub } from '../../hooks/useClubs'
import { useTableSort } from '../../hooks/useTableSort'
import { useTournamentPlayers } from '../../hooks/useTournamentPlayers'
import { sv } from '../../lib/swedish-text'
import type { ClubDto } from '../../types/api'
import { EmptyState } from '../EmptyState'
import { SortableHeader } from '../SortableHeader'

interface Props {
  tournamentId: number
}

export function Chess4SetupTab({ tournamentId }: Props) {
  const { data: clubs, isLoading } = useClubs()
  const { data: tournamentPlayers } = useTournamentPlayers(tournamentId)
  const updateClub = useRenameClub()
  const pendingValues = useRef<Map<number, number>>(new Map())

  // Count players per club
  const playerCountByClub = useMemo(() => {
    const counts: Record<string, number> = {}
    if (tournamentPlayers) {
      for (const p of tournamentPlayers) {
        const club = p.club || ''
        counts[club] = (counts[club] || 0) + 1
      }
    }
    return counts
  }, [tournamentPlayers])

  const getValue = useCallback(
    (c: ClubDto, col: string): string | number | null => {
      if (col === 'club') return c.name
      if (col === 'players') return playerCountByClub[c.name] || 0
      if (col === 'members') return c.chess4Members
      return null
    },
    [playerCountByClub],
  )

  const participatingClubs = useMemo(
    () => (clubs || []).filter((c) => (playerCountByClub[c.name] || 0) > 0),
    [clubs, playerCountByClub],
  )

  const { sorted, sort, toggleSort } = useTableSort(
    participatingClubs,
    { column: 'club', direction: 'asc' },
    getValue,
  )

  const saveMembers = (club: ClubDto) => {
    const value = pendingValues.current.get(club.id)
    if (value === undefined) return
    pendingValues.current.delete(club.id)
    if (value !== club.chess4Members) {
      updateClub.mutate({ id: club.id, dto: { ...club, chess4Members: value } })
    }
  }

  if (isLoading) return <div className="empty-state">Laddar...</div>
  if (!clubs || clubs.length === 0) {
    return <EmptyState icon="users" title={sv.common.noClubs} />
  }

  return (
    <div className="table-scroll" data-testid="scroll-container">
      <table className="data-table" data-testid="data-table">
        <thead>
          <tr>
            <SortableHeader
              column="club"
              label={sv.columns.klass}
              sort={sort}
              onToggle={toggleSort}
              style={{ width: 100 }}
            />
            <SortableHeader
              column="players"
              label={sv.columns.players}
              sort={sort}
              onToggle={toggleSort}
              className="number-cell"
              style={{ width: 45 }}
            />
            <SortableHeader
              column="members"
              label={sv.columns.teamSize}
              sort={sort}
              onToggle={toggleSort}
              className="number-cell"
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="number-cell">{playerCountByClub[c.name] || 0}</td>
              <td className="number-cell">
                <input
                  key={`${c.id}-${c.chess4Members}`}
                  type="number"
                  min={0}
                  defaultValue={c.chess4Members}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    pendingValues.current.set(c.id, !isNaN(v) && v >= 0 ? v : 0)
                  }}
                  onBlur={(e) => {
                    if (!e.target.value) e.target.value = '0'
                    saveMembers(c)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  style={{ width: 60, textAlign: 'right' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
