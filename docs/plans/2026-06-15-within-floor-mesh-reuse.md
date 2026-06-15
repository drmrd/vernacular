# Within-floor mesh reuse implementation plan

> **Execution model:** This project runs each cycle as red-green-blue through the
> role-separated subagents (`test-author` writes the failing test, `implementer`
> writes the minimal pass, `clean-code-reviewer` then `refactorer` close the blue),
> dispatched from the main thread. Steps use checkbox (`- [ ]`) syntax. Every green
> closes with a blue marker before the next red. Run `rgb:audit` against
> `origin/main..HEAD`. Land ADR-0089 with the work.

**Goal:** Reuse a floor's unchanged wall, room, and opening meshes across an edit to
that floor, so a single edit rebuilds only the entities it touched.

**Architecture:** Two deriver refinements supply per-entity reuse signals (openings
memoized by source reference; rooms re-keyed on the floor's walls array). The build
path is refactored so each entity becomes a self-contained, self-decorated sub-group.
A sub-floor reconciler assembles a floor from those sub-groups, reusing the unchanged
ones by reference (walls, openings) or by value (derived rooms) and rebuilding only
the dirty ones, recomputing the cheap bounds and pose every time.

**Tech stack:** TypeScript, Three.js (engine layer only), Vitest, React Three Fiber
(bridge glue).

**Spec:** `docs/specs/2026-06-15-within-floor-mesh-reuse.md`.

**Behavior-preserving:** No scene looks different. The committed scene baselines and
the live-scene end-to-end suite stay green without regeneration. Reuse is verified by
object identity in unit tests, not by pixels.

---

## File structure

- `core/scene/scene-graph-deriver.ts` (modify): add an opening reference memo; re-key
  the room memo on the floor's walls array plus its default ceiling height.
- `core/scene/scene-graph-deriver.test.ts` (modify): deriver reuse-signal tests.
- `engine/scene/floor-subgroups.ts` (create): `buildWallSubgroup`, `buildRoomSubgroup`,
  `buildOpeningSubgroup`, `assembleFloorRoot`. One source of truth for per-entity
  group construction, each group self-decorated with its edge overlay and shadow flags.
- `engine/scene/floor-subgroups.test.ts` (create): sub-group builder tests.
- `engine/scene/build-scene.ts` (modify): `buildFloorGroup` composes the sub-group
  builders; `buildScene` no longer overlays the whole root.
- `engine/scene/edge-overlay.ts` (modify): accept an optional shared material so the
  sub-groups can share one line material.
- `engine/index.ts` (modify): export the sub-group builders and `assembleFloorRoot`.
- `bridge/react/room-scene-node-equal.ts` (create): value-equality for derived rooms.
- `bridge/react/room-scene-node-equal.test.ts` (create).
- `bridge/react/framed-scene.ts` (modify): build through the sub-group builders so the
  reconciler and the full build share one assembly path.
- `bridge/react/framed-scene-reconciler.ts` (modify): sub-floor reconcile with reuse.
- `bridge/react/framed-scene-reconciler.test.ts` (modify): sub-group reuse tests.
- `docs/knowledge/decisions/ADR-0089-within-floor-mesh-reuse.md` (create).

---

## Phase A: deriver reuse signals (core)

### Task A1: memoize openings by source reference

**Files:** Modify `core/scene/scene-graph-deriver.ts`; test
`core/scene/scene-graph-deriver.test.ts`.

`deriveOpeningNode(floor, opening, hostWall)` reads only `floor.id` (stable) plus the
`opening` and its `hostWall`. So an opening node is reusable when both the opening and
its host wall references are unchanged, and must be rebuilt when the host wall moves
(a new wall object) even if the opening object is the same. Mirror the existing
`CachedRoomNodes` store-and-compare pattern.

- [ ] **Step 1 (RED, test-author):** add deriver tests:
  - Re-deriving a project after an edit that leaves an opening and its host wall
    untouched returns the same `OpeningSceneNode` reference for that opening.
  - Editing the opening (a new `Opening` object) returns a new node for it.
  - Moving the host wall (a new `Wall` object, same `Opening` object) returns a new
    node for the opening (its derived geometry and `hostThickness` changed).
  - An untouched opening on an untouched wall keeps its node while a sibling opening
    is edited.

  Run: `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts`
  Expected: FAIL (openings currently re-derive every call, so references never match).

- [ ] **Step 2 (GREEN, implementer):** add the memo. Exact shape:

```ts
const openingCache = new WeakMap<Opening, { hostWall: Wall; node: OpeningSceneNode }>()

const openingNodeFor = (floor: Floor, opening: Opening, hostWall: Wall): OpeningSceneNode => {
  const cached = openingCache.get(opening)
  if (cached !== undefined && cached.hostWall === hostWall) return cached.node
  const node = deriveOpeningNode(floor, opening, hostWall)
  openingCache.set(opening, { hostWall, node })
  return node
}

const openingNodesFor = (floor: Floor): OpeningSceneNode[] =>
  floor.openings.flatMap((opening) => {
    const hostWall = floor.walls.find((wall) => wall.id === opening.hostWallId)
    return hostWall ? [openingNodeFor(floor, opening, hostWall)] : []
  })
```

Change the returned `openings` field from
`project.floors.flatMap(deriveOpeningNodesForFloor)` to
`project.floors.flatMap(openingNodesFor)`. Add `Opening` to the `model/types`
import and `deriveOpeningNode` to the `scene-graph` import; drop the now-unused
`deriveOpeningNodesForFloor` import.

Run: `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts` Expected: PASS.

- [ ] **Step 3 (BLUE):** clean-code-review then refactor. Keep `openingNodeFor`
      explicit (it needs host-wall invalidation, so it cannot use the plain
      `memoizeByRef`). Confirm `deriveOpeningNodesForFloor` is still exported for the pure
      projection and any direct callers; only the deriver stops using it. Commit the
      marker (empty if no change).

- [ ] **Step 4:** full check chain for the touched layer:
      `pnpm typecheck && pnpm lint && pnpm exec vitest run core/`

---

### Task A2: re-key room memoization on the floor's walls

**Files:** Modify `core/scene/scene-graph-deriver.ts`; test
`core/scene/scene-graph-deriver.test.ts`.

`deriveRoomNodesForFloor(floor, overrides)` reads `floor.walls` (topology),
`overrides`, and `floor.defaultCeilingHeight` (the per-room fallback), plus the stable
`floor.id`. Keying on `floor.walls` lets rooms survive an edit that leaves the walls
untouched (the ceiling-height command spreads the floor and keeps the same walls
array, so `defaultCeilingHeight` must be compared explicitly, not relied on through a
new floor reference).

- [ ] **Step 1 (RED, test-author):** add deriver tests:
  - An edit that keeps the floor's walls array (for example adding or editing an
    opening, which replaces `floor.openings` but not `floor.walls`) returns the same
    `RoomSceneNode` references.
  - A wall edit (a new `walls` array) returns new room nodes.
  - A `defaultCeilingHeight` change that keeps the same walls array returns new room
    nodes (the ceiling-height fallback changed).
  - A room-override change (a new `roomOverrides` reference) returns new room nodes.

  Run: `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts` Expected: FAIL
  (the opening-keeps-walls case fails: the floor-keyed cache misses on the new floor
  object and re-derives).

- [ ] **Step 2 (GREEN, implementer):** change the room cache. Exact shape:

```ts
interface CachedRoomNodes {
  overrides: RoomOverrides
  defaultCeilingHeight: number
  nodes: RoomSceneNode[]
}

const roomCache = new WeakMap<readonly Wall[], CachedRoomNodes>()

const roomNodesFor = (floor: Floor, overrides: RoomOverrides): RoomSceneNode[] => {
  const cached = roomCache.get(floor.walls)
  if (
    cached !== undefined &&
    cached.overrides === overrides &&
    cached.defaultCeilingHeight === floor.defaultCeilingHeight
  ) {
    return cached.nodes
  }
  const nodes = deriveRoomNodesForFloor(floor, overrides)
  roomCache.set(floor.walls, { overrides, defaultCeilingHeight: floor.defaultCeilingHeight, nodes })
  return nodes
}
```

Run: `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts` Expected: PASS.

- [ ] **Step 3 (BLUE):** clean-code-review then refactor. Update the `CachedRoomNodes`
      doc comment to state the walls-array key and the ceiling-height guard. Commit marker.

- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm exec vitest run core/`

---

## Phase B: self-contained sub-groups (engine)

### Task B1: per-entity sub-group builders

**Files:** Create `engine/scene/floor-subgroups.ts` and
`engine/scene/floor-subgroups.test.ts`; modify `engine/scene/edge-overlay.ts`,
`engine/scene/build-scene.ts`, `engine/index.ts`.

Each entity becomes a self-contained group carrying its own edge overlay and shadow
flags, so a reused group needs no further decoration. The full build composes the same
builders, so the scene structure is unchanged.

Signatures:

```ts
// engine/scene/floor-subgroups.ts
export function buildRoomSubgroup(node: RoomSceneNode, materials: MaterialProvider): THREE.Group
export function buildOpeningSubgroup(
  node: OpeningSceneNode,
  materials: MaterialProvider,
): THREE.Group
export function buildWallSubgroup(
  floorWalls: WallSceneNode[],
  floorRooms: RoomSceneNode[],
  floorOpenings: OpeningSceneNode[],
  materials: MaterialProvider,
): { group: THREE.Group; nearWallTargets: NearWallTarget[] }
export function assembleFloorRoot(node: SceneNode, subgroups: THREE.Object3D[]): SceneRoot
```

`buildRoomSubgroup` wraps `buildRoomShell(node, materials)`, then applies the edge
overlay and shadow flags to that group. `buildOpeningSubgroup` wraps
`buildOpeningFill(node, materials)` the same way. `buildWallSubgroup` wraps
`buildWalls({ graph: buildFloorWallGraph(floorWalls), walls: floorWalls, openingsByWall,
materials })`, applies the edge overlay and shadow flags, then runs
`prepareNearWallTransparency(group, exteriorWalls(floorWalls, floorRooms,
floorOpenings))` and returns the group with its `nearWallTargets`. `assembleFloorRoot`
builds a `THREE.Group`, sets `name`/`userData.entityId`/`position.y` from the floor
node (the existing `buildFloorGroup` logic), adds the sub-groups, and returns a root
`THREE.Group` containing it (the single-floor shape `buildScene` produces).

- [ ] **Step 1 (RED, test-author):** `floor-subgroups.test.ts`:
  - `buildRoomSubgroup` returns a group whose descendants include mesh geometry and at
    least one `THREE.LineSegments` (the edge overlay), and whose meshes have
    `castShadow === true`.
  - `buildOpeningSubgroup` likewise for a door-leaf opening node.
  - `buildWallSubgroup` returns a group with wall meshes, edge lines, shadow flags, and
    a `nearWallTargets` array whose length equals the exterior-wall count for a simple
    closed room.
  - `assembleFloorRoot` returns a root whose single child is positioned at the floor
    node elevation and carries the floor `entityId`.

  Run: `pnpm exec vitest run engine/scene/floor-subgroups.test.ts`
  Expected: FAIL (module does not exist).

- [ ] **Step 2 (GREEN, implementer):** create `floor-subgroups.ts`. Add an optional
      `material?: THREE.LineBasicMaterial` parameter to `addEdgeOverlay` so sub-groups can
      share one line material; default keeps the current single-material behavior. Export
      the four functions from `engine/index.ts`.

  Run: `pnpm exec vitest run engine/scene/floor-subgroups.test.ts` Expected: PASS.

- [ ] **Step 3 (RED, test-author):** characterization test in
      `floor-subgroups.test.ts` or `build-scene` tests: a `buildScene(graph)` for a
      one-room, one-opening floor produces the same mesh count and the same number of edge
      `LineSegments` as before the refactor (guard against double overlay or a missing
      one). If an existing build-scene test already pins this, reuse it.

  Run the relevant build-scene test. Expected: PASS today (it pins current behavior);
  it must stay green through Step 4.

- [ ] **Step 4 (GREEN, implementer):** refactor `build-scene.ts`: `buildFloorGroup`
      builds its children through `buildWallSubgroup`/`buildRoomSubgroup`/
      `buildOpeningSubgroup` and returns the assembled floor group; remove the
      `addEdgeOverlay(root)` call from `buildScene` (the sub-groups self-decorate). Keep
      `buildScene` returning the same root shape.

  Run: `pnpm exec vitest run engine/` Expected: PASS (structure unchanged).

- [ ] **Step 5 (BLUE):** clean-code-review then refactor. Watch the engine line caps
      (max-lines-per-function 40). Commit marker.

- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm exec vitest run engine/`

---

### Task B2: route the full build through the sub-group path

**Files:** Modify `bridge/react/framed-scene.ts`.

`buildFramedScene` should assemble through the same sub-group builders so the
reconciler's full-rebuild path and the empty/active build are one path, and the wall
sub-group is the single owner of `nearWallTargets`.

- [ ] **Step 1 (RED, test-author):** a `framed-scene` test: for a one-floor graph with
      an exterior room, `buildFramedScene(graph, paint).nearWallTargets` has the same
      length as `prepareNearWallTransparency` over the exterior walls (pins that the wall
      sub-group supplies the targets), and `.root`, `.bounds`, `.pose` are still produced.
      Run: expected PASS today if it matches current output; it pins behavior for Step 2.

- [ ] **Step 2 (GREEN, implementer):** refactor `buildFramedScene` so it builds the
      active floor through `buildWallSubgroup`/`buildRoomSubgroup`/`buildOpeningSubgroup`
  - `assembleFloorRoot` (handling the empty-graph no-floor case as today: an empty
    root, empty `nearWallTargets`), reads `nearWallTargets` from the wall sub-group, and
    keeps computing `bounds` via `sceneBounds` and `pose` via `frameSceneCamera`. The
    `FramedScene` shape is unchanged.

  Run: `pnpm exec vitest run bridge/ engine/` Expected: PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Commit marker.

- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm exec vitest run bridge/ engine/`

---

## Phase C: sub-floor reconciler (bridge)

### Task C1: room value-equality helper

**Files:** Create `bridge/react/room-scene-node-equal.ts` and
`room-scene-node-equal.test.ts`.

Derived rooms have no source object, so reuse compares the geometry the shell reads.

```ts
export function roomSceneNodeEqual(a: RoomSceneNode, b: RoomSceneNode): boolean
```

Compare `id`, `area`, `name`, `ceilingHeight`, and deep-equal `polygon`,
`clearPolygon`, `outerPolygon`, and `holes` (arrays of points, and an array of rings
for holes). Equal values in different array instances compare equal.

- [ ] **Step 1 (RED, test-author):** tests: equal-content nodes with distinct array
      instances compare equal; a difference in any of polygon, clearPolygon, outerPolygon,
      holes, area, name, or ceilingHeight compares unequal; an absent vs present optional
      (name, holes, outerPolygon) compares unequal.
      Run: `pnpm exec vitest run bridge/react/room-scene-node-equal.test.ts`
      Expected: FAIL (module missing).

- [ ] **Step 2 (GREEN, implementer):** implement the equality. A small local
      point-array and ring-array deep compare; no new dependency.
      Run: expected PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Commit marker.

---

### Task C2: assemble the reconciler rebuild from sub-groups (no reuse yet)

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` and its test.

Restructure the cache so a floor's build is held as its sub-groups, not just the opaque
`FramedScene`. The rebuild path builds every sub-group and assembles. This is a
behavior-preserving refactor that sets up reuse; the existing reconciler tests stay
green.

Cache shape per floor id:

```ts
interface CachedFloorBuild {
  floorNode: SceneNode
  paint: Record<string, SurfaceTreatment>
  wall: { group: THREE.Group; nearWallTargets: NearWallTarget[] }
  wallNodes: WallSceneNode[]
  wallOpeningNodes: OpeningSceneNode[]
  rooms: Map<string, { node: RoomSceneNode; group: THREE.Group }>
  openings: Map<string, { node: OpeningSceneNode; group: THREE.Group }>
  framed: FramedScene
}
```

Reconcile logic:

- No active floor (`graph.nodes[0]` undefined): build through `buildFramedScene`, no
  cache (unchanged from today).
- Cached, same `floorNode` reference and same `paint` reference: return `cached.framed`
  (unchanged fast path).
- Cached but `paint` reference changed: full rebuild of every sub-group (paint may
  repaint anything), replace the cache. (Spec: a paint edit rebuilds the floor whole.)
- Cached, same `paint`, new `floorNode`: sub-floor reconcile (reuse added in C3 to C5;
  in this task, rebuild every sub-group so behavior is identical, then assemble).
- Assemble: `assembleFloorRoot(floorNode, [wall.group, ...roomGroups, ...openingGroups])`,
  `bounds = sceneBounds(root)`, `pose = frameSceneCamera(bounds)`,
  `framed = { root, pose, bounds, nearWallTargets: wall.nearWallTargets }`.

- [ ] **Step 1 (RED, test-author):** keep the existing five reconciler tests; add a
      characterization test: after a floor-node edit, `reconcile` returns a new `FramedScene`
      whose `pose` and `bounds` deep-equal a fresh `buildFramedScene(graph, paint)` for the
      same edited graph. Run: expected FAIL only if the assembled pose/bounds drift; it pins
      parity.

- [ ] **Step 2 (GREEN, implementer):** restructure the reconciler to the cache shape
      above, building all sub-groups on a miss and assembling. The five existing tests and
      the new parity test pass. Run: `pnpm exec vitest run bridge/`.

- [ ] **Step 3 (BLUE):** review then refactor. Watch line caps; extract a
      `buildFloorBuild(graph, floorNode, materials)` helper if the closure grows. Commit
      marker.

---

### Task C3: reuse room sub-groups by value

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` and its test.

On a floor edit with unchanged paint, reuse a cached room group when the new room node
is `roomSceneNodeEqual` to the node it was built from; otherwise rebuild that room.

- [ ] **Step 1 (RED, test-author):** in the reconciler test, drive the reconciler with
      real derived graphs from `createSceneGraphDeriver()` so the reuse signals are real
      (build a two-room floor; reconcile; then an edit that reshapes one room; reconcile
      again). Assert: the unchanged room's `THREE.Group` is the same instance across the two
      builds (`root` traversal by room entity id), and the reshaped room's group is a new
      instance. Also: an opening-only edit (rooms unchanged) reuses every room group.
      Run: expected FAIL (C2 rebuilds all rooms).

- [ ] **Step 2 (GREEN, implementer):** add the per-room reuse: for each new room node,
      if a cached entry exists and `roomSceneNodeEqual(newNode, cached.node)`, reuse
      `cached.group`; else `buildRoomSubgroup(newNode, materials)`. Run: expected PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Commit marker.

---

### Task C4: reuse opening sub-groups by reference

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` and its test.

- [ ] **Step 1 (RED, test-author):** with real derived graphs, place two openings;
      reconcile; edit one opening; reconcile. Assert the edited opening's group is a new
      instance and the other opening's group is reused (same instance). Run: expected FAIL.

- [ ] **Step 2 (GREEN, implementer):** reuse a cached opening group when its
      `OpeningSceneNode` reference is unchanged (the A1 memo makes this stable); else
      `buildOpeningSubgroup`. Run: expected PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Commit marker.

---

### Task C5: reuse the wall sub-group and its near-wall targets

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` and its test.

The wall group is the non-local unit. Reuse it (and its `nearWallTargets`) only when
every wall node reference and every wall-hosted opening node reference is unchanged;
otherwise rebuild it whole.

- [ ] **Step 1 (RED, test-author):** with real derived graphs, make an edit that leaves
      every wall and opening untouched but replaces the floor node, for example a dimension
      edit or a room-override (name) edit. Assert: the wall `THREE.Group` and the
      `framed.nearWallTargets` are reused (same instances) across the two builds. With a
      room-override name edit, also assert the renamed room's group rebuilt (value differs)
      while the wall group was reused. Run: expected FAIL (C2 to C4 rebuild walls every time).

- [ ] **Step 2 (GREEN, implementer):** reuse `cached.wall` when
      `sameRefs(newWallNodes, cached.wallNodes)` and
      `sameRefs(newWallOpeningNodes, cached.wallOpeningNodes)` (length plus element
      reference equality, order-stable since the deriver preserves order); else
      `buildWallSubgroup(...)`. `wallOpeningNodes` are the floor's openings whose
      `hostWallId` is set. Run: expected PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Extract `sameRefs`. Commit marker.

---

### Task C6: honor elevation on reuse

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` and its test.

`assembleFloorRoot` already sets `position.y` from the floor node on every assembly, so
an elevation change is honored even when every sub-group is reused. Pin it.

- [ ] **Step 1 (RED, test-author):** reconcile a floor; then a floor-node edit that only
      changes `elevation` (sub-groups all reusable). Assert the reused sub-groups are the
      same instances and the assembled floor group's `position.y` equals the new elevation.
      Run: expected PASS if C2's assembly already reads elevation; if it regressed, FAIL.

- [ ] **Step 2 (GREEN, implementer):** only if needed. Run: expected PASS.

- [ ] **Step 3 (BLUE):** review then refactor. Commit marker.

---

## Phase D: decision record and gate

### Task D1: ADR-0089

- [ ] Write `docs/knowledge/decisions/ADR-0089-within-floor-mesh-reuse.md`: the
      decision (two deriver refinements plus a sub-floor reconciler), the reuse tiers, and
      the reasoned departure of comparing derived rooms by value in the bridge while the
      core deriver stays reference-only. Relate it to ADR-0018, ADR-0061, ADR-0088. Run the
      humanizer pass on the prose (Rule 17). Commit `docs: ADR-0089 within-floor mesh reuse`.

### Task D2: full gate

- [ ] Run the full chain in the worktree:
      `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] Run `rgb:audit` against `origin/main..HEAD`; confirm every cycle is
      test then feat then refactor.
- [ ] Run the end-to-end suite (chromium + scene-webgl). Confirm the committed scene
      baselines are unchanged (behavior-preserving), so no `--update-snapshots`. The
      pre-existing darwin home baseline drift is not mine and stays untouched.
- [ ] Fast-forward the integration branch:
      `git branch -f integration/three-dimensional-preview feat/within-floor-mesh-reuse`,
      then remove the worktree.

---

## Self-review

- **Spec coverage:** opening memo (A1), room re-key with ceiling-height guard (A2),
  self-contained sub-groups with own edge overlay and shadow flags (B1), single
  assembly path and wall-owned near-wall targets (B2), room value-equality (C1),
  reconciler assembly (C2), the three reuse tiers wall/room/opening (C3 to C5),
  elevation on reuse (C6), the reuse-semantics table (covered across C3 to C5), the
  ADR-0018 departure (C1 plus ADR D1), behavior preservation (D2). All mapped.
- **Type consistency:** `buildWallSubgroup` returns `{ group, nearWallTargets }` in B1,
  consumed by B2 and cached as `cached.wall` in C2 and reused in C5. `roomSceneNodeEqual`
  defined in C1, used in C3. `CachedFloorBuild` fields defined in C2 are the ones C3 to
  C6 read. Consistent.
- **No placeholders:** deriver code is exact; engine and bridge tasks carry signatures,
  behaviors, and representative assertions for the role-separated subagents to author
  under TDD, matching this project's execution model.
