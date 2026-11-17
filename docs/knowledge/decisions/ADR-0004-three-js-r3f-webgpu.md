---
slug: decisions/ADR-0004-three-js-r3f-webgpu
title: 'ADR-0004: Three.js + React Three Fiber on WebGPU renderer stack'
type: decision
tags: [architecture, rendering, three-js, webgpu, react-three-fiber, engine]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0174-live-pane-webgl-fallback,
    decisions/ADR-0197-scene-renderer-lifecycle,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    engine/index.ts,
    engine/renderer/create-renderer.ts,
    engine/renderer/detect-backend.ts,
    bridge/react/scene-renderer-canvas.tsx,
    bridge/react/scene-canvas.tsx,
    bridge/react/live-preview-backend.ts,
    engine/scene/build-scene.ts,
    engine/lighting/lighting-provider.ts,
    engine/lighting/basic-lighting-provider.ts,
  ]
status: current
updated: 2026-11-17
---

# ADR-0004: Three.js + React Three Fiber on WebGPU renderer stack

## Status

Accepted. The `engine/` layer is implemented: the scene builder, the lighting
seam, the backend detector, and the renderer factory all exist and are
unit-tested. The design specification (section 6.3) names the stack and remains
authoritative; this ADR records the concrete library versions and the layering
interpretation chosen during implementation.

## Context

The design specification (section 6.3) names **Three.js + React-Three-Fiber +
WebGPURenderer** as the primary 3D renderer, with a WebGL2 fallback as a
post-MVP fast-follow and a backend detected at startup. Section 6.1 places a
pure scene graph between the project model and the renderer; the engine consumes
that scene graph (ADR-0018) and turns it into a Three.js group tree.

We had to pin actual library versions and decide how the WebGPU build, which is
shipped as a separate `three/webgpu` entry point and requires an async
initialization step, threads through the layering without pulling Three.js into
layers that must not import it (hard invariant 2: `engine/` is the only Three.js
importer).

## Decision

### The stack and its versions

- `three` 0.184, using the `three/webgpu` entry point's `WebGPURenderer`.
- React Three Fiber 9 (`@react-three/fiber` `^9.6.1`), on React 19
  (`react` and `react-dom` `^19.0.0`).

R3F 9 is the version that integrates WebGPU as a first-class citizen. Its
`<Canvas gl={...}>` accepts an async renderer factory and awaits it before the
first render, and `WebGPURenderer` itself requires `await renderer.init()`
before use. R3F 9 peer-requires React 19, so the repository was bumped from
React 18 to React 19 to adopt it. This React-19 move was explicitly confirmed
with the project owner before landing.

### Layering: only `engine/` touches `three`

`engine/` is the sole importer of `three` and `three/webgpu` (hard invariant 2).
It exposes a small, renderer-agnostic surface through `engine/index.ts`:

- `buildScene(graph)` (`engine/scene/build-scene.ts`) turns the pure
  `SceneGraph` (ADR-0018) into a Three.js `Group` tree, one child group per
  scene-graph node, carrying the node id as the group name and
  `userData.entityId`. World units are millimetres throughout, with no scale
  factor.
- A `LightingProvider` seam (`engine/lighting/lighting-provider.ts`) with one
  concrete `BasicLightingProvider` (`engine/lighting/basic-lighting-provider.ts`)
  for the MVP: a fixed-direction directional sun plus a hemisphere fill. The
  seam lets a future solar-aware provider swap in without changing the renderer.
- `detectRenderBackend()` (`engine/renderer/detect-backend.ts`) returns
  `'webgpu'` when `navigator.gpu` is present and `'unsupported'` otherwise. The
  union still has no WebGL 2 member, but WebGL 2 is no longer deferred: the
  `WebGPURenderer` falls back to its own WebGL 2 backend, and the bridge's
  `detectLivePreviewBackend()` reports that case. (Corrected 2026-11-17: this
  called WebGL 2 the deferred fallback; ADR-0174 made it live.)
- One renderer factory, reached through `loadSceneRendererFactory()`
  (`engine/renderer/create-renderer.ts`), which lazily `import('three/webgpu')`
  once and resolves to a synchronous factory that constructs the `WebGPURenderer`
  without calling `init()`. The dynamic import keeps the WebGPU build out of the
  test and server import graph, so plain Node and jsdom never load it. This is
  the one place that constructs a backend renderer. (Corrected 2026-11-15: this
  was an async `createSceneRenderer()` that awaited `init()`; see the amendment
  below.)

`bridge/` imports `@react-three/fiber`, which is a separate package, but never
imports `three` directly. The R3F `<Canvas>` there is handed a synchronous
factory built from the engine's `loadSceneRendererFactory()` as its `gl` prop, so
the renderer construction still lives in the engine. The bridge's `SceneCanvas`
consults `detectLivePreviewBackend()`. It mounts the live view on WebGPU or on
the renderer's WebGL 2 fallback, and renders the accessible status "This browser
cannot render the 3D view." (`role="status"`) only when the runtime can drive
neither. (Corrected 2026-11-17: this said `SceneCanvas` consulted
`detectRenderBackend()` and mounted the canvas only when WebGPU was present,
which ADR-0174 changed.) See ADR-0019 for the bridge side of this seam.

## Alternatives considered

- **Stay on React 18 with R3F 8.** Rejected. R3F 8 predates first-class WebGPU
  initialization, so adopting WebGPU would mean fighting the framework's render
  lifecycle to await an async renderer. R3F 9 accepts the WebGPU renderer through
  its `gl` prop, which is worth the React-19 bump. (Corrected 2026-11-17: this
  named the async factory with an awaited `init()` as the supported path. The
  canvas now receives a synchronous factory and the bridge starts `init()`; see
  the amendment below.)
- **Ship the WebGL2 fallback now.** Deferred per the specification, which makes
  WebGL2 a post-MVP fast-follow. The seams are in place for it: the
  `RenderBackend` union, `detectRenderBackend`, and the single
  scene renderer factory are the three points a WebGL2 path extends, and
  none of the higher layers would change.

## Consequences

- The WebGPU build is loaded lazily, only when a scene canvas mounts, so tests
  and any server-side import path never pull it in. The build carries both
  backends, so it loads in any browser that can drive WebGPU or WebGL 2.
  (Corrected 2026-11-17: this said the build loaded only in browsers that report
  WebGPU support.)
- The renderer is replaceable behind three narrow seams (backend detection,
  renderer factory, lighting provider), which is what lets the WebGL2 fallback
  and a future solar-aware lighting model slot in without touching `bridge/`,
  `editor/`, or `app/`.
- The React-19 bump is now a baseline for the whole repository, not just the
  engine, because React is a single shared dependency.
- `engine/` consumes only the scene-graph shape (ADR-0018), not the project
  model, so the mutation layer and the renderer stay decoupled.

## References

- Design specification, section 6.3 (3D scene renderer) and section 6.1 (scene
  graph). This ADR records the implemented versions and layering; the spec is
  authoritative.
- ADR-0001 (six-layer architecture; hard invariant 2 makes `engine/` the only
  Three.js importer).
- ADR-0018 (scene-graph derivation, the pure projection this renderer consumes).
- ADR-0019 (the bridge dispatch boundary and the R3F canvas that drives this
  renderer).

## Amendment 2026-11-15: the factory handed to the 3D library is synchronous

The renderer factory section above said that the canvas received an async
`createSceneRenderer()` that awaited `init()`. That was corrected in place: the
engine now exports `loadSceneRendererFactory()`, `createSceneRenderer` is gone,
and the bridge owns `init()`. Issue #733 found why.

### The rule

The factory that React Three Fiber receives as `gl` is synchronous and does not
call `init()`. `loadSceneRendererFactory()` loads the renderer module one time,
caches the promise, and does not cache a failed load, so the next call tries
again. `SceneRendererCanvas` (`bridge/react/scene-renderer-canvas.tsx`) waits for
that factory before it mounts the canvas, passes the synchronous factory to the
library, starts `renderer.init()` itself, and keeps the frame loop off and the
children unmounted until `init()` resolves. The live view and the scene harness
view both use it; the harness forces the WebGL 2 backend.

### Why

The library runs its canvas setup again on each render of the canvas, and each run
acts on a store snapshot taken before its own `await`. With an async factory, a
render of the scene view that landed while the factory promise was pending started
a second setup. That setup built a second renderer and a second default camera,
and neither was sized. The late renderer kept a 300 by 150 drawing buffer, so
every render pass was rejected, and the late camera kept an aspect of 0. Either
fault alone left the 3D pane blank until it changed size. A slowed start plus two
toolbar presses reproduced it every time. Setup that reads a snapshot across an
await is not safe to re-run, so the await moved out of the library's reach.

### The failed state

A failed `init()`, or a factory that throws while it builds the renderer, ends the
component in a failed state. It shows the existing status "This browser cannot
render the 3D view." and mounts no canvas, and it stays there until it mounts
again. A failed module load has its own state: a message that asks the user to
reload the page, and a "Reload page" button. (Corrected 2026-11-17: a failed load
used to show the cannot-render status; see ADR-0197.)

### What remains

- The window of one microtask in which the library awaits the factory's result is
  closed: only the renderer the library asked for last can set the component's
  state. The renderer is released on unmount, a constructor throw is caught, and a
  failed load has a message of its own (issue #746). ADR-0197 records how.
  (Corrected 2026-11-17.)
- A readiness signal that names the drawn document revision is not built (issue
  #747).

### Tests

`e2e/tests/scene-live-view-startup.spec.ts` renders the view again while the
renderer chunk loads and while the renderer initializes, plus a control.
`bridge/react/scene-renderer-canvas.test.tsx` covers the wrapper, and
`engine/renderer/create-renderer.test.ts` covers the factory and its caching.
