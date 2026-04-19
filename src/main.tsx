import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'
import { setLocalProviderFactory } from './api/active-provider'
import { getLocalProvider } from './api/local-data-provider'
import { setPairingExecutor } from './api/pairing-executor-provider'
import { WorkerPairingExecutor } from './api/pairing-worker-executor'
import { setDatabaseService } from './api/service-provider'
import { LivePage } from './components/LivePage'
import { AppLayout } from './components/layout/AppLayout'
import { ReloadPrompt } from './components/ReloadPrompt'
import { SharedView } from './components/SharedView'
import { StorageWarning } from './components/StorageWarning'
import { DatabaseService } from './db/database-service'
import { UndoManager } from './db/undo-manager'
import { setUndoManager } from './db/undo-provider'
import { queryClient } from './query-client'
import { prefetchTurnServers } from './services/p2p-service'
import './styles/global.css'

const rootRoute = createRootRoute({
  component: Outlet,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    tournamentId: search.tournamentId ? Number(search.tournamentId) : undefined,
    round: search.round ? Number(search.round) : undefined,
    tab: (search.tab as string) || 'pairings',
  }),
})

const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/live/$roomCode',
  validateSearch: (search: Record<string, unknown>) => ({
    ref: (search.ref as string) || undefined,
    token: (search.token as string) || undefined,
    kiosk: search.kiosk === 'true' || search.kiosk === '1' || undefined,
    share: (search.share as string) || undefined,
    v: search.v != null ? String(search.v) : undefined,
    code: (search.code as string) || undefined,
  }),
  beforeLoad: () => void prefetchTurnServers(),
  component: function LiveRoute() {
    const { roomCode } = liveRoute.useParams()
    const { ref, token, kiosk, share, v, code } = liveRoute.useSearch()
    if (share === 'view' && token) {
      return <SharedView roomCode={roomCode} token={token} mode="view" code={code} />
    }
    if (share === 'full' && token) {
      return <SharedView roomCode={roomCode} token={token} mode="full" />
    }
    return (
      <LivePage
        roomCode={roomCode}
        refereeName={ref}
        refereeToken={token}
        kiosk={kiosk}
        hostVersion={v}
      />
    )
  },
})

const liveEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/live',
  component: function LiveEntryRoute() {
    return <LivePage roomCode="" />
  },
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([indexRoute]),
  liveRoute,
  liveEntryRoute,
])
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function main() {
  const service = await DatabaseService.create()
  setDatabaseService(service)

  setPairingExecutor(new WorkerPairingExecutor())

  const undoManager = await UndoManager.create()
  setUndoManager(undoManager)
  await undoManager.captureInitialState()

  setLocalProviderFactory(() => getLocalProvider())

  // Expose API functions on window for E2E tests
  if (import.meta.env.DEV) {
    const api = await import('./api/e2e-bridge')
    ;(window as unknown as Record<string, unknown>).__lottaApi = api.lottaApi
  }

  // Note: React.StrictMode is intentionally omitted. StrictMode's double-mount
  // in dev mode corrupts trystero's module-level state (WebSocket connections,
  // offer pool) causing P2P connections on the viewer/referee LivePage to fail.
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReloadPrompt />
      <StorageWarning />
    </QueryClientProvider>,
  )
}

main()
