---
slug: decisions/ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point
title: 'ADR-0192: Daylight is calibrated from three targets with a fixed white point'
type: decision
tags:
  [
    architecture,
    core,
    engine,
    lighting,
    environment,
    sky,
    color-management,
    calibration,
    daylight,
    3d-preview,
  ]
related:
  [
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0161-sky-specular-environment-map,
    decisions/ADR-0157-color-accuracy-gate,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
    decisions/ADR-0196-plan-space-daylight-field,
  ]
sourceFiles:
  [
    core/environment/daylight-calibration.ts,
    core/environment/daylight-calibration.test.ts,
    core/environment/daylight-reference.ts,
    core/environment/tone-response.ts,
    core/environment/light-model.ts,
    core/environment/sky-dome.ts,
    core/environment/ground-surface.ts,
    core/environment/sky-model.ts,
    core/environment/spherical-harmonics.ts,
    core/environment/environment-lighting.ts,
    core/environment/color-check.ts,
    core/color/linear-rgb.ts,
    engine/lighting/sky-environment.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/solar-lighting-provider.ts,
    engine/lighting/basic-lighting-provider.ts,
    engine/scene/ground-plane.ts,
    docs/specs/2026-11-15-daylight-and-shadow.md,
    docs/plans/2026-11-15-daylight-and-shadow.md,
  ]
status: current
updated: 2026-11-16
---

# ADR-0192: Daylight is calibrated from three targets with a fixed white point

## Status

Current. Lands with the calibration change of the daylight and shadow work, which follows sections
6.2 and 6.3 of `docs/specs/2026-11-15-daylight-and-shadow.md` and the list of decisions in
`docs/plans/2026-11-15-daylight-and-shadow.md`. It amends
[[ADR-0156-luminance-calibration-convention]], [[ADR-0148-visible-sky-and-sh-light-probe]], and
[[ADR-0161-sky-specular-environment-map]], and each of those carries an amendment dated
2026-11-16.

## Context

Daylight used to have no stated meaning. The sun was the engine's `DAYLIGHT_SUN_INTENSITY`, 1.6,
times a 0 to 1 fade from core called `sunIntensity`. The dome's tints were picked by hand in
`core/environment/sky-dome.ts`, its ground was a fixed brown of `(0.12, 0.1, 0.08)`, and nothing
tied the sun to the sky or either of them to the tone curve. At the reference instant described
below, a white wall facing the sun came out light grey: the light model in
`core/environment/light-model.ts` predicted code 161.34 for it, and the render read 162.67
(measured 2026-11-16). Spec section 6.9 uses the near-white visible sky of the render before the
change as its defect probe for the sky gate.

The spec asked for one module that states what daylight should look like and derives the constants
from that statement, so a later change edits a target and not a pile of tints.

## Decision

### Three targets at one reference instant

`core/environment/daylight-calibration.ts` states three targets and derives the sun and the dome
from them. They hold at the reference in `core/environment/daylight-reference.ts`: latitude 40,
longitude 1.86 east, UTC, 2026-03-20 at 10:30, clear sky, north up. The longitude cancels the
equation of time on that date, so 10:30 on the clock is 10:30 solar time. The sun is 44.9877
degrees up there. The module computes that height with `solarPosition` and does not round it to 45.

1. The ratio of direct to diffuse light on a level card is
   `directToDiffuseRatio(h) = 1 + 4 * max(0, sin h) / sin(45 degrees)`. That is 5 to 1 at 45
   degrees and exactly 1 to 1 at the horizon and below. At the reference sun it is 4.99914.
2. The white point is the color of sun plus sky on a level white card at the reference instant.
   Every daylight color (the sun, the dome, and the visible sky) is divided by it before it reaches
   the engine.
3. The sunlit white level. At the reference instant a matte wall of reflectance 0.85 facing +z
   (south, with north up) returns the linear level that AgX at exposure 1 shows as code 225,
   `WHITE_CODE_FLOOR`. The sun's cosine on that wall is 0.5948.

Every quantity on the level card is irradiance over pi, so a white card returns it as radiance.

### The derived values

| Value                                   | Where it lives                          | Value at the reference             |
| --------------------------------------- | --------------------------------------- | ---------------------------------- |
| Sunlit white level                      | `DAYLIGHT_CALIBRATION.sunlitWhiteLevel` | 2.099829                           |
| Sun scale, full sun overhead, clear sky | `DAYLIGHT_CALIBRATION.sunScale`         | 12.3599                            |
| White point, at luminance 1             | `DAYLIGHT_CALIBRATION.whitePoint`       | r 1.069166, g 0.980015, b 0.994307 |
| Sun level                               | `sunLevelAt(h, cloudCover)`             | 10.0056                            |
| Diffuse level on the level card         | `diffuseLevelAt(h, cloudCover)`         | 0.45039                            |
| Gain of the dome's term toward the sun  | `SUNWARD_GAIN`                          | 0.70695                            |
| Lux for one unit of irradiance          | `LUX_PER_UNIT_IRRADIANCE`               | 9424.58                            |

The sunlit white level is `agxNeutralInverse(225 / 255)`, from the tone curve in
`core/environment/tone-response.ts`.

The sun scale is a frozen literal. The reference wall's luminance is linear in the scale, so it was
solved once: at a scale of 1, with the night floor described below set aside (the reference sky
clears it), the wall returned 0.169890, and 2.099829 / 0.169890 is 12.3599. An independent solve
during review got 12.3599048. The tests in `core/environment/daylight-calibration.test.ts` read the
wall back through the light model and the tone curve and require code 225 within half a code, so a
stale literal fails there. The wall reads 225.00.

The dome follows from the sun through target 1. The sky's level on the card is the clear direct
level on the card divided by the ratio, and the dome's end tints are scaled so that the
cosine-weighted mean of the upper dome has that luminance. The dome is linear in the view height,
so that mean is its value at a height of 2/3.

The white point is not solved in closed form. The sun's share of the card depends on the
luminances of the white-balanced tints, and those depend on the white point. The module finds it as
a fixed point by iteration (50 steps) when it loads, then scales it to luminance 1.

Three checks are not targets, and the tests assert each. A white wall square to the sun at the
reference instant reads code 234.47, below clipping, so it still differs from pure white. The sky
alone on the card is blue, with an OKLab chroma of 0.0834 inside the test's band of 0.02 to 0.10.
With the sun at 20 degrees and at 10 degrees the light on the card is warm.

### The raw tints are inputs

The sun's horizon and zenith tints and the dome's horizon and zenith tints keep their old values.
They moved into `daylight-calibration.ts` as raw inputs. The three targets fix two scales and a
white point, and none of them fixes a hue, so the hues still have to come from somewhere. Each tint
is divided by the white point on its way out and flattened toward grey under cloud. The sun's color
leaves at luminance 1, so all of its strength lives in its level. The hemisphere fill tints in
`core/environment/sky-model.ts` remain for the fill alone, and daylight zeroes that fill.

### The sun level moves into core

`EnvironmentLighting.sunIntensity`, a fraction, is now `sunLevel`, the light's actual intensity:
`sunLevelAt(h, cloudCover)` is the sun scale times the old fade with height times the old cloud
transmission. The fade (0.35 of full on the horizon, rising with `sin h`, gone 0.1 radians below)
and the cloud curve (exponent 3.4) are unchanged. The solar provider sets the light to `sunLevel`
and no longer multiplies by a constant of its own. It builds the rig dark, and `update` sets the
level in the same React commit, so no frame shows the dark sun. The engine's old constant is now
`SCHEMATIC_SUN_INTENSITY`, still 1.6, and only the schematic rig of
[[ADR-0079-three-dimensional-lighting-legibility]] reads it.

At the reference instant the sun level is 10.0056, against 1.2952 before. Exposure stays 1 and AgX
stays the daylight operator ([[ADR-0147-per-mode-tone-mapping]]).

### The night level and how far it reaches

Read literally, target 1 sends the dome to zero at sunset, because the direct level goes to zero
and the ratio goes to 1. That gives a black scene. So the diffuse level never falls below
`NIGHT_DIFFUSE_LEVEL`, which is 0.35 times 0.4445, or 0.155575. That is the level the old dome had
on the card with the sun below the horizon: its night scale of 0.35 times the luminance of the
cosine-weighted mean of its tints. The floor binds through the night and until the sun is 9.67
degrees up, where the level driven by the sun first passes it. Below that height the card's direct
to diffuse ratio is lower than the curve says. Full overcast takes 30 percent off the diffuse level
at any height.

### The dome toward the sun, and its ground

Two changes from spec section 6.3 land in `core/environment/sky-dome.ts`.

The dome brightens toward the sun's azimuth. Above the horizon its radiance is multiplied by
`1 + SUNWARD_GAIN * (1 - cloudCover) * (view.x * sun.x + view.z * sun.z)`. The gain comes from one
target: at the reference instant the clear horizon toward the sun is three times as bright as the
horizon away from it. On the horizon that reads `(1 + g cos h) / (1 - g cos h) = 3`, which gives
`g = 2 / (4 cos h)`, or 0.70695. The factor of three is an estimate. No measured sky distribution
backs it, and this record names no published source for it. Because the gain is fixed, the ratio
grows as the sun drops: with the sun on the horizon it is about 5.8, and the side away from the sun
never falls below 0.29 of the plain dome. The term sums to zero around each ring of the dome, so it
does not change the light on the level card, and the targets above do not see it. Cloud cover
fades it out.

Below the horizon the dome is the lawn: `GROUND_SURFACE_COLOR` (the hex `#5f8a4f` of
`core/environment/ground-surface.ts`, decoded to linear light) times the light a level card
receives from the sun and the upper dome. That replaces the fixed brown. The engine's ground plane
paints the same hex, so the ground the dome reflects and the ground the camera sees are one color.

The dome's functions take a `SkyDomeInput`, `{ sunDirection, cloudCover }`, in place of a sun
height: `skyDomeRadiance(view, sky)` takes a unit view vector, `skyDomeSampler(sky)` computes the
per-sky values once for a caller that samples many directions, and
`projectDomeToSphericalHarmonics(sky)` projects the result.

The linear color helpers that the calibration, the dome, and the sky model share (clamping,
mixing, scaling, and the grey of a color) live in `core/color/linear-rgb.ts`.
`core/environment/spherical-harmonics.ts` exports `SPHERICAL_HARMONIC_BASIS`, so the light model
and the projection read one basis table.

### The photometric anchor

The relative scale gets one photometric anchor. The level card at the reference instant receives
80 000 lux, exported as `REFERENCE_HORIZONTAL_ILLUMINANCE_LUX`. Dividing it by pi times the
luminance of sun plus sky on the card gives `LUX_PER_UNIT_IRRADIANCE`, 9424.58 lux for one unit of
irradiance.

The number is a decision of the plan. Its physical check is the set of clear-sky daylight
availability equations in the IES Lighting Handbook. The edition these equations were taken from
is to be confirmed, so this record cites none. For a sun 45 degrees up:

- direct normal illuminance: `127.5 klx * exp(-0.21 / sin 45 degrees)`, which is 94.7 klx;
- the same beam on level ground: 94.7 klx times `sin 45 degrees`, which is 67.0 klx;
- sky illuminance on level ground: `0.8 + 15.5 * sqrt(sin 45 degrees)`, which is 13.8 klx.

The sum is 80.8 klx, rounded to 80 000 lux. The split, 67.0 to 13.8, is 4.8 to 1, which agrees
with the 5 to 1 of target 1. Nothing in the render reads lux yet. Lamps will convert lumens through
the constant, and night will add exposure control once one writer owns exposure.

### The visible sky

The sky mesh addon's scattering constants are pinned by name in `engine/lighting/sky-environment.ts`
at the defaults of the pinned three.js build (turbidity 2, Rayleigh 1, Mie coefficient 0.005, Mie
directional factor 0.8), as its cloud constants already were. They are not tuned.

The mesh's output takes a gain. After the attach builds the sky, `applySkyGain` replaces the
addon's color node with that node multiplied by a three/tsl uniform. The uniform holds
`skyMeshGain()`, which is `SKY_MESH_GAIN` divided channel by channel by the white point, so the
visible sky sits in the same white-balanced space as the sun and the dome. The vector is recorded on
the rig as `skyGain`. The three/tsl module loads lazily beside the sky mesh module, so the startup
path does not grow ([[ADR-0148-visible-sky-and-sh-light-probe]]).

Spec section 9 named a risk here: the addon assigns its color node on the material, and a gain
might need a local copy of that node. A check on 2026-11-16, one capture per build, settled it on
both render backends. In the forced WebGL 2 harness, `equinox-noon` state, a sky region read
(237.00, 241.96, 243.00) with the multiply at 1 and (220.97, 228.49, 230.55) at 0.5, and the lawn
and wall regions did not change. In the live view on WebGPU, a sky region read
(173.38, 207.00, 235.19) at 1 and (139.60, 180.22, 216.28) at 0.5, again with the lawn and the wall
unchanged. The addon's color node takes the multiply on both backends, so the fallback was not
needed.

`SKY_MESH_GAIN` is 0.0636, measured on 2026-11-16 on the development machine (the scene harness
forced to WebGL 2, a 320 by 240 frame, AgX at exposure 1) in the `equinox-noon` state. The region
is an 8 pixel square at the top of the frame, on the side away from the sun, looking 1.2 degrees
above the horizon. Each reading is the region's encoded luminance turned back into linear
luminance with `agxNeutralInverse`. At a gain of 1 the region sat too close to the flat top of the
curve, so it was read at a provisional gain of 0.25 and scaled back: 3.844 at a gain of 1. The
dome gives 0.24466 in that direction, so the gain is 0.24466 / 3.844, or 0.06365, frozen as
0.0636. At that gain the region reads 0.24496, a residual of +0.12 percent. Five captures
were byte-identical.

At the zenith the same gain leaves the visible sky far too dark: it reads 0.0328 against the dome's
0.4596, a ratio of about 0.071, so about 14 times darker. That figure is an order of magnitude and
no more, because the inverse of the tone curve is exact only for a neutral color and the zenith is a
saturated blue. The mesh is much brighter at the horizon than at the zenith, and the dome is the
other way round, so one gain cannot match both. The gain matches the horizon. Light on surfaces
comes from the dome and not from the mesh, so the residual affects how the sky looks and not how
the building is lit.

### The color check's sun

`colorCheckLighting` in `core/environment/color-check.ts` pins `sunLevel` to
`COLOR_CHECK_SUN_LEVEL`, 1.6, with no fade and no cloud dimming, while the sun is above the
horizon. When the sun direction's `y` is at or below 0 the check's sun is off, at level 0, so the
check never lights the scene from under the ground. This corrects the code to what
[[ADR-0156-luminance-calibration-convention]] already recorded: before the change the check passed
the fade through. The check keeps its white sun, its uniform white dome of radiance 1, and Neutral
tone mapping. None of the calibrated values above reach it.

### Where this departs from the letter of the spec

- The tone curve, transcribed from the pinned three.js build into
  `core/environment/tone-response.ts`, puts code 225 at linear 2.1 (2.0998), where spec section 6.2
  estimated 1.5, and linear 0.18 near code 128, where the spec said 120. The render agrees with the
  transcription: before the change the light model predicted code 161.34 for the reference wall
  and the render read 162.67.
- With that curve the sun at the reference instant is 7.7 times its earlier level (10.0056 against
  1.2952, a factor of 7.725), where the spec estimated about four. The sky on the card comes out at
  0.45039 against 0.35985 before, above the earlier level where the spec expected a little below.
  The targets stand (spec section 9) and the values follow from them.
- Spec section 6.3 asks the sky mesh to match the dome at the zenith and at the far horizon. One
  gain cannot do both, so the gain matches one region near the horizon and the zenith residual is
  recorded above.
- Spec section 6.9 sets every threshold of the sky gate at a midpoint. The plan uses exact
  relations for two of its tests instead, "not clipped" and "darker than the sunlit white wall",
  because neither has a free number. The blue of the clear sky keeps a midpoint. The overcast sky
  has no bound: in this view it renders the same pixels as the clear sky, so there is no gap to set
  one in.

### Gates

Node tests assert the ratio curve, the white point, the white wall's code, the shade, the warm low
sun, the lux anchor, and the night floor as plain numbers.

The pixel gates keep their readings and thresholds in their spec files under `e2e/tests/`, and this
record states no threshold for them. Of the gates in spec section 6.9, this change sets the
daylight white gate, the clear-sky part of the sky gate, and the low edge of the sun-to-shade band.
The margins of the sunlit-wall gate and the occlusion gate were derived again under the new light.

Two parts are not set, and the header comments of `e2e/tests/scene-sky.spec.ts` and
`e2e/tests/scene-sun-to-shade.spec.ts` say why. The overcast sky has no bound, because in the
harness view the overcast frame renders the same sky pixels as the clear one. The sky mesh draws
its clouds only above the horizon, and this view shows almost no sky above it, so there is no gap
to set a bound in (#764). The sun-to-shade band has no upper edge. Its probe zeroes the sky's
ambient light, the shadowed lawn then renders black, and the ratio has no finite value to set an
edge at (#766).

## Consequences

- At the reference instant white paint in the sun reads white, and evening light dims and warms
  because the targets hold at one instant only.
- The sun is much stronger, so specular highlights and glass are pushed harder. Defects this brings
  out are filed against the materials work, and the sun level is not lowered to hide them.
- The daylight whole-frame baselines are expected to move with the change and refresh with it. The
  schematic baselines must not move, because the schematic rig reads only `SCHEMATIC_SUN_INTENSITY`.
- The two walls of the sunlit-wall gate no longer receive the same sky light, because of the term
  toward the sun. As spec section 6.3 asked, this change derived that gate's margin again, and the
  occlusion gate's margin with it.
- A change to a target or to a raw tint needs a new solve of the sun scale. The white point and
  the dome follow on their own when the module loads, and the wall test catches a stale scale. The
  night floor is the exception: `DOME_MEAN_LUMINANCE` in `core/environment/daylight-calibration.ts`
  is a frozen number, so a change to the raw dome tints needs that number updated too.
- `SKY_MESH_GAIN` is a measurement on one machine and one three.js build. A three.js bump that
  touches the sky addon needs a new measurement.
- The gain is fitted at one instant and one place, so the visible sky does not follow the dome at
  other sun heights. At low sun the visible sky band renders near black, and the zenith residual
  stands (#763).
- Two parts of the pixel gates are not set (see Gates): the overcast sky has no bound (#764) and
  the sun-to-shade band has no upper edge (#766). A change that leaves the overcast sky blue, or
  that drains the sky light out of the shade, passes the gates.
- Shade on a vertical white wall under a high sun is green, not cool. The lower half of the dome
  is the lit lawn, and the lawn is brighter than the sky: its luminance is about 0.57 against a
  zenith of about 0.45 at the reference instant, and about 0.60 against 0.46 at equinox noon. So
  the cool shade of the checks above holds on the level card only. The light model predicts OKLab
  a -0.070, b +0.027 for the shaded west wall at the reference instant, and a -0.075, b +0.033 for
  the north wall at equinox noon. Rendered shaded white walls read a from -0.020 to -0.031. No gate
  reads the a axis (#765).
- The sun's fade with height is unchanged and keeps 35 percent of the sun's level at the horizon.
  Under the scale of 12.36 the light model predicts code 210.5 for a white wall that faces a sun on
  the horizon, and code 186.5 with the sun 3 degrees below it, while the dome sits at its night
  level. These are figures from the model, not pixel readings (#771).
- Two render defects are open: window glass reads dull and green (#767), and the frame edges on a
  sunlit wall render jagged (#768).
- Older records that name `sunIntensity` or `DAYLIGHT_SUN_INTENSITY` read with this mapping:
  `sunIntensity` is now `sunLevel`, an absolute level and not a fraction, and
  `DAYLIGHT_SUN_INTENSITY` is now `SCHEMATIC_SUN_INTENSITY`, for the schematic rig only. Some
  documents still use the retired names (#769).

## Not decided

- The edition of the IES Lighting Handbook the anchor's equations come from (#769).
- A source for the three-to-one ratio of the horizon toward the sun. A measured or published sky
  distribution can replace the estimate without touching the other targets.
- How to make the visible sky follow the dome at every sun height and close its zenith residual.
  That needs a gain that varies with height or a sky that is not the addon's, and neither is chosen
  (#763).
- A bound for the overcast sky, which needs a view or a state where the overcast and clear skies
  differ (#764), and an upper edge for the sun-to-shade band, which needs a probe that leaves the
  shadowed lawn above black (#766).
- Whether shade on a vertical wall should read cool, and whether a gate should read the a axis
  (#765).
- Whether the sun should keep 35 percent of its level at the horizon under the calibrated scale
  (#771).
- Exposure control at night, and the lamps that will read the lux anchor.
- The display rule for the daylight field and the color check's bypass of it, which
  [[ADR-0196-plan-space-daylight-field]] leaves to the window-lit rooms work.

## References

- `docs/specs/2026-11-15-daylight-and-shadow.md`, sections 6.2, 6.3, 6.9, 8, and 9.
- `docs/plans/2026-11-15-daylight-and-shadow.md`, the list of decisions.
- [[ADR-0156-luminance-calibration-convention]] (the color check's condition).
- [[ADR-0148-visible-sky-and-sh-light-probe]] (the dome and the visible sky).
- [[ADR-0161-sky-specular-environment-map]] (the map built from the dome's coefficients).
- [[ADR-0157-color-accuracy-gate]] (the tolerances that do not move).
- [[ADR-0147-per-mode-tone-mapping]] (AgX for daylight, Neutral for the check).
- The IES Lighting Handbook, clear-sky daylight availability equations (edition to be confirmed).
