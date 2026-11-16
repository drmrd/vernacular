---
slug: decisions/ADR-0139-plan-to-world-orientation
title: 'ADR-0139: Map plan north to world -Z so the 3D view is not a mirror of the plan'
type: decision
tags:
  [
    architecture,
    core,
    engine,
    3d-preview,
    axis-mapping,
    plan-to-world,
    orientation,
    winding,
    bugfix,
  ]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0153-daylight-through-glass-role-stamp,
    decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants,
    decisions/ADR-0173-ambient-occlusion-normals-target,
  ]
sourceFiles:
  [
    docs/specs/2026-06-09-three-dimensional-preview-foundation.md,
    core/scene/plan-to-world.ts,
    core/scene/camera-presets.ts,
    core/scene/opening-motion.ts,
    core/scene/opening-reach.ts,
    engine/scene/room-builder.ts,
    engine/scene/junction-fill-builder.ts,
    engine/scene/furniture-builder.ts,
    engine/scene/wall-prism.ts,
    engine/scene/wall-builder.ts,
    engine/scene/wall-face-winding.test.ts,
    engine/scene/wall-face-winding-shapes.test.ts,
    engine/scene/wall-paint-side.test.ts,
    e2e/tests/scene-sunlit-wall.spec.ts,
    engine/scene/near-wall-transparency.ts,
    core/scene/walk-collision.ts,
  ]
status: current
updated: 2026-11-15
---

# ADR-0139: Map plan north to world -Z so the 3D view is not a mirror of the plan

## Status

Accepted. The three-dimensional preview rendered as a left-right mirror of the
two-dimensional plan: a bay window drawn on the west side of the plan appeared on
the east side in the 3D view. The single axis map `planToWorld` is corrected and
the consistency follow-ons land with it.

## Context

The 3D preview builds every position through one axis map, `planToWorld`
(`core/scene/plan-to-world.ts`), introduced by the three-dimensional preview
foundation spec (section 2.1). It mapped a plan point `(x, y)` to world
`(x, height, y)`: plan `y` to world `+Z`.

The spec justified this with a premise: the plan frame is screen-style y-down. That
premise is wrong. `worldToScreen` in `editor/plan/viewport.ts` negates plan `y`
(`y: -point.y * scale`), so a larger plan `y` sits higher on screen, which is north.
That matches the `Point` type's documented y-increases-upward convention. The plan is
y-up, not y-down.

Mapping a y-up plan with plan `y` to `+Z` is a reflection, not a rotation. Looking
down at the resulting scene with north up, east and west swap, which is the mirror
the user saw. The inconsistency was already latent. `core/scene/camera-presets.ts`
had been written for the opposite sign, with plan-north as world `-Z`, so the camera
presets and the geometry disagreed about which way north is.

The builders had also been written around the false premise. Because a reflection
reverses the sense of a polygon loop, each cap builder reversed its winding to make
floor and ceiling faces still point the right way. That compensation only existed
to undo the reflection.

## Decision

`planToWorld` maps plan `y` to world `-Z`:

```ts
return { x: point.x, y: height, z: 0 - point.y }
```

This lays the y-up plan onto the y-up ground as a proper rotation, so the 3D scene
reads the same way as the plan and agrees with the camera-preset axis map (plan
north is world `-Z`). `0 - point.y` rather than `-point.y` keeps a floor-line point
(plan `y = 0`) at a clean world `+0`.

Because the map is now orientation-preserving, the loop sense no longer reverses, so
the winding compensation on the horizontal caps is removed (the vertical faces were
missed; see the 2026-11-15 amendment): the cap builders in `room-builder.ts`,
`junction-fill-builder.ts`, and `furniture-builder.ts` wind the top cap with the
natural triangulation and reverse the base instead, `wall-prism.ts` flips its
perimeter ternary, and the room ceiling reverses to keep its `-Y` normal. The shared
winding helper in `core/scene/winding.ts` reads the actual world normal, so it needs
no change.

Two quantities live in world space and never pass through the map, so they flip on
their own. A hinge swing is a rotation about world `+Y` by a fixed angle. Under the
corrected map the same angle reads as the opposite plan-space turn, so `openingMotion`
(`core/scene/opening-motion.ts`) negates the open angle to keep a leaf swinging
toward the side its facing names. The near-wall fade compares a wall's outward
normal to the camera, so that normal's Z component negates in
`near-wall-transparency.ts`.

## Spec reconciliation

The foundation spec section 2.1 stated the plan is y-down and that plan `y` maps to
world `+Z`, with an orientation-flipping winding rule following from it. That text is
corrected here: the plan is y-up, plan `y` maps to world `-Z`, the map is
orientation-preserving, and the winding convention follows from the proper map. This
ADR is the record of that spec correction.

## Consequences

- The 3D preview is no longer a mirror of the plan. A feature drawn on the plan west
  renders on the world west.
- The geometry and the camera presets now share one definition of north (world
  `-Z`), so the preset and doorway views frame the building from the named side.
- The committed Storybook visual baselines for any 3D story shift, because the
  rendered scene reorients. They regenerate on the runner that gates them.
- The four opening direction vectors that the first pass left mapping plan `y` to `+Z`
  now follow the corrected convention. They are `openingFrame`'s `along` and `normal` in
  `opening-reach.ts`, and the `horizontalHinge` axis and the `alongWallSlide` travel in
  `opening-motion.ts`. Each one negates its Z term the way `planToWorld` does, so an
  opening on a wall that is not axis-aligned (an awning or hopper crank, a sliding or
  pocket door) resolves on the right axis. A test for an angled-wall opening pins the Z
  term that the axis-aligned cases had left at zero.
- `plan-to-world.ts` now also exports `worldToPlan`, the ground-plane inverse of the
  corrected map. It drops the world height, carries world `x` straight to plan `x`, and
  negates world `Z` to recover plan `y`, so a 3D world point such as an orbit camera
  position can be tested against the 2D plan-space room polygons. It is the exact inverse
  of the plan-north = world `-Z` mapping this ADR records, which is why it lives beside
  the forward map.
- `walk-collision.ts` was missing from the original consequence sweep and kept mapping
  plan `y` to world `+Z`, so walk mode collided with a reflection of the building across
  world `z = 0` on any plan that sits away from the origin. The fix routes every
  conversion in that module through `planToWorld`, and a test now pins a far-from-origin
  wall to its rendered side.

## Amendment 2026-11-15: vertical wall faces were left inside out

The correction above rewound the horizontal caps only. The vertical faces of a wall
(the two long faces, the end caps of the prism path, and the reveals around
openings) kept the winding they had under the reflection. That winding had been right
only because the reflection flipped it, so after the map became a rotation every one
of those faces had a geometric normal pointing into the wall solid. The sentence above
that said the winding compensation was removed is corrected in place to say it applied
to the caps. Issue #491 found the rest.

### The rule

The corner order of every vertical quad gives a normal that points away from the wall
solid. A long face points away from the wall's centerline, an end cap points away
from the wall's midpoint along its length, and a reveal points toward the void that
it bounds. A hole loop runs opposite to the outline, so a reveal uses the same corner
order as the outer cap. The fix is in `faceQuad` in `wall-prism.ts`, and in the long
faces and the reveals in `wall-builder.ts`, where a reveal takes its corner order from
`outerCapPositions`. Nothing in `engine/` or `bridge/` compensated for the old order,
and stored documents need no migration.

### Why the first correction missed them

Shading hid the problem. The materials cull back faces, so a camera outside a wall
saw the polygon on the far plane of the wall, whose normal happened to point outward.
Vertex normals are computed from the winding, so they agreed with it, and the lit
result looked self-consistent. The only test of the wall faces asserted that the long
faces were horizontal and opposite to each other, which holds for either winding.

### Consequences of the old winding

- The shadow pass renders the back faces of a front-sided material into the shadow
  map. With inside-out walls, the back faces seen from the sun were the polygons on
  the sun-side plane of each wall. The far face of the same wall failed its depth
  test against that plane, one wall thickness away along the light, so every sunlit
  wall shadowed itself and no wall took direct sun in daylight. That distance is
  about 67 shadow texels at equinox noon, which is why no bias or normal offset
  moved it. This replaces the diagnosis recorded in ADR-0153.
- The face that a camera or a ray saw was the far face of the wall. Paint on wall side
  `right` showed on the opposite side in 3D, while the 2D plan was always correct.

### Gates

- A Node test (`wall-face-winding.test.ts`, `wall-face-winding-shapes.test.ts`)
  asserts the rule for plain walls, walls with two openings, a door that reaches the
  floor, curved heads, mitred corners, and junction fills.
- `wall-paint-side.test.ts` pins the paint side of a wall face by the ray that hits it.
- A scene gate, `e2e/tests/scene-sunlit-wall.spec.ts`, requires the sunlit south wall
  to be lighter than the east wall in the winter-afternoon harness state by at least
  0.043 in OKLab L. The measured gap was 0.0009 before the fix and 0.0884 after it.
- The ambient occlusion contrast gate moved to the window-light state, as recorded in
  [[ADR-0173-ambient-occlusion-normals-target]]. The finish contrast fixture now paints
  the room side of its walls.
- 14 macOS and 13 Linux scene baselines changed, each to the physically correct
  picture. The Linux images come from the baseline workflow, which passed every scene
  test and gate on its runner.

Schematic shadows stay off. Whether the schematic look should cast shadows is a
question for the default-look design, and this fix does not decide it.

## References

- Foundation spec, section 2.1 (the axis map this corrects).
- ADR-0001 (the six-layer architecture: the axis map stays in pure core; the engine
  reads it).
