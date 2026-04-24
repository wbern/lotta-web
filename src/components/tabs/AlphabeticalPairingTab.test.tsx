// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoundDto } from '../../types/api'
import { AlphabeticalPairingTab } from './AlphabeticalPairingTab'

const classesFixture = [
  {
    className: 'A-klassen',
    players: [
      {
        firstName: 'Anna',
        lastName: 'Andersson',
        lotNr: 1,
        color: 'V' as const,
        opponent: { firstName: 'Bo', lastName: 'Björk', lotNr: 2, color: 'S' as const },
      },
    ],
  },
  {
    className: 'B-klassen',
    players: [
      {
        firstName: 'Cilla',
        lastName: 'Carlsson',
        lotNr: 3,
        color: 'V' as const,
        opponent: { firstName: 'Dan', lastName: 'Dahl', lotNr: 4, color: 'S' as const },
      },
    ],
  },
]

vi.mock('../../api/publish-data', () => ({
  buildAlphabeticalPairingsInput: () => ({
    tournamentName: 'Höstturneringen',
    roundNr: 1,
    classes: classesFixture,
  }),
}))

const rounds: RoundDto[] = [
  {
    roundNr: 1,
    hasAllResults: false,
    gameCount: 2,
    games: [
      {
        boardNr: 1,
        roundNr: 1,
        whitePlayer: { id: 1, name: 'Anna Andersson', club: '', rating: 1800, lotNr: 1 },
        blackPlayer: { id: 2, name: 'Bo Björk', club: '', rating: 1700, lotNr: 2 },
        resultType: 'NO_RESULT',
        whiteScore: 0,
        blackScore: 0,
        resultDisplay: '',
      },
      {
        boardNr: 2,
        roundNr: 1,
        whitePlayer: { id: 3, name: 'Cilla Carlsson', club: '', rating: 1600, lotNr: 3 },
        blackPlayer: { id: 4, name: 'Dan Dahl', club: '', rating: 1500, lotNr: 4 },
        resultType: 'NO_RESULT',
        whiteScore: 0,
        blackScore: 0,
        resultDisplay: '',
      },
    ],
  },
]

afterEach(() => {
  cleanup()
})

describe('AlphabeticalPairingTab print view', () => {
  it('renders a grouped table per class with the title repeated inside each wrapper', () => {
    const { container } = render(
      <AlphabeticalPairingTab
        tournamentId={1}
        tournamentName="Höstturneringen"
        rounds={rounds}
        activeRound={1}
      />,
    )

    const classWrappers = container.querySelectorAll('.print-only .CP_AlphabeticalClass')
    expect(classWrappers).toHaveLength(2)
    for (const wrapper of classWrappers) {
      const heading = wrapper.querySelector('h2')
      expect(heading?.textContent).toBe('Höstturneringen - Alfabetisk lottning rond 1')
    }
    // Grouped mode uses the table format
    expect(container.querySelectorAll('.print-only .CP_Table')).toHaveLength(2)
    expect(container.querySelector('.print-only .CP_AlphabeticalFlat')).toBeNull()
  })

  it('renders a single title above the flat layout when printGroupByClass is false', () => {
    const { container } = render(
      <AlphabeticalPairingTab
        tournamentId={1}
        tournamentName="Höstturneringen"
        rounds={rounds}
        activeRound={1}
        printGroupByClass={false}
      />,
    )

    const headings = container.querySelectorAll('.print-only h2')
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe('Höstturneringen - Alfabetisk lottning rond 1')
    expect(container.querySelector('.print-only .CP_AlphabeticalFlat')).not.toBeNull()
    expect(container.querySelectorAll('.print-only .CP_AlphabeticalClass')).toHaveLength(0)
  })

  it('omits the tournament name from the title when none is provided', () => {
    const { container } = render(
      <AlphabeticalPairingTab tournamentId={1} rounds={rounds} activeRound={1} />,
    )

    const heading = container.querySelector('.print-only .CP_AlphabeticalClass h2')
    expect(heading?.textContent).toBe('Alfabetisk lottning rond 1')
  })

  it('applies the CP_compact class when printCompact is true', () => {
    const { container } = render(
      <AlphabeticalPairingTab tournamentId={1} rounds={rounds} activeRound={1} printCompact />,
    )

    expect(container.querySelector('.print-only.CP_compact')).not.toBeNull()
  })

  it('does not apply CP_compact by default', () => {
    const { container } = render(
      <AlphabeticalPairingTab tournamentId={1} rounds={rounds} activeRound={1} />,
    )

    expect(container.querySelector('.print-only.CP_compact')).toBeNull()
    expect(container.querySelector('.print-only')).not.toBeNull()
  })

  it('shows an empty state when there are no rounds', () => {
    render(<AlphabeticalPairingTab tournamentId={1} rounds={[]} />)

    expect(screen.getByText('Inga ronder')).toBeTruthy()
  })
})
