---
slug: decisions/ADR-0090-opening-wall-corner-miter
title: 'ADR-0090: Opening walls miter to the shared footprint'
type: decision
tags: [architecture, three-dimensional, preview, walls, openings, geometry]
related:
  [
    decisions/ADR-0080-generalized-wall-junction-geometry,
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-oblique-opening-wall-corner-miter.md,
    docs/plans/2026-06-15-oblique-opening-wall-corner-miter.md,
    engine/scene/wall-builder.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0090: Opening walls miter to the shared footprint

## Status

Accepted. Extends the wall-junction mitering of [[ADR-0080-generalized-wall-junction-geometry]] to the opening-wall build path introduced with [[ADR-0063-three-dimensional-opening-voids]].

## Context

A wall solid is built one of two ways. A wall with no openings extrudes its mitered footprint from `wallFootprints`, so its ends follow the shared miter line and adjacent walls meet flush at any angle. A wall that hosts a door or window takes a separate path that builds the wall as a rectangular elevation in an edge-local frame, cuts the opening voids from it, and places the result at plus and minus half the thickness. That rectangle has square ends, and the path never read the mitered footprint.

The square end is hidden at a right angle, where it sits behind the perpendicular neighbor. At an oblique angle the square cut diverges from the miter line and leaves an uncovered wedge. The reporter saw this at the seams of a bay, where each angled segment carries a window and the segments meet at obtuse angles. The junction fill did not cover the wedge either, because it trusts the mitered footprint and assumes the corner is already solid.

## Decision

The opening-wall path now honors the mitered footprint that is already computed for its edge. A mitered corner sits on the same plus or minus half-thickness face line as the square corner, so the miter only shifts the corner along the wall.

The edge's `WallFootprint` is threaded into the opening-wall build and carried on the edge-local frame. When a point on the wall's outer outline is placed into world space, the two end columns are remapped to the mitered corners: a point at the `a` end takes that end's miter for its side (the interior face takes `aPlus`, the exterior face takes `aMinus`), and a point at the `b` end takes the `b`-end miter. The remap is the along-axis projection of the chosen footprint corner. Interior void corners keep their position, so the opening cut and its reveal faces are unchanged.

A square footprint projects to zero at the `a` end and to the wall length at the `b` end on both sides, so a free end, a collinear continuation, and an over-limit clamped corner all keep square ends. Only an actually mitered end moves.

## Alternatives considered

Adding a separate corner-fill solid at any two-way corner with an uncovered core would have reused the junction-fill machinery and left the opening path untouched, but it adds geometry to mask a mismatch rather than removing the mismatch, and it leaves the footprint and the built mesh disagreeing about where the wall ends.

Extending the square end outward to the outer miter point would be the cheapest change, but it overbuilds on the convex side and is not a true miter, so corners would still read wrong from some angles.

## Consequences

A wall with an opening now closes its corners at any interior angle, so bays and other non-orthogonal layouts read solid. The footprint becomes the single source of truth for where every wall ends, whether or not it hosts an opening, which keeps the junction fill's assumptions valid. The remap relies on opening voids staying strictly interior to the wall; an opening that reached an end would need that invariant revisited. There is no change to the model, the schema, the materials, or the no-opening prism path.
