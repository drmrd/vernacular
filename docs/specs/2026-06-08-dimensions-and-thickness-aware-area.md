# Slice design: dimensions and thickness-aware area

Status: approved for planning (2026-06-08)
Scope owner: the dimensions-and-area slice (branch `feat/dimensions-and-thickness-aware-area`), slice 9 of the Phase 1 two-dimensional plan editor
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, sections 3.1, 3.2, 6.2, and the section 10 Phase 1 deliverable "Live + persisted dimensions"
Base: stacked on slice 7 (`feat/openings-doors-and-windows`); the project schema is at version 3 and `Floor` carries `walls`, `openings`, and `underlays`.

## 1. Purpose

Two Phase-1 gaps remain in measurement. First, room area still uses wall
centerlines (slice 1 deferred the thickness-aware interior inset to this slice):
a room reads slightly larger than its real clear floor. Second, the user cannot
annotate a measured distance on the plan. This slice closes both: it derives a
**clear-area polygon** (the centerline polygon inset by each bounding wall's
half-thickness) and reports the thickness-aware area, and it adds **linear
dimensions** the user draws with two clicks, sees live, and persists with the
project.

The behavioral contracts: **a derived room reports the clear (thickness-aware)
floor area inside its walls**, and **a dimension is a persisted two-point linear
annotation that derives its measured length and paints a dimension line, and
round-trips through save and reload.**

## 2. Goals and non-goals

### Goals

- A pure `insetPolygon(polygon, edgeOffsets)` that offsets each polygon edge
  inward by its offset and recomputes the corners as the intersections of
  adjacent offset edges.
- Thickness-aware rooms: `deriveRooms` threads each face edge's host-wall
  half-thickness into `insetPolygon` to produce a `Room.clearPolygon`, and
  `Room.area` becomes the clear-area shoelace area. The `RoomSceneNode` carries
  `clearPolygon`, and the slice-8 room label (which reads `RoomSceneNode.area`)
  now shows the thickness-aware figure with no labeling change.
- An additive `Dimension` model on `floor.dimensions[]` (`id`, `start`, `end`,
  `offset`), `createDimension`, and `Floor.dimensions` initialized empty.
- Two undoable commands through `dispatch`: `addDimension`, `removeDimension`.
- Pure dimension geometry (the measured length and the offset dimension-line and
  extension-line endpoints), a `DimensionSceneNode` projected into the scene
  graph, and Canvas rendering through the existing `PlanDrawingContext` seam (the
  dimension line, arrowheads, extension lines, and the `formatLength` text).
- A two-click `dimension` placement tool (mirroring the slice-12 calibration
  tool) with a live preview, and dimension selection (click and marquee) joining
  the slice-5 hit-test, plus an inline dimension inspector with a Remove control.
- An additive schema bump (v3 to v4) with a migration that backfills
  `dimensions: []` on every floor.

### Non-goals (documented deferrals)

- **Wall-anchored / auto-updating dimensions.** A dimension stores two fixed
  world points; it does not reference walls or openings and does not move when
  they do. Anchoring a dimension to entities (so it tracks edits) is later work.
- **Angular, radial, ordinate, and chain or baseline dimensions, and
  auto-dimensioning.** This slice ships the single linear point-to-point
  dimension the Phase-1 deliverable names; the rest are a later dimensions phase.
- **The perpendicular-drag offset gizmo and offset editing.** A dimension's
  `offset` is set at placement (default 0, the dimension line through the two
  points) and is not editable this slice; the design specification's
  along-jamb / perpendicular-drag dimension gizmos (section 512) are deferred in
  favor of the two-click tool and the inline inspector, mirroring slice 6 and 7.
- **Dimension styles.** Arrowhead style, text placement, and a per-dimension
  precision override are deferred; the slice draws one fixed style and formats
  with the project units.
- **Thickness-aware fill and hit-testing.** Rooms still fill and hit-test on the
  centerline `polygon`; only the reported `area` and the new `clearPolygon`
  are thickness-aware. Painting the room fill inside the clear polygon (so the
  fill stops at the wall faces) is later polish.
- **Best-effort clear-area geometry.** `insetPolygon` is correct for simple
  convex and mildly non-convex room polygons. Self-intersection from over-inset
  (a wall thicker than the room is wide), holes, and very acute corners are
  best-effort and documented, mirroring slice 1's best-effort topology.

## 3. Constraints

- `core/` imports neither React nor Three.js; the geometry, model, commands, and
  migration are pure TypeScript (parent spec invariant 1).
- All mutation flows through `dispatch(command)`; no handler hand-authors an
  inverse (ADR-0005).
- Dimensions and the clear polygon paint through the existing narrow
  `PlanDrawingContext` seam, grown only if forced (ADR-0021).
- Selection stays bridge-owned and outside undo (ADR-0020).
- The wall-drawing end-to-end flow stays green: the dimension tool and inspector
  are gated on the `dimension` and `select` tools, and a project with no
  dimensions paints exactly as before; the thickness-aware area changes only the
  numeric `area` and adds `clearPolygon`, leaving the centerline `polygon` (which
  the fill and hit-test use) unchanged.
- The full check chain and `rgb:audit` stay green; ESLint at zero problems.

## 4. Part A: thickness-aware area

`core/geometry/polygon.ts` gains `insetPolygon(polygon: Point[], edgeOffsets:
number[]): Point[]`. For a polygon wound counter-clockwise, the interior lies to
the left of each directed edge; each edge `i` (from vertex `i` to vertex `i+1`)
is shifted inward (along its left-hand unit normal) by `edgeOffsets[i]`, and the
inset vertex `i` is the intersection of the shifted lines of edges `i-1` and `i`.
Parallel adjacent edges (a straight pass-through) keep the shifted vertex on the
common line. The winding is normalized first (the shoelace sign), so a clockwise
input is handled. Degenerate results (crossed offset edges) are returned
best-effort.

`core/topology/rooms.ts` threads per-edge wall thickness through face tracing.
Each face is an ordered loop of half-edges, and every half-edge already carries
its `wallId`; mapping `wallId` to the wall's `thickness` gives, per polygon edge,
a half-thickness offset. `deriveRooms` builds the centerline `polygon` as today
and additionally builds `clearPolygon = insetPolygon(polygon, halfThicknesses)`,
sets `area = abs(polygonArea(clearPolygon))` (the clear floor area), and keeps
`wallIds` unchanged. The spike removal that cleans dangling stubs runs on the
edge list so the polygon and its per-edge offsets stay aligned. `Room` gains
`clearPolygon: Point[]`. For a `customPolygon` override there are no bounding
walls, so `clearPolygon` equals the custom polygon and `area` is its shoelace
area (no inset), preserving the slice-8 behavior.

`core/scene/scene-graph.ts`: `RoomSceneNode` gains `clearPolygon: Point[]`, copied
through `deriveRoomNodesForFloor`. `area` is already on the node and now carries
the clear-area figure, so the slice-8 label updates with no label change.

## 5. Part B: the dimension model and commands

Additive, in `core/model/types.ts`:

```ts
export interface Dimension {
  id: string
  /** First measured point, in world millimeters. */
  start: Point
  /** Second measured point, in world millimeters. */
  end: Point
  /** Perpendicular offset of the dimension line from the measured segment, in millimeters (0 = on the segment). */
  offset: number
}
```

`Floor` gains `dimensions: Dimension[]`, a sibling of `walls`, `openings`, and
`underlays`. `createDimension({ start, end, offset?, id? })`
(`core/model/factories.ts`) mints a dimension with a fresh id and a default
`offset` of 0; `createFloor` initializes `dimensions: []`.

`core/commands/handlers/dimension-commands.ts` adds `addDimension(floorId,
dimension)` (append) and `removeDimension(floorId, dimensionId)` (filter),
registered through `registerDimensionCommands`, each reassigning `state.floors`
immutably so the dispatcher captures the inverse (ADR-0005), reusing the
`mapTargetFloor` shape the wall, underlay, and opening commands share.
`registerDimensionCommands` is wired into the live session registry.

## 6. Part B: dimension geometry, scene, and rendering

`core/geometry/dimension.ts` (pure): `dimensionLength(dimension)` returns
`distance(start, end)`, and `dimensionGeometry(start, end, offset)` returns the
offset dimension-line endpoints (`start` and `end` shifted along the segment's
perpendicular by `offset`) and the two extension-line segments (from each
measured point to its dimension-line endpoint). At `offset === 0` the dimension
line is the measured segment and the extension lines are zero-length.

`core/scene/scene-graph.ts` adds a `DimensionSceneNode` (namespaced
`dimension:<id>`, the owning `floorId`, the `start`/`end`/`offset`, and the
derived `length`), `deriveDimensionNode` / `deriveDimensionNodesForFloor`, and a
`graph.dimensions` array that `deriveSceneGraph` flat-maps, exactly as it
flat-maps walls, rooms, openings, and underlays (ADR-0018).

`editor/plan/draw-dimension.ts` paints a dimension through the seam: the
dimension line with arrowheads at each end, the two extension lines, and the
`formatLength` measured text centered on the dimension line (Canvas `fillText`,
consistent with section 6.2 and the slice-3/8 decision to draw labels on the
Canvas). `drawPlan` gains an optional `dimensions?: readonly DrawableDimension[]`
field and paints them above the plan and below the rulers; a project with no
dimensions paints unchanged.

## 7. Part B: tool, selection, and inspector

- **Dimension tool.** A `dimension` member joins the `ToolId` union; a two-click
  state machine (`editor/plan/dimension-tool.ts`, mirroring the slice-12
  `advanceCalibrationTool`) records the first click as the start, the second as
  the end, and emits an `addDimension` for a fresh dimension; a `dimensionPreview`
  paints the live rubber-band between the first click and the cursor. The tools
  panel gains a Dimension button.
- **Selection.** Dimensions join the slice-5 hit-test (a click within tolerance
  of the dimension line selects it) and the marquee (both endpoints inside);
  priority resolves an opening, then a wall, then a dimension, then a room under
  the cursor. A selected dimension highlights.
- **Inspector.** When a single dimension is selected, an inline inspector shows
  its read-only formatted length and a Remove control dispatching
  `removeDimension` (mirroring the slice-7 opening inspector's Remove); dimension
  editing beyond removal is deferred.

## 8. Schema migration

Dimensions are plain model data and persist in `project.json`, so the round-trip
must preserve them. An additive schema bump from version 3 to version 4, with an
`addFloorDimensions` migration, backfills `dimensions: []` on every floor.
`CURRENT_SCHEMA_VERSION` becomes 4, and the migration joins `SCHEMA_MIGRATIONS`
after the slice-7 `addFloorOpenings` step (the chain is v1 to v2 to v3 to v4).

## 9. Testing strategy

Red-green-blue per behavior with the role-separated subagents:

- **Pure core, unit-tested:** `insetPolygon` (a rectangle inset to a smaller
  rectangle; a non-convex L; the winding normalization; the over-inset
  best-effort case); thickness-aware `deriveRooms` (a single rectangular room's
  clear area equals `(w - t)(h - t)`, and the custom-polygon path is unchanged);
  the `Dimension` factory and defaults; each command's apply and
  framework-captured inverse; `dimensionLength` and `dimensionGeometry`; the
  scene projections (`graph.dimensions`, `RoomSceneNode.clearPolygon`); the v3 to
  v4 migration round-trip.
- **Editor logic, unit-tested:** the dimension draw routine against the recording
  `PlanDrawingContext` fake; the two-click `advanceDimensionTool` and
  `dimensionPreview`; the dimension hit-test and marquee containment; the
  dimension inspector (its own React Testing Library test).
- **Glue, coverage-excluded, e2e-validated:** the dimension tool wiring, the
  inspector placement, and the plan-view composition. The wall-drawing end-to-end
  spec stays green.

## 10. Open questions and follow-ups

- **Offset editing.** A dimension's `offset` is fixed at 0 this slice; the
  interaction to set or drag it (a perpendicular-drag gizmo) is the main deferred
  follow-up and is the one place the model is shaped ahead of the UI.
- **Wall-anchored dimensions.** Storing entity references instead of fixed points
  so a dimension tracks wall edits is the larger follow-on the fixed-point model
  is forward-compatible with (a dimension endpoint becomes a resolved anchor).
- **Thickness-aware fill.** Painting the room fill inside `clearPolygon` rather
  than the centerline polygon is a one-line renderer change deferred to overlay
  polish, now that `clearPolygon` is derived.
- **Clear-area robustness.** General polygon offset for holes and self-touching
  rooms follows when the room topology supports them (slice 1 best-effort).

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 3.1
  (the per-floor entity tree, extended here with `dimensions[]`), section 3.2
  (rooms derived from wall topology; the clear-area inset), section 6.2 (the
  Canvas plan renderer including dimensions and labels), section 512 (the deferred
  dimension gizmos), and the section 10 Phase 1 deliverable "Live + persisted
  dimensions" and slice 1's deferral of thickness-aware area. This document
  records the slice's interpretation and the now/deferred boundary.
- ADR-0005 (framework-captured inverse), ADR-0018 (scene-graph derivation),
  ADR-0021 (the Canvas seam), ADR-0026 (room derivation by face enumeration, which
  the clear-area inset extends), ADR-0027 (the units module for the dimension
  text), ADR-0029 (the schema-migration framework), ADR-0032 (the hit-test the
  dimensions join), ADR-0037 (the additive-per-floor-entity command pattern the
  dimension commands follow).
