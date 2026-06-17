# Furniture 3D mesh loader

Status: draft specification. Follows ADR-0094 (furniture massing in the 3D preview),
which shipped the stand-in box and named this loader as the follow-up.

## Summary

A piece of furniture placed on the plan currently shows in the 3D preview as a solid box
sized to its footprint and height (ADR-0094). This feature loads the real model behind that
furniture asset, fits it into the same footprint and height box, and swaps it in for the box.
A model that fails to load leaves the box in place. The box is never a regression; it is the
fallback and the first thing the user sees while a model is still loading.

## Goals

- Load the GLB a furniture instance points at and show it in the 3D preview in place of the box.
- Fit the loaded model into the instance footprint and height, preserving the model's real
  proportions.
- Keep the box as an immediate stand-in: it shows at once, the model replaces it when ready,
  and it remains when a model cannot load.
- Keep the scene-graph to build to reconcile pipeline synchronous and pure. All loading is
  isolated behind one cache and one re-render trigger.
- Parse each distinct model once and share it across every instance that uses it.

## Non-goals

- A visible loading indicator or a user-facing failure message. Both are deferred and captured
  as separate future-issue drafts. The first cut is silent: box, then model, with a console
  warning on failure.
- Per-instance material edits (a fabric swap driven by the reserved `customizations` bag).
  The shared-material seam for that is documented below but not built here.
- Registering geometry or texture decoders (Draco, Meshopt, KTX2). The bundled packs need none
  (verified). A future pack or user upload that needs one falls back to the box until the
  decoder is added.
- Animations, material fidelity tuning, instanced rendering of identical pieces,
  worker-offloaded parsing, and showing more than one floor at once.

## Background

The build pipeline is synchronous end to end. `useSceneGraph` feeds a memoized
`sceneGraphForFloor`, the reconciler turns that into a Three.js group tree, and a single
`<primitive>` renders it. `buildScene` and the reconciler return Three.js groups with no
promises (ADR-0004, ADR-0089). A furniture instance carries a content-addressed `assetRef`
(ADR-0007, ADR-0092). Asset bytes resolve through `AssetRegistry.resolve(reference)`, which
returns a promise; both pack assets and user imports resolve the same way. The derived
`FurnitureSceneNode` holds the footprint corners, elevation, and height, but not the
`assetRef`, so today the builder has no handle on which model a node wants.

## Design

### Carrying the asset reference into the scene node (core)

`FurnitureSceneNode` gains `assetRef: AssetReference`. `deriveFurnitureNode` copies it from the
source instance. This is the handle the builder needs to decide which model to request and to
key the cache. It is additive and pure, and it does not change the box path or the reconciler's
reuse-by-reference: the same `FurnitureInstance` reference still yields the same node reference.
No schema change is involved, because the reference already lives on the stored instance and
this only carries it into a derived value.

### Parsing and fitting a model (engine)

A new `engine/scene/furniture-model.ts` owns the Three.js side, since the engine is the only
layer that imports Three.js.

- `parseFurnitureModel(bytes): Promise<Object3D>` wraps `GLTFLoader.parse`. It resolves with the
  parsed scene and rejects through the loader's error callback, so a model that needs an
  unregistered decoder rejects rather than throwing into the caller.
- `normalizeModelIntoBox(model, node): Group | null` fits a parsed model into the instance box.
  It calls `model.updateMatrixWorld(true)` and then `Box3().setFromObject(model)`, because a
  freshly parsed model has stale world matrices and a bounding box read without the update
  collapses toward the origin. It derives the target width, depth, center, and rotation from the
  node footprint corners, with the target height from the node. It scales uniformly by
  `min(targetWidth / modelWidth, targetDepth / modelDepth, targetHeight / modelHeight)` so the
  model keeps its real proportions and fits inside the box. It centers the model on the footprint
  center in plan and anchors the bounding-box bottom to the elevation, so the piece sits on the
  floor, then rotates to the footprint orientation. A model with no usable geometry yields an
  empty box and returns `null`, which the caller treats as a failed load.
- `buildFurnitureModelGroup(model, node, materials): Group` is the mesh sibling of the existing
  `buildFurnitureSubgroup`. It carries the same group name and `userData.entityId` as the box,
  so the existing 3D pick and the selection outline keep working with no selection-layer change.
  It sets the shadow flags and omits the box edge overlay.
- `disposeObject(object)` frees the geometries, materials, and textures of a model template.

### The content-hash model cache (bridge)

A new `bridge/react/furniture-model-cache.ts` holds the async loading and the parsed models. It
holds Three.js objects through the engine's exported types without importing Three.js, the same
way the reconciler already holds built groups.

It keys entries by `contentHash`: `{ status: 'loading' | 'ready' | 'failed', template?: Object3D }`.

- `request(assetRef)` starts a load for a content hash not seen before. It resolves the bytes,
  parses, and stores the parsed scene as a shared template, then marks the entry ready. The whole
  resolve to parse to normalize-check chain is wrapped so that any failure, including a missing
  asset, a rejected parse, or an empty bounding box, marks the entry failed and warns to the
  console once. Each load is isolated, so one failed upload cannot break the others or raise an
  unhandled rejection. Concurrent requests for the same hash share one load.
- `get(contentHash)` is a synchronous read for the reconciler.
- A registered `onChange` callback fires when an entry settles.
- A concurrency limit caps how many models parse at once, so loading fifteen uncached models on
  one floor does not lock the main thread; pieces become meshes in a staggered order instead.
- A bounded, reference-aware eviction policy disposes templates that no live instance references
  once the cache passes its cap, calling `disposeObject` on the evicted template. Eviction is
  conservative to avoid reloading a piece the user toggles on and off.
- In-flight loads are cancelled through an `AbortController` tied to the cache teardown, and a
  disposed guard drops a late completion so it cannot mutate a torn-down cache.
- On teardown the cache disposes every template it still holds.

The cache is created once per scene view through a ref, the way the reconciler is.

### The async swap loop

1. The scene view runs an effect that walks the active floor's furniture and calls
   `request(assetRef)` for each, deduplicated by content hash. New hashes start loading.
2. The reconciler gains a third argument: a synchronous model lookup. For each furniture node, a
   ready model builds the mesh sub-group from a clone of the template, and any other state builds
   the box. The argument defaults to a box-only lookup, so every existing reconciler test and
   committed baseline is unchanged.
3. The first paint shows every piece as a box, because nothing has loaded yet.
4. A settled load fires `onChange`, which bumps a model version in the scene view. The memoized
   reconcile re-runs because the version is one of its dependencies.
5. The reconciler rebuilds only the now-ready piece's sub-group as a mesh. Its furniture reuse key
   extends from the node reference alone to the node reference and the model availability, so the
   swap rebuilds exactly that one sub-group while walls, rooms, openings, and every other piece are
   reused by identity.
6. A failed load leaves the box, with no user-facing error and no retry.

The reconciler and `buildScene` stay synchronous and pure. They read a synchronous lookup. Every
promise lives in the cache, and the only coupling to React is the version bump that drives the
re-render.

### Per-instance clones and the lifecycle of shared buffers

The cache stores one parsed template per content hash. The builder clones the template for each
instance and applies that instance's fit. A clone shares geometry and material with the template,
which is the wanted behavior and the memory saving: furniture is never a paint target (ADR-0094), and
3D selection is a separate outline overlay rather than a material change, so a shared material is
safe across clones. Because clones share the template's buffers, a clone is never disposed; that
would corrupt the template and its siblings. Only the template owns the buffers, and only the
template is disposed, on eviction and on teardown. When a later feature edits a material per
instance through the `customizations` bag, it clones the material before mutating it, the pattern
the near-wall transparency fade already uses.

### Optional pre-compile

A textured model uploads to the GPU on the frame it first renders, which stutters the viewport on
the swap. Most bundled models carry base color and normal maps, so this is worth avoiding. The
renderer lives behind the R3F canvas, so a small component inside the canvas reads the renderer
and hands the cache a compile callback. The cache calls it before marking an entry ready, moving
the upload off the swap frame. The callback is injected, so the bridge tests pass a no-op and no
GL context is touched in a unit test. If this proves to complicate the first cut it can land as a
fast-follow, since it is smoothness rather than correctness.

## Testing

Most of the work is unit-testable without a GPU, which is the point of building the scene in the
engine rather than as canvas components.

- Core: `deriveFurnitureNode` carries the `assetRef` onto the node.
- Engine: `normalizeModelIntoBox` against a synthetic model with a known geometry nested under a
  transformed node, so the test fails without the world-matrix update. It asserts a uniform scale
  that fits inside the target and touches the limiting axis, a plan center on the footprint, a
  bottom on the elevation, and the footprint rotation. A separate case feeds geometry offset far
  from its local origin, to pin that the fit follows the bounding-box center rather than the node
  origin. A degenerate geometry returns null. `parseFurnitureModel` parses a committed cube GLB
  fixture that is strictly geometry and an untextured material, so no image path runs under jsdom,
  and rejects a garbage buffer. `buildFurnitureModelGroup` asserts the name, the entity id, the
  model child, the shadow flags, and the absence of box edges. `disposeObject` disposes across a
  synthetic tree.
- Bridge: the cache, with a fake registry and an injected parse, clock, and compile, covers the
  load states, deduplication, the failure path and its console warning, the concurrency cap, an
  eviction that disposes an unreferenced template, and a disposed guard that drops a late
  completion. The reconciler with the model lookup covers a ready model building the mesh group, a
  default lookup building the box, reuse by identity, and a box-to-mesh swap that rebuilds only the
  one sub-group.
- End to end, in a real browser against the production preview build: place a piece that uses a
  real pack model, switch to the 3D preview, and wait on one deterministic signal that the swap has
  committed. The signal is a hidden, flag-gated element the scene-view glue writes imperatively in a
  layout effect after the reconcile that produced the mesh, so a single attribute encapsulates the
  fetch, parse, compile, and React commit. The test does not wait on the network response, which
  finishes before parse and compile, and it does not read the Three.js scene graph from the page.
  The existing box baseline stays for the fallback path. A pixel baseline for furniture meshes is a
  separate decision, given that the scene baselines are pixel-exact and already drift across
  platforms.

## Exposing the swap to the test runner

The end-to-end test runs against the production preview build, so a hook gated on the development
flag would be stripped from the very build under test. The swap signal is therefore a hidden
element gated by a runtime flag, a query parameter or a stored flag, off by default. The code ships
in production but writes nothing unless the flag is set. It is owned by the scene-view glue, not the
accessibility proxy, and it is written imperatively rather than through React state, so a model
load never re-renders the accessibility tree. No Three.js object crosses into page scope.

## Scope and deferrals

In scope: the async load, the uniform fit, the box-to-mesh swap, the box fallback, pack and
user-imported models, the content-hash cache paired with the reconciler reuse, the per-instance
clone and fit, bounded reference-aware eviction with disposal, abort-based cancellation, the parse
concurrency cap, and the world-matrix fix. The pre-compile step is in scope with a fast-follow as
its fallback.

Deferred to future-issue drafts: a user-facing failure signal, and a loading affordance.

Deferred as documented seams: per-instance material edits, instanced rendering, animations,
worker-offloaded parsing, and a multi-floor view.

## Risks

- Compressed assets. The bundled packs use no Draco, Meshopt, or KTX2 (verified by scanning the
  shipped GLBs), so a plain loader is enough. A user upload may use any of them and will fail to
  parse without the matching decoder. The failure contract holds: the box persists, isolated from
  the other loads. Registering a decoder, including the static transcoder a KTX2 loader needs, is a
  scoped follow-up if a real pack adopts compression.
- Test data coupling. The real pack models exercise the end-to-end and manual paths but live in a
  separate, currently uncommitted track. The unit tests depend on a small committed fixture instead,
  so they do not wait on that track.

## Knowledge graph

This introduces async loading into a synchronous pipeline and a new cache tier, so it lands with a
new decision record (next free is ADR-0095) recording the loop, the fit, the cache pairing, and the
fallback contract.
