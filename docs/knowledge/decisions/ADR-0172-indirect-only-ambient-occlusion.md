---
slug: decisions/ADR-0172-indirect-only-ambient-occlusion
title: 'ADR-0172: Ambient occlusion applies to indirect light only'
type: decision
tags: [rendering, ambient-occlusion, lighting, 3d-preview]
related:
  [
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0157-color-accuracy-gate,
    decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants,
    decisions/ADR-0171-live-view-ci-render-lane,
  ]
sourceFiles:
  [
    engine/postprocessing/ambient-occlusion.ts,
    e2e/tests/scene-solar.spec.ts,
    e2e/tests/scene-ambient-occlusion.spec.ts,
  ]
status: current
supersedes: [decisions/ADR-0151-ambient-occlusion-render-pipeline]
updated: 2026-09-07
---

# ADR-0172: Ambient occlusion applies to indirect light only

## Status

Current. Supersedes ADR-0151's decision 3 (the whole-frame occlusion multiply); the rest
of ADR-0151 stands. Rendering-realism lane 4, issue #470.

## Context

ADR-0151 composited occlusion by multiplying the whole rendered frame by the GTAO term,
matching the addon's own example, and deferred the physically correct split with the note
that it would need a second render-target channel. That premise no longer holds on the
pinned three 0.184.0: the renderer exports `builtinAOContext`, a lighting-context seam
that hands a screen-space occlusion node to the material lighting stage, where
`PhysicalLightingModel.ambientOcclusion()` multiplies indirect diffuse and applies the
roughness-aware curve to indirect specular. Direct light is untouched, which is the
physically correct behaviour: an occluded corner in full sun should read sunlit, not
dimmed twice.

## Decision

1. The pipeline installs the occlusion through the lighting context, not a composite.
   `scenePass.contextNode = builtinAOContext(occlusion)` with the occlusion texture
   rebound to screen coordinates (`context({ getUV: () => screenUV })`), because a
   texture read inside a scene material otherwise resolves to the mesh's own UV set.
2. The GTAO node feeds from a separate depth-only prepass with an override material, so
   rendering the occlusion buffer cannot re-enter the ambient-occlusion context installed
   on the scene pass. A cheap basic node material suffices: the occlusion node reads only
   the resulting depth texture, and depth writes happen regardless of which material
   draws the pass.
3. No multiple-render-target output, still. r184 fixed the clear divergence ADR-0151
   avoided, but it carries a new one: per-attachment blending in the WebGL fallback needs
   the indexed-draw-buffers extension, which the SwiftShader lane is unlikely to expose,
   and transparent materials (glass, furniture placeholders) would blend differently per
   backend. The context route needs no second attachment at all.
4. Transparent materials keep their exemption for free: the context's `getAO` hook
   returns the input unchanged for them.

## Evidence

- Liveness: a no-op radius probe changes the rendered frame, so the context path really
  drives the lighting (the pass is not skipped by the scheduler).
- The blend moved the seven realistic-lighting baselines and nothing else: the schematic
  geometry states and the live-view baseline came back byte-identical on both platforms,
  and two independent runner dispatches reproduced the linux renders byte for byte.
- Both ambient-occlusion gates re-derived against the new blend per ADR-0157's two-probe
  midpoint amendment: the whole-frame pair is threshold 0.02 with ratio 0.020 (the 10x
  radius probe moves 3088 of 76800 pixels there; noise 0), and the sampled OKLab minimum
  is 0.0029 (shipped +0.0075 against the wrong-radius -0.0017). The seeded red run before
  merge proved both gates reject the 10x wiring defect on CI.

## Consequences

- Occluded areas in direct sun read brighter than before; the perceptual strength of the
  effect dropped because occlusion no longer stacks on direct light. Whether `AO_SCALE`
  wants a retune is a separate judgment call, deliberately left out of this lane.
- The pipeline costs one extra depth-only scene render per frame, and materials under the
  AO context compile their own program variants (a compile-time cost, not per-frame).
- The gate constants in the two e2e specs are now derived against this blend; ADR-0158's
  millimetre conversions for radius and thickness are unaffected.

## Amendment (2026-09-07)

ADR-0173 refines the prepass this record introduced: its color target now carries the
view-space normals GTAO consumes, replacing depth reconstruction.

## References

- Issue #470 (the lane); issue #522 (the gate that judges it).
- `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md`, lane 4.
- ADR-0151 (the superseded composite and everything that still stands).
