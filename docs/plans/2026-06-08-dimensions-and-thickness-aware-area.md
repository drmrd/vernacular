# Dimensions and Thickness-Aware Area Implementation Plan

> **For agentic workers:** Executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`). Each behavior runs RED (`/test-first` -> `test-author`, commit `test:`), GREEN (`/implement` -> `implementer`, commit `feat:`), then BLUE (`/clean-code-review` then `/refactor`, commit `refactor:` or an empty marker). Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas/tool wiring, docs) committed as `build:`/`docs:` or with an `Infrastructure:` trailer so the cycle audit skips them. This plan names each behavior and its public signature; it ships no literal test bodies.

**Goal:** Report the thickness-aware clear floor area of derived rooms, and let the user draw, see live, persist, select, and remove linear dimensions.

**Architecture:** Part A adds a pure `insetPolygon` and threads each room-edge's host-wall half-thickness through the face-enumeration room derivation to produce a `clearPolygon`, making `Room.area` the clear-area figure (the slice-8 label updates for free). Part B adds an additive `Dimension` per-floor entity with two undoable commands, pure length/geometry helpers, a scene projection, Canvas rendering through the existing seam, a two-click tool, hit-test and marquee selection, an inline inspector, and a v3-to-v4 migration.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D, React + React Testing Library, Vitest. No new dependencies. Stacked on slice 7 (schema v3; `Floor` has `walls`, `openings`, `underlays`).

---

## Scope boundary (this is slice 9 of ~12)

Designed in `docs/specs/2026-06-08-dimensions-and-thickness-aware-area.md`, recorded in ADR-0039. **In scope:** `insetPolygon`; thickness-aware `Room.clearPolygon`/`area` and `RoomSceneNode.clearPolygon`; the `Dimension` model, factory, and `Floor.dimensions`; `addDimension`/`removeDimension`; `dimensionLength`/`dimensionGeometry`; the `DimensionSceneNode` projection; the v3-to-v4 migration; `drawDimension` and the `drawPlan` integration; the two-click `dimension` tool with live preview; dimension hit-test and marquee selection; the inline dimension inspector (length + Remove); and the editor glue. **Out of scope (deferrals in the slice spec, sections 2 and 10):** wall-anchored/auto-updating dimensions; angular/radial/ordinate/chain dimensions and auto-dimensioning; the offset-drag gizmo and offset editing; dimension styles; thickness-aware fill and hit-test (only `area`/`clearPolygon` are thickness-aware); and best-effort clear-area geometry for over-inset/holes/acute corners.

**Acceptance:** a single rectangular room of centerline `w` x `h` bounded by walls of thickness `t` reports `area === (w - t) * (h - t)` and a `clearPolygon` inset by `t/2` per side; `insetPolygon` insets convex and non-convex polygons and normalizes winding; the two commands apply and undo through the captured inverse; `dimensionLength`/`dimensionGeometry` are correct including `offset === 0`; `graph.dimensions` and `RoomSceneNode.clearPolygon` derive; the migration backfills `dimensions: []` so a v3 project round-trips; `drawDimension` emits the line, arrowheads, extension lines, and text; the two-click tool emits `addDimension` and previews; `hitTest` resolves opening>wall>dimension>room and the marquee contains a dimension; the inspector shows the length and removes. Full chain green; `eslint .` zero problems; `rgb:audit` clean; wall-drawing e2e still passes.

---

## Public contract

```ts
// core/geometry/polygon.ts (addition)
/** Each edge i (vertex i -> i+1) shifted inward by edgeOffsets[i]; corners are adjacent shifted-edge intersections. Winding normalized; best-effort on self-intersection. */
export function insetPolygon(polygon: Point[], edgeOffsets: number[]): Point[]

// core/topology/rooms.ts: Room gains `clearPolygon: Point[]`; deriveRooms sets clearPolygon (per-edge half-thickness inset) and area = abs(polygonArea(clearPolygon)).

// core/model/types.ts
export interface Dimension {
  id: string
  start: Point
  end: Point
  offset: number
}
// Floor gains: dimensions: Dimension[]

// core/model/factories.ts
export interface NewDimensionOptions {
  start: Point
  end: Point
  offset?: number
  id?: string
}
export function createDimension(options: NewDimensionOptions): Dimension // offset default 0
// createFloor initializes dimensions: []

// core/commands/handlers/dimension-commands.ts
export const ADD_DIMENSION = 'floor/add-dimension'
export const REMOVE_DIMENSION = 'floor/remove-dimension'
export interface AddDimensionParams {
  floorId: string
  dimension: Dimension
}
export interface RemoveDimensionParams {
  floorId: string
  dimensionId: string
}
export function addDimension(floorId: string, dimension: Dimension): Command<AddDimensionParams>
export function removeDimension(
  floorId: string,
  dimensionId: string,
): Command<RemoveDimensionParams>
export function registerDimensionCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>

// core/geometry/dimension.ts
export function dimensionLength(dimension: Pick<Dimension, 'start' | 'end'>): number
export interface DimensionGeometry {
  lineStart: Point
  lineEnd: Point // the (offset) dimension line
  extensionStart: readonly [Point, Point] // measured start -> its dimension-line end
  extensionEnd: readonly [Point, Point]
}
export function dimensionGeometry(start: Point, end: Point, offset: number): DimensionGeometry

// core/scene/scene-graph.ts
export const DIMENSION_NODE_PREFIX = 'dimension:'
export interface DimensionSceneNode {
  id: string
  kind: 'dimension'
  floorId: string
  start: Point
  end: Point
  offset: number
  length: number
}
export function deriveDimensionNode(floor: Floor, dimension: Dimension): DimensionSceneNode
export function deriveDimensionNodesForFloor(floor: Floor): DimensionSceneNode[]
// SceneGraph gains: dimensions: DimensionSceneNode[]; RoomSceneNode gains clearPolygon: Point[]

// core/migrations/schema/add-floor-dimensions.ts
export const addFloorDimensionsMigration: SchemaMigration // from: 3; backfills dimensions: []

// editor/plan/draw-dimension.ts
export interface DrawableDimension {
  node: DimensionSceneNode
  selected: boolean
}
export function drawDimension(
  ctx: PlanDrawingContext,
  dimension: DrawableDimension,
  viewport: Viewport,
  preferences: UnitPreferences,
): void
// DrawPlanOptions gains: dimensions?: readonly DrawableDimension[]

// editor/plan/dimension-tool.ts
export type DimensionToolState = { phase: 'idle' } | { phase: 'measuring'; start: Point }
export const IDLE_DIMENSION_TOOL: DimensionToolState
export interface DimensionToolResult {
  state: DimensionToolState
  command?: Command<AddDimensionParams>
}
export function advanceDimensionTool(
  state: DimensionToolState,
  point: Point,
  floorId: string,
): DimensionToolResult
export function dimensionPreview(
  state: DimensionToolState,
  point: Point,
): PreviewSegment | undefined

// editor/plan/hit-test.ts (additions): dimensionBounds(node), hitTestDimensions(dimensions, point, tolerance); hitTest resolves opening > wall > dimension > room
// editor/plan/marquee.ts: entitiesInRect also returns dimensions whose both endpoints lie inside
// editor/plan/dimension-inspector.tsx: <DimensionInspector floorId dimensionId length units dispatch/> showing the formatted length and a Remove button
```

---

## Section A: thickness-aware area (`core`)

### Task A1: insetPolygon

**Files:** modify `core/geometry/polygon.ts`, `core/geometry/polygon.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `insetPolygon` insets a CCW unit-thick rectangle: a `0..1000` x `0..600` square with all edge offsets `57` returns the rectangle `57..943` x `57..543`; a clockwise input gives the same (winding normalized); a non-convex L-shape insets each edge inward; parallel collinear edges keep the corner on the line. Signature: `insetPolygon`.
- [ ] **GREEN** `/implement`: normalize winding via shoelace sign; for each edge build its inward unit normal and shifted line; each corner is the intersection of the previous and current shifted lines (reuse `segmentIntersection`/line-intersection helpers; handle parallel by keeping the shifted point). Keep functions small.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `insetPolygon` from `core/index.ts`.

### Task A2: thickness-aware deriveRooms

**Files:** modify `core/topology/rooms.ts`, `core/topology/rooms.test.ts`.

- [ ] **RED** `/test-first`: for one rectangular room from four walls (centerline `2000` x `1000`, each wall `thickness: 200`), `deriveRooms(walls)[0]` has `clearPolygon` inset by `100` per side (so `100..1900` x `100..900`) and `area === (2000 - 200) * (1000 - 200) === 1_440_000`; `applyRoomOverrides` with a `customPolygon` sets `clearPolygon` to the custom polygon and `area` to its shoelace area (no inset). Signature: `Room.clearPolygon`.
- [ ] **GREEN** `/implement`: thread each face edge's `wallId` -> wall `thickness` (build a `Map<string, number>` from `walls`), keep the per-edge half-thickness aligned with the cleaned polygon (run the spike removal over the edge list so vertices and offsets stay in step), compute `clearPolygon = insetPolygon(polygon, halfThicknesses)`, and set `area = Math.abs(polygonArea(clearPolygon))`. In `mergeOverride`, set `clearPolygon = customPolygon` alongside the existing area recompute.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task A3: RoomSceneNode.clearPolygon

**Files:** modify `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`.

- [ ] **RED** `/test-first`: `deriveRoomNodesForFloor` copies `clearPolygon` onto each `RoomSceneNode`, and `area` carries the clear figure. Signature: `RoomSceneNode.clearPolygon`.
- [ ] **GREEN** `/implement`: add `clearPolygon` to `RoomSceneNode` and copy `room.clearPolygon` through. (This makes `clearPolygon` a required field; amend the sibling `SceneGraph`/`RoomSceneNode` fixtures with an `Infrastructure:`-trailered `test:` commit, per the slice-7 precedent, if construction sites break.)
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section B: the dimension model and factory (`core`)

### Task B1: Dimension model and createDimension

**Files:** modify `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `createDimension({ start, end })` mints a `Dimension` with a fresh string id, the given `start`/`end`, and `offset === 0`; explicit `offset` and `id` override; `createFloor(...).dimensions` is `[]`. Signatures: `Dimension`, `NewDimensionOptions`, `createDimension`, `Floor.dimensions`.
- [ ] **GREEN** `/implement`: add `Dimension` and `Floor.dimensions`, `NewDimensionOptions`, `createDimension` (mirror `createOpening`/`createUnderlay`), and `dimensions: []` in `createFloor`.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export `Dimension`, `NewDimensionOptions`, `createDimension` from `core/index.ts`. (The new required `Floor.dimensions` may break floor fixtures; amend with an exempt `test:` commit if so.)

---

## Section C: dimension commands (`core`)

### Task C1: addDimension and removeDimension

**Files:** create `core/commands/handlers/dimension-commands.ts`, `core/commands/handlers/dimension-commands.test.ts`; export from `core/index.ts` and register in `bridge/session/editor-session.ts` (infra).

- [ ] **RED** `/test-first` (mirror `opening-commands.test.ts`): `addDimension(floorId, dimension)` appends to the floor's `dimensions` (sibling floors reference-equal), undo removes; `removeDimension(floorId, dimensionId)` filters out, undo restores. Build the dispatcher with `registerDimensionCommands`. Signatures: `ADD_DIMENSION`, `REMOVE_DIMENSION`, params, creators, `registerDimensionCommands`.
- [ ] **GREEN** `/implement` (mirror the underlay/opening command file, reusing a `mapTargetFloor` shape).
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export the symbols from `core/index.ts` and call `registerDimensionCommands(registry)` in `editor-session.ts` (infra).

---

## Section D: dimension geometry (`core`)

### Task D1: dimensionLength and dimensionGeometry

**Files:** create `core/geometry/dimension.ts`, `core/geometry/dimension.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first`: `dimensionLength({ start: {0,0}, end: {300,400} }) === 500`; `dimensionGeometry({0,0},{1000,0}, 0)` returns `lineStart {0,0}`, `lineEnd {1000,0}`, and zero-length extension segments; with `offset: 200` the line shifts perpendicular (to `y: -200` along the left normal of start->end) and the extension segments span from each measured point to its dimension-line end. Signatures: `dimensionLength`, `DimensionGeometry`, `dimensionGeometry`.
- [ ] **GREEN** `/implement`: `dimensionLength` uses `distance`; `dimensionGeometry` builds the unit normal of `start->end` (left normal `(-dy, dx)/len`), shifts both points by `offset * normal` for the line, and pairs each measured point with its shifted end for the extension segments; a zero-length measured segment returns a degenerate geometry without NaN.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export from `core/index.ts`.

---

## Section E: dimension scene projection (`core`)

### Task E1: DimensionSceneNode

**Files:** modify `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`; export from `core/index.ts` (infra).

- [ ] **RED** `/test-first` (mirror the opening projection test in `scene-graph-openings.test.ts`): `deriveDimensionNodesForFloor` yields one node per dimension with id `dimension:<id>`, the `floorId`, `start`/`end`/`offset`, and `length === dimensionLength(...)`; `deriveSceneGraph(project).dimensions` flat-maps and is `[]` for a floor with none. Signatures: `DIMENSION_NODE_PREFIX`, `DimensionSceneNode`, `deriveDimensionNode`, `deriveDimensionNodesForFloor`, `SceneGraph.dimensions`.
- [ ] **GREEN** `/implement` (mirror `deriveOpeningNodesForFloor`; `SceneGraph` gains `dimensions`; `deriveSceneGraph` flat-maps). Amend `SceneGraph` fixtures with an exempt `test:` commit if the required `dimensions` field breaks them.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; export from `core/index.ts`.

---

## Section F: schema migration (`core`)

### Task F1: addFloorDimensions (v3 to v4)

**Files:** create `core/migrations/schema/add-floor-dimensions.ts`, its test; modify `core/migrations/schema/index.ts` and `CURRENT_SCHEMA_VERSION` (infra).

- [ ] **RED** `/test-first` (mirror `add-floor-openings.test.ts`): `addFloorDimensionsMigration.from === 3`; `migrate` backfills `dimensions: []` on a floor lacking it, preserves an existing `dimensions`, leaves other data and `meta.schemaVersion` untouched.
- [ ] **GREEN** `/implement` (mirror `addFloorOpeningsMigration`, mapping floors to default `dimensions`).
- [ ] **BLUE** `/clean-code-review` then `/refactor`; add to `SCHEMA_MIGRATIONS` and bump `CURRENT_SCHEMA_VERSION` to 4; run the migration and factories tests plus the chain.

---

## Section G: dimension rendering (`editor`)

### Task G1: drawDimension

**Files:** create `editor/plan/draw-dimension.ts`, its test (recording `PlanDrawingContext` fake).

- [ ] **RED** `/test-first` (mirror `draw-opening.test.ts`): `drawDimension` strokes the dimension line, an arrowhead at each end (two short stroked vees), the two extension lines, and fills the `formatLength` text at the line midpoint; a `selected` dimension adds a highlight stroke. Signatures: `DrawableDimension`, `drawDimension`.
- [ ] **GREEN** `/implement` using `dimensionGeometry` and `worldToScreen`, `formatLength(node.length, lengthFormatOptions(preferences))` for the text; named constants; seam members only.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task G2: drawPlan draws dimensions

**Files:** modify `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`.

- [ ] **RED** `/test-first`: with `dimensions: readonly DrawableDimension[]`, `drawPlan` renders each after the openings and below the rulers; a call with none paints unchanged.
- [ ] **GREEN** `/implement`: thread `dimensions` through a small `drawDimensions` helper in the documented paint order. Watch the file size limit (extract if needed).
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

---

## Section H: tool, selection, and inspector (`editor`)

### Task H1: the two-click dimension tool

**Files:** create `editor/plan/dimension-tool.ts`, its test.

- [ ] **RED** `/test-first` (mirror `calibration-tool.test.ts`): from `idle`, the first click goes to `measuring` with `start` and emits no command; the second click emits an `addDimension` command for a dimension from `start` to the point and returns to `idle`; a second click equal to the start cancels to idle with no command; `dimensionPreview` returns the live `start`->point segment while measuring and `undefined` when idle. Signatures: `DimensionToolState`, `IDLE_DIMENSION_TOOL`, `advanceDimensionTool`, `dimensionPreview`, `DimensionToolResult`.
- [ ] **GREEN** `/implement` (mirror `advanceCalibrationTool`; build the command via `addDimension(floorId, createDimension({ start, end: point }))`).
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task H2: dimensions in hit-test and marquee

**Files:** modify `editor/plan/hit-test.ts`, `editor/plan/marquee.ts` and their tests.

- [ ] **RED** `/test-first`: `dimensionBounds` spans the dimension's endpoints; `hitTestDimensions` returns the id of a dimension whose line is within tolerance of the point (reuse the point-to-segment distance), else null; `hitTest` resolves a dimension after an opening and a wall but before a room; `entitiesInRect` includes a dimension whose both endpoints are inside. Signatures: `dimensionBounds`, `hitTestDimensions`.
- [ ] **GREEN** `/implement`: add dimensions to `indexEntities`, the narrow `hitTestDimensions` (segment distance), the priority slot, and `dimensionContained` in the marquee.
- [ ] **BLUE** `/clean-code-review` then `/refactor`.

### Task H3: the dimension inspector

**Files:** create `editor/plan/dimension-inspector.tsx`, its RTL test; render from the shell (infra).

- [ ] **RED** `/test-first` (mirror `opening-inspector.test.tsx` Remove): given a selected dimension's length and ids, the inspector shows the `formatLength` text and a Remove button that dispatches `removeDimension(floorId, dimensionId)`. Signature: `DimensionInspector` props.
- [ ] **GREEN** `/implement` the component.
- [ ] **BLUE** `/clean-code-review` then `/refactor`; render it from the shell selection inspector when a single dimension is selected (infra).

---

## Section I: glue and docs (infrastructure)

### Task I1: editor glue (`build:`)

- [ ] Add `'dimension'` to `ToolId` and a Dimension tool button; a `useDimensionTool` hook (mirror the calibration-tool wiring in `use-underlay.ts`/`plan-view.tsx`) dispatching `addDimension` on the second click and previewing; build `DrawableDimension[]` from `graph.dimensions` + selection and pass to `drawPlan`; resolve the single selected `dimension:<id>` to render the inspector; crosshair cursor for the dimension tool. Gate everything on the `dimension`/`select` tools so wall drawing is untouched. Verify typecheck, lint (0), `vitest run`, build. Commit `build:`.

### Task I2: docs (`docs:`)

- [ ] Mark slice 9 done in `ROADMAP.md` with its deferrals; refresh ADR-0039 to landed. Run `pnpm knowledge:index`.

---

## Self-review

- **Spec coverage:** insetPolygon + thickness-aware rooms + RoomSceneNode (A), Dimension model (B), commands (C), geometry (D), scene (E), migration (F), rendering (G), tool+selection+inspector (H), glue+docs (I). Every spec goal maps to a task; every deferral is in the scope boundary.
- **Type consistency:** `Dimension` is produced by `createDimension` and consumed by the commands, scene node, and tool; `DimensionSceneNode` feeds `DrawableDimension`, hit-test, marquee, and the inspector; `insetPolygon` feeds `deriveRooms`; `clearPolygon` flows Room -> RoomSceneNode.
- **No placeholders:** every task names its behavior and signature; the rectangle clear-area numbers are concrete.
