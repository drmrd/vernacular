# Plan: three-dimensional floor slabs and ceilings

Slice 2 of the three-dimensional preview track, the second geometry slice on top of
the wall shell (ADR-0061) and the slice-0 harness and conventions (ADR-0045). The
goal is for a floor with closed rooms to render each room with a solid floor slab
(top flush with the finished floor, thickness hanging below) and a ceiling at the
room's ceiling height, each parented under a room group carrying the room entity
id and split into per-surface material groups. The decisions live in ADR-0062 and
the slice specification at
`docs/specs/2026-06-12-three-dimensional-floor-ceiling-slabs.md`; this plan is the
build order.

Branch: `feat/three-dimensional-floor-ceiling-slabs`, off
`fix/three-d-preview-live-camera-framing` (its tip, so the live preview pane shows
the slabs; branching off the older slice-1 branch would render them invisibly
because that branch lacks the live-view camera framing).

Each numbered cycle is a red-green-blue round: a failing test, the smallest
implementation that passes it, then a refactor marker. Every green closes with a
blue marker before the next red. The first seven cycles are pure Node geometry and
scene-tree work and form the gating proof. The visual tier at the end is committed
as a test-only step the cycle audit exempts.

Mode: low-bandwidth / local-only. Plain `git commit`, no timestamp windowing, no
push, no PR, no GitHub mutation. Commit from the main thread; the role-separated
subagents (test-author, implementer, refactorer) do not commit and stay on this
branch.

## Background already verified

- `RoomSceneNode` in `core/scene/scene-graph.ts` carries `polygon`, `clearPolygon`
  (the thickness-aware clear-area boundary), `area`, optional `name`, and optional
  `holes` (interior void rings for donut and courtyard rooms). It has no height.
  `deriveRoomNodesForFloor(floor, overrides)` builds room nodes by mapping
  `applyRoomOverrides(deriveRooms(floor.walls), overrides)`.
- `Floor.defaultCeilingHeight` is a required `number` on the model
  (`core/model/types.ts`); `DEFAULT_CEILING_HEIGHT_MM` is `2438`
  (`core/model/factories.ts`).
- The model already has a per-room ceiling-height override
  (`RoomOverride.ceilingHeight`, set by `SET_ROOM_CEILING_HEIGHT`). This slice does
  not wire it into the derived node (ADR-0062 section "Ceilings derive per room");
  the node's height comes from the floor default only.
- The slice-1 height pattern to mirror: `core/scene/wall-height.ts` exposes
  `wallHeight(node)` returning `node.height ?? DEFAULT_CEILING_HEIGHT_MM`, the field
  is optional on `WallSceneNode`, and `deriveWallNode` always sets it.
- The vertical datum (`core/scene/vertical-datum.ts`) already exposes
  `floorSlabVerticalSpan(thickness)` returning `{ top: 0, bottom: -thickness }`.
- The winding helpers (`core/scene/winding.ts`): `canonicalOuterLoop` orients a
  loop so its world normal points up after `planToWorld`; `canonicalHoleLoop` winds
  a hole opposite. `planToWorld(point, height)` maps plan `(x, y)` at height `v` to
  world `(x, v, y)`.
- The engine testing helpers (`engine/testing/`) read positions, normals, the
  index, and material groups off a `BufferGeometry`, and find or collect entity ids
  over a built tree (`findByEntityId`, `collectEntityIds`).
- `engine/scene/build-scene.ts` builds one group per floor node and maps
  `buildWallMesh` over each floor's walls (matching `wall.floorId === modelId`,
  where `modelId = node.id.slice(FLOOR_NODE_PREFIX.length)`). It does not yet read
  `graph.rooms`. `buildScene(graph, materials?)` already takes an optional material
  provider defaulting to `NeutralMaterialProvider`.
- The material seam: `MaterialProvider.material(role)` keyed by
  `SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'`. The
  `NeutralMaterialProvider` returns one cached `MeshStandardMaterial` per role with
  `.name` set to the role, so a geometry test reads a face's role through
  `mesh.material[group.materialIndex].name`.
- The scene harness (`bridge/react/scene-harness-view.tsx`) builds `SHELL_FIXTURE`
  (a four-wall 4000-by-3000 mm room, walls 120 mm thick, 2600 mm tall, `rooms: []`)
  through `buildFramedScene` and is screenshotted by
  `e2e/tests/scene-visual-regression.spec.ts` against the committed
  `scene-shell-webgl` baseline in the `scene-webgl` Playwright project.

## Repeat-check gotcha from slice 1

Adding an always-present field to a derived node breaks exact-match assertions on
that node. In slice 1, adding `WallSceneNode.height` broke a `toEqual` on a derived
wall node (`scene-graph.test.ts`, the derived node gained `height: 2438`), and the
implementer's narrow verify missed it. Adding `RoomSceneNode.ceilingHeight` will do
the same to any full-object room-node assertion. In cycle 1, run the broader suite
(`pnpm exec vitest run` over at least `core/scene/` and any room consumers such as
`scene-graph-for-floor`, `paintable-surfaces`, and the journey or paint tests), not
just the target test, and update the room-node fixtures. Most room assertions in
`core/scene/scene-graph.test.ts` use `toMatchObject` (tolerant of the new field),
but full-object `toEqual` on a room node anywhere will fail and must be updated.

## Cycle 1: ceiling height on the room node, read through an accessor

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`,
  `core/scene/ceiling-height.ts`, `core/scene/ceiling-height.test.ts`,
  `core/index.ts`.
- Behavior: a room node derived from a floor reports that floor's
  `defaultCeilingHeight` as its ceiling height, read through a pure
  `ceilingHeight(node)` accessor. `RoomSceneNode` gains an additive
  `ceilingHeight?: number`; `deriveRoomNodesForFloor` sets it from
  `floor.defaultCeilingHeight` (always present, like `deriveWallNode` sets
  `height`); `ceilingHeight(node)` returns `node.ceilingHeight ??
DEFAULT_CEILING_HEIGHT_MM`.
- Shape: mirror `core/scene/wall-height.ts` exactly, including the JSDoc note that
  the fallback is defensive defaulting for hand-built literals, not a dead branch,
  and the note that this becomes a height profile (sloped, tray, coved) at the
  accessor later. The field is optional on the type because hand-built
  `RoomSceneNode` literals (fixtures) omit it. Export both `ceilingHeight` and the
  unchanged `RoomSceneNode` type from `core` (the type is already exported; add the
  accessor export beside `wallHeight`).
- Gotcha: see "Repeat-check gotcha from slice 1" above. Update any failing room-node
  fixtures in the same green step (the audit lets the implementer's green touch
  implementation; fixture updates that are test files belong to the test-author's
  red or the refactorer's blue, so if a non-target test breaks, fold its fixture
  fix into the blue refactor of this cycle, as slice 1 did).
- Blue: an empty marker unless the derive or the accessor wants tidying, plus any
  room-node fixture updates the broader suite surfaced.

## Cycle 2: floor slab thickness as a single read point

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/floor-slab.ts`, `core/scene/floor-slab.test.ts`,
  `core/index.ts`.
- Behavior: `floorSlabThickness()` returns `DEFAULT_FLOOR_SLAB_THICKNESS_MM`, a
  placeholder constant equal to `250`. Both are exported from `core`.
- Shape: there is no slab-thickness field on any model entity yet, so the accessor
  takes no argument and returns the constant. Document that the thickness becomes a
  layered floor assembly (finish over substrate over structure, shared with the
  ADR-0034 wall construction profiles) at this single read point later. Keep the
  constant and the accessor in one small file, the way the datum helpers share
  `vertical-datum.ts`.
- Blue: empty marker.

## Cycle 3: the floor slab prism from the clear polygon

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.
- Behavior: `buildRoomShell(node, materials)` returns a `THREE.Group` whose
  `name` and `userData.entityId` are the room node id, containing a floor-slab
  `THREE.Mesh`. The slab's world-space bounding box spans the room's `clearPolygon`
  extent in X and Z, with its top at `Y = 0` and its bottom at
  `Y = -floorSlabThickness()`. Use a simple rectangular `clearPolygon` in the test
  (for example corners `(0,0)`, `(4000,0)`, `(4000,3000)`, `(0,3000)`) so the
  expected AABB is exact: `x` in `[0, 4000]`, `z` in `[0, 3000]`, `y` in
  `[-250, 0]`.
- Shape: build the slab as a solid prism. Triangulate the cap from
  `canonicalOuterLoop(node.clearPolygon)` via `THREE.Shape` plus
  `THREE.ShapeUtils.triangulateShape` (holes come in cycle 7), placing every cap
  vertex through `planToWorld(point, 0)` for the top and `planToWorld(point,
-thickness)` for the bottom, then build one side quad per boundary edge connecting
  the top and bottom loops. Read the thickness through `floorSlabThickness()` and
  the boundary through the canonical winding helper, never raw. Name the dimension
  and placement constants so no-magic-numbers stays satisfied. Keep `buildRoomShell`
  within the forty-line function limit by extracting the cap builder and the side
  builder into named pure helpers in the same file.
- Blue: extract the cap-triangulation and side-quad construction into named helpers
  if the green step left them inline; keep the group assembly small.

## Cycle 4: per-surface material groups on the slab

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.
- Behavior: the slab mesh splits its faces into material groups whose drawn roles
  are exactly `top` (the upward cap), `base` (the downward cap), and `exteriorFace`
  (the vertical sides), and the groups cover every triangle. Read the role back
  through the material name: `materials[group.materialIndex].name`, the same way the
  wall builder test does (`drawnRoles` set equals `['base', 'exteriorFace',
'top']`).
- Shape: assemble the mesh's material array from the provider keyed by role and set
  each group's `materialIndex` to its role's slot. Confirm the covered triangle-
  vertex count equals the geometry's total (sum of `group.count` equals
  `readIndex(geometry).length`, or the position count when unindexed), mirroring the
  wall builder's coverage assertion.
- Blue: extract the face-to-role assignment into a named table or helper if it reads
  as a wall of conditionals.

## Cycle 5: slab face winding and normals

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.
- Behavior: the slab's upward cap normal points world `+Y`, its downward cap normal
  points world `-Y`, and the vertical side normals are horizontal (their `y`
  component is approximately zero and the `x`/`z` magnitude is approximately one),
  consistent with the foundation winding rule. Assert through `readNormals` on the
  built geometry, reading a representative vertex per role group via the group's
  start index into the index buffer, the way the wall builder normal test does.
- Shape: if the cap winding from cycle 3 (built from `canonicalOuterLoop` through
  `planToWorld`) already yields `+Y` for the top, the green step is small: reverse
  the bottom cap's triangle winding so it faces `-Y`, and wind each side quad so its
  normal points away from the slab interior. The test pins this so a later builder
  change cannot silently flip a face.
- Blue: empty marker unless a normal recompute or a winding helper wants extracting.

## Cycle 6: the ceiling plane

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.
- Behavior: the group `buildRoomShell` returns also contains a ceiling `THREE.Mesh`:
  a single plane over the same boundary at `ceilingHeight(node)`, whose world AABB is
  flat at `y = ceilingHeight(node)` (min y equals max y equals the ceiling height),
  whose face normal points world `-Y` (down, into the room), and whose drawn role is
  `base`. With a `node.ceilingHeight` of `2600` in the test, the ceiling sits at
  `y = 2600`.
- Shape: triangulate the same `canonicalOuterLoop(node.clearPolygon)` cap as the
  slab top, place its vertices through `planToWorld(point, ceilingHeight(node))`, and
  wind it so the normal points `-Y` (the opposite winding from the slab's upward
  top cap). It is single-sided (one plane, no thickness): from the harness's
  top-down camera it back-face-culls so the interior floor stays visible. Extract a
  shared cap-triangulation helper if the slab top and the ceiling now duplicate it.
- Blue: fold the slab top cap and the ceiling cap onto one shared cap helper if they
  duplicated triangulation; empty marker otherwise.

## Cycle 7: holes cut from the slab and ceiling

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.
- Behavior: a room node carrying one interior void in `holes` produces a slab whose
  cap does not cover the hole. Assert deterministically without a render: the
  centroid of the hole is not covered by any cap triangle (a point-in-triangle test
  over the top-cap triangles returns false for the hole centroid and true for a
  point in the solid ring), or equivalently the summed cap-triangle area equals the
  outer-loop area minus the hole area. Use a rectangular outer boundary with one
  smaller rectangular hole so both areas are exact.
- Shape: pass each `node.holes` ring through `canonicalHoleLoop` and into
  `THREE.ShapeUtils.triangulateShape(outer, holes)` (or `THREE.Shape` with
  `.holes`), so the cap triangulation already excludes the hole. Build a side quad
  loop around each hole boundary as well, wound so the hole's side normals point
  into the void. Apply the same holes to the ceiling cap. A room with no `holes`
  field is unchanged from cycles 3 to 6.
- Blue: extract the per-loop side-quad builder so the outer loop and each hole loop
  share it; empty marker if already shared.

## Cycle 8: build the rooms into their floor groups

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`,
  `engine/scene/room-builder.ts`.
- Behavior: `buildScene`, given a graph with a floor and one room on it, adds a room
  shell under that floor's group carrying the room entity id
  (`findByEntityId(floorGroup, roomId)` is non-null). A graph with no rooms is
  unchanged (the existing wall-only and empty cases still pass). `buildScene`'s
  signature is unchanged.
- Shape: in `buildFloorGroup`, add a per-room loop mirroring the existing per-wall
  loop: for each `room` in `graph.rooms` where `room.floorId === modelId`, add
  `buildRoomShell(room, materials)` to the floor group. Thread `graph.rooms` into
  `buildFloorGroup` the way `graph.walls` is threaded. Keep `buildFloorGroup` within
  the line limit by extracting the wall loop and the room loop into small helpers if
  it grows past the limit.
- Blue: extract the per-floor wall assembly and room assembly into helpers so
  `buildFloorGroup` stays within the line limit; keep the floor-group construction
  as it is.

## Visual tier: a room in the harness, asserted pixel-approximately

Not a red-green-blue cycle. The harness fixture change and the baseline refresh are
committed as `test(e2e):`, which the cycle audit exempts (this is not a cycle's RED;
it is a non-gating verification update, as in slice 1).

- Allowed files: `bridge/react/scene-harness-view.tsx`,
  `e2e/tests/scene-visual-regression.spec.ts` (only if the spec text needs a comment
  update; the assertion already screenshots the canvas), and the
  `scene-visual-regression.spec.ts-snapshots/` folder.
- Behavior: `SHELL_FIXTURE` gains one `RoomSceneNode` whose `clearPolygon` is the
  inset clear area of the existing four-wall rectangle, with `ceilingHeight` set to
  `SHELL_HEIGHT` (2600), so the harness renders a floor slab and a ceiling alongside
  the walls. Because the ceiling is a single downward plane it back-face-culls from
  the framed top-down camera, so the interior floor stays visible. Refresh the
  committed `scene-shell-webgl` baseline once because the fixture now draws a room
  (use `--update-snapshots=all` to force a pixel-exact refresh; the within-tolerance
  `-u` path can skip a real change). Review the refreshed PNG before committing.
- Construct the fixture room as a hand-built `RoomSceneNode` literal (the harness
  builds the graph directly, not through the deriver), giving it `polygon`,
  `clearPolygon`, `area`, and `ceilingHeight`, and `floorId: 'demo'` so the
  `buildScene` room loop parents it under `floor:demo`.
- No new dependency: Playwright's bundled perceptual comparison and screenshot
  readback cover this.

## Gate before finishing the slice

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "fix/three-d-preview-live-camera-framing..HEAD"` clean.
  Base the range on the branch point (the camera-framing fix tip), not local `main`,
  since this branch sits on `fix/three-d-preview-live-camera-framing`. Each cycle is
  `test:` then `feat:` then `refactor:` (the blue marker may be an empty commit), and
  the `test(e2e):` visual-tier commit is audit-exempt.
- Rebuild, then run the full chromium e2e tree (not only the journeys folder) and
  the `scene-webgl` project. Kill any stale dev or preview server on port 4173 first
  (`lsof -ti:4173 | xargs kill` only if the port is in use; a no-match glob can abort
  a chained `rm`, so guard it). The `scene-webgl` visual tier runs where a graphics
  processor is available and self-skips otherwise; it is verification, not a gate.
- No schema touch in this slice, so `pnpm schema:check` is not required.
- Optionally view the result with `pnpm dev`: open the Vite URL in a WebGPU browser
  (Chrome or Edge), draw a closed room with the wall tool, and switch the view-mode
  toolbar to 3D or split view; or load the deterministic fixture at
  `/?fixture=scene-harness`.
  </content>
