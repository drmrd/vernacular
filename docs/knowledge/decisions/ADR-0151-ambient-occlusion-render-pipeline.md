---
slug: decisions/ADR-0151-ambient-occlusion-render-pipeline
title: 'ADR-0151: The ambient-occlusion render pipeline and its frame takeover'
type: decision
tags:
  [architecture, engine, bridge, rendering, ambient-occlusion, post-processing, testing, 3d-preview]
related:
  [
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0149-harness-lighting-readiness,
  ]
sourceFiles:
  [
    engine/postprocessing/ambient-occlusion.ts,
    engine/postprocessing/ambient-occlusion-params.ts,
    engine/postprocessing/render-scene-frame.ts,
    bridge/react/use-ambient-occlusion.ts,
    bridge/react/ambient-occlusion-render-takeover.tsx,
    bridge/react/effective-lighting-mode.ts,
    bridge/react/scene-harness-view.tsx,
    app/harness-environment.ts,
    e2e/tests/scene-solar.spec.ts,
  ]
status: current
updated: 2026-07-04
---

# ADR-0151: The ambient-occlusion render pipeline and its frame takeover

## Status

Accepted, lands with issue #442. It is the indirect-light step
[[ADR-0148-visible-sky-and-sh-light-probe]] named as the spine's next work after the sky and its
light probe. Realistic mode now darkens contact seams at wall-floor junctions and around placed
furniture; schematic mode is untouched.

## Context

The renderer is a `WebGPURenderer` with an automatic WebGL 2 fallback (ADR-0142), and that forces
the post-processing stack. The legacy `EffectComposer` with its `GTAOPass` drives raw
`WebGLRenderTarget` and GLSL passes that a `WebGPURenderer` does not run, so it was never an option
here. The pass comes from the node stack instead, where `GTAONode` composes through a
`RenderPipeline` that the WebGPU renderer executes natively and falls back to WebGL 2 on its own.

The occlusion also has to reach two very different draw paths: the live view's continuous frame
loop and the render harness's one deterministic static frame under `frameloop="never"` (ADR-0149).

## Decision

### The occlusion pass runs GTAONode through three's RenderPipeline

`buildAmbientOcclusionPipeline` builds a `pass(scene, camera)`, reads its color and depth nodes,
and feeds the depth into `ao(...)`. The output node multiplies the occlusion term across the whole
frame, `sceneColor.mul(vec4(vec3(occlusion.r), 1))`, matching the addon's own example. The cleaner
split that applies occlusion only to the light probe's indirect contribution needs a second
render-target channel and is deferred. The output routes through the pipeline's default output
handling, so the renderer's active tone-mapping operator (realistic AgX, ADR-0147) still applies
after the pass takes over the draw.

Normals are reconstructed from depth rather than read from a dedicated target. `GTAONode`
reconstructs them when no normal node is supplied, so the factory passes null through a cast the
r184 non-null type forces. This keeps the pass clear of the multiple-render-target output that
diverged between the WebGL and WebGPU backends before r174 (three.js issue #30567), which was the
top backend-parity risk. Normals from a dedicated target are a later refinement.

`three/webgpu`, `three/tsl`, and the GTAONode addon load through a cached dynamic import, the same
lazy boundary the sky mesh uses (ADR-0148), so the WebGPU build stays off the entry chunk; a
source-reading guard test keeps a static import from creeping back. Repeated realistic-mode toggles
share the one module load while each call builds a fresh pipeline and node, and `dispose` releases
the pipeline, the scene pass, and the occlusion node. The node's own disposal was added during the
clean-code review, since its render target and material leak otherwise. `setSize` is inert on r184,
where the pass reconciles its render target to the renderer size every frame.

### One render seam feeds both canvases, gated on the effective mode

`renderSceneFrame` is the single seam: given a pipeline it draws through the pass, given null it
draws through `gl.render(scene, camera)`. The live view registers it as a `useFrame` takeover at a
nonzero priority, which disables React Three Fiber's automatic render for that canvas, and the
harness's `StaticFrame` calls it for both its mount frame and its ready frame. When the pass is
inactive the pipeline is null and both canvases fall back to the plain draw, so schematic and the
no-location realistic fallback render as before.

Whether the pass is active is keyed on the effective lighting mode, extracted into
`effective-lighting-mode.ts` and shared with `scene-lighting.tsx`. A realistic request resolves to
realistic only with a located site and otherwise falls back to schematic. This one predicate keeps
the occlusion pass, the solar provider, and the AgX operator turning on together for the same
inputs, so nothing lights a scene it does not occlude.

### The harness ready frame waits for the pipeline to settle

ADR-0149 gave the harness a ready-frame contract: draw a mount frame so the canvas is never blank,
then a second frame once lighting reports ready, advertised as `data-harness-ready`. This slice
folds AO into that gate. When the pass is active the ready frame also waits for the pipeline build
to settle, so the captured frame carries the occlusion term; when it is inactive the gate stays
lighting readiness alone and the existing baselines keep their single-signal contract.

Settlement fires however the build resolves, whether it installs, is discarded as stale after a
fast toggle, or fails to load. This is settled, not succeeded, on purpose, mirroring the sky
slice's degradation: a build that rejects still flips readiness, so a broken pipeline shows a
missing-occlusion diff instead of hanging the capture.

### WebGL 2 is the only baselined backend, and the tuning is r184-only

The harness forces the WebGL 2 backend, so the committed baseline is a hardware-WebGL render that
never collides with a future WebGPU baseline. The WebGPU path gets a manual spot check on the
development Mac before shipping; a first live-view visual-regression spec is a filed follow-up,
since CI runs no scene tier to gate it (ADR-0149).

`AO_DEFAULT_PARAMS` holds r184 GTAONode uniforms and only r184. The tuning surface changes under
r185 (darker, wider occlusion; a red-channel-only target) and again under r186, where
`distanceExponent` and `distanceFallOff` become no-ops, so the next three.js bump re-tunes these
values and re-renders every affected baseline. That migration is out of scope here.

## Consequences

- Realistic interiors render with contact darkening; schematic and the no-location fallback take
  the byte-identical `gl.render` path they took before.
- The four solar baselines regenerate to carry the occlusion term, and the harness gains an
  `ambient-occlusion` furniture state at equinox civil noon with its own baseline case.
- Model, undo, and the `EnvironmentState` contract are untouched. AO is render state with no
  user-facing control, so there is no schema bump and no migration.
- The specular image-based-lighting work (issue #449) and the deferred indirect-only split remain
  the next indirect-light refinements.
