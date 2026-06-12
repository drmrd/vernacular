# Three-Dimensional Floor Slabs and Ceilings

**Date:** 2026-06-12
**Status:** Accepted (slice 2 of the three-dimensional preview track)
**Scope:** The second geometry slice of the three-dimensional preview track. It
gives each derived room a thickness-aware floor slab and a ceiling, so a single
floor reads as an enclosed space rather than a ring of free-standing walls. It
builds against the conventions and seams pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`), ADR-0045, and
the wall shell of ADR-0061, and the decisions specific to this slice live in
ADR-0062. No openings, no camera controls, and no painting land here; those are
later slices.

This is foundation slice 4 (ceilings and per-room floors) in the foundation
spec's slice map, taken now as the user-facing second slice because a lit room
floor and ceiling are what turn the wall shell into a space you can read.

---

## 1. Goal

After this slice, a floor with closed rooms renders each room with a solid floor
slab whose top sits flush with the finished floor and whose thickness hangs below
it, and a ceiling at the room's ceiling height. Each room's geometry is parented
under a room group that carries the room's scene-graph entity id, so raycaster
selection is purely additive later. Surfaces are split into the same per-surface
material groups the wall shell uses, so the later paint slice addresses each face
without remeshing. The two-dimensional plan is unchanged; the two views keep
observing the same scene graph.

The slice ships only the planar, horizontal case: every floor and ceiling is one
flat surface parallel to the ground. Section 4 records the cases this slice does
not build (sloped, curved, seamed, layered, and non-parallel surfaces) and the
seams that keep each of them an additive change rather than a rewrite.

## 2. What this slice inherits

These are fixed by the foundation and the wall shell, and are not re-decided here:

- The plan-to-world axis map (`planToWorld`): plan `(x, y)` at height `v` maps to
  world `(x, v, y)`, an orientation-flipping map. Every vertex this slice places
  goes through it, so the slab and ceiling share one axis authority with the
  walls.
- The winding convention (`canonicalOuterLoop`, `canonicalHoleLoop`,
  `loopWorldNormal`): outer loops are oriented so their world normal points up
  after the flip; holes wind opposite, matching `THREE.Shape` hole expectations.
  The slab and ceiling assert their face normals against this rule.
- The vertical datum (`floorSlabVerticalSpan`): a slab's top is flush with the
  finished floor at the floor group's local `Y = 0`, and its thickness extends to
  negative `Y`. Walls already sit on this same datum.
- The material seam (`MaterialProvider`, `SurfaceRole`) with the neutral default
  provider. This slice paints every role with the neutral material but keeps the
  per-surface groups, exactly as the wall shell does.
- World units are millimeters, with no scale factor.
- The camera-framing helper (`frameSceneCamera`) with its empty-scene fallback,
  and the live-view framing the preview pane already applies on every edit.

## 3. Design

### 3.1 Ceiling height on the room node, read through an accessor

`RoomSceneNode` gains an additive `ceilingHeight: number`. The deriver
(`deriveRoomNodesForFloor`) sets it from the host floor's `defaultCeilingHeight`,
because that is the floor's one ceiling height today. A pure `ceilingHeight(node)`
accessor in `core/scene/` is the single place the value is read, mirroring the
slice-1 `wallHeight(node)` accessor. The room builder calls the accessor, never
the field directly.

This keeps the eventual richer cases additive at one point. A ceiling is a scalar
height now; a tray, coved, or sloped ceiling is a height _profile_ over the room
boundary (the ADR-0034 analog of the wall height profile), which becomes an
additive change at the accessor and the node, not a hunt through the builder. The
field is optional on the type for the same reason `WallSceneNode.height` is:
hand-built `RoomSceneNode` literals (chiefly test fixtures) omit it, and the
accessor supplies the `DEFAULT_CEILING_HEIGHT_MM` fallback for those.

The model already carries a per-room ceiling-height override
(`RoomOverride.ceilingHeight`, set by `SET_ROOM_CEILING_HEIGHT`). This slice does
not wire that override into the derived node; it sources the node's height from
the floor default only, to keep the slice's change confined to the scene layer.
Preferring the per-room override when present is an additive change at the deriver
(it already receives the overrides map), recorded here so the wiring is a
conscious follow-on rather than an oversight.

### 3.2 Floor slab thickness as a single read point

There is no slab-thickness field on any model entity yet, so the slab thickness is
a single placeholder read point: `DEFAULT_FLOOR_SLAB_THICKNESS_MM` (250 mm) and a
`floorSlabThickness()` accessor in `core/scene/`. The builder reads the accessor,
never the constant directly.

The placeholder is deliberate. A real floor is a layered assembly (a finish floor
distinct from its substrate and its structure), and the thickness varies between
floors and sometimes within one floor. Section 4 records that the thickness
becomes that assembly later, shared with the wall construction profiles of
ADR-0034; routing every read through one accessor keeps that move additive.

### 3.3 The per-room shell builder

A per-room builder, `buildRoomShell(node, materials)`, returns a `THREE.Group`
named with the room's id and carrying `userData.entityId` set to the room id, so
the group reads like the floor group and a raycaster walks up to the room. The
group holds two meshes:

- **The floor slab.** A solid prism whose top face is the room's clear-area
  polygon at `Y = 0`, whose bottom face is the same polygon at `Y = -thickness`,
  and whose sides connect the two. The boundary is `canonicalOuterLoop` of the
  room's `clearPolygon` (the thickness-aware clear area, so the slab meets the
  inner faces of the walls), with each interior void wound by `canonicalHoleLoop`
  and cut from the slab. The caps are triangulated through `THREE.Shape` /
  `THREE.ShapeUtils`, and every vertex is placed through `planToWorld`, so the
  slab uses the same axis map and the same winding authority as the walls rather
  than a private rotation. The upward face takes the `top` role, the downward face
  the `base` role, and the vertical sides the `exteriorFace` role.

- **The ceiling.** A single downward-facing plane over the same boundary at
  `ceilingHeight(node)`, wound so its normal points down (`-Y`) into the room. It
  is single-sided: from a top-down camera it back-face-culls and the interior
  floor stays visible, while from inside the room it reads as the ceiling
  overhead. It takes the `base` role (a downward face), consistent with the slab's
  downward face. A solid ceiling slab with its own thickness is a later
  refinement; a single plane is the minimal correct ceiling for the first enclosed
  room.

Holes are cut as the room's centerline void rings, not inset by a wall half-
thickness the way the outer boundary is. This is a small, deliberate approximation
that reads correctly in a preview; section 4 notes it.

### 3.4 Scene assembly

`buildScene` gains a per-room loop that mirrors its existing per-wall loop: for
each floor group, it builds a room shell for every room whose `floorId` matches
the floor's model id and adds it under that floor group. The floor groups, their
elevation, their entity ids, and the wall meshes are unchanged, and `buildScene`'s
signature is unchanged (it already takes an optional material provider that
defaults to the neutral provider).

## 4. Generalizations kept additive

The product owner asked that this slice account for the harder cases without
building them, so they remain additive seams rather than a future rewrite. None of
the following is built in this slice; each is recorded as the shape the additive
change takes.

- **Floors and ceilings are not assumed planar, horizontal, parallel to each
  other, or parallel to the ground.** Curved floor sections, seamed surfaces,
  sloped ceilings, and ramped floors are real cases. They land behind a future
  per-surface mesh-builder seam (the floor-and-ceiling analog of the foundation's
  `WallMeshBuilder`, foundation section 3.3), selected by surface kind, the same
  way curved walls plug in behind the wall builder seam. That seam is not threaded
  now, following the slice-1 precedent of not holding open an unused seam; the
  planar builder is the only one this slice needs. The boundary it consumes is
  already the curve-capable `Contour` type (foundation section 3.2), and the
  height it reads is already funneled through an accessor (section 3.1) that can
  return a profile, so the two inputs a non-planar surface needs are present.

- **Slab thickness becomes a layered assembly.** A floor's thickness is a finish
  floor over a substrate over structure, optionally documenting joists or studs
  (never required to). The assembly varies per floor and sometimes within a single
  floor, and it is shared with the wall construction profiles of ADR-0034 (a Phase
  4 concern). The single `floorSlabThickness()` read point (section 3.2) is where
  that assembly replaces the scalar.

- **The set of floors and ceilings need not be parallel.** Split levels, a floor
  that steps, and a roofline that is not parallel to the slab below it are
  multi-floor-track concerns. This slice's per-floor, per-room derivation does not
  assume any two surfaces are parallel; it places each surface from its own
  boundary and height, so a later non-parallel surface is additive against the
  same datum.

- **Holes are cut at the centerline ring.** An interior void is cut as the
  contained room's centerline polygon, not inset by a wall half-thickness. This is
  an approximation that reads correctly in a preview and is cheap to refine when
  the inset matters.

- **A per-room ceiling-height override exists in the model already.** Wiring it
  into the derived node is the additive follow-on described in section 3.1.

## 5. Testing strategy

Two tiers, the same shape the wall shell uses. The tier-one Node tests gate; the
tier-two visual render is self-skipping verification, not a gate.

### 5.1 Tier one: deterministic geometry and scene-tree tests (gating)

The red-green-blue cycles live here. Node tests with no graphics context assert,
through the existing `engine/testing` helpers and the pure core helpers:

- the ceiling height default and accessor, and the slab-thickness read point;
- the slab's vertical span (top at `Y = 0`, bottom at `Y = -thickness`) and that
  its footprint matches the room's clear polygon;
- the slab's per-surface material groups (`top`, `base`, `exteriorFace`) covering
  every triangle, and the ceiling's `base` role;
- the slab top normal pointing world `+Y`, the slab bottom and the ceiling normals
  pointing `-Y`, and the slab sides carrying horizontal normals, all consistent
  with the foundation winding rule;
- a hole in the slab footprint when the room carries an interior void;
- the room group carrying `userData.entityId`, and `buildScene` parenting each
  room shell under the matching floor group.

This tier is deterministic and is part of the gating check chain.

### 5.2 Tier two: pixel-approximate visual render (self-skipping)

The `scene-webgl` harness fixture gains one room (the clear area of its existing
four-wall rectangle), so the harness renders a floor slab and a ceiling alongside
the walls. The assertion stays pixel-approximate: a tolerant committed baseline
(a generous threshold and a maximum different-pixel ratio) rather than an exact
frame, since the deterministic geometry is already proven by tier one. The
single-sided ceiling back-face-culls from the harness's top-down framing, so the
interior floor stays visible in the baseline. The harness self-skips where no
WebGL 2 context can be created, as the foundation already does, and runs in the
separate `scene-webgl` Playwright project, outside the gating chromium tree. The
committed baseline (`scene-shell-webgl`) is refreshed once because the fixture now
draws a room.

No new dependency is added. Playwright's built-in perceptual comparison and canvas
readback cover the visual tier, as they do for the wall shell.

## 6. Out of scope

- Sloped, curved, seamed, or otherwise non-planar floors and ceilings (additive
  behind a future per-surface mesh-builder seam, section 4).
- Layered floor assemblies and documented joists or studs (additive at the
  `floorSlabThickness()` read point, section 4).
- Non-parallel surfaces across a multi-floor house (the multi-floor track).
- Wiring the per-room `ceilingHeight` override into the derived node (additive at
  the deriver, section 3.1).
- A solid ceiling slab with its own thickness (a later refinement; this slice
  ships a single ceiling plane).
- Openings cut into walls (the opening slices), camera controls (the navigation
  slice), the color-temperature slider and the paint material (the lighting and
  paint slices).

## 7. References

- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2 (conventions and the vertical datum), 3.2 (the curve-capable contour
  the boundary uses), 5.2 (the material seam), 6 (the testing strategy), and 7
  (the slice map; this is foundation slice 4, ceilings and per-room floors).
- ADR-0045 (the render harness, the coordinate, datum, and winding conventions,
  and the visual baseline).
- ADR-0061 (the wall shell, the per-surface material groups, and the pixel-
  approximate visual tier this slice extends to the slab and ceiling).
- ADR-0062 (this slice's per-room derivation, the manual prism through
  `planToWorld`, the single-sided ceiling, and the slab-thickness placeholder).
- ADR-0018 (scene-graph derivation), ADR-0026 (rooms derived from wall topology,
  including the interior-void holes the slab cuts), ADR-0034 (the height-profile
  and layered-assembly seams this slice keeps additive), ADR-0044 (the track
  delivery model).
  </content>
  </invoke>
