---
slug: decisions/ADR-0026-room-derivation-planar-face-enumeration
title: 'ADR-0026: Room derivation via planar-face enumeration over wall topology'
type: decision
tags: [architecture, core, geometry, topology, rooms, derivation, scene-graph, plan]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/geometry/point.ts,
    core/geometry/polygon.ts,
    core/geometry/segment.ts,
    core/topology/wall-graph.ts,
    core/topology/rooms.ts,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    editor/plan/draw-plan.ts,
  ]
status: current
updated: 2026-06-04
---

# ADR-0026: Room derivation via planar-face enumeration over wall topology

## Status

Accepted. Implemented and unit-tested in `core/geometry/`, `core/topology/`, and
`core/scene/`, and rendered in `editor/plan/`. The design specification (section
3.2, "Rooms are derived, not authored") remains authoritative; this ADR records
the implementation interpretation. No `docs/specs/` change accompanies this work:
it implements behavior the spec already mandates.

## Context

The project model stores walls but never stores rooms. The design specification
(section 3.2) is explicit: a room's polygon is computed from wall topology; users
name and tag rooms, but geometry comes from walls. A `customPolygon` override is
reserved for cases wall topology cannot infer (porch, L-shaped sub-zone), and is
out of scope here. The Phase 1 deliverable "wall topology (junction detection,
connection, room polygon derivation)" needs an algorithm that takes a set of wall
centerlines and yields the bounded regions they enclose.

The hard constraint is that this is pure-domain work. It lives in `core/`, so it
imports no React, no Three.js, no DOM (ADR-0001), and is unit-tested in plain
Node. That rules out leaning on any rendering-layer geometry and forces the
arrangement, the face enumeration, and the supporting 2D primitives to be
self-contained `core/` modules.

Raw walls are not a clean planar graph. Two walls can meet at a shared corner
expressed as two near-but-not-equal endpoints; one wall can end partway along
another (a T-junction); two walls can cross in their interiors (an X-crossing).
Enumerating faces over the raw edges would miss or mis-trace rooms at every one of
those configurations, so the arrangement must first be noded into a proper planar
graph before any face walk.

## Decision

Rooms are a pure derived projection of wall topology, computed on demand and never
stored. The pipeline is three layers, all in `core/`.

### 1. Pure 2D geometry primitives (`core/geometry/`)

The smallest reusable building blocks, each a pure function with no state:

- `distance(a, b)` (`point.ts`): Euclidean distance in millimeters.
- `polygonArea(points)` (`polygon.ts`): signed area by the shoelace formula,
  positive for counter-clockwise winding and negative for clockwise. The sign is
  load-bearing: it is how the face walk distinguishes interior rooms from the
  unbounded outer face.
- `segmentIntersection(a1, a2, b1, b2)` (`segment.ts`): the parametric
  segment-segment intersection point, or `null` when the segments are parallel,
  collinear, or disjoint. Collinear overlap deliberately returns `null` (it is out
  of scope, see below).
- `pointOnSegment(p, a, b, tolerance)` (`segment.ts`): whether a point lies on a
  closed segment within tolerance, including the interior, used for T-junction
  detection.

### 2. Arrangement noding into a planar graph (`core/topology/wall-graph.ts`)

`buildWallGraph(walls)` turns the raw walls into a `PlanarGraph` of merged
vertices and edges, noding the arrangement in three passes:

- **Endpoint merge (junction detection).** Each wall endpoint is matched against
  already-seen vertices within `DEFAULT_JUNCTION_TOLERANCE_MM` (1 mm) and merged
  into a shared vertex if close enough, otherwise added. Coincident corners become
  one junction. Zero-length walls (both endpoints within tolerance) are skipped.
- **X-crossing registration.** Every interior intersection between a pair of edges
  is registered as a graph vertex through the same merge helper, so two walls that
  cross in their interiors gain a shared vertex at the crossing.
- **T-junction splitting.** Where any existing vertex lies on an edge's interior,
  the edge is replaced by a chain of sub-edges between the ordered split points
  (ordered by projection parameter along the edge). Each sub-edge carries the
  original wall's id, so wall provenance survives splitting.

The endpoint scan is O(n^2) over wall count, acceptable for expected counts; a
spatial index is the deferred optimization behind the same signature.

### 3. Half-edge face enumeration (`core/topology/rooms.ts`)

`deriveRooms(walls)` builds the planar graph, then enumerates its bounded faces:

- Build two directed half-edges per undirected edge, one in each direction.
- Group outgoing half-edges by tail vertex and sort each group by direction angle
  (`atan2`).
- Define each half-edge's `next` as the clockwise-previous of its twin in the
  angle-sorted outgoing list at the head vertex. Following `next` from any
  unvisited half-edge traces one closed face; marking visited half-edges enumerates
  every face exactly once.
- Compute each face's polygon from the tail vertices, then `polygonArea`. Keep only
  faces whose signed area exceeds `MIN_ROOM_AREA`. This single positive-area filter
  is what excludes the unbounded outer face (which traces with negative area) with
  no special-casing.
- Remove dangling-stub spikes: a `v -> s -> v` back-and-forth excursion (a wall stub
  the walk enters and immediately exits) is collapsed so stub endpoints never appear
  as room corners.
- The room id is `room:` followed by the sorted, unique bounding wall ids joined by
  `-`, so the id is stable across re-derivations and independent of traversal order.
  Downstream selection (a later slice) can rely on that stability.

The twin lookup matches on `wallId` as well as endpoint reversal, so parallel edges
(two distinct walls between the same vertex pair) still resolve to the correct twin.

### Scene-graph projection (`core/scene/`)

`SceneGraph` gains a required `rooms: RoomSceneNode[]` sibling array alongside
`nodes` (floors) and `walls`, mirroring the two-array shape ADR-0018 and ADR-0021
established for walls. A `RoomSceneNode` carries the room id, its owning floor id,
the polygon, and the numeric area. `deriveRoomNodesForFloor(floor)` calls
`deriveRooms(floor.walls)` and maps the result; the room id already carries its
`room:` namespace from the topology layer, so it is used directly rather than
re-prefixed (unlike the locally namespaced floor and wall node ids). Both the pure
`deriveSceneGraph` and the memoized `createSceneGraphDeriver` project rooms, and the
deriver memoizes room nodes in a third `WeakMap` keyed by the source `Floor`
reference, the same entity-keyed dirty tracking ADR-0018 describes for floors and
walls.

### Plan rendering (`editor/plan/draw-plan.ts`)

`drawPlan` fills room polygons beneath the wall strokes: rooms render first as a
subtle floor tint, then wall strokes paint on top. `rooms` is an optional
`DrawPlanOptions` overlay, and the `PlanDrawingContext` structural seam grew a
`closePath` member to close each filled polygon, the next worked example of the
"extend the narrow interface rather than reach for the full DOM type" guidance from
ADR-0021.

## Why this approach

- **Noding before enumeration is mandatory, not optional.** Faces traced over the
  raw walls would be wrong wherever walls share a near-coincident corner, end on
  another wall's interior, or cross. Merging, splitting, and crossing-registration
  produce the proper planar arrangement the half-edge walk assumes.
- **The half-edge "previous-of-twin" rule is the standard planar-subdivision face
  traversal.** It enumerates every face exactly once and needs only angle sorting
  per vertex, no winding heuristics or point-in-polygon tests.
- **Signed area is a single, robust discriminator.** One positive-area filter both
  rejects the outer face and drops degenerate near-zero faces, so there is no
  separate "which face is the outside" bookkeeping.
- **Reference memoization composes with the existing scene-graph seam.** Adding
  rooms required no new dirty-tracking mechanism: the third `WeakMap` keyed by
  `Floor` reuses the immutable-update discipline already in force (ADR-0018).

## Centerline polygons and the deferred inset

Room polygons and areas are computed from wall **centerlines**, not from the
interior faces of thick walls. A thickness-aware interior inset (clear-area
polygons that account for wall thickness) is a deliberate deferral to a later
dimensions-and-area slice. Centerlines are sufficient for the derived-room proof
and for the floor-fill rendering, and they keep this slice's geometry to the
primitives above. The `thickness` is already carried on wall scene nodes, so the
inset is an additive refinement behind the same `deriveRooms` signature.

## Deferred refinements and explicit non-goals

- **No model or schema change.** Rooms stay derived and unstored. The
  `customPolygon` override, room naming, and room tagging are a later
  room-labeling slice.
- **No formatted area label.** The numeric `area` (squared millimeters) is carried
  for later consumers; human-readable formatting (for example a metric area string)
  needs the unit formatters from a later units-and-measurement slice. This slice
  renders the fill only.
- **No room selection or hit-testing.** Selecting a room and any room spatial index
  belong with a later selection-and-hit-index slice.
- **Best-effort only, documented as out of scope:** collinear overlapping walls
  (segment intersection returns `null` for collinear pairs, so an overlap is not
  noded), polygons with holes (courtyard or island topologies), and
  self-touching/figure-eight arrangements. Zero-length walls are ignored.

## Alternatives considered

- **Store rooms in the model and let users author polygons.** Rejected: it
  contradicts section 3.2 and would let stored geometry drift out of sync with the
  walls. Derivation keeps rooms a pure function of the walls that define them.
- **Enumerate faces over the raw walls without noding.** Simplest to wire, but it
  mis-traces or misses rooms at every shared corner, T-junction, and crossing.
  Noding the arrangement first is what makes the face walk correct.
- **Point-in-polygon / ray-casting room detection instead of a half-edge walk.**
  Would require candidate region seeding and repeated containment tests, is harder
  to make exact, and does not naturally yield the bounding wall set the room id is
  built from. The half-edge traversal gives the ordered boundary and its wall ids
  directly.
- **A separate winding-number pass to find the outer face.** Unnecessary: the
  signed-area sign already identifies and excludes the unbounded face, so no extra
  pass is needed.
- **Fold rooms into the existing `nodes` array.** Would force the engine's
  `buildScene` and the floor-node consumers to discriminate node kinds for no
  current benefit. A separate `rooms` array kept the engine path untouched, the
  same reasoning ADR-0021 applied to `walls`.

## References

- Design specification, section 3.2 ("Rooms are derived, not authored") and the
  Phase 1 deliverable "wall topology (junction detection, connection, room polygon
  derivation)".
- ADR-0001 (six-layer architecture; this is pure `core/` work with no React, Three.js,
  or DOM).
- ADR-0018 (scene-graph derivation; the `rooms` array and its per-floor room-node
  memoization extend the same memoized-projection seam).
- ADR-0021 (2D plan rendering; `drawPlan` fills room polygons and the
  `PlanDrawingContext` seam gained `closePath`).
