import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResultConflictError } from '../../api/result-command'
import { deleteGame, deleteGames } from '../../api/results'
import {
  calculateScores,
  formatResultLabel,
  getResultKeybinds,
  type KeybindSlot,
  type ResultKeybinds,
} from '../../domain/scoring'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useRound } from '../../hooks/useRounds'
import { useShiftSelect } from '../../hooks/useShiftSelect'
import { useSetResult } from '../../hooks/useStandings'
import { sv } from '../../lib/swedish-text'
import type { GameDto, ResultType, RoundDto } from '../../types/api'
import { EditScoreDialog } from '../dialogs/EditScoreDialog'
import { EmptyState } from '../EmptyState'

interface Props {
  tournamentId: number
  round: number | undefined
  rounds: RoundDto[]
  onBoardSelect?: (boardNr: number | undefined) => void
  onEditBoard?: (boardNr: number) => void
  showELO?: boolean
  pointsPerGame?: number
  maxPointsImmediately?: boolean
  chess4?: boolean
}

function resultTypeFromScores(ws: number, bs: number): ResultType {
  if (ws > bs) return 'WHITE_WIN'
  if (bs > ws) return 'BLACK_WIN'
  if (ws > 0) return 'DRAW'
  return 'NO_RESULT'
}

function matchKeybindSlot(key: string, keybinds: ResultKeybinds): KeybindSlot | null {
  const normalized = key === ' ' ? 'Space' : key.toUpperCase()
  for (const slot of ['whiteWin', 'draw', 'blackWin', 'noResult'] as const) {
    if (keybinds[slot].includes(normalized)) return slot
  }
  return null
}

export function PairingsTab({
  tournamentId,
  round,
  rounds,
  onBoardSelect,
  onEditBoard,
  showELO,
  pointsPerGame = 1,
  maxPointsImmediately = false,
  chess4 = false,
}: Props) {
  const roundNr = round ?? (rounds.length > 0 ? rounds[rounds.length - 1].roundNr : undefined)
  const { data: roundData } = useRound(tournamentId, roundNr)
  const setResultMutation = useSetResult(tournamentId, roundNr)
  const queryClient = useQueryClient()
  const [selectedBoards, setSelectedBoards] = useState<Set<number>>(new Set())
  const contextMenu = useContextMenu()
  const [editScoreGame, setEditScoreGame] = useState<GameDto | null>(null)

  const conflictError =
    setResultMutation.error instanceof ResultConflictError ? setResultMutation.error : null
  const conflictBoardNr = conflictError
    ? (setResultMutation.variables as { boardNr: number } | undefined)?.boardNr
    : null
  const resetRef = useRef(setResultMutation.reset)
  useEffect(() => {
    resetRef.current = setResultMutation.reset
  })

  useEffect(() => {
    if (!conflictError) return
    const timer = setTimeout(() => resetRef.current(), 5000)
    return () => clearTimeout(timer)
  }, [conflictError])

  const games = useMemo(() => roundData?.games || [], [roundData?.games])

  // Single selected board for result entry and edit operations
  const singleSelected = selectedBoards.size === 1 ? [...selectedBoards][0] : null

  const getBoardNr = useCallback((g: GameDto) => g.boardNr, [])
  const { handleClick: shiftSelectClick } = useShiftSelect(games, setSelectedBoards, getBoardNr)

  const toggleBoard = useCallback(
    (boardNr: number, event: React.MouseEvent) => {
      shiftSelectClick(boardNr, event)
      onBoardSelect?.(boardNr)
    },
    [shiftSelectClick, onBoardSelect],
  )

  const selectBoard = useCallback(
    (boardNr: number | null) => {
      setSelectedBoards(boardNr != null ? new Set([boardNr]) : new Set())
      onBoardSelect?.(boardNr ?? undefined)
    },
    [onBoardSelect],
  )

  const setResult = useCallback(
    (boardNr: number, resultType: ResultType, whiteScore?: number, blackScore?: number) => {
      const currentGame = games.find((g) => g.boardNr === boardNr)
      const expectedPrior = currentGame?.resultType ?? 'NO_RESULT'
      setResultMutation.mutate({
        boardNr,
        req: { resultType, whiteScore, blackScore, expectedPrior },
      })
    },
    [setResultMutation, games],
  )

  const deleteSelectedBoards = useCallback(async () => {
    if (selectedBoards.size === 0 || tournamentId == null || roundNr == null) return
    const boardNrs = [...selectedBoards]
    const msg =
      boardNrs.length === 1
        ? `Är du säker på att du vill ta bort bord ${boardNrs[0]}?`
        : `Är du säker på att du vill ta bort ${boardNrs.length} bord?`
    if (confirm(msg)) {
      if (boardNrs.length === 1) {
        await deleteGame(tournamentId, roundNr, boardNrs[0])
      } else {
        await deleteGames(tournamentId, roundNr, boardNrs)
      }
      setSelectedBoards(new Set())
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'rounds'] })
    }
  }, [selectedBoards, tournamentId, roundNr, queryClient])

  // Effective scoring config for keybinds and score calculation. Non-chess4
  // tournaments with ppg=1 respect maxPointsImmediately as an opt-in to the
  // legacy "scale up scores" behavior, but Schackfyran (chess4) and multi-point
  // presets like Skollags-DM (ppg=2) always use their declared ppg so that
  // pressing `3` or `2` matches the on-screen result labels.
  const effectivePpg = chess4 || pointsPerGame > 1 || maxPointsImmediately ? pointsPerGame : 1
  const scoringConfig = useMemo(
    () => ({ pointsPerGame: effectivePpg, chess4 }),
    [effectivePpg, chess4],
  )
  const keybinds = useMemo(() => getResultKeybinds(scoringConfig), [scoringConfig])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedBoards.size === 0 || !roundNr) return
      // Don't handle shortcuts when a dialog input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return

      const key = e.key

      // Delete works with any selection size
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault()
        deleteSelectedBoards()
        return
      }

      // Result keys only apply with exactly one board selected
      if (singleSelected == null) return

      const slot = matchKeybindSlot(key, keybinds)
      if (!slot) return

      if (key === ' ') e.preventDefault()

      const resultType: ResultType =
        slot === 'whiteWin'
          ? 'WHITE_WIN'
          : slot === 'draw'
            ? 'DRAW'
            : slot === 'blackWin'
              ? 'BLACK_WIN'
              : 'NO_RESULT'
      const { whiteScore, blackScore } = calculateScores(resultType, scoringConfig)

      setResult(singleSelected, resultType, whiteScore, blackScore)
      // Auto-advance when result is a completed game
      const isFinished = whiteScore + blackScore === effectivePpg
      if (isFinished) {
        const idx = games.findIndex((g) => g.boardNr === singleSelected)
        if (idx >= 0 && idx < games.length - 1) {
          const nextBoardNr = games[idx + 1].boardNr
          selectBoard(nextBoardNr)
          const nextRow = document.querySelector<HTMLElement>(
            `tr[data-board-nr="${nextBoardNr}"]`,
          )
          nextRow?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    selectedBoards,
    singleSelected,
    roundNr,
    games,
    setResult,
    selectBoard,
    deleteSelectedBoards,
    effectivePpg,
    scoringConfig,
    keybinds,
  ])

  const handleDoubleClick = (game: GameDto) => {
    onEditBoard?.(game.boardNr)
  }

  const handleEditScoreSave = (whiteScore: number, blackScore: number) => {
    if (editScoreGame) {
      const resultType = resultTypeFromScores(whiteScore, blackScore)
      setResult(editScoreGame.boardNr, resultType, whiteScore, blackScore)
      setEditScoreGame(null)
    }
  }

  const handleContextEditScore = () => {
    if (contextMenu.state) {
      const game = games.find((g) => g.boardNr === contextMenu.state!.boardNr)
      if (game) {
        setEditScoreGame(game)
      }
    }
    contextMenu.close()
  }

  if (!roundNr) {
    return <EmptyState icon="pawn" title={sv.common.noRoundPaired} />
  }

  if (games.length === 0) {
    return <EmptyState icon="pawn" title={sv.common.noGamesInRound} />
  }

  return (
    <>
      {conflictError && (
        <div className="conflict-notification" role="alert" data-testid="conflict-notification">
          Bord {conflictBoardNr} har redan resultat{' '}
          {formatResultLabel(conflictError.current, { chess4, pointsPerGame })}
        </div>
      )}
      <div className="table-scroll" data-testid="scroll-container">
        <table className="data-table" data-testid="data-table">
          <thead>
            <tr>
              <th className="col-narrow">{sv.columns.board}</th>
              <th className="col-name">{sv.columns.whitePlayer}</th>
              {showELO && <th className="col-number col-rating">{sv.columns.rating}</th>}
              <th className="col-result result-cell">{sv.columns.result}</th>
              <th className="col-name">{sv.columns.blackPlayer}</th>
              {showELO && <th className="col-number col-rating">{sv.columns.rating}</th>}
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr
                key={game.boardNr}
                data-board-nr={game.boardNr}
                className={selectedBoards.has(game.boardNr) ? 'selected' : ''}
                onClick={(e) => {
                  toggleBoard(game.boardNr, e)
                  e.currentTarget.focus()
                }}
                onDoubleClick={() => handleDoubleClick(game)}
                onContextMenu={(e) => contextMenu.open(e, game.boardNr)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    const idx = games.findIndex((g) => g.boardNr === game.boardNr)
                    const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
                    if (nextIdx < 0 || nextIdx >= games.length) return
                    selectBoard(games[nextIdx].boardNr)
                    const sibling =
                      e.key === 'ArrowDown'
                        ? e.currentTarget.nextElementSibling
                        : e.currentTarget.previousElementSibling
                    if (sibling instanceof HTMLElement) sibling.focus()
                  }
                }}
                tabIndex={0}
              >
                <td className="place-cell">{game.boardNr}</td>
                <td>{game.whitePlayer?.name || 'frirond'}</td>
                {showELO && (
                  <td className="number-cell col-rating">{game.whitePlayer?.rating || ''}</td>
                )}
                <td className="result-cell">
                  <button
                    className="result-dropdown"
                    data-testid={`result-dropdown-${game.boardNr}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      contextMenu.open(e, game.boardNr)
                    }}
                  >
                    {game.resultDisplay} <span className="result-dropdown-arrow">▾</span>
                  </button>
                </td>
                <td>{game.blackPlayer?.name || 'frirond'}</td>
                {showELO && (
                  <td className="number-cell col-rating">{game.blackPlayer?.rating || ''}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contextMenu.state && (
        <ContextMenuPopup
          x={contextMenu.state.x}
          y={contextMenu.state.y}
          keybinds={keybinds}
          onSelect={(resultType) => {
            const scores = calculateScores(resultType, scoringConfig)
            setResult(contextMenu.state!.boardNr, resultType, scores.whiteScore, scores.blackScore)
            contextMenu.close()
          }}
          onEditScore={handleContextEditScore}
          onClose={contextMenu.close}
        />
      )}

      <EditScoreDialog
        open={editScoreGame != null}
        game={editScoreGame}
        pointsPerGame={pointsPerGame}
        onSave={handleEditScoreSave}
        onClose={() => setEditScoreGame(null)}
      />
    </>
  )
}

function ContextMenuPopup({
  x,
  y,
  keybinds,
  onSelect,
  onEditScore,
}: {
  x: number
  y: number
  keybinds: ResultKeybinds
  onSelect: (type: ResultType) => void
  onEditScore: () => void
  onClose: () => void
}) {
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  const flipUp = viewportHeight > 0 && y > viewportHeight / 2
  const positionStyle = flipUp ? { left: x, bottom: viewportHeight - y } : { left: x, top: y }
  const renderHint = (slot: KeybindSlot) => keybinds[slot].join(' / ')
  return (
    <div className="context-menu" style={positionStyle}>
      <button onClick={() => onSelect('NO_RESULT')}>
        {sv.contextMenu.notPlayed}
        <span className="context-menu-shortcut" data-testid="shortcut-no-result">
          {renderHint('noResult')}
        </span>
      </button>
      <button onClick={() => onSelect('WHITE_WIN')}>
        {sv.contextMenu.whiteWin}
        <span className="context-menu-shortcut" data-testid="shortcut-white-win">
          {renderHint('whiteWin')}
        </span>
      </button>
      <button onClick={() => onSelect('DRAW')}>
        {sv.contextMenu.draw}
        <span className="context-menu-shortcut" data-testid="shortcut-draw">
          {renderHint('draw')}
        </span>
      </button>
      <button onClick={() => onSelect('BLACK_WIN')}>
        {sv.contextMenu.blackWin}
        <span className="context-menu-shortcut" data-testid="shortcut-black-win">
          {renderHint('blackWin')}
        </span>
      </button>
      <div className="context-submenu">
        <button>{sv.contextMenu.walkOver} ▸</button>
        <div className="context-submenu-items">
          <button onClick={() => onSelect('WHITE_WIN_WO')}>{sv.contextMenu.whiteWinWO}</button>
          <button onClick={() => onSelect('BLACK_WIN_WO')}>{sv.contextMenu.blackWinWO}</button>
          <button onClick={() => onSelect('DOUBLE_WO')}>{sv.contextMenu.doubleWO}</button>
        </div>
      </div>
      <button onClick={() => onSelect('POSTPONED')}>{sv.contextMenu.postponed}</button>
      <button onClick={() => onSelect('CANCELLED')}>{sv.contextMenu.cancelled}</button>
      <button onClick={onEditScore}>{sv.contextMenu.editScore}</button>
    </div>
  )
}
