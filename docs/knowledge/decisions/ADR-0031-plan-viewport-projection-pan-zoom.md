---
slug: decisions/ADR-0031-plan-viewport-projection-pan-zoom
title: 'ADR-0031: 2D plan viewport projection model (pan offset + zoom)'
type: decision
tags:
  [architecture, editor, plan, viewport, projection, pan, zoom, grid, rulers, canvas, testability]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0033-drawing-snap-model,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-04-plan-viewport-pan-zoom.md,
    editor/plan/viewport.ts,
    editor/plan/fit.ts,
    editor/plan/grid.ts,
    editor/plan/ruler.ts,
    editor/plan/draw-plan.ts,
    editor/plan/plan-view.tsx,
    editor/plan/use-viewport-controls.ts,
    editor/shell/editor-shell.css,
  ]
status: current
updated: 2026-06-05
---

# ADR-0031: 2D plan viewport projection model (pan offset + zoom)

## Status

Accepted, landed. The fixed scale-only plan viewport (ADR-0021) is now an
interactive infinite canvas: a screen-pixel pan offset on `Viewport`,
zoom-about-cursor, an adaptive grid, and rulers, all as pure unit-tested modules
under `editor/plan/` with only thin Canvas-and-pointer glue in `PlanView`. This
is slice 3 of Phase 1 (the 2D plan editor), implementing behavior the design
specification already mandates (sections 6.2 and 6.6); no `docs/specs/` change
was required. ADR-0021 remains the parent record for the plan path; this ADR
records the viewport projection and the grid/ruler derivation that extend it.

## Context

ADR-0021 shipped the plan path with a viewport that carried a single `scale`
(pixels per millimetre): `worldToScreen = point * scale`. That was enough for the
wall-drawing proof of life on a fixed canvas, but the spec calls for a smooth
(non-stepped) pan-and-zoom infinite canvas with an adaptive grid and rulers
(sections 6.2, 6.6, and the Phase 1 plan).

Two constraints shaped the design. First, back-compatibility: the slice-1 call
sites pass `{ scale }` and the functional wall-drawing end-to-end spec depends on
the default-viewport pointer-to-world mapping being byte-identical. Second,
testability (the same constraint ADR-0021 records): every coordinate transform,
grid computation, and ruler computation must be a pure function unit-tested in
plain Node, leaving only browser-only camera input in the glue, which jsdom
cannot exercise.

## Decision

### Projection extends from scale-only to `{ scale, offset? }`

`Viewport` grows an optional `offset: ScreenPoint`, a screen-pixel translation of
the world origin. An absent offset means the world origin maps to the screen
origin (no pan), which preserves every slice-1 call site and the e2e mapping. A
private `offsetOf(viewport)` supplies the `{ x: 0, y: 0 }` origin default, so the
transforms read a concrete offset without branching:

- `worldToScreen(point, viewport) = point * scale + offset`
- `screenToWorld(screen, viewport) = (screen - offset) / scale` (the inverse)

`ScreenPoint` and `ViewportSize` are the shared screen-space types, declared in
`viewport.ts` and imported by `fit.ts`, `grid.ts`, `ruler.ts`, and
`draw-plan.ts`.

### Zoom is a fixed-point solve about the cursor

`zoomAtCursor(viewport, cursor, factor)` re-derives the offset so the world point
currently under the cursor stays under the cursor after the scale changes. It
reads `worldUnder = screenToWorld(cursor, viewport)` from the OLD (pre-clamp)
viewport, clamps the new scale, then solves `offset' = cursor - worldUnder *
scale'`. Scale is bounded to `[MIN_PLAN_SCALE, MAX_PLAN_SCALE]` by `clampScale`
(roughly 1 m spans 2 px at the floor, 1 mm spans 4 px at the ceiling).

Wheel input maps to a continuous, non-stepped multiplier via `wheelZoomFactor`,
an exponential `exp(-deltaY * ZOOM_WHEEL_SENSITIVITY)`. The exponential keeps the
factor symmetric in log-space (a scroll up and an equal scroll down compose back
to identity) and direction-correct (negative `deltaY` zooms in). Pan is `panBy`,
which adds a screen delta to the offset and leaves the scale untouched.

### A shared 1-D axis primitive underlies the grid and the rulers

Rather than duplicate the screen-to-world stepping logic in both `grid.ts` and
`ruler.ts`, `viewport.ts` exposes a 1-D affine primitive:

- `axisProjection(viewport, orientation)` reduces a viewport to `{ scale,
translate }` for one axis (horizontal uses the x offset, vertical the y).
- `axisSamples(projection, lengthPx, spacingMm)` steps world multiples of
  `spacingMm` across the visible `[0, lengthPx]` screen range, projecting each to
  its screen pixel. It documents a positive-`spacingMm` precondition (a
  non-positive step would never advance the loop).

Both the grid and the rulers are thin maps over this primitive, which keeps the
stepping DRY (`pnpm dup` stays quiet) and gives a single tested home for the
arithmetic.

### Adaptive grid: 1-2-5 nice-number spacing (`grid.ts`)

`gridSpacingMm(scale)` returns the smallest 1-2-5 nice number whose on-screen
size (`spacing * scale`) is at least `GRID_MIN_LINE_SPACING_PX`. The plan's
nested-ternary blueprint did not survive lint (`no-nested-ternary`,
`no-magic-numbers`); it ships as a `NICE_MULTIPLIERS.find(...)` selection over
`[1, 2, 5]` with named `DECADE_BASE` (10) and `HALF_DECADE` (5) constants and a
`?? DECADE_BASE` rollover into the next decade. The behavior is identical to the
blueprint.

`visibleGridLines(viewport, size)` returns the world-aligned vertical and
horizontal lines crossing the canvas with their screen positions, at that
adaptive spacing. Note the labeling convention: a `'vertical'` grid line holds a
constant world x, so it is sampled along the horizontal axis (and vice versa); a
single `gridLinesAlongAxis(viewport, orientation, span)` helper (extracted during
BLUE, using a `span` object to stay within `max-params`) removes the per-axis
duplication.

### Rulers: raw-millimetre labels for now (`ruler.ts`)

`rulerTicks(viewport, lengthPx, orientation)` derives its spacing from
`gridSpacingMm` but labels only every Nth grid line, where N is the smallest
integer that spreads adjacent labels at least `RULER_MIN_LABEL_GAP_PX` (60) apart
(`labelEvery = max(1, ceil(gap / (gridSpacing * scale)))`). Keeping the label
spacing an integer multiple of the grid spacing leaves the ticks grid-aligned
while preventing the labels from crowding at default zoom (labeling every grid
tick overlapped, since a 200 mm tick is only 16 px at the default scale). Each
tick is labeled with the raw rounded millimetre value (for example `"1000"`).
Human-readable, unit-aware labels (`1 m`, `3' 4"`) need the formatters from the
units slice and are deferred there, mirroring the slice-1 deferral of formatted
area labels.

### Fit-to-content: pure bounds plus a centering solve (`fit.ts`)

`contentBounds(points)` returns the axis-aligned bounds of a point set (or
`null` when empty). `computeFitViewport(bounds, size, paddingPx?)` fits the
tighter of the two axes into the padded canvas, clamps the scale, and centers the
content (it always materializes a concrete `offset`, so the no-pan sentinel never
applies to a fit viewport). A degenerate (single-point) bounds falls back to the
tightest zoom on the degenerate axis so the other axis governs. Fit-to-content is
wired to the `f` key; fit-to-selection is a one-line caller change deferred to
slice 5 (selection lands fully there).

### Drawing extends the ADR-0021 Canvas seam by five members

`drawGrid` and `drawRulers` draw through the same narrow `PlanDrawingContext`
seam ADR-0021 established. Rulers need text and filled bands, so the interface
grew by five members: `fillText`, `fillRect`, `font`, `textAlign`,
`textBaseline`. `drawPlan` orchestrates the paint order behind optional
`grid`/`rulers` flags (absent = off, so the slice-1 draw tests stay green): clear,
then grid (beneath), then room fills, then wall strokes, then the live preview,
then rulers (above everything). A `drawRulerTicks(ctx, viewport, axis)` helper
(extracted during BLUE) sets the shared tick/text styles once and draws both
axes without resetting per tick.

### The canvas is the only grid (static CSS backdrop removed)

`editor/shell/editor-shell.css` previously painted a graph-paper grid on
`.plan-view` with stacked `background-image` linear-gradients locked to the
default 0.08 px/mm scale. That static backdrop could not move with the camera, so
once the canvas drew its own pan/zoom-aware grid the two would desync on any pan
or zoom. The CSS grid was removed (leaving only the white `background-color`), so
the canvas is the single source of the grid. This is the one deliberate exception
to the editor/plan-only scope of the slice, kept to the `.plan-view` rule.

### Glue split into render wiring plus camera input

The `PlanView` glue exceeded `max-lines`, so the camera input (pan, zoom, fit)
moved to `editor/plan/use-viewport-controls.ts`, leaving `plan-view.tsx` as
tool/render wiring. The hook owns the browser-only pieces: a native non-passive
wheel listener (React's `onWheel` is passive, so `preventDefault` cannot stop
page scroll), spacebar-held tracking that ignores editable targets, a pan gesture
on middle-button or spacebar-drag-primary, and the `f` fit-to-content key. Both
files stay coverage-excluded glue, validated by the wall-drawing e2e (the default
viewport keeps `scale = DEFAULT_PLAN_SCALE` and a zero offset, so the e2e mapping
is unchanged).

## Consequences

- The projection is now a single affine map `point * scale + offset` with a clean
  inverse, and zoom-about-cursor is a closed-form offset solve rather than an
  iterative or stateful camera. Pan and zoom compose as pure `Viewport ->
Viewport` functions, so the glue holds only React state and the listeners
  jsdom cannot run.
- The optional `offset` and the optional `grid`/`rulers` flags are strictly
  additive: every slice-1 test, call site, and the functional e2e compile and
  pass unchanged. The intentional visible changes are the rendered grid/rulers
  and the removal of the static CSS grid; the darwin visual-regression baseline
  was refreshed to match (a generated artifact; CI skips visual regression on
  linux where no baseline exists). The baseline will need another refresh once a
  later slice changes the home view.
- `axisProjection` / `axisSamples` is the reusable 1-D stepping primitive for any
  future screen-aligned-at-world-multiples rendering (snap guides, dimension
  ticks): derive an axis projection, sample multiples, map to the feature's
  shape. The grid and rulers are the first two consumers.
- `gridSpacingMm` is the single source of grid spacing, consumed by both
  `visibleGridLines` and `rulerTicks`, so grid lines and ruler ticks can never
  drift apart.
- The `PlanDrawingContext` seam grew by five members for text and filled bands,
  confirming ADR-0021's "extend the interface rather than reach for the full DOM
  type" guidance scales to text rendering (rulers) as it did to the room fill and
  the rubber-band marker.
- Ruler labels are raw millimetres until the units slice provides the
  formatters. The unit-aware label is a localized change inside `rulerTicks`; the
  tick geometry is already correct.

## Alternatives considered

- **A full 2-D affine matrix on `Viewport`.** A `{ a, b, c, d, e, f }` matrix
  would generalize to rotation/shear the plan does not need. The
  `scale` + `offset` pair is the minimal representation for axis-aligned pan and
  zoom and keeps the transforms readable; a matrix can replace it behind the same
  `worldToScreen` signature if rotation is ever wanted.
- **Stepped (discrete) zoom levels.** Snapping to fixed zoom stops is simpler but
  the spec asks for smooth zoom; the exponential `wheelZoomFactor` gives a
  continuous, log-symmetric multiplier instead.
- **Duplicating the screen-to-world stepping in `grid.ts` and `ruler.ts`.**
  Independent loops would drift and trip `pnpm dup`. The shared `axisSamples`
  primitive is the single tested home for the arithmetic.
- **Unit-aware ruler labels now.** Formatting millimetres into metres / feet and
  inches needs the units slice; shipping raw-millimetre labels keeps slice 3 free
  of a cross-slice dependency and the formatting change stays local to
  `rulerTicks`.

## References

- Design specification, sections 6.2 (Canvas pan/zoom and the DOM overlay) and
  6.6 (smooth non-stepped pan and zoom, infinite canvas, snap-to-fit /
  snap-to-selection).
- Implementation plan: `docs/plans/2026-06-04-plan-viewport-pan-zoom.md` (its
  Status section records the GREEN/BLUE deviations summarized here).
- ADR-0021 (the parent record for the plan path; this ADR extends its viewport
  projection and its `PlanDrawingContext` Canvas seam).
- ADR-0018 (scene-graph derivation; the wall and room nodes whose endpoints and
  polygons feed `contentBounds` for fit-to-content).
- ADR-0026 (room derivation; the `graph.rooms` polygons painted beneath the grid
  in `drawPlan`'s paint order).
- ADR-0032 (selection and the hit test; it reuses this viewport's scale to
  convert the pixel hit/marquee tolerance to world units and `worldToScreen` to
  draw the marquee, and fits the deferred fit-to-selection caller onto
  `computeFitViewport`).
- ADR-0033 (drawing snapping; it reuses this viewport's scale to convert the
  pixel snap tolerance to world units and `worldToScreen` to draw the snap
  indicator).
