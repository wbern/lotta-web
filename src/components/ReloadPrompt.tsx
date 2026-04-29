import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect, useState } from 'react'
import { WhatsNewDialog } from './dialogs/WhatsNewDialog'
import { useToast } from './toast/useToast'

const UPDATE_INTERVAL = 60 * 60 * 1000

interface VersionInfo {
  hash: string
  date: string
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 16)
}

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        // setInterval is intentional here — this callback runs once on SW registration
        // and the interval should live for the entire page lifetime.
        setInterval(() => registration.update(), UPDATE_INTERVAL)
      }
    },
  })

  const [newVersion, setNewVersion] = useState<VersionInfo | null>(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const { show: showToast } = useToast()

  useEffect(() => {
    if (!offlineReady) return
    const dismiss = showToast({
      message: 'Appen är redo offline',
      variant: 'success',
      autoDismissMs: 5000,
    })
    return dismiss
  }, [offlineReady, showToast])

  useEffect(() => {
    if (!needRefresh) return
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setNewVersion({ hash: data.hash, date: data.date })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needRefresh])

  function close() {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  const currentHash = __COMMIT_HASH__
  const currentDate = formatDate(__COMMIT_DATE__)

  return (
    <>
      <div className="pwa-toast" role="alert">
        <button
          type="button"
          className="pwa-toast-dismiss"
          onClick={close}
          aria-label="Stäng"
          title="Stäng"
        >
          ×
        </button>
        <div className="pwa-toast-versions">
          <p>Ny version tillgänglig</p>
          {newVersion && currentHash && (
            <div className="pwa-toast-version-details">
              <span>
                Nuvarande: {currentHash}
                {currentDate && ` (${currentDate})`}
              </span>
              <span>
                Ny: {newVersion.hash}
                {newVersion.date && ` (${formatDate(newVersion.date)})`}
              </span>
            </div>
          )}
        </div>
        <div className="pwa-toast-actions">
          <button className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
            Uppdatera
          </button>
          <button className="btn" onClick={() => setShowWhatsNew(true)}>
            Visa ändringar
          </button>
          <button className="btn" onClick={close}>
            Stäng
          </button>
        </div>
      </div>
      <WhatsNewDialog open={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
    </>
  )
}
