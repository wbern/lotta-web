import { describe, expect, it } from 'vitest'
import type {
  AlphabeticalPairingsPublishInput,
  Chess4StandingsPublishInput,
  ClubStandingsPublishInput,
  CrossTablePublishInput,
  PairingsPublishInput,
  PlayerListPublishInput,
  RefereePairingsPublishInput,
  StandingsPublishInput,
} from './html-publisher.ts'
import {
  publishAlphabeticalPairings,
  publishChess4Standings,
  publishClubStandings,
  publishCrossTable,
  publishPairings,
  publishPlayerList,
  publishRefereePairings,
  publishStandings,
} from './html-publisher.ts'

describe('publishPairings', () => {
  it('generates HTML with board, players, and result', () => {
    const input: PairingsPublishInput = {
      tournamentName: 'Höstturneringen',
      roundNr: 1,
      games: [
        {
          boardNr: 1,
          whiteName: 'Andersson, Anna',
          blackName: 'Björk, Bo',
          resultDisplay: '1-0',
        },
        {
          boardNr: 2,
          whiteName: 'Carlsson, Cilla',
          blackName: null,
          resultDisplay: '',
        },
      ],
    }

    const html = publishPairings(input)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Lottning rond 1')
    expect(html).toContain('Höstturneringen')
    expect(html).toContain('Andersson, Anna')
    expect(html).toContain('Björk, Bo')
    expect(html).toContain('1-0')
    expect(html).toContain('frirond')
    expect(html).toContain('<style')
  })

  it('escapes HTML in player names', () => {
    const input: PairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      games: [
        {
          boardNr: 1,
          whiteName: '<script>alert("xss")</script>',
          blackName: 'Normal',
          resultDisplay: '',
        },
      ],
    }

    const html = publishPairings(input)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes in player names', () => {
    const input: PairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      games: [
        {
          boardNr: 1,
          whiteName: 'O"Brien',
          blackName: "D'Arcy",
          resultDisplay: '',
        },
      ],
    }

    const html = publishPairings(input)
    expect(html).not.toContain('O"Brien')
    expect(html).toContain('O&quot;Brien')
    expect(html).not.toContain("D'Arcy")
    expect(html).toContain('D&#39;Arcy')
  })
})

describe('publishAlphabeticalPairings', () => {
  it('formats each player as "Name boardNrColor, Opponent"', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Höstturneringen',
      roundNr: 3,
      classes: [
        {
          className: '',
          players: [
            {
              firstName: 'Kalle',
              lastName: 'Testsson',
              boardNr: 7,
              color: 'V',
              opponent: {
                firstName: 'Örjan',
                lastName: 'Efternamn',
                color: 'S',
              },
            },
            {
              firstName: 'Örjan',
              lastName: 'Efternamn',
              boardNr: 7,
              color: 'S',
              opponent: {
                firstName: 'Kalle',
                lastName: 'Testsson',
                color: 'V',
              },
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Höstturneringen')
    expect(html).toContain('rond 3')
    // Each player appears as a table row with Name / Board / Opponent columns.
    expect(html).toContain('<td class="CP_Player">Kalle Testsson</td>')
    expect(html).toContain('<td class="CP_Board">7 V</td>')
    expect(html).toContain('<td class="CP_Player">Örjan Efternamn</td>')
    expect(html).toContain('<td class="CP_Board">7 S</td>')
  })

  it('starts each class on its own page when printing', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      classes: [
        {
          className: 'A-klassen',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: { firstName: 'Bo', lastName: 'Björk', color: 'S' },
            },
          ],
        },
        {
          className: 'B-klassen',
          players: [
            {
              firstName: 'Cilla',
              lastName: 'Carlsson',
              boardNr: 2,
              color: 'V',
              opponent: { firstName: 'Dan', lastName: 'Dahl', color: 'S' },
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    expect(html).toContain('A-klassen')
    expect(html).toContain('B-klassen')
    // Each class section must carry a page-break rule so organizers can hand one printout per class.
    // The first class starts naturally at page 1; the rule applies uniformly.
    // Both modern and legacy forms are required — Safari/WebKit print paths ignore the modern-only rule.
    expect(html).toMatch(/\.CP_AlphabeticalClass[^}]*break-before\s*:\s*page/)
    expect(html).toMatch(/\.CP_AlphabeticalClass[^}]*page-break-before\s*:\s*always/)
    expect(html).toMatch(/\.CP_AlphabeticalClass[^}]*break-inside\s*:\s*avoid/)
  })

  it('repeats the title inside every class so each handout stands alone', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Höstturneringen',
      roundNr: 2,
      classes: [
        {
          className: 'A-klassen',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: { firstName: 'Bo', lastName: 'Björk', color: 'S' },
            },
          ],
        },
        {
          className: 'B-klassen',
          players: [
            {
              firstName: 'Cilla',
              lastName: 'Carlsson',
              boardNr: 2,
              color: 'V',
              opponent: { firstName: 'Dan', lastName: 'Dahl', color: 'S' },
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    const titleOccurrences = html.match(/<h2>Höstturneringen - Alfabetisk lottning rond 2<\/h2>/g)
    expect(titleOccurrences).not.toBeNull()
    expect(titleOccurrences).toHaveLength(2)
    // And each occurrence must live inside its own CP_AlphabeticalClass wrapper.
    expect(html).toMatch(
      /<div class="CP_AlphabeticalClass">\s*<h2>Höstturneringen - Alfabetisk lottning rond 2<\/h2>/,
    )
  })

  it('emits a single top-level title in the flat layout', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Höstturneringen',
      roundNr: 2,
      groupByClass: false,
      classes: [
        {
          className: 'A',
          players: [
            { firstName: 'Anna', lastName: 'Andersson', boardNr: 1, color: 'V', opponent: null },
          ],
        },
        {
          className: 'B',
          players: [{ firstName: 'Bo', lastName: 'Björk', boardNr: 2, color: 'V', opponent: null }],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    const titleOccurrences = html.match(/<h2>Höstturneringen - Alfabetisk lottning rond 2<\/h2>/g)
    expect(titleOccurrences).toHaveLength(1)
  })

  it('renders opponents with first name only when hideOpponentLastName is true', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      hideOpponentLastName: true,
      classes: [
        {
          className: '',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: { firstName: 'Bo', lastName: 'Björk', color: 'S' },
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    // Self name keeps both, only opponent loses the last name.
    expect(html).toContain('<td class="CP_Player">Anna Andersson</td>')
    expect(html).toContain('<td class="CP_Player">Bo</td>')
    expect(html).not.toContain('Bo Björk')
  })

  it('still labels byes as "frirond" when hideOpponentLastName is true', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      hideOpponentLastName: true,
      classes: [
        {
          className: '',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: null,
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    expect(html).toContain('frirond')
  })

  it('emits a flat CSS-column layout when groupByClass is false', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      groupByClass: false,
      columns: 3,
      classes: [
        {
          className: 'A-klassen',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: { firstName: 'Bo', lastName: 'Björk', color: 'S' },
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    expect(html).toContain('class="CP_AlphabeticalFlat"')
    expect(html).toContain('column-count: 3')
    expect(html).not.toContain('class="CP_AlphabeticalClass"')
    // Row uses the flat div format, not a table
    expect(html).toContain('class="CP_AlphabeticalRow"')
  })

  it('clamps the column count to the 1..8 range', () => {
    const base: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      groupByClass: false,
      classes: [
        {
          className: '',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: null,
            },
          ],
        },
      ],
    }

    expect(publishAlphabeticalPairings({ ...base, columns: 0 })).toContain('column-count: 1')
    expect(publishAlphabeticalPairings({ ...base, columns: 99 })).toContain('column-count: 8')
  })

  it('adds the CP_compact body class when compact is on', () => {
    const input: AlphabeticalPairingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      compact: true,
      classes: [
        {
          className: '',
          players: [
            {
              firstName: 'Anna',
              lastName: 'Andersson',
              boardNr: 1,
              color: 'V',
              opponent: null,
            },
          ],
        },
      ],
    }

    const html = publishAlphabeticalPairings(input)
    expect(html).toContain('<body class="CP_compact">')
    expect(html).toMatch(/\.CP_compact\s*\{[^}]*font-size/)
  })
})

describe('publishStandings', () => {
  it('generates standings table with place, name, club, score, and tiebreaks', () => {
    const input: StandingsPublishInput = {
      tournamentName: 'Höstturneringen',
      roundNr: 2,
      showELO: true,
      tiebreakNames: ['Buchholz', 'SB'],
      standings: [
        {
          place: 1,
          name: 'Andersson, Anna',
          club: 'SK Lund',
          rating: 1800,
          scoreDisplay: '2',
          tiebreaks: { Buchholz: '3.5', SB: '2.0' },
        },
        {
          place: 2,
          name: 'Björk, Bo',
          club: null,
          rating: 1700,
          scoreDisplay: '1',
          tiebreaks: { Buchholz: '2.0', SB: '1.0' },
        },
      ],
    }

    const html = publishStandings(input)
    expect(html).toContain('Ställning efter rond 2')
    expect(html).toContain('Andersson, Anna')
    expect(html).toContain('SK Lund')
    expect(html).toContain('1800')
    expect(html).toContain('Buchholz')
    expect(html).toContain('3.5')
  })

  it('hides rating column when showELO is false', () => {
    const input: StandingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 1,
      showELO: false,
      tiebreakNames: [],
      standings: [
        {
          place: 1,
          name: 'Andersson, Anna',
          club: null,
          rating: 1800,
          scoreDisplay: '1',
          tiebreaks: {},
        },
      ],
    }

    const html = publishStandings(input)
    expect(html).not.toContain('<td>Rating</td>')
    expect(html).not.toContain('>1800<')
  })
})

describe('publishPlayerList', () => {
  it('generates player list with number, name, club, rating', () => {
    const input: PlayerListPublishInput = {
      tournamentName: 'Höstturneringen',
      players: [
        { name: 'Andersson, Anna', club: 'SK Lund', rating: 1800 },
        { name: 'Björk, Bo', club: null, rating: 1700 },
      ],
    }

    const html = publishPlayerList(input)
    expect(html).toContain('Spelarlista')
    expect(html).toContain('Andersson, Anna')
    expect(html).toContain('SK Lund')
    expect(html).toContain('1800')
  })
})

describe('publishClubStandings', () => {
  it('generates club standings with place, club, score', () => {
    const input: ClubStandingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 3,
      standings: [
        { place: 1, club: 'SK Lund', scoreDisplay: '5½' },
        { place: 2, club: 'SK Malmö', scoreDisplay: '3' },
      ],
    }

    const html = publishClubStandings(input)
    expect(html).toContain('Klubbställning efter rond 3')
    expect(html).toContain('SK Lund')
    expect(html).toContain('5½')
  })
})

describe('publishChess4Standings', () => {
  it('generates Chess4 standings with player count and chess4 members', () => {
    const input: Chess4StandingsPublishInput = {
      tournamentName: 'Test',
      roundNr: 2,
      standings: [
        {
          place: 1,
          club: 'SK Lund',
          playerCount: 4,
          chess4Members: 3,
          score: 8,
        },
      ],
    }

    const html = publishChess4Standings(input)
    expect(html).toContain('Schack4an-ställning efter rond 2')
    expect(html).toContain('SK Lund')
    expect(html).toContain('>4<')
    expect(html).toContain('>3<')
    expect(html).toContain('>8<')
  })
})

describe('publishCrossTable', () => {
  it('generates cross table with opponents and colors', () => {
    const input: CrossTablePublishInput = {
      tournamentName: 'Test',
      roundCount: 2,
      players: [
        {
          nr: 1,
          name: 'Andersson, Anna',
          rounds: [
            { opponentNr: 2, color: 'v' },
            { opponentNr: 3, color: 's' },
          ],
          totalScore: '1½',
        },
        {
          nr: 2,
          name: 'Björk, Bo',
          rounds: [
            { opponentNr: 1, color: 's' },
            { opponentNr: null, color: '' },
          ],
          totalScore: '½',
        },
        {
          nr: 3,
          name: 'Carlsson, Cilla',
          rounds: [
            { opponentNr: null, color: '' },
            { opponentNr: 1, color: 'v' },
          ],
          totalScore: '1',
        },
      ],
    }

    const html = publishCrossTable(input)
    expect(html).toContain('Korstabell')
    expect(html).toContain('Andersson, Anna')
    expect(html).toContain('2v')
    expect(html).toContain('3s')
    expect(html).toContain('1½')
    expect(html).toContain('-') // Empty round cell
  })
})

describe('publishRefereePairings', () => {
  it('generates interactive HTML with result buttons per board', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Spring Open',
      tournamentId: 1,
      roundNr: 2,
      games: [
        {
          boardNr: 1,
          whiteName: 'Alice',
          blackName: 'Bob',
          resultDisplay: '',
        },
        {
          boardNr: 2,
          whiteName: 'Charlie',
          blackName: 'Diana',
          resultDisplay: '1-0',
        },
      ],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Spring Open')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    // Result buttons should exist for boards without results
    expect(html).toContain('1-0')
    expect(html).toContain('½-½')
    expect(html).toContain('0-1')
    // Boards with existing results should show current result
    expect(html).toContain('Charlie')
    // Should contain postMessage script
    expect(html).toContain('postMessage')
    // Should contain data attributes for board identification
    expect(html).toContain('data-board="1"')
    expect(html).toContain('data-board="2"')
  })

  it('includes tournamentId and roundNr in postMessage payload', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Test',
      tournamentId: 42,
      roundNr: 3,
      games: [{ boardNr: 1, whiteName: 'A', blackName: 'B', resultDisplay: '' }],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('42') // tournamentId
    expect(html).toContain('"roundNr":3')
  })

  it('exposes the published-time current result per board so submissions can carry expectedPrior', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'T',
      tournamentId: 1,
      roundNr: 1,
      games: [
        {
          boardNr: 5,
          whiteName: 'A',
          blackName: 'B',
          resultDisplay: '',
          currentResult: 'NO_RESULT',
        },
        {
          boardNr: 6,
          whiteName: 'C',
          blackName: 'D',
          resultDisplay: '1-0',
          currentResult: 'WHITE_WIN',
        },
      ],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('data-current="NO_RESULT"')
    expect(html).toContain('data-current="WHITE_WIN"')
    // The click script must read it and include it as expectedPrior.
    expect(html).toContain('expectedPrior')
  })

  it('escapes HTML in player names', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Test',
      tournamentId: 1,
      roundNr: 1,
      games: [
        {
          boardNr: 1,
          whiteName: '<script>xss</script>',
          blackName: 'Normal',
          resultDisplay: '',
        },
      ],
    }

    const html = publishRefereePairings(input)
    expect(html).not.toContain('<script>xss</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses chess4 per-match point labels (3-1/2-2/1-3) when chess4 with pointsPerGame=4', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Schack4an',
      tournamentId: 7,
      roundNr: 1,
      chess4: true,
      pointsPerGame: 4,
      games: [{ boardNr: 1, whiteName: 'Alice', blackName: 'Bob', resultDisplay: '' }],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('>3-1<')
    expect(html).toContain('>2-2<')
    expect(html).toContain('>1-3<')
    expect(html).not.toMatch(/>1-0</)
    expect(html).not.toMatch(/>½-½</)
    expect(html).not.toMatch(/>0-1</)
  })

  it('uses 2-0/1-1/0-2 labels for non-chess4 pointsPerGame=2 (Skollags-DM style)', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Skollags-DM',
      tournamentId: 8,
      roundNr: 1,
      chess4: false,
      pointsPerGame: 2,
      games: [{ boardNr: 1, whiteName: 'Alice', blackName: 'Bob', resultDisplay: '' }],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('>2-0<')
    expect(html).toContain('>1-1<')
    expect(html).toContain('>0-2<')
    expect(html).not.toMatch(/>1-0</)
    expect(html).not.toMatch(/>½-½</)
    expect(html).not.toMatch(/>0-1</)
  })

  it('postMessage payload includes button label as resultDisplay', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Test',
      tournamentId: 1,
      roundNr: 1,
      games: [{ boardNr: 1, whiteName: 'A', blackName: 'B', resultDisplay: '' }],
    }

    const html = publishRefereePairings(input)
    // The iframe script must forward the button's text so chess4 labels (3-1 etc)
    // reach the confirm dialog and audit log instead of the RESULT_LABELS fallback.
    expect(html).toContain('resultDisplay: btn.textContent')
  })

  it('chess4 ppg=4 WO buttons show 3-0 / 0-3 for chess4 WO results', () => {
    const input: RefereePairingsPublishInput = {
      tournamentName: 'Schack4an',
      tournamentId: 7,
      roundNr: 1,
      chess4: true,
      pointsPerGame: 4,
      games: [{ boardNr: 1, whiteName: 'Alice', blackName: 'Bob', resultDisplay: '' }],
    }

    const html = publishRefereePairings(input)
    expect(html).toContain('3-0 WO')
    expect(html).toContain('0-3 WO')
    expect(html).not.toContain('3-1 WO')
    expect(html).not.toContain('1-3 WO')
  })
})
