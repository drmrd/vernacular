# Chained Polyline Wall Drawing Implementation Plan

> **For agentic workers:** role-separated red-green-blue subagents from the main
> thread. Each cycle is `test:` -> `feat:`/`fix:` -> `refactor:`.

**Goal:** Turn the single-segment wall tool into a chained polyline draw: click to
start, click to drop each corner and continue, backspace to remove the last corner,
Enter or double-click to finish, Escape to abandon, and a click back on the first
corner to close the loop into a room.

**Architecture:** The wall tool becomes a buffering state machine. The in-progress
corners live in tool state and touch the model only on finish, when each segment
commits as its own `addWall` (so undo peels one segment at a time). Rooms are derived,
not authored, so a closed loop of committed walls becomes a room through the existing
`deriveRooms`. The run's open corners are fed to the snap chain as endpoint candidates
so the cursor lands on the first corner when the run comes back around. See ADR-0055.

**Tech Stack:** TypeScript, React, Vitest, Playwright.

---

## Cycle 1: The buffering state machine (pure)

**Files:** rewrite `editor/plan/wall-tool.ts` and its test
`editor/plan/wall-tool.test.ts`; update `editor/plan/use-plan-interaction.ts` so the
build stays green against the new API.

The wall tool's contract changes: a click no longer commits on the second press.
`WallToolState`'s `drawing` phase carries `vertices` in place of `start`, clicks
buffer, and commits are produced on finish or loop close. Each commit is one `addWall`
per segment.

### RED: `editor/plan/wall-tool.test.ts`

Replace the file with tests for the buffering machine. Import `finishWallTool`,
`backspaceWallTool`, and `wallGhostSegments` alongside the existing names; they do not
exist yet, so the suite fails to compile.

```ts
import { describe, it, expect } from 'vitest'
import {
  advanceWallTool,
  backspaceWallTool,
  cancelWallTool,
  finishWallTool,
  wallGhostSegments,
  wallPreviewSegment,
  IDLE_WALL_TOOL,
} from './wall-tool'
import { ADD_WALL, type AddWallParams, type Command } from '../../core'

const p = (x: number, y: number) => ({ x, y })
const wallOf = (command: Command) => (command as Command<AddWallParams>).params.wall

describe('advanceWallTool', () => {
  it('anchors the first corner without emitting a command', () => {
    const result = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g')

    expect(result.state).toEqual({ phase: 'drawing', vertices: [p(100, 100)] })
    expect(result.commands).toBeUndefined()
  })

  it('appends each further corner and keeps drawing without committing', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const two = advanceWallTool(one, p(500, 100), 'g')

    expect(two.state).toEqual({ phase: 'drawing', vertices: [p(100, 100), p(500, 100)] })
    expect(two.commands).toBeUndefined()
  })

  it('ignores a click on the last corner so a repeat press adds nothing', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const two = advanceWallTool(one, p(500, 100), 'g').state
    const repeat = advanceWallTool(two, p(500, 100), 'g')

    expect(repeat.state).toBe(two)
    expect(repeat.commands).toBeUndefined()
  })

  it('closes the loop on a click back on the first corner once it has three corners', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state
    const closed = advanceWallTool(state, p(0, 0), 'g')

    expect(closed.state).toEqual(IDLE_WALL_TOOL)
    const commands = closed.commands ?? []
    expect(commands).toHaveLength(3)
    expect(commands.every((command) => command.type === ADD_WALL)).toBe(true)
    expect(wallOf(commands[0]).start).toEqual(p(0, 0))
    expect(wallOf(commands[2]).start).toEqual(p(400, 400))
    expect(wallOf(commands[2]).end).toEqual(p(0, 0))
  })

  it('does not close on the first corner before there are three corners', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    const two = advanceWallTool(one, p(400, 0), 'g').state
    const back = advanceWallTool(two, p(0, 0), 'g')

    expect(back.commands).toBeUndefined()
    expect(back.state).toEqual({ phase: 'drawing', vertices: [p(0, 0), p(400, 0), p(0, 0)] })
  })
})

describe('finishWallTool', () => {
  it('commits one wall per segment of the open run and returns to idle', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state
    const finished = finishWallTool(state, 'g')

    expect(finished.state).toEqual(IDLE_WALL_TOOL)
    const commands = finished.commands ?? []
    expect(commands).toHaveLength(2)
    expect(wallOf(commands[0]).start).toEqual(p(0, 0))
    expect(wallOf(commands[0]).end).toEqual(p(400, 0))
    expect(wallOf(commands[1]).end).toEqual(p(400, 400))
  })

  it('commits nothing for a run of fewer than two corners', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    const finished = finishWallTool(one, 'g')

    expect(finished.state).toEqual(IDLE_WALL_TOOL)
    expect(finished.commands).toBeUndefined()
  })

  it('is inert on idle', () => {
    expect(finishWallTool(IDLE_WALL_TOOL, 'g')).toEqual({ state: IDLE_WALL_TOOL })
  })
})

describe('backspaceWallTool', () => {
  it('removes the last corner while two or more remain', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state

    expect(backspaceWallTool(state)).toEqual({ phase: 'drawing', vertices: [p(0, 0), p(400, 0)] })
  })

  it('returns to idle when the last remaining corner is removed', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state

    expect(backspaceWallTool(one)).toEqual(IDLE_WALL_TOOL)
  })

  it('is idempotent on idle', () => {
    expect(backspaceWallTool(IDLE_WALL_TOOL)).toEqual(IDLE_WALL_TOOL)
  })
})

describe('cancelWallTool', () => {
  it('abandons a run to idle', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(1, 2), 'g').state

    expect(cancelWallTool(one)).toEqual(IDLE_WALL_TOOL)
  })

  it('is idempotent on idle', () => {
    expect(cancelWallTool(IDLE_WALL_TOOL)).toEqual(IDLE_WALL_TOOL)
  })
})

describe('wallPreviewSegment', () => {
  it('previews from the last corner to the cursor while drawing', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state

    expect(wallPreviewSegment(state, p(400, 240))).toEqual({ start: p(400, 0), end: p(400, 240) })
    expect(wallPreviewSegment(IDLE_WALL_TOOL, p(400, 240))).toBeUndefined()
  })
})

describe('wallGhostSegments', () => {
  it('returns the committed-so-far segments of the open run', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state

    expect(wallGhostSegments(state)).toEqual([
      { start: p(0, 0), end: p(400, 0) },
      { start: p(400, 0), end: p(400, 400) },
    ])
  })

  it('is empty for a single anchored corner and for idle', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state

    expect(wallGhostSegments(one)).toEqual([])
    expect(wallGhostSegments(IDLE_WALL_TOOL)).toEqual([])
  })
})
```

- [ ] **Step 1: Write the failing test.** Replace `wall-tool.test.ts` with the above.
- [ ] **Step 2: Run it, expect failure.** `pnpm exec vitest run editor/plan/wall-tool.test.ts`. Expected: compile/type error (the new exports do not exist).

### GREEN: rewrite `editor/plan/wall-tool.ts`

```ts
import { addWall, type Command, type Point } from '../../core'

export type WallToolState = { phase: 'idle' } | { phase: 'drawing'; vertices: readonly Point[] }

export const IDLE_WALL_TOOL: WallToolState = { phase: 'idle' }

// The smallest run that a click on the first corner closes into a loop: a
// triangle is the smallest enclosed room.
const MIN_LOOP_VERTICES = 3

export interface WallToolResult {
  state: WallToolState
  commands?: readonly Command[]
}

export interface PreviewSegment {
  start: Point
  end: Point
}

// Exact equality is intentional: snapping resolves a click to fixed world
// coordinates, so a corner placed on top of another maps to identical points.
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function lastVertex(vertices: readonly Point[]): Point {
  return vertices[vertices.length - 1]
}

// The segments between consecutive corners, optionally closing back to the first.
function runSegments(vertices: readonly Point[], close: boolean): PreviewSegment[] {
  const corners = close ? [...vertices, vertices[0]] : vertices
  const segments: PreviewSegment[] = []
  for (let index = 0; index + 1 < corners.length; index += 1) {
    segments.push({ start: corners[index], end: corners[index + 1] })
  }
  return segments
}

function segmentCommands(vertices: readonly Point[], floorId: string, close: boolean): Command[] {
  return runSegments(vertices, close).map((segment) => addWall(floorId, segment.start, segment.end))
}

export function advanceWallTool(
  state: WallToolState,
  point: Point,
  floorId: string,
): WallToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'drawing', vertices: [point] } }
  }
  const { vertices } = state
  if (samePoint(point, lastVertex(vertices))) {
    return { state }
  }
  if (vertices.length >= MIN_LOOP_VERTICES && samePoint(point, vertices[0])) {
    return { state: IDLE_WALL_TOOL, commands: segmentCommands(vertices, floorId, true) }
  }
  return { state: { phase: 'drawing', vertices: [...vertices, point] } }
}

export function finishWallTool(state: WallToolState, floorId: string): WallToolResult {
  if (state.phase === 'idle' || state.vertices.length < 2) {
    return { state: IDLE_WALL_TOOL }
  }
  return { state: IDLE_WALL_TOOL, commands: segmentCommands(state.vertices, floorId, false) }
}

export function backspaceWallTool(state: WallToolState): WallToolState {
  if (state.phase === 'idle') {
    return IDLE_WALL_TOOL
  }
  const remaining = state.vertices.slice(0, -1)
  return remaining.length === 0 ? IDLE_WALL_TOOL : { phase: 'drawing', vertices: remaining }
}

// Abandon any in-progress run, returning the tool to idle. Every state cancels to
// idle, so the current state is accepted for a uniform transition signature but unread.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature; cancel ignores the current state
export function cancelWallTool(_state: WallToolState): WallToolState {
  return IDLE_WALL_TOOL
}

export function wallPreviewSegment(state: WallToolState, point: Point): PreviewSegment | undefined {
  if (state.phase === 'drawing') {
    return { start: lastVertex(state.vertices), end: point }
  }
  return undefined
}

export function wallGhostSegments(state: WallToolState): PreviewSegment[] {
  return state.phase === 'drawing' ? runSegments(state.vertices, false) : []
}
```

- [ ] **Step 3: Write the implementation.** Replace `wall-tool.ts` with the above.

### GREEN: keep `editor/plan/use-plan-interaction.ts` compiling against the new API

The old API (`state.start`, `result.command`) is gone, so the hook stops compiling.
Make the minimal edits to restore the build now; the finish, backspace, double-click,
and ghost wiring lands in Cycle 3.

Change `drawingOrigin` to read the last corner:

```ts
/** The corner the next segment draws from while drawing; absent when the tool is idle. */
function drawingOrigin(toolState: WallToolState): Point | undefined {
  return toolState.phase === 'drawing'
    ? toolState.vertices[toolState.vertices.length - 1]
    : undefined
}
```

Change `applyPointer` to dispatch the result's commands (an array now, empty until a
loop closes) and return the next state:

```ts
/** Applies a wall-tool click and returns the next wall-tool state; other tools are inert here. */
function applyPointer(world: Point, context: PointerContext): WallToolState {
  if (context.tool !== 'draw-wall') {
    return context.toolState
  }
  const floorId = context.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    return context.toolState
  }
  const result = advanceWallTool(context.toolState, world, floorId)
  result.commands?.forEach((command) => context.session.dispatch(command))
  return result.state
}
```

- [ ] **Step 4: Run the suites, expect green.** `pnpm exec vitest run editor/plan/wall-tool.test.ts` passes. `pnpm typecheck` passes.
- [ ] **Step 5: Commit.** `git add editor/plan/wall-tool.ts editor/plan/wall-tool.test.ts editor/plan/use-plan-interaction.ts` then `git commit -m "feat(editor): buffer wall-tool corners and commit per segment"`.

### BLUE

Run `/clean-code-review` then `/refactor`. Candidate: the shared `runSegments` helper
already deduplicates the segment-building loop, so the refactor is likely an empty
marker (`git commit --allow-empty -m "refactor(editor): no actionable findings for the wall-tool buffer"`).

---

## Cycle 2: Snap to the run's open corners (close affordance)

**Files:** modify `editor/plan/snap.ts` and `editor/plan/snap.test.ts`; modify
`editor/plan/use-snapping.ts`; pass the open corners from
`editor/plan/use-plan-interaction.ts`.

The open run's corners are not committed walls, so the endpoint kind cannot see them.
Add an `openVertices` input to the snap context and snap to the nearest one as an
endpoint, above the wall endpoints, so returning to the first corner beats the angle
lock and lands the cursor on it exactly.

### RED: add to `editor/plan/snap.test.ts`

```ts
it('snaps to the nearest open run corner as an endpoint, above the angle lock', () => {
  const context = {
    walls: [],
    gridSpacingMm: 100,
    toleranceMm: 20,
    origin: { x: 0, y: 0 },
    openVertices: [{ x: 500, y: 0 }],
  }

  const result = snapPoint({ x: 506, y: 5 }, context)

  expect(result).toEqual({ point: { x: 500, y: 0 }, kind: 'endpoint' })
})

it('ignores open corners outside the tolerance', () => {
  const context = {
    walls: [],
    gridSpacingMm: 100,
    toleranceMm: 20,
    openVertices: [{ x: 500, y: 0 }],
  }

  expect(snapPoint({ x: 560, y: 0 }, context)?.kind).not.toBe('endpoint')
})
```

(Confirm the existing `snap.test.ts` builds its contexts as plain objects; match that
shape. `snapPoint` and `SnapContext` are already imported there.)

- [ ] **Step 1: Write the failing tests.** Add the two `it` blocks.
- [ ] **Step 2: Run, expect failure.** `pnpm exec vitest run editor/plan/snap.test.ts`. Expected: the first fails (open corner not snapped; `kind` is `grid` or the angle lock), and a type error on `openVertices`.

### GREEN: `editor/plan/snap.ts`

Add the field to the context:

```ts
export interface SnapContext {
  walls: readonly WallSceneNode[]
  gridSpacingMm: number
  toleranceMm: number
  origin?: Point
  tracePoints?: readonly Point[]
  openVertices?: readonly Point[]
  freeAngle?: boolean
}
```

Rename `nearestTracePoint` to the generic `nearestPointWithin` (it already is "nearest
point within tolerance"), update its one existing caller, and add the open-corner check
at the top of the chain in `snapPoint`, just after the trace check:

```ts
const openCorner = nearestPointWithin(cursor, context.openVertices ?? [], context.toleranceMm)
if (openCorner !== null) {
  return { point: openCorner, kind: 'endpoint' }
}
```

- [ ] **Step 3: Implement.** Add the field, rename the helper, add the chain check.

### GREEN: `editor/plan/use-snapping.ts`

Add `openVertices` to `SnappingInputs` and spread it into `buildContext` like
`tracePoints`:

```ts
// In SnappingInputs:
// The open run's corners the cursor can snap back onto to close the loop; absent
// or empty when not drawing.
openVertices?: readonly Point[]

// In buildContext's returned object, beside the tracePoints spread:
...(openVertices && openVertices.length > 0 ? { openVertices } : {}),
```

(Add `openVertices` to the destructure in `buildContext`'s parameter.)

### GREEN: `editor/plan/use-plan-interaction.ts`

Feed the run's open corners (every corner except the one being drawn from) into
snapping. Add a small selector and pass it:

```ts
/** The earlier corners of the run the cursor can snap back onto to close the loop. */
function openCorners(toolState: WallToolState): readonly Point[] {
  return toolState.phase === 'drawing' ? toolState.vertices.slice(0, -1) : []
}

// In usePlanInteraction, extend the useSnapping call:
const snapping = useSnapping({
  walls,
  viewport,
  origin: drawingOrigin(toolState),
  ...(tracePoints ? { tracePoints } : {}),
  openVertices: openCorners(toolState),
  freeAngle,
})
```

- [ ] **Step 4: Run, expect green.** `pnpm exec vitest run editor/plan/snap.test.ts` passes; `pnpm typecheck` passes.
- [ ] **Step 5: Commit.** `git add editor/plan/snap.ts editor/plan/snap.test.ts editor/plan/use-snapping.ts editor/plan/use-plan-interaction.ts` then `git commit -m "feat(editor): snap to the open run's corners to close the loop"`.

### BLUE

Run `/clean-code-review` then `/refactor` (the helper rename is the cleanup; likely an
empty marker after that).

---

## Cycle 3: Finish, backspace, double-click, ghost, and the journey

**Files:** modify `editor/plan/use-plan-interaction.ts`,
`editor/plan/compose-pointer-handlers.ts`, `editor/plan/plan-view.tsx`; create
`e2e/tests/journeys/chained-polyline.spec.ts`; modify `e2e/tests/journeys/support.ts`.

This wires the finish (Enter and double-click), backspace, and the in-progress ghost,
and proves the whole flow end to end. The journey is the RED here, authored first, and
the shared `drawWall` helper gains an Enter so the existing journeys keep committing one
wall.

### RED: the journey and the helper

Add a `roomProxies` selector and finish the run in `drawWall` in
`e2e/tests/journeys/support.ts`:

```ts
// Add to selectors:
roomProxies: (page: Page) => page.getByRole('option', { name: /^Room,/ }),

// Update drawWall to finish the run so the tool returns to idle:
export async function drawWall(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
  await page.keyboard.press('Enter')
}
```

Create `e2e/tests/journeys/chained-polyline.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors } from './support'

test('draws a chained polyline and closes it into a room', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  await canvas.click({ position: { x: 160, y: 160 } }) // first corner
  await canvas.click({ position: { x: 460, y: 160 } })
  await canvas.click({ position: { x: 460, y: 360 } })
  await canvas.click({ position: { x: 200, y: 360 } }) // a mis-placed corner
  await page.keyboard.press('Backspace') // take it back
  await canvas.click({ position: { x: 160, y: 360 } }) // the real fourth corner
  await canvas.click({ position: { x: 160, y: 160 } }) // back on the first corner closes the loop

  await expectWallCount(page, 4)
  await expect(selectors.roomProxies(page)).toHaveCount(1)
})

test('finishes an open run with a double-click and extends it from an endpoint', async ({
  page,
}) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  await canvas.click({ position: { x: 160, y: 200 } })
  await canvas.click({ position: { x: 360, y: 200 } })
  await canvas.dblclick({ position: { x: 360, y: 360 } }) // commit the corner and finish
  await expectWallCount(page, 2)
  await expect(selectors.roomProxies(page)).toHaveCount(0)

  // Extend: start a new run on the free endpoint and add one segment.
  await canvas.click({ position: { x: 360, y: 360 } }) // snaps to the committed endpoint
  await canvas.click({ position: { x: 560, y: 360 } })
  await page.keyboard.press('Enter')
  await expectWallCount(page, 3)
})
```

- [ ] **Step 1: Write the failing journey + helper change.**
- [ ] **Step 2: Build and run, expect failure.** `pnpm build` then
      `pnpm exec playwright test --project=chromium e2e/tests/journeys/chained-polyline.spec.ts`.
      Expected: fails (no finish wiring, so corners never commit; the ghost does not paint).

### GREEN: `editor/plan/use-plan-interaction.ts`

Replace `useCancelWallOnEscape` with a keyboard hook that also handles Enter (finish)
and Backspace (remove the last corner), add a `finish` callback and an `onDoubleClick`,
and expose the ghost. Read the current state through a ref so the finish handlers never
go stale and the keyboard effect keeps a stable subscription.

```ts
// Imports: add finishWallTool, backspaceWallTool, wallGhostSegments, type PreviewSegment
// from './wall-tool'; add useRef from 'react'.

function activeFloorId(session: EditorSession): string | undefined {
  return session.getProject().floors[0]?.id
}

interface WallKeyboardDeps {
  tool: ToolId
  finish: () => void
  snapping: Snapping
  setToolState: (updater: (state: WallToolState) => WallToolState) => void
  setPointer: (pointer: Point | null) => void
}

/** Escape abandons the run, Enter finishes it, and Backspace removes the last corner. */
function useWallKeyboard({
  tool,
  finish,
  snapping,
  setToolState,
  setPointer,
}: WallKeyboardDeps): void {
  useEffect(() => {
    if (tool !== 'draw-wall') {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setToolState(cancelWallTool)
        setPointer(null)
        snapping.clear()
      } else if (event.key === 'Enter') {
        finish()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        setToolState(backspaceWallTool)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool, finish, snapping, setToolState, setPointer])
}
```

In `usePlanInteraction`, add the ref, the `finish` callback, the double-click handler,
the ghost, and swap the keyboard hook:

```ts
const toolStateRef = useRef(toolState)
toolStateRef.current = toolState

const finish = useCallback(() => {
  const floorId = activeFloorId(session)
  if (floorId === undefined) {
    return
  }
  const result = finishWallTool(toolStateRef.current, floorId)
  result.commands?.forEach((command) => session.dispatch(command))
  setToolState(result.state)
  setPointer(null)
  snapping.clear()
}, [session, snapping])

useWallKeyboard({ tool, finish, snapping, setToolState, setPointer })

const onDoubleClick = useCallback(() => {
  if (tool === 'draw-wall') {
    finish()
  }
}, [tool, finish])

const ghost = tool === 'draw-wall' ? wallGhostSegments(toolState) : []
```

Delete the old `useCancelWallOnEscape` function and its call. Add `ghost` and
`onDoubleClick` to the `PlanInteraction` interface and the returned object:

```ts
export interface PlanInteraction {
  preview: PreviewSegment | undefined
  ghost: PreviewSegment[]
  snap: SnapResult | null
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onDoubleClick: () => void
  onPointerLeave: () => void
}

// return { preview, ghost, snap, onPointerDown, onPointerMove, onDoubleClick, onPointerLeave }
```

(`PreviewSegment` is imported from `./wall-tool`; it is structurally the same shape the
`draw-plan` ghost channel expects.)

### GREEN: `editor/plan/compose-pointer-handlers.ts`

Add `onDoubleClick` to the composed handlers, delegating to the wall interaction:

```ts
export interface ComposedPointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
  onDoubleClick: () => void
  onPointerLeave: () => void
}

// In the returned object:
onDoubleClick: () => interaction.onDoubleClick(),
```

### GREEN: `editor/plan/plan-view.tsx`

Feed the wall ghost into the scene (the wall run and the move drag never overlap, since
each is gated on its own tool) and wire the canvas double-click:

```ts
// In buildScene, replace the ghost line:
ghost: interaction.ghost.length > 0 ? interaction.ghost : inputs.selectionMove.ghost,

// On the <canvas>, add:
onDoubleClick={pointerHandlers.onDoubleClick}
```

- [ ] **Step 3: Implement the wiring above.**
- [ ] **Step 4: Build and run the journey, expect green.** `pnpm build` then
      `pnpm exec playwright test --project=chromium e2e/tests/journeys/chained-polyline.spec.ts`.
      Then re-run the rest: `pnpm exec playwright test --project=chromium e2e/tests/journeys`.
      Expected: all journeys pass (the `drawWall` Enter keeps the single-wall journeys green).
- [ ] **Step 5: Commit.** `git add editor/plan/use-plan-interaction.ts editor/plan/compose-pointer-handlers.ts editor/plan/plan-view.tsx e2e/tests/journeys/chained-polyline.spec.ts e2e/tests/journeys/support.ts` then `git commit -m "feat(editor): finish, backspace, and double-click the chained wall draw"`.

### BLUE

Run `/clean-code-review` then `/refactor`. Watch the function-length limit on
`usePlanInteraction`; if it crosses 40 lines, extract the finish callback into a small
`useWallFinish` hook. Land a marker commit if there are no actionable findings.

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` all green (lint reports zero problems, warnings included).
- `pnpm rgb:audit --range "origin/main..HEAD"` clean (each cycle is test -> feat -> refactor).
- `pnpm integration:audit` still shows 10 required covered, 1 pending; the new
  chained-polyline journey is an extra, not a tracked capability, so
  `e2e/journey-coverage.json` does not change.
- The chained-polyline chromium journey passes, and every existing journey still passes
  behind the updated `drawWall` helper.
- Drawing: a click starts a run, each further click drops a corner, Backspace removes the
  last corner, Enter or a double-click finishes, Escape abandons, and a click back on the
  first corner closes the loop into a room. Undo removes one segment at a time.

## Out of scope (later slices)

- A snap-indicator readout or live-region announcement specific to "close the loop"; the
  start marker is the close affordance for now.
- The precision snapping panel, which will govern the open-corner endpoint kind alongside
  the others as an explicit toggle.
- Endpoint re-editing of a finished run (already its own slice, `edit-endpoint`).
