---
slug: decisions/ADR-0182-migration-backups-in-their-own-directory
title: 'ADR-0182: Migration backups live in their own directory until the project is deleted'
type: decision
tags: [storage, migrations, backup, autosave, data-loss, data-format]
related:
  [
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0119-write-ahead-crash-recovery,
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
    decisions/ADR-0191-export-on-every-card-and-unchecked-copy,
  ]
sourceFiles:
  [
    storage/documents/document-store.ts,
    storage/documents/document-backups.ts,
    storage/snapshots/snapshot-store.ts,
    session/autosave/create-autosave.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    storage/documents/replace-stored.ts,
    storage/snapshots/set-aside-refused.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0182: Migration backups live in their own directory until the project is deleted

## Status

Current. The owner chose the directory and the lifetime on 2026-11-14 and approved the rest the
same day, with section 5.2 of `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`. It
supersedes the part of ADR-0029 that puts the backup in `.house-autosave/`, and it narrows what the
prune of ADR-0119 removes. The code changed on 2026-11-17 (#670). The document store wrapper
(`storage/documents/document-store.ts`) writes the backup through
`storage/documents/document-backups.ts` into `.house-backups/`, for every store kind. The snapshot
prune (`storage/snapshots/snapshot-store.ts`) removes only the snapshot files it wrote.

> Amended by [[ADR-0190-strict-check-refuses-and-two-classes-of-repair]] on 2026-11-15. The backup
> is written after a decode that migrated and succeeded, before the document reaches the caller,
> and no longer before the migration runs. Decode works in memory, so a migration that fails
> cannot touch the stored file. The same backup rule keeps three more kinds of file, each named
> `<kind>-v<version>-<digest>.json`:
>
> - `last-valid` holds the last stored file that passed the check. A save that writes a document
>   with faults writes it first.
> - `pre-repair` holds the stored bytes when a repair replaces them. The replace writes it before it
>   writes the repaired document.
> - `refused-snapshot` holds a recovery snapshot that fails the check. The snapshot moves here when
>   its project opens, and when a restore finds a copy it cannot read. The backup is written before
>   the snapshot is removed. The version in the name is 0 when the bytes carry no readable version.
>
> The directory, the lifetime, and the rule against overwriting are unchanged. A refused open
> writes no backup.

> Amended by [[ADR-0191-export-on-every-card-and-unchecked-copy]] on 2026-11-15. One export carries
> backups and recovery snapshots: the unchecked copy of a project that did not open. An ordinary
> export still carries neither, and an import ignores those entries.

## Context

When a folder store loads a project at an older schema version, it copies the original bytes to
`.house-autosave/pre-migration-v<N>.json` before it migrates (ADR-0029). The copy is there so that a
person can recover by hand if a migration turns out to be wrong.

ADR-0119 later made autosave write a snapshot, save, and then prune. The prune removes every file
in `.house-autosave/`. The two decisions share a directory, so the first autosave after a migrated
load deletes the backup (#670). A bad migration is usually noticed long after the first edit.

## Decision

- A pre-migration backup is written to `.house-backups/`, beside `vernacular.json`. The directory is
  not part of the format and never travels in an archive.
- The backup is written before the migration runs, as before.
- A project keeps at least one backup for each schema version it was migrated from.
- A backup write never replaces a file that has different bytes, so different bytes at one version
  add another backup. The same bytes are not written twice.
- Nothing removes a backup except the deletion of its project.
- The snapshot prune removes only the files the snapshot store wrote: the session-start snapshot and
  the rolling snapshots. It leaves any other file in `.house-autosave/` alone.

## Consequences

- An autosave, an explicit save, and a discard of recovery snapshots all leave the backup in place.
- Backups are never cleaned up. A project grows by one document for each schema version it passes
  through. The owner accepted this.
- A backup that an earlier build left in `.house-autosave/` is no longer pruned. It stays where it
  is.
- The application still has no way to restore a backup from the interface.
- The IndexedDB store migrates and backs up like the other stores. Since 2026-11-17 it keeps
  projects as files and uses the same wrapper (#672).
- The folder layout in the format specification (section 2.2) and in the design specification
  (section 3.3) gains `.house-backups/`. Section 7 of the format specification and sections 3.4 and
  5.5 of the design specification name the new location.

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.2.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, sections 2.2 and 7.
- Issue #670.
