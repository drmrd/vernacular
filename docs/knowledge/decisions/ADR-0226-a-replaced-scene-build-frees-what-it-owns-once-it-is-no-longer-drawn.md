---
slug: decisions/ADR-0226-a-replaced-scene-build-frees-what-it-owns-once-it-is-no-longer-drawn
title: 'ADR-0226: A replaced scene build frees what it owns once it is no longer drawn'
type: decision
tags: [three-dimensional, preview, reconciler, gpu, memory, dispose, materials, react-three-fiber]
related:
  [
    decisions/ADR-0088-three-dimensional-incremental-scene-updates,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0132-surface-edge-overlay-opt-in-view-toggle,
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
    decisions/ADR-0197-scene-renderer-lifecycle,
  ]
sourceFiles:
  [
    engine/scene/dispose-object.ts,
    engine/materials/held-material-cache.ts,
    engine/materials/surface-material-provider.ts,
    engine/materials/neutral-material-provider.ts,
    engine/scene/furniture-model.ts,
    bridge/react/use-furniture-model-cache.ts,
    bridge/react/floor-build.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/use-framed-scene.ts,
    bridge/react/live-scene-root.tsx,
    bridge/react/live-scene-view.tsx,
    bridge/react/renderer-memory-probe.tsx,
    bridge/react/renderer-memory-attributes.ts,
    bridge/react/e2e-runtime-flag.ts,
    e2e/tests/scene-edge-overlay-resources.spec.ts,
    e2e/tests/live-webgpu.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0226: A replaced scene build frees what it owns once it is no longer drawn

## Status

Accepted on 2026-11-21 for issue #434. It refines ADR-0088, ADR-0089, and ADR-0219. The section
"How this refines earlier decisions" says how.

## Context

The live 3D pane builds Three.js objects for every edit and never freed the ones it replaced. A
rebuilt room, a floor rebuilt by a paint edit, the ground plane of a dropped scene, and a whole
reconciler dropped when the surface-edge overlay flips all went to the garbage collector with
their GPU buffers still allocated. React Three Fiber does not dispose a `<primitive>`, so nothing
else freed them either. Each floor build also made a new material provider, and its materials
lived on through any sub-group a later build reused.

Freeing them is not as simple as calling `dispose()` when the reconciler replaces something. Two
things get in the way.

First, resources are shared. Provider materials are shared by every mesh of a build and by later
builds that reuse its sub-groups. A loaded furniture mesh is a clone of a cached template and
shares the template's geometries, materials, and textures. Freeing a shared resource while a live
mesh still draws it does not crash. The renderer uploads it again on the next draw. So the defect
shows up as churn, and a screenshot cannot catch it.

Second, there are two React roots. React Three Fiber commits the Canvas children in its own React
root, at least one task after react-dom commits. Until then the frame loop keeps drawing the old
scene root. The renderer uploads a disposed geometry again on its next draw and keeps it in a
strong map, and nothing frees it a second time. So a free at the react-dom commit lets one frame
draw freed resources, and that frame leaks them for good.

## Decision

### Held unless owned

A scene tree owns and frees every geometry, material, and texture reachable from its meshes,
lines, and points, except resources a long-lived owner has marked held. Only the owner frees a
held resource.

The mark is a module-level `WeakSet` in `engine/scene/dispose-object.ts`. `markCacheHeld` adds a
resource and `isCacheHeld` reads it. The mark is not kept in `userData`, because `Material.clone`
and `Texture.clone` copy `userData`. A near-wall fade clone or a furniture-base clone would then
inherit the mark and never be freed. A `WeakSet` entry is not copied. Marking a material does not
hold the textures it carries, and `Material.clone` shares those textures, so an owner marks each
texture it keeps as well.

Two functions walk a tree. `disposeObject` frees each geometry, material, and material texture of
the tree once per call, however many objects share it, and skips held ones. `releaseCachedObject`
frees all of them, held ones included. Only the owner of the held resources calls it.

There are two owners today:

- The material providers. `SurfaceMaterialProvider` and `NeutralMaterialProvider` keep their
  materials in a `HeldMaterialCache`, which marks each material held when it is created. Their
  `dispose()` frees each cached material once and empties the cache, so a second call does
  nothing. `dispose()` is on the concrete classes, not on the `MaterialProvider` interface.
- The furniture model cache. `parseFurnitureModel` marks every resource of a parsed template held
  (`markObjectHeld`). The cache frees a template with `releaseCachedObject`.

### One provider per floor build lineage

`CachedFloorBuild` carries the provider its sub-groups draw from, as `materials`. When a floor
rebuilds with the same paint, `buildFloorBuild` reuses `prev.materials`, so the new sub-groups and
the reused ones draw from one provider. A paint edit passes no `prev`, so the floor rebuilds whole
with a new provider. That ends the old lineage. Sub-groups are reused only from a prior build with
the same paint, so every sub-group of a build draws from that build's provider by construction.

### Deferred retirement

`reconcile` defers its frees. It adds what it replaces to a retired queue, so a render never
frees what the scene still on screen may draw. One case frees at once: a cache hit with a new
grade swaps the cached scene's ground plane in place, removing the old plane from the root in
the same call that frees it, so nothing can draw it afterwards. The queue takes:

- every sub-group of a replaced floor build that its successor did not reuse, compared by
  identity, so a reused sub-group is never freed;
- the replaced build's provider, but only when the successor draws from a different one (the end
  of the lineage);
- the ground plane of every cached scene the reconcile drops, and nothing else of that scene,
  since its sub-groups belong to the cached floor builds;
- a superseded scene of an empty graph.

`releaseRetired(displayed)` frees the queue, and only when `displayed` is the scene the latest
reconcile returned. For any other scene it frees nothing and keeps the queue. The library root can
commit a scene that is not the latest one. A time-sliced render of that root can yield, and React
then commits the older scene first. A discarded render of the outer tree also runs `reconcile`.
In both cases later reconciles may have retired parts of the scene that is still drawn. One
identity check covers both cases, so the code does not have to reason about scheduler lanes
across two roots.

`dispose()` routes everything the reconciler still holds through the same queue and frees it:
every cached build and its provider, the ground planes of cached scenes, the current empty-graph
scene, and the queue itself. It leaves held template resources alone. A second call frees nothing.

### The release point

Retired resources are freed when the replaced scene root stops being drawn.

While a scene root is attached in the library root, that moment is the library's commit that
detaches the old root and attaches the new one. `LiveSceneRoot` in
`bridge/react/live-scene-root.tsx` renders the keyed `<primitive>` and, from a layout effect in
the same component, calls `onAttached(framed)`. React runs layout effects after the mutation
phase, so at that point the old root has no parent and the new one does. Drawing and reporting
sit in one component so they cannot drift apart. `onAttached` is `onSceneAttached` from
`useFramedScene`. It marks a scene attached, disposes the waiting superseded reconcilers other than
its own, and calls `releaseRetired(scene)`. The function it returns marks no scene attached and
frees nothing. `LiveSceneCanvasProps` requires `onSceneAttached`, so a missed wiring fails the type
check.

While no scene root is attached, nothing draws. That covers a renderer that is loading, starting,
or could not start, and the hook running without a Canvas. Then the passive effect in
`useFramedScene` releases after its own commit. While a scene is attached, that effect frees
nothing.

An overlay flip makes a new reconciler. The old one waits in a set of superseded reconcilers and
is disposed at the same release point by the same rule. Two flips can happen before one library
commit, so several can wait at once.

On unmount the live reconciler and every waiting one are disposed a microtask after the hook's
cleanup. A StrictMode remount runs the effect again before that microtask and cancels it. The
Canvas cleanup in the same effect flush has already stopped the frame loop for that root.
Activity hiding runs the cleanup with no setup, so the hook is not safe under it. The view is
unmounted instead of hidden.

### How collectable a released tree is

At release, every unheld geometry, material, and texture of a retired tree is freed on the GPU. A
released tree is not fully collectable at that point, though. Three's WebGPU renderer keeps one
render object per mesh, material, render context, and lights node, and each render object adds a
`dispose` listener to its material that closes over it. That listener is removed only when the
material is disposed or the render object's cache key changes. Neither removing the mesh from the
scene nor disposing its geometry removes it. So a retired mesh drawn with a held material stays
reachable from that material, with its parent chain up to the old scene root, until the owner
frees the material. Its vertex and index buffers are already freed.

That retained memory is bounded by the owner. For provider materials it lasts until the floor's
lineage ends (a paint edit), the overlay flips, or the pane unmounts. Within one lineage each
rebuilt sub-group adds to it. For template materials it lasts until the model cache releases the
template. `renderer.info` does not show it. Issue #1040 tracks measuring it with a heap snapshot
after repeated edits, and then deciding whether to bound it, for example by rotating the provider
after a number of rebuilds.

### Known residual: the first attach

A scene that was handed to the library root but is not committed there yet counts as not
attached. If a user-input edit lands while the first mount of the scene contents has yielded, the
hook's effect frees a batch that the stale first scene then draws. The window is a few
milliseconds, once per pane start, and one batch leaks each time it happens. This is derived from
the source and has not been reproduced. The fix is additive: `SceneRendererCanvas` reports the
handover from the outer tree as a second reason to wait. It is left for issue #1038 because it
adds a prop to a shared component.

### Known residual: the build of a deleted floor

`buildsByFloorId` is keyed by floor id, and only `dispose()` prunes it. When a floor is deleted,
its cached sub-groups and its provider stay allocated until the overlay flips or the pane
unmounts. The leak is bounded by the number of floors deleted during one pane lifetime. A probe
on this branch reproduced it: after the deleted floor's scene was dropped, its 13 geometries were
freed only at `dispose()`. The code before this change never freed them either, so nothing
regressed. The fix is to prune the cached builds against the project's floor ids and to retire
the pruned builds through the queue. Pruning against the shown graph's nodes would be wrong,
because the active-floor graph holds one node and every floor switch would then discard the
cache. Issue #1039 tracks it.

### Known residual: model cache eviction

`furniture-model-cache.ts` frees an evicted template at once, from a passive effect. If a clone
of that template is still in the scene the library root draws for one more frame, the renderer
uploads the freed geometry again, and nothing frees it later because the clone's resources are
held. This happens only when the cache holds more templates than `maxTemplates`, and it was true
before this change. Issue #1042 tracks deferring that eviction to the release point.

### The test-only memory probe and the GPU check

`RendererMemoryProbe` (`bridge/react/renderer-memory-probe.tsx`) is mounted in the live pane's
Canvas. After each drawn frame it writes the renderer's `info.memory.geometries` and
`info.memory.textures` onto the canvas as `data-renderer-geometries` and `data-renderer-textures`.
It renders nothing and registers no frame callback unless the `?e2e` runtime flag is set. The flag
is read by `e2eRuntimeFlagSet` (`bridge/react/e2e-runtime-flag.ts`), which the furniture model
signal also uses. It is a runtime flag, so it survives the production preview build that the
end-to-end tests run against.

`e2e/tests/scene-edge-overlay-resources.spec.ts` runs in the GPU project. It calls
`guardLiveSceneSupport` from `e2e/tests/live-webgpu.ts`, so it skips on a runner that has no
WebGPU adapter or no WebGL 2 context, and it fails there when `E2E_REQUIRE_WEBGPU` is set. The
macOS WebGPU job in `.github/workflows/ci.yml` runs it with `E2E_REQUIRE_WEBGPU` set, so the
check runs on the WebGPU backend whose render object and geometry behavior this ADR analyses. The
Linux runners have no adapter, so the spec skips there. The spec draws a closed room, takes a settled reading, flips the surface-edge overlay
ten times, and expects both counts to return to the first reading or below. The check allows no
margin. It also checks that the first flip raised the geometry count, so the probe is known to
count what the overlay builds.

`renderer.info` does not count materials, so a leaked material cannot show in that check. The
unit tests of the providers and the reconciler cover materials. They track `dispose` events with
`bridge/react/dispose-tracking-test-support.ts`.

### How this refines earlier decisions

- ADR-0088 made the reconciler cache floor builds. The reconciler now also owns the lifetime of
  what it replaces. Apart from the ground-plane swap on a grade change, nothing it drops is
  freed during `reconcile`. It is freed by `releaseRetired(displayed)` or `dispose()`, at the
  release point above.
- ADR-0089 reuses unchanged sub-groups within a floor. Reuse by identity is now also the retire
  rule: a sub-group is retired only when the successor build does not hold it. A build that
  reuses sub-groups also keeps the prior build's provider, where before every build made a new
  one.
- ADR-0219 said that `disposeObject` frees only the textures a scene owns, not those a cache
  holds. The held mark is how that works, and it now covers geometries and materials as well as
  textures. A cache marks what it keeps with `markCacheHeld` and frees it itself.

## Consequences

- A new cache or provider that hands resources to scene trees marks each one held and frees them
  in its own release. Unmarked, a scene release would free them under the cache.
- A new builder that shares a resource across sub-groups draws it from a held owner. A resource
  private to one tree needs nothing; `disposeObject` frees it once.
- A new place that replaces part of a scene adds it to the retired queue. It does not free
  anything during render, unless it detaches the part from the drawn root in the same call, as
  the ground-plane swap does.
- `HeldMaterialCache` marks materials only. A provider that gives a cached material a texture
  marks that texture held as well. Otherwise a sub-group release frees the texture while live
  meshes still draw it. No provider material carries a texture today.
- A new way of drawing the live scene root keeps the report next to the drawing, the way
  `LiveSceneRoot` does, or the release point is lost.
- Full builds outside the reconciler stay out of scope. The scene harness remounts per state and
  releases its renderer with its canvas (ADR-0197).
- Meshes drawn with a held material stay reachable until their owner frees it, as described
  above.

## Alternatives considered

Count references to every material across live trees. It is exact, but every reuse, reparent,
and fade swap has to count, which is easy to get wrong and makes a double dispose likely.

Free geometries only and never materials. It is the simplest, and geometry is most of the memory.
But a new provider per edit would leak a material set per edit with no bound, and `renderer.info`
would not show it.

Defer the release with a frame callback. A frame callback knows nothing about the commit, and the
next frame can still come before the detach. It would have to guess a frame count, and it polls on
every frame.

Have the reconciler check that the old root is no longer under a scene. Bridge code would read
Three.js parent links, `dispose()` would need the same check, a provider has no parent to check,
and nothing calls again when the detach happens.

Swap the scene root imperatively on a stable stage group from the hook's effect, so that the swap
and the free are one synchronous step. It is the only option with no gap at all. It changes how
the live view attaches its scene (ADR-0088), needs an engine surface, and touches selection,
proxies, the fade, and readiness, which all take the root as a prop from the library root. That
is too wide for this issue. If it is built later, `LiveSceneRoot` and `onSceneAttached` go away.

Release at the react-dom commit, in the hook's effect alone. That is the gap described in the
context, and it leaks a batch whenever a frame falls in it.

## References

- Issue #434, ADR-0088 (incremental scene updates), ADR-0089 (within-floor mesh reuse), ADR-0219
  (pack assets carry textures), ADR-0132 (surface-edge overlay), ADR-0170 (scene session state),
  ADR-0197 (scene renderer lifecycle).
- Follow-up issues: #1038 (the first attach), #1039 (the build of a deleted floor), #1040
  (render objects that stay reachable within a lineage), and #1042 (model cache eviction). This
  change also closes #1041, which asked for the overlay spec in the macOS WebGPU job.
- three 0.184: `src/renderers/common/RenderObject.js` (the material `dispose` listener and
  `dispose()`), `RenderObjects.js` (the chain map of render objects), and `Geometries.js` (upload
  on draw and the free on `dispose`).
