---
slug: decisions/ADR-0160-plan-wall-poche-and-face-lines
title: 'ADR-0160: Plan walls draw as poche between two face lines'
type: decision
tags: [2d-plan, canvas, geometry, walls, junctions, openings, construction-profiles]
related:
  [
    decisions/ADR-0159-plan-ink-weight-hierarchy,
    decisions/ADR-0080-generalized-wall-junction-geometry,
    decisions/ADR-0137-wall-construction-profiles,
    decisions/ADR-0018-scene-graph-derivation,
  ]
sourceFiles:
  [
    core/geometry/wall-face.ts,
    core/topology/wall-footprint.ts,
    core/scene/construction-profile.ts,
    core/scene/scene-graph.ts,
    editor/plan/draw-plan.ts,
    editor/plan/draw-surface-paint.ts,
    editor/plan/hit-test-wall-face.ts,
    editor/plan/plan-palette.ts,
    editor/design-system/tokens.css,
  ]
status: current
updated: 2026-08-15
---

# ADR-0160: Plan walls draw as poche between two face lines

## Status

Current.

## Context

The 2D plan drew each wall as a single stroked centerline whose line width was the wall's
projected thickness. That reads as a diagram of a building rather than a drawing of one. A plan is
a horizontal section: the drafting convention is to draw the two wall faces the section cuts
through as lines, and to fill the material between them. The fill is called poche, and it is what
lets a reader see at a glance which parts of the page are solid.

Drawing a wall as a thick line also made two other things impossible to express. A wall could not
show where an opening interrupts it, because a stroke has no interior to interrupt; the opening
painter worked around this by painting a rectangle of floor color back over the stroke, a
compromise recorded in [[ADR-0159-plan-ink-weight-hierarchy]] and tracked for a real fix in issue
#521. And the drawn width came from the wall's raw `thickness` field while the 3D builder had been
sizing its footprints from the construction-profile assembly total since issue #365, so a masonry
wall was modeled at 231 mm and drawn at whatever its raw thickness happened to be. That mismatch
is issue #414, a named deferral in [[ADR-0137-wall-construction-profiles]].

## Decision

### 1. A wall draws as a filled poche polygon between two stroked face lines

The centerline stroke is gone. Each wall stretch fills the closed polygon between its two faces in
a palette poche color, then strokes both face lines at `PLAN_INK_WIDTH.cut`, the heaviest role in
the ink hierarchy. This keeps the cut plane reading as the cut plane under
[[ADR-0159-plan-ink-weight-hierarchy]], with the ink now marking the actual faces rather than
approximating them with a wide stroke.

The old `MIN_WALL_PIXELS` floor is gone with the centerline. It existed so a wall too thin to
project visibly still read as a line. The face lines already guarantee that: at extreme zoom-out
the two faces converge and their two cut-weight strokes merge into a single legible line, so
thinness degrades on its own without a special case.

### 2. Mitred corners come from the existing junction fan, not from new geometry

[[ADR-0080-generalized-wall-junction-geometry]] already resolves every junction as a fan of its
incident edges and produces mitred footprint corners, with a miter limit that falls back to a
square cap on corners too acute to cut. `core/topology/wall-footprint.ts` is that implementation,
and the 3D builder has drawn on it since. The plan now composes the same helper rather than
offsetting centerlines itself.

This matters beyond avoiding duplicated trigonometry. Two independent miter implementations would
drift, and the 2D plan and the 3D model would quietly disagree about where a wall's corner is.
Sharing one source means a junction that tiles in the model tiles on the page.

`core/geometry/wall-face.ts` is the new module, and it takes the mitred corners as data rather
than importing the topology that produces them. Geometry stays below topology in `core/`, which is
the direction the rest of the layer already runs. The caller composes the two.

### 3. The graph edge, not the authored wall, is the unit of drawing

A wall that another wall tees into is split into several graph edges, and only the per-edge
footprint carries the corners that make that tee tile. Drawing per authored wall would put a
square end in the middle of a junction. The owning wall node is resolved per edge for its
selection state, so selection still tracks the entity the user thinks they picked.

### 4. Openings cut clear spans out of the poche

Each opening projects onto its host edge as a span of centerline distances, and the poche stops at
each jamb instead of running behind the opening. A wall with one interior opening therefore fills
two polygons rather than one, and its face lines break at the same places.

The spans are normalized before use: clamped to the edge, ordered, and merged where they overlap.
Clamping is what makes a split wall work without special handling. An opening that belongs to
another sub-edge of the same wall projects outside this one, clamps to a zero-length span, and
drops out, so no caller needs to work out which sub-edge hosts which opening.

The cut is taken perpendicular to the wall axis. That is exact on a mitred face, because mitring
slides a face's corners along a line that stays parallel to the centerline; it never tilts the
face. So the perpendicular meets both faces at the same centerline distance and the jamb reads
square, which is what a drawn opening should look like.

This is the geometric break issue #521 asked for. The painted gap in `draw-opening.ts` is now
redundant, since there is no poche behind an opening to cover, but it is left in place rather than
removed in the same change; retiring it is a separate cycle with its own tests.

### 5. Drawn thickness resolves through the construction profile, with the raw thickness as fallback

The footprint thickness per edge comes from `effectiveWallThickness`, so a wall carrying a known
construction-profile id draws at its assembly total. The helper already owns the whole fallback
rule: a wall with no profile draws at its raw `thickness`, and a profile id the registry does not
carry falls back to the raw thickness too, so a missing entry degrades to the previous behavior
instead of collapsing the wall to nothing.

This mirrors the split `engine/scene/wall-builder.ts` established for the 3D side. The planar
graph is still built from raw thicknesses, since it only needs geometry to node the arrangement,
and the resolved thicknesses feed the footprint pass that actually sizes what is drawn. Following
the existing split rather than inventing a second arrangement keeps the two renderers reading the
same way.

### 6. Poche is a palette color, solid in both themes

`--color-canvas-poche` joins the canvas tokens and `PlanPalette` gains a matching `poche` field,
resolved the same way `roomFill` is. Light theme uses a warm mid tone from the vellum ramp against
near-white paper; dark theme uses a mid ink tone, lighter than its room fill, so the wall still
reads as a solid mass when the canvas inverts. A solid fill was chosen over a hatch because a
hatch has to be retuned at every zoom level or it turns into noise, and nobody has asked for
hatching yet.

### 7. The wall pass straddles the surface-paint layer

The poche fill paints below the surface-paint bands and the face lines above them. The poche is
the solid a finish is applied to, so a band should read as a finish laid onto the wall's material,
while the face lines are the cut itself and belong on top. Painting the whole wall pass in one
place would have buried the bands under an opaque fill.

## Consequences

- The claim in [[ADR-0159-plan-ink-weight-hierarchy]] that a wall's stroke width is
  `wall.thickness * viewport.scale`, with the cut weight applying only as a floor at extreme
  zoom-out, no longer describes the code. Walls do not stroke at a thickness-scaled width at all.
  The cut weight now applies unconditionally to both face lines, and thickness drives the poche
  polygon instead. That ADR's ink-role decisions are otherwise untouched.
- The wall graph is rebuilt on every `drawPlan` call, and `drawPlan` runs on viewport changes as
  well as model changes, so a pan or zoom recomputes wall topology that did not change.
  `buildWallGraph` is O(n squared) in wall count. This is accepted for now rather than solved,
  because the memoization seam belongs at the plan-scene layer rather than inside the draw pass.
  It will bite first on exactly the plans this product exists to serve, old houses carved into many
  small rooms, so it should not sit unaddressed for long. Issue #546 carries the memoization.
- The surface-paint bands still compute their endpoints as square offsets from each wall's own
  endpoints, independent of the mitred corners the faces now use. Under the old uniform stroke that
  mismatch was hidden inside thick ink; against a drawn face line a painted band will visibly fall
  short of, or run past, the mitred corner at a non-collinear junction. This folds into issue #547.
- Only the drawn wall symbol resolves its thickness through the construction profile. Three
  neighbours still read the raw `thickness` field: the surface-paint band offset
  (`editor/plan/draw-surface-paint.ts`), the wall-face hit band
  (`editor/plan/hit-test-wall-face.ts`), and the `hostThickness` a scene-graph opening node carries
  (`core/scene/scene-graph.ts`). On a wall with a construction profile the drawn faces therefore sit
  at the assembly half-thickness while a paint band, a face hit target, and an opening's jamb caps
  sit at the raw half-thickness, so they no longer line up with the ink. Bringing them onto
  `effectiveWallThickness` is issue #547. It was left out of this change deliberately: each one is a
  behavior change with its own tests, and hit targets moving is a thing a user feels.
- Where an opening's jamb stands past a face corner that a miter has pulled back, the material left
  between the jamb and the corner is a triangle, and a four-corner ring cannot express one. That
  stretch is dropped rather than returned, so an acute corner with a door hard against it shows a
  small unfilled wedge. Dropping is the safer of the two available repairs: returning the stretch as
  a ring with a repeated corner paints 10694 square mm where the real material is 7290, laying 3404
  square mm of poche across the door opening, and painting into a void reads worse than leaving a
  notch. The exact fix clips the ring against the miter edge and needs a variable-length ring.
- The hover cue still strokes the wall centerline, which now runs through the middle of the poche
  rather than along drawn ink. It works and is still tested, but tracing the footprint would read
  better, and that is worth a look in a later pass.
- No committed visual baseline covers the 2D plan canvas. The home-page baseline renders an empty
  new project with no walls, and neither the Storybook nor the scene baselines render `PlanView`,
  so no baseline needed refreshing.

## Update (2026-08-15): the three raw-thickness neighbours close

Two consequences above named issue #547, and one of them is now settled. The surface-paint
band (`editor/plan/draw-surface-paint.ts`), the wall-face hit band
(`editor/plan/hit-test-wall-face.ts`), and the `hostThickness` a scene-graph opening node
carries (`core/scene/scene-graph.ts`) all read `effectiveWallThickness`. On a solid masonry
wall the band, the face hit target, and an opening's jamb caps sat about 4.7 px inside the
poche at default scale; they now land on the drawn face. The fallback rule is untouched in all
three: no profile, or a profile id the registry does not carry, still resolves to the raw
thickness. Three was the count of neighbours that should have followed the ink, not the count
of raw `thickness` readers left in the tree. Wall topology still nodes the arrangement from the
raw figure on purpose (`editor/plan/draw-plan.ts`, `core/topology/rooms.ts`), which is what
decision 5 above describes; the walker's standoff in `core/scene/walk-collision.ts` reads raw
against 3D walls that render at the assembly total, and that mismatch is issue #552.

`hostThickness` was the one worth tracing before moving it, since the scene graph feeds 3D as
well as the page. Nothing in `engine/` or `bridge/` reads it. The 3D wall builder sizes its
own footprints from `effectiveWallThickness` on the wall node, and the void it carves reads
only an opening's width, height, and sill height, so nothing converts twice. Its production
readers all draw the page: the plan opening symbol (`editor/plan/draw-opening.ts`,
`editor/plan/opening-geometry.ts`) and the SVG plan export (`core/export/svg/`). No 3D output
moved and no scene baseline needed refreshing.

The change does leave a new mismatch inside that export. `renderWalls` in
`core/export/svg/svg-plan-exporter.ts` still strokes a wall at its raw `thickness`. The canvas
stopped doing that in this decision, and the exporter's own opening gap has now stopped too, so
an exported plan of a profiled wall draws a gap wider than the wall it breaks. Putting the
exporter's wall symbol on the same resolver is its own cycle.

The other #547 consequence stands unchanged. A painted band still takes its endpoints as
square offsets from the wall's own endpoints, so at a non-collinear junction it still falls
short of or runs past the mitred corner. Only the thickness half of that issue closed here.

## References

- [[ADR-0159-plan-ink-weight-hierarchy]] (the ink roles this builds on; its wall-stroke-width claim
  is superseded here).
- [[ADR-0080-generalized-wall-junction-geometry]] (the junction fan and miter limit this composes).
- [[ADR-0137-wall-construction-profiles]] (the profile registry, and the named deferral of the 2D
  symbol that issue #414 closes).
- `core/geometry/wall-face.ts` (`wallFaceGeometry`, `WallFaceStretch`).
- `core/topology/wall-footprint.ts` (`wallFootprints`, the mitred corners).
- `core/scene/construction-profile.ts` (`effectiveWallThickness` and its fallback rule).
- `editor/plan/draw-plan.ts` (`drawableWallEdges`, `drawWallPoche`, `drawWallFaces`).
- Issue #414 (size the 2D plan wall symbol from the construction-profile thickness).
- Issue #521 (the durable geometric break for the wall-break gap fill).
- Issue #546 (memoize the plan wall graph so a pan or zoom stops rebuilding topology).
- Issue #547 (bring the surface-paint band, the wall-face hit band, and an opening's `hostThickness`
  onto the construction-profile thickness the drawn symbol now uses).
- Issue #550 (bring the SVG plan export's wall stroke onto the same resolver, so an exported
  opening gap stops outrunning the wall it breaks).
- Issue #552 (the walk-mode collision standoff, which still stands the walker off a raw
  half-thickness from walls the 3D view renders at the assembly total).
