---
slug: decisions/ADR-0063-three-dimensional-opening-voids
title: 'ADR-0063: Opening voids as wall cut-outs, the void-contour generator, and the graph-aware wall builder'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    scene,
    openings,
    voids,
    cut-outs,
    reveal,
    contour,
    wall-graph,
    element-types,
    scene3d-reference,
    material-provider,
    surface-role,
    winding,
    extrusion,
    testing,
    visual-regression,
    playwright,
    engine,
    core,
  ]
related:
  [
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-12-three-dimensional-opening-voids.md,
    docs/plans/2026-06-12-three-dimensional-opening-voids.md,
    core/registries/element-types.ts,
    core/scene/opening-void.ts,
    core/scene/scene-graph.ts,
    core/topology/opening-edge.ts,
    engine/scene/wall-builder.ts,
    engine/scene/build-scene.ts,
    bridge/react/scene-harness-view.tsx,
    e2e/tests/scene-visual-regression.spec.ts,
  ]
status: current
updated: 2026-06-12
---

# ADR-0063: Opening voids as wall cut-outs, the void-contour generator, and the graph-aware wall builder

## Status

Accepted, landed. This is slice 3 of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), the third geometry
slice on top of the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]) and the
floor slabs and ceilings ([[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]),
against the slice-0 harness and conventions
([[ADR-0045-three-dimensional-render-harness-and-conventions]]). It is foundation
slice 2 (opening voids). The slice specification
(`docs/specs/2026-06-12-three-dimensional-opening-voids.md`) and the track
foundation spec are authoritative for scope; this record captures the decisions
that turn an opening into a cut through its host wall.

## Context

The wall shell builds solid boxes and the slab slice encloses each room, but every
door and window the model carries is still invisible in three dimensions:
`buildScene` derives the openings into the scene graph and never renders them. This
slice cuts the void, the hole an opening removes from the wall, which is the first
opening geometry and the load-bearing one. The foundation flagged it as load-
bearing because the roadmap requires non-rectangular and curved openings, so the
seam that selects an opening's shape has to be right before any shape is built
(foundation sections 3.1 to 3.3).

The foundation left the exact shapes of three things to the slice that first needs
them. It said an opening's element type should resolve to a void-contour and a
fill-geometry generator pair, evolving the opaque `Scene3DReference { builder:
string }`, without fixing how. It described a graph-aware `WallBuildInput` seam
that the wall shell deliberately did not build, leaving it for the opening slice as
its first real consumer, and it invited that consumer to revise the seam's shape.
And it pinned the opening local frame and the curve-capable `Contour` type without
authoring any contour. All three land here.

## Decision

### `Scene3DReference` resolves the void shape, and the void generator lands without the fill

The element-type registry gains a `voidContour` key on `Scene3DReference`, set to
`rectangular` on every opening element type. The existing `builder` key
(`door-frame`, `window-frame`) names the eventual fill, which is the same frame
distinction that does not change the cut; a door and a window cut the identical
rectangle and differ only by the sill the opening already carries. Naming the void
shape separately from the fill is the evolution the foundation asked for
(section 3.1).

`voidContour` is a string-keyed kind, open to further variants the way
`ContourSegment` is. A pure resolver `openingVoidContour(node, elementTypes?)` in
`core/scene/` looks up the node's element type, dispatches on the kind, and returns
a `Contour`; `rectangularVoidContour(node)` is the one generator this slice ships.
The registry stays declarative (a serializable, versioned key) and the generator it
selects is code, so geometry comes from the element type rather than a rectangle
hardcoded in the mesher (ADR-0034). A half-round window is then a new kind, a new
generator, and a new resolver case, with no change to the wall builder that calls
`openingVoidContour`.

The fill generator (panels, sashes, frames, glass) is the other half of the
foundation's pair. It is **not** added now. The void side lands because the cut
needs it; the fill side is an additive member of `Scene3DReference` and a second
resolver when the fill slice needs it. This follows the precedent the wall shell
and the slab slice both set: do not hold an unused seam open
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]],
[[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]).

### The rectangular void is authored in the opening local frame as a hole

`rectangularVoidContour(node)` authors the void in the opening local frame the
foundation pins (section 3.2): origin at the finished-floor line below the opening
center, `+x` along the wall, `+y` up. The rectangle spans `x` in
`[-width/2, width/2]` and `y` in `[sillHeight, sillHeight + height]`, as four line
segments closing back to the start, wound opposite a wall face's outer loop so the
engine subtracts it. One opening yields exactly one void; the opening's
`orientation` describes a leaf swing and is irrelevant to a symmetric cut, so it is
ignored. Only line segments are emitted; an arc-bounded shape is a later generator.

### The opening node carries its host wall id, and resolves to a single graph edge

The wall graph splits a model wall into several edges at T-junctions and interior
crossings, each carrying the original wall id, so an opening positioned along the
whole wall cannot be attached to a wall id directly (foundation section 3.3).
`OpeningSceneNode` gains a `hostWallId`, set by the deriver from the opening's host
wall, which is the natural identity (the deriver already holds the host wall) and
the set of candidate edges. A pure `resolveOpeningEdge(opening, graph)` projects
the opening center onto each edge carrying that wall id and returns the edge whose
span contains the projection, with the center's distance along that edge; a
degenerate graph that contains the center on no edge resolves to nothing and cuts
no void.

An opening is assumed to lie within one edge. An opening that straddles a split
point is cut into the edge holding its center, the same kind of small, recorded
approximation as the slab slice's centerline holes. `hostWallId` is optional on the
type, like `WallSceneNode.height` and `RoomSceneNode.ceilingHeight`, so hand-built
literals omit it and the resolver treats absence as an opening it cannot place.

### The graph-aware wall builder delegates per edge

This slice introduces the foundation's graph-aware wall builder seam, because it is
the first consumer that needs the graph and the openings. The wall shell's per-wall
`buildWallMesh` is replaced by `buildWalls(input: WallBuildInput)` over a `graph`,
the `walls`, the `openingsByWall` map, and the `materials`, returning a group of
wall meshes. It iterates the graph edges and **delegates** per edge:

- An edge with no openings takes the wall shell's box path, generalized from a
  whole wall to an edge segment, so the common room with one door still draws its
  other walls exactly as the shell did.
- An edge with openings takes a profile path: the wall's `[0, length] x [0, height]`
  elevation outline has each void cut from it as a hole at the opening's distance
  along the edge, the two long faces are that outline triangulated through
  `THREE.ShapeUtils`, and the top, base, and end caps close the box. Every vertex
  goes through `planToWorld`, so the cut wall shares the axis map and winding
  authority of the box path.

Delegating keeps the working box geometry untouched for the overwhelming majority
of walls and confines the new profile-and-hole geometry to the edges that actually
host an opening, behind a single seam. The foundation invited a per-wall or a
per-edge input; the per-wall `openingsByWall` map is the shape the deriver
naturally produces, and resolving each opening to its edge is the builder's first
step, so the per-wall map is kept.

### The cut is lined with reveal faces, carried on the wall mesh

For each segment of the void boundary (the head, the two jambs, and a window's
sill), a quad spans the wall thickness between the void edge on the interior face
and the same edge on the exterior face, wound so its normal points inward toward
the void. The reveals take the `reveal` surface role the wall shell reserved for
this slice, so a reveal paints separately from a wall face. They belong to the wall
mesh and carry the wall's entity id; the opening has no mesh and no entity id in the
rendered scene until the fill slice gives it a body, so opening selection is
additive later rather than wired now.

### Identity reconciliation, and the visual tier extends to the cut

Wall scene-node ids are `wall:` prefixed, while `hostWallId` and the model wall ids
are not. `buildScene` reconciles them at one point: it builds the wall graph from
the floor's wall nodes using each node's model id (the prefix stripped), keys
`openingsByWall` by `hostWallId`, and re-applies the prefix when it sets a mesh's
entity id, so selection still sees the namespaced wall node id. The graph is built
in the engine builder from core's `buildWallGraph`; the scene-graph intermediate
representation gains no graph field. `buildScene`'s signature and the per-room
shell loop are unchanged.

The tier-one Node geometry and scene-tree tests stay the gating proof of
correctness, as in the earlier slices. The `scene-webgl` harness fixture gains one
opening, a door on the south wall of its four-wall room, so the harness renders a
wall with a real cut-out, and the committed `scene-shell-webgl` baseline is
refreshed once. The assertion stays pixel-approximate, because a graphics-processor
render is not pixel-stable across drivers and antialiasing. No new dependency is
added.

## Consequences

- A wall that hosts a door or window reads as a real opening with depth: the void
  is cut through the full thickness and lined with reveals, so the shell stops
  hiding its openings.
- The element type selects the void shape through one resolver, so a non-
  rectangular or curved opening is a new `voidContour` kind and generator, not a
  change to the wall builder. The fill generator is an additive member of the same
  reference when its slice arrives.
- The graph-aware wall builder seam exists from its first real consumer rather than
  being guessed at by the wall shell, and it delegates so openingless walls keep
  the proven box geometry and only opening-hosting edges take the new profile path.
- Openings resolve to a specific graph edge through `hostWallId` plus an along-edge
  projection, so a wall split by a T-junction places each opening on the right
  segment.
- The reveals carry the wall entity id this slice; opening selection waits for the
  fill mesh, an additive change.
- The rectangular, straight-wall, single-edge, deferred-junction assumptions are
  conscious, not silent: each is recorded in the spec's generalizations section as
  the shape of its additive change.
- The visual tier gains a cut-out without new brittleness, and the gating proof
  stays the deterministic Node tests.

## Alternatives considered

- **Evolve `Scene3DReference` to the full void-and-fill pair now, fill stubbed.**
  Rejected for this slice: it holds an unused fill seam open against the precedent
  the wall shell and slab slices set, and the cut needs only the void side. The
  fill generator is additive on the same reference when its slice needs it.
- **Unify every straight wall onto the profile-minus-holes path.** Rejected: it
  rewrites the wall shell's box builder and its geometry tests and re-renders the
  baseline for the majority of walls that have no opening, for no behavior change.
  Delegating per edge keeps the box path proven and confines the new geometry to
  opening-hosting edges behind the same seam.
- **Branch in `buildScene` between an untouched box builder and a separate
  with-openings builder.** Rejected: it leaves two parallel straight-wall code
  paths not unified behind one seam, where a single graph-aware builder that
  delegates internally presents one seam to `buildScene`.
- **Resolve an opening to its edge by geometry alone, without a `hostWallId`.**
  Rejected: matching the opening center to an edge is ambiguous near a shared
  junction vertex and re-derives an identity the deriver already holds. A
  `hostWallId` filters to the host wall's edges first, then the along-edge
  projection picks the one, at the cost of one additive field.
- **Give the reveals or the void their own opening-id mesh now.** Rejected for this
  slice: the cut is part of the wall geometry, and a separate opening mesh is the
  natural home for the fill that the next slice builds. Splitting the reveals out
  early would duplicate the cut edges across two meshes for no selection benefit
  until the fill exists.

## References

- Slice specification `docs/specs/2026-06-12-three-dimensional-opening-voids.md`.
- Implementation plan `docs/plans/2026-06-12-three-dimensional-opening-voids.md`.
- [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]: the per-room shells, the
  manual geometry through `planToWorld`, and the approximation-recording discipline
  this slice follows.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall
  shell, the per-wall box builder this slice generalizes and delegates to, the
  reserved `reveal` role, and the pixel-approximate visual tier.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the axis map,
  winding rule, vertical datum, the curve-capable contour, and the visual baseline.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track delivery
  model; this is the three-dimensional preview track's third geometry slice.
- [[ADR-0034-future-direction-extensibility-seams]]: openings read their shape from
  the element type, and the geometry-modifier seams this slice keeps additive.
- [[ADR-0026-room-derivation-planar-face-enumeration]]: the wall graph this slice
  resolves openings against.
- [[ADR-0018-scene-graph-derivation]]: the scene graph and the `userData.entityId`
  the wall meshes carry.
- [[ADR-0006-registry-pattern]]: the registry pattern behind the element-type
  registry whose `Scene3DReference` this slice evolves.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack and the millimeter scene
  tree.
