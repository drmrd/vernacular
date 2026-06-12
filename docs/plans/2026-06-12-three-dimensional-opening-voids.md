# Plan: three-dimensional opening voids

Slice 3 of the three-dimensional preview track, the third geometry slice on top of
the wall shell (ADR-0061) and the floor slabs and ceilings (ADR-0062), against the
slice-0 harness and conventions (ADR-0045). The goal is for a wall that hosts a
door or window to render with a rectangular void cut through its full thickness,
lined with reveal faces, so the shell stops hiding its openings. The decisions live
in ADR-0063 and the slice specification at
`docs/specs/2026-06-12-three-dimensional-opening-voids.md`; this plan is the build
order.

Branch: `feat/three-dimensional-opening-voids`, off `main` (tip `9d572e61`, which
already carries slices 1 and 2 via pull request #76).

Each numbered cycle is a red-green-blue round: a failing test, the smallest
implementation that passes it, then a refactor marker. Every green closes with a
blue marker before the next red. The first nine cycles are pure Node geometry,
core, and scene-tree work and form the gating proof. The visual tier at the end is
committed as a test-only step the cycle audit exempts.

Mode: push, pull request, and merge are authorized this slice. Commit from the main
thread; the role-separated subagents (test-author, implementer, refactorer) do not
commit and stay on this branch. When cutting the pull request, window the commit
author and committer dates with the `git meta rewrite` recipe (ask the user for the
target window first), the way slice 1 and 2 were windowed for #76.

## Background already verified

- `Scene3DReference` in `core/registries/element-types.ts` is `{ builder: string }`.
  Opening element types carry `scene3D: { builder: 'door-frame' }` (doors,
  including `cased-opening`) or `{ builder: 'window-frame' }` (windows); the wall
  type carries `extruded-wall` and the stair type `parametric-stair`.
  `ELEMENT_TYPE_REGISTRY_VERSION` is `3`, asserted by `element-types.test.ts:62`
  (`toBe(3)`) and by `element-types.test.ts:9` (`builtinElementTypes.version` equals
  it).
- `OpeningSceneNode` in `core/scene/scene-graph.ts` carries `id`, `kind`, `floorId`,
  `type` (the ElementType id), `center`, `along` (unit vector along the host wall),
  `normal` (unit left-hand normal), `width`, `height`, `sillHeight`,
  `hostThickness`, and `orientation`. It does **not** carry the host wall id.
  `deriveOpeningNode(floor, opening, hostWall)` builds it and already holds
  `hostWall`. The only `OpeningSceneNode` construction site in non-test source is
  this deriver. `scene-graph-openings.test.ts:38` asserts a derived opening node
  with `toEqual` (exact match), so any additive field on the derived node breaks it.
- `deriveOpeningGeometry(opening, hostWall)` in `core/topology/openings.ts` resolves
  the opening's plan geometry against its host wall: `center` on the wall
  centerline, `along` the unit start-to-end direction, `normal` the left-hand
  normal, `width` clamped to the wall length, and the two jamb points. A zero-length
  host wall yields a degenerate geometry at the wall start rather than NaN.
- `Contour` in `core/scene/contour.ts` is `{ start: Point; segments: ContourSegment[] }`
  with `ContourSegment` a discriminated union of `{ kind: 'line'; to: Point }` and
  `{ kind: 'arc'; to; center; clockwise }`. The last segment closes back to start.
  This slice emits only `line` segments.
- The winding helpers (`core/scene/winding.ts`): `canonicalOuterLoop` orients a loop
  so its world normal points up after `planToWorld`; `canonicalHoleLoop` winds a
  hole opposite. These assume a horizontal (plan-plane) loop and use
  `loopWorldNormal`, so they apply to floor and ceiling caps, **not** to a vertical
  wall face. The wall face is a vertical plane in an edge-local `(u, v)` frame and
  needs its own winding, asserted by this slice's tests. `planToWorld(point, height)`
  maps plan `(x, y)` at height `v` to world `(x, v, y)`.
- The wall graph (`core/topology/wall-graph.ts`): `buildWallGraph(walls, options?)`
  returns `PlanarGraph { vertices: Point[]; edges: GraphEdge[] }`, where
  `GraphEdge = { a: number; b: number; wallId: string }` indexes into `vertices`. A
  model wall is split into several edges at T-junctions and interior crossings, each
  edge carrying the original `wallId`. The parameter type is `readonly Wall[]`, and
  `Wall` is `{ id; start; end; thickness; extensions? }`, so a `WallSceneNode`
  (which has `id`, `start`, `end`, `thickness`) is structurally assignable; the only
  current caller is `core/topology/rooms.ts`, passing model walls. `DEFAULT_JUNCTION_TOLERANCE_MM`
  is `1`.
- `engine/scene/wall-builder.ts` exposes `buildWallMesh(node, materials)`, a per-wall
  `BoxGeometry` builder: a box of `length x height x thickness` placed at the wall
  midpoint, base at `Y = 0`, `rotation.y = atan2(-(dy), dx)`, `userData.entityId =
node.id`, with a six-entry per-face material array keyed by `FACE_ROLES` (BoxGeometry
  face order `+X, -X, +Y, -Y, +Z, -Z`, drawn as `exteriorFace, exteriorFace, top,
base, interiorFace, exteriorFace`). `wallHeight(node)` reads the height.
- `engine/scene/build-scene.ts` builds one group per floor node and, in
  `buildFloorGroup(node, graph, materials)`, maps `buildWallMesh` over each wall
  where `wall.floorId === modelId` (with `modelId = node.id.slice(FLOOR_NODE_PREFIX.length)`)
  and `buildRoomShell` over each matching room. `buildScene(graph, materials?)` takes
  an optional provider defaulting to `NeutralMaterialProvider`. `WALL_NODE_PREFIX`
  (`'wall:'`) and `FLOOR_NODE_PREFIX` (`'floor:'`) are exported from `core`.
- The material seam: `MaterialProvider.material(role)` keyed by
  `SurfaceRole = 'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'`. The
  `reveal` role is defined but unused until this slice. `NeutralMaterialProvider`
  returns one cached `MeshStandardMaterial` per role with `.name` set to the role,
  so a geometry test reads a face's role through
  `mesh.material[group.materialIndex].name`.
- The engine testing helpers (`engine/testing/`) read positions, normals, the index,
  and material groups off a `BufferGeometry`, and find or collect entity ids over a
  built tree (`findByEntityId`, `collectEntityIds`).
- The scene harness (`bridge/react/scene-harness-view.tsx`) builds `SHELL_FIXTURE`
  (a four-wall 4000-by-3000 mm room, walls 120 mm thick, 2600 mm tall, one room,
  `openings: []`) through `buildFramedScene` and is screenshotted by
  `e2e/tests/scene-visual-regression.spec.ts` against the committed
  `scene-shell-webgl` baseline in the `scene-webgl` Playwright project.

## Repeat-check gotchas (from slices 1 and 2)

Two failure modes this slice will hit:

1. **An additive field on a derived node breaks exact-match assertions.** Adding
   `OpeningSceneNode.hostWallId` (cycle 4) breaks the `toEqual` at
   `scene-graph-openings.test.ts:38` (the derived node gains the field). In cycle 4,
   run the broader suite (`pnpm exec vitest run` over at least `core/scene/`), not
   just the target test, and update the exact-match opening-node fixtures. The
   `toMatchObject` assertions in the same file tolerate the new field; only `toEqual`
   fails. The only production construction site is the deriver, so the blast radius
   is `core/scene/` tests.

2. **Adding a sibling group changes a whole-mesh measurement.** When the profile
   path (cycle 7) and reveals (cycle 8) add geometry to the wall mesh, any test that
   measures the whole wall mesh (total vertex count, whole-mesh AABB) needs rescoping
   to the specific material group under test, the way slice 2 rescoped the slab-AABB
   test from the whole room group to the slab mesh once the ceiling became a sibling.
   Scope new assertions to the role group (`top`, `base`, `interiorFace`,
   `exteriorFace`, `reveal`) being tested.

## Cycle 1: the void-contour kind on the element type

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/registries/element-types.ts`,
  `core/registries/element-types.test.ts`, `core/index.ts`.
- Behavior: every opening element type (`category === 'opening'`) carries
  `scene3D.voidContour === 'rectangular'`; the wall and stair types do not carry a
  `voidContour`. `ELEMENT_TYPE_REGISTRY_VERSION` is bumped to `4`.
- Shape: add `voidContour?: VoidContourKind` to `Scene3DReference`, with
  `export type VoidContourKind = 'rectangular'` as a string-keyed union open to
  further variants (the same shape as `ContourSegment`'s extensibility note). Set
  `voidContour: 'rectangular'` on every opening entry, leaving `builder` as is (it
  names the eventual fill). Bump the version constant to `4` and update both pinning
  assertions (`element-types.test.ts:9` and `:62`). Export `VoidContourKind` from
  `core` beside the existing `Scene3DReference` type export.
- Blue: empty marker unless the entry edits want a shared helper (they do not; they
  are literal additions).

## Cycle 2: the rectangular void contour generator

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/opening-void.ts`, `core/scene/opening-void.test.ts`,
  `core/index.ts`.
- Behavior: `rectangularVoidContour(node)` returns a `Contour` for an
  `OpeningSceneNode`, authored in the opening local frame (origin at the floor line
  below the opening center, `+x` along the wall, `+y` up): four corners at
  `x = -width/2` and `x = +width/2`, `y = sillHeight` and `y = sillHeight + height`,
  as four `line` segments closing back to `start`, wound as a hole (opposite a wall
  face's outer loop). With `width = 800`, `height = 2032`, `sillHeight = 0`, the
  corners are `(-400, 0)`, `(400, 0)`, `(400, 2032)`, `(-400, 2032)`. With
  `sillHeight = 900` the `y` values shift to `900` and `2932`.
- Shape: build the four corner points from the node's `width`, `height`, and
  `sillHeight` only (the local frame is independent of the wall's world placement,
  which the engine applies). Choose the corner order so the loop is wound as a hole
  and assert that order in the test (pin it, since the engine subtracts on this
  winding). The contour is `{ start, segments: [line, line, line, line] }` with the
  last segment closing to `start`. Name the corner-count and any literal so
  no-magic-numbers stays satisfied (the half-width and the sill-plus-height are
  derived, not literal). Export `rectangularVoidContour` from `core`.
- Blue: empty marker unless the corner construction wants a small named helper.

## Cycle 3: the void-contour resolver, selected by element type

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/opening-void.ts`, `core/scene/opening-void.test.ts`,
  `core/index.ts`.
- Behavior: `openingVoidContour(node, elementTypes?)` looks up the node's element
  type by `node.type`, reads its `scene3D.voidContour` kind, and returns the contour
  for that kind. For an opening node whose type resolves to `rectangular`, it returns
  the same contour `rectangularVoidContour(node)` does. `elementTypes` defaults to
  `builtinElementTypes`.
- Shape: resolve the element type with `getEntry(elementTypes, node.type)`, read
  `entry?.scene3D.voidContour`, and `switch` on the kind, returning
  `rectangularVoidContour(node)` for `'rectangular'`. The `switch` is the seam: a new
  kind is a new `case` plus a new generator, with no change to the wall builder that
  calls this. Decide the behavior for a missing entry or absent kind (return the
  rectangle as the safe default, or throw): default to the rectangle so a
  misconfigured registry still cuts a plausible void, and note it. Export
  `openingVoidContour` from `core`.
- Blue: empty marker unless the dispatch wants extracting; keep it one small
  function.

## Cycle 4: the host wall id on the opening node

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/scene-graph.ts`, `core/scene/scene-graph-openings.test.ts`.
- Behavior: a derived opening node carries `hostWallId` equal to its host wall's id.
  `deriveOpeningNode(floor, opening, hostWall)` sets `hostWallId: hostWall.id`.
- Shape: add `hostWallId?: string` to `OpeningSceneNode` (optional on the type for
  the same reason `WallSceneNode.height` and `RoomSceneNode.ceilingHeight` are:
  hand-built literals omit it), with a JSDoc note that the deriver always sets it and
  the opening-to-edge resolver treats absence as an opening it cannot place. Set it
  in `deriveOpeningNode`. Update the `toEqual` at `scene-graph-openings.test.ts:38`
  to include `hostWallId: 'w1'`, and run the broader `core/scene/` suite to catch any
  other exact-match opening-node assertion (see repeat-check gotcha 1).
- Blue: fold any other broken exact-match opening-node fixtures the broader suite
  surfaced; empty marker otherwise.

## Cycle 5: resolve an opening to its graph edge

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/topology/opening-edge.ts`, `core/topology/opening-edge.test.ts`,
  `core/index.ts`.
- Behavior: `resolveOpeningEdge(opening, graph)` returns
  `{ edge, positionAlongEdge } | null`. Among the edges whose `wallId` equals the
  opening's `hostWallId`, it projects the opening `center` onto each edge and returns
  the edge whose span `[0, edgeLength]` contains the projection, with
  `positionAlongEdge` the projection distance from `edge.a` toward `edge.b`. It
  returns `null` when the opening has no `hostWallId`, when no edge carries that wall
  id, or when the center projects outside every candidate edge.
  - Single-edge case: a straight wall from `(0,0)` to `(4000,0)`, one graph edge, an
    opening centered at `(1000, 0)` resolves to that edge with
    `positionAlongEdge === 1000`.
  - Split-wall case: a wall split by a T-junction into edges `(0,0)-(2000,0)` and
    `(2000,0)-(4000,0)` (both carrying the same `wallId`), an opening centered at
    `(3000, 0)` resolves to the second edge with `positionAlongEdge === 1000` (the
    distance from that edge's `a` vertex, `(2000,0)`).
- Shape: define `ResolvedOpeningEdge { edge: GraphEdge; positionAlongEdge: number }`.
  Filter `graph.edges` by `wallId`, and for each, read `a = graph.vertices[edge.a]`
  and `b = graph.vertices[edge.b]`, compute the edge length and the projection
  parameter of `center` onto the `a -> b` direction (the dot product divided by the
  length), and accept the edge when the parameter is within `[0, edgeLength]` (a
  small tolerance is fine, reuse `DEFAULT_JUNCTION_TOLERANCE_MM` if a tolerance is
  needed). Reuse `distance` and the segment helpers from `core/geometry` rather than
  re-deriving them. Export `resolveOpeningEdge` and `ResolvedOpeningEdge` from `core`.
- Blue: extract the projection-parameter computation into a small named helper if it
  reads as inline arithmetic; empty marker otherwise.

## Cycle 6: the graph-aware wall builder, box path, and the scene rewiring

Red, then green, then blue. Engine layer. This introduces the foundation's
`WallBuildInput` seam and rewires `buildScene` onto it, with openingless walls
rendering exactly as the wall shell did.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`,
  `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`.
- Behavior: `buildWalls(input)` takes
  `WallBuildInput { graph: PlanarGraph; walls: WallSceneNode[];
openingsByWall: Map<string, OpeningSceneNode[]>; materials: MaterialProvider }`
  and returns a `THREE.Group` of one box mesh per graph edge that has no openings.
  Each box is the slice-1 geometry for that edge's segment: `length x height x
thickness` from the edge endpoints and the wall's thickness and height, base at
  `Y = 0`, the `FACE_ROLES` per-face material array, and `userData.entityId` the
  namespaced wall node id (`WALL_NODE_PREFIX + edge.wallId`). `buildScene` builds the
  wall graph and calls `buildWalls` instead of mapping `buildWallMesh`, and an
  openingless graph renders the same boxes it did before (the existing wall and empty
  scene-tree tests stay green, with entity ids unchanged).
- Shape:
  - Extract the box geometry from `buildWallMesh` into a pure
    `buildWallSegmentBox(start, end, thickness, height, entityId, materials)` helper
    (the box from two endpoints, all of slice 1's placement and rotation and
    `FACE_ROLES` logic) and remove `buildWallMesh`. The test-author replaces the
    `buildWallMesh` unit tests with `buildWalls` box tests asserting the same box
    properties (placement, rotation, six material groups, entity id) for an
    openingless single-edge graph; coverage transfers rather than regressing.
  - `buildWalls` iterates `input.graph.edges`. For each edge, index the wall by
    `edge.wallId` (build a `Map<modelWallId, WallSceneNode>` from `input.walls`,
    keyed by the stripped id `w.id.slice(WALL_NODE_PREFIX.length)`), read the
    openings from `input.openingsByWall.get(edge.wallId) ?? []`, and resolve which
    resolve to this edge via `resolveOpeningEdge`. When none resolve to the edge,
    add a `buildWallSegmentBox` for the edge's two vertices. (The profile path for
    edges that do have openings lands in cycle 7; until then an edge with openings
    falls through to the box, so a wall with an opening is still a solid box, which
    cycle 7's red flips.)
  - In `buildFloorGroup`, build `floorWalls = graph.walls.filter(w => w.floorId ===
modelId)`, build the graph with
    `buildWallGraph(floorWalls.map(w => ({ id: w.id.slice(WALL_NODE_PREFIX.length),
start: w.start, end: w.end, thickness: w.thickness })))` so `edge.wallId` is the
    model id, group `graph.openings` for the floor by `hostWallId` into
    `openingsByWall`, and add `buildWalls({ graph: wallGraph, walls: floorWalls,
openingsByWall, materials })` to the floor group. Keep the per-room loop as is.
    `buildScene`'s signature is unchanged; the scene-graph intermediate representation
    gains no graph field (the graph is built here from `buildWallGraph`).
  - Keep `buildWalls` and `buildFloorGroup` within the forty-line function limit by
    extracting the per-edge dispatch and the openings grouping into named helpers.
- Gotcha: the namespaced-vs-model id reconciliation is the subtle part. `edge.wallId`
  must be the model id (so it matches `hostWallId`), and the mesh `entityId` must be
  the namespaced node id (so selection matches slice 1). Strip on the way into the
  graph, re-prefix on the way onto the mesh. Pin both in tests (an opening's
  `openingsByWall` key matches an `edge.wallId`; a built wall mesh carries
  `wall:<id>`).
- Blue: extract the model-id index, the openings grouping, and the per-edge dispatch
  into small helpers; keep `buildWalls` a readable loop.

## Cycle 7: cut the void into the wall face (profile path)

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.
- Behavior: an edge that has an opening builds a wall with the void cut from its two
  long faces. For a single wall from `(0,0)` to `(4000,0)`, thickness `120`, height
  `2600`, with one opening (`hostWallId` the wall, `center` at `(2000,0)`, `width`
  `900`, `height` `2032`, `sillHeight` `0`), the wall mesh's long faces (the
  `interiorFace` and `exteriorFace` groups) have no triangle covering the void
  region (a point at the void center, `x` between `1550` and `2450`, `y` between `0`
  and `2032`, on the face plane, is not inside any long-face triangle), while a point
  in the solid wall above or beside the void is covered. The wall is no longer a
  plain box: the box path's single rectangular long face is replaced by a
  triangulated rectangle-minus-hole.
- Shape:
  - Add a profile builder used when `resolveOpeningEdge` assigns one or more openings
    to the edge. Work in the edge-local `(u, v)` frame: `u` is distance along the
    edge from `edge.a` (`0` to `edgeLength`), `v` is height (`0` to `wallHeight`).
    The outline is the rectangle `[(0,0), (edgeLength,0), (edgeLength,height),
(0,height)]`. For each resolved opening, translate its `rectangularVoidContour`
    (via `openingVoidContour(node)`, whose local `+x` maps to `u` offset by the
    opening's `positionAlongEdge` and whose local `+y` maps to `v`) into a hole
    polygon in `(u, v)`, and collect the holes.
  - Triangulate the outline minus the holes with
    `THREE.ShapeUtils.triangulateShape(outerUV, holesUV)` (or a `THREE.Shape` with
    `.holes`), the same engine call the slab uses. Build the two long faces from this
    one `(u, v)` triangulation: map each `(u, v)` to world through a helper
    `edgeToWorld(u, v, side)` that returns `planToWorld(edge.a + along*u +
normal*(side*thickness/2), v)`, where `along` is the unit edge direction and
    `normal` its left-hand normal. The `+side` face and the `-side` face use the same
    triangulation with opposite winding so each faces outward; assign them the
    `interiorFace` and `exteriorFace` roles consistent with the box path's `+Z` and
    `-Z` convention.
  - Keep the top, base, and end caps for the solid parts of the wall (the box path's
    `top`, `base`, and the two `exteriorFace` end caps). The simplest correct
    approach: the top and base run the full edge length above and below the outline
    (the void does not reach the wall top or base unless `sillHeight` is `0`, in
    which case the base under the void is removed). For this slice, keep the base and
    top as full-length strips and accept that a floor-to-header door leaves a thin
    base sliver under the opening, or remove the base segment spanned by a
    sill-`0` void; pick one and pin it. Recommended: remove the base segment under a
    `sillHeight === 0` void so a doorway reads as open to the floor, and keep the top
    full-length.
  - Reuse `rectangularVoidContour` corners through `openingVoidContour` rather than
    re-deriving the rectangle, so the cut and any future generated shape share one
    source. Keep each builder function within the line limit by extracting the
    `(u, v)` outline assembly, the triangulation-to-world mapping, and the cap
    construction into named helpers.
- Gotcha: see repeat-check gotcha 2. Scope the "void region empty" assertion to the
  long-face groups, not the whole mesh, and read normals per group.
- Blue: extract the `(u, v)` framing and the `edgeToWorld` mapping into named helpers
  shared by the long faces and (next cycle) the reveals.

## Cycle 8: line the cut with reveal faces

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.
- Behavior: a wall with an opening has a `reveal` material group, and the reveal
  faces line the cut: for each segment of the void boundary (the head across the top,
  the two jambs up the sides, and, when `sillHeight > 0`, the sill across the
  bottom), a quad spans the wall thickness between the void edge on the `+side` face
  and the same edge on the `-side` face, wound so its normal points inward toward the
  void center (horizontal for the jambs, `-Y` for the head, `+Y` for the sill). A
  `sillHeight === 0` opening has a head and two jambs and no sill reveal. Assert the
  `reveal` group exists, covers the expected face count (three quads for a door, four
  for a sill-bearing window), and that a jamb reveal normal points along the wall
  normal toward the void.
- Shape: for each `(u, v)` segment of the void rectangle, emit a quad from
  `edgeToWorld(u, v, +1)` to `edgeToWorld(u, v, -1)` across the two segment ends,
  wound for an inward normal. Assign the `reveal` role to all reveal quads through a
  dedicated material group. Drive the segment list from the same void rectangle the
  long-face holes used, so the reveal edges coincide exactly with the hole edges (no
  gap, no overlap). Reuse the `edgeToWorld` helper from cycle 7.
- Gotcha: the reveal faces add a group to the wall mesh; keep cycle 7's long-face
  assertions scoped to their groups so they do not pick up reveal vertices.
- Blue: extract the per-segment reveal-quad builder so the head, jambs, and sill
  share it; empty marker if already shared.

## Cycle 9: an opening cut end to end through buildScene

Red, then green, then blue. Engine and core integration; the green may need no new
implementation if cycles 6 to 8 already compose, in which case this cycle pins the
pipeline and its green is the existing code.

- Allowed files: `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`.
- Behavior: `buildScene`, given a graph derived from a project with one wall and one
  opening on it (built through `deriveSceneGraph` so `hostWallId`, `center`, and the
  graph all come from the real deriver), parents one wall group under the floor whose
  host wall mesh carries the namespaced wall entity id and has the void cut and a
  `reveal` group. A project with a wall and no opening renders the box, unchanged.
- Shape: construct the test project with `createEmptyProject`, `createFloor`,
  `createWall`, and `createOpening` (the same factories `scene-graph-openings.test.ts`
  uses), derive the graph with `deriveSceneGraph`, call `buildScene`, locate the host
  wall mesh by its namespaced entity id (`findByEntityId`), and assert its geometry
  has a `reveal` group and the void region empty (reuse the cycle 7 and 8 assertions
  at the integration level). This exercises the full deriver-to-builder path
  (`hostWallId` set by the deriver, `resolveOpeningEdge`, the graph built in
  `buildFloorGroup`, the prefix reconciliation), which the earlier engine cycles
  drove with hand-built `WallBuildInput`s.
- Blue: empty marker; this cycle is an integration pin, not a refactor target.

## Visual tier: a door in the harness, asserted pixel-approximately

Not a red-green-blue cycle. The harness fixture change and the baseline refresh are
committed as `test(e2e):`, which the cycle audit exempts (this is not a cycle's RED;
it is a non-gating verification update, as in slices 1 and 2).

- Allowed files: `bridge/react/scene-harness-view.tsx`,
  `e2e/tests/scene-visual-regression.spec.ts` (only if a comment needs updating; the
  assertion already screenshots the canvas), and the
  `scene-visual-regression.spec.ts-snapshots/` folder.
- Behavior: `SHELL_FIXTURE` gains one `OpeningSceneNode` (a door on the south wall:
  `hostWallId` the south wall's model id, `center` near the wall midpoint, `width`
  about `900`, `height` about `2032`, `sillHeight` `0`, with a plausible `along`,
  `normal`, `hostThickness`, and `orientation`), and the fixture's `openings` array
  holds it. The harness then renders the south wall with a real cut-out. Build the
  opening node as a hand-built literal (the harness builds the graph directly, not
  through the deriver), giving it `hostWallId` matching the south wall node's stripped
  id and an `along`/`normal` consistent with that wall's direction.
- Refresh the committed `scene-shell-webgl` baseline once because the fixture now
  cuts a door (use `--update-snapshots=all` to force a pixel-exact refresh; the
  within-tolerance `-u` path can skip a real change). Review the refreshed PNG (a
  visible doorway in the south wall) before committing.
- No new dependency: Playwright's bundled perceptual comparison and screenshot
  readback cover this.

## Gate before finishing the slice

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "main..HEAD"` clean. Each cycle is `test:` then `feat:`
  then `refactor:` (the blue marker may be an empty commit), and the `test(e2e):`
  visual-tier commit is audit-exempt. Cycle 6 retires `buildWallMesh` and migrates
  its tests to `buildWalls` within the one cycle, so no orphan `test:` is left.
- Rebuild, then run the full chromium e2e tree (not only the journeys folder) and the
  `scene-webgl` project. Kill any stale dev or preview server on port 4173 first
  (`lsof -ti:4173 | xargs kill` only if the port is in use; guard a no-match glob).
  The `scene-webgl` visual tier runs where a graphics processor is available and
  self-skips otherwise; it is verification, not a gate.
- No schema touch in this slice, so `pnpm schema:check` is not required. The
  `ELEMENT_TYPE_REGISTRY_VERSION` bump is a registry content version, not the project
  schema version.
- Update `ROADMAP.md`: flip the opening-voids row from `in progress` to `merged`
  (with the PR number) once the pull request lands, the way slices 1 and 2 read.
- Cut the pull request with the commit dates windowed via `git meta rewrite` (ask the
  user for the target window first). Refresh the knowledge index locally with
  `pnpm knowledge:index` (gitignored; not committed).
- Optionally view the result with `pnpm dev`: open the Vite URL in a WebGPU browser
  (Chrome or Edge), draw a closed room with a door, and switch the view-mode toolbar
  to 3D or split view; or load the deterministic fixture at `/?fixture=scene-harness`.
