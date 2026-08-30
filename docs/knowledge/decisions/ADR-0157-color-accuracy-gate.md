---
slug: decisions/ADR-0157-color-accuracy-gate
title: 'ADR-0157: Color-accuracy gate: render a known swatch and sample it against an OKLab tolerance'
type: decision
tags:
  [architecture, engine, renderer, testing, color-management, materials, environment, 3d-preview]
related:
  [
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0168-tone-map-extreme-color-gate,
  ]
sourceFiles:
  [
    core/color/color-accuracy.ts,
    app/harness-paint.ts,
    app/harness-environment.ts,
    e2e/tests/scene-color-accuracy.spec.ts,
    e2e/tests/scene-helpers.ts,
  ]
status: current
updated: 2026-08-17
---

# ADR-0157: Color-accuracy gate: render a known swatch and sample it against an OKLab tolerance

## Status

Current. This gate is the headline acceptance of slice 3 of the realistic-environmental-lighting
epic (#449), and it ships with this change. The design was set by the owner-approved slice
specification (`docs/specs/2026-07-26-decorating-color-accuracy-gate.md`), which
[[ADR-0156-luminance-calibration-convention]] deferred the tolerance and its color space to. The
owner delegated the round-trip judgment (below) to this session. Two points where the running gate
departs from the specification's literal prose are recorded in the Decision section as refinements,
not as new design.

## Context

Slice 3 made a paint color live: a solid finish now renders through the physical material provider
under daylight image-based lighting (#449, [[ADR-0067-three-dimensional-painted-preview]],
[[ADR-0130-finishes-system-architecture]]). The epic leads with a stronger claim than "a color
renders." It claims that a known paint color, seen under the neutral daylight reference condition,
reads as that color rather than a tinted or tone-skewed cousin of it. Nothing proved that yet.

[[ADR-0156-luminance-calibration-convention]] fixed the reference condition the claim is measured
under: the sun at its shipped intensity with the sky-derived probe ambient held at noon, exposure 1,
Khronos PBR Neutral tone mapping, and the color check neutralizing the illuminant to white. It
explicitly left two things to this slice: the pass tolerance and the color space the tolerance is
stated in.

The open question was how to test the claim without lying about it. A tolerance set too loose passes
a genuinely wrong color; a tolerance set to chase exact pixels fails on ordinary renderer
nondeterminism across backends. The gate has to draw that line from measurement, not from a guess.

## Decision

1. The gate renders and samples the real pipeline end to end. It paints a known swatch on the shell
   floor, drives the real renderer to the reference condition through the deterministic scene harness,
   samples the lit floor, and compares the sample to the swatch. It does not model the pipeline in
   pure `core/`, and it commits no pixel baseline. A `core/` analytic model would re-implement the
   illuminant, tone-mapping, and color-managed-output math the renderer already runs, so it could
   agree with a buggy renderer and prove nothing. A committed PNG baseline would assert an unchanged
   image, which every legitimate cross-backend pixel difference breaks; this gate asserts a color
   value within a tolerance instead, so it commits no screenshot.

2. The metric is the OKLab `perceptualDistance` core already exports, read through one seam. The
   sampled sRGB and the reference swatch are compared as the Euclidean OKLab distance the codebase
   already uses for mixing, nearest-color, palettes, and contrast, and the gate reads it through that
   single `perceptualDistance` call. CIEDE2000 in CIELAB is the vocabulary a color professional expects for
   matching against a physical paint reference, and it is more accurate near gamut boundaries, but
   it would add a CIELAB and D65 conversion the repository does not carry, used by this one gate, for
   accuracy the gate does not need to catch a render regression. Because the gate reads through the
   single seam, a later feature that genuinely needs industry-unit matching can add a CIEDE2000
   metric to `core/`, and this gate migrates by changing one call and re-deriving its tolerance.

3. The pass tolerance is `COLOR_ACCURACY_TOLERANCE = 0.06`, measured across both backends rather than
   guessed. The three swatches were rendered on the shell floor under the
   reference condition and sampled on both backends the project uses. The sampled OKLab distances
   were byte-identical on darwin Metal and linux SwiftShader, with zero cross-backend spread: warm
   0.0271, gray 0.0409, cool 0.0447. The tolerance is the observed maximum (0.0447) plus a margin for
   future render drift, rounded to 0.06. That sits at a few just-noticeable differences, so a real
   hue error or a gross value error fails while the expected lit-floor value offset passes. The
   derivation lives with the constant so a later reader can see where the number came from.

4. The gate renders three mid-range swatches: a neutral mid-gray (`#808080`), a warm saturated color
   (`#cc6633`), and a cool saturated color (`#3f7f5f`), all matte so a specular
   highlight does not contaminate the diffuse sample. The neutral catches white-balance drift; the
   warm and cool catch an illuminant double-tint on either side of neutral, and they reuse the two
   colors the shipped `paint=demo` harness already paints. All three sit in the tone-mapping
   operator's roughly linear mid-range, so "the sample reads as the swatch" is a fair statement for
   each. Near-white and near-black land on the operator's shoulder and toe, where value is
   compressed and a raw-albedo round-trip is not promised; that harder assertion is deferred to a
   follow-up issue rather than folded into this gate. (Since resolved:
   [[ADR-0168-tone-map-extreme-color-gate]] adds that tier.)

5. Each swatch's reference is its raw assigned albedo, and the pass condition is that the lit sample
   reads within tolerance of it. That is only
   fair if the reference condition reproduces a mid albedo close to itself, which is what
   [[ADR-0156-luminance-calibration-convention]] claims. This slice measured it rather than assuming
   it: the neutral gray comes back hue-neutral (`#747474`, red, green, and blue equal) and about nine
   percent darker in value, which is correct lit-floor behavior and not a hue error, and every
   swatch's offset stays under the tolerance. So the reference stays the raw albedo and
   [[ADR-0156-luminance-calibration-convention]] is not revised. Had a systematic offset appeared, it
   would have been surfaced to the owner as a calibration finding, not absorbed by widening the
   tolerance.

6. The running gate refines two details of the specification's literal prose. The specification,
   written before the gate ran, describes two things the implementation adjusted:
   - The self-skip guards on WebGL 2, not WebGPU. The live view runs on WebGPU, and the
     specification carried that phrasing over. The gate does not run on the live view; it renders
     through the deterministic scene harness, which uses the WebGL backend, and it must run on the
     linux CI lane so the cross-backend measurement in choice 3 exists at all. Guarding on WebGPU
     would skip the linux lane and erase that measurement. The gate therefore self-skips only where
     no WebGL 2 context is available.
   - A dedicated top-down camera frames the closed shell. The shell fixture is a closed box (floor,
     four walls, and a ceiling), so the reference condition's exterior auto-frame hides the floor
     behind the walls and leaves only a sliver of it in view. The gate adds a `color-accuracy`
     harness state whose only difference from `color-check` is an interior camera that stands under
     the ceiling above the floor center and looks straight down, so a center sample patch is
     unambiguously floor. Only the camera differs. The reference lighting, exposure, and operator
     from [[ADR-0156-luminance-calibration-convention]] are unchanged, and the state commits no
     screenshot baseline.

The split of ownership follows the epic's testing plan. `core/` owns the swatch definitions, the
within-tolerance predicate, and the tolerance constant, unit-tested with a same-color pass and a
shifted-color fail. The `scene-webgl` end-to-end gate owns the render and the sample, and feeds both
through the `core/` predicate.

## Rationale

Rendering and sampling the real pipeline is what makes this the epic's headline acceptance rather
than a restatement of the material provider's unit tests. A regression in the illuminant path, the
tone-mapping operator, or the color-managed output moves a sampled color and fails the gate, which
is exactly the class of bug the epic promises to hold the line on.

Measuring the tolerance rather than guessing it is the honest way to separate two things that a
strict pixel assertion would conflate: renderer nondeterminism, which is not a defect, and a real
color error, which is. The cross-backend measurement gave a clean answer here, since darwin and
linux agreed to the byte, so the margin covers future drift rather than present disagreement.

Staying in OKLab keeps the codebase reasoning in one color space and avoids a second conversion that
only this gate would use, while the single-seam design leaves the door open to CIEDE2000 if a real
color-matching feature ever needs it. The refinements in choice 6 keep the gate faithful to
[[ADR-0156-luminance-calibration-convention]]'s reference condition while making it actually
runnable on the geometry and backend it has, which the specification's earlier phrasing would have
blocked.

## Consequences

- The epic's headline claim is now enforced on the CI `scene-webgl` (linux) lane and locally on
  darwin, and it self-skips cleanly where no WebGL 2 context exists.
- The gate commits no new screenshot baseline and leaves `paint=demo` and its `scene-shell-painted`
  baseline untouched, so it adds no baseline churn.
- A future color-matching feature that needs industry-unit accuracy migrates the metric by adding a
  CIEDE2000 distance to `core/` and changing the one `perceptualDistance` call the gate reads
  through, then re-deriving the tolerance against the new metric.
- The near-white and near-black tone-map-extreme colors are left unproven by design and are tracked
  as a follow-up, so the shoulder and toe of the operator are a known gap rather than a silent one.
- If a later change to the sun intensity, the fill level, the probe derivation, or the default
  exposure moves the gate's target, that is an [[ADR-0156-luminance-calibration-convention]] revision
  that re-derives this tolerance, not an incidental constant edit.

## References

- Decorating color-accuracy gate slice specification
  (`docs/specs/2026-07-26-decorating-color-accuracy-gate.md`) and its plan
  (`docs/plans/2026-07-26-decorating-color-accuracy-gate.md`).
- Realistic-environmental-lighting spec, slice 3
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`); issue #449.
- [[ADR-0156-luminance-calibration-convention]] (the reference condition; defers the tolerance and
  color space to this gate).
- [[ADR-0147-per-mode-tone-mapping]] (Neutral for the color check, AgX for realistic).
- [[ADR-0148-visible-sky-and-sh-light-probe]] (the sky-derived ambient probe the interior floor is
  lit by).
- [[ADR-0130-finishes-system-architecture]] (the finishes registry the matte swatches paint
  through).
- [[ADR-0067-three-dimensional-painted-preview]] (the material-provider seam the live paint renders
  through).
- [[ADR-0065-three-dimensional-lighting-and-color-temperature]] (the illuminant color lives in the
  light, not the albedo).
- `core/color/color-accuracy.ts` (swatches, tolerance, predicate), `core/color/operations.ts`
  (`perceptualDistance`), `core/color/oklab.ts` (`srgbToOkLab`).
- `app/harness-paint.ts` (`resolveHarnessPaint`), `app/harness-environment.ts` (the `color-accuracy`
  state and its camera), `e2e/tests/scene-color-accuracy.spec.ts` and `e2e/tests/scene-helpers.ts`
  (`sampleCanvasColor`).
