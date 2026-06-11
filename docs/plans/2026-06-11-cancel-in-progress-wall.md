# Cancel an In-progress Wall Implementation Plan

> **For agentic workers:** role-separated red-green-blue subagents from the main
> thread. Each cycle is `test:` -> `feat:`/`fix:` -> `refactor:`.

**Goal:** Let the cancel key (Escape) abandon a wall that has been started but not
finished, so a first click is no longer a trap. The first capability of the
wall-drawing-completion slice; flips `cancel-wall` to `required`.

**Architecture:** The wall tool is a two-state machine (`idle` | `drawing`). Add a
pure `cancelWallTool(state)` that returns idle, and have the plan interaction reset
the tool to idle on Escape while the wall tool is active. The global Escape command
(deselect) is disabled while drawing (nothing is selected), so the two do not
conflict.

**Tech Stack:** TypeScript, React, Vitest, Playwright.

---

## Cycle 1: cancelWallTool (pure)

**Files:** modify `editor/plan/wall-tool.ts`, test `editor/plan/wall-tool.test.ts`.

RED (`wall-tool.test.ts`): add tests:

- `cancelWallTool({ phase: 'drawing', start: { x: 1, y: 2 } })` equals `IDLE_WALL_TOOL`
  (`{ phase: 'idle' }`).
- `cancelWallTool(IDLE_WALL_TOOL)` equals `IDLE_WALL_TOOL` (idempotent).
  (Import `cancelWallTool` from './wall-tool'; it does not exist yet.)

GREEN (`wall-tool.ts`): `export function cancelWallTool(_state: WallToolState):
WallToolState { return IDLE_WALL_TOOL }`. (The parameter is accepted for a uniform
state-transition signature even though every state cancels to idle; name it `_state`
or reference it so eslint stays clean; prefer `(): WallToolState` if the unused
parameter trips a rule, but keeping the state parameter documents the transition.)

## Cycle 2: Escape cancels the draw, plus the journey

**Files:** modify `editor/plan/use-plan-interaction.ts`; create
`e2e/tests/journeys/cancel-wall.spec.ts`; flip `e2e/journey-coverage.json`.

RED (the journey, authored first; fails until the wiring lands):
`cancel-wall.spec.ts` (title must equal the capability title):

```ts
import { test } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors } from './support'

test('cancels a half-drawn wall with the cancel key', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: 120, y: 200 } }) // start a wall
  await page.keyboard.press('Escape') // cancel the in-progress wall
  await canvas.click({ position: { x: 520, y: 200 } }) // a fresh first click, not the end
  await expectWallCount(page, 0) // nothing was committed
})
```

Flip `cancel-wall` to `"status": "required"` in `journey-coverage.json`. (No new
support selectors needed; `planCanvas`, `expectWallCount` already exist.)

GREEN (`use-plan-interaction.ts`): add a `useEffect` that attaches a `window`
`keydown` listener; when `event.key === 'Escape'` and `tool === 'draw-wall'`, reset
the tool to idle and clear the live pointer/snap:

```ts
useEffect(() => {
  if (tool !== 'draw-wall') {
    return
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setToolState((state) => cancelWallTool(state))
      setPointer(null)
      snapping.clear()
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [tool, snapping])
```

Import `useEffect` from 'react' and `cancelWallTool` from './wall-tool'. Keep
`usePlanInteraction` under the function-length limit (extract a small helper if
needed). The existing plan tests must stay green.

Then verify the chromium journey (`pnpm build` + `pnpm exec playwright test
--project=chromium e2e/tests/journeys/cancel-wall.spec.ts`), and re-run the other
journeys to confirm Escape did not regress them.

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` green.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- `cancel-wall` is `required` and its chromium journey passes; integration:audit shows
  6 required / 5 pending.
- Pressing Escape mid-draw abandons the wall; the next click starts fresh.

## Context: the rest of the wall-drawing slice (not in this PR)

The wall-drawing-completion slice also covers chained polyline drawing, smart angle
snapping, along-wall snapping (`snap-along-wall`), the opening-host guard
(`opening-host-guard`), and endpoint re-editing (`edit-endpoint`, whose drag is
already implemented in `editor/plan/use-wall-editing.ts`). Each is its own follow-up
PR.
