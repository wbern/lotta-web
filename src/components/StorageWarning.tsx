import { useEffect, useRef } from 'react'
import { useClientP2PStore } from '../stores/client-p2p-store'
import { useToast } from './toast/useToast'

const DISMISSED_KEY = 'storage-warning-dismissed'

export function StorageWarning() {
  const { shareMode } = useClientP2PStore()
  const { show } = useToast()
  const dismissRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (shareMode) {
      dismissRef.current?.()
      dismissRef.current = null
      return
    }
    if (window.location.pathname.startsWith('/live/')) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (!navigator.storage?.persist) return
    if (dismissRef.current) return

    let cancelled = false
    navigator.storage.persist().then((granted) => {
      if (granted || cancelled || dismissRef.current) return

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      dismissRef.current = show({
        message: isStandalone
          ? 'Webbläsaren kan radera turneringsdata vid lågt lagringsutrymme. Säkerhetskopiera regelbundet via Inställningar.'
          : 'Webbläsaren kan radera turneringsdata om du inte besöker appen på ett tag. Installera appen eller säkerhetskopiera regelbundet via Inställningar.',
        variant: 'warning',
        action: {
          label: 'OK',
          onClick: () => localStorage.setItem(DISMISSED_KEY, '1'),
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [shareMode, show])

  return null
}
