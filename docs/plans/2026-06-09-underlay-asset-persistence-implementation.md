# Underlay Asset Persistence Implementation Plan

> **For agentic workers:** Executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`). Each behavior runs RED (`/test-first` -> `test-author`, commit `test:`), GREEN (`/implement` -> `implementer`, commit `feat:`), then BLUE (`/clean-code-review` then `/refactor`, commit `refactor:` or an empty marker). Tasks marked `(infrastructure)` are controller-authored glue (React/boot/store wiring, docs) committed as `build:`/`docs:` or with an `Infrastructure:` trailer so the cycle audit skips them. This plan names each behavior and its public signature; it ships no literal test bodies. Local-only: do NOT push/PR/merge (the user batches that).

**Goal:** An underlay's raster persists with the project and re-resolves on reopen, closing the named Phase-1 "zero state loss" acceptance gap.

**Architecture:** Two `AssetCache` implementations (`InMemoryAssetCache`; `DirectoryAssetCache` storing `assets/<hash>` through the `DirectoryPort`) back a `{ store, assets }` `ProjectStorage` pair resolved at boot. A bridge `AssetCacheProvider`/`useAssetCache` exposes the cache to the editor, which `put`s bytes on image load and resolves+re-decodes them on open. See ADR-0042 and `docs/specs/2026-06-09-underlay-asset-persistence.md`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React + React Testing Library, Vitest. No new dependencies. Base: `main` (schema v4). No `core/` or schema change.

---

## Scope boundary (this is slice 13 of 14)

**In scope:** `InMemoryAssetCache`; `DirectoryAssetCache`; the `ProjectStorage` pair and `resolveProjectStorage`; the OPFS/default storage factories; the bridge `AssetCacheProvider`/`useAssetCache`; the pure `underlaysNeedingDecode` resolver; the `use-underlay` put-on-load and resolve-on-open round trip; the storage round-trip acceptance test; and the boot glue. **Out of scope (ADR-0041, the slice spec section 2):** durable IndexedDB asset persistence (the no-OPFS fallback uses `InMemoryAssetCache`); the full asset-and-pack pipeline (`previews/`, `ATTRIBUTIONS.md`, packs); quota, eviction, and orphan collection; the `.house.zip` bundle asset round-trip; PDF/glTF underlays and underlay gizmos.

**Acceptance:** `InMemoryAssetCache` and `DirectoryAssetCache` satisfy `has`/`get`/`put` (byte-identical round trip, miss is `undefined`, idempotent re-put, `DirectoryAssetCache` writes `assets/<hash>`); a project saved with an underlay through a directory store plus its bytes put through a `DirectoryAssetCache` over the same `InMemoryDirectory` both resolve back through a fresh store and cache; `useAssetCache` returns the provided cache and a no-op fallback outside a provider; `underlaysNeedingDecode` returns the de-duplicated hashes not yet decoded; the editor `put`s on load and the underlay repaints after a simulated reload via the resolve effect (e2e/glue). Full chain green; `eslint .` zero problems; `rgb:audit` clean; wall-drawing e2e still passes.

---

## Public contract

```ts
// storage/in-memory-asset-cache.ts
export class InMemoryAssetCache implements AssetCache {} // Map<string, Uint8Array>

// storage/directory-asset-cache.ts
export const ASSET_DIRECTORY_PREFIX = 'assets'
export class DirectoryAssetCache implements AssetCache {
  constructor(directory: DirectoryPort)
}

// storage/project-storage.ts
export interface ProjectStorage {
  store: ProjectStore
  assets: AssetCache
}
export async function createOpfsProjectStorage(): Promise<ProjectStorage>
export function createDefaultProjectStorage(): ProjectStorage // IndexedDB store + InMemoryAssetCache

// app/resolve-project-store.ts
export async function resolveProjectStorage(): Promise<ProjectStorage>

// bridge/react/asset-cache-context.ts
export interface AssetCacheProviderProps {
  assets: AssetCache
  children: ReactNode
}
export function AssetCacheProvider(props: AssetCacheProviderProps): ReactElement
export function useAssetCache(): AssetCache // no-op InMemoryAssetCache outside a provider

// editor/plan/underlay-resolve.ts
export interface UnderlayRef {
  contentHash: string
}
/** The de-duplicated content hashes of underlays whose bitmap is not yet decoded. */
export function underlaysNeedingDecode(
  underlays: readonly UnderlayRef[],
  decoded: ReadonlySet<string>,
): string[]
```

---

## Section A: the asset caches (`storage`)

### Task A1: InMemoryAssetCache

**Files:** create `storage/in-memory-asset-cache.ts`, its test; export from `storage/index.ts` (infra).

- [ ] **RED** `/test-first`: a fresh `InMemoryAssetCache`: `has(h)` is false and `get(h)` is `undefined`; after `put(h, bytes)`, `has(h)` is true and `get(h)` deep-equals `bytes`; a re-`put` of identical bytes is idempotent; a stored copy is independent of a later mutation of the caller's array. Signature: `InMemoryAssetCache`.
- [ ] **GREEN** `/implement`: a `Map<string, Uint8Array>`; `put` stores a copy (`bytes.slice()`); `get` returns the stored value or `undefined`; `has` reports membership. All methods return resolved promises (async interface).
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `InMemoryAssetCache` from `storage/index.ts`.

### Task A2: DirectoryAssetCache

**Files:** create `storage/directory-asset-cache.ts`, its test (over `InMemoryDirectory`); export from `storage/index.ts` (infra).

- [ ] **RED** `/test-first`: a `DirectoryAssetCache` over an `InMemoryDirectory`: `put(h, bytes)` writes the bytes to the directory at path `assets/<h>` (assert via the directory's `readFile`); `get(h)` returns those bytes byte-identical; `has(h)` is true after a put and false before; `get` of an absent hash is `undefined`. Signatures: `ASSET_DIRECTORY_PREFIX`, `DirectoryAssetCache`.
- [ ] **GREEN** `/implement`: store `directory`; a private `pathFor(hash)` returns `` `${ASSET_DIRECTORY_PREFIX}/${hash}` ``; `put` calls `writeFile`, `get` calls `readFile`, `has` resolves `readFile(...) !== undefined`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `ASSET_DIRECTORY_PREFIX`, `DirectoryAssetCache` from `storage/index.ts`.

---

## Section B: the persistence round trip (`storage`)

### Task B1: underlay save-and-reopen round-trip

**Files:** create `storage/underlay-persistence.test.ts` (integration over `InMemoryDirectory` + `FolderProjectStore` + `DirectoryAssetCache`).

- [ ] **RED** `/test-first`: build one `InMemoryDirectory`; a `FolderProjectStore` and a `DirectoryAssetCache` over it. Put an underlay's bytes through the cache and `save` a project whose one floor has an underlay referencing that content hash (use `createEmptyProject`/`createFloor`/`createUnderlay`; set `floor.underlays = [underlay]`). Then build a FRESH `FolderProjectStore` and `DirectoryAssetCache` over the SAME directory: `load` returns the project with the underlay intact, and the fresh cache `get`s the bytes back byte-identical. This is the named acceptance: the raster survives save and reopen.
- [ ] **GREEN** `/implement`: no new production code beyond A1/A2 should be required; if a gap surfaces (for example the folder store dropping `underlays`), fix it minimally in the offending module and note it.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section C: the storage pair and boot seam (`storage`, `app`)

### Task C1: ProjectStorage pair and factories (`build:` infrastructure)

**Files:** create `storage/project-storage.ts`; export from `storage/index.ts`; modify `app/resolve-project-store.ts`.

- [ ] Define `ProjectStorage = { store: ProjectStore; assets: AssetCache }`. Add `createOpfsProjectStorage()` (build the `FileSystemDirectory` over `navigator.storage.getDirectory()` once, return `{ store: new OpfsProjectStore(dir), assets: new DirectoryAssetCache(dir) }`) and `createDefaultProjectStorage()` (the IndexedDB default store paired with an `InMemoryAssetCache`). Change `resolveProjectStore` to `resolveProjectStorage(): Promise<ProjectStorage>` reusing the pure `selectProjectStoreBackend`. Keep the OPFS root acquisition and the existing store construction byte-for-byte; only add the paired `assets`. Verify typecheck, lint (0), `vitest run`, build. Commit `build:` (or with an `Infrastructure:` trailer if a fixture must change). The `app.tsx` consumer change lands in F1.

---

## Section D: the bridge provider (`bridge`)

### Task D1: AssetCacheProvider and useAssetCache

**Files:** create `bridge/react/asset-cache-context.ts` (and a small `.tsx` provider if JSX is needed), its RTL test; export from `bridge/index.ts` (infra).

- [ ] **RED** `/test-first` (mirror `bridge/react/selection-context.test.tsx`): a component calling `useAssetCache()` inside an `AssetCacheProvider value=<fake AssetCache>` receives that cache; rendered with no provider it receives a working no-op cache (a fresh `InMemoryAssetCache`) rather than throwing. Signatures: `AssetCacheProvider`, `useAssetCache`.
- [ ] **GREEN** `/implement`: a React context defaulting to a module-level `InMemoryAssetCache`; the provider supplies `assets`; the hook returns `useContext(...)`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `AssetCacheProvider`, `useAssetCache` from `bridge/index.ts`.

---

## Section E: the editor round trip (`editor`)

### Task E1: underlaysNeedingDecode

**Files:** create `editor/plan/underlay-resolve.ts`, its test.

- [ ] **RED** `/test-first`: `underlaysNeedingDecode([{contentHash:'a'},{contentHash:'b'},{contentHash:'a'}], new Set(['b']))` returns `['a']` (drops the already-decoded `b`, de-duplicates the repeated `a`); an empty input or all-decoded returns `[]`. Signatures: `UnderlayRef`, `underlaysNeedingDecode`.
- [ ] **GREEN** `/implement`: iterate, collect hashes not in `decoded`, de-duplicate (a seen set), preserve first-seen order.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task E2: use-underlay write-on-load and resolve-on-open (`build:` infrastructure)

**Files:** modify `editor/plan/use-underlay.ts`.

- [ ] In `loadImageFile`, after computing `contentHash` and decoding, `await deps.assets.put(contentHash, new Uint8Array(bytes))` before dispatching `placeUnderlay` (thread the `AssetCache` from `useAssetCache()` into the load deps). In `UnderlayProvider`, add a resolve-on-open effect: gather the project's underlays (all floors), compute `underlaysNeedingDecode(underlays, decodedHashes)`, and for each hash `await assets.get(hash)`, `createImageBitmap` the bytes, store in the bitmap cache, and bump a render counter (state) so `resolveDrawables` re-runs; guard against double-decode (an in-flight set) and post-unmount state set; skip a missing asset. Verify typecheck, lint (0), `vitest run`, build, and that the wall-drawing e2e stays green. Commit `build:`.

---

## Section F: glue and docs (infrastructure)

### Task F1: app boot wiring (`build:`)

- [ ] In `app/app.tsx`, resolve `resolveProjectStorage()` (default-injectable), pass `store` to the session exactly as today, and wrap the editor shell in `<AssetCacheProvider assets={storage.assets}>`. Update `app/use-project-actions.ts` and any `resolveStore` injection points to the pair. Keep the `e2e-storage-hook` working. Verify the full chain and build. Commit `build:`.

### Task F2: docs (`docs:`)

- [ ] Mark slice 13 done in `ROADMAP.md` (the slice-13 row to `done`, the MVP-path 2D-editor row stays `in progress` until slice 14, and the slice-13 scope paragraph updated to past tense with its deferrals); set ADR-0042 status to accepted/landed. Run `pnpm knowledge:index`.

---

## Self-review

- **Spec coverage:** caches (A), round-trip acceptance (B), storage pair + boot seam (C), bridge provider (D), pure resolver + editor round trip (E), glue + docs (F). Every spec goal maps to a task; every deferral is in the scope boundary.
- **Type consistency:** `AssetCache` (existing) is implemented by `InMemoryAssetCache`/`DirectoryAssetCache`, paired in `ProjectStorage`, provided by `AssetCacheProvider`, consumed via `useAssetCache` in `use-underlay`; `underlaysNeedingDecode` feeds the resolve effect; the content hash is the existing SHA-256 `AssetReference.contentHash`.
- **No placeholders:** every task names its behavior and signature; the cache round trip, the `assets/<hash>` path, and the `underlaysNeedingDecode` example are concrete.
