---
slug: decisions/ADR-0037-image-underlay-and-calibration
title: 'ADR-0037: Raster image underlay as a content-addressed per-floor entity with pure single-segment calibration'
type: decision
tags:
  [
    architecture,
    core,
    editor,
    plan,
    underlay,
    calibration,
    assets,
    commands,
    undo-redo,
    scene-graph,
    rendering,
    canvas,
    units,
    persistence,
  ]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0003-storage-provider-pattern,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-06-image-underlay-and-calibration.md,
    core/model/types.ts,
    core/model/factories.ts,
    core/geometry/calibration.ts,
    core/commands/handlers/underlay-commands.ts,
    core/scene/scene-graph.ts,
    editor/plan/calibration-tool.ts,
    editor/plan/draw-underlay.ts,
    editor/plan/draw-plan.ts,
    editor/plan/use-underlay.ts,
    editor/plan/underlay-panel.tsx,
    editor/tools/active-tool-context.ts,
    editor/shell/editor-shell.tsx,
  ]
status: current
updated: 2026-06-07
---

# ADR-0037: Raster image underlay as a content-addressed per-floor entity with pure single-segment calibration

## Status

Accepted, landed (slice 12 of the Phase 1 two-dimensional plan editor, PR #35,
merge `e7427f9`). The user can load a raster image as a background underlay beneath
the plan, set its opacity and visibility, and calibrate it to world units by drawing
a segment over a known real-world distance and typing that distance. The additive
`Underlay` model, the `createUnderlay` factory, the pure `calibrationScale` /
`applyCalibration` math, the five undoable commands, the scene-graph projection, the
`advanceCalibrationTool` two-click machine, the Canvas drawing, and the React glue are
implemented and unit-tested across `core/` and `editor/plan/`. The design specification
(sections 3.1, 3.2, 4.5, 6.2, and the section 10 Phase 1 deliverable "Image underlay
with calibration") remains authoritative; this ADR records the implementation
interpretation and the dependency-blocked deferrals. No `docs/specs/` change accompanies
this work: it implements behavior the spec already mandates.

## Context

The design specification places `underlays[]` under each `floor` and states that
"underlays are first-class on each floor" (sections 3.1, 3.2). An underlay is a
tracing aid: a scanned plan, a survey, or a photo positioned and scaled so the user
can draw walls on top of it. Two-point calibration (section 3.2) makes the raster's
millimeters-per-pixel match the plan so measurements transfer.

The slice builds entirely on the prior plan-editor slices: the underlay paints through
the slice-3 viewport transforms (`worldToScreen` / `screenToWorld`, ADR-0031), the
calibration overlay paints through the slice-3/4/5 `PlanDrawingContext` Canvas seam
(ADR-0021), the calibration distance is parsed by the slice-2 `parseLength` (ADR-0027),
the underlay node is derived alongside walls and rooms in the scene graph (ADR-0018),
and all editing flows through `dispatch(command)` with the dispatcher capturing the
inverse for undo (ADR-0005). The design problem was therefore not new machinery but
how to fit the underlay into these existing seams without reshaping them, and where to
draw the pixel-versus-world coordinate boundary.

## Decision

### An additive `Underlay` model with a content-addressed image reference

`core/model/types.ts` adds `UnderlayPlacement` (`offset: Point` in world millimeters,
`millimetersPerPixel: number`, `rotation: number` in radians) and `Underlay`
(`id`, `image: AssetReference`, source `width`/`height` in pixels, `placement`,
`opacity` 0..1, `visible`), and `Floor` gains an additive `underlays: Underlay[]`
array sibling to `walls`. The `image` field is the existing content-addressed
`AssetReference` `(scope, contentHash)` pair (ADR-0007), not a path or inline bytes,
so the model is forward-compatible with the asset pipeline before that pipeline exists.
`createUnderlay(options)` (`core/model/factories.ts`) mints an underlay with a fresh id,
the given image/width/height, an identity placement (origin offset, `rotation` 0, and
the named `DEFAULT_UNDERLAY_MM_PER_PIXEL = 1` pre-calibration baseline), full opacity,
and `visible: true`, mirroring `createWall` / `createFloor`. `createFloor` initializes
`underlays: []`, so the additive field leaves every existing floor construction and
test green.

### Five undoable commands following the `addWall` immutable-reassignment pattern

`core/commands/handlers/underlay-commands.ts` adds `placeUnderlay` (append),
`calibrateUnderlay` (set placement), `removeUnderlay` (filter out),
`setUnderlayOpacity`, and `setUnderlayVisibility`, registered through a new
`registerUnderlayCommands` alongside the existing registrations. Every handler `apply`
reassigns `state.floors` immutably, mapping only the target floor to a new object and
leaving sibling floors reference-equal, exactly as `addWall` reassigns a floor's
`walls`. No handler authors an inverse; the root-level inverse-capture proxy records the
`state.floors` slice replacement and the dispatcher captures the inverse for undo
(ADR-0005). The four single-underlay updates (`calibrate`, `setOpacity`,
`setVisibility`, and the placement set) share two small file-private traversal helpers,
`mapTargetFloor(state, floorId, update)` and `mapTargetUnderlay(floor, underlayId,
update)`, so each handler does not restate the "map the floors, then map the target
floor's underlays, then update the target underlay" shape. This is the same shared-shape
refactor slice 6 applied to `moveWallEndpoint` / `setWallThickness` (ADR-0035).
`removeUnderlay` reuses `mapTargetFloor` but filters rather than maps the underlay,
the one place its shape differs.

### Pure calibration math with the pixel-versus-world boundary at the glue

`core/geometry/calibration.ts` is pure: `calibrationScale(pixelSegment,
knownDistanceMm)` returns `knownDistanceMm / pixelLength` (the straight-line distance
between the segment's two endpoints, reusing `distance` from `core`), throwing a
descriptive error on a zero-length segment or a non-positive distance (exceptions over
error codes, per the rules). `applyCalibration(placement, millimetersPerPixel)` returns
`{ ...placement, millimetersPerPixel }`, a fresh object keeping `offset` and `rotation`
anchored so calibration rescales about the pixel origin without teleporting the underlay
and the immutable-update convention the dispatcher relies on holds.

The load-bearing decision is **where the pixel-space-versus-world-space boundary sits**.
The calibration tool draws its segment in **world** coordinates over the rendered
underlay; `calibrationScale` takes a segment in the underlay's **pixel** space. The
conversion lives only at the glue: `commitCalibration` (`use-underlay.ts`) converts the
measured world segment to pixel space with the file-private `worldToPixel(world,
placement)` (subtract `placement.offset`, divide by `placement.millimetersPerPixel`;
rotation is 0 this slice, so the map is a pure offset-and-scale) before calling
`calibrationScale`. The core math never sees a world coordinate, the way slice 6 kept
the namespaced-id stripping at its glue. The glue then `applyCalibration`s the new scale
and dispatches `calibrateUnderlay`; a blank or unparseable distance dispatches nothing
(the `try`/`catch` around `parseLength` is the only place that tolerance lives).

### The `advanceCalibrationTool` two-click machine mirroring `wall-tool.ts`

`editor/plan/calibration-tool.ts` is a pure two-state machine
(`{ phase: 'idle' } | { phase: 'measuring'; start }`) mirroring the slice-1
`wall-tool.ts`: the first click records the start and emits no segment, the second
click emits a completed `segment` and returns to idle, and a second click equal to the
start cancels to idle with no segment (exact-equality `samePoint`, matching the wall
tool's zero-length cancel so calibration cannot produce a degenerate measurement).
`calibrationPreviewSegment(state, point)` is the read-only live-rubber-band projection,
mirroring `wallPreviewSegment`. Both reuse the existing `PreviewSegment` type from
`draw-plan.ts`, so the slice introduces no parallel segment type. A genuinely shared
two-click-segment helper was considered and not extracted: the wall tool emits an
`addWall` command and this one emits a plain segment, so the similarity is coincidental,
not real duplication.

### The scene projection derives underlays alongside walls and rooms

`core/scene/scene-graph.ts` adds an `UnderlaySceneNode` (a namespaced
`underlay:<id>` via `UNDERLAY_NODE_PREFIX`, the owning `floorId`, and the copied
`image`/`width`/`height`/`placement`/`opacity`/`visible`), `deriveUnderlayNode` /
`deriveUnderlayNodesForFloor`, and a `graph.underlays` sibling array that
`deriveSceneGraph` populates by flat-mapping over the floors, exactly as it flat-maps
walls and rooms (ADR-0018). A project with no underlays yields `underlays: []`, so the
existing wall and room derivation is unchanged.

### Canvas drawing grows the seam by exactly two members, with a fixed paint order

`editor/plan/draw-underlay.ts` paints the underlay through the `PlanDrawingContext`
seam (ADR-0021). `drawUnderlay` projects the underlay's pixel origin through
`worldToScreen` and draws the bitmap scaled so each source pixel maps to
`placement.millimetersPerPixel * viewport.scale` screen pixels (so the underlay tracks
pan and zoom for free, ADR-0031). It sets `ctx.globalAlpha = node.opacity` for the draw
and restores it to the named `FULLY_OPAQUE = 1` afterward so a later wall stroke is not
dimmed. The seam grows by exactly the two members the underlay needs: a `globalAlpha:
number` property and a four-argument `drawImage(image, dx, dy, dWidth, dHeight)`
destination-rect method, continuing the ADR-0021 discipline of extending the narrow
Canvas interface only when forced (ADR-0036 grew it by nothing; ADR-0026 by one
`closePath`). `drawCalibrationSegment` uses only members already on the seam, so it adds
nothing further.

The `UnderlayImage` type is the narrow structural slice (`width`/`height`) `drawImage`
reads; a real `ImageBitmap` satisfies it. The seam's `drawImage` accepts a
`CanvasImageSource`, so the boundary is bridged by a single `image as CanvasImageSource`
cast at the one call site in `drawUnderlay`, keeping the seam testable with a recording
fake that records `drawImage` destination rects and the `globalAlpha` in force.

`drawPlan` (`editor/plan/draw-plan.ts`) gains optional `underlays?:
readonly DrawableUnderlay[]` and `calibration?: PreviewSegment` fields and a fixed paint
order: underlays at the very bottom (after `clearRect`, before `drawGrid`, skipping
`visible === false`), then grid, room fills, walls, preview/snap/marquee, room labels,
then the calibration measure line above the plan but below the rulers, with the rulers
the topmost chrome. Both fields are optional, so every existing `drawPlan` test stays
green and a project with no underlays paints exactly as before. This layering is the
provisional default and is recorded as such (see deferrals); the per-underlay opacity
lets the user dim a busy raster so the grid stays legible.

### Glue architecture: an `UnderlayProvider` sharing a session-only bitmap cache

`editor/plan/use-underlay.ts` is coverage-excluded glue (jsdom has neither a 2D canvas
nor real image decoding). An `UnderlayProvider` React context shares the session-only
decoded-bitmap cache (an in-memory `Map<contentHash, ImageBitmap>` in a `useRef`) and
the calibration arming/tool state between `PlanView` (which resolves the
`DrawableUnderlay[]` from `graph.underlays` and paints them) and the inspector panel
(`underlay-panel.tsx`, which carries its own React Testing Library test because it takes
its data and `dispatch` as props with no canvas dependency). Loading a file reads its
bytes, hashes them with `crypto.subtle.digest('SHA-256', ...)` (no new dependency),
builds the `(scope: 'project', contentHash)` reference, decodes with
`createImageBitmap`, caches the bitmap under the content hash, and dispatches
`placeUnderlay`. A new `'calibrate'` tool joins the `ToolId` union; its pointer handlers
run only under that tool, leaving the wall-draw and select paths untouched, and the
underlay paints regardless of the active tool because it is the background. The known
distance is entered through a `window.prompt` this slice because the panel exposes no
distance input yet (a documented follow-up).

## Why this approach

- **Content-addressing the image reference today buys forward compatibility for free.**
  The `Underlay.image` is the same `(scope, contentHash)` value object every other asset
  uses (ADR-0007), so when the asset pipeline lands, persisting and reloading the bytes
  is a storage-side change behind the same reference, with no model or command reshaping.
- **The immutable `state.floors` reassignment lets the dispatcher own undo.** Every
  command reassigns the floors slice whole, so the root-level inverse-capture proxy
  records the change and the dispatcher captures the inverse; no handler hand-authors an
  inverse (ADR-0005), the same convention the wall and room commands follow.
- **Keeping the pixel-versus-world conversion at the glue keeps the core pure.**
  `calibrationScale` is a single ratio over a pixel segment; the world-to-pixel map lives
  only in `worldToPixel` at the glue boundary, so the math is trivially unit-tested and
  the boundary is one named function.
- **Painting on the Canvas through the existing seam keeps the underlay in one
  transform.** A `drawImage` through `PlanDrawingContext` (consistent with section 6.2,
  "Canvas ... underlay images", and the slice-3/4/5 decision to paint grid, rulers, snap,
  and marquee on the Canvas) keeps the underlay in the same pan/zoom transform as the
  rest of the plan, with no separate CSS-matrix mirroring to keep in sync (ADR-0021,
  ADR-0031).

## Persistence is the open question (the raster bytes are session-only this slice)

The one decision this slice **cannot** finalize is how the underlay raster is persisted.
The design specification persists underlays content-addressed in the project's
`assets/<contentHash>.png` folder (sections 3.1, 3.3) so the migration audit trail is
preserved. That depends on the content-addressed asset pipeline, which does not exist
yet: ADR-0007 implements only the `AssetReference` value object and explicitly records
that the aggregating `AssetRegistry` and the resolution-with-fallback algorithm are
unimplemented, and the `storage/` `AssetCache` (`has`/`get`/`put` keyed by content hash)
and the project-store `assets/` writeback are project-stores follow-up work (ADR-0003,
ADR-0030).

The provisional assumption this slice ships: the **decoded bitmap is held in memory for
the session only** (the in-memory `Map` keyed by content hash in `use-underlay.ts`). The
`Underlay.image` reference is content-addressed today, so the model and command set are
forward-compatible, but **the underlay does not survive a save/open cycle**. A follow-up
planning round, scheduled once the `AssetCache` and the project-store `assets/`
writeback land, must finalize: writing the bytes to the asset cache on placement,
resolving the reference to bytes on load, the 80%-quota and eviction behavior for large
rasters, and whether decode happens eagerly on load or lazily on first paint. A future
session should resume the slice here.

## Deferred refinements and explicit non-goals

- **PDF and glTF/glb underlays.** The "complete underlay layer" (PDF via a reader,
  glTF/glb scene) is Phase 5 (section 10). This slice ships the raster-image underlay
  only; the `Underlay.image` reference and the placement model are shaped so a PDF-page
  raster or a scene reference can join later without reshaping the command set.
- **Trace mode.** Snapping the wall tool to underlay features is Phase 5. The wall and
  calibration tools do not snap to image pixels this slice.
- **Rotation and free-move gizmos.** `UnderlayPlacement` carries `rotation` and `offset`,
  but this slice draws axis-aligned underlays (`rotation === 0`) and positions via
  calibration scale and the default offset only, mirroring how slice 6 deferred the
  perpendicular-drag thickness gizmo in favor of an inline control. A future gizmo
  dispatches `calibrateUnderlay` (or a dedicated move command) with no new model work.
- **Two-point versus single-segment calibration.** A single drawn segment with a known
  length is mathematically the two-point calibration of section 3.2 (the endpoints are
  the two points); absolute-position or north-bearing calibration is site-metadata work
  (section 3.1 `site`), not this slice.
- **Underlay selection and hit-testing.** The underlay is managed through its panel, not
  the slice-5 selection; registering underlay bounds with the hit-test index is later
  work, consistent with the slice-5 deferral of openings and furniture selection.
- **A dedicated distance input.** The known distance is entered through a
  `window.prompt`; a panel field replacing the prompt is a documented follow-up.
- **The provisional Canvas paint order.** Underlay-at-bottom, calibration-above-walls,
  rulers-on-top is the default; a "grid above underlay" preference or a DOM-overlay
  underlay (`<img>` for crispness at extreme zoom) is reconsidered behind a preference
  when the editor-preferences surface and the DOM overlay (section 6.2) land. The narrow
  `drawUnderlay`-behind-`PlanDrawingContext` seam keeps that a glue change, not a model
  one.

## Alternatives considered

- **A DOM `<img>` underlay layer CSS-transformed to mirror the world matrix.** Rejected
  for this slice in favor of a canvas-drawn `drawImage`, consistent with section 6.2 and
  the slice-3/4/5 Canvas decisions; it keeps the underlay in one pan/zoom transform with
  no separate CSS matrix to sync. Reconsidered only behind a preference if the DOM
  overlay later hosts interactive chrome.
- **Storing the underlay per-project rather than per-floor.** Rejected: the spec entity
  tree places `underlays[]` under each `floor`. The commands and scene node carry a
  `floorId`, so per-floor is wired now; with one floor today the distinction is invisible
  and the multi-floor slice (Phase 5) confirms it end to end.
- **Hand-authoring the command inverses.** Unnecessary; the immutable `state.floors`
  reassignment lets the dispatcher capture the inverse, the convention every handler
  uses (ADR-0005).
- **Extracting a shared two-click-segment helper between the wall and calibration tools.**
  Rejected as coincidental similarity: the wall tool emits an `addWall` command and this
  one emits a plain segment.
- **Growing `PlanDrawingContext` toward the full Canvas 2D type for image drawing.**
  Rejected: the seam grew by exactly the two members `drawUnderlay` needs (`globalAlpha`,
  the four-argument `drawImage`), keeping the ADR-0021 testability discipline; the
  `ImageBitmap`-versus-`CanvasImageSource` gap is bridged by one cast at the single call
  site.

## References

- Design specification, sections 3.1 and 3.2 (underlays first-class on each floor),
  3.3 (content-addressed `assets/`), 4.5 (`kind: 'underlay-image'`), 6.2 (Canvas plan
  renderer including underlay images), and the section 10 Phase 1 deliverable "Image
  underlay with calibration". This ADR records the interpretation; the spec is
  authoritative.
- Implementation plan: `docs/plans/2026-06-06-image-underlay-and-calibration.md`.
- ADR-0007 (content-addressed `AssetReference`; the `Underlay.image` reference, and the
  unimplemented `AssetRegistry`/`AssetCache` that the persistence open question waits on).
- ADR-0005 (command pattern and the root-level inverse-capture proxy that the five
  commands reassign `state.floors` through for undo).
- ADR-0018 (scene-graph derivation; underlays derive into `graph.underlays` alongside
  walls and rooms).
- ADR-0021 (the narrow Canvas seam the underlay and calibration paint through, grown by
  two members; and the wall-tool state machine the calibration tool mirrors).
- ADR-0031 (the viewport projection `worldToScreen` / `screenToWorld` the underlay and
  calibration reuse so they pan and zoom with the plan).
- ADR-0027 (the `core/units/` `parseLength` the glue uses to parse the typed distance).
- ADR-0003 / ADR-0030 (the project-stores and `AssetCache` wiring the raster-persistence
  follow-up depends on).
