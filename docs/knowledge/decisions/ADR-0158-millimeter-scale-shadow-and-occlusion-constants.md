---
slug: decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants
title: 'ADR-0158: Millimeter-scale calibration of the shadow bias pair and the occlusion radius'
type: decision
tags: [architecture, engine, rendering, lighting, shadows, ambient-occlusion, units, testing]
related:
  [
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces,
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0152-linux-scene-baseline-lane,
    decisions/ADR-0153-daylight-through-glass-role-stamp,
    decisions/ADR-0156-luminance-calibration-convention,
  ]
sourceFiles:
  [
    engine/lighting/lighting-rig.ts,
    engine/lighting/lighting-rig.test.ts,
    engine/postprocessing/ambient-occlusion-params.ts,
    engine/postprocessing/ambient-occlusion-params.test.ts,
  ]
status: current
updated: 2026-08-14
---

# ADR-0158: Millimeter-scale calibration of the shadow bias pair and the occlusion radius

## Status

Accepted. Answers the last-listed exit criterion of issue #491 analytically rather than against a
working shadow path, and repairs the occlusion radius that shipped with
[[ADR-0151-ambient-occlusion-render-pipeline]]. It does not fix the self-shadowing #491 reports;
see the consequences.

## Context

The world is millimeters, deliberately and against the design spec's own SI-meter wording
([[ADR-0027-units-module-targets-millimeter-storage]]). Three.js and its addons are written for
scenes at meter scale, and their example defaults carry that assumption silently, because a bare
`number` says nothing about what it measures. Two rendering constants were copied across that gap.

`AO_RADIUS` was the clear case: `0.25`, straight from the r184 `GTAONode` defaults, where it means
a quarter of a meter. Here it meant a quarter of a millimeter, and every horizon sample for a
fragment landed inside the same speck of surface.

The shadow bias was the murkier case, and it is worth stating what the investigation actually
found, because the obvious diagnosis was wrong. `shadow.bias` is not a world length at all. Three
adds it to the fragment's own depth in the normalized [0, 1] light-space range
(`ShadowNode.setupShadowCoord`), so it is unitless and the shipped `-0.0005` was not a meter value
stranded in a millimeter scene. What was missing was the knob that does carry world units:
`normalBias`, which offsets the shading point along its world normal before the lookup and was
left at zero. A constant depth bias is the one compensation that cannot follow a surface as it
tilts, so the rig had no slope compensation of any kind.

## Decision

### Both shadow constants are derived from the fitted shadow-map texel

The fitter is what makes this tractable. It sizes an orthographic shadow camera to the scene's
bounding sphere and stands the sun off at `SHADOW_DISTANCE_FACTOR` (3) radii, so the camera spans
`2 * radius` laterally and, since near lands at `2 * radius` and far at `4 * radius`, exactly
`2 * radius` in depth as well. Lateral extent and depth range come out equal, and the constants
below rest on that.

One texel therefore covers the same world length across the map and through it. The length scale
both constants derive from is that texel's diagonal, named `TEXEL_DIAGONAL_FRACTION`: the depth a
fragment is compared against belongs to a surface point roughly a diagonal away in the light's
image plane, the texel's own quantization plus the PCFSoft neighborhood the renderer samples
([[ADR-0142-color-managed-renderer]] pins the filter). Apportioning the diagonal between those two
is an estimate, so treat it as the right scale rather than an exact budget.

- `SHADOW_BIAS` is that diagonal expressed in normalized depth, `-Math.SQRT2 / SHADOW_MAP_SIZE`,
  about `-0.00069`. Because the depth range equals the lateral extent, this number is correct at
  every scene size, and no scene dimension appears in it.
- `normalBias` is the same diagonal in world millimeters, so the fitter sets it where the radius
  is known. At the shell the harness renders it works out near 4 mm.

What the pair buys is a coverage angle rather than blanket coverage. The
shadow map quantizes position in the light's image plane, the plane perpendicular to the light,
not along the receiving surface. Displace by `s` in that plane and the surface point you land on
sits `s * tan(theta)` further away in depth, where theta is the angle between the surface normal
and the light. Tangent, not sine: the sine form would measure the separation along the surface,
which is only the same thing at theta = 0. Since tangent is unbounded, no finite pair of constants
covers every orientation, so what the constants have to state is how steep a surface they reach.

The condition is `normalBias * cos(theta) + worldBias >= diagonal * tan(theta)`. Both halves being
one diagonal, it reduces to `cos(theta) + 1 >= tan(theta)`, whose root is about 57.1 degrees. The
depth bias on its own reaches wherever `tan(theta) <= 1`, which is exactly 45 degrees. So the
normal offset is worth roughly twelve degrees of additional slope, and that gain is the whole
argument for carrying it. Under the discarded sine model a full-diagonal constant bias would have
dominated at every angle, which would have left `normalBias` with nothing to do.

The same arithmetic prices the old constant. `-0.0005` bought about 1.02 texels of depth, which is
0.72 diagonals, with no normal offset at all, so it held only to about 35.9 degrees.

Two consequences are worth recording. Peter-panning is bounded by `normalBias + worldBias`, two
diagonals, near 8 mm at the harness fit, and that bound assumes the worst orientation, so the
typical detachment is smaller. And `normalBias` stays zero until a fit runs, which is harmless
today because the schematic rig does not cast ([[ADR-0153-daylight-through-glass-role-stamp]]) and
the solar rig refits on every update.

### The occlusion radius converts rather than retunes

Reading the r184 addon settles which uniforms are lengths. `radius` scales a unit view-space
direction into each sample offset, and `thickness` is compared against a view-space depth delta to
separate a nearby occluder from unrelated geometry behind it. Those two are view-space lengths.
The other four are unitless: an exponent on the occlusion term, an exponent shaping the march, a
falloff mix factor, and a sample count.

So the fix converts the two and leaves the four alone. `radius` becomes 250 mm and `thickness`
1000 mm, through `metersToMillimeters` so the conversion is executable rather than asserted. The
tuning relationship the addon shipped survives intact, and a quarter meter also sits at the low end
of the quarter-to-half-meter gather that interior rooms are conventionally occluded over. A test
pins the band, and a second pins `thickness >= radius`, since samples reach a full radius away and
a thinner acceptance window would reject the far half of its own samples.

The mis-scaled radius turned out not to be inert. Captured frames of the harness occlusion state
at 0.25 mm show a dense cross-hatch over the roof and banding across the ground plane, degenerate
output from samples that all land on one speck. At 250 mm the cross-hatch is gone and the wall-floor
junctions darken as intended. Between the two, 43 percent of pixels move by more than one part in
128, and most of them get brighter, because the artifact was darkening them.

### New screen-space and shadow constants state their units

The convention this ADR sets: any constant handed to a shader or a shadow, whose meaning depends on
scale, states its unit where it is declared, and states it as a unit rather than a vague "world
space". Normalized, unitless, and millimeter quantities each say so. `AmbientOcclusionParams` now
carries that per field, which is what the `number` type cannot. Where a constant is copied from an
upstream default authored at meter scale, it converts through `core/units` at the point of
declaration, so the conversion is visible and testable instead of folded into a literal.

## Consequences

- The shadow constants now have a derivation and a stated reach, about 57 degrees of slope, and
  they move together through one `calibrateShadowBias` seam because both name the same diagonal.
- No committed baseline moves. The full scene-webgl suite passes on darwin, all 27 tests, with no
  snapshot refreshed. The shadow change is a fraction of a texel of depth plus a 4 mm normal
  offset, and the occlusion change, though large in the frame, stays inside the scene tier's 0.35
  per-pixel threshold.
- That last point is itself a finding: the scene baselines do not gate ambient-occlusion tuning.
  A tenfold radius change also passes. Whatever tightens that belongs with the color-accuracy work
  ([[ADR-0156-luminance-calibration-convention]]), not with a tolerance edit here.
- The linux family ([[ADR-0152-linux-scene-baseline-lane]]) was not re-rendered in this lane. The
  darwin result predicts it passes, and CI will say so.
- This does not explain or fix the self-shadowing issue #491 reports, and nothing here should be
  read as a cure for it. That issue's own experiments rule out the mechanism these constants
  address: the symptom renders identically at bias `-0.0005`, `+0.0005`, and `0`, and is unchanged
  by `normalBias` at 4 mm and at 30 mm, while a caster bisection showed the walls' own depth
  renders are what darken them. A defect that survives every bias knob is not texel-scale acne.
  What this change does deliver is the last-listed exit criterion, constants that are derived
  rather than guessed, so that whenever schematic casting is restored it returns to a defensible
  calibration. The self-shadowing itself stays open and unexplained.
- `SHADOW_BIAS` holds for the current fitter. A change to `SHADOW_DISTANCE_FACTOR` or to the
  symmetric fit breaks the equality between depth range and lateral extent, and the constant would
  have to be re-derived rather than nudged.

## References

- Issue #491 (schematic self-shadowing, and the recorded experiments that rule out texel-scale
  acne as its mechanism).
- [[ADR-0027-units-module-targets-millimeter-storage]] (millimeters are the canonical unit).
- [[ADR-0151-ambient-occlusion-render-pipeline]] (the GTAO pass whose radius this recalibrates).
- [[ADR-0153-daylight-through-glass-role-stamp]] (shadow casting as a provider policy).
- [[ADR-0142-color-managed-renderer]] (PCFSoft shadow filtering, output color space).
- [[ADR-0152-linux-scene-baseline-lane]] (the second baseline family CI renders).
- [[ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces]] (the sibling practice of
  deriving a depth constant from an ordering rather than picking one).
- `engine/lighting/lighting-rig.ts` (`TEXEL_DIAGONAL_FRACTION`, `SHADOW_BIAS`,
  `shadowTexelDiagonalMm`, `calibrateShadowBias`), `engine/lighting/lighting-rig.test.ts` (the
  coverage-limit assertions).
- `engine/postprocessing/ambient-occlusion-params.ts` (the converted view-space lengths),
  `node_modules/three/examples/jsm/tsl/display/GTAONode.js` (the r184 uniform semantics).
