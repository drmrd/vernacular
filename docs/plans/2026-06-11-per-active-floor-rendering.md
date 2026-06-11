# Per-active-floor Rendering Implementation Plan

> **For agentic workers:** role-separated red-green-blue subagents from the main
> thread (`/test-first` -> `/implement` -> `/clean-code-review` -> `/refactor`).
> Each cycle is `test:` -> `feat:`/`fix:` -> `refactor:`.

**Goal:** Fix the integration bug where the plan derives from the whole project, so
switching or adding a floor does not change the canvas. Derive the rendered scene
strictly from the active floor. One journey flips `switch-floor` to `required`.

**Architecture:** A pure `core` filter `sceneGraphForFloor(graph, floorId)` returns a
scene graph narrowed to one floor (every node carries a `floorId`). The plan layer
(`usePlanLayers`) applies it to the live active floor, and the shell header's wall
count reflects the active floor. The floor switcher already supports select and add;
extending it with rename, delete, reorder, and duplicate is a documented fast-follow
(the multi-floor commands exist; only the switcher UI is missing).

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Playwright.

---

## Context

- `core/scene/scene-graph.ts` `SceneGraph` flattens all floors: `nodes`, `walls`,
  `rooms`, `underlays`, `openings`, `dimensions`, `stairs` are arrays across every
  floor. Each entity node has a `floorId` field; a `StairSceneNode`'s `floorId` is
  its `connection.fromFloorId`; a floor node (`nodes`) has id `floor:<id>`.
- `editor/plan/plan-view.tsx` `usePlanLayers` does `const graph = useSceneGraph()`
  (line ~267) and feeds that one `graph` to every downstream hook (interaction,
  selection, wall editing, fit-to-content, overlay, opening/underlay layers). This is
  the single place to narrow the scene.
- The active floor id comes from `useActiveFloorId()` (bridge). The initial project
  seeds one floor named 'Ground'. The `FloorSwitcher` (`editor/shell/floor-switcher.tsx`)
  renders a button per floor (aria-pressed) plus an 'Add floor' button; the shell
  wires select to `setActiveFloorId` and add to `dispatch(addFloor('New Floor'))`.
- The DOM overlay renders a `role="option"` proxy per entity (accessible name
  `Wall, <length>`), so narrowing the plan's scene narrows the proxies a journey can
  count.
- Gate: `switch-floor` (title "switches floors and the canvas changes") is pending.

## File map

- Create `core/scene/scene-graph-for-floor.ts` (+ test); export from `core/index.ts`.
- Modify `editor/shell/editor-shell.tsx` - the header wall count uses the active floor.
- Modify `editor/plan/plan-view.tsx` - `usePlanLayers` narrows the scene to the
  active floor.
- Create `e2e/tests/journeys/switch-floor.spec.ts`; extend `support.ts`; flip
  `switch-floor` in `e2e/journey-coverage.json`.

---

## Cycle 1: the active-floor scene filter (core)

**Files:** create `core/scene/scene-graph-for-floor.ts`, test
`core/scene/scene-graph-for-floor.test.ts`; export from `core/index.ts`.

RED (`scene-graph-for-floor.test.ts`): import `sceneGraphForFloor` from
'./scene-graph-for-floor' and the deriver `createSceneGraphDeriver` from
'./scene-graph-deriver' (and project factories from '../model/factories', wall/floor
creators). Build a project with two floors, a wall on floor A and a wall on floor B,
derive the full graph, then:

- `sceneGraphForFloor(graph, floorAId).walls` has length 1 and its single wall's
  `floorId` is floor A; `.rooms`/`.openings`/`.dimensions`/`.underlays`/`.stairs`
  contain only floor-A nodes; `.nodes` contains only the `floor:<A>` node and floor-A
  entity nodes (filter `nodes` by the floor node id `floor:<A>` OR by each node's
  floorId - see GREEN).
- `sceneGraphForFloor(graph, floorBId).walls` has length 1 with floorId B.
- `sceneGraphForFloor(graph, null)` returns a graph whose arrays are all empty.

GREEN (`scene-graph-for-floor.ts`): `export function sceneGraphForFloor(graph:
SceneGraph, floorId: string | null): SceneGraph`. If `floorId` is null, return a graph
with every array empty. Otherwise return a new `SceneGraph` where `walls`, `rooms`,
`underlays`, `openings`, `dimensions`, `stairs` are filtered by `node.floorId ===
floorId`, and `nodes` is filtered by `node.floorId === floorId` (the floor node and
all entity nodes for that floor carry `floorId`; confirm the floor node has a
`floorId` field - the `FloorSceneNode` in scene-graph.ts; if the floor node does not
carry `floorId`, also keep nodes whose id is `\`floor:${floorId}\``). Import the
`SceneGraph`type from './scene-graph'. Keep it a small pure function. Export`sceneGraphForFloor`from`core/index.ts` near the other scene exports.

## Cycle 2: the header wall count follows the active floor

**Files:** modify `editor/shell/editor-shell.tsx`, test `editor/shell/editor-shell.test.tsx`.

RED (`editor-shell.test.tsx`): add a test that renders the shell with a TWO-floor
project where floor 'g' (Ground) has one wall and floor 'u' (Upper) has none, active
floor 'g'. (Extend the projectWithFloor helper or add a local two-floor helper using
createFloor('Ground', { id: 'g' }) and createFloor('Upper', { id: 'u' }), and seed a
wall on 'g' via the addWall command dispatched on the session, or by constructing the
floor with a wall.) Assert the header shows 'Walls: 1'; click the 'Upper' floor button
(getByRole('button', { name: 'Upper' })); assert the header now shows 'Walls: 0'; click
'Ground'; assert 'Walls: 1' again.

GREEN (`editor-shell.tsx`): in `ShellHeader`, compute `const graph =
sceneGraphForFloor(useSceneGraph(), useActiveFloorId())` (import `sceneGraphForFloor`
from '../../core' and `useActiveFloorId` from '../../bridge') and show
`graph.walls.length`. ShellHeader already subscribes via `useSceneGraph`; add the
active-floor subscription. (This makes the visible count reflect the active floor.)

## Cycle 3: the plan renders the active floor, and the journey

**Files:** modify `editor/plan/plan-view.tsx`; create
`e2e/tests/journeys/switch-floor.spec.ts`; extend `support.ts`; flip
`journey-coverage.json`.

RED (the journey, authored first; fails until the plan is narrowed): add to
`support.ts` selectors:
`addFloorButton: (page) => page.getByRole('button', { name: 'Add floor' })`,
`floorButton: (page, name) => page.getByRole('button', { name })`,
`wallProxies: (page) => page.getByRole('option', { name: /^Wall,/ })`.
`switch-floor.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, selectors } from './support'

test('switches floors and the canvas changes', async ({ page }) => {
  await gotoEditor(page)
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expect(selectors.wallProxies(page)).toHaveCount(1)
  await selectors.addFloorButton(page).click()
  await selectors.floorButton(page, 'New Floor').click()
  await expect(selectors.wallProxies(page)).toHaveCount(0)
  await selectors.floorButton(page, 'Ground').click()
  await expect(selectors.wallProxies(page)).toHaveCount(1)
})
```

Flip `switch-floor` to `"status": "required"` in `journey-coverage.json`.

GREEN (`plan-view.tsx`): in `usePlanLayers`, change `const graph = useSceneGraph()` to
narrow to the active floor:

```ts
const fullGraph = useSceneGraph()
const activeFloorId = useActiveFloorId()
const graph = useMemo(
  () => sceneGraphForFloor(fullGraph, activeFloorId),
  [fullGraph, activeFloorId],
)
```

Add imports: `useActiveFloorId` from '../../bridge', `sceneGraphForFloor` from
'../../core', and `useMemo` from 'react' if not present. Every downstream consumer of
`graph` now sees only the active floor, so switching the floor re-derives the rendered
plan and its overlay proxies. Keep the existing `editor/plan/*.test.tsx` green.

Then verify the chromium journey (`pnpm build` + `pnpm exec playwright test
--project=chromium e2e/tests/journeys/switch-floor.spec.ts`).

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` green.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- `switch-floor` is `required` and its chromium journey passes; integration:audit
  shows 5 required / 6 pending.
- Switching the active floor changes the rendered plan and the header wall count;
  drawing on one floor does not appear on another.

## Deferred (fast-follow)

The floor switcher rename, delete, reorder, and duplicate controls (the multi-floor
commands `RENAME_FLOOR`, `REMOVE_FLOOR`, `REORDER_FLOOR` exist; duplicate would compose
or need a new command). The select-and-add switcher is sufficient for the per-floor
rendering fix and its gate; the fuller switcher is a follow-up so this slice stays a
focused bug fix.
