# Plan: three-dimensional wall shell

Slice 1 of the three-dimensional preview track, the first geometry on top of the
slice-0 harness and conventions. The goal is for a floor with walls to render as a
shell of extruded boxes: one box per wall, sized by centerline, thickness, and
height, parented under its floor group, carrying its entity id, and split into
per-surface material groups. The decisions live in ADR-0061 and the slice
specification at `docs/specs/2026-06-12-three-dimensional-wall-shell.md`; this plan
is the build order.

Each numbered cycle is a red-green-blue round: a failing test, the smallest
implementation that passes it, then a refactor marker. Every green closes with a
blue marker before the next red. The first six cycles are pure Node geometry and
scene-tree work and form the gating proof. The visual tier at the end is committed
as a test-only step the cycle audit exempts.

## Background already verified

- `WallSceneNode` in `core/scene/scene-graph.ts` carries `start`, `end`, and
  `thickness`, but no height. `deriveWallNode(floor, wall)` builds it. The wall
  model (`core/model/types.ts`) has no per-wall height field, so every wall's
  height in this slice is the floor's `defaultCeilingHeight`.
- `engine/scene/build-scene.ts` emits one empty group per floor node, positioned
  at the floor elevation on world Y, with `userData.entityId`. It does not yet read
  `graph.walls`.
- The engine testing helpers (`engine/testing/`) read positions, normals, the
  index, and material groups off a `BufferGeometry`, and find or collect entity ids
  over a built tree. They are the tier-one assertion surface.
- The winding helpers (`core/scene/winding.ts`) and the vertical datum
  (`core/scene/vertical-datum.ts`) fix the face orientation and the base-at-zero
  rule the builder asserts against.
- `buildWallGraph(walls)` accepts anything with `id`, `start`, and `end`, so a
  `WallSceneNode[]` passes without a model round-trip. The graph is threaded to the
  builder for the opening slices; this slice does not read it.
- The scene harness (`bridge/react/scene-harness-view.tsx`) renders the lit empty
  scene and is screenshotted by `e2e/tests/scene-visual-regression.spec.ts` in the
  `scene-webgl` Playwright project. With the drawing buffer not preserved, an
  in-page pixel poll reads a cleared buffer, so a canvas screenshot is the reliable
  pixel source.

## Cycle 1: wall height on the node, read through an accessor

Red, then green, then blue. Pure core, no React or Three.js.

- Allowed files: `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`,
  `core/scene/wall-height.ts`, `core/scene/wall-height.test.ts`, `core/index.ts`.
- Behavior: a wall node derived from a floor reports that floor's
  `defaultCeilingHeight` as its height, read through a pure `wallHeight(node)`
  accessor. `WallSceneNode` gains an additive `height: number`; `deriveWallNode`
  sets it from `floor.defaultCeilingHeight`; `wallHeight` returns it.
- Shape: the accessor is the single read point so a later per-wall override or a
  sloped-top height profile is an additive change here, not in the builder. Export
  both the field-bearing type and the accessor from `core`.
- Blue: an empty marker unless the derive or the accessor wants tidying.

## Cycle 2: the material provider seam

Red, then green, then blue. Engine layer.

- Allowed files: `engine/materials/material-provider.ts`,
  `engine/materials/neutral-material-provider.ts`,
  `engine/materials/neutral-material-provider.test.ts`, `engine/index.ts`.
- Behavior: a `NeutralMaterialProvider` returns a material for each surface role in
  `'interiorFace' | 'exteriorFace' | 'reveal' | 'top' | 'base'`. The material it
  returns names its role, so a later geometry test can read which role a face
  group draws. The same role returns the same material instance.
- Shape: `MaterialProvider` is the seam the paint track swaps later; the neutral
  provider is the default. Keep the role union beside the interface.
- Blue: fold any repetition in the per-role lookup into a small map; empty marker
  otherwise.

## Cycle 3: a wall mesh box from centerline, thickness, and height

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.
- Behavior: `buildWallMesh(node, materials)` returns a mesh whose world-space
  bounding box spans the wall's start-to-end length, its thickness across the
  centerline, and zero to its height vertically, and whose `userData.entityId` is
  the node id. Height is read through `wallHeight`.
- Shape: a box extruded along the centerline, its base on the floor datum
  (`Y = 0`). Name the dimension and placement constants so the
  no-magic-numbers rule stays satisfied. Keep `buildWallMesh` within the
  forty-line limit, extracting the centerline placement into a helper if needed.
- Blue: extract the placement math (midpoint, length, plan-angle rotation) into a
  named pure helper if the green step left it inline.

## Cycle 4: per-surface material groups by role

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.
- Behavior: the wall mesh splits its faces into material groups whose drawn roles
  are exactly the four shell roles: the two faces along the wall length read
  `interiorFace` and `exteriorFace`, the upward face reads `top`, the downward face
  reads `base`. The two end caps read `exteriorFace`. The groups cover every
  triangle.
- Shape: assemble the mesh's material array from the provider keyed by role and map
  each box face group to its role's index. Read the role back through the
  material's name in the test (`materialGroups` plus `mesh.material[index].name`).
- Blue: extract the face-to-role mapping into a named table if it reads as a wall
  of conditionals.

## Cycle 5: face winding and normals

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.
- Behavior: the upward face normal points world `+Y`, and the two faces along the
  wall length carry opposite horizontal normals, consistent with the foundation
  winding rule. Asserted through `readNormals` on the built geometry.
- Shape: if the box placement from cycle 3 already satisfies this, the green step is
  small; the test pins it so a later builder change cannot silently flip a face.
- Blue: empty marker unless a normal recompute wants extracting.

## Cycle 6: build the walls into their floor groups

Red, then green, then blue. Engine layer.

- Allowed files: `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`,
  `engine/scene/wall-builder.ts`.
- Behavior: `buildScene`, given a graph with a floor and two walls on it, adds two
  wall meshes under that floor's group, each carrying its wall entity id. A graph
  with no walls is unchanged. `buildScene` gains an optional material-provider
  argument defaulting to the neutral provider.
- Shape: group `graph.walls` by `floorId`; for each floor build the wall graph from
  its wall nodes and pass a `WallBuildInput` (graph, walls, an empty
  openings-by-wall map, the provider) to a `buildWallShell` entry that maps the
  walls to `buildWallMesh`. The graph is threaded for the opening slices and unread
  here.
- Blue: extract the per-floor wall assembly into a helper so `buildScene` stays
  within the line limit; keep the floor-group construction as it is.

## Visual tier: walls in the harness, asserted pixel-approximately

Not a red-green-blue cycle. The harness change and the spec are committed as
`test(e2e):`, which the cycle audit exempts.

- Allowed files: `bridge/react/scene-harness-view.tsx`,
  `e2e/tests/scene-visual-regression.spec.ts`, and the snapshot folder.
- Behavior: the harness renders a small fixed walls fixture (a closed square of four
  walls) through `buildScene` with the basic lighting and a camera framed by
  `frameSceneCamera` on the built scene bounds. The visual test asserts the render
  is non-background where the walls project, pixel-approximately rather than against
  an exact frame: either a tolerant committed baseline (a generous threshold and a
  maximum different-pixel ratio) or a non-background region check read from a canvas
  screenshot. It self-skips where no WebGL 2 context exists, as the empty-scene test
  already does, and stays in the `scene-webgl` project, outside the chromium gate.
- No new dependency: Playwright's bundled perceptual comparison and screenshot
  readback cover this. The deterministic software-rasterizer path for a
  graphics-processor-less continuous-integration gate is the foundation's tracked
  follow-on, not built here.

## Gate before finishing the slice

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean. Base the range on the branch
  point, since this branch sits on `fix/immediate-commit-wall-drawing`, not `main`.
- Build, then run the full chromium e2e tree, not only the journeys folder.
- No schema touch in this slice, so `pnpm schema:check` is not required.
- The `scene-webgl` visual tier runs where a graphics processor is available and
  self-skips otherwise; it is verification, not a gate.
  </content>
