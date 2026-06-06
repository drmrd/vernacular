# Roadmap

Vernacular ships in milestones. Each milestone produces working, testable software and has its own implementation plan in `docs/plans/`. The authoritative milestone list is in the design specification, section 10. This file is a short status view.

## Current status

Foundation work complete (build foundation, documentation, engineering norms, source skeleton, proof of life, acceptance). The MVP path is underway, starting with the two-dimensional plan editor (design specification section 10, Phase 1), which is delivered as roughly twelve independent slices; slices 1 (wall topology and room derivation), 2 (units and measurement), 3 (pan, zoom, grid, and rulers), and 4 (snapping) are done. Not yet usable as a floor planner.

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
| Two-dimensional plan editor                             | in progress |
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

### Phase 1: two-dimensional plan editor

The two-dimensional plan editor (design specification section 10, Phase 1) is delivered as roughly twelve independent slices, each with its own implementation plan in `docs/plans/` and its own red-green-blue cycle. Build order follows dependencies: geometry and model core first, then the interactive surface, then editing tools, then persistence.

| Slice                                                                               | Status  |
| ----------------------------------------------------------------------------------- | ------- |
| 1. Wall topology and room derivation (junctions, room polygons, area, plan fill)    | done    |
| 2. Units and measurement (imperial and metric parsing and formatting)               | done    |
| 3. Pan and zoom infinite canvas, grid, rulers                                       | done    |
| 4. Snapping (endpoint, midpoint, perpendicular, parallel, grid)                     | done    |
| 5. Selection (click, marquee, multi-select) and the hit-test index                  | pending |
| 6. Wall editing (endpoint move, thickness, construction type)                       | pending |
| 7. Openings (doors and windows: placement and editing)                              | pending |
| 8. Room naming and labeling, custom-polygon override                                | pending |
| 9. Dimensions (live and persisted) and thickness-aware area                         | pending |
| 10. Clipboard and transforms (copy, paste, delete, move, rotate)                    | pending |
| 11. Project stores, save/open/recent, autosave sidecar, migrations, multi-tab locks | pending |
| 12. Image underlay with calibration                                                 | pending |

**Slice 1 (done) scope and deferrals.** Slice 1 derives rooms as a pure, memoized projection of the wall model (no stored room state) and fills them in the two-dimensional plan. Deliberately deferred, by design:

- **Centerline polygons.** Room polygons and area use wall centerlines; thickness-aware interior inset (clear-area polygons) lands with slice 9 (dimensions and area).
- **No formatted area labels.** The numeric room area is carried for later consumers; human-readable labels (for example `12.5 m²`) need the unit formatters from slice 2 and the labeling work in slice 8.
- **No room selection or hit-testing.** Selecting a room and a room spatial index belong with slice 5.
- **No custom-polygon override or room naming.** Those are slice 8.
- **Best-effort only, documented:** collinear overlapping walls, polygons with holes (courtyard or island), and self-touching topologies. Zero-length walls are ignored.

**Slice 3 (done) scope and deferrals.** Slice 3 turns the fixed scale-only viewport into an interactive infinite canvas: smooth (non-stepped) pan (middle-mouse and spacebar-drag) and zoom-to-cursor (scroll and trackpad), an adaptive grid, rulers, and a fit-to-content key. All coordinate transforms and grid/ruler computation are pure, unit-tested modules; the Canvas-and-pointer wiring is thin glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **Raw ruler labels (unit-aware formatting deferred).** Ruler tick labels show the raw millimetre value (for example `1000`), spaced at a readable, grid-aligned interval so they do not crowd at any zoom. Human-readable, unit-aware labels (for example `1 m` or `3' 4"`) need the formatters from slice 2 (units and measurement) and follow there. This mirrors the slice-1 deferral of formatted area labels.
- **Snap-to-selection.** `computeFitViewport` accepts any bounds, so fitting to the current selection is a one-line caller change; this slice wires only fit-to-content (the `f` key). Fit-to-selection follows once selection lands fully in slice 5.
- **DOM overlay mirroring and animated camera.** The design specification's DOM overlay for interactive UI (selection rings, dimension chips, snap indicators) and any inertial or animated pan/zoom are later polish; this slice renders grid and rulers on the Canvas and pans/zooms without animation.
- **Canvas owns the grid.** The plan canvas now draws the only grid (pan- and zoom-aware); the static CSS graph-paper backdrop that was locked to one scale has been removed so the grid no longer desyncs from the content when the camera moves.
- **Visual-regression baseline.** Grid and rulers intentionally change the rendered plan, so the darwin screenshot baseline was refreshed to match. Continuous integration skips visual regression where no platform baseline exists (so it stays green on linux); the baseline will need another refresh once later slices change the home view (for example the save/open chrome). The functional wall-drawing end-to-end spec is unaffected because the default viewport keeps the original scale and a zero pan offset, so pointer-to-world mapping is unchanged.

**Slice 4 (done) scope and deferrals.** Slice 4 adds interactive snapping to wall drawing: while a wall is being drawn, the moving cursor snaps to the best nearby feature (a wall endpoint, a wall midpoint, a perpendicular or parallel line through the in-progress start, or the grid), resolved in a fixed priority order (endpoint, then midpoint, then perpendicular, then parallel, then grid), and a snap indicator is painted at the snapped point. The snap computation is a pure, unit-tested module (`editor/plan/snap.ts`); the indicator drawing extends the narrow plan-drawing seam, and the Canvas-and-pointer wiring is thin glue validated by the wall-drawing end-to-end spec. The perpendicular and parallel line-projection math lives inside `snap.ts` (not `core/geometry/`), so this slice stays decoupled from the selection work in slice 5. Deliberately deferred, by design:

- **Snapping while editing walls.** Snapping applies to wall drawing only. Snapping while dragging an existing wall endpoint or moving a wall is part of slice 6 (wall editing) and follows there, mirroring the slice-3 deferral of fit-to-selection until selection lands.
- **The five listed kinds only.** Snap to wall-line intersections (where two existing wall lines cross), snap to the nearest point along a wall edge (an on-wall snap rather than to an endpoint or midpoint), and absolute angle and orthogonal snaps (0, 45, and 90 degrees against the world axes, independent of any existing wall) are deferred. The slice ships the endpoint, midpoint, perpendicular, parallel, and grid kinds the design specification names for Phase 1, and no others.
- **Snap settings UI.** Per-kind enable and disable toggles and a user-configurable snap threshold belong with the editor-preferences surface (the design specification lists snap thresholds among editor preferences). This slice uses fixed default constants; wiring them to a preferences panel is a follow-up.
- **DOM-overlay snap indicators.** The snap indicator is painted on the Canvas, consistent with the slice-3 decision to draw the grid and rulers on the Canvas. The design specification's DOM-overlay snap indicators (CSS transforms mirroring the Canvas world matrix) are later polish and follow with the overlay work.
- **Wall-drawing end-to-end spec preserved.** The default viewport keeps the original scale and a zero pan offset, so the pointer-to-world mapping is unchanged; with grid snapping enabled the cursor lands on deterministic grid-aligned coordinates, and the functional wall-drawing end-to-end spec still passes.

## Beyond 1.0

| Focus                                                    | Notes                |
| -------------------------------------------------------- | -------------------- |
| DXF import; underlay-based migration from other planners | quick follow-on      |
| Lighting fidelity (solar position, baked GI, BRDFs)      | high priority post-1 |
| Pathing critic with room-purpose-specific rules          | research-flavored    |
| Code-plugin runtime, image-to-3D, cloud sync             | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next items above. Open an issue first to discuss any non-trivial change. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
