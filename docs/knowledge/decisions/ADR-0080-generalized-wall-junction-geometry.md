---
slug: decisions/ADR-0080-generalized-wall-junction-geometry
title: 'ADR-0080: Generalized wall-junction geometry'
type: decision
tags: [architecture, three-dimensional, geometry, walls, junctions, miter, preview]
related:
  [
    decisions/ADR-0077-three-dimensional-mitered-wall-junctions,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-wall-junction-geometry.md,
    docs/plans/2026-06-14-three-dimensional-wall-junction-geometry.md,
    core/topology/wall-footprint.ts,
    core/geometry/segment.ts,
    engine/scene/wall-prism.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0080: Generalized wall-junction geometry

## Status

Accepted. The wall-junction geometry slice, issue #167 from the product owner's
backlog and the leading three-dimensional slice after the delivery-tracking
migration. It is the successor to
[[ADR-0077-three-dimensional-mitered-wall-junctions]], which mitered the two-way
corner and deferred every busier junction.

## Context

ADR-0077 resolves each wall end on its own and miters only where exactly two walls
share a vertex. A free end stays square, a vertex with three or more incident edges
keeps square overlapping ends, and a corner sharper than the miter limit falls back
to a square cap. A top-down view of a real plan shows those deferred cases are the
common ones, and four failure modes stand out:

1. Miter overshoot spikes, where the offset-face intersection runs away as a corner
   sharpens and throws a long thin triangle past the wall.
2. T-junctions, where a partition tees into a through-wall, left square and so
   leaving a gap, an overlap, or a sliver.
3. Multi-way and acute junctions, three or more walls meeting at a point such as a
   bay, badly broken with radiating spikes and disconnected geometry.
4. Wall tops that read see-through at problem corners, from a winding or normal issue
   or a degenerate self-intersecting footprint in the top cap.

The decisions are: how a junction of any size resolves, how the spikes are kept out,
how the caps are wound, and what stays deferred.

## Decision

### Resolve every junction as a fan of its incident edges

A junction is read as the fan of edges incident to its vertex, sorted by the
direction each edge leaves the vertex along. Between each neighbor pair in the fan
there is a wedge the two walls share. This one structure covers every case: a free
end is a vertex with one incident edge, a two-way corner has two, a T-junction has
three (the through-wall split in two by `buildWallGraph`, plus the partition), and a
multi-way junction has more.

This replaces ADR-0077's classification of each end as free, two-way, or deferred.
The two-way corner is the special case where each edge's two fan neighbors are the
same other edge, so the fan reduces to ADR-0077's miter and the existing two-way
joints do not move.

### One miter point per wedge, shared by the two walls

For each wedge, compute one miter point: the crossing of the two bordering walls'
offset face lines, each offset by its own half thickness, the same crossing ADR-0077
computes for a two-way corner (and the same `lineIntersection` helper). That point is
the corner of both walls that border the wedge, so the two walls read the same point
and meet along it with no gap and no overlap. Each wall takes the two wedge points to
its sides as its two corners at the vertex, so the walls tile the junction: a
T-junction's three ends meet along the through-wall's face, and a multi-way junction's
walls close around the point.

The corner-to-side mapping follows the fan's counter-clockwise order: the wedge to an
edge's counter-clockwise neighbor lies on its `+normal` side, the wedge to its
clockwise neighbor on its `-normal` side, and each wedge's point is the crossing of
the counter-clockwise edge's `+normal` face line with the clockwise edge's `-normal`
face line.

### Keep the spikes out by clamping per side, not beveling

Three degenerate cases fall out of the same computation. Parallel bordering faces
(collinear walls: a T-junction's straight through-run, a wall split mid-run) never
cross, so the corner falls back to the wall's own face-offset point, which collinear
neighbors share, so the face runs straight. A side with no neighbor (a free end, the
open side of the fan) is a square cap. A miter point past the miter limit (a corner
too acute) clamps each wall to its own face-offset point on that side, so the spike is
gone; a small notch can remain across the very-acute wedge.

The clamp is per side, so only the acute side of a corner squares off while the other
side keeps its miter. This refines ADR-0077, which squared both ends of a corner
together when either side ran past the limit. A true bevel that would close the notch
is deferred (see below), so the smallest rule that removes the spikes is the square
clamp.

### Wind the wall caps from the footprint

ADR-0077 winds the top and base caps from a fixed corner order that faces the right
way only for a rectangle; a mitered or clamped footprint can reorder its corners or
fold into a self-intersecting shape, and then the fixed order winds the cap backward
or into a degenerate triangle, which is the see-through top. This slice winds each cap
from the footprint itself: it reads the footprint's signed area (the shoelace helper
already in core) to know the corners' turn direction, winds the top cap so its normal
faces `+Y` and the base so it faces `-Y` whatever the order, and contributes no cap
for a footprint whose area is within an epsilon of zero. The spike clamp keeps
footprints simple, and winding from the area makes the top opaque regardless.

### The footprint shape and the layer split are unchanged

The footprint stays four plan-space corners, two per end, and the pure pass over the
wall graph still returns one footprint per edge in the graph's edge order; only the
corner search changes. The pass stays in `core` as pure plan geometry over the graph,
gated by Node tests without a graphics processor. The wall builder in `engine`
extrudes the footprint into the same prism with the same faces, roles, paint
references, and entity id. A free-standing or straight-run wall extrudes to the shape
it draws today.

### Walls that host an opening keep their square ends

A wall that hosts a door or window builds through the separate profile path with
square ends, as ADR-0077 left it. The corner stays solid because the opening wall is
just another edge in the fan: its plain neighbors miter against its offset face lines,
reading its thickness and direction from the graph, and overlap its square end.
Mitering the opening profile's rectangular elevation outline is a larger change than
these junctions need and stays deferred.

## Consequences

- T-junctions, multi-way junctions, and acute corners draw as one clean solid: the
  walls share each wedge's miter point and tile the joint, so the gaps, slivers, and
  radiating spikes of the square-ended joints are gone.
- The two-way corner is unchanged: the fan reduces to ADR-0077's miter, so the
  existing joints and their baselines hold and only the busier junctions move.
- Wall tops are opaque at every corner because the caps are wound from the
  footprint's signed area rather than a fixed corner order.
- Acute corners past the miter limit leave a small notch instead of a spike; the true
  bevel that closes the notch is tracked as issue #180 rather than rediscovered later.
- No model, file-format, scene-graph-data, or two-dimensional-plan change: the slice
  is build-time geometry only, behind the same footprint pass and builder seam.

## Alternatives considered

- **Keep ADR-0077's per-end classification and add a separate T-junction case.**
  Rejected: each new junction kind would be its own rule, and a crossing or a bay
  would still fall through. The fan resolves every incidence with one rule and
  subsumes the two-way case.
- **Bevel acute and multi-way corners now with a junction-fill solid.** Deferred, not
  rejected: a junction-fill solid that chamfers the over-limit wedges and fills the
  central polygon closes the notch the clamp leaves, but it adds a junction builder,
  fill-face winding and paint, and a corner-post height rule where walls differ, for a
  gain only at the sharpest corners. The square clamp removes the spikes with a far
  smaller change; the bevel is tracked as issue #180.
- **Let multi-way walls overlap to their neighbors' miters without sharing a point.**
  Rejected: independent corners disagree on where the joint sits and reintroduce the
  gaps and slivers. Sharing one point per wedge is what makes the walls tile.
- **Triangulate each cap with a general polygon triangulator.** Rejected as
  unnecessary: the footprint is a quad and the spike clamp keeps it simple, so reading
  the signed area to orient the quad is enough and avoids a triangulation dependency on
  the cap path.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-wall-junction-geometry.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-wall-junction-geometry.md`.
- [[ADR-0077-three-dimensional-mitered-wall-junctions]]: the two-way miter this slice
  generalizes, the footprint and `lineIntersection` it reuses, and the deferrals it
  takes up.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall shell,
  the material seam and surface roles, and the pixel-approximate visual tier.
- [[ADR-0063-three-dimensional-opening-voids]]: the opening profile path whose square
  ends this slice leaves in place.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the coordinate,
  datum, and winding conventions, and the pixel-approximate visual tier.
- Issue #180: the true-bevel follow-on this slice defers.
