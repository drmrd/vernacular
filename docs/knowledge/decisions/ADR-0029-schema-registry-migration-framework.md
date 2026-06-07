---
slug: decisions/ADR-0029-schema-registry-migration-framework
title: 'ADR-0029: Schema-and-registry migration framework, pure core with storage-side atomicity'
type: decision
tags: [architecture, core, storage, migrations, schema, persistence]
related:
  [
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-04-project-stores-and-migrations.md,
    docs/plans/2026-06-04-project-stores-and-migrations.md,
    core/migrations/types.ts,
    core/migrations/migrate.ts,
    core/migrations/schema/index.ts,
    core/migrations/registries/index.ts,
    core/migrations/index.ts,
    storage/folder/folder-project-store.ts,
  ]
status: current
updated: 2026-06-04
---

# ADR-0029: Schema-and-registry migration framework, pure core with storage-side atomicity

## Status

Accepted, landed. The pure framework lives in `core/migrations/`
(`migrateProject`, the migration types, the empty real chains, the barrel) and is
exported from `core/index.ts`. The pre-migration backup and atomicity live in
`FolderProjectStore` (`storage/folder/folder-project-store.ts`). The real schema
and registry chains are empty today because the current schema version is `1`
with no prior version; chaining, gap detection, per-registry application, and
backup-on-failure are proven with synthetic fixture migrations in the tests, so
the shared `core/model/types.ts` is untouched.

## Context

The behavioral contract for the storage slice is that `load -> save -> load`
round-trips a project identically, including after a forward migration. Projects
carry a `meta.schemaVersion` and a `meta.registryVersions` map (per-registry
versions, ADR-0006), and a future build that reads an older file must walk it
forward. Two forces shape the design:

- `core/` cannot import React, Three.js, or browser storage (rule 1). A migration
  routine that reads or writes files would violate the layer boundary.
- A migration that fails partway must never corrupt the only copy of a project.
  The design specification (section 5.5) calls for a pre-migration backup and a
  report-bug path on failure, not a silent partial write.

So the transform is pure and lives in `core/`, while the durability concerns,
backup and atomicity, live in the store that owns the bytes.

## Decision

### Pure orchestration in core

`migrateProject(raw, options?)` (`core/migrations/migrate.ts`) is a pure function:
it deep-clones the input via `structuredClone`, never mutates the argument, never
touches storage, and returns a `Project` or throws. It reads
`meta.schemaVersion`, then:

1. Runs the schema chain `vN -> vN+1 -> ... -> targetVersion`. The orchestrator
   finds the `SchemaMigration` whose `from` equals the current version, applies
   it, then advances `meta.schemaVersion` itself. Each `SchemaMigration.migrate`
   transforms data only and must not set `meta.schemaVersion`; centralizing the
   version advance keeps a migration from skipping or lying about its step.
2. Runs per-registry migrations after the schema chain. For each entry in
   `meta.registryVersions`, it applies matching `RegistryMigration`s (keyed by
   `registry` and `from`) in ascending order and advances that registry's
   version. Registry migrations are append-only: a registry with no pending
   migration is left untouched, and unlike the schema chain a missing registry
   step is not an error (registries that this build does not know about simply do
   not advance).
3. Returns the result as a `Project`.

Typed errors carry enough to drive the UI and the report-bug path
(`core/migrations/types.ts`):

- `MalformedProjectError`: the document is missing or has a non-numeric
  `meta.schemaVersion`, so it is not a recognizable project.
- `UnsupportedSchemaVersionError(fromVersion, targetVersion)`: the document is
  newer than this build can read (its version exceeds the target).
- `MigrationFailedError(fromVersion)`: a required schema step has no migration,
  carrying the version the chain stalled at.

`MigrateOptions` lets callers inject `schemaMigrations`, `registryMigrations`,
and `targetVersion`; the defaults are the real `SCHEMA_MIGRATIONS` and
`REGISTRY_MIGRATIONS` (both `[]` today) and `CURRENT_SCHEMA_VERSION` (`1`). The
injection points exist precisely so the chaining and gap behavior can be tested
with synthetic fixtures without inventing a fake schema version in the shared
model.

### Atomicity and backup in the store

`FolderProjectStore.loadProject` owns durability. Before running a migration, it
reads `meta.schemaVersion` from the stored bytes; if that version is below the
store's `targetVersion`, it writes the original bytes verbatim to
`.house-autosave/pre-migration-v<n>.json` and only then calls the pure migrate.
Two atomicity properties follow:

- Migration-on-load never rewrites the canonical `project.json`. `loadProject`
  reads and migrates in memory and returns a `Project`; the canonical file is
  rewritten only by an explicit `saveProject`. A failed migration therefore
  leaves the original `project.json` byte-identical, and the verbatim backup also
  survives.
- If the pure migrate throws, `loadProject` rejects and the error surfaces; there
  is no partial write to recover from.

`FolderProjectStore` defaults `migrate` to `migrateProject` and accepts an
injected `migrate` plus `targetVersion`, so the backup-and-atomicity behavior is
proven with a synthetic upgrade (a seeded `project.json` at version 1 with an
injected migrate targeting a higher version) without changing the real schema.

## Consequences

- The migration logic is pure and fully unit-testable, including multi-step
  chains and the gap error, with no storage or browser in the loop.
- A failed migration cannot corrupt a project: the canonical file is never
  rewritten on load and a verbatim pre-migration copy is on disk before any
  transform runs.
- The framework ships empty (no real migration exists at version 1) yet is
  proven correct, so the first genuine schema bump only adds a `SchemaMigration`
  to `core/migrations/schema/`, never reworks the orchestrator.
- Centralizing the version advance in the orchestrator means migrations stay
  small data transforms and cannot desynchronize the version from the data.

### Deferrals

- `writeHistory` and `packsRequired` project-meta fields (design spec 3.4) are
  absent from the shared `core/model/types.ts` `ProjectMeta` and are deferred to
  a later coordinated schema migration once the shared model is stable. Adding
  them is exactly the append-a-`SchemaMigration` path this framework was built
  for.
- Async-with-progress migration UI for very large projects (design spec 5.5) is
  deferred; the framework runs synchronously.

## References

- Design specification, sections 3.3, 3.4 (project meta and registry versions),
  and 5.5 (migration and the pre-migration backup).
- Slice spec: `docs/specs/2026-06-04-project-stores-and-migrations.md`.
- Implementation plan: `docs/plans/2026-06-04-project-stores-and-migrations.md`.
- ADR-0006 (the registry pattern whose per-registry versions the registry
  migrations advance).
- ADR-0028 (the `FolderProjectStore` that performs the backup and runs the pure
  migrate on load).
- ADR-0003 (the `ProjectNotFoundError` and clone-on-save precedents the folder
  store preserves).
