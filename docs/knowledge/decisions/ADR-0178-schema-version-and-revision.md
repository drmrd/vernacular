---
slug: decisions/ADR-0178-schema-version-and-revision
title: 'ADR-0178: schemaVersion counts breaking changes and schemaRevision counts additive ones'
type: decision
tags: [format, schema, versioning, migration, validation]
related:
  [
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0051-format-preservation-and-load-validation,
    decisions/ADR-0176-commands-as-data-and-session-undo-history,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
  ]
sourceFiles:
  [
    core/format/codec/decode-document.ts,
    core/format/codec/encode-document.ts,
    core/format/codec/revision.ts,
    core/format/codec/graft.ts,
    core/format/current-schema.ts,
    core/migrations/migrate.ts,
    core/model/factories.ts,
    core/model/types.ts,
    scripts/schema/build-schema.mjs,
    scripts/schema/build-validators.mjs,
  ]
status: current
updated: 2026-11-17
---

# ADR-0178: schemaVersion counts breaking changes and schemaRevision counts additive ones

## Status

Current. The owner chose this on 2026-11-14 and approved the architecture refactor round
specification the same day. It amends section 7 of the format specification
(`docs/specs/2026-06-10-vernacular-floor-plan-format.md`). It supersedes the part of ADR-0051 that
tolerates every unknown key at load, and it amends ADR-0047, where a reserved name was promoted
only by a new `schemaVersion`. The policy applies from the next change
to the schema. The reader and the drift test learn about the revision with the document codec work
in that round.

> Amended by [[ADR-0190-strict-check-refuses-and-two-classes-of-repair]] on 2026-11-15. Where the
> reading rules allow a choice, the application refuses: it does not open a file at a version above
> its own, and it has no read-only mode. A document at the reader's version that fails the strict
> check does not open. The stored bytes are kept, and the user can export them or accept an
> offered repair. Encode never lowers a revision. The reading rules themselves are unchanged.

> Amended on 2026-11-17. The schema of a revision above 0 is published in a directory of its own
> under its schema version, with a matching `$id`; the paths that existed before are revision 0
> and never change. Section 7 of the format specification gives the path. `meta.schemaRevision` is
> a non-negative integer. Two validators are generated from the schema of the current version and
> revision: a strict one, and a tolerant one with every `additionalProperties: false` removed. The
> tolerant one serves the row of the table for a file from a newer build: it still checks the
> fields this build knows and accepts the ones it does not. One codec in `core/format/codec/`
> applies the reading rules of the table on every read and every write, for every store and for
> the `.json` import. A save writes the highest of the document's revision, the previous stored
> file's revision when that file is at the same version, and the build's, so that unknown fields
> kept from a file a newer build wrote stay under its revision and the next read checks them
> tolerantly.

## Context

Section 7 of the format specification says a new optional field is additive and does not need a new
`schemaVersion`. The code has bumped the version for every change anyway. `CURRENT_SCHEMA_VERSION`
is 17 (`core/model/factories.ts:43`), versions 8 through 17 arrived in about three months, and six
of the sixteen migrations change nothing. The migration chain allows one step per version, so two
lanes that each add a field have to queue for the next number.

Following the specification as written would remove that cost, but it has a weakness. If nothing
records additive changes, a reader cannot tell a field added by a newer build from a corrupt field.
It would have to accept unknown fields everywhere, and that tolerance is what hid a real corruption
before (#631).

Keeping the current practice keeps validation strict and keeps the cost.

## Decision

Use two numbers.

- `schemaVersion` counts breaking changes: a removed or renamed field, or a field whose meaning
  changed. It drives the migration chain, as it does now.
- `schemaRevision` is a new optional integer beside it that counts additive changes. A file without
  it is at revision 0. Raising it needs no migration step. It returns to 0 when `schemaVersion`
  rises.

Reading rules, for a reader at version N and revision R:

| File                    | Reader does                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| version below N         | migrates up the chain                                                   |
| version N, revision ≤ R | validates strictly; an unknown field outside `extensions` is an error   |
| version N, revision > R | reads tolerantly, keeps unknown fields, and says a newer build wrote it |
| version above N         | refuses or opens read-only, as section 7 already says                   |

Each published schema is fixed once released. The schema drift test fails when the generated schema
changes and the revision does not.

Where the published schemas live for each revision is left to the persistence specification.

## Consequences

- Migrations that change nothing stop. Parallel lanes that add fields share one constant and no
  longer queue for a migration slot.
- Strict validation can run in production builds, against the current schema.
- The format gains one optional field. Under the format's own rule that is an additive change.
- Existing versions 8 through 17 stay as they are. The policy applies from the next change.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.2.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, section 7.
