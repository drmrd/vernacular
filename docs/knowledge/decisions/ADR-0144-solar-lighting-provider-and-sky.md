---
slug: decisions/ADR-0144-solar-lighting-provider-and-sky
title: 'ADR-0144: Solar lighting provider and sky: NOAA sun position, an analytic sky, and the realistic-lighting mode'
type: decision
tags:
  [
    architecture,
    core,
    engine,
    bridge,
    environment,
    lighting,
    solar-position,
    sky-model,
    3d-preview,
    session-state,
    timezone,
    visual-tier,
  ]
related:
  [
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
    decisions/ADR-0139-plan-to-world-orientation,
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0143-environment-model-foundations,
  ]
sourceFiles:
  [
    docs/specs/2026-07-01-realistic-environmental-lighting.md,
    docs/plans/2026-07-02-realistic-lighting-slice-1a-solar-provider-and-sky.md,
    core/environment/solar-position.ts,
    core/environment/sun-world-direction.ts,
    core/environment/sky-model.ts,
    core/environment/environment-lighting.ts,
    core/environment/timezone-offset.ts,
    engine/lighting/lighting-provider.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/solar-lighting-provider.ts,
    engine/lighting/basic-lighting-provider.ts,
    bridge/react/scene-lighting.tsx,
    app/harness-environment.ts,
    e2e/tests/scene-solar.spec.ts,
  ]
status: current
updated: 2026-07-03
---

# ADR-0144: Solar lighting provider and sky

## Status

Accepted, landed. Slice 1a of the realistic-environmental-lighting epic
(`docs/specs/2026-07-01-realistic-environmental-lighting.md`). The 3D preview can now light the
shell with a computed sun for the project's site, date, and time of day. Slice 0 stored the
"where" and the "when" ([[ADR-0143-environment-model-foundations]]) without driving lighting;
this slice drives it.

## Context

The preview's lighting rig has been a fixed-direction sun plus a hemisphere fill since
[[ADR-0065-three-dimensional-lighting-and-color-temperature]], rebalanced for face legibility by
[[ADR-0079-three-dimensional-lighting-legibility]]. Both ADRs kept lighting behind the
`LightingProvider` seam precisely so a solar-aware provider could swap in later. This slice is
that provider. It needs sun-position math, a sky-color model, a way to turn `Site.timezone` into
a UTC offset, a contract for re-aiming an applied rig, and a user-facing switch, and each of
those forced a decision worth recording.

## Decision

### The numerics are pure core; the engine provider only applies them

Everything computable without a renderer lives in `core/environment/`. `solarPosition`
(`core/environment/solar-position.ts`) implements the published NOAA solar-calculator formulas
and returns azimuth clockwise from true north plus the sun's altitude. `sunWorldDirection` turns
those angles into a unit world-space vector. `skyLighting` (`core/environment/sky-model.ts`)
derives the sun and sky tints from the altitude and a cloud-cover fraction. The value object
`EnvironmentLighting` (sun direction, sun color, sky color, and a `sunIntensity` scalar that
carries the horizon dimming and falls to zero below the horizon) is composed by
`computeEnvironmentLighting` from a site, an
observation instant, a UTC offset, and cloud cover. All of it is unit-tested in Node with no
GPU; the engine provider applies the finished values and does nothing else.

### Geometric altitude, no refraction correction

The altitude is geometric. Atmospheric refraction would lift the apparent sun, but the
correction is under 0.2 degrees once the sun is a few degrees up, it depends on the weather, and
at that scale it makes no visible difference to architectural lighting. Leaving it out keeps the
math exactly the NOAA geometric formulas. The reference angles in the tests were computed with
astral 3.2, an independent implementation of the same NOAA algorithm, and cross-checked
analytically: the equinox local-noon altitude is 90 degrees minus latitude, to within the
declination drift.

### The world direction composes azimuth, north bearing, and the ADR-0139 frame

`sunWorldDirection` subtracts `Site.northBearing` from the solar azimuth to get the sun's
heading from plan-up, then lays that heading into world axes through the plan-to-world
convention of [[ADR-0139-plan-to-world-orientation]]: heading 0 points down world `-Z`, heading
pi/2 down world `+X`, and the altitude becomes the `+Y` component. One degenerate case is
guarded in `solarPosition` itself: with the sun at the zenith or nadir the azimuth denominator
`sin(zenith)` vanishes and the azimuth is conventionally undefined, so the function returns 0
(true north) there instead of dividing by it.

### The sky model has its own altitude curves; `kelvinToLinearRgb` is not reused

The analytic sky model interpolates dedicated horizon and zenith tints on the sun's elevation,
separately for the direct sun and the ambient sky. The sun additionally dims toward the horizon
and extinguishes just below it; cloud cover flattens both colors toward grey and dims them.
Reusing the existing `kelvinToLinearRgb` was considered and rejected: it clamps at 2700 K, which
cannot reach a horizon-red sun, and it peak-normalizes its output, so it cannot dim at all. A
sunset needs both. The color-temperature helper stays what it is, the schematic slider's
conversion.

### The `LightingProvider` contract gains `update(scene, lighting, bounds)`

`apply` remains one-time light creation. The new `update` re-aims and re-tints an
already-applied rig for a computed `EnvironmentLighting`; the bounds are the scene content's
bounds, used to refit the sun's shadow frustum after a re-aim, and a null bounds (an empty
scene) makes the refit a no-op by contract. `BasicLightingProvider.update` is a documented
no-op, because the schematic rig is static by design. `SolarLightingProvider.update` sets the
sun and sky colors independently, refits the shadow along the computed direction, and scales
the direct sun's intensity by the computed `sunIntensity`, so the sun fades through the horizon
band and a night scene stays lit by the hemisphere sky alone rather than going black. Rig construction is shared: `buildLightingRig`
and `findSun` live in `engine/lighting/lighting-rig.ts`, and both providers build the same rig
at the one `DAYLIGHT_SUN_INTENSITY`, so the two modes cannot drift apart structurally.

### Sky image-based lighting is staged; the hemisphere tint ships, the environment map waits

The plan split the sky ambient into two stages. Stage A, coloring the existing hemisphere light
from the sky model, ships in this slice and is what the tests pin. Stage B, a generated gradient
environment map set as `scene.environment` for image-based reflections, is deferred to issue
#436: the three.js r184 WebGPU environment-map path is GPU-only, so nothing about it can be
verified in the local jsdom tier, and the slice was not going to stall on a spike the visual
tier alone could judge.

### Timezone-offset resolution lives in core, not at the bridge boundary

`utcOffsetMinutesFor` (`core/environment/timezone-offset.ts`) resolves an IANA timezone id to a
UTC offset in minutes for a civil date, sampling at 12:00 UTC and falling back to an offset of 0
for an undefined or unrecognized id. The plan sketched this resolution "at the boundary", in the
bridge. It lives in core instead, and the deviation is deliberate: the plan's locked decision
guards against bundling a timezone database into core, not against the layer placement, and
`Intl.DateTimeFormat` is a zero-dependency ECMA-402 built-in that behaves the same under Node.
Placing it in core makes the resolution unit-testable next to the solar math and gives every
caller one implementation. The source file cites this ADR as the record of that call.

### Realistic lighting is a per-view mode with a schematic fallback

Provider selection happens in the bridge's `SceneLighting` component, keyed by a per-view
session flag that a "Realistic lighting" toggle in the scene toolbar's display-options group
flips. The flag lives beside the navigation and color-temperature state, off the model and off
undo, matching the session-state pattern ADR-0065 set. Realistic mode without a `Site.latLong`
falls back to the schematic provider; the slice-1b environment panel owns the missing-location
UX, so this slice does not grow one (`bridge/react/scene-lighting.tsx` cites this ADR at that
fallback). Toggling swaps the provider instance on the persistent render scene, removing the
old rig and applying the new one, with no geometry rebuild, because the lights live on the
render scene rather than on the rebuilt geometry group.

### The harness gains named canonical environment states

The deterministic render harness resolves a `scene` query parameter to a named canonical
environment state in `app/harness-environment.ts`. Two states ship, `equinox-noon` and
`winter-afternoon`, both on one fixed site (latitude 40 north, longitude 75 west, plan-up as
true north, Eastern time). Their dates and times match the core solar reference cases, so the
sun each baseline renders is the same sun the unit tests pin. The `scene-webgl` baselines for
the two states render only on the CI runner, as all visual baselines do.

## Consequences

- The preview lights the shell from the real sun for a site and an observation instant, and a
  night scene reads as sky-lit rather than black.
- This ADR realizes the solar-aware provider that [[ADR-0065-three-dimensional-lighting-and-color-temperature]]
  and [[ADR-0079-three-dimensional-lighting-legibility]] anticipated behind the lighting seam.
  Both stay in force for the schematic mode: the fixed asymmetric sun direction and the
  key-over-fill balance are now the schematic rig's constants in `lighting-rig.ts`, and the
  color-temperature slider still tints that rig. In realistic mode the computed environment
  supersedes their fixed sun aim and single-tint path; the sun and sky take independent colors
  and the aim follows the ephemeris.
- The realistic tints render through the color-managed output of
  [[ADR-0142-color-managed-renderer]] and are driven by the model of
  [[ADR-0143-environment-model-foundations]]; the world direction depends on the frame fixed by
  [[ADR-0139-plan-to-world-orientation]], so a site's west-facing wall catches the evening sun.
- Cloud cover is plumbed through `computeEnvironmentLighting` but pinned to a clear sky
  (`DEFAULT_CLOUD_COVER = 0`) until the slice-1b weather layer lands a real control.
- Image-based sky reflections (Stage B) remain open as issue #436; the hemisphere tint carries
  the ambient sky until then.
- Two forward citations resolve to this ADR: the core placement note in
  `core/environment/timezone-offset.ts` and the schematic-fallback note in
  `bridge/react/scene-lighting.tsx`.

## References

- Realistic-environmental-lighting spec (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- Implementation plan (`docs/plans/2026-07-02-realistic-lighting-slice-1a-solar-provider-and-sky.md`),
  including the locked decisions this slice kept and the one it deviated from.
- NOAA solar calculator (https://gml.noaa.gov/grad/solcalc/), the published formulas
  `solarPosition` implements.
- [[ADR-0065-three-dimensional-lighting-and-color-temperature]] and
  [[ADR-0079-three-dimensional-lighting-legibility]] (the rig, the seam, and the balance this
  slice builds on and partly supersedes).
- [[ADR-0139-plan-to-world-orientation]] (the plan-to-world frame the sun direction composes
  with).
- [[ADR-0142-color-managed-renderer]] (slice 0's renderer color management).
- [[ADR-0143-environment-model-foundations]] (slice 0's site, timezone, and observation-time
  model).
