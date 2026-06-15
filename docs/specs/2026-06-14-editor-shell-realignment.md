# Editor shell realignment

Date: 2026-06-14
Status: Approved, pending implementation plan

Supersedes the shell-layout portions of the Draughtsman's Restraint visual design
language spec (`docs/specs/2026-06-13-visual-design-language.md`): the top bar, left
rail, inspector, and status bar anatomy. The color, typography, iconography, and
token sections of that spec stand unchanged. This spec defers to the editor
experience makeover (`docs/specs/2026-06-10-editor-experience-makeover.md`) for the
interaction model, command dispatch, and snapping behavior.

## Goal

Realign the editor chrome so the running application matches the intent of both the
visual design language and the editor experience makeover: a quiet, fixed-viewport
shell where the inspector swaps by selection, snapping lives in the status bar, and
the parchment identity reads in both themes.

## Why this spec exists

The first shell-chrome pass (issue #133, PR #143) restyled the rail, top bar, and
inspector header competently but additively. It left three structural problems that
both prior specs already legislate against, and it never reconciled several mockup
ideas. The result reads as half finished because unstyled scaffolding still dominates
the screen. The specific findings:

1. The snap panel is permanently open in the rail. Both specs place snapping in an
   opt-in precision surface with the status bar reporting the engaged snap.
2. The paint surface picker is mounted unconditionally in the inspector, producing a
   flat list of every wall side ("Wall 1 side A", and so on). The makeover spec
   requires the inspector to swap content by selection and tool.
3. The status bar (built in #133) is pushed below the fold because the always-mounted
   paint list overflows the `min-height: 100vh` frame. The editor should be a fixed
   shell whose panes scroll internally.

Plus gaps against the visual spec's own intent (no project identity block, no zoom
controls, an unconsolidated top bar) and three mockup items that needed an explicit
decision (a Room tool, a Modify section, window subtypes as period components).

## Decisions

### 1. Theme default and dark-mode quality

The default theme choice stays `system` (the current `ThemeProvider` default). Forcing
the parchment light theme over an explicit OS `prefers-color-scheme: dark` is a mild
accessibility anti-pattern: that signal is frequently set for light sensitivity,
photophobia, astigmatism halation, or low-light comfort, which is the same long-session
comfort the visual spec claims to value. The identity is carried instead by:

- A visible theme toggle in the editor (light / dark / system). Confirm during planning
  whether a control is already surfaced; the `ThemeProvider` exists but no toggle was
  found in the shell.
- A dark-theme canvas quality pass. The current dark canvas (bright grid lines and stark
  white room fills on navy) contradicts "restraint." Dark mode must embody the same
  brass-as-annotation, quiet-chrome principle as light mode.

### 2. Fixed-viewport app shell

`AppFrame` becomes a true `100vh` (or `100dvh`) application shell with no page scroll.
The header and status bar are fixed bands; the rail, main canvas, and inspector each
scroll internally within the middle row. This pins the status bar and removes the
overflow that hides it today. The existing collapsible-pane and resize behavior is
retained.

### 3. Top bar

Left to right: wordmark (Inter, see ADR-0076), breadcrumb (`My Projects / <Project>`), zoom
control (minus, percentage, plus), Grid and Dimensions toggles, Undo and Redo icon
buttons, a brass `Export` dropdown, a neutral `Save`, and the save-status text.

- Export consolidation: a single brass `Export` button opens a menu of Bundle (.vern),
  Plan (PDF), PNG, and PDF. The five separate export buttons are removed.
- New and Open move into a small project menu anchored on the wordmark or breadcrumb.
- The Command-palette button is removed; the action keeps its keybinding and a palette
  entry.
- The Metric/Imperial unit toggle moves out of the top bar (see status bar).
- Undo/Redo are icon-only; the duplicate undo/redo affordances rendered by the
  `CommandBar` are removed from the top bar.
- Layers toggle remains deferred (no user-defined layers in the model yet).

### 4. Left rail

Top to bottom:

- Project identity block: project name in EB Garamond, an italic period/style subtitle
  from project metadata, and the plan's overall dimensions. The "In Progress" status
  pill is deferred (no project status field exists yet). The subtitle's exact
  composition depends on which metadata fields exist (see follow-ups).
- Select: Select, Pan.
- Draw: Wall, Door, Window.
- Period: Fireplace, Chimney, Stairs.
- Annotate: Dimension, Label.

No Modify section: resize and move are served by direct manipulation (drag handles,
selection transform) and the inspector's numeric fields. No snap section: snapping
moves to the status bar. The Room tool is out of scope and filed as a separate feature
(rooms are derived from enclosed wall loops, so a Room tool is new drawing behavior, not
chrome). A single Window tool stays in Draw; specific window kinds are chosen in the
opening-type chooser, and their period data lives in the inspector's Period Attributes.

### 5. Inspector

The inspector renders exactly one selection-driven view at a time. The permanent paint
surface list is removed.

- Nothing selected: a quiet italic hint, "Nothing selected. Pick an element to edit it."
- Wall selected: dimensions (length, thickness) and a contextual Finish section with
  Face A / B chips plus the finish picker for the chosen face.
- Room selected: name and area, period and style tags, and a contextual Surfaces section
  with Floor / Ceiling chips plus the finish picker.
- Opening selected: EB Garamond component title, component id and host wall, period
  attribute tags, dimension fields with fractional-inch precision chips, and the Period
  Attributes section.
- Multiple selected: a count badge with shared transform actions; no per-entity editors.

Paint is contextual by selection only. There is no global surface list and no separate
paint mode in this effort (a paint/brush mode may be a later feature). The underlay
loader leaves the inspector (see below).

### 6. Underlay

The trace-underlay loader and its "Trace underlay" toggle move to a canvas reference
control anchored to the canvas, not the inspector. The underlay is a canvas reference
layer, so it belongs with the canvas; this also clears the inspector's empty state.

### 7. Status bar

A pinned band, left to right: floor tabs, active tool, cursor coordinates, the snap
indicator, the unit toggle, the scale readout, the revision indicator, and a read-only
zoom percentage.

- Floor tabs: the active tab uses umber-900 text and a 2px brass bottom border; inactive
  tabs use umber-500. Tabs scroll horizontally when a project has many floors.
- Active tool: "Tool: <name>" in Inter.
- Cursor coordinates: monospace, live x and y in the project's display unit.
- Snap indicator: brass, names the currently engaged snap and opens the precision popover
  (see Snapping).
- Unit toggle: the Metric/Imperial control, relocated from the top bar to sit beside the
  readouts it governs.
- Scale readout ("Scale 1:48") and revision indicator ("rev.14") are included. The
  far-right project-name echo from the mockup is omitted (it duplicates the breadcrumb).
- Zoom: a read-only percentage; the interactive control lives in the top bar.

### 8. Snapping

Smart, curated snapping stays on by default. The status-bar snap indicator opens an
opt-in precision popover that exposes a master toggle, a catch-radius control, and a
per-kind toggle for endpoint, intersection, midpoint, edge/along-wall, angle lock,
perpendicular, parallel, and grid. Settings persist as editor preferences. This realizes
the makeover spec's precision snapping panel as a status-bar popover rather than a rail
panel. No always-on snap toggles appear elsewhere.

### 9. Canvas chrome and dark-theme polish

Per the visual spec's canvas section, and applied to both themes: a quiet grid in the
surface-active tone, thin rulers with muted tick labels, a low-opacity north compass, a
scale bar, brass dimension lines and measurement text, and a brass selection outline.
The dark theme's grid and room fills are tuned to read as quiet chrome rather than
high-contrast white on navy.

## Architecture and components

- `editor/design-system/app-frame.tsx` and `app-frame.css`: fixed-height shell, internal
  pane scrolling, pinned header and status bands.
- `editor/shell/editor-shell.tsx`: top-bar consolidation (Export dropdown, project menu,
  remove command-palette button and duplicate undo/redo, relocate units), wire the status
  bar as a pinned band, mount the underlay control on the canvas.
- New `Export` dropdown menu component (brass primary) listing the four export targets.
- New project menu (New, Open) anchored on the wordmark or breadcrumb.
- New top-bar zoom control and a read-only status-bar zoom readout backed by one viewport
  zoom source.
- `editor/shell/inspector.tsx`: collapse to a single selection-driven view; add the
  contextual Finish/Surfaces sections (Face A/B, Floor/Ceiling) that mount the existing
  finish picker; remove the always-on paint surface list and the underlay loader.
- New canvas reference control hosting "Load image" and the "Trace underlay" toggle.
- `editor/shell/status-bar.tsx`: add tool, coordinates, snap indicator, unit toggle,
  scale, revision, and zoom readout fields; keep the floor tabs and their brass active
  styling.
- New snap precision popover component opened from the status-bar snap indicator, backed
  by the existing snap-preferences store.
- Rail project identity block component reading project metadata.
- `editor/design-system/theme-provider.tsx` plus a theme-toggle control if one is not yet
  surfaced.
- Canvas/plan rendering: dark-theme grid and fill tuning, rulers, compass, scale bar, and
  brass dimensions, reading semantic tokens rather than hardcoded colors.

## Build sequence

Structural problems first, then identity and polish. Each step is one or more small
red-green-blue cycles on top of the merged #143 base.

1. Fixed-viewport shell with the status bar visible and pinned.
2. Inspector swaps by selection; contextual paint; remove the global surface list.
3. Snapping relocated to the status-bar indicator and precision popover; remove the rail
   snap panel.
4. Top-bar consolidation: Export dropdown, project menu, remove the command-palette
   button and duplicate undo/redo, relocate the unit toggle, add the zoom control.
5. Rail project identity block.
6. Theme toggle and the dark-theme canvas quality pass.
7. Underlay control relocated to the canvas.

## PR #143

Merge PR #143 as the foundation once its CI passes. Its work (Phosphor rail icons,
EB Garamond component titles, period tags, fractional-inch chips, the status-bar
scaffold) is sound and almost nothing here undoes it; this realignment is the next layer.

## Follow-up issues to file

- Room tool: a wall-rectangle drawing convenience (new drawing behavior, not chrome).
- Project status field and the "In Progress" rail status pill (needs a model field).
- Rail subtitle metadata: the project period era exists; confirm whether an architectural
  style or build-year field is needed to render a subtitle like "American Farmhouse, c.1887".
- Confirm or add a theme-toggle control if one is not already surfaced.

## What this spec does not cover

- The project list and home screen (its own brainstorming session, per the visual spec).
- Three-dimensional preview visual treatment (existing 3D specs).
- Custom Period component icons (Period component asset track).
- A paint/brush mode for bulk surface application (possible later feature).
- The Room tool (filed separately, see above).

## References

- Visual design language: `docs/specs/2026-06-13-visual-design-language.md`
- Editor experience makeover: `docs/specs/2026-06-10-editor-experience-makeover.md`
- UX Pilot mockup: `Vernacular 2D Planner Mockup.png` (directional reference)
- Shell-chrome plan: `docs/plans/2026-06-13-draughtsmans-restraint-shell-chrome.md`
- Issue #133 and PR #143 (shell chrome, merged as the base)
