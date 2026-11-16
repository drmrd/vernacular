---
slug: decisions/ADR-0184-known-keys-from-the-schema-for-the-save-time-graft
title: 'ADR-0184: The save-time graft reads a table of known keys generated from the schema'
type: decision
tags: [storage, data-format, preservation, extensions, schema, migrations, data-loss, commands]
related:
  [
    decisions/ADR-0051-format-preservation-and-load-validation,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
  ]
sourceFiles:
  [
    storage/folder/preserve-unknown.ts,
    storage/folder/folder-project-store.ts,
    scripts/schema/generate-schema.mjs,
    core/commands/handlers/project-commands.ts,
    core/model/known-keys.ts,
    core/model/known-keys.json,
    scripts/schema/build-known-keys.mjs,
  ]
status: current
updated: 2026-11-15
---

# ADR-0184: The save-time graft reads a table of known keys generated from the schema

## Status

Current. The owner approved it on 2026-11-14 with sections 5.1 and 5.4 of
`docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`. It replaces the rule by which the
preservation overlay of ADR-0051 decides what to restore. The duty to preserve unknown data is
unchanged. The code changes with #678 and #669. Until then the overlay restores every key the
document lacks.

## Context

ADR-0051 added an overlay to the folder stores. On save it grafts the previous file onto the
document, and it restores every key that the previous file has and the document lacks. That keeps
unknown and reserved data through a read, edit, and save.

The overlay cannot tell a key the reader never knew from a known optional key the user cleared.
Commands clear a field by leaving the key off, so a cleared style, period override, or furniture
name comes back on save (#669). Two maps were exempted by hand.

A second fault sits beside it. The graft reads the file on disk, which after a migrated load is
still at the old schema version. A key that a migration removed is grafted back as if it were
unknown data.

The overlay also hid a third fault. Two rebuild functions in the command handlers list fields and
drop `extensions` (#678). The graft put the field back in the folder stores. The IndexedDB store has
no graft and saved the loss.

## Decision

- The schema script generates a table of known keys from the current JSON Schema. The table is
  committed in `core/`, and `pnpm schema:check` fails when it is stale.
- The graft restores a key that the previous file has and the document lacks only when the table
  does not know that key at that place. A known key that is absent was cleared.
- A map whose values the schema types is a collection the model owns, and a missing entry was
  deleted. A map whose values the schema leaves open, such as `extensions`, is opaque. No list of
  collection names is written by hand.
- A key that any variant of a tagged union defines counts as known.
- The previous file is migrated in memory before the graft.
- Command handlers copy by spread. A test runs every registered command against a document that
  carries `extensions` and an unknown key on every object, and both must survive.

## Consequences

- A cleared optional field stays cleared, and a key that a migration removed stays removed.
- A field added by a newer schema revision is unknown to an older reader's table, so the reader
  keeps it. That is the tolerant case of ADR-0178.
- The graft no longer repairs a known key that a command dropped. The command test is the guard for
  that, which is why it covers every registered command and fails for one it cannot run.
- The table and the graft move into the document codec unchanged when the persistence stage builds
  it. Every store then gets the same behavior (#672).
- A wrong table loses data. The tests generated from the table cannot catch that on their own, so a
  round trip of the test corpus and three end-to-end cases check it independently.

## Shape of the table

- Each variant of a tagged union is its own entry, named `Union.tag`, for example
  `UnderlaySource.raster`.
- A `union` value records its tag key and a list of its variants. Each variant pairs a tag value
  with the name of its entry, and `variantTypeOf` in `core/` finds a variant by its tag value. No
  code reads a tag value out of an entry name.
- `KNOWN_KEYS` is typed with the generated type names, so a lookup by a known name needs no check
  for undefined.
- The generator stops with an error that names the place when the schema holds a shape the table
  cannot express: an array of arrays, a tuple, a union with no shared constant tag, a tag value
  that is not a string, two variants with one tag value, a scalar (`enum` or `const`) that also
  carries structure, or a reference with a sibling keyword that is not an annotation. Such a
  shape can never be read as a plain value.

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, sections 5.1 and 5.4.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, section 6.4.
- Issues #669, #678, and #672.
