# Architecture

The authoritative design specification for Vernacular is at
[`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md).
That document is the source of truth for every architectural decision.
Read it first.

This file is a tour pointer for contributors who want a quick map of
the codebase, not the spec itself.

## Seven-layer structure

The codebase is divided into seven layers. Each layer depends only on the
layers below it, and the table after the diagram names the layers that
each one may import. Layer-crossing imports are enforced by ESLint
boundary rules (ADR-0012, ADR-0017, ADR-0175).

```
+------------------------------------------------------------+
|  app/         Top-level routes, providers, app state       |
+------------------------------------------------------------+
|  editor/      React UI: shell, tools, panels, gizmos       |
+------------------------------------------------------------+
|  bridge/      R3F glue, the command-dispatch boundary,     |
|               React adapters over session/                 |
+------------------------------------------------------------+
|  engine/      Three.js scene management, renderers, loaders|
+------------------------------------------------------------+
|  session/     Application state and logic. No React.       |
|               No Three.js.                                 |
+------------------------------------------------------------+
|  storage/     Project store, library store, asset cache,   |
|               settings port                                |
+------------------------------------------------------------+
|  core/        Pure-TS domain. No React. No Three.js.       |
|               Types, project model, registries, commands,  |
|               units, color, geometry, import/export        |
|               interfaces.                                  |
+------------------------------------------------------------+
```

A layer may import only the layers in its row of this table
(ADR-0175):

| Layer     | May import                  |
| --------- | --------------------------- |
| `core`    | nothing in the repo         |
| `storage` | `core`                      |
| `session` | `core`, `storage`           |
| `engine`  | `core`                      |
| `bridge`  | `core`, `session`, `engine` |
| `editor`  | `core`, `session`, `bridge` |
| `app`     | every layer                 |

Hard invariants:

- `core/` has zero React, zero Three.js, zero DOM imports. Pure TS,
  testable in Node.
- `engine/` is the only layer that imports Three.js.
- `session/` imports no React and no Three.js and uses no DOM global.
  Lint enforces this. The layer holds the editor session, the document
  handle, the flows that open and switch projects, the discard guard,
  autosave, and the settings service.
- `bridge/` is the only place that touches both React state and
  Three.js scene state. All mutations flow through `dispatch(command)`
  at this boundary.
- `storage/` exposes provider interfaces; multiple implementations
  exist (file system, OPFS, zip bundle, future cloud sync).
- Browser storage APIs are used only in `storage/`. Lint enforces this
  in the seven other folders (ADR-0180).
- `bridge/` and `editor/` reach `storage/` only through `session/`. A
  file that still imports `storage/` is on the lint exception list with
  issue #717, which moves the asset and library ports behind `session/`.
  `session/testing` gives in-memory store doubles, the session
  constructor, and the helpers of the handle and save gate test kits.
  Lint lets only tests, stories, and test support modules (files named
  `*-test-support`) import it.

A project is open through a document handle (`session/handle/`), which
holds the editor session, the project lock, autosave, and the recovery
snapshots, and which saves the project. The flows in `session/flows/`
open, switch, import, export, rename, delete, and restore a project, and
remove a folder project from the list. A switch writes the open project
before it opens the next one. A document that fails the format check does
not open, and the refusal writes no file of the project (ADR-0190). The
failure carries the repair that would fix it, when `core/repairs/` has one,
and the failed-open dialog of `editor/projects/` shows it. The flows
`openRepairedAsNew` and `replaceWithRepaired` (`session/flows/open-failed.ts`)
open the repaired document as a new project or replace the stored one. An
export of a project that did not open gives an unchecked copy of its stored
files, with its snapshots and backups (ADR-0191). A delete removes the
project's document, backups, snapshots, and record, and each pool asset that
no other project and no library item uses. It removes no asset while the
asset list of any project is not known. A record lists the assets of the
current document only, so a delete can still remove bytes that a snapshot, a
backup, or an undo step of another project names. Remove from list forgets
the folder and its record and touches no file of the folder. The handle also
writes the project index, the store of one record per project. The start,
the recent list, and the cards of the Projects page (`listProjectCards` in
`session/projects/project-cards.ts`) read it through `reconcileIndex`
(`session/projects/`), which rebuilds the index from the project store. In
`app/`, one hook, `useOpenProject` in `app/use-open-project.ts`, holds the
one open handle and runs one flow at a time. `app/create-session-ports.ts`
is the one production file of `app/` that names a store (ADR-0212).

The address of a project lives in `app/`. `app/address.ts` reads and
writes the fragment of the page address, `app/use-history-navigation.ts`
follows it, and `app/address-bar.ts` is the only place that names the
browser history. `session/` knows no address: the start and a switch
take an open request, which `startProject` and `requestFor` build from
the project index (ADR-0188).

## Where to find things

| Topic                             | Where to look                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full design rationale             | `docs/specs/2026-06-01-vernacular-design.md`                                                                 |
| Per-phase implementation plans    | `docs/plans/`                                                                                                |
| Delivery strategy and roadmap     | [`docs/delivery-strategy.md`](docs/delivery-strategy.md), [board](https://github.com/users/drmrd/projects/3) |
| Contributing                      | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                         |
| License and required attributions | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE)                                                                     |
| Architecture decision records     | `docs/knowledge/decisions/`                                                                                  |

## Subagents and slash commands

The repository ships with project-local subagents under `.claude/agents/` and slash commands under `.claude/commands/`. Together they drive the project's red-green-blue TDD workflow:

- `/test-first <behavior>` writes a failing test (RED).
- `/implement` makes it pass minimally (GREEN).
- `/clean-code-review` audits the diff.
- `/refactor` applies the audit findings or marks the BLUE phase clean.
- `/review` performs the pre-merge audit on the full branch.

See `CLAUDE.md` for the full command list and `.claude/rules.md` for the rubric the agents use. ADR-0011 documents the architecture.

## Status

The bootstrap foundation (Phase 0) and the two-dimensional plan editor
(Phase 1) are complete: all seven layers are scaffolded and in active use,
from the pure-TypeScript domain, registries, commands, and scene-graph
derivation in `core/`, through the durable project stores in `storage/`,
the editor session (which holds the dispatcher) and autosave in `session/`,
the Canvas plan renderer and accessible DOM overlay in `editor/`, and the
React adapters over the session in `bridge/`. The `engine/` Three.js layer holds
the scene-renderer skeleton. The remaining MVP work proceeds as the parallel
delivery tracks recorded in ADR-0044 and `docs/delivery-strategy.md`, beginning
with the three-dimensional preview, the assets and furniture pipeline, and the
user-experience foundation. Live per-item status is on the
[delivery roadmap board](https://github.com/users/drmrd/projects/3).
