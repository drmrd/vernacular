# Split-pane Viewport and View Modes Implementation Plan

> **For agentic workers:** executed with the role-separated red-green-blue subagents
> from the main thread (`/test-first` -> `/implement` -> `/clean-code-review` ->
> `/refactor`). Each cycle is `test:` -> `feat:` -> `refactor:`.

**Goal:** Make the three-dimensional preview a view mode rather than an always-on
side panel. Add a view-mode model (plan, split, preview), a visible control and
keyboard shortcuts that switch modes, and a split-pane viewport with a draggable
splitter. One journey flips `toggle-three-d` to `required`.

**Architecture:** A `ViewModeProvider` holds the current mode. View-mode commands
close over the mode controls and merge into the existing command registry (slice 3),
so they get keybindings and palette entries without changing `CommandContext`. The
viewport renders plan-only, a split, or preview-only, reusing the design-system
`usePaneResize` for the splitter. Selection sync between the two surfaces and
active-floor-aware 3D scene derivation are out of scope here (3D convergence work per
the makeover spec non-goals and slice 5).

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Playwright.

---

## Context

- `editor/shell/editor-shell.tsx` `ViewportArea` currently renders `<PlanView />`
  (aria-label "Floor plan") plus a `<section aria-label="3D preview">` with
  `<SceneCanvas />` always visible. We replace it with a view-mode-aware viewport.
- `SceneCanvas` (`bridge`) renders a WebGPU view or an accessible fallback message;
  under headless chromium it shows the fallback, which is fine for the journey
  (it asserts the labeled region's presence, not WebGPU output).
- The design system has `usePaneResize({ initial, min, max })` -> `{ size,
onResizeStep, onResizeTo }` and `clampPaneSize`; reuse them for the splitter.
- The slice-3 command registry: `createEditorCommands()` returns `EditorCommand[]`;
  the keybinding hook (`useKeybindings`) and the connected `CommandPalette` consume a
  command list. We merge view commands into that list at the call sites.
- Journey gate: `toggle-three-d` (title "toggles between the two- and
  three-dimensional views") is pending in `e2e/journey-coverage.json`.

## File map

- Create `editor/viewport/view-mode.tsx` (+ test) - `ViewMode`, `ViewControls`,
  `ViewModeProvider`, `useViewMode`.
- Create `editor/commands/view-commands.ts` (+ test) - `createViewCommands(view)`.
- Create `editor/viewport/view-mode-viewport.tsx` (+ test) + `.css` - the
  mode buttons and per-mode rendering with the splitter.
- Modify `editor/shell/editor-shell.tsx` - mount `ViewModeProvider`, replace
  `ViewportArea` with `ViewModeViewport`, merge view commands into the keybinding
  layer; modify `editor/commands/command-palette.tsx` to merge view commands into the
  palette list.
- Create `e2e/tests/journeys/toggle-three-d.spec.ts`; extend `support.ts`; flip the
  `toggle-three-d` capability in `e2e/journey-coverage.json`.

---

## Cycle 1: the view-mode model

**Files:** create `editor/viewport/view-mode.tsx`, test `editor/viewport/view-mode.test.tsx`.

RED (`view-mode.test.tsx`): render a probe using `useViewMode()` inside
`<ViewModeProvider>`; assert the default mode is `'plan'`; a probe button that calls
`setMode('preview')` updates the readout to `'preview'`; and `useViewMode()` thrown
outside the provider is an error (render a bare probe in a try or use renderHook with
expect to throw). Keep it behavioral with @testing-library/react.

GREEN (`view-mode.tsx`):

```tsx
export type ViewMode = 'plan' | 'split' | 'preview'
export interface ViewControls {
  mode: ViewMode
  setMode: (mode: ViewMode) => void
}
```

A `ViewModeProvider({ children, initial = 'plan' })` with `useState<ViewMode>(initial)`
and a memoized `{ mode, setMode }` over React context; `useViewMode(): ViewControls`
reads it and throws outside the provider. Mirror `editor/commands/command-context.tsx`
(provider + hook in one file, including the `react-refresh/only-export-components`
disable comment on the hook).

## Cycle 2: the view-mode commands

**Files:** create `editor/commands/view-commands.ts`, test `editor/commands/view-commands.test.ts`.

RED (`view-commands.test.ts`): import `createViewCommands` from './view-commands' and
the `EditorCommand` type from './command'. Build a fake `view = { mode: 'plan',
setMode: vi.fn() }`. Assert `createViewCommands(view)` returns three commands with ids
`show-plan`, `show-split`, `show-3d`, keybindings `['1']`, `['2']`, `['3']`, labels
`'Plan view'`, `'Split view'`, `'3D view'`; running each (`.run({} as CommandContext)`)
calls `view.setMode` with `'plan'`/`'split'`/`'preview'` respectively; each `isEnabled`
returns true.

GREEN (`view-commands.ts`): `export function createViewCommands(view: ViewControls):
EditorCommand[]` (import `ViewControls` from '../viewport/view-mode', `EditorCommand`/
`CommandContext` types from './command'). Each command's `run` closes over `view` and
ignores the context argument: e.g. `run: () => view.setMode('preview')`. `isEnabled:
() => true`. Keep it a small data-returning function.

## Cycle 3: the view-mode viewport

**Files:** create `editor/viewport/view-mode-viewport.tsx`, test
`editor/viewport/view-mode-viewport.test.tsx`, and `editor/viewport/view-mode-viewport.css`.

RED (`view-mode-viewport.test.tsx`): render `<ViewModeViewport plan={<div>PLAN</div>}
preview={<div aria-label="3D preview">3D</div>} />` inside a `<ViewModeProvider>` (mode
controls come from the provider). Assertions:

- Three mode buttons exist: getByRole('button', { name: 'Plan view' }), 'Split view',
  '3D view'. The current mode's button has `aria-pressed="true"` (default 'plan').
- In default 'plan' mode, the `plan` content is shown and the region labeled
  '3D preview' is NOT in the document (queryByLabelText('3D preview') is null).
- Clicking 'Split view' shows BOTH the plan content and the '3D preview' region.
- Clicking '3D view' shows the '3D preview' region; clicking 'Plan view' hides it
  again.
  Use userEvent for clicks; the provider holds the state so the component re-renders.

GREEN (`view-mode-viewport.tsx`): `ViewModeViewport({ plan, preview }: { plan:
ReactNode; preview: ReactNode })`. Read `const { mode, setMode } = useViewMode()`.
Render a small toolbar of three buttons (design-system `Button`, `aria-pressed={mode
=== '<that mode>'}`, onClick setMode). Then:

- mode 'plan': render only `plan`.
- mode 'preview': render only `preview`.
- mode 'split': render both `plan` and `preview` in a flex row separated by a splitter.
  Use `usePaneResize({ initial: 60, min: 30, max: 80 })` for the plan pane's percentage
  width in split mode; render a `<div role="separator" aria-orientation="vertical"
tabIndex={0}>` splitter whose `onKeyDown` calls `onResizeStep(+/-5)` on Arrow keys and
  whose `onPointerDown`/move adjusts via `onResizeTo` (a minimal drag is fine; keyboard
  resize is the accessible path). The `.css` styles the layout with design-system tokens
  only. Keep each function under 40 lines (extract the toolbar and the split body).

## Cycle 4: shell wiring and the journey

**Files:** modify `editor/shell/editor-shell.tsx` and
`editor/commands/command-palette.tsx`; create `e2e/tests/journeys/toggle-three-d.spec.ts`;
extend `e2e/tests/journeys/support.ts`; flip `e2e/journey-coverage.json`.

RED (the journey, authored first; it fails until the wiring lands):
extend `support.ts` selectors with
`threeDRegion: (page) => page.getByLabel('3D preview')`,
`viewModeButton: (page, name) => page.getByRole('button', { name })`.
`toggle-three-d.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, selectors } from './support'

test('toggles between the two- and three-dimensional views', async ({ page }) => {
  await gotoEditor(page)
  await expect(selectors.threeDRegion(page)).toHaveCount(0)
  await selectors.viewModeButton(page, '3D view').click()
  await expect(selectors.threeDRegion(page)).toBeVisible()
  await selectors.viewModeButton(page, 'Plan view').click()
  await expect(selectors.threeDRegion(page)).toHaveCount(0)
})
```

Flip `toggle-three-d` to `"status": "required"` in `journey-coverage.json`.

GREEN (wiring):

- `editor-shell.tsx`: wrap the frame in `<ViewModeProvider>` (inside the existing
  providers, alongside `CommandPaletteProvider`). Replace `ViewportArea` with
  `<ViewModeViewport plan={<PlanView />} preview={<section aria-label="3D preview"
className="editor-shell__preview"><SceneCanvas /></section>} />`. In `KeybindingLayer`,
  merge the view commands: `const view = useViewMode(); const commands = useMemo(() =>
[...createEditorCommands(), ...createViewCommands(view)], [view])`.
- `command-palette.tsx` (the connected `CommandPalette` wrapper): also read
  `useViewMode()` and merge `createViewCommands(view)` into its `commands` so the view
  modes are discoverable in the palette. (The presentational `CommandPaletteDialog`
  and its test are unchanged.)
- Keep `editor/shell/editor-shell.test.tsx` passing (it renders `EditorShell` within
  the providers; `ViewModeProvider` is now internal). If a shell test assertion about
  the always-on 3D preview breaks, STOP and report (the default mode is now 'plan', so
  the preview region is no longer present on first render - this is the intended
  behavior change, and that assertion must move into the wiring change or be reported).

Then verify the chromium journey passes (`pnpm build` + `pnpm exec playwright test
--project=chromium e2e/tests/journeys/toggle-three-d.spec.ts`).

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` green.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- `toggle-three-d` is `required` and its chromium journey passes; integration:audit
  shows 4 required / 7 pending.
- Keyboard 1/2/3 switch plan/split/preview; the palette lists Plan view, Split view,
  3D view; the splitter is keyboard-resizable in split mode.
- An ADR records the view-mode decision if the change is architectural (it extends
  ADR-0050's registry with a feature command set and changes the viewport from an
  always-on panel to a mode).
