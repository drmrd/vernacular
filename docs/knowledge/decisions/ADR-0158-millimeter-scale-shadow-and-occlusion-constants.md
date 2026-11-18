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
    decisions/ADR-0139-plan-to-world-orientation,
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
  ]
sourceFiles:
  [
    engine/lighting/lighting-rig.ts,
    engine/lighting/lighting-rig.test.ts,
    core/environment/environment-lighting.ts,
    core/environment/environment-lighting-fallback.test.ts,
    core/environment/daylight-site.ts,
    core/environment/daylight-site-location-not-finite.test.ts,
    engine/postprocessing/ambient-occlusion-params.ts,
    engine/postprocessing/ambient-occlusion-params.test.ts,
    core/environment/shadow-fit.ts,
    core/environment/shadow-fit.test.ts,
    engine/lighting/solar-lighting-provider.ts,
    bridge/react/scene-lighting.tsx,
    engine/scene/ground-plane.ts,
    tests/performance/shadow-fit-reach.test.ts,
    e2e/tests/scene-shadow-reach.spec.ts,
  ]
status: current
updated: 2026-11-17
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
  calibration. The self-shadowing was unexplained when this record was written; the
  amendment in [[ADR-0139-plan-to-world-orientation]] (2026-11-15) traced it to the
  inside-out vertical wall faces.
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

## Amendment 2026-11-15: the fit covers the receivers

The solar provider used to fit the sun's shadow camera to the bounding sphere of the casters
alone. The ground plane is not a caster, so a shadow that left the building's footprint fell
outside the camera. With a low sun the shadow on the lawn was cut off a short way from the
building, and the rest of the lawn read as sunlit.

The fit now covers the shadow as well. `shadowFitBounds` in `core/environment/shadow-fit.ts`
computes the box the camera is fitted to:

1. Each corner of the caster box that lies above the ground plane is projected along the sun ray
   onto the plane. Corners at or below the plane cast nothing and are skipped.
2. Each projected point is clamped to the ground rectangle, on each horizontal axis.
3. The fit box is the box of the casters and those points.

A sun at or below the horizon is treated as a sun of height 1e-6, so the fit is continuous through
the horizon. With no ground plane in the scene, the fit is the caster box. `boundsRadius`, half the
diagonal of a box, gives the radius the camera is fitted to, so the camera is still a sphere
around the box and the geometry of the pair above is unchanged.

The fit is capped. When the radius of the fit box exceeds the cap, the box shrinks linearly toward
the caster box until its radius equals the cap. The far end of the shadow gives way first, and the
casters are never cut: when their own radius is at or above the cap, the fit is the casters alone.

The cap is written as a texel size, `MAX_SHADOW_TEXEL_MM`, and is 15.5 mm. The provider turns it
into a radius as `MAX_SHADOW_TEXEL_MM * SHADOW_MAP_SIZE / 2`, which is 15872 mm for the 2048-texel
map. The value was measured on the reference project at the winter-afternoon sun, direction
(-0.7980, 0.0911, 0.5957). The uncapped fit of its casters and lawn needs a texel of 15.41 mm, and
the casters alone need 12.39 mm. The cap is 15.41 mm rounded up to the next half millimeter. The
plan in `docs/plans/2026-11-15-daylight-and-shadow.md` set 20 mm as the texel size above which the
cap needed the project owner's decision, and the measured value is under it. The comment beside
the constant records the reference bounds and the date.

The bias pair follows the fit and adds no constant. `normalBias` is still one texel diagonal in
millimeters, so it scales with the fitted radius as `(sqrt(2) / SHADOW_MAP_SIZE) * 2 * radius`. The
depth `bias` is unchanged at `-sqrt(2) / SHADOW_MAP_SIZE`, because the camera still spans the same
distance in depth as it does across the map. That camera spans twice the fitted radius in depth,
so the size of the depth `bias` in world units, `(sqrt(2) / SHADOW_MAP_SIZE) * 2 * radius`, grows
with the fit exactly as `normalBias` does. Both offsets, measured in world units, scale with the
fitted radius. At the cap radius of 15872 mm each is about 21.9 mm, and the cap bounds both.

The fit runs when the lighting is updated: a change of the site, the observed time, the cloud
cover, the color check, or the caster bounds. It does not run on each frame.

Three things guard it:

- The unit tests of `shadowFitBounds` in `core/environment/shadow-fit.test.ts`, which cover the
  projection, the clamp to the ground, the horizon, and the cap.
- `tests/performance/shadow-fit-reach.test.ts`, which measures the cap on the reference project
  and fails if a change to that project moves the texel size it needs.
- `e2e/tests/scene-shadow-reach.spec.ts`, a pixel gate in the winter-afternoon scene. It reads the
  OKLab lightness of two 24 px squares of the lawn, one in the sun and one far east of the east
  wall where the shadow now lands, and requires the sunlit square to be lighter by at least
  `SHADOW_REACH_MIN_GAP`, 0.007. The readings were 0.3614 and 0.3490 with the fit over the
  receivers, a gap of 0.0124, and 0.3614 and 0.3606 with the casters alone, a gap of 0.0008.

Known limits:

- Schematic mode still fits the casters alone, through `fitSunShadowToBounds`.
- An edit that changes only the grade does not refit until the next lighting change, because the
  update depends on the caster bounds and not on the ground.
- The sphere around a long low box wastes shadow-map area. A fit in light space would be tighter.

## Amendment 2026-11-17: input that is not finite

Issue #758 reported that `shadowFitBounds` did not check its numbers. A `NaN` in the sun direction
or in the cap gave a box of six `NaN` values. An infinite component of the direction mostly gave a
finite box that meant nothing. The rule in `core/environment/shadow-fit.ts` is now:

- A sun direction with any component that is not finite (`NaN`, `Infinity`, `-Infinity`) gives a
  copy of the caster box.
- A cap (`maxRadius`) of `NaN` gives a copy of the caster box.
- A ground box with any of its six numbers not finite counts as no ground, so the fit is a copy of
  the caster box.
- A cap of `Infinity` means no cap. A cap of `-Infinity` gives the casters, as each cap below the
  radius of the casters does.
- The function never throws. A copy is a new object, never the caster box that was passed in.

One private type predicate, `hasUsableShadow`, states the four fallback cases: no ground, a ground
box that is not finite, a direction that is not finite, and a cap of `NaN`. When it fails,
`shadowFitBounds` returns a copy of the casters.

The ground case came last. The first two cycles of the fix covered the direction and the cap. A
review then ran the function with ground boxes that were not finite (one with a `NaN` number, one
at a height of `-Infinity` under a sun straight overhead) and got six `NaN` values for finite
casters. A third cycle closed that gap. In the application the ground box comes from
`groundExtent` in `engine/scene/ground-plane.ts`, which the solar provider calls. It reads the
plane's box with `Box3.setFromObject`, and the application builds the plane from a
`PlaneGeometry` sized from the scene's own box plus a margin. Whether that path can give a box
that is not finite today was not examined: the grade height and a plane with empty geometry are
the open cases.

The fit falls back instead of throwing a `RangeError` because of where it runs. Its one caller is
`update` in `engine/lighting/solar-lighting-provider.ts`, which has no catch, and `update` runs in
a layout effect in `bridge/react/scene-lighting.tsx`. No error boundary stands above it: a search
of `app/`, `bridge/`, `editor/`, `engine/` and `src/` finds none, and `src/main.tsx` calls
`createRoot` with no error options. A throw is therefore expected to take the whole application
down. That expectation is a reading of how the libraries treat an uncaught error. It was not run.

The daylight field makes the same split ([[ADR-0196-plan-space-daylight-field]]). It throws only
for document values that a person can find and fix, such as a ceiling height, and its message
names the room. Its sky input for each instant does not throw: a sky that gives `NaN` still yields
finite visibilities. The direction of the sun is an input of that second kind.

Alternatives considered:

- A `RangeError` from the fit, with a catch in the provider that skips the refit. That is two
  changes for the same visible result.
- Each cap that is not finite gives the casters. The rule is shorter, but it removes the natural
  way to say "no cap", which is `Infinity`.

No shipped path gives a direction that is not finite today. The direction comes from the site and
the observed time through `solarPosition` and `sunWorldDirection`, and a `NaN` in either passes
through. These guards stop it:

- Both schema validators under `core/format/generated/` require latitude and longitude to be
  finite numbers.
- `usableNorthBearing` in `core/environment/daylight-site.ts` treats a bearing that is not finite
  as missing.
- The site editor (`editor/metadata/site-editor.tsx`) dispatches a location only when neither
  coordinate reads as `NaN`.
- The observation date and time input (`editor/environment/environment-panel.tsx`) ignores a value
  that does not have the `YYYY-MM-DDThh:mm` shape.

The handler of `setSiteLocation` (`core/commands/handlers/site-commands.ts`) checks nothing, so a
future caller could still store a coordinate that is not finite.

The cost is that a programming error that makes the cap `NaN` now gives a shorter shadow, the
casters alone, with no error. The test "covers the shell and its shadow on the ground, reaching past
the shell alone" in `engine/lighting/solar-lighting-provider.test.ts` catches that in the provider:
it requires the fitted radius to exceed half the diagonal of the casters, and a fit of the casters
alone equals it.

Known limit when this amendment was written: the fit was finite for a direction that is not
finite, but the engine still aimed the sun with the raw direction. `fitSunShadowToDirection` in
`engine/lighting/lighting-rig.ts` normalized it and placed the sun along it, so the sun and its
shadow were wrong. The guard for #828 is in the next amendment.

A caster box that is not finite is not covered. The acceptance condition of the issue assumes a
finite one. With such a box the result is not finite either, because the fallback is a copy of
that box.

Finite input of extreme size still gives six `NaN` values. `shrinkFraction` squares lengths, and
from lengths near 1e154 mm those squares overflow. A second review found this with casters 1e150
mm high, a ground of plus and minus 1e155 mm, a cap of 1e154 mm and the sun on the horizon, and a
rerun of that one case gave the same result. The review's run of 1,620 combinations (each kind of
ground box that is not finite, with 6 sun directions and 10 caps) found no other case. No guard
was added, because no plan comes near that size.

The describe block "shadowFitBounds with input that is not finite" in
`core/environment/shadow-fit.test.ts` guards the rule. It covers five directions and the copy.
Its nested block "with a cap on the radius that is not a finite number" covers the three caps. A
second nested block, "with a ground box that has a number that is not finite", has four rows. The
rows for a `NaN` number and for a height of `-Infinity` failed before the fix. The row for an empty
box, a `min` of `Infinity` and a `max` of `-Infinity`, passed before it and stays as a guard. A run
of the test commit before the fix showed these three outcomes: 33 tests, 2 failed. The reason for
the empty box was read from the code and not run: no corner of the casters lies above a ground at
`Infinity`. The fourth row, a `max.x` of `Infinity`, came later and pins that any of the six numbers
counts.

`pnpm exec vitest run core/environment/shadow-fit.test.ts --project unit` passed 34 tests. The
other two test files of the fit passed as well: `engine/lighting/solar-lighting-provider.test.ts`
with 16 tests and `tests/performance/shadow-fit-reach.test.ts` with 5.

## Amendment 2026-11-17: the lighting and the aim for input that is not finite

The amendment above made the shadow fit total. Issue #828 asked the same of the sun's aim. The aim
turned out to be the second place to guard. The first is the function that computes the light.
Neither `computeEnvironmentLighting` nor `fitSunShadowToDirection` throws now.

`computeEnvironmentLighting` in `core/environment/environment-lighting.ts` falls back field by
field, and every number it returns is finite:

- When the solar angles for the site and instant are not finite, the sun is the daylight reference
  sun: the sun at the place, the instant, and the UTC offset of `referenceLightingInput()` in
  `core/environment/daylight-reference.ts`. The north bearing and the cloud cover of the input
  still apply to it. The angles are not finite for a coordinate, an offset, or a minute that is not
  finite, for a latitude too large for the formulas, and for a date whose text gives no number,
  such as `not a date`. A malformed date that still gives numbers keeps a finite sun of its own:
  an empty date and a month of 13 are two that a probe found.
- A north bearing that is not finite counts as 0.
- A cloud cover of `NaN` counts as `DEFAULT_CLOUD_COVER`. Any other cloud cover is clamped into
  0..1 by `clampToUnitInterval`. The `cloudCover` of the result is the value used, so the visible
  sky reads the same number the tints were computed with.

A cloud cover in 0..1 gives the same numbers as before. The clamp returns its input there, apart
from turning -0 into +0. The test rows for 0, 0.25, and 1 compare the result with the composition
of the piece functions by exact equality.

The fallback sun is the calibration light, and it is not an opening instant. The architecture test
`tests/architecture/opening-instant-seam.test.ts` lets only three owner files name the reference
instant constant ([[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]), and
`environment-lighting.ts` is not one of them. It reads the reference through
`referenceLightingInput()`, which an owner file defines, so the seam holds.

`fitSunShadowToDirection` in `engine/lighting/lighting-rig.ts` aims the sun along `SUN_DIRECTION`,
as `fitSunShadowToBounds` does, when the direction does not normalize to a finite, nonzero vector.
That covers a component that is not finite and a zero vector. It covers a finite vector too long
to normalize as well. For a length of 1e200 the length overflows to infinity, the vector normalizes
to zero, and the check for a zero length catches it. That chain was read from the code, and a test
row for 1e200 runs the case.

### Why both places

One function feeds every engine reader of the light. The solar provider reads its sun direction
for the shadow fit and the aim, its colors and sun level for the rig, and its sun direction, cloud
cover, and sky ambient for the visible sky and its environment map. A total
`computeEnvironmentLighting` makes all of them finite at once, and `core/` stays the authority for
the light. A guard in each engine reader would repeat one rule in several places.

The aim is guarded as well because `fitSunShadowToDirection` is an exported engine function and
should be total, as `shadowFitBounds` is. With the source guarded, only a programming error
reaches that guard.

The fallbacks follow the reasons the amendment above gives for the fit. The one caller runs in a
layout effect with no error boundary, and these are inputs for one instant, not document values a
person can find from a message.

### Why the reference sun

The issue's example was a sun at the zenith. The reference place and instant are already the
project's stand-in: a project with no location gets the reference place as its sample place, and
every session opens at the reference instant through `openingInstant`. So the fallback is the sun
a fresh project shows, a calibrated daytime sun. A zenith sun would be a third convention, and it
casts no shadow a person can see. A night sun, with a sun level of 0, would look like a real night
and hide the fault.

A bearing that is not finite counts as 0 because `daylightSiteFor` already uses 0 for a located
site with such a bearing. The fallback is per field, so the person's own place and time stay in
force when only the bearing or the cloud cover is bad.

### Why the default aim

The issue's second option was to keep the last good direction. The default aim needs no state:
one frame never depends on an earlier one, the harness and the tests stay reproducible, and the
rig needs no new field. With the source guarded, continuity during a scrub buys nothing.

### A correction to the amendment above

The amendment above says that no shipped path gives a direction that is not finite. That was
wrong. A saved environment scene stores `observedAt` as a string, and the schema asks only for a
string. `applyEnvironmentScene` in `core/environment/environment-state.ts` parses it with
`parseObservationInstant`, which gives a minute of `NaN` for a time that does not parse as
numbers. The solar angles for that minute are not finite, and before this change the direction
was not finite either. Finite inputs of extreme size give angles that are not finite too: the test
row for a latitude of 1e308 is one. The path through a saved scene was read from the code. The rows
for a minute of `NaN` and for the date `not a date` run the lighting side of it. Both inputs now
get the reference sun.

The known limit of the amendment above, that the engine aimed the sun with the raw direction, no
longer holds. The default aim takes its place.

### The handlers are left to the command layer

The handlers of `setSiteLocation` and `setSiteNorthBearing` in
`core/commands/handlers/site-commands.ts` still store any number. Their refusal belongs to the
command layer (#686). Handlers on `main` use two patterns today. One is a silent no-op, as in
`reorderFloorHandler`: `dispatch` still records an empty undo step, and the caller learns nothing.
The other is a throw, which the dispatcher rolls back and rethrows. Typed rejections are meant to
replace both, and the command layer edits every handler, so a change to these two now would
collide with that work. The light no longer depends on them. The rules above and the location
rule of [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]] keep the sun finite for
any stored value.

What is left is the reload. JSON writes `NaN` as `null`, and the schema validators reject `null`
for a latitude, so a project that stored a coordinate of `NaN` is expected to fail to reopen.
Whether the save path validates first was not checked. #852 tracks the handlers.

### Limits

- A saved scene with a malformed date and time still applies an instant that is not a number to
  the session state. Only the sun is safe. #853 tracks it.
- The fallback is silent. Nothing tells the person that the lighting uses a stand-in, apart from
  the sample notice that the location rule brings. #854 tracks a notice.
- A finite location out of range, such as a latitude of 200, passes to `solarPosition` as it is.
  The sun it gives was not examined. Range checks belong to the command layer.
- A finite latitude too large for the formulas, such as 1e308, is a real location to the location
  rule. The number input of the site editor guards only against `NaN`, so a person can store it.
  Such a site gets the reference sun at the reference instant whatever time the person chooses,
  and the panel shows no sample notice. The range check that removes this belongs to #852.
- The engine does not guard the sky's uniforms or its environment map itself. Their one producer,
  `computeEnvironmentLighting`, is now total.

### Tests

`pnpm exec vitest run <file> --project unit` passed each of these files on 2026-11-17:

- `core/environment/environment-lighting-fallback.test.ts`, 25 tests. Eight inputs whose solar
  angles are not finite must give the reference sun under the input's bearing and cloud cover.
  Three bearings that are not finite must count as 0, and a finite bearing of 1e308 is kept. Five
  cloud covers that cannot be used must be clamped or defaulted, and 0, 0.25, and 1 are kept. Five
  valid inputs must keep the composition of the piece functions exactly.
- `engine/lighting/lighting-rig.test.ts`, 23 tests. Its last describe block,
  "fitSunShadowToDirection with a direction that cannot be used", has six rows that must aim, fit,
  and bias the sun as `fitSunShadowToBounds` does: a `NaN` in x and in y, an infinite z, a
  negative infinite x, the zero vector, and a length of 1e200. One more test checks that a valid
  direction of length 5 is normalized and not replaced.
- `core/environment/daylight-site-location-not-finite.test.ts`, 11 tests, for the location rule of
  [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]].
- `tests/architecture/opening-instant-seam.test.ts`, 2 tests.
