---
slug: decisions/ADR-0081-three-dimensional-opening-fill
title: 'ADR-0081: Opening fill as box parts, the fill-kind resolver, and the opening-bodied scene'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    scene,
    openings,
    fill,
    leaf,
    sash,
    glass,
    transparency,
    element-types,
    scene3d-reference,
    material-provider,
    surface-role,
    extrusion,
    selection,
    testing,
    visual-regression,
    playwright,
    engine,
    core,
  ]
related:
  [
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-opening-fill.md,
    docs/plans/2026-06-14-three-dimensional-opening-fill.md,
    core/registries/element-types.ts,
    core/scene/opening-fill.ts,
    core/scene/scene-graph.ts,
    engine/materials/material-provider.ts,
    engine/materials/neutral-material-provider.ts,
    engine/materials/paint-material-provider.ts,
    engine/scene/opening-fill-builder.ts,
    engine/scene/build-scene.ts,
    bridge/react/scene-harness-view.tsx,
    e2e/tests/scene-visual-regression.spec.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0081: Opening fill as box parts, the fill-kind resolver, and the opening-bodied scene

## Status

Accepted, landed. This is the opening-fill slice of the three-dimensional preview
track ([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), the geometry
slice that follows the opening voids
([[ADR-0063-three-dimensional-opening-voids]]) on top of the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]) and the floor
slabs and ceilings ([[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]),
against the slice-0 harness and conventions
([[ADR-0045-three-dimensional-render-harness-and-conventions]]). The slice
specification (`docs/specs/2026-06-14-three-dimensional-opening-fill.md`) and the
track foundation spec are authoritative for scope; this record captures the
decisions that give an opening a body.

## Context

The void slice cuts the hole an opening removes from its wall and lines it with
reveals, but it stops there: every door and window is a hole you see straight
through, and the void slice left the fill generator unbuilt on purpose, because the
cut needed only the void side ([[ADR-0063-three-dimensional-opening-voids]]). The
foundation paired a void-contour generator with a fill-geometry generator on an
opening's element type and left the fill for the slice that first needs it
(foundation section 3.1). This slice is that slice: it puts a leaf in a door and a
sash with glass in a window, so a wall full of holes reads as a building.

The void slice settled the seams this slice extends. `Scene3DReference` already
carries `voidContour` beside the coarse `builder` key, and the foundation said the
fill is the additive other half of that pair. The opening local frame and the
`planToWorld` axis map already place the void; the fill lives in the same frame. The
surface-role material seam already maps a role to a material, with `reveal` reserved
by the wall shell. And the void slice recorded that opening selection waits for the
fill mesh: the reveals carry the wall's entity id, so a doorway picks the wall until
the opening has a body. Each of those is the ground this slice builds on.

## Decision

### `Scene3DReference` names the fill kind, beside the void

The element-type registry gains a `fill` key on `Scene3DReference`, an
`OpeningFillKind`, beside `voidContour`. The door families take `door-leaf`, the
window families take `window-sash`, and a cased opening omits the key, which reads
as no body. The existing `builder` key (`door-frame`, `window-frame`) stays the
coarse fill-builder name, but it cannot distinguish a cased opening from a door,
because a cased opening shares `door-frame`. The fill slice needs the finer `fill`
key the same way the void slice needed `voidContour` rather than `builder`. Naming
the fill kind separately is the additive evolution the foundation asked for, and it
keeps geometry selected by a declarative, versioned registry key rather than
inferred from the opening family in the mesher (ADR-0034, ADR-0006). Adding `fill`
bumps the element-type registry version, the same change `voidContour` made.

`fill` is a string-keyed kind, open to further variants the way `voidContour` and
`ContourSegment` are. A glazed door, a half-round window sash, or a paneled leaf is
a new kind, a new generator, and a new resolver case, with no change to the builder
that calls it.

### The fill resolver authors box parts, not a ring with a hole

A pure resolver `openingFill(node, elementTypes?)` in `core/scene/` looks up the
node's element type, dispatches on its `fill` kind, and returns a list of fill
parts. A part is an axis-aligned box in the opening local frame (foundation section
3.2): an extent along the wall, an extent in height, a thickness across the wall on
the centerline, and a surface role. A door is one or two parts, a window is a glass
part plus four frame parts, and a cased or unrecognized opening is no parts.

Authoring every body as boxes is the decision that keeps the fill simple. A window
sash is naturally a rectangular ring, but a ring with a hole forces the builder onto
the triangulated profile-minus-hole path the void cut uses and forces the tests to
assert a tessellated outline. Four frame bars plus a glass pane are five boxes, each
an axis-aligned extent the Node tests read exactly and the engine builds with one box
primitive shared across the whole fill. The small cost is four overlapping corners
where the frame bars meet, the same harmless overlap the wall boxes already accept at
corners. A door leaf is one box (or two for a double), inset by a uniform reveal gap
so it sits inside the void rather than flush with the wall faces.

The reveal gap, the leaf thickness, the sash frame width, the frame thickness, and
the glass thickness are named constants in `core/scene/`, single read points the way
the slab slice named its thickness, so a later slice or an element-type parameter can
drive them without touching the mesher.

### The engine builds a fill group that carries the opening id, and the opening gets a body

A builder `buildOpeningFill(node, materials, elementTypes?)` in `engine/scene/`
calls `openingFill`, builds a box mesh per part, and returns a `THREE.Group` whose
`userData.entityId` is the opening id. Each box corner maps its local
`(along, up, across)` to a plan point (`center + along * along-axis + across *
normal`) at the height `up`, then through `planToWorld`, so the fill shares the axis
map and the placement authority of the cut it fills, and is built from the opening
node alone without re-deriving the wall edge.

The group carrying the opening id is the additive selection change the void slice
recorded as waiting for the fill. The reveals still carry the wall id; the fill is
the opening's body, so picking a leaf or a sash now picks the opening rather than the
wall. An empty fill (a cased opening) adds no group and stays unpickable, exactly as
before. `buildScene` and `buildFloorGroup` gain an opening loop beside the wall and
room loops; the wall builder, the void cut, and the reveals are unchanged, so the
fill is additive geometry beside the cut, not a change to it.

### The leaf and the glass take new surface roles, and glass is transparent

`SurfaceRole` gains `leaf` and `glass`. The `NeutralMaterialProvider` maps `leaf` to
an opaque mid-tone standard material and `glass` to a semi-transparent standard
material: transparent, a low opacity, and depth-write disabled so the glass blends
without occluding the room behind it. The `PaintMaterialProvider` falls through to
the neutral material for both roles, because a paint reference describes a wall or
room surface treatment, not the joinery of a leaf or the glazing of a window.
Reserving the two roles is the same move the wall shell made for `reveal`, and it
keeps the door and the glass paintable separately when a later slice wants it.

### The visual tier gains a filled door and a glazed window

The tier-one Node geometry and scene-tree tests stay the gating proof of
correctness, as in the earlier slices: the fill parts' extents, the double-leaf
split, the window frame band and the glass inset, and the empty cased fill are
asserted as exact local-frame boxes, and the fill group's entity id and parenting
are asserted on the scene tree. The `scene-webgl` harness fixture, which already
hosts a south-wall door, gains a window on another wall, so the harness renders both
a filled door and a glazed window, and the committed `scene-shell-webgl` baseline is
refreshed once. The assertion stays pixel-approximate, because a graphics-processor
render is not pixel-stable across drivers and antialiasing. No new dependency is
added.

## Consequences

- A door reads as a door and a window reads as a window with glass in it: the shell
  stops showing holes you see straight through, and the room reads through the
  glass.
- The element type selects the fill kind through one resolver, so a glazed door, a
  divided-lite window, or a curved-glass sash is a new `fill` kind and generator,
  not a change to the builder. The fill kind sits beside `voidContour` on the same
  reference.
- Authoring the fill as boxes keeps one geometry primitive across the leaf, the
  sash, and the glass, so the builder and the tests stay simple, at the cost of
  harmless overlap where the four sash bars meet.
- An opening now has a body that carries its entity id, so picking a leaf or a sash
  picks the opening. This is the selection change the void slice deferred; a cased
  opening stays unpickable.
- The closed-flat leaf, the single-pane sash, the absent trim, and the rectangular
  bodies are conscious simplifications, each recorded in the spec's generalizations
  section as the shape of its additive change.
- The visual tier gains a filled door and a glazed window without new brittleness,
  and the gating proof stays the deterministic Node tests.

## Alternatives considered

- **Infer the fill from the opening family instead of a `fill` key.** Rejected: the
  family already separates swing and window operations, but reading geometry from
  the family in the mesher is the hardcoded-geometry path ADR-0034 and the void
  slice both moved away from. A declarative `fill` key on `Scene3DReference` keeps
  the geometry selected by a versioned registry value, and lets two types in the
  same family choose different fills (a glazed door against a panel door) without a
  family change.
- **Reuse the coarse `builder` key (`door-frame`, `window-frame`).** Rejected: it
  cannot distinguish a cased opening, which shares `door-frame` with a real door, so
  it would draw a leaf in a cased opening. The finer `fill` key is the same refinement
  the void slice made when it added `voidContour` rather than dispatching on
  `builder`.
- **Author the window sash as a triangulated ring with a hole.** Rejected for this
  slice: it puts the fill onto the profile-minus-hole path the void cut uses and
  makes the tests assert a tessellated outline, for a frame that four overlapping box
  bars render just as well. Boxes keep one primitive and exact Node assertions.
- **Render the door open at a swing angle now.** Rejected: a swing needs a hinge side
  and a swing direction the model does not carry, and inventing them here would tie
  the 3D leaf to data the 2D door-swing symbol should own. The closed-flat leaf is
  the zero-angle case the swing seam rotates later.
- **Draw casing and trim around the opening in this slice.** Rejected: trim is its
  own feature with its own profile data, and it adds geometry on the wall face beside
  the fill, not inside the void. Folding it in here would widen the slice past the
  body the void was cut for.
- **Make the fill a child of the wall mesh rather than its own group.** Rejected: the
  fill is the opening's body and must carry the opening's entity id for selection,
  while the wall mesh carries the wall id. A separate group keyed to the opening is
  the natural home, and it keeps the wall mesh and its reveals untouched.

## References

- Slice specification `docs/specs/2026-06-14-three-dimensional-opening-fill.md`.
- Implementation plan `docs/plans/2026-06-14-three-dimensional-opening-fill.md`.
- [[ADR-0063-three-dimensional-opening-voids]]: the void this slice fills, the
  `voidContour` key beside which `fill` lands, the opening local frame, the reveal
  faces, and the deferred opening selection this slice completes.
- [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]: the per-room shells, the
  manual geometry through `planToWorld`, and the named-thickness single read point
  this slice follows.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the wall
  shell, the box primitive this slice's fill parts reuse, the reserved `reveal` role
  this slice mirrors for `leaf` and `glass`, and the pixel-approximate visual tier.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the axis map, the
  winding rule, the vertical datum, and the visual baseline.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track delivery
  model; this is the three-dimensional preview track's opening-fill slice.
- [[ADR-0034-future-direction-extensibility-seams]]: openings read their geometry
  from the element type, and the fill seams this slice keeps additive.
- [[ADR-0018-scene-graph-derivation]]: the scene graph and the `userData.entityId`
  the fill group carries.
- [[ADR-0006-registry-pattern]]: the registry pattern behind the element-type
  registry whose `Scene3DReference` this slice evolves.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack, the millimeter scene tree,
  and the transparent-material handling the glass uses.
