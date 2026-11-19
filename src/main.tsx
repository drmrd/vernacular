import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../app'
import {
  IndexedDbRecentProjectStore,
  LocalStorageActiveProjectIdStore,
  registerServiceWorker,
  type ServiceWorkerContainerLike,
} from '../storage'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

// Under `?e2e-storage` the Playwright hook owns storage setup, so the app boots
// with its in-memory remembered id and recent list. Otherwise wire the durable
// browser ports for real users:
// - the IndexedDB recent-project list, so "Open recent" survives a reload instead
//   of resetting to empty on every page load (the in-memory fallback's behavior).
//   Construction is synchronous, so the first paint is not delayed.
// - the remembered active project id, so a reload opens the project last worked on.
// The ports of the session layer are built by the application itself, after the
// first paint; crash recovery reads the snapshots of the open project.
const isE2eStorage = new URLSearchParams(globalThis.location?.search ?? '').has('e2e-storage')
const productionProps = isE2eStorage
  ? {}
  : {
      activeProjectIds: new LocalStorageActiveProjectIdStore(),
      recentProjects: new IndexedDbRecentProjectStore(),
    }

createRoot(rootElement).render(
  <StrictMode>
    <App {...productionProps} />
  </StrictMode>,
)

// The durable browser adapters (OPFS, IndexedDB recent list, Web Locks) cannot run
// under jsdom, so a Playwright spec drives them. The hook is loaded only when the
// `e2e-storage` query parameter is present, via a dynamic import, so its code stays
// in a separate chunk that a normal page load never fetches.
if (isE2eStorage) {
  void import('./e2e-storage-hook').then((module) => {
    module.install()
  })
}

// The worker script is emitted only by production builds, so this no-ops in dev and
// tests. registerServiceWorker never throws, so a missing or blocked cache cannot
// break boot.
const serviceWorkerContainer: ServiceWorkerContainerLike | undefined =
  globalThis.navigator?.serviceWorker
void registerServiceWorker({
  container: serviceWorkerContainer,
  isProduction: import.meta.env.PROD,
  scriptUrl: '/service-worker.js',
})
