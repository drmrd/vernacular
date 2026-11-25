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
    decisions/ADR-0200-half-edge-trial-result-and-the-inner-form-of-the-plan-geometry,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-deriver.ts,
    core/scene/scene-graph-assembly.ts,
    core/scene/scene-graph-deriver-wall-height.test.ts,
    core/scene/scene-graph-deriver-parity.test.ts,
    core/scene/scene-graph-parity-fixtures.ts,
    core/scene/scene-graph-deriver-floor-id.test.ts,
    tests/performance/scene-rebuild-counts.test.ts,
    core/scene/scene-graph-for-floor.ts,
    core/scene/scene-graph-plan-geometry.test.ts,
    core/scene/plan-geometry-builds.test.ts,
    core/topology/floor-plan-geometry.ts,
    core/topology/wall-network.ts,
    core/topology/wall-network-memo.ts,
    core/topology/get-or-create.ts,
    core/topology/openings.ts,
  ]
status: current
updated: 2026-11-24
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

## Update (2026-11-18): the wall cache compares what a wall node reads from its floor

The decision above keys each wall's cached node on the `Wall` object alone. That key
misses part of the node. `deriveWallNode` copies two values from the floor: the floor id
as `floorId`, and `defaultCeilingHeight` as the node's `height`. The ceiling height
command (`setFloorCeilingHeight`) replaces the floor object but keeps the same wall
objects. A warm deriver then found every wall in its cache and returned nodes with the
old height, 2438 where the floor now said 4000 (issue #676). No control in the editor
dispatches that command yet, so no user could trigger the fault. A test did record it,
though: the rebuild count baseline had stored the stale reuse as the expected count, as
the paragraph on the preview below shows.

The wall cache now follows this rule: a cache entry stores every input its key does not
capture and compares those inputs on a hit. The other caches of the file then followed it
only in part. For a wall node the inputs are the floor id and the ceiling height.
`CachedWallNode` holds both next to the node, and `wallNodeFor` returns the cached node
only while both still match the current floor. Otherwise it derives a new node and
caches that one. The room cache in the same file already did this for the room overrides
and the ceiling height: `CachedRoomNodes` stores both, and `roomNodesFor` compares them.
It did not compare the floor id then. That cache keys on the floor's `walls` array, not on
the `Floor` object as the consequences above say. It has done so since the change of
2026-06-15 that [[ADR-0089-within-floor-mesh-reuse]] records.

A ceiling height change now gives every wall of that floor a new node. The preview
reconciler of [[ADR-0089-within-floor-mesh-reuse]] reuses a floor's wall sub-group only
while every wall node keeps its reference (`reuseOrBuildWall` in
`bridge/react/floor-build.ts`). So after this change the wall sub-group of that floor
rebuilds, where before it was reused at the old height. The rebuild count gate
`tests/performance/scene-rebuild-counts.test.ts` shows this. For its reference edit
`set-ceiling-height`, the baseline `tests/performance/baseline-scene-rebuild.json` had
recorded 0 rebuilt wall groups, so the walls of the preview kept the old height. It now
records 1, and no other count in the baseline changed.

One limit was left, in three caches. The room cache keys on the floor's `walls` array,
the opening cache on the `Opening` object, and the furniture cache on the
`FurnitureInstance` object. `deriveRoomNodesForFloor`, `deriveOpeningNode`, and
`deriveFurnitureNode` all copy the floor id into the node, and none of the three caches
compared it. The wall cache was then the only one that did. That was safe because no
command changes a floor's id or carries the same walls array, opening, or furniture
object to another floor. The next update closes this limit.

The evidence is `core/scene/scene-graph-deriver-wall-height.test.ts`, seven tests. They
cover a warm deriver after a ceiling height change, both directly and through the
command, a match with the pure projection, a return to the old height, reuse when the
floor changes in other ways, and a wall object that moves under another floor id.

## Update (2026-11-18): one list of fields, and the floor id in every cache

The fields of a `SceneGraph` are now listed in one place. `assembleSceneGraph(project,
derive)` in `core/scene/scene-graph-assembly.ts` builds all nine of them. Its second
argument is a `SceneNodeDerivations` object with one function for each kind of node.
`deriveSceneGraph` passes `PURE_NODE_DERIVATIONS`, which `core/scene/scene-graph.ts`
builds from the pure helpers. The function that `createSceneGraphDeriver()` returns
passes the same set with the floor, wall, room, opening, stair, and furniture members
replaced by cached ones. The underlay and dimension members stay pure, and
`assembleSceneGraph` reads the grade through `resolveGradeElevation`, so both paths
derive underlays, dimensions, and the grade on every call. Before this, each entry point
wrote the nine fields by hand, and a field added to one could be left out of the other.
That happened once, with the grade elevation.

A new field now goes into the `SceneGraph` interface in `core/scene/scene-graph.ts` and
gets one line in `assembleSceneGraph`. If it holds a new kind of node, it should also get
a member in `SceneNodeDerivations` and a pure function for that member in
`PURE_NODE_DERIVATIONS`. The compiler does not force this: the new line could call a
pure helper directly, and both entry points would still agree, but that kind of node
would then have no place for a cache. Once the member is in the interface,
`PURE_NODE_DERIVATIONS` does not compile without it, because the constant has the
interface as its type. The deriver spreads `PURE_NODE_DERIVATIONS` and replaces only the
members it caches, so the new member uses the pure function until it opts into a cache.

The parity test `fills every field of the scene graph` catches part of a missing field.
It fails while any list field of the pure graph is empty, so a new list field needs a
place in the fixture of that test. For a field that is not a list it checks only that
the value is a number. An optional field that `assembleSceneGraph` leaves out is caught
by no test: the compiler accepts the omission, and both entry points then agree.

Writing the pure projection as a call to a fresh deriver was rejected for two reasons.
`scene-graph.ts` would then import a value from `scene-graph-deriver.ts`, which imports
values from `scene-graph.ts`. That is a value import cycle, and
`tests/architecture/import-cycles.test.ts` fails on any such cycle among the files of
the six layers. The pure projection would also stop being an independent check. The
parity tests compare a warm deriver with `deriveSceneGraph`, and with that design each
of them would compare the cache with itself. The new file imports only types from
`scene-graph.ts`, so the chosen design has no cycle. The list did not become an optional
second parameter of `deriveSceneGraph` either. The function is public, so the parameter
would change its signature, and it would let a caller hand a stateful wrapper to a
function that promises to have no hidden state.

The room, opening, and furniture entries now store the floor id next to the node.
`CachedRoomNodes`, `CachedOpeningNode`, and the new `CachedFurnitureNode` each hold a
`floorId`, and `roomNodesFor`, `openingNodesFor`, and `furnitureNodeFor` return the
cached node only while that id equals the id of the current floor. They compare the id,
never the floor object, so a new floor object with the same id does not by itself
rebuild the node.

Dropping `floorId` from the room, opening, and furniture nodes, so that no cache would
have to compare it, was rejected because readers in four layers use the field.
`buildFloorGroup` in `engine/scene/build-scene.ts` and `floorEntities` in
`bridge/react/floor-build.ts` filter rooms, openings, and furniture by it.
`roomsSharingFloor` in `editor/shell/inspector.tsx` counts the rooms of a floor with it,
and `sceneGraphForFloor` in `core/scene/scene-graph-for-floor.ts` narrows the graph by
it.

This closes the limit that the update above named, and every cache of the deriver now
follows the rule stated there. The floor cache keys on the `Floor` object and the stair
cache on the `project.stairs` array. Each key is the whole source of its nodes, so those
two entries store the node alone and have nothing to compare.

The fault was latent. No handler in `core/commands/` writes the id of a floor or moves a
walls array, an opening, or a piece of furniture to another floor. No rebuild count
changed either: `tests/performance/baseline-scene-rebuild.json` is untouched, because no
reference edit of the gate changes a floor id.

The evidence is in two files. `core/scene/scene-graph-deriver-parity.test.ts` has 19
tests. They compare the deriver with the pure projection on every field, cold and after
each of nine kinds of edit, and also after a wall of the room is removed and after the
ground floor takes another id. One test pins that the room override of the fixture
applies to its room, so the comparison covers an override that is in use.
`core/scene/scene-graph-deriver-floor-id.test.ts` has
seven tests. For each of the three caches they move the source objects under a floor
with another id, check that the node carries the new id, and pin that the node is
reused on the next derivation.

Two functions that narrow a derived graph still list its fields by hand:
`sceneGraphForFloor` in `core/scene/scene-graph-for-floor.ts` and
`sceneGraphForBuilding` in `bridge/react/view-scene-graph.ts`. Both return a
`SceneGraph`, so a new required field fails to compile there, but each must pass the
optional `gradeElevation` through by hand, and a new optional field could be dropped
without an error. A follow-up, issue #873, tracks this.

## Update (2026-11-24): one plan geometry for each floor, read by the room nodes

The scene graph now carries a `planGeometry` field: one `FloorPlanGeometry` for each floor,
in floor order. It holds the wall network of the floor (its walls with their thickness
resolved, junctions, edges, junction fans, footprints, junction fills, and both faces of
every wall), the rooms, the walls and records set aside from them, and the span of each
opening along its edge. The field is optional in the interface, so hand-built literals can
omit it, and `sceneGraphForFloor` filters it by floor like the other lists.

`assembleSceneGraph` lists the field once. `SceneNodeDerivations` has a new `planGeometry`
member, and `roomNodes` now takes that geometry as its second argument. `deriveSceneGraph`
passes `deriveFloorPlanGeometry` through `PURE_NODE_DERIVATIONS`, and
`createSceneGraphDeriver()` passes the function that `createPlanGeometryDeriver()` returns,
so both entry points set the field. The room nodes copy their rooms from the geometry
(`roomNodesFromPlanGeometry`) in place of a face walk of their own. `deriveRoomNodesForFloor`
keeps its signature and wraps that function. The room cache still keys on `floor.walls`, and
a hit can ignore the geometry, because the rooms depend only on those walls.

The three parts of a geometry are kept by their stated inputs, not by the floor alone. The
deriver keeps the whole geometry for each `Floor` object. Under it, the network is kept for
a wall list and a registries object (`wallNetworkFor`), the rooms and the left-out walls
for a network, and the opening spans for a network and an openings list. An opening edit
gives a new floor with the same wall list, so it finds the network and the rooms already
built and recomputes only the spans. The count of network builds does not move, which
`core/scene/plan-geometry-builds.test.ts` checks. A wall edit builds one network for the
floor, and the rooms, footprints, and fills all come from it.

An opening span uses the same clamped placement as the 3D wall opening, through
`clampedOpeningPlacement`, so the plan and the walls agree on which edge holds an opening.
The deriver builds its networks with the built-in registries, as `deriveRooms` does.

`sceneGraphForBuilding` in `bridge/react/view-scene-graph.ts` still leaves the field out
when it narrows a graph, like the other hand-listed copies noted above.
