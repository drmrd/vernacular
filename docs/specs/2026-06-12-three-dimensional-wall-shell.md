# Three-Dimensional Wall Shell

**Date:** 2026-06-12
**Status:** Accepted (slice 1 of the three-dimensional preview track)
**Scope:** The first geometry slice of the three-dimensional preview track. It
turns `buildScene`'s empty per-floor groups into a shell of extruded walls. It
builds against the conventions and seams pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`) and ADR-0045,
and the decisions specific to this slice live in ADR-0061. No openings, no floor
or ceiling slabs, and no camera controls land here; those are later slices.

---

## 1. Goal

After this slice, a single floor with walls renders as a lit three-dimensional
shell. Each wall is a box extruded from its centerline, its thickness, and its
height, parented under its floor group, carrying its scene-graph entity id, and
split into per-surface material groups so the later paint slice can address each
face without remeshing. The two-dimensional plan is unchanged; the two views keep
observing the same scene graph.

## 2. What this slice inherits

These are fixed by the foundation and not re-decided here:

- The plan-to-world axis map (`planToWorld`): plan `(x, y)` at height `v` maps to
  world `(x, v, y)`, an orientation-flipping map.
- The winding convention (`canonicalOuterLoop`, `loopWorldNormal`): outer loops
  are oriented so their world normal points up after the flip; holes wind
  opposite. The wall builder asserts its faces against this rule.
- The vertical datum (`wallVerticalSpan`): a wall's base sits at the floor group's
  local `Y = 0`, its top at `Y = height`.
- World units are millimeters, with no scale factor.
- The camera-framing helper (`frameSceneCamera`) with its empty-scene fallback.

## 3. Design

### 3.1 Wall height on the scene node, read through an accessor

`WallSceneNode` gains an additive `height: number`. The deriver sets it from the
host floor's `defaultCeilingHeight`, because the wall model carries no per-wall
height today. A pure `wallHeight(node)` accessor in `core/scene/` is the single
place the height is read. The wall builder calls the accessor, never the field
directly, so when a per-wall override or a sloped-top height profile lands
(ADR-0034, foundation section 2.4) it is an additive change confined to the
accessor and the node, not a hunt through every consumer.

### 3.2 The material seam

Surfaces render through a material provider keyed by a surface role:

```ts
type SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'

interface MaterialProvider {
  material(role: SurfaceRole): Material
}
```

A `NeutralMaterialProvider` returns one shared neutral material per role and is
the default. This slice paints every role with it, but the per-surface groups
exist from the first mesh, so the color-temperature-aware paint material is a swap
at this seam later, not a remesh. The `reveal` role belongs to the cut surface of
an opening and first carries geometry in the opening slice; this slice emits the
other four roles.

### 3.3 The straight-planar box builder

A per-wall builder, `buildWallMesh(node, materials)`, extrudes each wall as a box
from its centerline, thickness, and height. `buildScene` maps it over each floor's
walls. The graph-aware `WallBuildInput` seam (the wall graph plus openings keyed by
wall) described in the foundation lands with the opening slice, its first real
consumer; this slice does not thread an unread graph just to hold the seam open.

Each wall box:

- carries `userData.entityId` set to the wall node's id, so raycaster selection is
  purely additive later;
- assigns its faces to material groups by role: the two faces along the wall
  length are `interiorFace` and `exteriorFace`, the upward face is `top`, and the
  downward face is `base`. The two end caps take `exteriorFace`, since for a single
  wall there is no room context that distinguishes them and this slice renders
  every role identically;
- is wound so the upward face normal points world `+Y` and the two long faces
  carry opposite horizontal normals, checked against the foundation winding rule.

Walls meet at junctions by overlapping into a solid mass. Clean mitered or butted
junctions, the foundation's deferred open question, are an additive follow-on that
reads the wall graph; they do not change the seam this slice establishes. The
rationale is recorded in ADR-0061.

### 3.4 Scene assembly

`buildScene` groups `graph.walls` by `floorId`, builds each wall through the
builder, and adds the resulting meshes under the matching floor group. It gains an
optional material-provider argument that defaults to the neutral provider, so the
paint slice supplies its own provider without changing callers. The floor groups,
their elevation, and their entity ids stay as they are.

## 4. Testing strategy

Two tiers, refining the foundation's section 6. The refinement is that the visual
tier is pixel-approximate rather than pixel-exact, so it adds rigor without the
brittleness a full-frame exact diff carries on a GPU render. ADR-0061 records the
reasoning.

### 4.1 Tier one: deterministic geometry and scene-tree tests (gating)

The red-green-blue cycles live here. Node tests with no graphics context assert,
through the existing `engine/testing` helpers, the box dimensions, the face
normals and winding, the per-surface material groups, the `userData.entityId`, the
parenting of each wall under its floor group, and the height default and accessor.
This tier is deterministic and is part of the gating check chain.

### 4.2 Tier two: pixel-approximate visual render (self-skipping)

The `scene-webgl` harness renders a small fixed walls fixture with a camera framed
by `frameSceneCamera` and the fixed basic lighting. The assertion reads the canvas
pixels and checks that the wall silhouette region is non-background and roughly
wall-colored, rather than diffing every pixel against a committed frame. A
committed perceptual-tolerance baseline image, with a generous threshold and a
maximum-different-pixel ratio, is an optional best-effort secondary. The harness
self-skips where a WebGL 2 context cannot be created, as the foundation already
does. This tier runs in the separate `scene-webgl` Playwright project, not the
gating chromium tree.

No new dependency is added. Playwright's built-in perceptual comparison and canvas
pixel readback cover the visual tier. A dedicated image-diff library is redundant
against the bundled comparison and would wait out the thirty-day dependency
cooldown. A deterministic software-rasterizer path for hard-gating
graphics-processor-less continuous integration is the foundation's tracked
follow-on (foundation section 9); it is the recorded escalation if the project
ever needs to gate the visual tier in continuous integration.

## 5. Out of scope

- Mitered or butted junctions (an additive follow-on that reads the wall graph).
- Openings cut into walls (the opening slices).
- Floor and ceiling slabs (the slab slice).
- Camera orbit, pan, zoom, and walk controls (the navigation slice).
- The color-temperature slider and the paint material (the lighting and paint
  slices); this slice ships only the neutral provider behind the material seam.
- Per-wall height overrides and sloped-top height profiles (additive at the
  accessor).

## 6. References

- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2 (conventions), 3 (the geometry seam, the material seam, per-surface
  identity), 5 (the non-geometry seams), 6 (the testing strategy), and 7 (the
  slice map; this is slice 1).
- ADR-0045 (the render harness, coordinate conventions, and the visual baseline).
- ADR-0061 (this slice's box-per-wall junction decision and the pixel-approximate
  visual tier).
- ADR-0018 (scene-graph derivation), ADR-0034 (the height-profile and
  read-shape-from-the-type seams), ADR-0044 (the track delivery model).
  </content>
  </invoke>
