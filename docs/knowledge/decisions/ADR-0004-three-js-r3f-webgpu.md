---
slug: decisions/ADR-0004-three-js-r3f-webgpu
title: 'ADR-0004: Three.js plus React Three Fiber on WebGPU'
type: decision
tags: [architecture, rendering, engine, webgpu, three.js]
related: [decisions/ADR-0001-six-layer-architecture, decisions/ADR-0008-oklab-internal-color]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0004: Three.js plus React Three Fiber on WebGPU

## Status

Accepted. Implementation lands in Phase 0f. Color-temperature paint preview lands in Phase 0g.

## Context

The 3D scene is the visual product. The renderer choice dictates the ceiling on lighting fidelity, paint preview accuracy, and performance under load. The options span pure WebGL (Three.js, Babylon.js), modern WebGPU, and out-of-band native engines compiled to WebAssembly.

## Decision

- **Three.js** as the rendering engine. Mature ecosystem, well-understood API, broad community.
- **React Three Fiber (R3F)** as the integration layer for the React UI. Declarative composition of the scene tree matches the rest of the editor.
- **WebGPU** as the primary backend via Three.js's WebGPURenderer. WebGL2 fallback is a fast-follow in Phase 0f; the renderer-selection seam is in place from day one.

The engine layer wraps all of this. Higher layers do not import Three.js directly (see ADR-0001).

## Consequences

- Phase-8 lighting fidelity work plugs into the existing `LightingProvider` seam without touching the scene graph or material definitions.
- Custom shaders (paint material with finish parameter and color-temperature responsiveness) live in `engine/materials/` and are isolated from the rest of the codebase.
- A future native renderer (e.g., Tauri-hosted Skia) is a candidate replacement at the engine layer, not a rewrite.

## References

- Design specification, section 6 (Rendering & engine).
- Brainstorming transcript on the native-vs-web tradeoff.
