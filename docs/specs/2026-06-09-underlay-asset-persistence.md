# Slice design: minimal underlay asset persistence

Status: approved for planning (2026-06-09)
Scope owner: the underlay-asset-persistence slice (branch `feat/underlay-asset-persistence`), slice 13 of the Phase 1 two-dimensional plan editor (the first of the two finishing slices)
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, section 10 Phase 1 acceptance ("Project survives close/reopen with zero state loss"), section 3.3 assets, and ADR-0007 (content-addressed assets), ADR-0037 (image underlay), ADR-0041 (the finishing-slice boundary)
Base: `main` (schema v4; slices 1 to 12 plus the dependency and reframe work are landed)

## 1. Purpose

Slice 12 lets the user load a raster image as a calibrated underlay, but the
decoded bitmap lives only in an in-memory cache for the session (ADR-0037): the
image bytes are read from the file, hashed, decoded, and then discarded, so a
saved project records only the underlay's `image: AssetReference` and the raster
is gone on reload. That fails the named Phase-1 acceptance test "Project survives
close/reopen with zero state loss" for a marquee old-house workflow (trace a
scanned plan, then save). This slice closes that gap with the minimum that
satisfies the acceptance: it persists the underlay's raster bytes through a
content-addressed `AssetCache` backed by the project's durable store, and resolves
them back on open so the underlay repaints after a reload.

The behavioral contract: **an underlay's raster persists with the project and
re-resolves on reopen, so a placed, calibrated underlay reappears at its placement
and opacity after save and reload.**

## 2. Goals and non-goals

### Goals

- Two `AssetCache` implementations of the existing `storage/asset-cache.ts`
  interface (`has`/`get`/`put` keyed by content hash): an `InMemoryAssetCache`
  (a `Map`, for tests and the non-durable default) and a `DirectoryAssetCache`
  that stores bytes at `assets/<contentHash>` through the existing `DirectoryPort`
  the OPFS and folder stores already wrap.
- A boot seam that resolves a `{ store, assets }` pair so the durable
  directory-backed stores (OPFS, folder) get a `DirectoryAssetCache` over the same
  directory the store writes `project.json` to, and the asset bytes live alongside
  the project (content-addressed, so identical bytes deduplicate).
- A bridge `AssetCacheProvider` and `useAssetCache()` hook that make the resolved
  `AssetCache` available to the editor, wired once at app boot.
- The underlay load path writes bytes to the cache on image load and resolves and
  re-decodes them on open: `use-underlay.ts` calls `assets.put(contentHash, bytes)`
  when an image is loaded, and a resolve-on-open effect calls `assets.get` and
  `createImageBitmap` for each underlay whose bitmap is not yet decoded, then
  triggers a redraw so the underlay paints after a reload.
- A storage-level round-trip test: bytes put through a `DirectoryAssetCache` over
  an `InMemoryDirectory`, and a project saved with that underlay, both resolve back
  byte-identical through a fresh cache and store over the same directory.

### Non-goals (documented deferrals, still Phase 3 or later per ADR-0041)

- **Durable IndexedDB asset persistence.** The OPFS and folder stores are
  directory-backed and persist assets through the `DirectoryAssetCache`. The
  IndexedDB default store (the no-OPFS fallback) and the in-memory store use the
  `InMemoryAssetCache`, so an underlay does not survive reload on those backends;
  a durable IndexedDB-backed `AssetCache` is a near-term follow-up, consistent with
  the slice-11 IndexedDB and WebKit-OPFS deferrals. The acceptance round-trip is
  proven against the directory-backed path (the OPFS-preferred runtime).
- **The full asset-and-pack pipeline.** No `previews/`, no `ATTRIBUTIONS.md`, no
  library packs, no pack-scoped or user-scoped assets; only `scope: 'project'`
  underlay rasters. Those stay Phase 3 (ADR-0007).
- **Quota, eviction, and orphan collection.** Content-addressed bytes are never
  deleted by this slice (deleting an underlay or a project leaves its bytes); a
  quota-and-eviction and garbage-collection pass is Phase 3.
- **The `.house.zip` bundle asset round-trip.** Exporting and importing a bundle
  with its `assets/` is owned by the zip-bundle and asset-pipeline work; this slice
  targets the durable directory stores the app boots against.
- **PDF and glTF underlays, underlay selection and gizmos.** Unchanged from the
  slice-12 deferrals.

## 3. Constraints

- `core/` is untouched: the `AssetReference` model and the `Underlay` already carry
  the content hash; no schema change (parent spec invariant 1, and the v4 schema
  stands).
- Asset persistence is a storage-layer concern: the `AssetCache` implementations
  live in `storage/`, depend only on the `DirectoryPort` seam (ADR-0028) and plain
  bytes, and have no React or Three.js.
- The editor reaches the cache only through a bridge-provided `useAssetCache()`
  hook, mirroring how it reaches the session and selection; the editor does not
  import `storage/` directly (layer boundaries).
- The content hash is the existing SHA-256 hex the underlay load already computes
  (`use-underlay.ts`); the cache key is exactly `AssetReference.contentHash`, so
  the cache and the reference agree by construction (ADR-0007).
- The wall-drawing end-to-end flow and every existing store and underlay test stay
  green; a project with no underlays neither writes nor reads any asset.
- The full check chain and `rgb:audit` stay green; ESLint at zero problems.

## 4. The asset caches (`storage/`)

`storage/in-memory-asset-cache.ts`: `InMemoryAssetCache implements AssetCache`
over a `Map<string, Uint8Array>`; `put` stores a copy, `get` returns the stored
bytes or `undefined`, `has` reports membership. Pure and synchronous-backed
(wrapped in resolved promises to satisfy the async interface).

`storage/directory-asset-cache.ts`: `DirectoryAssetCache implements AssetCache`
over a `DirectoryPort` with a fixed `assets/` prefix. `put(hash, bytes)` writes
`directory.writeFile('assets/' + hash, bytes)`; `get(hash)` returns
`directory.readFile('assets/' + hash)`; `has(hash)` resolves to whether
`readFile` returns bytes. The content-addressed key means a re-put of identical
bytes is idempotent and identical rasters across underlays or projects share one
file. The `assets/` area sits at the directory root the store wraps (the OPFS
root, or the chosen folder), a sibling of the per-project `project.json`, so it is
shared and deduplicated across projects in that store.

## 5. Boot wiring (`storage/`, `app/`, `bridge/`)

The durable directory stores construct their store and asset cache from one
directory. New factory(ies) return a `ProjectStorage` pair
`{ store: ProjectStore; assets: AssetCache }`:

- OPFS: build the `FileSystemDirectory` over `navigator.storage.getDirectory()`
  once, then `{ store: new OpfsProjectStore(dir), assets: new DirectoryAssetCache(dir) }`.
- The IndexedDB and in-memory defaults pair their store with an
  `InMemoryAssetCache` (the durable-IndexedDB-asset follow-up noted above).

`app/resolve-project-store.ts` becomes `resolveProjectStorage(): Promise<ProjectStorage>`
(the pure `selectProjectStoreBackend` decision is unchanged; only the constructed
value gains `assets`). `app/app.tsx` resolves the pair, passes `store` to the
session exactly as today, and provides `assets` to the editor through a new
bridge `AssetCacheProvider` wrapping the editor shell. `bridge/react/` adds
`AssetCacheProvider` and `useAssetCache()` (a context returning the provided
`AssetCache`), mirroring the selection and session providers (ADR-0020 sibling
pattern). A missing provider yields a no-op in-memory cache so a bare `PlanView`
render (a story or isolated test) neither throws nor persists.

## 6. The underlay round trip (`editor/plan/use-underlay.ts`)

Write on load: `loadImageFile` already reads the bytes, computes the SHA-256
`contentHash`, and decodes the bitmap. It additionally awaits
`assets.put(contentHash, bytes)` before dispatching `placeUnderlay`, so the raster
is durable the moment the underlay exists. The put is best-effort: a failure is
logged (a user-facing toast stays the documented slice-12 follow-up) and does not
block placement.

Resolve on open: a new effect in `UnderlayProvider` watches the project's
underlays (across all floors). For each underlay whose `image.contentHash` is not
already in the in-memory bitmap cache, it awaits `assets.get(contentHash)`, and
when bytes come back it `createImageBitmap`s them, stores the bitmap in the cache,
and bumps a small render counter (state) so `resolveDrawables` re-runs and the
underlay paints. Decoding is idempotent and guarded against double-decode (mark an
in-flight hash) and against setting state after unmount. A missing asset (bytes
not found) is skipped, exactly as a not-yet-decoded bitmap is skipped today, so a
project opened on a backend whose assets did not persist degrades to the current
behavior rather than erroring.

## 7. Testing strategy

Red-green-blue per behavior with the role-separated subagents:

- **Pure storage, unit-tested:** `InMemoryAssetCache` (`put`/`get`/`has`, miss
  returns `undefined`, idempotent re-put); `DirectoryAssetCache` over an
  `InMemoryDirectory` (`put` writes `assets/<hash>`, `get` reads it back
  byte-identical, `has` reflects presence, a miss is `undefined`); and the
  acceptance round-trip (put bytes and save a project carrying that underlay
  through one directory, then resolve both back through a fresh cache and store
  over the same `InMemoryDirectory`).
- **Bridge, unit-tested:** `useAssetCache()` returns the provided cache and the
  no-op fallback outside a provider (React Testing Library, mirroring the
  selection-context test).
- **Editor logic, unit-tested where pure:** the resolve-on-open decision (which
  underlays need decoding given the cache contents and the bitmap cache) extracted
  as a pure helper and tested; the `put`-on-load call asserted through a fake
  `AssetCache` in the existing use-underlay test surface if present, else covered
  by the glue.
- **Glue, coverage-excluded, e2e-validated:** the `resolveProjectStorage` wiring,
  the `AssetCacheProvider` placement at app boot, and the async decode effect. The
  wall-drawing end-to-end spec stays green.

## 8. Open questions and follow-ups

- **Durable IndexedDB assets.** The main follow-up: an IndexedDB-backed
  `AssetCache` (an `assets` object store) so the no-OPFS fallback also persists
  underlays. The interface and wiring this slice lands make it an additive backend.
- **Orphan collection and quota.** Content-addressed bytes accumulate; a
  reference-count or mark-and-sweep GC and a quota-and-eviction surface are Phase 3.
- **Bundle assets.** Round-tripping `assets/` through the `.house.zip` export and
  import joins the asset-pipeline and bundle work.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 10
  Phase 1 acceptance ("zero state loss"), section 3.3 (assets, content-addressed),
  and the underlay deliverable. ADR-0007 (content-addressed assets, the hash and
  scope this cache keys on), ADR-0028 (the directory-port storage seam the cache
  reuses), ADR-0030 (additive storage capabilities), ADR-0037 (image underlay,
  whose session-only raster this closes), ADR-0041 (the finishing-slice boundary
  this slice is the first half of).
