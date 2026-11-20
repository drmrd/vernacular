---
slug: decisions/ADR-0188-project-id-address-and-index-record
title: 'ADR-0188: A project has a random id, an address, and a record in the project index'
type: decision
tags: [storage, project-identity, projects, boot, routing, assets]
related:
  [
    decisions/ADR-0183-own-id-for-a-project-started-after-a-failed-load,
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0187-projects-page-with-document-identity,
    decisions/ADR-0189-one-writer-and-second-tab-sees-projects-page,
    decisions/ADR-0191-export-on-every-card-and-unchecked-copy,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0030-additive-storage-capabilities,
  ]
sourceFiles:
  [
    app/app.tsx,
    app/use-project-actions.ts,
    storage/filesystem/directory-handle-store.ts,
    core/export/svg/svg-plan-exporter.ts,
  ]
status: current
updated: 2026-11-19
---

# ADR-0188: A project has a random id, an address, and a record in the project index

## Status

Current. The owner took decisions 2 and 9 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15: open the most recent
project at start, and give each project its own address. On the same day the owner confirmed the
rule below for a folder handle that an older build stored, in place of moving the folder project
in this stage, and approved the rest with that specification. It amends ADR-0183, whose port the
project index takes over, and it supersedes the recent-project store of ADR-0030. The code changes
with #685. Until then the application opens one id, the remembered id of ADR-0183 decides it, and
the recent-project store holds one entry at most.

> Updated on 2026-11-18. The application no longer has one project slot. New project, Open file, a
> newly picked folder, and a project started after a failed load each get a new id from
> `newProjectId`. That id still has the form `project-<uuid>`
> (`storage/active-project/active-project-id-store.ts`). The recent-project store keeps one entry
> for each id, and the remembered id of ADR-0183 follows the last workspace project saved on a
> durable store. The project index, the addresses, and the preview are not built yet. A workspace
> project on the IndexedDB fallback still gets no recent entry. On that fallback, once the project
> made by New project or Open file is saved, the earlier project stays stored, but nothing in the
> application opens it again.

> Updated on 2026-11-19. The project index exists. `ProjectIndex` in `storage/project-index/` has
> `all`, `get`, `put`, and `remove`, with an IndexedDB form and an in-memory form. The browser
> build wraps the IndexedDB form in `withMemoryFallback`, which answers from memory when the first
> index cannot be read or gives no answer within ten seconds. A record holds the id and the
> location, then the three parts named above: the facts of the document, the time of the last
> change from the store, and the time of the last use with the result of the last open. The
> document handle writes the record. It writes after an open that read the stored project and
> after a save that the store accepted, and never ahead of the store, so a project that was never
> stored has no record. A failed open adds its result to the record that is already there.
> `reconcileIndex` in `session/projects/` rebuilds the index from the stored projects. It drops the
> record of a workspace project that is gone and keeps a folder record as it is. It keeps a record
> whose time of change still matches the store, and rebuilds every other record from the stored
> document. It never rejects, and calls that overlap share one run. The same run turns the id that
> the older build remembered into the latest use of that project, and forgets the folder that the
> older build stored under `'current'` without reopening it. A new project id is now a bare UUID
> from `newProjectId`. The form `project-<uuid>` and the id `'current'` stay valid. The Project
> menu lists the five records used last, apart from the open project, through `recentRecords`.
> The start opens the workspace record used last, and opens `'current'` when there is none. The
> recent-project store and the port of the remembered id are deleted. The addresses and the
> Projects page are not built yet.

## Context

The application opens the id `'current'` (`app/app.tsx:50`). The first stage makes the id a value
that the boot code reads from a small port (ADR-0183). The recent-project store keeps an id, a
name, a backend, and a time, and since every record uses the one id, the list holds one entry at
most. A session on IndexedDB records nothing there. The application has no routing.

The Projects page (ADR-0187) needs a name, facts, and a preview for every project before any of
them loads, including a folder project whose folder the browser has not yet granted again.

## Decision

- A new project gets a random UUID as its id. The id is the key in the store and in the index.
- The id is not written into the document, so one file imported twice makes two projects.
- The project that exists today keeps the id `'current'`. Its stored files are not moved, because
  a move that stops halfway is a way to lose them.
- An older build that opened a folder stored the folder's handle under `'current'` and then saved
  every edit to the browser, never to the folder. The copy in the browser is the newer one, and it
  gets the card. The stored handle is not carried over. The folder's files are not touched, and
  Open folder adds the folder as a project of its own. Moving or copying a project between the
  browser and a folder stays later work.
- A project index holds one record per project the workspace knows. A record carries the id and
  the location, and three parts:
  - derived from the document: the name, the number of floors, the preview, and the list of assets
    the document refers to;
  - reported by the store: the time of the last change, which is the time of the last save;
  - neither: the time of the last use (an open or a save), and the result of the last attempt to
    open, with the build that made it.
- The derived part can be rebuilt by decoding the document. When the time of the last use is lost,
  the time of the last change stands in for it.
- A project that does not decode gets its name and its asset list from a best-effort read of the
  stored file. When that read gives no name, the card shows a fixed placeholder.
- The Projects page reads a project as failed from the result in its record. When the build has
  changed since the failure, the page checks the project again.
- Projects in the browser share one asset pool, and a folder project has its own pool in its
  folder. A delete removes an asset from the shared pool only when no other record and no entry of
  the user's library lists it. While the workspace holds another project that did not open, a
  delete removes no asset, because the list of that project can be incomplete. A project in the
  workspace store that has no record counts the same way, and so does one whose record is older
  than its stored document. Assets inside a folder project are never removed.
- The index is a port in `storage/`, with a browser implementation and an in-memory one. It can be
  read before any project loads, and it is not a project.
- The index replaces the recent-project store. It also takes over the remembered id of ADR-0183.
  The port of the first stage becomes an adapter over the index or goes away.
- At start the application opens the record with the latest use. With no record, it starts in an
  empty project.
- Each project has its own address, which carries its id. A reload opens the same project. The
  address works on a static host with no rewrite rule. It asks the server for nothing but the
  application shell, so it works offline wherever the shell is served offline.
- The form of the address is left to the builder. Parsing an address and making one are pure
  functions in `app/`, and `session/` knows nothing about addresses.
- The preview is a drawing of the first floor with no text, made by a pure function in `core/`,
  stored as text, and shown through an image element.

## Consequences

- An existing user finds their project after the upgrade with no action. It opens at start and has
  a card.
- ADR-0183 gets a note that the index takes over its port. Section 5.3 of the design specification
  changes, and the backend is remembered in the record.
- The `'current'` id is local to a browser. It would get a new id if projects ever leave the
  browser.
- An address form that fails on a static host or offline shows only after a deploy.
- A card can show the facts of a folder project before the folder is granted again.
- A user whose older build opened a folder finds the browser copy on a card, and finds the folder
  again only by opening it. The folder's files may be older than the browser copy.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 3, 5.3, 5.5, 5.6, 5.9,
  and 8.
- ADR-0183, whose port the index takes over, ADR-0030, whose recent-project store it replaces, and
  ADR-0175.
- Issues #685 and #588.
