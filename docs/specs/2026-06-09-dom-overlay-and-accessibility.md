# Slice design: DOM overlay and accessibility

Status: approved for planning (2026-06-09)
Scope owner: the dom-overlay-and-accessibility slice (branch `feat/dom-overlay-accessibility`), slice 14 of the Phase 1 two-dimensional plan editor (the second and last of the two finishing slices)
Authoritative parent spec: `docs/specs/2026-06-01-vernacular-design.md`, section 10 (the Phase-1 deliverable "Pan/zoom Canvas + DOM overlay" and the editor-accessibility acceptance), section 6.2 (the DOM overlay for interactive UI), section 6.13 (accessibility); ADR-0021 (the Canvas plan-drawing seam), ADR-0020 (bridge-owned selection), ADR-0027 (millimetre storage with unit-aware display), ADR-0041 (the finishing-slice boundary), and ADR-0043 (this slice's record)
Base: `main` (schema v4; slices 1 to 12 plus the dependency and reframe work are landed). Slice 13 (underlay asset persistence) is an independent sibling slice on its own branch and is not a dependency of this work.

## 1. Purpose

The 2D plan editor paints every interactive element on the Canvas: selection
rings, dimension chips, snap indicators, and room labels are all rasterized
pixels with no accessible representation, and the ruler still prints raw
millimetres. The design specification names a React DOM overlay as a Phase-1
deliverable (section 10) and ties the editor's accessibility to it (sections 6.2
and 6.13): the overlay carries the interactive chrome with ARIA labels, managed
focus, and keyboard navigation, so the editor is operable by keyboard and legible
to assistive technology. The build slices deferred the overlay at every turn
(ADR-0041), so today a keyboard-only or screen-reader user cannot reach a
selection or read a measurement.

This slice adds the overlay as additive accessible chrome layered over the
unchanged Canvas, and closes the unit-aware-label deferral (slice 3) at the same
time. The behavioral contract: **every selectable entity is reachable and labeled
by keyboard and assistive technology through a DOM overlay that tracks the Canvas
as it pans and zooms, and all measurement text (ruler ticks, dimension chips,
entity labels) reads in the project's chosen units, toggleable between metric and
imperial.**

The frontend-design review settled two technique decisions recorded throughout:
text chrome is positioned in screen space (not via a counter-scaled container
transform) so it stays crisp at every zoom, and the DOM proxies are
keyboard-and-assistive-technology only (pointer selection stays on the existing
Canvas hit-test), so the overlay never intercepts a drawing, pan, or marquee
gesture.

## 2. Goals and non-goals

### Goals

- A `PlanOverlay` layer rendered as a sibling of the plan `<canvas>` inside a
  positioned plan-stage wrapper, sharing the viewport state `PlanView` already
  owns. The overlay container is `pointer-events: none` so it never blocks a
  Canvas gesture; only individual focusable proxies and overlay controls opt back
  into pointer events where they need them.
- Screen-space positioning for all overlay children: each child is placed with
  the existing tested `worldToScreen(anchor, viewport)` projection and a constant
  font size, so labels stay pixel-crisp through pan and zoom. The pure pieces are
  a per-entity world-anchor function and the screen projection it feeds; there is
  no counter-scaled container transform.
- A focusable, labeled ARIA proxy per selectable scene entity (wall, room,
  opening, dimension): an element positioned at the entity's screen anchor, with a
  `role` and a unit-aware `aria-label`, `aria-selected` mirroring the
  bridge-owned selection, and a visible `:focus-visible` indicator distinct from
  the Canvas-painted selection ring. The proxies are `pointer-events: none`;
  pointer selection continues to flow through the Canvas hit-test.
- Keyboard navigation across the proxies: a roving `tabindex` in scene-graph
  order, arrow keys to move focus, Enter or Space to select (Shift to extend a
  multi-select), and Escape to clear, composed with the existing
  `use-selection-keyboard` (copy, cut, paste, delete) rather than replacing it.
- A polite `aria-live` region that announces discrete selection changes and the
  resolved snap target on gesture commit (not per pointer move), so a screen
  reader hears what the Canvas snap indicator shows without being flooded.
- Dimension measurement chips and hover tooltips rendered as DOM elements:
  contrast-safe pills (a semi-opaque background meeting WCAG AA 4.5:1 over both
  the white Canvas and dark walls or an underlay raster) with
  `font-variant-numeric: tabular-nums`, unit-formatted, honouring
  `prefers-reduced-motion` for any fade. Chips hide below a legibility threshold
  (a light touch short of the deferred full collision avoidance).
- Unit-aware ruler ticks: `rulerTicks` formats its label through
  `lengthFormatOptions` and `formatLength` from the active `UnitPreferences`
  instead of printing the raw millimetre value.
- A new undoable `project/set-units` command (`core`) that flips the existing
  persisted `meta.units` field, and a segmented unit toggle (a `radiogroup` of
  metric and imperial) in the editor-shell toolbar that dispatches it and reflects
  the current value. Every label, chip, ruler tick, and inspector reads the same
  `meta.units`, so the toggle re-formats them all.

### Non-goals (documented deferrals, per ADR-0041 and the slice plan)

- **Subsuming the Canvas chrome.** The Canvas remains the renderer for all
  geometry (walls, rooms, grid, rulers, underlay, openings, selection rings, snap
  indicator, live preview, dimension lines and ticks). The overlay is additive: it
  adds text chrome (dimension chips, tooltips) and the accessibility surface, not a
  reimplementation of the geometric rendering. A full move of all chrome into the
  DOM is explicitly out of scope.
- **Label-collision avoidance.** Chips hide below a legibility threshold but are
  not de-conflicted against each other; a layout pass that nudges overlapping
  labels apart is later polish.
- **Snap-settings UI, default ceiling height, default wall thickness.** These are
  editor-preferences follow-ups (ADR-0041), not Phase-1 gates; only the
  unit-display toggle is pulled in.
- **Animated or inertial camera, and DOM-overlay gizmo variants** beyond the
  focusable proxies the accessibility deliverable needs (move and rotate gizmos
  stay Canvas-driven).
- **Per-axis or per-entity unit overrides, and a units preference beyond the
  system toggle** (form and precision stay at the system defaults the formatters
  already supply). A richer unit-preferences surface is later work.

## 3. Constraints

- `core/` gains only the additive `project/set-units` command; there is no schema
  change because `meta.units` already exists and is already read by every
  inspector (parent spec invariant 1; the v4 schema stands). Storage stays in
  millimetres and display formats on read (ADR-0027).
- The overlay lives in `editor/` and reaches the scene, the selection, and the
  session only through the existing bridge hooks (`useSceneGraph`, `useSelection`,
  `useSelectionIds`, `useEditorSession`); it does not import `core` mutation paths
  or `storage` directly, and every selection or units change flows through
  `dispatch` or the bridge selection store (ADR-0019, ADR-0020).
- The Canvas keeps painting all geometry, so the existing empty-editor
  visual-regression baseline is unchanged. Any later populated baseline that
  shifts because a numeric chip moved from Canvas to DOM is refreshed through the
  documented snapshot procedure.
- The overlay container and proxies never intercept a Canvas pointer gesture
  (`pointer-events: none` by default); wall drawing, panning, marquee, endpoint
  drag, opening placement, calibration, and the dimension tool stay exactly as
  they are.
- The wall-drawing end-to-end flow and the axe accessibility check stay green, and
  axe reports zero violations with the overlay present. The full check chain and
  `rgb:audit` stay green; ESLint at zero problems.

## 4. The overlay layer (`editor/plan/`)

`PlanView` today renders a bare `<canvas>`. It gains a positioned plan-stage
wrapper that holds the canvas and a new `PlanOverlay` sibling absolutely
positioned over it at the same fixed 800x600 box. `PlanView` already owns the
viewport state (`useState<Viewport>` in `usePlanLayers`) and the resolved scene
layers, so it passes the live viewport, the scene graph, the selected ids, the
selection store, the active unit preferences, and the resolved snap to
`PlanOverlay` as props; pan and zoom already call `setViewport`, which re-renders
`PlanView` and so repositions the overlay. No new global viewport state is
introduced.

Positioning is screen-space. A pure `entityAnchor(entity)` function returns the
world-space anchor point for each selectable entity (a wall's midpoint, a room's
centroid, an opening's centre, a dimension's label anchor), and the overlay places
each child at `worldToScreen(anchor, viewport)` with `position: absolute` and a
constant font size. There is no container transform and no counter-scaling, so
text never blurs or re-rasterizes on zoom. `worldToScreen` is the existing tested
projection; this slice adds only the anchor function and the thin placement glue.

## 5. Accessibility (`editor/plan/`)

**ARIA proxies.** For each selectable entity the overlay renders a focusable
element at the entity's screen anchor with an appropriate `role` and a unit-aware
`aria-label` built by a pure `ariaLabel(entity, preferences)` helper (for example
`Wall, 3.2 m`, `Room Kitchen, 12 m²`, `Door, 0.9 m wide`, `Dimension, 2.4 m`,
formatting lengths with `formatLength` and areas with the area formatter).
`aria-selected` mirrors the bridge selection. The proxies are
`pointer-events: none` and carry a visible `:focus-visible` outline, distinct from
the Canvas selection ring, because keyboard focus and selection are different
states.

**Keyboard navigation.** A pure roving-`tabindex` reducer
(`nextFocusIndex(current, key, count)`) drives focus order in scene-graph order;
arrow keys move focus, Enter or Space selects through the bridge selection store
(Shift extends), and Escape clears. This composes with the existing
`use-selection-keyboard` clipboard and delete bindings; it does not replace them.
The overlay container is reachable in the tab order and labeled, and the Canvas
keeps its `Floor plan` label.

**Live region.** A single polite `aria-live` region renders text from pure
builders: `selectionAnnouncement(entities, preferences)` on a selection change,
and `snapAnnouncement(snap)` only when a gesture commits (pointer up or
placement), so continuous snapping during a drag does not flood the screen reader.

## 6. Unit-aware labels and the unit-display toggle (`core/`, `editor/`)

`core/commands/handlers/project-commands.ts` gains `SET_UNITS` with a
`setUnits(units)` creator and a handler that reassigns
`state.meta = { ...state.meta, units }`, mirroring `renameProject` so the
inverse-capture proxy records the `meta` change and undo restores the prior
system. It registers alongside the existing project commands.

The editor-shell toolbar gains a segmented unit toggle: a `radiogroup` with metric
and imperial options that reflects `session.getProject().meta.units` and
dispatches `setUnits` on change. Because the existing `PREFERENCES_BY_UNITS` map
keys the active `UnitPreferences` off `meta.units`, flipping it re-formats every
inspector field, room label, dimension chip, proxy label, and ruler tick from the
one source.

`rulerTicks` (`editor/plan/ruler.ts`) takes the active `UnitPreferences` and
replaces `String(Math.round(sample.worldValue))` with
`formatLength(sample.worldValue, lengthFormatOptions(preferences))`, so ruler
labels read `1 m` or `3' 4"` rather than a raw millimetre count. The dimension
chip label uses the same formatter.

## 7. The hybrid chrome split

| Chrome                                                                                                                   | Renderer after this slice   |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Walls, rooms, grid, rulers, underlay, openings, selection rings, snap indicator, live preview, dimension lines and ticks | Canvas (geometry unchanged) |
| Dimension measurement chips, hover tooltips, focusable ARIA proxies, live region                                         | DOM overlay                 |

Dimension _lines_ stay Canvas-drawn; only the numeric _chip_ becomes a DOM pill,
which is where the crisp-text, tabular-numeral, contrast-safe styling and the
unit-aware formatting live. Room labels stay Canvas-drawn (already unit-aware);
moving them to the DOM is out of scope.

## 8. Testing strategy

Red-green-blue per behavior with the role-separated subagents, in roughly five
cycles (the exact split is fixed in the implementation plan):

- **Pure, unit-tested:** `entityAnchor` (world anchor per entity kind);
  `ariaLabel` (unit-aware label per entity kind, both unit systems); the
  `nextFocusIndex` roving-`tabindex` reducer (wrap and clamp at the ends);
  `selectionAnnouncement` and `snapAnnouncement` text; the unit-aware `rulerTicks`
  labels (metric and imperial); the dimension chip label and placement; and the
  `project/set-units` command and handler (apply and undo restore `meta.units`).
- **React, unit-tested (React Testing Library):** the proxy renders with the right
  `role`, `aria-label`, `aria-selected`, and `tabindex`, and a keyboard event
  selects through a fake selection store; the unit toggle reflects `meta.units`
  and dispatches `setUnits`; the live region renders the announcement text.
- **Glue, coverage-excluded, end-to-end validated:** the plan-stage wrapper and
  `PlanOverlay` placement, the focus wiring, and the toolbar control. The
  wall-drawing end-to-end spec stays green; the axe accessibility check stays green
  with the overlay present; and a keyboard-reachability check confirms a
  keyboard-only user can move focus to an entity and select it.

## 9. Open questions and follow-ups

- **Label-collision avoidance.** Chips hide below a legibility threshold this
  slice; a de-confliction layout pass is later polish.
- **Richer unit preferences.** Form and precision overrides beyond the system
  toggle, and per-entity unit display, are later work; this slice toggles the
  system only.
- **Overlay-driven gizmos.** Move and rotate handles stay Canvas-driven; DOM
  variants are later work beyond the accessibility proxies.
- **Pointer selection through the overlay.** Kept on the Canvas hit-test this
  slice; if a future need arises to select by clicking a DOM proxy, the proxies can
  opt into pointer events without disturbing the keyboard path.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 10
  (the "Pan/zoom Canvas + DOM overlay" deliverable and the editor-accessibility
  acceptance), section 6.2 (the DOM overlay for interactive UI), section 6.13
  (accessibility). ADR-0021 (the Canvas plan-drawing seam this overlay layers
  over), ADR-0020 (the bridge-owned selection the proxies drive), ADR-0019 (the
  dispatch boundary the units toggle uses), ADR-0027 (millimetre storage with
  unit-aware display), ADR-0041 (the finishing-slice boundary this slice is the
  second half of), and ADR-0043 (the record for this slice).
- Implementation plan:
  `docs/plans/2026-06-09-dom-overlay-and-accessibility-implementation.md` (written
  next).
