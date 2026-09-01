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
    decisions/ADR-0051-format-preservation-and-load-validation,
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
    core/migrations/schema/rekey-room-overrides.ts,
    storage/folder/folder-project-store.ts,
  ]
status: current
updated: 2026-08-31
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

## Update (2026-08-31): the first data-rewriting step, and the segment-and-rejoin pattern for a changed key separator

`rekeyRoomOverridesMigration` (`core/migrations/schema/rekey-room-overrides.ts`, issue #625, PR #641)
is the schema ladder's first step that rewrites existing data rather than adding a field with a
default. Every earlier `add-*` step in `core/migrations/schema/index.ts` only introduces a new key
with a default value; this one changes how an existing key is spelled. The "real chains are empty"
framing in this ADR's Status and Decision sections is now historical: `CURRENT_SCHEMA_VERSION` is 17,
and sixteen migrations occupy the ladder.

The problem this step solves is a recurring shape worth naming for whoever hits it next: a key
separator changes under live data. An early build joined a room override's key from its sorted
wall ids with `-`. Wall ids are themselves dash-shaped strings, so that join was ambiguous, two
different sets of walls could land on the same joined key, and `roomKey`
(`core/topology/rooms.ts`) now joins with `|` instead. A document an old build saved still carries
overrides filed under the old, ambiguous key, and the room lookup, which always calls today's
`roomKey`, can no longer find them.

The fix is split, validate, rejoin, not a blind character swap:

- Split. The migration walks the stored key against the set of wall ids that actually exist in
  this document, backtracking, because a wall id can itself contain the old separator, so a plain
  `split('-')` would cut through a wall id rather than between two of them.
- Validate. A split only counts if it consumes the entire key into wall ids the document
  recognizes. A key that partially matches, or matches nothing, is not massaged into a best guess.
- Rejoin through the live key function, not the new separator. The migration does not hand-build
  the new key by joining the recovered segments with `|`. It calls `roomKey` itself, the same
  function every current room lookup uses, so the migrated key is guaranteed to match what the rest
  of the app resolves today even if `roomKey`'s canonicalization (deduplicating and sorting the ids)
  does more than a plain join.

This shape generalizes past room overrides: reach for split-validate-rejoin whenever a stored,
delimiter-joined key predates a change to that delimiter or to the joining function, and the
component values are not guaranteed free of the old delimiter.

The migration leaves an unmatched key alone rather than dropping it. A dash-joined key that does not fully
segment against this document's wall ids does not provably name any room here: it might reference
walls the user has since deleted, or it might be unrelated data. The migration cannot tell, so it
declines to guess and declines to drop the entry; it writes the key back unchanged. That is a
narrower instance of the preservation stance [[ADR-0051-format-preservation-and-load-validation]]
takes for extension payloads and reserved keys: something the current code cannot interpret is
carried forward untouched rather than discarded, so it stays recoverable, by a smarter future
migration or by a person reading the file, instead of vanishing silently inside a routine schema
bump.

The framework allows one migration per `from` version, which forces a later cleanup
into a later step. `migrateProject`'s schema loop (`core/migrations/migrate.ts`) finds the single `SchemaMigration`
whose `from` equals the document's current version, applies it, then advances the version by
exactly one; nothing in the loop lets two migrations share a `from`, and no step spans more than one
version. A `from` version is a slot with room for exactly one step. `rekeyRoomOverridesMigration`
claims the 16-to-17 slot. A second, unrelated cleanup, stripping paint entries a kind-switch bug
once left with fields invalid for their kind (issue #632), also wants to touch documents from around
this era, but it cannot ride along in the same step: it is queued as the 17-to-18 step, landing only
once this migration has merged and the version has advanced again. An author whose fix wants to land
against a `from` version another migration already occupies should expect the same: sequence the fix
as the next step rather than trying to widen the step that is already there.
