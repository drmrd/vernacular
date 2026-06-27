---
slug: decisions/ADR-0125-curved-opening-heads-from-shared-void-contour
title: 'ADR-0125: Curved 2D opening heads from the shared void-contour shape parameter'
type: decision
tags:
  [
    architecture,
    core,
    editor,
    plan,
    openings,
    windows,
    element-types,
    registry,
    void-contour,
    head-shape,
    geometry,
    rendering,
    canvas,
    old-house-vocabulary,
  ]
related:
  [
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0046-period-style-and-room-purpose-registries,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0034-future-direction-extensibility-seams,
  ]
sourceFiles:
  [
    core/registries/element-types.ts,
    core/registries/curved-opening-element-types.ts,
    core/scene/opening-head.ts,
    editor/plan/draw-opening.ts,
    editor/plan/drawable-openings.ts,
  ]
status: current
updated: 2026-06-27
---

# ADR-0125: Curved 2D opening heads from the shared void-contour shape parameter

## Status

Accepted, landed. This is the first slice of the curved-opening work (issue #170)
on the old-house vocabulary track (ADR-0046, ADR-0044). It draws a curved head on
the 2D plan symbol for round-top, segmental-arched, and lancet windows, and seeds
the three historic window element types those heads belong to. The 3D side of
these shapes (their wall-cut void and sash) is issue #171; until it lands the new
types fall back to the rectangular void and sash, so there is no broken
intermediate state. The remaining #170 slices are tracked in issue #364 (trim and
wall/ceiling feature data) and issue #365 (wall construction profiles).

## Context

ADR-0038 made an opening's plan symbol come from how it operates and its shape a
separate registry parameter, and it deferred the genuinely curved shapes (arched,
round, lancet, and the rest) because they need real arc geometry. ADR-0063 then
added `voidContour` to the element type's `Scene3DReference` and built the
rectangular wall-cut void from it, with the note that a non-rectangular opening
becomes a new `voidContour` kind plus a new generator, never a change to the
caller. At that point one opening shape (rectangular) existed and it described
only the 3D cut.

Two pieces were still missing for a period-vernacular window to read correctly. A
plan symbol had no way to draw anything other than a straight head across the
jambs, so an arched or round-top window looked identical to a flat-topped one on
the plan. And there were no element types for these historic windows to select.

The shape of an opening's head is one fact about the opening. The same arch shows
up as a curved line on the plan and as a curved cut in the wall. Recording it once
and reading it from both renderers keeps the two views from disagreeing about what
the window is.

## Decision

### One shape parameter drives both the plan head and the 3D void

`VoidContourKind` in `core/registries/element-types.ts` grows from `'rectangular'`
to `'rectangular' | 'round' | 'arched' | 'lancet'`. The single
`scene3D.voidContour` key stays the one place an opening's head shape lives, and it
is now the source of truth for both renderers: the 3D wall-cut void (ADR-0063) and
the 2D plan head this slice adds. A new head shape is one additive `case` shared by
both views, not a parallel field on the plan side. The union stays open to further
variants (bay, bow, octagonal) the same way `ContourSegment` is.

Reading the head shape from the element type rather than hardcoding it in either
renderer follows the registry pattern (ADR-0006) and the extensibility seam
ADR-0034 set: geometry comes from the type, not from a shape baked into the mesher
or the canvas routine.

### A pure-core head-arc generator in the opening-local frame

`openingHeadArcs(shape, width)` in `core/scene/opening-head.ts` returns the head's
arcs as descriptors in the opening-local frame, where x runs along the wall from
jamb to jamb and y rises across the wall toward the opening's facing side. Each
`OpeningHeadArc` carries its circle center, its two endpoints, and the crown (the
arc's highest point on the +y side), so a renderer has every reference point it
needs without recomputing the circle. The shapes are:

- `rectangular` (and any absent shape): no arcs, a flat head.
- `round`: one semicircle springing from both jambs, centered on the springline.
- `arched`: one shallow segmental arc, a single circle whose crown rises half the
  half-width above the springline rather than a full semicircle's rise.
- `lancet`: two equilateral arcs, each centered on the far jamb with a radius equal
  to the full width, meeting at a point above the springline.

The module is pure `core/`: it imports only `Point` and the geometry helpers and
holds no React or Three.js. The local frame means it knows nothing about wall
orientation or screen axes, so the same descriptors serve the plan today and can
feed the 3D void generator when issue #171 builds the curved cut, which is the
point of recording the shape once.

### The plan renderer maps the local arcs onto the wall and picks the sweep from the crown

`editor/plan/draw-opening.ts` lifts each local arc onto the wall axes (x along the
wall, y across it toward the facing side) and strokes it through the canvas. It
projects all four reference points to screen first, then chooses the canvas sweep
direction from the crown: the arc is stroked from one jamb to the other along the
direction that passes through the projected crown. Choosing the sweep from the
crown rather than from a fixed flag means the arc bulges to the facing side no
matter which way the host wall runs or how the y-up projection flips it, so a
window reads the same on a north wall and a south wall. `drawable-openings.ts`
resolves the head shape from the element type's `scene3D.voidContour` alongside the
symbol and the double flag, with an absent value drawing a flat head.

The plan head-indicator convention this establishes: an opening's head is a single
arc (or, for a lancet, a pointed pair of arcs) spanning the jambs and bulging
toward the opening's facing side. A flat head draws no arc.

### Three historic window element types

`core/registries/curved-opening-element-types.ts` adds `arched-window`,
`round-top-window`, and `lancet-window`, appended to `builtinElementTypes`. Each
carries its head in `scene3D.voidContour` (`arched`, `round`, `lancet`), the fixed
`window-fixed` plan symbol family from ADR-0038, and `window-frame` / `window-sash`
for the 3D builder and fill. They are additive entries with new ids, so a project
saved before this slice references none of them and loads unchanged. They live in
their own module so the main element-types file stays the rectangular-opening core.

## Consequences

- An arched, round-top, or lancet window reads as itself on the plan instead of
  looking like a flat-topped window, which is the period-vernacular detail the
  old-house track exists to serve (ADR-0046).
- The head shape is recorded once on the element type and read by both renderers,
  so adding the curved 3D void in issue #171 reuses the same `voidContour` value
  and the same `openingHeadArcs` descriptors rather than a second shape field.
- A future head shape is one new `VoidContourKind` member, one new `case` in
  `openingHeadArcs`, and (where a window wants it) one new element type. The plan
  drawing routine and the eventual 3D generator do not change.
- The three new types render a rectangular void and sash in 3D until issue #171,
  a recorded approximation rather than a gap: the plan is correct now and the 3D
  cut catches up additively.
- The arc generator is pure `core/`, so its geometry is unit-testable without a
  canvas or a renderer, and the plan layer is left with only the projection and
  the sweep-direction choice.

## References

- ADR-0063 (the `voidContour` key and the rectangular wall-cut void this slice's
  head shape now shares; the curved void is the deferred 3D half, issue #171).
- ADR-0038 (openings typed at the element level, operation-family plan symbols, and
  the deferral of curved shapes this slice begins to close).
- ADR-0006 (the registry pattern the head shape and the new types read from).
- ADR-0021 (the Canvas plan-drawing seam the head arc strokes through).
- ADR-0046 and ADR-0044 (the old-house vocabulary track and its delivery
  sequencing; these historic windows are part of that vocabulary).
- ADR-0034 (geometry read from the element type rather than hardcoded in a
  renderer).
- Issues #170 (curved openings, this first slice), #171 (the curved 3D void and
  sash), #364 (trim and wall/ceiling feature data), and #365 (wall construction
  profiles).
  </content>
  </invoke>
