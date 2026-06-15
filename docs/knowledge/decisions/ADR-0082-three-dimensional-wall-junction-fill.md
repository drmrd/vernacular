---
slug: decisions/ADR-0082-three-dimensional-wall-junction-fill
title: 'ADR-0082: Three-dimensional wall-junction fill'
type: decision
tags: [architecture, three-dimensional, geometry, walls, junctions, bevel, preview]
related:
  [
    decisions/ADR-0080-generalized-wall-junction-geometry,
    decisions/ADR-0077-three-dimensional-mitered-wall-junctions,
    decisions/ADR-0078-three-dimensional-surface-edge-legibility,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-wall-junction-fill.md,
    docs/plans/2026-06-14-three-dimensional-wall-junction-fill.md,
    core/topology/wall-footprint.ts,
    core/topology/junction-fill.ts,
    engine/scene/junction-fill-builder.ts,
    engine/scene/wall-builder.ts,
    engine/materials/material-provider.ts,
    engine/materials/role-appearance.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0082: Three-dimensional wall-junction fill

## Status

Accepted. The wall-junction fill slice, issue #180 from the product owner's backlog,
the true-bevel follow-on [[ADR-0080-generalized-wall-junction-geometry]] deferred by
owner steer (square clamp first, bevel planned). It is the next slice in the
three-dimensional preview track (ADR-0044).

## Context

ADR-0080 resolves every junction as a fan of incident edges and shares one miter point
per wedge, so two-way corners, T-junctions, and multi-way meetings tile. Two cases it
leaves with a gap, on purpose:

1. An acute corner. A wedge past the miter limit clamps each wall to its own face so
   the offset intersection does not throw a spike, which leaves a small notch across
   the over-limit wedge.
2. A multi-way junction. Three or more walls each end at their miter lines, and the
   strips do not reach the center, so a small polygon at the junction core is uncovered.

ADR-0080 took the square clamp as the smallest change that removes the spikes and filed
the fill that closes the notch and the core as issue #180. This ADR is that fill. The
decisions are: where the fill comes from, when one is emitted, how tall it stands, what
material and identity it carries, and what stays deferred.

## Decision

### The fill is the uncovered core read from the walls' own corners

A fill is the polygon a junction's incident walls leave uncovered: walk the incident
walls around the vertex and their near edges (the line between each wall's two corners
at the vertex) bound a polygon enclosing the vertex. Each wall contributes one edge (its
near edge), and each polygon vertex is where two angularly-adjacent walls' near edges
cross: the shared miter where two walls miter cleanly, and a crossing near the vertex
where two walls overlap across an acute wedge. A pure pass in `core`
(`junctionFills(graph, thicknessByEdge)`) reads the same resolved corners ADR-0080's
footprint pass stops the walls at, and returns that polygon per junction in plan space.
Building the vertices from cap-line crossings, rather than pushing each wall's two
corners directly, is what keeps the polygon simple: at an acute wedge the two walls'
clamped corners cross over, so emitting them as separate vertices self-intersects, while
the single crossing closes the core off cleanly at the overlap.

Reading the corners the walls already committed to, rather than computing a fresh
independent miter, is what keeps the fill from z-fighting: the fill's edges lie on the
wall near edges, so the fill abuts each wall along a shared edge and overlaps none of
it. There is one source of truth for where a corner sits, shared by the wall footprint
and the fill. The pass stays in `core` as pure plan geometry over the graph, gated by
Node tests without a graphics processor, and it reuses ADR-0080's fan resolution so the
two passes cannot disagree.

### A fill is emitted only where three or more walls meet and leave a core

A fill is built only at a vertex with three or more incident edges, and then only where
the core polygon's area is beyond a small epsilon, the same kind of degenerate guard the
wall prism uses to drop a zero-area cap. A free end and a two-way corner are left to the
wall prisms: a free end is a square cap, and a two-way corner is either a clean miter
(no gap) or, where it is too acute to miter, ADR-0080's square clamp, whose two squared
ends overlap solid across the vertex. Both two-way cases already join with no uncovered
core, so neither gets a fill, and the existing miters and clamps cannot z-fight.

Scoping to three-or-more-way junctions is deliberate, not just a degenerate-area
accident. A multi-way junction's near edges enclose a real core that the crossing
construction reads as a simple polygon of one vertex per wall, including the
perpendicular tee, whose three ends cut back to a shared corner and leave a triangular
core. A two-way corner has no such core: a clean one collapses to a line with no area,
and an acute one would read as a self-intersecting bowtie of overlapping clamps rather
than a fillable gap. Closing the sharpest two-way corner is deferred, as is bounding the
fill at a very acute multi-way wedge, where the two near edges run nearly parallel and
cross far from the vertex; the ordinary tees and bays cross near the vertex and read
correctly.

### Extrude floor to ceiling at the tallest incident wall

The fill is a vertical prism: the core polygon as a top cap and a base cap joined by a
vertical side face per edge, rising from the shared wall base at `Y = 0` to a height.
Where the incident walls differ in height, the fill takes the tallest, so the corner
post is at least as tall as every wall meeting it and no wall shows a gap above the post
against its neighbor; the post stands a little proud of a shorter wall, which reads as a
solid corner. A stepped post that follows each wall's height is deferred. The caps are
wound from the polygon's signed area (the shoelace helper already in `core`) so the top
faces `+Y` and the base faces `-Y` whatever order the corners arrive in, the same rule
the wall prism uses. Every vertex is placed through `planToWorld`.

### Neutral roles, no paint reference, no entity id

The fill is part of the wall mass, not a surface painted or selected on its own. Its
caps take the existing neutral `top` and `base` roles; its side faces take a new neutral
`junction` role, so the chamfer and corner post read in the unpainted wall tone and a
future change can give the junction its own material without disturbing the wall roles.
The fill carries no paint surface reference, so the paint provider leaves it neutral.
The fill mesh carries no entity id, the way the hidden-line edge overlay (ADR-0078)
does: a junction is not an entity, a bare corner is not a thing to pick, so a click that
lands only on a fill resolves to no selection. The fill is built beside the wall and
room geometry in the floor group, so it lights, frames, and exports with the scene.

### The fill is independent of openings

An opening sits in the middle of a wall edge, not at a junction vertex, so the fill and
the opening void never touch. A wall that both hosts an opening and meets others at a
vertex contributes its resolved corners to the core polygon the same way; the opening
profile path changes the wall's elevation, not its footprint corners. Nothing here
changes the opening geometry.

## Consequences

- Junctions where three or more walls meet read as one solid mass: the uncovered core,
  including the triangular core of a tee and the notch an acute wedge inside the junction
  leaves, is filled.
- Two-way corners are untouched and cannot z-fight, because the fill is scoped to
  three-or-more-way junctions, so ADR-0080's miters and clamps and their baselines hold.
- The fill never disagrees with the walls about a corner, because it reads the same
  resolved corners the footprint pass stops the walls at.
- The fill is neutral and not selectable, so painting and picking are unchanged; a
  future slice can give the junction its own material or make it pick to its walls
  through the `junction` role without reworking this geometry.
- No model, file-format, scene-graph-data, wall-prism, or two-dimensional-plan change:
  the slice is additive build-time geometry behind a new pure pass and a sibling builder.

## Alternatives considered

- **Round the corner instead of chamfering.** Rejected for this slice: a rounded fill
  needs an arc tessellation and a segment-count choice for a subtler gain than closing
  the notch and the core. The straight chamfer reuses the existing prism machinery; a
  rounded corner is a later refinement.
- **Step the corner post to each incident wall's height.** Deferred: where walls differ
  in height a stepped post follows each wall, but it needs a per-wall-height fill profile
  for a rare case. Taking the tallest wall's height gives a flat-topped post that never
  leaves a gap above a wall, which is enough now.
- **Give the fill its own entity id so a corner is pickable.** Rejected: a junction is
  not an entity in the model and a corner belongs to several walls at once, so there is
  no single thing to select. Leaving the fill out of the pick path, like the edge
  overlay, keeps selection on the real entities.
- **Compute the fill from a fresh miter rather than the walls' resolved corners.**
  Rejected: an independent computation can drift from where the walls actually stop and
  reintroduce a gap or an overlap that z-fights. Reading the walls' own corners keeps one
  source of truth.
- **Fold the fill pass into the footprint pass and return both at once.** Considered:
  one pass over the fan would resolve footprints and fills together. Kept separate for
  now so each pass is single-purpose and independently tested; the shared fan resolution
  is the one source of truth either way, and fusing the passes is a later refactor if the
  double walk ever matters for a floor's wall count.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-wall-junction-fill.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-wall-junction-fill.md`.
- [[ADR-0080-generalized-wall-junction-geometry]]: the fan resolution, the per-wedge
  miter, the `MITER_LIMIT` clamp this fill closes, and the resolved corners it reads.
- [[ADR-0077-three-dimensional-mitered-wall-junctions]]: the original two-way miter and
  the footprint and cap-winding machinery this fill reuses.
- [[ADR-0078-three-dimensional-surface-edge-legibility]]: the hidden-line edge overlay
  whose non-pickable, no-entity-id pattern the fill follows.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall shell,
  the material seam and surface roles, and the pixel-approximate visual tier.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the coordinate, datum,
  and winding conventions.
- Issue #180: the true-bevel follow-on this slice delivers.
