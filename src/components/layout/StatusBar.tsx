import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import type { TournamentDto } from '../../types/api'

export type LiveConnectionState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'host-offline'
export type LiveRole = 'host' | 'client'

interface Props {
  tournament: TournamentDto | undefined
  round: number | undefined
  liveState?: LiveConnectionState
  liveRole?: LiveRole
  livePeerCount?: number
  livePendingCount?: number
  onLiveClick?: () => void
}

export function StatusBar({
  tournament,
  round,
  liveState,
  liveRole,
  livePeerCount,
  livePendingCount,
  onLiveClick,
}: Props) {
  const online = useOnlineStatus()
  const isLive = liveState && liveState !== 'disconnected'

  const liveIndicator = isLive && (
    <button
      data-testid="status-live"
      className={`status-live ${liveState !== 'connected' ? `status-live--${liveState}` : ''}`}
      onClick={onLiveClick}
      title={liveRole === 'host' ? 'Live: Värd' : liveRole === 'client' ? 'Live: Ansluten' : 'Live'}
    >
      Live
    </button>
  )

  if (isLive) {
    const roleText =
      liveRole === 'host'
        ? `Värd${livePeerCount ? ` — ${livePeerCount} anslutna` : ''}`
        : liveRole === 'client'
          ? 'Ansluten till värd'
          : ''

    return (
      <div className="status-bar" data-testid="status-bar">
        {liveIndicator}
        {roleText}
        {livePendingCount && livePendingCount > 0 ? (
          <span className="status-pending" data-testid="status-pending">
            {livePendingCount} ej synkad
          </span>
        ) : null}
        {!online && <span className="status-offline">Offline</span>}
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="status-bar" data-testid="status-bar">
        {!online && <span className="status-offline">Offline</span>}
        &nbsp;
      </div>
    )
  }

  const roundDisplay = round
    ? `Rond ${round}/${tournament.nrOfRounds}`
    : tournament.roundsPlayed > 0
      ? `Rond ${tournament.roundsPlayed}/${tournament.nrOfRounds}`
      : 'Ej startad'

  return (
    <div className="status-bar" data-testid="status-bar">
      Turnering: {tournament.name}&nbsp;&nbsp;Grupp: {tournament.group}&nbsp;&nbsp;{roundDisplay}
      {!online && <span className="status-offline">Offline</span>}
    </div>
  )
}
