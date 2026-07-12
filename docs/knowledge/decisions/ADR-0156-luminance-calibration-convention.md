---
slug: decisions/ADR-0156-luminance-calibration-convention
title: 'ADR-0156: Luminance calibration convention for the color-accuracy gate'
type: decision
tags:
  [architecture, engine, renderer, lighting, color-management, materials, environment, 3d-preview]
related:
  [
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
  ]
sourceFiles:
  [
    engine/lighting/lighting-rig.ts,
    engine/lighting/sky-environment.ts,
    engine/renderer/create-renderer.ts,
    engine/renderer/tone-mapping.ts,
    core/registries/finishes.ts,
  ]
status: proposed
updated: 2026-07-12
---

# ADR-0156: Luminance calibration convention for the color-accuracy gate

## Status

Proposed, ahead of slice 3 of the realistic-environmental-lighting epic (physically based
materials and the color-accuracy gate, #449). The epic's headline gate asserts that a painted
surface reads within tolerance of its reference swatch; that assertion is only meaningful against
a fixed statement of what the render's luminance means. This ADR records the convention the
shipped rig already embodies so the gate anchors to it. Awaiting owner ratification.

## Context

The epic has carried an open debt since the spec landed: a calibration convention naming what the
sun intensity and exposure numbers mean, and what ambient-to-key relationship materials are tuned
against. Without it the gate would anchor to a bare constant, and a later lighting tweak could
move the target with nothing on record about the original intent.

The rig itself is already shipped and baselined across slices 0 through 2:

- The key light is a directional sun, white, at `DAYLIGHT_SUN_INTENSITY = 1.6` in linear light
  (`engine/lighting/lighting-rig.ts`). It is key-dominant by design ([[ADR-0079-three-dimensional-lighting-legibility]]):
  the sun sets the value of the faces it reaches so that faces at different angles separate in
  value instead of reading equally lit. In solar mode the provider scales it by the environment's
  `sunIntensity` scalar, which fades it toward and past the horizon
  ([[ADR-0144-solar-lighting-provider-and-sky]]).
- The ambient term takes one of two forms. The basic schematic rig uses a hemisphere fill at
  `FILL_INTENSITY = 0.5`, a sun-to-fill relationship of about 3.2 to 1. Solar mode zeroes that
  fill and replaces it with a spherical-harmonic light probe carrying the sky's own diffuse
  ambient, computed from the procedural sky rather than a constant
  ([[ADR-0148-visible-sky-and-sh-light-probe]]); keeping both would count the ambient twice.
- Exposure is 1 before tone mapping (`engine/renderer/create-renderer.ts`). The operator is
  chosen per mode ([[ADR-0147-per-mode-tone-mapping]]): hue-preserving Khronos PBR Neutral in
  schematic mode and whenever the color check is active, AgX in realistic mode.

The epic brainstorm floated a roughly 5-to-1 sun-to-sky relationship as an illustration. The
shipped basic rig is 3.2 to 1 and the solar rig's is sky-derived, so this ADR states the real
convention rather than that placeholder number.

## Decision

The color-accuracy gate is defined against a single reference condition, and materials are tuned
to reproduce known colors under it:

1. Reference lighting is neutral daylight: the sun at 1.6 with the sky-derived probe ambient of
   solar mode, held at its noon value with no horizon fade, exposure 1.
2. Reference tone mapping is Khronos PBR Neutral, the operator the color check already forces in
   both modes ([[ADR-0147-per-mode-tone-mapping]]). The gate reads color through the
   hue-preserving operator and never through AgX.
3. A surface's albedo is its assigned paint color carried into linear light. The illuminant color
   lives in the light, not the albedo ([[ADR-0065-three-dimensional-lighting-and-color-temperature]]),
   so a painted surface is shown under the illuminant rather than tinted twice. Finish roughness,
   sheen, and specular come from the finishes registry
   ([[ADR-0130-finishes-system-architecture]]) through the physical material provider (#449).
4. The convention is relative, not photometric. The values 1.6 and 0.5 are renderer-linear
   intensities, not candela. The gate therefore asserts a rendered sRGB value against a reference
   swatch within a tolerance rather than an absolute luminance. The tolerance and its color space
   belong to the gate slice (#449) and cite this ADR; what this ADR fixes is the lighting,
   exposure, and operator the tolerance is measured under.

Any change to the sun intensity, the fill level, the probe derivation, or the default exposure
moves the gate's target and updates this ADR in the same change.

## Rationale

Anchoring the gate to the shipped rig, rather than re-deriving an absolute photometric
calibration, keeps the headline test meaningful without reshooting every committed baseline. The
rig's numbers were chosen for legibility ([[ADR-0079-three-dimensional-lighting-legibility]]) and
validated visually across three slices. The gate's job is to catch a regression in how a known
color reproduces, and that needs a fixed reference condition, not an absolute one.

Reading the gate under Neutral rather than AgX follows from [[ADR-0147-per-mode-tone-mapping]]:
paint decisions happen under the hue-preserving operator, so the accuracy the gate measures is
the accuracy a renovator relies on. Measuring under AgX would fold the filmic hue drift into the
pass condition and let a genuinely wrong color slip through under the curve.

Stating the solar ambient as sky-derived, rather than a second constant, keeps the gate honest
about the indirectly-lit interior surface the epic requires. That surface is lit by the probe, so
the gate exercises the same indirect path a real interior uses
([[ADR-0148-visible-sky-and-sh-light-probe]]), and a probe regression surfaces as a color error
instead of passing in silence.

## Consequences

- The gate slice (#449) can state a tolerance against a fixed, documented condition. The
  tolerance number lives with the gate; the condition lives here.
- The physical material provider is tuned so a mid-range known albedo reproduces within the gate
  tolerance under this condition. That tuning is anchored rather than free-floating.
- A later move to a photometric model, or to a measured clear-noon sun-to-sky relationship, is a
  deliberate revision of this ADR that re-baselines the gate, not an incidental constant edit.
- The basic-rig 3.2-to-1 relationship and the solar probe derivation are now written down, so the
  retire-or-resurrect lighting questions the epic still tracks can be settled against a recorded
  baseline.

## References

- Realistic-environmental-lighting spec, slice 3
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0142-color-managed-renderer]] (output color space, exposure option, creation seed).
- [[ADR-0147-per-mode-tone-mapping]] (Neutral for the color check, AgX for realistic).
- [[ADR-0148-visible-sky-and-sh-light-probe]] (the sky-derived ambient probe).
- [[ADR-0144-solar-lighting-provider-and-sky]] (the solar rig and the sun-intensity fade).
- [[ADR-0079-three-dimensional-lighting-legibility]] (the key-dominant rig).
- [[ADR-0130-finishes-system-architecture]] (the finishes registry the gate tunes against).
