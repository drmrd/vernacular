---
slug: decisions/ADR-0088-three-dimensional-incremental-scene-updates
title: 'ADR-0088: Incremental scene updates in the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, preview, performance, scene-graph, reconciler]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0061-three-dimensional-wall-shell,
    decisions/ADR-0067-three-dimensional-painted-preview,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-three-dimensional-incremental-scene-updates.md,
    docs/plans/2026-06-15-three-dimensional-incremental-scene-updates.md,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/framed-scene-reconciler.test.ts,
    bridge/react/webgpu-scene-view.tsx,
  ]
status: current
updated: 2026-06-15
---

# ADR-0088: Incremental scene updates in the three-dimensional preview

## Status

Accepted. Issue #166, the incremental-update slice the foundation named (foundation
specification section 5.5) and the painted preview deferred to
([[ADR-0067-three-dimensional-painted-preview]]). The owner deferred it earlier as a
load-bearing architecture choice and confirmed the middle-ground option for this slice.

## Context

The preview rebuilds its whole scene on every project edit. The view subscribes to the
live scene graph, scopes it to the active floor, and feeds that to `buildFramedScene`,
which builds the floor's geometry, resolves its paint materials, draws the edge overlay,
flags shadow casters, clones the near-wall materials, and frames the camera. The consumer
wraps that in a memo keyed on the scoped graph and the paint.

That memo recomputes far more often than the scene changes. The scoping helper returns a
fresh object on every call, and the project's scene graph is one shared snapshot, so any
edit anywhere produces a new key. Editing one floor rebuilds the preview of another,
switching back to an unchanged floor rebuilds it, and a change that does not touch the
shown floor still tears down its scene and reframes the camera.

The deriver already memoizes each floor's node by the source `Floor` object
([[ADR-0018-scene-graph-derivation]]), and the command handlers replace an edited floor
with a new object while leaving untouched floors alone. So a floor's node keeps its
reference until that floor is edited. That reference is a ready dirty signal; what was
missing is a consumer that uses it instead of rebuilding every time.

## Decision

Put a stateful reconciler between the scene graph and the built scene, in the bridge
layer next to `buildFramedScene`. `createFramedSceneReconciler()` returns an object whose
`reconcile(graph, paint)` caches the built `FramedScene` per floor id. On a call it reads
the active floor node, and when that node reference and the paint reference both match what
it built for that floor, it returns the cached scene with no rebuild and no reframe.
Otherwise it rebuilds that floor with `buildFramedScene` and stores the result. The live
preview holds one reconciler for its lifetime instead of calling `buildFramedScene` in a
per-edit memo.

The floor is the unit of rebuild. Junctions miter against their neighbors within a floor
([[ADR-0061-three-dimensional-wall-shell]]), so moving one wall can change the geometry of
every wall sharing a junction with it; rebuilding the whole floor resolves all of those
together. That makes the floor the natural granularity: it satisfies the non-local wall
constraint the foundation called out, and the floor node reference is exactly the signal
that says the floor changed. The reconciler keeps the build of each floor it has shown, so
moving among the floors of a multi-story house reuses each floor's scene until that floor
is edited.

The change is a pure wrapper around the existing build. It does not alter what any scene
looks like, so it is behavior-preserving: the existing end-to-end suite and the committed
scene baselines stay green without regeneration. The reconciler's reuse and rebuild
decisions are unit tested by reference identity; the consumer swap is coverage-excluded
glue covered by the end-to-end suite.

## Alternatives considered

- **A mesh-level reconciler (reuse within a changed floor).** Diff the scene graph down to
  individual entities and patch only the meshes that changed, reusing unchanged walls,
  rooms, and openings within an edited floor. It would help the common single-floor edit,
  which the floor-level approach still rebuilds whole. It needs finer memoization in the
  deriver (openings and rooms keyed by their own content, not their floor) and a diff-and-
  patch path that has to honor the same non-local wall constraint per entity. That is the
  heavier reconciler the middle ground sets aside; it can land later behind this same seam
  without changing the consumer.
- **An explicit dirty channel on the editor session.** Have the session emit per-entity
  dirty markers that the consumer subscribes to. It moves change tracking upstream into a
  new load-bearing channel. The deriver's reference memoization already encodes the same
  information (an unchanged floor keeps its node reference), so reading that reference is
  enough without a second mechanism.
- **Per-floor paint differencing.** Narrow a paint change to the floors it touches rather
  than treating any paint edit as a cache miss. Paint is one project-wide set today, so
  the reconciler invalidates on a new paint reference and rebuilds on next use. Narrowing
  it is a later refinement once paint edits become a measured cost.

## Consequences

- Switching back to an unedited floor, and any edit that does not change the shown floor,
  reuse the built scene with no rebuild and no camera reframe. Editing the active floor
  still rebuilds it whole, which resolves its junctions correctly.
- The wholesale rebuild now lives behind a named seam, so a finer reconciler can replace
  the internals later without touching the consumer, which is the point the foundation made
  in naming the seam.
- The slice is behavior-preserving, so it ships with no scene-baseline change. The reuse
  logic is unit tested by reference identity, and the unchanged end-to-end suite is the
  evidence that no visible behavior moved.
- Reuse within a changed floor, per-floor paint differencing, cache eviction, and showing
  more than one floor at once are deferred, recorded in the spec. The cache keeps one build
  per floor a house has shown; floor counts are small, so it is left unbounded for now.
