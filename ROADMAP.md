# Roadmap

Vernacular ships in milestones. Each milestone produces working, testable software and has its own implementation plan in `docs/plans/`. The authoritative milestone list is in the design specification, section 10. This file is a short status view.

## Current status

Foundation work complete (build foundation, documentation, engineering norms, source skeleton, proof of life, acceptance). The MVP path is underway, starting with the two-dimensional plan editor (design specification section 10, Phase 1), which is delivered as roughly twelve independent slices; slices 1 (wall topology and room derivation), 2 (units and measurement), 3 (pan, zoom, grid, and rulers), 4 (snapping), 5 (selection and the hit-test index), 6 (wall editing: endpoint move and thickness), 8 (room naming and labeling, custom-polygon override), 11 (project stores: save, open, recent, and store wiring), and 12 (image underlay with calibration) are done. Openings (7), dimensions (9), and clipboard and transforms (10) remain before the editor is a usable floor planner.

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

| Focus                                                   | Status      |
| ------------------------------------------------------- | ----------- |
| Project stores, persistence, and migrations             | done        |
| Two-dimensional plan editor                             | in progress |
| Three-dimensional preview with color-temperature slider | pending     |
| Furniture import and curated starter library (alpha)    | pending     |
| Old-house architectural vocabulary                      | pending     |
| Multi-floor and stairs (beta)                           | pending     |
| Paint, export, site metadata (1.0)                      | pending     |

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

The two-dimensional plan editor (design specification section 10, Phase 1) is delivered as roughly twelve independent slices, each with its own implementation plan in `docs/plans/` and its own red-green-blue cycle. Build order follows dependencies: geometry and model core first, then the interactive surface, then editing tools, then persistence.

| Slice                                                                               | Status  |
| ----------------------------------------------------------------------------------- | ------- |
| 1. Wall topology and room derivation (junctions, room polygons, area, plan fill)    | done    |
| 2. Units and measurement (imperial and metric parsing and formatting)               | done    |
| 3. Pan and zoom infinite canvas, grid, rulers                                       | done    |
| 4. Snapping (endpoint, midpoint, perpendicular, parallel, grid)                     | done    |
| 5. Selection (click, marquee, multi-select) and the hit-test index                  | done    |
| 6. Wall editing (endpoint move and thickness; construction type deferred)           | done    |
| 7. Openings (doors and windows: placement and editing)                              | pending |
| 8. Room naming and labeling, custom-polygon override                                | done    |
| 9. Dimensions (live and persisted) and thickness-aware area                         | pending |
| 10. Clipboard and transforms (copy, paste, delete, move, rotate)                    | pending |
| 11. Project stores, save/open/recent, autosave sidecar, migrations, multi-tab locks | done    |
| 12. Image underlay with calibration                                                 | done    |

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

**Slice 8 (done) scope and deferrals.** Slice 8 gives derived rooms a user-entered display name and a labeled overlay: each room paints its name and a formatted area at its centroid, and an inline inspector input (shown when a single room is selected, mirroring the slice-6 thickness editor) renames the room. A room can also carry a custom-polygon override that replaces the derived centerline polygon. Both edits flow through `dispatch(command)` as two new undoable commands (`setRoomName` and `setRoomCustomPolygon`) that reassign an additive top-level `Project.roomOverrides` slice keyed by `roomKey` (the sorted bounding-wall-id string), and `applyRoomOverrides` merges the stored name and polygon onto the freshly derived rooms so the override-aware deriver re-keys its cache on every change. The room key, the override merge, `formatArea`, the label content, and the Canvas label drawing (through the narrow plan-drawing seam) are pure, unit-tested modules; the command registration, the label paint pass, and the inline editor's shell placement are thin glue validated by the wall-drawing end-to-end spec. Deliberately deferred, by design:

- **Centerline area until slice 9.** The label shows the slice-1 centerline area until slice 9 delivers thickness-aware (clear-area) polygons. The label pipeline reads `RoomSceneNode.area`, so labels update with no labeling change when slice 9 lands.
- **Canvas labels at the centroid.** Labels are painted with Canvas `fillText` at the room centroid, consistent with the slice-3 decision to draw the grid and rulers on the Canvas. DOM-overlay labels and label-collision and placement handling (avoiding overlaps, nudging a label that falls outside its room) are deferred to the overlay polish work.
- **Room purpose, sub-purpose, era override, and tags.** This slice ships only the user-entered name and the custom polygon. Room purpose and sub-purpose, an era override, and free-form tags are deferred to the old-house architectural vocabulary milestone; `RoomOverride` is shaped for additive growth so those fields land without a structural change.
- **The interactive custom-polygon drawing tool.** The `setRoomCustomPolygon` command and the `applyRoomOverrides` merge are shipped, so a custom polygon overrides the derived polygon and recomputes the area now. The interactive tool that draws or edits that polygon on the Canvas is follow-on wiring.
- **Selection and default unit preferences.** Selection stays in-memory (ADR-0020), and the label area uses the default preferences for the project's `units` (metric or imperial) until a project-level unit-preferences store lands, mirroring the slice-6 inline-editor preference choice.
- **The additive `roomOverrides` slice and its migration.** Room metadata persists in the new top-level `Project.roomOverrides` slice, which lands here with one additive schema bump (v1 to v2) and its migration so the in-memory model and the command and undo path are complete and testable now; the durable-store round-trip and the running app's store default are owned by the project-stores slice (11). The room key is provisionally the sorted bounding-wall-id string; a follow-up finalizes the keying once slice 6 (wall editing) makes its effect on room identity observable (see the open questions in the implementation plan), and `roomKey` is the single seam that follow-up changes.

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
- **Persistence of the raster bytes.** The decoded bitmap is held in memory for the session only, because the content-addressed asset pipeline (the `AssetCache` and the project-store `assets/` writeback) is asset-and-store follow-up work that is not yet wired. The `Underlay.image` reference is content-addressed today, so the model and the command set are forward-compatible: when the asset pipeline lands, persisting and reloading the bytes is a storage-side change behind the same reference. Until then, an underlay does not survive a save and reopen. A follow-up planning round finalizes persistence (writeback on placement, resolution on load, and large-raster quota and eviction) once the asset and store pipeline lands.

The wall-drawing end-to-end flow is unaffected: the underlay and calibration wiring is gated on the underlay panel and the `calibrate` tool, which the wall-drawing flow does not trigger, and a project with no underlays paints exactly as before.

## Beyond 1.0

| Focus                                                    | Notes                |
| -------------------------------------------------------- | -------------------- |
| DXF import; underlay-based migration from other planners | quick follow-on      |
| Lighting fidelity (solar position, baked GI, BRDFs)      | high priority post-1 |
| Pathing critic with room-purpose-specific rules          | research-flavored    |
| Code-plugin runtime, image-to-3D, cloud sync             | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next items above. Open an issue first to discuss any non-trivial change. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
