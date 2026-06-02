---
slug: decisions/ADR-0001-six-layer-architecture
title: 'ADR-0001: Six-layer codebase architecture'
type: decision
tags: [architecture, layering, boundaries]
related: [decisions/ADR-0004-three-js-r3f-webgpu]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0001: Six-layer codebase architecture

## Status

Accepted. Implementation lands in Phase 0f.

## Context

Vernacular spans a React UI, a Three.js-driven 3D engine, multiple storage backends, and a pure-TS domain model. Letting any module import from any other leads to tangled dependencies, slow test feedback, and high coupling between rendering and storage. We need a structure where the domain model is testable without a browser, the engine is swappable, and the UI is replaceable.

## Decision

Six layers with a strict downward dependency direction:

1. `app/`, top-level routes, providers, top-level state.
2. `editor/`, React UI: shell, tools, panels, gizmos.
3. `bridge/`, React Three Fiber glue; the only place commands cross into the engine.
4. `engine/`, Three.js scene management, renderers, asset loaders.
5. `storage/`, `ProjectStore`, `LibraryStore`, `AssetCache` interfaces and impls.
6. `core/`, pure TypeScript domain model. No React. No Three.js. No DOM.

Every layer may depend on layers below it; never above. Enforced by lint rules in Phase 0d.

## Consequences

- `core/` runs in Node, so unit tests for domain logic do not need a browser.
- The 3D renderer can be replaced (WebGL fallback, future native renderer, server-side rasterization) without touching higher layers.
- Adding new features tends to spread across layers; contributors must understand the layering up front. This is why CLAUDE.md and ARCHITECTURE.md make it the very first thing they read.

## References

- Design specification, section 2 (Architecture).
- Phase 0a foundation commit: 48000cd.
- Phase 0f source skeleton (pending).
