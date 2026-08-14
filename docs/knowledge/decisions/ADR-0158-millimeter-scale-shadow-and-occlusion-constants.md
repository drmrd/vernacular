---
slug: decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants
title: 'ADR-0158: Millimeter-scale calibration of the shadow bias pair and the occlusion radius'
type: decision
tags: [architecture, engine, rendering, lighting, shadows, ambient-occlusion, units, testing]
related:
  [
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0133-ordered-depth-bias-ladder-for-stacked-coincident-surfaces,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
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

Accepted. Answers the last exit criterion of issue #491, which asked for the depth bias constants
to be re-derived against a working shadow path, and repairs the occlusion radius that shipped with
[[ADR-0151-ambient-occlusion-render-pipeline]].

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
tilts, so steep faces had nothing holding them off their own shadow.

## Decision

### Both shadow constants are derived from the fitted shadow-map texel

The fitter is what makes this tractable. It sizes an orthographic shadow camera to the scene's
bounding sphere and stands the sun off at `SHADOW_DISTANCE_FACTOR` (3) radii, so the camera spans
`2 * radius` laterally and, since near lands at `2 * radius` and far at `4 * radius`, exactly
`2 * radius` in depth as well. Lateral extent and depth range come out equal, and the constants
below rest on that.

One texel therefore covers the same world length across the map and through it. The length scale
both constants derive from is that texel's diagonal, named `TEXEL_DIAGONAL_FRACTION`, because the
depth a fragment is compared against belongs to a surface point up to one diagonal away: half a
texel from the map's own quantization and the rest from the PCFSoft neighborhood the renderer
samples ([[ADR-0142-color-managed-renderer]] pins the shadow filter).

- `SHADOW_BIAS` is that diagonal expressed in normalized depth, `-Math.SQRT2 / SHADOW_MAP_SIZE`,
  about `-0.00069`. Because the depth range equals the lateral extent, this number is correct at
  every scene size, and no scene dimension appears in it.
- `normalBias` is the same diagonal in world millimeters, so the fitter sets it where the radius
  is known. At the shell the harness renders it works out near 4 mm.

The pair covers every surface orientation, and the argument is short enough to state here. At angle
theta between the surface normal and the light, a lateral separation of one diagonal is worth
`diagonal * sin(theta)` of depth error. The normal offset buys back `diagonal * cos(theta)` and
the constant bias buys back a further full diagonal, and `cos(theta) + 1 >= sin(theta)` holds
across the whole range, with room to spare everywhere except grazing incidence. A unit test walks
91 angles and asserts exactly that inequality against values read off the fitted light.

The same arithmetic explains the old constant. `-0.0005` bought about 1.02 texels of depth, which
is 0.72 diagonals, with no normal offset at all, so the inequality failed once `sin(theta)` passed
0.72, or beyond roughly 46 degrees. Steep faces acne, shallow ones do not, which is the symptom
issue #491 reported. The failing test written before the fix broke at 46.4 degrees.

Two consequences of the derivation are worth recording. Peter-panning is bounded at `2 * diagonal`,
about 8 mm at the harness fit, small against any wall assembly in the registry. And `normalBias`
stays zero until a fit runs, which is harmless today because the schematic rig does not cast
([[ADR-0153-daylight-through-glass-role-stamp]]) and the solar rig refits on every update.

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

- Shadowed faces at any angle now have a derivation behind them, and the two constants move
  together because both name the same texel diagonal.
- No committed baseline moves. The full scene-webgl suite passes on darwin, all 27 tests, with no
  snapshot refreshed. The shadow change is a fraction of a texel of depth plus a 4 mm normal
  offset, and the occlusion change, though large in the frame, stays inside the scene tier's 0.35
  per-pixel threshold.
- That last point is itself a finding: the scene baselines do not gate ambient-occlusion tuning.
  A tenfold radius change also passes. Whatever tightens that belongs with the color-accuracy work
  ([[ADR-0156-luminance-calibration-convention]]), not with a tolerance edit here.
- The linux family ([[ADR-0152-linux-scene-baseline-lane]]) was not re-rendered in this lane. The
  darwin result predicts it passes, and CI will say so.
- Issue #491's remaining exit criteria are untouched. Restoring schematic shadow casting still
  waits on the r184 node-renderer behavior ADR-0153 describes; this change only ensures that when
  casting returns, the constants it returns to are defensible.
- `SHADOW_BIAS` holds for the current fitter. A change to `SHADOW_DISTANCE_FACTOR` or to the
  symmetric fit breaks the equality between depth range and lateral extent, and the constant would
  have to be re-derived rather than nudged.
