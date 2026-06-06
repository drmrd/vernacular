# Image Underlay and Calibration Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` authors its test independently from the behavior description plus the public signatures in this plan, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract.

**Goal:** Let the user load a raster image as a background underlay beneath the plan, position and scale it, and calibrate it so it matches world units. The calibration tool draws a segment over a known real-world distance on the image, the user types that distance with the slice-2 unit parser (`parseLength`), and the plan computes and applies the scale so the underlay's millimeters-per-pixel matches the plan. Opacity and visibility controls govern how the underlay paints. The underlay pans and zooms with the plan by reusing the slice-3 viewport transforms (`worldToScreen` / `screenToWorld`), and any calibration overlay paints through the existing plan-drawing seam (ADR-0021). Placing, calibrating, and removing an underlay flow through `dispatch(command)` and undo through the dispatcher's captured inverse (ADR-0005).

**Architecture:** The project model grows an `Underlay` record and a `floor.underlays` array (mirroring the design specification's "underlays are first-class on each floor", section 3.1). Three new pure, undoable commands join the existing `addWall` / `moveWallEndpoint` family in a new `core/commands/handlers/underlay-commands.ts`: `placeUnderlay` appends an underlay to a floor, `calibrateUnderlay` sets its scale and offset placement, and `removeUnderlay` drops it. Two more set opacity and visibility (`setUnderlayOpacity`, `setUnderlayVisibility`). All follow the `addWall` pattern exactly (a `type` constant, a params interface, a creator returning `{ type, params, description }`, and a `CommandHandler` whose `apply` reassigns `state.floors` immutably so the inverse-capture proxy records the change and the dispatcher captures the inverse for undo, ADR-0005). The calibration math is a pure module `core/geometry/calibration.ts`: `calibrationScale(pixelSegment, knownDistanceMm)` turns a drawn pixel-space segment plus a known world distance into millimeters-per-pixel, and `applyCalibration(placement, scale)` produces the updated placement. The underlay scene projection extends `core/scene/scene-graph.ts` with an `UnderlaySceneNode` and `graph.underlays`, derived like walls and rooms. `editor/plan/draw-underlay.ts` paints the underlay image and the live calibration segment behind the existing `PlanDrawingContext` seam, gated by new optional `underlays?` and `calibration?` fields on `DrawPlanOptions`. A pure `editor/plan/calibration-tool.ts` state machine (`advanceCalibrationTool`) mirrors the slice-1 `wall-tool.ts` two-click machine. Thin glue (`editor/plan/use-underlay.ts`, additions to `plan-view.tsx`, an underlay panel in the shell, a file-load helper) wires image loading, the calibration tool, and the controls; all of it is coverage-excluded infrastructure because jsdom has neither a 2D canvas nor `Image` decoding.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, React with React Testing Library, Vitest for units. No new dependencies (the browser's built-in `Image`/`createImageBitmap` and `FileReader` cover raster loading; no younger-than-15-days package). The calibration math and the command handlers are pure and unit-tested; image decoding and canvas image compositing are infrastructure glue.

---

## Scope boundary (design specification sections 3.1, 3.2, 4.5, 6.2, 10 Phase 1; this is slice 12 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 12: image underlay with calibration**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 (wall topology and room derivation), 2 (units and measurement), 3 (pan, zoom, grid, and rulers), 4 (snapping), and 5 (selection and the hit-test index) are done. This slice builds on them: the underlay paints through the slice-3 viewport transforms and the slice-3/4/5 `PlanDrawingContext` seam, the calibration distance is parsed by the slice-2 `parseLength`, and the underlay node is derived alongside walls and rooms in the slice-1/5 scene graph.

The design specification scopes a **raster image** underlay with **calibration** to Phase 1 (section 10 deliverable "Image underlay with calibration"). The "complete underlay layer" (PDF via a PDF reader, glTF/glb scene) and "trace mode" (the wall tool snapping to underlay features) are explicitly a later phase (section 10, Phase 5: "Complete underlay layer (image, PDF, glTF/glb scene; all calibrated)", "Trace mode"). This slice therefore ships the raster-image underlay and its calibration only.

**In scope for slice 12:**

- `core/model/types.ts`: an `Underlay` record (`id`, content-addressed `image: AssetReference`, an `UnderlayPlacement` of `{ offset: Point; millimetersPerPixel: number; rotation: number }`, `opacity`, `visible`, and the source pixel `width`/`height`), a `floor.underlays: Underlay[]` array, and the schema-version bump if the migration framework requires one for the additive field (see Open questions, persistence). Exported through `core/index.ts`.
- `core/model/factories.ts`: `createUnderlay(options)` minting an underlay with a fresh id and an identity placement (uncalibrated default `millimetersPerPixel`), mirroring `createWall` / `createFloor`. Exported through `core/index.ts`.
- `core/geometry/calibration.ts`: `calibrationScale(pixelSegment, knownDistanceMm)` (millimeters-per-pixel from a drawn pixel-space segment and the known world distance) and `applyCalibration(placement, scale)` (the updated placement at the new scale, anchored so the calibration is stable). Exported through `core/index.ts`.
- `core/commands/handlers/underlay-commands.ts`: the `PLACE_UNDERLAY`, `CALIBRATE_UNDERLAY`, `REMOVE_UNDERLAY`, `SET_UNDERLAY_OPACITY`, and `SET_UNDERLAY_VISIBILITY` type constants, their params interfaces, the five creators, their handlers, and `registerUnderlayCommands` registering all five. Exported through `core/index.ts`.
- `core/scene/scene-graph.ts`: an `UnderlaySceneNode` and a `graph.underlays` sibling array derived by `deriveUnderlayNode` / `deriveUnderlayNodesForFloor`, mirroring `deriveWallNode` / `deriveRoomNodesForFloor`.
- `editor/plan/calibration-tool.ts`: `advanceCalibrationTool(state, point)` and `calibrationPreviewSegment(state, point)`, a pure two-click state machine and its live-preview projection, mirroring `wall-tool.ts`.
- `editor/plan/draw-underlay.ts`: `drawUnderlay(ctx, node, viewport)` (paint the underlay image at its projected screen placement and opacity) and `drawCalibrationSegment(ctx, segment, viewport)` (paint the in-progress calibration line), both behind the existing `PlanDrawingContext` seam (extended only by the image-draw and alpha members the underlay needs).
- `editor/plan/draw-plan.ts`: new optional `underlays?: readonly UnderlaySceneNode[]` and `calibration?: PreviewSegment` fields on `DrawPlanOptions`; `drawPlan` paints visible underlays beneath the grid and the in-progress calibration segment above the plan.
- `editor/plan/use-underlay.ts` (infrastructure glue): load an image file into a decoded bitmap keyed by content hash, drive the calibration tool (draw a segment, prompt for the known distance, dispatch `calibrateUnderlay`), and expose the place/remove/opacity/visibility actions.
- `editor/plan/plan-view.tsx` (infrastructure glue): pass the visible underlay nodes and any decoded bitmaps to `drawPlan`, and compose the calibration-tool pointer handlers under a new `'calibrate'` tool.
- An underlay panel component plus its shell wiring (infrastructure glue): a load-image control, a per-underlay opacity slider, a visibility toggle, a "Calibrate" button that activates the calibration tool, and a remove control.
- `editor/tools/active-tool-context.ts` (infrastructure glue): add `'calibrate'` to the `ToolId` union so the calibration tool can be the active tool.

**Out of scope for slice 12, deferred with intent (also recorded in `ROADMAP.md`):**

- **PDF and glTF/glb underlays.** The design specification's "complete underlay layer" (PDF via a PDF reader, glTF/glb scene) is Phase 5. This slice ships the raster-image underlay (`kind: 'underlay-image'`, section 4.5) only. The `Underlay.image` reference and the placement model are shaped so a PDF-page raster or a scene reference can join later without reshaping the command set.
- **Trace mode.** Snapping the wall tool to underlay features is Phase 5 (section 10). This slice paints the underlay and calibrates it; the wall and calibration tools do not snap to image pixels.
- **Rotation gizmo and free reposition gizmo.** The `UnderlayPlacement` carries a `rotation` field and an `offset`, but this slice ships placement via calibration (scale) and the default offset only; an interactive drag-to-move or rotate gizmo for the underlay is later polish, mirroring how slice 6 deferred the perpendicular-drag thickness gizmo in favor of an inline control. The commands accept any offset/rotation, so a future gizmo dispatches `calibrateUnderlay` (or a dedicated move command) without new model work.
- **Two-point versus single-segment calibration.** The design specification mentions "two-point calibration" (section 3.2). A single drawn segment with a known length is mathematically the same two points; this slice ships the single-segment-plus-known-distance form (the segment's two endpoints are the two points). A separate north-bearing or absolute-position calibration is site-metadata work (section 3.1 `site`), not this slice.
- **Underlay selection and hit-testing.** The underlay is not a selectable entity in the slice-5 sense; it is managed through its panel. Registering underlay bounds with the hit-test index for click selection is later work, consistent with the slice-5 deferral of openings and furniture selection until their slices land.
- **Persistence of the raster bytes.** See "Open questions pending dependencies": the content-addressed asset pipeline (`AssetCache`, the project-store `assets/` folder) is slice 11 follow-up work and is not yet wired, so the decoded bitmap is held in memory for the session this slice. The `Underlay.image` reference is content-addressed today (ADR-0007) so the model is forward-compatible.

**Acceptance for slice 12:** `calibrationScale` returns the correct millimeters-per-pixel for a drawn segment and known distance (and the round-trip through `applyCalibration` makes the segment measure the known distance in world units, accurate to within the design specification's 1% calibration target); `createUnderlay` mints an identity-placement underlay with a content-addressed reference; `placeUnderlay`, `calibrateUnderlay`, `removeUnderlay`, `setUnderlayOpacity`, and `setUnderlayVisibility` each apply through the dispatcher and undo correctly through its captured inverse, leaving sibling underlays, walls, and other floors untouched; `deriveUnderlayNode` projects an underlay into an `UnderlaySceneNode`; `advanceCalibrationTool` records the first endpoint on the first click and emits a completed segment on the second; `drawUnderlay` paints the image at its projected screen placement and opacity through the seam, gated by the `underlays` option; `drawCalibrationSegment` paints the in-progress line gated by the `calibration` option. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the wall-drawing end-to-end spec still passes (the underlay and calibration wiring is gated on its panel and the `'calibrate'` tool, which the wall-drawing flow does not trigger).

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  model/types.ts                              (modify)  Underlay, UnderlayPlacement, floor.underlays
  model/types.test.ts                         (modify, if present)  shape assertions stay green
  model/factories.ts                          (modify)  createUnderlay
  model/factories.test.ts                     (modify)  createUnderlay behavior
  geometry/calibration.ts                     (create)  calibrationScale, applyCalibration
  geometry/calibration.test.ts                (create)
  commands/handlers/underlay-commands.ts      (create)  five commands, handlers, registerUnderlayCommands
  commands/handlers/underlay-commands.test.ts (create)
  scene/scene-graph.ts                         (modify)  UnderlaySceneNode, graph.underlays, derivers
  scene/scene-graph.test.ts                    (modify)  underlay derivation (wall/room tests stay green)
  index.ts                                     (modify, infra)  export the new types, factory, math, commands, node

editor/plan/
  calibration-tool.ts                          (create)  advanceCalibrationTool, calibrationPreviewSegment
  calibration-tool.test.ts                     (create)
  draw-underlay.ts                             (create)  drawUnderlay, drawCalibrationSegment
  draw-underlay.test.ts                        (create)
  draw-plan.ts                                 (modify)  underlays? and calibration? options; paint order
  draw-plan.test.ts                            (modify)  underlay + calibration behaviors (prior tests stay green)
  draw-plan-test-fixtures.ts                   (modify)  recording fake records the new seam members (drawImage, globalAlpha)
  use-underlay.ts                              (create, infra)  image load + calibration-tool lifecycle + actions
  plan-view.tsx                                (modify, infra)  pass underlays/bitmaps to drawPlan; compose calibration handlers

editor/tools/
  active-tool-context.ts                       (modify, infra)  add 'calibrate' to ToolId

editor/shell/ (or editor/plan/)
  underlay-panel.tsx                           (create, infra)  load-image, opacity, visibility, calibrate, remove
  underlay-panel.test.tsx                      (create)  panel behavior (React Testing Library)
  editor-shell.tsx                             (modify, infra)  render the underlay panel in the inspector

ROADMAP.md                                     (modify, infra)  mark slice 12 done; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slices 1, 3, 4, 5, and 6 confirmed. `Point` and `AssetReference` come from `core` unchanged; `Underlay`, `UnderlayPlacement`, `Project`, `Floor`, `UnderlaySceneNode`, `SceneGraph`, and the command types come from `core` via the barrel; `Viewport`, `ScreenPoint`, `worldToScreen`, and `screenToWorld` are from `editor/plan/viewport.ts`; `PreviewSegment` and `PlanDrawingContext` are from `editor/plan/draw-plan.ts`. `core/geometry/calibration.ts`, `core/commands/handlers/underlay-commands.ts`, the model and scene-graph additions, `editor/plan/calibration-tool.ts`, and `editor/plan/draw-underlay.ts` carry the testable behavior; `use-underlay.ts`, `plan-view.tsx`, and the shell wiring are coverage-excluded glue (jsdom has no 2D canvas and no real image decoding), validated by the existing wall-drawing end-to-end spec. The underlay panel is a DOM component with no canvas or image-decode dependency (it takes its data and `dispatch` as props), so it carries its own React Testing Library test rather than being coverage-excluded glue.

The calibration tool and the file-load glue work in **pixel space** (the image's own coordinate system), while placement and the plan work in **world millimeters**. The chosen boundary: the calibration tool draws its segment in world coordinates over the rendered underlay, and the glue converts the world-space segment to the underlay's pixel space using the current placement (offset and millimeters-per-pixel) before calling `calibrationScale`. The pure `calibrationScale` therefore takes a **pixel-space** segment plus the known world distance and returns millimeters-per-pixel; the world-to-pixel conversion lives only at the glue boundary, the way slice 6 kept the namespaced-id stripping at its glue.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// core/model/types.ts (additions; exported via core/index.ts)
export interface UnderlayPlacement {
  /** World position (millimeters) of the underlay's pixel origin (top-left). */
  offset: Point
  /** World millimeters per source image pixel; the calibrated scale. */
  millimetersPerPixel: number
  /** Clockwise rotation in radians about `offset`; 0 for an axis-aligned underlay. */
  rotation: number
}
export interface Underlay {
  id: string
  /** Content-addressed reference to the raster image bytes (ADR-0007). */
  image: AssetReference
  /** Source image dimensions in pixels. */
  width: number
  height: number
  placement: UnderlayPlacement
  /** 0 (transparent) to 1 (opaque). */
  opacity: number
  visible: boolean
}
// Floor gains: underlays: Underlay[]

// core/model/factories.ts (addition; exported via core/index.ts)
export interface NewUnderlayOptions {
  image: AssetReference
  width: number
  height: number
}
export function createUnderlay(options: NewUnderlayOptions): Underlay

// core/geometry/calibration.ts (exported via core/index.ts)
export interface PixelSegment {
  start: Point // image pixel coordinates
  end: Point
}
/** Millimeters-per-pixel so the drawn pixel segment measures `knownDistanceMm` in world units. Throws on a zero-length segment or a non-positive distance. */
export function calibrationScale(segment: PixelSegment, knownDistanceMm: number): number
/** The placement updated to the given millimeters-per-pixel, keeping the offset anchored. */
export function applyCalibration(
  placement: UnderlayPlacement,
  millimetersPerPixel: number,
): UnderlayPlacement

// core/commands/handlers/underlay-commands.ts (exported via core/index.ts)
export const PLACE_UNDERLAY = 'floor/place-underlay'
export const CALIBRATE_UNDERLAY = 'floor/calibrate-underlay'
export const REMOVE_UNDERLAY = 'floor/remove-underlay'
export const SET_UNDERLAY_OPACITY = 'floor/set-underlay-opacity'
export const SET_UNDERLAY_VISIBILITY = 'floor/set-underlay-visibility'
export interface PlaceUnderlayParams {
  floorId: string
  underlay: Underlay
}
export interface CalibrateUnderlayParams {
  floorId: string
  underlayId: string
  placement: UnderlayPlacement
}
export interface RemoveUnderlayParams {
  floorId: string
  underlayId: string
}
export interface SetUnderlayOpacityParams {
  floorId: string
  underlayId: string
  opacity: number
}
export interface SetUnderlayVisibilityParams {
  floorId: string
  underlayId: string
  visible: boolean
}
export function placeUnderlay(floorId: string, underlay: Underlay): Command<PlaceUnderlayParams>
export function calibrateUnderlay(
  floorId: string,
  underlayId: string,
  placement: UnderlayPlacement,
): Command<CalibrateUnderlayParams>
export function removeUnderlay(floorId: string, underlayId: string): Command<RemoveUnderlayParams>
export function setUnderlayOpacity(
  floorId: string,
  underlayId: string,
  opacity: number,
): Command<SetUnderlayOpacityParams>
export function setUnderlayVisibility(
  floorId: string,
  underlayId: string,
  visible: boolean,
): Command<SetUnderlayVisibilityParams>
// registerUnderlayCommands registers all five alongside the existing command registrations.

// core/scene/scene-graph.ts (additions)
export interface UnderlaySceneNode {
  id: string
  kind: 'underlay'
  floorId: string
  image: AssetReference
  width: number
  height: number
  placement: UnderlayPlacement
  opacity: number
  visible: boolean
}
export function deriveUnderlayNode(floor: Floor, underlay: Underlay): UnderlaySceneNode
export function deriveUnderlayNodesForFloor(floor: Floor): UnderlaySceneNode[]
// SceneGraph gains: underlays: UnderlaySceneNode[]

// editor/plan/calibration-tool.ts
export type CalibrationToolState = { phase: 'idle' } | { phase: 'measuring'; start: Point }
export const IDLE_CALIBRATION_TOOL: CalibrationToolState
export interface CalibrationToolResult {
  state: CalibrationToolState
  segment?: PreviewSegment
}
/** First click records the start; second click completes the segment and returns to idle. */
export function advanceCalibrationTool(
  state: CalibrationToolState,
  point: Point,
): CalibrationToolResult
/** The in-progress { start, end } segment while measuring, else undefined. */
export function calibrationPreviewSegment(
  state: CalibrationToolState,
  point: Point,
): PreviewSegment | undefined

// editor/plan/draw-underlay.ts
export function drawUnderlay(
  ctx: PlanDrawingContext,
  node: UnderlaySceneNode,
  viewport: Viewport,
  image: UnderlayImage,
): void
export function drawCalibrationSegment(
  ctx: PlanDrawingContext,
  segment: PreviewSegment,
  viewport: Viewport,
): void
// UnderlayImage is the narrow structural slice of a decoded bitmap drawImage accepts (see Task E1).

// editor/plan/draw-plan.ts (additions; gated by new optional fields on DrawPlanOptions)
// DrawPlanOptions gains: underlays?: readonly DrawableUnderlay[] and calibration?: PreviewSegment
// (DrawableUnderlay pairs an UnderlaySceneNode with its resolved UnderlayImage; absent = no underlay painted)
```

`UnderlayPlacement` is defined in `core/model/types.ts` and re-exported from `core/index.ts`; `core/geometry/calibration.ts`, `core/commands/handlers/underlay-commands.ts`, `core/scene/scene-graph.ts`, and `editor/plan/draw-underlay.ts` all import it from `core` (or its sibling module) so the placement type is single-sourced and the `CalibrateUnderlayParams.placement`, `applyCalibration` return, and `UnderlaySceneNode.placement` types match exactly. `PreviewSegment` is the existing `editor/plan/draw-plan.ts` type, reused for both the wall preview and the calibration preview so the slice introduces no parallel segment type.

---

## Section A: the underlay model and factory (`core/model/`)

### Task A1: the `Underlay` record and `floor.underlays` array

**Files:**

- Modify: `core/model/types.ts`
- Test: `core/model/factories.test.ts` (via Task A2; the type alone needs no behavior test beyond the factory exercising it)

**Behavior under test (through `createUnderlay`, Task A2):** `core/model/types.ts` gains `UnderlayPlacement` and `Underlay` (the contract block above) and `Floor` gains an `underlays: Underlay[]` array, mirroring `walls: Wall[]`. The `image` field is the existing content-addressed `AssetReference` (ADR-0007), so the underlay carries a `(scope, contentHash)` pair rather than a path or inline bytes. This task only adds the types; its behavior is exercised by the factory (A2) and the commands (Section C), so it carries no standalone test. The existing `Project` / `Floor` shape tests (if any) stay green because the field is additive on a fresh-from-factory floor.

- [ ] **Step 1 (RED):** No standalone RED for the type; the failing test arrives with Task A2's `createUnderlay`. (This step is a no-op placeholder so the section reads in order; the first failing test is A2 Step 1.)
- [ ] **Step 2 (GREEN):** with Task A2, add `UnderlayPlacement`, `Underlay`, and `Floor.underlays` to `core/model/types.ts`. Ensure `createFloor` (factory) initializes `underlays: []` so every floor has the array. Commit `feat:` (combined with A2's green if they land together, or as the type-only prerequisite the A2 test forces).
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `Underlay` is a pure data structure (no methods), the doc comments state units (millimeters, millimeters-per-pixel, radians, 0..1 opacity), and `Floor.underlays` reads parallel to `Floor.walls`. Commit `refactor:` (empty marker if no change).

### Task A2: `createUnderlay` mints an identity-placement underlay

**Files:**

- Modify: `core/model/factories.ts`
- Test: `core/model/factories.test.ts`

**Behavior under test (`createUnderlay(options)`):** Returns a new `Underlay` with a fresh unique `id` (the same id-minting the existing factories use), the given content-addressed `image` reference and source pixel `width`/`height`, an **identity placement** (`offset` at the world origin `{ x: 0, y: 0 }`, a default uncalibrated `millimetersPerPixel` constant, `rotation` 0), full `opacity` (1), and `visible: true`. Two calls produce two different ids. Name the default uncalibrated scale as a module constant (`DEFAULT_UNDERLAY_MM_PER_PIXEL`, for example 1 millimeter per pixel as the pre-calibration baseline) rather than a magic number. Cover: the returned underlay carries the given image/width/height; the placement is the identity placement with the default scale; `opacity` is 1 and `visible` is true; two calls differ in `id`.

- [ ] **Step 1 (RED):** `/test-first` importing `createUnderlay` (and `NewUnderlayOptions`) from `../factories` and an `AssetReference` from `core`. Verify it fails because `createUnderlay` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `createUnderlay` returning the identity-placement underlay, reusing the factories' existing id generator and adding the `DEFAULT_UNDERLAY_MM_PER_PIXEL` constant. Export it (and `NewUnderlayOptions`, `Underlay`, `UnderlayPlacement`) through `core/index.ts`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `createUnderlay` reuses the shared id generator rather than minting ids a new way, and that the identity-placement literal is named, not inlined. Commit `refactor:` (empty marker if no change).

---

## Section B: calibration math (`core/geometry/calibration.ts`)

### Task B1: `calibrationScale` turns a drawn pixel segment and known distance into millimeters-per-pixel

**Files:**

- Create: `core/geometry/calibration.ts`
- Test: `core/geometry/calibration.test.ts`

**Behavior under test (`calibrationScale(segment, knownDistanceMm)`):** Given a pixel-space `PixelSegment` (the two endpoints the user drew, in the image's own pixel coordinates) and the known real-world distance `knownDistanceMm` between them, returns the millimeters-per-pixel scale `knownDistanceMm / pixelLength`, where `pixelLength` is the straight-line distance between the segment endpoints (reuse `distance` from `core`). A segment of zero pixel length (both endpoints equal) or a non-positive `knownDistanceMm` throws a descriptive error (do not return null; exceptions over error codes, per `.claude/rules.md`). Cover: a horizontal 100-pixel segment with a known distance of 1000 mm returns 10 mm/pixel; a diagonal segment (so the pixel length is the hypotenuse) returns the correct ratio; a zero-length segment throws; a zero or negative known distance throws. Pin the 1% accuracy target loosely by asserting the returned scale times the pixel length equals the known distance within a tight tolerance.

- [ ] **Step 1 (RED):** `/test-first` importing `calibrationScale` (and `PixelSegment`) from `./calibration`. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `calibrationScale`: compute the pixel length with `distance`, throw on a zero-length segment or a non-positive distance, otherwise return `knownDistanceMm / pixelLength`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the guard clauses readable (one concern per check), name any tolerance constant, and avoid a nested ternary. Commit `refactor:` (empty marker if no change).

### Task B2: `applyCalibration` updates the placement to the calibrated scale

**Files:**

- Modify: `core/geometry/calibration.ts`
- Test: `core/geometry/calibration.test.ts`

**Behavior under test (`applyCalibration(placement, millimetersPerPixel)`):** Returns a new `UnderlayPlacement` equal to the input placement but with `millimetersPerPixel` replaced by the calibrated value, keeping `offset` and `rotation` unchanged (the offset stays anchored so calibrating rescales about the pixel origin without teleporting the underlay). The input placement is not mutated (returns a fresh object, so the immutable-update convention the dispatcher relies on, ADR-0005, holds). Cover: the returned placement carries the new scale; `offset` and `rotation` are preserved; the input object is unchanged (a different reference is returned).

- [ ] **Step 1 (RED):** `/test-first` importing `applyCalibration` from `./calibration` with a known placement and a new scale. Verify it fails because `applyCalibration` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `applyCalibration` returning `{ ...placement, millimetersPerPixel }`. Export `calibrationScale` and `applyCalibration` through `core/index.ts`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm the spread returns a fresh object and no field is dropped. Commit `refactor:` (empty marker if no change).

---

## Section C: the underlay commands (`core/commands/handlers/underlay-commands.ts`)

> All five handlers reassign `state.floors` immutably, mapping only the target floor to a new object whose `underlays` array is updated, exactly as `addWall` reassigns the floor's `walls`. The dispatcher captures the inverse automatically (ADR-0005); no handler authors an explicit inverse. Because the target-floor-then-target-underlay traversal repeats across `calibrateUnderlay`, `removeUnderlay`, `setUnderlayOpacity`, and `setUnderlayVisibility`, the BLUE phase factors the shared "map the floors, then map the target floor's underlays, then update the target underlay" shape into one small private helper (real shared shape, mirroring the slice-6 `moveWallEndpoint`/`setWallThickness` helper), so each handler does not restate it.

### Task C1: `placeUnderlay` appends an underlay and undoes

**Files:**

- Create: `core/commands/handlers/underlay-commands.ts`
- Test: `core/commands/handlers/underlay-commands.test.ts`

**Behavior under test (`placeUnderlay(floorId, underlay)` dispatched through a `Dispatcher`):** Applying the command appends `underlay` to the target floor's `underlays`, while every existing underlay and wall on that floor and every other floor stay untouched. Dispatching then `undo` removes the appended underlay (the dispatcher's captured inverse restores the prior `underlays` array). The handler reassigns `state.floors` immutably, mapping only the target floor to a new object with `underlays: [...floor.underlays, underlay]`, mirroring `addWall`. Cover: the underlay is appended to the right floor; a sibling floor and the floor's walls are untouched; a dispatch-then-undo round trip removes it.

- [ ] **Step 1 (RED):** `/test-first` importing `placeUnderlay`, `registerUnderlayCommands` (and `Dispatcher` / `CommandRegistry` / `createUnderlay` from `core`), registering the underlay commands, dispatching a `placeUnderlay`, asserting the appended underlay and the untouched neighbors, then `undo` and asserting it is removed. Verify it fails because `placeUnderlay` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `PLACE_UNDERLAY` constant, `PlaceUnderlayParams`, the `placeUnderlay` creator (returning `{ type, params, description: 'Place underlay' }`), and the handler that reassigns `state.floors` immutably. Begin `registerUnderlayCommands` registering `PLACE_UNDERLAY`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the handler's `apply` within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

### Task C2: `calibrateUnderlay` sets the placement and undoes

**Files:**

- Modify: `core/commands/handlers/underlay-commands.ts`
- Test: `core/commands/handlers/underlay-commands.test.ts`

**Behavior under test (`calibrateUnderlay(floorId, underlayId, placement)` dispatched through a `Dispatcher`):** Applying the command replaces the target underlay's `placement` with the given one, while the underlay's `image`, `opacity`, `visible`, every sibling underlay, and every other floor stay untouched. Dispatching then `undo` restores the previous placement. The handler uses the shared floor-and-underlay traversal helper. Cover: the placement changes to the new value; the other underlay fields and a sibling underlay are unchanged; a dispatch-then-undo round trip restores the previous placement.

- [ ] **Step 1 (RED):** `/test-first` for the behavior above (place an underlay, then dispatch a `calibrateUnderlay`, assert the placement and the untouched neighbors, then `undo`). Verify it fails because `calibrateUnderlay` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `CALIBRATE_UNDERLAY`, `CalibrateUnderlayParams`, the `calibrateUnderlay` creator (`description: 'Calibrate underlay'`), and the handler mapping the target underlay to a new object with the given `placement`. Register it in `registerUnderlayCommands`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Extract the shared floor-and-underlay traversal helper now that two handlers locate one underlay on one floor. Commit `refactor:` (empty marker if no change).

### Task C3: `removeUnderlay` drops an underlay and undoes

**Files:**

- Modify: `core/commands/handlers/underlay-commands.ts`
- Test: `core/commands/handlers/underlay-commands.test.ts`

**Behavior under test (`removeUnderlay(floorId, underlayId)` dispatched through a `Dispatcher`):** Applying the command removes the target underlay from the floor's `underlays`, while sibling underlays, walls, and other floors stay untouched. Dispatching then `undo` restores the removed underlay (at its original position in the array). Cover: the underlay is removed from the right floor; a sibling underlay is preserved; a dispatch-then-undo round trip restores it.

- [ ] **Step 1 (RED):** `/test-first` for the removal-and-undo behavior. Verify it fails because `removeUnderlay` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `REMOVE_UNDERLAY`, `RemoveUnderlayParams`, the `removeUnderlay` creator (`description: 'Remove underlay'`), and the handler filtering the target underlay out of the floor's `underlays`. Register it. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm the filter reuses the shared floor-locating helper where it can; the array filter (rather than map) is the one place this handler differs. Commit `refactor:` (empty marker if no change).

### Task C4: `setUnderlayOpacity` and `setUnderlayVisibility` set their field and undo

**Files:**

- Modify: `core/commands/handlers/underlay-commands.ts`
- Test: `core/commands/handlers/underlay-commands.test.ts`

**Behavior under test (`setUnderlayOpacity(floorId, underlayId, opacity)` and `setUnderlayVisibility(floorId, underlayId, visible)` dispatched through a `Dispatcher`):** `setUnderlayOpacity` sets the target underlay's `opacity` to the given value and `setUnderlayVisibility` sets its `visible` flag, each leaving the placement, the image, the other field, sibling underlays, and other floors untouched. Each undoes through the dispatcher's captured inverse. Both reuse the shared floor-and-underlay traversal helper. Cover, for each: the field changes to the new value; the other underlay fields are unchanged; a dispatch-then-undo round trip restores the previous value.

- [ ] **Step 1 (RED):** `/test-first` for both commands (opacity and visibility), each with an apply-and-undo assertion. Verify it fails because neither is exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `SET_UNDERLAY_OPACITY` / `SET_UNDERLAY_VISIBILITY`, their params interfaces, the two creators (`'Set underlay opacity'`, `'Set underlay visibility'`), and the two handlers reusing the shared traversal helper to set one field. Register both, and finish `registerUnderlayCommands` so it chains all five registrations readably. Export every new type and creator through `core/index.ts`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm all four field-setting handlers (`calibrateUnderlay`, `setUnderlayOpacity`, `setUnderlayVisibility`, and the placement-set inside) share the one traversal helper rather than restating it, and that `registerUnderlayCommands` reads as a single fluent chain. Commit `refactor:` (empty marker if no change).

---

## Section D: underlay scene projection (`core/scene/scene-graph.ts`)

### Task D1: `deriveUnderlayNode` and `graph.underlays` project underlays into the scene graph

**Files:**

- Modify: `core/scene/scene-graph.ts`
- Test: `core/scene/scene-graph.test.ts`

**Behavior under test (`deriveUnderlayNode(floor, underlay)` and `deriveSceneGraph(project).underlays`):** `deriveUnderlayNode` returns an `UnderlaySceneNode` carrying a namespaced id (`underlay:<id>`, mirroring the `wall:` and `floor:` prefixes), the owning `floorId`, and the underlay's `image`, `width`, `height`, `placement`, `opacity`, and `visible` fields. `deriveSceneGraph` populates a new `graph.underlays` sibling array by flat-mapping `deriveUnderlayNodesForFloor` over the floors, exactly as it flat-maps walls and rooms. Cover: a single underlay derives to the expected node with the namespaced id and the copied fields; `deriveSceneGraph` over a project with underlays on a floor returns them in `graph.underlays` tagged with the floor id; the existing `graph.walls` and `graph.rooms` derivation is unchanged (a project with no underlays yields `underlays: []`).

- [ ] **Step 1 (RED):** `/test-first` importing `deriveUnderlayNode` and `deriveSceneGraph` from `../scene/scene-graph` (or `core`), building a `Floor` with an underlay. Verify it fails because `deriveUnderlayNode` / `graph.underlays` do not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `UnderlaySceneNode`, `deriveUnderlayNode`, `deriveUnderlayNodesForFloor`, the `UNDERLAY_NODE_PREFIX` constant, the `underlays` field on `SceneGraph`, and the `deriveSceneGraph` flat-map. Export `UnderlaySceneNode`, `deriveUnderlayNode`, and `deriveUnderlayNodesForFloor` through `core/index.ts` alongside the existing node exports. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm the new deriver and the `underlays` flat-map read parallel to the wall and room derivers (same shape, same namespacing convention); keep `deriveSceneGraph` within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

---

## Section E: underlay and calibration drawing (`editor/plan/draw-underlay.ts`, `editor/plan/draw-plan.ts`)

### Task E1: `drawUnderlay` paints the image at its projected placement and opacity

**Files:**

- Create: `editor/plan/draw-underlay.ts`
- Modify: `editor/plan/draw-plan.ts` (extend `PlanDrawingContext` with the image-draw and alpha members)
- Modify: `editor/plan/draw-plan-test-fixtures.ts` (the recording fake records the new members)
- Test: `editor/plan/draw-underlay.test.ts`

**Behavior under test (`drawUnderlay(ctx, node, viewport, image)`):** Paints the underlay's source `image` at its **screen** placement: the underlay's pixel origin (`node.placement.offset`) is projected through `worldToScreen(_, viewport)`, and the image is drawn scaled so each source pixel maps to `placement.millimetersPerPixel * viewport.scale` screen pixels (so the underlay tracks pan and zoom). The draw uses the context's alpha so the image renders at `node.opacity`; the alpha is set before the draw and restored to fully opaque after (so a subsequent wall stroke is not dimmed). The `PlanDrawingContext` seam grows by the two members `drawUnderlay` needs: a `globalAlpha: number` property and a `drawImage(image, dx, dy, dWidth, dHeight)` method (the four-argument destination-rect form). `UnderlayImage` is the narrow structural type `drawImage` accepts (a decoded bitmap with `width`/`height`); the test drives it with a recording fake (extending the existing `recordingContext()` so it records `drawImage` calls with their destination rect and the `globalAlpha` in force). Cover: the image is drawn once at the projected screen offset with the scaled destination size; `globalAlpha` is set to `node.opacity` for the draw and restored to 1 afterward. (Rotation: this slice draws axis-aligned underlays; with `rotation === 0` no canvas rotate is applied. Document that a non-zero rotation is deferred to the rotation-gizmo follow-up, so the draw asserts the `rotation === 0` path.)

- [ ] **Step 1 (RED):** `/test-first` importing `drawUnderlay` from `./draw-underlay` and the recording fake from `./draw-plan-test-fixtures`, asserting one `drawImage` at the projected screen placement and the `globalAlpha` set to the node's opacity then restored. Verify it fails because `drawUnderlay` (and the seam members) do not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `drawUnderlay` and `UnderlayImage`; add `globalAlpha` and the four-argument `drawImage` to `PlanDrawingContext`; record both in the test fixture's recording fake. Set `globalAlpha = node.opacity`, draw the image at the projected destination rect, then restore `globalAlpha = 1`. Name the restored-alpha constant. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawUnderlay` within `max-lines-per-function` and `max-params` (pass a small object if a fourth positional argument would be needed); confirm the alpha is always restored even though only `drawImage` is the visible effect. Commit `refactor:` (empty marker if no change).

### Task E2: `drawCalibrationSegment` paints the in-progress calibration line

**Files:**

- Modify: `editor/plan/draw-underlay.ts`
- Test: `editor/plan/draw-underlay.test.ts`

**Behavior under test (`drawCalibrationSegment(ctx, segment, viewport)`):** Paints the calibration measurement line at its **screen** position, projecting `segment.start` and `segment.end` through `worldToScreen(_, viewport)`, with a distinct calibration color and a small endpoint marker at each end (so the user sees the two measured points), through the existing `PlanDrawingContext` seam (it uses only `strokeStyle`, `fillStyle`, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `arc`, `stroke`, `fill`, all already on the seam, so the seam does not grow further). Cover: a line is stroked between the two projected screen endpoints, and an endpoint marker (an `arc`) is recorded at each end. Name the calibration color, line width, and marker radius as module constants (`no-magic-numbers`).

- [ ] **Step 1 (RED):** `/test-first` importing `drawCalibrationSegment` from `./draw-underlay`, asserting a stroked line and two endpoint markers at the projected screen endpoints for a known segment and viewport. Verify it fails because `drawCalibrationSegment` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `drawCalibrationSegment`, projecting both endpoints and painting the line plus the two markers through the existing seam. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. The endpoint marker is the same shape `drawStartMarker` and `drawSnapIndicator` already paint; check for a shared single-marker helper worth extracting (only if it is real duplication, not coincidental). Commit `refactor:` (empty marker if no change).

### Task E3: `drawPlan` paints underlays beneath the grid and the calibration segment above the plan

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawPlan(ctx, options)` with `options.underlays` and `options.calibration`):** When `DrawPlanOptions.underlays` is a non-empty list of drawable underlays (each pairing an `UnderlaySceneNode` with its resolved `UnderlayImage`), `drawPlan` paints each **visible** underlay (skipping `visible === false`) by calling `drawUnderlay`, **beneath the grid** (the underlay is the bottom layer, so the grid, rooms, and walls render on top of it). When `DrawPlanOptions.calibration` is a `PreviewSegment`, `drawPlan` paints it via `drawCalibrationSegment` as an overlay **above** the walls and the preview (so the measured line is visible on top of everything but the rulers). Both fields are optional, so every existing `drawPlan` test (which omits them) stays green and the slice-1/3/4/5 paint output is unchanged. Observe through the recording fake: with one visible underlay supplied, a `drawImage` appears before the first grid op; with `calibration` set, a calibration line appears after the wall and preview ops; an underlay with `visible === false` is not drawn. The layering decision (underlay at the very bottom, calibration near the top under the rulers) is recorded here and flagged in the Open questions section as the provisional order.

- [ ] **Step 1 (RED):** `/test-first` for the underlay-beneath-grid, calibration-above-walls, and `visible === false` skip cases of `drawPlan`. Verify it fails because `underlays` / `calibration` are not accepted options. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `underlays?: readonly DrawableUnderlay[]` and `calibration?: PreviewSegment` on `DrawPlanOptions`; in `drawPlan`, after the `clearRect` and before `drawGrid`, paint each visible underlay; after the preview/snap draws and before the rulers, paint the calibration segment when set. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawPlan` a readable paint-order sequence within `max-lines-per-function` (extract a small `drawUnderlays` loop helper if the visible-filter plus loop would push it over); confirm the underlay paints before the grid and the calibration after the walls. Commit `refactor:` (empty marker if no change).

---

## Section F: the calibration tool state machine (`editor/plan/calibration-tool.ts`)

### Task F1: `advanceCalibrationTool` records the first click and completes on the second

**Files:**

- Create: `editor/plan/calibration-tool.ts`
- Test: `editor/plan/calibration-tool.test.ts`

**Behavior under test (`advanceCalibrationTool(state, point)`):** From `{ phase: 'idle' }`, the first call moves to `{ phase: 'measuring', start: point }` and emits no segment. From `{ phase: 'measuring', start }`, the second call returns to `{ phase: 'idle' }` and emits a completed `segment: { start, end: point }`. When the second click equals the start (a zero-length segment), the machine returns to idle and emits **no** segment (mirroring the slice-1 `wall-tool` cancel on a zero-length wall, so calibration cannot produce a degenerate measurement). The machine returns the next state and an optional segment; it never dispatches and never touches React. Cover: idle then first click records the start with no segment; measuring then second click emits the completed segment and returns to idle; a second click equal to the start cancels to idle with no segment.

- [ ] **Step 1 (RED):** `/test-first` importing `advanceCalibrationTool`, `IDLE_CALIBRATION_TOOL`, and the `CalibrationToolState` type from `./calibration-tool`. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `CalibrationToolState` union, `IDLE_CALIBRATION_TOOL`, `CalibrationToolResult`, and `advanceCalibrationTool` over the two-state machine, cancelling on a zero-length segment (reuse `distance` from `core` or an exact-equality check for the degenerate case, matching the wall tool's choice). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. The two-click machine is the same shape as `wall-tool.ts`; check whether a genuinely shared two-click-segment helper is worth extracting (only if it is real duplication, not coincidental similarity, since the wall tool also emits an `addWall` command and this one emits a plain segment). Avoid a nested ternary in the phase switch. Commit `refactor:` (empty marker if no change).

### Task F2: `calibrationPreviewSegment` reports the in-progress segment

**Files:**

- Modify: `editor/plan/calibration-tool.ts`
- Test: `editor/plan/calibration-tool.test.ts`

**Behavior under test (`calibrationPreviewSegment(state, point)`):** When `state.phase` is `'measuring'`, returns the live `{ start: state.start, end: point }` segment (the rubber-band the user sees while placing the second point); when `state.phase` is `'idle'`, returns `undefined`. This is a pure read-only projection over the same state, mirroring `wallPreviewSegment`, so the calibration preview is a property of the tested state rather than a fact the glue invents. Cover: measuring returns the segment from the start to the current point; idle returns `undefined`.

- [ ] **Step 1 (RED):** `/test-first` importing `calibrationPreviewSegment` from `./calibration-tool`. Verify it fails because the function is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `calibrationPreviewSegment` returning the in-progress segment when measuring and `undefined` when idle. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the projection a single expression; confirm it returns the existing `PreviewSegment` type (imported from `draw-plan.ts`), not a new segment type. Commit `refactor:` (empty marker if no change).

---

## Section G: the underlay panel (`editor/shell/underlay-panel.tsx`)

### Task G1: the underlay panel renders controls and dispatches opacity, visibility, and remove

**Files:**

- Create: `editor/shell/underlay-panel.tsx` (or `editor/plan/underlay-panel.tsx`; the controller picks the home consistent with the shell layout)
- Test: `editor/shell/underlay-panel.test.tsx`

**Behavior under test (the underlay panel, exercised with React Testing Library):** Given the floor's underlays (each an `UnderlaySceneNode` or the raw `Underlay` plus its `floorId`), a `dispatch`, and a callback to load an image and to start calibration, the panel renders, per underlay, an opacity control, a visibility toggle, a "Calibrate" button, and a remove control, plus a top-level load-image control. Moving the opacity control to a new value dispatches exactly one `setUnderlayOpacity` carrying the floor id, underlay id, and the new opacity. Toggling visibility dispatches one `setUnderlayVisibility` with the flipped `visible`. Pressing remove dispatches one `removeUnderlay`. Pressing "Calibrate" invokes the start-calibration callback for that underlay (it does not dispatch; activating the tool is glue, Task H1). The component takes its data, `dispatch`, and callbacks as props rather than reading the session directly, so the test drives it without the full provider tree and Task H2 supplies the props from the shell. Cover: the panel lists one control group per underlay; changing opacity dispatches one `setUnderlayOpacity` with the expected values; toggling visibility dispatches one `setUnderlayVisibility`; pressing remove dispatches one `removeUnderlay`; pressing calibrate calls the start-calibration callback (no dispatch).

- [ ] **Step 1 (RED):** `/test-first` rendering the panel with one underlay, a spy `dispatch`, and a spy start-calibration callback, asserting the four dispatch/callback behaviors. Verify it fails because the component does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the panel: map each underlay to its control group, wire the opacity control to `setUnderlayOpacity`, the toggle to `setUnderlayVisibility`, remove to `removeUnderlay`, and calibrate to the callback prop; render the load-image control invoking the load callback prop. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the component within `max-lines` / `max-lines-per-function` (extract a per-underlay row subcomponent if the map body grows); name the opacity step/min/max constants; ensure each control dispatches exactly one command. Commit `refactor:` (empty marker if no change).

---

## Section H: glue and documentation (infrastructure)

### Task H1: the image-load and calibration glue (`use-underlay.ts` + `plan-view.tsx`) (infrastructure)

**Files:**

- Create: `editor/plan/use-underlay.ts`
- Modify: `editor/plan/plan-view.tsx`
- Modify: `editor/tools/active-tool-context.ts` (add `'calibrate'` to `ToolId`)

This is controller-authored Canvas-and-pointer-and-image glue with no RGB triple (jsdom has no 2D canvas and no real image decoding). All of its decision logic lives in the pure modules above (`createUnderlay`, `placeUnderlay`, `calibrationScale`, `applyCalibration`, `calibrateUnderlay`, `advanceCalibrationTool`, `calibrationPreviewSegment`, `drawUnderlay`, `drawCalibrationSegment`); this task only wires them. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Load an image file into a decoded bitmap keyed by content hash.** In `useUnderlay` (the exact name and props are the controller's choice; for example `useUnderlay({ session, underlays })`), accept a `File` (from a file input or drag-and-drop), read its bytes, compute a sha256 content hash (use the platform `crypto.subtle.digest`; no new dependency), build the content-addressed `AssetReference` (`scope: 'project'`, the computed `contentHash`), decode the bytes to a bitmap (`createImageBitmap` or an `Image` element), and hold the decoded bitmap in an in-memory `Map` keyed by the content hash for the session. Then `createUnderlay({ image, width, height })` and `session.dispatch(placeUnderlay(floorId, underlay))`. State the in-memory, session-only nature of the bitmap cache in the deferrals and the Open questions section (the content-addressed persistence pipeline is slice-11 follow-up work).
- [ ] **Step 2: Resolve the drawable underlays for the redraw.** From the scene graph's `graph.underlays` for the active floor, pair each `UnderlaySceneNode` with its decoded bitmap from the in-memory cache (keyed by the reference's content hash), producing the `DrawableUnderlay[]` the `drawPlan` `underlays` option expects. An underlay whose bitmap is not yet decoded is skipped for this frame (it paints once decoding resolves and the redraw re-runs).
- [ ] **Step 3: Add the calibration-tool lifecycle.** Hold the `CalibrationToolState` (starting `IDLE_CALIBRATION_TOOL`) and the live cursor in React state. When the active tool is `'calibrate'`, a pointer-down advances `advanceCalibrationTool`; on the completing second click, derive the world-space segment, convert it to the target underlay's **pixel space** using the current placement (subtract the placement offset and divide by `placement.millimetersPerPixel`), prompt the user for the known real-world distance through the panel's distance input, parse it with `parseLength(text, { assumeUnit })` (choosing the project's unit system's assumed unit, mirroring the slice-6 default-preferences choice), compute `calibrationScale(pixelSegment, knownMm)`, `applyCalibration(placement, scale)`, and `session.dispatch(calibrateUnderlay(floorId, underlayId, nextPlacement))`. An unparseable distance dispatches nothing (the try/catch around `parseLength` is the only place that rule lives). A zero-length segment (the tool already cancels) dispatches nothing.
- [ ] **Step 4: Track and draw the live calibration preview.** Derive the live `calibrationPreviewSegment(state, cursor)` while measuring and pass it to `drawPlan` as the new `calibration` option, and pass the resolved `DrawableUnderlay[]` as the `underlays` option; add both to the `usePlanRedraw` dependencies so the underlay and the rubber-band measure line repaint.
- [ ] **Step 5: Compose the calibration handlers without disturbing the other tools.** Extend `composePointerHandlers` (or its `PointerSources`) so the calibration handlers run **only** under the `'calibrate'` tool; the wall-draw and select tool paths are entirely unaffected (the calibration glue is gated on `tool === 'calibrate'`), and the pan gesture still takes top priority as it does today. The underlay always paints regardless of the active tool (it is the background), so the `underlays` draw is not gated on a tool.
- [ ] **Step 6: Add `'calibrate'` to `ToolId`.** In `editor/tools/active-tool-context.ts`, extend the `ToolId` union to `'draw-wall' | 'select' | 'calibrate'`, and add a tool button for it in the tools panel if the panel enumerates tools (a one-line addition mirroring the existing entries). The default tool is unchanged.
- [ ] **Step 7: Respect `max-lines`.** `plan-view.tsx` is near the limit; the underlay state, the calibration state machine, and the image-load logic live in `use-underlay.ts` (the way slice 3 split `use-viewport-controls.ts` and slice 5 split `use-plan-selection.ts`), leaving `plan-view.tsx` as composition. Keep `use-underlay.ts` and `plan-view.tsx` coverage-excluded glue.
- [ ] **Step 8: Verify.** Run the full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Expected: all green; `eslint .` at zero problems; `plan-view.tsx` and `use-underlay.ts` stay coverage-excluded glue. Confirm by reasoning that the functional wall-drawing end-to-end logic is unaffected: the calibration glue is gated on `tool === 'calibrate'`, the `draw-wall` tool path and the default viewport (unchanged scale and zero offset) keep the end-to-end canvas clicks mapping to the same world points, and a project with no underlays passes an empty `underlays` list (no `drawImage`), leaving the rendered plan unchanged.
- [ ] **Step 9:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task H2: place the underlay panel in the shell (infrastructure)

**Files:**

- Modify: `editor/shell/editor-shell.tsx`

This is controller-authored wiring with no RGB triple; the panel's behavior is tested in Task G1. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Render the underlay panel in the inspector.** The shell renders an `editor-shell__inspector` aside today. Render the `underlay-panel` inside it (alongside or below the existing selection text), supplying the active floor's underlays from the scene graph (`useSceneGraph().underlays` filtered to the active floor) or the session project, `session.dispatch`, the load-image callback and the start-calibration callback from `useUnderlay`, and the project's unit preferences (use `DEFAULT_METRIC_PREFERENCES` or `DEFAULT_IMPERIAL_PREFERENCES` for the project's `units`, mirroring the slice-6 default-preferences choice; state this in the deferrals).
- [ ] **Step 2: Wire the load-image and calibrate callbacks.** The load-image control calls back into `useUnderlay`'s file loader (Task H1 Step 1); the calibrate button calls back to set the active tool to `'calibrate'` and arm the calibration target underlay id, so the next two plan clicks measure that underlay.
- [ ] **Step 3: Verify.** Run the full check chain. Expected: all green; `eslint .` at zero problems. The shell stays coverage-excluded glue; the panel carries its own Task G1 test. Confirm the wall-drawing end-to-end spec is unaffected (the panel renders in the inspector and only dispatches when its controls are used, which the wall-drawing flow does not trigger).
- [ ] **Step 4:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task H3: roadmap update (infrastructure, final task, after the code lands)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 12 done and record its deferrals.** Flip the slice-12 row from `pending` to `done`, update the current-status sentence to include slice 12 (and note Phase 1, the two-dimensional plan editor, is feature-complete once slice 11 also lands), and add a "Slice 12 (done) scope and deferrals" block mirroring the slice-4/5/6 voice: raster-image underlay and single-segment calibration only (PDF and glTF/glb underlays and trace mode are Phase 5); the rotation and free-move gizmos deferred in favor of calibration-via-scale and the panel; underlay selection/hit-testing deferred (managed through its panel, not the slice-5 selection); and, most importantly, the **persistence deferral**: the decoded raster bitmap is held in memory for the session because the content-addressed asset pipeline (`AssetCache`, the project-store `assets/` folder) is slice-11 follow-up work and is not yet wired, so the `Underlay.image` reference is content-addressed and forward-compatible but the bytes do not yet round-trip through save/open; a follow-up planning round finalizes persistence once the asset/store pipeline lands. Close with the wall-drawing end-to-end note (the underlay and calibration glue is gated on its panel and the `'calibrate'` tool, so the functional end-to-end spec is unaffected).
- [ ] **Step 2: Verify.** `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task H4: knowledge curation (post-merge, controller-run)

- [ ] Skip during the slice. After the section-level work lands and merges, the controller runs the `knowledge-curator` to add or refresh a local ADR for the image underlay and calibration: the additive `Underlay` model with a content-addressed `image` reference (cross-link ADR-0007) and the `floor.underlays` array (cross-link the section-3.1 entity tree); the five undoable commands following the `addWall` immutable-`state.floors`-reassignment pattern with the dispatcher capturing inverses (cross-link ADR-0005) and the shared floor-and-underlay traversal helper; the pure `calibrationScale` / `applyCalibration` math and the pixel-versus-world boundary handled at the glue; the `advanceCalibrationTool` two-click machine mirroring `wall-tool.ts` (cross-link ADR-0021); `drawUnderlay` growing the `PlanDrawingContext` seam by `drawImage` and `globalAlpha` and the underlay-beneath-grid / calibration-above-walls paint order (cross-link ADR-0021 the seam-grows-by-a-few-members pattern and ADR-0031 the viewport projection the underlay reuses); and the persistence, gizmo, PDF/glTF, trace-mode, and selection deferrals. Most importantly, record the persistence open question (content-addressed bytes are session-only this slice; a follow-up finalizes the `AssetCache`/project-store wiring once slice 11 lands) so a future session resumes it. Regenerate the local index with `pnpm knowledge:index` and run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice. No `docs/specs/` change is required because this implements behavior the specification already mandates (sections 3.1, 3.2, 4.5, 6.2, and the section 10 Phase 1 deliverable "Image underlay with calibration").

---

## Open questions pending dependencies

These are design decisions that **cannot be finalized in this slice** because they depend on a not-yet-built dependency. They are legitimate dependency-blocked deferrals, not lazy placeholders: every decision **within** the decided scope of this slice is fully specified above. Each item states the question, what it depends on, the provisional assumption this plan makes, and that a follow-up planning round must finalize it.

1. **How is the underlay raster persisted?**
   - **Question:** When a project is saved and reopened, the underlay image bytes must round-trip. The design specification persists underlays content-addressed in the project's `assets/<contentHash>.png` folder (sections 3.1 and 3.3) so the migration audit trail is preserved.
   - **Depends on:** the content-addressed asset pipeline. ADR-0007 defines the `AssetReference` value object but explicitly records that "the aggregating `AssetRegistry` and the full resolution-with-fallback algorithm remain unimplemented; only the reference value object exists today". The `storage/` `AssetCache` (`has`/`get`/`put` keyed by content hash) and the project-store `assets/` writeback are slice-11 (project stores, persistence, and migrations) follow-up work; the ROADMAP records "generation of `assets/` ... is owned by the asset and pack work" as a deferred follow-up.
   - **Provisional assumption this plan makes:** the decoded bitmap is held **in memory for the session only** (the in-memory `Map` keyed by content hash in `use-underlay.ts`, Task H1). The `Underlay.image` reference is content-addressed (`scope: 'project'`, computed sha256) **today**, so the model and the command set are forward-compatible: when the asset pipeline lands, persisting and reloading the bytes is a storage-side change behind the same reference, with no model or command reshaping. Until then, the underlay does not survive a save/open cycle.
   - **Finalization:** a follow-up planning round, scheduled once slice 11's `AssetCache` and the project-store `assets/` writeback are wired, must finalize: writing the bytes to the asset cache on placement, resolving the reference to bytes on load, the 80%-quota and eviction behavior for large rasters, and whether decode happens eagerly on load or lazily on first paint.

2. **Is the underlay per-floor or per-project?**
   - **Question:** The `underlays` array could hang off each `Floor` (calibrated per floor plan) or off the `Project` (one shared underlay across floors).
   - **Depends on:** the multi-floor surface. Multi-floor support (add/remove/reorder floors, per-floor active view) is Phase 5 (section 10); today the editor operates on `project.floors[0]`. The per-floor-versus-per-project choice only becomes observable once multiple floors and floor switching exist.
   - **Provisional assumption this plan makes:** **per-floor**, matching the design specification's entity tree, which places `underlays[]` under each `floor` (section 3.1) and states "underlays are first-class on each floor" (section 3.2). The commands take a `floorId` and the scene node carries a `floorId`, so per-floor is wired now; with one floor today the distinction is invisible, and the model already matches the spec, so this is low-risk.
   - **Finalization:** the multi-floor slice (Phase 5) confirms the per-floor model end to end (the panel shows the active floor's underlays; switching floors switches the visible underlay) and decides whether a "share this underlay across floors" affordance is wanted; no model change is anticipated, only UI.

3. **What is the layering order of the underlay relative to grid, rulers, walls, and overlays?**
   - **Question:** Where does the underlay sit in the paint order, and does the grid read legibly over a photographic raster?
   - **Depends on:** the DOM-overlay rendering surface and any underlay-dimming or grid-on-top toggle. The design specification's DOM overlay for interactive UI (selection rings, dimension chips, snap indicators; section 6.2) is later polish (deferred since slice 3); a user preference for "grid above or below the underlay" belongs with the editor-preferences surface (also deferred). Whether rulers should ever be dimmed over the underlay is a visual-design call best made once the overlay exists.
   - **Provisional assumption this plan makes (decided and fully specified for this slice):** **underlay at the very bottom, then grid, then room fills, then walls, then the live preview/snap, then the calibration segment, then the rulers on top** (Task E3). The underlay is the background tracing layer, the grid and plan render legibly on top of it, the calibration line sits above the plan so the user sees the measurement, and the rulers stay the topmost chrome band. The per-underlay `opacity` control lets the user dim a busy raster so the grid stays readable.
   - **Finalization:** the editor-preferences slice (and the DOM-overlay work) may add a "grid above underlay" toggle or a global underlay dim, and may move snap indicators and the calibration readout to the DOM overlay; the Canvas paint order shipped here is the default and is changed only behind a preference, not silently.

4. **DOM `<img>` layer versus canvas-drawn image?**
   - **Question:** Render the underlay as a positioned DOM `<img>` (CSS-transformed to mirror the world matrix) beneath a transparent canvas, or draw the decoded bitmap directly into the plan canvas with `drawImage`?
   - **Depends on:** the DOM-overlay rendering surface (section 6.2). The design specification's plan renderer is "Canvas (2D context) for the bulk ... including underlay images" (section 6.2), with the DOM overlay reserved for interactive UI; but the overlay layer that would host a CSS-transformed `<img>` is itself deferred (since slice 3 the grid, rulers, snap indicator, and marquee all paint on the Canvas rather than the DOM overlay).
   - **Provisional assumption this plan makes:** **canvas-drawn image** via `drawImage` through the `PlanDrawingContext` seam (Task E1), consistent with section 6.2 ("Canvas ... underlay images") and with the slice-3/4/5 decisions to paint grid, rulers, snap indicators, and the marquee on the Canvas rather than the DOM overlay. This keeps the underlay in the same pan/zoom transform as the rest of the plan with no separate CSS-matrix mirroring to keep in sync, and keeps the slice within `editor/plan/` with no new overlay layer.
   - **Finalization:** if the DOM-overlay work later moves interactive chrome to the DOM, a follow-up may reconsider a DOM `<img>` underlay for crispness at extreme zoom or for very large rasters (where a single `drawImage` per frame is a cost); the seam (`drawUnderlay` behind `PlanDrawingContext`) is narrow enough that switching to a DOM layer would be a glue change, not a model or command change.

---

## Self-review

**Behavior coverage:** Every behavior maps to a task. `createUnderlay` (identity placement, fresh id) is Task A2 (the `Underlay`/`Floor` types are Task A1, exercised through it); `calibrationScale` (mm-per-pixel, throws on degenerate input) is Task B1; `applyCalibration` (updated placement, immutable) is Task B2; the five commands (`placeUnderlay`, `calibrateUnderlay`, `removeUnderlay`, `setUnderlayOpacity`, `setUnderlayVisibility`), each apply-and-undo, are Tasks C1-C4; `deriveUnderlayNode` / `graph.underlays` is Task D1; `drawUnderlay` (image at projected placement and opacity) is Task E1, `drawCalibrationSegment` (the measure line) is Task E2, and `drawPlan` gating on `underlays` / `calibration` (underlay beneath grid, calibration above walls, `visible` skip) is Task E3; `advanceCalibrationTool` (two-click machine, zero-length cancel) is Task F1 and `calibrationPreviewSegment` (live segment) is Task F2; the underlay panel (controls dispatch opacity/visibility/remove, calibrate invokes the callback) is Task G1. The image-load and calibration controller (load to a content-hashed bitmap, drive the calibration tool, parse the distance, dispatch `calibrateUnderlay`; wall-draw and select tools unaffected) is the infrastructure Task H1; placing the panel is the infrastructure Task H2; the roadmap update is Task H3; knowledge curation is the post-merge Task H4.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders inside the decided scope. Every behavior task names the signature under test and the concrete cases to pin; every infrastructure step is a concrete wiring instruction. The four items in "Open questions pending dependencies" are explicitly dependency-blocked deferrals (asset pipeline, multi-floor, DOM overlay, editor preferences), each with a stated provisional assumption that this slice fully implements, so nothing in scope is left unspecified. No literal test bodies or full implementations appear, per the role-separated cycle; the only code shown is the public-contract block.

**Type-name consistency:** The public names are spelled identically across every task and the contract block: `Underlay`, `UnderlayPlacement`, `NewUnderlayOptions`, `createUnderlay`, `DEFAULT_UNDERLAY_MM_PER_PIXEL`, `PixelSegment`, `calibrationScale`, `applyCalibration`, `PLACE_UNDERLAY` / `CALIBRATE_UNDERLAY` / `REMOVE_UNDERLAY` / `SET_UNDERLAY_OPACITY` / `SET_UNDERLAY_VISIBILITY`, their `*Params` interfaces, the five creators, `registerUnderlayCommands`, `UnderlaySceneNode`, `deriveUnderlayNode`, `deriveUnderlayNodesForFloor`, `CalibrationToolState`, `IDLE_CALIBRATION_TOOL`, `advanceCalibrationTool`, `calibrationPreviewSegment`, `drawUnderlay`, `drawCalibrationSegment`, `UnderlayImage`, `DrawableUnderlay`, and the optional `underlays?` / `calibration?` options. `UnderlayPlacement` is single-sourced in `core/model/types.ts`, re-exported from `core`, and imported by the calibration math, the commands, the scene graph, and the drawing, so `CalibrateUnderlayParams.placement`, `applyCalibration`'s return, and `UnderlaySceneNode.placement` match. `Point` and `AssetReference` come from `core` unchanged; `PreviewSegment` and `PlanDrawingContext` are the existing `draw-plan.ts` types, reused (no parallel segment type). The new model field (`Floor.underlays`), the new `SceneGraph.underlays`, and the new `DrawPlanOptions` fields are additive and optional where they can be, so slice-1/3/4/5/6 call sites and tests compile and pass unchanged, and `registerWallCommands` / `registerProjectCommands` are untouched (the underlay commands register through a new `registerUnderlayCommands`).

**Ordering and dependencies:** The model and factory (A) precede everything that constructs an underlay; the calibration math (B) precedes the calibration glue (H1) that calls it; the commands (C) precede the panel (G1) and the glue (H1) that dispatch them, and depend on the model (A); the scene projection (D) precedes the drawing (E3) and the glue (H1) that read `graph.underlays`, and depends on the model (A); the drawing (E) depends on the scene node (D) and the seam, and precedes the glue (H1) that passes `underlays` / `calibration`; the calibration tool (F) precedes the glue (H1) that drives it; the panel component (G1) precedes its shell placement (H2); the `ToolId` extension is in H1 (Step 6) before the panel's calibrate button arms it (H2); the roadmap update (H3) is the final task after all code lands; knowledge curation (H4) is post-merge. The recording fake in `draw-plan-test-fixtures.ts` grows by exactly the two members `drawUnderlay` needs (`drawImage`, `globalAlpha`), recorded in Task E1, so every existing `draw-plan.test.ts` fake stays a valid `PlanDrawingContext`; `drawCalibrationSegment` (E2) and `drawPlan`'s new gated calls (E3) add no further seam members.

**Back-compatibility and acceptance:** `Floor` (now with `underlays`), `SceneGraph` (now with `underlays`), `DrawPlanOptions` (now with optional `underlays` / `calibration`), `ToolId` (now with `'calibrate'`), and the command registry remain compatible with every existing call site and test; `createFloor` initializes `underlays: []` so existing floor construction is unaffected, and a project with no underlays paints exactly as before. The functional wall-drawing end-to-end spec is preserved because all new editing wiring is gated on the underlay panel and the `'calibrate'` tool, and the default viewport keeps the original scale and zero offset, leaving the `draw-wall` pointer-to-world mapping identical. At acceptance the calibration math returns the correct millimeters-per-pixel (round-tripping to within the 1% target), the five commands apply and undo through the dispatcher, the underlay derives into the scene graph and paints beneath the grid at its calibrated placement and opacity, the calibration tool measures a segment and the glue parses a known distance to dispatch an undoable `calibrateUnderlay`, and the panel dispatches opacity, visibility, and remove, with the full check chain green, `eslint .` at zero problems, and `rgb:audit` clean. The persistence of the raster bytes is the one acknowledged dependency-blocked gap (Open questions item 1), finalized in a follow-up round once the asset/store pipeline lands.

**Em-dash scan:** the file uses hyphens, commas, parentheses, and colons throughout; no em-dash characters are present in the prose or the headings.
