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
