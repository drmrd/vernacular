---
slug: decisions/ADR-0018-scene-graph-derivation
title: 'ADR-0018: Scene-graph derivation as a memoized projection'
type: decision
tags: [architecture, scene-graph, rendering, derivation, memoization]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0037-image-underlay-and-calibration,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
  ]
status: current
updated: 2026-06-07
---

# ADR-0018: Scene-graph derivation as a memoized projection

## Status

Accepted. The pure projection and the memoized deriver are implemented and
unit-tested in `core/scene/`. The design specification (sections 6.1 and 6.10)
remains authoritative; this ADR records the implementation interpretation.

## Context

The project model is the authoritative state, but renderers and the export
pipeline should not read it directly. The design specification (section 6.1)
places a scene graph between them: a normalized, stable-identity projection of
the project model that the 2D plan renderer, the 3D scene renderer, and the
export pipeline all consume. It lives in `core/scene/` and is pure data with no
Three.js or DOM dependency, so the same derivation feeds rendering and export
and stays testable in plain Node.

The performance budget (section 6.10) calls for entity-keyed dirty tracking so
that only changed entities re-derive their nodes on each edit. A full re-walk of
the model on every command would not meet the interactive frame budget once
projects grow.

The scene graph now carries floors, walls, rooms, and underlays. Floors are
projected into a floor-only `nodes: SceneNode[]` array, walls into a sibling
`walls: WallSceneNode[]` array, derived rooms into a sibling
`rooms: RoomSceneNode[]` array, and per-floor underlays into a sibling
`underlays: UnderlaySceneNode[]` array (flat-mapped by `deriveUnderlayNodesForFloor`
with a namespaced `underlay:<id>`, ADR-0037); openings and furniture extend the node
kinds later without changing the seam. The multi-array shape is deliberate: it let the
engine's `buildScene` keep reading `nodes` untouched while the 2D plan reads
`graph.walls` for the geometry it draws and hit-tests, `graph.rooms` for the
floor fill it paints beneath the walls (ADR-0021), and `graph.underlays` for the
raster background it paints beneath the grid. Rooms are a pure derived
projection of the wall topology and are never stored; the derivation algorithm is
ADR-0026. Underlays are stored entities projected verbatim into nodes (ADR-0037).

## Decision

Two pieces in `core/scene/`:

1. **A pure projection.** `deriveSceneGraph(project)` maps each floor to a
   `SceneNode` through a `deriveFloorNode` helper and each wall to a
   `WallSceneNode` through a `deriveWallNode` helper. Node identifiers are stable
   and kind-namespaced (`floor:<floorId>`, `wall:<wallId>`) so a node's identity
   survives across derivations and across the two renderers. Module-level
   constants own the prefix schemes. The function is referentially transparent:
   equal input yields equal output, with no hidden state.

2. **A memoized deriver.** `createSceneGraphDeriver()` returns a stateful
   closure that caches each floor's node and each wall's node in two `WeakMap`s
   keyed by the source `Floor` and `Wall` object references. Re-deriving reuses
   the cached node for any entity whose reference is unchanged and rebuilds only
   the node for a replaced one. Reference identity is the dirty signal: an
   unchanged entity keeps its object, a changed one is a new object. The
   `WeakMap`s let nodes for dropped floors and walls be collected rather than
   leaked.

This is the entity-keyed dirty tracking the specification calls for, expressed
as reference memoization rather than an explicit dirty-set the dispatcher has to
maintain.

## Consequences

- Reference memoization composes directly with the command-handler convention
  from ADR-0005: handlers update state immutably by reassigning whole top-level
  slices, so an edited floor becomes a new object (its node rebuilds) while
  untouched floors keep their references (their nodes are reused). The same
  immutable-update discipline that lets the inverse-capture proxy stay shallow
  also makes scene-graph memoization correct. The two decisions reinforce each
  other.
- A handler that mutated a floor in place would defeat memoization (the
  reference would be unchanged while the content differed), the same failure
  mode that would defeat inverse capture. The immutable-update convention is the
  single rule that keeps both correct, and it is enforced by review and by the
  referential-identity tests.
- The renderers and the export pipeline depend only on the scene-graph shape,
  not on the project model, so the phase-8 fidelity renderer and the export
  formats slot in at this seam without touching the domain.
- `deriveFloorNode` and `deriveWallNode` are factored out and reused by both the
  pure projection and the memoized deriver, so the node shapes have one source of
  truth.
- The `addWall` handler reassigns the whole `floors` slice and rebuilds only the
  edited floor (a new floor object with a new `walls` array containing the new
  wall), so untouched floors and untouched walls keep their references and reuse
  their cached nodes. The same immutable-update discipline that keeps inverse
  capture correct keeps wall-node memoization correct.
- The `rooms: RoomSceneNode[]` sibling array is derived from the wall topology, not
  from any stored room state (ADR-0026). The deriver memoizes a floor's room nodes
  in a third `WeakMap` keyed by the source `Floor` reference, so re-deriving a
  project whose floor object is unchanged reuses the cached room nodes and only a
  floor whose `walls` changed (and is therefore a new floor object) re-runs room
  derivation. Room derivation is keyed at floor granularity rather than wall
  granularity because a single wall edit can add, remove, or reshape several of
  the floor's rooms at once.
- The bridge wraps this deriver in a version-memoized `getSceneGraph()`
  (ADR-0019): the session invalidates a version counter on each change and
  re-derives lazily, so the snapshot reference is stable between mutations and is
  safe to use directly as a `useSyncExternalStore` source for both the R3F canvas
  and the 2D plan view (ADR-0021).

## Alternatives considered

- **Re-derive the whole graph every time, no memoization.** Simplest, but it
  discards the dirty-tracking requirement and would not meet the frame budget as
  entity counts grow.
- **An explicit dirty set maintained by the dispatcher.** The dispatcher would
  record which entities each command touched and hand that to the deriver. This
  couples the command layer to the derivation layer and duplicates information
  that reference identity already carries for free under the immutable-update
  convention. Deferred unless profiling shows reference memoization is
  insufficient.
- **Structural memoization (compare field values).** More robust against in-place
  mutation, but more code and slower, and it would paper over violations of the
  immutable-update convention rather than surfacing them. Reference identity is
  the cheaper and stricter choice given the convention is already in force.
