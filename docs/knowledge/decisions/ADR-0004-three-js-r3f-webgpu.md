---
slug: decisions/ADR-0004-three-js-r3f-webgpu
title: 'ADR-0004: Three.js + React Three Fiber on WebGPU renderer stack'
type: decision
tags: [architecture, rendering, three-js, webgpu, react-three-fiber, engine]
related: [decisions/ADR-0001-six-layer-architecture, decisions/ADR-0018-scene-graph-derivation]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    engine/index.ts,
    engine/renderer/create-renderer.ts,
    engine/renderer/detect-backend.ts,
    engine/scene/build-scene.ts,
    engine/lighting/lighting-provider.ts,
    engine/lighting/basic-lighting-provider.ts,
  ]
status: current
updated: 2026-06-02
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
  WebGL2 path is deliberately absent from the union for now; it is the deferred
  fallback.
- One renderer factory, `createSceneRenderer()`
  (`engine/renderer/create-renderer.ts`), which lazily `import('three/webgpu')`
  inside the async function, constructs the `WebGPURenderer`, and awaits its
  `init()`. The dynamic import keeps the WebGPU build out of the test and server
  import graph, so plain Node and jsdom never load it. This is the one place
  that constructs a backend renderer.

`bridge/` imports `@react-three/fiber`, which is a separate package, but never
imports `three` directly. The R3F `<Canvas>` there is handed the engine's
`createSceneRenderer` as its `gl` factory, so the renderer construction still
lives in the engine. The bridge's `SceneCanvas` consults `detectRenderBackend()`
and renders a WebGPU-unavailable accessible fallback (`role="status"`) when
WebGPU is absent, so the R3F canvas only mounts when the backend can support it.
See ADR-0019 for the bridge side of this seam.

## Alternatives considered

- **Stay on React 18 with R3F 8.** Rejected. R3F 8 predates first-class WebGPU
  initialization, so adopting WebGPU would mean fighting the framework's render
  lifecycle to await an async renderer. R3F 9 makes the async renderer factory
  and the awaited `init()` a supported path, which is worth the React-19 bump.
- **Ship the WebGL2 fallback now.** Deferred per the specification, which makes
  WebGL2 a post-MVP fast-follow. The seams are in place for it: the
  `RenderBackend` union, `detectRenderBackend`, and the single
  `createSceneRenderer` factory are the three points a WebGL2 path extends, and
  none of the higher layers would change.

## Consequences

- The WebGPU build is loaded lazily and only in browsers that report WebGPU
  support, so tests and any server-side import path never pull it in.
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
  </content>
  </invoke>
