# Asset Cache and Registry Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first slice of the assets and furniture track: an aggregating `AssetRegistry` that resolves a content-addressed `AssetReference` across multiple asset sources with the four-step precedence-and-fallback algorithm from the design specification, extending (not replacing) the minimal `AssetCache` that already shipped.

**Architecture:** The resolution _policy_ (source precedence ordering and the resolution-outcome data shape, including a clearly-labeled missing-asset placeholder carrying the correct footprint) is pure data and pure functions in `core/`, with no React, Three.js, or browser APIs. The aggregating _resolver_ that walks a set of byte-returning `AssetSource`s lives in `storage/`, the layer the design specification reserves for `ProjectStore`, `LibraryStore`, and `AssetCache`. The existing `AssetCache` interface and its `InMemoryAssetCache` and `DirectoryAssetCache` implementations are reused unchanged: a content-hash-keyed `AssetSource` adapter wraps a cache so the cache participates as one source among several.

**Tech Stack:** TypeScript, Vitest (Node environment, no jsdom needed), the existing `core/registries/` registry pattern, the existing `storage/` provider interfaces. No new dependencies.

---

## Background and constraints (read before starting)

This slice extends shipped infrastructure. Read these files first; do not re-create what they already provide.

- `core/model/asset-reference.ts`: defines `AssetScope` (the union `` `pack:${string}@${string}` `` | `'user'` | `'project'`), `AssetReference` (`{ scope, contentHash }`), and `formatAssetReference` / `parseAssetReference`. **Reuse as-is.** The bundled scope is not in the union today; this slice does not add it (see Decisions).
- `storage/asset-cache.ts`: the `AssetCache` interface (`has`, `get`, `put`, keyed by `contentHash`, bytes as `Uint8Array`). **Reuse as-is.** This is the minimal cache from ADR-0041 that this slice extends.
- `storage/in-memory-asset-cache.ts` and `storage/directory-asset-cache.ts`: the two concrete caches. **Reuse as-is** in tests.
- `core/registries/registry.ts`: `createRegistry`, `getEntry`, `mergeRegistries`. Not directly modified by this slice, but the resolution outcome's footprint shape mirrors the registry-entry style (plain data).
- `storage/library-store.ts`: the `LibraryStore` interface (`list()`, `resolve(reference)`). Not implemented here; the registry is the aggregating layer the design specification puts _above_ individual sources, and a future `UserFilesystemSource` will adapt a `LibraryStore`.
- The design specification, section 4.1 (asset sources), 4.2 (resolution precedence and fallback), and 4.5 (asset `kind` enumeration). The resolution algorithm in section 4.2 is the spine of this slice.
- ADR-0007 (content-addressed assets): "The `AssetRegistry` aggregates all sources and resolves a reference with graceful degradation: exact match first, then hash match in any other source, then pack-version fallback, then a clearly-labeled placeholder with the correct footprint so editing continues." This slice implements exactly that sentence.
- ADR-0044, the "Assets and furniture" track and start-now enabler #2: this slice is the foundation that the library browser, custom import, placement, era filtering, and the bundle export later hang off.

### Layering rule (non-negotiable, from `.claude/rules.md` invariant 1)

- `core/` imports neither React nor Three.js nor browser APIs. The resolution _policy_ lives here as pure functions over plain data.
- `storage/` may import from `core/` but nothing above it. The aggregating _resolver_ and the `AssetSource` adapters live here.
- Bytes cross the boundary as `Uint8Array` (the existing `AssetCache` currency), not `Blob`. The design specification's section 5.1 sketch uses `Blob`, but the shipped `AssetCache` and `LibraryStore` both use `Uint8Array`; this slice follows the shipped code, not the sketch (see Decisions).

### What this slice deliberately excludes (later slices in the track)

- The curated starter library, the library browser, custom import, and the placement tool (later assets-track slices).
- `PackSource` over a real CDN, `UserFilesystemSource` over OPFS, and `ProjectEmbeddedSource` over the project `assets/` directory: this slice ships an in-memory `AssetSource` plus a cache-backed `AssetSource`, and proves the resolution algorithm against them. The durable sources adapt the same interface in later slices.
- LRU eviction and quota handling (`evictIfNeeded` in the section 5.1 sketch). Not part of resolution; a later caching slice.
- Three.js loaders that turn resolved bytes into scene graphs: those are `engine/loaders/`, on the three-dimensional preview track, and converge later.

---

## File structure

New files (all new; no shared file is modified except the two barrels, called out explicitly):

- `core/assets/asset-resolution.ts`: pure resolution-outcome types and the pure source-precedence ordering. Responsibility: define what a resolution _result_ is (resolved bytes vs. labeled placeholder) and the deterministic order in which sources are consulted. No I/O.
- `core/assets/asset-resolution.test.ts`: unit tests for the pure ordering and placeholder construction.
- `storage/assets/asset-source.ts`: the `AssetSource` interface this slice consumes (a narrowed, byte-returning form of the design specification's section 4.1 source). Responsibility: the read seam every source implements.
- `storage/assets/in-memory-asset-source.ts`: a `Map`-backed `AssetSource` for tests and the not-yet-wired shell. Responsibility: a trivial source so the resolver can be exercised without a browser.
- `storage/assets/cache-asset-source.ts`: an `AssetSource` adapter over the existing `AssetCache`. Responsibility: let the shipped content-hash cache participate as a source.
- `storage/assets/asset-registry.ts`: the aggregating `AssetRegistry` resolver. Responsibility: walk the ordered sources, apply the four-step fallback, and return a resolution result. The only stateful coordinator in this slice.
- `storage/assets/in-memory-asset-source.test.ts`, `storage/assets/cache-asset-source.test.ts`, `storage/assets/asset-registry.test.ts`: the corresponding tests.

Modified files (additive barrel exports only; coordination risk flagged in the summary):

- `core/index.ts`: add exports for the new `core/assets/` symbols.
- `storage/index.ts`: add exports for the new `storage/assets/` symbols.

### Type contracts established up front (so later tasks stay consistent)

These names and shapes are fixed by Task 1 and reused verbatim by every later task. A worker reading tasks out of order must use exactly these.

```ts
// core/assets/asset-resolution.ts

/**
 * The footprint a placeholder occupies so editing continues with correct
 * dimensions when an asset cannot be resolved. Millimeters, matching the model
 * and the pack-manifest dimension convention (design specification section 4.3).
 */
export interface AssetFootprint {
  width: number
  depth: number
  height: number
}

/** A resolved asset: the bytes plus the scope they were actually found in. */
export interface ResolvedAsset {
  outcome: 'resolved'
  bytes: Uint8Array
  /** The scope the bytes were found in, which may differ from the requested one. */
  resolvedScope: AssetScope
}

/** A failure to resolve: a labeled placeholder carrying the requested footprint. */
export interface MissingAsset {
  outcome: 'missing'
  /** A short, user-facing label for the asset panel's recovery surface. */
  label: string
  /** The requested reference, so callers can offer a recovery path. */
  reference: AssetReference
  /** The footprint to draw the placeholder at; undefined when unknown. */
  footprint?: AssetFootprint
}

export type AssetResolution = ResolvedAsset | MissingAsset
```

```ts
// storage/assets/asset-source.ts

import type { AssetReference } from '../../core'

/**
 * A read seam over one place assets live (a pack, the user library, the project
 * folder, the content cache). The narrowed, byte-returning form of the design
 * specification section 4.1 source: this slice needs only identity and read.
 */
export interface AssetSource {
  /** Stable source identifier, for precedence and diagnostics. */
  readonly id: string
  /** Bytes for the exact content hash, or undefined when this source lacks it. */
  read(contentHash: string): Promise<Uint8Array | undefined>
}
```

---

## Task 1: Pure resolution-outcome types and source precedence

**Files:**

- Create: `core/assets/asset-resolution.ts`
- Test: `core/assets/asset-resolution.test.ts`
- Modify: `core/index.ts` (additive exports, after the existing asset-reference exports near line 39)

### THIS IS THE FIRST RED BEHAVIOR (the orchestrator will dispatch the test-author against this verbatim)

- [ ] **Step 1: Write the failing test**

Create `core/assets/asset-resolution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../model/asset-reference'
import {
  SCOPE_PRECEDENCE,
  orderScopesByPrecedence,
  resolvedAsset,
  missingAsset,
} from './asset-resolution'

describe('asset resolution policy', () => {
  it('orders scopes user before project before pack before bundled', () => {
    expect(SCOPE_PRECEDENCE).toEqual(['user', 'project', 'pack', 'bundled'])
  })

  it('orders a mixed scope-kind list by precedence, requested scope first', () => {
    const requested: AssetReference = { scope: 'project', contentHash: 'abc' }
    const ordered = orderScopesByPrecedence(requested, ['pack', 'user', 'project'])
    expect(ordered).toEqual(['project', 'user', 'pack'])
  })

  it('builds a resolved outcome carrying the bytes and the scope they came from', () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const resolution = resolvedAsset(bytes, 'user')
    expect(resolution).toEqual({ outcome: 'resolved', bytes, resolvedScope: 'user' })
  })

  it('builds a labeled missing outcome carrying the reference and footprint', () => {
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: 'def' }
    const footprint = { width: 600, depth: 400, height: 900 }
    const resolution = missingAsset(reference, footprint)
    expect(resolution).toEqual({
      outcome: 'missing',
      label: 'Missing asset (pack:victorian@1.2.0)',
      reference,
      footprint,
    })
  })

  it('builds a missing outcome with no footprint when none is known', () => {
    const reference: AssetReference = { scope: 'user', contentHash: 'ghi' }
    const resolution = missingAsset(reference)
    expect(resolution).toEqual({ outcome: 'missing', label: 'Missing asset (user)', reference })
    expect(resolution.footprint).toBeUndefined()
  })
})
```

What it asserts:

1. `SCOPE_PRECEDENCE` is the exact ordered list `['user', 'project', 'pack', 'bundled']` from design specification section 4.2 step 2.
2. `orderScopesByPrecedence(requested, available)` returns the available scope _kinds_ with the requested scope kind first (the section 4.2 step 1 "exact match" preference), then the rest in precedence order, deduplicated.
3. `resolvedAsset(bytes, scope)` builds `{ outcome: 'resolved', bytes, resolvedScope: scope }`.
4. `missingAsset(reference, footprint?)` builds `{ outcome: 'missing', label, reference, footprint? }` with a label of the form `Missing asset (<scope>)`, and omits `footprint` when not supplied.

Note for the test-author: a "scope kind" here is the coarse category. For a `pack:...@...` scope, the kind label used for ordering is `'pack'`. The pure helper takes scope _kinds_ (`'user' | 'project' | 'pack' | 'bundled'`) as its second argument, not full `AssetScope` strings; the resolver in Task 4 maps full scopes to kinds before calling it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run core/assets/asset-resolution.test.ts`
Expected: FAIL, cannot resolve module `./asset-resolution` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `core/assets/asset-resolution.ts`:

```ts
import type { AssetReference, AssetScope } from '../model/asset-reference'

/** Coarse category of a scope, used for resolution precedence. */
export type ScopeKind = 'user' | 'project' | 'pack' | 'bundled'

/**
 * Source precedence for a hash match found outside the requested scope (design
 * specification section 4.2 step 2). Content addressing makes substitution safe,
 * so a higher-trust source wins when the same bytes appear in several.
 */
export const SCOPE_PRECEDENCE: readonly ScopeKind[] = ['user', 'project', 'pack', 'bundled']

/**
 * The scope kinds to consult, the requested kind first (the section 4.2 step 1
 * exact-match preference), then the remaining available kinds in precedence
 * order. Duplicates are removed; unavailable kinds are dropped.
 */
export function orderScopesByPrecedence(
  requested: AssetReference,
  available: readonly ScopeKind[],
): ScopeKind[] {
  const requestedKind = scopeKindOf(requested.scope)
  const ordered = [requestedKind, ...SCOPE_PRECEDENCE.filter((kind) => kind !== requestedKind)]
  return ordered.filter((kind) => available.includes(kind))
}

export interface AssetFootprint {
  width: number
  depth: number
  height: number
}

export interface ResolvedAsset {
  outcome: 'resolved'
  bytes: Uint8Array
  resolvedScope: AssetScope
}

export interface MissingAsset {
  outcome: 'missing'
  label: string
  reference: AssetReference
  footprint?: AssetFootprint
}

export type AssetResolution = ResolvedAsset | MissingAsset

export function resolvedAsset(bytes: Uint8Array, resolvedScope: AssetScope): ResolvedAsset {
  return { outcome: 'resolved', bytes, resolvedScope }
}

export function missingAsset(reference: AssetReference, footprint?: AssetFootprint): MissingAsset {
  const missing: MissingAsset = {
    outcome: 'missing',
    label: `Missing asset (${reference.scope})`,
    reference,
  }
  if (footprint !== undefined) {
    missing.footprint = footprint
  }
  return missing
}

/** Map a full scope to its coarse kind: any `pack:...@...` scope is `'pack'`. */
function scopeKindOf(scope: AssetScope): ScopeKind {
  if (scope === 'user' || scope === 'project') {
    return scope
  }
  return scope.startsWith('pack:') ? 'pack' : 'bundled'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run core/assets/asset-resolution.test.ts`
Expected: PASS, all five assertions green.

- [ ] **Step 5: Add the barrel exports**

In `core/index.ts`, immediately after the existing line
`export { formatAssetReference, parseAssetReference } from './model/asset-reference'` (around line 40), add:

```ts
export type {
  AssetFootprint,
  AssetResolution,
  MissingAsset,
  ResolvedAsset,
  ScopeKind,
} from './assets/asset-resolution'
export {
  SCOPE_PRECEDENCE,
  missingAsset,
  orderScopesByPrecedence,
  resolvedAsset,
} from './assets/asset-resolution'
```

- [ ] **Step 6: Run the core barrel and lint to confirm nothing else broke**

Run: `pnpm exec vitest run core/ && pnpm lint`
Expected: PASS; no new lint problems. If `no-magic-numbers` or `max-lines-per-function` fires, the implementer restructures within these files only (the registries lint exemption does not cover `core/assets/`).

- [ ] **Step 7: Commit**

```bash
git add core/assets/asset-resolution.ts core/assets/asset-resolution.test.ts core/index.ts
git commit -m "feat: add pure asset-resolution policy and outcome types"
```

- [ ] **Step 8: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor` over this task's diff. Watch for: `scopeKindOf` duplication if a sibling slice also needs scope-kind mapping (leave it private here for now, it is small); the magic strings `'user'`/`'project'`/`'pack'`/`'bundled'` (acceptable as the literal union members, not unexplained constants). Land a `refactor:` commit even if empty.

---

## Task 2: The `AssetSource` read seam and an in-memory source

**Files:**

- Create: `storage/assets/asset-source.ts`
- Create: `storage/assets/in-memory-asset-source.ts`
- Test: `storage/assets/in-memory-asset-source.test.ts`
- Modify: `storage/index.ts` (additive exports, after the existing `DirectoryAssetCache` export near line 6)

- [ ] **Step 1: Write the failing test**

Create `storage/assets/in-memory-asset-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { InMemoryAssetSource } from './in-memory-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(9, 8, 7)

describe('InMemoryAssetSource', () => {
  it('exposes the id it was constructed with', () => {
    const source = new InMemoryAssetSource('user')
    expect(source.id).toBe('user')
  })

  it('reads back bytes registered under a content hash', async () => {
    const source = new InMemoryAssetSource('user', { [HASH]: BYTES })
    expect(await source.read(HASH)).toEqual(BYTES)
  })

  it('returns undefined for a content hash it does not hold', async () => {
    const source = new InMemoryAssetSource('user')
    expect(await source.read(HASH)).toBeUndefined()
  })

  it('isolates stored bytes from later mutation of the caller input', async () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const source = new InMemoryAssetSource('user', { [HASH]: bytes })
    bytes[0] = 0xff
    expect(await source.read(HASH)).toEqual(Uint8Array.of(1, 2, 3))
  })
})
```

What it asserts: the source reports its `id`, reads bytes back by content hash, returns `undefined` for an absent hash, and copies on construction so a later mutation of the caller's array does not change stored bytes (the same isolation contract `InMemoryAssetCache` already holds).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run storage/assets/in-memory-asset-source.test.ts`
Expected: FAIL, cannot resolve module `./in-memory-asset-source`.

- [ ] **Step 3: Write minimal implementation**

Create `storage/assets/asset-source.ts`:

```ts
import type { AssetReference } from '../../core'

/**
 * A read seam over one place assets live (a pack, the user library, the project
 * folder, the content cache). The narrowed, byte-returning form of the design
 * specification section 4.1 source: this slice needs only identity and read.
 * The wider source surface (manifest, thumbnail, write, delete) lands with the
 * library browser and custom-import slices.
 */
export interface AssetSource {
  readonly id: string
  read(contentHash: string): Promise<Uint8Array | undefined>
}

/** Re-exported for callers that build a source keyed off a reference's hash. */
export type { AssetReference }
```

Create `storage/assets/in-memory-asset-source.ts`:

```ts
import type { AssetSource } from './asset-source'

/** Map-backed AssetSource for tests and the not-yet-wired shell. */
export class InMemoryAssetSource implements AssetSource {
  private readonly assets = new Map<string, Uint8Array>()

  constructor(
    readonly id: string,
    initial: Readonly<Record<string, Uint8Array>> = {},
  ) {
    for (const [contentHash, bytes] of Object.entries(initial)) {
      this.assets.set(contentHash, bytes.slice())
    }
  }

  async read(contentHash: string): Promise<Uint8Array | undefined> {
    const stored = this.assets.get(contentHash)
    return stored === undefined ? undefined : stored.slice()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run storage/assets/in-memory-asset-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the barrel exports**

In `storage/index.ts`, immediately after
`export { ASSET_DIRECTORY_PREFIX, DirectoryAssetCache } from './directory-asset-cache'` (around line 6), add:

```ts
export type { AssetSource } from './assets/asset-source'
export { InMemoryAssetSource } from './assets/in-memory-asset-source'
```

- [ ] **Step 6: Run the storage tests and lint**

Run: `pnpm exec vitest run storage/ && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add storage/assets/asset-source.ts storage/assets/in-memory-asset-source.ts storage/assets/in-memory-asset-source.test.ts storage/index.ts
git commit -m "feat: add AssetSource read seam and in-memory source"
```

- [ ] **Step 8: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor` over this task's diff. Watch for: the copy-on-store logic duplicates `InMemoryAssetCache`; this is coincidental similarity over two small classes with different shapes (a source is read-only keyed by hash, the cache is read-write), so leave it (DRY rule: do not abstract a two-line copy across two interfaces). Land a `refactor:` commit even if empty.

---

## Task 3: A cache-backed `AssetSource` adapter

**Files:**

- Create: `storage/assets/cache-asset-source.ts`
- Test: `storage/assets/cache-asset-source.test.ts`
- Modify: `storage/index.ts` (additive export, after the Task 2 source exports)

- [ ] **Step 1: Write the failing test**

Create `storage/assets/cache-asset-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { CacheAssetSource } from './cache-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(4, 5, 6)

describe('CacheAssetSource', () => {
  it('uses the id it was constructed with', () => {
    const source = new CacheAssetSource('project', new InMemoryAssetCache())
    expect(source.id).toBe('project')
  })

  it('reads bytes the underlying cache holds', async () => {
    const cache = new InMemoryAssetCache()
    await cache.put(HASH, BYTES)
    const source = new CacheAssetSource('project', cache)
    expect(await source.read(HASH)).toEqual(BYTES)
  })

  it('returns undefined when the underlying cache lacks the hash', async () => {
    const source = new CacheAssetSource('project', new InMemoryAssetCache())
    expect(await source.read(HASH)).toBeUndefined()
  })
})
```

What it asserts: a `CacheAssetSource` wraps an `AssetCache` so the shipped content-hash cache participates as one source; it reports its `id`, returns cache bytes by hash, and returns `undefined` when the cache `get` returns `undefined`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run storage/assets/cache-asset-source.test.ts`
Expected: FAIL, cannot resolve module `./cache-asset-source`.

- [ ] **Step 3: Write minimal implementation**

Create `storage/assets/cache-asset-source.ts`:

```ts
import type { AssetCache } from '../asset-cache'
import type { AssetSource } from './asset-source'

/**
 * Adapts the content-hash-keyed AssetCache (the minimal cache that already
 * shipped) into an AssetSource so the cache participates in resolution as one
 * source among several. The cache's `get` already returns owned copies, so no
 * extra copy is made here.
 */
export class CacheAssetSource implements AssetSource {
  constructor(
    readonly id: string,
    private readonly cache: AssetCache,
  ) {}

  read(contentHash: string): Promise<Uint8Array | undefined> {
    return this.cache.get(contentHash)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run storage/assets/cache-asset-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the barrel export**

In `storage/index.ts`, immediately after the Task 2 line
`export { InMemoryAssetSource } from './assets/in-memory-asset-source'`, add:

```ts
export { CacheAssetSource } from './assets/cache-asset-source'
```

- [ ] **Step 6: Run the storage tests and lint**

Run: `pnpm exec vitest run storage/ && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add storage/assets/cache-asset-source.ts storage/assets/cache-asset-source.test.ts storage/index.ts
git commit -m "feat: adapt the content-hash cache as an asset source"
```

- [ ] **Step 8: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor`. Watch for: the adapter is a one-line delegate, which is correct and should stay; resist adding error wrapping the cache does not need. Land a `refactor:` commit even if empty.

---

## Task 4: The aggregating `AssetRegistry` with exact-match-then-hash-match resolution

**Files:**

- Create: `storage/assets/asset-registry.ts`
- Test: `storage/assets/asset-registry.test.ts`
- Modify: `storage/index.ts` (additive exports, after the Task 3 export)

This task delivers the spine: an `AssetRegistry` constructed over a set of sources, each tagged with a `ScopeKind`, that resolves an `AssetReference` by consulting sources in precedence order and returns a `ResolvedAsset` on the first hit. The two later behaviors (pack-version fallback in Task 5, missing-asset placeholder in Task 6) extend this same class.

- [ ] **Step 1: Write the failing test**

Create `storage/assets/asset-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../../core'
import { AssetRegistry } from './asset-registry'
import { InMemoryAssetSource } from './in-memory-asset-source'

const HASH = 'abc123'
const BYTES = Uint8Array.of(1, 1, 1)
const OTHER_BYTES = Uint8Array.of(2, 2, 2)

describe('AssetRegistry resolution', () => {
  it('returns the bytes from the exactly-requested scope when present', async () => {
    const registry = new AssetRegistry([
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(BYTES)
      expect(resolution.resolvedScope).toBe('project')
    }
  })

  it('falls back to a hash match in a higher-precedence scope', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(OTHER_BYTES)
      expect(resolution.resolvedScope).toBe('user')
    }
  })

  it('prefers the requested scope over a higher-precedence scope that also has the hash', async () => {
    const registry = new AssetRegistry([
      { kind: 'user', source: new InMemoryAssetSource('user', { [HASH]: OTHER_BYTES }) },
      { kind: 'project', source: new InMemoryAssetSource('project', { [HASH]: BYTES }) },
    ])
    const reference: AssetReference = { scope: 'project', contentHash: HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe('project')
    }
  })
})
```

What it asserts:

1. Exact-scope match wins: when the project source holds the hash, the project bytes come back even though a user source also holds the hash under different bytes.
2. Cross-source hash match: with only a user source present, a `project`-scoped request still resolves from `user` (content addressing makes the substitution safe), and `resolvedScope` reports `'user'`.
3. Requested-scope preference over precedence: when both `user` (higher precedence) and `project` (the requested scope) hold the hash, the requested scope wins, confirming the ordering puts the requested kind first.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: FAIL, cannot resolve module `./asset-registry`.

- [ ] **Step 3: Write minimal implementation**

Create `storage/assets/asset-registry.ts`:

```ts
import {
  orderScopesByPrecedence,
  resolvedAsset,
  type AssetFootprint,
  type AssetReference,
  type AssetResolution,
  type ScopeKind,
} from '../../core'
import type { AssetSource } from './asset-source'

/** A source tagged with the scope kind it stands for, for precedence ordering. */
export interface ScopedAssetSource {
  kind: ScopeKind
  source: AssetSource
}

/**
 * Aggregates asset sources and resolves a content-addressed reference with the
 * graceful-degradation precedence of design specification section 4.2: the
 * exactly-requested scope first, then a hash match in another source by
 * precedence. Pack-version fallback and the missing-asset placeholder are added
 * in later slices of this track.
 */
export class AssetRegistry {
  constructor(private readonly sources: readonly ScopedAssetSource[]) {}

  async resolve(reference: AssetReference): Promise<AssetResolution> {
    const order = orderScopesByPrecedence(reference, this.availableKinds())
    for (const kind of order) {
      const resolution = await this.readFromKind(kind, reference)
      if (resolution !== undefined) {
        return resolution
      }
    }
    return this.notResolved(reference)
  }

  private availableKinds(): ScopeKind[] {
    return this.sources.map((scoped) => scoped.kind)
  }

  private async readFromKind(
    kind: ScopeKind,
    reference: AssetReference,
  ): Promise<AssetResolution | undefined> {
    for (const scoped of this.sources) {
      if (scoped.kind !== kind) {
        continue
      }
      const bytes = await scoped.source.read(reference.contentHash)
      if (bytes !== undefined) {
        return resolvedAsset(bytes, scopeForKind(kind, reference))
      }
    }
    return undefined
  }

  // Overridden in Task 6 to return a labeled placeholder. For now, a request
  // that finds no bytes throws so the missing path is unmistakably unimplemented
  // until its own RED test drives it.
  protected notResolved(reference: AssetReference): AssetResolution {
    throw new Error(`Unresolved asset reference: ${reference.scope}#${reference.contentHash}`)
  }
}

/**
 * The scope to report for a resolved hit. When the hit came from the requested
 * scope's kind, report the exact requested scope; otherwise report the kind as a
 * plain scope label (`'user'` / `'project'`), or for a pack hit, the requested
 * scope is kept since the cross-pack-version case is handled in Task 5.
 */
function scopeForKind(kind: ScopeKind, reference: AssetReference): AssetReference['scope'] {
  if (kind === 'user' || kind === 'project') {
    return kind
  }
  return reference.scope
}

export type { AssetFootprint }
```

Note for the implementer: the `notResolved` throw is a deliberate temporary stub so this task's three tests (all of which resolve to bytes) pass without yet building the placeholder. Task 6's RED test replaces the throw with a real placeholder. Do not build the placeholder now; YAGNI until its test exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: PASS, all three resolution cases green.

- [ ] **Step 5: Add the barrel exports**

In `storage/index.ts`, immediately after the Task 3 line
`export { CacheAssetSource } from './assets/cache-asset-source'`, add:

```ts
export { AssetRegistry } from './assets/asset-registry'
export type { ScopedAssetSource } from './assets/asset-registry'
```

- [ ] **Step 6: Run the storage tests and lint**

Run: `pnpm exec vitest run storage/ && pnpm lint`
Expected: PASS. Watch the cyclomatic-complexity and `max-lines-per-function` warnings on `readFromKind`; if either fires, extract the inner read into a small private method rather than inlining.

- [ ] **Step 7: Commit**

```bash
git add storage/assets/asset-registry.ts storage/assets/asset-registry.test.ts storage/index.ts
git commit -m "feat: resolve asset references by scope precedence across sources"
```

- [ ] **Step 8: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor`. Watch for: the temporary `notResolved` throw (keep it, with its WHY comment, until Task 6); the `scopeForKind` helper (small, leave private). Land a `refactor:` commit even if empty.

---

## Task 5: Pack-version fallback (same hash in a different version of the same pack)

**Files:**

- Modify: `storage/assets/asset-registry.ts` (extend resolution; no new exported symbol)
- Test: `storage/assets/asset-registry.test.ts` (add cases)

Design specification section 4.2 step 3: a `pack:victorian@1.2.0` reference whose hash is not in that exact pack version resolves from `pack:victorian@1.1.0` if the same hash lives there. This is a pack-scope-only refinement: same pack id, any version.

- [ ] **Step 1: Write the failing test**

Add to `storage/assets/asset-registry.test.ts`:

```ts
describe('AssetRegistry pack-version fallback', () => {
  const PACK_HASH = 'feed01'
  const PACK_BYTES = Uint8Array.of(7, 7, 7)

  it('resolves a pack hash from a different version of the same pack', async () => {
    const registry = new AssetRegistry([
      {
        kind: 'pack',
        source: new InMemoryAssetSource('pack:victorian@1.1.0', { [PACK_HASH]: PACK_BYTES }),
      },
    ])
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: PACK_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.bytes).toEqual(PACK_BYTES)
      expect(resolution.resolvedScope).toBe('pack:victorian@1.1.0')
    }
  })

  it('does not cross to a different pack id on a pack-version fallback', async () => {
    const registry = new AssetRegistry([
      {
        kind: 'pack',
        source: new InMemoryAssetSource('pack:craftsman@1.0.0', { [PACK_HASH]: PACK_BYTES }),
      },
    ])
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: PACK_HASH }

    // No same-id pack version holds the hash; a different pack id is a cross-source
    // hash match (step 2), not a pack-version fallback. With no placeholder yet,
    // this still resolves by the step-2 cross-source rule because the kinds match.
    const resolution = await registry.resolve(reference)
    expect(resolution.outcome).toBe('resolved')
    if (resolution.outcome === 'resolved') {
      expect(resolution.resolvedScope).toBe('pack:craftsman@1.0.0')
    }
  })
})
```

What it asserts:

1. A `pack:victorian@1.2.0` request resolves from a source whose id is `pack:victorian@1.1.0` (same pack id, different version), and `resolvedScope` reports the version that actually held the bytes.
2. Pack sources are still consulted by the step-2 cross-source rule when no same-id version matches, so a different pack id (`pack:craftsman@1.0.0`) still resolves the hash (content addressing makes that safe); the distinction tested here is that `resolvedScope` reflects the source the bytes came from.

Note for the test-author: the `InMemoryAssetSource` `id` is the full pack scope string (for example `pack:victorian@1.1.0`). The registry will compare the source id's pack-id portion (`victorian`) to the requested scope's pack-id portion to recognize a same-pack version fallback and report the source's real scope as `resolvedScope`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: FAIL: the first case fails because `scopeForKind` currently returns the _requested_ scope (`pack:victorian@1.2.0`) for any pack hit, not the source's actual scope (`pack:victorian@1.1.0`).

- [ ] **Step 3: Write minimal implementation**

In `storage/assets/asset-registry.ts`, replace the pack hit reporting so a pack source reports its own id as the resolved scope. Change `readFromKind` to pass the source through to `resolvedAsset`, and replace `scopeForKind` with a version that, for a pack hit, returns the source's id:

```ts
  private async readFromKind(
    kind: ScopeKind,
    reference: AssetReference,
  ): Promise<AssetResolution | undefined> {
    for (const scoped of this.sources) {
      if (scoped.kind !== kind) {
        continue
      }
      const bytes = await scoped.source.read(reference.contentHash)
      if (bytes !== undefined) {
        return resolvedAsset(bytes, resolvedScopeFor(scoped, reference))
      }
    }
    return undefined
  }
```

Replace `scopeForKind` with:

```ts
/**
 * The scope to report for a resolved hit. A pack hit reports the source's own
 * scope id, so a pack-version fallback (design specification section 4.2 step 3)
 * surfaces the version that actually held the bytes. A user or project hit
 * reports the kind as its plain scope.
 */
function resolvedScopeFor(
  scoped: ScopedAssetSource,
  reference: AssetReference,
): AssetReference['scope'] {
  if (scoped.kind === 'user' || scoped.kind === 'project') {
    return scoped.kind
  }
  return scoped.source.id as AssetReference['scope']
}
```

Note for the implementer: ordering pack sources so the _same pack id_ is tried before a _different pack id_ is a refinement of step-2-versus-step-3 precedence. For this slice, all pack sources share the single `'pack'` kind and are consulted in construction order; reporting the source's real scope is what the tests pin. If a later slice needs strict same-id-before-other-id ordering, it adds a dedicated test then; do not add that ordering speculatively now (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: PASS, including the three Task 4 cases (unchanged for user/project) and the two new pack cases.

- [ ] **Step 5: Run the full storage suite and typecheck**

Run: `pnpm exec vitest run storage/ && pnpm typecheck && pnpm lint`
Expected: PASS. The `as AssetReference['scope']` cast is at the source-id-to-scope boundary; if lint forbids the cast, narrow with a small `isPackScope` guard rather than suppressing.

- [ ] **Step 6: Commit**

```bash
git add storage/assets/asset-registry.ts storage/assets/asset-registry.test.ts
git commit -m "feat: report the pack version a fallback hash resolved from"
```

- [ ] **Step 7: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor`. Watch for: the `as AssetReference['scope']` cast (replace with a guard if the reviewer flags it); any duplication between `resolvedScopeFor` and `scopeKindOf` in `core/` (different concerns: one maps scope to kind, the other reports a source's scope, so leave both). Land a `refactor:` commit even if empty.

---

## Task 6: Missing-asset placeholder with the correct footprint

**Files:**

- Modify: `storage/assets/asset-registry.ts` (replace the temporary `notResolved` throw with a real placeholder; accept an optional footprint resolver)
- Test: `storage/assets/asset-registry.test.ts` (add cases)

Design specification section 4.2 step 4: when no source holds the hash, return a visible, clearly-labeled placeholder carrying the correct footprint so the user keeps editing and the asset panel surfaces the gap. The footprint is known from the project's stored reference metadata (the pack manifest's `dimensions`), so the registry takes an optional footprint lookup at construction.

- [ ] **Step 1: Write the failing test**

Add to `storage/assets/asset-registry.test.ts`:

```ts
import { missingAsset } from '../../core'

describe('AssetRegistry missing-asset placeholder', () => {
  const ABSENT_HASH = 'missing99'

  it('returns a labeled placeholder when no source holds the hash', async () => {
    const registry = new AssetRegistry([{ kind: 'user', source: new InMemoryAssetSource('user') }])
    const reference: AssetReference = { scope: 'user', contentHash: ABSENT_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution).toEqual(missingAsset(reference))
    expect(resolution.outcome).toBe('missing')
  })

  it('carries the footprint from the footprint lookup when one is known', async () => {
    const footprint = { width: 600, depth: 400, height: 900 }
    const registry = new AssetRegistry(
      [{ kind: 'user', source: new InMemoryAssetSource('user') }],
      {
        footprintFor: () => footprint,
      },
    )
    const reference: AssetReference = { scope: 'user', contentHash: ABSENT_HASH }

    const resolution = await registry.resolve(reference)

    expect(resolution).toEqual(missingAsset(reference, footprint))
    if (resolution.outcome === 'missing') {
      expect(resolution.footprint).toEqual(footprint)
    }
  })
})
```

What it asserts:

1. With no source holding the hash and no footprint lookup, `resolve` returns exactly `missingAsset(reference)`: outcome `'missing'`, the label `Missing asset (user)`, the reference, and no footprint.
2. When the registry is constructed with a `footprintFor` lookup that returns a footprint for the reference, the placeholder carries that footprint, matching `missingAsset(reference, footprint)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: FAIL: the first new case fails because the current `notResolved` throws instead of returning a `MissingAsset`; the second fails because the constructor takes no options.

- [ ] **Step 3: Write minimal implementation**

In `storage/assets/asset-registry.ts`:

1. Import `missingAsset` and the `AssetFootprint` type from `../../core` (extend the existing import).
2. Add an options type and constructor parameter:

```ts
export interface AssetRegistryOptions {
  /** Footprint to draw a placeholder at when an asset cannot be resolved. */
  footprintFor?: (reference: AssetReference) => AssetFootprint | undefined
}
```

3. Change the constructor and replace `notResolved`:

```ts
  constructor(
    private readonly sources: readonly ScopedAssetSource[],
    private readonly options: AssetRegistryOptions = {},
  ) {}
```

```ts
  // Design specification section 4.2 step 4: a clearly-labeled placeholder with
  // the correct footprint so editing continues and the asset panel surfaces the
  // gap with a recovery path.
  private notResolved(reference: AssetReference): AssetResolution {
    const footprint = this.options.footprintFor?.(reference)
    return missingAsset(reference, footprint)
  }
```

Remove `protected` from `notResolved` (it is a private detail now) and delete its temporary throw and the stale WHY comment about being unimplemented.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run storage/assets/asset-registry.test.ts`
Expected: PASS, all Task 4, Task 5, and Task 6 cases.

- [ ] **Step 5: Run the full check chain for this slice**

Run: `pnpm exec vitest run core/ storage/ && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: PASS across both layers.

- [ ] **Step 6: Commit**

```bash
git add storage/assets/asset-registry.ts storage/assets/asset-registry.test.ts
git commit -m "feat: return a labeled footprint placeholder for an unresolved asset"
```

- [ ] **Step 7: BLUE refactor checkpoint**

Run `/clean-code-review` then `/refactor`. Watch for: `resolve`'s loop plus the `notResolved` fall-through should read newspaper-style (high-level resolve at top, helpers below); the optional-chaining `footprintFor?.(...)` is intentional. Confirm `notResolved` is now private. Land a `refactor:` commit even if empty.

---

## Task 7: Slice acceptance and integration check

**Files:** none new; this task verifies the slice as a whole and is the assets-track-foundation acceptance gate for this slice.

- [ ] **Step 1: Run the slice's full local check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm exec vitest run core/ storage/`
Expected: PASS. (The full `pnpm test` and `pnpm build` run at PR time; this step is the slice-local gate.)

- [ ] **Step 2: Confirm the public surface**

Verify, by reading `core/index.ts` and `storage/index.ts`, that exactly these new symbols are exported and nothing unrelated changed:

- From `core`: `AssetFootprint`, `AssetResolution`, `MissingAsset`, `ResolvedAsset`, `ScopeKind` (types); `SCOPE_PRECEDENCE`, `missingAsset`, `orderScopesByPrecedence`, `resolvedAsset` (values).
- From `storage`: `AssetSource`, `ScopedAssetSource`, `AssetRegistryOptions` (types); `InMemoryAssetSource`, `CacheAssetSource`, `AssetRegistry` (values).

- [ ] **Step 3: Confirm the layer boundary held**

Run: `grep -rnE "from 'react'|from 'three'|three/|crypto\\.|indexedDB|navigator\\." core/assets/ storage/assets/`
Expected: no matches. `core/assets/` and `storage/assets/` touch neither React, Three.js, nor browser globals; resolution is pure plus injected sources.

- [ ] **Step 4: PR-level review**

Run `/review` to dispatch the pr-reviewer over the branch. Confirm the red-green-blue cycle ran for every behavior (each `feat:` preceded by a failing `test`, each closed by a `refactor:`), the naming and language policies held (no milestone codes, no third-party product names, no em-dashes), and the two barrel files are the only shared files touched.

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin feat/asset-cache-and-registry
gh pr create --title "feat: asset cache and registry foundation" --body "<describe the slice and link this plan>"
```

---

## Decisions I made / open questions

1. **Layer split (policy in `core/`, resolver in `storage/`).** The design specification and ADR-0003 place `AssetCache`, `LibraryStore`, and the `AssetSource`/`AssetRegistry` aggregation in `storage/`. The pure precedence ordering and the resolution-outcome shape (including the labeled placeholder and its footprint) carry no I/O, so they live in `core/assets/` where they are unit-tested in pure Node and reused by any consumer. The stateful resolver that walks byte-returning sources lives in `storage/assets/`. This respects invariant 1 and keeps the algorithm testable without a fake filesystem.

2. **Bytes are `Uint8Array`, not `Blob`.** The design specification section 5.1 sketch types `AssetCache.get` as `Blob | null` and `AssetSource.fetch` as `Blob`, but the _shipped_ `AssetCache` (`storage/asset-cache.ts`) and `LibraryStore` both use `Uint8Array`. This slice follows the shipped code so the new sources compose with the existing caches with no conversion, and so `core/` stays free of the browser `Blob` type. No spec change is implied; `Blob` adaptation, if ever needed, belongs at the `engine/loaders/` boundary that turns bytes into Three.js scene graphs.

3. **Narrowed `AssetSource` (read-only).** The section 4.1 `AssetSource` carries `manifest`, `getThumbnail`, `canWrite`, `put`, and `delete`. This slice needs only `id` and `read`, so it ships that narrow interface and leaves the wider surface for the library-browser and custom-import slices that actually use manifests, thumbnails, and writes. This is YAGNI, not a redefinition: the later slices widen the interface additively.

4. **Pack-version fallback is reporting, not strict ordering.** This slice consults all `'pack'`-kind sources in construction order and reports the _actual_ source scope a hit came from, which satisfies the section 4.2 step-3 observable behavior (a `victorian@1.2.0` request resolving from `victorian@1.1.0` and saying so). Strict "same pack id before different pack id" ordering is deferred until a slice needs it, with its own test, rather than built speculatively.

5. **No `bundled` scope literal added to `AssetScope`.** `SCOPE_PRECEDENCE` includes `'bundled'` because the spec's precedence list does, and the resolver tolerates a `'bundled'`-kind source, but the `AssetReference['scope']` union in `core/model/asset-reference.ts` is left untouched (it has `user`, `project`, `pack:...`). Adding a `bundled` scope literal would modify a shared, sibling-touched file for no behavior this slice needs; the `BundledSource` slice can add it when it ships. **Open question for the orchestrator:** if a sibling track is about to add the `bundled` scope to `AssetScope`, coordinate so it lands once.

6. **No content-hash _verification_ in this slice.** ADR-0007 and ADR-0024 note that confirming a source's bytes actually hash to the claimed `contentHash` is the pack-build and loader integrity step. This slice resolves by hash key (the dedup surface) and does not re-hash bytes on read; verification belongs with the pack-build pipeline graduation (ADR-0024) and a dedicated integrity slice. Recorded so a reader does not treat a resolved asset as integrity-checked.

7. **No track-foundation spec note was added.** The cross-cutting decisions above are all captured here and in existing ADRs (0007, 0024, 0003, 0006). Nothing in this slice changes the design specification or an existing ADR, so per the workflow no ADR is required for this slice; if the resolver's interfaces stabilize across several assets-track slices, a single assets-track ADR can record them then rather than now.

## Self-review notes

- **Spec coverage.** Section 4.2 steps 1 (exact match, Task 4), 2 (cross-source hash match by precedence, Task 4), 3 (pack-version fallback, Task 5), and 4 (labeled footprint placeholder, Task 6) each map to a task. Section 4.1 sources map to Tasks 2 and 3 (in-memory and cache-backed sources). The asset `kind` enumeration (4.5) is out of scope for resolution and untouched.
- **Type consistency.** `AssetResolution`, `ResolvedAsset`, `MissingAsset`, `AssetFootprint`, `ScopeKind`, `resolvedAsset`, `missingAsset`, `orderScopesByPrecedence`, `SCOPE_PRECEDENCE`, `AssetSource`, `ScopedAssetSource`, `AssetRegistry`, and `AssetRegistryOptions` are defined once and referenced with identical names and signatures across tasks.
- **No placeholders.** Every code step shows complete code; every run step shows the command and expected outcome.
