---
slug: decisions/ADR-0058-donut-and-courtyard-rooms-via-hole-rings
title: 'ADR-0058: Donut and courtyard rooms via hole rings in room derivation'
type: decision
tags: [architecture, core, geometry, topology, rooms, derivation, holes, courtyard, accessibility]
related:
  [
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0043-dom-overlay-and-accessibility,
    decisions/ADR-0049-integration-acceptance-gate,
    decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    core/topology/rooms.ts,
    core/geometry/polygon.ts,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    editor/plan/overlay-label.ts,
    editor/plan/draw-plan.ts,
    e2e/tests/journeys/donut-room.spec.ts,
    e2e/journey-coverage.json,
  ]
status: current
updated: 2026-06-12
---

# ADR-0058: Donut and courtyard rooms via hole rings in room derivation

## Status

Accepted. Implemented in `core/topology/rooms.ts` with the containment pass added
to `deriveRooms`, projected through `core/scene/`, surfaced in the accessible
overlay label, and drawn as a cut-out fill in `editor/plan/draw-plan.ts`. This is
the last gated capability of the editor-experience makeover (slice 10); the
`donut-room` journey flips to required and the integration gate reaches eleven
required capabilities with none pending. The decision extends ADR-0026, which
named polygons with holes as an explicit non-goal, and lifts that one non-goal.

## Context

ADR-0026 derives rooms by enumerating the bounded faces of the wall arrangement.
It listed three out-of-scope shapes, one of which was "polygons with holes
(courtyard or island topologies)." A historic house often has exactly that shape:
a square of rooms wrapped around an open light well, a great hall with a masonry
chimney mass standing free in the middle, a vault or strong room built inside a
larger room. In each case the floor a person can walk on is a ring, and the area
in the middle is not part of that ring.

The half-edge face walk does not produce the ring on its own. When the inner walls
form their own closed loop that touches none of the outer walls, the arrangement
splits into two connected components. The walk traces each component separately:
the outer loop yields its full interior as one face, the inner loop yields its own
small interior as another. Nothing ties the two together, so the outer room comes
out as a solid rectangle whose area wrongly includes the well in the middle, and
the void is invisible to anyone reading the plan, including a screen-reader user.

The constraint from ADR-0026 still holds: this is pure-domain work. It lives in
`core/`, imports no React, no Three.js, and no DOM, and is unit-tested in plain
Node. The fix has to read the faces the existing walk already produces and decide,
from geometry alone, which face sits inside which.

## Decision

A room may carry interior void rings. `Room` and `RoomSceneNode` gain an optional
`holes?: Point[][]`, each entry a closed ring of corner points in floor-plan space,
in the same coordinate frame as `polygon`. A plain room omits the field, so every
existing room shape and every fixture that builds a room without holes stays valid
under `exactOptionalPropertyTypes`. The change is additive.

### Containment pass after face enumeration

`deriveRooms` keeps the half-edge walk untouched and adds one pass after the faces
become candidate rooms. The walk first builds every candidate (polygon, clear
polygon, raw area, bounding wall ids) as before. The new pass then decides nesting:

- A candidate `inner` is contained by a candidate `outer` when every vertex of
  `inner.polygon` lies inside `outer.polygon` and the two rooms share no bounding
  walls. The point test reuses the existing `pointInPolygon` from
  `core/geometry/polygon.ts`. The disjoint-wall guard is what separates a true
  free-standing island from a room that is merely subdivided by a shared wall: a
  subdivided neighbor shares a wall and is already handled correctly by the face
  walk, so it must not be mistaken for a hole.
- Nesting can be more than one level deep (a room inside a room inside a room).
  Each contained room becomes a hole only of its immediate container, the smallest
  room that contains it, so a void is punched once at the level it belongs to and
  not again in every ancestor.
- The container's `holes` gains the contained room's `polygon`. The contained room
  still appears as its own derived room. Geometry alone cannot tell an open-air
  courtyard from an enclosed inner room, so derivation reports both the ring and
  the inner region and leaves the open-versus-enclosed call to a later labeling
  pass (see "Deferred refinements").

### Area reflects the void

A donut room's reported `area` is its own clear floor area minus the footprint of
each immediate hole. The subtracted footprint is the hole ring's centerline area,
matching the centerline-first stance ADR-0026 took for room area; a thickness-aware
hole inset is a later refinement behind the same field, exactly as the original
clear-area inset was. Without this subtraction a courtyard house would report the
light well as habitable floor.

### Projection, label, and fill

- `deriveRoomNodesForFloor` copies `holes` onto the `RoomSceneNode` when present and
  omits it otherwise, the same optional-copy shape the node already uses for `name`.
- The accessible overlay label gains a trailing clause when a room has holes:
  `Room, 18 m^2, with an interior void`, pluralized to `with N interior voids`.
  A void changes how a room reads on a plan, so a person navigating by screen reader
  is told it is there rather than left to infer it from an area that looks small.
- `drawRoom` fills the void as a cut-out. It appends each hole as a sub-path wound
  opposite to the outer ring inside the same path and fills once, so the canvas
  nonzero winding rule leaves the well unpainted and the courtyard reads as open
  ground rather than tinted floor.

## Why this approach

- **The face walk stays correct and untouched.** Holes are a containment fact about
  the faces the walk already enumerates, not a change to how faces are traced.
  Adding a pass over the results keeps the planar-subdivision traversal, its angle
  sort, and its signed-area filter exactly as ADR-0026 specified.
- **One geometric predicate decides nesting.** Vertices-inside plus disjoint walls
  is enough to separate an island from a shared-wall subdivision, and it reuses a
  primitive `core/geometry/` already ships. No point-in-polygon seeding, winding
  bookkeeping, or new arrangement data structure is needed.
- **Derivation stays geometric; meaning stays an override.** Reporting both the ring
  and the inner region, and deferring open-versus-enclosed to labeling, keeps this
  consistent with ADR-0026 and ADR-0036: rooms are derived geometry, and names,
  tags, and now the open-courtyard distinction are user-assigned overrides on top.
- **The result is observable end to end.** Threading the void through the node, the
  label, and the fill means the gate journey can assert the void the way a user
  meets it, in the accessible room list, which is the failure mode the makeover gate
  exists to catch (a capability derived but wired nowhere).

## Deferred refinements and explicit non-goals

- **Open courtyard versus enclosed inner room.** Derivation cannot tell an open
  light well from a sealed inner room, so it reports both shapes. A later labeling
  slice can let a user mark a region as open air, which would suppress its floor
  fill and drop it from the room list. This ADR does not add that override.
- **Thickness-aware hole inset.** The hole ring and the subtracted area use the
  contained room's centerline, matching ADR-0026's deferral of the clear-area inset.
  A thickness-aware void boundary is an additive refinement behind the same `holes`
  field.
- **Hole-aware label placement.** The room label still anchors to the outer
  polygon's centroid. For a thin ring that centroid can fall inside the void; nudging
  the label onto solid floor is a small later refinement and is out of scope here.
- **Self-touching and figure-eight arrangements** remain out of scope, as in
  ADR-0026. A hole is detected only for a free-standing inner loop that shares no
  wall with its container.

## Alternatives considered

- **Suppress the inner region and keep only the donut.** Rejected. It would erase a
  genuinely enclosed inner room, and geometry cannot distinguish that from an open
  courtyard. Reporting both shapes loses no information and defers the judgment to
  labeling, where the user has the context.
- **Re-trace the annulus as a single multiply-connected face during the walk.**
  Rejected. It would replace the simple per-component face walk with a connected-
  components and nesting-aware traversal, far more machinery than a post-pass over
  the same faces, for an identical result.
- **Subtract the void from the polygon itself rather than carrying holes.** Rejected.
  Flattening a ring into one self-touching outline loses the clean inner and outer
  boundaries that the fill cut-out and any future hole-aware area or inset need, and
  it would confuse the room's stable id and its corner set.
- **Detect holes at the rendering layer from overlapping room fills.** Rejected. It
  would push a topology fact into `editor/`, violate the pure-core boundary
  (ADR-0001), and leave the area and the accessible label still wrong.

## References

- ADR-0026 (room derivation via planar-face enumeration; this ADR lifts its
  polygons-with-holes non-goal and reuses its face walk unchanged).
- ADR-0018 (scene-graph derivation; `holes` rides the same memoized room-node
  projection).
- ADR-0036 (room metadata overrides; the open-courtyard distinction is a future
  override in that family).
- ADR-0043 (DOM overlay and accessibility; the void clause extends the accessible
  room label).
- ADR-0049 (integration-acceptance gate; the `donut-room` journey is the eleventh
  and final required capability).
- Design specification, section 3.2 ("Rooms are derived, not authored").
  </invoke>
