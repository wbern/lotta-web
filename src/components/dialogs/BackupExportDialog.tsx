import { useEffect, useId, useRef, useState } from 'react'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onExport: (password: string | undefined, legacyCompat: boolean) => void
}

export function BackupExportDialog({ open, onClose, onExport }: Props) {
  const [encrypt, setEncrypt] = useState(false)
  const [legacyCompat, setLegacyCompat] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const formId = `${id}-form`
  const passwordId = `${id}-password`
  const confirmId = `${id}-confirm`

  useEffect(() => {
    if (encrypt) {
      passwordRef.current?.focus()
    }
  }, [encrypt])

  const handleClose = () => {
    setEncrypt(false)
    setLegacyCompat(false)
    setPassword('')
    setConfirmPassword('')
    onClose()
  }

  const handleExport = () => {
    if (canExport) {
      onExport(encrypt ? password : undefined, legacyCompat)
      handleClose()
    }
  }

  const canExport = !encrypt || (password.length > 0 && password === confirmPassword)
  const showMismatch = encrypt && confirmPassword.length > 0 && password !== confirmPassword

  return (
    <Dialog
      title="Säkerhetskopiera"
      open={open}
      onClose={handleClose}
      footer={
        <>
          <button className="btn" onClick={handleClose}>
            Avbryt
          </button>
          <button
            className="btn btn-primary"
            data-testid="export-button"
            type={encrypt ? 'submit' : 'button'}
            form={encrypt ? formId : undefined}
            onClick={!encrypt ? handleExport : undefined}
            disabled={!canExport}
          >
            Exportera
          </button>
        </>
      }
    >
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            data-testid="encrypt-checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
          />{' '}
          Kryptera säkerhetskopia
        </label>
      </div>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            data-testid="legacy-compat-checkbox"
            checked={legacyCompat}
            onChange={(e) => setLegacyCompat(e.target.checked)}
          />{' '}
          Bakåtkompatibel med gammal Lotta
        </label>
      </div>
      {encrypt && (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            handleExport()
          }}
        >
          <div className="form-group">
            <label htmlFor={passwordId}>Lösenord</label>
            <input
              id={passwordId}
              ref={passwordRef}
              type="password"
              data-testid="encrypt-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={confirmId}>Bekräfta lösenord</label>
            <input
              id={confirmId}
              type="password"
              data-testid="encrypt-password-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {showMismatch && (
            <p data-testid="password-mismatch" className="form-error">
              Lösenorden matchar inte
            </p>
          )}
        </form>
      )}
    </Dialog>
  )
}
