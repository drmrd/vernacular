---
slug: decisions/ADR-0214-a-save-keeps-a-newer-stored-file-and-writes-beside-it
title: 'ADR-0214: A save keeps a newer stored file and writes beside it'
type: decision
tags: [storage, data-format, data-loss, preservation, session, projects-page]
related:
  [
    decisions/ADR-0184-known-keys-from-the-schema-for-the-save-time-graft,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
    decisions/ADR-0189-one-writer-and-second-tab-sees-projects-page,
    decisions/ADR-0182-migration-backups-in-their-own-directory,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
  ]
sourceFiles:
  [
    storage/documents/document-store.ts,
    storage/documents/document-backups.ts,
    storage/project-files/project-file-name.ts,
    session/handle/document-handle.ts,
    session/flows/choose-kept-file.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md,
    docs/specs/2026-11-15-session-layer-and-document-identity.md,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-11-22
---

# ADR-0214: A save keeps a newer stored file and writes beside it

## Status

Current. The owner decided "keep both files" on 2026-11-16 and approved this record and the
amendment of the specifications on 2026-11-22. It amends section 5.1 of the first-stage
specification, sections 2.2, 2.3, and 7 of the format specification, section 3.3 of the design
specification, and sections 5.3, 5.4, 5.5, 5.7, 5.8, and 8 of the session specification. ADR-0184,
ADR-0047, and ADR-0182 each get a note. The code lands with #741 and #842.

## Context

A build refuses a document at a higher `schemaVersion` than its own, and it has no read-only mode
(ADR-0190). So a newer `vernacular.json` at save time means that something else wrote the file
after this session opened it: a second device through a sync tool, another program, or a browser
without the lock. The lock of ADR-0189 keeps two tabs of one browser out of this case and nothing
else.

Until this record, the save replaced the newer file in full. It made no graft, because it could
not read the file, and it kept no copy. The work that the newer build saved was gone, and only the
console said so (#741). A stored file that could not be read for another reason was replaced in
the same way (#842).

Autosave makes the case repeat on every save of the session. After the build updates, it can read
both documents, and they hold different work that Vernacular cannot merge.

## Decision

- A save never replaces a `vernacular.json` at a higher `schemaVersion` than the build. It writes
  the document to a second document file beside it, `vernacular.format-<N>.json`, where N is the
  build's schema version. The format reserves every name of that form. A second document file is a
  complete Document, and renaming it to `vernacular.json` makes it the project's document.
- Each save decides anew from the stored `vernacular.json`. A save to the second file grafts onto
  the earlier content of that file.
- A read whose `vernacular.json` is newer decodes the second document file with the highest version
  that is not above the build's. The project opens from it. With no such file the open fails as a
  newer version, as before. A repair's replace writes the file that the read came from.
- A second document file never stands in for a missing `vernacular.json`. A listing finds a project
  by `vernacular.json` alone.
- The user is told once per open project, and the save status says that saves go to a second plan file.
  The card of the project says that it has a second plan file. User-visible text calls `vernacular.json` and
  the second document file plan files.
- The user chooses in a dialog: keep both plan files, open the second plan file as a new project, replace
  `vernacular.json` with the second plan file, or, when the build can read both, remove the second
  plan file. When the build can read both files, the dialog shows before the project opens.
- Nothing is replaced or removed before the user chooses. A choice copies the bytes that it
  replaces or removes to `.house-backups/` first, under the never-replace rule of ADR-0182. The
  only file that the picked-folder store removes is a second document file.
- A higher `schemaRevision` at the same `schemaVersion` is not a newer version. The graft keeps
  what such a file added (ADR-0178, ADR-0184).
- Before a save replaces a stored file that it cannot read at all, it copies that file to the
  backups and tells the user once.
- An archive carries one Document. An ordinary export leaves a second document file out, and an
  unchecked copy carries it.
- The conformance suite runs the case on every store.

## Consequences

- No save loses a document that the build cannot read. The newer build still opens its own
  file.
- A project can be in two files for a time. The user ends it by choosing in the dialog, or by
  renaming a file by hand.
- The folder layout of the format gains an optional file. The Document schema does not change, so
  `schemaVersion` and `schemaRevision` stay.
- The picked-folder store removes a file for the first time. It is a file that Vernacular wrote,
  under a reserved name, after a backup holds its bytes.
- "Replace" moves a file that the build may not be able to read into the backups. No control
  restores a backup yet, so the warning says that the action cannot be undone.
- The two states cannot occur before a build at a higher schema version exists. A build released
  before this record still replaces a newer file.
- A file that another writer changed at the same schema version is still replaced by the next
  save, with a graft of its unknown data only. That case has its own issue.

## Alternatives considered

- Replace the newer file and tell the user. The owner did not pick it: the newer work is lost.
- Refuse the save. The user's edit would have no place to go, which the first-stage specification
  ruled out for every save.
- Move the newer file to the backups and write `vernacular.json`. The newer build would open older
  data with no sign that its file moved.
- Store this build's document in a sidecar directory or in a new project in the browser. The
  user's current work would leave the place where the user keeps the project.
- One fixed name for the second file. A third, older build would have to replace a second file
  that it cannot read.
- Count a higher revision as newer. Every save by a build one revision behind would split the
  project, which undoes ADR-0178.

## References

- Issues #741 and #842.
- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 5.3 (point 10), 5.4,
  5.5, 5.7, 5.8, and 8.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, sections 2.2, 2.3, and 7.
- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.1.
- `docs/specs/2026-06-01-vernacular-design.md`, section 3.3.
- `docs/plans/2026-11-15-session-layer-and-document-identity.md`, decision 22, for the wording.
