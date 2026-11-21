import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../app'
import { registerServiceWorker, type ServiceWorkerContainerLike } from '../storage'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

// The ports of the session layer are built by the application itself, after the
// first paint. The start opens the project used last, as the project index tells,
// under `?e2e-storage` as on any page; crash recovery reads the snapshots of the
// open project.
const isE2eStorage = new URLSearchParams(globalThis.location?.search ?? '').has('e2e-storage')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The durable browser adapters (OPFS, the IndexedDB project index, Web Locks) cannot run
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
