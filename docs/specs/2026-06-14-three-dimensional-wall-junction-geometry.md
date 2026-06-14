# Three-Dimensional Wall-Junction Geometry

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview, junction geometry)
**Scope:** A geometry change to the three-dimensional preview. It generalizes how
wall ends resolve where walls meet, so a T-junction, a busier multi-way meeting,
and an acute corner all draw as one clean solid, and it fixes wall tops that read
see-through at problem corners. The openings, the floor and ceiling slabs, the
lighting, the paint, the selection layer, and the two-dimensional plan are
unchanged. The slice succeeds ADR-0077 and follows the conventions pinned by the
track foundation (`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`)
and ADR-0045. The decisions specific to this slice live in ADR-0080.

This addresses issue #167 from the product owner's backlog. ADR-0077 miters the
corner where exactly two walls meet, reading the joint from the wall graph and
extruding a per-edge footprint. It deferred every busier junction on purpose: a
vertex with three or more incident edges kept square overlapping ends, and a corner
sharper than the miter limit fell back to a square cap. A top-down view of a real
plan shows that those deferred cases are the common ones, and four failure modes
stand out:

1. Miter overshoot spikes, where the offset-face intersection runs away as a corner
   sharpens, so a long thin triangle shoots past the wall.
2. T-junctions, where a partition tees into a through-wall, left square and so
   leaving a gap, an overlap, or a sliver at the joint.
3. Multi-way and acute junctions, where three or more walls meet at a point (a bay,
   for example), badly broken, with radiating spikes and disconnected geometry.
4. Wall tops that read see-through at problem corners, from a winding or normal
   issue or a degenerate self-intersecting footprint in the top cap.

This slice closes the first three by resolving every junction the same way and the
fourth by orienting the caps from the footprint itself.

---

## 1. Goal

After this slice, the preview resolves a junction of any size. Where two walls meet
the corner stays the clean miter ADR-0077 already draws. Where a partition tees into
a through-wall the three ends tile the joint with no gap or sliver. Where three or
more walls meet at a point each wall reaches to its neighbors and the walls fill the
junction with no radiating spikes. A corner too acute to miter cleanly stops at the
wall's own face instead of throwing a spike, leaving at worst a small notch. Every
wall top draws as a solid opaque cap.

The change is additive and build-time only. It keeps the pure geometry pass that
reads the floor's wall graph and produces, for each wall edge, the plan-view
footprint of that edge; it changes how each end's two corners are found. The wall
builder reads the footprint and extrudes it exactly as before, with one fix to how a
cap is wound. There is no change to the model, the persisted file format, the scene
graph's data, or the two-dimensional renderer.

## 2. What this slice inherits

These are fixed by the foundation, the wall shell (ADR-0061), and the two-way miter
(ADR-0077), and are not re-decided here:

- The plan-to-world axis map (`planToWorld`): plan x maps to world X, plan y maps to
  world Z, and the vertical axis is world Y. Every wall vertex is placed through it,
  and the footprint stays in plan space until it is placed the same way.
- The vertical datum: a wall's base sits at the floor group's local `Y = 0` and it
  rises to its height. Junction resolution changes the footprint in plan, not either
  cap in Y.
- The wall height accessor (`wallHeight(node)`): the single read point for a wall's
  height, read unchanged when the footprint is extruded.
- The material seam (`MaterialProvider`, `SurfaceRole`) with its neutral default and
  the per-surface material groups. A wall keeps the same roles (`interiorFace` and
  `exteriorFace` for the two long faces, `exteriorFace` for the end caps, `top`,
  `base`) and the same paint surface references on the two long faces (the `+normal`
  long face is side `left`, the `-normal` is side `right`).
- The wall graph (`buildWallGraph`, `PlanarGraph`): merged junction vertices and one
  edge per wall segment, with T-junctions and crossings already split into separate
  edges that share a vertex. This slice reads that graph; it does not change how it
  is built.
- The footprint shape (`WallFootprint`): four plan-space corners, two per end
  (`aPlus`, `aMinus`, `bPlus`, `bMinus`). The corners are chosen differently here,
  but the shape and its meaning are unchanged.
- The miter of two offset face lines and the `lineIntersection` helper from
  ADR-0077, and the `MITER_LIMIT` past which a miter is treated as too sharp to cut.

## 3. Design

### 3.1 A junction is a fan of its incident edges

ADR-0077 resolves each wall end on its own and miters only when the shared vertex
has exactly two incident edges. This slice resolves the whole vertex at once. At a
vertex, take every incident edge and the direction it leaves the vertex along, and
sort those edges by that outgoing direction's angle. The sorted edges fan out around
the vertex, and between each neighbor pair in the fan there is a wedge of open ground
the two walls share.

Reading the vertex as a fan covers every case with one rule. A free end is a vertex
with one incident edge and no neighbor on either side. A two-way corner is a vertex
with two incident edges, where each edge's two neighbors are the same other edge, so
the rule reduces to the ADR-0077 miter. A T-junction is a vertex with three incident
edges (the through-wall split into two by `buildWallGraph`, plus the partition). A
multi-way junction is a vertex with more. The same fan resolves them all.

### 3.2 One miter point per wedge, shared by the two walls

For each wedge between a neighbor pair, compute one miter point: the crossing of the
two bordering wall-face lines, each offset from the shared vertex by its own wall's
half thickness, exactly as ADR-0077 computes a two-way corner. That single point is
the corner of the wall on the wedge's one side and, at the same time, the corner of
the wall on the wedge's other side. The two walls read the same point, so they meet
along it with no gap and no overlap.

Because each wall in the fan takes, as its two corners at the vertex, the miter
points of the two wedges to its sides, the walls tile the junction. A two-way corner
tiles into one clean joint, a T-junction into three ends that meet along the
through-wall's face, and a multi-way junction into a star of walls that close around
the point. Each wedge is computed once and shared, so no two walls disagree about
where their common corner sits, which is what removes the gaps and slivers of the
square-ended joints.

The corner-to-side mapping follows the fan's order. Sorting the edges
counter-clockwise, the wedge between an edge and its counter-clockwise neighbor lies
on that edge's `+normal` side and gives its `+normal` corner; the wedge to its
clockwise neighbor gives its `-normal` corner. The miter point on a wedge is the
crossing of the counter-clockwise edge's `+normal` face line and the clockwise
edge's `-normal` face line, the two faces that border that wedge.

Three degenerate cases fall out of the same computation:

- The two bordering faces are parallel (the walls are collinear): they never cross.
  This is the straight run of a T-junction's through-wall and a wall split at an
  interior point. The corner falls back to the wall's own face-offset point at the
  vertex (the centerline endpoint offset by half thickness). Collinear neighbors
  share that point, so the face runs straight through with no false corner.
- There is no neighbor on a side (a free end, and the open side of the fan): the
  corner is the wall's own face-offset point, a square cap.
- The miter point would run past the miter limit (a corner too acute): each wall
  clamps to its own face-offset point on that side instead of reaching the far miter
  point. The spike is gone. A small notch can remain across the very-acute wedge,
  which is where the deferred bevel (section 5) would chamfer.

The clamp is per side, so only the acute side of a corner squares off while the
other side keeps its miter; this is a refinement on ADR-0077, which squared both
ends of a corner together when either side ran past the limit.

### 3.3 The footprint and how it is extruded

The footprint stays four plan-space corners, two per end, and the pure pass over the
wall graph still returns one footprint per edge in the graph's edge order. What
changes is the corner search: instead of classifying each end as square or two-way
miter on its own, the pass resolves each vertex's fan once and reads each edge's two
corners from the wedges to its sides. The pass lives in `core`; it is pure plan
geometry over the graph with no Three.js, and it is gated by Node tests.

The wall builder extrudes a footprint into a prism exactly as ADR-0077 does, with
the same faces and roles: two long faces (one per side) rising to the wall height,
two end caps across the thickness (square or along the miter line), and a top face
at the height and a base face at `Y = 0`. A free-standing or straight-run wall
extrudes to the same shape it draws today; the joints change, the box does not.

### 3.4 Wall tops are wound from the footprint

ADR-0077 winds the top and base caps from a fixed corner order, which faces the
right way only when the footprint is a rectangle. A mitered or clamped footprint can
reorder its corners or, where the old spike crossed the centerline, fold into a
self-intersecting shape, and then the fixed order winds the cap backward or into a
degenerate triangle. That is the see-through top of failure mode four.

This slice winds each cap from the footprint itself. It reads the footprint's signed
area (the shoelace helper already in `core`) to know the corners' turn direction and
winds the top cap so its normal faces `+Y` and the base so its faces `-Y`, whatever
order the corners arrived in. A footprint whose area is within an epsilon of zero is
degenerate and contributes no cap rather than a backward or zero-area triangle.
Section 3.2 already keeps footprints from self-intersecting by clamping the spikes,
so in practice the caps are simple quads; winding from the area makes the top opaque
regardless.

### 3.5 Walls that host an opening keep their square ends

A wall that hosts a door or window builds through the separate profile path that cuts
the opening void out of the elevation, and that path keeps its square ends, as
ADR-0077 left it. The corner stays solid because the opening wall is just another
edge in the fan: its plain neighbors miter against its offset face lines, reading its
thickness and direction from the graph, so they reach the opening wall's face and its
square end overlaps under them. Mitering the opening profile's ends would slant the
rectangular elevation outline it triangulates, a larger change than these junctions
need, so it stays deferred.

## 4. Verification

The gating proof stays the deterministic Node tests, as the foundation and the prior
slices set out:

- The footprint pass on a T-junction: the partition's two corners and the
  through-wall's two near-side corners land on the through-wall's face line, the
  through-wall's back face runs straight (the collinear fallback), and no footprint
  self-intersects.
- The footprint pass on an acute multi-way bay: each wall reaches its neighbors'
  shared corners, an over-limit wedge clamps each wall to its own face so no corner
  throws a spike, and no footprint self-intersects.
- The footprint pass on the cases ADR-0077 already covers: a free end stays square,
  a two-way right-angle corner gives the same outer and inner miter points, two walls
  of different thickness join on each wall's own face lines, and a collinear split
  stays square. These pin that the generalization does not move the existing joints.
- The wall prism caps: a footprint with corners in either turn direction yields a top
  cap whose normal faces up and a base whose faces down, and a degenerate footprint
  yields no cap.

The second tier is the pixel-approximate visual render in the `scene-webgl`
Playwright project, as ADR-0061 set out. The harness gains a fixture with a
T-junction and an acute bay so the render exercises the new joints, and its baseline
is committed; the existing shell-room baseline confirms the two-way corners and the
straight runs are unchanged. The harness self-skips where a WebGL 2 context cannot be
created, so this tier stays outside the gating chromium tree.

## 5. Out of scope and deferred

- A true bevel for acute and multi-way corners: a junction-fill solid that chamfers
  the over-limit wedges and fills the central polygon, extruded floor to ceiling, so
  the notch the clamp leaves is closed. This slice clamps to a square face instead,
  which removes the spike and reads cleanly at all but the sharpest corners. The
  bevel is tracked as issue #180.
- Mitered ends on walls that host an opening. They keep square ends; their corners
  stay solid because the plain neighbor miters against them.
- Any change to the two-dimensional plan's wall rendering. The plan draws walls its
  own way and is untouched; this slice is the three-dimensional preview only.

## 6. References

- ADR-0080: the decisions specific to this slice.
- ADR-0077: the two-way miter this slice generalizes, the footprint and
  `lineIntersection` it reuses, and the deferrals it takes up.
- ADR-0061: the wall shell, the material seam and surface roles, and the
  pixel-approximate visual tier.
- ADR-0045 and `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`: the
  coordinate, datum, winding, and unit conventions, and the junction question this
  slice closes for the busier cases.
- ADR-0063: the opening profile path whose square ends this slice leaves in place.
- Issue #180: the true-bevel follow-on this slice defers.
