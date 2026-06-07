---
slug: decisions/ADR-0001-six-layer-architecture
title: 'ADR-0001: Six-layer codebase architecture'
type: decision
tags: [architecture, layering, boundaries]
related:
  [
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0012-eslint-guardrails,
    decisions/ADR-0017-layer-boundary-enforcement-repair,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/index.ts,
    storage/index.ts,
    eslint.config.js,
    tests/architecture/layer-boundaries.test.ts,
  ]
status: current
updated: 2026-06-02
---

# ADR-0001: Six-layer codebase architecture

## Status

Accepted. The two bottom layers (`core/` and `storage/`) now contain real,
unit-tested modules; the upper four layer directories remain placeholders.

## Context

Vernacular spans a React UI, a Three.js-driven 3D engine, multiple storage
backends, and a pure-TS domain model. Letting any module import from any other
leads to tangled dependencies, slow test feedback, and high coupling between
rendering and storage. We need a structure where the domain model is testable
without a browser, the engine is swappable, and the UI is replaceable.

## Decision

Six layers with a strict downward dependency direction:

1. `app/`, top-level routes, providers, top-level state.
2. `editor/`, React UI: shell, tools, panels, gizmos.
3. `bridge/`, React Three Fiber glue; the only place commands cross into the engine.
4. `engine/`, Three.js scene management, renderers, asset loaders.
5. `storage/`, `ProjectStore`, `LibraryStore`, `AssetCache` interfaces and impls.
6. `core/`, pure TypeScript domain model. No React. No Three.js. No DOM.

Every layer may depend on layers below it; never above.

## Current implementation state

- `core/` is real. It exports the project model and factories
  (`core/model/types.ts`, `core/model/factories.ts`: `Project`, `ProjectMeta`,
  `Floor`, `createEmptyProject`, `createFloor`, `CURRENT_SCHEMA_VERSION`,
  `DEFAULT_CEILING_HEIGHT_MM`), content-addressed asset references
  (`core/model/asset-reference.ts`, see ADR-0007), the generic registry pattern
  (`core/registries/registry.ts`, see ADR-0006), and two seeded built-in
  registries (`core/registries/finishes.ts`, `core/registries/element-types.ts`).
  The public surface is re-exported through `core/index.ts`. It imports no
  React, no Three.js, no DOM.
- `storage/` is real. It defines the three provider interfaces (`ProjectStore`,
  `LibraryStore`, `AssetCache`) plus a Map-backed `InMemoryProjectStore`
  reference implementation, re-exported through `storage/index.ts`. It depends
  only on `core/` (it imports `Project` and `AssetReference` from `../core`).
- `engine/`, `bridge/`, `editor/`, and `app/` directories are still empty
  placeholders. Work lands in each once that layer is scaffolded.

The downward dependency invariant is no longer aspirational. It is enforced by
`eslint-plugin-boundaries` (ADR-0012) and proven by an architecture-fitness test
at `tests/architecture/layer-boundaries.test.ts`, which runs ESLint
programmatically to confirm a `core -> storage` import is rejected and a
`storage -> core` import is allowed. See ADR-0017 for the repair that made that
enforcement actually fire.

## Consequences

- `core/` runs in Node, so unit tests for domain logic do not need a browser.
- The 3D renderer can be replaced (WebGL fallback, future native renderer,
  server-side rasterization) without touching higher layers.
- Adding new features tends to spread across layers; contributors must
  understand the layering up front. This is why CLAUDE.md and ARCHITECTURE.md
  make it the very first thing they read.

## References

- Design specification, section 2 (Architecture).
- ADR-0012 (the ESLint guardrails that encode the layer direction).
- ADR-0017 (the repair that made boundary enforcement actually fire, plus the
  fitness-test guard against silent regression).
