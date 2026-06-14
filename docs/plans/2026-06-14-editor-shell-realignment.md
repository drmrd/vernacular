# Editor shell realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realign the editor chrome to the corrected spec: a fixed-viewport shell whose inspector swaps by selection, with snapping in the status bar, a consolidated top bar, a rail project block, a theme toggle, and a tuned dark canvas.

**Architecture:** Builds on the merged shell-chrome base (#133). Work proceeds structural-first in seven cycles, each a strict red-green-blue TDD cycle. Commits obey the ping-pong audit: `test:` commits touch only test files (RED), `feat:`/`fix:` commits touch only source (GREEN), `refactor:` closes each cycle (BLUE, often an empty marker).

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (unit), Playwright (e2e), CSS modules with design-system tokens, `@phosphor-icons/react`.

**Spec:** `docs/specs/2026-06-14-editor-shell-realignment.md`

---

## File structure

Created:

- `editor/plan/canvas-reference-control.tsx` + `.css` + `.test.tsx`: the on-canvas underlay loader/toggle (Cycle 7).
- `editor/shell/snap-status.tsx` + `.css` + `.test.tsx`: the status-bar snap indicator and precision popover (Cycle 3).
- `editor/shell/export-menu.tsx` + `.test.tsx`: the brass Export dropdown (Cycle 4).
- `editor/shell/project-menu.tsx` + `.test.tsx`: the New/Open project menu (Cycle 4).
- `editor/shell/project-identity.tsx` + `.css` + `.test.tsx`: the rail project block (Cycle 5).
- `editor/shell/theme-toggle.tsx` + `.test.tsx`: the light/dark/system control (Cycle 6).
- `editor/plan/wall-finish-section.tsx`, `editor/plan/room-finish-section.tsx` (+ tests): contextual paint (Cycle 2).

Modified:

- `editor/design-system/app-frame.tsx` + `.css`: fixed-viewport shell, internal pane scroll, pinned status bar (Cycle 1).
- `editor/shell/editor-shell.tsx`: wire status bar as pinned band, top-bar consolidation, remove always-on paint + rail snap, mount canvas reference control.
- `editor/shell/inspector.tsx`: contextual paint sections; remove the underlay panel.
- `editor/shell/status-bar.tsx` + `.css`: tool, coordinates, snap, units, scale, revision, zoom readout.
- `editor/shell/editor-shell.css`: top-bar consolidation styles.

Removed from the inspector/rail tree (kept as components if reused elsewhere): the always-mounted `PaintInspector` slot and the rail `SnapPanel` slot.

---

## Cycle 1: Fixed-viewport shell with a pinned status bar

**Behavior:** `AppFrame` fills exactly the viewport height with no page scroll. The header and status bar are fixed bands; the rail, main, and inspector each scroll internally. The status bar is always visible regardless of inspector content height.

**Files:**

- Modify: `editor/design-system/app-frame.css`
- Modify: `editor/design-system/app-frame.tsx`
- Test: `editor/design-system/app-frame.test.tsx`

- [ ] **Step 1 (RED): add a test asserting the frame is a fixed-height shell with internal scroll regions**

```tsx
it('caps the frame at the viewport height and scrolls panes internally', () => {
  render(
    <AppFrame
      header={<div>header</div>}
      rail={<div>rail</div>}
      railLabel="Rail"
      main={<div>main</div>}
      mainLabel="Main"
      inspector={<div>inspector</div>}
      inspectorLabel="Inspector"
      statusBar={<div data-testid="status">status</div>}
    />,
  )
  const frame = document.querySelector('.ds-app-frame') as HTMLElement
  expect(frame.className).toContain('ds-app-frame')
  // The inspector pane body owns the scroll, not the page.
  const inspector = screen.getByRole('complementary', { name: 'Inspector' })
  expect(inspector.className).toContain('ds-app-frame__inspector')
  expect(screen.getByTestId('status')).toBeInTheDocument()
})
```

Note: jsdom has no layout, so assert the contract via class names and structure; the true fixed-height behavior is covered by the e2e status-bar-visible test in Step 6.

- [ ] **Step 2 (RED): confirm failure** — `pnpm exec vitest run editor/design-system/app-frame.test.tsx`. Expected: PASS already for structure (this test mostly locks structure). If it passes, fold the real assertion into the e2e step and skip to Step 3 with a CSS-only change. The meaningful RED is the e2e test below.

- [ ] **Step 3 (RED): add an e2e test that the status bar is visible without scrolling**

In `e2e/tests/status-bar.spec.ts` (create):

```ts
import { test, expect } from '@playwright/test'

test('the status bar floor tabs are visible in the initial viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const floors = page.getByRole('navigation', { name: /floors/i })
  await expect(floors).toBeInViewport()
})
```

- [ ] **Step 4 (RED): confirm failure** — `pnpm exec playwright test e2e/tests/status-bar.spec.ts --project=chromium`. Expected: FAIL (status bar below the fold today).

- [ ] **Step 5 (RED): commit** — `git add` the two test files; `git commit -m "test: require a fixed-viewport shell with a visible pinned status bar"`.

- [ ] **Step 6 (GREEN): make the frame a fixed-height shell**

In `app-frame.css`, change `.ds-app-frame` from `min-height: 100vh` to a fixed shell and give panes internal scroll:

```css
.ds-app-frame {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  /* grid-template unchanged: 'header' / 'rail main inspector' / 'statusbar' */
}
.ds-app-frame__rail,
.ds-app-frame__inspector {
  overflow: hidden;
}
.ds-app-frame__pane-body {
  overflow: auto;
  min-height: 0;
}
.ds-app-frame__main {
  min-height: 0;
  overflow: hidden;
}
.ds-app-frame__status-bar {
  min-width: 0;
}
```

Ensure the middle grid row can shrink: add `min-height: 0` to the row by setting `.ds-app-frame { grid-template-rows: auto minmax(0, 1fr) auto; }`.

- [ ] **Step 7 (GREEN): confirm green** — run both test files from Steps 2 and 4. Expected: PASS. Run `pnpm typecheck`.

- [ ] **Step 8 (GREEN): commit** — `git commit -m "feat: make the editor a fixed-viewport shell with internal pane scrolling"`.

- [ ] **Step 9 (BLUE):** `git commit --allow-empty -m "refactor: close the fixed-shell cycle"`.

---

## Cycle 2: Inspector swaps by selection; contextual paint; remove the global list

**Behavior:** The inspector renders one selection-driven view. The always-mounted paint surface list is gone. Selecting a wall shows a Finish section with Face A/B chips; selecting a room shows Floor/Ceiling chips; each mounts the existing finish picker for the chosen surface. The underlay panel leaves the inspector (its relocation is Cycle 7; here it is simply removed from the inspector).

**Files:**

- Create: `editor/plan/wall-finish-section.tsx` + `.test.tsx`
- Create: `editor/plan/room-finish-section.tsx` + `.test.tsx`
- Modify: `editor/shell/inspector.tsx`
- Modify: `editor/shell/editor-shell.tsx` (remove the `PAINT_PICKER_SLOT` PaintInspector mount)
- Test: `editor/shell/inspector.test.tsx`

- [ ] **Step 1 (RED): wall finish section test** (`wall-finish-section.test.tsx`)

```tsx
it('renders Face A and Face B chips and shows the picker for the active face', () => {
  render(<WallFinishSection floorId="g" wallId="w1" dispatch={() => {}} />)
  expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
})
```

- [ ] **Step 2 (RED): room finish section test** (`room-finish-section.test.tsx`)

```tsx
it('renders Floor and Ceiling chips', () => {
  render(<RoomFinishSection floorId="g" roomKey="r1" dispatch={() => {}} />)
  expect(screen.getByRole('button', { name: 'Floor' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ceiling' })).toBeInTheDocument()
})
```

- [ ] **Step 3 (RED): inspector no longer shows a global wall list when nothing is selected**

Add to `inspector.test.tsx`:

```tsx
it('shows only the quiet empty hint when nothing is selected', () => {
  renderInspector()
  expect(screen.getByText(/nothing selected/i)).toBeInTheDocument()
  expect(screen.queryByText(/side a/i)).toBeNull()
})
```

- [ ] **Step 4 (RED): confirm failures and commit** — run the three files; expect FAIL. `git commit -m "test: require contextual wall/room finish sections and a global-list-free inspector"`.

- [ ] **Step 5 (GREEN): implement the finish sections**

`wall-finish-section.tsx`: a `useState<'A'|'B'>('A')` face toggle rendering two chips and mounting the existing finish picker (`editor/paint/...`) bound to the wall face surface ref. Reuse `resolveSurfacePaint` and the paint dispatch used by `PaintPanel`. `room-finish-section.tsx`: a `'floor'|'ceiling'` toggle, same pattern.

- [ ] **Step 6 (GREEN): wire into inspector and remove the global list**

In `inspector.tsx`: in the wall branch render `<WallFinishSection .../>` under the dimensions; in the room branch render `<RoomFinishSection .../>`. Change the empty branch to a quiet hint: `return <p className="inspector__empty">Nothing selected. Pick an element to edit it.</p>`. Remove the `<UnderlayPanel .../>` block. In `editor-shell.tsx` remove the `PAINT_PICKER_SLOT` `PaintInspector` from `InspectorPanels`.

- [ ] **Step 7 (GREEN): confirm green** — run the three files + `pnpm typecheck`. Update any app/editor-shell test that asserted the old paint list.

- [ ] **Step 8 (GREEN): commit** — `git commit -m "feat: make the inspector swap by selection with contextual wall and room finishes"`.

- [ ] **Step 9 (BLUE):** `git commit --allow-empty -m "refactor: close the inspector-swap cycle"`.

---

## Cycle 3: Snap relocation to a status-bar popover

**Behavior:** The rail snap panel is removed. The status bar shows a brass snap indicator naming the engaged snap; clicking it opens a precision popover with a master toggle, a catch-radius control, and a per-kind toggle for each snap kind, all backed by the existing snap-preferences store.

**Files:**

- Create: `editor/shell/snap-status.tsx` + `.css` + `.test.tsx`
- Modify: `editor/shell/status-bar.tsx`
- Modify: `editor/shell/editor-shell.tsx` (remove the `SNAP_PANEL_SLOT` SnapPanel from `ToolRail`)

- [ ] **Step 1 (RED): snap-status test**

```tsx
it('opens a precision popover with per-kind toggles when the indicator is clicked', async () => {
  const user = userEvent.setup()
  render(<SnapStatusHarness />) // provides SnapPreferencesProvider
  await user.click(screen.getByRole('button', { name: /snap/i }))
  expect(screen.getByRole('checkbox', { name: /grid/i })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /endpoint/i })).toBeInTheDocument()
})
```

- [ ] **Step 2 (RED): confirm failure and commit** — `git commit -m "test: require a status-bar snap indicator with a precision popover"`.

- [ ] **Step 3 (GREEN): implement snap-status** reading/writing the snap-preferences store (`useSnapPreferencesStore`), rendering the indicator button + a popover (a `<div role="dialog">` toggled by local state) with the master toggle, radius input, and the eight per-kind checkboxes.

- [ ] **Step 4 (GREEN): mount in status bar; remove rail snap panel** — render `<SnapStatus/>` in `status-bar.tsx`; delete the `SNAP_PANEL_SLOT` block from `ToolRail` in `editor-shell.tsx`.

- [ ] **Step 5 (GREEN): confirm green + typecheck; commit** — `git commit -m "feat: move snapping to a status-bar indicator and precision popover"`.

- [ ] **Step 6 (BLUE):** `git commit --allow-empty -m "refactor: close the snap-relocation cycle"`.

---

## Cycle 4: Top-bar consolidation

**Behavior:** A single brass `Export` dropdown replaces the five export buttons. New/Open move into a project menu off the wordmark. The Command-palette button is removed (keybinding stays). Undo/Redo stay as the icon buttons only; the CommandBar's undo/redo are removed. The unit toggle moves to the status bar. A zoom control (minus/percent/plus) is added.

**Files:**

- Create: `editor/shell/export-menu.tsx` + `.test.tsx`
- Create: `editor/shell/project-menu.tsx` + `.test.tsx`
- Modify: `editor/shell/editor-shell.tsx` (ShellHeader), `editor/shell/editor-shell.css`
- Modify: `editor/shell/status-bar.tsx` (host the unit toggle)
- Modify: the CommandBar usage (remove undo/redo + palette button from the bar)

- [ ] **Step 1 (RED): export-menu test** — opening the menu reveals Bundle/Plan/PNG/PDF items that call the matching handlers.

```tsx
it('invokes the matching export handler from the menu', async () => {
  const user = userEvent.setup()
  const onExportBundle = vi.fn()
  render(
    <ExportMenu
      onExportBundle={onExportBundle}
      onExportPlan={vi.fn()}
      onExportPng={vi.fn()}
      onExportPdf={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: /export/i }))
  await user.click(screen.getByRole('menuitem', { name: /bundle/i }))
  expect(onExportBundle).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2 (RED): project-menu test** — New/Open items call their handlers. Zoom control test — minus/plus call a zoom callback. Header test in `editor-shell.test.tsx`: exactly one button named `Export`; no button named `Command palette`; exactly one `Undo` button.

- [ ] **Step 3 (RED): confirm failure and commit** — `git commit -m "test: require a consolidated top bar (export menu, project menu, single undo, zoom)"`.

- [ ] **Step 4 (GREEN): implement** the `ExportMenu` and `ProjectMenu` (a button + a `role=menu` popover), a zoom control bound to the viewport zoom source, move `UnitToggle` into `status-bar.tsx`, remove the palette button and the CommandBar undo/redo from `ShellHeader`, and replace the five export buttons with `<ExportMenu/>`.

- [ ] **Step 5 (GREEN): confirm green + typecheck; commit** — `git commit -m "feat: consolidate the top bar into export and project menus with a zoom control"`.

- [ ] **Step 6 (BLUE):** `git commit --allow-empty -m "refactor: close the top-bar cycle"`.

---

## Cycle 5: Rail project identity block

**Behavior:** The top of the rail shows the project name in EB Garamond, an italic period subtitle from project metadata, and the plan's overall dimensions.

**Files:**

- Create: `editor/shell/project-identity.tsx` + `.css` + `.test.tsx`
- Modify: `editor/shell/editor-shell.tsx` (`ToolRail`)

- [ ] **Step 1 (RED): test** — renders the project name in the heading font class and the period subtitle.

```tsx
it('shows the project name and period subtitle', () => {
  render(
    <ProjectIdentity
      name="Eastmore Farmstead"
      period="victorian"
      boundsLabel={'42&apos; 6" x 28&apos; 3"'}
    />,
  )
  expect(screen.getByText('Eastmore Farmstead')).toHaveClass('project-identity__name')
  expect(screen.getByText(/victorian/i)).toBeInTheDocument()
})
```

- [ ] **Step 2 (RED): confirm failure and commit** — `git commit -m "test: require a rail project identity block"`.

- [ ] **Step 3 (GREEN): implement** the block (EB Garamond name, italic subtitle resolved via `builtinPeriods`, bounds label computed from the active floor's geometry bbox) and mount it at the top of `ToolRail`.

- [ ] **Step 4 (GREEN): confirm green + typecheck; commit** — `git commit -m "feat: add a project identity block to the rail"`.

- [ ] **Step 5 (BLUE):** `git commit --allow-empty -m "refactor: close the project-identity cycle"`.

---

## Cycle 6: Theme toggle and dark-canvas pass

**Behavior:** A theme toggle (light/dark/system) is surfaced in the UI and drives `ThemeProvider`. The dark canvas grid and room fills are tuned to read as quiet chrome.

**Files:**

- Create: `editor/shell/theme-toggle.tsx` + `.test.tsx`
- Modify: `editor/design-system/theme-provider.tsx` (expose a setter if not already)
- Modify: the plan canvas rendering for dark-mode grid/fill tuning (token-driven)

- [ ] **Step 1 (RED): theme-toggle test** — selecting Dark sets `data-theme="dark"` on the themed container.

- [ ] **Step 2 (RED): confirm failure and commit** — `git commit -m "test: require a theme toggle control"`.

- [ ] **Step 3 (GREEN): implement** the toggle (three-option segmented control) wired to the theme choice state; surface it in the top bar or a settings affordance. Tune the dark canvas by reading `--color-surface-active` for the grid and `--color-surface-raised`/text tokens for fills instead of hardcoded values.

- [ ] **Step 4 (GREEN): confirm green + typecheck; commit** — `git commit -m "feat: add a theme toggle and tune the dark canvas"`.

- [ ] **Step 5 (BLUE):** `git commit --allow-empty -m "refactor: close the theme cycle"`.

---

## Cycle 7: Underlay control on the canvas

**Behavior:** The trace-underlay loader and its toggle live in a canvas-anchored control, not the inspector.

**Files:**

- Create: `editor/plan/canvas-reference-control.tsx` + `.css` + `.test.tsx`
- Modify: `editor/shell/editor-shell.tsx` (mount on the canvas area), confirm the inspector no longer renders it (done in Cycle 2)

- [ ] **Step 1 (RED): test** — the control renders a Load image button and a Trace underlay toggle and calls the underlay handlers.

- [ ] **Step 2 (RED): confirm failure and commit** — `git commit -m "test: require a canvas-anchored underlay reference control"`.

- [ ] **Step 3 (GREEN): implement** the control using the existing `useUnderlay` hook (loadImage, startCalibration) and the underlay state; anchor it in the `ViewportArea`.

- [ ] **Step 4 (GREEN): confirm green + typecheck; commit** — `git commit -m "feat: move the underlay loader to a canvas reference control"`.

- [ ] **Step 5 (BLUE):** `git commit --allow-empty -m "refactor: close the underlay-relocation cycle"`.

---

## After all cycles

- Run the full suite: `pnpm test` and `pnpm exec playwright test --project=chromium`.
- Regenerate the chromium darwin visual baseline (the shell look changes again): `pnpm exec playwright test e2e/tests/visual-regression.spec.ts --project=chromium --update-snapshots`.
- File the follow-up issues named in the spec: Room tool; project status field; rail subtitle metadata.

## Self-review

- Spec coverage: Cycle 1 covers the fixed shell + status visibility; Cycle 2 the inspector swap + contextual paint + inspector underlay removal; Cycle 3 snap relocation; Cycle 4 top-bar consolidation (export, project menu, palette removal, undo dedupe, units move, zoom); Cycle 5 project block; Cycle 6 theme toggle + dark canvas; Cycle 7 underlay-to-canvas. Status-bar fields (tool, coords, scale, revision, zoom readout) are added incrementally across Cycles 1, 3, and 4 as their hosts land; if any field lacks a live source, render a static placeholder span with the documented class and file a follow-up rather than blocking.
- Ping-pong: every cycle is test (RED) then source (GREEN) then refactor (BLUE); GREEN commits never touch `.test.`/`.spec.` files.
- Type consistency: finish sections take `{ floorId, wallId|roomKey, dispatch }`; ExportMenu takes the four `onExport*` handlers already present on `ProjectControlsProps`.
