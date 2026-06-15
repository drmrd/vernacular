# Bounding the junction fill at a near-parallel wedge

Date: 2026-06-15

## Problem

Where three or more walls meet, the junction fill closes the uncovered core with a
polygon whose corners are the crossings of each pair of angularly-adjacent walls'
near-edge cap lines (the wall-junction fill slice, ADR-0082). For the common
junctions this reads correctly: a clean miter crosses at the shared corner, and an
acute overlapping wedge crosses near the vertex.

One wedge runs away. When two angularly-adjacent walls are nearly collinear, so the
angle of the wedge between them is close to zero or to a straight line, their cap
lines run nearly parallel and cross far from the junction vertex. That far crossing
becomes a polygon corner, so the fill overshoots into a long spike instead of hugging
the core. ADR-0082 recorded this as deferred. A slightly bent through-wall at a
three-way junction is the kind of plan that triggers it.

The exactly-parallel case is already handled: when the two cap lines do not cross at
all, the fill falls back to the midpoint of the two corners that bound the wedge,
which sits at the core near the vertex. The gap is the near-parallel case, where the
lines do cross, but far away.

## Approach

Extend the fallback from exactly-parallel to near-parallel. When the cap-line crossing
lands far from the corners it bridges, treat it as a runaway and use the same bounded
midpoint the parallel case already uses.

Concretely, the cap crossing keeps the line intersection it computes today, but before
accepting it, it measures how far the crossing sits from the midpoint of the two
bounding corners. A clean miter and an acute overlap cross close to those corners; the
near-parallel wedge crosses many times farther out. When the crossing is past a
multiple of the span between the bounding corners, the fill uses the midpoint instead.
The result is a polygon that stays at the junction core for every wedge, so no corner
escapes into a spike.

This is a pure change in `core/topology/junction-fill.ts`. The corners themselves, the
fan ordering, the incidence rule, and the rest of the fill are unchanged. The common
junctions (clean miters, tees, acute bays) cross close to the vertex, so they are below
the bound and keep their current corners exactly.

## Scope

In scope:

- The runaway-crossing bound in the cap-crossing step of `junctionFills`, with the
  bound expressed against the span between the two corners the wedge bridges.
- Unit tests on a near-parallel multi-way junction confirming the fill polygon stays
  within the junction core rather than spiking, and that the ordinary junctions keep
  their corners.

## Deferred, by design

- No change to the prism or the fill builder: this only moves a runaway corner back to
  the core, so the extruded geometry follows.
- The other ADR-0082 deferrals stand: the sharpest two-way corner, the stepped corner
  post for differing wall heights, rounded corners, and per-side junction paint.
- No new scene fixture or visual baseline: the ordinary junction scene is unchanged
  because its wedges already cross near the vertex; the bound is verified in core.

## Verification

- Unit tests in `core/topology/junction-fill.test.ts`: a junction whose two
  angularly-adjacent walls are nearly collinear produces a fill polygon whose every
  corner lies within a small bound of the junction vertex (no spike), while a clean
  multi-way junction keeps its existing corners.
- The full check chain stays green, including the existing junction-fill and
  scene baselines, which do not change.
