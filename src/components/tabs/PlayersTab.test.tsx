// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockPlayer } from '../../test/mock-player'
import type { PlayerDto } from '../../types/api'
import { PlayersTab } from './PlayersTab'

let mockPlayers: PlayerDto[] = []

vi.mock('../../hooks/useTournamentPlayers', () => ({
  useTournamentPlayers: () => ({ data: mockPlayers, isLoading: false }),
}))

beforeEach(() => {
  mockPlayers = []
})

afterEach(() => {
  cleanup()
})

describe('PlayersTab withdrawn players', () => {
  it('shows (utgått rN) marker next to withdrawn player name', () => {
    mockPlayers = [
      mockPlayer({
        id: 300,
        firstName: 'Erik',
        lastName: 'Johansson',
        club: 'SK Alfa',
        ratingN: 1500,
      }),
      mockPlayer({
        id: 301,
        firstName: 'Siv',
        lastName: 'Åberg',
        club: 'SK Gamma',
        ratingN: 1400,
        withdrawnFromRound: 2,
      }),
    ]
    render(<PlayersTab tournamentId={1} />)

    expect(screen.getByText('Siv Åberg (utgått r2)')).toBeTruthy()
  })
})

describe('PlayersTab default sort', () => {
  it('sorts by first name, not last name', () => {
    mockPlayers = [
      mockPlayer({ id: 1, firstName: 'Björn', lastName: 'Andersson' }),
      mockPlayer({ id: 2, firstName: 'Adam', lastName: 'Öberg' }),
    ]
    render(<PlayersTab tournamentId={1} />)

    const rows = within(screen.getByTestId('data-table')).getAllByRole('row')
    const bodyRows = rows.slice(1)
    expect(bodyRows[0].textContent).toContain('Adam Öberg')
    expect(bodyRows[1].textContent).toContain('Björn Andersson')
  })
})
