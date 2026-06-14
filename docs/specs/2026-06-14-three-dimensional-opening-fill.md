# Three-Dimensional Opening Fill

**Date:** 2026-06-14
**Status:** Accepted (opening-fill slice of the three-dimensional preview track)
**Scope:** The opening-fill slice of the three-dimensional preview track. It puts
a body back into the void each opening cuts: a door gets a leaf, a window gets a
sash frame and glass, and a cased opening stays empty. It builds against the
conventions and seams pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`), ADR-0045, the
wall shell of ADR-0061, the floor slabs and ceilings of ADR-0062, and the opening
voids of ADR-0063. The decisions specific to this slice live in ADR-0081. No swing
angle, no divided lites or muntins, no casing or trim on the wall face, and no
curved glass land here; each is a recorded seam for a later slice.

The void slice (ADR-0063) deliberately left every opening as a hole you see
straight through and left the fill generator unbuilt, because the cut needed only
the void side. This slice is that other half: the fill the foundation paired with
the void in `Scene3DReference` (foundation section 3.1). A door you can read as a
door, and a window with glass in it, is what turns a wall full of holes into a
building.

---

## 1. Goal

After this slice, an opening renders the body that sits in its void, chosen from
its element type:

- A door (the swing, slide, fold, and pivot families) renders a flat leaf filling
  the opening, set into the wall thickness with a small reveal gap around it so it
  reads as a panel in a doorway rather than a plug flush with the wall faces. A
  double-leaf door renders two leaves meeting at the opening center.
- A window (the fixed and crank families) renders a sash frame lining the void
  perimeter and a single glass pane filling the area inside the frame. The glass
  is semi-transparent, so the room reads through the window.
- A cased opening (the cased family) renders no body. Its void stays the trimmed
  pass-through the void slice already cuts.

The leaf, the sash frame, and the glass are the only opening bodies this slice
builds. The door renders closed and flat in the plane of the opening; a swing
angle needs a hinge side and a swing direction the model does not carry, so it is
a later seam. The window sash is a plain perimeter frame; muntins and divided
lites are a later detail. No casing or trim is drawn on the wall face around the
opening; that belongs to the trim and feature-data work. The two-dimensional plan
is unchanged; the two views keep observing the same scene graph.

The slice ships only the rectangular, straight-wall case, matching the void it
fills. The fill is authored with axis-aligned boxes in the opening local frame; a
round-topped window or a curved leaf is an arc-bounded shape and a later
generator. Wall corners still resolve as the junction slice resolves them; the
fill sits inside one opening and does not touch the corner geometry.

## 2. What this slice inherits

These are fixed by the foundation and the earlier geometry slices, and are not
re-decided here:

- The plan-to-world axis map (`planToWorld`): plan `(x, y)` at height `v` maps to
  world `(x, v, y)`. Every fill vertex this slice places goes through it, so the
  leaf, the sash, and the glass share one axis authority with the rest of the
  shell.
- The opening local frame (foundation section 3.2): origin at the finished-floor
  line below the opening center, `+x` along the wall, `+y` up, and the wall normal
  as the third axis spanning the wall thickness. The void contour is authored in
  this frame; the fill is authored in the same frame, so a fill box and the void
  it sits in share one coordinate system.
- The element-type registry and `Scene3DReference` (ADR-0006, ADR-0063): an
  opening's element type carries its 3D references. The void slice added
  `voidContour` to name the cut shape; this slice adds `fill` to name the body, the
  fill half of the pair the foundation described.
- The surface-role material seam (ADR-0061, ADR-0063): a mesh's faces take a
  `SurfaceRole`, and the `MaterialProvider` maps a role to a material. The wall
  shell reserved `reveal`; this slice reserves `leaf` and `glass`.
- The visual tier (ADR-0045, ADR-0061): Node geometry and scene-tree tests are the
  gating proof; the `scene-webgl` harness renders a fixture and a committed,
  pixel-approximate baseline guards the render.

## 3. The design

### 3.1 The element type names the fill, beside the void

`Scene3DReference` gains a `fill` key, an `OpeningFillKind`, beside the
`voidContour` key the void slice added. The door families take `fill: 'door-leaf'`
and the window families take `fill: 'window-sash'`. A cased opening omits the key,
which reads as no body. The existing `builder` key (`door-frame`, `window-frame`)
stays the coarse fill-builder name; it cannot tell a cased opening from a door,
because a cased opening shares `door-frame`, so the slice that builds the fill
needs the finer `fill` key the same way the void slice needed `voidContour` rather
than `builder`. Adding `fill` bumps the element-type registry version, the same
declarative, versioned change `voidContour` made.

`fill` is a string-keyed kind, open to further variants the way `voidContour` and
`ContourSegment` are. A glazed door or a half-round window sash is a new kind, a
new generator, and a new resolver case, with no change to the builder that calls
it.

### 3.2 The fill resolver authors boxes in the opening local frame

A pure resolver `openingFill(node, elementTypes?)` in `core/scene/` looks up the
node's element type, dispatches on its `fill` kind, and returns a list of fill
parts. A part is an axis-aligned box in the opening local frame: an extent along
the wall, an extent in height, a thickness across the wall, and a surface role.
The resolver returns the parts; the engine extrudes each into a box. A door is one
or two parts; a window is a glass part and four frame parts; a cased or
unrecognized opening is no parts.

Authoring every body as boxes keeps one geometry primitive for the whole fill, so
the engine builds and the tests assert one box shape rather than a ring with a
hole. A box is also an axis-aligned extent in the local frame, which is what the
Node tests can read exactly.

- **`door-leaf`.** A door's leaf fills the opening rectangle, inset by a small
  uniform reveal gap on all four sides so it sits inside the void rather than flush
  with the wall faces, with a leaf thickness centered on the wall centerline. A
  single door is one part spanning the full inset width. A double door (the
  element type's `double` flag) is two parts splitting the inset width at the
  opening center, each leaf half the span. The leaf takes the `leaf` role.
- **`window-sash`.** A window's frame is four parts (head, sill, and two jambs)
  forming a band of one frame width inside the void perimeter, each a `leaf` part
  at a frame thickness centered on the centerline. The glass is one part filling
  the area inside the frame band, at a thin glass thickness centered on the
  centerline, taking the `glass` role.
- **omitted or unrecognized.** No parts. A cased opening renders its empty void.

The reveal gap, the leaf thickness, the sash frame width, the frame thickness, and
the glass thickness are named constants in `core/scene/`, single read points the
way the slab slice named its thickness, so a later slice or an element-type
parameter can drive them without hunting through the mesher.

### 3.3 The engine builds a fill group per opening, carrying the opening id

A builder `buildOpeningFill(node, materials, elementTypes?)` in `engine/scene/`
calls `openingFill`, builds a box mesh per part, and returns a `THREE.Group`
parented under the opening's floor group. Each box corner is placed by mapping its
local `(along, up, across)` coordinates to a plan point (`center + along \* along-axis

- across \* normal`) at the height `up`, then through `planToWorld`, so the fill
shares the axis map and the placement authority of the cut it fills. The group
carries the opening's entity id in `userData`, so the fill is the opening's body in
  the rendered scene.

This is the body the void slice said the opening would get. Until now the reveals
carried the wall's entity id and the opening had no mesh, so picking a doorway
picked the wall. With a fill group carrying the opening id, picking a leaf or a
sash picks the opening, the additive selection change the void slice recorded as
waiting for the fill. An empty fill (a cased opening) adds no group and stays
unpickable, as before.

`buildScene` and `buildFloorGroup` gain an opening loop beside the wall and room
loops: for each opening derived onto the floor, build its fill group and add it to
the floor group. The wall builder, the void cut, and the reveals are unchanged;
the fill is additive geometry beside the cut, not a change to it.

### 3.4 The leaf and the glass take new surface roles

`SurfaceRole` gains `leaf` and `glass`. The `NeutralMaterialProvider` maps `leaf`
to an opaque mid-tone standard material and `glass` to a semi-transparent standard
material (transparent, a low opacity, and depth-write disabled so it blends without
occluding the room behind it). The `PaintMaterialProvider` falls through to the
neutral material for both roles, because a paint reference describes a wall or room
surface treatment, not the joinery of a leaf or the glazing of a window. Adding the
roles is the same reserved-role move the wall shell made for `reveal`.

### 3.5 The visual tier gains a filled door and a glazed window

The Node geometry and scene-tree tests stay the gating proof, as in the earlier
slices: the fill parts' extents, the double-leaf split, the window frame band and
glass inset, and the empty cased fill are asserted as exact local-frame boxes, and
the fill group's entity id and parenting are asserted on the scene tree. The
`scene-webgl` harness fixture, which already hosts a door on its south wall, gains a
window on another wall, so the harness renders both a filled door and a glazed
window, and the committed `scene-shell-webgl` baseline is refreshed once. The
assertion stays pixel-approximate, because a graphics-processor render is not
pixel-stable across drivers and antialiasing. No new dependency is added.

## 4. Generalizations and recorded seams

Each simplification this slice takes is additive, recorded here as the shape of its
later change:

- **Swing angle.** The door leaf renders closed and flat. An open or ajar leaf
  needs a hinge side and a swing direction, which the model does not carry; when it
  does, the leaf part rotates about its hinge edge, and the closed leaf is the
  zero-angle case. The 2D plan's door-swing symbol is the natural source of the
  hinge and direction.
- **Divided lites and muntins.** The window sash is a single pane in a plain
  perimeter frame. A double-hung pair, a divided-lite grid, or a muntin pattern is
  more `leaf` parts and more glass parts from the same resolver, driven by an
  element-type parameter, with no change to the builder.
- **Casing and trim.** No casing or trim is drawn on the wall face around the
  opening. Trim is its own feature with its own profile data; it adds geometry on
  the wall face beside the fill, not inside the void.
- **Curved glass and curved leaves.** The fill is authored as axis-aligned boxes,
  so it ships only rectangular bodies. A round-topped window or an arched leaf is an
  arc-bounded fill part and a later generator, the same way the void contour leaves
  arcs to a later shape.
- **Panel relief.** The door leaf is a flat slab. A paneled or raised-panel leaf is
  more parts or a profiled extrusion from the same resolver.
- **Material expressiveness.** The leaf and glass take neutral roles. A wood leaf, a
  painted leaf, or a tinted glass is a richer material behind the same two roles,
  and a paint reference could later reach the joinery through the provider.

## 5. Acceptance

- A single-leaf door renders one flat leaf set into its void with a reveal gap; a
  double-leaf door renders two leaves meeting at the opening center.
- A window renders a perimeter sash frame and a single semi-transparent glass pane
  inside it, and the room reads through the glass.
- A cased opening renders no body and keeps its empty void.
- The fill of an opening carries the opening's entity id, so picking the leaf or
  the sash picks the opening rather than the wall.
- The two-dimensional plan is unchanged.
- Node geometry and scene-tree tests gate the fill geometry; the `scene-webgl`
  baseline is refreshed once to show the filled door and the glazed window.
