---
slug: decisions/ADR-0043-dom-overlay-and-accessibility
title: 'ADR-0043: DOM overlay and editor accessibility'
type: decision
tags:
  [
    architecture,
    phase-1,
    accessibility,
    aria,
    keyboard,
    focus-management,
    live-region,
    dom-overlay,
    canvas,
    rendering,
    units,
    unit-display,
    editor,
    selection,
  ]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0041-phase-1-completion-boundary-finishing-slices,
  ]
sourceFiles:
  [
    docs/specs/2026-06-09-dom-overlay-and-accessibility.md,
    editor/plan/plan-view.tsx,
    editor/plan/viewport.ts,
    editor/plan/ruler.ts,
    editor/shell/editor-shell.tsx,
    core/commands/handlers/project-commands.ts,
    core/units/preferences.ts,
  ]
status: current
updated: 2026-06-09
---

# ADR-0043: DOM overlay and editor accessibility

## Status

Accepted (landed 2026-06-09 on `feat/dom-overlay-accessibility`). This is the
architectural record for the second of the two Phase-1 finishing slices named in
ADR-0041 (the first being underlay asset persistence, ADR-0042). It is a sibling
of ADR-0042 on an independent branch; the two do not depend on each other.

## Context

The 2D plan editor renders everything on a single Canvas (ADR-0021): walls,
rooms, grid, rulers, the underlay, openings, and all interactive chrome
(selection rings, dimension chips, snap indicators, room labels). Canvas pixels
carry no semantics, so a keyboard-only or screen-reader user cannot reach a
selection or read a measurement, and the ruler still prints raw millimetres
rather than the project's units.

The design specification names a React DOM overlay as a Phase-1 deliverable
("Pan/zoom Canvas + DOM overlay", section 10) and ties the editor's accessibility
to it: the overlay carries the interactive UI (section 6.2) with ARIA labels,
managed focus, and keyboard navigation (section 6.13). The twelve build slices
deferred the overlay at every turn and painted on the Canvas instead (ADR-0041),
so the named deliverable and the editor-accessibility acceptance are absent.
ADR-0041 added this finishing slice to close them, and pulled in unit-aware labels
and a unit-display toggle because the formatters already exist and the audience
thinks in feet and inches.

Two implementation techniques were open and are settled here, the second on a
frontend-design review:

1. Whether the overlay subsumes the Canvas chrome (moves all of it into the DOM)
   or mirrors it (the Canvas keeps rendering; the DOM adds an accessible layer).
2. How overlay children track the camera: a single CSS container transform with
   counter-scaled children, or per-element screen-space positioning.

## Decision

### A DOM overlay as additive accessible chrome, hybrid split

The Canvas stays the renderer. A React `PlanOverlay` layer is added as a sibling
of the plan `<canvas>` inside a positioned plan-stage wrapper, sharing the
viewport state `PlanView` already owns. The split is hybrid: the Canvas keeps
painting all geometry (walls, rooms, grid, rulers, underlay, openings, selection
rings, snap indicator, live preview, dimension lines and ticks), and the DOM
overlay adds the text chrome and the accessibility surface (dimension measurement
chips, hover tooltips, focusable ARIA proxies, a live region). Only the numeric
dimension chip moves off the Canvas; the dimension line stays Canvas-drawn. The
overlay is not a reimplementation of the geometric rendering, so the empty-editor
visual-regression baseline is unchanged.

### Screen-space positioning, not a counter-scaled transform

Overlay children are positioned in screen space: each child is placed at
`worldToScreen(anchor, viewport)` (the existing tested projection, ADR-0031) with
`position: absolute` and a constant font size. A single CSS container transform
with `scale(1/s)` counter-scaling on every text child was rejected on
frontend-design review because counter-scaling fights the transform, blurs text
at fractional scales, and re-rasterizes labels each zoom frame. Screen-space
placement keeps labels pixel-crisp at every zoom. The only new pure piece is a
per-entity world-anchor function; the projection is reused.

### Proxies are keyboard-and-assistive-technology only

For each selectable entity the overlay renders a focusable element at the entity's
screen anchor, with a `role`, a unit-aware `aria-label`, `aria-selected` mirroring
the bridge-owned selection (ADR-0020), and a visible `:focus-visible` indicator
distinct from the Canvas-painted selection ring (keyboard focus and selection are
different states). The overlay container is `pointer-events: none` and the proxies
do not opt back in, so pointer selection continues to flow through the existing
Canvas hit-test and the overlay never intercepts a drawing, pan, marquee, drag,
placement, or calibration gesture. Keyboard navigation is a roving `tabindex` in
scene-graph order (arrow keys move focus, Enter or Space selects, Shift extends,
Escape clears), composed with the existing `use-selection-keyboard` clipboard and
delete bindings rather than replacing them. A single polite `aria-live` region
announces discrete selection changes and the resolved snap target on gesture
commit (not per pointer move), so continuous snapping does not flood a screen
reader.

### Unit-aware labels and an undoable unit-display toggle

A new undoable `project/set-units` command (`core`) flips the existing persisted
`meta.units` field, mirroring `renameProject` so inverse-capture restores the
prior system on undo. No schema change is needed; `meta.units` already exists and
is already read by every inspector, so display formats on read while storage stays
in millimetres (ADR-0027). A segmented unit toggle (a `radiogroup` of metric and
imperial) in the editor-shell toolbar dispatches the command and reflects the
value. `rulerTicks` formats its labels through `lengthFormatOptions` and
`formatLength` instead of printing the raw millimetre value, and the dimension
chips and proxy labels use the same formatter, all driven by the one `meta.units`.

## Consequences

- The named Phase-1 deliverable (a DOM overlay) and the editor-accessibility
  acceptance (ARIA, focus, keyboard navigation) are delivered: every selectable
  entity is reachable and labeled by keyboard and assistive technology, and axe
  reports zero violations with the overlay present.
- The Canvas remains the single geometric renderer, so the change is additive and
  low-risk; the existing visual-regression baseline and the wall-drawing
  end-to-end flow stay green, and no pointer interaction changes.
- Measurement text reads in the project's units and is toggleable, closing the
  raw-millimetre ruler deferral from the pan, zoom, grid, and rulers slice (slice 3)
  and serving an audience that thinks in feet and inches. The toggle is an ordinary
  undoable project edit, so it persists
  and participates in undo and autosave.
- A small amount of geometry is now described twice (Canvas paints it; the overlay
  computes screen anchors for proxies and chips), accepted as the cost of an
  accessible parallel layer. Label-collision avoidance is deferred; chips hide
  below a legibility threshold as a light touch.

## Alternatives considered

- **Subsume the Canvas chrome into the DOM.** Rejected for this slice: moving
  rings, indicators, and lines into DOM or SVG is a larger change that must
  re-establish visual fidelity and shifts the visual baseline, for no Phase-1
  acceptance gain over an additive accessible layer. The hybrid split delivers the
  deliverable at lower risk.
- **A single counter-scaled container transform.** Rejected on frontend-design
  review: it blurs and re-rasterizes text at fractional zoom. Screen-space
  positioning keeps labels crisp.
- **Proxies that handle pointer selection.** Rejected: routing selection through
  DOM proxies would duplicate the working Canvas hit-test and risk swallowing pan
  and marquee gestures that begin on pointer-down anywhere over the plan. Keeping
  pointer selection on the Canvas and the proxies keyboard-and-AT-only is simpler
  and conflict-free; proxies can opt into pointer events later if a need arises.
- **A view-only units preference outside undo.** Rejected: `meta.units` is already
  persisted project data read everywhere, so a separate display preference would
  create a second source of truth; an undoable command on the existing field is
  simpler and consistent with `renameProject`.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 10
  (the "Pan/zoom Canvas + DOM overlay" deliverable and the editor-accessibility
  acceptance), section 6.2 (the DOM overlay for interactive UI), section 6.13
  (accessibility).
- Slice spec `docs/specs/2026-06-09-dom-overlay-and-accessibility.md` and the
  implementation plan
  `docs/plans/2026-06-09-dom-overlay-and-accessibility-implementation.md`.
- ADR-0021 (the Canvas plan-drawing seam this overlay layers over), ADR-0031 (the
  viewport projection the overlay reuses), ADR-0020 (the bridge-owned selection the
  proxies drive), ADR-0019 (the dispatch boundary the units toggle uses), ADR-0027
  (millimetre storage with unit-aware display), ADR-0037 (image underlay), ADR-0041
  (the finishing-slice boundary this slice is the second half of), and ADR-0042
  (underlay asset persistence, the sibling finishing slice).
