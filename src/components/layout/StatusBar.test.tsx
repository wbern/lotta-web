// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TournamentDto } from '../../types/api'
import { StatusBar } from './StatusBar'

const tournament = {
  name: 'Test Cup',
  group: 'A',
  nrOfRounds: 5,
  roundsPlayed: 3,
} as unknown as TournamentDto

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
})

describe('StatusBar', () => {
  it('shows tournament info and round', () => {
    render(<StatusBar tournament={tournament} round={2} />)
    expect(screen.getByText(/Test Cup/)).toBeTruthy()
    expect(screen.getByText(/Rond 2\/5/)).toBeTruthy()
  })

  it('shows empty bar when no tournament selected', () => {
    render(<StatusBar tournament={undefined} round={undefined} />)
    const bar = document.querySelector('.status-bar')
    expect(bar).toBeTruthy()
  })

  it('does not show offline indicator when online', () => {
    render(<StatusBar tournament={tournament} round={1} />)
    expect(document.querySelector('.status-offline')).toBeNull()
  })

  it('shows offline indicator when browser is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

    render(<StatusBar tournament={tournament} round={1} />)
    expect(screen.getByText('Offline')).toBeTruthy()
  })

  it('shows offline indicator even without tournament', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

    render(<StatusBar tournament={undefined} round={undefined} />)
    expect(screen.getByText('Offline')).toBeTruthy()
  })

  it('reacts to going offline dynamically', () => {
    render(<StatusBar tournament={tournament} round={1} />)
    expect(document.querySelector('.status-offline')).toBeNull()

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByText('Offline')).toBeTruthy()
  })

  it('removes offline indicator when coming back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

    render(<StatusBar tournament={tournament} round={1} />)
    expect(screen.getByText('Offline')).toBeTruthy()

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
      window.dispatchEvent(new Event('online'))
    })

    expect(document.querySelector('.status-offline')).toBeNull()
  })

  it('shows connected indicator when live connection is active', () => {
    render(<StatusBar tournament={tournament} round={1} liveState="connected" />)
    expect(screen.getByTestId('status-live')).toBeTruthy()
    expect(screen.getByTestId('status-live').textContent).toContain('Live')
  })

  it('does not show live indicator when no live state', () => {
    render(<StatusBar tournament={tournament} round={1} />)
    expect(screen.queryByTestId('status-live')).toBeNull()
  })

  it('shows connecting indicator when live is connecting', () => {
    render(<StatusBar tournament={tournament} round={1} liveState="connecting" />)
    const el = screen.getByTestId('status-live')
    expect(el.classList.contains('status-live--connecting')).toBe(true)
  })

  it('shows host role text and hides tournament info when live', () => {
    render(
      <StatusBar
        tournament={tournament}
        round={1}
        liveState="connected"
        liveRole="host"
        livePeerCount={2}
      />,
    )
    expect(screen.getByTestId('status-live').textContent).toContain('Live')
    expect(screen.getByText(/Värd — 2 anslutna/)).toBeTruthy()
    expect(screen.queryByText(/Test Cup/)).toBeNull()
  })

  it('shows client role text when connected as client', () => {
    render(<StatusBar tournament={tournament} round={1} liveState="connected" liveRole="client" />)
    expect(screen.getByTestId('status-live').textContent).toContain('Live')
    expect(screen.getByText(/Ansluten till värd/)).toBeTruthy()
    expect(screen.queryByText(/Test Cup/)).toBeNull()
  })

  it('shows pending submission badge when livePendingCount > 0', () => {
    render(
      <StatusBar
        tournament={tournament}
        round={1}
        liveState="connected"
        liveRole="client"
        livePendingCount={2}
      />,
    )
    const badge = screen.getByTestId('status-pending')
    expect(badge.textContent).toContain('2')
    expect(badge.textContent?.toLowerCase()).toContain('ej synkad')
  })

  it('does not render pending badge when livePendingCount is 0', () => {
    render(
      <StatusBar
        tournament={tournament}
        round={1}
        liveState="connected"
        liveRole="client"
        livePendingCount={0}
      />,
    )
    expect(screen.queryByTestId('status-pending')).toBeNull()
  })
})
