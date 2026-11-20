---
slug: decisions/ADR-0147-per-mode-tone-mapping
title: 'ADR-0147: Tone-mapping operator follows the lighting mode'
type: decision
tags:
  [
    architecture,
    engine,
    renderer,
    color-management,
    tone-mapping,
    lighting,
    3d-preview,
    environment,
  ]
related:
  [
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
  ]
sourceFiles:
  [
    core/environment/tone-mapping.ts,
    engine/renderer/tone-mapping.ts,
    engine/renderer/create-renderer.ts,
    bridge/react/scene-lighting.tsx,
    bridge/react/scene-renderer-canvas.tsx,
  ]
status: current
updated: 2026-11-20
---

# ADR-0147: Tone-mapping operator follows the lighting mode

## Status

Accepted, landed in slice 1b of the realistic-environmental-lighting epic. Amends
[[ADR-0142-color-managed-renderer]], which fixed the operator at Khronos PBR Neutral for every
render. The operator is now chosen per lighting mode at runtime; renderer creation still seeds
Neutral.

## Context

ADR-0142 picked Khronos PBR Neutral because it compresses only highlights and leaves base color
alone, and color accuracy is the headline goal of the epic. That reasoning was written when the
only rig was the schematic one, whose intensities sit comfortably inside display range.

Slice 1a brought the solar provider. A real daylight scene is nothing like the schematic rig:
direct sun at `DAYLIGHT_SUN_INTENSITY` against a dim sky ambient spans a dynamic range that
Neutral, by design, barely touches. Interiors lit by a low sun blow out at the window wall while
the rest of the room sits in near-black, and no single exposure value fixes both ends. An
end-to-end review of the epic settled the split: realistic mode renders through AgX, the
wide-dynamic-range operator three.js ships alongside Neutral, while the schematic mode and the
color check keep the hue-accurate operator.

## Decision

The operator becomes a per-mode choice with one owner per layer:

- `core/environment/tone-mapping.ts` owns the policy. `toneMappingOperatorFor(mode, colorCheck)`
  returns `'agx'` for realistic mode and `'neutral'` for schematic mode, and returns `'neutral'`
  in both modes while the color check is on. The type `ToneMappingOperator` is a domain string
  union; core stays free of three.js.
- `engine/renderer/tone-mapping.ts` owns the translation. `applyToneMappingOperator` maps the
  domain operator to three's `AgXToneMapping` or `NeutralToneMapping` and writes it to the
  renderer. The renderer factory (`constructSceneRenderer` in `create-renderer.ts`) seeds its initial Neutral through this same helper, so the
  domain-to-constant mapping has exactly one owner.
- `bridge/react/scene-lighting.tsx` owns the wiring. A layout effect applies the chooser's
  result to the live renderer, keyed on the renderer, the effective mode, and the color check.
  The effective mode is what the render actually shows: a realistic request without a site
  location falls back to the schematic provider, and the operator falls back with it.

## Rationale

AgX exists for exactly the failure Neutral has here: it rolls a wide scene range into display
range with a stable, film-like shoulder, so a sunlit interior reads as a photograph instead of a
clipped white patch. Its known cost is hue drift as surfaces brighten, which is the very thing
ADR-0142 refused to accept. Splitting by mode keeps both goals: the schematic mode is where
paint decisions happen, so it keeps the hue-preserving operator; realistic mode is where sun and
shadow legibility matter most, so it takes the filmic curve.

The color check overrides the mode because its whole purpose is reading a paint under a
white-balanced reference. Forcing Neutral there means a color check taken in realistic mode
shows the same unskewed hue a schematic check shows, so the two modes cannot disagree about what
color a wall is painted.

Keying the wiring on the effective mode rather than the requested one keeps the fallback
coherent: when realistic lighting cannot run, nothing about the render should change except what
the missing-location notice explains.

## Consequences

- ADR-0142's statement that the operator is fixed no longer holds; that ADR now governs the
  output color space, the exposure option, and the creation-time seed, and carries an amendment
  note pointing here.
- Realistic-mode visual baselines change when AgX applies, so the scene-solar captures
  regenerate on the CI hardware tier along with the other slice-1b baselines.
- The color check renders identically hue-wise in both modes, which the canonical `color-check`
  harness state pins visually.

## References

- Realistic-environmental-lighting spec, slice 1b
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0142-color-managed-renderer]] (the fixed-operator decision this amends).
- [[ADR-0144-solar-lighting-provider-and-sky]] (the solar rig whose dynamic range motivated the
  split).

## Amendment 2026-11-16: realistic mode no longer needs a site location

Two passages describe a fallback that is gone. Under Decision, the wiring paragraph says that a
realistic request without a site location falls back to the schematic provider and that the
operator falls back with it. Under Rationale, the last paragraph says that keying on the effective
mode keeps that fallback coherent, with the missing-location notice as the only visible change.
Neither holds now. `effectiveLightingMode(realistic)` in `bridge/react/effective-lighting-mode.ts`
takes the realistic flag and no site, so the effective mode follows the user's choice alone. A
project with no location renders realistic lighting at the sample site of
[[ADR-0193-sample-daylight-for-a-project-with-no-site-location]] and takes AgX like a located one.
The Environment panel shows a sample daylight notice in place of the missing-location notice.

The rest stands. The layout effect in `bridge/react/scene-lighting.tsx` is still keyed on the
renderer, the effective mode, and the color check, and `toneMappingOperatorFor` keeps its policy:
AgX in realistic mode, Neutral in schematic mode, and Neutral in both while the color check is on.

## Amendment 2026-11-20: one runtime owner of the operator

The creation seed is not what the canvas first shows. The 3D library writes the renderer's tone
mapping once while it configures the canvas, after the factory in
`engine/renderer/create-renderer.ts` has seeded Neutral. `bridge/react/scene-renderer-canvas.tsx`
now passes `flat` to its one library Canvas, and the prop is omitted from
`SceneRendererCanvasProps`, so callers cannot override it. With `flat` the library's write is the
identity operator, so it never becomes the visible one.

`SceneLighting` is the single runtime owner of the visible operator. Its layout effect in
`bridge/react/scene-lighting.tsx` runs after the library's write, because the library renders the
canvas children only once configure has resolved. The final operator in every mode is unchanged, so
no picture moves. `bridge/react/scene-canvas-tone-mapping.test.tsx` pins both halves: the library
leaves the identity, and the operator after mount and after a re-render is the per-mode one. The
Decision bullet on the seed still holds, since the factory keeps the one domain-to-constant mapping.
