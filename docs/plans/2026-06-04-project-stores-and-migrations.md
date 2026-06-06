# Project Stores, Persistence, and Migrations Implementation Plan

> **For agentic workers:** This plan is executed with the **project's** red-green-blue workflow, which overrides the generic subagent-driven-development sub-skill. Each cycle runs `/test-first <behavior>` (RED, the `test-author` agent), then `/implement` (GREEN, the `implementer` agent), then `/clean-code-review` followed by `/refactor` (BLUE, ending in a `refactor:` commit even when empty). The `test-author` and `implementer` never share files. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable, folder-shaped project storage (File System Access, OPFS, and `.house.zip`), recent-project and multi-tab plumbing, autosave sidecar snapshots with crash recovery, and a chained schema-and-registry migration framework, so a project round-trips `load -> save -> load` identically, including after a forward migration.

**Architecture:** All folder input/output goes through a small flat `DirectoryPort` seam with an in-memory fake, so the folder codec, zip codec, snapshots, migrations, recent-list, and locks are unit-tested; only thin `FileSystemDirectoryHandle`, IndexedDB, and Web Locks adapters are end-to-end-only (the ADR-0003/0022 pattern). The migration framework is pure `core/` code; atomicity and the pre-migration backup live in the store.

**Tech Stack:** TypeScript, Vitest (jsdom), Playwright (browser adapters), `fflate` (zip), the existing `ProjectStore`/`Project` types in `storage/` and `core/`.

**Authoritative inputs:** `docs/specs/2026-06-04-project-stores-and-migrations.md` (this slice), `docs/specs/2026-06-01-vernacular-design.md` sections 3.3, 3.4, 5; ADR-0003, ADR-0022.

---

## File structure

Created in `storage/`:

```
storage/fs/
  directory-port.ts              DirectoryPort interface + path helpers (joinPath, childName)
  in-memory-directory.ts         InMemoryDirectory (Map-backed) implementing DirectoryPort
  directory-contract.ts          reusable contract assertions for any DirectoryPort
  file-system-directory.ts       FileSystemDirectoryHandle adapter (end-to-end only)
storage/folder/
  project-json.ts                serialize/parse project.json bytes
  folder-project-store.ts        FolderProjectStore: single-folder codec + migrate-on-open + backup
storage/opfs/
  opfs-project-store.ts          OPFSProjectStore: id-namespaced ProjectStore over a DirectoryPort
storage/filesystem/
  file-system-folder-project-store.ts   single-project ProjectStore over a picked handle (e2e)
  directory-handle-store.ts      persist/retrieve a FileSystemDirectoryHandle in IndexedDB (e2e)
storage/zip/
  zip-codec.ts                   folder <-> .house.zip bytes via fflate
  zip-bundle-project-store.ts    ZipBundleProjectStore: single-project ProjectStore + import/export
storage/snapshots/
  snapshot-store.ts              sidecar snapshots over a DirectoryPort
storage/recent/
  recent-project-store.ts        RecentProjectStore interface + InMemoryRecentProjectStore fake
  indexeddb-recent-project-store.ts   IndexedDB adapter (e2e)
storage/locks/
  project-lock.ts                ProjectLock + LockManagerPort + in-memory fake
  web-locks-manager.ts           navigator.locks adapter (e2e)
```

Created in `core/`:

```
core/migrations/
  types.ts        SchemaMigration, RegistryMigration, errors, ProjectShape
  migrate.ts      migrateProject orchestrator
  schema/index.ts SCHEMA_MIGRATIONS (empty real chain today)
  registries/index.ts REGISTRY_MIGRATIONS (empty real chain today)
  index.ts        barrel
```

Modified: `storage/index.ts` (barrel), `core/index.ts` (barrel for migrations),
`bridge/autosave/create-autosave.ts` (snapshot-on-debounce), `app/app.tsx` (wiring),
`editor/shell/editor-shell.tsx` (UI), `package.json` (fflate), `ROADMAP.md` (one row + deferrals).

Each test file sits beside its source as `<name>.test.ts(x)`, per the existing convention.

---

## Conventions for every cycle

- RED: `/test-first "<behavior>"`. Run `pnpm exec vitest run <path>` (per memory: never `pnpm test -- <x>`). Expected: the new test fails to compile or asserts wrong, confirming RED.
- GREEN: `/implement`. Run the same `vitest run <path>`. Expected: PASS, with the rest of the suite still green (`pnpm test`).
- BLUE: `/clean-code-review` then `/refactor`. The refactor cycle always ends with a `refactor:` commit, even if it is an empty marker.
- Commit messages are Conventional Commits, no `Co-Authored-By`, no em-dashes, no milestone tags.

---

## Milestone A: the DirectoryPort seam

### Cycle A1: DirectoryPort contract and InMemoryDirectory

**Files:**

- Create: `storage/fs/directory-port.ts`, `storage/fs/in-memory-directory.ts`, `storage/fs/directory-contract.ts`
- Test: `storage/fs/in-memory-directory.test.ts`

**Contract to establish** (`directory-port.ts`):

```ts
/**
 * Flat, path-keyed async file surface. Paths use forward slashes and no leading
 * slash (for example `project.json`, `.house-autosave/snapshot-2026.json`,
 * `<id>/project.json`). The single seam that durable stores read and write
 * through, so the folder codec is testable against an in-memory fake.
 */
export interface DirectoryPort {
  /** Bytes at `path`, or undefined when no file exists there. */
  readFile(path: string): Promise<Uint8Array | undefined>
  /** Write bytes at `path`, creating parent directories as needed. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** Remove the file at `path`; a no-op when absent. */
  removeFile(path: string): Promise<void>
  /**
   * Immediate child segment names directly under directory `prefix`
   * (use `''` for the root). For keys `a/p.json`, `a/.house-autosave/x`,
   * `b/p.json`: list('') -> ['a','b']; list('a') -> ['p.json','.house-autosave'];
   * list('a/.house-autosave') -> ['x']. Order is not guaranteed.
   */
  list(prefix: string): Promise<string[]>
}
```

**Behavior to pin** (`in-memory-directory.test.ts`, via the shared `directory-contract.ts` helper exporting `assertDirectoryPortContract(makeEmpty: () => DirectoryPort)`):

- `readFile` of an absent path resolves to `undefined`.
- `writeFile` then `readFile` returns equal bytes; a second `writeFile` overwrites.
- Written bytes are isolated: mutating the caller's array after `writeFile`, or the returned array after `readFile`, does not change stored state (copy on write and on read).
- `removeFile` of an absent path does not throw; after removing, `readFile` is `undefined`.
- `list` returns immediate child names exactly as in the three examples above; `list('')` on an empty directory returns `[]`.

- [ ] RED `/test-first "InMemoryDirectory satisfies the DirectoryPort contract: absent reads are undefined, writes round-trip and are copy-isolated, removes are forgiving, and list returns immediate child names"`
- [ ] Run `pnpm exec vitest run storage/fs/in-memory-directory.test.ts`; expect FAIL (module/exports missing).
- [ ] GREEN `/implement`
- [ ] Run `pnpm exec vitest run storage/fs/in-memory-directory.test.ts`; expect PASS. Run `pnpm test`; expect all green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

---

## Milestone B: the migration framework (pure core/)

### Cycle B1: migrate types and the identity (empty-chain) path

**Files:**

- Create: `core/migrations/types.ts`, `core/migrations/migrate.ts`, `core/migrations/schema/index.ts`, `core/migrations/registries/index.ts`, `core/migrations/index.ts`
- Test: `core/migrations/migrate.test.ts`

**Contract to establish** (`types.ts`):

```ts
import type { SchemaVersion } from '../model/types'

/** A project document before validation; migrations operate structurally. */
export type ProjectShape = Record<string, unknown>

/** One forward schema migration from version `from` to `from + 1`. */
export interface SchemaMigration {
  readonly from: SchemaVersion
  migrate(project: ProjectShape): ProjectShape
}

/** A per-registry migration applied after the schema chain. */
export interface RegistryMigration {
  readonly registry: string
  readonly from: number
  migrate(project: ProjectShape): ProjectShape
}

/** No migration bridges a required step. Carries the version it stalled at. */
export class MigrationFailedError extends Error {
  constructor(
    public readonly fromVersion: number,
    options?: { cause?: unknown },
  ) {
    super(`No migration from schema version ${fromVersion}`, options)
    this.name = 'MigrationFailedError'
  }
}

/** The document is newer than this build can read. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public readonly fromVersion: number,
    public readonly targetVersion: number,
  ) {
    super(`Schema version ${fromVersion} is newer than supported ${targetVersion}`)
    this.name = 'UnsupportedSchemaVersionError'
  }
}
```

**Contract to establish** (`migrate.ts`):

```ts
import type { Project } from '../model/types'
import type { ProjectShape, SchemaMigration, RegistryMigration } from './types'

export interface MigrateOptions {
  /** Defaults to the real SCHEMA_MIGRATIONS chain (empty today). */
  schemaMigrations?: readonly SchemaMigration[]
  /** Defaults to the real REGISTRY_MIGRATIONS chain (empty today). */
  registryMigrations?: readonly RegistryMigration[]
  /** Defaults to CURRENT_SCHEMA_VERSION. */
  targetVersion?: number
}

/**
 * Migrate a parsed project document forward to the target schema version, then
 * apply per-registry migrations. Pure: returns a new object, never mutates the
 * input, and never touches storage. Throws UnsupportedSchemaVersionError when
 * the document is newer than the target, and MigrationFailedError when a step in
 * the chain is missing.
 */
export function migrateProject(raw: unknown, options?: MigrateOptions): Project
```

`schema/index.ts` exports `export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = []`.
`registries/index.ts` exports `export const REGISTRY_MIGRATIONS: readonly RegistryMigration[] = []`.

**Behavior to pin (B1):**

- A document already at `CURRENT_SCHEMA_VERSION` with the default (empty) chains is returned structurally equal to the input (deep equal), and the input object is not mutated.
- A document whose `meta.schemaVersion` is greater than the target throws `UnsupportedSchemaVersionError` carrying both versions.

- [ ] RED `/test-first "migrateProject returns a current-version project unchanged under empty chains and rejects a newer-than-supported schema version"`
- [ ] Run `pnpm exec vitest run core/migrations/migrate.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run `pnpm exec vitest run core/migrations/migrate.test.ts`; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle B2: chained schema migrations run in order with a gap error

**Files:** Modify `core/migrations/migrate.ts`; Test `core/migrations/migrate.test.ts`.

**Behavior to pin:** Given injected synthetic `schemaMigrations` `[{from:1,...},{from:2,...}]` and `targetVersion: 3`, a v1 document is transformed by the `from:1` migration then the `from:2` migration, in that order (assert by having each step append a breadcrumb to an array field and asserting `['v1->v2','v2->v3']`), and the result's `meta.schemaVersion` equals 3. With a missing step (no `from:2` provided but target 3), `migrateProject` throws `MigrationFailedError` with `fromVersion === 2`. Each migration receives the output of the previous one, never the original.

- [ ] RED `/test-first "migrateProject applies injected schema migrations in ascending order to the target and throws MigrationFailedError at the first missing step"`
- [ ] Run `pnpm exec vitest run core/migrations/migrate.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle B3: per-registry migrations run after the schema chain

**Files:** Modify `core/migrations/migrate.ts`; Test `core/migrations/migrate.test.ts`.

**Behavior to pin:** After the schema chain reaches the target, for each entry in `meta.registryVersions` the matching injected `registryMigrations` (keyed by `registry` and `from`) are applied in ascending `from` order, and `meta.registryVersions[registry]` is advanced. Assert with a synthetic registry `"finishes"` recorded at version 0, a `registryMigrations` entry `{registry:'finishes', from:0, ...}` that renames a field, and that the rename is visible only after the schema chain has run (order assertion via breadcrumb). A registry with no pending migration is left untouched.

- [ ] RED `/test-first "migrateProject applies per-registry migrations after the schema chain and advances each registry version"`
- [ ] Run `pnpm exec vitest run core/migrations/migrate.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.
- [ ] After B3, export the migration surface from `core/index.ts` as part of the GREEN/refactor work (`migrateProject`, the two error classes, `SchemaMigration`, `RegistryMigration`, `ProjectShape`).

---

## Milestone C: the folder codec and stores

### Cycle C1: project.json serialize and parse

**Files:** Create `storage/folder/project-json.ts`; Test `storage/folder/project-json.test.ts`.

**Contract to establish:**

```ts
import type { Project } from '../../core'

/** Pretty-printed (two-space) UTF-8 JSON bytes for project.json. */
export function serializeProjectJson(project: Project): Uint8Array
/** Parse project.json bytes into a raw document for migration. Throws on invalid JSON. */
export function parseProjectJson(bytes: Uint8Array): unknown
```

**Behavior to pin:** `parseProjectJson(serializeProjectJson(project))` deep-equals `project` for a representative project (one floor, one wall, populated meta). The serialized bytes decode to text containing a trailing newline and two-space indentation (assert the text starts with `{\n  "meta"`). `parseProjectJson` of non-JSON bytes throws.

- [ ] RED `/test-first "project.json serialize then parse round-trips a project and emits pretty two-space JSON"`
- [ ] Run `pnpm exec vitest run storage/folder/project-json.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle C2: FolderProjectStore load/save round-trip

**Files:** Create `storage/folder/folder-project-store.ts`; Test `storage/folder/folder-project-store.test.ts`.

**Contract to establish:**

```ts
import type { Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'

export interface FolderProjectStoreOptions {
  /** Defaults to migrateProject; injected in tests for synthetic chains. */
  migrate?: (raw: unknown) => Project
}

/**
 * Reads and writes one project folder (project.json at the directory root,
 * design spec 3.3) through a DirectoryPort. Single-project; OPFSProjectStore
 * composes one of these per id. Save clones the project so the caller cannot
 * mutate stored state (the clone-on-save contract from ADR-0003).
 */
export class FolderProjectStore {
  constructor(directory: DirectoryPort, options?: FolderProjectStoreOptions)
  /** Read project.json, run migrations, return the project. */
  loadProject(): Promise<Project>
  /** Write the canonical project.json. */
  saveProject(project: Project): Promise<void>
  /** True when a project.json exists. */
  exists(): Promise<boolean>
}
```

**Behavior to pin:** With an `InMemoryDirectory`, `saveProject(project)` then `loadProject()` returns a project deep-equal to the input at `CURRENT_SCHEMA_VERSION` (no migration). Mutating the saved project after `saveProject`, or the returned project after `loadProject`, does not change stored state. `exists()` is false before any save and true after. `loadProject()` on an empty directory throws `ProjectNotFoundError` (imported from `../project-store`).

- [ ] RED `/test-first "FolderProjectStore saves then loads a project identically over a DirectoryPort, clone-isolated, and throws ProjectNotFoundError when empty"`
- [ ] Run `pnpm exec vitest run storage/folder/folder-project-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle C3: pre-migration backup and atomicity

**Files:** Modify `storage/folder/folder-project-store.ts`; Test `storage/folder/folder-project-store.test.ts`.

**Behavior to pin:** Construct a `FolderProjectStore` whose injected `migrate` simulates an upgrade: seed the directory with a `project.json` whose `meta.schemaVersion` is 1 while the injected migrate targets a higher version.

- When `loadProject()` runs a migration (stored version below target), before applying it the store writes the original bytes verbatim to `.house-autosave/pre-migration-v1.json` (assert the backup file equals the original `project.json` bytes).
- When the injected `migrate` throws, `loadProject()` rejects (surfacing the error), the canonical `project.json` is unchanged (byte-equal to the seed), and the pre-migration backup still exists. No partial write.

- [ ] RED `/test-first "FolderProjectStore writes a pre-migration backup before migrating and leaves project.json intact when the migration throws"`
- [ ] Run `pnpm exec vitest run storage/folder/folder-project-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle C4: OPFSProjectStore id-namespacing (implements ProjectStore)

**Files:** Create `storage/opfs/opfs-project-store.ts`; Test `storage/opfs/opfs-project-store.test.ts`.

**Contract to establish:**

```ts
import type { Project } from '../../core'
import type { ProjectStore, ProjectSummary } from '../project-store'
import type { DirectoryPort } from '../fs/directory-port'

/**
 * Durable, multi-project ProjectStore. Each project lives under `<id>/` of the
 * given root directory (`<id>/project.json`). In the running app the root is the
 * OPFS directory; in tests it is an InMemoryDirectory, so all id-routing and the
 * folder codec are unit-tested. The thin OPFS root acquisition is the only
 * end-to-end concern (Cycle G2).
 */
export class OpfsProjectStore implements ProjectStore {
  constructor(root: DirectoryPort)
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
}
```

**Behavior to pin:** Over an `InMemoryDirectory` root: `save('a', pa)` and `save('b', pb)` create `a/project.json` and `b/project.json`; `list()` returns summaries `{id,name}` for both (name from `meta.name`); `load('a')` returns `pa` deep-equal and clone-isolated; `load('missing')` throws `ProjectNotFoundError`; `delete('a')` removes the `a/` subtree so `load('a')` then throws and `list()` no longer includes `a`.

- [ ] RED `/test-first "OpfsProjectStore stores each project under its id subdirectory and implements list, load, save, and delete with ProjectNotFoundError"`
- [ ] Run `pnpm exec vitest run storage/opfs/opfs-project-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

---

## Milestone D: the zip bundle

### Cycle D0 (setup, not a TDD cycle): add the fflate dependency

**Files:** Modify `package.json`, `pnpm-lock.yaml`.

- [ ] Confirm the candidate version satisfies the 15-day cooldown: `npm view fflate time --json` and pick the newest version whose publish date is on or before 2026-05-20 (21600 minutes before 2026-06-04). fflate 0.8.x predates this by years.
- [ ] `pnpm add fflate@<chosen-version>` (exact version, no caret drift beyond what the lockfile pins). The `.npmrc` `minimum-release-age` gate must pass; if it complains, pin older.
- [ ] Run `pnpm install --frozen-lockfile` to confirm the lockfile is consistent, then `pnpm typecheck`.
- [ ] Commit: `git add package.json pnpm-lock.yaml && git commit -m "build: add fflate for zip bundle storage"`.

### Cycle D1: zip codec folder round-trip

**Files:** Create `storage/zip/zip-codec.ts`; Test `storage/zip/zip-codec.test.ts`.

**Contract to establish:**

```ts
/** Logical folder contents keyed by forward-slash path, the DirectoryPort shape. */
export type FolderEntries = Map<string, Uint8Array>

/** Pack folder entries into .house.zip bytes (fflate, deflate). */
export function zipFolder(entries: FolderEntries): Uint8Array
/** Unpack .house.zip bytes back into folder entries. Throws on malformed input. */
export function unzipFolder(bytes: Uint8Array): FolderEntries
```

**Behavior to pin:** `unzipFolder(zipFolder(entries))` deep-equals `entries` for a map containing `project.json` (text bytes) and a nested `.house-autosave/snap.json` entry. An empty map round-trips to an empty map. `unzipFolder` of clearly non-zip bytes throws.

- [ ] RED `/test-first "zipFolder then unzipFolder round-trips folder entries including nested paths"`
- [ ] Run `pnpm exec vitest run storage/zip/zip-codec.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle D2: ZipBundleProjectStore import and export

**Files:** Create `storage/zip/zip-bundle-project-store.ts`; Test `storage/zip/zip-bundle-project-store.test.ts`.

**Contract to establish:**

```ts
import type { Project } from '../../core'
import type { ProjectStore, ProjectSummary } from '../project-store'

/**
 * Single-project ProjectStore backed by a .house.zip expanded into memory. The
 * bound id is fixed at construction; list returns the one project, and load/save
 * for a different id throw ProjectNotFoundError. exportBundle re-zips the working
 * folder for sharing (design spec 3.3).
 */
export class ZipBundleProjectStore implements ProjectStore {
  constructor(id: string)
  static fromBundle(id: string, bytes: Uint8Array): Promise<ZipBundleProjectStore>
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
  exportBundle(): Promise<Uint8Array>
}
```

**Behavior to pin:** A fresh `ZipBundleProjectStore('p')`: `save('p', project)` then `exportBundle()` yields bytes; `ZipBundleProjectStore.fromBundle('p', bytes)` then `load('p')` returns the project deep-equal (round-trip through a real `.house.zip`). `load('other')` throws `ProjectNotFoundError`. `list()` after a save returns one summary `{id:'p', name}`; before any save returns `[]`.

- [ ] RED `/test-first "ZipBundleProjectStore round-trips its single project through exportBundle and fromBundle and rejects a foreign id"`
- [ ] Run `pnpm exec vitest run storage/zip/zip-bundle-project-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

---

## Milestone E: capabilities (snapshots, recent, locks)

### Cycle E1: SnapshotStore write, prune, recover

**Files:** Create `storage/snapshots/snapshot-store.ts`; Test `storage/snapshots/snapshot-store.test.ts`.

**Contract to establish:**

```ts
import type { Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'

export interface SnapshotStoreOptions {
  /** Rolling snapshots kept besides the session-start snapshot. Default 5. */
  maxSnapshots?: number
  /** Injected for deterministic names and recovery comparison. Default Date.now. */
  now?: () => number
}

/**
 * Sidecar autosave snapshots in `.house-autosave/` (design spec 5.4). Keeps the
 * last `maxSnapshots` plus a session-start snapshot, detects when an autosave is
 * newer than the canonical project.json, and prunes on explicit save.
 */
export class SnapshotStore {
  constructor(directory: DirectoryPort, options?: SnapshotStoreOptions)
  writeSnapshot(project: Project): Promise<void>
  /** True when the newest snapshot is newer than project.json (or it is absent). */
  isRecoverable(): Promise<boolean>
  /** The newest snapshot as a project, or undefined when none exists. */
  restore(): Promise<Project | undefined>
  /** Remove all rolling snapshots (called on explicit save). */
  prune(): Promise<void>
}
```

**Behavior to pin (inject `now`):**

- Writing six snapshots with increasing `now` keeps at most five rolling snapshots plus a session-start snapshot (assert the count under `.house-autosave/` via `list`), and the oldest rolling snapshot is the one dropped.
- `isRecoverable()` is true when a snapshot's timestamp is newer than the `project.json` written time (model the canonical file by writing it through the same directory before/after snapshots), false when `project.json` is newer.
- `restore()` returns the newest snapshot's project deep-equal; `undefined` when none exist.
- `prune()` removes rolling snapshots so `restore()` returns `undefined` and `isRecoverable()` is false.

- [ ] RED `/test-first "SnapshotStore keeps five rolling snapshots plus session-start, detects a recoverable newer snapshot, restores the newest, and prunes"`
- [ ] Run `pnpm exec vitest run storage/snapshots/snapshot-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle E2: RecentProjectStore over an in-memory fake

**Files:** Create `storage/recent/recent-project-store.ts`; Test `storage/recent/recent-project-store.test.ts`.

**Contract to establish:**

```ts
export type ProjectBackend = 'opfs' | 'file-system-folder' | 'zip-bundle'

export interface RecentProjectEntry {
  id: string
  name: string
  backend: ProjectBackend
  lastOpened: number
}

export interface RecentProjectStore {
  /** Most-recently-opened first. */
  list(): Promise<RecentProjectEntry[]>
  /** Insert or update by id (upsert), refreshing lastOpened. */
  record(entry: RecentProjectEntry): Promise<void>
  remove(id: string): Promise<void>
}

/** Map-backed reference implementation for tests and the unwired shell. */
export class InMemoryRecentProjectStore implements RecentProjectStore {
  /* ... */
}
```

**Behavior to pin:** `record` then `list` returns the entry; recording the same id again updates name/backend/lastOpened rather than duplicating; `list` is ordered most-recent-first by `lastOpened`; `remove` drops the entry. The backend choice survives the round-trip.

- [ ] RED `/test-first "InMemoryRecentProjectStore upserts by id, lists most-recent-first, remembers the backend, and removes"`
- [ ] Run `pnpm exec vitest run storage/recent/recent-project-store.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle E3: ProjectLock over a LockManagerPort fake

**Files:** Create `storage/locks/project-lock.ts`; Test `storage/locks/project-lock.test.ts`.

**Contract to establish:**

```ts
/** Subset of the Web Locks API we depend on; the seam tests inject a fake. */
export interface LockManagerPort {
  /** Resolve true if the exclusive lock named `name` was acquired without waiting. */
  tryAcquire(name: string): Promise<boolean>
  release(name: string): Promise<void>
}

export type LockOutcome = 'owner' | 'read-only'

export interface ProjectLock {
  /** Owner when the lock was free, read-only when another tab holds it. */
  acquire(projectId: string): Promise<LockOutcome>
  release(projectId: string): Promise<void>
}

export function createProjectLock(manager: LockManagerPort): ProjectLock
```

**Behavior to pin (with a fake `LockManagerPort` that tracks held names):** the first `acquire('p')` resolves `'owner'`; a second `acquire('p')` while held resolves `'read-only'`; after `release('p')`, `acquire('p')` resolves `'owner'` again. Distinct ids do not contend.

- [ ] RED `/test-first "createProjectLock grants owner to the first acquirer and read-only to a second while held, then owner again after release"`
- [ ] Run `pnpm exec vitest run storage/locks/project-lock.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.
- [ ] During the refactor, extend `storage/index.ts` to barrel-export the new public surface from milestones A through E (DirectoryPort, InMemoryDirectory, OpfsProjectStore, ZipBundleProjectStore, SnapshotStore, RecentProjectStore + InMemoryRecentProjectStore + types, ProjectLock + types). Keep e2e-only adapters out of the barrel until their cycle lands.

---

## Milestone F: autosave and UI wiring

### Cycle F1: autosave writes snapshots; explicit save writes canonical and prunes

**Files:** Modify `bridge/autosave/create-autosave.ts`; Test `bridge/autosave/create-autosave.test.ts`.

**Design:** Add an optional `snapshots?: { writeSnapshot(project): Promise<void> }` to `AutosaveConfig`. When present, the debounced fire calls `snapshots.writeSnapshot(session.getProject())` instead of `store.save`, preserving the `pending`/`saved`/`error` status transitions. A new exported `commitProject(store, projectId, project, snapshots?)` helper performs the explicit save: `store.save` then `snapshots?.prune()`. Keep the existing `store.save`-on-debounce behavior when `snapshots` is absent, so current consumers and tests stay green.

**Behavior to pin:** With a fake snapshots object and a fake store, after a session change and the debounce elapses, `writeSnapshot` is called with the latest project and `store.save` is not; status goes `pending` then `saved`. `commitProject` calls `store.save` then `snapshots.prune()` in that order and resolves.

- [ ] RED `/test-first "autosave writes a snapshot on debounce when snapshots are provided, and commitProject saves canonically then prunes"`
- [ ] Run `pnpm exec vitest run bridge/autosave/create-autosave.test.ts`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`. Export `commitProject` from `bridge/index.ts` in the refactor.

### Cycle F2: editor-shell save/open/recent surface and recovery prompt

**Files:** Modify `editor/shell/editor-shell.tsx`, `editor/shell/editor-shell.css`; Test `editor/shell/editor-shell.test.tsx`.

**Design:** Extend `EditorShellProps` with optional, presentational props so the shell stays a pure view (no storage imports):

```ts
export interface EditorShellProps {
  saveStatus: AutosaveStatus
  recentProjects?: { id: string; name: string }[]
  onNewProject?: () => void
  onOpenRecent?: (id: string) => void
  onSave?: () => void
  onExportBundle?: () => void
  recovery?: { onRestore: () => void; onDiscard: () => void }
}
```

Render a `File` menu region (a `<nav aria-label="Project">` with buttons New, Save, Export bundle, and a recent-projects list) and, when `recovery` is set, a banner with Restore and Discard buttons. All handlers are optional; absent handlers hide their control. No `editor/plan/` or `core/scene/` imports.

**Behavior to pin (Testing Library):** New/Save/Export buttons call their handlers on click; the recent list renders one button per entry and calls `onOpenRecent(id)` with the right id; when `recovery` is provided a recovery alert appears and Restore/Discard call the handlers; when handlers are absent the controls are not rendered. The existing save-status assertions still hold.

- [ ] RED `/test-first "EditorShell renders New, Save, Export, a recent-projects list, and a recovery prompt, invoking each handler, and hides controls without handlers"`
- [ ] Run `pnpm exec vitest run editor/shell/editor-shell.test.tsx`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

### Cycle F3: app composition-root wiring

**Files:** Modify `app/app.tsx`; Test `app/app.test.tsx`.

**Design:** In the composition root, build the durable store (default `OpfsProjectStore` over the OPFS directory when available, falling back to the existing `createDefaultProjectStore()` otherwise), a `SnapshotStore`, a `RecentProjectStore`, and wire the shell handlers: New creates a fresh project and records a recent entry; Open recent loads by id; Save calls `commitProject`; Export bundle produces `.house.zip` bytes; on load, if the snapshot store reports `isRecoverable()`, pass a `recovery` prop. Keep `AppProps` injectable (`store?`, and now `recentProjects?`, `snapshots?`) so the test drives fakes. Preserve the existing degraded-storage warning and the `loadOrCreateProject` fallback.

**Behavior to pin:** With injected fakes, mounting the app loads the project and shows the shell; clicking Save invokes the injected store's `save`; a recoverable snapshot surfaces the recovery prompt and Restore loads the snapshot project. Existing app tests (loading state, error state) stay green.

- [ ] RED `/test-first "App wires Save to the store, exposes recent projects, and surfaces the recovery prompt when a snapshot is recoverable"`
- [ ] Run `pnpm exec vitest run app/app.test.tsx`; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

---

## Milestone G: browser adapters (end-to-end) and wrap-up

### Cycle G1: FileSystemDirectory adapter and FileSystemFolderProjectStore

**Files:** Create `storage/fs/file-system-directory.ts`, `storage/filesystem/file-system-folder-project-store.ts`, `storage/filesystem/directory-handle-store.ts`; e2e spec `e2e/tests/file-system-folder-store.spec.ts`.

**Design:** `FileSystemDirectory implements DirectoryPort` by recursively walking a `FileSystemDirectoryHandle` (getDirectoryHandle/getFileHandle with `{create:true}` on write, `removeEntry`, async iteration for `list`). `FileSystemFolderProjectStore implements ProjectStore` as a single-project store (bound id) composing a `FolderProjectStore` over a `FileSystemDirectory`, with `requestPermission()` re-prompt on open and a typed permission-denied error. `directory-handle-store` persists the handle in IndexedDB for reopen. These touch browser APIs absent in jsdom, so they are validated end to end, per ADR-0003.

**Behavior to pin (Playwright, OPFS-backed handle so it runs headless across browsers):** in-page, obtain a `FileSystemDirectoryHandle` (via `navigator.storage.getDirectory()`), construct the store, save a project, reload the page context, reopen, and assert the project round-trips. Assert the `DirectoryPort` contract subset against the real handle (write/read/list/remove).

- [ ] RED `/test-first "FileSystemFolderProjectStore round-trips a project through a real FileSystemDirectoryHandle across a reload"` (authored as a Playwright e2e spec)
- [ ] Run `pnpm build && pnpm e2e e2e/tests/file-system-folder-store.spec.ts` (or the project's e2e invocation); expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. `pnpm test` (unit) still green; `pnpm typecheck` green.
- [ ] BLUE `/clean-code-review` then `/refactor`.

> If the e2e harness cannot exercise a real handle headlessly for a given browser, record the gap in this plan and ROADMAP and keep the adapter behind the unit-tested `DirectoryPort` contract, rather than weakening the contract.

### Cycle G2: OPFS acquisition, IndexedDB recent-list, Web Locks adapters

**Files:** Create `storage/locks/web-locks-manager.ts`, `storage/recent/indexeddb-recent-project-store.ts`, and an OPFS root factory in `storage/opfs/opfs-project-store.ts` (e.g. `createOpfsProjectStore()` that builds a `FileSystemDirectory` from `navigator.storage.getDirectory()`); e2e spec `e2e/tests/opfs-recent-and-locks.spec.ts`.

**Behavior to pin (Playwright):** an `OpfsProjectStore` built from the real OPFS root saves and lists a project across a reload; `IndexedDbRecentProjectStore` records and lists across a reload; `WebLocksManager` grants the first holder and reports contention for a held name within the page. These mirror the existing `e2e/tests/storage-capabilities.spec.ts` style.

- [ ] RED `/test-first "OPFS-backed store, IndexedDB recent-list, and Web Locks adapter persist and coordinate across a reload"` (Playwright e2e spec)
- [ ] Run the e2e spec; expect FAIL.
- [ ] GREEN `/implement`
- [ ] Run; expect PASS. Unit suite and typecheck green.
- [ ] BLUE `/clean-code-review` then `/refactor`. Barrel-export the e2e adapters and the OPFS factory from `storage/index.ts`.

### Wrap-up (not TDD cycles)

- [ ] Update `ROADMAP.md`: add a single new MVP-path row `Project storage, persistence, and migrations` with status, and a short deferrals note (writeHistory/packsRequired meta, asset-folder generation, quota/eviction UI, async migration progress UI). Edit only this slice's row.
- [ ] Regenerate knowledge index if used: `pnpm knowledge:index`.
- [ ] Curate local ADRs with the `knowledge-curator`: ADR-0028 (DirectoryPort seam), ADR-0029 (migration framework), ADR-0030 (additive storage capabilities). Numbers 0026 and 0027 are reserved for the concurrent slices.
- [ ] Full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`.
- [ ] `pnpm rgb:audit` to confirm red-green-blue ordering and blue presence across the branch.
- [ ] `/review` to dispatch the `pr-reviewer` for the end-of-branch audit.

---

## Self-review notes

- **Spec coverage:** three stores (C4, D2, G1), save/open/recent plumbing (E2, F2, F3, G2), autosave sidecar snapshots and recovery (E1, F1, F2, F3), migration framework chained schema + per-registry + atomic + backup (B1, B2, B3, C3), multi-tab Web Locks (E3, G2), minimal shell UI (F2, F3), `fflate` (D0). Deferrals are listed in the spec and re-stated in the wrap-up.
- **Interface consistency:** `DirectoryPort` (readFile/writeFile/removeFile/list) is used unchanged by InMemoryDirectory (A1), FolderProjectStore (C2), OpfsProjectStore (C4), SnapshotStore (E1), and FileSystemDirectory (G1). `ProjectStore` (list/load/save/delete) is implemented by OpfsProjectStore, ZipBundleProjectStore, and FileSystemFolderProjectStore. `migrateProject` (B1) is the default `migrate` injected into FolderProjectStore (C2/C3). `ProjectNotFoundError` is reused, not redefined.
- **No placeholders:** every cycle names exact files, the contract code, the behavior to pin with concrete inputs/outputs, the exact run command, and the RGB command sequence.
