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
    session/handle/open-document-handle.ts,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-11-19
---

# ADR-0189: One tab writes a document, and a second tab sees the Projects page

## Status

Current. The owner took decision 11 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15 and approved the guard
rails of section 5.12 the same day, with that specification. Later that day the owner changed the
first guard rail: a delete also takes the lock and holds it while it runs. It supersedes the
read-only outcome of the project lock in ADR-0030. The code changes with #685. Until then no code
takes a lock when it opens a project, and two tabs can write the same document.

> Updated on 2026-11-18. The document handle takes the lock when it opens a project and frees it
> when it closes, through `ProjectLockPort` (`tryAcquire`, `heldIds`, `supported`) in
> `storage/locks/project-lock.ts`. The application builds the port once, in
> `app/create-session-ports.ts`. Where the browser has the lock API and grants its requests, two
> tabs no longer write the same document. Where it has none, or refuses a request, a second tab is
> not noticed. The second tab does not show the Projects page yet. Its open fails with
> `open-elsewhere`, and the application shows the failed-open view with one sentence, "This
> project is open in another tab." When the Projects page lands, the second tab shows the page
> instead. A switch frees the lock of the project it leaves. The restore of a recovered copy hands
> the lock from the old handle to the new one without freeing it. The delete that holds the lock,
> and the project list that reads `heldIds()`, are not built yet.

> Updated on 2026-11-19. `supported` on `ProjectLockPort` means that the lock API exists in this
> browser. It does not say that a request is granted. It stays `true` in a browser that refuses
> lock requests, because the port learns of a refusal only when it asks. A reader must not take
> `supported: true` to mean that a project open in another tab is always seen. The one safe
> conclusion is the reverse. With `supported: false`, the browser has no lock API, `heldIds()` is
> always empty, and no card can say that another tab holds a project.

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
- A delete takes the project's lock before it removes anything and holds it until it is done, so
  no tab can open a project while its files and assets go. When another tab holds the lock, the
  delete is refused and nothing is removed.
- There is no read-only mode and no taking of ownership.

The owner called this a fair assumption for now and set a condition. Nothing decided now may make
the plan and the 3D view in separate windows, or editing by more than one person, unattainable.
These five guard rails are how the stage meets that condition.

1. Two steps take the lock, both in `session/` and both through one port: the open step of the
   handle, and the delete of a project. Only the project list reads the lock state, through the
   same port. No editor code depends on it. A later mode in which two windows share a document
   changes the policy behind that port and nothing else.
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
