import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { addGame, updateGame } from '../../api/results'
import { useRound } from '../../hooks/useRounds'
import { useTournamentPlayers } from '../../hooks/useTournamentPlayers'
import { sv } from '../../lib/swedish-text'
import { useToast } from '../toast/useToast'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  tournamentId: number
  roundNr: number
  mode: 'add' | 'edit'
  boardNr: number | undefined
  onClose: () => void
}

export function EditBoardDialog({ open, tournamentId, roundNr, mode, boardNr, onClose }: Props) {
  const { data: players } = useTournamentPlayers(tournamentId)
  const { data: roundData } = useRound(tournamentId, roundNr)
  const queryClient = useQueryClient()

  const [whiteId, setWhiteId] = useState<number | ''>('')
  const [blackId, setBlackId] = useState<number | ''>('')
  const { show: showToast } = useToast()

  // Get players already paired in this round
  const pairedPlayerIds = new Set<number>()
  if (roundData?.games) {
    for (const game of roundData.games) {
      if (mode === 'edit' && game.boardNr === boardNr) continue // Skip current game when editing
      if (game.whitePlayer) pairedPlayerIds.add(game.whitePlayer.id)
      if (game.blackPlayer) pairedPlayerIds.add(game.blackPlayer.id)
    }
  }

  // Available players = tournament players not already paired
  const availablePlayers = (players || []).filter((p) => !pairedPlayerIds.has(p.id))

  // Load current game data when editing
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode === 'edit' && boardNr != null && roundData?.games) {
      const game = roundData.games.find((g) => g.boardNr === boardNr)
      if (game) {
        setWhiteId(game.whitePlayer?.id ?? '')
        setBlackId(game.blackPlayer?.id ?? '')
      }
    } else {
      setWhiteId('')
      setBlackId('')
    }
  }, [mode, boardNr, roundData])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = async () => {
    // At least one player must be selected
    if (whiteId === '' && blackId === '') return

    const whitePlayerId = whiteId || null
    const blackPlayerId = blackId || null

    try {
      if (mode === 'add') {
        await addGame(tournamentId, roundNr, whitePlayerId, blackPlayerId)
      } else if (boardNr != null) {
        await updateGame(tournamentId, roundNr, boardNr, whitePlayerId, blackPlayerId)
      }
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'rounds'] })
      onClose()
    } catch (e) {
      showToast({
        message: 'Fel: ' + (e instanceof Error ? e.message : String(e)),
        variant: 'error',
      })
    }
  }

  const title = mode === 'add' ? sv.menu.addBoard : `Bord nr ${boardNr}`

  return (
    <Dialog
      title={title}
      open={open}
      onClose={onClose}
      width={550}
      footer={
        <>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={whiteId === '' && blackId === ''}
          >
            Ok
          </button>
          <button className="btn" onClick={onClose}>
            {sv.common.cancel}
          </button>
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr 1fr',
          gap: '8px 12px',
          alignItems: 'center',
        }}
      >
        {/* Column headers */}
        <div />
        <div style={{ fontWeight: 600, textAlign: 'center' }}>Vit</div>
        <div style={{ fontWeight: 600, textAlign: 'center' }}>Svart</div>

        {/* Player dropdowns row */}
        <div>Namn</div>
        <select
          value={whiteId}
          onChange={(e) => {
            const v = e.target.value
            setWhiteId(v ? Number(v) : '')
          }}
        >
          <option value="">(frirond)</option>
          {availablePlayers
            .filter((p) => p.id !== blackId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
        </select>
        <select
          value={blackId}
          onChange={(e) => {
            const v = e.target.value
            setBlackId(v ? Number(v) : '')
          }}
        >
          <option value="">(frirond)</option>
          {availablePlayers
            .filter((p) => p.id !== whiteId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
        </select>
      </div>
    </Dialog>
  )
}
