---
slug: decisions/ADR-0042-underlay-asset-persistence
title: 'ADR-0042: Underlay asset persistence via a directory-backed content-addressed AssetCache'
type: decision
tags:
  [
    architecture,
    storage,
    assets,
    asset-cache,
    content-addressed,
    underlay,
    persistence,
    directory-port,
    bridge,
    editor,
    phase-1,
  ]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0030-additive-storage-capabilities,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0041-phase-1-completion-boundary-finishing-slices,
  ]
sourceFiles:
  [
    docs/specs/2026-06-09-underlay-asset-persistence.md,
    storage/asset-cache.ts,
    storage/fs/directory-port.ts,
    editor/plan/use-underlay.ts,
    app/resolve-project-store.ts,
  ]
status: current
updated: 2026-06-09
---

# ADR-0042: Underlay asset persistence via a directory-backed content-addressed AssetCache

## Status

Accepted (slice 13 of the Phase 1 two-dimensional plan editor, the first finishing
slice per ADR-0041), landed on branch `feat/underlay-asset-persistence`. Records
how the underlay raster is persisted to close the "zero state loss" acceptance gap.

## Context

Slice 12 (ADR-0037) holds the decoded underlay bitmap in an in-memory cache for
the session only: the image bytes are read from the picked file, SHA-256 hashed,
decoded, and discarded, and a saved project records only the underlay's
`image: AssetReference` (a `scope` plus the content hash). On reload the raster is
gone, so the named Phase-1 acceptance test "Project survives close/reopen with
zero state loss" fails for underlays (ADR-0041 calls this out as a genuine
acceptance gap, not cosmetic). The pieces to close it already exist but are
unwired: `storage/asset-cache.ts` defines an `AssetCache` interface (`has`/`get`/
`put` keyed by content hash) with no implementation; the durable OPFS and folder
stores read and write through a flat `DirectoryPort` (ADR-0028); and the underlay
load already computes the content hash the reference uses (ADR-0007). What is
missing is an `AssetCache` implementation, a place to store the bytes, and the
load-time write and open-time resolve.

## Decision

### A directory-backed, content-addressed AssetCache

Add two `AssetCache` implementations in `storage/`. `DirectoryAssetCache` stores
bytes at `assets/<contentHash>` through the same `DirectoryPort` the OPFS and
folder stores wrap, so an underlay's raster is durable in the project store's own
directory, a sibling of `project.json`. Because the key is the content hash
(ADR-0007), a re-put is idempotent and identical rasters share one file and
deduplicate across underlays and projects in that store. `InMemoryAssetCache` (a
`Map`) backs tests and the non-durable default stores. The caches depend only on
the `DirectoryPort` seam and plain `Uint8Array` bytes: no `core`, no React, no
Three.js.

### Resolve a {store, assets} pair at boot; reach it through a bridge provider

The durable directory stores build their store and asset cache from one directory:
the boot seam (`app/resolve-project-store.ts`, now `resolveProjectStorage`) returns
a `ProjectStorage` pair `{ store, assets }`. The OPFS branch constructs the
`FileSystemDirectory` once and pairs `OpfsProjectStore` with a
`DirectoryAssetCache` over it; the IndexedDB and in-memory defaults pair with an
`InMemoryAssetCache`. The pure backend-selection rule is unchanged. The editor
reaches the cache only through a new bridge `AssetCacheProvider` and
`useAssetCache()` hook (mirroring the selection and session providers, the
bridge-owned-dependency pattern of ADR-0020), wired once at app boot; the editor
never imports `storage/` directly, preserving the layer boundary. A missing
provider yields a no-op in-memory cache so a bare `PlanView` render does not throw.

### Write on load, resolve on open, in the editor

`editor/plan/use-underlay.ts` keeps its in-memory decoded-bitmap cache for
rendering but gains a durable round trip behind it. On image load it awaits
`assets.put(contentHash, bytes)` before dispatching `placeUnderlay`, so the raster
is durable the moment the underlay exists. A resolve-on-open effect watches the
project's underlays and, for each whose bitmap is not yet decoded, awaits
`assets.get(contentHash)`, decodes the bytes with `createImageBitmap`, populates
the bitmap cache, and bumps a render counter so the underlay paints after reload.
A missing asset is skipped exactly as a not-yet-decoded bitmap is skipped today, so
a backend whose assets did not persist degrades to the current behavior rather than
erroring.

## Consequences

- An underlay's raster survives save and reopen on the OPFS-preferred durable
  runtime, so the "zero state loss" acceptance test holds and the trace-a-scan
  workflow works. This is the first of the two finishing slices; Phase 1 is
  complete after the DOM-overlay slice (ADR-0041).
- `AssetCache` gains its first implementations and its first real consumer; the
  content-addressed `assets/` area is the forward-compatible substrate the Phase-3
  asset-and-pack pipeline extends (previews, attributions, packs, quota and
  eviction) rather than reworks.
- A new storage-layer abstraction (`ProjectStorage = { store, assets }`) threads
  through the boot seam; the bridge gains an asset-cache provider beside selection
  and session.

## Alternatives considered

- **Store the raster bytes inside `project.json`** (base64 in the model). Rejected:
  it bloats the project document, breaks content-addressed deduplication, and
  fights the existing `AssetReference` indirection (ADR-0007); the reference exists
  precisely so bytes live outside the document.
- **Add asset methods to the `ProjectStore` interface** (`putAsset`/`getAsset`).
  Rejected for this slice: not every store is directory-backed (in-memory,
  IndexedDB, zip), so a separate `AssetCache` paired with the store keeps the
  store interface focused on the project document and lets each backend supply the
  asset backing it can. The `{ store, assets }` pair expresses the pairing without
  widening `ProjectStore`.
- **A durable IndexedDB AssetCache now, for the fallback default.** Deferred: the
  OPFS directory path (the preferred runtime and the e2e target) satisfies the
  acceptance, and the interface this slice lands makes an IndexedDB backend a
  purely additive follow-up, consistent with slice 11's IndexedDB and WebKit-OPFS
  deferrals.
- **Persist the decoded `ImageBitmap` rather than the source bytes.** Rejected:
  bitmaps are not serializable and are platform-decoded; the content-addressed
  source bytes are the durable, portable, dedupable unit, re-decoded on load.

## References

- Slice design: `docs/specs/2026-06-09-underlay-asset-persistence.md`.
- Design specification sections 10 (Phase 1 acceptance "zero state loss") and 3.3
  (content-addressed assets).
- ADR-0007 (content-addressed assets, the hash and scope the cache keys on),
  ADR-0028 (the directory-port seam the cache reuses), ADR-0030 (additive storage
  capabilities), ADR-0037 (image underlay, whose session-only raster this closes),
  ADR-0041 (the finishing-slice boundary).
