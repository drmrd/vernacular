# Editor fidelity pass: implementation plan

Goal: close the fidelity gaps in `docs/specs/2026-06-14-editor-fidelity-pass.md` so the
running editor reads as finished, via small red-green-blue cycles on
`feat/editor-fidelity-pass`.

Approach: test first per the repo workflow. Each cycle writes or adjusts a failing test
(red), adds the minimal implementation (green), reviews and refactors while green (blue),
then commits. No new dependencies. Conventional Commits, no Co-Authored-By, no em-dashes.

Commands:

- Focused test: `pnpm exec vitest run <file>`
- Types: `pnpm typecheck`
- Lint: `pnpm lint`

Tech: React, TypeScript, Vitest with Testing Library, CSS using design-system semantic
tokens. Execution is inline in this session; each cycle is surfaced for async review.

## File map

- `editor/shell/project-controls.tsx`: adopt `Button`; later, host the project menu.
- `editor/plan/canvas-reference-control.tsx`: adopt `Button` for Load image.
- `editor/shell/editor-shell.tsx`: inspector panels, breadcrumb, top-bar zoom, status wiring.
- `editor/shell/inspector.tsx`: multi-selection summary.
- `editor/shell/status-bar.tsx`: tool, coordinates, scale, revision, zoom fields.
- `editor/shell/floor-switcher.tsx` and new `floor-switcher.css`: horizontal tabs.
- `editor/shell/project-menu.tsx` and css (new): project actions dropdown.
- `editor/shell/project-identity.tsx`: overall plan dimensions.
- `editor/viewport/view-mode-viewport.tsx` and css: segmented view tabs.
- Viewport zoom: shared context lifted from `editor/plan/use-viewport-controls.ts`.
- Canvas plan rendering: north compass and scale bar (`editor/plan/`).
- `docs/knowledge/decisions/`: ADR for the wordmark font.

## Cycle 1: adopt Button across the unstyled standard buttons

Files: modify `editor/shell/project-controls.tsx` (New, Save, Open folder, recovery
Restore/Discard) and `editor/plan/canvas-reference-control.tsx` (Load image). Tests:
`editor/shell/project-controls.test.tsx`, `editor/plan/canvas-reference-control.test.tsx`.

- Red: assert each action renders the design-system button (class `ds-button`), Save as
  `ds-button--neutral`. Run the focused tests, expect fail.
- Green: import `Button` from `../design-system`; replace each raw `<button>` with
  `<Button variant="neutral">`, preserving `onClick`, `type`, and labels.
- Blue: remove any now-dead local button styles; confirm Export stays the only brass action.
- Verify: focused vitest, `pnpm typecheck`, `pnpm lint`.
- Commit: `feat: adopt the design-system button for the project and reference controls`.

## Cycle 2: remove the global paint slot and fix the inspector fallback

Files: modify `editor/shell/editor-shell.tsx` (drop the `PAINT_INSPECTOR_SLOT` PanelSlot
from `InspectorPanels`) and `editor/shell/inspector.tsx` (replace the literal
"Wall selected" fallback). Tests: `editor/shell/inspector.test.tsx`,
`editor/shell/editor-shell.test.tsx` (adjust any assertion that expects the orphan slot).

- Red: assert the empty inspector renders no "Surface paint" heading, and a two-item
  selection renders a count summary (for example "2 selected") rather than "Wall selected".
- Green: remove the PanelSlot line so `InspectorPanels` renders only `<Inspector />`;
  change the fallback to a count-based summary string.
- Blue: if `PAINT_INSPECTOR_SLOT` and `shell-panel-slots` are now unused, remove them; if
  still referenced elsewhere, leave them.
- Verify: focused vitest, typecheck, lint.
- Commit: `fix: drop the orphan surface-paint panel and the inspector placeholder text`.

## Cycle 3: status bar fields and floor tabs

Files: modify `editor/shell/status-bar.tsx`, `editor/shell/floor-switcher.tsx`, create
`editor/shell/floor-switcher.css`, wire values in `editor/shell/editor-shell.tsx`. Tests:
`editor/shell/status-bar.test.tsx`, `editor/shell/floor-switcher.test.tsx`.

- Red: floor switcher renders tabs with no list markers and an active tab whose styling
  exists; status bar renders the active tool label and a scale readout.
- Green: add `floor-switcher.css` (`list-style: none`; tab padding; active tab umber-900
  text and a 2px brass bottom border per realignment spec section 7); make `Add floor` a
  `Button`; `StatusBar` accepts tool, coordinates, scale, revision, and zoom nodes;
  `EditorStatusBar` supplies the active tool from `useActiveTool`.
- Source notes: confirm the live-cursor source (candidate: `editor/plan/plan-cursor.ts`)
  and a revision source (candidate: a saved-revision counter or the command-history
  length). Scale and zoom values arrive in Cycle 4. If coordinates or revision have no
  ready source, ship tool, scale slot, and the floor tabs now and wire the rest when the
  source is confirmed, recording the deferral in the commit body.
- Verify: focused vitest, typecheck, lint.
- Commit: `feat: populate the status bar and restyle the floor switcher as tabs`.

## Cycle 4: viewport zoom shared context and top-bar control

Files: lift zoom from `editor/plan/use-viewport-controls.ts` into a shared context with a
setter; modify `editor/shell/editor-shell.tsx` (top-bar minus/percent/plus control) and
`editor/shell/status-bar.tsx` (read-only zoom percent and the scale derived from zoom).
Tests: a zoom-context test, a top-bar control test, a status-bar readout test.

- Source notes: confirm how `PlanView` consumes the controller zoom so the new context is
  the single source for the control, the readout, and the plan transform.
- Red/Green/Blue: provider holds zoom plus a setter; the control calls the setter; the
  readout subscribes; the plan reads the same value.
- Verify: focused vitest, typecheck, lint.
- Commit: `feat: surface viewport zoom in the top bar and status bar`.

## Cycle 5: project menu and the My Projects breadcrumb

Files: create `editor/shell/project-menu.tsx` and css (mirror `editor/shell/export-menu.tsx`);
modify `editor/shell/project-controls.tsx` (move New, Open recent, Open folder into the
menu; Save stays inline) and `editor/shell/editor-shell.tsx` (anchor the menu near the
wordmark; add the "My Projects" breadcrumb segment). Tests: `project-menu.test.tsx`,
breadcrumb assertion in `editor-shell.test.tsx`.

- Red/Green/Blue: menu opens, lists New/Open recent/Open folder, closes on select and on
  Escape, with the same a11y pattern as `ExportMenu`; the breadcrumb reads
  `My Projects / <project>`.
- Verify: focused vitest, typecheck, lint.
- Commit: `feat: add the project menu and the my-projects breadcrumb`.

## Cycle 6: rail identity dimensions and canvas chrome

Files: modify `editor/shell/project-identity.tsx` (accept and render overall dimensions)
and `editor/shell/editor-shell.tsx` `ToolRail` (compute and pass plan extents); add a north
compass and a scale bar to the plan rendering in `editor/plan/` (light theme, tokens).
Tests: `project-identity.test.tsx`, a plan-rendering test for the compass and scale bar.

- Source notes: confirm the plan-extent computation (bounding box of the active floor) and
  where canvas chrome draws (candidates: `editor/plan/draw-plan.ts`, `plan-scene.ts`).
- Red/Green/Blue: identity renders the formatted dimensions under the period subtitle; the
  canvas draws a low-opacity compass and a scale bar.
- Verify: focused vitest, typecheck, lint.
- Commit: `feat: show plan dimensions in the rail and add the canvas compass and scale bar`.

## Cycle 7: view-mode segmented tabs and the wordmark ADR

Files: modify `editor/viewport/view-mode-viewport.tsx` and its css for a segmented control;
create an ADR under `docs/knowledge/decisions/` and correct realignment spec section 3.
Tests: a view-mode tab styling and role test.

- Red/Green/Blue: the Plan/Split/3D switcher renders as a segmented control consistent with
  the unit and theme toggles, with the active mode marked.
- Verify: focused vitest, typecheck, lint.
- Commits: `style: render the view-mode switcher as a segmented control`, then
  `docs: reconcile the wordmark font (ADR)`.

## After the cycles

- Regenerate and enforce the shell visual baseline (currently darwin-only and skipped on
  CI) so an unstyled control or a missing stylesheet fails the suite.
- Run the full chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.
- Open a PR stacked on #148 summarizing the fidelity pass.

## Spec coverage

Spec decisions 1 through 9 map to cycles: 1 to Cycle 1 (and Add floor and Load image to
Cycles 3 and 1); 2 to Cycles 3 and 7; 3 to Cycle 2; 4 to Cycle 3; 5 to Cycle 4; 6 to
Cycle 5; 7 and 8 to Cycle 6; 9 to Cycle 7.
