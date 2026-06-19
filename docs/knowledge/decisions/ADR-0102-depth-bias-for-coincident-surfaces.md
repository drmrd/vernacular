---
slug: decisions/ADR-0102-depth-bias-for-coincident-surfaces
title: 'ADR-0102: Depth bias for surfaces that are coincident by design'
type: decision
tags:
  [architecture, three-dimensional, rendering, materials, depth, z-fighting, floor-slab, preview]
related:
  [
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0099-2d-plan-renderer-y-up-coordinate-convention,
  ]
sourceFiles:
  [
    engine/materials/role-appearance.ts,
    engine/materials/paint-material-provider.ts,
    engine/materials/neutral-material-provider.ts,
    engine/scene/room-builder.ts,
    core/scene/vertical-datum.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0102: Depth bias for surfaces that are coincident by design

## Status

Accepted, landed. The wall-base z-fighting fix, issue #224 from the product
owner's backlog. It resolves a depth artifact that
[[ADR-0076-three-dimensional-floor-slab-under-walls]] introduced when it grew the
floor slab out to the wall outer faces, and it works within the shared
finished-floor datum that the three-dimensional preview has used since
[[ADR-0062-three-dimensional-floor-slabs-and-ceilings]].

## Context

The floor slab's top cap and the wall's base cap both sit on the world Y = 0
finished-floor datum. That datum is the spec contract: `wallVerticalSpan` fixes
the wall base at 0 and `floorSlabVerticalSpan` fixes the slab top at 0 in
`core/scene/vertical-datum.ts`, and every wall builder, the junction fill, and the
slab builder all honor it. The two caps are coplanar on purpose.

Before ADR-0076 the slab stopped at the inner wall faces, so the coplanar caps did
not overlap in plan and the depth buffer never had to choose between them. ADR-0076
grew the slab footprint out to the wall outer faces so a floor reads as one
continuous base under its walls. Now the slab top reaches under every wall, and the
upward-facing slab top and the downward-facing wall base are coplanar at Y = 0 and
overlap in plan exactly under every wall. The depth buffer cannot consistently
order two faces that occupy the same depth, so it z-fights. The flicker is most
visible at grazing and rotating camera angles right at the wall base, which is what
issue #224 reports.

The two surfaces are meant to be coincident. Neither one is wrong, and the geometry
is exactly what the spec asks for. The decision is how to break the depth tie
deterministically without contradicting the datum that put the surfaces there.

## Decision

Adopt a depth-bias convention for surfaces that are coincident by design: when two
scene surfaces are coplanar at a shared datum on purpose, bias exactly one of them
back in depth with a material `polygonOffset` so the other wins the depth contest
every frame, and leave the geometry where the spec puts it.

For this coincident pair the slab top is the biased surface. `roleMaterialParameters`
in `engine/materials/role-appearance.ts` is the single role-keyed material-parameter
factory, and it already special-cases depth behavior per role (glass is transparent
and writes no depth). The `top` role now also returns `polygonOffset: true` with a
positive `polygonOffsetFactor` and `polygonOffsetUnits`, sourced from a named
`SLAB_TOP_DEPTH_BIAS` constant and a `slabTopDepthBiasParameters` helper that ties
the bias to the Y = 0 coincidence in one place. The positive offset pushes the slab
top back in depth, so the coincident wall base, the junction fill base, and any
furniture base that lands on Y = 0 all win the contest consistently.

The bias reaches both material paths. `NeutralMaterialProvider` constructs its
material straight from `roleMaterialParameters(role)`, so it inherits the bias for
free. The slab top is paint-keyed (the slab carries a `floor` SurfaceRef and can be
painted), and `PaintMaterialProvider.paintedMaterial` builds its own parameters
rather than reading the role factory, so a painted floor would have re-introduced
the flicker. The painted branch now spreads `slabTopDepthBiasParameters` when the
role is `top`, reusing the same constant rather than duplicating the magnitude. A
painted floor and an unpainted floor carry the identical bias.

The bias is scoped to the one surface that needs it. Only the `top` role is biased.
The `base`, `exteriorFace`, `interiorFace`, `junction`, `glass`, and `leaf` roles
return no polygon offset. Biasing both sides of a coincident pair cancels out and
buys nothing, and biasing an unrelated role that is not in a coincident contest is
gratuitous depth distortion. The convention is one-sided and pair-scoped on purpose.

No geometry moves and the datum is untouched, so this is a renderer-side change
only. `core/` stays free of rendering concerns, the Y = 0 spec contract holds, and
the room builder's assertion that the slab top's bounding box sits at the floor
datum stays green. There is no schema bump, no migration, and no command, because
depth bias is pure render appearance.

## Alternatives considered

- **Inset one surface off the datum.** Drop the slab top, or raise the wall base, a
  hair off Y = 0 so the two caps no longer share a depth. This is the obvious
  geometric fix and it does remove the fight, but it contradicts the spec's shared
  finished-floor datum, ripples into `core/scene/vertical-datum.ts` and every
  builder and the junction fill, and breaks the room builder's
  slab-top-at-the-datum assertion. The depth bias leaves all of that untouched,
  which is the deciding reason to prefer it. The y-inset is the rejected
  alternative this record exists to document.
- **Bias the wall base instead of the slab top.** The mirror image works equally
  well at the depth buffer, but the slab top is a single material role that is
  already paint-keyed, while the wall base is emitted from two builders (the solid
  wall prism and the opening-wall path). Biasing the slab top touches one role in
  one factory and one painted branch; biasing the wall base would touch both wall
  builders. The slab top keeps the file footprint to the materials layer.
- **Order the surfaces with `renderOrder` and depth-write tuning.** Force the draw
  order so the slab top draws first and the wall base overwrites it. The selection
  outline already uses `depthTest: false` with `renderOrder` (ADR-0061's visual
  tier), so the machinery exists. Rejected as the primary fix because render order
  is a global per-object sort that is fragile across transparency and camera moves,
  while `polygonOffset` is a local, per-material depth nudge that resolves the tie
  at the source. It stays the documented fallback if a renderer backend ever
  ignores the polygon offset.

## Consequences

- The wall-to-floor junction no longer shimmers on camera orbit. The coincident
  wall base wins the depth contest every frame, which closes issue #224.
- The convention is reusable. The same one-sided polygon-offset rule applies at the
  next coplanar-by-design pair: the slab side faces against the wall exterior faces
  along the footprint perimeter, a furniture base resting on the floor, and any
  future stacked finish. The biased surface is the designated loser of each pair,
  biased once.
- The bias rides the role factory, so it reaches the neutral and painted paths from
  one constant. A future material or per-room floor color must keep the slab top
  biased; the shared `SLAB_TOP_DEPTH_BIAS` helper is the one place to hold that
  invariant, and any new material-factory work on the slab top is serialized
  against this rule.
- No geometry, datum, schema, persistence, or command change. The slab top's
  bounding box still sits at Y = 0, so the room builder's datum assertion and the
  vertical-datum contract are unaffected.
- The visual-regression baseline may or may not move, because z-fighting is
  frame-and-angle dependent rather than a fixed pixel difference. The fix is proven
  at the material level by the unit cycles, not by the snapshot; the baseline is
  refreshed only if it drifts.

## References

- [[ADR-0076-three-dimensional-floor-slab-under-walls]]: grew the slab footprint to
  the wall outer faces, which created the coplanar overlap this record resolves.
- [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]: the floor slab and the
  shared finished-floor datum the bias works within.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the surface
  roles and the material seam the `top` role lives on, and the selection outline's
  depth-test and render-order pattern this fix sits beside.
- [[ADR-0067-three-dimensional-painted-preview]]: the surface-identity material seam
  and the paint provider whose painted slab-top branch had to inherit the bias.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the coordinate,
  datum, and winding conventions, and the visual baseline the fix is measured
  against.
- [[ADR-0099-2d-plan-renderer-y-up-coordinate-convention]]: the y-up coordinate
  convention the Y = 0 finished-floor datum and this depth direction sit inside.
- Issue #224: the wall-base z-fighting report this slice fixes.
