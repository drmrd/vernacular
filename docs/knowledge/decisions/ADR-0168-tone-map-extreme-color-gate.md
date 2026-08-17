---
slug: decisions/ADR-0168-tone-map-extreme-color-gate
title: 'ADR-0168: Tone-map-extreme color gate: a two-tier reference for the operator shoulder and toe'
type: decision
tags: [architecture, engine, renderer, testing, color-management, 3d-preview]
related:
  [
    decisions/ADR-0157-color-accuracy-gate,
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0164-perceived-color-readout,
  ]
sourceFiles:
  [core/color/color-accuracy.ts, e2e/tests/scene-color-accuracy.spec.ts, app/harness-environment.ts]
status: current
updated: 2026-08-17
---

# ADR-0168: Tone-map-extreme color gate: a two-tier reference for the operator shoulder and toe

## Status

Current. This closes the deferral that [[ADR-0157-color-accuracy-gate]] recorded in its decision 4
and that issue #512 tracks: the color-accuracy gate now covers near-white and near-black, the two
regions where the tone-mapping operator compresses value. The design was settled by measurement
before any constant was written; the measurement is recorded below.

## Context

The mid-range gate ([[ADR-0157-color-accuracy-gate]]) proves that a known paint, rendered under the
neutral reference condition of [[ADR-0156-luminance-calibration-convention]], reads as itself. That
proof deliberately stopped at the mid-range. Near-white and near-black sit on the operator's
shoulder and toe, where PBR Neutral compresses value, and the raw-albedo round trip was never
promised there. Issue #512 asked for the harder assertion.

Rather than guess at references and tolerances, this slice ran a measurement sweep first: seven
neutral-leaning swatches spanning the boundary regions, rendered under the same `color-accuracy`
harness condition as the mid-range gate, five runs per swatch, on both backends the project uses.
Every run was byte-identical, every 24-pixel sample patch was perfectly uniform, and darwin Metal
and linux SwiftShader agreed to the byte on every swatch, repeating the determinism the mid-range
measurement found. A closed-form reimplementation of the operator, written only to explain the
numbers, matched every rendered sample within one 8-bit least-significant bit.

The sweep (identical on both backends; distances are OKLab `perceptualDistance` from the paint):

| paint     | rendered  | distance from paint | model prediction | model delta |
| --------- | --------- | ------------------- | ---------------- | ----------- |
| `#fafaf5` | `#eeeee9` | 0.0360              | `#eeeee9`        | exact       |
| `#f0f0ea` | `#e9e9e3` | 0.0211              | `#e9e9e3`        | exact       |
| `#e8e8e2` | `#e3e3dd` | 0.0152              | `#e2e2dc`        | +1 LSB      |
| `#505050` | `#393939` | 0.0867              | `#383838`        | +1 LSB      |
| `#333333` | `#141414` | 0.1298              | `#141414`        | exact       |
| `#262626` | `#080808` | 0.1342              | `#080808`        | exact       |
| `#1a1a1a` | `#030303` | 0.1209              | `#020202`        | +1 LSB      |

The mechanism is visible in the shipped operator source (`NeutralToneMapping` in three.js,
`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`). The
operator subtracts an offset from every channel: a fixed 0.04 pedestal when the minimum linear
channel is at or above 0.08, and `x - 6.25x^2` below that knee, which crushes darks quadratically.
The shoulder compresses peaks above `StartCompression = 0.8 - 0.04 = 0.76` with a desaturating
blend toward the new peak.

Two findings follow. First, the round-trip boundary is asymmetric: the promise holds through the
entire white end (`#f0f0ea` reads 0.0211 from its own albedo, inside even the mid-range tolerance)
and breaks well before black (`#505050` already reads 0.0867, and `#262626` reads 0.1342, more
than twice the mid-range tolerance). Second, [[ADR-0142-color-managed-renderer]]'s statement that
PBR Neutral "keeps base color intact and compresses only the highlights" is right about hue but
wrong about dark values: the pedestal and the quadratic toe compress the darks too. This ADR is
the record of that correction.

## Decision

1. The gate gains a tone-map-extreme tier with a two-tier reference. Each extreme swatch carries
   its own pass reference. Near-white `#f0f0ea` keeps the raw-albedo reference, because the
   measurement shows the round trip holds at the white end. Near-black `#262626` is judged against
   the pinned measured render `#080808`, because the toe makes a raw-albedo round trip impossible
   for any operator behaving as designed. Pinning the expected rendered value is exactly the escape
   hatch the slice specification contemplated for a reference the albedo cannot serve, applied only
   to the toe. [[ADR-0156-luminance-calibration-convention]] is not revised: its mid-range claim
   was re-confirmed by the boundary rows, and the extremes were never inside its promise.

2. The tier's swatches are `#f0f0ea` and `#262626`, chosen so each genuinely exercises its region.
   `#f0f0ea`'s peak linear channel is 0.867, above the 0.76 shoulder start, so the shoulder
   actually acts on it. `#262626`'s minimum linear channel is 0.0193, below the 0.08 toe knee, so
   the quadratic crush actually acts on it. Issue #512's literal example `#1a1a1a` is not a gate
   swatch: it renders `#030303`, about three least-significant bits of signal, where a single bit
   step is 0.0098 to 0.0123 in OKLab, so a pass there would mostly measure quantization. It stays
   in the boundary table above as a measured record.

3. The tier's tolerance is `TONE_MAP_EXTREME_TOLERANCE = 0.04`, derived, not guessed:
   round-up-to-two-decimals of max(0.0211, the measured near-white distance; 0.0104, the two-LSB
   quantization floor at the `#080808` pin) plus 0.0153, the drift margin the mid-range precedent
   established (its 0.06 tolerance minus its 0.0447 observed maximum). It is deliberately tighter
   than the mid-range 0.06 because the near-black reference is a pinned render, so the expected
   distance at the pin is near zero and a loose ball would hide real drift.

4. Neutral swatches must stay neutral: `TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND = 0.01` caps the
   OKLab chroma (`hypot(a, b)`) of a sample whose swatch is marked `neutralHue`. The measured
   chroma at the near-black render is exactly zero on both backends. A two-LSB single-channel
   excursion measures 0.0047 and passes; a six-LSB blue cast (`#08080e`) measures 0.0134 and
   fails. The bound exists because a 0.04 distance ball around `#080808` has room for a visible
   tint that the distance check alone would pass, and hue neutrality is the strongest signal the
   toe leaves intact.

5. The closed-form operator model is a cross-check, never a pass or fail authority. The gate's
   verdict comes from rendering the real pipeline and sampling it, which upholds
   [[ADR-0157-color-accuracy-gate]] decision 1: a model can agree with a buggy renderer. The model
   earned its keep by matching every sweep render within one LSB, and its role is to explain the
   numbers and to sanity-check a future re-pin.

6. The near-black pin is coupled to the shipped operator implementation by design. A three.js
   upgrade that changes `NeutralToneMapping`, or any deliberate rig change under
   [[ADR-0156-luminance-calibration-convention]], moves the render and therefore the pin. The
   designed response is to re-run the measurement, move the pin, and amend this ADR's table in the
   same change, not to widen the tolerance.

## Rationale

Widening the tolerance to swallow the toe was the one option the slice specification explicitly
forbade, and the numbers show why: absorbing a 0.1342 offset needs a ball more than twice the
mid-range tolerance, at which point the gate passes almost anything dark and proves nothing. The
two-tier reference keeps the assertion honest on both ends: near-white still proves the raw-albedo
promise where it actually holds, and near-black proves the operator's toe stays put and stays
achromatic.

Judging the toe against the model instead of a pin was rejected because it would quietly promote
the model to authority. The pin is a measured fact of the shipped renderer; the model is an
explanation of it. Keeping the authority with the render preserves the gate's value as a
regression tripwire for the real pipeline, including the operator implementation itself.

The chroma bound earns its place as the cheapest strong assertion the toe leaves available. Value
is compressed at the extremes by design, so the gate cannot demand much of it; hue neutrality
under a neutralized illuminant is untouched by the operator's math on a gray input, so any chroma
at the sample is contamination, not tone mapping.

## Consequences

- The operator's shoulder and toe are now enforced on the CI `scene-webgl` lane and locally, with
  the same determinism the mid-range gate measured. Issue #512 closes.
- The near-black pin will move on a three.js operator change or a deliberate rig change; the
  re-pin procedure in decision 6 is the designed response, and the sweep table here is the
  baseline a re-pin diffs against.
- [[ADR-0142-color-managed-renderer]]'s "compresses only the highlights" phrasing is corrected by
  the record here; the original ADR text stands unedited as history unless the owner prefers an
  annotation there.
- [[ADR-0164-perceived-color-readout]]'s caveat about extremes narrows: a near-white readout's
  faithfulness is now backed by measurement, and a near-black readout reporting a shift is
  documented operator behavior, not an open question.
- The temporary measurement sweep spec used to gather the table is deleted with this change; this
  ADR is the durable record.

## References

- Issue #512 (near-white and near-black gate); the deferral in [[ADR-0157-color-accuracy-gate]]
  decision 4 and consequences.
- Slice specification `docs/specs/2026-07-26-decorating-color-accuracy-gate.md`, sections
  "Out of scope" (tone-mapping extremes) and "The round-trip assumption, and what happens if it
  does not hold" (the pinned-reference escape hatch).
- [[ADR-0156-luminance-calibration-convention]] (the reference condition; mid-range promise).
- [[ADR-0147-per-mode-tone-mapping]] (Neutral for the color check).
- [[ADR-0142-color-managed-renderer]] (the corrected highlights-only claim).
- [[ADR-0164-perceived-color-readout]] (the readout that inherits this gate's limits).
- `NeutralToneMapping`, three.js
  `src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` (pedestal, toe knee, and
  shoulder constants cited in the Context).
- `core/color/color-accuracy.ts` (the tier, tolerance, and chroma bound, with derivations in
  comments); `e2e/tests/scene-color-accuracy.spec.ts` (the extended gate).
