import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../app'
import { registerServiceWorker, type ServiceWorkerContainerLike } from '../storage'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The durable browser adapters (OPFS, IndexedDB recent list, Web Locks) cannot run
// under jsdom, so a Playwright spec drives them. The hook is loaded only when the
// `e2e-storage` query parameter is present, via a dynamic import, so its code stays
// in a separate chunk that a normal page load never fetches.
if (new URLSearchParams(globalThis.location?.search ?? '').has('e2e-storage')) {
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
