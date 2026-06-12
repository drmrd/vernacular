# Three-Dimensional Opening Voids

**Date:** 2026-06-12
**Status:** Accepted (slice 3 of the three-dimensional preview track)
**Scope:** The third geometry slice of the three-dimensional preview track. It
cuts each opening as a void through its host wall, so a door reads as a doorway
and a window reads as a hole in the wall rather than the opening being invisible.
It builds against the conventions and seams pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`), ADR-0045, the
wall shell of ADR-0061, and the floor slabs and ceilings of ADR-0062. The
decisions specific to this slice live in ADR-0063. No opening fill (sashes,
frames, glass, leaves), no camera controls, and no painting land here; those are
later slices.

This is foundation slice 2 (opening voids) in the foundation spec's slice map,
taken now as the user-facing third slice because a wall you can see through where
a door or window sits is what turns the solid shell into a building you can read.

---

## 1. Goal

After this slice, a wall that hosts a door or a window renders with a rectangular
void cut through it: the full wall thickness is removed across the opening width,
from the sill height up to the sill height plus the opening height. The cut is
lined with reveal faces (the head, the two jambs, and the sill for a window) so
the wall reads as a real opening with depth rather than a hole in two parallel
planes. Doors and windows differ only in their sill height, which the opening
already carries; both cut a rectangular void.

The void is the only opening geometry this slice builds. There is no leaf, sash,
frame, or glass yet, and there is no opening mesh carrying the opening's entity
id; those arrive with the opening fill slice. The reveal faces belong to the wall
mesh and carry the wall's entity id, so selecting an opening waits for the slice
that gives it a body. The two-dimensional plan is unchanged; the two views keep
observing the same scene graph.

The slice ships only the rectangular, straight-wall case. The void contour is
authored with line segments alone; a half-round or round-topped window is an arc
contour and a later shape. Wall corners still overlap as boxes rather than
mitering, as the wall shell already does.

## 2. What this slice inherits

These are fixed by the foundation and the earlier geometry slices, and are not
re-decided here:

- The plan-to-world axis map (`planToWorld`): plan `(x, y)` at height `v` maps to
  world `(x, v, y)`, an orientation-flipping map. Every vertex this slice places
  goes through it, so the cut wall faces and the reveals share one axis authority
  with the rest of the shell.
- The winding convention (`canonicalOuterLoop`, `canonicalHoleLoop`,
  `loopWorldNormal`): a face's outer loop is oriented one way and a hole winds
  opposite, matching `THREE.Shape` hole expectations. A void is a hole in the wall
  face, so it winds opposite the face's outer loop, and the cut faces assert their
  normals against this rule.
- The curve-capable `Contour` type (foundation section 3.2): an ordered, closed
  list of line or arc segments in a local two-dimensional frame, never
  pre-tessellated. This slice emits only line segments; the engine owns
  tessellation.
- The material seam (`MaterialProvider`, `SurfaceRole`) with the neutral default
  provider. The `reveal` role, reserved by the wall shell for exactly this slice,
  is drawn now. Every role still paints with the neutral material.
- The vertical datum: a wall's base sits at the floor group's local `Y = 0` and
  its top at `Y = height`. The void spans `Y` from `sillHeight` to
  `sillHeight + height` within that wall.
- The wall graph (`buildWallGraph`): merged junction vertices and wall edges, with
  a wall split into several edges at T-junctions and interior crossings, each edge
  carrying the original wall id. This is the adjacency the opening resolves
  against.
- World units are millimeters, with no scale factor.

## 3. Design

### 3.1 The void contour generator, and the evolved `Scene3DReference`

An opening's geometry comes from its element type, never from a rectangle
hardcoded in the mesher (foundation section 3.1, ADR-0034). The element-type
registry already carries a `scene3D` field, an opaque `Scene3DReference { builder:
string }` whose builder key (`door-frame`, `window-frame`) names the eventual
fill, not the cut. The cut is the same rectangle for a door and a window, so the
reference evolves to name the void shape directly: `Scene3DReference` gains a
`voidContour` key, set to `rectangular` on every opening element type.

`voidContour` is a string-keyed kind, open to further variants the way
`ContourSegment` is. A half-round window becomes `voidContour: 'half-round'` plus
a new generator and a new kind; no consumer changes. The registry stays
declarative (a key, not a function, so it still serializes and versions), and the
generator that the key selects is code.

A pure resolver in `core/scene/` turns an opening node into its void contour:
`openingVoidContour(node, elementTypes?)` looks up the node's element type,
dispatches on its `voidContour` kind, and returns a `Contour`. For the one kind
this slice ships, it returns `rectangularVoidContour(node)`. The dispatch is the
seam: the wall builder calls `openingVoidContour` and never learns which shape it
got back, so a new shape is a new case in one resolver rather than a change in the
builder.

The fill generator (panels, sashes, frames, glass) is the other half of the pair
the foundation describes (section 3.1). It is not added in this slice, following
the precedent of not holding an unused seam open (ADR-0061, ADR-0062): the void
side lands now because the cut needs it, and the fill side is an additive member
of the reference and a second resolver when the fill slice needs it.

### 3.2 The opening local frame and the rectangular void

`rectangularVoidContour(node)` authors the void in the opening local frame the
foundation pins (section 3.2): a two-dimensional frame with its origin at the
finished-floor line directly below the opening center on the host wall surface,
`+x` running along the wall (the node's `along`) and `+y` running up. The
rectangle spans `x` in `[-width/2, width/2]` and `y` in `[sillHeight, sillHeight +
height]`, as four line segments closing back to the start. It is wound as a hole,
opposite a wall face's outer loop, so the engine's polygon builder subtracts it.

A single opening yields exactly one void contour (foundation section 3.2). The
opening's `orientation` (hinge and facing) describes which way a leaf swings and
is irrelevant to a symmetric cut, so this slice ignores it.

### 3.3 The host wall id on the opening node, and opening-to-edge resolution

A wall in the graph is split into several edges at every T-junction and interior
crossing, and each edge carries the original wall id (foundation section 3.3). An
opening is positioned along its host wall as a whole, so the builder cannot attach
it to a wall id directly; it has to find the specific edge that contains the
opening's position and place the void there.

To make that resolution possible, `OpeningSceneNode` gains a `hostWallId`, set by
the deriver from the opening's host wall. The field is the natural identity (the
deriver already holds the host wall) and it is what selects the candidate edges. A
pure helper `resolveOpeningEdge(opening, graph)` then, among the edges carrying
that wall id, projects the opening center onto each and returns the edge whose
span contains the projection together with the center's distance along that edge.
When no edge contains the center (a degenerate graph), it returns nothing and the
opening cuts no void.

An opening is assumed to lie within a single edge. An opening that straddles a
split point (a door drawn across a T-junction) is cut into the edge that holds its
center, a small approximation in the spirit of the centerline-hole approximation
ADR-0062 records, refined when it matters.

`hostWallId` is optional on the type for the same reason `WallSceneNode.height`
and `RoomSceneNode.ceilingHeight` are: hand-built `OpeningSceneNode` literals omit
it, and the resolver treats its absence as an opening it cannot place.

### 3.4 The graph-aware wall builder

This slice introduces the foundation's graph-aware wall builder seam (section
3.3), because it is the first consumer that needs the graph and the openings. The
per-wall `buildWallMesh` of the wall shell is replaced by a builder over the wall
graph:

```ts
interface WallBuildInput {
  graph: PlanarGraph
  walls: WallSceneNode[]
  openingsByWall: Map<string, OpeningSceneNode[]>
  materials: MaterialProvider
}

function buildWalls(input: WallBuildInput): THREE.Group
```

`buildWalls` iterates the graph edges. For each edge it looks up the wall (for
thickness and height) and the openings that resolve to that edge, then takes one
of two paths:

- **An edge with no openings** takes the wall shell's box path, generalized from a
  whole wall to an edge segment. The geometry is the slice-1 extruded box: a
  rectangle from the edge's two endpoints, the wall thickness across the
  centerline, rising from `Y = 0` to the wall height, with the same per-face
  surface roles. The common four-wall room with one door still draws three of its
  walls exactly as before.

- **An edge with openings** takes a profile path. The wall's elevation outline (a
  `[0, length] x [0, height]` rectangle in the edge-local frame of distance along
  the edge by height) has each opening's void cut from it as a hole, positioned at
  the opening's distance along the edge. The two long faces are that outline
  triangulated through `THREE.ShapeUtils`, placed at plus and minus half the
  thickness across the centerline and wound to face outward. The top, base, and
  end caps close the box around the outline. Every vertex is placed through
  `planToWorld`, so the cut wall shares the axis map and the winding authority of
  the box path.

The builder keeps `openingsByWall` keyed by wall id, the shape the deriver
naturally produces, and resolves each opening to its edge as its first step
(foundation section 3.3 invited either a per-wall or a per-edge input; the per-wall
map reads cleanly with the resolution kept inside the builder).

### 3.5 Reveal faces

The cut is lined with reveal faces so the opening has depth. For each segment of
the void's boundary (the head across the top, the two jambs up the sides, and the
sill across the bottom when the opening is a window with a sill above the floor), a
quad connects the void edge on the interior face to the same edge on the exterior
face, spanning the wall thickness. The reveal faces are wound so their normals
point inward toward the void, the surface you see looking at the jamb from inside
the doorway. They take the `reveal` surface role, the role the wall shell reserved
for this slice, so the paint track addresses a reveal separately from a wall face.

The reveals belong to the wall mesh and carry the wall's entity id. The opening
has no mesh of its own and no entity id in the rendered scene until the fill slice
gives it a body, so selecting the opening is additive later rather than wired now.

### 3.6 Identity reconciliation and scene assembly

Wall scene-node ids are namespaced (`wall:` prefixed), while an opening's
`hostWallId` and the model wall ids are not. The builder reconciles the two at one
point: `buildScene` builds the wall graph from the floor's wall nodes using each
node's model id (the prefix stripped), keys `openingsByWall` by `hostWallId`, so an
edge's wall id matches an opening's host wall id, and re-applies the `wall:` prefix
when it sets a mesh's entity id, so selection still sees the namespaced wall node
id the shell already used.

`buildScene` gains the graph construction and the openings grouping, and replaces
its per-wall loop with a single call to `buildWalls` per floor that returns the
floor's walls as a group. The floor groups, their elevation and entity ids, and
the per-room shells of ADR-0062 are unchanged, and `buildScene`'s signature is
unchanged (it already takes an optional material provider that defaults to the
neutral provider). The wall graph is built in the engine builder from core's
`buildWallGraph`; the scene-graph intermediate representation gains no graph field.

## 4. Generalizations kept additive

None of the following is built in this slice; each is recorded as the shape the
additive change takes, so a future session does not mistake the rectangular,
straight-wall assumption for a closed design.

- **Non-rectangular and curved void shapes** (half-round, round-topped, segmental,
  triangular, gothic) are each a new `voidContour` kind plus a new generator that
  emits arc segments. The `Contour` type already carries arcs, and the resolver of
  section 3.1 already dispatches by kind, so the addition touches the registry and
  one resolver, not the wall builder.

- **Opening fill** (leaves, sashes, frames, mullions, muntins, glass, including
  curved glass) is the other generator of the foundation's pair (section 3.1). It
  is an additive member of `Scene3DReference` and a second resolver, and it
  produces the opening's own mesh carrying the opening entity id. Divided lights
  are fill inside the one void, not multiple wall cuts.

- **Mitered and butted junctions** stay deferred, as the wall shell left them. The
  builder consumes the graph for opening-to-edge resolution now; resolving a
  junction vertex from its incident edges to miter the corner plugs into the same
  builder behind the same seam, the wall shell's recorded follow-on.

- **An opening that straddles an edge split** is cut into the edge holding its
  center (section 3.3), refined to span both edges when the case matters.

- **Sloped or non-rectangular wall tops** would make the elevation outline a
  non-rectangular polygon rather than a `[0, length] x [0, height]` rectangle. The
  outline is already assembled as a contour the void is cut from, so a profiled top
  is a change to the outline, not to the cut or the reveals.

## 5. Testing strategy

Two tiers, the same shape the earlier slices use. The tier-one Node tests gate;
the tier-two visual render is self-skipping verification, not a gate.

### 5.1 Tier one: deterministic geometry and scene-tree tests (gating)

The red-green-blue cycles live here. Node tests with no graphics context assert,
through the existing `engine/testing` helpers and the pure core helpers:

- `rectangularVoidContour` returning the four-corner rectangle in the opening local
  frame at the right width, height, and sill, wound as a hole;
- `openingVoidContour` dispatching on the element type's `voidContour` kind, and
  every opening element type carrying `voidContour: 'rectangular'`;
- the deriver setting `hostWallId` on the opening node, and `resolveOpeningEdge`
  choosing the edge that contains the opening center, including the case where a
  T-junction has split the host wall into two edges and the opening belongs to one
  of them, with the correct distance along that edge;
- an edge with no openings building the wall-shell box geometry, at parity with the
  slice-1 wall, with its per-face material groups and entity id;
- an edge with an opening building a wall face with the void cut from it (the void
  region empty of triangles, the long-face normals still pointing the right way),
  a `reveal` material group present, and the reveals lining the cut;
- `buildScene` consuming the floor's openings and parenting the walls group under
  the matching floor group, with the wall meshes still carrying the namespaced
  wall entity id.

This tier is deterministic and is part of the gating check chain.

### 5.2 Tier two: pixel-approximate visual render (self-skipping)

The `scene-webgl` harness fixture gains one opening, a door on the south wall of
its four-wall room, so the harness renders a wall with a real cut-out. The
assertion stays pixel-approximate: a tolerant committed baseline (a generous
threshold and a maximum different-pixel ratio) rather than an exact frame, since
the deterministic geometry is already proven by tier one. The committed baseline
(`scene-shell-webgl`) is refreshed once because the fixture now cuts a door. The
harness self-skips where no WebGL 2 context can be created, as the foundation
already does, and runs in the separate `scene-webgl` Playwright project, outside
the gating chromium tree.

No new dependency is added. Playwright's built-in perceptual comparison and canvas
readback cover the visual tier, as they do for the earlier slices.

## 6. Out of scope

- Opening fill: leaves, sashes, frames, mullions, muntins, and glass (the opening
  fill slice; this slice cuts the void only).
- Non-rectangular and curved void shapes (additive `voidContour` kinds and arc
  generators, section 4).
- An opening mesh carrying the opening entity id, and opening selection (additive
  with the fill that gives the opening a body, section 3.5).
- Mitered or butted wall junctions (the wall shell's deferred follow-on, section
  4).
- Camera controls, the color-temperature slider, the paint material, and
  selection sync (later slices).

## 7. References

- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2 (conventions and the vertical datum), 3.1 (openings carry their
  geometry, the evolved `Scene3DReference`, the void and fill generator pair), 3.2
  (the curve-capable contour and the opening local frame), 3.3 (the graph-aware,
  builder-selected wall meshing this slice realizes), 5.2 (the material seam and
  the `reveal` role), 6 (the testing strategy), and 7 (the slice map; this is
  foundation slice 2, opening voids).
- ADR-0045 (the render harness, the coordinate, datum, and winding conventions,
  and the visual baseline).
- ADR-0061 (the wall shell, the per-wall box builder this slice generalizes, the
  per-surface material groups, the reserved `reveal` role, and the pixel-
  approximate visual tier).
- ADR-0062 (the per-room shells the floor groups also carry, and the
  approximation-recording discipline this slice follows).
- ADR-0063 (this slice's void contour generator, the opening-to-edge resolution,
  the graph-aware delegating wall builder, and the reveal faces).
- ADR-0018 (scene-graph derivation), ADR-0026 (the wall graph and room derivation
  this slice resolves openings against), ADR-0034 (the read-shape-from-the-element-
  type and geometry-modifier seams this slice keeps additive), ADR-0044 (the track
  delivery model).
