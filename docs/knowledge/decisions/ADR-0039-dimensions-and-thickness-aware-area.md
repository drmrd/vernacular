---
slug: decisions/ADR-0039-dimensions-and-thickness-aware-area
title: 'ADR-0039: Thickness-aware clear-area inset and dimensions as a per-floor annotation entity'
type: decision
tags:
  [
    architecture,
    core,
    editor,
    plan,
    rooms,
    area,
    geometry,
    dimensions,
    annotations,
    commands,
    undo-redo,
    scene-graph,
    rendering,
    canvas,
    selection,
    migration,
    units,
  ]
related:
  [
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0038-openings-doors-and-windows,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-08-dimensions-and-thickness-aware-area.md,
    core/geometry/polygon.ts,
    core/topology/rooms.ts,
    core/model/types.ts,
  ]
status: current
updated: 2026-06-08
---

# ADR-0039: Thickness-aware clear-area inset and dimensions as a per-floor annotation entity

## Status

Accepted; implemented (slice 9 of the Phase 1 two-dimensional plan editor) on
branch `feat/dimensions-and-thickness-aware-area`, stacked on slice 7. The slice
design is `docs/specs/2026-06-08-dimensions-and-thickness-aware-area.md`; the
parent design specification remains authoritative. This ADR records two
decisions: how thickness-aware room area is derived, and how persisted dimensions
are modeled.

## Context

Two Phase-1 measurement gaps remained after slice 8. Room area used wall
centerlines (slice 1 deferred the thickness-aware inset to this slice), so a room
read larger than its real clear floor; and there was no way to annotate a
measured distance, although the Phase-1 deliverable list names "live + persisted
dimensions". The room derivation enumerates the bounded faces of the wall graph
(ADR-0026), and every face half-edge already carries its source `wallId`, so the
per-edge wall thickness needed for an inset is available without new topology.
The design specification's per-floor entity tree (section 3.1) lists walls,
openings, rooms, trim, features, furniture, and underlays, but no dimensions
array, even though the deliverable calls for persisted dimensions.

## Decision

### Thickness-aware area by per-edge polygon inset

`core/geometry/polygon.ts` adds a pure `insetPolygon(polygon, edgeOffsets)`:
after normalizing the winding (shoelace sign), each directed edge is shifted
inward along its interior-side unit normal by its offset, and each inset corner
is the intersection of the two adjacent shifted edge lines (parallel edges keep
the corner on the common line). `core/topology/rooms.ts` threads each face edge's
host-wall half-thickness (mapping the half-edge `wallId` to the wall `thickness`)
into `insetPolygon` to build `Room.clearPolygon`, and sets `Room.area` to the
clear-area shoelace area. The centerline `polygon` is retained unchanged (the
fill and hit-test still use it); only the reported `area` becomes thickness-aware
and the new `clearPolygon` is added. The `RoomSceneNode` carries `clearPolygon`,
and because the slice-8 label reads `RoomSceneNode.area` (ADR-0036), the label
shows the clear figure with no labeling change. A `customPolygon` override has no
bounding walls, so its `clearPolygon` equals the custom polygon and its area is
the plain shoelace area, preserving slice-8 behavior. `insetPolygon` is correct
for simple convex and mildly non-convex rooms; over-inset self-intersection,
holes, and very acute corners are best-effort, mirroring slice 1.

### Dimensions as an additive per-floor annotation entity

A `Dimension` (`id`, `start`, `end` in world millimeters, and a perpendicular
`offset`) is added to `core/model/types.ts`, and `Floor` gains
`dimensions: Dimension[]` sibling to `walls`, `openings`, and `underlays`. This
extends the parent spec's per-floor entity tree with a `dimensions[]` array the
tree did not list, because the Phase-1 deliverable requires persisted dimensions
and the entity tree is the natural home (a dimension is a per-floor annotation,
like an underlay). The model stores two fixed world points, not entity
references: a dimension does not track wall edits this slice (wall-anchored
dimensions are a documented follow-up the fixed-point model is forward-compatible
with). Two undoable commands (`addDimension`, `removeDimension`) follow the
additive-per-floor-entity pattern (ADR-0037), reassigning `state.floors`
immutably so the dispatcher captures the inverse (ADR-0005). Pure
`dimensionLength` and `dimensionGeometry` derive the measured length and the
offset dimension-line and extension-line endpoints; a `DimensionSceneNode`
projects into `graph.dimensions` (ADR-0018), paints through the narrow Canvas
seam (ADR-0021), and joins the hit-test and marquee (ADR-0032, resolving opening,
then wall, then dimension, then room). A two-click `dimension` tool mirrors the
slice-12 calibration tool, and an inline inspector offers removal. An additive
v3-to-v4 migration backfills `dimensions: []` (ADR-0029); `CURRENT_SCHEMA_VERSION`
becomes 4.

## Consequences

- Room area is now the real clear floor area; the label, scene node, and any
  future area consumer read the thickness-aware figure for free.
- `insetPolygon` is a reusable geometry primitive the thickness-aware fill and
  later offset work can build on.
- The plan gains persisted linear dimensions; the entity tree now carries a
  `dimensions[]` array (a deliberate, documented extension of the parent spec's
  section 3.1 tree, not a contradiction of it).
- A new schema version (4) enters the migration chain; the additive migration
  keeps slice-7-and-earlier projects loading.

## Alternatives considered

- **Approximating the clear area by a perimeter-times-half-thickness formula.**
  Rejected: it is fragile for varying per-edge thickness and non-right corners.
  The actual edge-offset inset is general and directly testable.
- **Changing the centerline `polygon` to the inset polygon.** Rejected for this
  slice: the fill and hit-test rely on the centerline polygon, and shrinking it
  would leave the area under the walls unselectable. Only `area` changes;
  `clearPolygon` is additive.
- **Storing dimensions top-level rather than per-floor.** Rejected: a dimension
  annotates a floor's plan, so the per-floor array matches underlays and the
  entity tree's grain; the commands and node carry a `floorId`.
- **Anchoring dimensions to walls now.** Deferred: fixed points ship the
  deliverable simply; the model is shaped so an endpoint can become a resolved
  anchor later without a command reshape.

## References

- Slice design: `docs/specs/2026-06-08-dimensions-and-thickness-aware-area.md`.
- Design specification sections 3.1, 3.2, 6.2, 512, and the section 10 Phase 1
  "Live + persisted dimensions" deliverable and slice 1's thickness-aware-area
  deferral.
- ADR-0026 (face-enumeration room derivation the inset extends), ADR-0005,
  ADR-0018, ADR-0021, ADR-0029, ADR-0032, ADR-0036, ADR-0037.
