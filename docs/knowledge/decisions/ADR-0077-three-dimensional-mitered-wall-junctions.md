---
slug: decisions/ADR-0077-three-dimensional-mitered-wall-junctions
title: 'ADR-0077: Mitered junctions for two-way wall corners'
type: decision
tags: [architecture, three-dimensional, geometry, walls, junctions, miter, preview]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0034-future-direction-extensibility-seams,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-mitered-wall-junctions.md,
    docs/plans/2026-06-14-three-dimensional-mitered-wall-junctions.md,
    core/geometry/segment.ts,
    core/topology/wall-footprint.ts,
    engine/scene/wall-builder.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0077: Mitered junctions for two-way wall corners

## Status

Accepted. A polish item on the three-dimensional preview, issue #121 from the
product owner's backlog. It is the mitered-junction follow-on that
[[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]] named and
deferred, and it reuses the wall graph and the material seam that ADR set up.

## Context

ADR-0061 shipped the first wall shell as a box per wall, with walls that share a
junction left to overlap into a solid mass. That is correct along a wall but wrong
at a corner: two walls meeting at an angle each end square at the shared vertex, so
they overlap on the inner side of the corner and leave a triangular notch of
missing material on the outer side. The owner reported the notch as issue #121.

ADR-0061 set the path explicitly: the mitered junction builder is an additive
follow-on that reads the wall graph the shell already threads, resolves each
junction from its incident edges, and plugs in behind the same builder seam without
touching a consumer. The foundation (section 9) left the exact miter rule open for
the slice that hits it, calling out the awkward cases (three or more incident
walls, mixed thicknesses). This record settles the rule for the two-way corner and
records what stays deferred.

The decisions are: which junctions to miter, how the miter is computed, where the
computation lives, and how the mitered wall is meshed.

## Decision

### Miter the two-way corner; defer the busier junctions

A junction is classified by the number of wall-graph edges incident to its vertex.
A vertex with exactly two incident edges is a corner where two walls meet, and that
is the case this slice miters. A vertex with one incident edge is a free wall end
and keeps a square cap. A vertex with three or more incident edges (a T-junction, a
crossing, a busier meeting) keeps square overlapping ends and is deferred; it still
reads as solid, as the boxes do today.

This is the line ADR-0061 drew. The two-way corner is the common case and its miter
is well defined. The multi-way miter is the genuinely involved case the foundation
flagged, and front-loading it for the rarer junctions would buy little over the
solid overlap those junctions already render. Because `buildWallGraph` splits a
wall that another tees into, a T-junction surfaces as three incident edges and
falls into the deferred case with no special handling, and a straight wall split at
an interior point surfaces as two collinear edges whose miter is degenerate and
falls back to a square end, which is the right result because there is no corner to
cut.

### The miter is the intersection of the two walls' own offset face lines

A wall's long faces are its centerline offset to each side by half its thickness.
At a corner the miter point on a given side is where the two walls' face lines on
that side cross. Each wall's face line is offset by its own half thickness, so the
joint is correct for walls of different thickness with no special case: a thick
wall meeting a thin one joins along each wall's actual face. Walls that are parallel
or collinear have no crossing, and that end falls back to a square cap.

A corner sharper than a miter limit makes the miter point shoot far out along a
spike. The slice applies a miter limit and falls back to a square cap when the miter
would run past a small multiple of the wall's half thickness. The fallback reads as
a small notch only at very acute corners, which are rare; a bevel that would close
them cleanly is deferred. A miter limit with a square fallback is the smallest rule
that keeps the common corners clean and the spikes out.

### The footprint is computed in core, the prism is built in engine

The miter is pure plan geometry over the wall graph, so it lives in `core`, where
the layer rule keeps Three.js out and the geometry is tested in Node without a
graphics processor. A pure pass over a floor's wall graph produces, for each edge,
the wall's plan-space footprint: the four ground-plane corners, two per end, each
end either a square cap or a miter. The pass returns one footprint per edge in the
graph's edge order. A small pure `lineIntersection(pointA, dirA, pointB, dirB)` in
the segment helpers supplies the infinite-line crossing the miter needs, since the
existing `segmentIntersection` clamps to the segments.

The wall builder in `engine` extrudes a footprint into a prism in place of a box.
The prism keeps the box's faces and roles exactly: two long faces (the `+normal`
side is `interiorFace` and paint side `left`, the `-normal` side is `exteriorFace`
and paint side `right`), two end caps (`exteriorFace`, no paint reference, square or
along the miter line), and a `top` and `base`. It reuses the section-and-material-
group machinery the opening path already uses, and it carries the wall's entity id
as the box did. A free-standing or straight-run wall has both ends square and
extrudes to the same shape it draws today, so the prism subsumes the box and only
two-way corners change.

### Walls that host an opening keep their square ends this slice

A wall that hosts a door or window builds through the separate profile path that
cuts the opening void out of the elevation. That path keeps its square ends here.
The corner stays solid because the plain neighbor miters against the opening wall's
offset face lines, reading the opening wall's thickness and direction from the
graph like any neighbor, so the neighbor fills the corner out to the opening wall's
outer face and the opening wall's square end overlaps under it. Mitering the opening
profile's ends would slant the rectangular elevation outline it triangulates, which
is a larger change than this slice's corners need, so it is deferred.

## Consequences

- Two-way corners draw as one clean solid: no outer notch and no double layer of
  material on the inner side, with the joint correct for mixed thicknesses.
- The miter is a pure core pass over the wall graph, gated by Node geometry tests;
  the engine reads a footprint and extrudes a prism that keeps the box's roles,
  paint references, and entity id, so paint, selection, lighting, and the openings
  are untouched.
- The wall prism subsumes the box (a square-ended footprint is the box), so the
  existing free-standing and straight-run shell is unchanged and only corners move.
- Multi-way junctions, mitered opening walls, and a bevel for very acute corners
  stay deferred and are recorded follow-ons rather than rediscovered later.
- No model, file-format, scene-graph-data, or two-dimensional-plan change: the
  slice is build-time geometry only.

## Alternatives considered

- **Miter every junction now, including T-junctions and crossings.** Rejected for
  this slice: the multi-way miter is the involved case the foundation flagged, and
  the busier junctions already read as solid through the overlap, so the two-way
  corner is where the visible win is. Multi-way is an additive follow-on behind the
  same footprint pass.
- **Fill each corner with a separate wedge solid instead of mitering the walls.**
  Rejected: it leaves the walls' square faces overlapping inside the joint, so it
  does not clean up the double material on the inner side and it z-fights the
  painted faces; it does not give the clean corner the paint and culling want.
- **Bevel sharp corners rather than fall back to a square cap.** Deferred, not
  rejected: a bevel closes very acute corners cleanly, but those corners are rare
  and the square fallback is the smaller rule; the bevel is a recorded follow-on.
- **Miter the opening profile's ends in the same slice.** Deferred: it would turn
  the opening path's rectangular elevation outline into a slanted-edge outline, a
  larger change than the corners need, while the plain neighbor's miter already
  keeps those corners solid.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-mitered-wall-junctions.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-mitered-wall-junctions.md`.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall
  shell, the box-per-wall junctions this slice refines, the material seam and
  surface roles it preserves, and the deferral this slice takes up.
- [[ADR-0063-three-dimensional-opening-voids]]: the opening profile path whose
  square ends this slice leaves in place.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the coordinate,
  datum, and winding conventions, and the pixel-approximate visual tier.
- [[ADR-0034-future-direction-extensibility-seams]]: the additive-seam stance this
  slice follows by reading the graph behind the existing builder.
