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
    decisions/ADR-0214-a-save-keeps-a-newer-stored-file-and-writes-beside-it,
  ]
sourceFiles:
  [
    core/format/codec/decode-document.ts,
    storage/documents/open-decoded.ts,
    app/app.tsx,
    core/migrations/migrate.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    core/repairs/repair-list.ts,
    session/flows/open-failed.ts,
    session/handle/read-for-open.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0190: A document that fails the strict check does not open, and repairs come in two classes

## Status

Current. The owner took decisions 13, 14, and 15 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15. On the same day the
owner confirmed two calls below, each in place of a stated alternative: a failed check never blocks
a save, and the general repair is an offer in the dialog. The owner approved the rest the same
day, with that specification. It supersedes the part of ADR-0051 that lets a document open after a
failed check, and it amends ADR-0178, ADR-0182, and ADR-0183. The code is in place (#685, #631).
Strict validation runs in every build. A document that fails it does not open on any read path,
and the failed-open dialog and the two repairs ship with that refusal.

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
  rule of ADR-0182, as the kind `refused-snapshot`, so no prune removes the unsaved work in it. The
  move runs when its project opens, before autosave starts, and again when a restore finds a copy
  that cannot be read. A notice then says that the copy could not be read and is kept.
- The user decides what happens next. A dialog says that the project did not open, gives the
  reason, and has details that can be expanded. It offers Close, Export, and, when a known repair
  applies, opening with the repair. The "Start a new project" control that the first stage builds
  is removed from that dialog. The Projects page has New project. The dialog shows on the Projects
  page, for a stored project that did not open, whether at the start, from a card, or from an
  address, and for a file that did not import there. A failed import shows the same dialog under
  the title "This file did not open.", without Export and without the replace choice, because the
  user still has the file. A file that fails to import from the editor still shows a notice with
  the reason.
- The refusal reaches users together with the dialog, in one pull request. A refused open writes
  no file of the project: no migration backup, no document, and no snapshot. It writes only the
  record in the project index, which says why the project did not open.
- A repair that loses no data is a step in the migration chain. It takes the next `schemaVersion`,
  runs with no question, and has a test that shows every value of the input is in the output.
- A repair that removes data is never in the chain. It is an entry in a named list in `core/`
  (`core/repairs/repair-list.ts`). It runs in memory first, writes nothing, says what it removes,
  and is always the user's choice. A document that comes from a higher revision gets no offer,
  because a newer build may define the fields that the repair would remove, and a repair is
  offered only when the repaired document passes the strict check.
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
  the repair removes is lost. You cannot undo this action." A replace reads the stored file again
  under the project's lock and writes only when the file still fails in the same way and the
  repair removes the same paths that the user saw. It keeps the stored bytes as a backup of the
  kind `pre-repair` by the rule of ADR-0182, and it writes the repaired document without the
  restore of unknown keys that a save does, so the removed data does not come back. For a folder
  project, a new project made from a repair is stored in the browser, and a replace writes into
  the folder.
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
  backup, and section 5.3 drops the "Start a new project" control. Both changes are made. The view
  for ports that did not resolve, the last place that offered the control, was removed on
  2026-11-22. A browser whose storage is not found now works in memory and says so.
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
