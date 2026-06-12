# Roadmap

Vernacular ships in milestones. Each milestone produces working, testable software and has its own implementation plan in `docs/plans/`. The authoritative milestone list is in the design specification, section 10. This file is a short status view.

## Current status

Foundation work is complete (build foundation, documentation, engineering norms, source skeleton, proof of life, acceptance). Phase 1, the two-dimensional plan editor, is complete and shipped as release 0.2.0; its fourteen slices are detailed in the Phase 1 section below. The rest of the MVP runs as parallel delivery tracks that converge on the public-alpha, public-beta, and 1.0 milestones (ADR-0044).

Three larger efforts have merged in full since the parallel-track foundations landed (pull request #48). The Vernacular Floor Plan Format is published: the `.building` package, a CORE JSON Schema generated from the `core/model` types, load-time format preservation, and a conformant fixture corpus (ADR-0047, ADR-0051, ADR-0052). The editor experience makeover wired the built-but-unmounted surfaces into a coherent shell and added the interaction layer the editor lacked: a command registry, palette, keybindings, undo and redo, delete, the wall-drawing and snapping completion, paint wiring, donut and courtyard rooms, and a journey-test acceptance gate that makes "reachable from the assembled editor" an enforced requirement. Surface paint selection and treatments shipped on top of the paint model.

The work in progress is the three-dimensional preview track. It builds the lit shell slice by slice, lives on a local branch, and has not merged yet. The capability tables below carry the slice-level state for every track: what has merged, what is finished locally but unmerged, what is mid-flight, and what is planned or only scoped.

## Foundation work

| Focus                                                                             | Status |
| --------------------------------------------------------------------------------- | ------ |
| Build foundation (TS, Vite, React, Vitest, ESLint, CI)                            | done   |
| Documentation surface                                                             | done   |
| 30-day dependency cooldown (pnpm minimum-release-age), exact version pins         | done   |
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

Phase 1 (the two-dimensional plan editor) and the project-stores work are done. The remaining MVP work is re-sequenced from a strict phase chain into parallel delivery tracks that converge on the public-alpha, public-beta, and 1.0 milestones (ADR-0044). The re-sequencing is possible because Phase 1 already shipped the decoupling layer (scene-graph derivation, the registry pattern, and the single dispatch boundary): a new entity kind is an additive scene-graph projection that the two-dimensional renderer, the three-dimensional renderer, and the export pipeline each pick up independently, so "what an entity is" is independent of "how each surface draws it."

### Capabilities and work items

A capability is a user-facing feature; the work items under it are the stories that build it. Status vocabulary:

- **merged**: on `main`.
- **complete (local)**: the full red-green-blue cycle is done on a local branch, not yet merged.
- **in progress**: implementation underway, mid-cycle.
- **planned**: a dedicated spec or plan exists; implementation has not started.
- **scoped**: named in an accepted spec or in the ADR-0044 track map, with no dedicated plan and no implementation yet.
- **not refined**: no decomposition yet, so no stories are listed.

#### Overview

| Capability                      | Refined into                        | Overall status                      |
| ------------------------------- | ----------------------------------- | ----------------------------------- |
| Phase 1: two-dimensional editor | 14 slice specs and plans            | merged (0.2.0)                      |
| Vernacular Floor Plan Format    | format spec, ADR-0047, four plans   | merged                              |
| Editor experience makeover      | makeover spec, ten slice plans      | merged (one local follow-up)        |
| Three-dimensional preview       | foundation spec, slice map (0 to 8) | in progress                         |
| Paint and metadata              | ADR-0048, ADR-0056                  | merged (3D painted preview pending) |
| Structure and multi-floor       | ADR-0044 track, foundation plan     | foundation merged; rest scoped      |
| Old-house vocabulary            | ADR-0044 track, ADR-0046            | registries merged; rest scoped      |
| Assets and furniture            | ADR-0044 track, ADR-0007            | foundation merged; rest scoped      |
| Output and export               | ADR-0044 track                      | 2D export merged; rest scoped       |
| User-experience foundation      | ADR-0044 track                      | merged (subsumed by the makeover)   |
| Beyond 1.0                      | not yet decomposed                  | not refined                         |

#### Vernacular Floor Plan Format (merged)

| Story                                                                                   | ADR / PR            | Status |
| --------------------------------------------------------------------------------------- | ------------------- | ------ |
| CORE JSON Schema (`schema/8`), Ajv validator, drift guard, fixtures, extension seam     | ADR-0047 / #50      | merged |
| File rename `project.json` to `vernacular.json`, `.house.zip` to `.building` (breaking) | #51                 | merged |
| Format preservation and load-time validation                                            | ADR-0051 / #54      | merged |
| Corpus-conformant fixture tiers                                                         | ADR-0052 / #62, #63 | merged |

#### Editor experience makeover (merged; one local follow-up)

| Story                                                              | ADR / PR            | Status           |
| ------------------------------------------------------------------ | ------------------- | ---------------- |
| Journey-test harness and integration-acceptance gate               | ADR-0049 / #49      | merged           |
| Drafting-table retheme (light and dark)                            | #52                 | merged           |
| Shell IA, command registry, palette, keybindings, undo/redo/delete | ADR-0050 / #53      | merged           |
| Split-pane 2D/3D viewport, view modes, selection sync              | ADR-0057 / #56      | merged           |
| Per-active-floor rendering and floor switcher                      | #57                 | merged           |
| Adaptive unit display                                              | #58                 | merged           |
| Cancel in-progress wall                                            | #59                 | merged           |
| Edit-wall-endpoint journey                                         | #60                 | merged           |
| Opening-host guard                                                 | #65                 | merged           |
| Along-wall and intersection snaps                                  | ADR-0053 / #66      | merged           |
| Smart angle snap                                                   | ADR-0054 / #67      | merged           |
| Chained-polyline wall drawing                                      | ADR-0055 / #69      | merged           |
| Immediate-commit wall drawing (supersedes ADR-0055)                | ADR-0060            | complete (local) |
| Precision snapping panel and editor preferences                    | ADR-0059 / #73      | merged           |
| Paint, finish, and site-metadata wiring and polish                 | ADR-0056 / #64, #74 | merged           |
| Donut and courtyard rooms (hole rings)                             | ADR-0058 / #72      | merged           |

#### Three-dimensional preview (in progress)

Slice numbers follow the foundation spec slice map. The track built slice 1, then moved ahead to the floor and ceiling slabs (slice 4) before the opening slices (2 and 3).

| Story (slice)                                                                                        | ADR            | Status           |
| ---------------------------------------------------------------------------------------------------- | -------------- | ---------------- |
| 0. Test harness, conventions, render harness                                                         | ADR-0045 / #48 | merged           |
| 0b. Live camera framing and framed-scene helper                                                      | --             | complete (local) |
| 1. Wall shell with junctions (extruded walls, material seam, surface groups, entity ids)             | ADR-0061       | complete (local) |
| 4. Per-room floor slabs and ceilings                                                                 | ADR-0062       | in progress      |
| 2. Opening voids (cut contour into host walls)                                                       | --             | scoped           |
| 3. Opening fill and leaf (panels, sashes, glass; curved-glass seam)                                  | --             | scoped           |
| 5. Camera navigation (presets, walk mode)                                                            | --             | scoped           |
| 6. Lighting (color-temperature slider, soft shadows, paint-material stub)                            | --             | scoped           |
| 7. Selection sync and 3D accessibility (raycast, DOM proxies, aria-live, color-blind-safe highlight) | --             | scoped           |
| 8. Incremental and dirty updates                                                                     | --             | scoped           |

#### Paint and metadata (merged; painted preview pending)

| Story                                                                  | ADR / PR            | Status                           |
| ---------------------------------------------------------------------- | ------------------- | -------------------------------- |
| Paint model, palette registry, color and finish pickers, site metadata | ADR-0048 / #48      | merged                           |
| Surface paint selection and treatments (and wiring, polish)            | ADR-0056 / #64, #74 | merged                           |
| Painted 3D preview (paint material on the per-surface groups)          | --                  | scoped (converges on 3D slice 6) |

#### Track features still at foundation

ADR-0044 names the stories for each of these tracks; only the foundation story has been built, so the rest are scoped, not yet individually planned.

| Capability                 | Story (named in ADR-0044)                                             | Status                         |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| Structure and multi-floor  | Floor management and multi-floor commands                             | merged (#48)                   |
| Structure and multi-floor  | Floor switcher UI                                                     | merged (#57)                   |
| Structure and multi-floor  | Stair entity, 2D symbol, floor-spanning topology                      | scoped                         |
| Structure and multi-floor  | Per-room ceiling height                                               | scoped                         |
| Structure and multi-floor  | Stair 3D geometry, cutaway, floor-by-floor 3D                         | scoped (converges on 3D)       |
| Old-house vocabulary       | Period/style and room-purpose registries                              | merged (#48, ADR-0046)         |
| Old-house vocabulary       | Surfacing shipped vocabulary, era tagging UI                          | scoped                         |
| Old-house vocabulary       | Curved 2D openings, trim and feature data, construction profiles (2D) | scoped                         |
| Old-house vocabulary       | 3D renderings; library era filtering                                  | scoped (convergence)           |
| Assets and furniture       | Asset cache, registry, resolution                                     | merged (#48, ADR-0007)         |
| Assets and furniture       | Pack format and CLI (full)                                            | scoped (Phase-0 scaffold only) |
| Assets and furniture       | Library browser, custom import, placement tool (2D)                   | scoped                         |
| Assets and furniture       | Furniture in 3D; bundle export with attributions                      | scoped (convergence)           |
| Output and export          | 2D plan export (SVG) in `core/export/`                                | merged (#48)                   |
| Output and export          | PDF and PNG (2D) exporters                                            | scoped                         |
| Output and export          | Standard exporters (`ifcJSON`, DXF)                                   | scoped                         |
| Output and export          | 3D snapshot export; bundle export                                     | scoped (convergence)           |
| User-experience foundation | Design tokens, theming, primitives, layout shell                      | merged (#48)                   |
| User-experience foundation | Drafting-table visual language                                        | merged (#52)                   |
| User-experience foundation | Empty and loading states, continuous polish                           | ongoing                        |

#### Beyond 1.0 (not refined)

These are named but not yet decomposed, so no stories are listed: DXF import and underlay-based migration; lighting fidelity (solar position, baked global illumination, physically based reflectance); a pathing critic with room-purpose rules; a code-plugin runtime; image-to-3D; and cloud sync.

### Dependency graph

Every track fans out from the shipped Phase-1 foundation and can start immediately. The only work that must wait is the bottom row of convergence nodes, which gate on the three-dimensional preview track, the assets track, or both.

```
        Phase-1 foundation (shipped): project model, scene-graph derivation,
        command dispatch, registries, hit-test and snapping, transforms,
        DOM overlay, two-dimensional renderer
                                  |
   +-----------+-----------+------+------+-----------+-----------+-----------+
   v           v           v             v           v           v           v
 3D          Assets &    Old-house     Structure   Output &    Paint &     User-
 preview     furniture   vocabulary    & multi-    export      metadata    experience
                                       floor                               foundation
 shell       pack CLI    era registry  floors      SVG export  paint model design
 renderer    asset cache room purpose  stair 2D    PDF export  palettes    tokens
 camera /    asset reg.  surface       + topology  PNG (2D)    color and   theming
 walk        library     historic      complete    standard    finish      component
 lighting +  browser     vocabulary    underlay    exporters   pickers     primitives
 color-temp  custom      curved 2D     (doc/scene, (ifcJSON,   site        layout
 split-pane  import      openings      trace)      DXF)        metadata    shell
 + selection placement   trim data                                        empty and
 sync        (2D)        wall/ceiling                                      loading
                         features                                         states
                         construction
                         profiles (2D)
   |           |           |             |           |           |           |
   +-----------+-----------+------+------+-----------+-----------+-----------+
                                  |
            Convergence nodes (each gates on the 3D preview track,
            the assets track, or both):
              - furniture in three dimensions          (needs 3D preview)
              - three-dimensional openings, trim,
                wall and ceiling features               (needs 3D preview + data)
              - parametric stair geometry, cutaway,
                floor-by-floor three-dimensional view   (needs 3D preview + structure)
              - painted preview                         (needs 3D preview + paint material)
              - library era filtering                  (needs library browser + era registry)
              - bundle export with attributions        (needs asset index)
```

### Start-now enablers

Three pieces of work depend only on shipped Phase-1 infrastructure, depend on nothing in each other, and unblock the most downstream work, so they start in parallel and are staffed first:

1. **The three-dimensional shell renderer**, because the three-dimensional view of openings, trim, features, stairs, the cutaway, the snapshot export, and the painted preview all converge on it.
2. **The asset cache and registry**, because furniture in three dimensions, the library browser, era filtering, the bundle export, and the palette pack all hang off it.
3. **The design-system foundation**, because it is a dependency reducer: every user-interface-bearing node is cheaper and avoids re-polishing when the tokens, theming, and primitives exist first.

### Delivery tracks

| Track                      | Independent (start-now) portion                                                                                                                      | Converges later on                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Three-dimensional preview  | shell renderer, camera and walk, basic lighting and color-temperature slider, split-pane, selection sync                                             | nothing (it is the convergence target)                             |
| Assets and furniture       | pack format and CLI, asset cache, asset registry and resolution, library, custom import, placement (2D)                                              | furniture in three dimensions (3D preview)                         |
| Old-house vocabulary       | era registry and tagging, room-purpose registry, surfacing shipped vocabulary, curved 2D openings, trim and feature data, construction profiles (2D) | three-dimensional renderings (3D preview); era filtering (library) |
| Structure and multi-floor  | floor management, stair entity and 2D symbol and floor-spanning topology, complete underlay, per-room ceiling height                                 | stair 3D geometry, cutaway, floor-by-floor 3D (3D preview)         |
| Output and export          | vector, document, and image export of the 2D plan in `core/export/`; standard-format exporters                                                       | 3D snapshot export (3D preview); bundle export (asset index)       |
| Paint and metadata         | paint assignment model, palette registry, color and finish pickers, site metadata                                                                    | painted preview (3D preview paint material)                        |
| User-experience foundation | design tokens, theming, component primitives, layout shell, empty and loading states, then continuous polish                                         | nothing (it feeds every other track's UI)                          |

### Milestone composition

- **Public alpha** = the Phase-1 editor (done) plus the three-dimensional preview; the assets and furniture track delivered and de-risked end to end; the identity-bearing front of the old-house vocabulary (era registry, era tagging, room-purpose registry, and surfacing the already-shipped historic opening vocabulary); two-dimensional export (vector, document, image); and the user-experience foundation. The alpha leads with the product's identity, ships furniture, produces a real export artifact, and is reasonably polished.
- **Public beta** = multi-floor and stairs; the three-dimensional renderings of the old-house vocabulary; the complete underlay layer; and library era filtering.
- **1.0** = paint, palettes, and finishes; site metadata; full export including the bundle and standard formats; and the final polish pass.

### Open-standard interoperability

The native project model stays the source of truth. There is no established lightweight open standard for residential floor plans with room and era semantics; the one real open building-data standard (the Industry Foundation Classes, ISO 16739-1:2024, with its `ifcJSON` serialization) is full building-information-modeling and belongs behind the reserved exporter and importer seam, not at the core. Open standards land as exporters and importers within the output track (an `ifcJSON` exporter proves interoperability), and the project schema is published formally with the historic extensions namespaced so it can anchor an open reference over time. See ADR-0044. The published format now has a normative specification, the Vernacular Floor Plan Format (`docs/specs/2026-06-10-vernacular-floor-plan-format.md`) and ADR-0047, defining the packaging tiers, the registry-typed, reserved-namespace, and reverse-DNS extension seams, and a CORE JSON Schema generated from the `core/model` types and published under `schema/<version>/`; generating that schema, validating Documents in `core/`, and guarding against drift are being implemented now.

> **Two-dimensional plan editor (done):** the twelve build slices and both finishing slices, 13 (underlay asset persistence) and 14 (DOM overlay and accessibility), are done; together they close the remaining named Phase-1 acceptance items. Phase 1 is complete; the remaining MVP work proceeds as the parallel delivery tracks above (ADR-0044). See ADR-0041, ADR-0042, ADR-0043, and the Phase 1 section below.

> **Project stores, persistence, and migrations (slice 11 done):** the durable
> folder, OPFS, and `.house.zip` stores, the schema-and-registry migration
> framework, autosave sidecar snapshots with crash recovery, the recent-project
> list, and Web Locks multi-tab safety are built and tested, and the running app
> now boots against the capability-selected durable store (OPFS-preferred,
> IndexedDB fallback) with save, open, recent, the `.house.zip` export download,
> and the Chromium-family folder-open control all wired (verified end to end in
> Chromium and Firefox). Deferred follow-ups: a WebKit-compatible OPFS write path
> (main-thread `createWritable` is unsupported, so a worker-side sync access
> handle is needed); the `writeHistory` and `packsRequired` project-meta fields (a
> coordinated shared-schema change); generation of `assets/`, `previews/`, and
> `ATTRIBUTIONS.md` (owned by the asset and pack work); the quota and eviction UI;
> the take-ownership multi-tab flow; and the async-with-progress migration surface
> for very large projects. See the slice 11 deferrals below.

**Phase 1, units and measurement (`core/units/`): done.** Imperial and metric display
formatting with multiple imperial forms (`6'8"`, `6.667'`, `80"`, and fractional inches),
tolerant input parsing, per-category display precision, and no round-trip drift between the
parser and formatter. Deferred (documented in the slice plan): area and volume units, angle
and bearing units, localized unit symbols and locale-aware number formatting
(internationalization), reconciling the design specification's "SI meters" wording with the
model's millimeter storage (see ADR-0027), and a branded `Millimeters` type.

### Phase 1: two-dimensional plan editor

The two-dimensional plan editor (design specification section 10, Phase 1) is delivered as twelve build slices plus two finishing slices (13, 14), each with its own implementation plan in `docs/plans/` and its own red-green-blue cycle. Build order follows dependencies: geometry and model core first, then the interactive surface, then editing tools, then persistence. The twelve build slices and the two finishing slices (ADR-0041, ADR-0042, ADR-0043) are all done, closing the remaining named Phase-1 acceptance items; Phase 1 is complete.

| Slice                                                                               | Status |
| ----------------------------------------------------------------------------------- | ------ |
| 1. Wall topology and room derivation (junctions, room polygons, area, plan fill)    | done   |
| 2. Units and measurement (imperial and metric parsing and formatting)               | done   |
| 3. Pan and zoom infinite canvas, grid, rulers                                       | done   |
| 4. Snapping (endpoint, midpoint, perpendicular, parallel, grid)                     | done   |
| 5. Selection (click, marquee, multi-select) and the hit-test index                  | done   |
| 6. Wall editing (endpoint move and thickness; construction type deferred)           | done   |
| 7. Openings (doors and windows: placement and editing)                              | done   |
| 8. Room naming and labeling, custom-polygon override                                | done   |
| 9. Dimensions (live and persisted) and thickness-aware area                         | done   |
| 10. Clipboard and transforms (copy, paste, delete, move, rotate)                    | done   |
| 11. Project stores, save/open/recent, autosave sidecar, migrations, multi-tab locks | done   |
| 12. Image underlay with calibration                                                 | done   |
| 13. Underlay asset persistence (raster survives save and reopen)                    | done   |
| 14. DOM overlay and accessibility (ARIA, focus, keyboard nav; unit-aware labels)    | done   |

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

**Slice 5 (done) scope and deferrals.** Slice 5 makes the plan selectable: a click picks the wall or room under the cursor (a wall beats a room), a shift-click toggles into an additive multi-selection, a rubber-band marquee replaces the selection with everything fully inside it, and selected rooms gain a highlight while the marquee paints live during the drag. A broad-phase spatial index (the hit-test index) over per-entity axis-aligned bounds answers point and rectangle queries and backs the broad-then-narrow `hitTest`; the narrow phase reuses the nearest-wall-centerline rule and `pointInPolygon` for room containment. Selection state stays bridge-owned and outside undo history (ADR-0020). All the behavior lives in pure, unit-tested modules; the Canvas-and-pointer wiring is thin glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **Window (contained) marquee only.** The marquee selects entities fully inside the rectangle (a wall needs both endpoints inside, a room needs every vertex inside). Crossing selection (a right-to-left drag that also grabs partially overlapping entities) is deferred to a later editing slice.
- **Only walls and rooms are selectable.** Openings and furniture do not exist yet; they become selectable when their slices land (openings in slice 7), at which point they register their own bounds with the index.
- **Selection persistence and 2D-to-3D sync are later slices.** The store stays in-memory; autosave-snapshot persistence arrives with the project-stores slice (11) and the 3D selection sync with the 3D preview phase (design specification section 6.9).
- **The index is correctness-first.** It answers the contract's point and rectangle queries correctly; quadtree depth and rebalance tuning, and dirty-region incremental rebuilds (rebuilding only the changed region rather than the whole index per edit), are deferred until the entity count makes them measurable.

**Slice 6 (done) scope and deferrals.** Slice 6 makes an existing wall editable: dragging either endpoint of the selected wall moves it to a new, snapped position, and a unit-aware inspector input changes the selected wall's thickness. Both edits flow through `dispatch(command)` as two new undoable commands (`moveWallEndpoint` and `setWallThickness`) that reassign `state.floors` immutably so the dispatcher captures the inverse for undo (ADR-0005), and the room derivation re-runs from the wall graph after every edit. The endpoint drag reuses the slice-4 snapping and the slice-5 selection; `pickWallEndpoint` (the grab rule) and `drawEndpointHandles` (handles painted through the narrow plan-drawing seam) are pure, unit-tested modules, while the Canvas-and-pointer drag wiring and the inline thickness editor's shell placement are thin glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **Construction type.** This slice ships the two wall-editing operations fully specifiable against today's model (endpoint move and thickness). Construction type is deferred to the old-house architectural vocabulary milestone, which owns the construction-type registry and era-aware catalogs; `Wall` gains no `constructionType` field here, and editing it lands with that vocabulary work.
- **Perpendicular-drag thickness gizmo.** The design specification's perpendicular-drag thickness gizmo is deferred in favor of the inline unit-aware input, mirroring the slice-3 decision to paint rulers on the Canvas and defer the DOM-overlay gizmos.
- **Junction-cohesive dragging.** Moving a shared junction so every incident wall moves together is deferred; this slice moves only the selected wall's endpoint. The room derivation re-runs from the wall graph regardless, so a moved endpoint that lands on (or off) a junction reshapes the derived rooms either way.
- **Multi-wall batch editing.** Thickness editing and endpoint dragging act on a single selected wall; applying one thickness or one nudge across a multi-selection is later work, consistent with the slice-5 deferral of selection batch operations.
- **Default unit preferences for the thickness input.** The inline editor uses the default preferences for the project's `units` (metric or imperial) until a project-level unit-preferences store lands, mirroring the slice-3 deferral of unit-aware ruler labels.
- **Wall-drawing end-to-end spec preserved.** All editing wiring is gated on the `select` tool and the default viewport keeps the original scale and a zero pan offset, so the `draw-wall` pointer-to-world mapping is unchanged; the end-to-end spec now asserts the inspector's thickness input appears for the selected wall.
- **Keyboard affordances beyond click and marquee are deferred.** Select-all and arrow-key nudging are later work.

**Slice 7 (done) scope and deferrals.** Slice 7 makes openings first-class: the user picks an opening type, clicks a wall to place it, sees the correct architectural plan symbol drawn into a gap in the host wall, selects it, drags it along its wall, edits its size and sill height, flips its swing, and removes it. Openings are typed at the element level (an `Opening` record whose `type` points to the `ElementTypeRegistry`) and wall-hosted (a host wall, a position along the wall, and an orientation), the first entity to use the general wall-hosting relationship that furniture and wall features will reuse. The plan symbol is chosen by operation family (swing, slide, fold, pivot, cased, fixed window, crank window), so the broad residential vocabulary (single and double swing, French, dutch, pocket, bypass, barn, bifold, and pivot doors; cased openings; double- and single-hung, sliding, picture, casement, awning, hopper, transom, and sidelight windows) is a set of registry additions over a few shared symbol routines, and shape is a registry parameter. Five undoable commands (`placeOpening`, `moveOpening`, `resizeOpening`, `flipOpening`, `removeOpening`) flow through `dispatch`; opening geometry derives in pure core into an `OpeningSceneNode`, paints through the existing Canvas seam, and joins the hit-test index and marquee (an opening beats a wall beats a room). An additive v2-to-v3 schema migration backfills `openings: []` (and defensively the `underlays: []` array the underlay slice added without its own bump). Deliberately deferred, by design (see ADR-0038 and the slice spec `docs/specs/2026-06-07-openings-doors-and-windows.md`):

- **Projecting windows (bay, bow, oriel, garden).** They change the floor footprint and feed room-polygon and area derivation, coupled to the dimensions and thickness-aware area slice (slice 9); the wall-hosted model here is the substrate they extend.
- **Shape variants (arched, half-round, round, lancet, Palladian, fanlight, eyebrow, octagonal).** A registry shape parameter plus curved rendering, Phase 4; the renderer reads shape from the element type now, so the parameter joins without a model change.
- **Period multi-element assemblies as one placeable surround.** Transoms and sidelights are their own openings; composing a door surround is later work.
- **3D builders, trim and casing, and rehosting an opening across walls by drag.** The `scene3D` reference is reserved for Phase 2, trim is path-based later work, and dragging clamps to the host wall (no rehosting this slice).
- **Opening-aware room derivation, the perpendicular-drag resize gizmo, and garage, skylight, and dormer openings.** Rooms still derive from wall centerlines, the inline inspector replaces the resize gizmo (mirroring the wall-editing slice, slice 6), and non-wall hosts are out of this slice's wall-hosted scope.
- **The opening drag's live preview and a styled type chooser.** The drag dispatches an undoable `moveOpening` on release without a live ghost, and the place-opening type chooser is a plain select; both are follow-on polish.
- **The slide-family symbol distinction and the opening-inspector end-to-end assertion.** Pocket, bypass, sliding-glass, and barn doors share one `door-slide` symbol this slice, so a barn door and a pocket door read alike in plan; the pocket-specific dashing (which needs a `setLineDash` member on the Canvas seam) is deferred. The wall-drawing end-to-end assertion that the inspector appears for a selected opening is also deferred, because the headless Playwright run is not available in this environment; the opening placement and editing glue is validated by the pure-module tests and a manual check.

The wall-drawing end-to-end flow is unaffected: opening placement and editing are gated on the `place-opening` and `select` tools, which that flow does not trigger, and a project with no openings paints exactly as before. This slice also wires the previously-unregistered slice-12 underlay commands into the live editor session (a pre-existing gap).

**Slice 8 (done) scope and deferrals.** Slice 8 gives derived rooms a user-entered display name and a labeled overlay: each room paints its name and a formatted area at its centroid, and an inline inspector input (shown when a single room is selected, mirroring the slice-6 thickness editor) renames the room. A room can also carry a custom-polygon override that replaces the derived centerline polygon. Both edits flow through `dispatch(command)` as two new undoable commands (`setRoomName` and `setRoomCustomPolygon`) that reassign an additive top-level `Project.roomOverrides` slice keyed by `roomKey` (the sorted bounding-wall-id string), and `applyRoomOverrides` merges the stored name and polygon onto the freshly derived rooms so the override-aware deriver re-keys its cache on every change. The room key, the override merge, `formatArea`, the label content, and the Canvas label drawing (through the narrow plan-drawing seam) are pure, unit-tested modules; the command registration, the label paint pass, and the inline editor's shell placement are thin glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **Centerline area until slice 9.** The label shows the slice-1 centerline area until slice 9 delivers thickness-aware (clear-area) polygons. The label pipeline reads `RoomSceneNode.area`, so labels update with no labeling change when slice 9 lands.
- **Canvas labels at the centroid.** Labels are painted with Canvas `fillText` at the room centroid, consistent with the slice-3 decision to draw the grid and rulers on the Canvas. DOM-overlay labels and label-collision and placement handling (avoiding overlaps, nudging a label that falls outside its room) are deferred to the overlay polish work.
- **Room purpose, sub-purpose, era override, and tags.** This slice ships only the user-entered name and the custom polygon. Room purpose and sub-purpose, an era override, and free-form tags are deferred to the old-house architectural vocabulary milestone; `RoomOverride` is shaped for additive growth so those fields land without a structural change.
- **The interactive custom-polygon drawing tool.** The `setRoomCustomPolygon` command and the `applyRoomOverrides` merge are shipped, so a custom polygon overrides the derived polygon and recomputes the area now. The interactive tool that draws or edits that polygon on the Canvas is follow-on wiring.
- **Selection and default unit preferences.** Selection stays in-memory (ADR-0020), and the label area uses the default preferences for the project's `units` (metric or imperial) until a project-level unit-preferences store lands, mirroring the slice-6 inline-editor preference choice.
- **The additive `roomOverrides` slice and its migration.** Room metadata persists in the new top-level `Project.roomOverrides` slice, which lands here with one additive schema bump (v1 to v2) and its migration so the in-memory model and the command and undo path are complete and testable now; the durable-store round-trip and the running app's store default are owned by the project-stores slice (11). The room key is provisionally the sorted bounding-wall-id string; a follow-up finalizes the keying once slice 6 (wall editing) makes its effect on room identity observable (see the open questions in the implementation plan), and `roomKey` is the single seam that follow-up changes.

**Slice 9 (done) scope and deferrals.** Slice 9 closes two Phase-1 measurement gaps. First, room area becomes thickness-aware: a pure `insetPolygon` offsets each room-polygon edge inward by its host wall's half-thickness (the per-edge wall thickness threaded through the face-enumeration room derivation), so each derived room carries a `clearPolygon` and reports the clear floor area inside its walls. The slice-8 label, which reads `RoomSceneNode.area`, now shows the thickness-aware figure with no labeling change. Second, the user can draw linear dimensions: a two-click tool measures a segment, shows a live preview, and persists a `Dimension` (two fixed world points plus a perpendicular offset) on `floor.dimensions`. Two undoable commands (`addDimension`, `removeDimension`) flow through `dispatch`; pure geometry derives the measured length and the offset dimension-line and extension-line endpoints; a `DimensionSceneNode` projects into the scene graph and paints (line, arrowheads, extension lines, and the `formatLength` label) through the existing Canvas seam; dimensions join the hit-test (opening, then wall, then dimension, then room) and the marquee, and an inline inspector shows the length and removes the dimension. An additive v3-to-v4 schema migration backfills `dimensions: []`. All decision logic lives in pure, unit-tested modules; the tool, the inspector placement, and the plan-view composition are coverage-excluded glue. Deliberately deferred, by design (see ADR-0039 and the slice spec `docs/specs/2026-06-08-dimensions-and-thickness-aware-area.md`):

- **Wall-anchored / auto-updating dimensions.** A dimension stores two fixed world points and does not move when walls or openings are edited; anchoring a dimension endpoint to an entity so it tracks edits is later work the fixed-point model is forward-compatible with.
- **Angular, radial, ordinate, and chain or baseline dimensions, and auto-dimensioning.** This slice ships the single linear point-to-point dimension the Phase-1 deliverable names; the rest are a later dimensions phase.
- **The offset gizmo and offset editing.** A dimension's perpendicular `offset` is set at placement (default 0, the line through the two points) and is not editable; the design specification's perpendicular-drag dimension gizmos are deferred in favor of the two-click tool and the inline inspector, mirroring slices 6 and 7.
- **Dimension styles.** Arrowhead style, text placement, and a per-dimension precision override are deferred; the slice draws one fixed style and formats with the project units.
- **Thickness-aware fill and hit-testing.** Rooms still fill and hit-test on the centerline `polygon`; only the reported `area` and the new `clearPolygon` are thickness-aware. Painting the fill inside the clear polygon is a one-line renderer change deferred to overlay polish now that `clearPolygon` is derived.
- **Best-effort clear-area geometry.** `insetPolygon` is correct for simple convex and mildly non-convex rooms; over-inset self-intersection (a wall wider than the room), holes, and very acute corners are best-effort, mirroring slice 1's best-effort topology.

The wall-drawing end-to-end flow is unaffected: the dimension tool and inspector are gated on the `dimension` and `select` tools, and a project with no dimensions paints exactly as before. This slice is stacked on the openings slice (slice 7; its base schema is version 3), so it lands after the openings slice in the merge order.

**Slice 10 (done) scope and deferrals.** Slice 10 turns selection into editing: the user moves, rotates, deletes, copies, cuts, and pastes the selected plan entities (walls and free-floating dimensions; openings ride their host wall parametrically, and derived rooms re-derive), all undoable. Pure `translatePoint`/`rotatePoint` feed three transform commands (`translateEntities`, `rotateEntities`, `deleteEntities`, the last cascading a deleted wall's openings) plus a `pasteEntities` command, all reassigning `state.floors` so the dispatcher captures the inverse. A pure, serializable clipboard core (`buildClipboardSnapshot`, `serializeClipboard`/`deserializeClipboard` with a tagged, version-checked, shape-validated payload, and `instantiateClipboard` minting fresh ids and remapping each opening onto its pasted host wall) backs two clipboard layers: an in-app store and an operating-system-clipboard adapter sharing the serializer. In the editor a move-drag previews a translated ghost and commits a translate on release (routed beneath the endpoint and opening drags, above the marquee), the arrow keys nudge, Delete and Backspace delete, the platform copy/cut/paste shortcuts drive the clipboard (ignored while a form control is focused), and a selection transform panel rotates the selection ninety degrees each way or by a typed angle about its center. All decision logic lives in pure, unit-tested modules (including the selection-to-entity-id mapping and the ghost segments); the move-drag and keyboard hooks, the panel placement, and the plan-view composition are coverage-excluded glue. With this slice the twelve build slices of the two-dimensional plan editor are complete; the two finishing slices (13, 14) close the remaining named Phase-1 acceptance items before Phase 2 (see ADR-0041). Deliberately deferred, by design (see ADR-0040 and the slice spec `docs/specs/2026-06-08-clipboard-and-transforms.md`):

- **Free-angle rotate by a draggable handle, with modifier-key angle snapping.** The committed near-term follow-up: a rotate gizmo on the selection bounds emitting a continuous angle with a held modifier snapping to common angles (fifteen, forty-five, ninety degrees). The `rotateEntities` command already accepts an arbitrary angle and an explicit pivot, so only the editor gizmo and its hit-test remain.
- **Paste at the pointer.** Paste lands the copy at a small fixed offset so it is visible and distinct; honoring the cursor position is later polish.
- **Snap-while-moving and explicit junction-merge.** Room derivation is geometric, so a moved or pasted wall whose endpoint lands on another's forms a junction for free; reusing the slice-4 snap model during a drag, and an explicit merge pass if that proves insufficient, are later polish.
- **Transforming underlays or rooms directly.** Underlays keep their own placement and calibration tooling and are not in the hit-test selection; rooms are derived and transform only through their bounding walls.
- **Cross-floor paste.** Every command targets the active (single) floor, matching the rest of Phase 1.

The wall-drawing end-to-end flow is unaffected: the move-drag, nudging, delete, clipboard shortcuts, and rotate panel are gated on the `select` tool, and a project the user never transforms behaves exactly as before. This slice is stacked on slice 9.

**Slice 11 (done) scope and deferrals.** Slice 11 makes the durable project stores drive the running app. A pure store-selection rule (`selectProjectStoreBackend`) picks the backend from probed capabilities (OPFS when available, IndexedDB otherwise, honoring a remembered per-project preference); an async boot step (`resolveProjectStore`) probes once and constructs the chosen durable store, which the app now boots against with the loading and error states preserved. The `.house.zip` export button downloads a bundle named by a pure filename rule (`bundleFilename`) through a thin blob-download helper, and a Chromium-family Open folder control opens a picked project through the existing `FileSystemFolderProjectStore`. Opening or saving records a recent entry built by a pure upsert rule (`recentEntryFor`), and the recent list renders most-recent-first and duplicate-free via a pure ordering rule (`orderRecentProjects`); `onOpenRecent` routes through the recorded backend. The store-selection, recent-ordering, recent-entry, and filename rules are pure, unit-tested modules; the async-boot, download, picker, and recording wiring is coverage-excluded glue validated by the app and end-to-end specs (the Export bundle download is covered end to end on Chromium and Firefox). Deliberately deferred, by design:

- **The `writeHistory` and `packsRequired` project-meta fields.** A coordinated shared-schema change on `ProjectMeta` that concurrent model and migration slices also touch; deferred to a coordinated schema migration.
- **A WebKit-compatible OPFS write path.** The current `FileSystemDirectory.writeFile` uses main-thread `createWritable`, which WebKit does not support; a worker-side `createSyncAccessHandle` write path is needed. WebKit durable-storage and app-shell end-to-end coverage stays read-path-only until it lands (the Export bundle e2e is skipped on WebKit for the same headless-shell limitation).
- **Generation of `assets/`, `previews/`, and `ATTRIBUTIONS.md`.** Owned by the asset and pack work; this slice writes only `project.json` and `.house-autosave/`.
- **Quota and eviction UI, `navigator.storage.persist()` on first save, and the async-with-progress migration surface.** Deferred.
- **The take-ownership multi-tab flow.** `ProjectLock` already produces the read-only outcome; the read-only banner, command-disabling, and take-ownership prompt are a later editing-surface concern (ADR-0030).
- **Backend choice at creation time.** This slice picks the backend by capability for the default project and records whatever backend a project was opened with; a create-time backend chooser UI is later polish.
- **Per-backend recent routing edges.** The IndexedDB default store records no recent entry on boot (the recent-list `ProjectBackend` union has no `indexeddb` member; it is the implicit current project), and a `zip-bundle` recent reopen falls back to the default load rather than a dedicated re-import; both consistent with the slice plan's backend-memory open question. The native folder picker needs a user gesture Playwright cannot synthesize headlessly, so the folder-open path stays manually verified.
- **User-facing error surfacing.** Failures from save, export, open-folder, and open-recent are logged rather than silently swallowed, but not yet surfaced to the user; a notification surface is later work.

**Slice 12 (done) scope and deferrals.** Slice 12 lets a user load a raster image as a background underlay beneath the plan, set its opacity and visibility, and calibrate its scale by drawing a segment over a known real-world distance and typing that distance. An `Underlay` record (a content-addressed `image` reference, an `UnderlayPlacement` of offset, millimeters-per-pixel, and rotation, plus opacity and visibility) hangs off each `floor.underlays`, and `createUnderlay` mints one at an identity placement. The calibration math (`calibrationScale`, `applyCalibration`) is pure and unit-tested, and five undoable commands (`placeUnderlay`, `calibrateUnderlay`, `removeUnderlay`, `setUnderlayOpacity`, `setUnderlayVisibility`) flow through `dispatch` with the dispatcher capturing each inverse; a shared floor-and-underlay traversal helper backs the four that update one underlay. The underlay derives into the scene graph as an `UnderlaySceneNode`, paints on the Canvas beneath the grid at its calibrated placement and opacity, and the in-progress calibration segment paints above the plan. A two-click calibration tool (`advanceCalibrationTool`) measures the segment, and an underlay panel in the inspector loads an image, adjusts opacity and visibility, starts calibration, and removes an underlay. All decision logic lives in pure, unit-tested modules; the image loading, the calibration-tool pointer wiring, and the panel placement are coverage-excluded glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **PDF and glTF/glb underlays, and trace mode.** This slice ships the raster-image underlay only; the complete underlay layer (PDF via a reader, glTF/glb scenes) and snapping the wall tool to underlay features are a later phase. The `Underlay.image` reference and the placement model are shaped so a PDF-page raster or a scene reference joins later without reshaping the command set.
- **Rotation and free-move gizmos.** `UnderlayPlacement` carries an `offset` and a `rotation`, but this slice ships placement via calibration (scale) and the default origin offset only; an interactive drag-to-move or rotate gizmo is later polish, mirroring how wall editing deferred the perpendicular-drag thickness gizmo in favor of an inline control. The drawing path is axis-aligned (rotation zero); the commands accept any offset and rotation, so a future gizmo dispatches `calibrateUnderlay` (or a dedicated move command) with no model change.
- **Underlay selection and hit-testing.** The underlay is managed through its panel, not the click-selection and hit-test index; registering underlay bounds for selection is later work, consistent with how openings and furniture wait for their slices.
- **A dedicated known-distance input.** The calibration tool prompts for the known real-world distance through a simple text prompt parsed by the slice-2 `parseLength`; a styled distance field in the panel is follow-up UI.
- **Persistence of the raster bytes.** The decoded bitmap is held in memory for the session only, because the content-addressed asset pipeline (the `AssetCache` and the project-store `assets/` writeback) is asset-and-store follow-up work that is not yet wired. The `Underlay.image` reference is content-addressed today, so the model and the command set are forward-compatible: when the asset pipeline lands, persisting and reloading the bytes is a storage-side change behind the same reference. Until then, an underlay does not survive a save and reopen. Slice 13 (underlay asset persistence, ADR-0041) closes this: it wires the minimal `AssetCache` writeback and load resolution behind the same content-addressed reference so an underlay survives save and reopen; large-raster quota and eviction stay with the Phase-3 asset pipeline.

The wall-drawing end-to-end flow is unaffected: the underlay and calibration wiring is gated on the underlay panel and the `calibrate` tool, which the wall-drawing flow does not trigger, and a project with no underlays paints exactly as before.

**Slice 13 (done) scope and deferrals.** Slice 13 closes the "zero state loss" Phase-1 acceptance test for underlays. It adds two `AssetCache` implementations (an `InMemoryAssetCache` and a `DirectoryAssetCache` that stores bytes at `assets/<contentHash>` through the existing `DirectoryPort`), resolves a `{ store, assets }` `ProjectStorage` pair at boot so the OPFS runtime pairs its store with a directory-backed cache, exposes the cache to the editor through a bridge `AssetCacheProvider` and `useAssetCache()` hook, and wires the underlay load path to write the raster bytes on load and re-decode them on open (`editor/plan/use-underlay.ts`, split into `use-load-underlay-image` and `use-resolve-underlays`) behind the existing content-addressed `Underlay.image` (`AssetReference`), so a placed underlay survives save and reopen. It is a thin, forward-compatible subset of the full asset-and-pack pipeline. Deliberately deferred, by design (see ADR-0042 and the slice spec `docs/specs/2026-06-09-underlay-asset-persistence.md`):

- **Durable IndexedDB asset persistence.** The OPFS and folder stores persist assets through the `DirectoryAssetCache`; the IndexedDB default and in-memory stores pair with an `InMemoryAssetCache`, so an underlay does not survive reload on those backends. A durable IndexedDB-backed `AssetCache` is the near-term follow-up, additive behind the interface this slice lands.
- **The full asset-and-pack pipeline.** No `previews/`, `ATTRIBUTIONS.md`, library packs, or pack- and user-scoped assets; only `scope: 'project'` underlay rasters. Quota, eviction, and orphan collection, and the `.house.zip` bundle asset round-trip, stay with the Phase-3 asset pipeline. See ADR-0041 and the plan `docs/plans/2026-06-09-phase-1-finishing-underlay-persistence-and-overlay-accessibility.md`.

**Slice 14 (done) scope.** Slice 14 adds the React DOM overlay (a named Phase-1 deliverable) that mirrors the Canvas world matrix with CSS transforms and carries the interactive UI the design specification names (selection rings, dimension chips, snap indicators, hover tooltips) with ARIA labels, focus management, and keyboard navigation. The Canvas stays the renderer; the overlay is an additive, accessible, styleable chrome layer over it, consistent with the Canvas-drawing seam (ADR-0021). Because the unit formatters already exist (slice 2) and labels live in the overlay, unit-aware ruler and dimension labels and a project-level metric-or-imperial unit-display toggle ride this slice. See ADR-0041 and the same plan.

**Phase 1 follow-ups (tracked, not gating).** Items named in or implied by the design specification but not gating Phase-1 completion, recorded here so none is lost:

- **Construction-type wall editing.** An accepted Phase-4 carve-out; it needs the construction-type registry and era-aware catalogs (ADR-0035, ADR-0041).
- **Editor preferences beyond unit display.** Snap-settings UI (per-kind toggles, configurable threshold), default ceiling height, and default wall thickness; tracked, not gating (ADR-0041).
- **The free-angle rotate handle.** The committed near-term follow-up to slice 10's rotate controls, with a held modifier snapping to common angles (ADR-0040).
- **Wall-anchored, auto-updating dimensions.** Dimensions store fixed world points today; anchoring them to entities so they track edits is later work (ADR-0039).
- **Crossing (right-to-left) marquee.** The marquee selects fully-contained entities only; a crossing selection is a later editing-slice addition (ADR-0032).
- **A WebKit-compatible OPFS write path.** Main-thread `createWritable` is unsupported on WebKit; a worker-side sync access handle is needed (ADR-0030, slice 11).
- **Asset-pipeline-owned items.** `previews/`, `ATTRIBUTIONS.md`, and quota and eviction belong to the Phase-3 asset and pack work (ADR-0007).

## Beyond 1.0

| Focus                                                    | Notes                |
| -------------------------------------------------------- | -------------------- |
| DXF import; underlay-based migration from other planners | quick follow-on      |
| Lighting fidelity (solar position, baked GI, BRDFs)      | high priority post-1 |
| Pathing critic with room-purpose-specific rules          | research-flavored    |
| Code-plugin runtime, image-to-3D, cloud sync             | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next items above. Open an issue first to discuss any non-trivial change. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
