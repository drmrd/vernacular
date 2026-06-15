# Three-Dimensional Wall-Junction Fill

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview, junction geometry)
**Scope:** A geometry change to the three-dimensional preview. It adds a junction-fill
solid that fills the uncovered core where three or more walls meet, including the notch
an acute wedge inside such a junction leaves, so a busy junction reads as one solid
mass instead of a hollow or chipped joint. The wall prisms, the openings, the
floor and ceiling slabs, the lighting, the paint, the selection layer, and the
two-dimensional plan are unchanged. The slice follows ADR-0080 (the generalized
junction geometry it builds on) and the conventions pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`) and ADR-0045. The
decisions specific to this slice live in ADR-0082.

This addresses issue #180 from the product owner's backlog, the follow-on ADR-0080
deferred. ADR-0080 resolves every junction as a fan of incident edges and shares one
miter point per wedge, so two-way corners, T-junctions, and multi-way meetings tile.
A junction where three or more walls meet leaves a small uncovered polygon at its
core, since each wall strip ends at its miter line and the strips do not reach the
center; and where a wedge inside such a junction is too acute to miter, ADR-0080
clamps the two walls to their own faces, which opens the core across that wedge. This
slice fills that core. A two-way corner is left as ADR-0080 draws it: a clean miter
where the angle allows, and overlapping square clamps where it does not, both of which
already join solid, so neither needs a fill (section 5).

---

## 1. Goal

After this slice, the preview fills the core a busy junction leaves. A junction where
three or more walls meet has its central polygon filled, so the walls read as joined to
a solid corner post rather than fanning out from a hollow center. Where a wedge inside
such a junction is acute and clamped, the fill chamfers straight across it, so the
notch is bridged. A two-way corner is unchanged: a clean miter already meets with no
gap, and an acute clamp already overlaps solid, so neither gains a fill nor can
z-fight. The fill rises floor to ceiling like the walls and reads in the same neutral
tone, so a corner looks like part of the wall mass.

The change is additive and build-time only. It adds a pure geometry pass that reads
the same floor wall graph the footprint pass reads and returns, for each junction that
needs one, the plan-view polygon of its fill. The wall builder extrudes each fill
polygon into a prism beside the wall prisms. There is no change to the model, the
persisted file format, the scene graph's data, the wall prisms themselves, or the
two-dimensional renderer.

## 2. What this slice inherits

These are fixed by the foundation, the wall shell (ADR-0061), and the generalized
junction geometry (ADR-0080), and are not re-decided here:

- The plan-to-world axis map (`planToWorld`): plan x maps to world X, plan y maps to
  world Z, and the vertical axis is world Y. Every fill vertex is placed through it,
  the same as a wall vertex.
- The vertical datum: a wall's base sits at the floor group's local `Y = 0` and rises
  to its height. The fill shares that datum, rising from `Y = 0`.
- The wall height accessor (`wallHeight(node)`): the single read point for a wall's
  height. The fill reads it for each incident wall to set its own height (section 3.3).
- The material seam (`MaterialProvider`, `SurfaceRole`) with its neutral default and
  per-surface material groups. The fill uses neutral roles only (section 3.4).
- The wall graph (`buildWallGraph`, `PlanarGraph`): merged junction vertices and one
  edge per wall segment, with T-junctions and crossings split into separate edges that
  share a vertex. This slice reads that graph; it does not change how it is built.
- The junction fan and the per-wedge miter from ADR-0080: each junction resolved as
  its incident edges sorted by outgoing direction, one shared miter point per wedge,
  the `MITER_LIMIT` past which a wedge clamps each wall to its own face, and the
  collinear and free-end fallbacks. The fill reads the same resolved corners the wall
  footprints stop at, so the two never disagree about a corner.
- The footprint shape (`WallFootprint`) and the wall prism the builder extrudes from
  it. The fill is a sibling solid; it does not change either.

## 3. Design

### 3.1 The fill is the uncovered core of a junction

At a junction, each wall is a strip that ends at the corners ADR-0080 resolves for it:
two corners at the shared vertex, one toward each neighboring wedge. The strip covers
the ground from its far end up to the line between those two corners (its near edge);
the ground on the vertex side of that near edge is not covered by that wall. Walk the
incident walls around the vertex and their near edges bound a polygon enclosing the
vertex. That polygon is the junction's uncovered core, and it is exactly what the fill
fills.

The polygon is read from the same resolved corners the walls stop at, so its edges lie
on the wall near edges. The fill and the walls therefore share those edges and only
those edges: the fill abuts each wall along its near edge and overlaps none of it. That
is what keeps the fill from z-fighting the walls. A fill is built from the corners the
walls already committed to, never from a fresh independent miter, so there is one
source of truth for where a corner sits.

### 3.2 When a junction gets a fill

A fill is built only where three or more walls meet. A free end and a two-way corner
are left to the wall prisms: a free end is a square cap, and a two-way corner is either
a clean miter (the walls meet with no gap) or, where the angle is too acute to miter,
ADR-0080's square clamp (the two squared ends overlap solid across the vertex). Both
two-way cases already join with no uncovered core, so a two-way corner gets no fill and
the existing miters and clamps are untouched and cannot z-fight.

At a junction of three or more walls, reading the core polygon's vertices in fan order
walks each wedge around the vertex: a wedge the two bordering walls miter contributes
that one shared miter point, and a wedge too acute to miter contributes the two walls'
own clamped corners with the chamfer edge between them. Connecting these around the
vertex gives the core polygon. A fill is emitted only where that polygon's area is
beyond a small epsilon, the same kind of degenerate guard the wall prism uses to drop a
zero-area cap, so a junction whose walls happen to leave no real core (three nearly
collinear edges, for example) contributes no fill.

Scoping the fill to three-or-more-way junctions is deliberate. A multi-way junction's
core polygon is read off the per-wedge miter and clamp points and is a simple polygon
enclosing the vertex. A two-way corner has no such core: a clean one collapses to a
line, and an acute one would read as overlapping clamps rather than a fillable gap.
Closing the sharpest two-way corner is a later refinement (section 5).

### 3.3 The fill is extruded floor to ceiling at the tallest incident wall

The fill is a vertical prism: the core polygon as a top cap and a base cap, joined by a
vertical side face per polygon edge. It rises from `Y = 0`, the shared wall base, to a
height. Where the incident walls are all the same height (the common case, since a
floor's walls default to its ceiling height) the fill matches them. Where they differ,
the fill takes the tallest incident wall's height, so the corner post is at least as
tall as every wall meeting it and no wall shows a gap above the post against its
neighbor. The post then stands a little proud of any shorter incident wall, which reads
as a solid corner rather than a notch; a stepped post that follows each wall's height
is more than this slice needs and is deferred (section 5).

The caps are wound from the polygon's signed area, the same shoelace orientation the
wall prism uses, so the top faces `+Y` and the base faces `-Y` whatever order the
corners arrived in. The side faces span the thickness between consecutive corners. Every
vertex is placed through `planToWorld`, so the fill sits in the same world frame as the
walls with no private rotation.

### 3.4 The fill reads neutral and is not its own entity

The fill is part of the wall mass, not a surface a renovator paints or selects on its
own. Its top and base caps take the existing neutral `top` and `base` roles. Its side
faces take a new neutral `junction` role, so the chamfer and the corner post read in
the same light-gray tone as an unpainted wall and a future change can give the junction
its own material without disturbing the wall roles. The fill carries no paint surface
reference, so the paint provider leaves it neutral; painting a corner post per side is
deferred.

The fill mesh carries no entity id. A junction is not an entity in the model, and a
bare corner is not a thing to pick, so the fill is left out of the pick path the way the
hidden-line edge overlay (ADR-0078) is: a click that lands only on a fill resolves to no
selection, and the fill never shadows the wall behind it in a pick. The fill is built
beside the wall and room geometry in the floor group, so it lights, frames, and exports
with the rest of the scene.

### 3.5 The fill is independent of openings

An opening sits in the middle of a wall edge, not at a junction vertex, so the fill and
the opening void never touch. A wall that both hosts an opening and meets others at a
vertex still contributes its resolved corners to the core polygon the same way; the
opening profile path changes the wall's elevation, not its footprint corners, so the
fill reads the corners unchanged. Nothing in this slice changes the opening geometry.

## 4. Verification

The gating proof is the deterministic Node tests, as the foundation and the prior
slices set out:

- The fill pass on a perpendicular T-junction: one fill polygon whose corners are the
  same points the three walls' footprints stop at, enclosing the vertex, with area and
  no self-intersection.
- The fill pass on an acute three-way bay: one fill polygon enclosing the apex, whose
  corners match the incident walls' resolved corners (the two obtuse wedges contribute
  miter points and the acute wedge its two clamped corners), with area and no
  self-intersection.
- The fill pass on the cases that get no fill: a free end, a clean right-angle two-way
  corner, an acute two-way corner, and a collinear split each emit nothing, since they
  are two-way or lower or leave no real core. These pin that the fill appears only where
  three or more walls leave an uncovered core.
- The fill prism: the top cap normal faces up and the base faces down for a polygon in
  either turn direction, the side faces take the `junction` role, the prism rises to the
  tallest incident wall's height, and the mesh carries no entity id.
- The material providers: the neutral provider returns a neutral material for the
  `junction` role, and the paint provider returns a neutral material for it as well,
  since the fill carries no paint reference.

The second tier is the pixel-approximate visual render in the `scene-webgl` Playwright
project, as ADR-0061 set out. The existing junction fixture already renders a T-junction
and an acute three-way bay (`?fixture=scene-harness&scene=junctions`); its baseline is
refreshed so the acute notch and the bay's core read as filled solid. The shell-room
baseline confirms a four-corner room, whose corners are clean two-way miters, is
unchanged and gains no fill. The harness self-skips where a WebGL 2 context cannot be
created, so this tier stays outside the gating chromium tree.

## 5. Out of scope and deferred

- Closing the sharpest two-way corner. A two-way corner is left to ADR-0080: a clean
  miter where the angle allows, and overlapping square clamps where it is too acute.
  Both already join solid, so this slice fills only three-or-more-way junctions; a bevel
  that reshapes the sharpest two-way corner is a later refinement.
- A stepped corner post that follows each incident wall's height where the walls
  differ. This slice takes the tallest incident wall's height for a flat-topped post.
- Rounded or curved corner fills. The fill chamfers straight across an over-limit wedge
  and fills the core polygon with straight edges.
- Painting a corner post per side. The fill stays neutral and carries no paint
  reference; per-side junction paint is a later paint-track refinement.
- Any change to the wall prisms, the opening voids, the slabs, or the two-dimensional
  plan. The fill is an additive sibling solid; the rest of the scene is untouched.

## 6. References

- ADR-0082: the decisions specific to this slice.
- ADR-0080: the generalized junction geometry, the fan and per-wedge miter, the
  `MITER_LIMIT` clamp this fill closes, and the resolved corners it reads.
- ADR-0061: the wall shell, the material seam and surface roles, and the
  pixel-approximate visual tier.
- ADR-0078: the hidden-line edge overlay whose non-pickable, no-entity-id pattern the
  fill follows.
- ADR-0045 and `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`: the
  coordinate, datum, winding, and unit conventions.
- Issue #180: the true-bevel follow-on this slice delivers.
