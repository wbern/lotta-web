type TournamentLockState = 'draft' | 'seeded' | 'in_progress' | 'finalized'

interface TournamentLockInput {
  roundsPlayed: number
  hasRecordedResults: boolean
  nrOfRounds: number
}

export type LockableField =
  | 'pairingSystem'
  | 'initialPairing'
  | 'compensateWeakPlayerPP'
  | 'ratingChoice'
  | 'barredPairing'
  | 'selectedTiebreaks'
  | 'chess4'
  | 'pointsPerGame'

export function isFieldLocked(_field: LockableField, state: TournamentLockState): boolean {
  return state !== 'draft'
}

export function tournamentLockState(t: TournamentLockInput): TournamentLockState {
  const roundsPlayed = t.roundsPlayed ?? 0
  if (t.nrOfRounds > 0 && roundsPlayed >= t.nrOfRounds) return 'finalized'
  if (t.hasRecordedResults) return 'in_progress'
  if (roundsPlayed > 0) return 'seeded'
  return 'draft'
}
