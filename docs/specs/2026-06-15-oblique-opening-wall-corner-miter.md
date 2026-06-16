# Oblique opening-wall corner miter

## Problem

When a wall that hosts an opening (a door or window) meets another wall at an angle that is not square, the 3D model shows a gap at the seam. Corners near 90 degrees look closed; oblique corners open up. This is visible in a bay, where each angled segment carries a window and the segments meet at obtuse seams.

Plain walls with no openings already miter and close at any angle, so the basic junction geometry is sound. The gap is specific to walls that host an opening.

## Cause

Two build paths produce a wall solid. A wall with no openings extrudes its mitered footprint (`wallFootprints`), so its ends follow the shared miter line and adjacent walls meet flush. A wall with an opening takes a separate path (`buildOpeningWallMesh`) that builds the wall as a rectangular elevation `[0, length] x [0, height]` in an edge-local frame, cuts the opening voids from it, and places the result at plus and minus half the thickness. That rectangle has square ends, and the opening path never reads the mitered footprint.

At a square corner the square end stays hidden behind the perpendicular neighbor. At an oblique corner the square cut diverges from the miter line and leaves an uncovered wedge. The junction fill does not cover it either, because the fill trusts the mitered footprint and assumes the corner is already solid.

## Design

Make the opening-wall path honor the mitered footprint that is already computed for its edge.

A mitered corner sits on the same plus or minus half-thickness face line as the square corner; the miter only shifts the corner along the wall. So the fix is a remap of the outer boundary that leaves the openings alone:

1. Thread the edge's `WallFootprint` into the opening-wall build. `buildWalls` already computes it for the no-opening path.
2. Project the four footprint corners onto the edge's `along` axis to get four end offsets: the along distance of `aPlus`, `aMinus`, `bPlus`, and `bMinus`.
3. When mapping an outline point to world, remap only the outer-boundary end columns. A point at `u = 0` on the interior side takes the `aPlus` offset; on the exterior side it takes `aMinus`. A point at `u = length` takes `bPlus` or `bMinus`. Interior void corners keep their `u`.

The remap flows through the existing placement helper, so the two long faces, the top and base caps, and the two end caps all follow the miter line while the opening void and reveal geometry stay unchanged.

The change degrades safely. A free end, a collinear continuation, and an over-limit clamped corner all keep the square footprint, so their end offsets equal the square positions and nothing shifts. Only an actually mitered end moves.

## Testing

The behavioral guard is a geometry test: build an oblique two-way corner where one wall hosts an opening, and assert the opening-wall's end corners coincide with the neighbor's mitered footprint corners, so the seam closes. It fails on the square ends today and passes after the remap. Supporting checks confirm that a right-angle opening-wall corner and a free end are unchanged.

The committed scene baselines should not move for the existing fixtures. A small bay fixture can be added later if a visual lock is wanted.

## Scope

The change lives in `engine/scene/wall-builder.ts`, plus threading the footprint through its call from `buildWalls`. There is no change to the model, the schema, the materials, or the no-opening prism path. The decision is recorded in ADR-0090.
