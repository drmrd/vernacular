---
slug: decisions/ADR-0150-slab-side-face-inset-off-shared-centerline
title: 'ADR-0150: Slab side faces step off the shared wall centerline plane'
type: decision
tags: [architecture, three-dimensional, geometry, rendering, floor-slab, rooms, z-fighting, preview]
related:
  [
    decisions/ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline,
    decisions/ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces,
    decisions/ADR-0141-per-section-depth-bias-for-window-reveal-and-furniture-base,
    decisions/ADR-0102-depth-bias-for-coincident-surfaces,
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
  ]
sourceFiles: [engine/scene/room-builder.ts]
status: current
updated: 2026-07-04
---

# ADR-0150: Slab side faces step off the shared wall centerline plane

## Status

Accepted, landed. It closes the residual vertical case that
[[ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces]] left open and
[[ADR-0141-per-section-depth-bias-for-window-reveal-and-furniture-base]] carried forward
as a fast-follow. It is the last coincident pair tracked under issue #391.

## Context

[[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]] moved each room's
shared floor-slab boundary to the wall centerline, so two adjacent rooms reach that
centerline from their own sides and their top caps meet edge to edge without
overlapping in area. That fixed the horizontal doorway artifact. It also left the two
rooms' slab side faces on the same plane. The side face is the `exteriorFace` section
built in `slabSidePositions` in `engine/scene/room-builder.ts`, a vertical skirt from
the floor datum down to the slab underside along the boundary. Room A's skirt along the
shared edge and room B's skirt along the same edge occupy the same rectangle in space,
wound in opposite directions, so they are back to back with opposite normals and they
overlap across their whole area rather than only touching at an edge.

Under the default opaque, front-face-culled material, only one of the two skirts is
front facing from any camera position, so a standing camera draws one and culls the
other and never sees a fight. The pair fights the moment both are drawn to the same
pixels. A cutaway, a below-floor camera, a transparent floor finish, or a
selected-surface highlight all draw both sides, and then the two coincident skirts
z-fight.

The depth-bias ladder from ADR-0102, ADR-0133, and ADR-0141 does not reach this pair.
Every rung on that ladder biases one surface role back so a coincident surface of a
different role wins. Both of these skirts draw the same `exteriorFace` role, so any
offset keyed on the role lands on both of them and cancels, which is the same tie
ADR-0129 already noted for the two adjacent top caps. Giving the two faces distinct
offsets would need a per-room-pair assignment, and that is where the ladder stops being
the right tool: the two faces point opposite ways, so the face a viewer wants to win
flips with the camera side, and a fixed per-room offset cannot flip with it. Parity of
the room id does not help either: room ids carry no reliable parity, and two adjacent
rooms can land on the same one. The room adjacency graph also needs more than two
colors in general, so no fixed two-level assignment guarantees that neighbors differ.

## Decision

Step the slab side faces off the shared plane in geometry rather than in depth. In
`slabSidePositions`, pull each side face inboard of its boundary edge by a fixed
`SLAB_SIDE_FACE_INSET_MM`, along the edge's inward normal. Two adjacent rooms then move
their shared-centerline skirts toward their own interiors, in opposite directions, so
the two land on different planes and never share a depth. The top and base caps still
reach the true boundary, so the footprint and the finished-floor datum are unchanged and
only the vertical skirt moves.

The inset is `0.1` millimeters. That is well above the float32 geometric resolution at
the maximum plan extent, `MAX_LENGTH_MM`, so the two faces are representably distinct,
and it is well below both the wall junction tolerance and any visible threshold, so the
skirt does not read as a gap. The side face reuses `leftNormal` and `shift` from
`core/geometry`, with a guard for a degenerate zero-length edge that core's `unit` does
not carry.

This follows the posture ADR-0129 already set. ADR-0129 weighed a renderer-side per-room
tie-break against a geometric fix for the adjacent-room slab coincidence and chose the
geometry, on the grounds that a tie-break is fragile across camera moves and
transparency. This
residual is the vertical sibling of that horizontal case, in the same family of two
adjacent rooms' slab faces, so it takes the same geometric answer. The depth-bias ladder
stays the answer for same-normal surfaces stacked at a shared datum, where a role-keyed
offset does pick a deterministic winner. It does not extend to back-to-back
opposite-normal faces that share one role.

The engine does not carry the shared-versus-perimeter edge classification, which lives
in `deriveRooms` in `core/topology` where ADR-0129 scoped it. Reaching it from the engine
would re-derive topology outside its layer. So every side face is inset, not only the
shared ones. Insetting the perimeter faces is harmless: a perimeter slab side face runs
below the floor datum and the wall exterior face runs above it, so they meet only along
the datum line and never overlap in area, and there is no coincident pair there to
disturb.

This is a render-side geometry change in the room builder. No model, persistence, schema,
or command changes, and `core/` keeps its topology and its centerline boundary exactly
as ADR-0129 left them.

## Alternatives considered

- **Add a depth-bias rung on the `exteriorFace` role.** The obvious extension of the
  ladder. Rejected because both skirts draw that one role, so the offset lands on both
  and cancels and the tie stays unbroken. This is the case the ladder cannot order.
- **Bias by room id parity, a renderer-side per-room tie-break.** Give each room's skirt
  an offset by the parity of its id so neighbors differ. Rejected because room ids carry
  no reliable parity, adjacent rooms can share one, and the adjacency graph is not two
  colorable, so no fixed two-level assignment guarantees a deterministic winner. It is
  also the fragile per-room tie-break ADR-0129 already rejected for the horizontal case.
- **Inset only the shared edges.** The narrowest geometric fix, but the engine does not
  have the shared-versus-perimeter classification, and pulling it out of `core/topology`
  into the builder would re-derive topology in the wrong layer. The uniform inset is
  harmless on perimeter edges, so it is preferred until a reason to treat them apart
  appears.
- **Move the shared boundary itself in `core/topology`.** A core geometry change rather
  than a render-side one. Unnecessary: the centerline boundary is correct, the caps
  should keep reaching it, and only the rendered skirt needs to step off the shared plane.
  Keeping the change in the builder leaves ADR-0129's boundary rule intact.

## Consequences

- The residual vertical case of issue #391 is closed. Two adjacent rooms' side faces no
  longer share a plane, so a cutaway, a below-floor camera, a transparent finish, or a
  selected-surface material no longer makes them fight.
- The footprint, the finished-floor datum, and the room-builder datum assertion are
  untouched, because only the vertical skirt moves and the caps still reach the boundary.
- The fix is proven at the builder level by a unit test that builds two adjacent rooms and
  asserts their shared-centerline side faces land on different planes. As with every prior
  rung, the rendered result is confirmed by the product owner's visual check, since
  z-fighting is angle dependent and a static pixel baseline is a weak witness. Dedicated
  visual-regression coverage for this exact pair is tracked in issue #402.
- Each edge is offset along its own inward normal with no corner miter, so at a polygon
  corner the two side faces separate by a sub-millimeter sliver. At `0.1` millimeters it
  is invisible and sits under the wall.
- The depth-bias ladder and this geometric inset now split the coincident-surface work:
  the ladder orders same-normal surfaces stacked at a shared datum, and the inset handles
  adjacent rooms' back-to-back slab faces. That is the same line ADR-0129 drew between
  the horizontal cases.

## References

- [[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]]: moved the shared slab
  edge to the wall centerline and chose geometry over a renderer tie-break for the
  horizontal adjacent-room case this follows.
- [[ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces]]: the ordered
  ladder that left this vertical case open as the residual.
- [[ADR-0141-per-section-depth-bias-for-window-reveal-and-furniture-base]]: the prior rung
  work that carried this case forward as the fast-follow.
- [[ADR-0102-depth-bias-for-coincident-surfaces]]: the one-sided bias convention, and its
  note that biasing both sides of a coincident pair cancels.
- [[ADR-0076-three-dimensional-floor-slab-under-walls]]: grew the slab under the walls,
  the geometry that put the slab boundary under the shared wall.
- Issue #391: the coincident-surface z-fighting umbrella this closes the last case of.
- Issue #402: the visual-regression coverage for this pair, tracked as the follow-up.
