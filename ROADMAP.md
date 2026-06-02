# Roadmap

Vernacular ships in milestones. Each milestone produces working, testable software and has its own implementation plan in `docs/plans/`. The authoritative milestone list is in the design specification, section 10. This file is a short status view.

## Current status

Foundation work in progress (build foundation, documentation, engineering norms, source skeleton, proof of life). Not yet usable as a floor planner.

## Foundation work

| Focus                                                               | Status      |
| ------------------------------------------------------------------- | ----------- |
| Build foundation (TS, Vite, React, Vitest, ESLint, CI)              | done        |
| Documentation surface                                               | done        |
| 15-day dependency cooldown (pnpm minimum-release-age)               | done        |
| Knowledge graph foundation (local-only, for Claude context)         | done        |
| Claude Code infrastructure (CLAUDE.md, agents, commands)            | done        |
| ESLint guardrails, layer boundaries, jscpd                          | done        |
| Husky, commitlint, release-please, PR and issue templates           | done        |
| Storybook, Playwright, axe-core, visual regression baselines        | done        |
| Lighthouse CI, Stryker, performance harness, fixtures and factories | in progress |
| Six-layer source skeleton                                           | pending     |
| Wall-drawing proof of life (first user flow)                        | pending     |
| Storage scaffolds (OPFS, IndexedDB, File System API)                | pending     |
| Service worker and pack CLI                                         | pending     |
| Foundation acceptance                                               | pending     |

## MVP path

| Focus                                                   | Status  |
| ------------------------------------------------------- | ------- |
| Two-dimensional plan editor                             | pending |
| Three-dimensional preview with color-temperature slider | pending |
| Furniture import and curated starter library (alpha)    | pending |
| Old-house architectural vocabulary                      | pending |
| Multi-floor and stairs (beta)                           | pending |
| Paint, export, site metadata (1.0)                      | pending |

## Beyond 1.0

| Focus                                                    | Notes                |
| -------------------------------------------------------- | -------------------- |
| DXF import; underlay-based migration from other planners | quick follow-on      |
| Lighting fidelity (solar position, baked GI, BRDFs)      | high priority post-1 |
| Pathing critic with room-purpose-specific rules          | research-flavored    |
| Code-plugin runtime, image-to-3D, cloud sync             | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next items above. Open an issue first to discuss any non-trivial change. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
