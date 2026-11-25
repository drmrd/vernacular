---
slug: decisions/ADR-0183-own-id-for-a-project-started-after-a-failed-load
title: 'ADR-0183: A project started after a failed load gets its own id'
type: decision
tags: [storage, project-identity, boot, autosave, data-loss, app-shell]
related:
  [
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0180-one-settings-port,
    decisions/ADR-0119-write-ahead-crash-recovery,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
  ]
sourceFiles:
  [
    app/app.tsx,
    app/use-workspace-state.ts,
    session/handle/read-for-open.ts,
    storage/project-store.ts,
    app/use-open-project.ts,
    app/use-project-boot.ts,
  ]
status: current
updated: 2026-11-22
---

# ADR-0183: A project started after a failed load gets its own id

## Status

Current. The owner chose the identity rule on 2026-11-14 and approved the rest the same day, with
section 5.3 of `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`. The code landed
with #671. A project started after a failed load now gets its own id, and the application remembers
that id after the project's first successful save.

> Amended by [[ADR-0188-project-id-address-and-index-record]] on 2026-11-15. The project index
> takes over the port that remembers the active project id. The project to open at start is the
> record with the latest use. Every new project gets a random id, not only a project started after
> a failed load.

> Amended by [[ADR-0190-strict-check-refuses-and-two-classes-of-repair]] on 2026-11-15. The dialog
> for a project that did not open loses the "Start a new project" control, because the Projects
> page has New project. The rule that nothing writes under the id that failed is unchanged.

> Updated on 2026-11-18. One owner hook, `app/use-open-project.ts`, holds the open project, and
> `app/use-fresh-project.ts` and `loadOrCreateProject` are gone. "Start a new project" is now a new
> start of that owner in `app/use-project-boot.ts`: it opens a workspace request under a new id,
> with the first document as the request's `create` step. The new project's handle, autosave, and
> snapshots use the new id from the start, so no snapshot store has to be resolved again. When the
> storage did not resolve, the new project runs on ports kept in memory. The new id is no longer
> checked against the list of stored projects. If a stored project had that id, the open would
> read that project and write nothing over it. The remembered id now follows the last workspace
> project saved on a durable store (`app/use-remember-saved-project.ts`), whether or not it was
> started after a failed load.

> Updated on 2026-11-19. The port of the remembered id, `ActiveProjectIdStore`, is deleted, and
> so are the hooks that read and wrote it. The project index decides the start: the application
> opens the workspace record used last, and opens `'current'` when the index holds none. A project
> started after a failed load still gets its own id, now a bare UUID from `newProjectId`. A small
> reader of the old `localStorage` key stays in `storage/active-project/`. The rebuild of the index
> reads the key on a durable workspace for as long as it is stored. When the index holds no record
> of the remembered project, the rebuild gives that project the latest use, and it removes the key
> only once that marked record is stored. If the clock fails, no marked record is stored and the
> key stays for the next rebuild. The rebuild also removes a key whose project the store does not
> hold.

> Updated on 2026-11-22. "Start a new project" is gone as a start of the owner in
> `app/use-project-boot.ts`, and so is the view for storage that did not resolve, which offered
> it. When the storage is not found, the boot takes ports kept in memory at once, and the Projects
> page has New project.

## Context

The application has one project slot with the fixed id `'current'`. When the stored project fails to
load, the failure dialog offers to start a new project. The new session keeps the store that
resolved, and autosave is armed with the same id, so the first edit writes over the project that
failed (#671). That project is the one the user most needs to keep: a later build with a repaired
migration could still open it.

The project stores already address projects by id, and two ids can sit side by side. Only the
application assumes a single id.

## Decision

- The application has an active project id, the id it opens at start. With nothing remembered, the
  id is `'current'`.
- A project started from the failure dialog gets a new id that no stored project has. Its session,
  autosave, and snapshots use the new id. Nothing writes under the id that failed.
- The remembered id moves to the new project after that project's first successful save to a
  durable store. Before that, a reload returns to the failure dialog and Retry is still available.
- When no durable store resolved and the session runs in memory, the remembered id never moves.
- A small port in `storage/` reads and writes the active project id. `app/` builds it. A failed
  write of the id does not fail the save, and the application writes it again at the next save.
- The active id is state in the boot code of `app/`. The snapshot store is resolved for that id, and
  resolved again when the id changes, so the new project's snapshots never land in the failed
  project's directory.
- The failure dialog states that the saved project is kept unchanged and that the new project is
  stored separately.

## Consequences

- The failed project's bytes, snapshots, and backups stay in the store.
- Once the remembered id has moved, the interface has no way back to the failed project until the
  application lists projects (#588). The owner accepted this.
- This is the document identity of ADR-0175 in a small form: one id per document and a record of
  which one to open. The persistence specification decides whether the settings port (ADR-0180) or
  the document handle takes the new port over.
- The fixed id stops being an assumption in `app/`. The default value stays, so an existing user's
  project opens as before.

## Notes on the code

- The port is `ActiveProjectIdStore` in `storage/active-project/active-project-id-store.ts`. The
  browser implementation keeps the remembered id in `localStorage` under the key
  `vernacular.activeProjectId`.
- A new id has the form `project-<uuid>`, and the code checks that no stored project has it.
- The id is remembered only after the first successful save on a durable store.
- A damaged remembered value counts as nothing remembered, and the application opens `'current'`.
- A retry that succeeds wins over a pending start of a new project. The start gives up when the
  failure it answered has gone.

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.3.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.2.
- Issues #671, #588, and #591.
