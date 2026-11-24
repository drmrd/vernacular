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
    core/environment/sun-level-fade.test.ts,
    core/environment/sun-scale-and-night-floor.test.ts,
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
    engine/lighting/sky-mesh-gain.test.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/solar-lighting-provider.ts,
    engine/lighting/basic-lighting-provider.ts,
    engine/scene/ground-plane.ts,
    app/harness-environment.ts,
    docs/specs/2026-11-15-daylight-and-shadow.md,
    docs/plans/2026-11-15-daylight-and-shadow.md,
  ]
status: current
updated: 2026-11-24
---

# ADR-0192: Daylight is calibrated from three targets with a fixed white point

## Status

Current. Lands with the calibration change of the daylight and shadow work, which follows sections
6.2 and 6.3 of `docs/specs/2026-11-15-daylight-and-shadow.md` and the list of decisions in
`docs/plans/2026-11-15-daylight-and-shadow.md`. It amends
[[ADR-0156-luminance-calibration-convention]], [[ADR-0148-visible-sky-and-sh-light-probe]], and
[[ADR-0161-sky-specular-environment-map]], and each of those carries an amendment dated
2026-11-16. Three later decisions of the same day (the grey ground bounce, the sun's fade with the
air mass, and the sky gain by sun height) are recorded in the amendment at the end of this record,
and the sections below are written to agree with it.

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
| Sun scale, full sun overhead, clear sky | `DAYLIGHT_CALIBRATION.sunScale`         | 10.9126                            |
| White point, at luminance 1             | `DAYLIGHT_CALIBRATION.whitePoint`       | r 1.069166, g 0.980015, b 0.994307 |
| Sun level                               | `sunLevelAt(h, cloudCover)`             | 10.0056                            |
| Diffuse level on the level card         | `diffuseLevelAt(h, cloudCover)`         | 0.45039                            |
| Gain of the dome's term toward the sun  | `SUNWARD_GAIN`                          | 0.70695                            |
| Lux for one unit of irradiance          | `LUX_PER_UNIT_IRRADIANCE`               | 9424.53                            |

The sunlit white level is `agxNeutralInverse(225 / 255)`, from the tone curve in
`core/environment/tone-response.ts`.

The sun scale is a frozen literal. The reference wall's luminance is linear in the scale, so it was
solved once: at a scale of 1, with the night floor described below set aside (the reference sky
clears it), the wall returned 0.19242326, and 2.099829 over that is 10.91255. The literal rounds
it to 10.9126. That solve uses the fade with the Kasten and Young air mass from the amendment. The
same solve gave 12.3599 under the first fade (an independent solve during review got 12.3599048)
and 10.9156 under the plain `1 / sin h` air mass that came between them. With the frozen 10.9126
the reference wall reads code 225.00011 and the sun level at the reference instant is 10.005640.
The tests in `core/environment/daylight-calibration.test.ts` read the wall back through the light
model and the tone curve and require code 225 within half a code, so a stale literal fails there.

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
With the sun at 20 degrees the light on the card is warm. At 10 degrees it is not, and a white wall
that faces the sun is warm there instead (see the amendment).

### The raw tints are inputs

The sun's horizon and zenith tints and the dome's horizon and zenith tints keep their old values.
They moved into `daylight-calibration.ts` as raw inputs. The three targets fix two scales and a
white point, and none of them fixes a hue, so the hues still have to come from somewhere. Each tint
is divided by the white point on its way out and flattened toward grey under cloud. The sun's color
leaves at luminance 1, so all of its strength lives in its level. The hemisphere fill tints in
`core/environment/sky-model.ts` remain for the fill alone, and daylight zeroes that fill.

### The sun level moves into core

`EnvironmentLighting.sunIntensity`, a fraction, is now `sunLevel`, the light's actual intensity:
`sunLevelAt(h, cloudCover)` is the sun scale times a fade with height times the old cloud
transmission. The fade falls with the relative air mass `m(h)` of Kasten and Young (1989),
`exp(-SUN_OPTICAL_DEPTH * (m(h) - m(90 degrees)))` above the horizon and 0 at and below it, with
`SUN_OPTICAL_DEPTH` 0.21; the amendment records how it replaced the first fade. The cloud curve
(exponent 3.4) is unchanged. The solar provider sets the light to `sunLevel` and no longer
multiplies by a constant of its own. It builds the rig dark, and `update` sets the level in the
same React commit, so no frame shows the dark sun. The engine's old constant is now
`SCHEMATIC_SUN_INTENSITY`, still 1.6, and only the schematic rig of
[[ADR-0079-three-dimensional-lighting-legibility]] reads it.

At the reference instant the sun level is 10.0056, against 1.2952 before. Exposure stays 1 and AgX
stays the daylight operator ([[ADR-0147-per-mode-tone-mapping]]).

### The night level and how far it reaches

Read literally, target 1 sends the dome to zero at sunset, because the direct level goes to zero
and the ratio goes to 1. That gives a black scene. So the diffuse level never falls below
`NIGHT_DIFFUSE_LEVEL`, which is 0.35 times 0.4445, or 0.155575. That is the level the old dome had
on the card with the sun below the horizon: its night scale of 0.35 times the luminance of the
cosine-weighted mean of its tints. The floor binds through the night and until the sun is 12.19
degrees up, where the level driven by the sun first passes it (9.67 degrees under the first fade).
Below that height the card's direct to diffuse ratio is lower than the curve says. Full overcast
takes 30 percent off the diffuse level at any height.

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

Below the horizon the dome is a neutral grey ground bounce: `GROUND_BOUNCE_COLOR` in
`core/environment/ground-surface.ts`, a grey with the luminance (0.21174) of the lawn color
`GROUND_SURFACE_COLOR`, times the light a level card receives from the sun and the upper dome. That
replaces the fixed brown. The engine's ground plane still paints the lawn's hex, `#5f8a4f`, so the
camera sees a green lawn while the dome's ground keeps only its luminance. The amendment gives the
reason. (Replaced on 2026-11-24: the plane now draws the grass of the starter pack, whose mean in
linear light is the lawn color, and paints the hex only while the texture loads or after its load
fails. See the amendment of ADR-0131.)

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
luminance of sun plus sky on the card gives `LUX_PER_UNIT_IRRADIANCE`, 9424.53 lux for one unit of
irradiance.

The number is a decision of the plan. Its physical check is the set of clear-sky daylight
availability equations in the IES Lighting Handbook. The edition these equations were taken from
is to be confirmed, so this record cites none. For a sun 45 degrees up:

- direct normal illuminance: `127.5 klx * exp(-0.21 / sin 45 degrees)`, which is 94.7 klx;
- the same beam on level ground: 94.7 klx times `sin 45 degrees`, which is 67.0 klx;
- sky illuminance on level ground: `0.8 + 15.5 * sqrt(sin 45 degrees)`, which is 13.8 klx.

The sum is 80.8 klx, rounded to 80 000 lux. Before rounding the split is 66.99 to 13.83 klx, or
4.84 to 1, which agrees with the 5 to 1 of target 1. Nothing in the render reads lux yet. Lamps
will convert lumens through the constant, and night will add exposure control once one writer owns
exposure.

### The visible sky

The sky mesh addon's scattering constants are pinned by name in `engine/lighting/sky-environment.ts`
at the defaults of the pinned three.js build (turbidity 2, Rayleigh 1, Mie coefficient 0.005, Mie
directional factor 0.8), as its cloud constants already were. They are not tuned.

The mesh's output takes a gain. After the attach builds the sky, `applySkyGain` replaces the
addon's color node with that node multiplied by a three/tsl uniform. The uniform holds
`skyMeshGain(sunAltitude)`: the gain for the sun's height from `skyMeshGainAt`, divided channel by
channel by the white point, so the visible sky sits in the same white-balanced space as the sun and
the dome. The vector is recorded on the rig as `skyGain`, and `updateSkyEnvironment` writes the
gain for the current sun height into it on each update. It reads that height with `sunAltitudeOf`,
which `core/environment/sky-dome.ts` exports, so the engine and the dome share one helper. The
three/tsl module loads lazily beside the sky mesh module, so the startup path does not grow
([[ADR-0148-visible-sky-and-sh-light-probe]]).

Spec section 9 named a risk here: the addon assigns its color node on the material, and a gain
might need a local copy of that node. A check on 2026-11-16, one capture per build, settled it on
both render backends. In the forced WebGL 2 harness, `equinox-noon` state, a sky region read
(237.00, 241.96, 243.00) with the multiply at 1 and (220.97, 228.49, 230.55) at 0.5, and the lawn
and wall regions did not change. In the live view on WebGPU, a sky region read
(173.38, 207.00, 235.19) at 1 and (139.60, 180.22, 216.28) at 0.5, again with the lawn and the wall
unchanged. The addon's color node takes the multiply on both backends, so the fallback was not
needed.

The gain was first a single number, 0.0636, measured on 2026-11-16 on the development machine (the
scene harness forced to WebGL 2, a 320 by 240 frame, AgX at exposure 1) in the `equinox-noon`
state, on the side away from the sun just above the horizon. Each reading is the region's encoded
luminance turned back into linear luminance with `agxNeutralInverse`, divided by the gain it was
rendered with. That gain matched the dome at noon and left the visible sky near black at a low sun.
The amendment replaces it with `SKY_MESH_GAIN_BY_SUN_HEIGHT`, a table of gains by sun height
measured the same way.

At the zenith the visible sky is far too dark. At equinox noon, under the single gain, it read
0.0328 against the dome's 0.4596, a ratio of about 0.071, so about 14 times darker. That figure is
an order of magnitude and no more, because the inverse of the tone curve is exact only for a
neutral color and the zenith is a saturated blue. The mesh is much brighter at the horizon than at
the zenith, and the dome is the other way round, so a gain that depends only on the sun's height
cannot match both. The gain matches the horizon. Light on surfaces comes from the dome and not
from the mesh, so the residual affects how the sky looks and not how the building is lit.

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
  1.2952, a factor of 7.725), where the spec estimated about four. The new fade and its sun scale,
  10.9126, keep that level at the reference instant, so the factor still holds there. At other sun
  heights it differs, because the fade differs. The sky on the card comes out at 0.45039 against
  0.35985 before, above the earlier level where the spec expected a little below. The targets
  stand (spec section 9) and the values follow from them.
- Spec section 6.2, and call 6 in the table of section 4.2, let the sun follow the existing fade
  with its height. The code replaces that fade with one that falls with the Kasten and Young air
  mass, because the existing fade kept 35 percent of the sun's level at the horizon and so lit a
  wall from a sun on or below it (#771). The amendment gives the reasons for the air mass chosen.
- Spec section 6.2 asks the Node tests to show the lit level card as warm below about 20 degrees of
  sun height. Under the new fade the card is warm at 20 degrees but not at 10, where the sky sits at
  its night floor and its blue offsets the sun's warmth. The tests instead require a white wall that
  faces the sun to read warm at 10 and at 5 degrees.
- Spec section 6.3, and call 9 in the table of section 4.2, compute the ground bounce from the lawn
  color. The code keeps only the lawn's luminance and makes the bounce a neutral grey, because the
  lawn's green gave every white wall in shade a green cast (#765).
- Goal 2 of the spec and decision 2 in its section 4.1 ask that shade be "mildly cool". With the
  neutral ground bounce, a white wall in shade under a low sun reads bluer than that, for the
  causes the Consequences give. The daylight white gate checks that such shade stays cool and
  has no green cast, but it puts no limit on how blue the shade gets. The follow-up on a white
  balance that follows the scene's light tracks the difference.
- Spec section 6.3 gives the sky mesh's output a gain. The code makes that gain a table by sun
  height, because one gain, matched at noon, left the visible sky near black at a low sun.
- Spec section 6.3 asks the sky mesh to match the dome at the zenith and at the far horizon. A gain
  that depends only on the sun's height cannot do both, so the gain matches the horizon away from
  the sun and the zenith residual is recorded above.
- Spec section 6.9 sets every threshold of the sky gate at a midpoint. The plan uses exact
  relations for two of its tests instead, "not clipped" and "darker than the sunlit white wall",
  because neither has a free number. The blue of the clear sky keeps a midpoint. The overcast sky
  has no bound: in this view it renders the same pixels as the clear sky, so there is no gap to set
  one in.

### Gates

Node tests assert the ratio curve, the white point, the white wall's code, the shade, the lux
anchor, and the night floor as plain numbers. They also assert the warm low sun in the form the new
fade allows: the light on the level card is warm at 20 degrees, and a white wall that faces the sun
is warm at 10 and at 5 degrees. Since the amendment they check that shaded white walls show no green
cast, that the sun's level follows the fade with the Kasten and Young air mass, that it steps to 0
at the horizon from a level just above it that is under 0.05 percent of the reference level, and
that the sky gain table holds its measured rows.

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

The amendment adds a harness state, `low-sun`, and three pixel gates. The state renders the
evening of 2026-03-25 at the harness site, with the sun about 1.5 degrees up a little north of due
west, through the camera of the reference state, so the west wall faces the low sun and the south
wall is in shade. One gate reads the green-red axis (OKLab a) of white walls in shade, so the green
cast cannot come back unnoticed. One reads the visible sky at a low sun, so it cannot fall back to
near black while the dome still lights the scene. One reads the white wall that faces a sun just
above the horizon, so a sun that low cannot light it as strongly as the first fade did. Their
readings and thresholds live in their spec files.

## Consequences

- At the reference instant white paint in the sun reads white. The targets hold at that instant
  only. As the sun drops, its level falls with the air mass of its path, and its light warms
  because the sun's color moves toward its horizon tint. The fade sets the level only; the warmth
  comes from the color.
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
- `SKY_MESH_GAIN_BY_SUN_HEIGHT` is a measurement on one machine (WebGL 2 on macOS) and one three.js
  build. A three.js bump that touches the sky addon needs the table measured again.
- The gain follows the sun's height but matches the dome only just above the horizon on the side
  away from the sun. The zenith still reads far below the dome, the horizon to the side of the sun
  reads 45 to 70 percent of it, the band of the mesh below the true horizon is not matched, and
  with the sun under the horizon the mesh is black (#763).
- Two parts of the pixel gates are not set (see Gates): the overcast sky has no bound (#764) and
  the sun-to-shade band has no upper edge (#766). A change that leaves the overcast sky blue, or
  that drains the sky light out of the shade, passes the gates.
- Shade on a vertical white wall is no longer green; the grey ground bounce answered #765. The
  lower half of the dome is still brighter than the sky (luminance about 0.57 against a zenith of
  about 0.45 at the reference instant), but it is grey now, so it lights a shaded wall without a
  hue. The light model predicts OKLab a -0.0044, b -0.0277 for the shaded west wall at the reference
  instant, and a -0.0052, b -0.0261 for the north wall at equinox noon, where the lit lawn gave
  a -0.070 and a -0.075. A gate now reads the a axis.
- A white wall in shade under a low sun is much bluer than under the lawn-colored bounce of the
  first calibration build, and a little bluer than before the calibration, when the dome's ground
  was a fixed warm brown. Nothing green or warm below the horizon now offsets the sky's blue. The
  direction is right, since open shade is lit by the sky. The strength is not: the shade looks the
  way a camera with a fixed daylight white balance records it, bluer than a person sees it. Two
  things set that hue: the white point is fixed at the reference instant, and no light bounces from
  the real sunlit ground or from nearby surfaces. The fixed exposure does not change the hue, but
  it makes the same shade darker than a person sees it. Issues #786, #783, and #785 track the three, in that order
  (see Not decided).
- A sun on the horizon no longer lights a wall; the fade with the air mass answered #771. The light
  model gives a white wall that faces a sun on the horizon, or 3 degrees below it, code 105.4, the
  same as the dome alone, where the first fade gave 210.5 and 186.5. With the sun 1.5 degrees up
  the wall reads 117.4, at 5 degrees 177.0, and at 10 degrees 209.4. These are figures from the
  model, not pixel readings.
- With the sun on the horizon, the dome at its night floor is the scene's only light, and once the
  sun is under the horizon the visible sky is black. A level for twilight and night is not designed;
  issue #784 tracks this.
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
- How to make the visible sky follow the dome at the zenith, to the side of the sun, below the
  true horizon, and with the sun under the horizon. The gain by sun height matches only the horizon
  away from the sun. The rest needs a correction that also depends on the view direction, or a sky
  drawn from the dome, and neither is chosen (#763).
- A bound for the overcast sky, which needs a view or a state where the overcast and clear skies
  differ (#764), and an upper edge for the sun-to-shade band, which needs a probe that leaves the
  shadowed lawn above black (#766).
- Light bounced from the real ground and from floors near a wall, which would give a surface the
  color of the ground beside it and would temper the blue of shade under a low sun. The grey ground
  bounce gives that up; issue #783 tracks this.
- A level for twilight and night, below the reach of the fade; issue #784 tracks this.
- Exposure at a low sun and at night. Exposure stays 1, so how a low sun looks is not modeled;
  issue #785 tracks exposure that follows the scene. The lamps that will read the lux anchor
  wait on the same work.
- A white balance that follows the scene's light. The white point is fixed at the reference instant,
  so shade under a low sun reads bluer than a person sees it. A partial chromatic adaptation, with a
  degree of adaptation below 1, would move the white point part of the way toward the light of the
  moment; issue #786 tracks this.
- A tighter tolerance for the tone curve gate; issue #787 tracks this.
- Refraction near the horizon. The air mass takes the sun's geometric height, while refraction
  lifts the sun the eye sees. With the refraction step of the ESRA model the level at 1.5 degrees
  would be 1.56 times higher (1.52 times with Saemundsson's formula); whether to apply it is open.
- The sky gain table against the present dome. Its rows were measured before the change to the
  Kasten and Young air mass, and at its 12.5 degree row the dome is now 1.85 percent brighter than
  the row was matched to (#763).
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

## Amendment 2026-11-16: the grey ground bounce, the sun's fade, and the sky gain by sun height

Later on 2026-11-16 the owner decided three of the open points of this record. All three are in
code, and the sections above are corrected to agree with them. The three targets still hold
exactly: the reference wall reads code 225.00, the white point and the lux anchor do not change,
and the sun level at the reference instant stays 10.0056.

### The ground bounce is a neutral grey

The lower half of the dome uses `GROUND_BOUNCE_COLOR` from `core/environment/ground-surface.ts`, a
grey whose luminance is that of the lawn color, 0.21174 in linear light. `groundRadiance` in
`core/environment/sky-dome.ts` multiplies it by the light a level card receives from the sun and
the upper dome. The visible lawn keeps its color: the engine's ground plane still paints
`GROUND_SURFACE_HEX`.

The reason is the green cast. With the lit lawn color as its lower half, the dome gave every white
wall in shade a green tint. The light model predicted OKLab a -0.070 for the shaded west wall at the
reference instant, and rendered shaded walls read a -0.020 to -0.031. In a capture made for the
decision, with the grey ground, the same west wall read a -0.0036 and b -0.0116, a cool light grey.
The model now predicts a -0.0044, b -0.0277 there. At the reference instant the light on the lawn
is the neutral white of the level card, so a ground of the same luminance gives the reference wall
the same luminance, and the three targets do not move.

Two other options were weighed and not taken. A ground halfway between the lawn and the grey only
halved the cast. A darker ground in the lawn's hue kept much of the cast, darkened the shade, and
moved the reference wall off code 225, which would have needed a new sun scale.

What this gives up: no surface takes the color of the ground beside it. Bounce from the real ground
and from floors near a wall is later work, and issue #783 tracks it. Shade under a low sun is
also bluer than under the lawn-colored ground, since nothing green offsets the sky's blue; the
Consequences say why that is stronger than what a person sees. This answers #765.

### The sun's level falls with the Kasten and Young air mass

`sunFade` in `core/environment/daylight-calibration.ts` is now
`exp(-SUN_OPTICAL_DEPTH * (m(h) - m(90 degrees)))` above the horizon, with `SUN_OPTICAL_DEPTH`
0.21. Here `m` is `relativeAirMass`, the relative air mass of F. Kasten and A. T. Young (1989):
`m(h) = 1 / (sin h + 0.50572 * (hDegrees + 6.07995) ^ -1.6364)`, with the height in degrees in
the second term. The fade is 0 wherever the sine of the height is 0 or negative. The optical depth
is that of the clear-sky direct sun formula this record already cites for its photometric anchor
(see "The photometric anchor"). It is taken relative to the air mass overhead, so the fade is
exactly 1 at the zenith. Unlike `1 / sin h`, this air mass stays finite at the horizon, where it
is about 38. Just above the horizon the sun's level is therefore about 0.005, under 0.05 percent
of the reference level, and it steps from there to 0 at the horizon. The step is too small to
see, but it is there. The first fade kept 35 percent of the level at the horizon and reached zero
0.1 radians (5.73 degrees) below it.

The sun scale was solved again in the same way and is now 10.9126 (12.3599 under the first fade).
The sun level at the reference instant stays 10.0056, and the reference wall stays at code 225.
Because the sun is weaker at low heights, the night floor of the diffuse level now binds below
12.19 degrees of sun height, where it bound below 9.67.

The fade reached this form in two steps on the same day. The owner first chose the plain air mass
`1 / sin h`, which is the cited handbook formula as written (sun scale 10.9156, night floor binding
below 12.36 degrees). The rendered frames then showed that a wall facing a sun 1.5 degrees up got
no visible sunlight. So the fade was compared with published clear-sky models, each computed from
its formula: the ESRA beam model with the Linke turbidity factor and Kasten's 1996 Rayleigh
optical thickness, read from the paper; the Ineichen and Perez (2002) model and the Bird model,
read from open-source ports of the papers and not from the papers themselves; and the Meinel rule
of thumb. Each was turned from watts into light with the Perez (1990) luminous efficacy of the
direct beam, whose coefficients also came from a code port and were not checked against the paper.
No measured data for a sun this low turned up, so the comparison sets models against models.

Against those models the plain air mass is close down to about 10 degrees, about 20 to 35 percent
too dark at 5, and far too dark below 3. At 1.5 degrees its air mass is 38, where Kasten and Young
give 22. The same optical depth with the Kasten and Young air mass came nearest to the models, as
light, from 3 to 45 degrees. A smaller optical depth, 0.1354, came nearer in watts, but as light it
was 1.4 to 2 times too bright from 3 to 10 degrees, because the beam's luminous efficacy falls as
the sun drops. That step from watts to light rests on one published efficacy fit, which is
extrapolated near the horizon. So confidence is high that the plain air mass is too dark below 3
degrees, and only medium that this fade is nearer than the smaller optical depth. The owner chose
the Kasten and Young air mass the same day.

The level as a fraction of its value at 45 degrees:

| Sun height                     | 10 degrees   | 5 degrees    | 3 degrees    | 1.5 degrees  |
| ------------------------------ | ------------ | ------------ | ------------ | ------------ |
| Published models, as light     | 0.36 to 0.40 | 0.15 to 0.19 | 0.08 to 0.10 | 0.04 to 0.06 |
| This fade                      | 0.42         | 0.15         | 0.056        | 0.012        |
| The plain air mass `1 / sin h` | 0.40         | 0.12         | 0.024        | 0.0004       |

What stays wrong: below 3 degrees this fade is still too dark against those models, by 2 to 5
times at 1.5 to 2 degrees. At those heights a rough spectral estimate, made during the comparison
and neither published nor confirmed, puts the effect of haze alone at more than a factor of 10, so
no single curve is likely to be right there. The comparison is about the light that reaches a wall.
How a low sun looks also depends on exposure, which stays 1, and issue #785 tracks exposure
that follows the scene.

One property of the design changed with the new fade. The light on a level card is still warm at
20 degrees of sun height, but at 10 degrees it is not: it reads OKLab a +0.0145, b -0.0030. At that
height the sky sits at its night floor and the sun gives the card only about 1.5 times the sky's
light, so the sky's blue offsets the sun's warmth. A white wall that faces the sun is warm at 10
degrees (a +0.0233, b +0.0561) and at 5 degrees (a +0.0245, b +0.0461). The Node tests state the
warm low sun that way.

What this gives up: at dusk the sun no longer props up the light. Below 12.19 degrees the sky's
light sits at the night floor, and at the horizon the sun adds nothing. A level for twilight and
night is not designed, and issue #784 tracks it. This answers #771.

### The visible sky's gain follows the sun's height

The single gain of 0.0636 is gone. `SKY_MESH_GAIN_BY_SUN_HEIGHT` in
`engine/lighting/sky-environment.ts` holds eight rows, measured in the scene harness (WebGL 2,
macOS, 2026-11-16). Each row is the gain that makes the visible sky's luminance equal the dome's
just above the horizon on the side away from the sun. `skyMeshGainAt` interpolates the natural
logarithm of the gain linearly in the height between rows and holds the end rows beyond the table.
`skyMeshGain` divides that gain by the white point, and `updateSkyEnvironment` writes it into the
rig's `skyGain` vector on each update, so the visible sky follows the sun with no shader rebuild.

The rows run from 1.07 degrees (gain 1.15, an estimate, from the least certain reading) through
2.07, 3.58, 4.95, 7.54, 10, and 12.5 degrees to 73.44 degrees (gain 0.061). With the gain set
outright at four measured heights (2.07, 4.95, 19.99, and 45.06 degrees) the region came within 0.7
percent of the dome. Five more measured heights (15, 20, 30, 45, and 60 degrees) fall within 1.74
percent of the table's interpolation. The doc comment of the table records these figures and its
limits.

The reason is the low sun. Under the single gain the visible sky behind the house went near black
at a low sun while the house and the lawn were still in daylight. Near the horizon the mesh dims
much faster than the dome as the sun drops, so the matching gain climbs steeply at low heights: it
is 0.0692 at 12.5 degrees and 0.651 at 2.07.

What stays open (#763): the zenith, where the mesh reads far below the dome; the horizon to the side
of the sun, which reads 45 to 70 percent of the dome; the band of the mesh below the true horizon;
and the sun under the horizon, where the mesh is black and the held end row does not light a night
sky. The scattering constants stay pinned and are not tuned to close these differences.
