---
slug: decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings
title: 'ADR-0062: Per-room floor slabs and ceilings, built planar-horizontal behind additive surface seams'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    scene,
    floors,
    ceilings,
    slabs,
    rooms,
    extrusion,
    material-provider,
    surface-role,
    winding,
    contour,
    testing,
    visual-regression,
    playwright,
    engine,
    core,
  ]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-12-three-dimensional-floor-ceiling-slabs.md,
    docs/plans/2026-06-12-three-dimensional-floor-ceiling-slabs.md,
    core/scene/scene-graph.ts,
    core/scene/ceiling-height.ts,
    core/scene/floor-slab.ts,
    core/scene/vertical-datum.ts,
    engine/scene/room-builder.ts,
    engine/scene/build-scene.ts,
    bridge/react/scene-harness-view.tsx,
    e2e/tests/scene-visual-regression.spec.ts,
  ]
status: current
updated: 2026-06-12
---

# ADR-0062: Per-room floor slabs and ceilings, built planar-horizontal behind additive surface seams

## Status

Accepted, landed. This is slice 2 of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), the second geometry
slice on top of the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]) and the
slice-0 harness and conventions
([[ADR-0045-three-dimensional-render-harness-and-conventions]]). It is foundation
slice 4 (ceilings and per-room floors). The slice specification
(`docs/specs/2026-06-12-three-dimensional-floor-ceiling-slabs.md`) and the track
foundation spec are authoritative for scope; this record captures the decisions
specific to floor slabs and ceilings, and the seams that keep the harder surface
cases additive.

## Context

The wall shell turns a ring of walls into solid boxes, but a room is not a space
until it has a floor underfoot and a ceiling overhead. The scene graph already
derives rooms from wall topology ([[ADR-0026-room-derivation-planar-face-enumeration]]),
including a thickness-aware `clearPolygon` and interior-void holes for courtyards
and light wells, so the boundary a slab needs is already pure-core data. The
foundation left two questions open for the slice that hits them (foundation
section 9): whether ceilings derive per room or per floor, and the slab geometry
itself. Both land here.

A second pressure shaped this slice. Floors and ceilings in real period houses are
not the flat, horizontal, parallel surfaces the planar case assumes: ceilings
slope and tray, floors step and ramp, surfaces seam and curve, and a floor's
thickness is a layered assembly rather than one number. The product owner asked
that this slice ship the planar-horizontal case but account for those harder cases
as additive seams, not a future rewrite. That constraint is as much the decision
here as the geometry is.

## Decision

### Ceilings derive per room, from the floor's default ceiling height, read through an accessor

The foundation's open question (per room or per floor) resolves to **per room**.
`RoomSceneNode` carries an additive `ceilingHeight`, set by
`deriveRoomNodesForFloor` from the host floor's `defaultCeilingHeight`, and a pure
`ceilingHeight(node)` accessor in `core/scene/` is the single read point. This
mirrors the wall shell's `wallHeight` accessor exactly (ADR-0061): the builder
calls the accessor, never the field, so a per-room override or a tray, coved, or
sloped ceiling profile (the [[ADR-0034-future-direction-extensibility-seams]]
analog of the wall height profile) is an additive change at one point.

Per-room rather than per-floor is the right resolution because the model already
holds a per-room ceiling-height override (`RoomOverride.ceilingHeight`, set by
`SET_ROOM_CEILING_HEIGHT`): ceiling height is conceptually a room property, even
though every room on a floor shares the floor default today. This slice sources
the node's height from the floor default only and does **not** wire the per-room
override into the derived node; the deriver already receives the overrides map, so
preferring the override is a confined additive change, recorded as a follow-on
rather than built speculatively here.

The field is optional on the type for the same reason `WallSceneNode.height` is:
hand-built `RoomSceneNode` literals (chiefly fixtures) omit it, and the accessor
supplies the `DEFAULT_CEILING_HEIGHT_MM` fallback for them.

### Slab thickness is a single placeholder read point, not a model field

No model entity carries a slab thickness, so the slab thickness is a placeholder
constant `DEFAULT_FLOOR_SLAB_THICKNESS_MM` (250 mm) behind a `floorSlabThickness()`
read point in `core/scene/`. The builder reads the accessor, never the constant.

This is deliberate under-building. A real floor is a layered assembly (a finish
floor over a substrate over structure, optionally documenting joists or studs, and
never required to), the thickness varies between floors and within a floor, and
the assembly is shared with the wall construction profiles of ADR-0034 (a Phase 4
concern). Routing every read through one accessor keeps the move from scalar to
assembly additive, the same discipline the height accessor applies.

### The slab is a manual prism placed through `planToWorld`; the ceiling is a single downward plane

A per-room `buildRoomShell(node, materials)` returns a `THREE.Group` named with the
room id and carrying `userData.entityId`, so it reads like the floor group and a
raycaster walks up to the room. The group holds a floor-slab mesh and a ceiling
mesh.

The slab is a solid prism: its top face is the room's `clearPolygon` at `Y = 0`,
its bottom face the same polygon at `Y = -thickness` (the `floorSlabVerticalSpan`
datum), and its sides connect them. The caps are triangulated through
`THREE.Shape` / `THREE.ShapeUtils`, with the boundary as `canonicalOuterLoop` of
the clear polygon and each interior void as `canonicalHoleLoop`, and **every vertex
is placed through `planToWorld`**. Routing the vertices through the pinned axis map
rather than rotating an `ExtrudeGeometry` keeps one axis authority and one winding
authority across walls, slabs, and ceilings; an ad-hoc rotation that bypassed
`planToWorld` would be a second, silently divergent convention. The slab's upward
face takes the `top` role, its downward face the `base` role, and its sides the
`exteriorFace` role, behind the same `MaterialProvider` seam the wall shell uses.

The ceiling is a single downward-facing plane over the same boundary at
`ceilingHeight(node)`, wound so its normal points down into the room and taking the
`base` role. It is single-sided on purpose: from the harness's top-down camera it
back-face-culls so the interior floor stays visible, and from inside the room it
reads as the ceiling overhead. A solid ceiling slab with its own thickness is a
later refinement; a single plane is the minimal correct ceiling for the first
enclosed room.

`buildScene` gains a per-room loop mirroring its per-wall loop, adding each room
shell under the floor group whose model id matches the room's `floorId`. Its
signature is unchanged.

### The harder surface cases are additive seams, not built here

This is the decision the product owner asked to be preserved. The planar-
horizontal case is the only geometry this slice builds; each harder case is
recorded as the shape of its additive change so a future session does not mistake
the planar assumption for a closed design:

- **Non-planar surfaces** (sloped, curved, seamed, ramped floors and ceilings)
  land behind a future per-surface mesh-builder seam, the floor-and-ceiling analog
  of the foundation's `WallMeshBuilder` (foundation section 3.3), selected by
  surface kind. The seam is **not** threaded now, following the slice-1 precedent
  of not holding an unused seam open; the two inputs a non-planar surface needs are
  already present, since the boundary is the curve-capable `Contour` type and the
  height is read through an accessor that can return a profile.
- **Layered thickness** (finish over substrate over structure, joists or studs)
  replaces the scalar at the single `floorSlabThickness()` read point, shared with
  the ADR-0034 wall construction profiles.
- **Non-parallel surfaces** across split levels and stepped floors are
  multi-floor-track concerns; the per-floor, per-room derivation assumes no two
  surfaces are parallel, so a later non-parallel surface is additive against the
  same datum.
- **Holes** are cut at the contained room's centerline ring rather than inset by a
  wall half-thickness, a small approximation that reads correctly in a preview and
  is cheap to refine.

### The visual tier extends to the slab and ceiling, still pixel-approximate

The tier-one Node geometry and scene-tree tests stay the gating proof of
correctness, as in ADR-0061. The `scene-webgl` harness fixture gains one room (the
clear area of its existing four-wall rectangle), so the harness renders a slab and
a ceiling, and the committed `scene-shell-webgl` baseline is refreshed once. The
assertion stays pixel-approximate (a tolerant committed baseline rather than an
exact frame), because a graphics-processor render is not pixel-stable across
drivers and antialiasing. No new dependency is added.

## Consequences

- A floor with closed rooms reads as enclosed space: each room has a solid floor
  slab flush with the finished floor and a ceiling overhead, both parented under a
  room group carrying the room entity id, so selection sync is additive later.
- Ceiling height is read through one accessor and slab thickness through one read
  point, so a per-room override, a sloped-ceiling profile, and a layered floor
  assembly are each additive changes at a single place rather than edits rippling
  through the builder.
- Slabs and ceilings share the wall shell's axis map, winding rule, vertical
  datum, and material seam, because every vertex goes through `planToWorld` and
  every face takes a surface role. Faces point the right way, holes cut correctly,
  and the paint track is a provider swap for the new surfaces too.
- The planar-horizontal assumption is conscious, not silent: the per-surface
  mesh-builder seam, the layered-assembly read point, the non-parallel datum, and
  the centerline-hole approximation are recorded so the harder cases stay additive.
- The visual tier gains the slab and ceiling without new brittleness; the gating
  proof stays the deterministic Node tests.

## Alternatives considered

- **Derive ceilings per floor.** Rejected: the model already treats ceiling height
  as a per-room property (the `RoomOverride.ceilingHeight` override), so a per-room
  node carries the value where it belongs and the override wiring is a clean
  additive follow-on. A per-floor ceiling would have to be re-split per room the
  moment the override matters.
- **Build the slab with `ExtrudeGeometry` and rotate it into place.** Rejected:
  `ExtrudeGeometry` would introduce a second axis convention via the rotation that
  maps its extrude axis to world `Y`, diverging from the `planToWorld` authority
  the walls use. Triangulating the caps and placing every vertex through
  `planToWorld` keeps one axis map and one winding rule across the whole shell.
- **Make the ceiling a solid slab now.** Rejected for this slice: a single
  downward plane is the minimal correct ceiling for an enclosed room, back-face-
  culls cleanly from a top-down view, and a thick ceiling slab is an additive
  refinement that does not change the seam.
- **Thread the per-surface mesh-builder seam now.** Rejected: it would hold an
  unused seam open against the slice-1 precedent. The curve-capable contour and the
  height accessor already carry the inputs a non-planar builder needs, so the seam
  is shaped by its first real consumer.
- **Inset holes by a wall half-thickness.** Rejected for this slice: cutting the
  centerline ring reads correctly in a preview and avoids a second inset pass; the
  refinement is cheap when it matters.

## References

- Slice specification
  `docs/specs/2026-06-12-three-dimensional-floor-ceiling-slabs.md`.
- Implementation plan
  `docs/plans/2026-06-12-three-dimensional-floor-ceiling-slabs.md`.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall
  shell, the height accessor pattern, the material seam, and the pixel-approximate
  visual tier this slice extends to the slab and ceiling.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the axis map,
  winding rule, vertical datum, contour type, and visual baseline this slice
  builds against.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track delivery
  model; this is the three-dimensional preview track's second geometry slice.
- [[ADR-0018-scene-graph-derivation]]: the scene graph and the `userData.entityId`
  the room group carries.
- [[ADR-0026-room-derivation-planar-face-enumeration]]: the room derivation that produces the
  `clearPolygon` and the interior-void holes the slab consumes.
- [[ADR-0034-future-direction-extensibility-seams]]: the height-profile and
  layered-assembly seams this slice keeps additive.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack and the millimeter scene
  tree.
  </content>
