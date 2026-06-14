# Three-Dimensional Floor Slab Under the Walls

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview and floor-management polish)
**Scope:** A small geometry change to the three-dimensional preview. It widens
each room's floor slab so the slab reaches the outer faces of the walls that
bound the room, instead of stopping at their inner faces. The walls, the ceiling,
the openings, and the two-dimensional plan are unchanged. The slice builds on the
floor-and-ceiling slab work of ADR-0062 and follows the conventions pinned by the
track foundation (`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`)
and ADR-0045. The decisions specific to this slice live in ADR-0076.

This addresses issue #124 from the product owner's backlog: in the preview the
floor slab stops at the inner faces of the walls, so the walls read as sitting on
the rim of a smaller slab with the slab edge set back inside them. A floor extends
under its walls, so the slab should reach the wall outer faces and read as one
continuous base.

---

## 1. Goal

After this slice, a room's floor slab spans the same footprint the walls enclose
measured to their outer faces. The slab's vertical sides line up with the outer
faces of the bounding walls rather than their inner faces, so the wall bases meet
a slab that runs the full way under them. The ceiling is unchanged: it stays over
the clear interior, because a ceiling spans between the walls rather than out past
them. Wall geometry, openings, lighting, paint, selection, and the plan view are
all untouched.

The change is additive. It introduces one room-boundary polygon (the boundary at
the wall outer faces) and one pure geometry helper that produces it, and the slab
builder reads the new boundary in place of the clear one. Where the new boundary
is absent (chiefly hand-built room nodes in fixtures), the slab falls back to the
clear boundary and the old behavior holds.

## 2. What this slice inherits

These are fixed by the foundation, the wall shell (ADR-0061), and the slab work
(ADR-0062), and are not re-decided here:

- The plan-to-world axis map (`planToWorld`): every slab vertex is placed through
  it, so the widened slab shares one axis authority with the walls.
- The winding convention (`canonicalOuterLoop`, `canonicalHoleLoop`): the slab's
  outer loop is oriented so its world normal points up after the axis flip, and
  interior voids wind opposite. The wider boundary is wound the same way.
- The vertical datum: the slab's top is flush with the finished floor at the floor
  group's local `Y = 0`, and its thickness extends to negative `Y`. Widening the
  footprint does not move either cap in `Y`.
- The single slab-thickness read point (`floorSlabThickness()`), the material seam
  (`MaterialProvider`, `SurfaceRole`) with its neutral default, and the per-surface
  material groups. The widened slab keeps the same three sections (`top`, `base`,
  and the `exteriorFace` sides) and the same roles.
- The room derivation: a room's centerline `polygon` and its inward-inset
  `clearPolygon` come from the wall topology (ADR-0026). This slice adds the
  outward-offset boundary alongside them, from the same inputs.

## 3. Design

### 3.1 The boundary at the wall outer faces

A room already carries two boundaries derived from the wall topology: the
centerline `polygon`, which runs through the wall centerlines, and the
`clearPolygon`, which is the centerline polygon inset inward by each bounding
wall's half-thickness, so it traces the inner wall faces and bounds the clear
floor area. The slab uses `clearPolygon` today, which is why it stops at the inner
faces.

The boundary this slice needs is the mirror of `clearPolygon`: the centerline
polygon offset outward by each bounding wall's half-thickness, so it traces the
outer wall faces. In the architecture vocabulary the clear polygon bounds the net
floor area and this one bounds the gross floor area, the footprint measured to the
outer face of the enclosing walls.

`deriveRooms` already computes the clear polygon as `insetPolygon(polygon,
edgeOffsets)`, where `edgeOffsets[i]` is half the thickness of the wall along edge
`i`. The outward boundary comes from the same call with the offsets negated, so it
is added as a sibling field with no new topology pass:

- A pure `outsetPolygon(polygon, edgeOffsets)` helper in `core/geometry/`, the
  mirror of `insetPolygon`, moves each edge outward by its offset and meets the
  neighbors at the mitered corner. It is `insetPolygon` with the offsets negated,
  named for the direction it offsets so a reader does not have to recognize the
  sign trick.
- `Room` gains an `outerPolygon`, set by `deriveRooms` to `outsetPolygon(polygon,
edgeOffsets)` next to the existing `clearPolygon`. A custom-polygon room override
  has no per-edge thickness, so the override path sets `outerPolygon` to a copy of
  the custom polygon, exactly as it already does for `clearPolygon`.
- `RoomSceneNode` gains an optional `outerPolygon`, set by `deriveRoomNodesForFloor`
  from the room's. It is optional, like `holes` and `ceilingHeight`, because
  hand-built room-node literals omit it; the slab builder supplies the
  `clearPolygon` fallback for those.

The mitered corner inherits `insetPolygon`'s behavior, so a reflex corner of a
non-convex room offsets to a mitered point the same way the inset does, in
reverse. That is correct for the rectangular and convex rooms this preview shows
today and is the same approximation the clear polygon already makes; section 4
records the refinement.

### 3.2 The slab reads the outer boundary, the ceiling keeps the clear one

The room builder splits the boundary the slab uses from the boundary the ceiling
uses. The floor slab builds its caps and its vertical sides from `outerPolygon`
when the node carries it, falling back to `clearPolygon`. The ceiling keeps
building from `clearPolygon`, because a flat ceiling spans the clear interior
between the walls and would read wrong poking out past the wall outer faces.

Both still cut the room's interior void rings (`holes`) as before. The slab's
three material groups, their roles, the cap triangulation, the vertical datum, and
every `planToWorld` placement are unchanged; only the outer-loop points move
outward. The slab's `exteriorFace` sides now sit on the wall outer faces, which is
where the building exterior actually is, so the role still reads true.

### 3.3 No model or persistence change

`outerPolygon` is a derived scene-graph value, computed from the walls every time
the scene graph is derived, the same as `clearPolygon` and `area`. Nothing is
stored on the project model and nothing is serialized, so there is no schema
version bump and no migration. The two-dimensional editor reads `clearPolygon` for
hit-testing, labels, and overlays and is unaffected by the added sibling field.

## 4. Generalizations kept additive

- **Holes are still cut at the contained room's centerline ring.** Slice 2 already
  cuts interior voids at the centerline rather than inset by a wall half-thickness,
  and this slice does not change that. A nested room whose own walls should carry a
  continuous slab between the two rooms would cut its hole at its outer boundary
  instead; that is the same future refinement slice 2 recorded, now also reachable
  by passing the contained room's outer boundary as the hole loop.
- **The miter is the inset's miter in reverse.** A deeply reflex corner offsets to
  a mitered point that can overshoot, the same way `insetPolygon` does for a
  reflex corner. A bevel or round join is a future refinement to the shared offset
  helpers, applied to both the inset and the outset at once.
- **Slab thickness stays a single placeholder.** Widening the footprint does not
  touch `floorSlabThickness()`; the layered-assembly seam of ADR-0034 is unchanged.

## 5. Testing strategy

Two tiers, the shape the slab work already uses. The tier-one Node tests gate; the
tier-two visual render is self-skipping verification, not a gate.

### 5.1 Tier one: deterministic geometry and derivation tests (gating)

The red-green-blue cycles live here. Node tests with no graphics context assert,
through the pure core helpers and the existing `engine/testing` readers:

- `outsetPolygon` offsets each edge of a rectangle outward by its own offset, the
  mirror of the `insetPolygon` cases, and offsets a non-uniform set of offsets per
  edge;
- `deriveRooms` gives a room an `outerPolygon` that traces the outer wall faces
  (a rectangle of walls yields an outer rectangle larger than the clear one by the
  wall thickness), and the custom-polygon override sets `outerPolygon` to the
  custom polygon;
- `deriveRoomNodesForFloor` carries `outerPolygon` onto the room node;
- the floor slab's footprint spans the room's `outerPolygon` (its top-cap bounds
  reach the outer rectangle), while the ceiling still spans the `clearPolygon`, and
  a node without an `outerPolygon` falls back to the clear boundary.

This tier is deterministic and is part of the gating check chain.

### 5.2 Tier two: pixel-approximate visual render (self-skipping)

The `scene-webgl` harness fixture's room gains an `outerPolygon` (its four-wall
rectangle offset out by the wall half-thickness), so the harness renders the slab
reaching the wall outer faces. The assertion stays pixel-approximate against a
tolerant committed baseline, refreshed once because the slab footprint grows. The
harness self-skips where no WebGL 2 context can be created and runs in the separate
`scene-webgl` Playwright project, outside the gating chromium tree. No new
dependency is added.

## 6. Out of scope

- Cutting interior-void holes at the contained room's outer boundary (the nested-
  room refinement of section 4).
- A bevel or round corner join for the offset helpers (section 4).
- The ceiling footprint (it stays on the clear interior by design).
- Wall geometry, mitered wall junctions (issue #121), near-wall transparency
  (issue #122), and the rest of the three-dimensional backlog.
- Any model, persistence, or schema change (the boundary is derived).

## 7. References

- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2 (conventions and the vertical datum) and 7 (the slice map).
- `docs/specs/2026-06-12-three-dimensional-floor-ceiling-slabs.md` (the slab and
  ceiling this slice widens) and ADR-0062 (the per-room prism, the single-sided
  ceiling, and the clear-polygon footprint this slice extends).
- ADR-0026 (rooms derived from wall topology, the centerline polygon and the
  inward-inset clear polygon this slice mirrors outward).
- ADR-0061 (the wall shell and the per-surface material groups the slab shares).
- ADR-0076 (this slice's outward boundary, the `outsetPolygon` helper, and the
  slab-reads-outer, ceiling-keeps-clear split).
