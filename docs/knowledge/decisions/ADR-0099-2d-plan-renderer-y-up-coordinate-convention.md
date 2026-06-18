---
slug: decisions/ADR-0099-2d-plan-renderer-y-up-coordinate-convention
title: 'ADR-0099: 2D plan renderer adopts the format y-up coordinate convention'
type: decision
tags:
  [
    architecture,
    editor,
    plan,
    viewport,
    projection,
    coordinate-convention,
    y-up,
    rendering,
    fit,
    rulers,
    grid,
    export,
  ]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0068-pdf-plan-export,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    editor/plan/viewport.ts,
    editor/plan/fit.ts,
    editor/plan/grid.ts,
    editor/plan/ruler.ts,
    editor/plan/draw-plan.ts,
    core/export/svg/svg-view.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0099: 2D plan renderer adopts the format y-up coordinate convention

## Status

Accepted, landed. The interactive 2D plan renderer now honors the y-up
coordinate convention the file format and the schema already define. World y
increases upward, and the projection negates y so a point that sits higher in the
document draws higher on the canvas. The viewport projection, its inverse, the
vertical axis used by the grid and rulers, and the fit-to-content centering all
move together so the canvas reads the same direction the spec and every other
coordinate consumer already read.

## Context

The format specification and the JSON schema both define a plan `Point` with y
increasing upward. That is the documented mathematical convention, and the export
path already follows it: `core/export/svg/svg-view.ts` maps a world point to SVG
space with `y: max.y - point.y + margin`, a deliberate y-up to y-down flip,
because SVG (like the HTML canvas) puts y increasing downward on the page. The PDF
export builds on that same SVG renderer (ADR-0068), so the document and image
exports were already y-up correct.

The interactive canvas was the exception. The viewport projection landed in
ADR-0021 as `worldToScreen = point * scale`, and ADR-0031 grew it to
`point * scale + offset` while keeping the same straight (unflipped) mapping for
both axes. Because `screenToWorld` was the exact inverse of that unflipped map,
anything the user drew interactively round-tripped cleanly and looked right: a
click became a world point and that world point drew back under the cursor, so the
draw-and-hit loop was self-consistent on its own terms. The sign error stayed
invisible as long as the only geometry on screen came from the canvas itself.

It surfaced the moment a document built to the spec arrived from somewhere other
than the canvas. An imported or generated plan that placed a feature at high
positive y (the spec's "north") rendered in the lower half of the canvas rather
than the upper half, so the whole plan came out vertically mirrored against its
own coordinate definition. The three-floor sample bundle authored to the
documented convention is the case that exposed it. Left unfixed, this was also a
latent trap for the 3D view, for any future non-interactive coordinate consumer,
and for round-tripping a plan through export and back.

Two directions were open. Honor the spec by negating y in the renderer and making
every screen-y consumer agree (the choice taken here), or rewrite the spec, the
schema, and every reference to declare y-down. The second is less churn inside the
renderer, but it abandons the stated mathematical convention, contradicts the
export path, and would require a specification change with its own ADR. It was
rejected.

## Decision

Bring the interactive renderer into conformance with the already-correct spec. The
change is one coherent set of sign flips through `editor/plan/`, all anchored on
the single fact that world y increases upward while screen y increases downward.

- `worldToScreen` negates the vertical term:
  `screen.y = -point.y * scale + offset.y`. The x term is untouched. A higher
  world y now draws at a smaller screen y, that is, higher on the canvas.
- `screenToWorld` stays the exact inverse of the new map:
  `world.y = (offset.y - screen.y) / scale`. This is the load-bearing constraint.
  Because the inverse tracks the flip exactly, every interactive draw and hit
  round-trip is unchanged: a click maps to a world point and that point maps back
  to the same pixel, so the wall-draw and selection paths behave precisely as
  before.
- `axisProjection` negates the scale for the vertical axis and leaves the
  horizontal axis positive, so the grid lines and ruler ticks follow the inverted
  y. The shared `axisSamples` stepping primitive (ADR-0031) needed no change: it
  already brackets the visible world range with `Math.min`/`Math.max` and steps a
  positive world spacing, so it tolerates a negative axis scale on its own.
- `computeFitViewport` flips its y-centering term from
  `size.height / 2 - centerY * scale` to `+ centerY * scale`, which is the
  centering solve for the new mapping. Fit-to-content keeps the world center on
  the canvas center, and now the top of the content (max world y) lands at the top
  of the canvas rather than the bottom.

Every plan consumer projects through this one pair of functions: the wall, room,
dimension, opening, stair, furniture, ghost, surface-paint, and underlay draw
modules, the dimension chip, the overlay, and every interaction hook all funnel
through `worldToScreen` and `screenToWorld`. There is no parallel screen
projection anywhere in the editor, bridge, engine, or app layers, so flipping the
one choke point flips the whole canvas. The SVG and PDF export path keeps its own
correct y-flip and was not touched.

No specification or schema text changed. The spec was already right; only the
interactive renderer was out of step, so this work moved the implementation to the
spec rather than the other way around. That keeps the format specification
authoritative and avoids a spec-change ADR.

## Consequences

- A spec-conformant plan now renders upright on the interactive canvas. An
  imported or generated document reads the same orientation the schema declares,
  the same orientation the SVG and PDF exports already produced, so the canvas and
  the exports finally agree.
- Interactive editing is unaffected. Because `screenToWorld` remains the exact
  inverse of `worldToScreen`, drawing, hit testing, pan, and zoom-about-cursor all
  produce the same results they did before. The zoom and pan helpers solve their
  offset from the consistent inverse, so they needed no sign change.
- The grid, the rulers, and fit-to-content track the flip through the same axis
  projection and centering solve, so there is no second place the y direction can
  drift out of agreement with the projection.
- This supersedes the y-down rendering note in ADR-0031, which recorded the
  projection as `point * scale + offset` with no vertical flip. The pan-offset and
  zoom model that ADR-0031 introduced is unchanged; only the sign of the vertical
  term is corrected here.
- The visible plan flips vertically against its old (mirrored) rendering, which is
  the intended correction. The home-plan visual-regression baseline moves to match.
- One coordinate convention now holds across the renderer, the hit test, fit, the
  rulers, and the contract with import, the 3D view, and the export path, so a
  later consumer can trust that y points the same way everywhere it reads a plan.

## References

- Format specification, "Normative invariants" (the `Point` y-increasing-upward
  convention) and the schema `Point` description, both authoritative and unchanged
  by this work.
- ADR-0021 (the original plan renderer and the `worldToScreen` / `screenToWorld`
  projection seam this corrects).
- ADR-0031 (the pan-offset and zoom-about-cursor viewport model; its y-down
  rendering note is superseded here, the rest of its projection model stands).
- ADR-0037 (the image underlay, which paints through this same projection and so
  follows the flip without its own change).
- ADR-0068 (PDF export, built on the SVG renderer that already applies the y-up to
  y-down flip; the canvas now matches it).
