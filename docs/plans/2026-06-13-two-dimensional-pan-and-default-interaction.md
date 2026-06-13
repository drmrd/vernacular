# Two-dimensional pan and default interaction: implementation plan

> Execution mode: main-thread red-green-blue with the role-separated subagents
> (test-author RED, implementer GREEN, clean-code-reviewer + refactorer BLUE). I commit
> from the main thread and stay on `feat/two-dimensional-pan-default-interaction`. Each
> behavior cycle is test -> feat -> refactor. End-to-end-only changes commit as
> `test(e2e):` (audit-exempt); an end-to-end test that is a cycle's RED commits as `test:`
> so the audit sees a RED before the GREEN.

**Goal:** Make Select the default tool and turn a plain primary-button drag in Select mode
into a pan, with Shift-drag for the marquee, click-select unchanged, and the spacebar
spring-pan preserved.

**Architecture:** A pure state machine (`editor/plan/select-gesture.ts`) resolves a
Select-mode primary press into one of click, pan, or marquee, locked at the moment the drag
crosses the existing travel threshold. The `usePlanSelection` hook is thin glue that drives
the machine and applies its effects (set the marquee, pan via the pure `panBy`, or run the
existing click logic). The cursor rule moves to a tiny pure `plan-cursor.ts`. Middle-mouse
and spacebar pan in `useViewportControls` are untouched.

**Tech stack:** TypeScript, React, Vitest + Testing Library, Playwright.

---

## File structure

- `editor/tools/active-tool-context.ts` (modify): `DEFAULT_TOOL` becomes `'select'`.
- `editor/tools/tools-panel.tsx` (modify): list Select first; add a `title` describing the
  drag-to-pan and Shift-drag-marquee gestures.
- `editor/plan/select-gesture.ts` (create): pure state machine. Owns the travel threshold.
- `editor/plan/select-gesture.test.ts` (create): unit tests for the machine.
- `editor/plan/plan-cursor.ts` (create): pure `planCursor(tool, panning)`.
- `editor/plan/plan-cursor.test.ts` (create): unit tests for the cursor rule.
- `editor/plan/use-plan-selection.ts` (modify): drive `select-gesture`, add `setViewport`
  to its deps, apply `panBy`, expose a `panning` flag. The inline `normalizedBounds`,
  `draggedPastThreshold`, `resolveRelease`, and the threshold constant move into
  `select-gesture.ts`; `applyClick` stays (it touches the selection store).
- `editor/plan/plan-view.tsx` (modify): pass `setViewport` to `usePlanSelection`, import
  `planCursor` from `plan-cursor.ts`, feed it `controls.panning || planSelection.panning`.
- `editor/tools/tools-panel.test.tsx` (modify, RED): Select is the default-active tool,
  listed first, with the descriptive title.
- End-to-end specs (modify, `test(e2e):`): activate the Wall tool before drawing.
- `e2e/tests/journeys/two-dimensional-pan.spec.ts` (create) plus a spacebar mid-wall
  regression: prove the new pan gesture and the preserved spring-pan.

---

## Cycle 1: Select is the default tool and leads the panel

**Files:** Modify `editor/tools/active-tool-context.ts`,
`editor/tools/tools-panel.tsx`, `editor/tools/tools-panel.test.tsx`.

- [ ] **Step 1 (RED, test-author):** Rewrite the `ToolsPanel` default-tool test in
      `editor/tools/tools-panel.test.tsx` to expect Select as the default:

```tsx
it('defaults to the Select tool, lists it first, and describes its drag gestures', async () => {
  render(
    <ActiveToolProvider>
      <ToolsPanel />
    </ActiveToolProvider>,
  )

  const buttons = screen.getAllByRole('button')
  expect(buttons[0]).toHaveAccessibleName(/select/i)

  const selectButton = screen.getByRole('button', { name: /select/i })
  const drawButton = screen.getByRole('button', { name: /draw wall/i })
  expect(selectButton).toHaveAttribute('aria-pressed', 'true')
  expect(drawButton).toHaveAttribute('aria-pressed', 'false')
  expect(selectButton).toHaveAttribute('title', expect.stringMatching(/pan/i))

  await userEvent.click(drawButton)
  expect(drawButton).toHaveAttribute('aria-pressed', 'true')
  expect(selectButton).toHaveAttribute('aria-pressed', 'false')
})
```

- [ ] **Step 2:** Run `pnpm exec vitest run editor/tools/tools-panel.test.tsx`. Expect FAIL
      (default is still draw-wall; Select is not first; no title).

- [ ] **Step 3 (GREEN, implementer):** In `active-tool-context.ts` set
      `export const DEFAULT_TOOL: ToolId = 'select'`. In `tools-panel.tsx` reorder so `select`
      is first and give it a title:

```tsx
const TOOLS: ReadonlyArray<{ id: ToolId; label: string; title?: string }> = [
  { id: 'select', label: 'Select', title: 'Select. Drag to pan, Shift-drag to marquee.' },
  { id: 'draw-wall', label: 'Draw wall' },
  { id: 'place-opening', label: 'Opening' },
  { id: 'dimension', label: 'Dimension' },
]
```

Render `title={entry.title}` on the button (omit when absent).

- [ ] **Step 4:** Run the test. Expect PASS. Run `pnpm exec vitest run editor/tools` to
      confirm no sibling regressions.

- [ ] **Step 5 (BLUE):** clean-code-reviewer on the diff; refactorer applies findings or an
      empty marker. Commit `feat: default to the Select tool with drag-to-pan affordance`.

## Cycle 1b: Activate the Wall tool in the end-to-end suite (`test(e2e):`, exempt)

Drawing now requires choosing the Wall tool. Update every spec that draws by clicking the
canvas so it activates the tool first, and refresh the home visual baseline (the panel now
leads with Select).

- [ ] **Step 1:** In `e2e/tests/journeys/support.ts` add a helper and use it in `drawWall`:

```ts
export async function selectWallTool(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Draw wall' }).click()
}

export async function drawWall(page, from, to): Promise<void> {
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
  await page.keyboard.press('Enter')
}
```

- [ ] **Step 2:** Add `await selectWallTool(page)` (import it) before the first drawing
      click in the raw-draw journeys: `chained-polyline`, `smart-angle-snap`,
      `immediate-commit-rooms`, `donut-room`, `cancel-wall`, and any of `edit-endpoint`,
      `snap-along-wall`, `opening-host-guard` that raw-click before `drawWall`.

- [ ] **Step 3:** In `e2e/tests/scene-helpers.ts`, click `Draw wall` at the start of
      `drawnSceneCanvas` and `drawnRoomCanvas` (after switching to Split view, before the first
      plan click).

- [ ] **Step 4:** In the top-level specs that draw, add a `Draw wall` click before the
      first canvas draw: `wall-drawing.spec.ts`, `canvas-pan-alignment.spec.ts`,
      `accessibility.spec.ts`, and any export spec (`export-plan-svg/png/pdf`, `export-bundle`)
      that draws content rather than exporting the empty project. Grep first:
      `grep -rln "Floor plan" e2e/tests` then check each for a draw-before-assert.

- [ ] **Step 5:** Rebuild and run the chromium tree to green:
      `pnpm build && pnpm exec playwright test --project=chromium`. Kill any stale 4173 first.

- [ ] **Step 6:** Refresh the home darwin visual baseline (panel reorder changes it):
      `pnpm exec playwright test visual-regression.spec.ts --project=chromium --update-snapshots=all`.
      Confirm the diff is only the tools-panel order.

- [ ] **Step 7:** Commit `test(e2e): activate the Wall tool before drawing now that Select is the default`.

## Cycle 2: select-gesture begin + advance (pan path and threshold)

**Files:** Create `editor/plan/select-gesture.ts`, `editor/plan/select-gesture.test.ts`.

Public signatures (for the test-author; it does not see the implementation):

```ts
import type { Point } from '../../core'
import type { Bounds } from './fit'
import type { ScreenPoint } from './viewport'

export type SelectGestureMode = 'pending' | 'panning' | 'marquee'
export interface SelectGestureState {
  mode: SelectGestureMode
  originWorld: Point
  lastCanvas: ScreenPoint
}
export interface SelectMoveSample {
  world: Point
  canvas: ScreenPoint
  shift: boolean
}
export interface SelectMoveResult {
  state: SelectGestureState
  panDelta?: ScreenPoint
  marquee?: Bounds
}
export function beginSelectGesture(
  originWorld: Point,
  originCanvas: ScreenPoint,
): SelectGestureState
export function advanceSelectGesture(
  state: SelectGestureState,
  sample: SelectMoveSample,
): SelectMoveResult
```

Threshold is the existing `MARQUEE_DRAG_THRESHOLD_MM = 50` (world mm), owned here.

- [ ] **Step 1 (RED, test-author):** Tests in `select-gesture.test.ts`:
  - `beginSelectGesture` returns `{ mode: 'pending', originWorld, lastCanvas: originCanvas }`.
  - A sub-threshold move (origin `{0,0}`, world `{10,10}`) returns `{ state }` with no
    `panDelta`, no `marquee`, and `state.mode === 'pending'` and `lastCanvas` unchanged.
  - A past-threshold move with `shift: false` (world `{100,0}`, canvas advanced by `{40,0}`
    from the press canvas) returns `mode: 'panning'` and `panDelta` equal to the canvas
    delta from the press point (`{40,0}`).
  - A second panning move returns a `panDelta` equal to the incremental canvas delta from
    the previous sample, not from the press point.

- [ ] **Step 2:** `pnpm exec vitest run editor/plan/select-gesture.test.ts` -> FAIL (module
      missing).

- [ ] **Step 3 (GREEN, implementer):** Implement `beginSelectGesture`, `advanceSelectGesture`
      (pending stays pending below threshold returning the same state; on first crossing with no
      shift it becomes `panning` and emits the canvas delta from `state.lastCanvas`; advances
      `lastCanvas` to the sample canvas), plus private `normalizedBounds`, `draggedPastThreshold`,
      `screenDelta`, and the threshold constant.

- [ ] **Step 4:** Run the test -> PASS.

- [ ] **Step 5 (BLUE):** review + refactor/marker. Commit `feat: add the select-gesture pan path`.

## Cycle 3: select-gesture marquee branch and locked mode

- [ ] **Step 1 (RED):** Add tests:
  - A past-threshold move with `shift: true` returns `mode: 'marquee'` and `marquee` equal
    to `normalizedBounds(origin, world)`, with no `panDelta`.
  - Once `panning`, a later sample with `shift: true` stays `panning` (mode locked at first
    crossing, not re-evaluated), and once `marquee`, a later `shift: false` sample stays
    `marquee`.

- [ ] **Step 2:** Run -> FAIL.

- [ ] **Step 3 (GREEN):** Extend `advanceSelectGesture`: when crossing from pending, pick
      `marquee` if `sample.shift` else `panning`; once non-pending, do not re-evaluate the mode;
      the marquee branch emits `marquee` bounds, the panning branch emits `panDelta`.

- [ ] **Step 4:** Run -> PASS.

- [ ] **Step 5 (BLUE):** review + refactor/marker. Commit `feat: add the select-gesture marquee branch with a locked mode`.

## Cycle 4: select-gesture end outcomes

```ts
export interface SelectEndSample {
  world: Point
  shift: boolean
}
export type SelectEndEffect =
  | { kind: 'click'; world: Point; shift: boolean }
  | { kind: 'marquee'; rect: Bounds }
  | { kind: 'none' }
export function endSelectGesture(
  state: SelectGestureState,
  sample: SelectEndSample,
): SelectEndEffect
```

- [ ] **Step 1 (RED):** Tests:
  - `mode: 'panning'` -> `{ kind: 'none' }`.
  - `mode: 'marquee'` -> `{ kind: 'marquee', rect: normalizedBounds(origin, sample.world) }`.
  - `mode: 'pending'` -> `{ kind: 'click', world: state.originWorld, shift: sample.shift }`
    (a press and release with no qualifying drag is a click at the press origin).

- [ ] **Step 2:** Run -> FAIL.

- [ ] **Step 3 (GREEN):** Implement `endSelectGesture` per the three outcomes.

- [ ] **Step 4:** Run -> PASS.

- [ ] **Step 5 (BLUE):** review + refactor/marker. Commit `feat: resolve the select-gesture release into click, marquee, or pan`.

## Cycle 5: plan-cursor rule

**Files:** Create `editor/plan/plan-cursor.ts`, `editor/plan/plan-cursor.test.ts`; modify
`editor/plan/plan-view.tsx` to import it.

```ts
import type { ToolId } from '../tools/active-tool-context'
export function planCursor(tool: ToolId, panning: boolean): string
```

- [ ] **Step 1 (RED):** Tests in `plan-cursor.test.ts`:
  - `planCursor('select', true) === 'grabbing'`.
  - `planCursor('draw-wall', true) === 'grabbing'` (panning wins for any tool).
  - `planCursor('select', false) === 'grab'`.
  - `planCursor('draw-wall', false) === 'crosshair'`.
  - `planCursor('dimension', false) === 'crosshair'`; `planCursor('place-opening', false) === 'crosshair'`.

- [ ] **Step 2:** Run -> FAIL.

- [ ] **Step 3 (GREEN):** Implement: if `panning` return `'grabbing'`; if `tool === 'select'`
      return `'grab'`; if a crosshair tool return `'crosshair'`; else `'default'`. Move the
      `CROSSHAIR_TOOLS` set here. In `plan-view.tsx` delete the inline `planCursor` and
      `CROSSHAIR_TOOLS`, import from `plan-cursor.ts`.

- [ ] **Step 4:** Run -> PASS; `pnpm typecheck`.

- [ ] **Step 5 (BLUE):** review + refactor/marker. Commit `feat: show the open-hand cursor in Select mode`.

## Cycle 6: wire the gesture into usePlanSelection and pan (glue)

**Files:** Modify `editor/plan/use-plan-selection.ts`, `editor/plan/plan-view.tsx`. Create
`e2e/tests/journeys/two-dimensional-pan.spec.ts`.

- [ ] **Step 1 (RED, `test:`):** End-to-end `two-dimensional-pan.spec.ts`, mirroring the 1:1
      trick in `canvas-pan-alignment.spec.ts` but panning with the PRIMARY button in Select mode
      (default), not middle mouse:
  1. `gotoEditor`; draw a vertical wall with the Wall tool (`selectWallTool`, two clicks at
     the same x, Enter); assert `Walls: 1`.
  2. Switch to Select (default already, but click Select to be explicit).
  3. Primary-button drag on empty canvas to the right by `PAN`:
     `mouse.move(sx,sy); mouse.down(); mouse.move(sx+PAN,sy,{steps:10}); mouse.up()`,
     choosing `sx,sy` away from the wall so the press is on empty space.
  4. Click at `x0 + PAN` and assert the thickness textbox appears (the wall moved right by
     `PAN`, proving a pan, not a marquee and not a wall draw).
  5. Add a second test: a Shift+primary drag enclosing the wall selects it (marquee), and a
     plain click on empty space clears the selection.

- [ ] **Step 2:** Run the spec against the current build -> FAIL (plain drag marquees today,
      so the post-pan click misses the wall).

- [ ] **Step 3 (GREEN, implementer + main-thread wiring):** Rewrite `usePlanSelection`:
  - Add `setViewport: Dispatch<SetStateAction<Viewport>>` to `PlanSelectionDeps`.
  - Hold a `useRef<SelectGestureState | null>(null)`; `useState` for `marquee` and `panning`.
  - `onPointerDown` (select + primary): compute canvas point via `eventToCanvas`, set the ref
    to `beginSelectGesture(screenToWorld(canvas, viewport), canvas)`, `setPointerCapture`.
  - `onPointerMove`: if ref null return; `advanceSelectGesture` with `{ world, canvas, shift }`;
    store `result.state`; if `result.marquee` `setMarquee`; if `result.panDelta`
    `setViewport(v => panBy(v, result.panDelta))` and `setPanning(true)`.
  - `onPointerUp`: read+clear the ref, `setMarquee(undefined)`, `setPanning(false)`, release
    capture if held; if there was a gesture, `endSelectGesture`; on `click` call the existing
    `applyClick(deps, effect.world, effect.shift)`, on `marquee` call
    `selection.setSelection(entitiesInRect(graph, effect.rect))`, on `none` do nothing.
  - Remove the now-unused inline `normalizedBounds`/`draggedPastThreshold`/`resolveRelease`
    and the threshold constant (they live in `select-gesture.ts`). Keep `applyClick`.
  - Add `panning: boolean` to the `PlanSelection` interface.
  - In `plan-view.tsx`: pass `setViewport` to `usePlanSelection({...})`; feed the cursor
    `planCursor(layers.tool, layers.controls.panning || layers.planSelection.panning)`.

- [ ] **Step 4:** `pnpm typecheck && pnpm lint`; rebuild; run `two-dimensional-pan.spec.ts`
      and `canvas-pan-alignment.spec.ts` on chromium -> PASS.

- [ ] **Step 5 (BLUE):** clean-code-reviewer on the hook + glue diff; refactorer. Watch
      max-lines-per-function (40) on the handlers; extract a small helper if a handler grows.
      Commit `feat: pan on a plain Select-mode drag, marquee on Shift-drag`.

## Cycle 7: spacebar spring-pan survives a wall in progress (`test(e2e):`, exempt)

The spacebar pan already takes the pointer before the wall tool and never touches the
wall-tool state, so the in-progress run survives. Pin it.

- [ ] **Step 1:** In `two-dimensional-pan.spec.ts` (or a sibling), add a test:
  1. `selectWallTool`; click the first vertex; do NOT finish.
  2. Hold Space (`keyboard.down('Space')`), primary-drag to pan, release Space
     (`keyboard.up('Space')`).
  3. Click the second vertex and press Enter.
  4. Assert `Walls: 1` and (switching to Select) that clicking near the committed wall
     selects it, proving the run continued after the pan rather than resetting.

- [ ] **Step 2:** Rebuild; run -> expect PASS on arrival. If it fails, the spring-pan needs a
      fix and this becomes a real cycle; otherwise commit as a characterization test.

- [ ] **Step 3:** Commit `test(e2e): pin spacebar spring-pan surviving an in-progress wall`.

## Final gate (before PR)

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- [ ] `pnpm rgb:audit` clean over `origin/main..HEAD`
- [ ] Rebuild, kill stale 4173, run the full chromium tree and the `scene-webgl` project
- [ ] Open the PR, wait for CI green, merge, then flip the roadmap row and update memory.

## Self-review notes

- Spec coverage: default tool (cycle 1), drag-to-pan primary + marquee on Shift + click
  unchanged (cycles 2-4 pure, cycle 6 wiring + e2e), cursor affordance (cycle 5), panel
  copy (cycle 1), spring-pan preserved + pinned (cycle 7), middle-mouse untouched (no
  change to `useViewportControls`). All covered.
- Type consistency: `SelectGestureState`/`advanceSelectGesture`/`endSelectGesture` and the
  `panDelta`/`marquee`/`SelectEndEffect` shapes are used identically in cycles 2-4 and 6.
- Risk: the default-tool flip breaks every drawing e2e; cycle 1b is the dedicated, exempt
  fix and the visual baseline refresh. No model or command change, so no migration.
