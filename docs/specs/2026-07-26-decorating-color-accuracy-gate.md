# Decorating color-accuracy gate (slice specification)

> Status: draft for review. Date: 2026-07-26. Author: Dan Moore.
> Relationship to the epic: the headline acceptance of slice 3 of the
> realistic-environmental-lighting spine (`docs/specs/2026-07-01-realistic-environmental-lighting.md`,
> acceptance lines 243-245), after the physical material provider was wired into the live view
> (PR #509). Closes the color-gate task of issue #449. Builds on the calibration convention in
> ADR-0156.

## Mission

A renovator picks a paint color and expects to see that color. Slice 3 made `finishId` live, so a
solid paint now renders through `MeshPhysicalMaterial` under daylight image-based lighting. What is
still unproven is the thing the epic leads with: that a known paint color, rendered under the
neutral daylight reference condition, actually reads as that color rather than a tinted or
tone-skewed cousin of it.

This slice adds the gate that proves it. It renders a small set of known paint swatches under the
color-check reference condition and asserts that each sampled surface reads within a stated
tolerance of its reference swatch. The gate is the epic's headline acceptance, so it exercises the
real renderer end to end rather than a model of it: a regression in the illuminant path, the
tone-mapping operator, or the color-managed output would move a sampled color and fail the gate.

## Scope

In scope:

- Three known mid-range paint swatches, defined once in `core/`, that the gate renders and samples.
- A `core/` color-accuracy predicate: given a sampled color and a reference swatch, is the
  perceptual difference within tolerance. It reuses the existing OKLab difference metric.
- The empirical tolerance, derived from the observed cross-backend spread and pinned as a named
  `core/` constant with the reasoning recorded.
- A harness paint mode that paints the shell floor an arbitrary swatch color, so the gate can render
  each matrix swatch on the one canonical fully-lit surface without disturbing the committed
  `paint=demo` baseline.
- A `scene-webgl` end-to-end gate that renders each swatch under `scene=color-check`, samples the
  lit floor, converts the sample to OKLab, and asserts the difference is within tolerance. It
  self-skips without WebGPU, like the other live-view specs.
- ADR-0157, recording the gate's mechanism, metric, tolerance derivation, and swatch set, and
  citing ADR-0156 for the reference condition it measures under.

Out of scope:

- Any change to the shipped lighting rig. The reference condition is fixed by ADR-0156; the sun
  intensity, the ambient probe, and the default exposure are not touched. A gate that could only
  pass by moving those numbers would be revising ADR-0156, not implementing its gate.
- Tone-mapping extremes. Near-white and near-black swatches sit where the operator's shoulder and
  toe compress value, so a raw-albedo round-trip is not promised there (ADR-0156 promises it for the
  mid-range). Exercising the shoulder and toe is a separate, harder assertion and is deferred to a
  follow-up issue.
- A committed pixel baseline of the swatches. The gate asserts a color value within a tolerance, not
  an unchanged image, so it commits no new screenshot.
- CIELAB and the deltaE2000 metric. The gate uses the repo-native OKLab metric; the reasoning and
  the migration path are recorded below.
- Finish accuracy. That a paint renders with its finish rather than a default roughness is the other
  slice-3 acceptance and is already carried by the live finish provider; the swatches here are matte
  so that specular highlights do not contaminate the diffuse color sample.

## The reference condition

The gate measures under one fixed condition, the one ADR-0156 records and the shipped rig already
embodies: the sun at `DAYLIGHT_SUN_INTENSITY` with the sky-derived probe ambient held at its noon
value, exposure 1, Khronos PBR Neutral tone mapping, and the color check active so the sun and sky
tints are neutralized to the reference white. The harness expresses this exactly as the shipped
`color-check` environment state (`app/harness-environment.ts`): the canonical site, the
March-equinox civil-noon instant, realistic lighting, and `colorCheck: true`.

Because the color check neutralizes the illuminant to white, a correct pipeline introduces no hue of
its own. A rendered swatch should therefore carry the swatch's hue unchanged and differ from the
swatch only in the value the daylight sets. That invariant is what the gate leans on: under a
neutral illuminant, hue and chroma are the accuracy that a wrong path would break, and the gate is
tuned to catch exactly that break.

## The swatch matrix

The gate renders three swatches, chosen to span the failure modes while staying in the range where
the reference condition promises a faithful reproduction.

| Swatch           | sRGB      | What a failure here reveals                                                        |
| ---------------- | --------- | ---------------------------------------------------------------------------------- |
| Neutral mid-gray | `#808080` | white-balance drift and a value round-trip error: a neutral must stay neutral.     |
| Warm saturated   | `#cc6633` | an illuminant double-tint on the warm side: a light-color leak shifts the hue.     |
| Cool saturated   | `#3f7f5f` | the same double-tint on the cool side, where a warm cast desaturates most visibly. |

The warm and cool swatches reuse the two colors the shipped `paint=demo` harness already paints, so
the matrix stays grounded in colors the project has rendered before; the neutral gray is added for
the white-balance check. All three sit in the tone-mapping operator's roughly linear mid-range, so
"the sample reads as the swatch" is a fair statement for every member of the set. Near-white and
near-black are deliberately left out, per the scope note above.

Each swatch is painted with a matte finish. A glossy finish would add a specular highlight that
skews the sampled color away from the diffuse albedo the gate is checking, and finish accuracy is a
separate acceptance. Matte isolates the color question.

## The canonical fully-lit surface

The three swatches are sampled on one surface under one lighting geometry, so "reads as the swatch"
means the same thing for each. The shell floor is that surface: at the equinox-noon reference
instant the sun stands high and nearly south, so the horizontal floor takes the most direct,
most uniform illumination of any surface in the shell, and it carries no grazing falloff the way a
vertical wall does. A wall would read darker and less uniformly and would make each swatch's target
depend on its own orientation.

One floor holds one color, so the gate renders the matrix one swatch at a time: it navigates to the
harness with the swatch painted on the floor, settles the frame, samples, and repeats for the next
swatch. Three renders in one spec is in line with the existing solar and visual-regression specs,
which each capture several states.

To paint the floor a chosen color, the harness gains a paint mode that reads a swatch color from the
query string and paints the shell floor (`floor:demo`) that color with a matte finish. The existing
`paint=demo` mode and its committed `scene-shell-painted` baseline are left untouched, so the gate
adds no baseline churn.

## Sampling and the metric

The gate reads the settled canvas the same way the other live-view specs settle it, then samples a
patch at the center of the floor, away from wall-shadow edges, and averages the patch to one sRGB
triple. Averaging a patch rather than reading a single pixel damps per-pixel renderer noise. The
sample is read by drawing the live canvas onto a 2D canvas in the page and reading `getImageData`,
which yields the displayed 8-bit sRGB without a screenshot round-trip and needs no image-decoding
dependency.

The sampled sRGB and the reference swatch are compared in OKLab with the difference metric core
already exports, `perceptualDistance` (the Euclidean OKLab delta). The whole codebase reasons in
OKLab already, for color mixing, nearest-color, palettes, and contrast, so the gate introduces no
second color space. OKLab was designed so Euclidean distance approximates perceptual difference, so
the metric is a genuine perceptual delta rather than a stand-in, and it catches the differences that
matter here: an illuminant double-tint and a wrong tone-mapping operator both move the OKLab chroma
axes, and a color-space or gamma error moves value grossly.

The industry-standard alternative, CIEDE2000 in CIELAB, is more accurate near gamut boundaries and
is the vocabulary a color professional expects for faithful color matching against a physical paint
reference. It is not adopted here: it would add a CIELAB and D65 conversion the repo does not have,
used by this one gate, for accuracy the gate does not need to catch a render regression. The gate
reads its metric through the single `perceptualDistance` seam, so if a later feature genuinely needs
industry-unit color matching, a CIEDE2000 metric is added to `core/` then and the gate migrates by
changing one call, re-deriving its tolerance against the new metric.

## The tolerance

The pass tolerance is not guessed; it is measured. During implementation the neutral-gray swatch is
sampled on both render backends the project uses, darwin's Metal locally and linux's SwiftShader on
the CI runner, and the tolerance is set to the observed maximum cross-backend difference plus a
margin. This is the honest way to draw the line between renderer nondeterminism, which the color-
temperature spec avoids by never asserting exact pixels, and a real color error, which this gate
must catch. A provisional ceiling of about `0.05` in OKLab distance (a few just-noticeable
differences) is the starting expectation; the committed number is whatever the measurement supports,
pinned as a named `core/` constant with its derivation in a comment and in ADR-0157.

## The round-trip assumption, and what happens if it does not hold

The gate's reference for each swatch is the swatch's assigned albedo, and the pass condition is that
the sampled lit surface reads within tolerance of it. That is only fair if the reference condition
reproduces a mid-range albedo close to itself, which is exactly what ADR-0156 claims the rig is
tuned to do. This slice does not take that on faith.

The first implementation step measures it: sample the neutral mid-gray on the fully-lit floor and
compare the reading to the gray's own albedo. If the difference is small, the round-trip holds, the
reference is the raw albedo, and the gate proceeds as written. If a systematic offset appears,
beyond the small margin a round-trip would leave, the gate is not quietly widened to swallow it.
That offset is a finding: either the rig or the provider does not reproduce a mid albedo the way
ADR-0156 asserts, which is a calibration question for the owner and an ADR-0156 revision, or the
reference must be defined as the expected rendered value rather than the raw albedo, which is a
change to what the gate means and is also the owner's call. Loosening the tolerance to hide a
systematic error is explicitly not an option, since it would leave a headline gate that proves
nothing.

## What core owns and what the end-to-end owns

The split follows the epic's testing plan, which unit-tests pure-core color logic and covers
rendering on the CI runner.

Core owns the numbers and the judgment: the three swatch definitions, the `perceptualDistance`-based
within-tolerance predicate, and the tolerance constant. These are unit-tested with color round-trips
(a swatch compared to itself is within tolerance; a swatch visibly shifted in hue or value is not),
so the metric and the threshold are verified without a renderer.

The end-to-end gate owns the render and the sample: it drives the harness to the reference condition
with each swatch, reads the lit floor, and feeds the sample and the reference through the core
predicate. It runs in the `scene-webgl` Playwright project and self-skips where WebGPU is absent, so
it is the CI runner's job and does not block the unit suite.

## Which baselines move

None of the committed screenshot baselines move. The gate asserts a sampled color against a
tolerance rather than an image against a baseline, so it commits no new screenshot, and it paints
through a new harness mode that leaves `paint=demo` and its `scene-shell-painted` baseline alone. The
only new render surface is the gate's own transient renders, which are sampled and discarded.

## Acceptance

- Three known mid-range swatches are defined in `core/` and rendered by the gate: a neutral mid-gray,
  a warm saturated color, and a cool saturated color.
- A `core/` predicate reports whether a sampled color is within the tolerance of a reference swatch,
  measured as the OKLab `perceptualDistance`, and is unit-tested with a same-color pass and a
  shifted-color fail.
- The tolerance is a named `core/` constant whose value is the measured cross-backend spread plus a
  margin, with the derivation recorded in a comment and in ADR-0157.
- A harness paint mode paints the shell floor an arbitrary swatch color with a matte finish, without
  changing `paint=demo` or its committed baseline.
- The `scene-webgl` gate renders each swatch under `scene=color-check`, samples the fully-lit floor,
  and asserts the sample is within tolerance of the swatch. It self-skips without WebGPU and commits
  no pixel baseline.
- The neutral-gray round-trip is measured before the tolerance is set; a systematic offset is
  surfaced to the owner rather than absorbed by the tolerance.
- The gate passes on the CI `scene-webgl` (linux) lane and locally on darwin.

## Knowledge and Architecture Decision Records

ADR-0157 records this gate: the hybrid render-and-sample mechanism and why not a pure-core analytic
model or a committed pixel baseline, the OKLab metric and why not CIEDE2000, the empirical tolerance
derivation, and the mid-range swatch set. It cites ADR-0156, which fixes the reference condition the
tolerance is measured under and which explicitly defers the tolerance and its color space to this
slice. If the round-trip measurement forces a rig or reference change, that lands as an ADR-0156
revision in the same change, per ADR-0156's own rule that any move to its calibration updates it.

## References

- Realistic-environmental-lighting epic and slice 3 acceptance
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`, lines 243-245); issue #449.
- ADR-0156 (luminance-calibration convention: the reference condition, Neutral tone mapping, the
  relative rather than photometric calibration, and the deferral of the tolerance to this slice).
- ADR-0147 (per-mode tone mapping: Neutral for the color check, AgX for realistic), ADR-0148 (the
  sky-derived ambient probe), ADR-0130 (the finishes registry), ADR-0067 (the material-provider
  seam), ADR-0065 (the illuminant color lives in the light, not the albedo).
- `core/color/oklab.ts`, `core/color/operations.ts` (`perceptualDistance`), `core/color/color.ts`
  (`colorFromHex`).
- `core/environment/color-check.ts`, `app/harness-environment.ts` (the `color-check` state),
  `app/app.tsx` (the harness paint resolution), `engine/materials/physical-material-provider.ts`.
- `e2e/tests/scene-helpers.ts`, `e2e/tests/scene-color-temperature.spec.ts` (the settled-frame,
  semantic-assertion pattern the gate follows).
