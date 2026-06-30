---
slug: decisions/ADR-0134-geometry-primitive-snaps-polygon-offset-corners
title: 'ADR-0134: Geometry primitive snaps polygon-offset corners to a sub-micrometer grid'
type: decision
tags: [architecture, geometry, core, floor-slab, rooms, numerical-precision]
related:
  [
    decisions/ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline,
    decisions/ADR-0076-three-dimensional-floor-slab-under-walls,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
  ]
sourceFiles: [core/geometry/polygon.ts, core/topology/rooms.ts]
status: current
updated: 2026-06-29
---

# ADR-0134: Geometry primitive snaps polygon-offset corners to a sub-micrometer grid

## Status

Accepted, landed. It is the follow-up
[[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]] flagged in its
consequences: the sub-micrometer snap that ADR-0129 placed in the topology layer
moves down into the geometry primitive where the noise is actually produced. It
closes issue #400.

## Context

ADR-0129 gives a room's shared interior edges a zero outward offset while its
perimeter edges still outset by the wall half-thickness. Mixing a zero and a
nonzero offset at one corner makes the shifted-line intersection in `outsetPolygon`
land a fraction of a nanometer off its exact coordinate. For the ADR-0129 test
geometry the corner that should be at `-100` comes back as `-100.00000000000045`,
because the intersection parameter works out to `31/30` and `3000 - (31/30) * 3000`
is not exact in IEEE-754 arithmetic. That dust is far below any junction tolerance,
but it is enough to break an exact-coordinate comparison between two abutting
slabs, so two floors that should meet edge to edge no longer agree on the shared
vertex.

ADR-0129 cleared the dust by snapping the outer-boundary vertices to a
sub-micrometer grid, and it did so in `core/topology/rooms.ts` because that change
was scoped to the topology layer. That left the snap in the wrong place. The noise
is born one layer down, in `intersectLines` inside `core/geometry/polygon.ts`,
which both `outsetPolygon` and `insetPolygon` call the same way. `insetPolygon`
feeds the room clear polygon and receives the same dust from the same source, but
the topology snap only wrapped the outer boundary. A clear polygon that is ever
content-addressed or compared for exact equality would carry unsnapped noise, a
latent version of the same bug the outer boundary already hit.

## Decision

Snap inside the geometry primitive so the exact-coordinate guarantee is part of the
primitive's contract rather than something each caller has to remember.

`insetPolygon` is the single point where the corner list is built from
`intersectLines`, and `outsetPolygon` is defined as `insetPolygon` of the negated
offsets. Snapping `insetPolygon`'s returned vertices therefore covers both
functions and every caller of either. The snap rounds each coordinate to the
nearest `1 / SNAP_UNITS_PER_MM` of a millimeter, with `SNAP_UNITS_PER_MM = 1e6`,
the same resolution ADR-0129 chose. A `snapCoordinate` and a `snapPolygon` helper
live beside the other module constants in `core/geometry/polygon.ts`, and the
constant carries the rationale so the next reader knows why an offset result is
rounded at all.

With the primitive snapping its own output, the topology-layer snap is redundant.
`buildRoom` drops the `snapPolygon` wrapper around `outsetPolygon`, and
`core/topology/rooms.ts` deletes its copy of the constant and the two helpers. The
exact-coordinate behavior the room boundary relied on is unchanged; it now comes
from the layer that creates the geometry.

This is a pure-core change with no observable behavior difference for the cases that
were already exact. Axis-aligned rectilinear insets keep landing on integer
coordinates, because their corner parameter stays within `[0, 1)` and never hits the
overshoot ratio that produces the dust. There is no model field, no serialization,
and no schema bump; the snap is a numerical-hygiene step on a derived value.

## Alternatives considered

- **Leave the snap in `core/topology/rooms.ts`.** It works for the outer boundary
  but says nothing about the clear polygon, which shares the exact same intersection
  and the exact same dust. Keeping the snap in topology means a second caller of the
  primitive can rediscover the bug, and it puts numerical-precision bookkeeping in a
  layer whose job is room derivation, not geometry arithmetic.
- **Snap inside the private `intersectLines` helper.** This is one level lower and
  would also clear the noise, but `intersectLines` is an internal building block
  whose only caller is `insetPolygon`, and snapping a single intersection rather
  than the assembled corner list buries the contract in a helper. Snapping the
  `insetPolygon` output achieves the same result while keeping the guarantee on the
  public function, where it can be documented and tested directly.
- **Expose `snapPolygon` and `snapCoordinate` as a caller opt-in.** Publishing the
  helpers and asking callers to apply them keeps the primitive's output noisy by
  default, so correctness depends on every caller remembering the extra step. Making
  the snap part of `insetPolygon` makes the exact-coordinate output the default that
  callers cannot forget, which is the safer contract.

## Consequences

- The geometry primitive returns exact, snapped coordinates for every caller, so
  the room clear polygon is now as clean as the outer boundary. The latent
  exact-equality bug on the clear polygon is closed before it could surface in a
  hash or content-address check.
- The exact-coordinate guarantee has one home. The constant, the helpers, and the
  snap all sit in `core/geometry/polygon.ts`, and `core/topology/rooms.ts` no longer
  carries a parallel copy that could drift in resolution or rationale.
- The topology layer is freed of geometry-noise handling and reads as plain room
  assembly again. The room boundary tests that pin exact `-100` corners stay green,
  now satisfied by the primitive rather than by a topology-layer wrapper.
- The grid resolution is a deliberate `1e-6` mm, fine enough to be invisible to any
  real dimension and coarse enough to absorb the rounding noise the intersection
  math produces. Coordinates that were already exact are unaffected by the rounding.

## References

- [[ADR-0129-floor-slab-shared-interior-edges-stop-at-centerline]]: introduced the
  sub-micrometer snap in the topology layer and named this move as its follow-up.
- [[ADR-0076-three-dimensional-floor-slab-under-walls]]: grew the slab to the wall
  outer faces, the geometry whose offset corners must agree between abutting rooms.
- [[ADR-0026-room-derivation-planar-face-enumeration]]: the room derivation that
  consumes the offset polygons whose corners this record keeps exact.
- [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]: the floor slab built on
  the offset polygons.
- Issue #400: the request to move the outer-boundary snap into the geometry
  primitive, which this record resolves.
