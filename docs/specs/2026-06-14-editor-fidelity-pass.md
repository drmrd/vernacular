# Editor fidelity pass

Date: 2026-06-14
Status: Approved (defaults), pending implementation plan

## Relationship to the shell realignment

This pass finishes the editor shell realignment
(`docs/specs/2026-06-14-editor-shell-realignment.md`) and fixes execution defects
found by auditing the running build of PR #148 against that spec and the directional
mockup. It changes none of the realignment decisions. Where a finding restates a
realignment requirement, that spec stays the authority; this spec records the gap and
how it closes.

## Goal

Make the running editor read as finished: no default-styled controls, no orphaned
panels, a populated status bar, and the canvas chrome and zoom control the realignment
spec already calls for. Quiet chrome and the Draughtsman's Restraint identity stay as
approved.

## Findings this closes

Audited from headless screenshots of `feat/editor-shell-realignment` at 9dbfe6ed, each
traced to source.

Bugs and unstyled controls:

- New, Save, and Open folder render as default browser buttons (`project-controls.tsx`),
  bypassing the design-system `Button`.
- The floor switcher renders a default list with unstyled buttons and an active class
  (`floor-switcher__tab--active`) that has no stylesheet.
- The status bar leaves the tool and coordinate slots empty and omits scale, revision,
  and zoom (`status-bar.tsx`).
- A global "Surface paint" panel mounts in the inspector beside the selection-driven
  view (`editor-shell.tsx`), against realignment spec section 5.
- The view-mode tabs (Plan, Split, 3D) are unstyled.
- The inspector multi-selection fallback shows the literal string "Wall selected"
  (`inspector.tsx`).

Missing chrome the realignment spec already specifies:

- No zoom control (top bar) or zoom readout (status bar) (sections 3 and 7).
- No north compass or scale bar on the canvas (section 9).
- The breadcrumb omits the "My Projects" segment (section 3).
- The rail identity block omits the plan's overall dimensions (section 4).

## Decisions

1. Adopt the existing design-system `Button` (`editor/design-system/button.tsx`, primary
   and neutral variants) for every standard action button that currently renders a raw
   `<button>`: New, Save, Open folder, Add floor, Load image, and the recovery prompt.
   The button primitive already exists; the defect is non-adoption. Save stays neutral;
   brass stays reserved for Export.
2. The floor switcher and the view-mode switcher are tab and segmented controls, not
   standard buttons, so they get dedicated styles. Floor tabs read as horizontal tabs
   (no list markers; the active tab uses umber-900 text and a 2px brass bottom border
   per realignment spec section 7). The view-mode tabs read as a segmented control
   consistent with the unit and theme toggles.
3. Remove the global "Surface paint" panel slot from the inspector. Contextual paint
   already lives in the selection-driven Finish and Surfaces sections. Replace the
   multi-selection fallback string with a count-based summary.
4. The status bar gains the realignment fields: active tool, live cursor coordinates in
   a monospace face, a scale readout, a revision indicator, and a read-only zoom
   percentage.
5. Surface viewport zoom through a shared context so the top-bar control (minus,
   percentage, plus) and the status-bar readout read one source. This resolves the
   realignment follow-up that deferred zoom.
6. Consolidate New, Open recent, and Open folder into a project menu anchored on the
   wordmark. Save stays a visible top-bar action. Add the "My Projects" breadcrumb
   segment.
7. The rail identity block renders the plan's overall dimensions beneath the period
   subtitle.
8. Canvas chrome: add a low-opacity north compass and a scale bar in the light theme,
   reading semantic tokens.
9. Wordmark font: the wordmark stays in Inter as application chrome. The realignment
   spec section 3 line that names EB Garamond for the wordmark is corrected by ADR; the
   visual-language spec already scopes the heading face to project names, component
   titles, and period subtitles. The rail project name keeps the serif identity.

Kept as approved, no change: no Room tool, no Modify section, no rail snap controls, the
single Window tool, brass on Export, the theme toggle, and the quiet rail chips. The
dark-canvas quality pass stays deferred.

## Architecture and components

- `editor/shell/project-controls.tsx`: adopt `Button`; move New, Open recent, and Open
  folder into a project menu component anchored on the wordmark. Save stays inline.
- New project menu component, mirroring the `ExportMenu` dropdown pattern.
- `editor/shell/editor-shell.tsx`: add the "My Projects" breadcrumb segment; remove the
  `PAINT_INSPECTOR_SLOT` panel from `InspectorPanels`; mount the top-bar zoom control.
- `editor/shell/floor-switcher.tsx` plus a new `floor-switcher.css`: horizontal tabs
  with the brass active border and a styled Add-floor affordance.
- `editor/shell/status-bar.tsx`: fill the tool, coordinates, scale, revision, and zoom
  fields.
- `editor/shell/inspector.tsx`: replace the "Wall selected" fallback with a
  multi-selection summary.
- `editor/viewport/view-mode-viewport.tsx`: style the view-mode tabs as a segmented
  control.
- `editor/shell/project-identity.tsx`: accept and render overall plan dimensions.
- Viewport zoom: lift the plan controller's zoom into a shared context with a setter, a
  read-only readout for the status bar, and an interactive control for the top bar.
- Canvas and plan rendering: north compass and scale bar in the light theme.
- `editor/plan/canvas-reference-control.tsx`: adopt `Button` for Load image.
- An ADR for the wordmark-font reconciliation.

## Build sequence

Small red-green-blue cycles on top of the merged realignment base.

1. Adopt `Button` across the unstyled standard buttons (New, Save, Open folder, Add
   floor, Load image, recovery).
2. Remove the global paint slot; replace the inspector multi-selection fallback.
3. Status bar fields and floor tabs (tool, coordinates, scale, revision, and the zoom
   slot; floor tabs with the brass active border).
4. Viewport zoom shared context; top-bar control feeding the status-bar readout.
5. Project menu and the "My Projects" breadcrumb segment.
6. Rail identity dimensions; canvas north compass and scale bar.
7. View-mode segmented tabs; wordmark-font ADR.

After the cycles, regenerate and enforce the shell visual baseline so an unstyled control
or a missing stylesheet cannot pass a green suite again.

## Out of scope

The dark-canvas quality pass, the project list and home screen, and populating example
project data.

## References

- Editor shell realignment: `docs/specs/2026-06-14-editor-shell-realignment.md`
- Visual design language: `docs/specs/2026-06-13-visual-design-language.md`
- Directional mockup: `Vernacular 2D Planner Mockup.png`
- Audited build: PR #148 at 9dbfe6ed
