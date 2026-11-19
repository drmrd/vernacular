---
slug: decisions/ADR-0175-session-layer-for-application-state
title: 'ADR-0175: A session layer holds application state and logic that needs no React'
type: decision
tags: [architecture, layers, session, bridge, lint]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0176-commands-as-data-and-session-undo-history,
    decisions/ADR-0177-open-transactions-for-changes-in-progress,
    decisions/ADR-0180-one-settings-port,
    decisions/ADR-0185-lint-warnings-fail-and-exceptions-are-recorded,
  ]
sourceFiles:
  [
    session/index.ts,
    session/testing/index.ts,
    session/editor-session/editor-session.ts,
    eslint.config.js,
    tests/architecture/layer-boundaries.test.ts,
  ]
status: current
updated: 2026-11-18
---

# ADR-0175: A session layer holds application state and logic that needs no React

## Status

Current. The owner chose this structure on 2026-11-14 and approved the architecture refactor round
specification (`docs/specs/2026-11-14-architecture-refactor-round.md`) the same day. It supersedes
the layer list in ADR-0001.

The `session/` directory exists. Its first tenants moved from `bridge/`: the editor session, dirty
tracking, the discard guard, the load helper, and autosave. Lint holds the table of this record and
the purity rules for `session/`. The files of `bridge/` and `editor/` that still import `storage/`
for the asset and library names are on the lint exception list, each with issue #717.
`session/testing` gives store doubles to tests and stories, and lint keeps it out of production
files. A test that must run layers its own layer may not import lives under `tests/cross-layer/`.
The document handle, the flows, and the settings service arrive with later pull requests of the
same stage.

> Amended on 2026-11-15 by section 5.1 of
> `docs/specs/2026-11-15-session-layer-and-document-identity.md`, which answers the question this
> record left open. `bridge/` and `editor/` keep no import from `storage/`, type-only imports
> included. A type that the upper layers need is exported from `session/`. A file that still
> imports `storage/` after that stage goes on the lint exception list, with the issue that removes
> it. That stage moves the editor session, the document handle, the flows, autosave, dirty
> tracking, and the settings service. The other tenants listed below move with the stages that
> rework them.

> Updated on 2026-11-18. The document handle (`session/handle/`) and the flows that open, switch,
> import, export, and restore projects (`session/flows/`) now live in `session/`, together with
> the ports they need (`session/ports.ts`). The application builds those ports in one place,
> `app/create-session-ports.ts`. The handle owns autosave. Dirty tracking and the load helper are
> gone, and the save status of the handle does their work. The production entry `session/index.ts`
> no longer exports `createEditorSession`, so production code gets a session only from a handle.
> `session/testing` gives tests and stories the session constructor, the in-memory store doubles,
> and the helpers of the handle and save-gate test kits. The settings service is still to come.

## Context

ADR-0001 set six layers: `core`, `storage`, `engine`, `bridge`, `editor`, `app`. The boundaries
between them hold. The trouble is what sits inside `bridge/` and around it. At `c788d0b2`,
`bridge/` carries the editor session, the React adapters, the 3D viewport, and about 990 lines of
visible interface. Thirty of its 84 files use neither React nor Three.js. About 72 of the 147 files
in `editor/plan` depend only on `core/`. The open, save, import, and export flows in `app/` are
React hooks. So the application logic that needs no React lives in three layers, and no layer name
describes it.

Two structures were considered.

Keeping six layers and adding lint rules inside them would make `bridge/session`, parts of
`editor/plan`, and a new group in `app/` free of React. The lint tool enforces a rule inside a layer
as firmly as a rule between layers, and nothing in `CLAUDE.md` would change. But the logic would
stay in three separate groups, and a contributor reading the layer list would not learn that it
exists.

Adding a layer gives that logic one home. A test, a script, or an agent could then drive the whole
editor (open a document, use a tool, undo, export) without rendering anything.

## Decision

Add a seventh layer, `session/`.

| Layer     | May import                  |
| --------- | --------------------------- |
| `core`    | nothing in the repo         |
| `storage` | `core`                      |
| `session` | `core`, `storage`           |
| `engine`  | `core`                      |
| `bridge`  | `core`, `session`, `engine` |
| `editor`  | `core`, `session`, `bridge` |
| `app`     | every layer                 |

`session/` holds the editor session, transactions, the selection and view stores, the document
handle, the open, save, import, and export flows, autosave, the settings service, the command
registry, key routing, and the tool state machines. It imports no React and no Three.js, and it
reaches browser APIs only through `storage/` ports.

`bridge/` keeps the React adapters over `session/` and `engine/` and nothing else. The 3D viewport
code moves into `engine/`, and the visible interface moves into `editor/`. `app/` becomes the place
where every service is built.

One rule decides where code goes. If it needs React it belongs in `bridge/` or `editor/`. If it
needs Three.js it belongs in `engine/`. If it is a pure function of the document it belongs in
`core/`. Whatever is left belongs in `session/`.

Files move in stages, each with the work that needs it. The first tenants are the document handle
and the open and save flows. The document codec itself is pure and lives in `core/`.

## Consequences

- `CLAUDE.md`, `.claude/rules.md`, `ARCHITECTURE.md`, the lint configuration, and the layer fitness
  test all change. The first two need owner sign-off.
- Cross-layer imports go through the layer barrels, so most path changes are mechanical.
- Behavior that today needs a rendered component to test can be tested as plain functions.
- A catch-all layer is a risk. The placement rule above is the guard, and lint enforces the import
  side of it.
- Seven files in `bridge/` and about a dozen in `editor/` import `storage/` today. Those uses move
  behind `session/`, and lint keeps allowing the import until they have moved. Whether a type-only
  import stays afterward is left to the first area specification.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.1.
- ADR-0001, the six-layer architecture this supersedes in part.
