---
slug: decisions/ADR-0095-furniture-3d-mesh-loader
title: 'ADR-0095: Furniture 3D mesh loader'
type: decision
tags:
  [
    architecture,
    furniture,
    assets,
    three-d-preview,
    model-loader,
    gltf,
    cache,
    scene-graph,
    reconciler,
  ]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0092-furniture-instance-model,
    decisions/ADR-0093-in-app-asset-library,
    decisions/ADR-0094-furniture-massing-in-3d,
  ]
sourceFiles:
  [
    docs/specs/2026-06-17-furniture-3d-mesh-loader.md,
    docs/plans/2026-06-17-furniture-3d-mesh-loader.md,
    core/scene/scene-graph.ts,
    engine/scene/furniture-model.ts,
    engine/loaders/gltf-loader.ts,
    bridge/react/furniture-model-cache.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/use-furniture-model-cache.ts,
    bridge/react/webgpu-scene-view.tsx,
    bridge/react/furniture-model-signals.tsx,
    e2e/tests/scene-furniture-model-swap.spec.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0095: Furniture 3D mesh loader

## Status

Accepted, landed. A furniture piece placed on the plan now loads its real GLB model in
the 3D preview, fit to the piece's footprint and height, and swaps in for the massing
box once the model is ready. A load that fails for any reason leaves the box in place.

## Context

ADR-0094 rendered each piece as a solid massing box and closed by naming the real-model
loader as the follow-up: scale and center a parsed GLB to the same footprint and height,
and fall back to the box on a failure. ADR-0092 gave furniture an instance model and
ADR-0093 gave the editor a library and a content-addressed import path, so the bytes for
a piece's model are reachable through the asset registry. The box was always meant to
hold the spot until the loader could fit a real model where it stood.

Two constraints shaped the design. The build-to-reconcile pipeline that turns a scene
graph into a Three.js scene is synchronous, and loading a model is not: bytes resolve
over the registry and a GLB parses on its own clock. And the bridge layer must name no
Three.js type at runtime, because the engine is the only layer that imports Three.js
(ADR-0001, ADR-0004). A loader that swaps a box for a mesh has to reconcile an async load
with a synchronous build, and hold parsed models in the bridge without importing the
library that defines them.

## Decision

Take Approach A from the spec: a bridge-layer cache absorbs the async loading, the
synchronous reconciler reads it through a lookup, and a settled load drives a re-render
that swaps only the piece that became ready.

`FurnitureSceneNode` carries the piece's `assetRef`, copied from the instance by the
deriver. The reference is content-addressed (ADR-0007), so the content hash is the cache
key, and the node already memoizes by its source instance reference (ADR-0094). No schema
version moved, because the reference is derived, not stored anew.

The engine owns every Three.js touch in `engine/scene/furniture-model.ts`.
`parseFurnitureModel` turns GLB bytes into an object through `GLTFLoader`, which lives
behind `engine/loaders/gltf-loader.ts` so the loader import stays in one place.
`normalizeModelIntoBox` updates the model's world matrix, measures its bounding box, and
returns a group that scales uniformly to fit inside the footprint width, depth, and
height against the limiting axis, centers on the footprint center in plan, anchors the
model's base to the elevation, and rotates to the footprint orientation. It maps plan x
to world x and plan y to world z with world y up, the same axis convention the massing
box uses, so a model lands where its box stood. It returns null for geometry that is
empty or has a zero extent, so the caller can fall back. `buildFurnitureModelGroup` wraps
a normalized model as a sub-group that carries the box's scene name and raw entity id but
no edge overlay, so it selects in step with the plan and reads as a real mesh rather than
a massing block. `disposeObject` frees the geometries, materials, and textures of a tree.

`createFurnitureModelCache` in `bridge/react/furniture-model-cache.ts` holds the loading
and the parsed templates. It is generic over the model type and takes its dependencies by
injection, so it names no Three.js type at runtime and a unit test supplies a fake
resolve, parse, and dispose. A request resolves bytes, parses them, and stores the result
as `ready`, notifying its listeners. Concurrent requests for one hash share a single load.
A load that fails, whether the bytes are missing or the parse rejects, settles that entry
to `failed`, warns once, and leaves every other load untouched. A concurrency cap bounds
the parses in flight, and a reference-aware eviction disposes a parsed template only once
the live set no longer references it and the count is past the cap, so a toggled piece
does not thrash. Tearing the cache down aborts the loads in flight, drops a late
completion without storing or notifying, and disposes the templates it holds.

The reconciler reads the cache through a synchronous `FurnitureModelLookup` passed as a
third argument to `reconcile`, defaulting to a box-only lookup so every existing build and
baseline is unchanged. When the lookup reports a piece's model ready, the build clones the
template and fits it into the box; otherwise it builds the box. The clone shares the
template's geometry and material buffers and is never disposed: the cache owns the
template's lifetime, and an instance clone is cheap to drop. Reuse gained one dimension:
a cached furniture sub-group records whether it was built against a ready model, and the
floor-level early return compares a small readiness signature of the floor's furniture
against the cached one. A piece whose readiness changed rebuilds; the rest keep their
identity across the swap, so a settled load rebuilds one piece, not the floor (ADR-0089).

The glue closes the loop. `use-furniture-model-cache` instantiates the cache with the
registry resolve and the engine parse and dispose, requests the active floor's models,
marks them live for eviction, and bumps a version on each settle so the memoized reconcile
reruns. `webgpu-scene-view` passes the lookup into the reconcile and renders
`FurnitureModelSignals`, which writes a hidden `data-model-loaded-<id>` attribute after a
swap commits. The signal is gated on an `?e2e` runtime flag and is inert otherwise, so the
end-to-end test can wait on a real swap without racing the network.

## Consequences

- A placed piece shows its real model in the preview, fit to the footprint and height it
  already drew the box at, so placement, rotation, and elevation resolve before any model
  loads and the model simply replaces the box in place.
- A load failure is silent by contract: the piece keeps its massing box and a warning lands
  in the console, with no user-facing error in this slice. A visible failure affordance and
  a loading affordance are deferred follow-ups.
- The bridge holds parsed Three.js objects without importing Three.js. The cache is generic
  over the model type, the reconciler types the template from the engine builder's
  signature, and the signal reads only `Object3D` methods, so the engine stays the only
  Three.js importer.
- A settled load rebuilds one piece. The readiness signature in the floor early return is
  the price: the reconcile compares the floor's ready hashes on every pass, which is cheap
  against the per-floor node and paint reference checks already there.
- A clone shares buffers and is never disposed, so many instances of one model cost one
  parse and one set of GPU buffers. The cache disposes a template only when nothing live
  references it, which keeps a toggled piece from reloading.
- One limitation follows from marking an entry ready after a successful parse rather than a
  successful fit: a model that parses but normalizes to a degenerate, zero-extent result
  builds an empty group, showing neither box nor mesh. Real models are not degenerate, and
  the engine tests cover the null fit at the boundary, so the case is documented rather than
  guarded in the cache.
- The swap is proven end-to-end under the scene-webgl GPU tier. The bundled starter pack
  ships a placeholder stub for its example chair, so the test imports the committed cube GLB
  as a user asset to exercise a real model through the same resolve, parse, and swap path.

## References

- Spec: `docs/specs/2026-06-17-furniture-3d-mesh-loader.md`
- Plan: `docs/plans/2026-06-17-furniture-3d-mesh-loader.md`
- ADR-0094 (furniture massing box the loader fits a model into), ADR-0089 (within-floor
  mesh reuse the swap extends), ADR-0007 (content-addressed asset references the cache keys
  on), ADR-0092 (furniture instance model), ADR-0093 (in-app asset library and import path),
  ADR-0004 and ADR-0001 (Three.js confined to the engine layer).
