# Three-Dimensional Mitered Wall Junctions

**Date:** 2026-06-14
**Status:** Accepted (three-dimensional preview and floor-management polish)
**Scope:** A geometry change to the three-dimensional preview. It miters the ends
of walls that meet two at a time at a shared corner, so the corner reads as one
clean solid instead of two square-ended boxes that overlap and leave a gap on the
outer side. The openings, the floor and ceiling slabs, the lighting, the paint,
the selection layer, and the two-dimensional plan are unchanged. The slice builds
on the wall shell of ADR-0061 and follows the conventions pinned by the track
foundation (`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`) and
ADR-0045. The decisions specific to this slice live in ADR-0077.

This addresses issue #121 from the product owner's backlog. ADR-0061 shipped the
first wall shell as a box per wall: each wall extrudes from its centerline,
thickness, and height, and walls that share a junction simply overlap into a solid
mass. That reads as continuous along the wall but it is wrong at the corners. Two
walls meeting at an angle each end square at the shared vertex, so on the inner
side of the corner the two boxes overlap and on the outer side they leave a
triangular notch of missing material. ADR-0061 named this and deferred it on
purpose: "the mitered junction builder is an additive follow-on: it reads the wall
graph this slice already passes through the seam, resolves each junction from its
incident edges, and plugs in behind the same builder type without touching any
consumer." This slice is that follow-on.

---

## 1. Goal

After this slice, where exactly two walls meet at a shared corner the preview
draws a clean mitered joint: each wall is trimmed or extended at that end along the
miter line so the two walls tile the corner with no notch on the outside and no
double layer of material on the inside. The miter is correct for walls of
different thickness, because each wall's faces are offset by its own half
thickness and the joint is the intersection of those offsets.

The change is additive and build-time only. It introduces a pure geometry pass
that reads the floor's wall graph and produces, for each wall edge, the plan-view
footprint of that edge with its corner ends mitered. The wall builder reads the
footprint and extrudes it. There is no change to the model, the persisted file
format, the scene graph's data, or the two-dimensional renderer. Walls that do not
qualify for a miter keep their square ends, so the result is the wall shell from
ADR-0061 with clean corners added where they apply.

## 2. What this slice inherits

These are fixed by the foundation and the wall shell (ADR-0061), and are not
re-decided here:

- The plan-to-world axis map (`planToWorld`): plan x maps to world X, plan y maps
  to world Z, and the vertical axis is world Y. Every wall vertex is placed through
  it, and the mitered footprint stays in plan space until it is placed the same way.
- The vertical datum: a wall's base sits at the floor group's local `Y = 0` and it
  rises to its height. Mitering changes the footprint in plan, not either cap in Y.
- The wall height accessor (`wallHeight(node)`): the single read point for a wall's
  height. The extruded footprint reads height through it unchanged.
- The material seam (`MaterialProvider`, `SurfaceRole`) with its neutral default,
  and the per-surface material groups. A mitered wall keeps the same roles
  (`interiorFace`, `exteriorFace` for the two long faces, `exteriorFace` for the
  end caps, `top`, `base`) and the same paint surface references on the two long
  faces (the `+normal` long face is side `left`, the `-normal` is side `right`).
- The wall graph (`buildWallGraph`, `PlanarGraph`): merged junction vertices and
  one edge per wall segment, with T-junctions and crossings already split into
  separate edges that share a vertex. This slice reads that graph; it does not
  change how it is built.

## 3. Design

### 3.1 A junction is read from the wall graph

The wall graph already carries everything a miter needs. Its vertices are the
merged corner points and each edge is a wall segment between two vertices. The
number of edges incident to a vertex tells the joint apart:

- One incident edge: a free wall end (a terminus). It keeps a square cap.
- Two incident edges: a corner where exactly two walls meet. This is the case the
  slice miters.
- Three or more incident edges: a T-junction, a crossing, or a busier meeting of
  walls. These keep square ends in this slice and are deferred (section 5). They
  still read as solid, because the boxes overlap there as they do today.

Because `buildWallGraph` already splits a wall that another wall tees into, a
T-junction shows up as three incident edges and falls into the deferred case
without special handling. A straight wall split at an interior point shows up as
two collinear edges meeting at a vertex; the miter of two collinear walls is
degenerate (their offset faces are parallel and do not cross), so that case falls
back to a square end as well, which is correct because there is no corner to cut.

### 3.2 The miter of two walls at a corner

A wall's long faces are its centerline offset to each side by half its thickness.
Name the side toward the left-hand normal of the wall's direction the `+normal`
side and the other the `-normal` side, matching the existing wall builder, so the
`+normal` face is the interior face (paint side `left`) and the `-normal` face is
the exterior face (paint side `right`).

At a corner where wall A and wall B share vertex V, walk the pair as a directed
polyline that comes in along B from its far end to V and goes out along A from V to
its far end. The corner has a left side and a right side relative to that walk. On
each side, A's offset face line and B's offset face line meet at one point, the
miter point for that side:

- Take A's face line on that side: the line through `V + (tA / 2) * sideNormalA`
  in A's direction, where `tA` is A's thickness.
- Take B's face line on the same side: the line through `V + (tB / 2) * sideNormalB`
  in B's direction.
- Their intersection is the miter point. Because each line is offset by its own
  wall's half thickness, the joint is correct for different thicknesses with no
  special case.

This needs the intersection of two infinite lines given as a point and a direction,
which the segment helpers do not provide (`segmentIntersection` clamps to the
segments). The slice adds a small pure `lineIntersection(pointA, dirA, pointB,
dirB)` that returns the crossing point or null when the directions are parallel.

The left miter point is on A's `+normal` side and so becomes A's `+normal` corner;
the right miter point becomes A's `-normal` corner. From B's view the same two
points are its corners at V with the sides read from B's own normal. So both walls
read the same two corner points and meet exactly, with no notch and no overlap.

When `lineIntersection` returns null (the walls are parallel or collinear) the end
falls back to a square cap. A very acute corner makes the miter point shoot far
from V along a spike; the slice applies a miter limit, and when the miter would run
past `MITER_LIMIT` times the wall's half thickness the end falls back to a square
cap rather than draw a spike. The limit's only effect is on corners sharper than
roughly thirty degrees of included angle, which are rare; a bevel fallback that
would keep those corners closed is deferred (section 5).

### 3.3 The wall footprint and how it is extruded

For each wall edge the slice produces a footprint: the four plan-space corners of
the wall's quadrilateral in the ground plane, two at each end. An end is either a
square cap (its two corners are the centerline endpoint offset by half thickness
to each side) or a miter (its two corners are the two miter points from section
3.2). A free-standing wall with two square ends has the same footprint as today's
box, so the box is the footprint with both ends square.

A pure pass over the floor's wall graph builds these footprints. For each edge it
finds the edge's two endpoints, classifies each end by the incident-edge count at
that vertex, and computes the end's two corners. The pass lives in `core` (it is
pure plan geometry over the graph, no Three.js), and it returns one footprint per
edge in the graph's edge order so the builder can read them by index.

The wall builder extrudes a footprint into a prism instead of building a box. The
prism has the same faces and roles as the box, so nothing downstream changes:

- Two long faces, one per side, each a vertical quad from the side's two corners
  rising to the wall height. The `+normal` long face takes the `interiorFace` role
  and the `left` paint reference; the `-normal` long face takes `exteriorFace` and
  `right`.
- Two end caps, one per end, each a vertical quad across the wall thickness. A
  square end's cap is perpendicular to the wall; a mitered end's cap lies along the
  miter line. Both take the `exteriorFace` role with no paint reference, as the box
  end caps do.
- A top face at the wall height and a base face at `Y = 0`, each the footprint quad
  placed flat and wound so the top faces up and the base faces down. They take the
  `top` and `base` roles.

The prism reuses the section-and-material-group machinery the opening path already
uses (each face is a section with a role; the sections become one buffer geometry
with one material group per section, and vertex normals are computed from the
winding). A free-standing or straight-run wall extrudes to the same shape it draws
today; only walls at a two-way corner change.

### 3.4 Walls that host an opening keep their current ends

A wall that hosts a door or window builds through the separate profile path that
cuts the opening void out of the elevation. That path keeps its square ends in this
slice. The corner stays solid all the same: the plain neighbor at that corner
miters against the opening wall's offset face lines (it reads the opening wall's
thickness and direction from the graph like any neighbor), so the neighbor fills
the corner out to the opening wall's outer face, and the opening wall's square end
overlaps under it as the boxes overlap today. Because walls are opaque the corner
reads as one clean solid. Mitering the opening profile's ends as well is deferred
(section 5); the elevation outline the opening path triangulates is a rectangle
today and a mitered end would slant its vertical edges, which is a larger change
than this slice's corners need.

## 4. Verification

The gating proof stays the deterministic Node tests, as the foundation and
ADR-0061 set out:

- The pure `lineIntersection` helper: a crossing for two non-parallel lines, null
  for parallel and for collinear lines.
- The pure footprint pass: a free wall end and a deferred multi-way junction give
  square corners (the centerline endpoint offset by half thickness); a two-way
  right-angle corner gives the expected outer and inner miter points; two walls of
  different thickness give a joint that lands on each wall's own face lines; a very
  acute corner falls back to a square end at the miter limit.
- The wall prism: a free-standing wall extrudes to the same dimensions and face
  roles as the box it replaces (so the existing shell stays correct); a mitered
  wall's long faces and end cap land on the footprint corners; the material groups
  and their roles, the entity id on the mesh, and the paint references on the two
  long faces are unchanged.

The second tier is the pixel-approximate visual render in the `scene-webgl`
Playwright project, as ADR-0061 set out. The shell harness fixture is a small room
of walls, so its corners are now mitered; the committed baseline is refreshed to
show clean corners, and the render confirms the walls still draw as a solid shell.
The harness self-skips where a WebGL 2 context cannot be created, so this tier
stays outside the gating chromium tree.

## 5. Out of scope and deferred

- Multi-way junctions (three or more incident walls: T-junctions and crossings).
  They keep square overlapping ends and read as solid. A general multi-way miter is
  the genuinely involved case ADR-0061 flagged and is a later follow-on.
- Mitered ends on walls that host an opening. They keep square ends; their corners
  stay solid because the plain neighbor miters against them. Mitering the opening
  profile's slanted elevation outline is a later refinement.
- A bevel fallback for corners sharper than the miter limit. Those corners fall
  back to a square end for now, which reads as a small notch only at very acute
  angles. A bevel that closes them cleanly is a later refinement.
- Any change to the two-dimensional plan's wall rendering. The plan draws walls its
  own way and is untouched; this slice is the three-dimensional preview only.

## 6. References

- ADR-0077: the decisions specific to this slice.
- ADR-0061: the wall shell, the box-per-wall junctions this slice refines, the
  material seam and surface roles, and the pixel-approximate visual tier.
- ADR-0045 and `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`: the
  coordinate, datum, winding, and unit conventions, and the open junction question
  this slice closes for the two-way case.
- ADR-0063: the opening profile path whose square ends this slice leaves in place.
- ADR-0076: the floor slab under the walls, the prior slice in this preview-polish
  group, which this slice's clean corners visually complement.
