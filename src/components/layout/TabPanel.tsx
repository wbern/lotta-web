import { useMemo } from 'react'
import { sv } from '../../lib/swedish-text'
import type { RoundDto } from '../../types/api'
import { EmptyState } from '../EmptyState'
import { AlphabeticalPairingTab } from '../tabs/AlphabeticalPairingTab'
import { Chess4SetupTab } from '../tabs/Chess4SetupTab'
import { Chess4StandingsTab } from '../tabs/Chess4StandingsTab'
import { ClubStandingsTab } from '../tabs/ClubStandingsTab'
import { LiveTab } from '../tabs/LiveTab'
import { PairingsTab } from '../tabs/PairingsTab'
import { PlayersTab } from '../tabs/PlayersTab'
import { StandingsTab } from '../tabs/StandingsTab'

interface Props {
  activeTab: string
  onTabChange: (tab: string) => void
  tournamentId: number | undefined
  tournamentName?: string
  round: number | undefined
  rounds: RoundDto[]
  onBoardSelect?: (boardNr: number | undefined) => void
  onEditBoard?: (boardNr: number) => void
  chess4?: boolean
  showELO?: boolean
  showGroup?: boolean
  pointsPerGame?: number
  maxPointsImmediately?: boolean
  alphaPrintGroupByClass?: boolean
  alphaPrintCompact?: boolean
}

export function TabPanel({
  activeTab,
  onTabChange,
  tournamentId,
  tournamentName,
  round,
  rounds,
  onBoardSelect,
  onEditBoard,
  chess4,
  showELO,
  showGroup,
  pointsPerGame,
  maxPointsImmediately,
  alphaPrintGroupByClass,
  alphaPrintCompact,
}: Props) {
  const tabs = useMemo(() => {
    const base: { key: string; label: string }[] = [
      { key: 'pairings', label: sv.tabs.pairings },
      { key: 'alphabetical', label: sv.tabs.alphabetical },
      { key: 'standings', label: sv.tabs.standings },
      { key: 'players', label: sv.tabs.players },
    ]
    if (chess4) {
      base.push({ key: 'chess4-setup', label: sv.tabs.chess4Setup })
      base.push({ key: 'chess4-standings', label: sv.tabs.chess4Standings })
    } else {
      base.push({ key: 'club-standings', label: sv.tabs.clubStandings })
    }
    base.push({ key: 'live', label: sv.tabs.live })
    return base
  }, [chess4])

  return (
    <div className="tab-panel">
      <div className="tab-headers" data-testid="tab-headers">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-header ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content" data-testid="tab-content">
        {!tournamentId ? (
          <EmptyState icon="chess-board" title={sv.common.noTournament}>
            <div className="empty-state-steps">
              <div className="empty-state-step">
                <span className="empty-state-step-path">{sv.guidance.step1Path}</span>
                <span className="empty-state-step-label">{sv.guidance.step1Label}</span>
              </div>
              <div className="empty-state-step">
                <span className="empty-state-step-path">{sv.guidance.step2Path}</span>
                <span className="empty-state-step-label">{sv.guidance.step2Label}</span>
              </div>
              <div className="empty-state-step">
                <span className="empty-state-step-path">{sv.guidance.step3Path}</span>
                <span className="empty-state-step-label">{sv.guidance.step3Label}</span>
              </div>
            </div>
          </EmptyState>
        ) : (
          <>
            {activeTab === 'pairings' && (
              <PairingsTab
                tournamentId={tournamentId}
                round={round}
                rounds={rounds}
                onBoardSelect={onBoardSelect}
                onEditBoard={onEditBoard}
                showELO={showELO}
                pointsPerGame={pointsPerGame}
                maxPointsImmediately={maxPointsImmediately}
                chess4={chess4}
              />
            )}
            {activeTab === 'alphabetical' && (
              <AlphabeticalPairingTab
                tournamentId={tournamentId}
                tournamentName={tournamentName}
                rounds={rounds}
                activeRound={round}
                printGroupByClass={alphaPrintGroupByClass}
                printCompact={alphaPrintCompact}
              />
            )}
            {activeTab === 'standings' && (
              <StandingsTab
                tournamentId={tournamentId}
                round={round}
                showELO={showELO}
                showGroup={showGroup}
              />
            )}
            {activeTab === 'players' && (
              <PlayersTab tournamentId={tournamentId} showELO={showELO} showGroup={showGroup} />
            )}
            {activeTab === 'club-standings' && (
              <ClubStandingsTab tournamentId={tournamentId} round={round} />
            )}
            {activeTab === 'chess4-setup' && <Chess4SetupTab tournamentId={tournamentId} />}
            {activeTab === 'chess4-standings' && (
              <Chess4StandingsTab tournamentId={tournamentId} round={round} />
            )}
            <div style={activeTab !== 'live' ? { display: 'none' } : { height: '100%' }}>
              <LiveTab
                tournamentName={tournamentName || ''}
                tournamentId={tournamentId}
                round={round}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
