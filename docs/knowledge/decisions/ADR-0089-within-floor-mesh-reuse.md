---
slug: decisions/ADR-0089-within-floor-mesh-reuse
title: 'ADR-0089: Within-floor mesh reuse in the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, preview, performance, scene-graph, reconciler]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0061-three-dimensional-wall-shell,
    decisions/ADR-0088-three-dimensional-incremental-scene-updates,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-within-floor-mesh-reuse.md,
    docs/plans/2026-06-15-within-floor-mesh-reuse.md,
    core/scene/scene-graph-deriver.ts,
    engine/scene/floor-subgroups.ts,
    engine/scene/wall-scene-helpers.ts,
    bridge/react/room-scene-node-equal.ts,
    bridge/react/framed-scene-reconciler.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0089: Within-floor mesh reuse in the three-dimensional preview

## Status

Accepted. The mesh-level reuse tier that [[ADR-0088-three-dimensional-incremental-scene-updates]]
named and set aside. The owner approved building the full tier, including the value
comparison of derived rooms.

## Context

The floor-level reconciler from ADR-0088 reuses a floor's whole build until that floor is
edited, then rebuilds the floor whole. That handles switching among floors and edits that
miss the shown floor, but the common case still rebuilds too much: a single edit to the
active floor tears down and rebuilds every wall, room, and opening on it, including the
ones the edit never touched. Resizing one door rebuilds every room slab and every other
door; nudging one wall rebuilds every room, even the ones on the far side of the floor.

ADR-0088 set this aside as the heavier reconciler. It needs finer change tracking than the
floor reference carries, and a build that can hand back the unchanged pieces of an edited
floor.

Two facts in the deriver decided what a floor edit invalidated. Walls were already
memoized by their source `Wall` object, so an unchanged wall kept its node reference. But
openings were not memoized at all (the deriver flat-mapped them on every derivation, so an
opening node was a fresh object every time), and rooms were memoized by the source `Floor`
object, which a non-topology edit replaces, so an opening edit needlessly re-derived every
room.

## Decision

Three pieces, behavior-preserving for the live preview.

1. **Two deriver refinements (core).** Memoize opening nodes by their source `Opening`
   object, invalidating when the host wall reference changes, the same reference
   memoization walls already use ([[ADR-0018-scene-graph-derivation]]). And re-key the room
   memo on the floor's `walls` array rather than the whole `Floor`, comparing the floor's
   `defaultCeilingHeight` explicitly (the ceiling-height command spreads the floor and
   keeps the same walls array, so that fallback is not captured by the walls key alone).
   Rooms then survive an edit that leaves the walls untouched.

2. **Self-contained sub-groups (engine).** A new `engine/scene/floor-subgroups.ts` builds
   each entity as its own group carrying its own edge overlay and shadow flags, with the
   wall sub-group additionally owning the near-wall transparency targets for its exterior
   walls. A reused sub-group needs no further decoration. The shared wall-graph helpers move
   to `engine/scene/wall-scene-helpers.ts` so the full-scene builder and the sub-group
   builders share them.

3. **A sub-floor reconciler (bridge).** The reconciler holds one floor's build as its
   individual sub-groups and, on a rebuild of that floor, assembles a fresh floor group
   from them, reusing each sub-group whose entity is unchanged:
   - the wall group (and its near-wall targets) when every wall node and every wall-hosted
     opening node is unchanged by reference, since the wall is the floor's non-local unit
     (junctions miter across walls, openings cut voids; [[ADR-0061-three-dimensional-wall-shell]]);
   - each opening fill when its node reference is unchanged, now that openings are memoized;
   - each room shell when its derived node is unchanged in value.

   The camera pose and bounds are recomputed from the assembled group every time, so reuse
   never changes the framing, and the floor group is rebuilt fresh with the current
   elevation, so an elevation edit reuses the meshes while moving them to the new height. A
   paint edit keeps the prior slice's behavior and rebuilds the floor whole.

### Comparing derived rooms by value

Rooms are a derived projection of the wall topology with no source object, so a single wall
edit re-derives every room node even though it reshapes only the rooms next to the moved
wall. Reference identity cannot tell an unchanged room from a changed one. So the reconciler
compares rooms by value over the geometry the shell reads (`bridge/react/room-scene-node-equal.ts`).
This is a departure from the reference-only memoization the deriver settled on, and it is
confined to the bridge reconciler: the core deriver stays reference-only, because a stored
entity has an object whose identity is the dirty signal, and a derived room does not.

### Leaving the full-scene build in place

The slice was scoped to leave `buildScene` and `buildFramedScene` untouched (the design plan
had folded the preview's full build through the sub-group builders as well). `buildScene` is
a geometry-and-edges primitive with several test consumers that pin that contract, and the
harness renders its committed scene baselines through `buildFramedScene`. Routing those
through the fuller-decoration sub-groups would change their output and risk those baselines.
The reconciler is the live preview's only build path, so the sub-group reuse lives there, and
the full-scene builder and the harness stay on their current path with their baselines
unchanged.

## Alternatives considered

- **Reference-only reuse, no room value comparison.** Reuse walls and openings by reference
  and always rebuild rooms. Smaller and fully consistent with the deriver's rule, but it
  misses the dominant case (a single wall edit still rebuilds every room), which is the
  point of the tier.
- **Structural memoization in the core deriver.** Compare room field values inside the
  deriver. Rejected for the same reason ADR-0018 rejected it for stored entities: it adds
  cost and papers over in-place mutation. The value comparison belongs in the bridge, scoped
  to the one node kind that cannot use reference identity.
- **Routing the full build through the sub-groups too.** Unifies the build path but changes
  the harness output and the committed baselines, and the full-scene primitive has consumers
  that depend on its narrower decoration. Left for a later slice if the two paths drift.

## Consequences

- An opening-only edit reuses every room and every other opening (the wall group rebuilds,
  since the void changed). A single wall edit reuses the rooms that did not change in value
  and the openings off the moved wall. An edit that touches no wall, room, or opening reuses
  everything and only reframes if the bounds changed.
- The change is behavior-preserving for the live preview: it builds the same scene from the
  same entity builders, so the end-to-end suite and the committed scene baselines stay green
  without regeneration. Reuse is verified by object identity in unit tests.
- The deriver's opening memo and the walls-array room key are general refinements that also
  reduce needless re-derivation for the 2D consumers, not only the preview.
- Per-floor paint differencing, sharing buffer geometry between entities with identical
  shapes, cache eviction, and showing more than one floor at once remain deferred, carried
  from ADR-0088.
