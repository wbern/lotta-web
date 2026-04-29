// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackupExportDialog } from './BackupExportDialog'

afterEach(cleanup)

describe('BackupExportDialog', () => {
  it('renders with encryption checkbox unchecked by default', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    const checkbox = screen.getByTestId('encrypt-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('shows password input only when encryption is checked', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    expect(screen.queryByTestId('encrypt-password')).toBeNull()

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))

    expect(screen.getByTestId('encrypt-password')).not.toBeNull()
  })

  it('disables export when encryption checked but password empty', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))

    const button = screen.getByTestId('export-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('disables export when passwords do not match', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))
    fireEvent.change(screen.getByTestId('encrypt-password'), {
      target: { value: 'secret' },
    })
    fireEvent.change(screen.getByTestId('encrypt-password-confirm'), {
      target: { value: 'different' },
    })

    const button = screen.getByTestId('export-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('shows mismatch message when passwords differ', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))
    fireEvent.change(screen.getByTestId('encrypt-password'), {
      target: { value: 'secret' },
    })
    fireEvent.change(screen.getByTestId('encrypt-password-confirm'), {
      target: { value: 'different' },
    })

    expect(screen.getByTestId('password-mismatch').textContent).toBe('Lösenorden matchar inte')
  })

  it('enables export when both passwords match', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))
    fireEvent.change(screen.getByTestId('encrypt-password'), {
      target: { value: 'secret' },
    })
    fireEvent.change(screen.getByTestId('encrypt-password-confirm'), {
      target: { value: 'secret' },
    })

    const button = screen.getByTestId('export-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('focuses password field when encryption is checked', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))

    expect(document.activeElement).toBe(screen.getByTestId('encrypt-password'))
  })

  it('calls onExport with undefined when encryption not checked', () => {
    const onExport = vi.fn()
    render(<BackupExportDialog open onClose={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByTestId('export-button'))

    expect(onExport).toHaveBeenCalledWith(undefined, false)
  })

  it('calls onExport with password when encryption checked', () => {
    const onExport = vi.fn()
    render(<BackupExportDialog open onClose={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))
    fireEvent.change(screen.getByTestId('encrypt-password'), {
      target: { value: 'my-secret' },
    })
    fireEvent.change(screen.getByTestId('encrypt-password-confirm'), {
      target: { value: 'my-secret' },
    })
    fireEvent.click(screen.getByTestId('export-button'))

    expect(onExport).toHaveBeenCalledWith('my-secret', false)
  })

  it('submits on Enter key when passwords match', () => {
    const onExport = vi.fn()
    render(<BackupExportDialog open onClose={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))
    fireEvent.change(screen.getByTestId('encrypt-password'), {
      target: { value: 'pw' },
    })
    fireEvent.change(screen.getByTestId('encrypt-password-confirm'), {
      target: { value: 'pw' },
    })
    fireEvent.submit(screen.getByTestId('encrypt-password-confirm'))

    expect(onExport).toHaveBeenCalledWith('pw', false)
  })

  it('renders the legacy-compat checkbox unchecked by default', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)
    const checkbox = screen.getByTestId('legacy-compat-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('passes legacyCompat=false to onExport when unchecked', () => {
    const onExport = vi.fn()
    render(<BackupExportDialog open onClose={vi.fn()} onExport={onExport} />)
    fireEvent.click(screen.getByTestId('export-button'))
    expect(onExport).toHaveBeenCalledWith(undefined, false)
  })

  it('passes legacyCompat=true to onExport when checked', () => {
    const onExport = vi.fn()
    render(<BackupExportDialog open onClose={vi.fn()} onExport={onExport} />)
    fireEvent.click(screen.getByTestId('legacy-compat-checkbox'))
    fireEvent.click(screen.getByTestId('export-button'))
    expect(onExport).toHaveBeenCalledWith(undefined, true)
  })

  it('associates labels with password inputs', () => {
    render(<BackupExportDialog open onClose={vi.fn()} onExport={vi.fn()} />)

    fireEvent.click(screen.getByTestId('encrypt-checkbox'))

    expect(screen.getByLabelText('Lösenord')).toBe(screen.getByTestId('encrypt-password'))
    expect(screen.getByLabelText('Bekräfta lösenord')).toBe(
      screen.getByTestId('encrypt-password-confirm'),
    )
  })
})
