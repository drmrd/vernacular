---
slug: decisions/ADR-0028-directory-port-folder-storage-seam
title: 'ADR-0028: Project-folder storage behind a flat DirectoryPort seam'
type: decision
tags: [architecture, storage, persistence, opfs, file-system-access, zip, testability]
related:
  [
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0022-storage-capability-detection,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0030-additive-storage-capabilities,
  ]
sourceFiles:
  [
    docs/specs/2026-06-04-project-stores-and-migrations.md,
    docs/plans/2026-06-04-project-stores-and-migrations.md,
    storage/fs/directory-port.ts,
    storage/fs/in-memory-directory.ts,
    storage/fs/subdirectory-port.ts,
    storage/fs/file-system-directory.ts,
    storage/folder/folder-project-store.ts,
    storage/folder/project-json.ts,
    storage/opfs/opfs-project-store.ts,
    storage/zip/zip-bundle-project-store.ts,
    storage/zip/zip-codec.ts,
    storage/filesystem/file-system-folder-project-store.ts,
    e2e/tests/durable-storage.spec.ts,
  ]
status: current
updated: 2026-06-04
---

# ADR-0028: Project-folder storage behind a flat DirectoryPort seam

## Status

Accepted, landed. The flat `DirectoryPort` interface, the `InMemoryDirectory`
fake, the `SubdirectoryPort` view, and the single `FileSystemDirectory` adapter
live in `storage/fs/`. The folder codec (`FolderProjectStore`, `project-json`)
sits on top, and the three durable stores (`OpfsProjectStore`,
`ZipBundleProjectStore`, `FileSystemFolderProjectStore`) compose it. Everything
except `FileSystemDirectory`, the native folder picker, and the OPFS root
acquisition is unit-tested over `InMemoryDirectory`; the browser seams are
exercised by `e2e/tests/durable-storage.spec.ts`.

## Context

The foundation shipped the `ProjectStore` interface, an `InMemoryProjectStore`,
a durable `IndexedDbProjectStore`, and read-only capability detection (ADR-0003,
ADR-0022). The design specification (sections 3.3 and 5) calls for folder-shaped
durable storage as well: a git-diffable `project.json` at the root of a project
folder, that same folder usable from the origin private file system (OPFS), from
a user-picked folder via the File System Access API, and packaged as a shareable
`.house.zip` bundle.

The recurring obstacle is that jsdom implements none of OPFS, File System Access,
IndexedDB, or Web Locks. The established pattern (ADR-0003, ADR-0022) keeps a
single thin browser adapter as the only end-to-end-tested seam and routes
everything else through an injectable interface that is unit-tested. The folder
codec, the migration-on-load behavior, id namespacing, and zip round-tripping are
all logic worth covering with fast unit tests, so they must not be welded to a
browser handle.

## Decision

All durable folder input/output flows through one small, flat, path-keyed
asynchronous port, `DirectoryPort` (`storage/fs/directory-port.ts`):

```ts
interface DirectoryPort {
  readFile(path: string): Promise<Uint8Array | undefined> // undefined when absent
  writeFile(path: string, bytes: Uint8Array): Promise<void> // creates parent dirs
  removeFile(path: string): Promise<void> // no-op when absent
  list(prefix: string): Promise<string[]> // immediate child segment names
}
```

Paths are forward-slash with no leading slash (`project.json`,
`.house-autosave/snapshot.json`, `<id>/project.json`). A flat path interface is
chosen over a hierarchical handle tree because the project-folder layout is
naturally path-addressed, the in-memory fake is trivial, and the recursive walk
to and from a hierarchical handle is confined to the one adapter.

### The list-on-a-file leaf invariant

`list(prefix)` returns the immediate child segment names directly under a logical
directory, with order unspecified. The load-bearing contract addition is that
**`list` of a path that names a stored file returns `[]`**: a file has no
children. Recursive routines lean on this to tell files from directories without
a separate stat call. `OpfsProjectStore.delete` walks a subtree by treating a
non-empty listing as a directory to recurse into and an empty listing as a file
to remove, and `ZipBundleProjectStore`/`FileSystemFolderProjectStore` collect
file paths the same way. `FileSystemDirectory.list` honors this by catching the
`DOMException` a real handle raises when a file path is resolved as a directory
and returning `[]` instead of throwing.

### Implementations

- `InMemoryDirectory` (`storage/fs/in-memory-directory.ts`) is a
  `Map<string, Uint8Array>` backing the unit-test substrate and the buffer a zip
  bundle expands into. It copies bytes on write and on read, so a caller cannot
  reach stored state by holding a reference. Its conformance to the contract,
  including the leaf invariant and copy isolation, is pinned by
  `storage/fs/directory-contract.ts` so any future `DirectoryPort` can reuse the
  same assertions.
- `SubdirectoryPort` (`storage/fs/subdirectory-port.ts`) is a `DirectoryPort`
  view rooted at a prefix inside another `DirectoryPort`. It lets one
  `FolderProjectStore`, written against root-relative paths like `project.json`,
  operate inside a per-project `<id>/` subdirectory without knowing it is nested.
- `FileSystemDirectory` (`storage/fs/file-system-directory.ts`) is the single
  adapter over a `FileSystemDirectoryHandle`. Both
  `navigator.storage.getDirectory()` (OPFS) and `showDirectoryPicker()` (the
  folder picker) return a `FileSystemDirectoryHandle`, so OPFS and File System
  Access share this one recursive walk. It is the only new end-to-end-only code
  in the slice.

### The folder codec and the three stores

`FolderProjectStore` (`storage/folder/folder-project-store.ts`) holds the
project-folder read/write logic once, purely over a `DirectoryPort`. It writes
the canonical pretty-printed `project.json` (two-space, trailing newline, key
order `{ meta, floors }` so the file begins with `meta`; see
`storage/folder/project-json.ts`), reads and migrates it on load, and owns the
`.house-autosave/` sidecar. Because it is single-project and folder-relative, the
three named stores are thin compositions:

- `OpfsProjectStore` keeps many projects under the OPFS root, one
  `SubdirectoryPort`-scoped `FolderProjectStore` per id (`<id>/project.json`),
  satisfying the id-keyed `ProjectStore` (`list`/`load`/`save`/`delete`).
- `ZipBundleProjectStore` expands a `.house.zip` into an `InMemoryDirectory` via
  the `fflate`-backed `zip-codec`, runs the same folder codec, and re-zips on
  `exportBundle()`.
- `FileSystemFolderProjectStore` binds one project to a user-picked handle over a
  `FileSystemDirectory`, with `requestPermission()` re-prompt on reopen.

A folder-level absence is reported by `ProjectFileNotFoundError`; each id-keyed
store translates that into the established `ProjectNotFoundError` (ADR-0003) so
the `loadOrCreateProject` bootstrap contract is preserved end to end.

## Consequences

- The folder codec, `project.json` serialization, id namespacing, the zip
  round-trip, and migration-on-load are all unit-tested over `InMemoryDirectory`
  with no browser. The end-to-end surface shrinks to one adapter plus root and
  picker acquisition.
- OPFS and File System Access are unified behind a single recursive adapter
  rather than two, because both expose the same handle type. Adding cloud or
  other path-addressed backends later is one more `DirectoryPort`, no consumer
  change.
- The `list`-returns-`[]`-for-a-file leaf invariant is a contract every
  `DirectoryPort` must uphold; it is asserted by the shared contract helper so a
  new adapter that violates it fails fast.
- `storage/` keeps importing only `core/`, so the boundary direction enforced by
  the fitness test (ADR-0017) is preserved.

## References

- Design specification, sections 3.3 (project folder layout) and 5 (storage and
  persistence).
- Slice spec: `docs/specs/2026-06-04-project-stores-and-migrations.md`.
- Implementation plan: `docs/plans/2026-06-04-project-stores-and-migrations.md`.
- ADR-0003 (the provider pattern and the `ProjectNotFoundError` precedent these
  stores satisfy).
- ADR-0022 (the e2e-only-adapter pattern this seam follows).
- ADR-0029 (the migration framework `FolderProjectStore` runs on load).
- ADR-0030 (the additive storage capabilities that ride on the same
  `DirectoryPort`).
