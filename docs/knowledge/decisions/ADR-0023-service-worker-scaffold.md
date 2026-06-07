---
slug: decisions/ADR-0023-service-worker-scaffold
title: 'ADR-0023: Service worker scaffold with deferred caching strategy'
type: decision
tags: [architecture, storage, service-worker, offline, caching, build]
related:
  [
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0022-storage-capability-detection,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0017-layer-boundary-enforcement-repair,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-03-service-worker-and-pack-cli.md,
    storage/service-worker/shell-cache.ts,
    storage/service-worker/shell-cache.test.ts,
    storage/service-worker/register-service-worker.ts,
    storage/service-worker/register-service-worker.test.ts,
    storage/index.ts,
    src/service-worker.ts,
    src/main.tsx,
    vite.config.ts,
    e2e/tests/service-worker.spec.ts,
  ]
status: current
updated: 2026-06-03
---

# ADR-0023: Service worker scaffold with deferred caching strategy

## Status

Accepted, landed. The lifecycle helpers (`shellCacheName`, `staleShellCacheNames`,
`purgeStaleShellCaches`) and the registrar (`registerServiceWorker`) live under
`storage/service-worker/` with unit tests. The registrar and its types are
barrel-exported from `storage/index.ts` and invoked once from the app entry
(`src/main.tsx`). The worker entry (`src/service-worker.ts`) is a second Vite
build input that emits `/service-worker.js` at the site root. Cross-browser
serving plus activation on Chromium is verified by
`e2e/tests/service-worker.spec.ts`. This satisfies the Phase 0 deliverable of a
service worker scaffold (design specification, section 5.9).

## Context

The design specification (section 5.9) calls for a service worker that caches the
app shell, bundled registries, and the starter pack manifest plus thumbnails, is
versioned with the app, and purges old caches on update. Two pieces of that are
explicitly listed as open questions deferred to the implementation plan
(specification section 11): the specific caching strategy and the versioning
approach. Phase 0 therefore needs the lifecycle skeleton and the build wiring in
place without committing to a caching policy yet.

Three constraints shape the scaffold. First, the registrar must never break boot:
a missing, blocked, or failed worker is a degraded-but-functional state, not a
crash. Second, the layer rules apply (ADR-0001, ADR-0017): browser cache APIs
belong in `storage/`, and the worker entry that touches worker globals lives in
`src/` rather than leaking those globals into a layer. Third, the worker must be a
self-contained file at a stable root path so its scope covers the whole app.

## Decision

Split the scaffold into three seams, each with one job.

- **Lifecycle helpers in `storage/service-worker/shell-cache.ts`.** Pure
  functions over an injected `CacheStorageLike` (the two-method
  `keys()`/`delete()` slice the cleanup needs). `shellCacheName(version)` derives
  a versioned name from `SHELL_CACHE_PREFIX` (`vernacular-shell-`).
  `staleShellCacheNames` selects every prefixed cache that is not the current
  one, so cleanup never touches caches from other origins or tools.
  `purgeStaleShellCaches` deletes them and returns the purged names. Because the
  cache store is injected, both helpers are fully unit-tested without a browser.
- **A guarded registrar in `storage/service-worker/register-service-worker.ts`.**
  `registerServiceWorker(options)` takes an injectable
  `ServiceWorkerContainerLike`, an `isProduction` flag, and a `scriptUrl`, and
  returns a discriminated `ServiceWorkerRegistrationOutcome`
  (`registered | unsupported | skipped-development | failed`). It never throws:
  no container yields `unsupported`, a non-production boot yields
  `skipped-development`, a `register` rejection is captured as
  `{ status: 'failed', error }`. Every branch is unit-tested with fabricated
  containers. The app entry calls it once with
  `globalThis.navigator?.serviceWorker`, `import.meta.env.PROD`, and
  `/service-worker.js`, discarding the promise (`src/main.tsx`).
- **The worker entry in `src/service-worker.ts`.** It is deliberately the only
  consumer of `shell-cache.ts`, so Rollup folds the helper into a single
  self-contained `service-worker.js` with no shared-chunk imports. On `install`
  it `skipWaiting()`s; on `activate` it purges stale shell caches and then
  `clients.claim()`s. It reaches worker globals through a minimal local
  `ServiceWorkerScope` interface (`self as unknown as ServiceWorkerScope`) rather
  than the webworker TypeScript lib, because pulling in that lib would conflict
  with the DOM lib the rest of the project compiles against.

The Vite build gains a second Rollup input for the worker
(`vite.config.ts`). `entryFileNames` emits the worker chunk as
`service-worker.js` at the site root while every other entry keeps its hashed
`assets/[name]-[hash].js` name. The worker file is thus versioned implicitly with
the app build, and lives at a stable URL so its scope is the whole origin.

## Deliberate exclusions

- **No caching strategy and no fetch handler.** The scaffold ships with no
  `fetch` listener and an empty precache list. Choosing a strategy
  (cache-first, stale-while-revalidate, network-first per resource class) is the
  open question deferred in specification section 11. Until it lands, the worker
  installs, activates, cleans up, and controls the page, but serves nothing from
  cache.
- **No release-coupled versioning.** `SHELL_CACHE_VERSION` is a hand-bumped
  constant (currently `1`). The intended approach of deriving the cache version
  from the release is the second deferred item in section 11. The stale-cache
  purge already works against whatever the current name is, so wiring real
  versioning later is a constant change, not a structural one.
- **No precaching of registries, starter pack, or thumbnails.** Section 5.9 lists
  these as cache targets; they ride on the deferred precache list and the Phase 3
  pack pipeline.

## Consequences

- The registrar's non-throwing, discriminated outcome means the worker is purely
  additive at boot: dropping or disabling it cannot break the app, matching the
  ADR-0003 stance that storage degradation is detected and tolerated, not fatal.
- Confining cache APIs to `storage/` and worker globals to `src/service-worker.ts`
  keeps the layer direction intact (ADR-0017): `storage` still depends only on
  `core`, and no layer imports the webworker globals.
- The single-consumer rule for `shell-cache.ts` is load-bearing for the build: it
  is what lets Rollup emit a self-contained worker. A second importer of that
  module from inside `src/` would risk splitting the helper into a shared chunk
  the worker cannot resolve, so future code should reach the helpers through the
  `storage/` barrel, not through the worker entry.
- The capability-detection seam (ADR-0022) and this scaffold are the two halves
  of the Phase 0 storage foundation: detection reports what the platform offers,
  the worker establishes the offline-shell lifecycle. Neither yet performs the
  Phase 1+ work (durable stores, real precaching) they prepare for.

## References

- Design specification, section 5.9 (service worker scope), section 11 (caching
  strategy and versioning approach deferred).
- Implementation plan: `docs/plans/2026-06-03-service-worker-and-pack-cli.md`.
- Acceptance spec: `e2e/tests/service-worker.spec.ts` (worker served as
  JavaScript from the root; registers, activates, and controls the page on
  Chromium).
- ADR-0003 (the provider pattern; storage degradation is tolerated, not fatal).
- ADR-0022 (the read-only capability-detection seam; the other half of the
  Phase 0 storage foundation).
- ADR-0017 (the boundary fitness test that keeps cache APIs inside `storage`).
