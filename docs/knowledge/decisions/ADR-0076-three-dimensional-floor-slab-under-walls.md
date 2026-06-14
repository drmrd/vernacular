---
slug: decisions/ADR-0076-three-dimensional-floor-slab-under-walls
title: 'ADR-0076: Floor slab reaches the outer wall faces'
type: decision
tags: [architecture, three-dimensional, geometry, floor-slab, rooms, preview]
related:
  [
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0034-future-direction-extensibility-seams,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-floor-slab-under-walls.md,
    docs/plans/2026-06-14-three-dimensional-floor-slab-under-walls.md,
    core/geometry/polygon.ts,
    core/topology/rooms.ts,
    core/scene/scene-graph.ts,
    engine/scene/room-builder.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0076: Floor slab reaches the outer wall faces

## Status

Accepted. A polish item on the three-dimensional preview, issue #124 from the
product owner's backlog. It extends the floor slab of
[[ADR-0062-three-dimensional-floor-slabs-and-ceilings]] and reuses the room
derivation of [[ADR-0026-room-derivation-planar-face-enumeration]].

## Context

Each room's floor slab is built from the room's `clearPolygon`, the boundary that
the centerline `polygon` traces once it is inset inward by each bounding wall's
half-thickness. That polygon meets the inner faces of the walls, so the slab stops
there and the walls read as standing on the rim of a slab that is set back inside
them. The owner saw this as issue #124: a floor extends under its walls, so the
slab should reach the wall outer faces and read as one continuous base.

The decision is what boundary the slab spans and where that boundary is computed.

## Decision

The slab spans the boundary at the wall outer faces, which is the centerline
polygon offset outward by each bounding wall's half-thickness, the exact mirror of
the inward-inset clear polygon. The clear polygon bounds the net floor area; this
one bounds the gross floor area, measured to the outer face of the enclosing
walls.

The boundary is derived in core, alongside the clear polygon, from the same
inputs. `deriveRooms` already computes `clearPolygon` as `insetPolygon(polygon,
edgeOffsets)`, where `edgeOffsets[i]` is half the thickness of the wall on edge
`i`. A new pure `outsetPolygon(polygon, edgeOffsets)` helper, the mirror of
`insetPolygon`, produces the outward boundary; it offsets each edge outward and
meets the neighbors at the mitered corner. `Room` gains an `outerPolygon` set to
that, and a custom-polygon override sets it to a copy of the custom polygon, the
way it already does for the clear polygon. `RoomSceneNode` gains an optional
`outerPolygon` carried by `deriveRoomNodesForFloor`.

The room builder reads `outerPolygon` for the slab's caps and sides, falling back
to `clearPolygon` when a hand-built node omits the field. The ceiling keeps
building from `clearPolygon`: a flat ceiling spans the clear interior between the
walls and would read wrong poking out past their outer faces. Nothing else about
the slab moves; only the outer-loop points shift outward, so the three material
groups, the roles, the cap triangulation, the vertical datum, and every
`planToWorld` placement are unchanged. The slab's `exteriorFace` sides now sit on
the wall outer faces, which is where the building exterior is.

`outerPolygon` is a derived scene-graph value, recomputed from the walls on every
derivation like `clearPolygon` and `area`. Nothing is stored on the model and
nothing is serialized, so there is no schema bump and no migration.

## Alternatives considered

- **Extend the slab only to the wall centerline.** Use the room's centerline
  `polygon` for the slab. Simpler, since the polygon already exists, but it leaves
  the outer half of every wall overhanging empty slab, so the gap the owner
  reported only halves rather than closing. Rejected for not reaching the outer
  faces the owner asked for.
- **Compute the outward boundary in the engine builder.** Offset the boundary in
  `room-builder.ts` from the centerline and a per-edge thickness. Rejected: the
  builder does not carry the per-edge offsets (the room node carries finished
  boundaries, not the wall thicknesses), and the offset is a topology fact that
  belongs in core next to the inset that mirrors it, where it stays pure and unit
  tested.
- **Extend the ceiling outward as well.** Symmetric, but a flat ceiling that
  reaches past the wall outer faces reads wrong, and a ceiling spans the interior,
  not the structure. Rejected; the slab and the ceiling take different boundaries
  on purpose.

## Consequences

- The slab reaches the wall outer faces in the preview, so a floor reads as one
  continuous base under its walls. This closes issue #124.
- The harness baseline changes, because the slab footprint grows, so the committed
  `scene-webgl` baseline is refreshed in this change.
- `outsetPolygon` joins `insetPolygon` as a paired offset helper. A future bevel or
  round corner join, and an inset of the interior-void holes, are additive to both
  at once.
- Core gains one derived field on the room and one optional field on the room node,
  both additive; the two-dimensional editor reads `clearPolygon` and is unaffected.
- No model, persistence, or schema change, because the boundary is derived.
