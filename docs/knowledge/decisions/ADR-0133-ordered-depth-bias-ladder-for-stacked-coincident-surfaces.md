---
slug: decisions/ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces
title: 'ADR-0133: Ordered depth-bias ladder for stacked coincident surfaces'
type: decision
tags:
  [architecture, three-dimensional, rendering, materials, depth, z-fighting, ground-plane, preview]
related:
  [
    decisions/ADR-0102-depth-bias-for-coincident-surfaces,
    decisions/ADR-0131-ground-plane-grade-datum,
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
    decisions/ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
  ]
sourceFiles:
  [
    engine/materials/role-appearance.ts,
    engine/scene/ground-plane.ts,
    engine/materials/surface-material-provider.ts,
    engine/materials/physical-material-provider.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0133: Ordered depth-bias ladder for stacked coincident surfaces

## Status

Accepted, landed. It extends the coincident-surface depth bias from
[[ADR-0102-depth-bias-for-coincident-surfaces]] to a second surface that the
ground plane in [[ADR-0131-ground-plane-grade-datum]] introduced after ADR-0102
was written, and it generalizes the one-sided rule into an ordered ladder so the
next coplanar-by-design surface has a place to slot in. It closes the
ground-plane half of issue #391 (coincident-surface z-fighting in the 3D view).

## Context

ADR-0102 fixed one coincident pair. The floor slab top and the wall base both
sit on the world Y = 0 finished-floor datum and overlap in plan under every wall,
so the depth buffer could not order them and they z-fought. The fix biased the
slab top back in depth with a positive material `polygonOffset` so the coincident
wall base wins the contest every frame, and it left the geometry on the datum.
The bias is keyed on the `top` surface role in `roleMaterialParameters`, sourced
from the named `SLAB_TOP_DEPTH_BIAS` constant.

ADR-0131 then seated the building on a grass-colored ground plane at grade. Grade
is the same Y = 0 datum as the finished floor for an elevation-zero floor, so the
ground plane is coplanar with the slab top, faces the same way (up), and overlaps
the slab top across the whole footprint. That is a new coincident pair, and
ADR-0102 predates it.

This new pair interacts badly with the existing bias. The slab top is already
pushed back so the wall base wins. The ground plane carried no bias at all, so it
sat in front of the pushed-back slab top and won the contest against it. The lawn
drew over the finished floor: grass showed through the floor of every
ground-floor room. The bias that fixed the first pair created the second failure,
because a one-sided rule says which of two surfaces loses but says nothing about
how a third coplanar surface orders against the other two.

## Decision

Treat the coincident surfaces at a shared datum as an ordered depth-bias ladder
rather than an isolated pair. Each surface that must lose to the one in front of
it is biased one rung farther back than that surface, so the ordering is total and
deterministic, and the geometry stays on the datum exactly as the spec puts it.

At the Y = 0 datum the ladder reads, front to back:

1. The wall base and the wall-junction fill base, unbiased. These structural caps
   win, so the wall reads as meeting the floor cleanly.
2. The slab top, biased back by `SLAB_TOP_DEPTH_BIAS` so the wall base wins
   (ADR-0102), while it still wins against anything farther back.
3. The ground plane, biased back farther still by `GROUND_PLANE_DEPTH_BIAS` so the
   slab top wins over the lawn and the finished floor draws over the grass where
   the two coplanar faces meet.

`GROUND_PLANE_DEPTH_BIAS` derives its `polygonOffsetFactor` and
`polygonOffsetUnits` from `SLAB_TOP_DEPTH_BIAS` plus one rung, so the
strictly-greater relationship is visible in the constant itself, not only in a
comment or a test. A `groundPlaneDepthBiasParameters` helper returns the offset
fields, mirroring `slabTopDepthBiasParameters` so each rung lives in one place. The
ground-plane mesh in `engine/scene/ground-plane.ts` spreads the helper into its
material; nothing else changes.

The bias is a render-side change only. No geometry moves, the Y = 0 datum holds,
and there is no schema bump, migration, or command. The painted floor path in
`PaintMaterialProvider` keeps inheriting the slab-top bias as before, so a painted
floor and an unpainted floor sit on the same rung and both win over the lawn.

## Alternatives considered

- **Drop the ground plane a hair below grade under the footprint.** Move the lawn
  off Y = 0 so it no longer shares a depth with the slab top. The ground plane is a
  single plane spanning the whole site, so lowering it would sink the lawn around
  the building too, and the grade datum that ADR-0131 fixed at the finished-floor
  elevation would no longer hold. The bias leaves the datum untouched, which is the
  deciding reason to prefer it, consistent with ADR-0102 rejecting the y-inset for
  the first pair.
- **Bias the ground plane to the same magnitude as the slab top.** Reusing
  `SLAB_TOP_DEPTH_BIAS` for the lawn would push both surfaces back by the same
  amount, leaving them coincident again and still fighting. The ladder needs a
  strictly larger offset on the surface that must lose, which is why the ground
  plane sits a rung farther back rather than on the same rung.
- **Give the ground plane its own unrelated bias constant.** A second independent
  literal pair would work at the depth buffer but would hide the ordering
  invariant: a later contributor tuning the slab-top bias could silently invert the
  ladder. Deriving the ground-plane rung from the slab-top rung keeps the ordering
  self-evident and serialized against one source of truth.
- **Sort with `renderOrder` and depth-write tuning.** Force the draw order so the
  slab top overwrites the lawn. This is the documented fallback in ADR-0102 and is
  rejected for the same reason here: render order is a global per-object sort that
  is fragile across transparency and camera moves, while `polygonOffset` resolves
  the tie locally at the material.

## Consequences

- Ground-floor rooms read their finished floor again. The lawn no longer flickers
  through the floor, which closes the ground-plane half of issue #391.
- The ladder is the reusable shape ADR-0102 anticipated. The next coplanar-by-design
  surface (a furniture base resting on the floor, a stacked floor finish, a future
  site layer) slots in as a new rung biased relative to the rung it must lose to,
  rather than as another bespoke pair.
- The ordering invariant has one home. `SLAB_TOP_DEPTH_BIAS` and
  `GROUND_PLANE_DEPTH_BIAS` live together in `role-appearance.ts`, and the second
  derives from the first, so any retune of one rung carries the others with it.
- No geometry, datum, schema, persistence, or command change. The slab top still
  sits at Y = 0 and the ground plane still sits at grade, so the vertical-datum
  contract and the room-builder datum assertion are unaffected.
- The fix is proven at the material level by the unit cycle, which asserts the
  ground-plane offset is strictly greater than the slab top's. As with ADR-0102,
  the visual-regression baseline may or may not move, because z-fighting is frame
  and angle dependent rather than a fixed pixel difference; the baseline is
  refreshed only if it drifts. Final confirmation of the rendered result is a
  visual check the product owner makes.
- One coincident case stays open. Two adjacent rooms' slab side faces are coplanar
  at the shared-wall centerline after
  [[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]] moved the shared
  slab edge there. They are back to back with opposite normals and are
  hidden under the continuous slab top and the wall above, so under front-face
  culling neither is normally visible and they do not fight for a standing camera.
  They are left unbiased and tracked as the residual vertical case of issue #391,
  to revisit only if a cutaway or below-floor view ever exposes them.

## References

- [[ADR-0102-depth-bias-for-coincident-surfaces]]: the one-sided depth-bias
  convention this record generalizes, and the slab-top rung the ground plane orders
  behind.
- [[ADR-0131-ground-plane-grade-datum]]: the ground plane at grade whose coincidence
  with the finished floor this record resolves.
- [[ADR-0076-three-dimensional-floor-slab-under-walls]]: grew the slab to the wall
  outer faces, the geometry that put the slab top under every wall in the first place.
- [[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]]: moved the shared
  slab edge to the wall centerline, which is where the open residual vertical case sits.
- [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]: the floor slab and the
  shared finished-floor datum the ladder works within.
- Issue #391: the coincident-surface z-fighting report this slice fixes the
  ground-plane half of.

## Update (2026-08-14): PaintMaterialProvider is removed

The Decision section above says the painted floor path in `PaintMaterialProvider`
keeps inheriting the slab-top bias. `PaintMaterialProvider` is deleted (issue #513):
it had no production callers once the live view moved to `PhysicalMaterialProvider`,
and the owner chose retirement over reservation. The inheritance this record depends
on was already shared dispatch, not provider-specific code: `basePaintedParameters`
in `engine/materials/surface-material-provider.ts` spreads
`slabTopDepthBiasParameters` for the `top` role regardless of provider. A painted
floor and an unpainted floor still sit on the same rung and both win over the lawn,
now through `PhysicalMaterialProvider`.
