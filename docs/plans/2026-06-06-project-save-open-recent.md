# Project Save, Open, and Recent Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` authors its test independently from the behavior description plus the public signatures in this plan, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/async-boot wiring, browser download and picker glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract.

**Goal:** Make the durable project stores that already exist actually drive the running app. Switch the running app to a real durable store chosen by an async boot probe (OPFS when available, IndexedDB otherwise), wire the export-to-`.house.zip` browser download and the native folder-picker open path into the shell controls that already exist, and complete the recent-project list so opening and saving record an entry, the list is ordered most-recent-first with no duplicates, and reopening routes to the backend the project was opened with. All decision logic (store selection, recent-list ordering and dedupe, the project-name-to-download-filename rule, the recovery decision) is extracted into pure, unit-tested modules; the async-boot, download, and picker plumbing are thin glue validated by the existing end-to-end specs.

**Architecture:** The store internals are built and verified (see Scope boundary). This slice adds a small set of pure decision modules and the glue that consumes them. `storage/select-project-store.ts` turns a `StorageCapabilities` record plus a `ProjectBackend` preference into the backend the app should construct (a pure rule). `storage/recent/recent-projects.ts` holds the pure ordering-and-dedupe rule and the upsert-entry builder that the in-memory and IndexedDB `RecentProjectStore` implementations already satisfy, so the app records consistently. `storage/zip/bundle-filename.ts` turns a project name into a safe `.house.zip` download filename. The `app/` composition root grows an async boot step (`resolveProjectStore`) that probes capabilities once, constructs the chosen durable store (the OPFS construction is already async via `createOpfsProjectStore()`), and hands it to the existing `useProjectBoot`. A thin `storage/download/` blob-download helper and a folder-picker open path wire the already-present `onExportBundle` shell control and a new open path to `ZipBundleProjectStore.exportBundle()` and `FileSystemFolderProjectStore.open()`. No store internals, no migration internals, and no `core/model/types.ts` schema change land here.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React with React Testing Library, Vitest for units, Playwright for the browser-only adapters. No new dependencies (the only new dependency in the storage work, `fflate`, already landed). **No `core/model/types.ts` change and no schema migration:** every backend, recent-list, export, and open path is fully specifiable against the current `Project`, `ProjectMeta`, `ProjectBackend`, and `StorageCapabilities` surfaces. The `writeHistory` and `packsRequired` meta fields are a coordinated shared-schema change explicitly deferred (see Open questions).

**Authoritative inputs:** `docs/specs/2026-06-04-project-stores-and-migrations.md` (the slice that built the internals), `docs/specs/2026-06-01-vernacular-design.md` sections 3.3, 3.4, 5.1 through 5.8; `docs/plans/2026-06-04-project-stores-and-migrations.md` (the internals plan whose module names and public APIs this slice reuses unchanged); ADR-0003, ADR-0022, ADR-0028, ADR-0029, ADR-0030.

---

## Scope boundary (design specification sections 3.3, 3.4, 5.1 through 5.8, 10 Phase 1; this is slice 11 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 11: project save, open, recent, and store wiring**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 through 5 are done; slice 6 (wall editing) and others are concurrent. This slice depends on the store internals that landed under `docs/plans/2026-06-04-project-stores-and-migrations.md`.

### Already built (the store internals; this slice does NOT re-plan them)

The durable folder, OPFS, and `.house.zip` stores, the migration framework, autosave sidecar snapshots with crash recovery, the recent-project list store, and Web Locks multi-tab safety are **built and tested**; the OPFS, IndexedDB recent, and Web Locks adapters are verified end to end in Chromium and Firefox. Concretely, these exist with the public APIs this slice reuses unchanged:

- `storage/fs/`: the flat `DirectoryPort` seam, `InMemoryDirectory`, `SubdirectoryPort`, and the `FileSystemDirectory` browser adapter (ADR-0028).
- `storage/folder/`: `FolderProjectStore` (the `project.json` codec, migrate-on-load, and pre-migration backup) and `parseProjectJson` / `readProjectName`.
- `storage/opfs/`: `OpfsProjectStore` (id-namespaced) and the async `createOpfsProjectStore()` browser factory over `navigator.storage.getDirectory()`.
- `storage/zip/`: the `fflate` zip codec and `ZipBundleProjectStore` with `static fromBundle(id, bytes)` and `exportBundle(): Promise<Uint8Array>`.
- `storage/filesystem/`: `FileSystemFolderProjectStore` with `static open(id, handles)` (native picker) and `static reopen(id, handles)` (permission re-prompt), plus `DirectoryHandleStore` (handle persistence in IndexedDB).
- `storage/recent/`: the `RecentProjectStore` interface, `RecentProjectEntry` (`{ id, name, backend, lastOpened }`), the `ProjectBackend` union (`'opfs' | 'file-system-folder' | 'zip-bundle'`), the `InMemoryRecentProjectStore` fake, and the `IndexedDbRecentProjectStore` adapter.
- `storage/snapshots/`: `SnapshotStore` (`writeSnapshot`, `isRecoverable`, `restore`, `prune`).
- `storage/locks/`: `createProjectLock`, the `LockManagerPort`, the `LockOutcome` union, and the `WebLocksManager` adapter.
- `bridge/autosave/`: `createAutosave` (snapshot-on-debounce) and `commitProject` (canonical save then prune).
- `storage/storage-capabilities.ts`: `probeStorageCapabilities()` resolving `StorageCapabilities` (`{ opfs, indexedDb, fileSystemAccess }`), `isStorageDegraded`, `summarizeStorageCapabilities` (ADR-0022).
- The shell already renders the `Project` nav (`New`, `Save`, `Export bundle`, the recent-projects list) and the crash-recovery prompt as optional presentational props (`editor/shell/editor-shell.tsx`), and `app/app.tsx` already wires recent entries, the recovery prompt, autosave snapshots, `onSave` (via `commitProject`), `onOpenRecent`, and `onNewProject`.

### In scope for slice 11 (the remaining wiring; matches the ROADMAP "deferred with intent" follow-up list)

- **Switch the running app default to a real durable store via async-boot wiring.** `app/app.tsx` today defaults to `createDefaultProjectStore()` (the IndexedDB store). This slice adds a pure store-selection rule (`storage/select-project-store.ts`) and an async boot step in `app/` that probes capabilities once, constructs the chosen store (OPFS when available, IndexedDB otherwise), and feeds it to the existing `useProjectBoot`, preserving the loading and error states.
- **The `.house.zip` export browser-download control.** The shell already has an `onExportBundle` button; this slice wires it through a pure download-filename rule (`storage/zip/bundle-filename.ts`) and a thin browser blob-download helper (`storage/download/`) to `ZipBundleProjectStore.exportBundle()`.
- **The native folder-picker open control in the shell.** Add an `onOpenFolder` shell control and the glue that calls `FileSystemFolderProjectStore.open(id, handles)` (Chromium-family only; absent when `fileSystemAccess` is false), records a `file-system-folder` recent entry, and switches the session to the picked project.
- **The recent-project list UI completion.** Wire opening and saving to `record()` a recent entry, surface a pure most-recent-first, duplicate-free ordering rule (`storage/recent/recent-projects.ts`) plus the upsert-entry builder, and remember the per-project backend so `onOpenRecent` routes through the right store (`opfs`, `file-system-folder`, or `zip-bundle`).

### Out of scope for slice 11, deferred with intent (also recorded in `ROADMAP.md`; see Open questions for the dependency-blocked ones)

- **The `writeHistory` and `packsRequired` project-meta fields (design spec 3.4).** A coordinated shared-schema change on `core/model/types.ts` `ProjectMeta`, which concurrent model and migration slices also touch. Deferred to a coordinated schema migration. See Open questions (a).
- **A WebKit-compatible OPFS write path (design spec 5.10).** The current `FileSystemDirectory.writeFile` uses main-thread `createWritable`, which WebKit does not support; a worker-side `createSyncAccessHandle` write path is needed. Deferred. See Open questions (b).
- **Generation of `assets/`, `previews/`, and `ATTRIBUTIONS.md` (design spec 3.3).** Owned by the asset and pack work; this slice writes only `project.json` and `.house-autosave/`, exactly as the internals already do. See Open questions (c).
- **Quota and eviction UI, `navigator.storage.persist()` on first save, and the async-with-progress migration surface (design spec 5.5, 5.8).** Deferred. See Open questions (d).
- **The take-ownership multi-tab flow (design spec 5.6).** `ProjectLock` already produces the `read-only` outcome; the read-only banner and command-disabling UI, and the take-ownership prompt, are a later editing-surface concern, consistent with the ADR-0030 deferral. This slice does not add lock UI.
- **Backend choice at creation time (design spec 5.3).** This slice picks the backend by capability for the default project and records whatever backend a project was opened with; a create-time backend chooser UI is later polish.
- **Ed25519 pack signing, DXF import, and cloud sync,** all beyond Phase 1.

**Acceptance for slice 11:** `selectProjectStoreBackend` chooses `opfs` when OPFS is available, `indexeddb` otherwise, and honors an explicit per-project backend preference; `orderRecentProjects` returns entries most-recent-first with no duplicate ids; `recentEntryFor` builds an upsert entry carrying the right id, name, backend, and a fresh `lastOpened`; `bundleFilename` turns a project name into a safe `<slug>.house.zip` filename and falls back for an empty or unsafe name; the running app boots against the selected durable store with the loading and error states preserved; clicking Export bundle downloads a `.house.zip` produced by `ZipBundleProjectStore.exportBundle()`; the folder-picker open path opens a picked project on Chromium-family browsers and is hidden where File System Access is absent; opening or saving records a recent entry and `onOpenRecent` routes through the recorded backend. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the wall-drawing and durable-storage end-to-end specs still pass.

---

## File structure

New and modified files, grouped by responsibility. Pure modules carry testable behavior and an RGB triple; React, async-boot, download, and picker glue are marked `(infra)` and stay coverage-excluded (jsdom implements neither OPFS, File System Access, IndexedDB, nor a real DOM download), validated by the existing end-to-end specs.

```
storage/
  select-project-store.ts                  (create)        selectProjectStoreBackend (pure rule)
  select-project-store.test.ts              (create)
  recent/recent-projects.ts                 (create)        orderRecentProjects, recentEntryFor (pure)
  recent/recent-projects.test.ts            (create)
  zip/bundle-filename.ts                     (create)        bundleFilename (pure rule)
  zip/bundle-filename.test.ts                (create)
  download/download-blob.ts                  (create, infra) downloadBytes browser helper (anchor + object URL)
  index.ts                                   (modify, infra) barrel: export the new pure surfaces and the helper

app/
  resolve-project-store.ts                   (create, infra) async boot: probe + construct the chosen durable store
  app.tsx                                    (modify, infra) async store resolution; wire export, open-folder, recording
  app.test.tsx                               (modify)        boot-against-selected-store and recording behaviors (fakes)

editor/shell/
  editor-shell.tsx                           (modify, infra) add the Open folder control (onOpenFolder prop)
  editor-shell.test.tsx                      (modify)        the Open folder control behavior (Testing Library)

e2e/tests/
  durable-storage.spec.ts                    (modify, infra) export-download and folder-open paths where adapters allow

ROADMAP.md                                   (modify, infra) mark slice 11 done; record deferrals
```

There is **no** barrel under `editor/shell/` or `app/`; modules import directly from sibling files and from the `storage` / `bridge` / `core` barrels, matching the house convention. `selectProjectStoreBackend`, `orderRecentProjects`, `recentEntryFor`, and `bundleFilename` carry the testable behavior; `resolve-project-store.ts`, the `app.tsx` wiring, the shell control wiring, and `download-blob.ts` are coverage-excluded glue. The `app.test.tsx` and `editor-shell.test.tsx` additions exercise the wiring with injected fakes (no real browser APIs), consistent with the existing tests in those files.

The store-selection rule yields a small discriminated `ProjectStoreBackend` value (`'opfs' | 'indexeddb' | 'file-system-folder' | 'zip-bundle'`) that the async boot glue maps to the concrete already-built store constructor. The pure rule never imports a store class, so it stays a `core`-free, `storage`-internal decision that is trivially unit-tested.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// storage/select-project-store.ts
import type { StorageCapabilities } from './storage-capabilities'
import type { ProjectBackend } from './recent/recent-project-store'

/** The durable backend the running app should construct, before instantiation. */
export type ProjectStoreBackend = 'opfs' | 'indexeddb' | ProjectBackend

export interface SelectProjectStoreOptions {
  /** A remembered per-project backend (from a recent entry), when reopening. */
  preferred?: ProjectBackend
}

/**
 * Pure rule: pick the durable backend to construct from the detected
 * capabilities and an optional remembered preference. With a `preferred`
 * backend whose capability is present, returns it; otherwise prefers OPFS when
 * available, then IndexedDB, with no third durable fallback (the degraded-storage
 * warning already covers a host that offers neither, ADR-0022). Never throws.
 */
export function selectProjectStoreBackend(
  capabilities: StorageCapabilities,
  options?: SelectProjectStoreOptions,
): ProjectStoreBackend

// storage/recent/recent-projects.ts
import type { RecentProjectEntry, ProjectBackend } from './recent-project-store'

/** Most-recently-opened first, de-duplicated by id (newest occurrence wins). */
export function orderRecentProjects(entries: readonly RecentProjectEntry[]): RecentProjectEntry[]

export interface RecentEntryInput {
  id: string
  name: string
  backend: ProjectBackend
  /** Injected for determinism; defaults to Date.now at the call site, not here. */
  openedAt: number
}

/** Build the upsert entry recorded when a project is opened or saved. */
export function recentEntryFor(input: RecentEntryInput): RecentProjectEntry

// storage/zip/bundle-filename.ts
/**
 * A safe `.house.zip` download filename derived from a project name: lowercased,
 * spaces and unsafe characters collapsed to single hyphens, trimmed, with a
 * fixed fallback stem when the name yields an empty slug. Always ends in
 * `.house.zip`.
 */
export function bundleFilename(projectName: string): string

// storage/download/download-blob.ts  (infra; browser-only)
/** Trigger a browser download of `bytes` as `filename` via an object URL. */
export function downloadBytes(bytes: Uint8Array, filename: string): void

// app/resolve-project-store.ts  (infra; browser-only)
import type { ProjectStore } from '../storage'
/** Probe capabilities once and construct the selected durable ProjectStore. */
export function resolveProjectStore(): Promise<ProjectStore>
```

`ProjectBackend` is single-sourced in `storage/recent/recent-project-store.ts` (already exported) and reused by `selectProjectStoreBackend`, `recentEntryFor`, and the recent-list glue, so the backend union never diverges. `StorageCapabilities` comes from `storage/storage-capabilities.ts` unchanged. `RecentProjectEntry` comes from the existing recent-store module unchanged. No `core/model/types.ts` change, no migration.

---

## Section A: the store-selection rule (`storage/select-project-store.ts`)

### Task A1: `selectProjectStoreBackend` picks the durable backend from capabilities and a preference

**Files:**

- Create: `storage/select-project-store.ts`
- Test: `storage/select-project-store.test.ts`

**Behavior under test (`selectProjectStoreBackend(capabilities, options?)`):** A pure rule that maps a `StorageCapabilities` record (`{ opfs, indexedDb, fileSystemAccess }`) and an optional remembered `preferred` backend to the `ProjectStoreBackend` the app should construct. When no preference is given, it returns `'opfs'` if `capabilities.opfs` is true, otherwise `'indexeddb'` if `capabilities.indexedDb` is true, otherwise `'opfs'` as the universal target the degraded-storage warning already covers (a host with neither is the ADR-0022 degraded case, surfaced separately, not this rule's concern). When `options.preferred` is given and the capability backing it is present (`'opfs'` needs `opfs`, `'file-system-folder'` needs `fileSystemAccess`, `'zip-bundle'` is always constructible since it expands into memory), the rule returns the preferred backend; when the preferred backend's capability is absent, the rule falls back to the no-preference order. The rule never throws and imports no store class. Cover: OPFS-capable host with no preference returns `'opfs'`; OPFS-absent IndexedDB-only host returns `'indexeddb'`; a `'file-system-folder'` preference on a File-System-Access-capable host returns `'file-system-folder'`; a `'file-system-folder'` preference on a host without File System Access falls back to `'opfs'`; a `'zip-bundle'` preference returns `'zip-bundle'` regardless.

- [ ] **Step 1 (RED):** `/test-first` importing `selectProjectStoreBackend` and `ProjectStoreBackend` from `./select-project-store`, constructing `StorageCapabilities` literals and exercising the cases above. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `ProjectStoreBackend` type, `SelectProjectStoreOptions`, and `selectProjectStoreBackend`: resolve the preferred backend's required capability, return it when satisfied, otherwise apply the OPFS-then-IndexedDB order. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Avoid a nested ternary (`no-nested-ternary`) across the preference-then-default branches; name the capability-for-backend lookup so the rule reads as English. Name no magic strings beyond the backend union members. Keep the function within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

---

## Section B: recent-project ordering and entry building (`storage/recent/recent-projects.ts`)

### Task B1: `orderRecentProjects` orders most-recent-first and de-duplicates by id

**Files:**

- Create: `storage/recent/recent-projects.ts`
- Test: `storage/recent/recent-projects.test.ts`

**Behavior under test (`orderRecentProjects(entries)`):** Returns a new array of the input `RecentProjectEntry` values sorted by `lastOpened` descending (most-recent-first), with at most one entry per `id` (the occurrence with the newest `lastOpened` wins when an id appears more than once). The input array is not mutated. Cover: three distinct ids returned newest-first; two entries sharing an id collapse to one (the newer `lastOpened`); an empty input returns an empty array; the input array is unchanged after the call. This is the pure rule the app uses to render the recent list deterministically even if the underlying store (the IndexedDB adapter) returns rows in insertion order.

- [ ] **Step 1 (RED):** `/test-first` importing `orderRecentProjects` from `./recent-projects` and `RecentProjectEntry` from `./recent-project-store`, asserting newest-first order, id de-duplication, the empty case, and input immutability. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `orderRecentProjects`: collapse by id keeping the newest `lastOpened`, then sort descending into a fresh array. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the dedupe-then-sort readable and non-mutating; name the comparator. Commit `refactor:` (empty marker if no change).

### Task B2: `recentEntryFor` builds the upsert entry recorded on open and save

**Files:**

- Modify: `storage/recent/recent-projects.ts`
- Test: `storage/recent/recent-projects.test.ts`

**Behavior under test (`recentEntryFor(input)`):** Builds a `RecentProjectEntry` from `{ id, name, backend, openedAt }`, carrying the id, name, and backend through unchanged and setting `lastOpened` to `openedAt` (the caller injects the timestamp so the test is deterministic; the app passes `Date.now()`). The result satisfies the `RecentProjectEntry` shape the existing `RecentProjectStore.record` upserts by id. Cover: a built entry has the given id, name, backend, and `lastOpened === openedAt`; building two entries with the same id and different `openedAt` yields entries that `orderRecentProjects` collapses to the newer one (composes with Task B1). This is the single place the app constructs a recent entry, so opening through any backend records consistently.

- [ ] **Step 1 (RED):** `/test-first` importing `recentEntryFor` and asserting the field pass-through and the `lastOpened === openedAt` rule, plus the compose-with-`orderRecentProjects` case. Verify it fails because `recentEntryFor` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `RecentEntryInput` and `recentEntryFor` as a small structural builder. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the builder a one-liner mapping; confirm it does not call `Date.now()` itself (determinism stays at the caller). Commit `refactor:` (empty marker if no change).

---

## Section C: the bundle download filename (`storage/zip/bundle-filename.ts`)

### Task C1: `bundleFilename` turns a project name into a safe `.house.zip` filename

**Files:**

- Create: `storage/zip/bundle-filename.ts`
- Test: `storage/zip/bundle-filename.test.ts`

**Behavior under test (`bundleFilename(projectName)`):** Produces the download filename for an exported bundle: lowercase the name, replace any run of whitespace or characters outside a safe set (`[a-z0-9]`) with a single hyphen, trim leading and trailing hyphens, and append `.house.zip`. When the name yields an empty slug (an empty string, whitespace only, or only unsafe characters), use a fixed fallback stem (for example `project`) so the result is always a usable filename. Cover: `'My House'` -> `'my-house.house.zip'`; a name with punctuation and double spaces collapses to single hyphens with no leading or trailing hyphen; an empty or whitespace-only name yields the fallback stem plus `.house.zip`; an all-unsafe name (for example only slashes) yields the fallback. Name the fallback stem and the suffix as module constants (`no-magic-numbers` / no inline magic strings).

- [ ] **Step 1 (RED):** `/test-first` importing `bundleFilename` from `./bundle-filename` and asserting the slugging, the collapse-and-trim rule, and the fallback for an empty or unsafe name. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `bundleFilename`: normalize, slug, trim, fall back when empty, and append the suffix constant. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Name the safe-character regex, the fallback stem, and the suffix as constants; keep the function within `max-lines-per-function` and free of a nested ternary. Commit `refactor:` (empty marker if no change).

---

## Section D: glue and wiring (infrastructure)

### Task D1: the browser blob-download helper (`storage/download/download-blob.ts`) (infrastructure)

**Files:**

- Create: `storage/download/download-blob.ts`
- Modify: `storage/index.ts` (barrel)

This is controller-authored browser glue with no RGB triple (jsdom has no real anchor-driven download). The filename decision lives in the pure `bundleFilename` (Task C1); this helper only performs the DOM download. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Implement `downloadBytes(bytes, filename)`.** Wrap the bytes in a `Blob`, create an object URL, click a transient `<a download>` element, and revoke the URL. This is the only place in the slice that touches `URL.createObjectURL` and a synthetic anchor click, kept inside `storage/` per the rule that browser storage and platform APIs are wrapped at a `storage/` seam (ADR-0001, rule 1). Keep it a single small function.
- [ ] **Step 2: Barrel the new pure surfaces and the helper.** In `storage/index.ts`, export `selectProjectStoreBackend` and `ProjectStoreBackend` (Task A1), `orderRecentProjects`, `recentEntryFor`, and `RecentEntryInput` (Tasks B1, B2), `bundleFilename` (Task C1), and `downloadBytes` (this task), joining the existing storage exports.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm lint && pnpm format:check`. Expected: all green; `eslint .` at zero problems; `download-blob.ts` stays coverage-excluded glue.
- [ ] **Step 4:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task D2: the async store-resolution boot step (`app/resolve-project-store.ts`) (infrastructure)

**Files:**

- Create: `app/resolve-project-store.ts`

This is controller-authored async-boot glue with no RGB triple (it constructs real browser-backed stores). All of its decision logic lives in the pure `selectProjectStoreBackend` (Task A1); this task only constructs the chosen already-built store. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Probe once and select.** `resolveProjectStore()` calls `probeStorageCapabilities()` once, passes the result to `selectProjectStoreBackend` (no preference for the default project), and switches on the result.
- [ ] **Step 2: Construct the chosen store.** For `'opfs'`, `await createOpfsProjectStore()` (already async, building a `FileSystemDirectory` over `navigator.storage.getDirectory()`). For `'indexeddb'`, return `createDefaultProjectStore()` (the existing IndexedDB store, the universal fallback). The `'file-system-folder'` and `'zip-bundle'` backends are not constructed at default boot (they need a user gesture, handled by the open and export glue in Tasks D3 and D4), so the default-boot switch covers only `'opfs'` and `'indexeddb'`; an unexpected value falls back to `createDefaultProjectStore()` so boot never fails.
- [ ] **Step 3: Keep the seam thin.** No probing logic, no selection branching beyond the construct-from-backend switch lives here; the rule is the pure module. This makes `resolveProjectStore` a coverage-excluded constructor that the end-to-end specs exercise against the real OPFS root.
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm lint`. Expected: green; `resolve-project-store.ts` coverage-excluded.
- [ ] **Step 5:** Reviewed by `/clean-code-review`; commit `build:`.

### Task D3: wire async store resolution into the app boot (`app/app.tsx`) (infrastructure, with a behavior test)

**Files:**

- Modify: `app/app.tsx`
- Test: `app/app.test.tsx`

The app's wiring is glue, but `app.test.tsx` already drives the composition root with injected fakes, so this task carries a behavior assertion exercised with React Testing Library and injected fakes (no real browser APIs). Reviewed by `/clean-code-review` and pinned by the test below.

**Behavior under test (the app boots against an asynchronously resolved store):** The app keeps the injectable `store?` prop (so tests inject a fake `ProjectStore`); when no `store` is provided, it resolves one asynchronously through `resolveProjectStore()` before booting the project, showing the existing loading state until the store and project are ready, and the existing error state when resolution or load fails. With an injected fake store, mounting the app loads the project and shows the shell exactly as today. Cover (with injected fakes): an injected store boots synchronously into the shell as today; the existing loading and error states still render. The async default-resolution path itself (no injected store) is glue exercised end to end, not unit-tested, because it constructs a real browser store.

- [ ] **Step 1 (RED):** `/test-first` for the injected-store boot and the preserved loading/error states, asserting the app no longer requires `createDefaultProjectStore()` synchronously at mount but still boots immediately when a `store` is injected. Verify it fails (the current `useMemo(() => providedStore ?? createDefaultProjectStore())` resolves synchronously and would need to change to await the async resolver for the no-store path). Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the change: when `providedStore` is present use it as today; otherwise resolve the store via `resolveProjectStore()` inside the boot effect (extending `useProjectBoot` or a sibling resolver hook) and hold it in state, keeping the `loading` view until it resolves and surfacing the `error` view on rejection. Preserve `projectId`, the autosave wiring, the recent-and-recovery wiring, and the degraded-storage warning unchanged. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `app.tsx` functions within `max-lines-per-function`; the async resolution belongs in a small hook or the existing boot effect, not inlined into the render. Commit `refactor:` (empty marker if no change).

### Task D4: wire the Export bundle download (`app/app.tsx`) (infrastructure)

**Files:**

- Modify: `app/app.tsx`

This is controller-authored glue with no RGB triple; the filename rule (Task C1), the export bytes (`ZipBundleProjectStore.exportBundle()`, already built), and the download helper (Task D1) carry the logic. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Add the `onExportBundle` handler.** In `useProjectActions`, add an `onExportBundle` callback that builds a `ZipBundleProjectStore` for the current `projectId`, saves the current `session.getProject()` into it, calls `exportBundle()` for the bytes, and passes those bytes plus `bundleFilename(project.meta.name)` to `downloadBytes`. The shell already renders the `Export bundle` button when `onExportBundle` is supplied, so passing this handler through `EditorWorkspace` to `EditorShell` lights it up.
- [ ] **Step 2: Pass the handler to the shell.** Thread `onExportBundle` from `useProjectActions` into the `EditorShell` props alongside the existing `onSave` / `onOpenRecent` / `onNewProject`.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm lint && pnpm format:check`. Expected: green. The wall-drawing end-to-end spec is unaffected (the export control is an additive button that the wall-drawing flow does not click).
- [ ] **Step 4:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task D5: the Open folder shell control and open path (`editor/shell/editor-shell.tsx` + `app/app.tsx`) (infrastructure, with a shell behavior test)

**Files:**

- Modify: `editor/shell/editor-shell.tsx`
- Test: `editor/shell/editor-shell.test.tsx`
- Modify: `app/app.tsx`

The shell control is a small DOM addition with its own Testing Library test; the app-side open path is glue (the native picker is browser-only). Reviewed by `/clean-code-review` and pinned by the shell test.

**Behavior under test (the shell renders an Open folder control):** `ProjectControls` gains an optional `onOpenFolder?: () => void` prop; when supplied, the `Project` nav renders an `Open folder` button that calls `onOpenFolder` on click; when absent, the button is not rendered (mirroring the existing optional-handler pattern for `New` / `Save` / `Export bundle`). Cover (Testing Library): with `onOpenFolder` provided, the button renders and click invokes it once; without it, no `Open folder` button appears; the existing controls and the save-status assertions still hold.

- [ ] **Step 1 (RED):** `/test-first` for the `Open folder` control: present-and-clicked invokes `onOpenFolder`, absent hides the button, and the existing shell assertions stay green. Verify it fails because `onOpenFolder` is not an accepted prop. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `onOpenFolder` prop on `ProjectControlsProps` and the gated `Open folder` button in the `Project` nav. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `ProjectControls` within `max-lines-per-function`; the new button follows the existing optional-handler shape exactly. Commit `refactor:` (empty marker if no change).
- [ ] **Step 4 (app glue):** In `app/app.tsx`, supply `onOpenFolder` only when `fileSystemAccess` is available (read from the one-time capability probe; do not render the control on hosts without the native picker, design spec 5.3 names it a Chromium-family path). The handler calls `FileSystemFolderProjectStore.open(projectId, new DirectoryHandleStore())`, switches the session to the loaded project, and records a `file-system-folder` recent entry (Task D6). The native picker, permission flow, and `DirectoryHandleStore` are already built; this only invokes them. Reviewed by `/clean-code-review`; commit `build:`.

### Task D6: record recent entries on open and save, route open by backend (`app/app.tsx`) (infrastructure)

**Files:**

- Modify: `app/app.tsx`

This is controller-authored glue with no RGB triple; the ordering and entry-building logic live in the pure `orderRecentProjects` / `recentEntryFor` (Tasks B1, B2). Reviewed by `/clean-code-review`.

- [ ] **Step 1: Record on save and open.** When `onSave` commits and when a project is opened (boot, `onOpenRecent`, `onNewProject`, the folder open path), `record` a recent entry built with `recentEntryFor({ id: projectId, name: project.meta.name, backend, openedAt: Date.now() })`, where `backend` is the backend the project is currently on (`'opfs'` or `'indexeddb'` for the default store, `'file-system-folder'` for the picked-folder path). Map the default store's `ProjectStoreBackend` to the recent-list `ProjectBackend` (treat the `'indexeddb'` default store as the universal entry; the recent-list `ProjectBackend` union is `opfs | file-system-folder | zip-bundle`, so the boot path records `'opfs'` only when the OPFS store was selected, and otherwise omits a recent entry for the IndexedDB default since it is the implicit current project, OR records under a single agreed backend; pin this mapping in the glue, see Open questions on backend memory).
- [ ] **Step 2: Order the rendered list.** In `useRecentProjectsAndRecovery`, pass the store's `list()` result through `orderRecentProjects` before mapping to `{ id, name }` for the shell, so the rendered list is deterministically most-recent-first and duplicate-free regardless of the adapter's row order.
- [ ] **Step 3: Route `onOpenRecent` by backend.** Resolve the recorded entry's `backend` and route the open through the matching already-built store: `'opfs'` through the resolved OPFS store, `'file-system-folder'` through `FileSystemFolderProjectStore.reopen(id, handles)` (re-requesting permission; on `undefined` surface the recovery path the store already returns rather than failing silently, design spec 5.7), `'zip-bundle'` through a re-import. Keep the existing default-store load as the fallback when no recorded backend is present.
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. Expected: green; `app.tsx` stays coverage-excluded glue except the boot-behavior test in Task D3; the recent-list ordering is pinned by Task B1's unit test. The wall-drawing and durable-storage end-to-end specs are unaffected (recording is additive).
- [ ] **Step 5:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task D7: extend the durable-storage end-to-end spec for export and folder-open (infrastructure)

**Files:**

- Modify: `e2e/tests/durable-storage.spec.ts`

This is controller-authored end-to-end coverage with no RGB triple; it validates the browser-only paths the unit tests cannot reach. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Cover the async-resolved OPFS boot.** Assert that on a browser with OPFS, the app boots against the OPFS-backed store (a project saved through the app survives a reload), exercising the Task D2 async resolution against the real OPFS root, mirroring the existing durable-storage assertions.
- [ ] **Step 2: Cover the export download where the harness allows.** Assert that clicking `Export bundle` produces a `.house.zip` download whose filename matches `bundleFilename` for the project name; use Playwright's download event with an explicit wait-for-event, never a timing `sleep`. If a given browser cannot observe the synthetic-anchor download headlessly, record the gap in this plan and `ROADMAP.md` and keep the export logic behind the unit-tested `bundleFilename` plus the manual-verification note, rather than weakening the assertion.
- [ ] **Step 3: Note the folder-open and WebKit gaps.** The native folder picker needs a user gesture Playwright cannot synthesize headlessly, so the folder-open path stays manually verified (consistent with the existing `FileSystemFolderProjectStore` note). Record that the WebKit OPFS write path is still pending (Open questions (b)), so WebKit durable-storage coverage stays read-path-only until the worker write path lands.
- [ ] **Step 4: Verify.** Run the durable-storage spec on the available browsers; expected pass on Chromium and Firefox, with any WebKit or download-observation gaps recorded here and in `ROADMAP.md`. Reviewed by `/clean-code-review`; commit `test:` (or `build:` if it is harness wiring).

### Task D8: roadmap update (infrastructure, final task, after the code lands)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 11 done and record its deferrals.** Flip the slice-11 row from `pending` to `done`, update the current-status sentence to include slice 11, update the "Project stores, persistence, and migrations" MVP-path row note to reflect that the running app now boots against the selected durable store with save / open / recent and the export and folder-open controls wired, and move the remaining deferrals (`writeHistory` / `packsRequired` meta, the WebKit OPFS write path, `assets/` / `previews/` / `ATTRIBUTIONS.md` generation, quota and eviction UI, the async migration progress surface, and the take-ownership multi-tab flow) into the slice-11 deferral block, cross-referencing the Open questions in this plan. Add a "Slice 11 (done) scope and deferrals" block mirroring the slice-4 and slice-5 voice.
- [ ] **Step 2: Verify.** `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task D9: knowledge curation (post-merge, controller-run)

- [ ] Skip during the slice. After the section-level work lands and merges, the controller runs the `knowledge-curator` to refresh the storage ADRs for this wiring: ADR-0003 (the running app now boots against the async-resolved durable store, OPFS-preferred, IndexedDB fallback) and ADR-0030 (the recent-list ordering rule, the export-download and folder-open controls, and the per-project backend routing), plus a note on the pure store-selection, recent-ordering, and bundle-filename rules added beside the existing capabilities. Cross-link ADR-0022 (the capability probe the selection rule consumes) and ADR-0028 (the `DirectoryPort` the OPFS store composes over). No new ADR number is required if the existing ones absorb the wiring; add one only if the async-boot store-selection seam warrants its own record. No `docs/specs/` change is required because this implements behavior the specification already mandates (sections 5.1 through 5.8). Regenerate the local index with `pnpm knowledge:index` and run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Open questions pending dependencies

These decisions cannot be finalized within this slice because each is blocked on work owned elsewhere or on a coordinated cross-slice change. Each lists the question, the dependency, the provisional assumption this plan proceeds on, and the follow-up that finalizes it. They are dependency-blocked deferrals, not placeholders: the slice ships fully working save / open / recent and store wiring under the provisional assumptions, and a later round revisits each.

**(a) The `writeHistory` and `packsRequired` project-meta fields are a coordinated shared-schema change.**

- **Question:** Should this slice add `writeHistory` (a short rolling log of recent saves) and `packsRequired` to `core/model/types.ts` `ProjectMeta` (design spec 3.4), with the schema migration to populate them, or defer?
- **Dependency:** `ProjectMeta` is shared with the concurrent model and migration-owning slices; changing it requires a coordinated schema bump and a migration entry in the (currently empty) `core/migrations/schema/` chain, touching code other slices also touch. The `SnapshotStore` recoverability is already deliberately `writeHistory`-free (prune-on-save, ADR-0030), so this slice does not need `writeHistory` to function.
- **Provisional assumption:** **Defer, do not drive the schema change from this slice.** This slice changes no `core/model/types.ts` field and adds no migration. Save / open / recent work fully against today's `ProjectMeta`.
- **Follow-up:** A coordinated round with the model and migration owners adds both fields as a single `vN -> vN+1` schema migration once the shared model is otherwise stable; at that point the export path can begin appending to `writeHistory` and the open path can begin checking `packsRequired`. This plan recommends that change be its own slice (or a coordination ticket), not folded in here, to keep the schema bump atomic and reviewable.

**(b) The WebKit-compatible OPFS write path.**

- **Question:** How does the OPFS store write on WebKit, where the main-thread `FileSystemWritableFileStream` (`createWritable`) the current `FileSystemDirectory.writeFile` uses is unsupported?
- **Dependency:** WebKit supports OPFS writes only through a worker-side `createSyncAccessHandle`. Adding that path means a storage worker, a message protocol between the main thread and the worker, and a `DirectoryPort` adapter variant that routes writes through the worker, all behind the existing seam. It is a substantial adapter, owned by the storage-internals follow-up, not by UI wiring.
- **Provisional assumption:** The async-boot store selection still prefers OPFS on WebKit (reads work), but the write path is the existing main-thread adapter, so durable writes on WebKit remain unverified until the worker path lands. End-to-end durable-storage coverage stays Chromium and Firefox; WebKit stays read-path-only (Task D7 step 3 records this).
- **Follow-up:** A storage-internals round adds the worker-side `createSyncAccessHandle` `DirectoryPort` adapter and extends `durable-storage.spec.ts` to verify WebKit writes. The pure store-selection rule in this slice already routes to OPFS, so that round is purely an adapter swap behind the seam with no consumer change.

**(c) Generation of `assets/`, `previews/`, and `ATTRIBUTIONS.md`.**

- **Question:** Should the export and save paths generate the `assets/`, `previews/`, and `ATTRIBUTIONS.md` parts of the project-folder layout (design spec 3.3)?
- **Dependency:** Those directories carry embedded asset bytes, generated thumbnails, and license attributions, all owned by the asset and pack work (design spec sections 4 and 3.3). They cannot be generated before assets exist in a project, and there are no assets in the Phase 1 plan editor yet.
- **Provisional assumption:** The export and save paths write only `project.json` and `.house-autosave/`, exactly as the already-built `FolderProjectStore` and `ZipBundleProjectStore` do. The folder layout reserves the other directories but this slice writes none of them.
- **Follow-up:** The asset and pack slices add `assets/` embedding, `previews/` generation, and the auto-generated `ATTRIBUTIONS.md` and `README.md` to the codec; the export path picks them up automatically because it repacks the whole working directory.

**(d) Quota and eviction UI, persistence request, and the async-with-progress migration surface.**

- **Question:** Should this slice add the quota and eviction UI, the `navigator.storage.persist()` first-save request (design spec 5.8), and the async-with-progress migration surface for large projects (design spec 5.5)?
- **Dependency:** The quota and eviction UI depends on the asset-cache LRU and `navigator.storage.estimate()` polling that the asset work owns; the async migration progress surface depends on a long-running migration that does not exist yet (the real schema chain is empty today, ADR-0029); the persistence request is cheap but pairs naturally with the quota UI that surfaces its outcome.
- **Provisional assumption:** None of these ship in this slice. The migration framework runs synchronously (correct for the empty real chain), no quota banner or eviction flow exists, and `navigator.storage.persist()` is not yet called (the capability probe stays read-only, ADR-0022).
- **Follow-up:** A later round wires `navigator.storage.persist()` on first save and builds the quota and eviction UI alongside the asset-cache work, and adds the async-with-progress migration surface when a migration heavy enough to need it exists. A secondary open item this slice surfaces but does not resolve: the recent-list `ProjectBackend` union has no `'indexeddb'` member, so the default IndexedDB store has no natural recent-list backend tag; Task D6 records the default project under the OPFS-or-implicit-current convention, and the clean mapping (whether to add an `'indexeddb'` backend member or treat the default store as the implicit current project) is finalized when the create-time backend chooser UI lands.

---

## Self-review

**Behavior coverage:** Every behavior maps to a task. The store-selection rule (OPFS-preferred, IndexedDB fallback, preference-honoring) is Task A1; the recent-list ordering (most-recent-first, id-deduplicated, non-mutating) is Task B1; the recent-entry builder is Task B2; the bundle-filename rule (slug, collapse, trim, fallback) is Task C1. The browser download helper is the infrastructure Task D1; the async store-resolution boot step is Task D2; wiring async resolution into the app boot (with the injected-store boot and preserved loading/error behavior test) is Task D3; the export download wiring is Task D4; the Open folder shell control (with its Testing Library test) plus the app open path is Task D5; recording recent entries on open and save and routing the open by backend is Task D6; the end-to-end coverage extension is Task D7; the roadmap update is Task D8; knowledge curation is the post-merge Task D9.

**Pure-versus-glue honesty:** The four pure modules carry the real decisions and each gets an RGB triple: store selection (A1), recent ordering and entry building (B1, B2), and the download filename (C1). Everything else is genuinely glue that jsdom cannot meaningfully unit-test: the async-boot store construction (D2), the DOM blob download (D1), the native folder picker (D5 app step), and the recording-and-routing wiring (D6) all construct or invoke real browser-backed stores and platform APIs, so they are coverage-excluded and validated by the existing and extended end-to-end specs (D7). Two glue tasks still carry a focused behavior test because the surface is testable with injected fakes and no browser APIs: the app boot (D3, injected-store path and loading/error states) and the shell Open folder control (D5, a pure DOM button). This split matches the ADR-0003 / ADR-0022 / ADR-0028 precedent the internals already follow.

**Type-name consistency:** The public names are spelled identically across every task and the contract block: `selectProjectStoreBackend`, `ProjectStoreBackend`, `SelectProjectStoreOptions`, `orderRecentProjects`, `recentEntryFor`, `RecentEntryInput`, `bundleFilename`, `downloadBytes`, and `resolveProjectStore`. `ProjectBackend`, `RecentProjectEntry`, `StorageCapabilities`, `ProjectStore`, `Project`, `createOpfsProjectStore`, `createDefaultProjectStore`, `ZipBundleProjectStore`, `FileSystemFolderProjectStore`, `DirectoryHandleStore`, `commitProject`, `probeStorageCapabilities`, and the existing shell props (`onSave`, `onOpenRecent`, `onNewProject`, `onExportBundle`, `recentProjects`, `recovery`) are reused exactly as the internals and shell already define them. `ProjectBackend` is single-sourced in `storage/recent/recent-project-store.ts`; `selectProjectStoreBackend`, `recentEntryFor`, and the routing glue all consume that one union.

**No store-internals re-planning:** This plan adds only the four pure decision modules, one download helper, one async-boot resolver, the shell Open folder control, and the `app.tsx` wiring. It constructs and invokes the already-built `OpfsProjectStore` / `createOpfsProjectStore`, `ZipBundleProjectStore.exportBundle`, `FileSystemFolderProjectStore.open` / `reopen`, `RecentProjectStore`, `SnapshotStore`, `ProjectLock`, `createAutosave`, and `commitProject` without changing any of them. No `DirectoryPort`, folder codec, migration, snapshot, recent-store, or lock internal is reopened.

**Back-compatibility and acceptance:** The `EditorShellProps` gains one optional `onOpenFolder` prop, so every existing shell call site and test compiles unchanged. `app.tsx` keeps its injectable `store?` / `recentProjects?` / `snapshots?` props, so the existing app tests stay green; the only behavioral change is that a missing `store` now resolves asynchronously through `resolveProjectStore()` (preserving the loading and error states). No `core/model/types.ts` change and no schema migration, so the concurrent model, units, and migration slices are untouched. The functional wall-drawing and durable-storage end-to-end specs are preserved: the new controls are additive and the default viewport, tools, and dispatch paths are unchanged. At acceptance the running app boots against the selected durable store, Export bundle downloads a `bundleFilename`-named `.house.zip`, the folder-open control opens a picked project on Chromium-family browsers and is hidden elsewhere, opening or saving records a most-recent-first deduplicated recent entry, and `onOpenRecent` routes through the recorded backend, with the full check chain green, `eslint .` at zero problems, and `rgb:audit` clean.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders. Every behavior task names the signature under test and the concrete cases; every infrastructure step is a concrete wiring instruction; the Open questions are explicit dependency-blocked deferrals each carrying a provisional assumption and a finalizing follow-up. No literal test bodies or full implementations appear, per the role-separated cycle; the only code shown is the public-contract block.
