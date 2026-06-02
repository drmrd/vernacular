# Roadmap

Vernacular ships in phases. Each phase produces working, testable
software and has its own implementation plan in `docs/plans/`. The
authoritative phase list is in the design specification, section 10.
This file is a short status view.

## Current status

Phase 0 in progress (build foundation, documentation, engineering
norms, source skeleton, proof of life). Not yet usable as a floor
planner.

## MVP path (phases 0 through 6)

| Phase | Focus                                                   | Status      |
| ----- | ------------------------------------------------------- | ----------- |
| 0a    | Build foundation (TS, Vite, React, Vitest, ESLint, CI)  | done        |
| 0b    | Documentation surface (this set)                        | in progress |
| 0c    | CLAUDE.md, Claude agents, knowledge graph               | next        |
| 0d    | Lint rule expansion, Husky, commitlint, release-please  | pending     |
| 0e    | Testing scaffolds (Playwright, Storybook, Lighthouse)   | pending     |
| 0f    | Six-layer source skeleton                               | pending     |
| 0g    | Wall-drawing proof of life (first user flow)            | pending     |
| 0h    | Storage scaffolds (OPFS, IndexedDB, File System API)    | pending     |
| 0i    | Service worker, vernacular-pack CLI                     | pending     |
| 0j    | Phase 0 acceptance                                      | pending     |
| 1     | Two-dimensional plan editor                             | pending     |
| 2     | Three-dimensional preview with color-temperature slider | pending     |
| 3     | Furniture import and curated starter library (alpha)    | pending     |
| 4     | Old-house architectural vocabulary                      | pending     |
| 5     | Multi-floor and stairs (beta)                           | pending     |
| 6     | Paint, export, site metadata (1.0)                      | pending     |

## Beyond 1.0

| Phase | Focus                                               | Notes                |
| ----- | --------------------------------------------------- | -------------------- |
| 7     | DXF import; competitor migration via underlay path  | quick follow-on      |
| 8     | Lighting fidelity (solar position, baked GI, BRDFs) | high priority post-1 |
| 9     | Pathing critic with room-purpose-specific rules     | research-flavored    |
| 10    | Code-plugin runtime, image-to-3D, cloud sync        | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next phases
above. Open an issue first to discuss any non-trivial change. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
