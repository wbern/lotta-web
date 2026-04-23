import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { redeemClubCode } from '../api/club-code-rpc'
import { CLUBLESS_KEY } from '../domain/club-filter'
import { useRound, useRounds } from '../hooks/useRounds'
import { useTournaments } from '../hooks/useTournaments'
import { setClubFilter, setPendingClubCode, useClientP2PStore } from '../stores/client-p2p-store'
import { Dialog } from './dialogs/Dialog'

const CODE_LENGTH = 4

export function SpectatorLayout() {
  const { clubFilter, shareMode, pendingClubCode, clubFilterEnabled } = useClientP2PStore()
  const [codeInput, setCodeInput] = useState('')
  const [showCodeDialog, setShowCodeDialog] = useState(() => !clubFilter)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const autoRedeemedRef = useRef(false)

  useEffect(() => {
    if (autoRedeemedRef.current) return
    if (!pendingClubCode) return
    autoRedeemedRef.current = true
    const code = pendingClubCode
    setPendingClubCode(null)
    void (async () => {
      const outcome = await redeemClubCode(code)
      if (outcome.status === 'ok' && outcome.clubs) {
        setClubFilter(outcome.clubs)
        setShowCodeDialog(false)
        queryClient.invalidateQueries()
      }
    })()
  }, [pendingClubCode, queryClient])

  const { data: tournaments } = useTournaments()
  const tournament = tournaments?.[0]
  const tournamentId = tournament?.id

  const { data: rounds } = useRounds(tournamentId)
  const latestRoundNr = rounds && rounds.length > 0 ? rounds[rounds.length - 1].roundNr : undefined

  const { data: roundData } = useRound(tournamentId, latestRoundNr)

  const isViewMode = shareMode === 'view'
  const filterActive = isViewMode && clubFilterEnabled !== false
  const shouldShowDialog = showCodeDialog && filterActive

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCodeInput(digits)
    if (redeemError) setRedeemError(null)
  }

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return
    const normalized = codeInput.trim().replace(/[-\s]/g, '').toUpperCase()
    const outcome = await redeemClubCode(normalized)
    if (outcome.status === 'ok' && outcome.clubs) {
      setClubFilter(outcome.clubs)
      setShowCodeDialog(false)
      setRedeemError(null)
      queryClient.invalidateQueries()
    } else {
      setRedeemError('Fel kod')
    }
  }

  const games = filterActive && !clubFilter ? [] : (roundData?.games ?? [])

  if (!tournament) {
    return (
      <div className="spectator-layout">
        <div className="spectator-empty">V\u00E4ntar p\u00E5 turneringsdata\u2026</div>
      </div>
    )
  }

  return (
    <div className="spectator-layout" data-testid="spectator-layout">
      <div className="spectator-header">
        <div className="spectator-header-top">
          <h2 className="spectator-title">{tournament.name}</h2>
          {latestRoundNr != null && <span className="spectator-round">Rond {latestRoundNr}</span>}
        </div>
        {clubFilter && (
          <div className="spectator-club-row">
            <span className="spectator-club-badge">
              {clubFilter.map((c) => (c === CLUBLESS_KEY ? 'Klubblösa' : c)).join(', ')}
            </span>
            {filterActive && (
              <button
                type="button"
                className="btn btn-small spectator-add-more-btn"
                onClick={() => {
                  setCodeInput('')
                  setRedeemError(null)
                  setShowCodeDialog(true)
                }}
              >
                Lägg till fler
              </button>
            )}
          </div>
        )}
      </div>

      {games.length === 0 ? (
        <div className="spectator-empty">
          {filterActive && !clubFilter
            ? 'Ange klubbkod för att se lottningar.'
            : latestRoundNr == null
              ? 'Ingen rond lottad \u00E4nnu.'
              : 'Inga lottningar att visa.'}
        </div>
      ) : (
        <table className="data-table spectator-table" data-testid="spectator-pairings">
          <thead>
            <tr>
              <th className="spectator-board-cell">#</th>
              <th>Vit</th>
              <th className="spectator-result-cell">Res.</th>
              <th>Svart</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const isBye = !game.whitePlayer || !game.blackPlayer
              const whiteAuth = game.whitePlayer?.club != null
              const blackAuth = game.blackPlayer?.club != null
              return (
                <tr
                  key={game.boardNr}
                  className={isBye ? 'spectator-bye-row' : undefined}
                  data-testid={`spectator-row-${game.boardNr}`}
                >
                  <td className="spectator-board-cell">{game.boardNr}</td>
                  <td className={whiteAuth ? 'spectator-club-player' : undefined}>
                    {game.whitePlayer?.name ?? 'BYE'}
                  </td>
                  <td
                    className="spectator-result-cell"
                    data-testid={`spectator-result-${game.boardNr}`}
                  >
                    {game.resultDisplay}
                  </td>
                  <td className={blackAuth ? 'spectator-club-player' : undefined}>
                    {game.blackPlayer?.name ?? 'BYE'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <Dialog
        title="Klubbkod"
        open={!!shouldShowDialog}
        onClose={() => setShowCodeDialog(false)}
        width={360}
        footer={
          <button
            className="btn btn-primary club-code-submit"
            data-testid="club-code-submit"
            onClick={handleCodeSubmit}
          >
            OK
          </button>
        }
      >
        <div className="club-code-dialog-body" data-testid="club-code-dialog">
          <p className="club-code-dialog-prompt">
            Ange klubbkod f&ouml;r att se dina spelares placeringar:
          </p>
          <input
            className="club-code-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="####"
            maxLength={CODE_LENGTH}
            value={codeInput}
            onChange={handleCodeChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCodeSubmit()
            }}
            autoFocus
          />
          {redeemError && (
            <p className="club-code-dialog-error" data-testid="club-code-error">
              {redeemError}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  )
}
