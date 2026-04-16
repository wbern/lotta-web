import { describe, expect, it } from 'vitest'
import {
  calculateScores,
  formatResultLabel,
  formatScore,
  getActualScores,
  getPairingScore,
  getResultKeybinds,
  isPlayed,
  isToBePlayed,
} from './scoring.ts'

describe('calculateScores', () => {
  it('calculates white win scores with default pointsPerGame=2', () => {
    const scores = calculateScores('WHITE_WIN', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 0 })
  })

  it('calculates Chess4 white win with pointsPerGame=4', () => {
    const scores = calculateScores('WHITE_WIN', { pointsPerGame: 4, chess4: true })
    // maxPointsForWin = 4-1 = 3, loser gets pointsPerGame - maxPointsForWin = 1
    expect(scores).toEqual({ whiteScore: 3, blackScore: 1 })
  })

  it('calculates draw scores', () => {
    const scores = calculateScores('DRAW', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 1, blackScore: 1 })
  })

  it('calculates black win scores', () => {
    const scores = calculateScores('BLACK_WIN', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 2 })
  })

  it('calculates white walkover scores (loser gets 0)', () => {
    const scores = calculateScores('WHITE_WIN_WO', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 0 })
  })

  it('calculates black walkover scores', () => {
    const scores = calculateScores('BLACK_WIN_WO', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 2 })
  })

  it('calculates postponed scores (both get maxPointsForWin)', () => {
    const scores = calculateScores('POSTPONED', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 2 })
  })

  it('calculates double walkover scores', () => {
    const scores = calculateScores('DOUBLE_WO', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 0 })
  })

  it('calculates no result scores', () => {
    const scores = calculateScores('NO_RESULT', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 0 })
  })

  it('calculates cancelled scores', () => {
    const scores = calculateScores('CANCELLED', { pointsPerGame: 2, chess4: false })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 0 })
  })

  it('calculates Chess4 draw with pointsPerGame=4', () => {
    const scores = calculateScores('DRAW', { pointsPerGame: 4, chess4: true })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 2 })
  })

  it('calculates Chess4 black win with pointsPerGame=4', () => {
    const scores = calculateScores('BLACK_WIN', { pointsPerGame: 4, chess4: true })
    expect(scores).toEqual({ whiteScore: 1, blackScore: 3 })
  })

  it('calculates Chess4 walkover (loser gets 0, not 1)', () => {
    const scores = calculateScores('WHITE_WIN_WO', { pointsPerGame: 4, chess4: true })
    expect(scores).toEqual({ whiteScore: 3, blackScore: 0 })
  })
})

describe('getActualScores', () => {
  it('returns pairing scores for normal results', () => {
    const scores = getActualScores('WHITE_WIN', 2, 0, {
      hasWhitePlayer: true,
      hasBlackPlayer: true,
    })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 0 })
  })

  it('returns zero for both players in POSTPONED when both players exist', () => {
    const scores = getActualScores('POSTPONED', 2, 2, {
      hasWhitePlayer: true,
      hasBlackPlayer: true,
    })
    expect(scores).toEqual({ whiteScore: 0, blackScore: 0 })
  })

  it('returns pairing scores for POSTPONED bye (only one player)', () => {
    const scores = getActualScores('POSTPONED', 2, 0, {
      hasWhitePlayer: true,
      hasBlackPlayer: false,
    })
    expect(scores).toEqual({ whiteScore: 2, blackScore: 0 })
  })
})

describe('getPairingScore', () => {
  it('returns stored pairing score for normal game', () => {
    const score = getPairingScore('white', {
      resultType: 'WHITE_WIN',
      whitePairingScore: 1,
      blackPairingScore: 0,
      whiteRating: 1500,
      blackRating: 1400,
      hasWhitePlayer: true,
      hasBlackPlayer: true,
      compensateWeakPlayerPP: false,
      pointsPerGame: 2,
      chess4: false,
    })
    expect(score).toBe(1)
  })

  it('compensates weak white player in postponed game when opponent is 200+ rating higher', () => {
    const score = getPairingScore('white', {
      resultType: 'POSTPONED',
      whitePairingScore: 2,
      blackPairingScore: 2,
      whiteRating: 1200,
      blackRating: 1500, // 300 > 200 gap
      hasWhitePlayer: true,
      hasBlackPlayer: true,
      compensateWeakPlayerPP: true,
      pointsPerGame: 2,
      chess4: false,
    })
    // Weak player gets draw score instead of full postponed score
    expect(score).toBe(1)
  })

  it('does not compensate when rating gap is exactly 200', () => {
    const score = getPairingScore('white', {
      resultType: 'POSTPONED',
      whitePairingScore: 2,
      blackPairingScore: 2,
      whiteRating: 1300,
      blackRating: 1500, // exactly 200, not >200
      hasWhitePlayer: true,
      hasBlackPlayer: true,
      compensateWeakPlayerPP: true,
      pointsPerGame: 2,
      chess4: false,
    })
    expect(score).toBe(2)
  })

  it('does not compensate when compensateWeakPlayerPP is false', () => {
    const score = getPairingScore('white', {
      resultType: 'POSTPONED',
      whitePairingScore: 2,
      blackPairingScore: 2,
      whiteRating: 1200,
      blackRating: 1500,
      hasWhitePlayer: true,
      hasBlackPlayer: true,
      compensateWeakPlayerPP: false,
      pointsPerGame: 2,
      chess4: false,
    })
    expect(score).toBe(2)
  })

  it('does not compensate for non-postponed results', () => {
    const score = getPairingScore('white', {
      resultType: 'WHITE_WIN',
      whitePairingScore: 2,
      blackPairingScore: 0,
      whiteRating: 1200,
      blackRating: 1500,
      hasWhitePlayer: true,
      hasBlackPlayer: true,
      compensateWeakPlayerPP: true,
      pointsPerGame: 2,
      chess4: false,
    })
    expect(score).toBe(2)
  })
})

describe('isPlayed', () => {
  it('returns true for WHITE_WIN, BLACK_WIN, DRAW', () => {
    expect(isPlayed('WHITE_WIN')).toBe(true)
    expect(isPlayed('BLACK_WIN')).toBe(true)
    expect(isPlayed('DRAW')).toBe(true)
  })

  it('returns false for walkovers, postponed, etc.', () => {
    expect(isPlayed('WHITE_WIN_WO')).toBe(false)
    expect(isPlayed('BLACK_WIN_WO')).toBe(false)
    expect(isPlayed('DOUBLE_WO')).toBe(false)
    expect(isPlayed('POSTPONED')).toBe(false)
    expect(isPlayed('NO_RESULT')).toBe(false)
    expect(isPlayed('CANCELLED')).toBe(false)
  })
})

describe('isToBePlayed', () => {
  it('returns true for NO_RESULT and POSTPONED', () => {
    expect(isToBePlayed('NO_RESULT')).toBe(true)
    expect(isToBePlayed('POSTPONED')).toBe(true)
  })

  it('returns false for completed results', () => {
    expect(isToBePlayed('WHITE_WIN')).toBe(false)
    expect(isToBePlayed('DRAW')).toBe(false)
    expect(isToBePlayed('CANCELLED')).toBe(false)
  })
})

describe('formatResultLabel', () => {
  it('formats standard 1-½-0 point system', () => {
    expect(formatResultLabel('WHITE_WIN')).toBe('1-0')
    expect(formatResultLabel('DRAW')).toBe('½-½')
    expect(formatResultLabel('BLACK_WIN')).toBe('0-1')
  })

  it('formats chess4 3-2-1 split per game', () => {
    const cfg = { chess4: true, pointsPerGame: 4 }
    expect(formatResultLabel('WHITE_WIN', cfg)).toBe('3-1')
    expect(formatResultLabel('DRAW', cfg)).toBe('2-2')
    expect(formatResultLabel('BLACK_WIN', cfg)).toBe('1-3')
  })

  it('formats Skollags-DM 2-1-0 per game', () => {
    const cfg = { chess4: false, pointsPerGame: 2 }
    expect(formatResultLabel('WHITE_WIN', cfg)).toBe('2-0')
    expect(formatResultLabel('DRAW', cfg)).toBe('1-1')
    expect(formatResultLabel('BLACK_WIN', cfg)).toBe('0-2')
  })

  it('suffixes WO on walkover types', () => {
    expect(formatResultLabel('WHITE_WIN_WO')).toBe('1-0 WO')
    expect(formatResultLabel('BLACK_WIN_WO')).toBe('0-1 WO')
    expect(formatResultLabel('DOUBLE_WO')).toBe('0-0 WO')
  })

  it('uses chess4 walkover split where loser gets 0 (not 1)', () => {
    const cfg = { chess4: true, pointsPerGame: 4 }
    expect(formatResultLabel('WHITE_WIN_WO', cfg)).toBe('3-0 WO')
    expect(formatResultLabel('BLACK_WIN_WO', cfg)).toBe('0-3 WO')
  })

  it('returns Swedish abbreviations for non-played statuses', () => {
    expect(formatResultLabel('POSTPONED')).toBe('uppskj')
    expect(formatResultLabel('CANCELLED')).toBe('inställd')
    expect(formatResultLabel('NO_RESULT')).toBe('')
  })
})

describe('getResultKeybinds', () => {
  it('standard 1-½-0: numeric 1=win, 0=loss, no numeric draw (½ not typeable)', () => {
    const k = getResultKeybinds({ chess4: false, pointsPerGame: 1 })
    expect(k.whiteWin).toEqual(['V', '1'])
    expect(k.draw).toEqual(['R', 'Ö'])
    expect(k.blackWin).toEqual(['F', '0'])
    expect(k.noResult).toEqual(['Space'])
  })

  it('Schackfyran 3-2-1: numeric keys match score labels, 0 clears', () => {
    const k = getResultKeybinds({ chess4: true, pointsPerGame: 4 })
    expect(k.whiteWin).toEqual(['V', '3'])
    expect(k.draw).toEqual(['R', 'Ö', '2'])
    expect(k.blackWin).toEqual(['F', '1'])
    expect(k.noResult).toEqual(['Space', '0'])
  })

  it('Skollags-DM 2-1-0: numeric 2=win, 1=draw, 0=loss', () => {
    const k = getResultKeybinds({ chess4: false, pointsPerGame: 2 })
    expect(k.whiteWin).toEqual(['V', '2'])
    expect(k.draw).toEqual(['R', 'Ö', '1'])
    expect(k.blackWin).toEqual(['F', '0'])
    expect(k.noResult).toEqual(['Space'])
  })

  it('custom odd ppg=3: no numeric draw (fractional)', () => {
    const k = getResultKeybinds({ chess4: false, pointsPerGame: 3 })
    expect(k.whiteWin).toEqual(['V', '3'])
    expect(k.draw).toEqual(['R', 'Ö'])
    expect(k.blackWin).toEqual(['F', '0'])
  })
})

describe('formatScore', () => {
  it('formats 0.5 as ½', () => {
    expect(formatScore(0.5)).toBe('½')
  })

  it('formats whole numbers', () => {
    expect(formatScore(0)).toBe('0')
    expect(formatScore(1)).toBe('1')
    expect(formatScore(2)).toBe('2')
  })

  it('formats mixed numbers with halves', () => {
    expect(formatScore(1.5)).toBe('1½')
    expect(formatScore(2.5)).toBe('2½')
  })
})
