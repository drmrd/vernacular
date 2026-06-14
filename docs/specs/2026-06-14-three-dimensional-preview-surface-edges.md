# Three-Dimensional Preview Surface Edges

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview and floor-management polish)
**Scope:** A legibility change to the three-dimensional preview. Every structural
surface (walls, floor slabs, ceilings, and the wall profiles around openings) gets
a thin dark line along its edges, so a wall reads clearly against the floor behind
it, against an adjacent wall, and at its corners. The geometry, the lighting, the
paint, the camera, and the selection layer are unchanged. The slice builds on the
wall shell (ADR-0061), the floor and ceiling slabs (ADR-0062), and the mitered
junctions (ADR-0077), and follows the conventions of the track foundation. The
decisions specific to this slice live in ADR-0078.

This addresses owner feedback on 2026-06-14: in the preview a wall is hard to tell
apart from the floor behind it or from an adjacent wall, and the corners are hard
to read. Every surface shares one neutral material, so under soft lighting two
faces of the same tone blend together. Stronger lighting helps faces at different
angles but does not separate two same-tone surfaces that meet, which is exactly
where the preview is hardest to read.

---

## 1. Goal

After this slice, the preview draws the edges of its structural geometry as thin
dark lines: the outline of each wall, floor, and ceiling, and the creases where
their faces meet. The lines are occluded by the geometry in front of them (a
hidden-line look), so the viewer sees the edges of the surfaces facing them rather
than a full wireframe showing through. This is the standard way an architectural
viewer keeps geometry legible, and it works whatever the lighting and paint are,
because the lines do not depend on shading to read.

The change is additive and render-only. It introduces one pass that walks the
built scene and adds a line overlay along each mesh's edges. There is no change to
the model, the persisted file format, the scene graph's data, the geometry, or the
two-dimensional renderer.

## 2. What this slice inherits

- The scene build (`buildScene`): the engine turns the scene graph into a Three.js
  group tree of meshes, one per wall edge, room slab, ceiling, and opening profile,
  each carrying its `userData.entityId`. This slice adds the edge overlay at the end
  of that build, so every consumer (the live preview and the render harness) gets it.
- The selection outline (ADR-0066): a separate overlay traces the edges of the
  selected meshes in a high-contrast color, rebuilt on selection change. It already
  builds an edge line from a mesh's geometry. This slice shares that line-building
  step and leaves the selection overlay's behavior unchanged.
- The pick and proxy layers: hit-testing and the accessibility proxies collect
  meshes by `userData.entityId`. The edge lines carry no entity id and are lines,
  not meshes, so they are invisible to both. Line hit-testing stays off.

## 3. Design

### 3.1 An edge line per mesh

For each mesh in the built scene the slice adds a `THREE.LineSegments` child whose
geometry is `THREE.EdgesGeometry` of the mesh's own geometry. `EdgesGeometry` keeps
only the edges where two faces meet above a small angle, so a flat face's internal
triangulation is dropped and the visible result is the surface's outline and its
sharp creases. The line is a child of the mesh, so it inherits the mesh's place in
the scene and needs no separate transform, and it is rebuilt whenever the scene is
rebuilt.

The lines share one material: a thin line in a dark neutral that reads against the
light surfaces, with depth testing on so the geometry in front hides the lines
behind it. The dark hidden-line look is the legible one: a wall's own edges show,
the edges on its far side do not bleed through, and a corner where two walls meet
draws as a crisp line instead of two same-tone faces fading into each other.

### 3.2 The pass runs at the end of the scene build

A pure engine pass walks the built group tree, collects its meshes, and gives each
one an edge-line child. It runs at the end of `buildScene`, after the walls, slabs,
and ceilings are in place, so it covers every structural mesh without each builder
knowing about edges. Collecting the meshes first and then adding the children keeps
the traversal and the mutation separate.

The edge line for a single mesh, `edgeLines(geometry, material)`, is the one step
the selection outline already does inline. The slice lifts it into a shared helper
so the always-on overlay and the selection overlay build their lines the same way;
the selection overlay keeps its own color, its over-the-top depth behavior, and its
reconcile-on-selection lifecycle.

## 4. Verification

- The pure pass and the shared helper are Node-tested: a mesh gains exactly one
  `LineSegments` child; the child's geometry is an edge geometry derived from the
  mesh (its line vertices trace the mesh's box, not its face diagonals); a group of
  several meshes gets one edge child each; a non-mesh node is left alone. This runs
  without a graphics processor, as `EdgesGeometry` is geometry processing, not
  rendering.
- The scene build is Node-tested to add the overlay: after `buildScene`, every
  structural mesh carries an edge-line child, and the meshes still carry their
  entity ids (so selection, picking, and the proxies are unaffected).
- The pixel-approximate scene-webgl baselines are refreshed to show the edged
  surfaces, confirming the lines draw and read against the shell.

## 5. Out of scope and deferred

- A user toggle for the edges. They are on by default this slice; a preference to
  turn them off is a later addition that reads the same overlay.
- Edge thickness, anti-aliasing, and a configurable color or theme token. The line
  uses the renderer's default one-pixel width and a fixed dark color; richer line
  styling is a later refinement.
- Ambient occlusion or a silhouette post-processing pass. Those are heavier
  render-pass techniques; the edge overlay gives most of the legibility for far less
  cost and no new dependency, and the post-processing options stay available later.
- Any lighting or material change. The surfaces keep their neutral material and the
  lighting is untouched; the edges carry the legibility on their own.

## 6. References

- ADR-0078: the decisions specific to this slice.
- ADR-0061: the wall shell and the material seam the surfaces use.
- ADR-0062: the floor slabs and ceilings the overlay also edges.
- ADR-0066: the selection outline whose edge-line step this slice shares.
- ADR-0077: the mitered junctions whose clean corners the edges make legible.
