# Structure and Multi-Floor Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The test and implementation code shown in each task are the **controller's reference blueprint**, not handed to the agents verbatim: the `test-author` authors its test independently from the behavior description plus the public signatures, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (barrels, React glue, docs) with no RGB triple; they are reviewed by the `clean-code-reviewer`. Steps use checkbox (`- [ ]`) syntax for tracking. **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Vernacular a multi-floor planner: complete the floor-management command surface and add a floor switcher, introduce the stair as a top-level floor-spanning entity (parameters, 2D plan symbol, stairwell topology), complete the underlay layer (document and scene references plus a basic trace mode), and add a per-room ceiling-height override, all without touching the deferred 3D geometry seam.

**Architecture:** Pure-`core/` model and command additions ride the existing `dispatch(command)` boundary with framework-captured inverses (ADR-0005), the `mapTargetFloor` floor-update helper, and the eager-id command-factory convention. Stairs are a new top-level `Project.stairs[]` array (design spec §3.1, §3.2) projected into the scene graph as `StairSceneNode`s and rendered by a new 2D plan symbol; the stair entity carries only data and topology here, with all 3D stair geometry deferred behind the render-harness seam (ADR-0045). Underlays gain a discriminated `kind` (raster, document, scene) so the existing raster underlay is one variant; trace mode adds underlay feature points to the wall tool's snap context. Per-room ceiling height rides the existing optional `roomOverrides` map (ADR-0036), needing no schema migration. The editor gains a bridge-level active-floor store (a sibling of the selection store) so the plan, inspector, and 3D pane all read one active floor instead of the hard-coded `floors[0]`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), the pure command/scene-graph core, React + the design-system primitives for UI, Canvas 2D for the plan symbol, Vitest for units, React Testing Library for components. No new runtime dependencies (PDF and glTF _decoding_ are deferred; this track models the _references_ only).

---

## What already exists (build on, do not recreate)

Verified against the worktree at branch `feat/structure-and-multi-floor` (tip `259cd01`):

- **Floor model.** `Project.floors: Floor[]` exists. `Floor` has `id`, `name`, `elevation`, `defaultCeilingHeight`, `periodOverride?`, `styleOverride?`, `walls`, `underlays`, `openings`, `dimensions` (`core/model/types.ts`).
- **Floor commands that already exist** (`core/commands/handlers/project-commands.ts`): `addFloor(name)`, `removeFloor(floorId)`, `setFloorCeilingHeight(floorId, height)` (with `coalesceWith`), plus `setFloorPeriod`/`setFloorStyle` from the vocabulary track. **Do NOT re-create these.** This track ADDS the missing floor commands: `renameFloor`, `setFloorElevation`, `reorderFloor`.
- **Underlay model + commands** (`core/model/types.ts`, `core/commands/handlers/underlay-commands.ts`): `Underlay` (raster only: `image: AssetReference`, `width`, `height`, `placement`, `opacity`, `visible`), `UnderlayPlacement`, and `placeUnderlay`/`calibrateUnderlay`/`setUnderlayOpacity`/`setUnderlayVisibility`/`removeUnderlay`. The `createUnderlay` factory and the raster-underlay 2D draw path (`editor/plan/draw-underlay.ts`, `editor/plan/underlay-panel.tsx`) exist.
- **Migrations** (`core/migrations/schema/`): `add-room-overrides` (v1→2), `add-floor-openings` (v2→3), `add-floor-dimensions` (v3→4), `add-period-and-style` (v4→5); `CURRENT_SCHEMA_VERSION = 5`. New persisted top-level arrays ride one new migration that bumps to 6.
- **Scene graph** (`core/scene/scene-graph.ts`): per-floor node derivation with kind-prefixed ids and a `SceneGraph` carrying `nodes`/`walls`/`rooms`/`underlays`/`openings`/`dimensions`. The deriver (`scene-graph-deriver.ts`) memoizes per-floor by reference.
- **Snap context + wall tool** (`editor/plan/snap.ts`, `editor/plan/wall-tool.ts`, `editor/plan/use-snapping.ts`): `SnapContext { walls, gridSpacingMm, toleranceMm, origin? }`, `snapPoint`, and `useSnapping`. Trace mode extends the candidate feature points, not the math.
- **Editor shell** (`editor/shell/editor-shell.tsx`): currently hard-codes `session.getProject().floors[0]` as "the active floor" in the `Inspector` underlay panel and `TransformPanel`. The active-floor store replaces these reads.
- **Element-type registry** (`core/registries/element-types.ts`): `ElementType` with `plan2D.symbol` and `scene3D.builder`; categories `'wall' | 'opening'`. The stair symbol is registered the same declarative way (a `'stair'` category added).

---

## Slice map and fan-out

Seven slices. Slices fan out as follows for the orchestrator:

- **Independent, start immediately, no shared files between them:**
  - Slice 1: Floor-management commands (`core/commands/handlers/project-commands.ts` + its test, `core/index.ts`).
  - Slice 4: Underlay kinds and references (`core/model/types.ts`, `core/model/factories.ts`, a new migration).
  - Slice 7: Per-room ceiling-height override (`core/commands/handlers/room-commands.ts` + test).
- **Sequential within structure:** Slice 3 (stair model + commands) → Slice 5 (stair scene node + 2D symbol). Slice 3 depends on nothing; Slice 5 depends on Slice 3.
- **Depends on Slice 1:** Slice 2 (floor switcher UI) reads the new floor commands and the new active-floor store.
- **Depends on Slice 4:** Slice 6 (trace mode) reads the underlay scene/feature data.

Run order that maximizes parallelism: {1, 3, 4, 7} first; then {2 after 1, 5 after 3, 6 after 4}.

## Cross-track file-overlap risks (sequence merges accordingly)

- **`core/model/types.ts`** is touched by Slice 3 (adds `Stair`, `StairRun`, `StairConnection`, `Project.stairs[]`), Slice 4 (adds `UnderlayKind`, `UnderlaySource`, makes `Underlay` a discriminated shape), and Slice 7 (adds `ceilingHeight?` to `RoomOverride`). It is also read/extended by the **paint and metadata** track (site metadata; `palettes[]`) and may be read by the **app-layout-shell** work. Land the three intra-track edits in one rebase window; coordinate the merge with paint/metadata since both append to `Project` and to `RoomOverride`.
- **`core/migrations/schema/index.ts`** and `core/model/factories.ts` (`CURRENT_SCHEMA_VERSION`): Slice 4 bumps the schema to 6. The paint/metadata track also adds persisted state (`palettes[]`, site metadata) and will want its own migration. Only one track may own the v5→v6 step; if paint/metadata also needs a bump, sequence so each migration is a distinct `from` step and `CURRENT_SCHEMA_VERSION` lands once per merge. This plan assumes structure lands the v5→v6 step; if paint/metadata merges first, renumber this track's migration to the next `from`.
- **`editor/shell/editor-shell.tsx`** is the highest-contention file. Slice 2 replaces the hard-coded `floors[0]` active-floor reads with the active-floor store and inserts the `FloorSwitcher` into the toolbar. The **app-layout-shell** track restructures this same shell (split-pane, panels). **Sequence: land the app-layout-shell restructure first if it is in flight, then rebase Slice 2's floor-switcher insertion onto it; otherwise land Slice 2 and let app-layout-shell rebase the switcher into the new layout.** Keep Slice 2's switcher a self-contained component (`editor/shell/floor-switcher.tsx`) so it relocates cleanly.
- **`bridge/index.ts`** gains the active-floor store and hook (Slice 2). The app-layout-shell and 3D-preview tracks also export from this barrel; expect a barrel merge, no logic conflict.
- **`core/index.ts`** is appended by Slices 1, 3, 4, 5, 7 and by every other track. Barrel-only merges; resolve by keeping all additions.

---

## Slice 1: Floor-management commands

**Goal:** Add the three floor commands the model needs but does not yet have (rename, set elevation, reorder), each undoable through dispatch with a captured inverse. `addFloor`, `removeFloor`, and `setFloorCeilingHeight` already exist and are NOT touched except in the registration list (already registered).

**Files:**

- Modify: `core/commands/handlers/project-commands.ts`
- Modify: `core/commands/handlers/project-commands.test.ts`
- Modify (infrastructure): `core/index.ts`

Public contract introduced by this slice:

```ts
export const RENAME_FLOOR = 'project/rename-floor'
export const SET_FLOOR_ELEVATION = 'project/set-floor-elevation'
export const REORDER_FLOOR = 'project/reorder-floor'

export interface RenameFloorParams {
  floorId: string
  name: string
}
export interface SetFloorElevationParams {
  floorId: string
  elevation: number
}
export interface ReorderFloorParams {
  floorId: string
  toIndex: number
}

export function renameFloor(floorId: string, name: string): Command<RenameFloorParams>
export function setFloorElevation(
  floorId: string,
  elevation: number,
): Command<SetFloorElevationParams>
export function reorderFloor(floorId: string, toIndex: number): Command<ReorderFloorParams>
```

### Task 1.1: `renameFloor` renames the target floor and undoes

**Files:** modify `core/commands/handlers/project-commands.ts`, `core/commands/handlers/project-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "renameFloor changes only the target floor's name and restores the prior name on undo")

```ts
import { describe, expect, it } from 'vitest'
import { createFloor } from '../../model/factories'
import { createDispatcher } from '../dispatcher'
import { buildCommandRegistry } from '../command-registry'
import { renameFloor, registerProjectCommands } from './project-commands'
import type { Project } from '../../model/types'

const projectWith = (floors: Project['floors']): Project => ({
  meta: {
    name: 'p',
    units: 'metric',
    period: 'contemporary',
    schemaVersion: 6,
    appVersion: '0.0.0',
    registryVersions: {},
  },
  floors,
})

describe('renameFloor', () => {
  it('renames the target floor and restores the prior name on undo', () => {
    const ground = createFloor('Ground', { id: 'f1' })
    const upper = createFloor('Upper', { id: 'f2' })
    const dispatcher = createDispatcher(
      projectWith([ground, upper]),
      registerProjectCommands(buildCommandRegistry()),
    )
    dispatcher.dispatch(renameFloor('f2', 'Second Floor'))
    expect(dispatcher.getState().floors[1].name).toBe('Second Floor')
    expect(dispatcher.getState().floors[0].name).toBe('Ground')
    dispatcher.undo()
    expect(dispatcher.getState().floors[1].name).toBe('Upper')
  })
})
```

(The `test-author` confirms the exact dispatcher/registry construction helpers by reading the sibling assertions already in `project-commands.test.ts`; the shape above mirrors them.)

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run core/commands/handlers/project-commands.test.ts`
Expected: FAIL (`renameFloor` not exported).

- [ ] **Step 3: Minimal implementation** (`/implement`)

```ts
export const RENAME_FLOOR = 'project/rename-floor'

export interface RenameFloorParams {
  floorId: string
  name: string
}

export function renameFloor(floorId: string, name: string): Command<RenameFloorParams> {
  return {
    type: RENAME_FLOOR,
    params: { floorId, name },
    description: `Rename floor to "${name}"`,
  }
}

const renameFloorHandler: CommandHandler<Project, RenameFloorParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, name: params.name } : floor,
    )
  },
}
```

Register it in `registerProjectCommands`: `.register(RENAME_FLOOR, renameFloorHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**: `/clean-code-review` then `/refactor` (empty marker if no findings).

### Task 1.2: `setFloorElevation` sets the floor elevation and undoes

**Files:** modify `core/commands/handlers/project-commands.ts`, `core/commands/handlers/project-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "setFloorElevation sets the elevation and restores the prior value on undo; consecutive sets on the same floor coalesce")

```ts
describe('setFloorElevation', () => {
  it('sets the floor elevation and restores it on undo', () => {
    const ground = createFloor('Ground', { id: 'f1', elevation: 0 })
    const dispatcher = createDispatcher(
      projectWith([ground]),
      registerProjectCommands(buildCommandRegistry()),
    )
    dispatcher.dispatch(setFloorElevation('f1', 3000))
    expect(dispatcher.getState().floors[0].elevation).toBe(3000)
    dispatcher.undo()
    expect(dispatcher.getState().floors[0].elevation).toBe(0)
  })

  it('coalesces consecutive elevation edits on the same floor into one undo step', () => {
    const ground = createFloor('Ground', { id: 'f1', elevation: 0 })
    const dispatcher = createDispatcher(
      projectWith([ground]),
      registerProjectCommands(buildCommandRegistry()),
    )
    dispatcher.dispatch(setFloorElevation('f1', 1000))
    dispatcher.dispatch(setFloorElevation('f1', 2000))
    dispatcher.undo()
    expect(dispatcher.getState().floors[0].elevation).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`setFloorElevation` not exported).

- [ ] **Step 3: Minimal implementation**: mirror the existing `setFloorCeilingHeight` `coalesceWith` shape (a numeric edit on one floor):

```ts
export const SET_FLOOR_ELEVATION = 'project/set-floor-elevation'

export interface SetFloorElevationParams {
  floorId: string
  elevation: number
}

export function setFloorElevation(
  floorId: string,
  elevation: number,
): Command<SetFloorElevationParams> {
  return {
    type: SET_FLOOR_ELEVATION,
    params: { floorId, elevation },
    description: 'Set floor elevation',
    coalesceWith(previous) {
      if (previous.type !== SET_FLOOR_ELEVATION) {
        return null
      }
      const previousParams = previous.params as SetFloorElevationParams
      if (previousParams.floorId !== floorId) {
        return null
      }
      return setFloorElevation(floorId, elevation)
    },
  }
}

const setFloorElevationHandler: CommandHandler<Project, SetFloorElevationParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, elevation: params.elevation } : floor,
    )
  },
}
```

Register it: `.register(SET_FLOOR_ELEVATION, setFloorElevationHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 1.3: `reorderFloor` moves a floor to a new index and undoes

**Files:** modify `core/commands/handlers/project-commands.ts`, `core/commands/handlers/project-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "reorderFloor moves the floor to the target index, preserving the others' relative order, and restores the original order on undo")

```ts
describe('reorderFloor', () => {
  it('moves a floor to a new index and restores the original order on undo', () => {
    const a = createFloor('Basement', { id: 'a' })
    const b = createFloor('Ground', { id: 'b' })
    const c = createFloor('Upper', { id: 'c' })
    const dispatcher = createDispatcher(
      projectWith([a, b, c]),
      registerProjectCommands(buildCommandRegistry()),
    )
    dispatcher.dispatch(reorderFloor('c', 0))
    expect(dispatcher.getState().floors.map((floor) => floor.id)).toEqual(['c', 'a', 'b'])
    dispatcher.undo()
    expect(dispatcher.getState().floors.map((floor) => floor.id)).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`reorderFloor` not exported).

- [ ] **Step 3: Minimal implementation**: remove the floor, splice it back at `toIndex` clamped to the array bounds:

```ts
export const REORDER_FLOOR = 'project/reorder-floor'

export interface ReorderFloorParams {
  floorId: string
  toIndex: number
}

export function reorderFloor(floorId: string, toIndex: number): Command<ReorderFloorParams> {
  return {
    type: REORDER_FLOOR,
    params: { floorId, toIndex },
    description: 'Reorder floor',
  }
}

const reorderFloorHandler: CommandHandler<Project, ReorderFloorParams> = {
  apply(state, params) {
    const fromIndex = state.floors.findIndex((floor) => floor.id === params.floorId)
    if (fromIndex === -1) {
      return
    }
    const next = [...state.floors]
    const [moved] = next.splice(fromIndex, 1)
    const clamped = Math.max(0, Math.min(params.toIndex, next.length))
    next.splice(clamped, 0, moved)
    state.floors = next
  },
}
```

Register it: `.register(REORDER_FLOOR, reorderFloorHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 1.4: export the new floor commands (infrastructure)

**Files:** modify `core/index.ts`

- [ ] **Step 1: Append the new types and functions to the existing `project-commands` re-export block** (next to the already-exported `ADD_FLOOR`, `addFloor`, etc.):

```ts
export type {
  RenameFloorParams,
  SetFloorElevationParams,
  ReorderFloorParams,
} from './commands/handlers/project-commands'
export {
  RENAME_FLOOR,
  SET_FLOOR_ELEVATION,
  REORDER_FLOOR,
  renameFloor,
  setFloorElevation,
  reorderFloor,
} from './commands/handlers/project-commands'
```

- [ ] **Step 2: Verify**: Run `pnpm typecheck && pnpm exec vitest run core/commands/handlers/project-commands.test.ts`. Expected: green.

- [ ] **Step 3: Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).**

---

## Slice 2: Floor switcher UI

**Goal:** A bridge-level active-floor store (the active floor is per-view UI state, not project model, so it lives in `bridge/` like selection per design spec §6.5), and a `FloorSwitcher` component that lists floors, selects the active one, and invokes the floor commands (add, rename, set elevation, set default ceiling height, reorder, remove). The shell threads the active floor into the inspector and 3D pane, replacing the hard-coded `floors[0]`.

**Files:**

- Create: `bridge/active-floor/active-floor-store.ts`
- Create: `bridge/active-floor/active-floor-store.test.ts`
- Create: `bridge/react/active-floor-context.ts`
- Create: `bridge/react/active-floor-provider.tsx`
- Modify (infrastructure): `bridge/index.ts`
- Create: `editor/shell/floor-switcher.tsx`
- Create: `editor/shell/floor-switcher.test.tsx`
- Modify (infrastructure): `editor/shell/editor-shell.tsx`

Public contract:

```ts
// bridge/active-floor/active-floor-store.ts
export interface ActiveFloorStore {
  getActiveFloorId(): string | null
  setActiveFloorId(id: string | null): void
  subscribe(listener: () => void): () => void
}
export function createActiveFloorStore(initialId?: string | null): ActiveFloorStore

// bridge/react/active-floor-context.ts
export function useActiveFloorId(): string | null
export function useSetActiveFloorId(): (id: string | null) => void
```

### Task 2.1: `createActiveFloorStore` holds and publishes the active floor id

**Files:** create `bridge/active-floor/active-floor-store.ts`, `bridge/active-floor/active-floor-store.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the store returns its current active floor id and notifies subscribers when it changes, and not when it is set to the same value")

```ts
import { describe, expect, it, vi } from 'vitest'
import { createActiveFloorStore } from './active-floor-store'

describe('createActiveFloorStore', () => {
  it('returns the current active floor id and notifies subscribers on change', () => {
    const store = createActiveFloorStore('f1')
    expect(store.getActiveFloorId()).toBe('f1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.setActiveFloorId('f2')
    expect(store.getActiveFloorId()).toBe('f2')
    expect(listener).toHaveBeenCalledTimes(1)
    store.setActiveFloorId('f2')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`createActiveFloorStore` not exported).

- [ ] **Step 3: Minimal implementation**: mirror `createSelectionStore`'s subscribe/notify shape:

```ts
export interface ActiveFloorStore {
  getActiveFloorId(): string | null
  setActiveFloorId(id: string | null): void
  subscribe(listener: () => void): () => void
}

export function createActiveFloorStore(initialId: string | null = null): ActiveFloorStore {
  let activeId = initialId
  const listeners = new Set<() => void>()
  return {
    getActiveFloorId: () => activeId,
    setActiveFloorId(id) {
      if (id === activeId) {
        return
      }
      activeId = id
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run bridge/active-floor/active-floor-store.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 2.2: the React context exposes the active floor id and setter

**Files:** create `bridge/react/active-floor-context.ts`, `bridge/react/active-floor-provider.tsx`, `bridge/react/active-floor-context.test.tsx`

- [ ] **Step 1: Write the failing test** (behavior: "a component under the provider reads the active floor id and the setter updates it")

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { ActiveFloorProvider } from './active-floor-provider'
import { useActiveFloorId, useSetActiveFloorId } from './active-floor-context'

function Probe() {
  const id = useActiveFloorId()
  const setId = useSetActiveFloorId()
  return (
    <button type="button" onClick={() => setId('f2')}>
      {id ?? 'none'}
    </button>
  )
}

describe('ActiveFloorProvider', () => {
  it('exposes the active floor id and a setter to descendants', () => {
    const store = createActiveFloorStore('f1')
    render(
      <ActiveFloorProvider store={store}>
        <Probe />
      </ActiveFloorProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('f1')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('f2')
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (context/provider not exported).

- [ ] **Step 3: Minimal implementation**: a context holding the store, a provider that subscribes via `useSyncExternalStore`, and the two hooks. Mirror `selection-context.ts` / `selection-provider.tsx`:

```ts
// active-floor-context.ts
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ActiveFloorStore } from '../active-floor/active-floor-store'

export const ActiveFloorContext = createContext<ActiveFloorStore | null>(null)

function useActiveFloorStore(): ActiveFloorStore {
  const store = useContext(ActiveFloorContext)
  if (store === null) {
    throw new Error('useActiveFloor hooks must be used within an ActiveFloorProvider')
  }
  return store
}

export function useActiveFloorId(): string | null {
  const store = useActiveFloorStore()
  return useSyncExternalStore(store.subscribe, store.getActiveFloorId)
}

export function useSetActiveFloorId(): (id: string | null) => void {
  return useActiveFloorStore().setActiveFloorId
}
```

```tsx
// active-floor-provider.tsx
import type { ReactNode } from 'react'
import { ActiveFloorContext } from './active-floor-context'
import type { ActiveFloorStore } from '../active-floor/active-floor-store'

export function ActiveFloorProvider({
  store,
  children,
}: {
  store: ActiveFloorStore
  children: ReactNode
}) {
  return <ActiveFloorContext.Provider value={store}>{children}</ActiveFloorContext.Provider>
}
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run bridge/react/active-floor-context.test.tsx`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 2.3: export the active-floor store, provider, and hooks (infrastructure)

**Files:** modify `bridge/index.ts`

- [ ] **Step 1: Append the re-exports** next to the existing selection exports:

```ts
export { createActiveFloorStore, type ActiveFloorStore } from './active-floor/active-floor-store'
export { ActiveFloorProvider } from './react/active-floor-provider'
export { useActiveFloorId, useSetActiveFloorId } from './react/active-floor-context'
```

- [ ] **Step 2: Verify**: `pnpm typecheck`. Expected: green.

- [ ] **Step 3: Reviewed by `/clean-code-review`; commit `build:`.**

### Task 2.4: `FloorSwitcher` lists floors, marks the active one, and selects on click

**Files:** create `editor/shell/floor-switcher.tsx`, `editor/shell/floor-switcher.test.tsx`

- [ ] **Step 1: Write the failing test** (behavior: "the switcher renders one control per floor, marks the active floor, and calls onSelectFloor with the clicked floor's id")

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FloorSwitcher } from './floor-switcher'

const floors = [
  { id: 'f1', name: 'Ground' },
  { id: 'f2', name: 'Upper' },
]

describe('FloorSwitcher', () => {
  it('lists floors, marks the active floor, and reports selection', () => {
    const onSelectFloor = vi.fn()
    render(
      <FloorSwitcher
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={onSelectFloor}
        onAddFloor={vi.fn()}
      />,
    )
    const ground = screen.getByRole('button', { name: /Ground/ })
    const upper = screen.getByRole('button', { name: /Upper/ })
    expect(ground).toHaveAttribute('aria-pressed', 'true')
    expect(upper).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(upper)
    expect(onSelectFloor).toHaveBeenCalledWith('f2')
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`FloorSwitcher` not exported).

- [ ] **Step 3: Minimal implementation**: a presentational list keyed by floor id, plus an Add control. Props are data + callbacks so the component is testable without bridge wiring:

```tsx
export interface FloorSummary {
  id: string
  name: string
}

export interface FloorSwitcherProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
}

export function FloorSwitcher({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
}: FloorSwitcherProps) {
  return (
    <nav aria-label="Floors">
      <ul>
        {floors.map((floor) => (
          <li key={floor.id}>
            <button
              type="button"
              aria-pressed={floor.id === activeFloorId}
              onClick={() => onSelectFloor(floor.id)}
            >
              {floor.name}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAddFloor}>
        Add floor
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/shell/floor-switcher.test.tsx`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 2.5: the switcher's Add control dispatches `addFloor` and selects the new floor

**Files:** modify `editor/shell/floor-switcher.tsx`, `editor/shell/floor-switcher.test.tsx`

- [ ] **Step 1: Write the failing test** (behavior: "clicking Add floor calls onAddFloor")

```tsx
it('invokes onAddFloor when the add control is clicked', () => {
  const onAddFloor = vi.fn()
  render(
    <FloorSwitcher
      floors={floors}
      activeFloorId="f1"
      onSelectFloor={vi.fn()}
      onAddFloor={onAddFloor}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Add floor/ }))
  expect(onAddFloor).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run to verify RED/GREEN**: Run `pnpm exec vitest run editor/shell/floor-switcher.test.tsx`. This is likely GREEN against the Task 2.4 component (the Add control already calls `onAddFloor`); if so, it is a regression guard. Land an empty `refactor:` marker if no code change is needed; otherwise wire the missing callback.

- [ ] **Step 3: BLUE + commit**

### Task 2.6: wire the switcher into the shell and route the active floor (infrastructure)

**Files:** modify `editor/shell/editor-shell.tsx`, and wherever the session is provided (the `EditorSessionProvider` host) to mount `ActiveFloorProvider` with a store seeded to the first floor id.

- [ ] **Step 1:** Mount `ActiveFloorProvider` (store seeded to `project.floors[0]?.id ?? null`) at the same level the `EditorSessionProvider` and `SelectionProvider` are mounted (the app/provider host), so the shell and plan view share it.

- [ ] **Step 2:** In `editor-shell.tsx`, render `<FloorSwitcher>` in the toolbar. Build its props from `useSceneGraph().nodes` (the floor nodes carry `id`/`name`) and the active-floor hooks; `onSelectFloor={useSetActiveFloorId()}`; `onAddFloor={() => session.dispatch(addFloor('New Floor'))}`.

- [ ] **Step 3:** Replace the two hard-coded `session.getProject().floors[0]` reads (the `Inspector` underlay panel and `TransformPanel`) with the active floor resolved from `useActiveFloorId()`, falling back to the first floor when the active id is null or stale. Keep this a small helper, for example `activeFloor(project, activeFloorId)`.

- [ ] **Step 4: Verify**: `pnpm typecheck && pnpm lint && pnpm exec vitest run editor/shell`. The existing `editor-shell.test.tsx` must still pass (update it minimally only if it asserts on the old single-floor underlay wiring). `EditorShell` is coverage-excluded glue; the `FloorSwitcher` unit test covers the switcher behavior.

- [ ] **Step 5: Reviewed by `/clean-code-review`; commit `feat:`** (this is the user-visible feature seam) **then `refactor:` BLUE marker.** Keep `FloorSwitcher` self-contained for the app-layout-shell rebase noted in the overlap section.

---

## Slice 3: The stair entity (model + commands)

**Goal:** Introduce the stair as a top-level, floor-spanning entity per design spec §3.1 (`stairs[]` is top-level) and §3.2 ("stairs are NOT openings"). The stair carries parametric data (its run type as a parameter: straight, L-turn, U-turn, winder, spiral), a plan footprint placement on its lower floor, and a `connection` linking two floors. A new top-level `Project.stairs[]` array rides a schema migration. Commands add, remove, move, and re-parameterize a stair through dispatch. **No 3D geometry, no tread/riser meshes (deferred, see Non-goals).**

**Files:**

- Modify: `core/model/types.ts`
- Modify: `core/model/factories.ts`
- Modify: `core/model/factories.test.ts`
- Create: `core/commands/handlers/stair-commands.ts`
- Create: `core/commands/handlers/stair-commands.test.ts`
- Modify: `core/commands/command-registry.ts` (register the stair command group with the default registry build, alongside the others). confirm where command groups are aggregated; if they are aggregated in a single builder, register there.
- Modify (infrastructure): `core/index.ts`

Public contract:

```ts
// core/model/types.ts
/** Stair run geometry family, a parameter (not a subclass). Spec §10 Phase 5. */
export type StairRunType = 'straight' | 'l-turn' | 'u-turn' | 'winder' | 'spiral'

/** Links a stair to the two floors it spans. The stair rises from `fromFloorId` to `toFloorId`. */
export interface StairConnection {
  fromFloorId: string
  toFloorId: string
}

export interface Stair {
  id: string
  /** Run geometry family; drives the 2D symbol and (later) the 3D mesher. */
  runType: StairRunType
  /** Plan-space anchor of the stair footprint on the lower floor, in millimeters. */
  position: Point
  /** Footprint width across the run, in millimeters. */
  width: number
  /** Total plan run length of the footprint, in millimeters. */
  length: number
  /** Rotation of the footprint about `position`, in radians (clockwise on screen, matching plan-y-down). */
  rotation: number
  /** The two floors this stair connects. */
  connection: StairConnection
}

// Project gains: stairs: Stair[]

// core/model/factories.ts
export const DEFAULT_STAIR_WIDTH_MM = 914 // 36 in
export const DEFAULT_STAIR_LENGTH_MM = 3000 // a nominal straight-run footprint
export interface NewStairOptions {
  runType?: StairRunType
  position?: Point
  width?: number
  length?: number
  rotation?: number
  connection: StairConnection
  id?: string
}
export function createStair(options: NewStairOptions): Stair

// core/commands/handlers/stair-commands.ts
export function addStair(stair: Stair): Command<AddStairParams>
export function removeStair(stairId: string): Command<RemoveStairParams>
export function moveStair(stairId: string, position: Point): Command<MoveStairParams>
export function setStairRunType(
  stairId: string,
  runType: StairRunType,
): Command<SetStairRunTypeParams>
```

### Task 3.1: add `Stair`, `StairRunType`, `StairConnection`, and `Project.stairs[]`; factory; migration v5→v6

This task introduces the model shape, factory, the empty default on `createEmptyProject`, and the migration in one cohesive RED→GREEN (the type and factory are required together for the test to compile). The migration default for legacy documents is an empty `stairs: []`.

**Files:** modify `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`; create `core/migrations/schema/add-stairs.ts`, `core/migrations/schema/add-stairs.test.ts`; modify `core/migrations/schema/index.ts`.

- [ ] **Step 1: Write the failing tests** (two behaviors)

Behavior A: "`createStair` builds a stair with defaults and a fixed id."

```ts
import { describe, expect, it } from 'vitest'
import { createStair, DEFAULT_STAIR_WIDTH_MM } from './factories'

describe('createStair', () => {
  it('builds a stair with the default run type, width, and the given connection', () => {
    const stair = createStair({
      id: 's1',
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    expect(stair).toMatchObject({
      id: 's1',
      runType: 'straight',
      width: DEFAULT_STAIR_WIDTH_MM,
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    expect(stair.position).toEqual({ x: 0, y: 0 })
    expect(stair.rotation).toBe(0)
  })
})
```

Behavior B (migration): "a version-5 document with no `stairs` key migrates to a version-6 shape with `stairs: []`, preserving an already-present array." (Mirror the `add-floor-openings.test.ts` structure.)

```ts
import { describe, expect, it } from 'vitest'
import { addStairsMigration } from './add-stairs'

describe('addStairsMigration', () => {
  it('backfills an empty stairs array when absent', () => {
    const migrated = addStairsMigration.migrate({ meta: {}, floors: [] } as never)
    expect((migrated as { stairs: unknown }).stairs).toEqual([])
  })

  it('preserves an existing stairs array', () => {
    const existing = [{ id: 's1' }]
    const migrated = addStairsMigration.migrate({ meta: {}, floors: [], stairs: existing } as never)
    expect((migrated as { stairs: unknown }).stairs).toBe(existing)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Run `pnpm exec vitest run core/model/factories.test.ts core/migrations/schema/add-stairs.test.ts`. Expected: FAIL (`createStair`, `addStairsMigration` not exported).

- [ ] **Step 3: Minimal implementation**

In `core/model/types.ts`, add `StairRunType`, `StairConnection`, `Stair` (exact signatures above) and add `stairs: Stair[]` to `Project`.

In `core/model/factories.ts`, add the defaults and factory, and add `stairs: []` to `createEmptyProject`:

```ts
export const DEFAULT_STAIR_WIDTH_MM = 914
export const DEFAULT_STAIR_LENGTH_MM = 3000

export interface NewStairOptions {
  runType?: StairRunType
  position?: Point
  width?: number
  length?: number
  rotation?: number
  connection: StairConnection
  id?: string
}

export function createStair(options: NewStairOptions): Stair {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    runType: options.runType ?? 'straight',
    position: options.position ?? { x: 0, y: 0 },
    width: options.width ?? DEFAULT_STAIR_WIDTH_MM,
    length: options.length ?? DEFAULT_STAIR_LENGTH_MM,
    rotation: options.rotation ?? 0,
    connection: options.connection,
  }
}
```

Bump `CURRENT_SCHEMA_VERSION` to `6`. Add `core/migrations/schema/add-stairs.ts` (mirror `add-floor-openings.ts`, `from: 5`, backfill `stairs: []` only when absent) and register it last in `core/migrations/schema/index.ts`.

```ts
import type { ProjectShape, SchemaMigration } from '../types'

export const addStairsMigration: SchemaMigration = {
  from: 5,
  migrate(project) {
    const stairs = (project as Record<string, unknown>).stairs
    return { ...project, stairs: Array.isArray(stairs) ? stairs : [] } satisfies ProjectShape
  },
}
```

(Confirm `ProjectShape` allows an extra top-level array; if it is a closed type, extend it the same way the openings migration's `ProjectShape` was extended for `underlays`/`openings`.)

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/model core/migrations`. Expected: PASS. Also re-run the full migration round-trip test if one exists (chain v1→6).

- [ ] **Step 5: BLUE + commit**

### Task 3.2: `addStair` appends a stair and undoes

**Files:** create `core/commands/handlers/stair-commands.ts`, `core/commands/handlers/stair-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "addStair appends the stair to `project.stairs` and removes it on undo")

```ts
import { describe, expect, it } from 'vitest'
import { createStair } from '../../model/factories'
import { createDispatcher } from '../dispatcher'
import { buildCommandRegistry } from '../command-registry'
import { addStair, registerStairCommands } from './stair-commands'
import type { Project } from '../../model/types'

const emptyProject: Project = {
  meta: {
    name: 'p',
    units: 'metric',
    period: 'contemporary',
    schemaVersion: 6,
    appVersion: '0.0.0',
    registryVersions: {},
  },
  floors: [],
  stairs: [],
}

describe('addStair', () => {
  it('appends a stair and removes it on undo', () => {
    const dispatcher = createDispatcher(emptyProject, registerStairCommands(buildCommandRegistry()))
    const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
    dispatcher.dispatch(addStair(stair))
    expect(dispatcher.getState().stairs).toHaveLength(1)
    expect(dispatcher.getState().stairs[0].id).toBe('s1')
    dispatcher.undo()
    expect(dispatcher.getState().stairs).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`addStair`/`registerStairCommands` not exported).

- [ ] **Step 3: Minimal implementation**: reassign the whole `stairs` slice so the inverse-capture proxy records the top-level key:

```ts
import type { Point, Project, Stair, StairRunType } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_STAIR = 'project/add-stair'

export interface AddStairParams {
  stair: Stair
}

export function addStair(stair: Stair): Command<AddStairParams> {
  return { type: ADD_STAIR, params: { stair }, description: 'Add stair' }
}

const addStairHandler: CommandHandler<Project, AddStairParams> = {
  apply(state, params) {
    state.stairs = [...state.stairs, params.stair]
  },
}

export function registerStairCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry.register(ADD_STAIR, addStairHandler)
}
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/commands/handlers/stair-commands.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 3.3: `removeStair` removes the target stair and undoes

**Files:** modify `core/commands/handlers/stair-commands.ts`, `core/commands/handlers/stair-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "removeStair removes only the target stair and restores it on undo")

```ts
import { removeStair } from './stair-commands'

it('removes the target stair and restores it on undo', () => {
  const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
  const dispatcher = createDispatcher(
    { ...emptyProject, stairs: [stair] },
    registerStairCommands(buildCommandRegistry()),
  )
  dispatcher.dispatch(removeStair('s1'))
  expect(dispatcher.getState().stairs).toHaveLength(0)
  dispatcher.undo()
  expect(dispatcher.getState().stairs.map((s) => s.id)).toEqual(['s1'])
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`removeStair` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export const REMOVE_STAIR = 'project/remove-stair'

export interface RemoveStairParams {
  stairId: string
}

export function removeStair(stairId: string): Command<RemoveStairParams> {
  return { type: REMOVE_STAIR, params: { stairId }, description: 'Remove stair' }
}

const removeStairHandler: CommandHandler<Project, RemoveStairParams> = {
  apply(state, params) {
    state.stairs = state.stairs.filter((stair) => stair.id !== params.stairId)
  },
}
```

Register it: `.register(REMOVE_STAIR, removeStairHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 3.4: `moveStair` repositions a stair footprint and undoes

**Files:** modify `core/commands/handlers/stair-commands.ts`, `core/commands/handlers/stair-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "moveStair sets the stair position and restores the prior position on undo; consecutive moves coalesce")

```ts
import { moveStair } from './stair-commands'

it('moves a stair and restores its prior position on undo', () => {
  const stair = createStair({
    id: 's1',
    position: { x: 0, y: 0 },
    connection: { fromFloorId: 'f1', toFloorId: 'f2' },
  })
  const dispatcher = createDispatcher(
    { ...emptyProject, stairs: [stair] },
    registerStairCommands(buildCommandRegistry()),
  )
  dispatcher.dispatch(moveStair('s1', { x: 1500, y: 2500 }))
  expect(dispatcher.getState().stairs[0].position).toEqual({ x: 1500, y: 2500 })
  dispatcher.undo()
  expect(dispatcher.getState().stairs[0].position).toEqual({ x: 0, y: 0 })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`moveStair` not exported).

- [ ] **Step 3: Minimal implementation**: add a `coalesceWith` on stair id, mirroring `setFloorCeilingHeight`:

```ts
export const MOVE_STAIR = 'project/move-stair'

export interface MoveStairParams {
  stairId: string
  position: Point
}

export function moveStair(stairId: string, position: Point): Command<MoveStairParams> {
  return {
    type: MOVE_STAIR,
    params: { stairId, position },
    description: 'Move stair',
    coalesceWith(previous) {
      if (previous.type !== MOVE_STAIR) {
        return null
      }
      if ((previous.params as MoveStairParams).stairId !== stairId) {
        return null
      }
      return moveStair(stairId, position)
    },
  }
}

const moveStairHandler: CommandHandler<Project, MoveStairParams> = {
  apply(state, params) {
    state.stairs = state.stairs.map((stair) =>
      stair.id === params.stairId ? { ...stair, position: params.position } : stair,
    )
  },
}
```

Register it: `.register(MOVE_STAIR, moveStairHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 3.5: `setStairRunType` changes the run-type parameter and undoes

**Files:** modify `core/commands/handlers/stair-commands.ts`, `core/commands/handlers/stair-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "setStairRunType changes the stair's run type and restores the prior value on undo")

```ts
import { setStairRunType } from './stair-commands'

it('changes the run type and restores the prior value on undo', () => {
  const stair = createStair({
    id: 's1',
    runType: 'straight',
    connection: { fromFloorId: 'f1', toFloorId: 'f2' },
  })
  const dispatcher = createDispatcher(
    { ...emptyProject, stairs: [stair] },
    registerStairCommands(buildCommandRegistry()),
  )
  dispatcher.dispatch(setStairRunType('s1', 'u-turn'))
  expect(dispatcher.getState().stairs[0].runType).toBe('u-turn')
  dispatcher.undo()
  expect(dispatcher.getState().stairs[0].runType).toBe('straight')
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`setStairRunType` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export const SET_STAIR_RUN_TYPE = 'project/set-stair-run-type'

export interface SetStairRunTypeParams {
  stairId: string
  runType: StairRunType
}

export function setStairRunType(
  stairId: string,
  runType: StairRunType,
): Command<SetStairRunTypeParams> {
  return {
    type: SET_STAIR_RUN_TYPE,
    params: { stairId, runType },
    description: 'Set stair run type',
  }
}

const setStairRunTypeHandler: CommandHandler<Project, SetStairRunTypeParams> = {
  apply(state, params) {
    state.stairs = state.stairs.map((stair) =>
      stair.id === params.stairId ? { ...stair, runType: params.runType } : stair,
    )
  },
}
```

Register it: `.register(SET_STAIR_RUN_TYPE, setStairRunTypeHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 3.6: export the stair surface and register the command group (infrastructure)

**Files:** modify `core/index.ts`; ensure `registerStairCommands` is composed into the default registry the dispatcher uses (find where `registerProjectCommands`, `registerWallCommands`, etc. are aggregated and add `registerStairCommands` there).

- [ ] **Step 1: Append the re-exports** to `core/index.ts`:

```ts
export type { Stair, StairRunType, StairConnection } from './model/types'
export type { NewStairOptions } from './model/factories'
export { DEFAULT_STAIR_WIDTH_MM, DEFAULT_STAIR_LENGTH_MM, createStair } from './model/factories'
export type {
  AddStairParams,
  RemoveStairParams,
  MoveStairParams,
  SetStairRunTypeParams,
} from './commands/handlers/stair-commands'
export {
  ADD_STAIR,
  REMOVE_STAIR,
  MOVE_STAIR,
  SET_STAIR_RUN_TYPE,
  addStair,
  removeStair,
  moveStair,
  setStairRunType,
  registerStairCommands,
} from './commands/handlers/stair-commands'
```

- [ ] **Step 2:** Compose `registerStairCommands` into the default registry chain (the same place the other groups are registered for the live editor session).

- [ ] **Step 3: Verify**: `pnpm typecheck && pnpm exec vitest run core/commands`. Expected: green.

- [ ] **Step 4: Reviewed by `/clean-code-review`; commit `build:`.**

---

## Slice 4: Underlay kinds and references (document and scene)

**Goal:** Generalize the underlay so it carries its `kind` (raster, document, scene) and a discriminated source, completing the underlay layer's reference model per design spec §3.1 ("calibrated image/PDF/scene references") and §3.2 ("Underlays are first-class"). The existing raster `Underlay` becomes the `kind: 'raster'` variant; document (PDF) and scene (glTF/glb) variants add their reference and the data each needs. **Reference modeling only: no PDF rasterization and no glTF decoding (those are engine/loader work behind the 3D and document seams).** A schema migration backfills `kind: 'raster'` onto existing underlays.

**Note on migration ownership:** Slice 3 already bumps `CURRENT_SCHEMA_VERSION` to 6 with `add-stairs` (`from: 5`). This slice's migration is `from: 6` (bumps to 7). If Slices 3 and 4 are developed in parallel, the second to land renumbers its `from` to follow the first; only one final `CURRENT_SCHEMA_VERSION` lands per merge.

**Files:**

- Modify: `core/model/types.ts`
- Modify: `core/model/factories.ts`
- Modify: `core/model/factories.test.ts`
- Create: `core/migrations/schema/add-underlay-kind.ts`
- Create: `core/migrations/schema/add-underlay-kind.test.ts`
- Modify: `core/migrations/schema/index.ts`
- Modify (infrastructure): `core/index.ts`

Public contract:

```ts
// core/model/types.ts
export type UnderlayKind = 'raster' | 'document' | 'scene'

/** The reference and per-kind data for an underlay's source content (all content-addressed, ADR-0007). */
export type UnderlaySource =
  | { kind: 'raster'; image: AssetReference }
  // A document underlay references the source document (for example a PDF) and the page to show.
  | { kind: 'document'; document: AssetReference; page: number }
  // A scene underlay references an externally-authored glTF/glb scene used as a tracing reference.
  | { kind: 'scene'; scene: AssetReference }

export interface Underlay {
  id: string
  source: UnderlaySource
  /** Source extent in source units (pixels for raster/document, plan millimeters for scene). */
  width: number
  height: number
  placement: UnderlayPlacement
  opacity: number
  visible: boolean
}
```

Note: this **replaces** the current `image: AssetReference` field on `Underlay` with the discriminated `source`. That is a breaking shape change to a persisted record, so it rides the migration (move `image` into `source: { kind: 'raster', image }`) and updates the raster factory, the scene-graph underlay node, and the 2D draw path. Those consumers are listed in the tasks below.

### Task 4.1: `Underlay` carries a discriminated `source`; raster factory updated; migration backfills

**Files:** modify `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`; create `core/migrations/schema/add-underlay-kind.ts` + test; modify `core/migrations/schema/index.ts`.

- [ ] **Step 1: Write the failing tests** (two behaviors)

Behavior A: "`createUnderlay` builds a raster underlay whose source is `{ kind: 'raster', image }`."

```ts
import { describe, expect, it } from 'vitest'
import { createUnderlay } from './factories'

describe('createUnderlay', () => {
  it('builds a raster underlay with a discriminated raster source', () => {
    const image = { scope: 'project' as const, contentHash: 'abc' }
    const underlay = createUnderlay({ image, width: 1000, height: 800 })
    expect(underlay.source).toEqual({ kind: 'raster', image })
    expect(underlay.visible).toBe(true)
  })
})
```

Behavior B (migration): "a pre-migration underlay with a top-level `image` migrates to `source: { kind: 'raster', image }`; an underlay already carrying `source` is unchanged."

```ts
import { describe, expect, it } from 'vitest'
import { addUnderlayKindMigration } from './add-underlay-kind'

describe('addUnderlayKindMigration', () => {
  it('moves a legacy raster image into a discriminated raster source', () => {
    const image = { scope: 'project', contentHash: 'abc' }
    const migrated = addUnderlayKindMigration.migrate({
      meta: {},
      floors: [{ underlays: [{ id: 'u1', image, width: 1, height: 1 }] }],
    } as never) as { floors: { underlays: { source: unknown }[] }[] }
    expect(migrated.floors[0].underlays[0].source).toEqual({ kind: 'raster', image })
  })
})
```

- [ ] **Step 2: Run to verify RED**: Run `pnpm exec vitest run core/model/factories.test.ts core/migrations/schema/add-underlay-kind.test.ts`. Expected: FAIL.

- [ ] **Step 3: Minimal implementation**

In `core/model/types.ts`, add `UnderlayKind` and `UnderlaySource`, and replace `Underlay.image` with `source: UnderlaySource`.

In `core/model/factories.ts`, update `createUnderlay` to emit `source: { kind: 'raster', image: options.image }` instead of `image`. (`NewUnderlayOptions` keeps `image` for the raster case.)

Bump `CURRENT_SCHEMA_VERSION` to `7` (or the next free `from` if Slice 3 has not landed; see the ownership note). Add `core/migrations/schema/add-underlay-kind.ts`:

```ts
import type { ProjectShape, SchemaMigration } from '../types'

export const addUnderlayKindMigration: SchemaMigration = {
  from: 6,
  migrate(project) {
    const floors = (project as Record<string, unknown>).floors
    if (!Array.isArray(floors)) {
      return project as ProjectShape
    }
    const migrated = floors.map((floor) => {
      const record = floor as Record<string, unknown>
      const underlays = Array.isArray(record.underlays) ? record.underlays : []
      return { ...record, underlays: underlays.map(migrateUnderlay) }
    })
    return { ...project, floors: migrated } as ProjectShape
  },
}

function migrateUnderlay(underlay: unknown): unknown {
  const record = underlay as Record<string, unknown>
  if (record.source !== undefined) {
    return record
  }
  const { image, ...rest } = record
  return { ...rest, source: { kind: 'raster', image } }
}
```

Register it last in `core/migrations/schema/index.ts`.

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/model core/migrations`. Expected: PASS. **Then run the full core suite** to surface every consumer of the removed `Underlay.image`; the next tasks fix the two that break (scene node, draw path).

- [ ] **Step 5: BLUE + commit**

### Task 4.2: the underlay scene node carries the discriminated source

**Files:** modify `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts` (or the underlay-specific scene test if one exists).

- [ ] **Step 1: Write the failing test** (behavior: "the underlay scene node exposes the underlay's source kind and reference")

```ts
it('derives an underlay scene node carrying the discriminated source', () => {
  const image = { scope: 'project' as const, contentHash: 'abc' }
  const floor = createFloor('Ground', { id: 'f1' })
  floor.underlays.push({
    id: 'u1',
    source: { kind: 'raster', image },
    width: 100,
    height: 80,
    placement: { offset: { x: 0, y: 0 }, millimetersPerPixel: 1, rotation: 0 },
    opacity: 1,
    visible: true,
  })
  const node = deriveUnderlayNode(floor, floor.underlays[0])
  expect(node.source).toEqual({ kind: 'raster', image })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`UnderlaySceneNode` still carries `image`, not `source`).

- [ ] **Step 3: Minimal implementation**: replace `image: AssetReference` on `UnderlaySceneNode` with `source: UnderlaySource`; carry it through `deriveUnderlayNode`. Update the type import.

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/scene`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 4.3: the 2D draw path reads the raster source (and ignores non-raster kinds for now)

**Files:** modify `editor/plan/draw-underlay.ts` (and `editor/plan/underlay-resolve.ts` / `use-resolve-underlays.ts` if they read `.image`), with their tests.

- [ ] **Step 1: Write the failing test** (behavior: "the underlay resolver picks up a raster underlay's image from its source; a non-raster underlay yields no raster bitmap request")

The exact assertion depends on the resolver shape; the `test-author` reads `underlay-resolve.test.ts` and asserts that the resolver derives its `AssetReference` from `source` when `source.kind === 'raster'` and skips (returns no raster request) for `'document'`/`'scene'`.

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (resolver reads the removed `.image`).

- [ ] **Step 3: Minimal implementation**: change the raster-image read from `underlay.image` to `underlay.source.kind === 'raster' ? underlay.source.image : undefined`, threading through the resolver and `draw-underlay`. Document and scene underlays render no raster bitmap in 2D yet (a later cycle adds a document-page raster and a scene placeholder footprint); they are simply skipped by the raster path.

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/plan`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 4.4: export the underlay kind types (infrastructure)

**Files:** modify `core/index.ts`

- [ ] **Step 1: Add** `UnderlayKind` and `UnderlaySource` to the `model/types` type re-export block.

- [ ] **Step 2: Verify**: `pnpm typecheck && pnpm lint && pnpm exec vitest run core editor/plan`. Expected: green.

- [ ] **Step 3: Reviewed by `/clean-code-review`; commit `build:`.**

---

## Slice 5: Stair 2D plan symbol and stairwell topology

**Goal:** Project stairs into the scene graph as `StairSceneNode`s, register a stair plan symbol in the element-type registry, render the stair footprint and direction in the 2D plan, and model the floor-spanning stairwell topology as data (a stairwell void on the upper floor that the stair connects to). **No 3D geometry; the void is data the renderer/exporter will consume later.**

**Files:**

- Modify: `core/registries/element-types.ts`, `core/registries/element-types.test.ts`
- Modify: `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`
- Modify: `core/scene/scene-graph-deriver.ts`, `core/scene/scene-graph-deriver.test.ts`
- Create: `core/topology/stair-well.ts`, `core/topology/stair-well.test.ts`
- Create: `editor/plan/draw-stair.ts`, `editor/plan/draw-stair.test.ts`
- Modify: `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`
- Modify (infrastructure): `core/index.ts`, `editor/plan/plan-view.tsx`

Public contract:

```ts
// core/scene/scene-graph.ts
export const STAIR_NODE_PREFIX = 'stair:'
export interface StairSceneNode {
  id: string
  kind: 'stair'
  /** The floor whose plan the footprint is drawn on (the lower floor of the connection). */
  floorId: string
  runType: StairRunType
  position: Point
  width: number
  length: number
  rotation: number
  /** The floor the stairwell void is punched into (the upper floor of the connection). */
  wellFloorId: string
}
// SceneGraph gains: stairs: StairSceneNode[]
export function deriveStairNodes(project: Project): StairSceneNode[]

// core/topology/stair-well.ts
/** The plan-space rectangle a stair's footprint occupies, as a closed polygon (the stairwell void on the upper floor). */
export function stairWellPolygon(stair: Stair): Point[]
```

### Task 5.1: register a stair element type with a plan symbol

**Files:** modify `core/registries/element-types.ts`, `core/registries/element-types.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the registry contains a stair element type in the new 'stair' category with a plan symbol")

```ts
import { describe, expect, it } from 'vitest'
import { builtinElementTypes } from './element-types'
import { getEntry } from './registry'

describe('stair element type', () => {
  it('registers a straight-stair type with a stair plan symbol', () => {
    const entry = getEntry(builtinElementTypes, 'straight-stair')
    expect(entry?.category).toBe('stair')
    expect(entry?.plan2D.symbol).toBe('stair-run')
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`'stair'` is not a valid category; entry absent).

- [ ] **Step 3: Minimal implementation**: widen `ElementCategory` to `'wall' | 'opening' | 'stair'`, bump `ELEMENT_TYPE_REGISTRY_VERSION`, and add the entry:

```ts
{
  id: 'straight-stair',
  category: 'stair',
  plan2D: { symbol: 'stair-run' },
  scene3D: { builder: 'parametric-stair' }, // builder is a deferred 3D seam; no mesher ships here
},
```

(One entry suffices; the run _type_ is a stair parameter, not a registry entry. The `scene3D.builder` string is a forward reference to the deferred mesher.)

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.2: `stairWellPolygon` computes the footprint rectangle

**Files:** create `core/topology/stair-well.ts`, `core/topology/stair-well.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the stairwell polygon is the rotated footprint rectangle of width x length anchored at the stair position")

```ts
import { describe, expect, it } from 'vitest'
import { createStair } from '../model/factories'
import { stairWellPolygon } from './stair-well'

describe('stairWellPolygon', () => {
  it('returns an axis-aligned footprint rectangle for a zero-rotation stair', () => {
    const stair = createStair({
      position: { x: 1000, y: 2000 },
      width: 1000,
      length: 3000,
      rotation: 0,
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    const polygon = stairWellPolygon(stair)
    expect(polygon).toHaveLength(4)
    // footprint spans [1000,2000] to [2000,5000] (width across x, length along y)
    const xs = polygon.map((p) => p.x).sort((a, b) => a - b)
    const ys = polygon.map((p) => p.y).sort((a, b) => a - b)
    expect(xs[0]).toBe(1000)
    expect(xs[3]).toBe(2000)
    expect(ys[0]).toBe(2000)
    expect(ys[3]).toBe(5000)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`stairWellPolygon` not exported).

- [ ] **Step 3: Minimal implementation**: build the four corners of a `width` x `length` rectangle at `position`, then rotate each corner about `position` by `stair.rotation` (clockwise on screen; reuse the plan's existing rotate helper if one exists in `editor/plan/geometry.ts`, otherwise inline the 2x2 rotation in `core/geometry`):

```ts
import type { Point, Stair } from '../model/types'

export function stairWellPolygon(stair: Stair): Point[] {
  const corners: Point[] = [
    { x: stair.position.x, y: stair.position.y },
    { x: stair.position.x + stair.width, y: stair.position.y },
    { x: stair.position.x + stair.width, y: stair.position.y + stair.length },
    { x: stair.position.x, y: stair.position.y + stair.length },
  ]
  return corners.map((corner) => rotateAbout(corner, stair.position, stair.rotation))
}

function rotateAbout(point: Point, origin: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}
```

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.3: `deriveStairNodes` projects stairs into the scene graph

**Files:** modify `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the derived scene graph carries one stair node per stair, on its lower floor, with the upper floor as its well floor")

```ts
it('derives a stair scene node on the lower floor referencing the upper floor as its well', () => {
  const lower = createFloor('Ground', { id: 'f1' })
  const upper = createFloor('Upper', { id: 'f2' })
  const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
  const graph = deriveSceneGraph({
    meta: {
      name: 'p',
      units: 'metric',
      period: 'contemporary',
      schemaVersion: 7,
      appVersion: '0',
      registryVersions: {},
    },
    floors: [lower, upper],
    stairs: [stair],
  })
  expect(graph.stairs).toHaveLength(1)
  expect(graph.stairs[0]).toMatchObject({
    kind: 'stair',
    floorId: 'f1',
    wellFloorId: 'f2',
    runType: 'straight',
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`graph.stairs` undefined; `deriveStairNodes`/`StairSceneNode` not exported).

- [ ] **Step 3: Minimal implementation**: add `STAIR_NODE_PREFIX`, `StairSceneNode`, `stairs: StairSceneNode[]` on `SceneGraph`, `deriveStairNodes(project)`, and include it in `deriveSceneGraph`:

```ts
export const STAIR_NODE_PREFIX = 'stair:'

export interface StairSceneNode {
  id: string
  kind: 'stair'
  floorId: string
  runType: StairRunType
  position: Point
  width: number
  length: number
  rotation: number
  wellFloorId: string
}

export function deriveStairNodes(project: Project): StairSceneNode[] {
  return project.stairs.map((stair) => ({
    id: `${STAIR_NODE_PREFIX}${stair.id}`,
    kind: 'stair',
    floorId: stair.connection.fromFloorId,
    runType: stair.runType,
    position: stair.position,
    width: stair.width,
    length: stair.length,
    rotation: stair.rotation,
    wellFloorId: stair.connection.toFloorId,
  }))
}

// in deriveSceneGraph: stairs: deriveStairNodes(project),
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/scene/scene-graph.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.4: the deriver memoizes stair nodes by project `stairs` reference

**Files:** modify `core/scene/scene-graph-deriver.ts`, `core/scene/scene-graph-deriver.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the deriver reuses the stairs array while the project's `stairs` reference is unchanged and rebuilds it when it changes")

```ts
it('reuses stair nodes for an unchanged stairs reference and rebuilds on change', () => {
  const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
  const project = projectWith([
    createFloor('Ground', { id: 'f1' }),
    createFloor('Upper', { id: 'f2' }),
  ])
  const withStairs = { ...project, stairs: [stair] }
  const derive = createSceneGraphDeriver()
  const first = derive(withStairs)
  const second = derive(withStairs)
  expect(second.stairs).toBe(first.stairs)
  const replaced = { ...withStairs, stairs: [stair] }
  expect(derive(replaced).stairs).not.toBe(first.stairs)
})
```

(`projectWith` from the existing deriver test; ensure it includes `stairs: []` now that `Project` requires it.)

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (stairs rebuilt each call).

- [ ] **Step 3: Minimal implementation**: add a `WeakMap<readonly Stair[], StairSceneNode[]>` (keyed by `project.stairs`) memo in the deriver, mirroring the per-floor caches already there.

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.5: `drawStair` paints the stair footprint with a direction indicator

**Files:** create `editor/plan/draw-stair.ts`, `editor/plan/draw-stair.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawStair strokes the footprint outline and draws the run treads/arrow for the active floor's stair")

```ts
import { describe, expect, it } from 'vitest'
import { drawStair } from './draw-stair'
import { DEFAULT_PLAN_SCALE } from './viewport'

// recordingContext() mirrors the helper in draw-plan.test.ts (op-recording canvas stub).

describe('drawStair', () => {
  it('strokes a footprint outline and at least one run line for a stair', () => {
    const { ctx, calls } = recordingContext()
    drawStair(
      ctx,
      {
        id: 'stair:s1',
        kind: 'stair',
        floorId: 'f1',
        wellFloorId: 'f2',
        runType: 'straight',
        position: { x: 0, y: 0 },
        width: 1000,
        length: 3000,
        rotation: 0,
      },
      { scale: DEFAULT_PLAN_SCALE },
    )
    const ops = calls.map((call) => call.op)
    expect(ops).toContain('stroke')
    expect(ops.filter((op) => op === 'moveTo').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`drawStair` not exported).

- [ ] **Step 3: Minimal implementation**: stroke the footprint polygon (reuse `stairWellPolygon` from core for the outline) and draw evenly spaced tread lines across the run for a straight stair, plus a single direction arrow up the run. For non-straight run types this slice draws the footprint outline and the arrow only (tread layout for L/U/winder/spiral is a later 2D refinement; document this in the slice deferral). Project world points through the plan's `worldToScreen` (the same helper `draw-plan.ts` uses).

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/plan/draw-stair.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.6: `drawPlan` paints stairs for the active floor

**Files:** modify `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawPlan draws each stair node whose floorId matches the rendered floor, above the room fills")

```ts
it('draws a stair footprint on the plan', () => {
  const { ctx, calls } = recordingContext()
  drawPlan(ctx, {
    walls: [],
    rooms: [],
    dimensions: [],
    openings: [],
    stairs: [
      {
        id: 'stair:s1',
        kind: 'stair',
        floorId: 'f',
        wellFloorId: 'f2',
        runType: 'straight',
        position: { x: 0, y: 0 },
        width: 1000,
        length: 3000,
        rotation: 0,
      },
    ],
    viewport: { scale: DEFAULT_PLAN_SCALE },
    width: 800,
    height: 600,
    selectedIds: new Set<string>(),
  })
  expect(calls.map((c) => c.op)).toContain('stroke')
})
```

(The `test-author` reads the current `DrawPlanOptions` shape to supply exactly the required fields.)

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`stairs` not an accepted option; no stair drawn).

- [ ] **Step 3: Minimal implementation**: add `stairs: readonly StairSceneNode[]` to `DrawPlanOptions` and call `drawStair` for each stair after the room fills (and before/with the wall strokes, since a stair sits on the floor like a room). Default to `[]` when omitted so existing callers/tests keep compiling (the `test-author` will pass it explicitly).

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/plan/draw-plan.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 5.7: export the stair scene surface and thread it into the plan (infrastructure)

**Files:** modify `core/index.ts`, `editor/plan/plan-view.tsx`

- [ ] **Step 1: Export** `StairSceneNode`, `STAIR_NODE_PREFIX`, `deriveStairNodes` from `core/index.ts`, and `stairWellPolygon` from `core/topology/stair-well`.

- [ ] **Step 2:** In `plan-view.tsx`, add `stairs` to the `PlanScene` and pass `graph.stairs` (filtered to the active floor id, the same way walls are sourced) into the `drawPlan` call; add it to the redraw effect's dependency array.

- [ ] **Step 3: Verify**: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm exec vitest run core editor/plan`. Expected: green. The existing scene visual-regression spec (ADR-0045) is unaffected (no 3D stair geometry); confirm it still self-skips/passes.

- [ ] **Step 4: Reviewed by `/clean-code-review`; commit `build:`.**

---

## Slice 6: Trace mode (wall tool snaps to underlay features)

**Goal:** A basic trace mode (design spec §10 Phase 5: "wall tool snaps to underlay features; basic; no auto-trace"). When trace mode is on, the wall tool's snap context includes the active underlay's calibrated corner/edge feature points so the user can trace over a placed underlay. No automatic vectorization. The trace feature points are derived from the underlay placement (its calibrated footprint corners), not from image analysis.

**Files:**

- Create: `editor/plan/underlay-trace-points.ts`, `editor/plan/underlay-trace-points.test.ts`
- Modify: `editor/plan/snap.ts`, `editor/plan/snap.test.ts`
- Modify (infrastructure): `editor/plan/use-snapping.ts`, the tool context (`editor/tools/active-tool-context.ts` if a trace toggle is added there) and shell toggle.

Public contract:

```ts
// editor/plan/underlay-trace-points.ts
import type { UnderlaySceneNode, Point } from '../../core'
/** Calibrated plan-space corner points of an underlay's placed footprint, used as trace snap targets. */
export function underlayTracePoints(underlay: UnderlaySceneNode): Point[]

// editor/plan/snap.ts (SnapContext extension)
export interface SnapContext {
  walls: readonly WallSceneNode[]
  gridSpacingMm: number
  toleranceMm: number
  origin?: Point
  /** Extra trace snap targets (underlay footprint corners), considered when trace mode is on. */
  tracePoints?: readonly Point[]
}
export type SnapKind = 'endpoint' | 'midpoint' | 'perpendicular' | 'parallel' | 'grid' | 'trace'
```

### Task 6.1: `underlayTracePoints` returns an underlay's calibrated footprint corners

**Files:** create `editor/plan/underlay-trace-points.ts`, `editor/plan/underlay-trace-points.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the trace points are the four calibrated corners of the underlay footprint in plan millimeters")

```ts
import { describe, expect, it } from 'vitest'
import { underlayTracePoints } from './underlay-trace-points'

const node = {
  id: 'underlay:u1',
  kind: 'underlay' as const,
  floorId: 'f1',
  source: { kind: 'raster' as const, image: { scope: 'project' as const, contentHash: 'abc' } },
  width: 100,
  height: 50,
  placement: { offset: { x: 1000, y: 2000 }, millimetersPerPixel: 10, rotation: 0 },
  opacity: 1,
  visible: true,
}

describe('underlayTracePoints', () => {
  it('returns the four calibrated footprint corners in plan millimeters', () => {
    const points = underlayTracePoints(node)
    // footprint: offset (1000,2000), size 100*10 x 50*10 = 1000 x 500
    expect(points).toHaveLength(4)
    expect(points).toContainEqual({ x: 1000, y: 2000 })
    expect(points).toContainEqual({ x: 2000, y: 2000 })
    expect(points).toContainEqual({ x: 2000, y: 2500 })
    expect(points).toContainEqual({ x: 1000, y: 2500 })
  })
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`underlayTracePoints` not exported).

- [ ] **Step 3: Minimal implementation**: corner = offset + (pixel extent x mmPerPixel), rotated about the offset by `placement.rotation` (reuse the same `rotateAbout` shape as the stair well):

```ts
import type { Point, UnderlaySceneNode } from '../../core'

export function underlayTracePoints(underlay: UnderlaySceneNode): Point[] {
  const { offset, millimetersPerPixel, rotation } = underlay.placement
  const w = underlay.width * millimetersPerPixel
  const h = underlay.height * millimetersPerPixel
  const corners: Point[] = [
    { x: offset.x, y: offset.y },
    { x: offset.x + w, y: offset.y },
    { x: offset.x + w, y: offset.y + h },
    { x: offset.x, y: offset.y + h },
  ]
  return corners.map((corner) => rotateAbout(corner, offset, rotation))
}

function rotateAbout(point: Point, origin: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}
```

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/plan/underlay-trace-points.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 6.2: `snapPoint` snaps to trace points when present

**Files:** modify `editor/plan/snap.ts`, `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with trace points in the context, a cursor near a trace point snaps to it with kind 'trace', and trace snapping is absent when no trace points are supplied")

```ts
import { snapPoint } from './snap'

it('snaps to a nearby underlay trace point when trace points are supplied', () => {
  const result = snapPoint(
    { x: 1005, y: 2003 },
    { walls: [], gridSpacingMm: 0, toleranceMm: 20, tracePoints: [{ x: 1000, y: 2000 }] },
  )
  expect(result).toEqual({ point: { x: 1000, y: 2000 }, kind: 'trace' })
})

it('does not snap to a trace point when none are supplied', () => {
  const result = snapPoint({ x: 1005, y: 2003 }, { walls: [], gridSpacingMm: 0, toleranceMm: 20 })
  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run to verify RED**: Expected: FAIL (`tracePoints` not in `SnapContext`; no trace snap).

- [ ] **Step 3: Minimal implementation**: add `tracePoints?: readonly Point[]` to `SnapContext`, add `'trace'` to `SnapKind`, and consider trace points first in `snapPoint` (highest priority, like endpoints) using the existing nearest-point search over `context.tracePoints`:

```ts
export function snapPoint(cursor: Point, context: SnapContext): SnapResult | null {
  const trace = nearestPoint(cursor, context.tracePoints ?? [], context.toleranceMm)
  if (trace !== null) {
    return { point: trace, kind: 'trace' }
  }
  // ...existing endpoint/midpoint/directional/grid order unchanged...
}
```

Add a small `nearestPoint(cursor, points, tolerance)` helper (the array-of-points analogue of the existing `nearestFeature`).

- [ ] **Step 4: Run to verify GREEN**: Run `pnpm exec vitest run editor/plan/snap.test.ts`. Expected: PASS. Re-run to confirm the existing endpoint/midpoint/grid tests still pass.

- [ ] **Step 5: BLUE + commit**

### Task 6.3: wire trace mode into the wall tool's snapping (infrastructure)

**Files:** modify `editor/plan/use-snapping.ts`, the tool context / shell where a trace toggle lives.

- [ ] **Step 1:** Add a `tracePoints` input to `useSnapping`'s `SnappingInputs` and thread it into `buildContext` (only when trace mode is on; otherwise pass nothing so non-trace behavior is byte-for-byte unchanged).

- [ ] **Step 2:** Source `tracePoints` from the active floor's visible underlays via `underlayTracePoints`, gated by a trace-mode flag. Add the trace toggle as a small UI control (a checkbox in the tools nav or underlay panel) that flips the flag; keep the flag local UI state (a `useState` in the plan view or tools provider), not project model.

- [ ] **Step 3: Verify**: `pnpm typecheck && pnpm lint && pnpm exec vitest run editor/plan`. Expected: green. The wall-drawing end-to-end spec must still pass with trace mode off (default).

- [ ] **Step 4: Reviewed by `/clean-code-review`; commit `feat:`** (trace mode is a user-visible feature) **then `refactor:` BLUE marker.**

---

## Slice 7: Per-room ceiling-height override

**Goal:** A room overrides its floor's default ceiling height (design spec §10 Phase 5: "Per-room ceiling height override"). The override rides the existing optional `roomOverrides` map (ADR-0036), so no schema migration is needed (the per-room fields already migrate inside that map). A command sets and clears the per-room ceiling height through dispatch.

**Files:**

- Modify: `core/model/types.ts` (add `ceilingHeight?` to `RoomOverride`)
- Modify: `core/commands/handlers/room-commands.ts`
- Modify: `core/commands/handlers/room-commands.test.ts`
- Modify (infrastructure): `core/index.ts`

Public contract:

```ts
// core/model/types.ts. RoomOverride gains:
/** Explicit ceiling-height override in millimeters; absent means inherit the floor default. */
ceilingHeight?: number

// core/commands/handlers/room-commands.ts
export function setRoomCeilingHeight(
  roomKey: string,
  height: number | undefined,
): Command<SetRoomCeilingHeightParams>
```

### Task 7.1: `RoomOverride` carries an optional `ceilingHeight`

**Files:** modify `core/model/types.ts`. (No behavior test on its own; this is the type the command needs. The `test-author` writes the command test in Task 7.2, which fails to compile until this field exists; the `implementer` adds the field in 7.2's GREEN. To keep RGB clean, fold the field addition into Task 7.2 rather than a standalone task.)

This task is **merged into Task 7.2** so there is one RED→GREEN pair (the field has no observable behavior without the command).

### Task 7.2: `setRoomCeilingHeight` sets and clears a per-room ceiling height, and undoes

**Files:** modify `core/model/types.ts`, `core/commands/handlers/room-commands.ts`, `core/commands/handlers/room-commands.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "setRoomCeilingHeight records the override in roomOverrides and restores the prior state on undo; passing undefined clears it")

```ts
import { describe, expect, it } from 'vitest'
import { createDispatcher } from '../dispatcher'
import { buildCommandRegistry } from '../command-registry'
import { setRoomCeilingHeight, registerRoomCommands } from './room-commands'
import type { Project } from '../../model/types'

const project: Project = {
  meta: {
    name: 'p',
    units: 'metric',
    period: 'contemporary',
    schemaVersion: 7,
    appVersion: '0',
    registryVersions: {},
  },
  floors: [],
  stairs: [],
}

describe('setRoomCeilingHeight', () => {
  it('records a per-room ceiling height and clears it on undo', () => {
    const dispatcher = createDispatcher(project, registerRoomCommands(buildCommandRegistry()))
    dispatcher.dispatch(setRoomCeilingHeight('room:a-b-c', 2700))
    expect(dispatcher.getState().roomOverrides?.['room:a-b-c']?.ceilingHeight).toBe(2700)
    dispatcher.undo()
    expect(dispatcher.getState().roomOverrides?.['room:a-b-c']?.ceilingHeight).toBeUndefined()
  })

  it('clears the override when set to undefined', () => {
    const seeded: Project = { ...project, roomOverrides: { 'room:a-b-c': { ceilingHeight: 2700 } } }
    const dispatcher = createDispatcher(seeded, registerRoomCommands(buildCommandRegistry()))
    dispatcher.dispatch(setRoomCeilingHeight('room:a-b-c', undefined))
    expect(dispatcher.getState().roomOverrides?.['room:a-b-c']?.ceilingHeight).toBeUndefined()
  })
})
```

(The `test-author` reads `room-commands.ts` to match the exact `roomOverrides`-rewrite shape the sibling `setRoomPurpose`/`setRoomName` commands use, including how they reassign the whole `roomOverrides` map so the inverse-capture proxy records the top-level key.)

- [ ] **Step 2: Run to verify RED**: Run `pnpm exec vitest run core/commands/handlers/room-commands.test.ts`. Expected: FAIL (`setRoomCeilingHeight` not exported; `ceilingHeight` not a field).

- [ ] **Step 3: Minimal implementation**: add `ceilingHeight?: number` to `RoomOverride` in `types.ts`, then add the command mirroring the existing per-room override commands (which reassign `state.roomOverrides` whole and omit cleared fields under `exactOptionalPropertyTypes`):

```ts
export const SET_ROOM_CEILING_HEIGHT = 'room/set-ceiling-height'

export interface SetRoomCeilingHeightParams {
  roomKey: string
  height: number | undefined
}

export function setRoomCeilingHeight(
  roomKey: string,
  height: number | undefined,
): Command<SetRoomCeilingHeightParams> {
  return {
    type: SET_ROOM_CEILING_HEIGHT,
    params: { roomKey, height },
    description: 'Set room ceiling height',
  }
}

const setRoomCeilingHeightHandler: CommandHandler<Project, SetRoomCeilingHeightParams> = {
  apply(state, params) {
    // Reassign the whole roomOverrides map (and rebuild the one entry omitting a
    // cleared field) so the inverse-capture proxy records the top-level key and
    // exactOptionalPropertyTypes is satisfied. Reuse the existing per-room
    // override-update helper in this module rather than re-implementing it.
    state.roomOverrides = upsertRoomOverride(state.roomOverrides, params.roomKey, (override) => {
      const next = { ...override }
      if (params.height === undefined) {
        delete next.ceilingHeight
      } else {
        next.ceilingHeight = params.height
      }
      return next
    })
  },
}
```

(If this module has no shared `upsertRoomOverride` helper, the `implementer` follows the exact pattern the sibling commands use; the point is to match, not introduce a new pattern.)

Register it: `.register(SET_ROOM_CEILING_HEIGHT, setRoomCeilingHeightHandler)`.

- [ ] **Step 4: Run to verify GREEN**: Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task 7.3: export the room ceiling-height command (infrastructure)

**Files:** modify `core/index.ts`

- [ ] **Step 1: Add** `SetRoomCeilingHeightParams`, `SET_ROOM_CEILING_HEIGHT`, `setRoomCeilingHeight` to the `room-commands` re-export block.

- [ ] **Step 2: Verify**: `pnpm typecheck && pnpm exec vitest run core`. Expected: green.

- [ ] **Step 3: Reviewed by `/clean-code-review`; commit `build:`.**

---

## Non-goals (deferred behind the 3D render seam, ADR-0044 / ADR-0045)

These are explicitly **out of scope for this track** and must NOT be implemented here. They converge on the three-dimensional preview track once it matures past the slice-0 harness (ADR-0045):

- **Parametric 3D stair geometry.** Treads, risers, runs, landings, railings, balusters, and newels as Three.js meshes. The `scene3D.builder: 'parametric-stair'` string registered in Slice 5 is a forward reference only; no mesher ships. (Design spec §10 Phase 5 lists this; ADR-0044 "Stairs are split, not deferred wholesale" places the geometry late by convergence, not by ordering.)
- **Cutaway preview with adjustable transparency** on floors above the active one.
- **Floor-by-floor 3D view** (rendering one floor's shell at a time in the 3D pane).
- **PDF rasterization** (a document underlay's page-to-bitmap) and **glTF/glb decoding** (a scene underlay's mesh load). This track models the _references_ (`UnderlaySource` document/scene variants) only; decoding is `engine/loaders/` work behind the boundary (rules.md §Boundaries) and the 3D seam.
- **Auto-trace / vectorization** of underlay imagery. Trace mode (Slice 6) snaps only to the calibrated footprint corners, per design spec §10 Phase 5 ("basic; no auto-trace").
- **2D tread layout for L-turn, U-turn, winder, and spiral runs.** Slice 5 draws the footprint and direction for every run type and a full tread layout for the straight run; the curved/turning tread layouts are a later 2D refinement.

Each non-goal is named so the orchestrator and reviewers can reject any task that drifts into 3D geometry, decoding, or auto-trace.

---

## Self-review

**Spec coverage (design spec §10 Phase 5 deliverables):**

- "Multiple floors (add/remove/reorder/name, elevation entry, default ceiling height per floor)". `add`/`remove`/`setFloorCeilingHeight` already exist; Slice 1 adds `rename`, `setFloorElevation`, `reorder`; Slice 2 surfaces them in the `FloorSwitcher`. Covered.
- "Stair entities (straight run, L-turn, U-turn, winder, spiral)". Slice 3 `StairRunType` union + `createStair` + commands. Covered (as data/parameters).
- "Stair placement (connect two floors, position on each plan)". Slice 3 `StairConnection` + `moveStair`; Slice 5 projects onto the lower floor. Covered.
- "Vertical relationships (stair wells punch openings in floors above)". Slice 5 `stairWellPolygon` + `StairSceneNode.wellFloorId` model the void on the upper floor as data. Covered as topology/data; the actual 3D opening cut converges on the 3D track (non-goal).
- "Per-room ceiling height override". Slice 7. Covered.
- "Complete underlay layer (image, PDF, glTF/glb scene; all calibrated)". Slice 4 `UnderlaySource` raster/document/scene variants, all carrying calibrated `placement`. Reference model covered; decoding deferred (non-goal).
- "Trace mode (wall tool snaps to underlay features; basic; no auto-trace)". Slice 6. Covered.
- "Stair geometry (parametric)", "Floor-by-floor view in 2D and 3D", "Cutaway preview": explicitly listed as non-goals (3D-seam deferrals). Documented, not planned.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". Every code step shows concrete code or names the exact existing pattern to mirror (e.g. "mirror `setFloorCeilingHeight`'s `coalesceWith`", "mirror `createSelectionStore`"). Every run step gives the exact `pnpm exec vitest run <path>` command and the expected PASS/FAIL. The three tasks that may already be GREEN as regression guards (2.5) name the empty-`refactor:`-marker convention explicitly.

**Type consistency:** `Stair`/`StairRunType`/`StairConnection` are defined once in Slice 3 and reused verbatim by the `createStair` factory (Slice 3), `StairSceneNode`/`deriveStairNodes` (Slice 5), and `stairWellPolygon` (Slice 5). `StairSceneNode.floorId` is always the connection's `fromFloorId` and `wellFloorId` the `toFloorId` consistently. `UnderlaySource` (Slice 4) is the same discriminated union read by the scene node (4.2), the draw path (4.3), and `underlayTracePoints` (6.1). `SnapContext.tracePoints` and `SnapKind: 'trace'` (Slice 6) match between `snap.ts`, the test, and `use-snapping.ts`. The active-floor store/hook names (`ActiveFloorStore`, `getActiveFloorId`/`setActiveFloorId`, `useActiveFloorId`/`useSetActiveFloorId`) are consistent across Slice 2. Command type-string constants follow the existing namespacing (`project/...`, `room/...`).

**Ordering:** Within structure, Slice 3 (model) precedes Slice 5 (scene node + symbol) that depends on `Stair`/`createStair`. Slice 1 (commands) precedes Slice 2 (UI). Slice 4 (underlay source) precedes Slice 6 (trace points read the underlay node). The independent slices {1, 3, 4, 7} can run first in parallel. Barrel/infrastructure tasks follow the modules they export within each slice.
