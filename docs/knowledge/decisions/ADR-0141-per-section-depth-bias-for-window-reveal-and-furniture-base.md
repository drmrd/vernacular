---
slug: decisions/ADR-0141-per-section-depth-bias-for-window-reveal-and-furniture-base
title: 'ADR-0141: Per-section depth bias for coincident window-reveal and furniture-base faces'
type: decision
tags:
  [
    architecture,
    three-dimensional,
    rendering,
    materials,
    depth,
    z-fighting,
    opening,
    furniture,
    preview,
  ]
related:
  [
    decisions/ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces,
    decisions/ADR-0102-depth-bias-for-coincident-surfaces,
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0132-surface-edge-overlay-opt-in-view-toggle,
    decisions/ADR-0131-ground-plane-grade-datum,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles:
  [
    engine/materials/role-appearance.ts,
    engine/scene/wall-builder.ts,
    engine/scene/furniture-builder.ts,
    core/scene/opening-fill.ts,
    engine/materials/material-provider.ts,
  ]
status: current
updated: 2026-07-02
---

# ADR-0141: Per-section depth bias for coincident window-reveal and furniture-base faces

## Status

Accepted. It extends the coincident-surface depth bias from
[[ADR-0102-depth-bias-for-coincident-surfaces]] and the ordered ladder from
[[ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces]] to two
more coincident pairs that still fight after the ground-plane rung landed. It
does not supersede either record. It carries the next rungs of issue #391
(coincident-surface z-fighting in the 3D view).

## Context

ADR-0102 set the convention: when two scene surfaces are coplanar at a shared
datum on purpose, bias one of them back in depth with a positive material
`polygonOffset` so the other wins the depth contest every frame, and leave the
geometry where the spec puts it. ADR-0133 generalized that one-sided rule into an
ordered ladder, where each surface that must lose to the one in front of it is
biased one rung farther back, and each rung derives its offset from the rung
before it so the strict ordering is visible in the constants themselves. The
oracle for both was a material-level unit test on the ordered offsets, with the
final rendered result confirmed by the product owner, because z-fighting is angle
dependent and a static pixel baseline is a weak witness.

Two coincident pairs still shimmer after the slab-top and ground-plane rungs.

**Window sash frame against the wall reveal.** An opening is cut out of the wall
as a void ([[ADR-0063-three-dimensional-opening-voids]]). The cut is lined with
reveal faces along the jambs, the head, and the sill. Those faces carry the
`reveal` role and are emitted as one section in `openingWallSections` in
`engine/scene/wall-builder.ts`. The reveal falls to the default branch in
`roleMaterialParameters`, so it is opaque, front side, and writes depth. A
window's sash fill in `core/scene/opening-fill.ts` rings the opening with four
`leaf`-role frame bars: the two stiles reach `along` plus and minus `halfWidth`
and the two rails reach `up` to the sill and head band edges. So the sash frame's
outer perimeter faces sit on the same planes as the reveal faces, over the sash's
across band (plus and minus `SASH_FRAME_THICKNESS_MM` / 2, centered on the wall
centerline). The two are coplanar and back to back with opposite normals. The
`leaf` material is opaque and double sided and writes depth. Two opaque depth
writers on one plane is the same z-fight the ladder already handles. Door leaves
are inset by `LEAF_REVEAL_GAP_MM`, so a door leaf is not flush with its reveal and
does not fight it. Only window sashes are flush.

**Furniture base cap against the floor slab.** `buildFurnitureMassing` in
`engine/scene/furniture-builder.ts` builds the placeholder box with a base cap at
`node.elevationZ`. On a ground floor that is the world Y = 0 datum, so the base
cap is coplanar with the slab top, and with the ground plane where furniture rests
on grade. This case needed a definite answer before a rung could be specified,
because the furniture material (the `furniture` role and its `furnitureFailed` and
`furnitureLoading` variants) is transparent at opacity 0.3 with `depthWrite: false`
and `side: THREE.DoubleSide`. The prior spike flagged that a non-depth-writing
transparent cap might not be a depth-test fight at all, so a rung could be
pointless.

It is a depth-test fight, and a `polygonOffset` rung fixes it. The reasoning is
precise on three points.

- `DoubleSide` disables face culling, so the base cap is rasterized regardless of
  its downward winding. Front-face culling does not hide it, because the material
  never culls.
- `depthWrite: false` means the base cap never writes the depth buffer, but the
  depth test stays on (the default) and the depth function is less-or-equal, so
  the base cap is still tested against the opaque depth the slab top wrote in the
  earlier pass.
- `polygonOffset` shifts the fragment depth used in the depth test as well as in a
  depth write. With no write happening, the offset still moves the tested depth. A
  positive offset on the base cap raises its tested depth above the slab's, so it
  fails the less-or-equal test and the slab occludes it every frame.

The shimmer today comes from the size of the current margin. The slab top already
carries the rung-1 bias while the base cap carries none, so the base cap sits a
hair in front of the pushed-back slab. That margin is about one depth unit, which
is the same size as the interpolation difference between the slab's room-sized
triangulation and the box footprint's triangulation. At shallow angles the
comparison flips per pixel and per frame, which is what shimmers. The fix is
different in kind from the slab and ground rungs: the base cap only reads the
depth buffer and never writes it, so its rung works by making the base cap lose
the depth test to the opaque surface it rests on, rather than by ordering two
depth writers. Pushed far enough back, the base cap is occluded by the slab, or by
the ground plane on grade, and the floor reads clean under the translucent box.

The residual vertical case that ADR-0133 left open, two adjacent rooms' slab side
faces at the shared-wall centerline, stays out of scope here and is a prioritized
fast-follow.

## Decision

Add two more rungs to the ordered ladder, and give each coincident face its own
material section so only that face carries the offset. Non-coincident faces (the
visible sash, the furniture sides and top) stay unbiased.

**Window reveal.** The sash frame is the finished window element the viewer should
see, so the sash wins and the `leaf` role stays unbiased. Bias the reveal back one
rung so the flush sash frame wins the contest. The reveal is already its own
section (`reveal` role) in `openingWallSections`, so a `polygonOffset` on the
`reveal` role in `roleMaterialParameters` biases only the reveal faces and touches
no other wall face. Add a `REVEAL_DEPTH_BIAS` constant and a
`revealDepthBiasParameters()` helper next to the existing ones. Door reveals take
the same bias but have no flush partner, so the change is a no-op for doors.

**Furniture base.** Emit the base cap as its own material section carrying
`FURNITURE_BASE_DEPTH_BIAS`, so the box sides and top stay unbiased. The furniture
box becomes a multi-material mesh, the base cap material apart from the sides and
top, matching the wall builders that already map one material per section. The
base-cap material keeps the furniture state appearance (unloaded, failed, or
loading) and adds the bias, mirroring how the painted slab top spreads
`slabTopDepthBiasParameters`. So the base cap loses the depth test to the slab top,
and to the ground plane on grade, and stops shimmering.

**Ladder ordering.** Front to back, each rung biased strictly farther than the one
before it, and each derived from its predecessor so the order is visible in the
constants:

1. The wall base, the wall-junction fill base, and the sash `leaf`: unbiased
   winners.
2. The slab top: `SLAB_TOP_DEPTH_BIAS` (ADR-0102).
3. The ground plane: `GROUND_PLANE_DEPTH_BIAS`, the slab top plus one rung
   (ADR-0133).
4. The furniture base cap: `FURNITURE_BASE_DEPTH_BIAS`, the ground plane plus one
   rung. It extends the Y = 0 family, because the base cap must lose to every
   opaque surface it can rest on. The wall base under it is unbiased, the slab top
   is rung 2, and the ground plane is rung 3, so the ground plane is the farthest
   surface it must lose to, and the ground plane plus one rung is the smallest
   offset that clears all three.
5. The reveal: `REVEAL_DEPTH_BIAS`, the furniture base plus one rung. The reveal
   contest sits on its own plane inside the wall thickness and never shares a depth
   with the Y = 0 surfaces, so its absolute rung does not interact with them. It
   only has to beat the unbiased sash `leaf`, which any positive rung does. It is
   chained onto the end so the whole ladder stays one strictly increasing sequence
   with a single source of truth, the same reason ADR-0133 derived the ground
   plane from the slab top rather than giving it an unrelated constant.

This is a render-side change only. No geometry moves, the Y = 0 datum holds, and
there is no schema bump, migration, or command. `core/` stays free of rendering
concerns.

## Consequences

- The window perimeter stops shimmering. The sash frame reads cleanly where it
  meets the opening, and the raw wall cut behind it loses the contest.
- The furniture placeholder stops shimmering at the floor. The floor reads clean
  under the translucent box because the base cap is occluded rather than blended.
- The ladder is one strictly increasing sequence, each rung derived from the one
  before it, so a retune of any rung carries the rest. The material-level unit
  test asserts the full order (slab top less than ground plane less than furniture
  base less than reveal, with the winners unbiased). No new GPU or CI baseline is
  added; the pixel baseline moves only if it drifts, since z-fighting is angle
  dependent, as with every prior rung.
- The convention now covers a depth-test-only participant. A transparent,
  non-depth-writing cap can be ordered by giving it a rung large enough to lose the
  depth test to the opaque surface it rests on. A future translucent placeholder
  reuses this shape.
- Per-section materials are the norm for these boxes now. The furniture massing box
  becomes a multi-material mesh, the same pattern the wall builders already use.
- The residual vertical case (adjacent rooms' slab side faces at the shared-wall
  centerline, the ADR-0133 open item) stays open and is tracked as the fast-follow.
  This pass does not touch it.
- Final confirmation of the rendered result is the product owner's visual check, as
  with every prior rung. Two calls in particular want eyes on the scene: whether
  the occluded furniture base reads correctly with no residual tint at the floor
  line, and whether the sash frame winning at the reveal reads as intended at
  grazing angles.

## Alternatives considered

- **Bias the sash frame instead of the reveal.** The mirror image works at the
  depth buffer, but the sash frame is the finished element the viewer should see,
  so biasing it back would push the finished frame behind the raw wall cut. The
  reveal is the designated loser.
- **Split the reveal into a window-only subset before biasing.** The reveal role is
  already scoped to void linings, window sashes are its only flush partner, and
  door reveals are biased harmlessly because they have no partner. Splitting the
  section further buys nothing, so the whole `reveal` role carries the rung.
- **Omit or cull the furniture base cap instead of biasing it.** Dropping the base
  cap, or switching the furniture material to single-sided with a front cull, would
  also stop the fight, since the base is a downward face you never see straight on
  through a translucent box. Rejected as the primary fix because it changes geometry
  or culling for a placeholder rather than staying inside the depth-bias convention
  the owner asked to extend, and because the box is authored double sided on
  purpose so a thin translucent solid reads from any angle. It stays the documented
  fallback if a backend ever ignores polygon offset on a non-depth-writing material.
- **Give each new contest its own unrelated bias constant.** Two independent
  literals would work at the buffer but hide the ordering, the objection ADR-0133
  already raised. Deriving each rung from the one before keeps the order
  self-evident and serialized against one source of truth.
- **Inset the sash frame or the furniture base off its plane.** A small geometric
  gap removes the coincidence but contradicts the authored geometry: the sash is
  meant to fill the opening flush, and the base is meant to rest on the floor. The
  bias leaves the geometry where the spec puts it, consistent with ADR-0102
  rejecting the y-inset for the first pair.
- **Order the surfaces with `renderOrder` and depth-write tuning.** The documented
  fallback in ADR-0102 and ADR-0133, rejected again for the same reason: a global
  per-object sort is fragile across transparency and camera moves, while
  `polygonOffset` resolves the tie locally at the material.

## References

- [[ADR-0102-depth-bias-for-coincident-surfaces]]: the one-sided depth-bias
  convention this record extends, and the slab-top rung the new rungs order behind.
- [[ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces]]: the
  ordered ladder this record adds two rungs to, and the derivation style the new
  constants follow.
- [[ADR-0063-three-dimensional-opening-voids]]: the opening void cut whose reveal
  faces the window sash frame is flush with.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the surface
  roles the reveal and leaf materials live on.
- [[ADR-0132-surface-edge-overlay-opt-in-view-toggle]]: the furniture massing
  placeholder box whose base cap this record biases.
- [[ADR-0131-ground-plane-grade-datum]]: the ground plane the furniture base also
  loses to when furniture rests on grade.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the coordinate,
  datum, and winding conventions, and the visual baseline the fix is measured
  against.
- Issue #391: the coincident-surface z-fighting report. This slice fixes the
  window-frame and furniture-base halves and leaves the residual vertical case open.
