---
slug: decisions/ADR-0141-color-managed-renderer
title: 'ADR-0141: Color-managed renderer with Khronos PBR Neutral tone mapping'
type: decision
tags:
  [
    architecture,
    engine,
    renderer,
    color-management,
    tone-mapping,
    pbr,
    webgpu,
    3d-preview,
    lighting,
  ]
related:
  [
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0079-three-dimensional-lighting-legibility,
  ]
sourceFiles:
  [docs/specs/2026-07-01-realistic-environmental-lighting.md, engine/renderer/create-renderer.ts]
status: current
updated: 2026-07-02
---

# ADR-0141: Color-managed renderer with Khronos PBR Neutral tone mapping

## Status

Accepted, landed. The WebGPU scene renderer now sets its output color space and its
tone-mapping operator explicitly. Before this change it left tone mapping at the three.js
default (`NoToneMapping`) and never set an output color space at all. This is slice 0 of the
realistic-environmental-lighting epic (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).

## Context

`createSceneRenderer` in `engine/renderer/create-renderer.ts` is the one place that builds the
backend renderer. Color accuracy is a headline goal of the epic: a paint chosen in the palette
should read as the same color on a wall in the 3D view. Two renderer settings decide that. The
output color space controls how the linear render result is written to the framebuffer, and the
tone-mapping operator controls how values above display range are pulled back into it.

The renderer left both unset. `NoToneMapping` clips bright values instead of rolling them off,
and an unset output color space leans on the backend default rather than saying what is intended.

## Decision

`createSceneRenderer` sets three color-management properties after it constructs the renderer:

```ts
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = NeutralToneMapping
renderer.toneMappingExposure = options.toneMappingExposure ?? 1
```

`NeutralToneMapping` is Khronos PBR Neutral, available in three.js r184. `SRGBColorSpace` and
`NeutralToneMapping` are destructured from the existing lazy `await import('three/webgpu')`,
next to the renderer class and the shadow-map constant already read there. No static three
import is added, so the WebGPU build stays out of the test and server import graph, which is
why that import is lazy in the first place.

A new optional field, `SceneRendererOptions.toneMappingExposure`, exposes exposure to callers
and defaults to 1. The output color space and the tone-mapping operator are fixed; only exposure
is left configurable.

## Rationale

Khronos PBR Neutral keeps base color intact and compresses only the highlights. A filmic
operator shifts hue as a surface brightens, which would drag painted-surface color away from
what the user picked. Because color accuracy is the point of the epic, the operator that leaves
hue alone is the right default.

sRGB output is already the backend default, so setting it changes nothing that renders today.
It is set anyway to state the intent in code, so a later backend or a configuration change
cannot quietly drop it.

Exposure is configurable so a later slice that renders real daylight can tune brightness to a
sensible level. The schematic baseline keeps exposure at 1, so nothing shifts for scenes that
do not opt in.

## Consequences

- Every scene renders differently now, so all existing `scene-webgl` visual-regression
  baselines have to be regenerated on the hardware-GPU CI tier.
- The neutral color-check swatch acceptance is validated on that tier as well, not in a jsdom
  unit test, because jsdom has no GPU and cannot produce the tone-mapped pixels.
- This extends and partly supersedes the tone-mapping reasoning in
  [[ADR-0065-three-dimensional-lighting-and-color-temperature]] and
  [[ADR-0079-three-dimensional-lighting-legibility]]. Those ADRs cover the preview's lights and
  their balance and stay in force for everything except the tone-mapping operator, which this
  ADR now fixes at Khronos PBR Neutral.

## References

- Realistic-environmental-lighting spec, slice 0
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0065-three-dimensional-lighting-and-color-temperature]] and
  [[ADR-0079-three-dimensional-lighting-legibility]] (the earlier lighting and tone reasoning
  this refines).
