# Three-dimensional incremental scene updates implementation plan

> **For agentic workers:** This plan is executed through the project's red-green-blue TDD cycle, dispatched from the main thread: `test-author` writes the failing test (RED), `implementer` writes the minimal pass (GREEN), `clean-code-reviewer` then `refactorer` close each cycle (BLUE). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the per-edit wholesale rebuild of the three-dimensional preview behind a stateful reconciler seam that reuses a floor's built scene when that floor has not changed.

**Architecture:** A new `createFramedSceneReconciler` in the bridge layer caches the `FramedScene` it builds per floor id, keyed on the floor node reference and the paint reference. On reconcile it returns the cached build when both are unchanged, otherwise it rebuilds that floor with `buildFramedScene` and caches it. The live preview holds one reconciler for its lifetime instead of calling `buildFramedScene` inside a per-edit memo. Pure bridge layer; no core, engine, model, or schema change. Behavior-preserving.

**Tech Stack:** TypeScript, React (the consumer is a coverage-excluded glue component), Vitest. The reconciler is plain TypeScript with no React or three import.

---

## Background the implementer needs

The preview view (`bridge/react/webgpu-scene-view.tsx`) subscribes to the live scene graph, scopes it to the active floor with `sceneGraphForFloor` (which returns a fresh object on every call), then builds the scene with:

```ts
const { root, pose, bounds, nearWallTargets } = useMemo(
  () => buildFramedScene(graph, paint),
  [graph, paint],
)
```

`buildFramedScene(graph, paint)` (`bridge/react/framed-scene.ts`) returns a `FramedScene` (`{ root, pose, bounds, nearWallTargets }`). The scoped graph carries exactly the active floor's nodes: its `nodes` array holds the one active floor node (shape `{ id: 'floor:<id>', kind: 'floor', name, elevation }`), or is empty when no floor is active. The persistent scene-graph deriver memoizes each floor node by the source `Floor` object, so the floor node keeps its reference until that floor is edited; that reference is the per-floor dirty signal.

`SceneGraph`, `SurfaceTreatment`, and `FramedScene` are the relevant types. `FramedScene` and `buildFramedScene` are exported from `./framed-scene`. `SceneGraph` and `SurfaceTreatment` are exported from `../../core`.

## File structure

- Create `bridge/react/framed-scene-reconciler.ts` — the stateful reconciler. One responsibility: cache and reuse `FramedScene` builds per floor.
- Create `bridge/react/framed-scene-reconciler.test.ts` — unit tests for the reuse and rebuild decisions. No three import; assert on `FramedScene` reference identity.
- Modify `bridge/react/webgpu-scene-view.tsx` — replace the per-edit `buildFramedScene` memo with one persistent reconciler instance. Glue, coverage-excluded, verified by typecheck and the existing end-to-end suite.

## Shared test fixture (used across the reconciler tests)

The test builds a `SceneGraph` for one floor with a single wall, controlling the floor node object so a test can pass the same reference (unchanged) or a fresh object (an edit). Put this at the top of `framed-scene-reconciler.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400

// A one-floor, one-wall graph wrapping the given floor node, mimicking the
// active-floor-scoped graph the preview feeds the reconciler. Passing the same
// floorNode object models an unchanged floor; a fresh object models an edit.
function floorGraph(floorNode: SceneNode): SceneGraph {
  const floorId = floorNode.id.slice('floor:'.length)
  return {
    nodes: [floorNode],
    walls: [
      {
        id: `wall:${floorId}1`,
        kind: 'wall',
        floorId,
        start: { x: 0, y: 0 },
        end: { x: WALL_LENGTH_MM, y: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
  }
}

const groundFloorNode = (): SceneNode => ({
  id: 'floor:g',
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

const emptyPaint = (): Record<string, SurfaceTreatment> => ({})
```

---

## Task 1: Reuse a floor's build when nothing changed

**Files:**

- Create: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside a `describe('createFramedSceneReconciler', ...)` block:

```ts
it('reuses the built scene when the floor node and paint are unchanged', () => {
  const reconciler = createFramedSceneReconciler()
  const node = groundFloorNode()
  const paint = emptyPaint()

  const first = reconciler.reconcile(floorGraph(node), paint)
  // A later render passes a fresh scoped-graph container with the same floor node.
  const second = reconciler.reconcile(floorGraph(node), paint)

  expect(second).toBe(first)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: FAIL (module `./framed-scene-reconciler` not found / `createFramedSceneReconciler` is not a function).

- [ ] **Step 3: Write the minimal implementation**

Create `bridge/react/framed-scene-reconciler.ts` with only what Task 1's test needs: a single cached build, reused when the active floor's id matches. Tasks 2 through 5 each add the next discrimination (node reference, paint reference, per-floor cache, empty-graph guard) when their test forces it.

```ts
import type { SceneGraph, SurfaceTreatment } from '../../core'
import { buildFramedScene, type FramedScene } from './framed-scene'

export interface FramedSceneReconciler {
  reconcile(graph: SceneGraph, paint?: Record<string, SurfaceTreatment>): FramedScene
}

export function createFramedSceneReconciler(): FramedSceneReconciler {
  let cached: { id: string; framed: FramedScene } | undefined
  return {
    reconcile(graph, paint = {}) {
      const floorNode = graph.nodes[0]
      if (cached !== undefined && cached.id === floorNode.id) {
        return cached.framed
      }
      const framed = buildFramedScene(graph, paint)
      cached = { id: floorNode.id, framed }
      return framed
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: PASS.

- [ ] **Step 5: Clean-code review then refactor (BLUE)**

Run `/clean-code-review` on the diff, then `/refactor`. If there are no actionable findings, land an empty marker commit.

- [ ] **Step 6: Commit**

```bash
git add bridge/react/framed-scene-reconciler.ts bridge/react/framed-scene-reconciler.test.ts
git commit -m "test: reconciler reuses an unchanged floor's built scene"
git commit -m "feat: add a framed-scene reconciler that reuses unchanged floors"
git commit --allow-empty -m "refactor: no reconciler reuse cleanup needed"
```

(The test, feat, and refactor are three separate commits in that order, matching the red-green-blue audit. Split the staged work accordingly.)

---

## Task 2: Rebuild when the floor node changes

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('rebuilds when the floor node reference changes', () => {
  const reconciler = createFramedSceneReconciler()
  const paint = emptyPaint()

  const first = reconciler.reconcile(floorGraph(groundFloorNode()), paint)
  // An edit replaces the floor with a new object carrying the same id.
  const second = reconciler.reconcile(floorGraph(groundFloorNode()), paint)

  expect(second).not.toBe(first)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: FAIL. Task 1 keys the cache on the floor id only, so a new node object with the same id returns the stale cached build, and `second` equals `first`.

- [ ] **Step 3: Implementation**

Key the cache on the floor node reference instead of its id, so a replaced floor object misses the cache. Store the node and compare it by reference:

```ts
let cached: { floorNode: SceneGraph['nodes'][number]; framed: FramedScene } | undefined
return {
  reconcile(graph, paint = {}) {
    const floorNode = graph.nodes[0]
    if (cached !== undefined && cached.floorNode === floorNode) {
      return cached.framed
    }
    const framed = buildFramedScene(graph, paint)
    cached = { floorNode, framed }
    return framed
  },
}
```

- [ ] **Step 4: Run the full reconciler test file**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: PASS (Task 1's reuse test still passes: same node reference reuses).

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`; empty marker if nothing actionable.

- [ ] **Step 6: Commit**

```bash
git add bridge/react/framed-scene-reconciler.test.ts
git commit -m "test: reconciler rebuilds when the floor node changes"
git add bridge/react/framed-scene-reconciler.ts
git commit -m "feat: key reconciler reuse on the floor node reference"
git commit --allow-empty -m "refactor: no rebuild-on-edit cleanup needed"
```

---

## Task 3: Rebuild when the paint changes

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('rebuilds when the paint reference changes', () => {
  const reconciler = createFramedSceneReconciler()
  const node = groundFloorNode()

  const first = reconciler.reconcile(floorGraph(node), emptyPaint())
  // Same unchanged floor node, but a new paint set: materials may differ, so rebuild.
  const second = reconciler.reconcile(floorGraph(node), emptyPaint())

  expect(second).not.toBe(first)
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: FAIL. After Task 2 the cache hit checks only the node reference, so an unchanged node with a new paint set returns the stale build, and `second` equals `first`.

- [ ] **Step 3: Implementation**

Add the paint reference to the cache entry and require it to match on a hit:

```ts
let cached:
  | {
      floorNode: SceneGraph['nodes'][number]
      paint: Record<string, SurfaceTreatment>
      framed: FramedScene
    }
  | undefined
return {
  reconcile(graph, paint = {}) {
    const floorNode = graph.nodes[0]
    if (cached !== undefined && cached.floorNode === floorNode && cached.paint === paint) {
      return cached.framed
    }
    const framed = buildFramedScene(graph, paint)
    cached = { floorNode, paint, framed }
    return framed
  },
}
```

- [ ] **Step 4: Run the test**

Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`; empty marker if nothing actionable.

- [ ] **Step 6: Commit**

```bash
git add bridge/react/framed-scene-reconciler.test.ts
git commit -m "test: reconciler rebuilds when the paint changes"
git add bridge/react/framed-scene-reconciler.ts
git commit -m "feat: rebuild reconciler when the paint reference changes"
git commit --allow-empty -m "refactor: no rebuild-on-paint cleanup needed"
```

---

## Task 4: Reuse a previously-built floor after switching away and back

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('reuses a floor built earlier after switching to another floor and back', () => {
  const reconciler = createFramedSceneReconciler()
  const paint = emptyPaint()
  const ground = groundFloorNode()
  const upper: SceneNode = { id: 'floor:u', kind: 'floor', name: 'Upper', elevation: 2700 }

  const groundFirst = reconciler.reconcile(floorGraph(ground), paint)
  const upperBuild = reconciler.reconcile(floorGraph(upper), paint)
  // Switch back to the unchanged ground floor (same node reference).
  const groundAgain = reconciler.reconcile(floorGraph(ground), paint)

  expect(upperBuild).not.toBe(groundFirst)
  expect(groundAgain).toBe(groundFirst)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: FAIL. The single-slot cache from Tasks 1 through 3 was overwritten by the upper-floor build, so switching back to ground rebuilds it and `groundAgain` does not equal `groundFirst`.

- [ ] **Step 3: Implementation**

Hold a build per floor id in a `Map` so an earlier floor's build survives building another floor:

```ts
const cache = new Map<
  string,
  {
    floorNode: SceneGraph['nodes'][number]
    paint: Record<string, SurfaceTreatment>
    framed: FramedScene
  }
>()
return {
  reconcile(graph, paint = {}) {
    const floorNode = graph.nodes[0]
    const cached = cache.get(floorNode.id)
    if (cached !== undefined && cached.floorNode === floorNode && cached.paint === paint) {
      return cached.framed
    }
    const framed = buildFramedScene(graph, paint)
    cache.set(floorNode.id, { floorNode, paint, framed })
    return framed
  },
}
```

- [ ] **Step 4: Run the test**

Expected: PASS (all earlier reuse and rebuild tests still pass).

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`; empty marker if nothing actionable.

- [ ] **Step 6: Commit**

```bash
git add bridge/react/framed-scene-reconciler.test.ts
git commit -m "test: reconciler reuses a floor after switching away and back"
git add bridge/react/framed-scene-reconciler.ts
git commit -m "feat: keep a reconciler build per floor id for switch-back reuse"
git commit --allow-empty -m "refactor: no switch-back cleanup needed"
```

---

## Task 5: Build without caching when no floor is active

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('builds an empty graph without caching and returns a finite pose', () => {
  const reconciler = createFramedSceneReconciler()
  const empty: SceneGraph = {
    nodes: [],
    walls: [],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
  }

  const framed = reconciler.reconcile(empty, emptyPaint())

  expect(framed.root).toBeDefined()
  expect(Number.isFinite(framed.pose.near)).toBe(true)
  expect(Number.isFinite(framed.pose.far)).toBe(true)
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
Expected: FAIL. With no floor node, `graph.nodes[0]` is `undefined` and reading `floorNode.id` throws.

- [ ] **Step 3: Implementation**

Guard the no-active-floor case: build and return without touching the cache.

```ts
reconcile(graph, paint = {}) {
  const floorNode = graph.nodes[0]
  if (floorNode === undefined) {
    return buildFramedScene(graph, paint)
  }
  const cached = cache.get(floorNode.id)
  if (cached !== undefined && cached.floorNode === floorNode && cached.paint === paint) {
    return cached.framed
  }
  const framed = buildFramedScene(graph, paint)
  cache.set(floorNode.id, { floorNode, paint, framed })
  return framed
},
```

- [ ] **Step 4: Run the test**

Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. Reasonable cleanups now that the reconciler is complete: extract the inline cache-entry object type into a named `CachedFloorScene` interface, and add the file's doc comment explaining the reuse keying and the single-active-floor contract:

```ts
interface CachedFloorScene {
  floorNode: SceneGraph['nodes'][number]
  paint: Record<string, SurfaceTreatment>
  framed: FramedScene
}

/**
 * Builds the framed scene incrementally by reusing the build of a floor whose
 * node reference and paint reference are both unchanged, rebuilding it
 * otherwise (foundation specification section 5.5). The scoped graph the preview
 * passes carries a single active floor node; the reconciler keeps prior floors'
 * builds so switching back to an unedited floor reuses its scene.
 */
```

- [ ] **Step 6: Commit**

```bash
git add bridge/react/framed-scene-reconciler.test.ts
git commit -m "test: reconciler builds an empty graph without caching"
git add bridge/react/framed-scene-reconciler.ts
git commit -m "feat: pass an inactive-floor graph straight through the build"
git add bridge/react/framed-scene-reconciler.ts
git commit -m "refactor: name the reconciler cache-entry type and document the seam"
```

---

## Task 6: Wire the reconciler into the live preview

**Files:**

- Modify: `bridge/react/webgpu-scene-view.tsx`

This component is coverage-excluded glue, so it has no unit test. The change is behavior-preserving and is verified by typecheck, lint, and the existing end-to-end suite (the rendered scene is unchanged). Commit it as a `refactor` because it swaps internals behind the same consumer contract without changing behavior.

- [ ] **Step 1: Add the import**

Near the existing `import { buildFramedScene } from './framed-scene'`, add:

```ts
import { createFramedSceneReconciler } from './framed-scene-reconciler'
```

If `buildFramedScene` is no longer referenced anywhere else in the file after Step 2, remove its now-unused import (the typecheck and lint will flag it).

- [ ] **Step 2: Replace the per-edit build with a persistent reconciler**

Find:

```ts
const { root, pose, bounds, nearWallTargets } = useMemo(
  () => buildFramedScene(graph, paint),
  [graph, paint],
)
```

Replace with:

```ts
// One reconciler for the life of the view; it reuses an unchanged floor's
// built scene instead of rebuilding on every edit (foundation spec 5.5).
const reconcilerRef = useRef(createFramedSceneReconciler())
const { root, pose, bounds, nearWallTargets } = useMemo(
  () => reconcilerRef.current.reconcile(graph, paint),
  [graph, paint],
)
```

`useRef` is already imported in this file (it imports `useRef` from `react`). Confirm it is in the import list; if not, add it.

- [ ] **Step 3: Typecheck, lint, and build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: clean (no errors; pre-existing warnings only).

- [ ] **Step 4: Run the full unit suite and end-to-end suite**

Run: `pnpm exec vitest run`
Then the end-to-end suite per the repo's e2e command (chromium plus scene-webgl).
Expected: all green; scene baselines unchanged (behavior-preserving).

- [ ] **Step 5: Commit**

```bash
git add bridge/react/webgpu-scene-view.tsx
git commit -m "refactor: build the preview through the framed-scene reconciler"
```

---

## Task 7: Architecture decision record

**Files:**

- Create: `docs/knowledge/decisions/ADR-0088-three-dimensional-incremental-scene-updates.md`

- [ ] **Step 1: Write ADR-0088**

Record the decision: option B (reuse-by-floor + cache + diff on the floor node reference) over per-mesh reconciliation (option C) and an explicit dirty channel (option A); the floor as the rebuild unit because junctions are within-floor; the seam shape (`createFramedSceneReconciler` in the bridge layer wrapping `buildFramedScene`); and the deferred finer tier (within-floor mesh reuse, per-floor paint differencing, cache eviction, multi-floor display). Pass it through the humanizer skill before committing (human-read prose, rule 17).

- [ ] **Step 2: Commit**

```bash
git add docs/knowledge/decisions/ADR-0088-three-dimensional-incremental-scene-updates.md
git commit -m "docs: ADR-0088 three-dimensional incremental scene updates"
```

---

## Final gate (run before declaring the slice done)

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] `pnpm exec vitest run` green (reconciler tests included)
- [ ] Integration audit green: the repo's `integration:audit` script.
- [ ] `rgb:audit` clean over `origin/main..HEAD` (every cycle test, then feat, then refactor).
- [ ] End-to-end suite (chromium plus scene-webgl) green; scene baselines unchanged (the slice is behavior-preserving, so no baseline regeneration).
- [ ] Fast-forward `integration/three-dimensional-preview` to the slice tip, then remove the worktree.
