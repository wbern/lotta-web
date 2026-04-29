// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedFakePlayers } from '../../api/seed-players'
import { addTournamentPlayers } from '../../api/tournament-players'
import type { PlayerDto, TournamentListItemDto } from '../../types/api'
import { ToastProvider } from '../toast/ToastProvider'
import { SeedPlayersDialog } from './SeedPlayersDialog'

vi.mock('../../api/seed-players', () => ({
  seedFakePlayers: vi.fn().mockResolvedValue({ players: [], clubs: [] }),
}))

vi.mock('../../api/tournament-players', () => ({
  addTournamentPlayers: vi.fn().mockResolvedValue(undefined),
}))

const mockTournaments = vi.hoisted(() => ({ value: [] }) as { value: TournamentListItemDto[] })

const mockCreateTournamentMutate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 999 }))

vi.mock('../../hooks/useTournaments', () => ({
  useTournaments: () => ({ data: mockTournaments.value }),
  useCreateTournament: () => ({
    mutateAsync: mockCreateTournamentMutate,
  }),
}))

function renderDialog(props: Partial<Parameters<typeof SeedPlayersDialog>[0]> = {}) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SeedPlayersDialog open onClose={vi.fn()} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

function setTournaments(list: TournamentListItemDto[]) {
  mockTournaments.value = list
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockTournaments.value = []
})

const sampleTournaments: TournamentListItemDto[] = [
  {
    id: 1,
    name: 'Vårspelen 2026',
    group: 'Grupp A',
    pairingSystem: 'Monrad',
    nrOfRounds: 7,
    roundsPlayed: 0,
    playerCount: 0,
    finished: false,
  },
  {
    id: 2,
    name: 'Vårspelen 2026',
    group: 'Grupp B',
    pairingSystem: 'Monrad',
    nrOfRounds: 7,
    roundsPlayed: 0,
    playerCount: 0,
    finished: false,
  },
]

describe('SeedPlayersDialog tournament target dropdown', () => {
  it('lists each existing tournament+group plus pool-only and random options', () => {
    setTournaments(sampleTournaments)
    renderDialog()

    const select = screen.getByTestId('seed-target-select') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => ({
      value: o.value,
      label: o.textContent,
    }))

    expect(options).toEqual([
      { value: '', label: 'Ingen turnering (endast spelarpool)' },
      { value: '1', label: 'Vårspelen 2026 / Grupp A' },
      { value: '2', label: 'Vårspelen 2026 / Grupp B' },
      { value: 'random', label: 'Skapa ny slumpmässig turnering' },
    ])
  })

  it('seeds players into the selected existing tournament', async () => {
    setTournaments(sampleTournaments)
    const fakePlayers = [{ id: 101 }, { id: 102 }, { id: 103 }] as PlayerDto[]
    vi.mocked(seedFakePlayers).mockResolvedValueOnce({
      players: fakePlayers,
      clubs: [],
    })
    renderDialog()

    fireEvent.change(screen.getByTestId('seed-target-select'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Skapa'))

    await waitFor(() => {
      expect(addTournamentPlayers).toHaveBeenCalledWith(2, fakePlayers)
    })
  })

  it('creates a new random tournament and seeds players into it', async () => {
    const fakePlayers = [{ id: 201 }, { id: 202 }] as PlayerDto[]
    vi.mocked(seedFakePlayers).mockResolvedValueOnce({
      players: fakePlayers,
      clubs: [],
    })
    renderDialog()

    fireEvent.change(screen.getByTestId('seed-target-select'), {
      target: { value: 'random' },
    })
    fireEvent.click(screen.getByText('Skapa'))

    await waitFor(() => {
      expect(mockCreateTournamentMutate).toHaveBeenCalledTimes(1)
    })
    const createArg = mockCreateTournamentMutate.mock.calls[0][0]
    expect(typeof createArg.name).toBe('string')
    expect(createArg.name.length).toBeGreaterThan(0)
    expect(createArg.group).toBeDefined()
    await waitFor(() => {
      expect(addTournamentPlayers).toHaveBeenCalledWith(999, fakePlayers)
    })
  })
})

describe('SeedPlayersDialog feedback', () => {
  it('shows a success toast after seeding into the player pool', async () => {
    const fakePlayers = [{ id: 301 }, { id: 302 }] as PlayerDto[]
    vi.mocked(seedFakePlayers).mockResolvedValueOnce({
      players: fakePlayers,
      clubs: [],
    })
    renderDialog()

    fireEvent.click(screen.getByText('Skapa'))

    const toast = await waitFor(() => screen.getByTestId('toast'))
    expect(toast.className).toContain('toast--success')
    expect(toast.textContent).toContain('2 testspelare')
  })
})

describe('SeedPlayersDialog club generation', () => {
  it('shows a checkbox for creating random clubs', () => {
    renderDialog()

    expect(screen.getByTestId('seed-create-clubs')).not.toBeNull()
  })

  it('shows club count input when checkbox is checked', () => {
    renderDialog()

    expect(screen.queryByTestId('seed-club-count')).toBeNull()

    const checkbox = screen.getByTestId('seed-create-clubs').querySelector('input')!
    fireEvent.click(checkbox)

    const clubCountInput = screen.getByTestId('seed-club-count') as HTMLInputElement
    expect(clubCountInput).not.toBeNull()
    expect(clubCountInput.value).toBe('5')
  })

  it('passes clubCount option when clubs checkbox is enabled', async () => {
    renderDialog()

    const checkbox = screen.getByTestId('seed-create-clubs').querySelector('input')!
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByText('Skapa'))

    await waitFor(() => {
      expect(seedFakePlayers).toHaveBeenCalledWith(20, { clubCount: 5 })
    })
  })

  it('passes no clubCount option when clubs checkbox is disabled', async () => {
    renderDialog()

    fireEvent.click(screen.getByText('Skapa'))

    await waitFor(() => {
      expect(seedFakePlayers).toHaveBeenCalledWith(20, { clubCount: undefined })
    })
  })
})
