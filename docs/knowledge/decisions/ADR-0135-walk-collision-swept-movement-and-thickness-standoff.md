---
slug: decisions/ADR-0135-walk-collision-swept-movement-and-thickness-standoff
title: 'ADR-0135: Walk collision sweeps the move path and stands off the wall face'
type: decision
tags: [architecture, three-dimensional, walk-mode, collision, camera, navigation, core, geometry]
related: [decisions/ADR-0064-three-dimensional-camera-navigation]
sourceFiles:
  [core/scene/walk-collision.ts, core/scene/walk-camera.ts, core/registries/opening-kind.ts]
status: current
updated: 2026-08-17
---

# ADR-0135: Walk collision sweeps the move path and stands off the wall face

## Status

Accepted, landed. It hardens the walk-mode collision response that
[[ADR-0064-three-dimensional-camera-navigation]] deferred and that the first
collision slice added as a filter on the proposed next position.

## Context

ADR-0064 set up walk mode at a constant eye height and left collision as a later,
additive step: the walk math produces a proposed next position, and collision is a
filter on that position. The first slice built exactly that. `resolveWalkCollision`
models the walker as a circle and pushes the proposed position out of each wall
centerline so a head-on move stops and a glancing move slides.

Filtering only the proposed end position has two gaps that show up in normal use.

A move large enough to span a wall in one frame is not caught. The walker starts
clear on one side, the proposed position lands clear on the other side, and the
filter sees nothing to push out, so the walker passes straight through. A low frame
rate, a long pause, or any teleport-like input produces a move that big.

Walls are treated as zero-thickness centerlines. The push-out keeps the walker one
radius from the centerline, so half the wall's thickness still overlaps the walker.
On a thick wall the eye ends up inside the solid slab, which reads as standing in
the wall.

## Decision

Sweep the move along its whole path, and stand the walker off the wall face.

For the path, `sweepWalkCollision(from, to, world)` walks the straight segment from
the previous position to the proposed one in even sub-steps no longer than the
walker radius, resolving each sub-step against the running position. Because each
sub-step is at most one radius and the walker is a circle of that radius, the swept
band covers the segment with no gap, so a wall between the endpoints always stops
the walker on the near side. When the move already fits inside one radius the count
is one sub-step, which is the original single push-out, so short per-frame moves are
unchanged. `advanceWalk` now feeds its previous position in as the sweep origin.

For the face, a `WallSegment` carries an optional thickness, and the push-out
clearance becomes `radius + thickness / 2`. Half the thickness moves the standoff
from the centerline out to the near face. Walls carry their own thickness onto the
collision segment, and the opening split preserves it on each solid stretch.
Furniture footprints stay exact-boundary segments with no thickness, since the
perimeter already is the solid edge.

The collision world groups the segments and the radius into one value, which both
the sweep and its single caller pass around as a unit.

## Consequences

The walker can no longer tunnel through a wall at any frame rate or with a
teleport-sized input, and it keeps a correct clearance from a thick wall rather than
sinking half into it. The sweep costs one push-out pass per sub-step, so a move of n
radii costs about n passes; moves are short relative to the radius in practice, so
the added work per frame is small and bounded.

The push-out stays a per-segment circle-versus-segment test, so the thickness term
is a single addition with no new geometry. Reducing to the prior behavior for small
moves means the existing collision tests hold without change.

A residual remains: the sweep prevents tunneling but does not model the walker
sliding along a wall it grazes mid-sub-step beyond what the per-sub-step push-out
already gives. That has not mattered at walking speed and is left for a later slice
if a faster movement mode needs it.

## Alternatives considered

An analytic continuous test, intersecting the swept circle against each segment for
an exact time of impact, is more precise than sub-stepping and costs a fixed amount
per segment regardless of move length. It also carries more cases to get right
(parallel grazes, corner hits, multiple walls in one frame). Sub-stepping reuses the
push-out that already handles those cases and is correct by the radius bound, so it
won the first pass. The analytic route stays open if profiling ever shows the
sub-step count is a real cost.

Carrying thickness per segment rather than as one global wall thickness keeps the
door open for walls of different thicknesses in the same plan, which the model
already allows, and costs nothing extra since each segment already comes from a wall
node that knows its own thickness.

## Update (2026-08-17): the standoff follows the assembly, and leafless openings pass

The standoff thickness now comes from `effectiveWallThickness`, the assembly total the 3D
wall builder extrudes, so a wall carrying a construction profile no longer lets the eye clip
into the face it renders (issue #552). Passability also gained a second case: an opening with
no fill body, such as a cased opening, is walkable whether or not it is in the open set,
because there is nothing in it to open (issue #532).
</content>
</invoke>
