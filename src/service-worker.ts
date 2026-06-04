// Service worker entry. This file is the only consumer of shell-cache.ts so the
// build folds the lifecycle helper into a single self-contained service-worker.js.
//
// Real precaching and a fetch strategy are deferred (design specification section 11);
// this scaffold only establishes the lifecycle and stale-cache cleanup. The worker
// globals are reached through a minimal local interface to avoid pulling the
// conflicting "webworker" TypeScript lib into a project compiled with the DOM lib.
import { purgeStaleShellCaches, type CacheStorageLike } from '../storage/service-worker/shell-cache'

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}

interface ServiceWorkerScope {
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: ExtendableEventLike) => void,
  ): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  caches: CacheStorageLike
}

const scope = self as unknown as ServiceWorkerScope

scope.addEventListener('install', (event) => {
  // Activate the new worker immediately rather than waiting for old tabs to close.
  event.waitUntil(scope.skipWaiting())
})

scope.addEventListener('activate', (event) => {
  // Drop superseded shell caches, then take control of already-open pages.
  event.waitUntil(purgeStaleShellCaches(scope.caches).then(() => scope.clients.claim()))
})
