import { describe, expect, it } from 'vitest'
import { isFieldLocked, type LockableField } from './tournament-lock'

const LOCKED_FIELDS: LockableField[] = [
  'pairingSystem',
  'initialPairing',
  'compensateWeakPlayerPP',
  'ratingChoice',
  'barredPairing',
  'selectedTiebreaks',
  'chess4',
  'pointsPerGame',
]

describe('isFieldLocked', () => {
  it('leaves all fields editable in draft state', () => {
    for (const field of LOCKED_FIELDS) {
      expect(isFieldLocked(field, 'draft')).toBe(false)
    }
  })

  it('locks all fields once the tournament is seeded', () => {
    for (const field of LOCKED_FIELDS) {
      expect(isFieldLocked(field, 'seeded')).toBe(true)
    }
  })

  it('keeps fields locked through in_progress and finalized', () => {
    for (const field of LOCKED_FIELDS) {
      expect(isFieldLocked(field, 'in_progress')).toBe(true)
      expect(isFieldLocked(field, 'finalized')).toBe(true)
    }
  })
})
