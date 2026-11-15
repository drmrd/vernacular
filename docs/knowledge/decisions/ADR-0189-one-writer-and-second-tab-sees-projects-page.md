---
slug: decisions/ADR-0189-one-writer-and-second-tab-sees-projects-page
title: 'ADR-0189: One tab writes a document, and a second tab sees the Projects page'
type: decision
tags: [storage, locks, multi-tab, session, projects]
related:
  [
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0176-commands-as-data-and-session-undo-history,
    decisions/ADR-0187-projects-page-with-document-identity,
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0030-additive-storage-capabilities,
  ]
sourceFiles:
  [
    storage/locks/project-lock.ts,
    storage/locks/web-locks-manager.ts,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-11-15
---

# ADR-0189: One tab writes a document, and a second tab sees the Projects page

## Status

Current. The owner took decision 11 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15 and approved the guard
rails of section 5.12 the same day, with that specification. It supersedes the read-only outcome
of the project lock in ADR-0030. The code changes with #685. Until then no code takes a lock when
it opens a project, and two tabs can write the same document.

## Context

The umbrella specification left open what a second tab sees when it opens a document that another
tab has locked. It proposed a read-only view with a notice (its section 8). Section 5.6 of the
design specification (`docs/specs/2026-06-01-vernacular-design.md`) describes a prompt that offers
to open read-only or to take ownership and turn the other tab read-only.

The lock module in `storage/locks/` has a manager over the Web Locks API and a `createProjectLock`
function. Only the end-to-end test hook uses the manager, and nothing calls the function. The
manager does not check that the API exists.

## Decision

- The document handle takes the lock when it opens a document, through one port in `storage/`, and
  releases it when it closes. The browser releases it when the tab ends.
- A second tab that asks for a document open in another tab shows the Projects page. That card
  says "Already open in another tab."
- That card offers Export only, and the export holds the last saved state. A tab that does not
  hold the document cannot rename or delete it.
- There is no read-only mode and no taking of ownership.

The owner called this a fair assumption for now and set a condition. Nothing decided now may make
the plan and the 3D view in separate windows, or editing by more than one person, unattainable.
These five guard rails are how the stage meets that condition.

1. Only the open step of the handle takes the lock, through one port. Only the project list reads
   the lock state, through the same port. No editor code depends on it. A later mode in which two
   windows share a document changes the policy behind that port and nothing else.
2. The handle holds the document, its store, its lock, and its save state. Selection, camera,
   active floor, and tool state belong to a window and live outside the handle.
3. Every change to a document in a session goes through `dispatch`, the rename of a closed project
   included. Migrations and repairs are the only code that changes a document without it, and they
   run before a session exists.
4. A project id is a random UUID. The one id that is not, `'current'`, is local to a browser and
   would get a new id if projects ever leave the browser.
5. The command-layer specification carries the owner's condition forward when it chooses the form
   of inverse data and change sets.

## Consequences

- Section 5.6 of the design specification is replaced, and the open question in section 8 of the
  umbrella specification is answered.
- No read-only code path is built.
- In a browser with no lock API the port says so, the handle opens the project, and the application
  cannot tell that a second tab has it. That browser gets no protection, and a card cannot say so.
- Editing by more than one person still needs a server, an identity for each person, and a rule for
  merging changes. This record decides none of them.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 4.1, 5.4, 5.8, 5.12,
  and 8.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 8.
- `docs/specs/2026-06-01-vernacular-design.md`, section 5.6.
- ADR-0030, whose read-only lock outcome this supersedes, and ADR-0175, ADR-0176, and ADR-0188.
- Issues #685 and #588.
