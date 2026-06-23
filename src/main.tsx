import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, DEFAULT_PROJECT_ID, resolveSnapshotStore } from '../app'
import {
  IndexedDbRecentProjectStore,
  registerServiceWorker,
  type ServiceWorkerContainerLike,
} from '../storage'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

// Under `?e2e-storage` the Playwright hook owns storage setup and injects its own
// ports, so the app boots with its in-memory defaults. Otherwise wire the durable
// browser ports for real users:
// - the IndexedDB recent-project list, so "Open recent" survives a reload instead
//   of resetting to empty on every page load (the in-memory fallback's behavior).
//   Construction is synchronous, so the first paint is not delayed.
// - crash recovery, via `resolveSnapshots`: the OPFS snapshot store resolves after
//   the first paint (an async thunk, not awaited before render), and stays off on
//   the IndexedDB fallback where there is no durable directory for the sidecar.
const isE2eStorage = new URLSearchParams(globalThis.location?.search ?? '').has('e2e-storage')
const productionProps = isE2eStorage
  ? {}
  : {
      projectId: DEFAULT_PROJECT_ID,
      recentProjects: new IndexedDbRecentProjectStore(),
      resolveSnapshots: () => resolveSnapshotStore(DEFAULT_PROJECT_ID),
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
