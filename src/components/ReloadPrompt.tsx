import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect, useState } from 'react'
import { WhatsNewDialog } from './dialogs/WhatsNewDialog'
import { useToast } from './toast/useToast'

const UPDATE_INTERVAL = 60 * 60 * 1000

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

  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const { show: showToast } = useToast()

  useEffect(() => {
    if (!offlineReady) return
    const dismiss = showToast({
      message: 'Appen är redo offline',
      variant: 'success',
      autoDismissMs: 5000,
      onDismiss: () => setOfflineReady(false),
    })
    return dismiss
  }, [offlineReady, setOfflineReady, showToast])

  useEffect(() => {
    if (!needRefresh) return
    const dismiss = showToast({
      id: 'sw-update-available',
      message: 'Ny version tillgänglig',
      variant: 'info',
      onDismiss: () => setNeedRefresh(false),
      actions: [
        {
          label: 'Uppdatera',
          primary: true,
          onClick: () => updateServiceWorker(true),
        },
        {
          label: 'Visa ändringar',
          onClick: () => setShowWhatsNew(true),
        },
      ],
    })
    return dismiss
  }, [needRefresh, setNeedRefresh, showToast, updateServiceWorker])

  return <WhatsNewDialog open={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
}
