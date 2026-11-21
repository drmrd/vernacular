---
slug: decisions/ADR-0191-export-on-every-card-and-unchecked-copy
title: 'ADR-0191: Every project card can export, and a project that did not open exports unchecked'
type: decision
tags: [export, archive, projects, data-loss, backup]
related:
  [
    decisions/ADR-0182-migration-backups-in-their-own-directory,
    decisions/ADR-0119-write-ahead-crash-recovery,
    decisions/ADR-0187-projects-page-with-document-identity,
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
  ]
sourceFiles:
  [
    storage/zip/export-project-bundle.ts,
    storage/import/import-project-file.ts,
    app/use-export-actions.ts,
    editor/shell/export-menu.tsx,
    session/flows/export-project.ts,
    storage/zip/unchecked-copy.ts,
    app/card-export.ts,
    app/card-action-text.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0191: Every project card can export, and a project that did not open exports unchecked

## Status

Current. The owner took decision 12 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15 and approved the rest
the same day, with that specification. It amends ADR-0182, where a backup never travels in an
archive. The code changes with #685. Until then export is the Export control in the editor, whose
first target is the archive, and no page lists projects to export.

> Updated on 2026-11-21 to describe the code. Every card of the Projects page has Export, including
> the card of a project that another tab holds, where it is the only action. `exportProject` in
> `session/flows/export-project.ts` decides at the click. The project open in this tab is packed
> after its pending changes are written. Any other project is read from its store with no lock, so
> a project that another tab holds exports its stored document, without the changes that tab has
> not saved. A read that opens gives an ordinary archive, and that includes a document that fails
> only the strict check. A read that does not open gives the unchecked copy, which
> `buildUncheckedCopy` in `storage/zip/unchecked-copy.ts` makes. It holds the stored document file
> byte for byte, the recovery snapshots, the migration backups, and each asset that the project's
> record lists and the pool can give. A value that is not a content hash, an asset that the pool
> lacks, and a pool read that fails are left out. With no record, the copy holds no asset. The file
> name ends in `-unchecked-copy.building`. `app/card-export.ts` hands the file to the download and
> shows the notice "This copy was not checked, because the project did not open." When the copy
> holds no asset, the notice goes on: "It has the project file only, and no assets."

## Context

The stage specification has an anti-goal: no check may lock a user out of their data. Every refusal
to open (ADR-0190) comes with a way to export what is stored.

The first stage set a rule that backups and snapshots never travel in an archive (ADR-0182, and
section 5.2 of `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`).

An ordinary export goes through the codec, and a project that did not open cannot pass it. No
control opens a recovery copy of a project that did not open.

## Decision

- The card action is named "Export". Every card has it, including the card of a project that did
  not open.
- This stage has one format, the archive, so the action asks nothing. Plan formats join the same
  control later, under the same label.
- For the project open in this tab, pending changes are written first.
- A project open in another tab exports its last saved state.
- A project that did not open exports as an unchecked copy: the stored files as they are, in one
  archive, with its recovery snapshots and its migration backups. A notice says "This copy was not
  checked, because the project did not open."
- The assets of an unchecked copy are the ones that the project's record in the index lists. For a
  project that never decoded, that list comes from the best-effort read of the stored file
  (ADR-0188). When the record lists none, the copy holds no asset and the notice says so.
- An ordinary export still carries no snapshot and no backup.
- An import ignores the snapshot and backup entries of an unchecked copy.

## Consequences

- The first-stage statement that backups and snapshots never travel in an archive gains one named
  exception, the unchecked copy. Section 5.2 of the first-stage specification changes to say so,
  and ADR-0182 gets a note that points to this record.
- An unchecked copy is the way out for a project with a fault that no repair knows.
- An unchecked copy can hold no asset at all, when the project's record lists none.
- A later control that opens a recovery copy of a project that did not open needs no new export,
  because the unchecked copy already carries the copies.
- The file name of an unchecked copy is left to the builder.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 2, 4.1, 5.2, 5.5, 5.8, 8,
  and 9.
- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.2.
- ADR-0182 and ADR-0190.
- Issues #685, #631, and #673.
