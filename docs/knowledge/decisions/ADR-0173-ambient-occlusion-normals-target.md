---
slug: decisions/ADR-0173-ambient-occlusion-normals-target
title: 'ADR-0173: Ambient occlusion reads rendered normals, not depth reconstruction'
type: decision
tags: [rendering, ambient-occlusion, 3d-preview, testing]
related:
  [
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0172-indirect-only-ambient-occlusion,
    decisions/ADR-0157-color-accuracy-gate,
  ]
sourceFiles:
  [
    engine/postprocessing/ambient-occlusion.ts,
    engine/renderer/create-renderer.ts,
    e2e/tests/scene-solar.spec.ts,
    e2e/tests/scene-ambient-occlusion.spec.ts,
  ]
status: current
supersedes: [decisions/ADR-0151-ambient-occlusion-render-pipeline]
updated: 2026-09-07
---

# ADR-0173: Ambient occlusion reads rendered normals, not depth reconstruction

## Status

Current. Supersedes ADR-0151's normals sentence (the depth-reconstruction fallback); the
rest of ADR-0151 stands, as amended by ADR-0172. Rendering-realism lane 5, issue #471.

## Context

ADR-0151 fed GTAO no normal input, letting the shader reconstruct surface normals from
depth. Reconstruction differentiates the depth buffer, which rounds creases and thin
details off, exactly the places contact occlusion lives. The addon's own docs recommend a
rendered normals texture, via a second render-target channel on the scene pass. ADR-0172
had just added a depth-only prepass whose color output nothing read.

## Decision

1. The prepass override material writes the view-space normal into the prepass color
   target through its output node, and the GTAO node consumes that texture as its normal
   input. One pass, two textures, still no multiple-render-target output.
2. The output-node slot matters: the basic material's color path clamps to unsigned
   floats, which would flatten every negative normal component. The custom output path
   bypasses that clamp, so the normal is stored raw. GTAO samples it raw as well (it
   normalizes the rgb it reads and applies no unpacking).
3. The store only works because pass render targets are half-float: the renderer's output
   buffer type default is what the pass inherits, and `engine/renderer/create-renderer.ts`
   never overrides it. A future renderer profile that switched the output buffer to an
   unsigned byte type would silently clamp the normals; this coupling is the reason that
   file sits in this record's source list.
4. A probe on the lane branch (run 34078575507) showed the SwiftShader CI lane exposes
   `OES_draw_buffers_indexed`, `EXT_color_buffer_float`, and `EXT_color_buffer_half_float`,
   so the addon's multi-target route was viable after all. The prepass route still wins:
   it adds no attachment, keeps transparent materials out of the normals image by
   construction, and leaves the ADR-0151 and ADR-0172 parity posture untouched.

## Evidence

- The rendered normals move the ambient-occlusion frame by 549 of 76800 pixels against
  the lane 4 baseline on darwin, so the input path is live; the sampled contrast gate
  still passes on the shipped radius.
- Both gates re-derived per ADR-0157's two-probe midpoint amendment: whole-frame
  threshold 0.02 with ratio 0.014 (the no-op probe is now the weaker signal, 2264 pixels
  at the rung; the gate rounds down to stay at most half the signal), sampled minimum
  0.0027. The seeded red run 34081251702 rejected the 10x wiring defect on linux at
  ratio 0.0412 (2.9x the gate) and contrast -0.0016.
- Two independent runner dispatches rendered byte-identical linux baselines (runs
  34080461179 and 34080462540).

## Consequences

- Creases and thin details occlude more precisely; the whole-frame shift is small (549
  pixels on the canonical state) because lane 4 already confined occlusion to indirect
  light.
- The prepass now costs a color write alongside its depth write; no new pass and no new
  disposal surface.
- The two gate derivations are the third of the campaign; each future engine lane
  re-derives them against its own refreshed baselines, which is now settled procedure.

## References

- Issue #471 (the lane), issue #522 (the gate), `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md` lane 5.
- Runs 34078575507 (extension probe), 34081251702 (red proof).
