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
(boundary rules land in Phase 0d).

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

| Topic                                  | Where to look                                   |
| -------------------------------------- | ----------------------------------------------- |
| Full design rationale                  | `docs/specs/2026-06-01-vernacular-design.md`    |
| Per-phase implementation plans         | `docs/plans/`                                   |
| Current roadmap                        | [`ROADMAP.md`](ROADMAP.md)                      |
| Contributing                           | [`CONTRIBUTING.md`](CONTRIBUTING.md)            |
| License and required attributions      | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE)        |
| Architecture decision records (future) | `docs/knowledge/decisions/` (added in Phase 0c) |

## Subagents and slash commands

The repository ships with project-local subagents under `.claude/agents/` and slash commands under `.claude/commands/`. Together they drive the project's red-green-blue TDD workflow:

- `/test-first <behavior>` writes a failing test (RED).
- `/implement` makes it pass minimally (GREEN).
- `/clean-code-review` audits the diff.
- `/refactor` applies the audit findings or marks the BLUE phase clean.
- `/review` performs the pre-merge audit on the full branch.

See `CLAUDE.md` for the full command list and `.claude/rules.md` for the rubric the agents use. ADR-0011 documents the architecture.

## Status

Phase 0 is in progress. The current state of the codebase is the
build foundation only: a working TypeScript + React + Vite + Vitest
skeleton with a single-component smoke test. Most of the architecture
described above is still ahead of us; it will land incrementally
through Phases 0f and 0g, then Phase 1 onward.
