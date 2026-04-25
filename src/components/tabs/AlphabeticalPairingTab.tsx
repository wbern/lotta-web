import { useCallback, useMemo } from 'react'
import { buildAlphabeticalPairingsInput } from '../../api/publish-data'
import { useTableSort } from '../../hooks/useTableSort'
import { sv } from '../../lib/swedish-text'
import type { RoundDto } from '../../types/api'
import { EmptyState } from '../EmptyState'
import { SortableHeader } from '../SortableHeader'

interface Props {
  tournamentId: number
  tournamentName?: string
  rounds: RoundDto[]
  activeRound?: number
  /** When true (default), each class starts on its own page when printing. */
  printGroupByClass?: boolean
  /** When true, apply compact typography/padding in the print view. */
  printCompact?: boolean
  /** When true, render opponents in the print view with first name only. */
  printHideOpponentLastName?: boolean
}

interface PlayerRow {
  name: string
  club: string
  board: string
}

export function AlphabeticalPairingTab({
  tournamentId,
  tournamentName,
  rounds,
  activeRound,
  printGroupByClass = true,
  printCompact = false,
  printHideOpponentLastName = false,
}: Props) {
  // Use the active round, or latest round if not specified
  const roundNr = activeRound ?? (rounds.length > 0 ? rounds[rounds.length - 1].roundNr : undefined)
  const round = rounds.find((r) => r.roundNr === roundNr)

  // Grouped-by-class view used only when printing. Same data source as the
  // downloaded HTML publish, so screen and paper stay consistent.
  const printClasses = useMemo(() => {
    if (roundNr == null) return []
    const grouped = buildAlphabeticalPairingsInput(tournamentId, roundNr)
    return grouped?.classes ?? []
  }, [tournamentId, roundNr])

  const playerRows = useMemo(() => {
    if (!round) return []
    const rows: PlayerRow[] = []

    for (const game of round.games) {
      if (game.whitePlayer) {
        let board: string
        if (game.blackPlayer == null) {
          board = 'Fri'
        } else {
          board = `${game.boardNr} V`
        }
        rows.push({
          name: game.whitePlayer.name,
          club: game.whitePlayer.club || '',
          board,
        })
      }
      if (game.blackPlayer) {
        let board: string
        if (game.whitePlayer == null) {
          board = 'Fri'
        } else {
          board = `${game.boardNr} S`
        }
        rows.push({
          name: game.blackPlayer.name,
          club: game.blackPlayer.club || '',
          board,
        })
      }
    }

    return rows
  }, [round])

  const getValue = useCallback((row: PlayerRow, col: string): string | number | null => {
    if (col === 'name') return row.name
    if (col === 'club') return row.club
    if (col === 'board') return row.board
    return null
  }, [])

  const { sorted, sort, toggleSort } = useTableSort(
    playerRows,
    { column: 'name', direction: 'asc' },
    getValue,
  )

  if (rounds.length === 0 || !round) {
    return <EmptyState icon="list" title={sv.common.noRounds} />
  }

  return (
    <>
      <div className="table-scroll screen-only" data-testid="scroll-container">
        <table className="data-table" data-testid="data-table">
          <thead>
            <tr>
              <SortableHeader
                column="name"
                label={sv.columns.name}
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
                column="board"
                label={sv.columns.board}
                sort={sort}
                onToggle={toggleSort}
                style={{ textAlign: 'center' }}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i}>
                <td>{row.name}</td>
                <td>{row.club}</td>
                <td style={{ textAlign: 'center' }}>{row.board}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`print-only${printCompact ? ' CP_compact' : ''}`} aria-hidden="true">
        {printGroupByClass ? (
          printClasses.map((klass) => (
            <div key={klass.className || '__unclubbed__'} className="CP_AlphabeticalClass">
              <h2>
                {tournamentName ? `${tournamentName} - ` : ''}Alfabetisk lottning rond {roundNr}
              </h2>
              {klass.className && <h3>{klass.className}</h3>}
              <table className="CP_Table">
                <tbody>
                  <tr className="CP_TableHeader">
                    <td>Namn</td>
                    <td style={{ textAlign: 'center' }}>Bord</td>
                    <td>Motståndare</td>
                  </tr>
                  {klass.players.map((p) => {
                    const oppName = p.opponent
                      ? printHideOpponentLastName
                        ? p.opponent.firstName
                        : `${p.opponent.firstName} ${p.opponent.lastName}`
                      : 'frirond'
                    return (
                      <tr
                        key={`${p.firstName}-${p.lastName}-${p.boardNr}-${p.color}`}
                        className="CP_Row"
                      >
                        <td className="CP_Player">
                          {p.firstName} {p.lastName}
                        </td>
                        <td className="CP_Board">
                          {p.boardNr} {p.color}
                        </td>
                        <td className="CP_Player">{oppName}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))
        ) : (
          <>
            <h2>
              {tournamentName ? `${tournamentName} - ` : ''}Alfabetisk lottning rond {roundNr}
            </h2>
            <div className="CP_AlphabeticalFlat">
              {printClasses.map((klass) => (
                <div key={klass.className || '__unclubbed__'}>
                  {klass.className && <h3>{klass.className}</h3>}
                  {klass.players.map((p) => {
                    const oppName = p.opponent
                      ? printHideOpponentLastName
                        ? p.opponent.firstName
                        : `${p.opponent.firstName} ${p.opponent.lastName}`
                      : 'frirond'
                    return (
                      <div
                        key={`${p.firstName}-${p.lastName}-${p.boardNr}-${p.color}`}
                        className="CP_AlphabeticalRow"
                      >
                        {p.firstName} {p.lastName}{' '}
                        <span className="CP_RowBoard">
                          {p.boardNr} {p.color}
                        </span>
                        , <span className="CP_RowOpp">{oppName}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
