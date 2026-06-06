# Slice design: project stores, persistence, and the migration framework

Status: approved for planning (2026-06-04)
Scope owner: the project-stores-and-migrations slice (branch `feat/project-stores-and-migrations`)
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, sections 3.3, 3.4, and 5.

## 1. Purpose

Phase 1 needs projects that survive a reload. The foundation already ships the
`ProjectStore` interface, a Map-backed `InMemoryProjectStore`, a durable
`IndexedDbProjectStore`, read-only capability detection, and a debounced autosave
in the bridge. This slice adds the durable, folder-shaped storage the design
specification calls for, the recent-projects and multi-tab plumbing around it,
crash-recovery snapshots, and a schema-migration framework, so that a project can
be saved, reopened, migrated forward, and round-tripped without loss.

The behavioral contract this slice must satisfy: **`load -> save -> load`
round-trips a project identically**, including after a forward migration.

## 2. Goals and non-goals

### Goals

- `FileSystemFolderProjectStore`, `OPFSProjectStore`, and `ZipBundleProjectStore`,
  all implementing the existing `ProjectStore` interface.
- Save / open / recent plumbing, with the per-project backend choice remembered.
- Autosave sidecar snapshots in `.house-autosave/`, with crash recovery on open.
- A schema-migration framework in a new `core/migrations/`: chained schema
  migrations plus per-registry migrations, atomic, with a pre-migration backup.
- Multi-tab safety via the Web Locks API.
- A minimal but real save / open / recent surface in the editor shell.

### Non-goals (documented deferrals)

- `writeHistory` and `packsRequired` project-meta fields (design spec 3.4). They
  are absent from the shared `core/model/types.ts` `ProjectMeta`, and changing
  that schema requires coordinating with the concurrent topology and units
  slices. Deferred to a later coordinated schema migration. See section 9.
- Generation of `assets/`, `previews/`, `README.md`, and `ATTRIBUTIONS.md`. Asset
  embedding and provenance belong to the asset and pack slices. This slice
  reserves the folder layout but writes only `project.json` and `.house-autosave/`.
- Quota and eviction UI (design spec 5.8). This slice still requests
  `navigator.storage.persist()` on first save (cheap, and called for by 5.8), but
  builds no quota banner or eviction flow.
- Async-with-progress migration UI for very large projects (design spec 5.5). The
  framework runs synchronously; the progress surface is deferred.
- Ed25519 pack signing, DXF import, and cloud sync, all beyond this slice.

## 3. Constraints

- Stay within `storage/`, the new `core/migrations/`, the minimal save/open UI in
  `app/` and `editor/shell/`, and a small, intentional touch to
  `bridge/autosave/` (the existing debounce home). Do not touch `editor/plan/`,
  `core/scene/`, `core/geometry/`, `core/topology/`, or `core/units/`; those
  belong to concurrent slices.
- Do not change `core/model/types.ts` schema fields without coordination. This
  slice changes none.
- `core/` imports neither React nor Three.js (rule 1). `core/migrations/` is pure
  TypeScript.
- Browser storage APIs are used only inside `storage/` (rule 1, ADR-0003).
- The 15-day dependency cooldown applies to the one new dependency, `fflate`.
- Red-green-blue TDD per behavior, with the project subagents and commands.

## 4. Architecture

### 4.1 The `DirectoryPort` seam (`storage/fs/`)

jsdom implements neither OPFS, File System Access, IndexedDB, nor Web Locks, so
the foundation pattern (ADR-0003, ADR-0022) is: a thin browser adapter is
end-to-end-tested, and everything else sits behind an injectable seam and is
unit-tested. This slice routes all folder input/output through a small, flat,
path-keyed asynchronous port:

```ts
interface DirectoryPort {
  readFile(path: string): Promise<Uint8Array | undefined> // undefined when absent
  writeFile(path: string, bytes: Uint8Array): Promise<void> // creates parent dirs
  removeFile(path: string): Promise<void>
  list(prefix: string): Promise<string[]> // paths under a logical directory
}
```

Implementations:

- `InMemoryDirectory`, a `Map<string, Uint8Array>` backing the unit-test
  substrate and the buffer a zip bundle expands into.
- `FileSystemDirectory`, one thin recursive adapter over a
  `FileSystemDirectoryHandle`. Both OPFS (`navigator.storage.getDirectory()`) and
  a user-picked folder (`showDirectoryPicker()`) return a
  `FileSystemDirectoryHandle`, so OPFS and File System Access share this single
  adapter. This is the only new end-to-end-only code in the slice.

A flat path interface (rather than a hierarchical handle tree) is chosen because
the project-folder layout is naturally path-addressed (`project.json`,
`assets/<hash>`, `.house-autosave/<snapshot>`), the in-memory fake is trivial,
and the recursive walk to and from a hierarchical handle is confined to the one
adapter.

### 4.2 The folder codec and the three stores

The project-folder read/write logic lives once, in a `FolderProjectStore` that
operates purely over a `DirectoryPort` and is therefore fully unit-tested. It:

- writes the canonical `project.json` (pretty-printed, git-diffable, design
  spec 3.3),
- reads and parses `project.json` on load, runs migrations (section 4.3), and
  returns the resulting `Project`,
- owns the `.house-autosave/` sidecar directory.

The three named stores are thin compositions over that logic:

- **`OPFSProjectStore`** keeps many projects under the OPFS root, one
  subdirectory per id (`/<id>/project.json`). It satisfies the id-keyed
  `ProjectStore` (`list`/`load`/`save`/`delete`) and becomes the running app's
  default durable store, replacing `IndexedDbProjectStore` over time.
- **`FileSystemFolderProjectStore`** is bound to a single user-picked
  `FileSystemDirectoryHandle` and represents one project. The handle is persisted
  in IndexedDB; `handle.requestPermission()` is re-requested on reopen (design
  spec 5.7). A mid-session permission loss surfaces a recovery path rather than
  failing silently.
- **`ZipBundleProjectStore`** expands a `.house.zip` into an `InMemoryDirectory`,
  runs the same folder codec, and re-zips on export. The zip codec wraps `fflate`
  inside `storage/zip/` and is unit-tested over byte fixtures.

The existing narrow `ProjectStore` interface (`list`/`load`/`save`/`delete` by
id) is kept as is. Recent-list, locking, and snapshots are layered as separate,
additive capability interfaces rather than reshaped into `ProjectStore`. This
honors the "build against the existing interface" constraint and keeps the
already-wired consumers (`createAutosave`, `loadOrCreateProject`, `app.tsx`)
working unchanged. The richer handle-based interface sketched in design
spec 5.1 is treated as illustrative, not literal; the additive capabilities
provide the same behaviors (`listRecent`, `acquireLock`, watch-equivalent) without
a breaking interface change.

### 4.3 The migration framework (`core/migrations/`, pure TypeScript)

```
core/migrations/
  types.ts        Migration, RegistryMigration, MigrationResult, errors
  schema/         chained schema migrations, keyed by source version
  registries/     per-registry rename and deprecation tables, by registry name
  migrate.ts      orchestrator: schema chain, then registry migrations, then validate
  index.ts        barrel
```

- `migrateProject(raw)` is pure: it takes parsed JSON and returns a migrated
  `Project`, or throws. It reads `schemaVersion` and `registryVersions`, runs the
  schema chain `vN -> vN+1 -> ... -> CURRENT_SCHEMA_VERSION`, then applies
  per-registry migrations, then asserts the result is at the current version.
- Atomicity and the pre-migration backup live in the store, not in `core/`,
  because `core/` cannot touch storage. On load, the store writes
  `.house-autosave/pre-migration-v<n>.json` before calling the pure migrate. If
  migration throws, the canonical `project.json` is never rewritten, so the
  original survives intact and the failure surfaces with a report-bug path
  (design spec 5.5). A typed `MigrationFailedError` carries the backup path.
- `CURRENT_SCHEMA_VERSION` is `1` today with no prior version, so the framework
  ships with an empty real schema chain and an identity baseline. Chaining,
  atomicity, and backup behavior are proven with synthetic fixture migrations in
  the tests, so the shared `core/model/types.ts` is never touched. `load -> save
-> load` round-trips identically at v1.

### 4.4 Recent projects, multi-tab safety, snapshots (`storage/`)

Three small additive capabilities, each pure-over-a-fake for unit tests with a
thin browser adapter for end-to-end coverage:

- **`RecentProjectStore`** (IndexedDB): records `{ id, name, backend, lastOpened,
handleRef? }` and remembers the per-project backend choice (design spec 5.3).
  The File System Access handle is stored here for reopen.
- **`ProjectLock`** over the Web Locks API behind a `LockManagerPort` (in-memory
  fake for units): the first tab owns the project; a second tab is offered
  read-only or take-ownership (design spec 5.6). Read-only mode is a signal the
  app surfaces; command disabling is the consuming layer's job.
- **`SnapshotStore`**: rolling sidecar snapshots in `.house-autosave/` (the last
  five plus a session-start snapshot), `isRecoverable()` (an autosave newer than
  `project.json`), `restore()`, and prune-on-explicit-save. Pure over a
  `DirectoryPort`, so fully unit-tested.

### 4.5 Autosave and UI wiring

- The debounced autosave stays in `bridge/autosave/`. The one intentional change:
  the debounced fire writes a snapshot through `SnapshotStore`, while an explicit
  Save writes the canonical `project.json` and prunes snapshots (design
  spec 5.4). This preserves the existing four-state status surface.
- A minimal but real surface in `editor/shell/`: New, Open recent, Save, Save As
  (pick a folder or export a `.house.zip`), plus a crash-recovery prompt on open
  when a snapshot is newer than the canonical file. It is wired through the `app/`
  composition root. No `editor/plan/` or `core/scene/` changes.

## 5. Data flow

Open: composition root resolves capabilities, picks or is handed a store,
acquires the project lock, reads `project.json`, runs migrations (backing up
first if needed), checks for a newer snapshot and prompts to recover, then hands
the `Project` to the editor session.

Edit: dispatches mutate the session; autosave debounces and writes a snapshot.

Save: explicit Save writes canonical `project.json`, prunes snapshots, updates
the recent-projects entry, and requests storage persistence on first save.

Export: `ZipBundleProjectStore` serializes the working folder to `.house.zip`.

## 6. Error handling

- Typed errors continue the `ProjectNotFoundError` precedent. `MigrationFailedError`
  carries the backup path; permission and quota faults are typed so the UI can
  offer a concrete next action (re-grant, save a copy to OPFS).
- One concern per `try`. Recoverable errors surface with an action, never a
  silent fallback that could overwrite a recoverable project (the
  `loadOrCreateProject` invariant from ADR-0003 is preserved).

## 7. Testing strategy

- The bulk of coverage is unit tests over pure logic: the migration framework,
  the folder codec over `InMemoryDirectory`, the zip codec over byte fixtures,
  snapshot pruning and recovery detection, the recent-list over a fake, and the
  lock over a `LockManagerPort` fake. Each behavior follows red-green-blue.
- Thin browser adapters (`FileSystemDirectory` over real handles, OPFS root
  acquisition, the IndexedDB recent-list, `navigator.locks`) are exercised by
  Playwright end-to-end specs, following the ADR-0003 precedent that
  jsdom-unavailable seams are validated end to end. Some adapter coverage may be
  staged across follow-on cycles; any deferral is recorded in the plan.

## 8. Behavior list for red-green-blue

Each item is one or more red-green-blue cycles:

1. `InMemoryDirectory` satisfies the `DirectoryPort` contract.
2. `FolderProjectStore` writes and reads back `project.json` over a
   `DirectoryPort` (round-trip identity at v1).
3. The migration orchestrator runs an empty chain as identity, and a synthetic
   multi-step chain in order.
4. Per-registry migrations apply after the schema chain.
5. The store takes a pre-migration backup and leaves the original intact when a
   migration throws (atomicity).
6. `OPFSProjectStore` namespaces many projects by id over a `DirectoryPort`.
7. The zip codec round-trips a folder through `.house.zip`; `ZipBundleProjectStore`
   imports and exports.
8. `SnapshotStore` writes, prunes to five plus session-start, and detects a
   recoverable snapshot.
9. `RecentProjectStore` records and lists, remembering the backend choice
   (over a fake).
10. `ProjectLock` grants the first owner and offers read-only to the second
    (over a fake).
11. Autosave writes snapshots; explicit Save writes canonical and prunes.
12. The shell save/open/recent surface and the crash-recovery prompt.
13. Thin adapters (`FileSystemDirectory`, OPFS acquisition, IndexedDB recent-list,
    Web Locks) validated end to end.

## 9. Deferrals (tracked)

- `writeHistory` and `packsRequired` meta fields: add later via a coordinated
  schema migration once the shared model is stable. Recorded in ROADMAP.
- `assets/`, `previews/`, `README.md`, `ATTRIBUTIONS.md` generation: asset and
  pack slices.
- Quota and eviction UI; async migration progress UI; Ed25519 signing; DXF
  import; cloud sync.

## 10. Knowledge graph (local ADRs, numbers 0028 onward)

- ADR-0028: project-folder storage via the `DirectoryPort` seam (the abstraction
  that makes the folder, OPFS, File System Access, and zip stores unit-testable).
- ADR-0029: the schema and registry migration framework (chained, atomic,
  pre-migration backup, pure core with storage-side atomicity).
- ADR-0030: additive storage capabilities (recent projects, Web Locks multi-tab
  safety, autosave sidecar snapshots) layered on the existing `ProjectStore`.

Numbers 0026 and 0027 are reserved for the concurrent topology and units slices.
ADRs are curated locally after the relevant change lands.
