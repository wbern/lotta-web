// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublishDialog } from './PublishDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PublishDialog', () => {
  describe('category lotta', () => {
    it('publishes pairings when the pairings option is clicked', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-pairings'))

      expect(onPublish).toHaveBeenCalledWith('pairings')
    })

    it('publishes alphabetical with the selected options', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      // Turn off per-class-per-page so the columns dropdown becomes active
      fireEvent.click(screen.getByTestId('publish-alphabetical-group-by-class'))
      fireEvent.change(screen.getByTestId('publish-alphabetical-columns'), {
        target: { value: '3' },
      })
      fireEvent.click(screen.getByTestId('publish-alphabetical-compact'))
      fireEvent.click(screen.getByTestId('publish-alphabetical'))

      expect(onPublish).toHaveBeenCalledWith('alphabetical?columns=3&groupByClass=0&compact=1')
    })

    it('disables the columns dropdown while grouping per class is on', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      const select = screen.getByTestId('publish-alphabetical-columns') as HTMLSelectElement
      // Default: group-by-class is on, so the dropdown is disabled
      expect(select.disabled).toBe(true)

      fireEvent.click(screen.getByTestId('publish-alphabetical-group-by-class'))
      expect(select.disabled).toBe(false)
    })

    it('defaults to group-by-class on + compact off', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-alphabetical'))

      expect(onPublish).toHaveBeenCalledWith('alphabetical?columns=2&groupByClass=1&compact=0')
    })

    it('closes the dialog after publishing', () => {
      const onClose = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={onClose}
          onPublish={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-pairings'))

      expect(onClose).toHaveBeenCalled()
    })

    it('labels buttons with original Lotta nouns', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      expect(screen.getByTestId('publish-pairings').textContent).toBe('Lottning')
      expect(screen.getByTestId('publish-alphabetical').textContent).toBe('Alfabetisk lottning')
    })

    it('labels column-count options with "kolumn"/"kolumner"', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      const select = screen.getByTestId('publish-alphabetical-columns')
      expect(select.textContent).toContain('1 kolumn')
      expect(select.textContent).toContain('2 kolumner')
      expect(select.textContent).toContain('8 kolumner')
    })

    it('does not show standings items', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      expect(screen.queryByTestId('publish-standings')).toBeNull()
      expect(screen.queryByTestId('publish-cross-table')).toBeNull()
      expect(screen.queryByTestId('publish-club-standings')).toBeNull()
    })

    it('disables buttons when there is no round', () => {
      render(
        <PublishDialog
          open
          hasRound={false}
          hasTournament
          chess4={false}
          category="lotta"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      const disabled = (id: string) => (screen.getByTestId(id) as HTMLButtonElement).disabled
      expect(disabled('publish-pairings')).toBe(true)
      expect(disabled('publish-alphabetical')).toBe(true)
    })
  })

  describe('category standings', () => {
    it('publishes standings when the standings option is clicked', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-standings'))

      expect(onPublish).toHaveBeenCalledWith('standings')
    })

    it('publishes cross-table when the cross-table option is clicked', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-cross-table'))

      expect(onPublish).toHaveBeenCalledWith('cross-table')
    })

    it('publishes chess4-standings when chess4 is true', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={true}
          category="standings"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-chess4-standings'))

      expect(onPublish).toHaveBeenCalledWith('chess4-standings')
    })

    it('publishes club-standings when chess4 is false', () => {
      const onPublish = vi.fn()
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={onPublish}
        />,
      )

      fireEvent.click(screen.getByTestId('publish-club-standings'))

      expect(onPublish).toHaveBeenCalledWith('club-standings')
    })

    it('does not show pairing items', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      expect(screen.queryByTestId('publish-pairings')).toBeNull()
      expect(screen.queryByTestId('publish-alphabetical')).toBeNull()
    })

    it('labels buttons with original Lotta nouns', () => {
      render(
        <PublishDialog
          open
          hasRound
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      expect(screen.getByTestId('publish-standings').textContent).toBe('Ställning')
      expect(screen.getByTestId('publish-cross-table').textContent).toBe('Korstabell')
      expect(screen.getByTestId('publish-club-standings').textContent).toBe('Klubbställning')
    })

    it('disables cross-table when there is no round', () => {
      render(
        <PublishDialog
          open
          hasRound={false}
          hasTournament
          chess4={false}
          category="standings"
          onClose={vi.fn()}
          onPublish={vi.fn()}
        />,
      )

      const disabled = (id: string) => (screen.getByTestId(id) as HTMLButtonElement).disabled
      expect(disabled('publish-cross-table')).toBe(true)
      expect(disabled('publish-standings')).toBe(false)
      expect(disabled('publish-club-standings')).toBe(false)
    })
  })
})
