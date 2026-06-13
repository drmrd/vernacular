# Three-Dimensional Selection and Highlight (6a) Implementation Plan

> **For agentic workers:** Executed from the main thread with the role-separated red-green-blue subagents (test-author, implementer, clean-code-reviewer, refactorer). Each cycle is test -> feat -> refactor; the main thread commits. Part 6a of the selection-and-accessibility slice; 6b (the DOM proxy layer) is a separate plan.

**Goal:** Make the three-dimensional pane selectable by pointer, sharing selection with the plan, and outline the selected entity with a color-blind-safe luminance highlight.

**Architecture:** A pure engine pick (`pickEntityId`) turns a ray into an entity id read from `userData.entityId`. A pure engine reconcile (`reconcileSelectionOutline`) maintains an edge-line overlay group for the selected entities, separate from the shared cached materials and rebuild-safe. Bridge glue translates canvas pointer events into a ray, writes the shared bridge selection store, and drives the outline reconcile. Selection sync with the plan is free because both views drive the one store. See ADR-0066.

**Tech Stack:** TypeScript, Three.js (engine only), React Three Fiber (bridge glue), Vitest (Node), Playwright (`scene-webgl`).

---

## Conventions

Same as the lighting slice: RED commits `test:` (test-author), GREEN commits `feat:` (implementer), BLUE commits `refactor:` (clean-code-reviewer then refactorer; empty marker if no findings). Subagents are told their exact allowed files and to STOP rather than touch shared config; the main thread owns barrels. Plain `git commit`, no em-dash, no Co-Authored-By, Conventional Commits. After each GREEN run the full `pnpm test`.

## File structure

Created: `engine/scene/pick-entity.ts` (+ test), `engine/scene/selection-outline.ts` (+ test), `bridge/react/scene-selection.tsx`, `e2e/tests/scene-selection.spec.ts`.
Modified: `engine/index.ts` (barrel), `bridge/react/webgpu-scene-view.tsx` (mount `<SceneSelection>` in `LiveSceneCanvas`).

---

## Task 0: Docs

- [ ] Commit spec + ADR-0066 + this plan: `git add docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md docs/knowledge/decisions/ADR-0066-three-dimensional-selection-and-accessibility.md docs/plans/2026-06-13-three-dimensional-selection-and-highlight.md && git commit -m "docs: spec, ADR-0066, and 6a plan for three-dimensional selection and accessibility"`
- [ ] Flip ROADMAP slice 7 row to in progress: `| 7. Selection sync and 3D accessibility ... | ADR-0066 | in progress |`, commit `docs: mark selection slice in progress in the roadmap`.
- [ ] `pnpm knowledge:index` (gitignored).

---

## Task 1 (Cycle 1): The pure pick (engine)

**Files:** create `engine/scene/pick-entity.ts`, `engine/scene/pick-entity.test.ts`; modify `engine/index.ts`.

- [ ] **RED** (`test-author`; allowed file `engine/scene/pick-entity.test.ts`). The module exports `pickEntityId(raycaster: THREE.Raycaster, root: THREE.Object3D): string | null` (nearest hit whose object or nearest ancestor carries `userData.entityId`, else null) and `pickEntityIdAt(raycaster, camera, root, ndc: { x: number; y: number }): string | null` (sets the raycaster from the camera and the NDC point, then delegates). Build a scene with `buildScene` (imported from `../scene/build-scene` or `../../engine`... use `./build-scene`) from a one-wall graph (wall `wall:w1` from (0,0) to (2000,0), thickness 120, height 2400). The wall box spans x[0,2000], y[0,2400], z[-60,60].

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { pickEntityId, pickEntityIdAt } from './pick-entity'
import type { SceneGraph } from '../../core'

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    },
  ],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
}

describe('pickEntityId', () => {
  it('returns the entity id of the wall a ray strikes', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(1000, 1200, 1000), new THREE.Vector3(0, 0, -1))
    expect(pickEntityId(raycaster, root)).toBe('wall:w1')
  })

  it('returns null when the ray strikes nothing', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(9000, 9000, 9000), new THREE.Vector3(0, 0, -1))
    expect(pickEntityId(raycaster, root)).toBeNull()
  })
})

describe('pickEntityIdAt', () => {
  it('picks the wall under the centre of a camera aimed at it', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
    camera.position.set(1000, 1200, 4000)
    camera.lookAt(1000, 1200, 0)
    camera.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    expect(pickEntityIdAt(raycaster, camera, root, { x: 0, y: 0 })).toBe('wall:w1')
  })
})
```

Run `pnpm exec vitest run engine/scene/pick-entity.test.ts`, confirm FAIL (module not found), commit `test: pick the entity id under a ray in the three-dimensional scene`.

- [ ] **GREEN** (`implementer`; allowed files `engine/scene/pick-entity.ts`, `engine/index.ts`):

```ts
import * as THREE from 'three'

function entityIdOf(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current !== null) {
    const id = current.userData.entityId
    if (typeof id === 'string') {
      return id
    }
    current = current.parent
  }
  return null
}

/** The entity id of the nearest object a ray strikes, read from userData.entityId on the
 *  hit or its nearest ancestor that carries one; null when the ray strikes nothing. */
export function pickEntityId(raycaster: THREE.Raycaster, root: THREE.Object3D): string | null {
  for (const hit of raycaster.intersectObject(root, true)) {
    const id = entityIdOf(hit.object)
    if (id !== null) {
      return id
    }
  }
  return null
}

/** Sets the raycaster from a camera and a normalized-device-coordinate point, then picks. */
export function pickEntityIdAt(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  root: THREE.Object3D,
  ndc: { x: number; y: number },
): string | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  return pickEntityId(raycaster, root)
}
```

Barrel: `export { pickEntityId, pickEntityIdAt } from './scene/pick-entity'`. Run the test (expect pass) + `pnpm typecheck`. Commit `feat: pick the nearest entity id under a ray`.

- [ ] **BLUE**: reviewer then refactor/marker.

---

## Task 2 (Cycle 2): The reconciled outline overlay (engine)

**Files:** create `engine/scene/selection-outline.ts`, `engine/scene/selection-outline.test.ts`; modify `engine/index.ts`.

- [ ] **RED** (`test-author`; allowed file `engine/scene/selection-outline.test.ts`). The module exports `createSelectionOutlineGroup(): THREE.Group` and `reconcileSelectionOutline(root: THREE.Object3D, selectedIds: ReadonlySet<string>, group: THREE.Group): void`. After reconcile, `group` holds one `THREE.LineSegments` per mesh whose `userData.entityId` (or an ancestor's) is in `selectedIds`, and none for an empty selection; reconciling replaces the previous contents.

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildScene } from './build-scene'
import { createSelectionOutlineGroup, reconcileSelectionOutline } from './selection-outline'
import type { SceneGraph } from '../../core'

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    },
  ],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
}

function lineCount(group: THREE.Group): number {
  return group.children.filter((c) => c instanceof THREE.LineSegments).length
}

describe('reconcileSelectionOutline', () => {
  it('adds outline line segments for a selected entity', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const group = createSelectionOutlineGroup()
    reconcileSelectionOutline(root, new Set(['wall:w1']), group)
    expect(lineCount(group)).toBeGreaterThan(0)
  })

  it('clears outlines when nothing is selected', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const group = createSelectionOutlineGroup()
    reconcileSelectionOutline(root, new Set(['wall:w1']), group)
    reconcileSelectionOutline(root, new Set(), group)
    expect(lineCount(group)).toBe(0)
  })
})
```

Run, confirm FAIL, commit `test: reconcile a selection outline overlay for selected entities`.

- [ ] **GREEN** (`implementer`; allowed files `engine/scene/selection-outline.ts`, `engine/index.ts`):

```ts
import * as THREE from 'three'

/** A high-luminance outline that reads by contrast, not hue (color-blind-safe), drawn
 *  over the scene so a selected entity is visible even when occluded. */
const OUTLINE_COLOR = 0xffffff

function entityIdOf(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current !== null) {
    const id = current.userData.entityId
    if (typeof id === 'string') {
      return id
    }
    current = current.parent
  }
  return null
}

/** The group that holds the selection outline, added once to the persistent scene. */
export function createSelectionOutlineGroup(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'selection-outline'
  return group
}

/** Rebuilds the outline overlay so it traces exactly the meshes whose entity id is
 *  selected. The base meshes and their shared materials are never touched, and the
 *  overlay is rebuilt from the current geometry, so it survives a scene rebuild. */
export function reconcileSelectionOutline(
  root: THREE.Object3D,
  selectedIds: ReadonlySet<string>,
  group: THREE.Group,
): void {
  for (const child of group.children) {
    if (child instanceof THREE.LineSegments) {
      child.geometry.dispose()
    }
  }
  group.clear()
  if (selectedIds.size === 0) {
    return
  }
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    const id = entityIdOf(object)
    if (id === null || !selectedIds.has(id)) {
      return
    }
    const edges = new THREE.EdgesGeometry(object.geometry)
    const material = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, depthTest: false })
    const line = new THREE.LineSegments(edges, material)
    line.renderOrder = 1
    line.applyMatrix4(object.matrixWorld)
    group.add(line)
  })
}
```

Barrel: `export { createSelectionOutlineGroup, reconcileSelectionOutline } from './scene/selection-outline'`. Run test + typecheck. Commit `feat: reconcile a luminance outline overlay for the selection`.

- [ ] **BLUE**: reviewer then refactor/marker. (Likely note: the `entityIdOf` helper now exists in both pick-entity.ts and selection-outline.ts; if the reviewer flags the duplication, extract it to a small `engine/scene/entity-id.ts` and import in both. Do that in the refactor.)

---

## Task 3 (Cycle 3): Bridge glue and the live pick (e2e-proven)

**Files:** create `bridge/react/scene-selection.tsx`, `e2e/tests/scene-selection.spec.ts`; modify `bridge/react/webgpu-scene-view.tsx`.

- [ ] **RED**: add `e2e/tests/scene-selection.spec.ts` (commit `test:`). It draws the shell, settles a frame, clicks the canvas centre, settles again, and requires the frame to change (the outline appeared), reusing `scene-helpers`:

```ts
import { test, expect } from '@playwright/test'
import { drawnSceneCanvas, stableFrame } from './scene-helpers'

test.describe('Live three-dimensional selection', () => {
  test('clicking an entity outlines it (the settled frame changes)', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('the 3D canvas has no bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
```

Commit `test: clicking a three-dimensional entity outlines it`.

- [ ] **GREEN**: create `bridge/react/scene-selection.tsx` (no `three` import; uses `useThree`, the engine pick/outline, and the shared selection store):

```tsx
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'

import { useSelection, useSelectionIds } from '../../bridge'
import {
  createSelectionOutlineGroup,
  pickEntityIdAt,
  reconcileSelectionOutline,
  type SceneRoot,
} from '../../engine'

// A pointer press picks the entity under the cursor and writes the shared selection; a
// modifier press toggles it (additive); a press on empty space clears. The selection
// outline is reconciled whenever the selection or the geometry changes. Coverage-excluded
// glue, proven by the scene-webgl tier; the pick and outline logic are unit-tested in engine.
export function SceneSelection({ root }: { root: SceneRoot }) {
  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)
  const domElement = useThree((state) => state.gl.domElement)
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const outlineGroup = useMemo(() => createSelectionOutlineGroup(), [])

  useLayoutEffect(() => {
    scene.add(outlineGroup)
    return () => {
      scene.remove(outlineGroup)
    }
  }, [scene, outlineGroup])

  useLayoutEffect(() => {
    reconcileSelectionOutline(root, selectedIds, outlineGroup)
  }, [root, selectedIds, outlineGroup])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const rect = domElement.getBoundingClientRect()
      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      }
      const id = pickEntityIdAt(raycaster, camera, root, ndc)
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      if (id === null) {
        if (!additive) selection.clear()
      } else if (additive) {
        selection.toggle(id)
      } else {
        selection.select(id)
      }
    }
    domElement.addEventListener('pointerdown', onPointerDown)
    return () => domElement.removeEventListener('pointerdown', onPointerDown)
  }, [domElement, camera, raycaster, root, selection])

  return null
}
```

Mount it in `LiveSceneCanvas` (after `<SceneLighting>`): `<SceneSelection root={root} />`. (`root` is already a prop of `LiveSceneCanvas`.)

Verify: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm build`, kill stale 4173, `pnpm exec playwright test --project=scene-webgl scene-selection`. If the centre click lands on empty space (no frame change), adjust the click toward where a wall segment projects (the framed shell fills the frame; a lower-centre point usually lands on geometry). Commit `feat: select and outline entities by pointer in the three-dimensional pane`.

- [ ] **BLUE**: reviewer then refactor/marker. Confirm the live 3D view is rendered within the app `SelectionProvider` (it is, since the editor shell wraps both panes); if `useSelection` throws in the e2e, that wiring is the fix, not a try/catch.

---

## Gate and rollout (6a)

- [ ] Full gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- [ ] `pnpm rgb:audit -- --range main..HEAD` clean.
- [ ] Rebuild, kill stale 4173, `pnpm exec playwright test --project=chromium` and `--project=scene-webgl` green.
- [ ] Push, PR (humanized body), wait CI, merge (real times). Then a roadmap-flip note is deferred to after 6b (the slice 7 row stays "in progress" until 6b merges, then flip to merged with both PR numbers).

## Self-review against the spec

- Pointer pick to shared selection (spec 2, 3): Cycles 1, 3. Covered.
- Selection sync with the plan (spec 2): free via the shared store; the e2e/2D reflect it. Covered.
- Color-blind-safe luminance outline, not a material change, rebuild-safe (spec 4): Cycle 2 (reconcile, separate overlay, depthTest-off white edges). Covered.
- Pure engine pick + reconcile, glue proven by e2e (spec 7): Cycles 1, 2 (Node), 3 (e2e). Covered.
- Proxy layer + announcements (spec 5): NOT here; that is 6b.
