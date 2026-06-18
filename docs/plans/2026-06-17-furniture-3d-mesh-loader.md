# Furniture 3D mesh loader implementation plan

> **For agentic workers:** this plan is executed with the project's red-green-blue TDD cycle,
> driven from the main thread with the role-separated subagents (`test-author`, `implementer`,
> `clean-code-reviewer`, `refactorer`), per CLAUDE.md and `.claude/rules.md`. Each task below is
> one RGB cycle: a RED failing test, a GREEN minimal implementation, then a BLUE review and
> refactor (an empty marker commit if the review finds nothing). The code shown is the target an
> `implementer` reproduces minimally; the test code shown is the behavior a `test-author` writes.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Load a furniture instance's real GLB model, fit it into the instance footprint and
height, and swap it in for the massing box in the 3D preview, falling back to the box on any load
failure.

**Architecture:** Approach A from the spec. A bridge-layer content-hash model cache holds the
async loading and the parsed models. The synchronous scene-graph to build to reconcile pipeline
stays synchronous and reads the cache through a new model-lookup argument: a ready model builds a
mesh sub-group, any other state builds the box. A settled load bumps a version that re-runs the
memoized reconcile, which rebuilds only the now-ready piece as a mesh.

**Tech Stack:** TypeScript, Three.js 0.184 (`GLTFLoader` from `three/examples/jsm/loaders`,
already bundled), React 19, React Three Fiber 9, Vitest, Playwright.

**Spec:** `docs/specs/2026-06-17-furniture-3d-mesh-loader.md`. **Decision record:** ADR-0095
(written in the final task).

---

## File structure

New files:

- `engine/scene/furniture-model.ts` (engine, Three.js): `parseFurnitureModel`,
  `normalizeModelIntoBox`, `buildFurnitureModelGroup`, `disposeObject`.
- `engine/scene/furniture-model.test.ts`.
- `bridge/react/furniture-model-cache.ts` (bridge): the content-hash cache and async loader.
- `bridge/react/furniture-model-cache.test.ts`.
- `e2e/fixtures/cube.glb`: a committed, untextured single-mesh GLB unit fixture.
- `e2e/tests/journeys/furniture-model-swap.spec.ts`: the live-preview swap end-to-end test.
- `docs/knowledge/decisions/ADR-0095-furniture-3d-mesh-loader.md`.

Modified files:

- `core/scene/scene-graph.ts`: `FurnitureSceneNode` gains `assetRef`; `deriveFurnitureNode`
  copies it.
- `engine/index.ts`: re-export the new engine functions and `disposeObject`.
- `bridge/react/framed-scene-reconciler.ts`: `reconcile` and the furniture build path take a
  synchronous model lookup; the furniture reuse key gains the box-or-mesh dimension.
- `bridge/react/webgpu-scene-view.tsx`: instantiate the cache, request loads for the active
  floor, drive a re-render on a settled load, and write the flag-gated swap signal.
- `bridge/index.ts`: re-export the cache factory and its types if the glue needs them across the
  barrel.

Helpers reused as-is (read them before implementing the engine and reconciler tasks):
`furnitureFootprintCorners` (`core/model/furniture-footprint.ts`), `buildFurnitureMassing` and
`FURNITURE_NODE_PREFIX` and `FURNITURE_ROLE` (`engine/scene/furniture-builder.ts`),
`buildFurnitureSubgroup` and `markShadowCasters` (`engine/scene/floor-subgroups.ts`,
`engine/scene/shadow-casters.ts`), the reconciler's `reuseOrBuildFurniture`, `CachedFloorBuild`,
`SubgroupBuild`, and `reconcile` (`bridge/react/framed-scene-reconciler.ts`), `AssetReference`
(`core/model/asset-reference.ts`), and `AssetRegistry.resolve` (`storage/assets/asset-registry.ts`).

---

## Phase 1: carry the asset reference into the scene node (core)

### Task 1: FurnitureSceneNode carries assetRef

**Files:**

- Modify: `core/scene/scene-graph.ts` (the `FurnitureSceneNode` interface near line 140, and
  `deriveFurnitureNode`)
- Test: `core/scene/scene-graph-deriver.test.ts` (or the existing furniture deriver test file;
  place the test beside the other `deriveFurnitureNode` cases)

- [ ] **Step 1 (RED): write the failing test.** A floor with one furniture instance derives a
      furniture node whose `assetRef` is the instance's `assetRef`.

```ts
it('carries the furniture instance assetRef onto the derived node', () => {
  const assetRef = { scope: 'pack:starter@1.0.0', contentHash: 'abc123' } as const
  const floor = createFloor('G', {
    id: 'g',
    furniture: [createFurnitureInstance({ assetRef, position: { x: 0, y: 0 } })],
  })
  const graph = deriveSceneGraph({ ...projectWith([floor]) })
  expect(graph.furniture[0]?.assetRef).toEqual(assetRef)
})
```

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts`
      Expected: FAIL, `assetRef` is `undefined` on the node (the property does not exist yet).

- [ ] **Step 3 (GREEN): add the field and copy it.** In `core/scene/scene-graph.ts`, add to
      `FurnitureSceneNode`:

```ts
/** Content-addressed reference to this piece's asset, for the model loader. */
assetRef: AssetReference
```

Import `AssetReference` from the core model barrel if it is not already in scope, and in
`deriveFurnitureNode` copy it from the source instance:

```ts
    assetRef: item.assetRef,
```

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS, and the rest of
      the deriver suite stays green.

- [ ] **Step 5 (BLUE): review and refactor.** Dispatch `clean-code-reviewer` on the diff; apply
      `refactorer` findings or land an empty `refactor:` marker. Confirm `pnpm typecheck` is clean
      (the node is used by the reconciler and builders, so the new required field must not break
      existing node construction in tests; grep for `FurnitureSceneNode` literals and fix any).

- [ ] **Step 6: commit.**

```bash
git add core/scene/scene-graph.ts core/scene/scene-graph-deriver.test.ts
git commit -m "feat: carry the furniture asset reference onto the scene node"
```

---

## Phase 2: parse, fit, build, and dispose a model (engine)

The engine is the only layer that imports Three.js, so all of this lives in
`engine/scene/furniture-model.ts`. Build it one exported function at a time.

### Task 2: the committed untextured cube GLB fixture (setup, no test)

**Files:**

- Create: `e2e/fixtures/cube.glb`

- [ ] **Step 1: generate a strictly geometry-and-material GLB.** It must have no image or texture
      so it parses under jsdom with no `ImageBitmap`. Generate it once with a Node script and commit
      the bytes. Run this from the repo root:

```bash
node --input-type=module -e '
import { Blob } from "node:buffer";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1000, 2000, 1000),
  new THREE.MeshStandardMaterial({ color: 0x808080 })
);
mesh.position.set(100, 1000, 100); // offset from origin on purpose, exercises the Box3 center fit
const scene = new THREE.Scene();
scene.add(mesh);
new GLTFExporter().parse(scene, (gltf) => {
  writeFileSync("e2e/fixtures/cube.glb", Buffer.from(gltf));
}, (err) => { throw err; }, { binary: true });
'
```

If `GLTFExporter` cannot run headless in this Node, generate the fixture in a browser console
with the same code and save the download to `e2e/fixtures/cube.glb`. The box is 1000 x 2000 x
1000 mm and offset from its local origin, so the normalization tests can assert both the fit and
the center handling.

- [ ] **Step 2: confirm the bytes load.** Run a throwaway check that `parseFurnitureModel` (after
      Task 4) resolves; for now just confirm the file exists and is non-empty:
      `test -s e2e/fixtures/cube.glb && echo ok`.

- [ ] **Step 3: commit.**

```bash
git add e2e/fixtures/cube.glb
git commit -m "test: add an untextured cube GLB fixture for the model loader"
```

### Task 3: normalizeModelIntoBox fits a model into the instance box

**Files:**

- Create: `engine/scene/furniture-model.ts`
- Test: `engine/scene/furniture-model.test.ts`

- [ ] **Step 1 (RED): write the failing test.** A synthetic model with a known geometry, nested
      under a transformed parent so the world matrix matters, fits inside the target box, touches the
      limiting axis, centers on the footprint, and sits on the elevation.

```ts
import * as THREE from 'three'
import { furnitureFootprintCorners } from '../../core'
import { normalizeModelIntoBox } from './furniture-model'

function nodeFor(width: number, depth: number, height: number, elevationZ = 0) {
  return {
    id: 'furniture:x',
    kind: 'furniture' as const,
    floorId: 'g',
    footprintCorners: furnitureFootprintCorners({ x: 0, y: 0 }, 0, { width, depth }),
    elevationZ,
    height,
    assetRef: { scope: 'user' as const, contentHash: 'h' },
  }
}

it('uniformly fits a model inside the footprint and height, centered and on the floor', () => {
  // A 1000 x 1000 x 1000 mm box, nested under a parent with a non-identity transform.
  const inner = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000))
  const parent = new THREE.Group()
  parent.position.set(50, 50, 50)
  parent.add(inner)
  const node = nodeFor(2000, 2000, 4000, 0) // target taller and wider than the model

  const placed = normalizeModelIntoBox(parent, node)!
  const box = new THREE.Box3().setFromObject(placed)
  const size = box.getSize(new THREE.Vector3())
  // Uniform fit-inside against the limiting axis (width and depth both 2000, model 1000 -> x2).
  expect(size.x).toBeCloseTo(2000, 0)
  expect(size.z).toBeCloseTo(2000, 0)
  expect(size.y).toBeCloseTo(2000, 0) // scaled by the same factor, not stretched to 4000
  const center = box.getCenter(new THREE.Vector3())
  expect(center.x).toBeCloseTo(0, 0)
  expect(center.z).toBeCloseTo(0, 0)
  expect(box.min.y).toBeCloseTo(0, 0) // bottom-anchored to elevationZ
})
```

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run engine/scene/furniture-model.test.ts`
      Expected: FAIL, `normalizeModelIntoBox` is not exported.

- [ ] **Step 3 (GREEN): implement `normalizeModelIntoBox`.** In `engine/scene/furniture-model.ts`:

```ts
import * as THREE from 'three'
import type { FurnitureSceneNode, Point } from '../../core'

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Fits a parsed model into a furniture node's footprint and height. Scales uniformly to fit
 * inside the box, centers on the footprint center in plan, anchors the model's bottom to the
 * elevation, and rotates to the footprint orientation. Returns null when the model has no usable
 * geometry, so the caller can fall back to the box.
 */
export function normalizeModelIntoBox(
  model: THREE.Object3D,
  node: FurnitureSceneNode,
): THREE.Group | null {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  if (size.x === 0 || size.y === 0 || size.z === 0) return null

  const [tl, tr, , bl] = node.footprintCorners
  const targetWidth = edgeLength(tl, tr)
  const targetDepth = edgeLength(tl, bl)
  const targetHeight = node.height
  const scale = Math.min(targetWidth / size.x, targetHeight / size.y, targetDepth / size.z)

  const center = box.getCenter(new THREE.Vector3())
  const footprintCenter = {
    x: (tl.x + node.footprintCorners[2].x) / 2,
    y: (tl.y + node.footprintCorners[2].y) / 2,
  }
  const rotationRadians = Math.atan2(tr.y - tl.y, tr.x - tl.x)

  // Inner wrapper recenters the model's bounding box to the origin and lifts its base to y=0.
  const inner = new THREE.Group()
  inner.position.set(-center.x, -box.min.y, -center.z)
  inner.add(model)

  // Outer wrapper scales uniformly, rotates about the vertical axis, and places it in plan.
  // Plan x maps to world x, plan y maps to world z; world y is up at the elevation.
  const outer = new THREE.Group()
  outer.add(inner)
  outer.scale.setScalar(scale)
  outer.rotation.y = -rotationRadians
  outer.position.set(footprintCenter.x, node.elevationZ, footprintCenter.y)
  return outer
}
```

Confirm the plan-to-world axis mapping (plan `y` to world `z`, and the sign of the rotation)
against `buildFurnitureMassing` in `engine/scene/furniture-builder.ts` so the model lands with
the same orientation as the box it replaces; adjust the rotation sign if the box uses the
opposite convention.

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS.

- [ ] **Step 5 (BLUE): review and refactor.** `clean-code-reviewer`, then `refactorer` or an empty
      marker.

- [ ] **Step 6: commit.**

```bash
git add engine/scene/furniture-model.ts engine/scene/furniture-model.test.ts
git commit -m "feat: fit a loaded model into a furniture instance box"
```

### Task 4: normalizeModelIntoBox returns null for empty geometry; parseFurnitureModel parses bytes

**Files:**

- Modify: `engine/scene/furniture-model.ts`
- Test: `engine/scene/furniture-model.test.ts`

- [ ] **Step 1 (RED): write two failing tests.**

```ts
it('returns null when the model has no geometry', () => {
  const empty = new THREE.Group()
  expect(normalizeModelIntoBox(empty, nodeFor(1000, 1000, 1000))).toBeNull()
})

it('parses a GLB into an object and rejects a garbage buffer', async () => {
  const bytes = new Uint8Array(readFileSync('e2e/fixtures/cube.glb'))
  const model = await parseFurnitureModel(bytes)
  expect(model).toBeInstanceOf(THREE.Object3D)
  await expect(parseFurnitureModel(new Uint8Array([1, 2, 3, 4]))).rejects.toBeTruthy()
})
```

(Import `readFileSync` from `node:fs` and `parseFurnitureModel` from `./furniture-model`.)

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run engine/scene/furniture-model.test.ts`
      Expected: FAIL, `parseFurnitureModel` is not exported (the empty-geometry case may already pass
      from Task 3's guard; that is fine, the parse case drives this task).

- [ ] **Step 3 (GREEN): implement `parseFurnitureModel`.** Add to `engine/scene/furniture-model.ts`:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/** Parses GLB bytes into a Three.js object, rejecting on any loader error. */
export function parseFurnitureModel(bytes: Uint8Array): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
  })
}
```

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS. If the garbage
      buffer logs but does not reject in this Three version, assert on `parseFurnitureModel(...)`
      settling to a rejection by wrapping with a timeout guard, and confirm the loader's `onError` is
      wired.

- [ ] **Step 5 (BLUE): review and refactor.** As before.

- [ ] **Step 6: commit.**

```bash
git add engine/scene/furniture-model.ts engine/scene/furniture-model.test.ts
git commit -m "feat: parse furniture GLB bytes into a model"
```

### Task 5: buildFurnitureModelGroup wraps a model as a selectable sub-group

**Files:**

- Modify: `engine/scene/furniture-model.ts`, `engine/index.ts`
- Test: `engine/scene/furniture-model.test.ts`

- [ ] **Step 1 (RED): write the failing test.** The group carries the box's name and entity id,
      contains the normalized model, sets shadow flags, and has no edge-overlay line segments.

```ts
it('builds a selectable furniture model group that mirrors the box ids', () => {
  const model = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500))
  const node = nodeFor(1000, 1000, 1000)
  const group = buildFurnitureModelGroup(model, node, new NeutralMaterialProvider())
  expect(group.name).toBe(node.id)
  expect(group.userData.entityId).toBe('x') // raw id, prefix stripped
  expect(group.getObjectByProperty('isMesh', true)).toBeTruthy()
  let lineSegments = 0
  group.traverse((o) => {
    if ((o as THREE.LineSegments).isLineSegments) lineSegments += 1
  })
  expect(lineSegments).toBe(0) // no box edge overlay on the real mesh
})
```

(Import `NeutralMaterialProvider` from the engine materials module used by the other builder
tests.)

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run engine/scene/furniture-model.test.ts`
      Expected: FAIL, `buildFurnitureModelGroup` is not exported.

- [ ] **Step 3 (GREEN): implement it.** Mirror `buildFurnitureSubgroup`
      (`engine/scene/floor-subgroups.ts:50`) but with the normalized model and without
      `addEdgeOverlay`. Add to `engine/scene/furniture-model.ts`:

```ts
import { markShadowCasters } from './shadow-casters'
import { FURNITURE_NODE_PREFIX } from './furniture-builder'
import type { MaterialProvider } from '../materials/material-provider'

/** Wraps a normalized model as a furniture sub-group that selects like the box it replaces. */
export function buildFurnitureModelGroup(
  model: THREE.Object3D,
  node: FurnitureSceneNode,
  _materials: MaterialProvider,
): THREE.Group {
  const placed = normalizeModelIntoBox(model, node)
  const group = new THREE.Group()
  if (placed !== null) group.add(placed)
  group.name = node.id
  group.userData.entityId = node.id.slice(FURNITURE_NODE_PREFIX.length)
  markShadowCasters(group)
  return group
}
```

The `materials` argument is kept for signature parity with `buildFurnitureSubgroup`; the model
carries its own materials from the GLB. If the lint forbids the unused parameter, drop it and
have the reconciler call the function without it.

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS.

- [ ] **Step 5: re-export from the engine barrel.** Add `parseFurnitureModel`,
      `normalizeModelIntoBox`, `buildFurnitureModelGroup` to `engine/index.ts` so the bridge can reach
      them without a deep import. Run `pnpm typecheck`.

- [ ] **Step 6 (BLUE): review and refactor.** As before.

- [ ] **Step 7: commit.**

```bash
git add engine/scene/furniture-model.ts engine/index.ts engine/scene/furniture-model.test.ts
git commit -m "feat: build a furniture model sub-group that selects like the box"
```

### Task 6: disposeObject frees a model's GPU resources

**Files:**

- Modify: `engine/scene/furniture-model.ts`, `engine/index.ts`
- Test: `engine/scene/furniture-model.test.ts`

- [ ] **Step 1 (RED): write the failing test.** Disposing a model disposes every geometry and
      material in its tree.

```ts
it('disposes geometries and materials across the tree', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial()
  const geomSpy = vi.spyOn(geometry, 'dispose')
  const matSpy = vi.spyOn(material, 'dispose')
  const root = new THREE.Group()
  root.add(new THREE.Mesh(geometry, material))
  disposeObject(root)
  expect(geomSpy).toHaveBeenCalled()
  expect(matSpy).toHaveBeenCalled()
})
```

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run engine/scene/furniture-model.test.ts`
      Expected: FAIL, `disposeObject` is not exported.

- [ ] **Step 3 (GREEN): implement it.** Add:

```ts
/** Frees the geometries, materials, and textures of an object tree. */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    const materials = Array.isArray(material) ? material : material ? [material] : []
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      entry.dispose()
    }
  })
}
```

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS.

- [ ] **Step 5: re-export `disposeObject` from `engine/index.ts`.** Run `pnpm typecheck`.

- [ ] **Step 6 (BLUE): review and refactor.** As before.

- [ ] **Step 7: commit.**

```bash
git add engine/scene/furniture-model.ts engine/index.ts engine/scene/furniture-model.test.ts
git commit -m "feat: dispose a furniture model's gpu resources"
```

---

## Phase 3: the content-hash model cache (bridge)

`bridge/react/furniture-model-cache.ts` holds the async loading and the parsed templates. It is a
plain factory (driven by React but unit-tested without rendering). It takes its dependencies by
injection so the tests can supply a fake registry, parse, dispose, and a manual scheduler.

The full target shape (an `implementer` reproduces only what each task's test drives):

```ts
import type { AssetReference } from '../../core'
import type { Object3D } from 'three' // type-only; bridge holds engine objects, never imports three at runtime

export type ModelStatus = 'loading' | 'ready' | 'failed'
export interface ModelEntry {
  status: ModelStatus
  template?: Object3D
}

export interface ModelCacheDeps {
  resolve: (ref: AssetReference) => Promise<Uint8Array | undefined>
  parse: (bytes: Uint8Array) => Promise<Object3D>
  dispose: (object: Object3D) => void
  maxConcurrent?: number
  maxTemplates?: number
}

export interface FurnitureModelCache {
  request(ref: AssetReference): void
  get(contentHash: string): ModelEntry | undefined
  markLiveHashes(hashes: Iterable<string>): void // for reference-aware eviction
  onChange(listener: () => void): () => void
  dispose(): void
}

export function createFurnitureModelCache(deps: ModelCacheDeps): FurnitureModelCache {
  /* ... */
}
```

### Task 7: a request loads, settles to ready, and notifies

**Files:**

- Create: `bridge/react/furniture-model-cache.ts`, `bridge/react/furniture-model-cache.test.ts`

- [ ] **Step 1 (RED): write the failing test.** A request starts loading, ends ready with a stored
      template, and fires `onChange`.

```ts
it('loads a model to ready and notifies', async () => {
  const template = new THREE.Group()
  const cache = createFurnitureModelCache({
    resolve: async () => new Uint8Array([1]),
    parse: async () => template,
    dispose: () => {},
  })
  const ref = { scope: 'user', contentHash: 'h1' } as const
  let changes = 0
  cache.onChange(() => {
    changes += 1
  })
  cache.request(ref)
  expect(cache.get('h1')?.status).toBe('loading')
  await flushMicrotasks()
  expect(cache.get('h1')).toEqual({ status: 'ready', template })
  expect(changes).toBe(1)
})
```

(`flushMicrotasks` = `await new Promise((r) => setTimeout(r, 0))`.)

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run bridge/react/furniture-model-cache.test.ts`
      Expected: FAIL, `createFurnitureModelCache` is not exported.

- [ ] **Step 3 (GREEN): implement the minimal load path.** A `Map<string, ModelEntry>`, a listener
      set, and a `request` that sets `loading`, resolves, parses, stores `ready`, and notifies. Defer
      dedup, failure, concurrency, eviction, and cancellation to their own tasks.

- [ ] **Step 4: run it, confirm it passes.** Run the same command. Expected: PASS.

- [ ] **Step 5 (BLUE): review and refactor.** As before.

- [ ] **Step 6: commit.**

```bash
git add bridge/react/furniture-model-cache.ts bridge/react/furniture-model-cache.test.ts
git commit -m "feat: load furniture models into a content-hash cache"
```

### Task 8: concurrent requests for one hash share a single load

- [ ] **Step 1 (RED): write the failing test.** Two requests for the same hash call `resolve`
      once.

```ts
it('deduplicates concurrent requests for the same hash', async () => {
  let resolves = 0
  const cache = createFurnitureModelCache({
    resolve: async () => {
      resolves += 1
      return new Uint8Array([1])
    },
    parse: async () => new THREE.Group(),
    dispose: () => {},
  })
  const ref = { scope: 'user', contentHash: 'h1' } as const
  cache.request(ref)
  cache.request(ref)
  await flushMicrotasks()
  expect(resolves).toBe(1)
})
```

- [ ] **Step 2: run, confirm it fails** (resolves is 2). Run the cache test file.
- [ ] **Step 3 (GREEN):** guard `request` to ignore a hash already present in the map.
- [ ] **Step 4: run, confirm it passes.**
- [ ] **Step 5 (BLUE): review and refactor.**
- [ ] **Step 6: commit.** `git commit -m "feat: deduplicate furniture model loads by content hash"`

### Task 9: a failed load settles to failed and warns, in isolation

- [ ] **Step 1 (RED): write the failing tests.** A rejected resolve and a rejected parse both end
      `failed` and warn; a second hash still loads (one failure does not break the queue).

```ts
it('settles a failed load to failed, warns, and does not break other loads', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const cache = createFurnitureModelCache({
    resolve: async (ref) => (ref.contentHash === 'bad' ? undefined : new Uint8Array([1])),
    parse: async () => new THREE.Group(),
    dispose: () => {},
  })
  cache.request({ scope: 'user', contentHash: 'bad' })
  cache.request({ scope: 'user', contentHash: 'good' })
  await flushMicrotasks()
  expect(cache.get('bad')?.status).toBe('failed')
  expect(cache.get('good')?.status).toBe('ready')
  expect(warn).toHaveBeenCalled()
  warn.mockRestore()
})
```

- [ ] **Step 2: run, confirm it fails.**
- [ ] **Step 3 (GREEN):** wrap the whole resolve-parse chain per request in try/catch; a missing
      resolution, a rejected parse, or a thrown normalize-check sets `failed`, warns once, and
      notifies. Keep each request's failure local.
- [ ] **Step 4: run, confirm it passes.**
- [ ] **Step 5 (BLUE): review and refactor.**
- [ ] **Step 6: commit.** `git commit -m "feat: fall back furniture model loads to failed in isolation"`

### Task 10: a concurrency cap limits simultaneous parses

- [ ] **Step 1 (RED): write the failing test.** With `maxConcurrent: 2` and four requests against a
      controllable parse, only two parses are in flight until one settles.

```ts
it('caps concurrent parses', async () => {
  const gates: Array<() => void> = []
  let active = 0
  let maxActive = 0
  const cache = createFurnitureModelCache({
    resolve: async () => new Uint8Array([1]),
    parse: () =>
      new Promise((resolve) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        gates.push(() => {
          active -= 1
          resolve(new THREE.Group())
        })
      }),
    dispose: () => {},
    maxConcurrent: 2,
  })
  for (const h of ['a', 'b', 'c', 'd']) cache.request({ scope: 'user', contentHash: h })
  await flushMicrotasks()
  expect(maxActive).toBe(2)
  while (gates.length) {
    gates.shift()!()
    await flushMicrotasks()
  }
  expect(cache.get('d')?.status).toBe('ready')
})
```

- [ ] **Step 2: run, confirm it fails** (maxActive is 4).
- [ ] **Step 3 (GREEN):** a small queue; start a load only while an in-flight counter is below
      `maxConcurrent` (default a sensible small number such as 2), and pull from the queue as each
      settles.
- [ ] **Step 4: run, confirm it passes.**
- [ ] **Step 5 (BLUE): review and refactor.**
- [ ] **Step 6: commit.** `git commit -m "feat: cap concurrent furniture model parses"`

### Task 11: bounded eviction disposes an unreferenced template

- [ ] **Step 1 (RED): write the failing test.** With `maxTemplates: 1`, after two models load and
      only the second hash is marked live, the first template is disposed and dropped.

```ts
it('evicts and disposes an unreferenced template past the cap', async () => {
  const disposed: Object3D[] = []
  const t1 = new THREE.Group()
  const t2 = new THREE.Group()
  const templates: Record<string, Object3D> = { a: t1, b: t2 }
  const cache = createFurnitureModelCache({
    resolve: async () => new Uint8Array([1]),
    parse: async () => templates.next!, // set per request below
    dispose: (o) => {
      disposed.push(o)
    },
    maxTemplates: 1,
  })
  // load a
  templates.next = t1
  cache.request({ scope: 'user', contentHash: 'a' })
  await flushMicrotasks()
  // load b, mark only b live
  templates.next = t2
  cache.request({ scope: 'user', contentHash: 'b' })
  await flushMicrotasks()
  cache.markLiveHashes(['b'])
  expect(disposed).toContain(t1)
  expect(cache.get('a')).toBeUndefined()
  expect(cache.get('b')?.status).toBe('ready')
})
```

(If injecting `parse` per request is awkward, give the fake a queue of templates.)

- [ ] **Step 2: run, confirm it fails.**
- [ ] **Step 3 (GREEN):** `markLiveHashes` records the live set; when the ready-template count
      exceeds `maxTemplates`, dispose and delete entries whose hash is not live, oldest first. Be
      conservative (only past the cap) to avoid reloading a toggled piece.
- [ ] **Step 4: run, confirm it passes.**
- [ ] **Step 5 (BLUE): review and refactor.**
- [ ] **Step 6: commit.** `git commit -m "feat: evict unreferenced furniture model templates"`

### Task 12: dispose cancels in flight loads and drops late completions

- [ ] **Step 1 (RED): write the failing test.** A load in flight when `dispose()` is called does
      not store a template or notify afterward, and disposing the cache disposes its templates.

```ts
it('drops a late completion after dispose and frees templates', async () => {
  let release!: (o: Object3D) => void
  const t = new THREE.Group()
  const disposed: Object3D[] = []
  const cache = createFurnitureModelCache({
    resolve: async () => new Uint8Array([1]),
    parse: () =>
      new Promise((r) => {
        release = r
      }),
    dispose: (o) => {
      disposed.push(o)
    },
  })
  let changesAfterDispose = 0
  cache.request({ scope: 'user', contentHash: 'h' })
  await flushMicrotasks()
  cache.onChange(() => {
    changesAfterDispose += 1
  })
  cache.dispose()
  release(t) // late parse completion
  await flushMicrotasks()
  expect(cache.get('h')?.status).not.toBe('ready')
  expect(changesAfterDispose).toBe(0)
})
```

- [ ] **Step 2: run, confirm it fails.**
- [ ] **Step 3 (GREEN):** a disposed flag and an `AbortController`; after dispose, ignore late
      completions (no store, no notify), clear listeners, and dispose all ready templates. Pass the
      abort signal to `resolve` so a real fetch can cancel.
- [ ] **Step 4: run, confirm it passes.**
- [ ] **Step 5 (BLUE): review and refactor.**
- [ ] **Step 6: commit.** `git commit -m "feat: cancel furniture model loads on cache teardown"`

---

## Phase 4: read the cache from the synchronous reconciler (bridge)

### Task 13: the reconciler builds a mesh for a ready model and a box otherwise

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts` (the existing reconciler suite)

- [ ] **Step 1 (RED): write the failing test.** With a model lookup reporting a furniture node
      ready, the built furniture sub-group holds the model's mesh; with the default lookup it holds the
      box. Distinguish them by a marker: the box sub-group has the edge-overlay line segments, the mesh
      sub-group does not, or check for the model mesh by a known geometry.

```ts
it('builds a mesh sub-group for a ready model and a box otherwise', () => {
  const reconciler = createFramedSceneReconciler()
  const graph = graphWithOneFurniture() // a helper that yields a furniture node with assetRef
  const node = graph.furniture[0]!
  const template = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500))
  const models = {
    get: (h: string) =>
      h === node.assetRef.contentHash ? { status: 'ready', template } : undefined,
  }
  const meshBuild = reconciler.reconcile(graph, {}, models)
  const boxBuild = createFramedSceneReconciler().reconcile(graph, {}) // default lookup
  expect(furnitureLineSegments(meshBuild.root, node.id)).toBe(0)
  expect(furnitureLineSegments(boxBuild.root, node.id)).toBeGreaterThan(0)
})
```

(`furnitureLineSegments` finds the group named `node.id` and counts `LineSegments`. Define it in
the test file.)

- [ ] **Step 2: run it, confirm it fails.** Run:
      `pnpm exec vitest run bridge/react/framed-scene-reconciler.test.ts`
      Expected: FAIL, `reconcile` ignores the third argument and always builds the box.

- [ ] **Step 3 (GREEN): thread the lookup through.** Add a `models` parameter to `reconcile`, to
      the internal `buildFloorBuild`, and to `reuseOrBuildFurniture`. Define the lookup type in the
      reconciler module:

```ts
export interface FurnitureModelLookup {
  get(
    contentHash: string,
  ): { status: 'loading' | 'ready' | 'failed'; template?: import('three').Object3D } | undefined
}
const BOX_ONLY: FurnitureModelLookup = { get: () => undefined }
```

In `reuseOrBuildFurniture`, when `models.get(node.assetRef.contentHash)?.status === 'ready'` and
a template exists, build with `buildFurnitureModelGroup(cloneModel(template), node)` (see the
clone note below); otherwise `buildFurnitureSubgroup(node, materials)`. Default the parameter to
`BOX_ONLY` so every existing reconcile call and baseline is unchanged.

Clone note: clone the template so each instance gets its own transform while sharing geometry and
material. Use `template.clone(true)` for the first cut. Per the spec a clone shares buffers and is
never disposed.

- [ ] **Step 4: run it, confirm it passes.** Run the same command, and the full reconciler suite to
      confirm the default path is unchanged.

- [ ] **Step 5 (BLUE): review and refactor.** As before.

- [ ] **Step 6: commit.**

```bash
git add bridge/react/framed-scene-reconciler.ts bridge/react/framed-scene-reconciler.test.ts
git commit -m "feat: build a furniture mesh when its model is ready"
```

### Task 14: the swap rebuilds only the now-ready piece

**Files:**

- Modify: `bridge/react/framed-scene-reconciler.ts`
- Test: `bridge/react/framed-scene-reconciler.test.ts`

- [ ] **Step 1 (RED): write the failing test.** A furniture sub-group built as a box is reused
      while its model is not ready, and is rebuilt as a mesh once the model becomes ready, while a
      second unchanged piece keeps its identity across the swap.

```ts
it('rebuilds only the piece whose model became ready', () => {
  const reconciler = createFramedSceneReconciler()
  const graph = graphWithTwoFurniture()
  const [a, b] = graph.furniture
  let ready = false
  const template = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500))
  const models = {
    get: (h: string) =>
      ready && h === a!.assetRef.contentHash ? { status: 'ready', template } : undefined,
  }
  const first = reconciler.reconcile(graph, {}, models)
  const aBox = groupNamed(first.root, a!.id)
  const bBox = groupNamed(first.root, b!.id)
  ready = true
  const second = reconciler.reconcile(graph, {}, models)
  expect(groupNamed(second.root, a!.id)).not.toBe(aBox) // a rebuilt as a mesh
  expect(groupNamed(second.root, b!.id)).toBe(bBox) // b reused by identity
})
```

- [ ] **Step 2: run it, confirm it fails.** The current per-floor cache returns the first build
      whole because the floor node and paint references did not change, so `a` is not rebuilt.

- [ ] **Step 3 (GREEN): extend the reuse keys.**
  - Store on each cached furniture `SubgroupBuild` the model status it was built against
    (`builtReady: boolean`).
  - In `reuseOrBuildFurniture`, reuse the cached sub-group only when the node reference is unchanged
    AND `models.get(node.assetRef.contentHash)?.status === 'ready'` equals the stored `builtReady`.
    Otherwise rebuild (box or mesh per current status).
  - In the floor-level early return in `reconcile`, do not return the cached `framed` whole when any
    furniture node's current readiness differs from what its cached sub-group was built against.
    Compute a small readiness signature for the floor's furniture (the set of hashes currently
    ready) and compare it to the cached one; on a difference, fall through to a rebuild that reuses
    the unchanged sub-groups.

- [ ] **Step 4: run it, confirm it passes.** Run the reconciler suite. Expected: PASS, including the
      prior reuse tests.

- [ ] **Step 5 (BLUE): review and refactor.** As before. Watch the reconciler function-length and
      parameter-count limits; extract a `furnitureReadinessSignature(graph, models)` helper if the
      early-return check pushes `reconcile` over the line cap.

- [ ] **Step 6: commit.**

```bash
git add bridge/react/framed-scene-reconciler.ts bridge/react/framed-scene-reconciler.test.ts
git commit -m "feat: swap a furniture box for its model without rebuilding the floor"
```

---

## Phase 5: drive the loader and signal the swap (glue)

`bridge/react/webgpu-scene-view.tsx` is coverage-excluded glue proven by the scene tier, so these
tasks are verified by the end-to-end test in Phase 6 rather than unit tests. Keep each change small
and commit it.

### Task 15: instantiate the cache, request loads, and re-render on settle

**Files:**

- Modify: `bridge/react/webgpu-scene-view.tsx`

- [ ] **Step 1: build the cache once per view.** Use a ref, the way the reconciler is held. Wire its
      dependencies to the real registry and the engine functions:

```tsx
const registry = useAssetRegistry()
const cacheRef = useRef<FurnitureModelCache | null>(null)
if (cacheRef.current === null) {
  cacheRef.current = createFurnitureModelCache({
    resolve: async (ref) => {
      const result = await registry.resolve(ref)
      return result.outcome === 'resolved' ? result.bytes : undefined
    },
    parse: parseFurnitureModel,
    dispose: disposeObject,
  })
}
const cache = cacheRef.current
const [modelVersion, setModelVersion] = useState(0)
useEffect(() => cache.onChange(() => setModelVersion((v) => v + 1)), [cache])
useEffect(() => () => cache.dispose(), [cache])
```

- [ ] **Step 2: request loads for the active floor and mark the live set.** After the scoped graph
      is derived:

```tsx
useEffect(() => {
  const hashes = graph.furniture.map((f) => f.assetRef.contentHash)
  cache.markLiveHashes(hashes)
  for (const f of graph.furniture) cache.request(f.assetRef)
}, [cache, graph])
```

- [ ] **Step 3: pass the lookup into reconcile and depend on the version.**

```tsx
const { root, pose, bounds, nearWallTargets } = useMemo(
  () => reconcilerRef.current.reconcile(graph, paint, { get: (h) => cache.get(h) }),
  [graph, paint, modelVersion, cache],
)
```

- [ ] **Step 4: confirm the app still builds and runs.** Run `pnpm typecheck` and `pnpm build`.
      Start `pnpm dev`, place a furniture piece, switch to the 3D preview, and confirm the box is
      replaced by the model with no console error. Capture a screenshot.

- [ ] **Step 5: commit.**

```bash
git add bridge/react/webgpu-scene-view.tsx bridge/index.ts engine/index.ts
git commit -m "feat: load and swap furniture models in the live preview"
```

### Task 16: write the flag-gated swap signal for the end-to-end test

**Files:**

- Modify: `bridge/react/webgpu-scene-view.tsx` (or a small sibling component rendered inside it)

- [ ] **Step 1: add a runtime flag check.** Read a flag that is off by default and that the e2e sets,
      for example `new URLSearchParams(location.search).has('e2e')` or a `localStorage` key. Gate all of
      the following on it.

- [ ] **Step 2: write a hidden signal imperatively after the swap commits.** In a
      `useLayoutEffect` keyed on `root` and `modelVersion`, walk the built `root` for furniture groups
      that now contain a model mesh (a group named `furniture:*` whose subtree has a mesh that is not the
      box geometry), and set a data attribute on a hidden element the glue owns:

```tsx
useLayoutEffect(() => {
  if (!e2eFlagOn) return
  const el = signalRef.current
  if (el === null) return
  for (const id of loadedFurnitureEntityIds(root)) {
    el.setAttribute(`data-model-loaded-${id}`, 'true')
  }
}, [root, modelVersion])
```

Render `<div ref={signalRef} hidden data-testid="furniture-model-signals" />` only when the flag
is on. Keep this off the accessibility proxy so it never re-renders that tree.

- [ ] **Step 3: confirm it stays inert without the flag.** Run `pnpm dev` without `?e2e` and confirm
      the element is absent. Run with `?e2e=1` and confirm the attribute appears after a model loads.

- [ ] **Step 4: commit.**

```bash
git add bridge/react/webgpu-scene-view.tsx
git commit -m "feat: signal a committed furniture model swap behind a runtime flag"
```

### Task 17 (optional, may land as a fast-follow): pre-compile before ready

**Files:**

- Modify: `bridge/react/webgpu-scene-view.tsx`, `bridge/react/furniture-model-cache.ts`

- [ ] **Step 1:** add an optional `compile?: (model: Object3D) => Promise<void>` to `ModelCacheDeps`
      and call it after parse and normalize-check, before marking an entry ready. The bridge tests pass
      a no-op, so no GL context is touched in a unit test.

- [ ] **Step 2:** inside the canvas, a small component reads `gl` via `useThree` and hands the cache
      `gl.compileAsync.bind(gl)` bound to the scene and camera. If wiring the renderer to the cache
      proves awkward, stop and land the rest first; this is smoothness, not correctness.

- [ ] **Step 3: commit.** `git commit -m "perf: pre-compile furniture models before the swap"`

---

## Phase 6: end-to-end proof and the decision record

### Task 18: the live-preview swap end-to-end test

**Files:**

- Create: `e2e/tests/journeys/furniture-model-swap.spec.ts`

- [ ] **Step 1: write the test.** Boot the editor with the `?e2e` flag, place a furniture piece that
      uses a real pack model, switch to the 3D preview, and wait on the swap signal. Do not wait on the
      network response.

```ts
import { test, expect } from '@playwright/test'

test('a placed furniture piece swaps its box for the real model in 3D', async ({ page }) => {
  await page.goto('/?e2e=1')
  // place a piece via the furniture tool and the library (reuse the place-furniture journey helper)
  await placeOnePackFurniture(page)
  await page.getByRole('button', { name: '3D view' }).click()
  const entityId = await firstFurnitureEntityId(page)
  await expect(page.locator(`[data-testid="furniture-model-signals"]`)).toHaveAttribute(
    `data-model-loaded-${entityId}`,
    'true',
    { timeout: 15000 },
  )
})
```

Reuse the existing `place-furniture.spec.ts` helpers for placement and the proxy for the entity
id. If the journey runs under the default chromium project (not the scene-webgl GPU tier), confirm
the live preview renders there; if the model swap needs the GPU tier, name the spec to match the
scene tier instead and run it under that project.

- [ ] **Step 2: run it.** Run: `pnpm build && pnpm exec playwright test furniture-model-swap`
      Expected: PASS, the attribute appears within the timeout.

- [ ] **Step 3: commit.**

```bash
git add e2e/tests/journeys/furniture-model-swap.spec.ts
git commit -m "test(e2e): swap a furniture box for its model in the live preview"
```

### Task 19: ADR-0095

**Files:**

- Create: `docs/knowledge/decisions/ADR-0095-furniture-3d-mesh-loader.md`

- [ ] **Step 1: write the decision record.** Use `/adr furniture-3d-mesh-loader "Furniture 3D mesh
loader"`. Record: Approach A (the content-hash cache, the synchronous reconciler reading a model
      lookup, the version-bump re-render), the uniform fit-inside normalization with the world-matrix
      update, the cache paired with the reconciler reuse, the clone-shares-buffers lifecycle, the silent
      fallback contract, and the flag-gated imperative swap signal. Relate it to ADR-0094, ADR-0089,
      ADR-0007, ADR-0004. Status accepted, landed. Run the `humanizer` pass on the prose (it is an ADR).

- [ ] **Step 2: regenerate the local knowledge index.** Run: `pnpm knowledge:index` (the index is
      gitignored; this is a local convenience).

- [ ] **Step 3: commit.**

```bash
git add docs/knowledge/decisions/ADR-0095-furniture-3d-mesh-loader.md
git commit -m "docs: record the furniture 3d mesh loader decision (ADR-0095)"
```

### Task 20: full gate

- [ ] **Step 1: run the whole chain.** Run each command and check its own exit code, not a piped
      tail:
      `pnpm typecheck` then `pnpm lint` then `pnpm format:check` then `pnpm test` then `pnpm build` then
      `pnpm exec playwright test`. The scene-webgl baselines must stay green without regeneration,
      because the default reconcile path is unchanged.

- [ ] **Step 2: run the project audits.** `pnpm rgb:audit` (over `origin/main..HEAD`) and
      `pnpm integration:audit`. Fix any cycle-sequence findings.

- [ ] **Step 3:** leave the branch ready for the owner to push when the GitHub pause lifts. Do not
      push or open a PR.

---

## Self-review

Spec coverage: Task 1 covers the node `assetRef`; Tasks 3 and 4 cover normalization including the
world-matrix update, the uniform fit, the offset center, and the degenerate null; Task 4 covers
parse and the reject path; Task 5 covers the selectable model group; Task 6 covers disposal; Tasks
7 through 12 cover the cache load states, dedup, the isolated failure fallback, the concurrency cap,
the reference-aware eviction, and the abort and disposed guard; Tasks 13 and 14 cover the
synchronous reconcile lookup and the box-to-mesh swap with reuse; Tasks 15 and 16 cover the glue
and the flag-gated swap signal; Task 17 covers the optional pre-compile; Task 18 covers the
end-to-end swap; Task 19 covers ADR-0095; Task 20 covers the gate. The two deferred UX items are
captured as feat-019 and feat-020 in the future-issues drafts and are out of scope here.

Type consistency: `FurnitureModelLookup.get` returns `{ status, template? }`, matching the cache's
`ModelEntry`; the reconciler reads `node.assetRef.contentHash`, matching the Task 1 field and the
`AssetReference` shape; `buildFurnitureModelGroup` and `disposeObject` and `parseFurnitureModel` and
`normalizeModelIntoBox` are named identically across the engine, the barrel, the cache deps, and the
glue.

Open confirmations for the implementer, called out at their tasks: the plan-to-world axis and
rotation sign in `normalizeModelIntoBox` (Task 3), the garbage-buffer rejection behavior of this
Three version (Task 4), and whether the end-to-end swap needs the GPU scene tier rather than the
default chromium project (Task 18).
