# Opening bodies fade with their host wall: Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with the project's
> red-green-blue TDD cycle (test-author RED -> implementer GREEN ->
> clean-code-reviewer + refactorer BLUE), run from the main thread. Each task is one
> cycle: a failing test, the minimal implementation, then the BLUE review/refactor
> (an empty marker commit if there is nothing to refactor). Steps use checkbox syntax.

**Goal:** When near-wall transparency (ADR-0086) fades a near exterior wall, the door
and window bodies in that wall fade with it, and each comes back to its own look when
the wall returns to solid.

**Architecture:** Three small changes stacked on the near-wall pass. Pure core groups
each exterior wall's openings with it. The engine preparation pass folds those openings'
body materials into the same fade target as the wall, so one camera-side decision drives
both. The per-frame update remembers and restores each material's own starting look, so
translucent window glass returns translucent.

**Two scene-graph facts this plan must respect (verified in core/scene/scene-graph.ts):**

1. **Id convention.** `deriveWallNode` sets a wall scene-node id to `WALL_NODE_PREFIX +
rawId` (for example `wall:south`), while `deriveOpeningNode` sets `hostWallId` to the
   RAW host wall id (`south`, the prefix stripped, as documented at
   scene-harness-view.tsx). So an opening is matched to a wall by stripping the wall
   node's prefix, exactly as editor/plan/use-opening-resizing.ts already does:
   `wall.id.slice(WALL_NODE_PREFIX.length) === opening.hostWallId`. Test fixtures use this
   real convention: a wall id `wall:bottom` with an opening `hostWallId: 'bottom'`.
2. **Material arity.** An opening fill mesh has a SINGLE material; a wall mesh has a
   per-face material ARRAY. THREE does not render an array-material mesh whose geometry
   has no groups, so the preparation pass must keep a single-material mesh single when it
   clones (never wrap it into a one-element array).

**Tech Stack:** TypeScript, Three.js (engine layer only), Vitest. Layer rules: `core/`
imports no Three.js; `engine/` is the only Three.js importer; the bridge wires them.

**Source of truth:** `docs/specs/2026-06-15-opening-fade-with-host-wall.md` and
`docs/knowledge/decisions/ADR-0087-opening-fade-with-host-wall.md`.

**Live-view-only:** No committed pixel baseline changes. The preparation pass clones
materials (identity changes, appearance at baseline does not), so the deterministic harness
render is unchanged; the fade is applied only by the live `NearWallFade` useFrame, which
already runs over whatever targets the pass returns and needs no change this slice.

---

## File structure

- `core/scene/exterior-walls.ts` (modify): `ExteriorWall` gains `openingIds`;
  `exteriorWalls` takes the floor's openings and groups each exterior wall's hosted
  opening ids onto it, bridging the wall-node prefix to the raw `hostWallId`.
- `core/scene/exterior-walls.test.ts` (modify): a grouping test in the real id convention.
- `engine/scene/near-wall-transparency.ts` (modify): the preparation pass folds each
  hosted opening's body materials into the wall's target while preserving each mesh's
  material arity; the per-frame update restores each material to its captured baseline.
- `engine/scene/near-wall-transparency.test.ts` (modify): an opening-fades-with-wall test
  (also asserting the opening mesh material stays single) and a glass-restores test.
- `bridge/react/framed-scene.ts` (modify): pass `graph.openings` into `exteriorWalls`.
- `bridge/react/framed-scene.test.ts` (modify): a build-seam test that an opening on an
  exterior wall is folded into its target and its glass fades.

No new files. No model, schema, scene-graph-data, wall-prism, opening-fill, or 2D change.

---

## Task 1: Core groups each exterior wall's hosted openings (prefix-aware)

**Files:**

- Modify: `core/scene/exterior-walls.ts`
- Test: `core/scene/exterior-walls.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe('exteriorWalls', ...)`. Reuse the existing `wall`, `room`, `point`,
`SQUARE`, `FLOOR_ID`, `WALL_THICKNESS` helpers. Add `OpeningSceneNode` to the scene-graph
import. The wall node ids carry the `wall:` prefix; the opening's `hostWallId` is the raw
id (the prefix stripped), as a derived graph produces:

```ts
function opening(id: string, hostWallId?: string): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: FLOOR_ID,
    type: 'single-swing-door',
    center: point(2000, 0),
    along: point(1, 0),
    normal: point(0, 1),
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS,
    orientation: { hinge: 'start', facing: 'positive' },
    ...(hostWallId === undefined ? {} : { hostWallId }),
  }
}

it('groups each exterior wall with the ids of the openings hosted on it', () => {
  const rooms = [room('room:r1', SQUARE)]
  const walls = [
    wall('wall:bottom', point(0, 0), point(4000, 0)),
    wall('wall:right', point(4000, 0), point(4000, 4000)),
  ]
  // hostWallId is the raw wall id (the wall node id with its `wall:` prefix stripped).
  const openings = [opening('opening:door', 'bottom'), opening('opening:no-host')]

  const result = exteriorWalls(walls, rooms, openings)

  const bottom = result.find((exterior) => exterior.wallId === 'wall:bottom')
  const right = result.find((exterior) => exterior.wallId === 'wall:right')
  expect(bottom?.openingIds).toEqual(['opening:door'])
  expect(right?.openingIds).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/scene/exterior-walls.test.ts`
Expected: FAIL. `exteriorWalls` does not yet take a third `openings` argument nor expose
`openingIds`.

- [ ] **Step 3: Write the minimal implementation**

```ts
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'

export interface ExteriorWall {
  wallId: string
  outwardNormal: Point
  /** Ids of the openings hosted on this wall, so they fade with it. */
  openingIds: readonly string[]
}

/** The raw wall id behind a wall scene-node id, matching an opening's hostWallId. */
function rawWallId(wallNodeId: string): string {
  return wallNodeId.startsWith(WALL_NODE_PREFIX)
    ? wallNodeId.slice(WALL_NODE_PREFIX.length)
    : wallNodeId
}

export function exteriorWalls(
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  openings: OpeningSceneNode[] = [],
): ExteriorWall[] {
  return walls.flatMap((wall) => {
    const outwardNormal = outwardNormalOf(wall, rooms)
    if (outwardNormal === null) {
      return []
    }
    const rawId = rawWallId(wall.id)
    const openingIds = openings
      .filter((opening) => opening.hostWallId === rawId)
      .map((opening) => opening.id)
    return [{ wallId: wall.id, outwardNormal, openingIds }]
  })
}
```

(`WALL_NODE_PREFIX` is exported from `./scene-graph`. An opening with no `hostWallId`
never equals a raw id, so it joins no wall.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/scene/exterior-walls.test.ts`
Expected: PASS (existing tests and the new one).

- [ ] **Step 5: Commit RED then GREEN**

```bash
git add core/scene/exterior-walls.test.ts && git commit -m "test: group hosted openings with their exterior wall"
git add core/scene/exterior-walls.ts && git commit -m "feat: group hosted openings with their exterior wall"
```

- [ ] **Step 6: BLUE** (clean-code-reviewer, then refactorer or empty marker)

---

## Task 2: Preparation pass folds hosted openings, preserving material arity

**Files:**

- Modify: `engine/scene/near-wall-transparency.ts`
- Test: `engine/scene/near-wall-transparency.test.ts`

- [ ] **Step 1: Write the failing test**

Add a door builder (raw `hostWallId: 'bottom'`, since `rectangularRoomGraph` walls carry
`wall:`-prefixed ids), and assert both that the door's body fades AND that an opening fill
mesh keeps its single material (does not become a one-element array, which would stop it
rendering):

```ts
const door = (): SceneGraph['openings'][number] => ({
  id: 'opening:door',
  kind: 'opening',
  floorId: 'g',
  type: 'single-swing-door',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

/** The single-material mesh under the opening group whose material has `name`. */
const openingMesh = (root: THREE.Group, entityId: string, name: string): THREE.Mesh => {
  const group = findByEntityId(root, entityId)
  expect(group).not.toBeNull()
  let found: THREE.Mesh | undefined
  ;(group as THREE.Object3D).traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      !Array.isArray(object.material) &&
      object.material.name === name
    ) {
      found = object
    }
  })
  expect(found).toBeDefined()
  return found as THREE.Mesh
}

it('fades a hosted opening with its wall and keeps the opening mesh material single', () => {
  const graph = rectangularRoomGraph()
  graph.openings = [door()]
  const root = buildScene(graph, new NeutralMaterialProvider())
  const targets = prepareNearWallTransparency(
    root,
    exteriorWalls(graph.walls, graph.rooms, graph.openings),
  )

  updateNearWallTransparency(targets, { x: 2000, z: -3000 }) // outside the bottom wall

  const leaf = openingMesh(root, 'opening:door', 'leaf')
  expect(Array.isArray(leaf.material)).toBe(false)
  expect((leaf.material as THREE.Material).opacity).toBe(FADED_OPACITY)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run engine/scene/near-wall-transparency.test.ts`
Expected: FAIL. The prepare pass does not fold opening materials, so the leaf stays opaque
(opacity 1); `openingMesh` also fails to find a single-material leaf if the pass wrapped it
in an array.

- [ ] **Step 3: Write the minimal implementation**

Add an entity-material clone path that preserves arity, and fold the hosted openings into
each wall's target:

```ts
/** Replaces a mesh's materials with private clones (single stays single) and returns them. */
function privatizeMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const cloned = meshMaterials(mesh).map((material) => material.clone())
  mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
  return cloned
}

/** The first descendant of `root` (or `root` itself) satisfying `predicate`, else null. */
function findNodeBy(
  root: THREE.Object3D,
  predicate: (node: THREE.Object3D) => boolean,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((node) => {
    if (found === null && predicate(node)) {
      found = node
    }
  })
  return found
}

/** Clones the materials of every mesh under the object carrying `entityId`, or none if absent. */
function cloneEntityMaterials(root: THREE.Object3D, entityId: string): THREE.Material[] {
  const anchor = findNodeBy(root, (node) => node.userData.entityId === entityId)
  if (anchor === null) {
    return []
  }
  const cloned: THREE.Material[] = []
  anchor.traverse((descendant) => {
    if (descendant instanceof THREE.Mesh) {
      cloned.push(...privatizeMeshMaterials(descendant))
    }
  })
  return cloned
}
```

Rewrite `findMeshByEntityId` to delegate to `findNodeBy` (predicate adds the
`instanceof THREE.Mesh` guard), and rewrite `prepareNearWallTransparency`:

```ts
export function prepareNearWallTransparency(
  root: THREE.Object3D,
  exterior: ExteriorWall[],
): NearWallTarget[] {
  return exterior.flatMap((wall) => {
    const mesh = findMeshByEntityId(root, wall.wallId)
    if (mesh === null) {
      return []
    }
    const materials = [
      ...privatizeMeshMaterials(mesh),
      ...wall.openingIds.flatMap((openingId) => cloneEntityMaterials(root, openingId)),
    ]
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
    return [
      {
        materials,
        point: { x: center.x, z: center.z },
        outwardNormal: { x: wall.outwardNormal.x, z: wall.outwardNormal.y },
      },
    ]
  })
}
```

(`NearWallTarget.materials` stays `THREE.Material[]` for now; the baseline wrapper lands in
Task 3. The wall mesh has an array material, so `privatizeMeshMaterials` returns its array;
an opening fill mesh has a single material, so it returns one clone and keeps the mesh
single.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run engine/scene/near-wall-transparency.test.ts`
Expected: PASS (new test plus existing prepare and fade tests).

- [ ] **Step 5: Commit RED then GREEN**

```bash
git add engine/scene/near-wall-transparency.test.ts && git commit -m "test: fade a hosted opening with its exterior wall"
git add engine/scene/near-wall-transparency.ts && git commit -m "feat: fade a hosted opening with its exterior wall"
```

- [ ] **Step 6: BLUE**

---

## Task 3: The per-frame update restores each material to its own baseline

**Files:**

- Modify: `engine/scene/near-wall-transparency.ts`
- Test: `engine/scene/near-wall-transparency.test.ts`

- [ ] **Step 1: Write the failing test**

A window's glass starts translucent. After its wall fades then comes back, the glass must
be translucent again, not opaque. Use raw `hostWallId: 'bottom'`:

```ts
const GLASS_OPACITY = 0.3

const windowOpening = (): SceneGraph['openings'][number] => ({
  id: 'opening:window',
  kind: 'opening',
  floorId: 'g',
  type: 'double-hung-window',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 1200,
  sillHeight: 900,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

it('restores a window glass pane to translucent after its wall fades and returns', () => {
  const graph = rectangularRoomGraph()
  graph.openings = [windowOpening()]
  const root = buildScene(graph, new NeutralMaterialProvider())
  const targets = prepareNearWallTransparency(
    root,
    exteriorWalls(graph.walls, graph.rooms, graph.openings),
  )
  const glass = openingMesh(root, 'opening:window', 'glass').material as THREE.Material

  updateNearWallTransparency(targets, { x: 2000, z: -3000 }) // outside: fade
  expect(glass.opacity).toBe(FADED_OPACITY)

  updateNearWallTransparency(targets, { x: 2000, z: 3000 }) // inside: restore
  expect(glass.opacity).toBe(GLASS_OPACITY)
  expect(glass.transparent).toBe(true)
  expect(glass.depthWrite).toBe(false)
})
```

(`openingMesh` was added in Task 2.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run engine/scene/near-wall-transparency.test.ts`
Expected: FAIL. The restore forces `opacity = 1` / `transparent = false`, so the glass
returns opaque (opacity 1, not 0.3).

- [ ] **Step 3: Write the minimal implementation**

Have each target material carry its captured baseline and restore to it:

```ts
/** A material paired with the appearance it had before any fade, so the fade can be reversed. */
interface FadeMaterial {
  material: THREE.Material
  baseline: { transparent: boolean; opacity: number; depthWrite: boolean }
}

/** Captures a freshly cloned material's transparency, opacity, and depth-write as its restore baseline. */
function fadeMaterial(material: THREE.Material): FadeMaterial {
  return {
    material,
    baseline: {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    },
  }
}
```

Change `NearWallTarget.materials` to `FadeMaterial[]`. Wrap the cloned materials in both
producers through `fadeMaterial`: `privatizeMeshMaterials` returns
`cloned.map(fadeMaterial)`; `cloneEntityMaterials` collects `FadeMaterial[]`. Rewrite the
update to restore to baseline:

```ts
export function updateNearWallTransparency(
  targets: NearWallTarget[],
  cameraPosition: WorldXZ,
): void {
  for (const target of targets) {
    const faded = cameraFacesWallOutside(cameraPosition, target.point, target.outwardNormal)
    for (const { material, baseline } of target.materials) {
      material.transparent = faded ? true : baseline.transparent
      material.opacity = faded ? FADED_OPACITY : baseline.opacity
      material.depthWrite = faded ? false : baseline.depthWrite
    }
  }
}
```

Note `privatizeMeshMaterials` still assigns the cloned THREE materials to `mesh.material`
preserving arity (single stays single); only its return type becomes `FadeMaterial[]`.
Remove the now-unused `OPAQUE` constant.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run engine/scene/near-wall-transparency.test.ts`
Expected: PASS. The existing fade test (opposite wall opacity 1 from its opaque baseline)
stays green.

- [ ] **Step 5: Commit RED then GREEN**

```bash
git add engine/scene/near-wall-transparency.test.ts && git commit -m "test: restore window glass to translucent after a wall fade"
git add engine/scene/near-wall-transparency.ts && git commit -m "feat: restore each faded material to its own baseline"
```

- [ ] **Step 6: BLUE**

---

## Task 4: The build seam passes the floor's openings into the grouping

**Files:**

- Modify: `bridge/react/framed-scene.ts`
- Test: `bridge/react/framed-scene.test.ts`

- [ ] **Step 1: Write the failing test**

Build a square room with a double-hung window on the south wall, in the real id convention
(wall id `wall:s`, opening `hostWallId: 's'`), build the framed scene, fade from outside,
and assert the window glass went transparent. The test reads scene objects structurally and
must not import three:

```ts
it('folds an opening on an exterior wall into its wall fade target', () => {
  const fadedOpacity = 0.1
  const windowGraph: SceneGraph = {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: [
      {
        id: 'wall:s',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        thickness: 200,
        height,
      },
      {
        id: 'wall:e',
        kind: 'wall',
        floorId: 'g',
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 4000 },
        thickness: 200,
        height,
      },
      {
        id: 'wall:n',
        kind: 'wall',
        floorId: 'g',
        start: { x: 4000, y: 4000 },
        end: { x: 0, y: 4000 },
        thickness: 200,
        height,
      },
      {
        id: 'wall:w',
        kind: 'wall',
        floorId: 'g',
        start: { x: 0, y: 4000 },
        end: { x: 0, y: 0 },
        thickness: 200,
        height,
      },
    ],
    rooms: [
      {
        id: 'room:r',
        kind: 'room',
        floorId: 'g',
        polygon: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        clearPolygon: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        area: 4000 * 4000,
        ceilingHeight: height,
      },
    ],
    underlays: [],
    openings: [
      {
        id: 'opening:window',
        kind: 'opening',
        floorId: 'g',
        type: 'double-hung-window',
        center: { x: 2000, y: 0 },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        width: 900,
        height: 1200,
        sillHeight: 900,
        hostThickness: 200,
        orientation: { hinge: 'start', facing: 'positive' },
        hostWallId: 's',
      },
    ],
    dimensions: [],
    stairs: [],
  }

  const { root, nearWallTargets } = buildFramedScene(windowGraph)
  updateNearWallTransparency(nearWallTargets, { x: 2000, z: -3000 })

  const group = findByEntityId(root, 'opening:window')
  expect(group).not.toBeNull()
  let glassOpacity: number | undefined
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { name?: string; opacity?: number } }
    if (
      mesh.material !== undefined &&
      !Array.isArray(mesh.material) &&
      mesh.material.name === 'glass'
    ) {
      glassOpacity = mesh.material.opacity
    }
  })
  expect(glassOpacity).toBe(fadedOpacity)
})
```

Import `updateNearWallTransparency` from `../../engine`. `height` is the `2400` const in the
describe block. Keep the describe callback under its line budget by hoisting the fixture and
the glass reader to module scope if needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run bridge/react/framed-scene.test.ts`
Expected: FAIL. `buildFramedScene` calls `exteriorWalls(graph.walls, graph.rooms)` without
openings, so the window is not folded and its glass stays at its translucent baseline 0.3.

- [ ] **Step 3: Write the minimal implementation**

```ts
const nearWallTargets = prepareNearWallTransparency(
  root,
  exteriorWalls(graph.walls, graph.rooms, graph.openings),
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bridge/react/framed-scene.test.ts`
Expected: PASS. The existing `nearWallTargets` length-4 assertion stays green (openings fold
into the four wall targets, not new targets).

- [ ] **Step 5: Commit RED then GREEN**

```bash
git add bridge/react/framed-scene.test.ts && git commit -m "test: fold exterior-wall openings into the fade targets"
git add bridge/react/framed-scene.ts && git commit -m "feat: pass openings into exterior-wall grouping"
```

- [ ] **Step 6: BLUE**

---

## Final gate (after all four tasks)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build
pnpm rgb:audit --range origin/main..HEAD
```

Then a fresh build plus Chromium and scene-webgl e2e (kill any stale preview on 4173 first).
Do not refresh the darwin home baseline (pre-existing editor-shell drift). Expect no
scene-webgl baseline change: the fade is live-view-only and the harness render is unchanged.

## Self-review against the spec

- Spec "group each exterior wall's openings" -> Task 1 (prefix-aware).
- Spec "fold the openings into the wall's fade target" -> Task 2 (arity-preserving).
- Spec "restore each material to its own look" -> Task 3.
- Spec "the build seam passes the floor's openings" -> Task 4.
- Spec "no committed pixel baseline" -> the final gate expects no baseline change.
