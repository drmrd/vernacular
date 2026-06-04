# Service Worker and Pack CLI Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (test-author writes a failing test and commits it `test:`), GREEN (implementer writes the minimal pass and commits it `feat:`), then BLUE (clean-code-reviewer audits, refactorer applies fixes, a `refactor:` marker commit closes the phase when there is nothing to change). Tasks marked `(infrastructure)` are controller-authored glue (barrel exports, build wiring, the end-to-end spec, scripts, fixtures, the roadmap edit, the agent definition); they carry no RGB triple and are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two remaining Phase 0 build-foundation pieces: a service worker scaffold that registers with the app and establishes the offline lifecycle without yet committing to a caching strategy, and a `vernacular-pack` CLI scaffold with a pure, tested manifest validator wired to a `pnpm pack:build` script.

**Architecture:** The service worker is split into pure, dependency-injected logic in `storage/service-worker/` (a stale-cache helper and a registration-decision function), a thin worker entry in `src/service-worker.ts` that Vite builds to a stable root URL, and one line of boot wiring in `src/main.tsx`. The pack CLI is plain ESM under `scripts/pack/` (matching the existing `scripts/knowledge-index.mjs` convention): a pure `validatePackManifest` function plus a dependency-injected `runPackCli` shell. No real precaching, no fetch strategy, and no thumbnail baking or publishing are built here.

**Tech Stack:** TypeScript (strict) for the worker lifecycle and registration logic, Vitest with injected fakes for deterministic unit coverage, plain JSDoc-typed ESM for the CLI, Vite multi-entry build for the worker bundle, Playwright for cross-browser verification that the worker script is served and (on Chromium) activates.

**Scope boundary (design specification section 4.3, 4.5, 4.10, 5.9, and section 10 Phase 0 deliverables "Service worker scaffold (no real caching yet)" and "Build tooling: `vernacular-pack` CLI scaffold"):**

In scope:

- A service worker that registers in production builds, takes control of open pages, and purges stale versioned caches on activate.
- A pure, unit-tested registration-decision function that no-ops outside production and when the API is unsupported, and reports failures without throwing.
- A Vite build entry that emits a self-contained `service-worker.js` at the site root, versioned with the app build.
- Cross-browser verification that the worker script is served, plus Chromium verification that it activates and controls the page.
- A `vernacular-pack` CLI scaffold exposing `validate <packDir>` and `build <packDir>`, backed by a pure manifest validator that performs the license and dimension sanity checks the specification calls out.
- A `pnpm pack:build` (and sibling `pnpm pack:validate`) script and an example pack fixture.
- A `pack-validator` subagent definition, which CLAUDE.md says "lands alongside the pack tooling."

Out of scope and deliberately deferred (specification section 11 lists the first two as intentionally open):

- The specific caching strategy (what to precache, cache-first versus network-first): the worker ships with an empty precache list and no `fetch` handler.
- The release-coupled cache-versioning approach: a single hand-bumped constant stands in for now.
- The full pack build pipeline (content-hash verification, thumbnail baking at build time, signing, publishing): Phase 3.
- Moving the pack manifest schema into `core/` as shared TypeScript: that happens when the in-app pack loader lands in Phase 3. The scaffold keeps validation in plain ESM so the CLI runs under `node` with zero new dependencies and no build step.
- The `/pack:new` and `/migration:new` slash commands and the `migration-author` agent: not Phase 0 deliverables.
- `pnpm rgb:audit`: a separate Phase 0 deliverable, not part of this milestone.

**Branch:** `feat/service-worker-and-pack-cli`.

---

## File structure

New and modified files, grouped by responsibility:

```
storage/service-worker/
  shell-cache.ts                     (create)  SHELL_CACHE_PREFIX, SHELL_CACHE_VERSION,
                                               shellCacheName, staleShellCacheNames,
                                               CacheStorageLike, purgeStaleShellCaches
  shell-cache.test.ts                (create)  unit tests: name derivation, stale filter, purge
  register-service-worker.ts         (create)  ServiceWorkerContainerLike,
                                               ServiceWorkerRegistrationOutcome,
                                               RegisterServiceWorkerOptions, registerServiceWorker
  register-service-worker.test.ts    (create)  unit tests: the four outcomes

storage/index.ts                     (modify, infra)  barrel: registerServiceWorker + its types

src/
  service-worker.ts                  (create, infra glue)  worker entry: install/activate lifecycle
  main.tsx                           (modify, infra)       register the worker on boot
  vite-env.d.ts                      (create, infra)       /// reference vite/client (types import.meta.env)

vite.config.ts                       (modify, infra)  single source of truth; SW build input;
                                                       coverage excludes src/service-worker.ts
vite.config.js                       (clear, infra)   stale gitignored tsc -b artifact; not a git change

e2e/tests/
  service-worker.spec.ts             (create, infra)  worker script served cross-browser;
                                                       activates + controls on Chromium

scripts/pack/
  manifest-validation.mjs            (create)  ASSET_KINDS, validatePackManifest (pure)
  manifest-validation.test.mjs       (create)  unit tests: top-level fields, assets, dimensions
  vernacular-pack.mjs                (create)  runPackCli (DI) + direct-invocation node shim
  vernacular-pack.test.mjs           (create)  unit tests: success, invalid, usage, read failure

tests/fixtures/packs/example-pack/
  manifest.json                      (create, infra)  a valid manifest the CLI and tests consume

package.json                         (modify, infra)  pack:build and pack:validate scripts

.claude/agents/
  pack-validator.md                  (create, infra)  the pack-validation subagent

ROADMAP.md                           (modify, infra)  mark "Service worker and pack CLI" done
```

Layering notes: the worker lifecycle and registration logic live in `storage/` because they touch browser storage and runtime globals, the layer that already owns that responsibility (ADR-0003, ESLint `boundaries/include`). `src/` is the composition-bootstrap directory (it already holds `main.tsx`) and is outside the layer-boundary graph, so the worker entry may import the `storage/` module directly. The pack CLI lives in `scripts/`, which is outside the layer graph and the coverage `include` set, matching `scripts/knowledge-index.mjs`.

A deliberate bundling decision: the worker entry imports `purgeStaleShellCaches` from the deep module path `../storage/service-worker/shell-cache`, and that runtime function is intentionally NOT re-exported from the `storage/` barrel. Because the worker entry is then the only consumer of `shell-cache.ts`, Rollup folds it into the worker chunk and emits a single self-contained `service-worker.js` with no shared chunk references. `registerServiceWorker` is the only worker-related symbol the barrel exposes, and only `src/main.tsx` (the app entry) consumes it.

---

## Section 0: reconcile the Vite configuration (infrastructure)

### Task 0: confirm the single tracked Vite config and clear the stale artifact

The repository has both `vite.config.js` and `vite.config.ts` on disk, but only `vite.config.ts` is tracked. `vite.config.js` is a gitignored build artifact: the composite `tsconfig.node.json` has no `outDir` and does not set `noEmit`, so `tsc -b` emits `vite.config.js` beside its source. Vite resolves config files in the order `js, mjs, ts, cjs, ...`, so at build time it loads the freshly emitted `vite.config.js`, which `tsc -b` regenerates from `vite.config.ts` whenever the source changes. The source of truth is therefore already singular (`vite.config.ts`); there is no tracked duplicate to remove and nothing to commit. The only hazard is a stale on-disk `vite.config.js` left over from a previous build being picked up by tooling that does not run `tsc -b` first (the dev server, preview, direct vitest runs). Clear it so interim test runs read the live `.ts`. All SW config edits land in `vite.config.ts` (Task A4); never hand-edit the emitted `.js`.

**Files:**

- Remove (on-disk, gitignored artifact, not a git change): `vite.config.js`, `vite.config.d.ts`
- Modify: `vite.config.ts` (the single tracked source; the SW entry is added in Task A4)

- [ ] **Step 1: Confirm only the TypeScript config is tracked**

Run: `git ls-files | grep -E 'vite|vitest'` and `git check-ignore -v vite.config.js`
Expected: `vite.config.ts` is tracked; `vite.config.js` is ignored (matched by `.gitignore`).

- [ ] **Step 2: Clear the stale on-disk artifact**

```bash
rm -f vite.config.js vite.config.d.ts
```

- [ ] **Step 3: Verify the toolchain stays green (Vite now reads vite.config.ts directly)**

Run: `pnpm test`
Expected: all tests pass; vitest resolves `vite.config.ts`. (A later `pnpm build` re-emits `vite.config.js` from the updated `.ts`; that is expected and gitignored.)

- [ ] **Step 4: No commit**

Nothing tracked changed, so there is no commit for this task. The SW edit to `vite.config.ts` is committed in Task A4.

---

## Section A: service worker scaffold

### Task A1: derive the versioned shell-cache name and select stale caches

**Files:**

- Create: `storage/service-worker/shell-cache.ts`
- Test: `storage/service-worker/shell-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `storage/service-worker/shell-cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SHELL_CACHE_PREFIX, shellCacheName, staleShellCacheNames } from './shell-cache'

describe('shellCacheName', () => {
  it('derives a versioned cache name under the shell prefix', () => {
    const name = shellCacheName(3)
    expect(name.startsWith(SHELL_CACHE_PREFIX)).toBe(true)
    expect(name).toBe(`${SHELL_CACHE_PREFIX}v3`)
  })
})

describe('staleShellCacheNames', () => {
  it('selects shell caches other than the current one and ignores foreign caches', () => {
    const current = shellCacheName(2)
    const existing = [shellCacheName(1), current, 'workbox-precache', 'some-other-cache']

    expect(staleShellCacheNames(existing, current)).toEqual([shellCacheName(1)])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/service-worker/shell-cache.test.ts`
Expected: FAIL, module `./shell-cache` not found / exports undefined.

- [ ] **Step 3: Write the minimal implementation**

Create `storage/service-worker/shell-cache.ts`:

```ts
/**
 * Prefix shared by every version of the application-shell cache. Cleanup uses it
 * to recognize caches this app owns without disturbing caches from other origins
 * or tools.
 */
export const SHELL_CACHE_PREFIX = 'vernacular-shell-'

/**
 * The shell-cache schema version. Bumped by hand when the precache contents change.
 * The release-coupled versioning approach is deferred (design specification section 11).
 */
export const SHELL_CACHE_VERSION = 1

/** The cache name for a given shell-cache version. */
export function shellCacheName(version: number = SHELL_CACHE_VERSION): string {
  return `${SHELL_CACHE_PREFIX}v${version}`
}

/** The shell caches that are not the current one and so should be purged on activate. */
export function staleShellCacheNames(
  existingNames: readonly string[],
  current: string = shellCacheName(),
): string[] {
  return existingNames.filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== current)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run storage/service-worker/shell-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the RED then GREEN as the cycle dictates**

The test-author commits the failing test:

```bash
git add storage/service-worker/shell-cache.test.ts
git commit -m "test: pin the versioned shell-cache name and stale-cache selection"
```

The implementer commits the minimal pass:

```bash
git add storage/service-worker/shell-cache.ts
git commit -m "feat(storage): derive versioned shell-cache name and stale-cache filter"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`. A `refactor:` marker commit closes the phase if there is nothing actionable.

---

### Task A2: purge stale shell caches through an injected cache store

**Files:**

- Modify: `storage/service-worker/shell-cache.ts`
- Test: `storage/service-worker/shell-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `storage/service-worker/shell-cache.test.ts`:

```ts
import { purgeStaleShellCaches, type CacheStorageLike } from './shell-cache'

describe('purgeStaleShellCaches', () => {
  it('deletes every stale shell cache and returns their names', async () => {
    const deleted: string[] = []
    const current = shellCacheName()
    const host: CacheStorageLike = {
      keys: () => Promise.resolve([shellCacheName(0), current, 'unrelated-cache']),
      delete: (name) => {
        deleted.push(name)
        return Promise.resolve(true)
      },
    }

    const purged = await purgeStaleShellCaches(host)

    expect(purged).toEqual([shellCacheName(0)])
    expect(deleted).toEqual([shellCacheName(0)])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/service-worker/shell-cache.test.ts`
Expected: FAIL, `purgeStaleShellCaches` / `CacheStorageLike` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `storage/service-worker/shell-cache.ts`:

```ts
/** The narrow slice of the CacheStorage API the cleanup needs. */
export interface CacheStorageLike {
  keys(): Promise<string[]>
  delete(cacheName: string): Promise<boolean>
}

/** Delete every stale shell cache. Returns the names that were purged. */
export async function purgeStaleShellCaches(caches: CacheStorageLike): Promise<string[]> {
  const stale = staleShellCacheNames(await caches.keys())
  await Promise.all(stale.map((name) => caches.delete(name)))
  return stale
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run storage/service-worker/shell-cache.test.ts`
Expected: PASS (both Task A1 and A2 tests green).

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add storage/service-worker/shell-cache.test.ts
git commit -m "test: pin stale shell-cache purging over an injected cache store"
```

```bash
git add storage/service-worker/shell-cache.ts
git commit -m "feat(storage): purge stale shell caches through an injected cache store"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task A3: decide whether and how to register the service worker

**Files:**

- Create: `storage/service-worker/register-service-worker.ts`
- Test: `storage/service-worker/register-service-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `storage/service-worker/register-service-worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, type ServiceWorkerContainerLike } from './register-service-worker'

function fakeContainer(register = vi.fn(() => Promise.resolve({}))): ServiceWorkerContainerLike {
  return { register }
}

describe('registerServiceWorker', () => {
  it('registers the script as a module in production when the API is present', async () => {
    const register = vi.fn(() => Promise.resolve({}))
    const outcome = await registerServiceWorker({
      container: fakeContainer(register),
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'registered' })
    expect(register).toHaveBeenCalledWith('/service-worker.js', { type: 'module' })
  })

  it('skips registration outside production without touching the API', async () => {
    const register = vi.fn(() => Promise.resolve({}))
    const outcome = await registerServiceWorker({
      container: fakeContainer(register),
      isProduction: false,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'skipped-development' })
    expect(register).not.toHaveBeenCalled()
  })

  it('reports unsupported environments instead of throwing', async () => {
    const outcome = await registerServiceWorker({
      container: undefined,
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'unsupported' })
  })

  it('captures a registration failure instead of rejecting', async () => {
    const error = new Error('registration blocked')
    const outcome = await registerServiceWorker({
      container: fakeContainer(vi.fn(() => Promise.reject(error))),
      isProduction: true,
      scriptUrl: '/service-worker.js',
    })

    expect(outcome).toEqual({ status: 'failed', error })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/service-worker/register-service-worker.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `storage/service-worker/register-service-worker.ts`:

```ts
/** The narrow slice of ServiceWorkerContainer the registrar needs. */
export interface ServiceWorkerContainerLike {
  register(
    scriptUrl: string,
    options?: { scope?: string; type?: 'classic' | 'module' },
  ): Promise<unknown>
}

/** The result of a registration attempt. Never thrown; always returned. */
export type ServiceWorkerRegistrationOutcome =
  | { status: 'registered' }
  | { status: 'unsupported' }
  | { status: 'skipped-development' }
  | { status: 'failed'; error: unknown }

export interface RegisterServiceWorkerOptions {
  container: ServiceWorkerContainerLike | undefined
  isProduction: boolean
  scriptUrl: string
}

/**
 * Register the application service worker, guarding the cases where registration
 * should not or cannot happen. The worker script only exists in production builds,
 * so development and test boots are a no-op. Failures are reported, not thrown,
 * because a missing cache must never break the app.
 */
export async function registerServiceWorker(
  options: RegisterServiceWorkerOptions,
): Promise<ServiceWorkerRegistrationOutcome> {
  const { container, isProduction, scriptUrl } = options
  if (!container) {
    return { status: 'unsupported' }
  }
  if (!isProduction) {
    return { status: 'skipped-development' }
  }
  try {
    await container.register(scriptUrl, { type: 'module' })
    return { status: 'registered' }
  } catch (error) {
    return { status: 'failed', error }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run storage/service-worker/register-service-worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add storage/service-worker/register-service-worker.test.ts
git commit -m "test: pin service-worker registration outcomes across environments"
```

```bash
git add storage/service-worker/register-service-worker.ts
git commit -m "feat(storage): add a guarded service-worker registration decision"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task A4: wire the worker entry, boot registration, and build (infrastructure)

This task is controller-authored glue. The worker entry and the boot line are excluded from coverage like the other composition-root glue (`src/main.tsx` is already excluded).

**Files:**

- Modify: `storage/index.ts`
- Create: `src/service-worker.ts`
- Create: `src/vite-env.d.ts`
- Modify: `src/main.tsx`
- Modify: `vite.config.ts`

- [ ] **Step 1: Export the registrar (not the worker-only runtime) from the storage barrel**

Add to the end of `storage/index.ts`:

```ts
export { registerServiceWorker } from './service-worker/register-service-worker'
export type {
  ServiceWorkerContainerLike,
  ServiceWorkerRegistrationOutcome,
  RegisterServiceWorkerOptions,
} from './service-worker/register-service-worker'
```

Do not export `shell-cache.ts` runtime symbols here. Keeping the worker entry as the only consumer of `shell-cache.ts` is what lets Rollup emit a single self-contained `service-worker.js`.

- [ ] **Step 2: Create the worker entry**

Create `src/service-worker.ts`:

```ts
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
```

- [ ] **Step 3: Type `import.meta.env` for the bootstrap**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Register the worker on boot**

Replace the contents of `src/main.tsx` with:

```tsx
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
```

- [ ] **Step 5: Add the worker build input and exclude the entry from coverage**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest" />
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        'service-worker': resolve(rootDir, 'src/service-worker.ts'),
      },
      output: {
        // Emit the worker at a stable root path (/service-worker.js) so its scope
        // covers the whole app; hash every other entry as usual.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? '[name].js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
        'core/**/*.{ts,tsx}',
        'storage/**/*.{ts,tsx}',
        'engine/**/*.{ts,tsx}',
        'bridge/**/*.{ts,tsx}',
        'editor/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.stories.tsx',
        'src/main.tsx',
        'src/service-worker.ts',
        'src/setupTests.ts',
        'engine/renderer/create-renderer.ts',
        'bridge/react/webgpu-scene-view.tsx',
        'bridge/react/use-scene-graph.ts',
        'bridge/react/use-autosave.ts',
        'editor/plan/plan-view.tsx',
        'storage/indexeddb/indexeddb-project-store.ts',
      ],
    },
  },
})
```

- [ ] **Step 6: Verify typecheck, lint, unit tests, and the build emit the worker**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

Run: `test -f dist/service-worker.js && echo present`
Expected: prints `present` (the worker emitted to the site root as a single file).

Run: `node -e "const s=require('node:fs').readFileSync('dist/service-worker.js','utf8'); if(/\bimport\b/.test(s)) { console.error('worker has external imports'); process.exit(1) } console.log('self-contained')"`
Expected: prints `self-contained` (the worker bundle pulled `shell-cache.ts` in rather than splitting it into a shared chunk). If this fails, confirm `shell-cache.ts` runtime symbols are not re-exported from `storage/index.ts`.

- [ ] **Step 7: Commit**

```bash
git add storage/index.ts src/service-worker.ts src/vite-env.d.ts src/main.tsx vite.config.ts
git commit -m "feat(app): register a service-worker scaffold and build it to the site root"
```

---

### Task A5: verify the worker is served and activates (infrastructure, end-to-end)

Playwright runs against `pnpm preview`, which serves the production `dist/`, so the worker exists for these tests. Service-worker activation is reliable on Chromium in Playwright; the cross-browser assertion is limited to the script being served.

**Files:**

- Create: `e2e/tests/service-worker.spec.ts`

- [ ] **Step 1: Write the end-to-end spec**

Create `e2e/tests/service-worker.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Service worker scaffold', () => {
  test('serves the worker script as JavaScript from the site root', async ({ page }) => {
    const response = await page.request.get('/service-worker.js')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('javascript')
  })

  test('registers, activates, and controls the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Worker activation is verified on Chromium')

    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()

    const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null)
    expect(controlled).toBe(true)
  })
})
```

- [ ] **Step 2: Build, then run the spec**

Run: `pnpm build && pnpm exec playwright test service-worker`
Expected: the "serves the worker script" test passes on chromium, firefox, and webkit; the "registers, activates, and controls" test passes on chromium and is skipped elsewhere.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/service-worker.spec.ts
git commit -m "test(e2e): verify the service worker is served and activates on Chromium"
```

---

## Section B: vernacular-pack CLI scaffold

The CLI and its validator are plain ESM (JSDoc-typed), matching `scripts/knowledge-index.mjs`. They run directly under `node` with no build step and no new dependencies. Vitest discovers `scripts/pack/*.test.mjs` (its default include matches `.mjs`), and the `scripts/` tree is outside the coverage `include` set, so these tests run without affecting layer coverage. The manifest shape follows design specification section 4.3 (manifest fields) and section 4.5 (the asset `kind` enumeration).

### Task B1: validate top-level manifest fields

**Files:**

- Create: `scripts/pack/manifest-validation.mjs`
- Test: `scripts/pack/manifest-validation.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/pack/manifest-validation.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './manifest-validation.mjs'

function validManifest() {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
    assets: [],
  }
}

describe('validatePackManifest top-level fields', () => {
  it('accepts a well-formed manifest', () => {
    expect(validatePackManifest(validManifest())).toEqual({ valid: true, errors: [] })
  })

  it('rejects a non-object manifest', () => {
    expect(validatePackManifest(null).valid).toBe(false)
  })

  it('reports each missing required top-level field', () => {
    const result = validatePackManifest({ assets: [] })

    expect(result.valid).toBe(false)
    for (const field of ['packId', 'version', 'license', 'attribution']) {
      expect(result.errors.some((message) => message.includes(field))).toBe(true)
    }
  })

  it('rejects a version that is not SemVer', () => {
    const result = validatePackManifest({ ...validManifest(), version: 'v1' })

    expect(result.valid).toBe(false)
    expect(result.errors.some((message) => message.includes('version'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/pack/manifest-validation.mjs`:

```js
// scripts/pack/manifest-validation.mjs
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. When the in-app pack loader lands (phase 3)
// this schema graduates to core/ as shared TypeScript.

/** @typedef {{ valid: boolean, errors: string[] }} PackValidationResult */

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string[]} errors
 * @param {string} [label]
 * @returns {boolean} whether the field was a non-empty string
 */
function validateRequiredString(source, key, errors, label = key) {
  const value = source[key]
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} is required`)
    return false
  }
  return true
}

/**
 * Validate a parsed pack manifest.
 * @param {unknown} manifest
 * @returns {PackValidationResult}
 */
export function validatePackManifest(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest must be a JSON object'] }
  }
  const errors = []
  const source = /** @type {Record<string, unknown>} */ (manifest)
  validateRequiredString(source, 'packId', errors)
  validateRequiredString(source, 'license', errors)
  validateRequiredString(source, 'attribution', errors)
  if (
    validateRequiredString(source, 'version', errors) &&
    !SEMVER_PATTERN.test(String(source.version))
  ) {
    errors.push('version must be valid SemVer (for example 1.0.0)')
  }
  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/pack/manifest-validation.test.mjs
git commit -m "test: pin pack-manifest top-level field validation"
```

```bash
git add scripts/pack/manifest-validation.mjs
git commit -m "feat(pack): validate top-level pack-manifest fields"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task B2: validate each asset's identity, license, and kind

**Files:**

- Modify: `scripts/pack/manifest-validation.mjs`
- Test: `scripts/pack/manifest-validation.test.mjs`

- [ ] **Step 1: Write the failing test**

Add to `scripts/pack/manifest-validation.test.mjs`:

```js
import { ASSET_KINDS } from './manifest-validation.mjs'

function validAsset() {
  return {
    contentHash: '0'.repeat(64),
    name: 'Example chair',
    kind: 'furniture',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    dimensions: { width: 500, depth: 520, height: 800 },
  }
}

describe('validatePackManifest assets', () => {
  it('exposes the asset kinds from the specification', () => {
    expect(ASSET_KINDS).toContain('furniture')
    expect(ASSET_KINDS).toContain('preview-only')
  })

  it('rejects an assets field that is not an array', () => {
    const result = validatePackManifest({ ...validManifest(), assets: {} })

    expect(result.errors.some((message) => message.includes('assets must be an array'))).toBe(true)
  })

  it('flags a missing content hash, name, license, and unknown kind', () => {
    const broken = { kind: 'spaceship', dimensions: { width: 1, depth: 1, height: 1 } }
    const result = validatePackManifest({ ...validManifest(), assets: [broken] })

    expect(result.valid).toBe(false)
    for (const fragment of ['contentHash', 'name', 'license', 'kind']) {
      expect(result.errors.some((message) => message.includes(fragment))).toBe(true)
    }
  })

  it('accepts a well-formed asset', () => {
    const result = validatePackManifest({ ...validManifest(), assets: [validAsset()] })

    expect(result).toEqual({ valid: true, errors: [] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: FAIL, `ASSET_KINDS` not exported and asset validation absent.

- [ ] **Step 3: Write the minimal implementation**

In `scripts/pack/manifest-validation.mjs`, add the exported kinds and hash pattern near the top (after `SEMVER_PATTERN`):

```js
/**
 * The asset kinds a pack may declare (design specification section 4.5).
 * @typedef {'furniture'|'architectural-element'|'trim-profile'|'stair-component'|'material'|'texture'|'underlay-image'|'palette'|'preview-only'} AssetKind
 */
export const ASSET_KINDS = Object.freeze([
  'furniture',
  'architectural-element',
  'trim-profile',
  'stair-component',
  'material',
  'texture',
  'underlay-image',
  'palette',
  'preview-only',
])

const SHA256_PATTERN = /^[0-9a-f]{64}$/
```

Add the asset helpers above `validatePackManifest`:

```js
/**
 * @param {unknown} asset
 * @param {number} index
 * @param {string[]} errors
 */
function validateAsset(asset, index, errors) {
  const label = `assets[${index}]`
  if (typeof asset !== 'object' || asset === null) {
    errors.push(`${label} must be an object`)
    return
  }
  const source = /** @type {Record<string, unknown>} */ (asset)
  if (
    validateRequiredString(source, 'contentHash', errors, `${label}.contentHash`) &&
    !SHA256_PATTERN.test(String(source.contentHash))
  ) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  validateRequiredString(source, 'name', errors, `${label}.name`)
  validateRequiredString(source, 'license', errors, `${label}.license`)
  if (!ASSET_KINDS.includes(source.kind)) {
    errors.push(`${label}.kind must be one of: ${ASSET_KINDS.join(', ')}`)
  }
}

/**
 * @param {unknown} assets
 * @param {string[]} errors
 */
function validateAssets(assets, errors) {
  if (!Array.isArray(assets)) {
    errors.push('assets must be an array')
    return
  }
  assets.forEach((asset, index) => validateAsset(asset, index, errors))
}
```

Call `validateAssets` from `validatePackManifest`, just before the return:

```js
validateAssets(source.assets, errors)
return { valid: errors.length === 0, errors }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: PASS (Task B1 and B2 tests green).

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/pack/manifest-validation.test.mjs
git commit -m "test: pin pack-manifest asset identity, license, and kind validation"
```

```bash
git add scripts/pack/manifest-validation.mjs
git commit -m "feat(pack): validate pack-manifest asset identity, license, and kind"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task B3: enforce asset dimension sanity

**Files:**

- Modify: `scripts/pack/manifest-validation.mjs`
- Test: `scripts/pack/manifest-validation.test.mjs`

- [ ] **Step 1: Write the failing test**

Add to `scripts/pack/manifest-validation.test.mjs`:

```js
describe('validatePackManifest dimensions', () => {
  it('requires a dimensions object on each asset', () => {
    const asset = { ...validAsset() }
    delete asset.dimensions
    const result = validatePackManifest({ ...validManifest(), assets: [asset] })

    expect(result.errors.some((message) => message.includes('dimensions'))).toBe(true)
  })

  it('rejects non-positive, non-finite, and absurdly large dimensions', () => {
    const cases = [
      { width: 0, depth: 10, height: 10 },
      { width: 10, depth: -5, height: 10 },
      { width: 10, depth: 10, height: Number.POSITIVE_INFINITY },
      { width: 10, depth: 10, height: 1_000_000 },
    ]

    for (const dimensions of cases) {
      const result = validatePackManifest({
        ...validManifest(),
        assets: [{ ...validAsset(), dimensions }],
      })
      expect(result.valid).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: FAIL (oversized and zero dimensions currently pass).

- [ ] **Step 3: Write the minimal implementation; the module is now complete**

The complete `scripts/pack/manifest-validation.mjs` after this task:

```js
// scripts/pack/manifest-validation.mjs
//
// Pure validation for the vernacular-pack manifest format (design specification
// sections 4.3 and 4.5). No filesystem or process access: it takes a parsed
// manifest object and returns a result. When the in-app pack loader lands (phase 3)
// this schema graduates to core/ as shared TypeScript.

/** @typedef {{ valid: boolean, errors: string[] }} PackValidationResult */
/**
 * @typedef {'furniture'|'architectural-element'|'trim-profile'|'stair-component'|'material'|'texture'|'underlay-image'|'palette'|'preview-only'} AssetKind
 */

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/

// A generous 100 m ceiling (in millimeters) that still catches unit mistakes such
// as meters entered as millimeters.
const MAX_DIMENSION_MM = 100_000
const DIMENSION_AXES = ['width', 'depth', 'height']

/** The asset kinds a pack may declare (design specification section 4.5). */
export const ASSET_KINDS = Object.freeze([
  'furniture',
  'architectural-element',
  'trim-profile',
  'stair-component',
  'material',
  'texture',
  'underlay-image',
  'palette',
  'preview-only',
])

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string[]} errors
 * @param {string} [label]
 * @returns {boolean} whether the field was a non-empty string
 */
function validateRequiredString(source, key, errors, label = key) {
  const value = source[key]
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} is required`)
    return false
  }
  return true
}

/**
 * @param {unknown} dimensions
 * @param {string} label
 * @param {string[]} errors
 */
function validateDimensions(dimensions, label, errors) {
  if (typeof dimensions !== 'object' || dimensions === null) {
    errors.push(`${label}.dimensions are required`)
    return
  }
  const source = /** @type {Record<string, unknown>} */ (dimensions)
  for (const axis of DIMENSION_AXES) {
    const value = source[axis]
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > MAX_DIMENSION_MM
    ) {
      errors.push(
        `${label}.dimensions.${axis} must be a positive number of millimeters up to ${MAX_DIMENSION_MM}`,
      )
    }
  }
}

/**
 * @param {unknown} asset
 * @param {number} index
 * @param {string[]} errors
 */
function validateAsset(asset, index, errors) {
  const label = `assets[${index}]`
  if (typeof asset !== 'object' || asset === null) {
    errors.push(`${label} must be an object`)
    return
  }
  const source = /** @type {Record<string, unknown>} */ (asset)
  if (
    validateRequiredString(source, 'contentHash', errors, `${label}.contentHash`) &&
    !SHA256_PATTERN.test(String(source.contentHash))
  ) {
    errors.push(`${label}.contentHash must be a sha256 hex digest`)
  }
  validateRequiredString(source, 'name', errors, `${label}.name`)
  validateRequiredString(source, 'license', errors, `${label}.license`)
  if (!ASSET_KINDS.includes(source.kind)) {
    errors.push(`${label}.kind must be one of: ${ASSET_KINDS.join(', ')}`)
  }
  validateDimensions(source.dimensions, label, errors)
}

/**
 * @param {unknown} assets
 * @param {string[]} errors
 */
function validateAssets(assets, errors) {
  if (!Array.isArray(assets)) {
    errors.push('assets must be an array')
    return
  }
  assets.forEach((asset, index) => validateAsset(asset, index, errors))
}

/**
 * Validate a parsed pack manifest.
 * @param {unknown} manifest
 * @returns {PackValidationResult}
 */
export function validatePackManifest(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest must be a JSON object'] }
  }
  const errors = []
  const source = /** @type {Record<string, unknown>} */ (manifest)
  validateRequiredString(source, 'packId', errors)
  validateRequiredString(source, 'license', errors)
  validateRequiredString(source, 'attribution', errors)
  if (
    validateRequiredString(source, 'version', errors) &&
    !SEMVER_PATTERN.test(String(source.version))
  ) {
    errors.push('version must be valid SemVer (for example 1.0.0)')
  }
  validateAssets(source.assets, errors)
  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/pack/manifest-validation.test.mjs`
Expected: PASS (all manifest-validation tests green).

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/pack/manifest-validation.test.mjs
git commit -m "test: pin pack-manifest asset dimension sanity checks"
```

```bash
git add scripts/pack/manifest-validation.mjs
git commit -m "feat(pack): enforce pack-manifest asset dimension sanity"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task B4: run the CLI against a pack directory and return success

**Files:**

- Create: `scripts/pack/vernacular-pack.mjs`
- Test: `scripts/pack/vernacular-pack.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/pack/vernacular-pack.test.mjs`:

```js
import { describe, expect, it, vi } from 'vitest'
import { runPackCli } from './vernacular-pack.mjs'

function validManifest() {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    assets: [],
  }
}

function deps(manifest) {
  return {
    readManifest: vi.fn(() => Promise.resolve(manifest)),
    log: vi.fn(),
    error: vi.fn(),
  }
}

describe('runPackCli success', () => {
  it('validates a pack directory and returns exit code 0', async () => {
    const cliDeps = deps(validManifest())

    const code = await runPackCli(['validate', 'packs/example'], cliDeps)

    expect(code).toBe(0)
    expect(cliDeps.readManifest).toHaveBeenCalledWith('packs/example')
    expect(cliDeps.log).toHaveBeenCalledWith(expect.stringContaining('valid'))
    expect(cliDeps.error).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/pack/vernacular-pack.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/pack/vernacular-pack.mjs`:

```js
#!/usr/bin/env node
// scripts/pack/vernacular-pack.mjs
//
// vernacular-pack CLI scaffold (design specification section 4.3; phase 0 deliverable).
// Subcommands: `validate <packDir>` and `build <packDir>`. For this scaffold, `build`
// performs the same validation and reports a summary; content-hash verification,
// thumbnail baking, and publishing are deferred to phase 3.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePackManifest } from './manifest-validation.mjs'

const EXIT_OK = 0
const EXIT_INVALID = 1
const EXIT_USAGE = 2
const USAGE = 'Usage: vernacular-pack <validate|build> <packDir>'

/**
 * @typedef {object} PackCliDeps
 * @property {(packDir: string) => Promise<unknown>} readManifest
 * @property {(message: string) => void} log
 * @property {(message: string) => void} error
 */

/**
 * @param {readonly string[]} argv arguments after the node binary and script path
 * @param {PackCliDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runPackCli(argv, deps) {
  const [command, packDir] = argv
  if ((command !== 'validate' && command !== 'build') || !packDir) {
    deps.error(USAGE)
    return EXIT_USAGE
  }
  let manifest
  try {
    manifest = await deps.readManifest(packDir)
  } catch (cause) {
    deps.error(`Could not read manifest in ${packDir}: ${String(cause)}`)
    return EXIT_INVALID
  }
  const result = validatePackManifest(manifest)
  if (!result.valid) {
    deps.error(`Invalid pack manifest in ${packDir}:`)
    for (const message of result.errors) {
      deps.error(`  - ${message}`)
    }
    return EXIT_INVALID
  }
  deps.log(`${command}: ${packDir} manifest is valid`)
  return EXIT_OK
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/pack/vernacular-pack.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/pack/vernacular-pack.test.mjs
git commit -m "test: pin the pack CLI success path"
```

```bash
git add scripts/pack/vernacular-pack.mjs
git commit -m "feat(pack): add the vernacular-pack CLI validate and build commands"
```

- [ ] **Step 6: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task B5: report invalid manifests, read failures, and bad usage

**Files:**

- Modify: `scripts/pack/vernacular-pack.mjs` (only if a behavior is missing; the Task B4 implementation already covers these paths)
- Test: `scripts/pack/vernacular-pack.test.mjs`

- [ ] **Step 1: Write the failing test**

Add to `scripts/pack/vernacular-pack.test.mjs`:

```js
describe('runPackCli failures', () => {
  it('returns exit code 1 and reports each error for an invalid manifest', async () => {
    const cliDeps = deps({ assets: [] })

    const code = await runPackCli(['build', 'packs/broken'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Invalid pack manifest'))
  })

  it('returns exit code 1 when the manifest cannot be read', async () => {
    const cliDeps = {
      readManifest: vi.fn(() => Promise.reject(new Error('ENOENT'))),
      log: vi.fn(),
      error: vi.fn(),
    }

    const code = await runPackCli(['validate', 'packs/missing'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Could not read manifest'))
  })

  it('prints usage and returns exit code 2 for an unknown or incomplete command', async () => {
    const cliDeps = deps(validManifest())

    expect(await runPackCli(['publish', 'packs/example'], cliDeps)).toBe(2)
    expect(await runPackCli(['validate'], cliDeps)).toBe(2)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails or passes**

Run: `pnpm exec vitest run scripts/pack/vernacular-pack.test.mjs`
Expected: PASS, because the Task B4 implementation already handles these paths. This task exists to pin the error and usage contract explicitly. If any assertion fails, the test is driving a genuinely missing branch: add the minimal handling to `runPackCli` to satisfy it, then re-run.

- [ ] **Step 3: Commit**

```bash
git add scripts/pack/vernacular-pack.test.mjs
git commit -m "test: pin the pack CLI error, read-failure, and usage paths"
```

- [ ] **Step 4: BLUE**

Run `/clean-code-review` then `/refactor`.

---

### Task B6: wire the CLI to npm scripts and an example pack fixture (infrastructure)

**Files:**

- Modify: `scripts/pack/vernacular-pack.mjs` (append the direct-invocation shim)
- Create: `tests/fixtures/packs/example-pack/manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Append the direct-invocation shim to the CLI**

Add to the end of `scripts/pack/vernacular-pack.mjs`:

```js
/** Read <packDir>/manifest.json from disk. */
async function readManifestFromDisk(packDir) {
  const raw = await readFile(join(packDir, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Run only when invoked directly (node scripts/pack/vernacular-pack.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runPackCli(process.argv.slice(2), {
    readManifest: readManifestFromDisk,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((cause) => {
      console.error(cause)
      process.exitCode = EXIT_USAGE
    })
}
```

- [ ] **Step 2: Create the example pack fixture**

Create `tests/fixtures/packs/example-pack/manifest.json`:

```json
{
  "packId": "vernacular-starter",
  "version": "1.0.0",
  "license": "CC0-1.0",
  "attribution": "Vernacular project",
  "eras": ["mid-century"],
  "categories": ["seating"],
  "assets": [
    {
      "contentHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "name": "Example chair",
      "kind": "furniture",
      "license": "CC0-1.0",
      "attribution": "Vernacular project",
      "eras": ["mid-century"],
      "categories": ["seating"],
      "dimensions": { "width": 500, "depth": 520, "height": 800 }
    }
  ]
}
```

- [ ] **Step 3: Add the npm scripts**

In `package.json`, add to `scripts` (after the `knowledge:index` entry):

```json
    "pack:build": "node scripts/pack/vernacular-pack.mjs build",
    "pack:validate": "node scripts/pack/vernacular-pack.mjs validate",
```

- [ ] **Step 4: Verify the CLI runs end to end**

Run: `pnpm pack:build tests/fixtures/packs/example-pack`
Expected: prints `build: tests/fixtures/packs/example-pack manifest is valid`, exit code 0.

Run: `node scripts/pack/vernacular-pack.mjs validate tests/fixtures/packs/example-pack; echo "exit $?"`
Expected: prints the valid message and `exit 0`.

Run: `node scripts/pack/vernacular-pack.mjs; echo "exit $?"`
Expected: prints the usage line and `exit 2`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pack/vernacular-pack.mjs tests/fixtures/packs/example-pack/manifest.json package.json
git commit -m "feat(pack): wire pack:build and pack:validate scripts to an example pack"
```

---

### Task B7: add the pack-validator subagent (infrastructure)

CLAUDE.md states the `pack-validator` agent "lands alongside the pack tooling." This delivers it.

**Files:**

- Create: `.claude/agents/pack-validator.md`

- [ ] **Step 1: Create the agent definition**

Create `.claude/agents/pack-validator.md`:

```markdown
---
name: pack-validator
description: Validates a vernacular-pack source directory against the pack-manifest contract and reports license, dimension, and integrity issues. Runs when a pack is authored or updated.
tools: Read, Glob, Grep, Bash
color: green
---

You are the pack-validator agent for the Vernacular project. Your job is to check
that a pack source directory is well formed before it is built or published.

## What you may read

- The pack source directory under review (its `manifest.json`, `assets/`,
  `thumbnails/`, `CHANGELOG.md`, `LICENSE`, `NOTICE`).
- `docs/specs/2026-06-01-vernacular-design.md` sections 4.3 through 4.10 (pack format,
  asset kinds, license and provenance, caching).
- `scripts/pack/` (the CLI and the manifest validator).

## What you MUST NOT do

- Modify pack contents or any repository file. You report; you do not fix.
- Approve a pack whose manifest claims do not match the files on disk.

## Workflow

1. Run `pnpm pack:validate <packDir>` and capture the result.
2. Independently confirm: every asset `kind` is one of the specification's kinds;
   `license` and `attribution` are present at the pack level and on every asset;
   dimensions are positive and physically plausible; the `version` is SemVer; the
   directory name matches `<packId>-<version>`.
3. Note any asset file referenced by the manifest that is missing from `assets/`,
   and any thumbnail missing from `thumbnails/`.

## Reporting

Report:

- Status: PASS | FAIL | NEEDS_CONTEXT
- The `pnpm pack:validate` exit code and output
- A list of must-fix issues (contract violations) and should-fix issues (provenance
  gaps, missing thumbnails)
- The pack directory and manifest path reviewed
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/pack-validator.md
git commit -m "chore(agents): add the pack-validator subagent alongside the pack tooling"
```

---

## Section C: wrap-up (infrastructure)

### Task C1: mark the milestone done and run the full check chain

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the roadmap status**

In `ROADMAP.md`, change the Foundation work row:

```
| Service worker and pack CLI                                                       | done    |
```

- [ ] **Step 2: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green.

Run: `pnpm build && pnpm exec playwright test`
Expected: all e2e specs pass (service-worker activation runs on Chromium and is skipped elsewhere).

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark service worker and pack CLI done on the roadmap"
```

### Task C2: PR-level review and knowledge curation

- [ ] **Step 1: Open the pull request and run `/review`**

Push `feat/service-worker-and-pack-cli` and open a PR. Run `/review` (the pr-reviewer) to confirm the red-green-blue history, that CI is green, and that the Clean Code rubric was applied.

- [ ] **Step 2: Curate the knowledge graph**

This milestone introduces two architectural seams (a service-worker lifecycle and registration boundary, and the location of pack-manifest validation). Run the knowledge-curator. Expect at least one new local ADR, for example:

- "Service worker scaffold and deferred caching strategy" (why the worker ships with no fetch handler and a hand-bumped cache version, citing specification section 11).
- "Pack-manifest validation lives in scripts until the in-app loader lands" (why the scaffold validator is plain ESM rather than `core/` TypeScript, and the planned graduation in phase 3).

Regenerate the index with `pnpm knowledge:index` if entries change.

---

## Self-Review

**1. Spec coverage.**

- "Service worker scaffold (no real caching yet)" (section 10, line 1001): Tasks A1 to A5. The worker registers, activates, takes control, and purges stale caches, with no precache and no fetch handler. Met.
- Section 5.9 "versioned with the app; updates on each release; old caches purged": the versioned cache name plus `purgeStaleShellCaches` on activate. The release-coupled versioning approach is explicitly deferred per section 11. Met for a scaffold.
- Section 5.9 "does not cache project data or custom assets": the worker has no fetch handler, so it caches nothing. Met.
- Section 4.10 "caches app shell + bundled registries + starter pack manifest/thumbnails": the precache list is intentionally empty here; populating it is the deferred caching strategy (section 11). Documented in the scope boundary. Met as a scaffold.
- "`vernacular-pack` CLI scaffold" (section 10, line 997) and "`pnpm pack:build` script" (line 1015): Tasks B1 to B6. Met.
- "license + dimension sanity checks" (section 10, line 1099, named for the full CLI but appropriate to validate from the scaffold): `validatePackManifest` checks pack and asset license presence and dimension ranges. Met.
- Pack manifest fields (section 4.3) and asset `kind` enumeration (section 4.5): encoded in the validator and the example fixture. Met.
- pack-validator agent (section 10, line 1008; CLAUDE.md "alongside the pack tooling"): Task B7. Met.

**2. Placeholder scan.** No "TBD", no "add error handling" without code, no "similar to Task N". Every code step shows complete code. The only conditional step is B5 Step 2, which is conditional by design (the behavior may already pass) and gives an explicit instruction for either outcome.

**3. Type and name consistency.** Cross-checked across tasks: `shellCacheName`, `staleShellCacheNames`, `SHELL_CACHE_PREFIX`, `SHELL_CACHE_VERSION`, `CacheStorageLike`, `purgeStaleShellCaches` (A1, A2, used in A4); `registerServiceWorker`, `ServiceWorkerContainerLike`, `RegisterServiceWorkerOptions`, `ServiceWorkerRegistrationOutcome` (A3, barrel A4, main.tsx A4); `validatePackManifest`, `ASSET_KINDS`, `PackValidationResult` (B1 to B3); `runPackCli`, `PackCliDeps`, `EXIT_OK`/`EXIT_INVALID`/`EXIT_USAGE`, `readManifest` (B4 to B6). The example fixture's fields match the validator's required fields and its `contentHash` matches `SHA256_PATTERN`.

**4. Layering and invariants.** `core/` untouched (no React or Three). Worker logic in `storage/` (browser-runtime layer). The worker entry imports the deep `storage/` module path so the bundle stays self-contained, verified in A4 Step 6. Asset references stay content-addressed (the manifest is keyed by `contentHash`). No em-dashes, no third-party product names, Conventional Commit subjects, no `Co-Authored-By` trailers.
