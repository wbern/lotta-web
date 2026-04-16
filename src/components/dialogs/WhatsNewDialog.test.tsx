// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChangelogEntry } from '../../domain/changelog'

const mockEntries: ChangelogEntry[] = [
  { sha: 'c', date: '2026-04-16', type: 'feat', scope: null, breaking: false, message: 'new-3' },
  { sha: 'b', date: '2026-04-15', type: 'feat', scope: null, breaking: false, message: 'new-2' },
  { sha: 'a', date: '2026-04-14', type: 'fix', scope: null, breaking: false, message: 'current' },
  {
    sha: 'older-1',
    date: '2026-04-13',
    type: 'feat',
    scope: null,
    breaking: false,
    message: 'old-1',
  },
  {
    sha: 'older-2',
    date: '2026-04-12',
    type: 'fix',
    scope: null,
    breaking: false,
    message: 'old-2',
  },
]

vi.mock('../../domain/changelog', async () => {
  const actual =
    await vi.importActual<typeof import('../../domain/changelog')>('../../domain/changelog')
  return { ...actual, fetchChangelog: vi.fn(async () => mockEntries) }
})

vi.stubGlobal('__COMMIT_HASH__', 'a')
vi.stubGlobal('__COMMIT_DATE__', '2026-04-14 00:00:00 +0000')

import { WhatsNewDialog } from './WhatsNewDialog'

afterEach(cleanup)

describe('WhatsNewDialog version filtering', () => {
  it('hides entries older than or equal to the current version by default', async () => {
    render(<WhatsNewDialog open onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('new-3')).toBeTruthy())
    expect(screen.getByText('new-2')).toBeTruthy()
    expect(screen.queryByText('current')).toBeNull()
    expect(screen.queryByText('old-1')).toBeNull()
    expect(screen.queryByText('old-2')).toBeNull()
  })

  it('reveals older entries after clicking the expand link', async () => {
    render(<WhatsNewDialog open onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('new-3')).toBeTruthy())
    fireEvent.click(screen.getByText(/Visa tidigare versioner/))

    expect(screen.getByText('current')).toBeTruthy()
    expect(screen.getByText('old-1')).toBeTruthy()
    expect(screen.getByText('old-2')).toBeTruthy()
  })
})
