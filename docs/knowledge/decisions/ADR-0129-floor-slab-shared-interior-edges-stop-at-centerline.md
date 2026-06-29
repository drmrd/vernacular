---
slug: decisions/ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline
title: 'ADR-0129: Floor slab stops shared interior edges at the wall centerline'
type: decision
tags: [architecture, three-dimensional, geometry, floor-slab, rooms, preview, z-fighting]
related:
  [
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
    decisions/ADR-0102-depth-bias-for-coincident-surfaces,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0056-surface-paint-selection-and-treatments,
  ]
sourceFiles:
  [
    docs/knowledge/decisions/ADR-0076-three-dimensional-floor-slab-under-walls.md,
    core/topology/rooms.ts,
    core/geometry/polygon.ts,
    engine/scene/room-builder.ts,
  ]
status: proposed
updated: 2026-06-28
---

# ADR-0129: Floor slab stops shared interior edges at the wall centerline

## Status

Proposed. The design is owner-approved; this record lands with the fix and flips to
accepted then. It amends one rule from
[[ADR-0076-three-dimensional-floor-slab-under-walls]]: how the slab boundary treats a
wall shared between two rooms. The rest of ADR-0076, including the slab reaching the
outer face along the building perimeter, stands unchanged.

## Context

Issues #397 and #391 are the same defect under two numbers. #397 reports that
`deriveRooms` "can emit two overlapping rooms," and #391 is the umbrella report of
coincident-surface z-fighting still left after [[ADR-0102-depth-bias-for-coincident-surfaces]].

The room interiors are not the problem. `deriveRooms` splits crossings and T-junctions
through the wall graph and enumerates the bounded faces, so the clear polygons tile the
plan without overlap. The overlap that reads as "two overlapping rooms" lives in the
slab outer boundary.

ADR-0076 has each room offset its centerline polygon outward by every bounding wall's
half-thickness, with no distinction between a wall on the building perimeter and a wall
shared with the next room (`core/topology/rooms.ts`, where `outerPolygon =
outsetPolygon(polygon, edgeOffsets)`). For a shared interior wall between rooms A and B,
A offsets across that wall toward B by half its thickness and B offsets across the same
wall toward A by half its thickness. Their gross-area boundaries overlap in a strip the
full width of the shared wall. The slab builder draws each room's top cap at the floor
datum (Y = 0), so the two caps are coplanar and overlap exactly over that strip
(`engine/scene/room-builder.ts`). Under the wall the strip is hidden by the wall mass.
At a doorway, the gap exposes it, and the two coincident caps z-fight.

ADR-0102 does not reach this case. Its depth bias resolves the slab top cap against the
wall base cap by biasing the `top` role back so the wall base wins. The #397 pair is two
adjacent rooms' caps, both the `top` role, so both receive the identical bias and the
tie is unbroken; ADR-0102 itself notes that biasing both sides of a coincident pair
cancels out. The bias convention is correct and stays in place. It was scoped to the
wall-base pair and never anticipated two same-role caps overlapping.

This is by-design geometry from ADR-0076, so it is a decision to revisit rather than a
stray bug, which is why it lands as an amendment ADR.

## Decision

The slab outsets only on edges whose wall is on the building perimeter. An edge whose
wall is shared with an adjacent room gets an outward offset of zero, so that edge stays
on the centerline polygon. Perimeter edges still reach the wall outer face exactly as
ADR-0076 specified, so the building footprint is unchanged and issue #124 stays fixed.

Two adjacent rooms then each reach the shared wall's centerline from their own side and
meet edge to edge. Coplanar caps that abut along a shared edge but do not overlap in area
do not z-fight, so the doorway artifact is gone. The union of the two half-slabs still
covers the full wall footprint, so the floor still reads as one continuous base, which is
the intent ADR-0076 set out to serve.

The change is contained to `core/topology`:

- A boundary edge is classified as shared when the wall segment on that edge also bounds
  another room, and as perimeter when its other side is the unbounded exterior. The test
  is per edge, on the half-edge graph: an edge is shared when its twin half-edge belongs
  to a second room face, and perimeter when its twin belongs to the exterior face. This is
  deliberately not a per-`wallId` count. A single wall can run past a partition junction
  and bound two different rooms along its length while still being a perimeter wall on each
  of them, because each of its segments faces the exterior on the far side. Counting how
  many room faces a `wallId` touches would wrongly mark such a wall shared and pull its
  outer edge in to the centerline, so the classification is made per boundary edge from the
  twin, computed in `deriveRooms` after the faces are enumerated.
- `deriveRooms` derives a second per-edge offset array, equal to the existing
  `edgeOffsets` with the shared edges set to zero, and passes that to `outsetPolygon`.
- `insetPolygon` keeps the original `edgeOffsets`. The clear interior still insets by
  half-thickness on every edge, shared or not, because the interior is bounded by each
  wall's inner face regardless of who is on the other side.

`outsetPolygon` already accepts per-edge offsets, so a zero on a shared edge needs no new
geometry primitive. `engine/scene/room-builder.ts` is unchanged: it consumes the
corrected `outerPolygon` as before. `outerPolygon` stays a derived scene-graph value, so
there is no model field, no serialization, and no schema bump.

## Alternatives considered

- **One floor slab per floor.** Build a single slab from the exterior boundary, so no
  per-room overlap can exist. It is the cleanest geometry, but it breaks per-room floor
  paint: today each slab carries its own floor `SurfaceRef` and is painted and picked per
  room ([[ADR-0056-surface-paint-selection-and-treatments]]). A single slab needs
  per-room material regions, which ripples into the paint provider, the 3D pick, and the
  agreement between the 2D and 3D paint targets. Rejected for the size of that ripple
  against a localized geometry fix; revisit only if a floor-level finish feature wants it.
- **Renderer-side per-room tie-break.** Keep the geometry and give each room's slab top a
  per-room depth nudge or render order so one consistently wins the strip, in the spirit
  of ADR-0102. It is the least invasive option, but the winner then shows its floor paint
  across the shared strip at the doorway, so two differently painted floors meet at a
  seam offset from the wall centerline, and the result is fragile across camera moves and
  transparency, a weakness ADR-0102 already calls out for order-based fixes. Acceptable as
  a stopgap, weaker as the durable answer. Rejected.
- **Stop every edge at the centerline.** ADR-0076 considered and rejected this: it leaves
  the outer half of every perimeter wall overhanging empty slab and reopens issue #124.
  This decision is narrower than that rejected alternative. It stops only shared interior
  edges at the centerline and keeps perimeter edges at the outer face.

## Consequences

- The doorway z-fighting between adjacent room floors is gone, because the two caps no
  longer overlap in area. This resolves the horizontal case behind #397.
- Per-room slabs and per-room floor paint are preserved, since each room still owns its
  own slab and its own surface reference.
- The committed `scene-webgl` baseline shifts at shared walls, where the slab boundary
  moves from the wall outer face to the centerline, so the baseline is refreshed on CI
  with this change.
- No model, persistence, or schema change, because the boundary stays derived.
- A room's outer boundary now depends on its neighbors, not just its own walls. Adding or
  removing an adjacent room can flip a wall between shared and perimeter and so reshape the
  surviving room's slab from the centerline out to the wall face, or the reverse. This is
  correct: a wall with no room on the far side really is on the building exterior. The
  practical effect is that an edit near a shared wall can change an adjacent room's slab,
  so the scene reconciler rebuilds that room's node rather than reusing it. Widening a room
  away from the shared wall leaves the neighbor's boundary untouched and still reuses it.
- #391 stays open as the umbrella. After this lands, the walk-mode view is re-checked for
  any remaining coincident pairs on the verticals, for example a slab side face coplanar
  inside a shared wall, which are triaged separately rather than chased speculatively here.

## References

- [[ADR-0076-three-dimensional-floor-slab-under-walls]], the outset rule this amends.
- [[ADR-0102-depth-bias-for-coincident-surfaces]], the depth-bias convention, which
  stays in place.
- Issues #397 and #391 (this defect), and #124 (the original continuous-base request that
  ADR-0076 served and that this preserves).
