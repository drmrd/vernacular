# Storage Capability Detection Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md rules 14-15), not a single-implementer flow. Each behavior task runs RED (test-author writes a failing test), GREEN (implementer writes the minimal pass), then BLUE (clean-code-reviewer audits, refactorer applies fixes, a `refactor:` marker commit closes the phase when there is nothing to change). Tasks marked `(infrastructure)` are controller-authored glue (barrel exports, the boot wiring, the end-to-end spec, the roadmap edit); they carry no RGB triple and are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect which browser storage primitives (OPFS, IndexedDB, File System Access) are available at runtime, expose the result as a plain, well-tested API in `storage/`, and warn once at boot when the environment cannot persist projects durably.

**Architecture:** A single pure module, `storage/storage-capabilities.ts`, performs dependency-injected feature detection over a `StorageProbeHost` (defaulting to `globalThis`), returning a serializable `StorageCapabilities` record. Two pure helpers derive from that record: `isStorageDegraded` (no durable backend at all) and `summarizeStorageCapabilities` (a one-line human summary). The app composition root probes once on mount and `console.warn`s the summary only when storage is degraded. No durable stores, no service worker, no UI surface are built here; those remain Phase 1 (stores) and the Service-Worker-plus-pack-CLI milestone.

**Tech Stack:** TypeScript (strict), Vitest with injected fake hosts for deterministic unit coverage of both the available and unavailable branches, React 19 for the boot effect, Playwright for cross-browser accessibility verification.

**Scope boundary (design specification, section 10, Phase 0 deliverable "OPFS and IndexedDB verified accessible across target browsers"; section 5.2 storage primitives; section 5.10 "detect and warn"):** In scope: feature detection for OPFS, IndexedDB, and File System Access; `navigator.storage` persisted status and quota estimate, read-only (never calling `persist()`, which is a Phase 1 first-save concern); a degraded-environment warning at boot; cross-browser accessibility verification. Out of scope and deliberately deferred: `OPFSProjectStore`, `FileSystemFolderProjectStore`, `ZipBundleProjectStore` (Phase 1); the service worker scaffold (the next foundation milestone); any user-facing banner, recovery flow, or quota-warning UI (Phase 1); a private-browsing heuristic (unreliable; consumers infer "likely ephemeral" from not-persisted plus small quota later).

---

## File structure

New and modified files, grouped by responsibility:

```
storage/
  storage-capabilities.ts        (create)  StorageProbeHost, StorageCapabilities,
                                           probeStorageCapabilities, isStorageDegraded,
                                           summarizeStorageCapabilities
  storage-capabilities.test.ts   (create)  unit tests: probe mapping, resilience,
                                           degraded predicate, summary rendering
  index.ts                       (modify, infra)  barrel exports

app/
  app.tsx                        (modify)  boot-time probe; warn when degraded
  app.test.tsx                   (modify)  capable-navigator happy path;
                                           degraded-boot warn behavior

e2e/tests/
  storage-capabilities.spec.ts   (create, infra)  OPFS + IndexedDB accessible
                                           across target browsers

ROADMAP.md                       (modify, infra)  mark storage capability detection done
```

The probe touches only the injected host, so it is the single seam that reads browser
storage globals, honoring the invariant that browser storage APIs live in `storage/`
(ADR-0003). Both branches (available and unavailable) are exercised by passing fake hosts,
so unlike `IndexedDbProjectStore` this module is fully unit-tested rather than e2e-only.

---

## Section A: the capability probe

### Task 1: probe maps host feature-detection to a capabilities record

**Files:**

- Create: `storage/storage-capabilities.ts`
- Test: `storage/storage-capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `storage/storage-capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { probeStorageCapabilities, type StorageProbeHost } from './storage-capabilities'

function capableHost(): StorageProbeHost {
  return {
    navigator: {
      storage: {
        getDirectory: () => Promise.resolve({}),
        persist: () => Promise.resolve(true),
        persisted: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ quota: 5_000_000 }),
      },
    },
    indexedDB: {},
    showDirectoryPicker: () => Promise.resolve({}),
  }
}

describe('probeStorageCapabilities', () => {
  it('reports every primitive present on a fully capable host', async () => {
    const capabilities = await probeStorageCapabilities(capableHost())

    expect(capabilities).toEqual({
      opfs: true,
      indexedDb: true,
      fileSystemAccess: true,
      persisted: true,
      estimatedQuotaBytes: 5_000_000,
    })
  })

  it('reports every primitive absent on an empty host', async () => {
    const capabilities = await probeStorageCapabilities({})

    expect(capabilities).toEqual({
      opfs: false,
      indexedDb: false,
      fileSystemAccess: false,
      persisted: false,
      estimatedQuotaBytes: null,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: FAIL (`storage-capabilities` module does not exist; `probeStorageCapabilities` is not exported).

- [ ] **Step 3: Commit the failing test (RED)**

```bash
git add storage/storage-capabilities.test.ts
git commit -m "test: pin the storage capability probe detection"
```

- [ ] **Step 4: Write the minimal implementation**

Create `storage/storage-capabilities.ts`:

```ts
/** The subset of a StorageManager the probe reads. */
interface StorageManagerLike {
  getDirectory?: unknown
  persist?: unknown
  persisted?: () => Promise<boolean>
  estimate?: () => Promise<{ quota?: number }>
}

/**
 * The host object the probe feature-detects against. Defaults to `globalThis`;
 * tests inject fakes so both the available and unavailable branches are covered
 * without mutating real globals.
 */
export interface StorageProbeHost {
  navigator?: { storage?: StorageManagerLike }
  indexedDB?: unknown
  showDirectoryPicker?: unknown
}

/** A plain, serializable snapshot of what this environment can persist. */
export interface StorageCapabilities {
  /** OPFS reachable via navigator.storage.getDirectory(). */
  opfs: boolean
  /** IndexedDB present in this environment. */
  indexedDb: boolean
  /** File System Access directory picker available (Chromium-family only today). */
  fileSystemAccess: boolean
  /** navigator.storage.persisted() resolved true; false when unsupported or not yet granted. */
  persisted: boolean
  /** navigator.storage.estimate().quota in bytes; null when unavailable. */
  estimatedQuotaBytes: number | null
}

export async function probeStorageCapabilities(
  host: StorageProbeHost = globalThis,
): Promise<StorageCapabilities> {
  const storage = host.navigator?.storage
  return {
    opfs: typeof storage?.getDirectory === 'function',
    indexedDb: host.indexedDB !== undefined,
    fileSystemAccess: typeof host.showDirectoryPicker === 'function',
    persisted: await resolvePersisted(storage),
    estimatedQuotaBytes: await resolveQuota(storage),
  }
}

async function resolvePersisted(storage: StorageManagerLike | undefined): Promise<boolean> {
  if (typeof storage?.persisted !== 'function') {
    return false
  }
  return storage.persisted()
}

async function resolveQuota(storage: StorageManagerLike | undefined): Promise<number | null> {
  if (typeof storage?.estimate !== 'function') {
    return null
  }
  const estimate = await storage.estimate()
  return estimate.quota ?? null
}
```

Note: if `tsc` rejects `host: StorageProbeHost = globalThis` (structural mismatch on a
particular lib target), narrow the default to `globalThis as StorageProbeHost` with a short
comment. Resilience to a rejecting `persisted()`/`estimate()` is added in Task 2, not here.

- [ ] **Step 5: Run the test, typecheck, and lint to verify GREEN**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: PASS (both cases).
Run: `pnpm typecheck && pnpm lint`
Expected: no errors, no warnings.

- [ ] **Step 6: Commit the implementation (GREEN)**

```bash
git add storage/storage-capabilities.ts
git commit -m "feat(storage): probe OPFS, IndexedDB, and File System Access availability"
```

- [ ] **Step 7: BLUE**

Run `/clean-code-review` then `/refactor`. Keep all tests green. If there is nothing
actionable, land the marker commit:

```bash
git commit --allow-empty -m "refactor(storage): close BLUE for the capability probe (no changes)"
```

---

### Task 2: the probe survives a rejecting persisted()/estimate() without throwing

**Files:**

- Modify: `storage/storage-capabilities.ts`
- Test: `storage/storage-capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `storage/storage-capabilities.test.ts` inside the `describe('probeStorageCapabilities', ...)` block:

```ts
it('falls back to safe defaults when persisted() and estimate() reject', async () => {
  const host: StorageProbeHost = {
    navigator: {
      storage: {
        getDirectory: () => Promise.resolve({}),
        persisted: () => Promise.reject(new Error('blocked')),
        estimate: () => Promise.reject(new Error('blocked')),
      },
    },
    indexedDB: {},
  }

  const capabilities = await probeStorageCapabilities(host)

  expect(capabilities.opfs).toBe(true)
  expect(capabilities.indexedDb).toBe(true)
  expect(capabilities.persisted).toBe(false)
  expect(capabilities.estimatedQuotaBytes).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: FAIL (the rejected promises propagate; the call rejects instead of resolving to defaults).

- [ ] **Step 3: Commit the failing test (RED)**

```bash
git add storage/storage-capabilities.test.ts
git commit -m "test: pin storage probe resilience to rejected persisted and estimate"
```

- [ ] **Step 4: Write the minimal implementation**

Wrap the two async reads in `storage/storage-capabilities.ts` so a rejection becomes the safe default. Replace `resolvePersisted` and `resolveQuota` with:

```ts
async function resolvePersisted(storage: StorageManagerLike | undefined): Promise<boolean> {
  if (typeof storage?.persisted !== 'function') {
    return false
  }
  try {
    return await storage.persisted()
  } catch {
    return false
  }
}

async function resolveQuota(storage: StorageManagerLike | undefined): Promise<number | null> {
  if (typeof storage?.estimate !== 'function') {
    return null
  }
  try {
    const estimate = await storage.estimate()
    return estimate.quota ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the test, typecheck, and lint to verify GREEN**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: PASS (all three cases).
Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit the implementation (GREEN)**

```bash
git add storage/storage-capabilities.ts
git commit -m "feat(storage): keep the capability probe from throwing at boot"
```

- [ ] **Step 7: BLUE**

Run `/clean-code-review` then `/refactor`. Marker commit if nothing actionable:

```bash
git commit --allow-empty -m "refactor(storage): close BLUE for probe resilience (no changes)"
```

---

### Task 3: isStorageDegraded reports the absence of any durable backend

**Files:**

- Modify: `storage/storage-capabilities.ts`
- Test: `storage/storage-capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `storage/storage-capabilities.test.ts`. Add the import and a new describe block:

```ts
import {
  isStorageDegraded,
  probeStorageCapabilities,
  type StorageCapabilities,
  type StorageProbeHost,
} from './storage-capabilities'

function capabilities(overrides: Partial<StorageCapabilities> = {}): StorageCapabilities {
  return {
    opfs: false,
    indexedDb: false,
    fileSystemAccess: false,
    persisted: false,
    estimatedQuotaBytes: null,
    ...overrides,
  }
}

describe('isStorageDegraded', () => {
  it('is true when neither OPFS nor IndexedDB is available', () => {
    expect(isStorageDegraded(capabilities())).toBe(true)
  })

  it('is false when OPFS is available', () => {
    expect(isStorageDegraded(capabilities({ opfs: true }))).toBe(false)
  })

  it('is false when IndexedDB is available', () => {
    expect(isStorageDegraded(capabilities({ indexedDb: true }))).toBe(false)
  })
})
```

Note: this replaces the bare `import { probeStorageCapabilities, type StorageProbeHost }`
line at the top of the file with the grouped import above. Keep the single import statement.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: FAIL (`isStorageDegraded` is not exported).

- [ ] **Step 3: Commit the failing test (RED)**

```bash
git add storage/storage-capabilities.test.ts
git commit -m "test: pin the storage-degraded predicate"
```

- [ ] **Step 4: Write the minimal implementation**

Append to `storage/storage-capabilities.ts`:

```ts
/** A degraded environment cannot persist a project durably: no OPFS and no IndexedDB. */
export function isStorageDegraded(capabilities: StorageCapabilities): boolean {
  return !capabilities.opfs && !capabilities.indexedDb
}
```

- [ ] **Step 5: Run the test, typecheck, and lint to verify GREEN**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: PASS.
Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit the implementation (GREEN)**

```bash
git add storage/storage-capabilities.ts
git commit -m "feat(storage): derive a degraded-environment predicate from capabilities"
```

- [ ] **Step 7: BLUE**

Run `/clean-code-review` then `/refactor`. Marker commit if nothing actionable:

```bash
git commit --allow-empty -m "refactor(storage): close BLUE for the degraded predicate (no changes)"
```

---

### Task 4: summarizeStorageCapabilities renders a one-line summary

**Files:**

- Modify: `storage/storage-capabilities.ts`
- Test: `storage/storage-capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Add `summarizeStorageCapabilities` to the grouped import at the top of
`storage/storage-capabilities.test.ts`, then append:

```ts
describe('summarizeStorageCapabilities', () => {
  it('renders each capability and the quota on one line', () => {
    const summary = summarizeStorageCapabilities(
      capabilities({ opfs: true, indexedDb: true, estimatedQuotaBytes: 5_000_000 }),
    )

    expect(summary).toBe(
      'Storage capabilities: OPFS yes, IndexedDB yes, File System Access no, ' +
        'persisted no, quota 5000000 bytes',
    )
  })

  it('renders an unknown quota when the estimate is null', () => {
    const summary = summarizeStorageCapabilities(capabilities())

    expect(summary).toContain('quota unknown')
    expect(summary).toContain('IndexedDB no')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: FAIL (`summarizeStorageCapabilities` is not exported).

- [ ] **Step 3: Commit the failing test (RED)**

```bash
git add storage/storage-capabilities.test.ts
git commit -m "test: pin the storage capability summary line"
```

- [ ] **Step 4: Write the minimal implementation**

Append to `storage/storage-capabilities.ts`:

```ts
/** A one-line, ASCII summary for boot-time logging and diagnostics. */
export function summarizeStorageCapabilities(capabilities: StorageCapabilities): string {
  const quota =
    capabilities.estimatedQuotaBytes === null
      ? 'unknown'
      : `${capabilities.estimatedQuotaBytes} bytes`
  const parts = [
    `OPFS ${yesNo(capabilities.opfs)}`,
    `IndexedDB ${yesNo(capabilities.indexedDb)}`,
    `File System Access ${yesNo(capabilities.fileSystemAccess)}`,
    `persisted ${yesNo(capabilities.persisted)}`,
    `quota ${quota}`,
  ]
  return `Storage capabilities: ${parts.join(', ')}`
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}
```

- [ ] **Step 5: Run the test, typecheck, and lint to verify GREEN**

Run: `pnpm exec vitest run storage/storage-capabilities.test.ts`
Expected: PASS (all summary cases).
Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit the implementation (GREEN)**

```bash
git add storage/storage-capabilities.ts
git commit -m "feat(storage): render a one-line storage capability summary"
```

- [ ] **Step 7: BLUE**

Run `/clean-code-review` then `/refactor`. Marker commit if nothing actionable:

```bash
git commit --allow-empty -m "refactor(storage): close BLUE for the capability summary (no changes)"
```

---

## Section B: integration

### Task 5 (infrastructure): export the capability API from the storage barrel

**Files:**

- Modify: `storage/index.ts`

- [ ] **Step 1: Add the exports**

Append to `storage/index.ts`:

```ts
export {
  probeStorageCapabilities,
  isStorageDegraded,
  summarizeStorageCapabilities,
} from './storage-capabilities'
export type { StorageCapabilities, StorageProbeHost } from './storage-capabilities'
```

- [ ] **Step 2: Verify the barrel typechecks and lints**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (no unused or duplicate exports).

- [ ] **Step 3: Commit**

```bash
git add storage/index.ts
git commit -m "feat(storage): export the storage capability API from the barrel"
```

---

### Task 6: the app warns once when booting into a degraded environment

**Files:**

- Modify: `app/app.tsx`
- Test: `app/app.test.tsx`

- [ ] **Step 1: Write the failing test**

Edit `app/app.test.tsx`. First update the two existing tests so their happy path stubs a
capable navigator (no degraded warning fires), then add the degraded-boot test. The full
updated file:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { App } from './app'
import { InMemoryProjectStore } from '../storage'

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('boots from the store and renders the editor shell with a ground floor', async () => {
    stubCapableStorage()

    render(<App store={new InMemoryProjectStore()} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
  })

  it('shows a recoverable error when the project fails to load', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'load').mockRejectedValue(new Error('disk fault'))

    render(<App store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
  })

  it('warns once when booting into a storage-degraded environment', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage capabilities')),
    )
  })

  it('stays silent when storage is healthy', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    expect(warn).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: FAIL (the app does not probe storage yet, so the degraded boot never warns).

- [ ] **Step 3: Commit the failing test (RED)**

```bash
git add app/app.test.tsx
git commit -m "test: pin the degraded-storage boot warning"
```

- [ ] **Step 4: Write the minimal implementation**

Edit `app/app.tsx`. Extend the storage import and add a boot effect inside the `App`
component (after the existing bootstrap effect):

```tsx
import {
  createDefaultProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type ProjectStore,
} from '../storage'
```

```tsx
useEffect(() => {
  void probeStorageCapabilities().then((capabilities) => {
    if (isStorageDegraded(capabilities)) {
      console.warn(summarizeStorageCapabilities(capabilities))
    }
  })
}, [])
```

The effect has an empty dependency array: capabilities are fixed for the page lifetime, so
the probe runs exactly once per mount. It never touches React state, so it cannot trigger an
act warning.

- [ ] **Step 5: Run the test, typecheck, and lint to verify GREEN**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: PASS (all four cases).
Run: `pnpm typecheck && pnpm lint`
Expected: clean. `console.warn` is permitted by the `no-console` allowlist; `console.info`
would not be.

- [ ] **Step 6: Commit the implementation (GREEN)**

```bash
git add app/app.tsx
git commit -m "feat(app): warn at boot when storage cannot persist durably"
```

- [ ] **Step 7: BLUE**

Run `/clean-code-review` then `/refactor`. Marker commit if nothing actionable:

```bash
git commit --allow-empty -m "refactor(app): close BLUE for the degraded-storage warning (no changes)"
```

---

### Task 7 (infrastructure): verify OPFS and IndexedDB are accessible across target browsers

**Files:**

- Create: `e2e/tests/storage-capabilities.spec.ts`

This is the Phase 0 acceptance "OPFS and IndexedDB verified accessible across target
browsers." It runs in every Playwright project (chromium, firefox, webkit). The unit tests
already cover the probe's logic against fake hosts; this verifies the real platform reality.

- [ ] **Step 1: Write the spec**

Create `e2e/tests/storage-capabilities.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Storage accessibility', () => {
  test('OPFS and IndexedDB are reachable in this browser', async ({ page }) => {
    await page.goto('/')

    const reachable = await page.evaluate(() => ({
      opfs: typeof navigator.storage?.getDirectory === 'function',
      indexedDb: typeof indexedDB !== 'undefined',
    }))

    expect(reachable.opfs).toBe(true)
    expect(reachable.indexedDb).toBe(true)
  })
})
```

File System Access is intentionally not asserted: it is Chromium-family only today, and the
spec's Phase 0 claim is specifically about OPFS and IndexedDB.

- [ ] **Step 2: Run the spec (chromium is enough locally)**

Run: `pnpm exec playwright test storage-capabilities --project=chromium`
Expected: PASS. CI runs all three projects; if a target browser legitimately lacks OPFS,
document it as a reduced-capability environment (design spec 5.10) rather than weakening the
unit-tested probe.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/storage-capabilities.spec.ts
git commit -m "test(e2e): verify OPFS and IndexedDB accessibility across target browsers"
```

---

### Task 8 (infrastructure): mark the milestone done on the roadmap

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the status row**

In `ROADMAP.md`, change the foundation-work row:

```
| Storage scaffolds (OPFS, IndexedDB, File System API)                              | done    |
```

(The row currently reads `pending`. Storage capability detection is the Phase 0 storage
deliverable; durable OPFS/filesystem/zip stores remain Phase 1 and are tracked under the MVP
path "Two-dimensional plan editor" deliverables.)

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark storage capability detection done on the roadmap"
```

---

## Section C: branch verification and review

### Task 9 (infrastructure): full check chain and PR review

- [ ] **Step 1: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. If `format:check` flags the new files, run `pnpm format` and amend the
relevant commit.

- [ ] **Step 2: PR-level review**

Run `/review` to dispatch the pr-reviewer. It verifies the red-green-blue cycle in the commit
history, the Clean Code rubric, and CI readiness.

- [ ] **Step 3: Knowledge curation (local, not committed)**

Refresh `docs/knowledge/decisions/ADR-0003-storage-provider-pattern.md` to record that
storage capability detection landed (the probe is the single seam that reads storage
globals; durable stores remain Phase 1), then run `pnpm knowledge:index`. The knowledge graph
is gitignored, so this is a local-context step with no commit.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/storage-capability-detection
gh pr create --fill
```

---

## Self-review notes

- **Spec coverage.** Phase 0 "OPFS and IndexedDB verified accessible across target browsers"
  is covered by Tasks 1-2 (probe) and Task 7 (e2e). "File System Access" detection is in the
  probe (Task 1). Section 5.10 "detect and warn" is covered by Tasks 3-4 and 6. Durable
  stores, service worker, and any UI are explicitly out of scope per the scope boundary.
- **No placeholders.** Every step contains the actual test or implementation code and an
  exact command with expected output.
- **Type consistency.** `StorageCapabilities`, `StorageProbeHost`, `probeStorageCapabilities`,
  `isStorageDegraded`, and `summarizeStorageCapabilities` use the same names and shapes across
  the probe module, the barrel (Task 5), and the app wiring (Task 6). The summary string in
  Task 4's test matches the format produced by the Task 4 implementation and asserted again in
  Task 6's degraded test via `stringContaining('Storage capabilities')`.

```

```
