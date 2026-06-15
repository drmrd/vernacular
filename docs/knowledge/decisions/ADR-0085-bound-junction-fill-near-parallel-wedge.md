---
slug: decisions/ADR-0085-bound-junction-fill-near-parallel-wedge
title: 'ADR-0085: Bound the junction fill at a near-parallel wedge'
type: decision
tags: [architecture, three-dimensional, geometry, junction, fill, topology]
related:
  [
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0080-generalized-wall-junction-geometry,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-bound-acute-junction-fill.md,
    docs/plans/2026-06-15-bound-acute-junction-fill.md,
    core/topology/junction-fill.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0085: Bound the junction fill at a near-parallel wedge

## Status

Accepted. Issue #190, a follow-up to the junction-fill slice
([[ADR-0082-three-dimensional-wall-junction-fill]]), which left this case deferred.

## Context

The junction fill closes the uncovered core where three or more walls meet with a
polygon whose corners are the crossings of each pair of angularly-adjacent walls'
near-edge cap lines. A clean miter crosses at the shared corner and an acute
overlapping wedge crosses near the vertex, so the common junctions read correctly.

When two angularly-adjacent walls are nearly collinear, the wedge between them
approaches zero or a straight line, and their cap lines run nearly parallel. Two
nearly-parallel lines cross far away, so the crossing lands far from the junction
vertex and the polygon corner escapes into a long spike. The fill already falls back
to a bounded midpoint when the two cap lines are exactly parallel and do not cross,
but the near-parallel case slips past that guard because the lines do still cross,
just far out.

The decision is how to bound the runaway without disturbing the corners the ordinary
junctions depend on.

## Decision

Extend the existing parallel fallback to cover the near-parallel runaway, keyed on how
far the crossing lands rather than on the wedge angle.

The cap crossing still computes the line intersection it computes today. Before
accepting it, it measures the distance from the crossing to the midpoint of the two
corners that bound the wedge and compares it against the span between those two
corners. A clean miter and an acute overlap cross within a small multiple of that
span; the near-parallel wedge crosses many multiples out. When the crossing is past
the bound, the fill uses the midpoint, the same point the exactly-parallel case
already uses. Below the bound the crossing is kept unchanged.

Keying on the landing distance rather than on the wedge angle means one threshold
covers both runaway directions (the wedge approaching zero and the wedge approaching
a straight line), because both produce a far crossing, and it reads as what the bound
is actually protecting against: a corner that escapes the core.

## Alternatives considered

- **Key on the wedge angle.** Fall back when the angle between the two spokes is within
  a tolerance of zero or of a straight line. This works but needs two angular tolerances
  and a trigonometric test, and it describes the symptom (the angle) rather than the
  fault (the far corner). The distance test is one comparison and names the fault.
- **Clamp the crossing onto the vertex.** Snapping the runaway corner to the junction
  vertex also bounds it, but the vertex sits inside the walls, so the fill would pull in
  past the wall faces and leave a notch. The midpoint of the bounding corners sits on the
  core boundary where the fill should meet the walls, which is why the parallel case
  already uses it.
- **Leave it deferred.** The case is uncommon, but a slightly bent through-wall at a
  multi-way junction triggers a visible spike, and the fix is a small, local guard that
  reuses the existing fallback, so closing it now is cheap.

## Consequences

- Every junction wedge, including a near-parallel one, keeps its fill corner at the
  core, so no corner escapes into a spike. This closes issue #190.
- The common junctions (clean miters, tees, acute bays) cross within the bound, so they
  keep their current corners exactly and the existing junction tests and scene baselines
  do not change.
- The change stays a pure, local guard in `core/topology/junction-fill.ts`; the corners,
  the fan ordering, the incidence rule, the prism, and the fill builder are untouched.
