---
slug: decisions/ADR-0030-additive-storage-capabilities
title: 'ADR-0030: Additive storage capabilities for recent projects, multi-tab locks, and autosave snapshots'
type: decision
tags: [architecture, storage, persistence, web-locks, indexeddb, autosave, recovery, multi-tab]
related:
  [
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0022-storage-capability-detection,
  ]
sourceFiles:
  [
    docs/specs/2026-06-04-project-stores-and-migrations.md,
    docs/plans/2026-06-04-project-stores-and-migrations.md,
    docs/plans/2026-06-06-project-save-open-recent.md,
    storage/recent/recent-project-store.ts,
    storage/recent/indexeddb-recent-project-store.ts,
    storage/recent/recent-projects.ts,
    storage/zip/bundle-filename.ts,
    storage/download/download-blob.ts,
    storage/locks/project-lock.ts,
    storage/locks/web-locks-manager.ts,
    storage/snapshots/snapshot-store.ts,
    bridge/autosave/create-autosave.ts,
    editor/shell/editor-shell.tsx,
    app/app.tsx,
    app/use-project-actions.ts,
    e2e/tests/durable-storage.spec.ts,
  ]
status: current
updated: 2026-06-06
---

# ADR-0030: Additive storage capabilities for recent projects, multi-tab locks, and autosave snapshots

## Status

Accepted, landed. Three small additive capabilities sit alongside the existing
`ProjectStore`: `RecentProjectStore` (`storage/recent/`), `ProjectLock` over a
`LockManagerPort` (`storage/locks/`), and `SnapshotStore`
(`storage/snapshots/`). Each is pure-over-a-fake for unit tests with a thin
browser adapter exercised by `e2e/tests/durable-storage.spec.ts`. Autosave
(`bridge/autosave/create-autosave.ts`) writes snapshots on debounce, an explicit
`commitProject` saves canonically and prunes, and the app shell
(`editor/shell/editor-shell.tsx`, wired in `app/app.tsx`) surfaces the recent
list and a crash-recovery prompt. The save/open/recent wiring that drives these
capabilities from the running app (the pure recent-ordering and upsert rules, the
`.house.zip` export download, the folder-open control, and per-project backend
routing) is recorded in the "Project save, open, and recent wiring" section below.

## Context

The design specification asks for recent-projects with a remembered per-project
backend (5.3), multi-tab safety so two tabs do not stomp one project (5.6), and
crash-recovery autosave snapshots (5.4). Section 5.1 sketches a richer,
handle-based store interface. The existing `ProjectStore` is the narrow, id-keyed
`list`/`load`/`save`/`delete` (ADR-0003), and three consumers already depend on
it unchanged: `createAutosave`, `loadOrCreateProject`, and the `app/`
composition root.

Reshaping `ProjectStore` to the handle-based sketch would break those consumers
for no behavioral gain. The behaviors the spec wants are orthogonal to opening a
project: knowing which projects were opened recently, coordinating tabs, and
keeping rolling snapshots are each their own concern.

## Decision

Treat the design spec's handle-based interface as illustrative, not literal.
Layer the three behaviors as separate small interfaces rather than folding them
into `ProjectStore`, which stays exactly as it was.

### RecentProjectStore: remembers the backend

`RecentProjectStore` (`storage/recent/recent-project-store.ts`) records
`{ id, name, backend, lastOpened }`, where `backend` is one of `opfs`,
`file-system-folder`, or `zip-bundle`, so reopening a project routes to the
backend it was opened with (design spec 5.3). `list` returns most-recent-first;
`record` upserts by id. The `InMemoryRecentProjectStore` fake clones entries on
record and on list (the clone-on-save ethos from ADR-0003) and backs the unit
tests; `IndexedDbRecentProjectStore` is the durable adapter validated end to end.

### ProjectLock over a LockManagerPort

`ProjectLock` (`storage/locks/project-lock.ts`) returns `owner` when the
exclusive lock is free and `read-only` when another holder has it (design
spec 5.6). It depends on a narrow `LockManagerPort` (`tryAcquire`/`release`) so
the unit tests inject an in-memory fake; the read-only signal is surfaced to the
consuming layer, which owns disabling commands. The browser adapter is
`WebLocksManager` (`storage/locks/web-locks-manager.ts`) over `navigator.locks`.

The Web Locks API holds a lock only for the duration of a callback, so to model
hold-until-release the adapter returns an unsettled promise from the lock
callback and keeps its resolver; `release()` resolves it. The load-bearing
subtlety: `release()` then awaits the original `navigator.locks.request` promise,
which settles only once the lock is actually freed. Resolving the held promise
alone is not enough, because Firefox frees the lock a task later than Chromium,
so an immediate re-acquire would otherwise still observe the lock as held. The
end-to-end lock sequence (`first` true, `second` false, `reacquired` true) pins
this.

### SnapshotStore: prune-on-save recoverability

`SnapshotStore` (`storage/snapshots/snapshot-store.ts`) keeps a rolling series of
timestamped snapshots plus a one-time session-start snapshot under
`.house-autosave/`, pure over a `DirectoryPort` (ADR-0028). It caps the rolling
series at `maxSnapshots` (default five) by dropping the oldest, restores the
newest (migrating it forward like any stored document, ADR-0029), and prunes.

Recoverability uses the prune-on-save model rather than a modification-time
comparison. The flat `DirectoryPort` exposes no mtime, and `writeHistory` is
deferred, so there is no timestamp to compare a snapshot against the canonical
file. Instead, an explicit save prunes all rolling snapshots, so a surviving
rolling snapshot is itself the signal of unsaved work after a crash:
`isRecoverable()` is simply "a rolling snapshot exists." This keeps recovery
detection a pure, fast, mtime-free check.

### Autosave and shell wiring

`createAutosave` gains an optional `snapshots` writer: when present, the debounced
fire calls `snapshots.writeSnapshot(session.getProject())` instead of
`store.save`, preserving the four-state `idle | pending | saved | error` status.
The exported `commitProject` helper performs an explicit save as `store.save`
then `snapshots.prune()`, in that order. When `snapshots` is absent the original
`store.save`-on-debounce behavior is kept, so existing consumers stay green.

The editor shell stays a pure view: it takes optional presentational props
(`recentProjects`, `onNewProject`, `onOpenRecent`, `onSave`, `onExportBundle`,
and a `recovery` object) and renders a project nav plus a recovery alert, with
absent handlers hiding their control and no storage imports. The `app/`
composition root builds the durable store, a `SnapshotStore`, and a
`RecentProjectStore`, wires the handlers, and surfaces the `recovery` prop when
`isRecoverable()` reports a recoverable snapshot on load.

## Project save, open, and recent wiring

The capabilities above were built and tested before the running app drove them. This
wiring connects them to the shell controls, with all decision logic extracted into pure
modules and the browser plumbing kept as thin glue.

### Pure recent-list rules

`storage/recent/recent-projects.ts` holds the two pure rules the app records against:

- `orderRecentProjects(entries)` returns the entries most-recently-opened first,
  de-duplicated by id with the newest occurrence winning. It builds a
  `Map<id, newest>` then sorts by `lastOpened` descending, and is non-mutating. This is
  the ordering the shell's recent list renders.
- `recentEntryFor({ id, name, backend, openedAt })` builds the upsert
  `RecentProjectEntry`, with `lastOpened` set from an injected `openedAt` for
  determinism (the app passes `Date.now()` at the call site, not inside the rule). Both
  the in-memory and IndexedDB `RecentProjectStore` implementations consume it unchanged.

### Export download and folder-open glue

`storage/zip/bundle-filename.ts` is the pure `bundleFilename(projectName)` rule:
lowercase the name, collapse unsafe character runs to single hyphens, trim edge
hyphens, fall back to a `project` stem when the slug is empty, and always end in
`.house.zip`. `storage/download/download-blob.ts` is the one DOM-touching helper
(`downloadBytes`), wrapping the bytes in a `Blob`, clicking a transient `<a download>`,
and revoking the object URL; it is kept inside `storage/` per the rule that platform
APIs are wrapped at a `storage/` seam (ADR-0001). The export action (`app/use-project-actions.ts`)
saves the live project into a `ZipBundleProjectStore`, calls `exportBundle()`, and feeds
the bytes and `bundleFilename(name)` to `downloadBytes`.

The folder-open control is Chromium-family only. `useOpenFolderAction` returns an
`onOpenFolder` handler only when `capabilities.fileSystemAccess` is true (so the shell
renders no inert control where the native picker is absent); the handler calls
`FileSystemFolderProjectStore.open(projectId, new DirectoryHandleStore())`, loads the
picked project, switches the session, and records a `file-system-folder` recent entry.

### Per-project backend routing of `onOpenRecent`

`onOpenRecent(id)` looks up the entry's recorded `backend`. A `file-system-folder`
entry routes through `FileSystemFolderProjectStore.reopen` (re-requesting permission),
falling back to the default store load when no stored handle exists or permission is
denied. Every other recorded backend (and an entry with no recorded backend) routes
through the default store load. This realizes the design spec's "reopen with the backend
the project was opened with" (5.3).

### The documented backend-memory edge

The recent-list `ProjectBackend` union has no `'indexeddb'` member, so the IndexedDB
default store cannot earn a recent entry. `defaultStoreBackend(capabilities)` therefore
returns `'opfs'` only when OPFS is the default and `null` for the IndexedDB default:
the IndexedDB default project stays the implicit current project and records nothing on
boot or save. As a corollary, a `.house.zip` bundle reopened from a recent entry has no
durable folder/OPFS handle to route back to, so it falls back to the default store load
rather than re-expanding the original bundle. Both edges are intentional and documented
in the source; the clean mapping is finalized when the create-time backend chooser
lands (see Deferrals).

## Consequences

- The existing `ProjectStore` and its three consumers are untouched, yet the app
  gains recent projects, multi-tab safety, and crash recovery.
- Each capability is unit-tested pure-over-a-fake; only the IndexedDB recent
  list, the Web Locks manager, and the OPFS-backed store are end-to-end-only,
  matching the ADR-0022 and ADR-0028 pattern.
- Recoverability is mtime-free by construction (prune-on-save), so it works over
  the flat `DirectoryPort` and does not block on the deferred `writeHistory`.
- Capabilities compose: a future surface (quota banner, take-ownership flow) adds
  another small interface rather than reopening `ProjectStore`.

### Deferrals

- `navigator.storage.persist()` on first save (design spec 5.8) is not yet wired;
  the capability probe stays read-only (ADR-0022) and no quota or eviction UI
  exists.
- Take-ownership UI for the read-only second tab, and async migration progress,
  are deferred. The read-only `LockOutcome` is produced but the command-disabling
  UI is the consuming layer's later job.
- `FileSystemFolderProjectStore` (the native folder picker and handle-permission
  reopen) is browser-only and validated manually; the OPFS store, IndexedDB
  recent list, and Web Locks manager are verified by `durable-storage.spec.ts`.
- A create-time backend chooser is deferred. The app picks the backend by capability
  for the default project and records whatever backend a project was opened with; until
  the chooser lands, the IndexedDB default records no recent entry and a reopened
  `.house.zip` falls back to the default load (the documented backend-memory edges
  above).
- A WebKit-compatible OPFS write path is deferred (design spec 5.10). The
  `FileSystemDirectory.writeFile` adapter uses main-thread `createWritable`, which
  WebKit does not support; a worker-side `createSyncAccessHandle` write path is the
  follow-up. OPFS save is verified end to end on Chromium and Firefox only.

## References

- Design specification, sections 5.3 (recent and backend memory), 5.4 (autosave
  snapshots), 5.6 (multi-tab locks), 5.8 (persistence request).
- Slice spec: `docs/specs/2026-06-04-project-stores-and-migrations.md`.
- Implementation plans: `docs/plans/2026-06-04-project-stores-and-migrations.md` (the
  internals) and `docs/plans/2026-06-06-project-save-open-recent.md` (the save/open/recent
  wiring recorded above).
- ADR-0028 (the `DirectoryPort` the snapshot store is pure over and the folder/OPFS
  stores the recent backends route to compose over).
- ADR-0029 (snapshots are migrated forward on restore like any stored document).
- ADR-0003 (the unchanged `ProjectStore` interface these capabilities sit beside, and
  the async-resolved durable store the running app now boots against).
- ADR-0019 (the editor session the autosave subscribes to for its change signal).
- ADR-0022 (the read-only capability probe the store-selection rule and the
  capability-gated folder-open control consume).
