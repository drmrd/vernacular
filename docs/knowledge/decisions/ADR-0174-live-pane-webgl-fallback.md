---
slug: decisions/ADR-0174-live-pane-webgl-fallback
title: 'ADR-0174: The live 3D pane renders on WebGL 2 instead of refusing to render'
type: decision
tags: [rendering, webgpu, webgl2, 3d-preview, bridge, editor]
related:
  [
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0171-live-view-ci-render-lane,
  ]
sourceFiles:
  [
    bridge/react/live-preview-backend.ts,
    bridge/react/scene-canvas.tsx,
    editor/shell/scene-pane.tsx,
    engine/renderer/create-renderer.ts,
  ]
status: current
updated: 2026-09-07
---

# ADR-0174: The live 3D pane renders on WebGL 2 instead of refusing to render

## Status

Current. Issue #476. This reverses the gate ADR-0004 chose and ADR-0019 recorded.

## Context

Two gates refused the live 3D view unless `navigator.gpu` was present. `editor/shell/scene-pane.tsx`
showed a design-system empty state reading "Your browser does not support WebGPU", and
`bridge/react/scene-canvas.tsx` showed a bare `role="status"` line reading "This 3D view requires a
WebGPU-capable browser". Both asked `detectRenderBackend()`, whose union is `'webgpu' | 'unsupported'`
because ADR-0004 deferred the WebGL 2 path as a post-MVP fast-follow.

The deferral no longer matches the renderer. `createSceneRenderer` builds a `WebGPURenderer`, which
picks WebGPU when an adapter is there and drops to its own WebGL 2 backend when it is not, and
`forceWebGL` pins that same backend for the deterministic harness. Every committed scene baseline is
therefore a WebGL 2 render (ADR-0151), so the path the gates refused is the path CI has been
exercising all along. A browser with WebGL 2 and no WebGPU was told the preview was unavailable while
the code that would have served it sat one call away.

What was missing was a gate on the live path itself. ADR-0151 named the backend split as an uncovered
risk, and the live view had no pixel coverage until ADR-0171 put the live-view spec on a macOS CI
runner with a real WebGPU adapter. With that lane in place, a regression in the live render fails a
required job, which is what makes widening the gate safe to do now.

## Decision

The pane renders whenever the runtime can drive any 3D backend, and says which one it got.

1. **A three-value probe replaces the two-value question.** `detectLivePreviewBackend()`
   (`bridge/react/live-preview-backend.ts`) returns `'webgpu'`, `'webgl2'`, or `'unsupported'`. It
   delegates the WebGPU half to the engine's existing `detectRenderBackend()` and answers the WebGL 2
   half by asking a detached canvas for a `webgl2` context. Asking for the context rather than
   checking for the `WebGL2RenderingContext` constructor is deliberate: a runtime can carry the type
   and still refuse a context on a blocked GPU.
2. **The probe runs once per page load.** Browsers cap how many live WebGL contexts one document may
   hold, and both callers sit on a render path. A probe context per render would exhaust the cap and
   take the scene canvas down with it, so the verdict is cached in the module.
3. **Only `'unsupported'` still earns a refusal.** `SceneCanvas` mounts the live view on `'webgpu'`
   and on `'webgl2'`, and `ScenePane` keeps its styled empty state for `'unsupported'` alone. The
   empty state no longer names WebGPU, since a missing adapter is no longer the reason a preview is
   unavailable.
4. **`'webgl2'` raises a dismissible notice over the pane.** It is the design system's `Banner`, so
   it carries the shell's notice styling and dismiss control rather than a bespoke strip. It says the
   preview is running without WebGPU and that shading and lighting can look slightly different.
   Dismissal lasts as long as the pane stays mounted. The notice is positioned over the canvas rather
   than in a layout row, so the pane keeps the height the canvas measurement depends on, and the
   wrapper ignores pointer input so an orbit drag passes through it.

### The probe lives in `bridge/`, not `engine/`

Widening `RenderBackend` in `engine/renderer/detect-backend.ts` would be the tidier home, and it is
the recorded follow-up. The probe went to `bridge/react/` for two reasons. It needs no Three.js: it
reads `navigator` and a canvas context, so it breaks no layer invariant. And `bridge/` is the lowest
layer both callers can reach, since `editor/` may import `bridge/` but `bridge/` may not import
`editor/`. The engine's `detectRenderBackend()` keeps its narrow meaning, "is a WebGPU adapter
present", and the bridge probe composes on top of it.

### The gates could not simply be deleted

Deleting the bridge gate outright would mount the R3F `<Canvas>` in jsdom, where `react-use-measure`
needs a `ResizeObserver` the unit environment does not define, so the editor shell and app unit tests
would fail on a renderer they never meant to exercise. jsdom answers the probe with no WebGPU and no
WebGL 2 context, so those tests keep the fallback branch they had.

## Consequences

- A WebGL 2 browser gets a working 3D preview. That is the whole of issue #476.
- No baseline moves. The `scene-*` specs run in the `scene-webgl` Playwright project, where
  `navigator.gpu` is present on the development Mac and on the macOS runner, so they take the
  `'webgpu'` branch and render what they rendered before. The `home.png` baseline is captured on the
  default view, which has no 3D region at all.
- The chromium, firefox, and webkit end-to-end projects now mount the live view where they used to
  get the fallback line. The one spec that visits the pane there measures the region height and holds
  either way, so no end-to-end file changed.
- WebGL 2 is a real render, not a degraded stub, but it is not pixel-identical to WebGPU. The notice
  is what keeps that difference from reading as a defect, and the pane has no way to know how large
  the difference is on a given frame.
- `detectRenderBackend()` is now called from one place, the bridge probe. Folding the WebGL 2 leg
  into the engine helper and retiring the bridge module is a follow-up, along with a live-view
  end-to-end case that pins the WebGL 2 branch and the notice.

## References

- Issue #476.
- ADR-0004 (the deferral this reverses), ADR-0019 (the bridge seam that carried the gate).
- ADR-0151 (WebGL 2 is the only baselined backend), ADR-0171 (the live-view CI lane that made this
  safe to widen).
- `docs/plans/2026-09-07-live-pane-webgl-fallback.md`.
