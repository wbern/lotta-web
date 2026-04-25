import { describe, expect, it } from 'vitest'
import { tournamentLockState } from './tournament-lock'

describe('tournamentLockState', () => {
  it('returns draft when no round has been paired', () => {
    expect(
      tournamentLockState({
        roundsPlayed: 0,
        hasRecordedResults: false,
        nrOfRounds: 7,
      }),
    ).toBe('draft')
  })

  it('returns seeded once round 1 is paired but no results are recorded', () => {
    expect(
      tournamentLockState({
        roundsPlayed: 1,
        hasRecordedResults: false,
        nrOfRounds: 7,
      }),
    ).toBe('seeded')
  })

  it('returns in_progress once any result has been recorded', () => {
    expect(
      tournamentLockState({
        roundsPlayed: 1,
        hasRecordedResults: true,
        nrOfRounds: 7,
      }),
    ).toBe('in_progress')
  })

  it('returns finalized when all rounds have been played', () => {
    expect(
      tournamentLockState({
        roundsPlayed: 7,
        hasRecordedResults: true,
        nrOfRounds: 7,
      }),
    ).toBe('finalized')
  })
})
