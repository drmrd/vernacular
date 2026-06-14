# Architecture

The authoritative design specification for Vernacular is at
[`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md).
That document is the source of truth for every architectural decision.
Read it first.

This file is a tour pointer for contributors who want a quick map of
the codebase, not the spec itself.

## Six-layer structure

The codebase is divided into six layers. Each layer depends only on the
layers below it. Layer-crossing imports are enforced by ESLint
boundary rules (ADR-0012, ADR-0017).

```
+------------------------------------------------------------+
|  app/         Top-level routes, providers, app state       |
+------------------------------------------------------------+
|  editor/      React UI: shell, tools, panels, gizmos       |
+------------------------------------------------------------+
|  bridge/      R3F glue, the command-dispatch boundary      |
+------------------------------------------------------------+
|  engine/      Three.js scene management, renderers, loaders|
+------------------------------------------------------------+
|  storage/     Project store, library store, asset cache    |
+------------------------------------------------------------+
|  core/        Pure-TS domain. No React. No Three.js.       |
|               Types, project model, registries, commands,  |
|               units, color, geometry, import/export        |
|               interfaces.                                  |
+------------------------------------------------------------+
```

Hard invariants:

- `core/` has zero React, zero Three.js, zero DOM imports. Pure TS,
  testable in Node.
- `engine/` is the only layer that imports Three.js.
- `bridge/` is the only place that touches both React state and
  Three.js scene state. All mutations flow through `dispatch(command)`
  at this boundary.
- `storage/` exposes provider interfaces; multiple implementations
  exist (file system, OPFS, zip bundle, future cloud sync).

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
(Phase 1) are complete: all six layers are scaffolded and in active use,
from the pure-TypeScript domain, registries, commands, and scene-graph
derivation in `core/`, through the durable project stores in `storage/`,
the Canvas plan renderer and accessible DOM overlay in `editor/`, and the
command-dispatch boundary in `bridge/`. The `engine/` Three.js layer holds
the scene-renderer skeleton. The remaining MVP work proceeds as the parallel
delivery tracks recorded in ADR-0044 and `docs/delivery-strategy.md`, beginning
with the three-dimensional preview, the assets and furniture pipeline, and the
user-experience foundation. Live per-item status is on the
[delivery roadmap board](https://github.com/users/drmrd/projects/3).
