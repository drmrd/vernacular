# Wall-Drawing Proof of Life Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md rules 14-15), not a single-implementer flow. Each behavior task runs RED (test-author writes a failing test), GREEN (implementer writes the minimal pass), then BLUE (clean-code-reviewer audits, refactorer applies fixes, a `refactor:` marker commit closes the phase). Tasks marked `(infrastructure)` are controller-authored glue (barrels, coverage config, untestable browser/canvas/async glue, the end-to-end spec) and carry no RGB triple; they are reviewed by the clean-code-reviewer and validated by the end-to-end spec. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first end-to-end user flow: draw a wall on a 2D plan surface, have it dispatched as a command, derived into the scene graph, rendered on a Canvas, autosaved to IndexedDB, and restored on reload. Selection state enters `bridge/` for the first time.

**Architecture:** A `Wall` entity and an `addWall` command join `core/`; the pure scene graph gains wall nodes alongside floor nodes. `bridge/` grows a change-subscription on the editor session, a selection store, an IndexedDB autosave orchestration, and an async project bootstrap. `storage/` gains a real `IndexedDbProjectStore`. `editor/` gains a Canvas-based 2D plan view with a wall-drawing tool, a tool switcher, hit testing, and selection display. `app/` becomes an async composition root that loads the project, wires autosave, and renders the workspace. The flow honors the one-way data path from the design specification (section 6.4): interaction to command to model to derived scene graph to renderers.

**Tech Stack:** TypeScript (strict), React 19, the existing command/scene-graph core, Canvas 2D for the plan bulk, IndexedDB for persistence, Vitest for units, Playwright for the end-to-end acceptance.

**Scope boundary (design specification, section 10, Phase 0 acceptance and out-of-scope):** In scope: wall drawing, IndexedDB autosave, reload restores the last-drawn wall, selection entering `bridge/`. Out of scope and deliberately deferred: snapping, dimensions, openings, 3D rendering of walls, pan and zoom, multi-floor, multi-select, persistence to the user filesystem, selection persistence. The 2D plan surface uses a fixed-size Canvas; responsive sizing and an infinite pannable canvas are Phase 1.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  model/types.ts            (modify)  Point, Wall; walls[] on Floor
  model/factories.ts        (modify)  DEFAULT_WALL_THICKNESS_MM, createWall, walls init
  commands/handlers/wall-commands.ts   (create)  addWall + handler + registerWallCommands
  scene/scene-graph.ts      (modify)  WallSceneNode, deriveWallNode, walls on SceneGraph
  scene/scene-graph-deriver.ts (modify) memoize wall nodes by Wall reference
  index.ts                  (modify, infra)  barrel exports

bridge/
  session/editor-session.ts (modify)  subscribe(), stable getSceneGraph, register wall commands
  session/load-or-create-project.ts (create)  async bootstrap helper
  selection/selection-store.ts (create)  createSelectionStore
  autosave/create-autosave.ts (create)  debounced IndexedDB autosave orchestration
  react/selection-context.ts (create)  SelectionContext + useSelection + useSelectionIds
  react/selection-provider.tsx (create)  SelectionProvider
  react/use-scene-graph.ts  (create, infra)  useSyncExternalStore hook
  react/use-autosave.ts     (create, infra)  autosave status hook
  index.ts                  (modify, infra)  barrel exports

storage/
  indexeddb/indexeddb-project-store.ts (create, infra)  IndexedDbProjectStore + factory
  index.ts                  (modify, infra)  barrel exports

editor/
  plan/viewport.ts          (create)  worldToScreen / screenToWorld
  plan/wall-tool.ts         (create)  advanceWallTool state machine
  plan/hit-test.ts          (create)  hitTestWalls
  plan/draw-plan.ts         (create)  drawPlan(ctx, options)
  plan/plan-view.tsx        (create, infra)  Canvas + pointer glue
  tools/active-tool-context.ts (create)  ActiveToolContext + useActiveTool
  tools/active-tool-provider.tsx (create)  ActiveToolProvider
  tools/tools-panel.tsx     (create)  tool switcher
  shell/editor-shell.tsx    (modify)  wall count, save status, plan view, 3D preview, inspector
  index.ts                  (modify, infra)  barrel exports

app/
  app.tsx                   (modify)  async bootstrap, providers, autosave wiring, injectable store

e2e/tests/
  wall-drawing.spec.ts      (create, infra)  proof-of-life acceptance

vite.config.ts              (modify, infra)  coverage excludes for new glue
ROADMAP.md                  (modify, infra)  mark proof of life done
```

---

## Section A: core domain

### Task 1: Wall entity and factory

**Files:**

- Modify: `core/model/types.ts`
- Modify: `core/model/factories.ts`
- Test: `core/model/factories.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `core/model/factories.test.ts`:

```ts
import { createWall, DEFAULT_WALL_THICKNESS_MM } from './factories'

describe('createWall', () => {
  it('builds a wall from two points with the default thickness', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })

    expect(wall.start).toEqual({ x: 0, y: 0 })
    expect(wall.end).toEqual({ x: 1000, y: 0 })
    expect(wall.thickness).toBe(DEFAULT_WALL_THICKNESS_MM)
    expect(wall.id).toMatch(/.+/)
  })

  it('mints a unique id per wall and honors an explicit id and thickness', () => {
    const first = createWall({ x: 0, y: 0 }, { x: 1, y: 1 })
    const second = createWall({ x: 0, y: 0 }, { x: 1, y: 1 })
    const fixed = createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'w1', thickness: 200 })

    expect(first.id).not.toBe(second.id)
    expect(fixed.id).toBe('w1')
    expect(fixed.thickness).toBe(200)
  })
})

describe('createFloor walls', () => {
  it('initializes a floor with an empty walls array', () => {
    expect(createFloor('Ground').walls).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/model/factories.test.ts`
Expected: FAIL (`createWall` is not exported; `walls` is undefined on the floor).

- [ ] **Step 3: Write the minimal implementation**

In `core/model/types.ts`, add the `Point` and `Wall` types and a `walls` field on `Floor`:

```ts
/** A point in floor-plan space, in millimeters. x increases rightward, y increases upward. */
export interface Point {
  x: number
  y: number
}

export interface Wall {
  id: string
  start: Point
  end: Point
  /** Wall thickness in millimeters. */
  thickness: number
}
```

Add `walls: Wall[]` to the `Floor` interface (after `defaultCeilingHeight`):

```ts
export interface Floor {
  id: string
  name: string
  /** Elevation of the finished floor surface, in millimeters. */
  elevation: number
  /** Default ceiling height for rooms on this floor, in millimeters. */
  defaultCeilingHeight: number
  walls: Wall[]
}
```

In `core/model/factories.ts`, add the thickness constant, the wall factory, and initialize `walls`:

```ts
import type { EraId, Floor, Point, Project, UnitSystem, Wall } from './types'

// A nominal interior partition: a 2x4 stud wall (89 mm) with finish on both
// faces lands near 114 mm. Period plaster-and-lath walls are thicker; wall
// construction types arrive in Phase 1, so a single default suffices here.
export const DEFAULT_WALL_THICKNESS_MM = 114

export interface NewWallOptions {
  id?: string
  thickness?: number
}

export function createWall(start: Point, end: Point, options: NewWallOptions = {}): Wall {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    start,
    end,
    thickness: options.thickness ?? DEFAULT_WALL_THICKNESS_MM,
  }
}
```

Add `walls` to `NewFloorOptions` and to the `createFloor` return:

```ts
export interface NewFloorOptions {
  id?: string
  elevation?: number
  defaultCeilingHeight?: number
  walls?: Wall[]
}

export function createFloor(name: string, options: NewFloorOptions = {}): Floor {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    elevation: options.elevation ?? 0,
    defaultCeilingHeight: options.defaultCeilingHeight ?? DEFAULT_CEILING_HEIGHT_MM,
    walls: options.walls ?? [],
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/model/factories.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)**

Commit the RED test, then the GREEN implementation, then the BLUE `refactor:` marker, as three commits following the cycle.

### Task 2: addWall command and handler

**Files:**

- Create: `core/commands/handlers/wall-commands.ts`
- Test: `core/commands/handlers/wall-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `core/commands/handlers/wall-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addWall, registerWallCommands, ADD_WALL } from './wall-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor } from '../../model/factories'
import type { Project } from '../../model/types'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerWallCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('addWall', () => {
  it('appends a wall to the named floor', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1000, y: 0 }))

    expect(project.floors[0]?.walls).toHaveLength(1)
    expect(project.floors[0]?.walls[0]?.start).toEqual({ x: 0, y: 0 })
    expect(project.floors[0]?.walls[0]?.end).toEqual({ x: 1000, y: 0 })
  })

  it('reuses the same wall id on redo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1000, y: 0 }))
    const drawnId = project.floors[0]?.walls[0]?.id

    dispatcher.undo()
    dispatcher.redo()

    expect(project.floors[0]?.walls[0]?.id).toBe(drawnId)
  })

  it('leaves other floors untouched and carries a stable command type', () => {
    const project = projectWithFloor()
    project.floors = [...project.floors, createFloor('Upper', { id: 'u' })]
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(addWall('g', { x: 0, y: 0 }, { x: 1, y: 1 }))

    expect(project.floors[1]?.walls).toHaveLength(0)
    expect(addWall('g', { x: 0, y: 0 }, { x: 1, y: 1 }).type).toBe(ADD_WALL)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/wall-commands.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation**

Create `core/commands/handlers/wall-commands.ts`:

```ts
import { createWall } from '../../model/factories'
import type { Point, Project, Wall } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_WALL = 'floor/add-wall'

export interface AddWallParams {
  floorId: string
  wall: Wall
}

export function addWall(floorId: string, start: Point, end: Point): Command<AddWallParams> {
  // Build the wall eagerly at command-creation time so its id is fixed once and
  // redo reapplies the same wall rather than minting a new id, mirroring addFloor.
  return {
    type: ADD_WALL,
    params: { floorId, wall: createWall(start, end) },
    description: 'Draw wall',
  }
}

// Reassigns the whole floors slice because the inverse-capture proxy records
// only the root's top-level properties; the edited floor becomes a new object
// while untouched floors keep their reference for entity-keyed dirty tracking.
const addWallHandler: CommandHandler<Project, AddWallParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, walls: [...floor.walls, params.wall] } : floor,
    )
  },
}

export function registerWallCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry.register(ADD_WALL, addWallHandler)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/wall-commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 3: Scene graph wall nodes

**Files:**

- Modify: `core/scene/scene-graph.ts`
- Modify: `core/scene/scene-graph-deriver.ts`
- Test: `core/scene/scene-graph.test.ts`
- Test: `core/scene/scene-graph-deriver.test.ts`
- Test (fixture maintenance): `engine/scene/build-scene.test.ts`

Design note: `SceneGraph` gains a sibling `walls: WallSceneNode[]` array. `nodes` stays floor-only, so `buildScene` and the existing floor tests are unaffected at runtime. The `SceneGraph` type gains a required `walls` field, so the engine `build-scene.test.ts` fixture (which constructs a `SceneGraph` literal) must add `walls: []` to keep `pnpm typecheck` clean. Vitest does not type-check, so the RED run is unaffected by that fixture edit.

- [ ] **Step 1: Write the failing tests**

Append to `core/scene/scene-graph.test.ts`:

```ts
import { createWall } from '../model/factories'
import { deriveWallNode } from './scene-graph'

describe('deriveSceneGraph walls', () => {
  it('derives a namespaced wall node per wall, carrying its floor id and geometry', () => {
    const project = projectWithFloors()
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    project.floors[0]!.walls = [wall]

    const graph = deriveSceneGraph(project)

    expect(graph.walls).toHaveLength(1)
    expect(graph.walls[0]).toEqual({
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thickness: wall.thickness,
    })
  })

  it('deriveWallNode namespaces the wall id under its source wall', () => {
    const floor = createFloor('Ground', { id: 'g' })
    const node = deriveWallNode(floor, createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'w9' }))

    expect(node.id).toBe('wall:w9')
    expect(node.floorId).toBe('g')
  })
})
```

Append to `core/scene/scene-graph-deriver.test.ts`:

```ts
import { createWall } from '../model/factories'

describe('createSceneGraphDeriver walls', () => {
  it('reuses wall node references for unchanged walls', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'w1' })
    const ground = createFloor('Ground', { id: 'g', walls: [wall] })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground]))
    const second = derive(projectWith([ground]))

    expect(second.walls[0]).toBe(first.walls[0])
  })

  it('rebuilds the wall node when the wall is replaced', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'w1' })
    const ground = createFloor('Ground', { id: 'g', walls: [wall] })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground]))
    const movedWall = { ...wall, end: { x: 2, y: 0 } }
    const moved = createFloor('Ground', { id: 'g', walls: [movedWall] })
    const second = derive(projectWith([moved]))

    expect(second.walls[0]).not.toBe(first.walls[0])
    expect(second.walls[0]!.end).toEqual({ x: 2, y: 0 })
  })
})
```

In `engine/scene/build-scene.test.ts`, add `walls: []` to the `SceneGraph` literal so it satisfies the new type:

```ts
const graph: SceneGraph = {
  nodes: [
    { id: 'floor:a', kind: 'floor', name: 'Ground', elevation: 0 },
    { id: 'floor:b', kind: 'floor', name: 'Upper', elevation: 2700 },
  ],
  walls: [],
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run core/scene/scene-graph.test.ts core/scene/scene-graph-deriver.test.ts`
Expected: FAIL (`deriveWallNode` missing; `graph.walls` undefined).

- [ ] **Step 3: Write the minimal implementation**

In `core/scene/scene-graph.ts`:

```ts
import type { Floor, Point, Project, Wall } from '../model/types'

const FLOOR_NODE_PREFIX = 'floor:'
const WALL_NODE_PREFIX = 'wall:'

export interface SceneNode {
  id: string
  kind: 'floor'
  name: string
  elevation: number
}

export interface WallSceneNode {
  id: string
  kind: 'wall'
  floorId: string
  start: Point
  end: Point
  thickness: number
}

export interface SceneGraph {
  nodes: SceneNode[]
  walls: WallSceneNode[]
}

export function deriveFloorNode(floor: Floor): SceneNode {
  return {
    id: `${FLOOR_NODE_PREFIX}${floor.id}`,
    kind: 'floor',
    name: floor.name,
    elevation: floor.elevation,
  }
}

export function deriveWallNode(floor: Floor, wall: Wall): WallSceneNode {
  return {
    id: `${WALL_NODE_PREFIX}${wall.id}`,
    kind: 'wall',
    floorId: floor.id,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
  }
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => deriveWallNode(floor, wall)),
    ),
  }
}
```

In `core/scene/scene-graph-deriver.ts`, add a second cache keyed by `Wall` reference:

```ts
import { deriveFloorNode, deriveWallNode } from './scene-graph'
import type { Floor, Project, Wall } from '../model/types'
import type { SceneGraph, SceneNode, WallSceneNode } from './scene-graph'

/**
 * Builds a stateful deriver that memoizes each floor's and wall's scene node by
 * the source object's reference. This is the entity-keyed dirty tracking from
 * the design specification, sections 6.1 and 6.10: re-deriving reuses cached
 * nodes for entities whose reference is unchanged and rebuilds only replaced
 * ones. It pairs with the immutable-update handler convention, where an edited
 * floor or wall becomes a new object while untouched ones keep their reference.
 * The WeakMaps are keyed by the source object so dropped entities do not leak.
 */
export function createSceneGraphDeriver(): (project: Project) => SceneGraph {
  const floorCache = new WeakMap<Floor, SceneNode>()
  const wallCache = new WeakMap<Wall, WallSceneNode>()

  const floorNodeFor = (floor: Floor): SceneNode => {
    const cached = floorCache.get(floor)
    if (cached !== undefined) {
      return cached
    }
    const node = deriveFloorNode(floor)
    floorCache.set(floor, node)
    return node
  }

  const wallNodeFor = (floor: Floor, wall: Wall): WallSceneNode => {
    const cached = wallCache.get(wall)
    if (cached !== undefined) {
      return cached
    }
    const node = deriveWallNode(floor, wall)
    wallCache.set(wall, node)
    return node
  }

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run core/scene engine/scene`
Expected: PASS (including the updated build-scene fixture).

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 4: Core barrel exports (infrastructure)

**Files:**

- Modify: `core/index.ts`

- [ ] **Step 1: Add exports**

Append the new public symbols to `core/index.ts`:

```ts
export type { Point, Wall } from './model/types'
export type { NewWallOptions } from './model/factories'
export { DEFAULT_WALL_THICKNESS_MM, createWall } from './model/factories'
export type { AddWallParams } from './commands/handlers/wall-commands'
export { ADD_WALL, addWall, registerWallCommands } from './commands/handlers/wall-commands'
export type { WallSceneNode } from './scene/scene-graph'
export { deriveWallNode } from './scene/scene-graph'
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm exec vitest run core`
Expected: clean; all core tests pass.

- [ ] **Step 3: Commit (controller)**

```bash
git commit -m "feat(core): export wall entity, command, and scene node"
```

---

## Section B: bridge session, selection, autosave

### Task 5: Editor session change subscription and stable scene graph

**Files:**

- Modify: `bridge/session/editor-session.ts`
- Test: `bridge/session/editor-session.test.ts`

Design note: `getSceneGraph()` must return a stable reference between mutations so a `useSyncExternalStore` consumer does not loop. The session tracks a version counter, bumps it on each state-changing operation, and memoizes the derived graph by version. The session also registers the wall commands so `addWall` dispatches through the boundary.

- [ ] **Step 1: Write the failing test**

Append to `bridge/session/editor-session.test.ts`:

```ts
import { addWall } from '../../core'

describe('createEditorSession subscription', () => {
  it('returns a stable scene graph reference until the next mutation', () => {
    const session = createEditorSession(emptyProject())

    const before = session.getSceneGraph()
    expect(session.getSceneGraph()).toBe(before)

    session.dispatch(addFloor('Ground'))
    expect(session.getSceneGraph()).not.toBe(before)
  })

  it('notifies subscribers on dispatch, undo, and redo, and stops after unsubscribe', () => {
    const session = createEditorSession(emptyProject())
    let notifications = 0
    const unsubscribe = session.subscribe(() => {
      notifications += 1
    })

    session.dispatch(addFloor('Ground'))
    session.undo()
    session.redo()
    expect(notifications).toBe(3)

    unsubscribe()
    session.dispatch(addFloor('Upper'))
    expect(notifications).toBe(3)
  })

  it('does not notify when undo or redo is a no-op', () => {
    const session = createEditorSession(emptyProject())
    let notifications = 0
    session.subscribe(() => {
      notifications += 1
    })

    expect(session.undo()).toBe(false)
    expect(session.redo()).toBe(false)
    expect(notifications).toBe(0)
  })

  it('dispatches wall commands through the boundary', () => {
    const project = emptyProject()
    project.floors = [createFloor('Ground', { id: 'g' })]
    const session = createEditorSession(project)

    session.dispatch(addWall('g', { x: 0, y: 0 }, { x: 500, y: 0 }))

    expect(session.getSceneGraph().walls).toHaveLength(1)
  })
})
```

Add `createFloor` to the existing import from `'../../core'` in that test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: FAIL (`subscribe` missing; scene graph reference is not stable; wall command unregistered).

- [ ] **Step 3: Write the minimal implementation**

Replace `bridge/session/editor-session.ts`:

```ts
import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerProjectCommands,
  registerWallCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'

/**
 * The dispatch boundary: the only bridge-layer entry point through which the
 * model changes. Consumers dispatch commands; they do not mutate the project
 * directly. Subscribers are notified after each state-changing operation.
 */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  getProject(): Readonly<Project>
  /**
   * Returns the derived scene graph, memoized by an internal version so the
   * reference is stable between mutations. This makes it safe to use directly
   * as a `useSyncExternalStore` snapshot.
   */
  getSceneGraph(): SceneGraph
  /** Registers a change listener. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export function createEditorSession(project: Project): EditorSession {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  registerWallCommands(registry)
  const dispatcher = new Dispatcher<Project>(project, registry)
  const derive = createSceneGraphDeriver()
  const listeners = new Set<() => void>()

  let version = 0
  let snapshotVersion = -1
  let snapshot: SceneGraph | undefined

  const notify = (): void => {
    version += 1
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    dispatch(command) {
      dispatcher.dispatch(command)
      notify()
    },
    undo() {
      const changed = dispatcher.undo()
      if (changed) {
        notify()
      }
      return changed
    },
    redo() {
      const changed = dispatcher.redo()
      if (changed) {
        notify()
      }
      return changed
    },
    getProject: () => project,
    getSceneGraph() {
      if (snapshot === undefined || snapshotVersion !== version) {
        snapshot = derive(project)
        snapshotVersion = version
      }
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 6: Selection store and React context

**Files:**

- Create: `bridge/selection/selection-store.ts`
- Create: `bridge/react/selection-context.ts`
- Create: `bridge/react/selection-provider.tsx`
- Test: `bridge/selection/selection-store.test.ts`
- Test: `bridge/react/selection-context.test.tsx`

Design note: selection lives in `bridge/`, is shared across views, and is not part of undo history (design specification, sections 6.5, 6.9, 7.1). The store holds an immutable `Set` of scene-node ids and replaces it on every change so `getSelectedIds()` is a stable reference between changes (safe for `useSyncExternalStore`). Proof of life is single-select; the `Set` shape leaves room for multi-select in Phase 1.

- [ ] **Step 1: Write the failing tests**

Create `bridge/selection/selection-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSelectionStore } from './selection-store'

describe('createSelectionStore', () => {
  it('selects a single id, replacing any prior selection', () => {
    const store = createSelectionStore()

    store.select('wall:a')
    expect([...store.getSelectedIds()]).toEqual(['wall:a'])
    store.select('wall:b')
    expect([...store.getSelectedIds()]).toEqual(['wall:b'])
  })

  it('clears the selection', () => {
    const store = createSelectionStore()
    store.select('wall:a')

    store.clear()
    expect(store.getSelectedIds().size).toBe(0)
  })

  it('returns a stable reference until the selection changes', () => {
    const store = createSelectionStore()
    const empty = store.getSelectedIds()

    expect(store.getSelectedIds()).toBe(empty)
    store.select('wall:a')
    expect(store.getSelectedIds()).not.toBe(empty)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const store = createSelectionStore()
    let count = 0
    const unsubscribe = store.subscribe(() => {
      count += 1
    })

    store.select('wall:a')
    store.clear()
    expect(count).toBe(2)

    unsubscribe()
    store.select('wall:b')
    expect(count).toBe(2)
  })
})
```

Create `bridge/react/selection-context.test.tsx`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { createSelectionStore } from '../selection/selection-store'
import { SelectionProvider } from './selection-provider'
import { useSelection, useSelectionIds } from './selection-context'

afterEach(cleanup)

function SelectionReadout() {
  const selection = useSelection()
  const ids = useSelectionIds()
  return (
    <button type="button" onClick={() => selection.select('wall:a')}>
      {ids.size === 0 ? 'none' : [...ids].join(',')}
    </button>
  )
}

describe('SelectionProvider', () => {
  it('shares a selection store and re-renders consumers on change', () => {
    const store = createSelectionStore()
    render(
      <SelectionProvider store={store}>
        <SelectionReadout />
      </SelectionProvider>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('none')
    act(() => {
      store.select('wall:a')
    })
    expect(screen.getByRole('button')).toHaveTextContent('wall:a')
  })

  it('throws when useSelection is used outside a provider', () => {
    function Orphan() {
      useSelection()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/SelectionProvider/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run bridge/selection bridge/react/selection-context.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the minimal implementation**

Create `bridge/selection/selection-store.ts`:

```ts
export interface SelectionStore {
  getSelectedIds(): ReadonlySet<string>
  isSelected(id: string): boolean
  select(id: string): void
  clear(): void
  subscribe(listener: () => void): () => void
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set()

export function createSelectionStore(): SelectionStore {
  let selected: ReadonlySet<string> = EMPTY_SELECTION
  const listeners = new Set<() => void>()

  const setSelected = (next: ReadonlySet<string>): void => {
    selected = next
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSelectedIds: () => selected,
    isSelected: (id) => selected.has(id),
    select: (id) => setSelected(new Set([id])),
    clear: () => setSelected(EMPTY_SELECTION),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

Create `bridge/react/selection-context.ts`:

```ts
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SelectionStore } from '../selection/selection-store'

export const SelectionContext = createContext<SelectionStore | null>(null)

export function useSelection(): SelectionStore {
  const store = useContext(SelectionContext)
  if (store === null) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return store
}

export function useSelectionIds(): ReadonlySet<string> {
  const store = useSelection()
  return useSyncExternalStore(store.subscribe, store.getSelectedIds)
}
```

Create `bridge/react/selection-provider.tsx`:

```ts
import type { ReactNode } from 'react'
import type { SelectionStore } from '../selection/selection-store'
import { SelectionContext } from './selection-context'

export interface SelectionProviderProps {
  store: SelectionStore
  children: ReactNode
}

export function SelectionProvider({ store, children }: SelectionProviderProps) {
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run bridge/selection bridge/react/selection-context.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 7: Debounced IndexedDB autosave orchestration

**Files:**

- Create: `bridge/autosave/create-autosave.ts`
- Test: `bridge/autosave/create-autosave.test.ts`

Design note: the orchestration subscribes to the session, debounces, and persists through any `ProjectStore` (here the IndexedDB one; the in-memory store stands in for the unit test). It reports status transitions so the UI can show a save indicator and the end-to-end test can wait on a condition rather than a timer. The 1.5s/30s policy from section 5.4 is Phase 1; proof of life uses a single short debounce.

- [ ] **Step 1: Write the failing test**

Create `bridge/autosave/create-autosave.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './create-autosave'
import { createEditorSession } from '../session/editor-session'
import { InMemoryProjectStore } from '../../storage'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({ name: 'Test', units: 'metric', era: 'modern', appVersion: '0.0.0' })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createAutosave', () => {
  it('saves the project after the debounce window and reports status', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const statuses: string[] = []
    const autosave = createAutosave(session, store, 'current', {
      delayMs: 500,
      onStatusChange: (status) => statuses.push(status),
    })

    session.dispatch(addFloor('Ground'))
    expect(statuses).toEqual(['pending'])

    await vi.advanceTimersByTimeAsync(500)
    expect(statuses).toEqual(['pending', 'saved'])
    expect((await store.load('current')).floors).toHaveLength(1)

    autosave.dispose()
  })

  it('coalesces rapid edits into a single save', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')
    const autosave = createAutosave(session, store, 'current', { delayMs: 500 })

    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(200)
    session.dispatch(addFloor('Upper'))
    await vi.advanceTimersByTimeAsync(500)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect((await store.load('current')).floors).toHaveLength(2)

    autosave.dispose()
  })

  it('stops saving after dispose', async () => {
    const session = createEditorSession(emptyProject())
    const store = new InMemoryProjectStore()
    const saveSpy = vi.spyOn(store, 'save')
    const autosave = createAutosave(session, store, 'current', { delayMs: 500 })

    autosave.dispose()
    session.dispatch(addFloor('Ground'))
    await vi.advanceTimersByTimeAsync(500)

    expect(saveSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/autosave/create-autosave.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

Create `bridge/autosave/create-autosave.ts`:

```ts
import type { ProjectStore } from '../../storage'
import type { EditorSession } from '../session/editor-session'

export type AutosaveStatus = 'idle' | 'pending' | 'saved'

export const DEFAULT_AUTOSAVE_DELAY_MS = 500

export interface AutosaveOptions {
  delayMs?: number
  onStatusChange?: (status: AutosaveStatus) => void
}

export interface Autosave {
  dispose(): void
}

export function createAutosave(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
  options: AutosaveOptions = {},
): Autosave {
  const delayMs = options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS
  const report = options.onStatusChange ?? (() => {})
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = (): void => {
    void store.save(projectId, session.getProject()).then(() => report('saved'))
  }

  const unsubscribe = session.subscribe(() => {
    report('pending')
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(persist, delayMs)
  })

  return {
    dispose() {
      unsubscribe()
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bridge/autosave/create-autosave.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 8: Project bootstrap helper

**Files:**

- Create: `bridge/session/load-or-create-project.ts`
- Test: `bridge/session/load-or-create-project.test.ts`

Design note: on startup the app loads the saved project if present, otherwise falls back to a freshly created one. The store throws when the id is absent (the `ProjectStore` contract), so the helper treats a load failure as "no saved project."

- [ ] **Step 1: Write the failing test**

Create `bridge/session/load-or-create-project.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadOrCreateProject } from './load-or-create-project'
import { InMemoryProjectStore } from '../../storage'
import { createEmptyProject, type Project } from '../../core'

function fallback(): Project {
  return createEmptyProject({
    name: 'Fresh',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
}

describe('loadOrCreateProject', () => {
  it('returns the fallback when nothing is stored', async () => {
    const store = new InMemoryProjectStore()

    const project = await loadOrCreateProject(store, 'current', fallback)

    expect(project.meta.name).toBe('Fresh')
  })

  it('returns the stored project when present', async () => {
    const store = new InMemoryProjectStore()
    const saved = createEmptyProject({
      name: 'Saved',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.0.0',
    })
    await store.save('current', saved)

    const project = await loadOrCreateProject(store, 'current', fallback)

    expect(project.meta.name).toBe('Saved')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/session/load-or-create-project.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

Create `bridge/session/load-or-create-project.ts`:

```ts
import type { ProjectStore } from '../../storage'
import type { Project } from '../../core'

/**
 * Loads the saved project, falling back to a freshly created one when the store
 * has nothing under the id. The store rejects an absent id, so a failed load is
 * treated as "no saved project yet" rather than a hard error.
 */
export async function loadOrCreateProject(
  store: ProjectStore,
  projectId: string,
  createFallback: () => Project,
): Promise<Project> {
  try {
    return await store.load(projectId)
  } catch {
    return createFallback()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bridge/session/load-or-create-project.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 9: Bridge React glue hooks and barrel (infrastructure)

**Files:**

- Create: `bridge/react/use-scene-graph.ts`
- Create: `bridge/react/use-autosave.ts`
- Modify: `bridge/index.ts`

Design note: these hooks are thin React adapters over already-tested logic (`getSceneGraph`/`subscribe` and `createAutosave`). They depend on a live DOM and timers, so they are coverage-excluded (Task 17) and validated through the editor components and the end-to-end spec, mirroring the WebGPU glue precedent.

- [ ] **Step 1: Create the scene-graph hook**

`bridge/react/use-scene-graph.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { SceneGraph } from '../../core'
import { useEditorSession } from './editor-session-context'

/** Subscribes the calling component to scene-graph changes on the editor session. */
export function useSceneGraph(): SceneGraph {
  const session = useEditorSession()
  return useSyncExternalStore(session.subscribe, session.getSceneGraph)
}
```

- [ ] **Step 2: Create the autosave hook**

`bridge/react/use-autosave.ts`:

```ts
import { useEffect, useState } from 'react'
import type { ProjectStore } from '../../storage'
import { createAutosave, type AutosaveStatus } from '../autosave/create-autosave'
import type { EditorSession } from '../session/editor-session'

/** Runs the debounced autosave for the session's lifetime and reports its status. */
export function useAutosave(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  useEffect(() => {
    const autosave = createAutosave(session, store, projectId, { onStatusChange: setStatus })
    return () => autosave.dispose()
  }, [session, store, projectId])
  return status
}
```

- [ ] **Step 3: Update the barrel**

Set `bridge/index.ts` to:

```ts
export type { EditorSession } from './session/editor-session'
export { createEditorSession } from './session/editor-session'
export { loadOrCreateProject } from './session/load-or-create-project'
export type { SelectionStore } from './selection/selection-store'
export { createSelectionStore } from './selection/selection-store'
export type { AutosaveStatus, AutosaveOptions, Autosave } from './autosave/create-autosave'
export { createAutosave, DEFAULT_AUTOSAVE_DELAY_MS } from './autosave/create-autosave'
export { useEditorSession } from './react/editor-session-context'
export type { EditorSessionProviderProps } from './react/editor-session-provider'
export { EditorSessionProvider } from './react/editor-session-provider'
export { SelectionContext, useSelection, useSelectionIds } from './react/selection-context'
export type { SelectionProviderProps } from './react/selection-provider'
export { SelectionProvider } from './react/selection-provider'
export { useSceneGraph } from './react/use-scene-graph'
export { useAutosave } from './react/use-autosave'
export { SceneCanvas } from './react/scene-canvas'
```

- [ ] **Step 4: Verify and commit (controller)**

Run: `pnpm typecheck`
Expected: clean.

```bash
git commit -m "feat(bridge): add scene-graph and autosave hooks and export the selection and autosave API"
```

---

## Section C: storage

### Task 10: IndexedDB project store (infrastructure)

**Files:**

- Create: `storage/indexeddb/indexeddb-project-store.ts`
- Modify: `storage/index.ts`

Design note: this is the durable `ProjectStore` for the browser. IndexedDB is unavailable under jsdom, so this file is coverage-excluded glue (Task 17) and validated by the end-to-end spec, which exercises real persistence across a reload. It wraps the IndexedDB request API in promises at a single seam (Clean Code "Boundaries"). Storage browser APIs are only used inside `storage/` (hard invariant 1).

- [ ] **Step 1: Create the store**

`storage/indexeddb/indexeddb-project-store.ts`:

```ts
import type { Project } from '../../core'
import type { ProjectStore, ProjectSummary } from '../project-store'

const DB_NAME = 'vernacular'
const STORE_NAME = 'projects'
const DB_VERSION = 1

interface StoredProject {
  id: string
  project: Project
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

/** Durable ProjectStore backed by IndexedDB. */
export class IndexedDbProjectStore implements ProjectStore {
  async list(): Promise<ProjectSummary[]> {
    const db = await openDatabase()
    const records = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredProject[]
      >,
    )
    return records.map((record) => ({ id: record.id, name: record.project.meta.name }))
  }

  async load(id: string): Promise<Project> {
    const db = await openDatabase()
    const record = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id) as IDBRequest<
        StoredProject | undefined
      >,
    )
    if (record === undefined) {
      throw new Error(`No project stored under id "${id}"`)
    }
    return record.project
  }

  async save(id: string, project: Project): Promise<void> {
    const db = await openDatabase()
    const record: StoredProject = { id, project }
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record))
  }

  async delete(id: string): Promise<void> {
    const db = await openDatabase()
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id))
  }
}

/** The default durable store for the running app. */
export function createDefaultProjectStore(): ProjectStore {
  return new IndexedDbProjectStore()
}
```

- [ ] **Step 2: Update the barrel**

Set `storage/index.ts` to:

```ts
export type { ProjectStore, ProjectSummary } from './project-store'
export type { LibraryItemSummary, LibraryStore } from './library-store'
export type { AssetCache } from './asset-cache'
export { InMemoryProjectStore } from './in-memory-project-store'
export {
  IndexedDbProjectStore,
  createDefaultProjectStore,
} from './indexeddb/indexeddb-project-store'
```

- [ ] **Step 3: Verify and commit (controller)**

Run: `pnpm typecheck`
Expected: clean.

```bash
git commit -m "feat(storage): add an IndexedDB-backed project store"
```

---

## Section D: editor 2D plan and tools

### Task 11: Plan viewport projection

**Files:**

- Create: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

Design note: a fixed scale maps world millimeters to screen pixels with the world origin at the Canvas top-left. Pan and zoom are Phase 1; keeping the viewport an explicit value leaves room for them.

- [ ] **Step 1: Write the failing test**

`editor/plan/viewport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, DEFAULT_PLAN_SCALE } from './viewport'

describe('viewport projection', () => {
  it('scales world millimeters to screen pixels', () => {
    const viewport = { scale: 0.1 }

    expect(worldToScreen({ x: 1000, y: 2000 }, viewport)).toEqual({ x: 100, y: 200 })
  })

  it('round-trips screen back to world', () => {
    const viewport = { scale: DEFAULT_PLAN_SCALE }
    const screen = worldToScreen({ x: 1234, y: 5678 }, viewport)

    expect(screenToWorld(screen, viewport)).toEqual({ x: 1234, y: 5678 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/viewport.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

`editor/plan/viewport.ts`:

```ts
import type { Point } from '../../core'

/** Pixels per millimeter. Chosen so a typical room fits the fixed proof-of-life Canvas. */
export const DEFAULT_PLAN_SCALE = 0.08

export interface Viewport {
  scale: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint {
  return { x: point.x * viewport.scale, y: point.y * viewport.scale }
}

export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point {
  return { x: screen.x / viewport.scale, y: screen.y / viewport.scale }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/viewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 12: Wall-drawing tool state machine

**Files:**

- Create: `editor/plan/wall-tool.ts`
- Test: `editor/plan/wall-tool.test.ts`

Design note: a pure two-click state machine. The first click anchors the start; the second emits an `addWall` command and resets. A zero-length click (start equals end) is discarded so a stray double-click does not create a degenerate wall.

- [ ] **Step 1: Write the failing test**

`editor/plan/wall-tool.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { advanceWallTool, IDLE_WALL_TOOL } from './wall-tool'
import { ADD_WALL, type AddWallParams, type Command } from '../../core'

describe('advanceWallTool', () => {
  it('anchors the start on the first click without emitting a command', () => {
    const result = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g')

    expect(result.state).toEqual({ phase: 'drawing', start: { x: 100, y: 100 } })
    expect(result.command).toBeUndefined()
  })

  it('emits an addWall command and resets on the second click', () => {
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g').state
    const result = advanceWallTool(drawing, { x: 500, y: 100 }, 'g')

    expect(result.state).toEqual(IDLE_WALL_TOOL)
    const command = result.command as Command<AddWallParams>
    expect(command.type).toBe(ADD_WALL)
    expect(command.params.floorId).toBe('g')
    expect(command.params.wall.start).toEqual({ x: 100, y: 100 })
    expect(command.params.wall.end).toEqual({ x: 500, y: 100 })
  })

  it('discards a zero-length wall', () => {
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g').state
    const result = advanceWallTool(drawing, { x: 100, y: 100 }, 'g')

    expect(result.state).toEqual(IDLE_WALL_TOOL)
    expect(result.command).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/wall-tool.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

`editor/plan/wall-tool.ts`:

```ts
import { addWall, type Command, type Point } from '../../core'

export type WallToolState = { phase: 'idle' } | { phase: 'drawing'; start: Point }

export const IDLE_WALL_TOOL: WallToolState = { phase: 'idle' }

export interface WallToolResult {
  state: WallToolState
  command?: Command
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function advanceWallTool(
  state: WallToolState,
  point: Point,
  floorId: string,
): WallToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'drawing', start: point } }
  }
  if (samePoint(state.start, point)) {
    return { state: IDLE_WALL_TOOL }
  }
  return { state: IDLE_WALL_TOOL, command: addWall(floorId, state.start, point) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/wall-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 13: Wall hit testing

**Files:**

- Create: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

Design note: pure point-to-segment distance over the wall nodes. Returns the nearest wall within tolerance, or null. The quadtree spatial index from the design specification (section 6.2) is Phase 1; a linear scan is correct for the proof-of-life wall count.

- [ ] **Step 1: Write the failing test**

`editor/plan/hit-test.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hitTestWalls, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import type { WallSceneNode } from '../../core'

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: 114 }
}

describe('hitTestWalls', () => {
  it('returns the id of a wall the point lies on', () => {
    const walls = [wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })]

    expect(hitTestWalls(walls, { x: 500, y: 0 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:a')
  })

  it('returns null when the point is beyond the tolerance', () => {
    const walls = [wall('wall:a', { x: 0, y: 0 }, { x: 1000, y: 0 })]

    expect(hitTestWalls(walls, { x: 500, y: 5000 }, DEFAULT_HIT_TOLERANCE_MM)).toBeNull()
  })

  it('returns the nearest wall when several are in range', () => {
    const walls = [
      wall('wall:far', { x: 0, y: 100 }, { x: 1000, y: 100 }),
      wall('wall:near', { x: 0, y: 0 }, { x: 1000, y: 0 }),
    ]

    expect(hitTestWalls(walls, { x: 500, y: 10 }, DEFAULT_HIT_TOLERANCE_MM)).toBe('wall:near')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/hit-test.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

`editor/plan/hit-test.ts`:

```ts
import type { Point, WallSceneNode } from '../../core'

/** A click within this many millimeters of a wall centerline selects it. */
export const DEFAULT_HIT_TOLERANCE_MM = 150

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
  const clamped = Math.max(0, Math.min(1, t))
  const projX = start.x + clamped * dx
  const projY = start.y + clamped * dy
  return Math.hypot(point.x - projX, point.y - projY)
}

export function hitTestWalls(
  walls: WallSceneNode[],
  point: Point,
  tolerance: number,
): string | null {
  let bestId: string | null = null
  let bestDistance = tolerance
  for (const wall of walls) {
    const distance = distanceToSegment(point, wall.start, wall.end)
    if (distance <= bestDistance) {
      bestDistance = distance
      bestId = wall.id
    }
  }
  return bestId
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/hit-test.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 14: Plan Canvas drawing

**Files:**

- Create: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

Design note: a pure drawing routine over a narrow `PlanDrawingContext` interface (the subset of `CanvasRenderingContext2D` used). A real 2D context satisfies it structurally; the test passes a recording fake. Selected walls draw in the highlight color.

- [ ] **Step 1: Write the failing test**

`editor/plan/draw-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { drawPlan, type PlanDrawingContext } from './draw-plan'
import { DEFAULT_PLAN_SCALE } from './viewport'
import type { WallSceneNode } from '../../core'

interface Segment {
  from: [number, number]
  to: [number, number]
  style: string
}

function recordingContext(): { ctx: PlanDrawingContext; segments: Segment[]; cleared: boolean } {
  const segments: Segment[] = []
  let cleared = false
  let from: [number, number] = [0, 0]
  const ctx: PlanDrawingContext = {
    lineWidth: 0,
    lineCap: 'butt',
    strokeStyle: '',
    clearRect: () => {
      cleared = true
    },
    beginPath: () => {},
    moveTo: (x, y) => {
      from = [x, y]
    },
    lineTo: (x, y) => {
      segments.push({ from, to: [x, y], style: String(ctx.strokeStyle) })
    },
    stroke: () => {},
  }
  return {
    ctx,
    segments,
    get cleared() {
      return cleared
    },
  } as { ctx: PlanDrawingContext; segments: Segment[]; cleared: boolean }
}

const wall: WallSceneNode = {
  id: 'wall:a',
  kind: 'wall',
  floorId: 'g',
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  thickness: 114,
}

describe('drawPlan', () => {
  it('clears the surface and draws each wall projected to screen space', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(),
    })

    expect(recorder.cleared).toBe(true)
    expect(recorder.segments).toHaveLength(1)
    expect(recorder.segments[0]?.from).toEqual([0, 0])
    expect(recorder.segments[0]?.to).toEqual([1000 * DEFAULT_PLAN_SCALE, 0])
  })

  it('draws a selected wall in the highlight color', () => {
    const recorder = recordingContext()

    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set(['wall:a']),
    })

    expect(recorder.segments[0]?.style).not.toBe('')
    expect(recorder.segments[0]?.style.toLowerCase()).toContain('#')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/draw-plan.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the minimal implementation**

`editor/plan/draw-plan.ts`:

```ts
import type { WallSceneNode } from '../../core'
import { worldToScreen, type Viewport } from './viewport'

export interface PlanDrawingContext {
  lineWidth: number
  lineCap: CanvasLineCap
  strokeStyle: string | CanvasGradient | CanvasPattern
  clearRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
}

export interface DrawPlanOptions {
  walls: WallSceneNode[]
  viewport: Viewport
  width: number
  height: number
  selectedIds: ReadonlySet<string>
}

const WALL_COLOR = '#222222'
const SELECTED_WALL_COLOR = '#1a7fd4'
const MIN_WALL_PIXELS = 1

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  ctx.lineCap = 'round'
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
}

function drawWall(ctx: PlanDrawingContext, wall: WallSceneNode, options: DrawPlanOptions): void {
  const from = worldToScreen(wall.start, options.viewport)
  const to = worldToScreen(wall.end, options.viewport)
  ctx.lineWidth = Math.max(MIN_WALL_PIXELS, wall.thickness * options.viewport.scale)
  ctx.strokeStyle = options.selectedIds.has(wall.id) ? SELECTED_WALL_COLOR : WALL_COLOR
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/draw-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 15: Active-tool context and tools panel

**Files:**

- Create: `editor/tools/active-tool-context.ts`
- Create: `editor/tools/active-tool-provider.tsx`
- Create: `editor/tools/tools-panel.tsx`
- Test: `editor/tools/tools-panel.test.tsx`

Design note: the active tool is editor-local UI state (which tool the pointer drives), not model state. The context lives in `editor/`. Context and hook are split from the provider component so the `react-refresh/only-export-components` rule stays clean, mirroring the editor-session split.

- [ ] **Step 1: Write the failing test**

`editor/tools/tools-panel.test.tsx`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('marks the default draw-wall tool active and switches on click', async () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const drawButton = screen.getByRole('button', { name: /draw wall/i })
    const selectButton = screen.getByRole('button', { name: /select/i })
    expect(drawButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectButton).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(selectButton)

    expect(drawButton).toHaveAttribute('aria-pressed', 'false')
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/tools/tools-panel.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the minimal implementation**

`editor/tools/active-tool-context.ts`:

```ts
import { createContext, useContext } from 'react'

export type ToolId = 'draw-wall' | 'select'

export const DEFAULT_TOOL: ToolId = 'draw-wall'

export interface ActiveToolValue {
  tool: ToolId
  setTool: (tool: ToolId) => void
}

export const ActiveToolContext = createContext<ActiveToolValue | null>(null)

export function useActiveTool(): ActiveToolValue {
  const value = useContext(ActiveToolContext)
  if (value === null) {
    throw new Error('useActiveTool must be used within an ActiveToolProvider')
  }
  return value
}
```

`editor/tools/active-tool-provider.tsx`:

```ts
import { useMemo, useState, type ReactNode } from 'react'
import { ActiveToolContext, DEFAULT_TOOL, type ToolId } from './active-tool-context'

export interface ActiveToolProviderProps {
  children: ReactNode
}

export function ActiveToolProvider({ children }: ActiveToolProviderProps) {
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL)
  const value = useMemo(() => ({ tool, setTool }), [tool])
  return <ActiveToolContext.Provider value={value}>{children}</ActiveToolContext.Provider>
}
```

`editor/tools/tools-panel.tsx`:

```ts
import { useActiveTool, type ToolId } from './active-tool-context'

const TOOLS: ReadonlyArray<{ id: ToolId; label: string }> = [
  { id: 'draw-wall', label: 'Draw wall' },
  { id: 'select', label: 'Select' },
]

export function ToolsPanel() {
  const { tool, setTool } = useActiveTool()
  return (
    <ul className="tools-panel">
      {TOOLS.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            aria-pressed={tool === entry.id}
            onClick={() => setTool(entry.id)}
          >
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/tools/tools-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 16: Editor shell integration

**Files:**

- Modify: `editor/shell/editor-shell.tsx`
- Test: `editor/shell/editor-shell.test.tsx`

Design note: the shell now reads the scene graph for a live wall count, shows the autosave status, hosts the 2D plan view as the primary viewport with the 3D preview as a secondary labeled region, switches tools in the Tools nav, and shows selection in the inspector. It receives `saveStatus` as a prop from the app composition root. The shell must render inside the editor-session, selection, and active-tool providers (the test supplies them).

- [ ] **Step 1: Write the failing test**

Replace `editor/shell/editor-shell.test.tsx`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EditorShell } from './editor-shell'
import { ActiveToolProvider } from '../tools/active-tool-provider'
import {
  EditorSessionProvider,
  SelectionProvider,
  createEditorSession,
  createSelectionStore,
} from '../../bridge'
import { createEmptyProject, createFloor, type Project } from '../../core'

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' })]
  return project
}

function renderShell() {
  const session = createEditorSession(projectWithFloor())
  const selection = createSelectionStore()
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell saveStatus="idle" />
        </ActiveToolProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { session, selection }
}

describe('EditorShell', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders labeled toolbar, tools, viewport, 3D preview, and inspector regions', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /3d preview/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/floor plan/i)).toBeInTheDocument()
  })

  it('shows a live wall count and the empty selection state', () => {
    vi.stubGlobal('navigator', {})

    renderShell()

    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
    expect(screen.getByText(/no selection/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: FAIL (`EditorShell` takes no props; no wall count, 3D preview region, or floor-plan surface).

- [ ] **Step 3: Write the minimal implementation**

Replace `editor/shell/editor-shell.tsx`:

```ts
import { SceneCanvas, useSceneGraph, useSelectionIds, type AutosaveStatus } from '../../bridge'
import { PlanView } from '../plan/plan-view'
import { ToolsPanel } from '../tools/tools-panel'

const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'Ready',
  pending: 'Saving...',
  saved: 'All changes saved',
}

export interface EditorShellProps {
  saveStatus: AutosaveStatus
}

export function EditorShell({ saveStatus }: EditorShellProps) {
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  return (
    <div className="editor-shell">
      <header className="editor-shell__toolbar" role="banner">
        <h1>Vernacular</h1>
        <p>Walls: {graph.walls.length}</p>
        <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
      </header>
      <nav className="editor-shell__tools" aria-label="Tools">
        <ToolsPanel />
      </nav>
      <main className="editor-shell__viewport" aria-label="Viewport">
        <PlanView />
        <section className="editor-shell__preview" aria-label="3D preview">
          <SceneCanvas />
        </section>
      </main>
      <aside className="editor-shell__inspector" aria-label="Inspector">
        <p>{selectedIds.size > 0 ? 'Wall selected' : 'No selection'}</p>
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

### Task 17: Plan view component, editor barrel, coverage config (infrastructure)

**Files:**

- Create: `editor/plan/plan-view.tsx`
- Modify: `editor/index.ts`
- Modify: `vite.config.ts`

Design note: `PlanView` is the Canvas-and-pointer glue that binds the tested pure pieces (viewport, wall-tool, hit-test, draw-plan) to React, the session, the selection store, and the active tool. jsdom has no 2D Canvas and no real pointer geometry, so this file is coverage-excluded and validated by the end-to-end spec. It keeps no logic of its own beyond wiring.

- [ ] **Step 1: Create the plan view**

`editor/plan/plan-view.tsx`:

```ts
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  useEditorSession,
  useSceneGraph,
  useSelection,
  useSelectionIds,
} from '../../bridge'
import { useActiveTool } from '../tools/active-tool-context'
import { drawPlan } from './draw-plan'
import { hitTestWalls, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { screenToWorld, DEFAULT_PLAN_SCALE, type Viewport } from './viewport'
import { advanceWallTool, IDLE_WALL_TOOL, type WallToolState } from './wall-tool'

const PLAN_WIDTH = 800
const PLAN_HEIGHT = 600
const VIEWPORT: Viewport = { scale: DEFAULT_PLAN_SCALE }

export function PlanView() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const { tool } = useActiveTool()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      return
    }
    drawPlan(ctx, {
      walls: graph.walls,
      viewport: VIEWPORT,
      width: PLAN_WIDTH,
      height: PLAN_HEIGHT,
      selectedIds,
    })
  }, [graph, selectedIds])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const world = screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        VIEWPORT,
      )
      if (tool === 'select') {
        const hit = hitTestWalls(graph.walls, world, DEFAULT_HIT_TOLERANCE_MM)
        if (hit) {
          selection.select(hit)
        } else {
          selection.clear()
        }
        return
      }
      const floorId = session.getProject().floors[0]?.id
      if (floorId === undefined) {
        return
      }
      const result = advanceWallTool(toolState, world, floorId)
      setToolState(result.state)
      if (result.command) {
        session.dispatch(result.command)
      }
    },
    [graph, selection, session, tool, toolState],
  )

  return (
    <canvas
      ref={canvasRef}
      width={PLAN_WIDTH}
      height={PLAN_HEIGHT}
      aria-label="Floor plan"
      className="plan-view"
      style={{ touchAction: 'none', cursor: tool === 'draw-wall' ? 'crosshair' : 'default' }}
      onPointerDown={handlePointerDown}
    />
  )
}
```

- [ ] **Step 2: Update the editor barrel**

Set `editor/index.ts` to:

```ts
export { EditorShell } from './shell/editor-shell'
export type { EditorShellProps } from './shell/editor-shell'
export { ActiveToolProvider } from './tools/active-tool-provider'
```

- [ ] **Step 3: Exclude the new glue from coverage**

In `vite.config.ts`, extend the coverage `exclude` array with:

```ts
        'engine/renderer/create-renderer.ts',
        'bridge/react/webgpu-scene-view.tsx',
        'bridge/react/use-scene-graph.ts',
        'bridge/react/use-autosave.ts',
        'editor/plan/plan-view.tsx',
        'storage/indexeddb/indexeddb-project-store.ts',
```

- [ ] **Step 4: Verify and commit (controller)**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

```bash
git commit -m "feat(editor): add the 2D plan view and exclude browser-only glue from coverage"
```

---

## Section E: app composition root

### Task 18: Async app bootstrap with autosave

**Files:**

- Modify: `app/app.tsx`
- Test: `app/app.test.tsx`

Design note: the app loads the project from the store (real IndexedDB by default, injectable for tests), creates the session once loaded, wires the providers and the autosave, and renders the shell. While loading it shows a landmarked status so accessibility checks pass in both states. The initial fallback project carries a single ground floor so the wall tool has a floor to draw on (multi-floor is Phase 1). The store is injectable and memoized so tests can supply an in-memory store and so the default store is constructed once.

- [ ] **Step 1: Write the failing test**

Replace `app/app.test.tsx`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App } from './app'
import { InMemoryProjectStore } from '../storage'

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('boots from the store and renders the editor shell with a ground floor', async () => {
    vi.stubGlobal('navigator', {})

    render(<App store={new InMemoryProjectStore()} />)

    expect(await screen.findByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: FAIL (App takes no store prop; async boot not implemented).

- [ ] **Step 3: Write the minimal implementation**

Replace `app/app.tsx`:

```ts
import { useEffect, useMemo, useState } from 'react'
import {
  EditorSessionProvider,
  SelectionProvider,
  createEditorSession,
  createSelectionStore,
  loadOrCreateProject,
  useAutosave,
  type EditorSession,
} from '../bridge'
import { ActiveToolProvider, EditorShell } from '../editor'
import { createDefaultProjectStore, type ProjectStore } from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'
import { version as appVersion } from '../package.json'

const DEFAULT_PROJECT_ID = 'current'

function createInitialProject(): Project {
  const project = createEmptyProject({
    name: 'Untitled project',
    units: 'imperial',
    era: 'modern',
    appVersion,
  })
  return { ...project, floors: [createFloor('Ground')] }
}

export interface AppProps {
  store?: ProjectStore
  projectId?: string
}

export function App({ store: providedStore, projectId = DEFAULT_PROJECT_ID }: AppProps = {}) {
  const store = useMemo(() => providedStore ?? createDefaultProjectStore(), [providedStore])
  const [session, setSession] = useState<EditorSession | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject).then((project) => {
      if (!cancelled) {
        setSession(createEditorSession(project))
      }
    })
    return () => {
      cancelled = true
    }
  }, [store, projectId])

  if (session === null) {
    return (
      <main aria-label="Loading">
        <p role="status">Loading project...</p>
      </main>
    )
  }

  return <EditorWorkspace session={session} store={store} projectId={projectId} />
}

interface EditorWorkspaceProps {
  session: EditorSession
  store: ProjectStore
  projectId: string
}

function EditorWorkspace({ session, store, projectId }: EditorWorkspaceProps) {
  const selection = useMemo(() => createSelectionStore(), [])
  const saveStatus = useAutosave(session, store, projectId)
  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell saveStatus={saveStatus} />
        </ActiveToolProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit (controller)** RED, GREEN, BLUE marker.

Note: `app.stories.tsx` renders `<App />` with the default store. In Storybook (a real browser) this hits IndexedDB and boots normally; no change is needed. If the story should avoid persistence later, inject an in-memory store; out of scope here.

---

## Section F: end-to-end acceptance and roadmap

### Task 19: Proof-of-life end-to-end spec (infrastructure)

**Files:**

- Create: `e2e/tests/wall-drawing.spec.ts`

Design note: this is the Phase 0 acceptance ("wall drawing works, persists via IndexedDB autosave; reload preserves last-drawn wall"). It waits on observable conditions, never timers (rules anti-pattern: no `sleep`). It draws a wall with two Canvas clicks, waits for the "All changes saved" indicator, asserts the wall count, reloads, asserts the wall survived, then selects it to confirm selection works end to end.

- [ ] **Step 1: Write the spec**

`e2e/tests/wall-drawing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Wall-drawing proof of life', () => {
  test('draws a wall, autosaves it, and restores it after reload', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    await canvas.click({ position: { x: 120, y: 200 } })
    await canvas.click({ position: { x: 520, y: 200 } })

    await expect(page.getByText('All changes saved')).toBeVisible()
    await expect(page.getByText('Walls: 1')).toBeVisible()

    await page.reload()

    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(page.getByText('Walls: 1')).toBeVisible()

    await page.getByRole('button', { name: 'Select' }).click()
    await page.getByLabel('Floor plan').click({ position: { x: 320, y: 200 } })
    await expect(page.getByText('Wall selected')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the spec locally**

Run: `pnpm build && pnpm exec playwright test wall-drawing --project=chromium`
Expected: PASS (the build is served by the preview server the config starts). If Playwright browsers are not installed locally, this runs in CI regardless; note the result.

- [ ] **Step 3: Commit (controller)**

```bash
git commit -m "test(e2e): cover the wall-drawing proof of life"
```

### Task 20: Roadmap status (infrastructure)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark the milestone done**

In `ROADMAP.md`, change the "Wall-drawing proof of life (first user flow)" row status from `pending` to `done`.

- [ ] **Step 2: Commit (controller)**

```bash
git commit -m "docs: mark the wall-drawing proof of life complete on the roadmap"
```

---

## Final verification

After all tasks:

- [ ] Run the full chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] Run the end-to-end spec in CI (or locally if browsers are installed): the wall-drawing proof of life passes on chromium.
- [ ] Dispatch the `pr-reviewer` for the branch audit (RGB cycle adherence, Clean Code, CI green).
- [ ] Refresh the local knowledge graph: the `knowledge-curator` adds an ADR for the selection store and the IndexedDB autosave path, and regenerates the index (`pnpm knowledge:index`). Gitignored, not committed.
- [ ] Open the PR to `main` and merge once CI is green and the `pr-reviewer` verdict is MERGE.

## Self-review

**Spec coverage (design specification, section 10, Phase 0):**

- Wall drawing works: Tasks 1, 2, 12, 17 (entity, command, tool state machine, plan view).
- Persists via IndexedDB autosave: Tasks 7, 10, 18 (orchestration, store, wiring).
- Reload preserves the last-drawn wall: Task 19 end-to-end assertion after `page.reload()`.
- Selection enters `bridge/`: Tasks 6, 13, 16 (store and context, hit testing, inspector display).
- All public `core/` functions unit-tested: Tasks 1, 2, 3 add tests for every new core export.
- Out-of-scope items (snapping, dimensions, openings, 3D wall rendering, pan/zoom, multi-floor, multi-select, filesystem persistence, selection persistence) are not implemented.

**Type consistency:** `Point` and `Wall` (Task 1) flow unchanged through `addWall` (Task 2), `deriveWallNode`/`WallSceneNode` (Task 3), the session (Task 5), the tool and hit-test and draw-plan (Tasks 12-14), and the plan view (Task 17). `AutosaveStatus` (Task 7) is consumed by `useAutosave` (Task 9), `EditorShell` (Task 16), and `App` (Task 18). `ProjectStore` (existing) is the shared seam for autosave (Task 7), bootstrap (Task 8), the IndexedDB store (Task 10), and the app (Task 18). `SceneGraph.walls` (Task 3) is read by the session snapshot (Task 5), the shell wall count (Task 16), the plan view, and hit testing.

**Placeholder scan:** every code step contains complete code; no TODO, TBD, or "similar to" references.

**Invariants honored:** `core/` imports no React/Three.js/DOM (Tasks 1-4). All mutations flow through `dispatch` at the bridge boundary (Tasks 2, 5, 17). Storage browser APIs live only in `storage/` (Task 10). No new dependencies, so the 15-day cooldown is not engaged. No em-dashes in this document. Selection is kept out of undo history (separate store, Task 6).
