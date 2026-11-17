---
slug: decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair
title: 'ADR-0190: A document that fails the strict check does not open, and repairs come in two classes'
type: decision
tags: [format, validation, migrations, repair, data-loss, storage]
related:
  [
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0051-format-preservation-and-load-validation,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0182-migration-backups-in-their-own-directory,
    decisions/ADR-0183-own-id-for-a-project-started-after-a-failed-load,
    decisions/ADR-0184-known-keys-from-the-schema-for-the-save-time-graft,
    decisions/ADR-0187-projects-page-with-document-identity,
    decisions/ADR-0191-export-on-every-card-and-unchecked-copy,
  ]
sourceFiles:
  [
    core/format/codec/decode-document.ts,
    storage/documents/open-decoded.ts,
    app/app.tsx,
    core/migrations/migrate.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
  ]
status: current
updated: 2026-11-15
---

# ADR-0190: A document that fails the strict check does not open, and repairs come in two classes

## Status

Current. The owner took decisions 13, 14, and 15 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15. On the same day the
owner confirmed two calls below, each in place of a stated alternative: a failed check never blocks
a save, and the general repair is an offer in the dialog. The owner approved the rest the same
day, with that specification. It supersedes the part of ADR-0051 that lets a document open after a
failed check, and it amends ADR-0178, ADR-0182, and ADR-0183. The code changes with #685. Until
then validation runs only in a development build and never stops a load.

## Context

Load validation runs only in development builds, against the schema for version 8 while the current
version is 17, and it filters every error about an unknown field (#631). ADR-0178 made strict
validation possible by counting additive changes in `schemaRevision`.

Section 8 of the format specification (`docs/specs/2026-06-10-vernacular-floor-plan-format.md`)
says validation is not a user-facing hard rejection, because migrations are the user-facing
compatibility path. The mixed paint entry of #624 passed the tolerant check: an entry under `paint`
has one `kind` and also carries fields that only another variant defines.

## Decision

- Validation is strict and runs in every build, by the reading rules of ADR-0178. The application
  refuses a file at a version above its own and has no read-only mode.
- Within one version, encode never lowers a revision. It writes the higher of the document's
  revision and the build's, and it checks a document that came in at a higher revision with the
  same tolerance on the way out. A migration to a higher version sets the revision back to 0
  (ADR-0178). The tolerant reading accepts an unknown field at any depth, inside a variant of a
  union too.
- A stored project that fails decode does not open. A decode that fails writes nothing. The
  migration backup is written after a decode that migrated and succeeded, before the document
  reaches the caller.
- A recovery snapshot that fails decode is not restored. It moves to the project's backups by the
  rule of ADR-0182, so no prune removes the unsaved work in it, and the recovery prompt says that
  the copy is kept.
- The user decides what happens next. A dialog says that the project did not open, gives the
  reason, and has details that can be expanded. It offers Close, Export, and, when a known repair
  applies, opening with the repair. The "Start a new project" control that the first stage builds
  is removed from that dialog. The Projects page has New project. A failed import shows the same
  dialog without Export and without the replace choice, because the user still has the file.
- The refusal reaches users only together with the dialog, in one pull request. The codec builds
  the strict check first. Until the dialog lands, a failed check is reported and the document
  opens, on every path that reads one. In that interval a document that migrated and then failed
  the check still gets its migration backup before it opens.
- A repair that loses no data is a step in the migration chain. It takes the next `schemaVersion`,
  runs with no question, and has a test that shows every value of the input is in the output.
- A repair that removes data is never in the chain. It is an entry in a named list in `core/`. It
  runs in memory first, writes nothing, says what it removes, and is always the user's choice.
- The list starts with two entries. The first is the mixed paint entry of #624, and the repair
  removes the fields of the other variant. The second is general: a field that the format does not
  define, outside `extensions`, anywhere in the document. The repair removes each such field, and
  the details box lists the paths. It covers a key that an older build wrote back after a migration
  had removed it. The alternative was a migration that removes the known leftover keys with no
  question. It was not taken, because it removes data that the user did not choose to remove. A
  fault of any other kind, such as a missing field or a value of the wrong type, has no repair in
  this stage.
- The repaired project can open as a new project, which is the first choice and leaves the stored
  project untouched. It can also replace the stored project, with the plain warning "The data that
  the repair removes is lost. You cannot undo this action." A replace keeps a backup of the stored
  bytes by the rule of ADR-0182. For a folder project, a new project made from a repair is stored
  in the browser, and a replace writes into the folder.
- A failed check never blocks a save. The save is written, the last stored file that passed the
  check is kept as a backup, and the user is told. The alternative was to refuse the save, which
  loses the work since the last save.
- A test runs every registered command and checks that the document still passes the schema. It
  uses a second fixture with no planted unknown key, because the first-stage fixture fails the
  strict check by design.

## Consequences

- Sections 7 and 8 of the format specification change, and the sentence that rules out a hard
  rejection is replaced. Sections 3 and 6.4 stand: a refused document is not rewritten, and a
  repair is the user's own act. Section 5.5 of the design specification changes too.
- ADR-0051 gets a note that points to this record. ADR-0178 gets one that says the application
  refuses a newer version and has no read-only mode. ADR-0182 gets one about the new moment at
  which the backup is written.
- The first-stage specification changes in two places. Section 5.2 gets the new moment of the
  backup, and section 5.3 drops the "Start a new project" control.
- A user with a mixed paint entry meets the dialog at the first start after the upgrade. So does a
  user whose project carries a key that a migration removed and an older build wrote back.
- A fault with no known repair can only be exported until a build knows it.
- Saving an invalid document keeps the work, and the project then fails to open next time.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 4.1, 5.2, 5.3, 5.7, 6,
  8, and 10.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, sections 3, 6.4, 7, and 8.
- ADR-0051, ADR-0178, ADR-0182, and ADR-0183, each of which carries a note that points here.
- Issues #685, #631, and #624.
