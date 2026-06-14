# Three-dimensional preview surface edges implementation plan

> **For agentic workers:** drive this with the project red-green-blue cycle from the
> main thread (test-author RED, implementer GREEN, clean-code-reviewer + refactorer
> BLUE). Each cycle is test -> feat -> refactor. Subagents do not commit; the
> orchestrator commits on `feat/three-dimensional-preview-edges`.

**Goal:** Draw a thin dark hidden-line edge along every structural mesh in the 3D
preview so a wall reads against the floor, against adjacent walls, and at corners.

**Architecture:** A pure engine pass walks the built scene and adds a
`THREE.LineSegments` edge child (from `THREE.EdgesGeometry`) to each mesh, sharing
one dark depth-tested material. The single edge-line step is shared with the
selection outline. Runs at the end of `buildScene`. Render-only; no model, schema,
scene-graph, geometry, or 2D change. See the spec and ADR-0078.

**Tech stack:** TypeScript, three.js (engine only), Vitest (Node), Playwright
(scene-webgl visual tier).

## File structure

- Create `engine/scene/edge-lines.ts`: `edgeLines(geometry, material)` shared helper.
- Create `engine/scene/edge-lines.test.ts`.
- Create `engine/scene/edge-overlay.ts`: `EDGE_COLOR`, `addEdgeOverlay(root)`.
- Create `engine/scene/edge-overlay.test.ts`.
- Modify `engine/scene/build-scene.ts`: call `addEdgeOverlay` at the end of `buildScene`.
- Modify `engine/scene/build-scene.test.ts`.
- Modify `engine/scene/selection-outline.ts`: use `edgeLines` for its inline line build.
- Modify the scene-webgl harness baselines (refresh in the visual cycle).

---

### Task 1: shared `edgeLines` helper

**Files:** Create `engine/scene/edge-lines.ts`, `engine/scene/edge-lines.test.ts`.

- [ ] **Step 1: failing test** (Node, no GPU; EdgesGeometry is CPU geometry):

```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { edgeLines } from './edge-lines'

describe('edgeLines', () => {
  it('builds a LineSegments tracing the geometry edges with the given material', () => {
    const box = new THREE.BoxGeometry(100, 200, 50)
    const material = new THREE.LineBasicMaterial()
    const line = edgeLines(box, material)
    expect(line).toBeInstanceOf(THREE.LineSegments)
    expect(line.material).toBe(material)
    expect(line.geometry).toBeInstanceOf(THREE.EdgesGeometry)
    // A box has 12 edges -> 24 line vertices.
    expect(line.geometry.getAttribute('position').count).toBe(24)
  })
})
```

- [ ] **Step 2:** run `pnpm exec vitest run engine/scene/edge-lines.test.ts`, expect FAIL.
- [ ] **Step 3: implement**:

```ts
import * as THREE from 'three'

/** A LineSegments tracing `geometry`'s edges (outline and sharp creases), drawn
 *  with `material`. Shared by the always-on edge overlay and the selection outline. */
export function edgeLines(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material)
}
```

- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5 (BLUE):** refactor `selection-outline.ts` to use `edgeLines`: replace
      `new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry), material)` with
      `edgeLines(object.geometry, material)` (keep the `applyMatrix4`, `renderOrder`, and
      the `depthTest: false` material). Run `pnpm exec vitest run engine/scene/selection-outline.test.ts`
      to confirm still green.
- [ ] **Step 6: commit** RED (`test:`), GREEN (`feat:`), BLUE (`refactor:`).

---

### Task 2: `addEdgeOverlay` pass

**Files:** Create `engine/scene/edge-overlay.ts`, `engine/scene/edge-overlay.test.ts`.

- [ ] **Step 1: failing test**:

```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { addEdgeOverlay } from './edge-overlay'

const edgeChildren = (mesh: THREE.Object3D): THREE.LineSegments[] =>
  mesh.children.filter((c): c is THREE.LineSegments => c instanceof THREE.LineSegments)

describe('addEdgeOverlay', () => {
  it('gives every mesh exactly one edge-line child and leaves non-meshes alone', () => {
    const root = new THREE.Group()
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50))
    const plainGroup = new THREE.Group()
    root.add(meshA, plainGroup)
    meshA.add(meshB) // nested mesh is covered too

    addEdgeOverlay(root)

    expect(edgeChildren(meshA)).toHaveLength(1)
    expect(edgeChildren(meshB)).toHaveLength(1)
    expect(plainGroup.children).toHaveLength(0)
    expect(edgeChildren(meshA)[0]?.geometry).toBeInstanceOf(THREE.EdgesGeometry)
  })
})
```

- [ ] **Step 2:** run, expect FAIL. **Step 3: implement**:

```ts
import * as THREE from 'three'
import { edgeLines } from './edge-lines'

/** The dark hidden-line color the surface edges draw in. */
export const EDGE_COLOR = 0x2b2b2b

/** Adds a dark depth-tested edge line along every mesh in the built scene, so the
 *  surfaces read against each other whatever the lighting and paint. The lines are
 *  mesh children (so they inherit the mesh transform) carrying no entity id, so the
 *  hit-test, proxies, and selection traversal ignore them. */
export function addEdgeOverlay(root: THREE.Object3D): void {
  const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR })
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  for (const mesh of meshes) {
    mesh.add(edgeLines(mesh.geometry, material))
  }
}
```

Collect first, then add, so the traversal is not mutated mid-walk. One shared
material instance for all edges. `depthTest` defaults to true (hidden-line).

- [ ] **Step 4:** run, expect PASS. **Step 5:** commit RED/GREEN/BLUE.

---

### Task 3: wire the overlay into `buildScene`

**Files:** Modify `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`.

- [ ] **Step 1: failing test** in `build-scene.test.ts`: build a scene from a graph
      with a wall (and a room if the fixture has one); after `buildScene`, assert each
      mesh carrying a `userData.entityId` has a `LineSegments` child, and the entity ids
      are still present (selection/picking unaffected). Use the existing build-scene
      fixtures; assert via a traverse that finds at least one entity mesh and that it has
      an edge child.

- [ ] **Step 2:** run, expect FAIL. **Step 3: implement**: in `buildScene`, after the
      floor-group loop and before `return root`, call `addEdgeOverlay(root)`.

```ts
for (const node of graph.nodes) {
  root.add(buildFloorGroup(node, graph, materials))
}
addEdgeOverlay(root)
return root
```

- [ ] **Step 4:** run, expect PASS; full `engine/scene` suite green (selection,
      picking, entity-screen-positions still pass — edges have no entity id and are
      lines). **Step 5:** commit RED/GREEN/BLUE.

---

### Task 4: visual tier baseline refresh (`test(e2e):`)

**Files:** the scene-webgl harness baselines.

- [ ] Rebuild, kill stale 4173, run the `scene-webgl` project; the shell now shows
      dark edges on the walls, floor, ceiling, and doorway. Force-refresh the three
      committed baselines (`--update-snapshots=all`) and confirm by eye the edges read
      and the surfaces are legible. Commit as `test(e2e):` (audit-exempt).

## Gate before PR

`pnpm typecheck && lint && format:check && test && integration:audit && build`, then
`pnpm rgb:audit` clean over origin/main..HEAD, then chromium + scene-webgl e2e after a
rebuild with 4173 killed. Re-fetch origin/main and rebase before the final gate. Then
docs commit (spec + ADR-0078 + plan), PR, wait CI, merge --merge, re-detach, roadmap
flip PR.

## Self-review notes

- Spec coverage: shared helper (T1) + selection-outline share (T1 BLUE); the pass
  (T2); the build wiring with entity ids intact (T3); the baseline (T4). All map.
- Type consistency: `edgeLines(geometry, material) -> THREE.LineSegments`,
  `addEdgeOverlay(root) -> void`, `EDGE_COLOR` used uniformly.
- Watch: do not raycast lines (default off); keep the selection traversal's
  `instanceof THREE.Mesh` guard so it never outlines an edge line.
