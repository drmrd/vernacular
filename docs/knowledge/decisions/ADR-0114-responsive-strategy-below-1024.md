---
slug: decisions/ADR-0114-responsive-strategy-below-1024
title: 'ADR-0114: Responsive strategy below 1024px'
type: decision
tags:
  [design-system, layout, responsive, breakpoint, accessibility, a11y, wcag, reflow, chrome, css]
related:
  [
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0112-minimum-interactive-target-sizes,
    decisions/ADR-0113-component-local-contrast-guards,
  ]
sourceFiles:
  [
    editor/shell/editor-shell.css,
    editor/design-system/app-frame.tsx,
    editor/design-system/app-frame.css,
    editor/design-system/use-breakpoint.ts,
  ]
status: current
updated: 2026-06-20
---

# ADR-0114: Responsive strategy below 1024px

## Status

Accepted, landed. The editor now has a defined contract at every width below the 1024px wide
breakpoint. The header wraps instead of overflowing, the status bar stays pinned inside the frame at
medium and narrow, the tool rail opens through a disclosure overlay instead of vanishing, and narrow
gets an explicit unsupported-width notice. The `useBreakpoint` and `data-breakpoint` machinery that
ADR-0096 left in place now drives all four behaviors. This is the layout sibling to the target-size
pass in ADR-0112 and the contrast pass in ADR-0113.

## Context

The frame already classified its own width. `useBreakpoint` observes the `.ds-app-frame` element
with a `ResizeObserver`, runs the width through `breakpointForWidth` (wide at 1024 and up, medium
from 640 to 1023, narrow below 640), and `AppFrame` stamps the result as `data-breakpoint` on the
frame root. The CSS keys every responsive rule off that attribute. The machinery was there, but the
behavior below wide was never finished, so each narrower width broke in its own way.

The header was a single non-wrapping flex row holding the brand, the project menu, the breadcrumb,
the actions cluster (grid, dimensions, zoom, undo, redo, theme, Export, Save), and a save-status
span with a `min-width` floor. Below about 1024px that row's intrinsic minimum width exceeded the
viewport, so Export and Save clipped off the right edge and the header forced the grid track wider
than the viewport, which scrolled the whole page sideways. The frame is `overflow: hidden` with
`max-height: 100dvh`, but that only clips the frame's own box; the grid track itself was sized to the
header's min-content width, so the box grew.

The status bar was clipped at both narrower widths for a separate reason. The `statusbar` grid area
was present in the wide template but dropped from the medium and narrow `grid-template-areas`. The
footer still asked for `grid-area: statusbar`, so with no such area it auto-placed into an implicit
row appended past the explicit grid. That implicit row sat below the `100dvh` box and `overflow:
hidden` clipped it, taking the floor switcher, units, snap, and coordinate readout with it.

The tool rail was simply `display: none` at medium and narrow. Drawing tools, the library launcher,
and the underlay menu disappeared with no other way to reach them. Narrow had no signal at all that
the layout was outside its supported range, so it failed silently.

## Decision

Treat every width below wide as a defined state the frame is responsible for, and reuse the existing
breakpoint attribute to express it. The frame stays one `100dvh` box with the pane bodies owning
internal scroll, so no width scrolls the page sideways. The strategy is to keep medium working: the
editor stays usable on small laptops, split-screen windows, and tablets, while narrow gets an
explicit defined state with the tools still reachable.

### Let the header wrap

`.editor-shell__toolbar` and `.editor-shell__toolbar-actions` gain `flex-wrap: wrap`. When the row no
longer fits, it reflows to a second line and its intrinsic minimum width collapses to the widest
single item, which removes the horizontal overflow that was pushing the frame past the viewport. The
actions cluster keeps `margin-left: auto`, so at wide it still right-aligns and the wide render is
unchanged. This is a CSS-only change with no markup edit.

### Pin the status bar inside the frame at medium and narrow

Both responsive templates get the `statusbar` area restored and an explicit `grid-template-rows` so
the row count matches the area count. `main` stays the single flexible `minmax(0, 1fr)` row and the
status bar is a pinned `auto` row. At narrow the inspector is also an `auto` row rather than a second
flexible one, because the rows must sum to `100dvh` and the inspector's pane body already owns its
internal scroll, so an `auto` inspector cannot push the status bar out of the frame.

### Open the rail through a disclosure instead of hiding it

`AppFrame` gains a small amount of view state. A `RailDisclosureToggle` renders a Tools button with
`aria-expanded` and `aria-controls`, and toggling it sets `data-rail-open` on the frame root. The
rail `<aside>` carries a stable id so `aria-controls` resolves. The closed-state `display: none` on
the rail stays, and a `[data-rail-open='true']` rule overrides it only when open, rendering the rail
as an absolutely positioned overlay over the canvas. The frame gains `position: relative` to anchor
that overlay. The toggle is `display: none` at wide, where the rail is always in the grid, and shown
at medium and narrow. The disclosure is local view state, not domain state, so it stays out of the
command path.

### Give narrow an explicit notice

A `NarrowNotice` element with `role="note"` is always in the DOM but `display: none` except at
narrow. It reads as a non-destructive banner ("best on a wider screen") that names the disclosure as
the way to reach the tools. It does not replace the canvas, so the user's drawing surface stays
reachable. Replacing the canvas would be more destructive than the contract needs; an explicit
defined state is enough.

### Pin the visibility contract with the literal-guard idiom

jsdom applies no stylesheets and never recomputes the breakpoint under test, so breakpoint-gated
visibility is pinned by the project's CSS literal-guard idiom: a Vitest test reads the stylesheet and
asserts the selector block carries the expected declaration. The header wrap, the restored
`statusbar` areas and row templates, the overlay rule, and the toggle and notice visibility gates are
all guarded this way. The disclosure state itself, the toggle flipping `aria-expanded`, the
`data-rail-open` attribute, and the notice element being present, is pinned with React Testing
Library, because that is DOM state jsdom can see without layout.

## Consequences

- Every width below wide now has a defined, tested state. Medium stays a working editor with the
  rail one click away; narrow reads as an explicit out-of-range state with the tools still reachable
  through the same disclosure.
- No width below 1024px scrolls the page sideways. The header wrap removes the sole horizontal
  overflow contributor, and the frame stays a single `100dvh` box with internal scroll in the pane
  bodies.
- The disclosure adds the first responsive view state to `AppFrame`. It is local `useState`, not a
  command, so it does not touch the dispatch path or the schema. The rail aside gains an id and
  `CollapsiblePane` forwards an optional `id` prop, which is the only interface change.
- The rail overlay relies on the frame being `position: relative`. That is inert at wide, where no
  grid child is absolutely positioned, so the wide layout is unchanged.
- None of the four behaviors moves the wide layout. The header already fits one row at the 1280px
  baseline width and `flex-wrap` does not reorder items that already fit, the medium and narrow rules
  never match at wide, and the toggle and notice are `display: none` at wide. The visual-regression
  baseline did not move and CI was unaffected.
- The narrow inspector is an `auto` row that leans on its pane body's internal scroll to stay
  bounded. If a content-tall inspector ever crowds the status bar at a short narrow viewport, giving
  the inspector its own disclosure at narrow is a reasonable later step. The current strategy keeps
  narrow minimal with the notice instead.

## References

- ADR-0096 (the design-system consolidation that established the shared chrome vocabulary and the
  `data-breakpoint` machinery this contract now drives).
- ADR-0112 (the sibling accessibility pass on interactive target sizes, including the resize-handle
  hit area these rules thread around).
- ADR-0113 (the sibling accessibility pass on component-local contrast, same alpha-hardening family).
- WCAG 1.4.10 Reflow, content usable without two-dimensional scrolling down to 320px CSS width.
