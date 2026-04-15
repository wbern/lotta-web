import { setLiveStatus } from '../hooks/useLiveStatus'
import { clearP2PService, getP2PService } from '../services/p2p-provider'
import { resetClientStore } from '../stores/client-p2p-store'
import { setActiveDataProvider } from './active-provider'

export function cleanupClientSession(): void {
  setActiveDataProvider(null)
  clearP2PService()
  resetClientStore()
  setLiveStatus(null)
}

export function disconnectFromHost(): void {
  try {
    getP2PService().leave()
  } catch {
    // Service may already be torn down
  }
  cleanupClientSession()
}
