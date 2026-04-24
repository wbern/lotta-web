// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrintDialog } from './PrintDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PrintDialog', () => {
  it('calls onPrint and closes when a print option is clicked', () => {
    const onPrint = vi.fn()
    const onClose = vi.fn()
    render(
      <PrintDialog
        open
        hasRound
        hasTournament
        chess4={false}
        category="lotta"
        onClose={onClose}
        onPrint={onPrint}
      />,
    )

    fireEvent.click(screen.getByTestId('print-pairings'))

    expect(onPrint).toHaveBeenCalledWith('pairings')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows standings print options when category is standings', () => {
    render(
      <PrintDialog
        open
        hasRound
        hasTournament
        chess4={false}
        category="standings"
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    expect(screen.getByTestId('print-standings')).toBeTruthy()
    expect(screen.getByTestId('print-club-standings')).toBeTruthy()
    expect(screen.queryByTestId('print-pairings')).toBeNull()
  })

  it('disables lotta print buttons when there is no round', () => {
    render(
      <PrintDialog
        open
        hasRound={false}
        hasTournament
        chess4={false}
        category="lotta"
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    const disabled = (id: string) => (screen.getByTestId(id) as HTMLButtonElement).disabled
    expect(disabled('print-pairings')).toBe(true)
    expect(disabled('print-alphabetical')).toBe(true)
  })

  it('prints alphabetical with the selected options', () => {
    const onPrint = vi.fn()
    render(
      <PrintDialog
        open
        hasRound
        hasTournament
        chess4={false}
        category="lotta"
        onClose={vi.fn()}
        onPrint={onPrint}
      />,
    )

    fireEvent.click(screen.getByTestId('print-alphabetical-group-by-class'))
    fireEvent.click(screen.getByTestId('print-alphabetical-compact'))
    fireEvent.click(screen.getByTestId('print-alphabetical'))

    expect(onPrint).toHaveBeenCalledWith('alphabetical?groupByClass=0&compact=1')
  })

  it('shows pairing print options when category is lotta', () => {
    render(
      <PrintDialog
        open
        hasRound
        hasTournament
        chess4={false}
        category="lotta"
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    expect(screen.getByTestId('print-pairings')).toBeTruthy()
    expect(screen.getByTestId('print-alphabetical')).toBeTruthy()
    expect(screen.queryByTestId('print-standings')).toBeNull()
  })
})
