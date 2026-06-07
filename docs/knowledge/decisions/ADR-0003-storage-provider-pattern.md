---
slug: decisions/ADR-0003-storage-provider-pattern
title: 'ADR-0003: Provider pattern for storage with cloud-sync seam'
type: decision
tags: [architecture, storage, persistence, opfs]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0022-storage-capability-detection,
    decisions/ADR-0023-service-worker-scaffold,
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0030-additive-storage-capabilities,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    storage/project-store.ts,
    storage/library-store.ts,
    storage/asset-cache.ts,
    storage/in-memory-project-store.ts,
    storage/indexeddb/indexeddb-project-store.ts,
    storage/storage-capabilities.ts,
    storage/select-project-store.ts,
    bridge/autosave/create-autosave.ts,
    bridge/session/load-or-create-project.ts,
    app/resolve-project-store.ts,
    app/app.tsx,
  ]
status: current
updated: 2026-06-06
---

# ADR-0003: Provider pattern for storage with cloud-sync seam

## Status

Accepted. The three provider interfaces, a Map-backed `InMemoryProjectStore`
reference implementation, and a durable `IndexedDbProjectStore` are implemented
in `storage/`. The folder-shaped durable stores are now built as well:
`OpfsProjectStore`, `ZipBundleProjectStore`, and `FileSystemFolderProjectStore`
all implement the same `ProjectStore` interface, composed over a flat
`DirectoryPort` seam (ADR-0028) and a pure migration framework (ADR-0029). The
OPFS-backed store, the IndexedDB recent list, and the Web Locks manager are
verified end to end; the File System Access folder picker is browser-only and
manually verified. Recent-projects, multi-tab locking, and autosave snapshots are
layered as additive capabilities beside `ProjectStore` rather than reshaping it
(ADR-0030). The running app now boots against the durable store chosen by an async boot
probe (`resolveProjectStore`, OPFS-preferred with an IndexedDB fallback) driven by a
pure store-selection rule (`selectProjectStoreBackend`), rather than unconditionally
defaulting to IndexedDB. Cloud sync remains the unbuilt future implementation. The
wall-drawing proof of life added the first durable store and the autosave path
that drives it; the durable-store, boot-wiring, and autosave sections below record that
interpretation.

## Context

Vernacular projects must persist locally (no backend required at MVP), survive
across browsers that vary in filesystem support, and remain ready to add cloud
sync later without rewriting consumers. Browsers offer multiple persistence APIs
(File System Access, OPFS, IndexedDB, Service Worker cache) with quirky
availability. Hard-coding any one of them paints us into a corner.

## Decision

Three interfaces in `storage/`, each with multiple implementations:

- `ProjectStore`, open, save, lock, watch the active project
  (`FileSystemFolderProjectStore`, `OpfsProjectStore`, `ZipBundleProjectStore`,
  all now implemented over the `DirectoryPort` seam of ADR-0028, plus a future
  `CloudSyncProjectStore`). Locking, recent-list, and snapshots are layered as
  additive capabilities beside this interface rather than folded into it
  (ADR-0030).
- `LibraryStore`, user library of custom assets, custom palettes, settings.
- `AssetCache`, content-hash keyed cache for the assets the app has fetched or
  imported.

Consumers (the bridge, editor, and engine layers) interact with the aggregated
facades only, never with browser APIs directly.

## Current implementation state

The interfaces are defined, narrowed for the current model surface:

- `ProjectStore` (`storage/project-store.ts`): `list()`, `load(id)`,
  `save(id, project)`, `delete(id)`, plus a `ProjectSummary` (`{ id, name }`).
- `LibraryStore` (`storage/library-store.ts`): `list()` and
  `resolve(reference)`, keyed on `AssetReference` (ADR-0007). Returns asset bytes
  as `Uint8Array`.
- `AssetCache` (`storage/asset-cache.ts`): `has`, `get`, `put`, all keyed by
  `contentHash`, which is the content-addressed dedup surface.

`InMemoryProjectStore` (`storage/in-memory-project-store.ts`) is the reference
implementation, backed by a `Map<string, Project>`. It is used by tests and the
not-yet-wired app shell. It `structuredClone`s the project on both `save` and
`load`, so a caller can never mutate stored state by holding a reference to the
object it saved or the object it loaded back. A `load` of an unknown id throws.
This isolation behavior is pinned by `storage/in-memory-project-store.test.ts`.

`storage/` depends only on `core/`: it imports `Project` and `AssetReference`
from `../core` and nothing above it in the layer stack. That direction is
enforced (ADR-0012) and proven by the fitness test described in ADR-0017.

## Durable store: IndexedDB

`IndexedDbProjectStore` (`storage/indexeddb/indexeddb-project-store.ts`) is the
first durable `ProjectStore`, reached through `createDefaultProjectStore()`. It is now
the FALLBACK rather than the unconditional default: the running app boots against the
store chosen by the async boot probe below (OPFS when available, IndexedDB otherwise).
It keeps one object store keyed on the project id
and implements `list`/`load`/`save`/`delete` over short transactions. It is the
single seam in the codebase that touches IndexedDB; because jsdom does not
implement IndexedDB, it is deliberately not unit-tested and is validated by the
wall-drawing end-to-end spec instead, which is why all its logic stays in this
one thin adapter.

## Durable stores: folder, OPFS, and zip bundle

Beyond IndexedDB, three folder-shaped durable `ProjectStore`s are now built, all
composed over the flat `DirectoryPort` seam (ADR-0028) so the folder codec,
`project.json` serialization, id namespacing, and migration-on-load are
unit-tested without a browser:

- `OpfsProjectStore` keeps many projects under the OPFS root, one id-named
  subdirectory each, and becomes the running app's default durable store when
  OPFS is available.
- `ZipBundleProjectStore` expands a `.house.zip` into an in-memory directory,
  runs the same folder codec, and re-zips on export for sharing.
- `FileSystemFolderProjectStore` binds one project to a user-picked folder handle
  via the File System Access API.

Each translates a folder-level `ProjectFileNotFoundError` into the id-keyed
`ProjectNotFoundError` below, so the bootstrap contract is unchanged. The
OPFS-backed store is verified end to end; the native folder picker is browser-only
and manually verified. The migration framework these stores run on load is
ADR-0029, and the recent-list, locking, and snapshot capabilities that ride
alongside them are ADR-0030.

### A typed "not found" distinguishes absent from broken

`ProjectStore.load` throws a typed `ProjectNotFoundError`
(`storage/project-store.ts`, carrying the `projectId`) when, and only when, no
project exists under the id. Any other failure (corrupt record, I/O fault) throws
some other error. This distinction is load-bearing for bootstrap: the bridge's
`loadOrCreateProject` (`bridge/session/load-or-create-project.ts`) catches
`ProjectNotFoundError` and falls back to a freshly created project, but rethrows
anything else so a recoverable-but-broken project is never silently discarded
and overwritten by an empty one. The app surfaces a rethrown error as a
recoverable error state rather than booting a blank document. This replaces the
earlier "a `load` of an unknown id throws" contract with a typed signal callers
can branch on.

## The running app boots against the async-resolved durable store

The app no longer hard-codes its store at boot. Two pieces split the decision from the
construction so the decision stays pure and unit-tested:

- `selectProjectStoreBackend(capabilities, options?)`
  (`storage/select-project-store.ts`) is a pure rule mapping a `StorageCapabilities`
  record plus an optional remembered per-project `preferred` backend to a
  `ProjectStoreBackend` (`'indexeddb' | ProjectBackend`, where `ProjectBackend` already
  contributes `'opfs' | 'file-system-folder' | 'zip-bundle'`). With no preference it
  returns `'opfs'` when OPFS is available, otherwise `'indexeddb'`, with `'opfs'` as the
  universal target for a host that offers neither (the ADR-0022 degraded case, surfaced
  by the separate storage-degraded warning, not this rule's concern). A remembered
  preference whose capability is present wins; otherwise it falls back to that order.
  The rule imports no store class and never throws, so it is `core`-free, `storage`-internal,
  and trivially unit-tested in both branches.
- `resolveProjectStore()` (`app/resolve-project-store.ts`) is the thin async boot glue:
  it probes capabilities once, and when the pure rule says `'opfs'` it constructs the
  async `createOpfsProjectStore()`, otherwise it falls back to
  `createDefaultProjectStore()` (IndexedDB). The folder and zip backends need a user
  gesture, so they are not constructed at default boot. `app/app.tsx` feeds the resolved
  store into `useProjectBoot`, preserving the loading and error states. This seam is
  deliberately NOT given its own ADR: all of its decision logic lives in the pure
  `selectProjectStoreBackend`, and the resolver only constructs the chosen store.

## Capability detection feeds the provider choice

Which durable `ProjectStore` to instantiate depends on what the platform offers,
so a separate read-only detection seam, `probeStorageCapabilities`
(`storage/storage-capabilities.ts`), feature-detects OPFS, IndexedDB, and File
System Access over an injectable host and resolves a flat `StorageCapabilities`
record. It is the single seam that reads browser storage globals for detection,
and it is read-only: it never calls `navigator.storage.persist()` (requesting
persistence is a Phase 1 first-save concern). Because its host is injected, both
the available and unavailable branches are unit-tested, unlike the e2e-only
`IndexedDbProjectStore`. The full rationale, including the deliberately omitted
private-browsing heuristic and the degraded-environment boot warning, lives in
ADR-0022.

## Autosave path

Persistence is driven by a debounced autosave that lives in the bridge
(`bridge/autosave/create-autosave.ts`), not in `storage/`, because it depends on
the editor session as well as the store. `createAutosave` subscribes to the
session, and on each change reports `pending`, debounces (default 500 ms), then
saves `session.getProject()` to the store, reporting `saved` or `error`. Its
status is the four-state `idle | pending | saved | error` surfaced in the UI.

Two ownership facts make the debounce safe. `getProject()` returns a live
reference, so reading it when the timer fires persists the latest coalesced edit
rather than a stale snapshot. And `ProjectStore.save` clones synchronously (the
clone-on-save contract in the Consequences below), so a dispatch arriving
mid-save cannot corrupt the snapshot being written. The autosave separation also
keeps `storage/` free of any dependency on the bridge, preserving the layer
direction.

## Consequences

- Project files can be a folder on disk (best for git interop), an OPFS-only
  flow (works in all major browsers), or a `.house.zip` bundle (shareable). The
  user picks per project; switching is supported.
- A future cloud-sync implementation is additive: it plugs into the existing
  interfaces without consumer changes.
- The interface boundary is the right place to apply policies like multi-tab Web
  Locks coordination, quota observation, and autosave snapshots.
- Clone-on-save and clone-on-load is the reference contract every durable store
  inherits in spirit: a store returns owned copies, not live internal state. The
  `IndexedDbProjectStore` satisfies this through structured-clone serialization
  at the IndexedDB boundary.
- The typed `ProjectNotFoundError` lets bootstrap distinguish a genuinely new
  project from a broken one, so autosave never overwrites a recoverable project
  with an empty fallback.
- Splitting the boot decision (`selectProjectStoreBackend`, pure) from its
  construction (`resolveProjectStore`, thin async glue) keeps the
  OPFS-preferred-IndexedDB-fallback policy unit-tested without a browser, while the
  resolver and the OPFS/folder/zip constructors stay e2e-validated. No new ADR was
  needed for the seam because the decision is entirely in the pure rule.

## References

- Design specification, section 5 (Storage & persistence).
- ADR-0007 (asset references that flow through the same providers).
- ADR-0017 (the boundary fitness test that proves `storage -> core` is allowed
  and `core -> storage` is rejected).
- ADR-0019 (the editor session the autosave subscribes to for its change signal).
- ADR-0022 (the read-only capability-detection seam that informs provider choice).
- ADR-0028 (the flat `DirectoryPort` seam the folder, OPFS, and zip stores
  compose over).
- ADR-0029 (the pure migration framework the folder stores run on load).
- ADR-0030 (recent projects, multi-tab locks, and autosave snapshots layered
  beside this interface).
