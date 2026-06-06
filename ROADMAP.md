# Roadmap

Vernacular ships in milestones. Each milestone produces working, testable software and has its own implementation plan in `docs/plans/`. The authoritative milestone list is in the design specification, section 10. This file is a short status view.

## Current status

Foundation work complete (build foundation, documentation, engineering norms, source skeleton, proof of life, acceptance). Next is the MVP path, starting with the two-dimensional plan editor (design specification section 10, Phase 1). Not yet usable as a floor planner.

## Foundation work

| Focus                                                                             | Status |
| --------------------------------------------------------------------------------- | ------ |
| Build foundation (TS, Vite, React, Vitest, ESLint, CI)                            | done   |
| Documentation surface                                                             | done   |
| 15-day dependency cooldown (pnpm minimum-release-age)                             | done   |
| Knowledge graph foundation (local-only, for Claude context)                       | done   |
| Claude Code infrastructure (CLAUDE.md, agents, commands)                          | done   |
| ESLint guardrails, layer boundaries, jscpd                                        | done   |
| Husky, commitlint, release-please, PR and issue templates                         | done   |
| Storybook, Playwright, axe-core, visual regression baselines                      | done   |
| Lighthouse CI, Stryker, performance harness, fixtures and factories               | done   |
| Six-layer source skeleton (core, storage, engine, bridge, editor, app all landed) | done   |
| Wall-drawing proof of life (first user flow)                                      | done   |
| Storage scaffolds (OPFS, IndexedDB, File System API)                              | done   |
| Service worker and pack CLI                                                       | done   |
| Foundation acceptance                                                             | done   |

> **Deferred from Phase 0 with intent:** the `clean-code-pr` CI gate (design specification sections 9.7 and 9.11) is not yet built. The clean-code-reviewer is a model-driven agent that runs locally during the BLUE phase; the intended implementation is a CI job that runs the reviewer over the pull-request diff and fails on must-fix findings. That needs a model credential, per-pull-request cost, and non-deterministic-output handling, so it is scheduled as a follow-on rather than a Phase 0 blocker. The ping-pong gate (`pnpm rgb:audit`) enforces the red-green-blue ordering, independence, and blue-presence invariants in the meantime.

## MVP path

| Focus                                                   | Status      |
| ------------------------------------------------------- | ----------- |
| Project stores, persistence, and migrations             | in progress |
| Two-dimensional plan editor                             | pending     |
| Three-dimensional preview with color-temperature slider | pending     |
| Furniture import and curated starter library (alpha)    | pending     |
| Old-house architectural vocabulary                      | pending     |
| Multi-floor and stairs (beta)                           | pending     |
| Paint, export, site metadata (1.0)                      | pending     |

> **Project stores, persistence, and migrations (deferred with intent):** the
> durable folder, OPFS, and `.house.zip` stores, the schema-and-registry
> migration framework, autosave sidecar snapshots with crash recovery, the
> recent-project list, and Web Locks multi-tab safety are built and tested
> (OPFS, IndexedDB recent, and Web Locks adapters are verified end to end in
> Chromium and Firefox). Deferred follow-ups: switching the running app default
> to the OPFS store (needs async-boot wiring); a WebKit-compatible OPFS write
> path (main-thread `createWritable` is unsupported, so a worker-side sync access
> handle is needed); the `.house.zip` export and folder-picker controls in the
> shell (the stores exist; only the browser download and native-picker glue are
> pending); `writeHistory` and `packsRequired` project-meta fields (a coordinated
> shared-schema change); generation of `assets/`, `previews/`, and
> `ATTRIBUTIONS.md` (owned by the asset and pack work); the quota and eviction UI;
> and the async-with-progress migration surface for very large projects.

**Phase 1, units and measurement (`core/units/`): done.** Imperial and metric display
formatting with multiple imperial forms (`6'8"`, `6.667'`, `80"`, and fractional inches),
tolerant input parsing, per-category display precision, and no round-trip drift between the
parser and formatter. Deferred (documented in the slice plan): area and volume units, angle
and bearing units, localized unit symbols and locale-aware number formatting
(internationalization), reconciling the design specification's "SI meters" wording with the
model's millimeter storage (see ADR-0027), and a branded `Millimeters` type.

## Beyond 1.0

| Focus                                                    | Notes                |
| -------------------------------------------------------- | -------------------- |
| DXF import; underlay-based migration from other planners | quick follow-on      |
| Lighting fidelity (solar position, baked GI, BRDFs)      | high priority post-1 |
| Pathing critic with room-purpose-specific rules          | research-flavored    |
| Code-plugin runtime, image-to-3D, cloud sync             | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next items above. Open an issue first to discuss any non-trivial change. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
