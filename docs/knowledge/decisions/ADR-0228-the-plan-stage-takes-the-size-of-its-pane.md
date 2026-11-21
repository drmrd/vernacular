---
slug: decisions/ADR-0228-the-plan-stage-takes-the-size-of-its-pane
title: 'ADR-0228: The plan stage takes the size of its pane'
type: decision
tags: [plan, viewport, canvas, layout, resize-observer, overflow, css]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
    decisions/ADR-0186-performance-gated-on-counts-and-reported-as-times,
  ]
sourceFiles:
  [
    editor/plan/plan-stage-size.ts,
    editor/plan/use-plan-stage-size.ts,
    editor/plan/viewport-context.ts,
    editor/plan/plan-scene.ts,
    editor/plan/plan-view.tsx,
    editor/plan/plan-overlay.css,
    editor/shell/zoom-control.tsx,
    editor/shell/editor-shell.css,
    editor/viewport/view-mode-viewport.css,
    e2e/tests/journeys/plan-stage-fits-pane.spec.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0228: The plan stage takes the size of its pane

## Status

Accepted on 2026-11-21 for issue #646. It retires the fixed plan canvas that ADR-0021 started with
and ADR-0031 carried forward.

## Context

The plan is a plain 2D canvas. Its size was two constants, `PLAN_WIDTH` (800) and `PLAN_HEIGHT`
(600), left over from the first prototype. Every consumer read them: the draw (clear, grid
extents, rulers), the F key, the header zoom control's pivot and its Fit to content button, and the
opening fit in the shell providers.

On a real window that left the plan as an 800 by 600 island. A wide window left empty space beside
it, and a short window pushed the mode toolbar and the floors navigation out of view behind a
scrollbar. In split view the plan pane was an `overflow: auto` box, so it scrolled sideways to
reach the right half of the drawing.

The owner decided that the stage fits the pane ("Stage fits the pane"). That raises two questions the
constants had hidden. Which corner of the drawing stays put when the pane changes size? And who
owns the size, given that three separate places need it?

## Decision

The plan stage takes the size of its pane, measured with a `ResizeObserver`. A resize keeps the
viewport's scale and the world point under the stage's top-left corner.

### One measured stage size

The viewport context holds `stageSize` beside the viewport, and a `reportStageSize` function. The
canvas attributes, the draw (through a required `size` on `PlanScene`), the F key, and the header
zoom control all read that one value. No consumer keeps its own copy.

`PLAN_WIDTH` and `PLAN_HEIGHT` stay exported as the nominal size. It is the value before the first
measurement, the value in jsdom where no observer fires, and the size of the performance reference
scene, so the counts gated by ADR-0186 do not move. When the provider opens with initial content,
that content's size is the starting value instead.

### Measure the stage, never the canvas

The stage element is `100%` by `100%` and the observer watches it. The canvas is absolutely
positioned at the stage's top-left, in the stylesheet, so its own size cannot hold the stage open.
Measuring the canvas would feed back: a canvas sized by the last measurement would stop the stage
from ever shrinking. The backing store is CSS pixels, one to one, each dimension floored to a whole
pixel. The redraw for a size change runs in the layout phase of the commit that changes the size,
because setting `canvas.width` clears the canvas and a later redraw would paint one blank frame.

### A resize never writes the viewport

Scale (pixels per millimetre) and offset are left alone, so the world point at the stage's top-left
stays where it was. The top-left is the corner that does not move on screen. The window edge, the
inspector, and the splitter all move the right and bottom edges. That way the drawing does not slide while
the user drags a splitter, the rulers keep their origin, no `setViewport` runs per observer tick
(nothing competes with a live pan), and every canvas-relative coordinate stays valid.

### The opening fit is spent once

The first measurable report is the one exception. If the viewport is still the object the provider
opened with and the document opened with content, the opening fit is recomputed against the measured
size, so a saved plan opens framed in the real pane. The provider spends this once, on its first
measurable report, not once per `PlanView` mount. A report equal to the nominal size still spends
it. `PlanView` unmounts in 3D mode and remounts on the way back, and a second fit would throw away
the user's pan and zoom.

A measurement with a zero, negative, or non-finite dimension is ignored. The last size is kept and
the viewport is untouched. In 3D mode the stage is unmounted, so the provider keeps the last size
and the header zoom and fit controls keep working.

### Minimum stage

The stage is never smaller than 160 by 120. That is above twice the 24 px fit padding plus the 20 px
ruler, so a fit always has room to land inside the clamp range. In a pane smaller than the minimum
the stage keeps the minimum and the plan area clips its right and bottom. The minimum lives in one
place, the two constants in `plan-stage-size.ts`. It is set inline on the stage from those
constants, and `resolveStageSize` clamps with the same ones, so the CSS box and the backing store
cannot disagree.

### Fill and clip, never scroll

The stage and `.editor-shell__plan-area` fill their pane and use `overflow: clip`. The split panes
drop `overflow: auto`. `clip` is not a scroll container, so a script `scrollIntoView` or a focused
off-stage proxy cannot move the stage, and the mode toolbar stays in view because the body never
overflows. This is the first rule in `editor/` to use `overflow: clip`. Safari 14 and 15, which the build still
targets, drop the declaration and fall back to `visible`, and `.ds-app-frame__main` still clips there.

Two side effects of clipping are handled in the stylesheet. An outline sits outside the border box
and the clip would cut it, so the canvas outline is drawn inward with `outline-offset: -1px`. The
canvas position rule is a static layout rule, so it sits in `plan-overlay.css` where a CSS pin test
could see it, and only the dynamic values stay inline in `plan-view.tsx`, which is excluded from
coverage.

### Out of scope

- A HiDPI backing store. The backing store stays one to one with CSS pixels.
- Auto-fit on resize. A resize keeps the view; only the opening fit measures.
- A saved viewport.

## Consequences

- Any new consumer of the stage size reads `stageSize` from the viewport context. A new constant
  that duplicates it is a defect.
- The nominal size is a fallback, not the stage size. Code and tests that assumed 800 by 600
  arithmetic (the opening-edit e2e specs used an 800-based backing ratio) now use the measured
  size or 0.08 px per millimetre directly.
- Plan clicks in split view must land inside the plan pane. The pane no longer scrolls, so a click
  at x 440 that worked before can fall outside it.
- The darwin home screenshots differ slightly, because the compass and scale bar now show in the
  stage corner, but they stay within the comparison tolerance. CI's visual jobs are unaffected and
  no baseline refresh is needed. Story and scene baselines do not move; the 3D pane keeps its size.
- A future minimap, HiDPI backing store, or saved viewport can use the same value and the
  top-left anchor rule.
- At a pane below 160 by 120 the compass, the scale bar, and a focus ring on the stage edge are
  clipped out of view.

## Alternatives considered

Anchor the viewport to the stage centre on resize. It keeps the middle of the drawing in place, but
it rewrites the offset on every observer tick and slides the drawing under the pointer while the
splitter drags. The centre is also not a corner that stays fixed on screen.

Refit the content on every resize. It would discard the user's pan and zoom each time the window
changes, which makes a splitter drag unusable.

Keep the fixed 800 by 600 canvas and scale it with CSS. A stretched canvas blurs, changes the ratio
between pointer and canvas coordinates, and still leaves empty space or a scrollbar.

Let the panes scroll, keeping `overflow: auto`. It is what produced the sideways scroll in split
view and the hidden mode toolbar in short windows. A scroll container can also be moved by a script
or by focus, which breaks the one-to-one canvas coordinates.

Use `overflow: hidden` for the clip. It still clips, but it is a scroll container that a script can
scroll, so it cannot give the guarantee this decision needs. A `hidden` fallback before `clip` was
considered for Safari 14 and 15 and left out, because `.ds-app-frame__main` already clips there.

Measure the canvas, or size the stage from the canvas. This creates the feedback loop described
above.

## References

- Issue #646, ADR-0021 (2D plan rendering and interaction), ADR-0031 (plan viewport projection),
  ADR-0070 (two-dimensional pan), ADR-0186 (performance gated on counts).
- Issue #690 (the canvas follows its container and the device pixel ratio). This decision delivers
  the container half early. The device-pixel-ratio half stays with #690.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.8 and stage 7.

## Notes

2026-11-21: wording corrected after review. The baseline claim, the Safari floor, and the pin test
claim above now match the code. No pin test covers the canvas position rule yet.
