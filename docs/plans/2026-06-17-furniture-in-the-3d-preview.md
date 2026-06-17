# Furniture in the 3D Preview Implementation Plan

> **For agentic workers:** This plan is executed with role-separated red-green-blue TDD. Each cycle is `test:` (test-author) then `feat:` (implementer) then `refactor:` (refactorer, possibly an empty marker), dispatched from the main thread. Steps use checkbox (`- [ ]`) syntax for tracking. Run the gate (`pnpm typecheck && pnpm lint && pnpm test`) and `pnpm rgb:audit origin/main..HEAD` after each cycle; run `format:check`, `build`, and the relevant e2e before declaring done.

**Goal:** Render every placed furniture item in the 3D preview as a solid massing box sized to its footprint and height, standing at its position, rotation, and elevation, and selectable in step with the plan.

**Architecture:** Furniture gains a per-instance `height` carried through the model (schema `v10 -> v11`), defaulted from the asset's declared dimensions at placement and editable in the Inspector. A `FurnitureSceneNode` joins the pure scene graph with its rotated footprint corners precomputed in core, and an engine box builder extrudes those corners between the elevation and the elevation plus height. Furniture threads through the same path openings already take: scene-graph node, self-decorating sub-group, the live-preview reconciler reuse tier, and the deterministic build-scene path. Selection is free: the box mesh carries the raw furniture id that the 2D selection already keys on, so the generic 3D pick and outline sync the two views.

**Tech Stack:** TypeScript (`core/`, `storage/`, `engine/`, `bridge/`, `editor/`), three.js, React + react-three-fiber, Vitest, Playwright (scene-webgl visual baselines). Grounded in `docs/specs/2026-06-17-furniture-in-the-3d-preview.md`, ADR-0007 (content addressing), ADR-0044 (assets and furniture track), ADR-0061 (junction geometry is within a floor), ADR-0076 (slab geometry), ADR-0078 (edge overlay), ADR-0089 (within-floor mesh reuse), ADR-0092 (furniture model), ADR-0093 (in-app asset library).

---

## Execution conventions

- **Worktree:** `~/workspace/vernacular.wt/furniture-3d-massing`, branch `feat/furniture-3d-massing`, off `origin/main` (`efc2c903`, which already carries the merged #173 and #174). Deps installed on Node 22. This branch is NOT stacked, so `pnpm rgb:audit origin/main..HEAD` covers exactly this work.
- **Node:** the gate runs on Node 22 (`nvm use 22`). Verify real exit codes per command; `pnpm test` can exit 2 from a jsdom canvas race even when all tests pass, so re-run a suspicious failure with `>/tmp/out 2>/dev/null; echo $?` and read the summary.
- **Role separation:** the `test-author` writes the failing test and may not read implementation source; the `implementer` writes minimal passing code and may not read tests; the `refactorer` cleans implementation while tests stay green. Tell each subagent the exact allowed files for its cycle and to STOP rather than edit shared config.
- **Commit discipline:** Conventional Commits, no milestone tags, no `Co-Authored-By`, no em-dashes. Each GREEN is closed by a BLUE marker (possibly an empty `refactor:` commit) before the next RED. `test(e2e):`, `docs:`, and `build:` commits are exempt from the test->feat->refactor sequence (see `rgb:audit` rules); a `feat:`/`fix:` commit may touch NO `*.test.*` file.
- **Lint traps** (`.claude/rules.md`, all `.ts/.tsx`): functions <= 40 lines, files <= 300 lines, <= 3 params, no magic numbers (name every constant), no nested ternaries. Keep helpers small from the first GREEN so BLUE stays a marker. Lint baseline is the pre-existing editor warnings on `main`; add no net-new warnings.
- **Shared-field ripple:** two changes widen a shared shape and break sibling literals (see [[required-shared-field-breaks-siblings]]):
  - `FurnitureInstance.height` (Task 1): construction flows through `createFurnitureInstance` and the command handlers (which spread the existing instance), so runtime sites are covered by the factory default. Test fixtures that build `FurnitureInstance` literals are updated by the `test-author` in the cycle that needs them.
  - `SceneGraph.furniture` (Task 6): about two dozen `SceneGraph` literals exist. The `feat:` adds the field and fixes source-file literals; the `test:` fixes test-file literals. Enumerate both first: `grep -rln "underlays: \[\]" core engine bridge editor --include='*.ts' --include='*.tsx'`.

## File structure

| File                                                                           | Responsibility                                                                                                                                               | Status |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `core/model/types.ts`                                                          | Add `height: number` to `FurnitureInstance`.                                                                                                                 | Modify |
| `core/model/factories.ts`                                                      | `DEFAULT_FURNITURE_HEIGHT_MM`; `NewFurnitureOptions.height?`; `createFurnitureInstance` defaults height; bump `CURRENT_SCHEMA_VERSION` to 11.                | Modify |
| `core/migrations/schema/add-furniture-height.ts` (+ `.test.ts`)                | `v10 -> v11` backfill of `height` on each furniture instance.                                                                                                | Create |
| `core/migrations/schema/index.ts`                                              | Register `addFurnitureHeightMigration`.                                                                                                                      | Modify |
| `core/commands/handlers/furniture-commands.ts` (+ `.test.ts`)                  | Add `SET_FURNITURE_HEIGHT` + `setFurnitureHeight` + handler + register.                                                                                      | Modify |
| `core/model/furniture-footprint.ts` (+ `.test.ts`)                             | `furnitureFootprintCorners(position, rotation, footprint)` returns the 4 rotated plan corners.                                                               | Create |
| `core/scene/scene-graph.ts`                                                    | `FURNITURE_NODE_PREFIX`, `FurnitureSceneNode`, `deriveFurnitureNode`, `deriveFurnitureNodesForFloor`, `SceneGraph.furniture`, include in `deriveSceneGraph`. | Modify |
| `core/scene/scene-graph-for-floor.ts`                                          | `emptyGraph` seeds `furniture: []`; narrow `furniture` by floor.                                                                                             | Modify |
| `core/index.ts`                                                                | Export the new type, prefix, factory helper, and command.                                                                                                    | Modify |
| `storage/assets/asset-source.ts`                                               | `LibraryItem.height: number`.                                                                                                                                | Modify |
| `storage/assets/pack-source.ts`                                                | Set `height` from `asset.dimensions.height`.                                                                                                                 | Modify |
| `storage/assets/user-source.ts`                                                | `UserLibraryMeta.height`; `LibraryItem.height` (default for legacy entries).                                                                                 | Modify |
| `editor/plan/use-furniture-placement.ts`, `editor/plan/use-furniture-layer.ts` | Pass the library item's `height` into `createFurnitureInstance`.                                                                                             | Modify |
| `editor/plan/furniture-inspector.tsx` (+ `.test.tsx`)                          | Height `LengthField` wired to `setFurnitureHeight`.                                                                                                          | Modify |
| `engine/materials/material-provider.ts`                                        | Add `'furniture'` to `SurfaceRole`.                                                                                                                          | Modify |
| `engine/scene/furniture-builder.ts` (+ `.test.ts`)                             | `buildFurnitureMassing(node, materials)`: extrude the footprint corners into a box, tag the raw id.                                                          | Create |
| `engine/scene/floor-subgroups.ts`                                              | `buildFurnitureSubgroup`: box + edge overlay + shadow flags.                                                                                                 | Modify |
| `engine/scene/build-scene.ts`                                                  | `buildFloorGroup` builds furniture for its floor.                                                                                                            | Modify |
| `engine/index.ts`                                                              | Export `buildFurnitureMassing`, `buildFurnitureSubgroup`.                                                                                                    | Modify |
| `bridge/react/framed-scene-reconciler.ts`                                      | Furniture sub-group reuse tier (mirror openings).                                                                                                            | Modify |
| `bridge/react/scene-harness-view.tsx`                                          | `furniture: []` on existing fixtures; a `furniture` fixture with one box.                                                                                    | Modify |
| `e2e/tests/scene-visual-regression.spec.ts` (+ `-snapshots/`)                  | Capture `&scene=furniture`; commit the darwin baseline.                                                                                                      | Modify |
| `docs/knowledge/decisions/ADR-0094-furniture-massing-in-3d.md`                 | The massing box, the height field and migration, massing-before-geometry.                                                                                    | Create |
| `docs/knowledge/decisions/ADR-0044-*.md`                                       | Status note: massing shipped, real geometry tracked as the follow-up.                                                                                        | Modify |

## Module contracts (target signatures)

These signatures are the shared contract. The implementer reproduces them; the test-author writes to them from the public types and JSDoc.

```ts
// core/model/types.ts
export interface FurnitureInstance {
  id: string
  assetRef: AssetReference
  position: Point // plan mm
  rotation: number // degrees, free angle
  elevationZ: number // mm above the floor
  footprint: FurnitureFootprint // width, depth (mm)
  height: number // mm; vertical extent of the massing box
  name?: string
  customizations?: Record<string, unknown>
}

// core/model/factories.ts
export const DEFAULT_FURNITURE_HEIGHT_MM = 750 // a neutral standing height for a piece with no declared height
export interface NewFurnitureOptions {
  /* ...existing... */ height?: number
}
// createFurnitureInstance sets height: options.height ?? DEFAULT_FURNITURE_HEIGHT_MM
export const CURRENT_SCHEMA_VERSION = 11

// core/model/furniture-footprint.ts
// The four corners of the footprint rectangle centered on `position`, rotated by
// `rotation` degrees, in plan-space mm. Order is stable (a consistent winding) so
// the 3D extrusion and the 2D symbol agree.
export function furnitureFootprintCorners(
  position: Point,
  rotation: number,
  footprint: FurnitureFootprint,
): [Point, Point, Point, Point]

// core/commands/handlers/furniture-commands.ts
export const SET_FURNITURE_HEIGHT = 'floor/set-furniture-height'
export function setFurnitureHeight(floorId: string, furnitureId: string, height: number): Command

// core/scene/scene-graph.ts
export const FURNITURE_NODE_PREFIX = 'furniture:'
export interface FurnitureSceneNode {
  id: string // `furniture:<instanceId>`
  kind: 'furniture'
  floorId: string
  footprintCorners: [Point, Point, Point, Point] // plan mm, from furnitureFootprintCorners
  elevationZ: number // mm; box base
  height: number // mm; box rises to elevationZ + height
}
export function deriveFurnitureNode(floor: Floor, item: FurnitureInstance): FurnitureSceneNode
export function deriveFurnitureNodesForFloor(floor: Floor): FurnitureSceneNode[]
// SceneGraph gains `furniture: FurnitureSceneNode[]`

// engine/scene/furniture-builder.ts
export function buildFurnitureMassing(
  node: FurnitureSceneNode,
  materials: MaterialProvider,
): THREE.Group

// engine/scene/floor-subgroups.ts
export function buildFurnitureSubgroup(
  node: FurnitureSceneNode,
  materials: MaterialProvider,
): THREE.Group
```

Design notes the implementer must honor:

- **The box base sits at the elevation.** The prism rises from world `Y = elevationZ` to `Y = elevationZ + height`. An elevation of 0 rests the box on the floor. Mirror `engine/scene/junction-fill-builder.ts` `buildJunctionFill`, which extrudes a plan polygon through `geometryFromSections`, but pass `base = elevationZ` and `top = elevationZ + height` rather than the datum-to-height pair, and use the four `footprintCorners` as the polygon. The caps wind from the polygon's signed area (as the junction fill does) so the neutral `'furniture'` material reads solid from outside (front-side culling, the lesson of the #198 slab-edge fix).
- **The mesh carries the raw furniture id.** `group.name = node.id` (the `furniture:` prefixed scene id) but `group.userData.entityId = node.id.slice(FURNITURE_NODE_PREFIX.length)` (the raw instance id). The 2D selection keys furniture on the raw id (`editor/plan/selected-furniture.ts`, #174), so tagging the box with the raw id makes the generic 3D pick (`pickEntityIdAt`) and outline (`reconcileSelectionOutline`) select in step with the plan, with no selection-code change. Document this prefix split at the assignment.
- **`'furniture'` is neutral.** `roleMaterialParameters` already returns `NEUTRAL_COLOR` for any role that is not `glass` or `leaf`, so adding `'furniture'` to the `SurfaceRole` union is the only change; furniture is never painted.

---

## Task 1: Furniture gains a height

**Files:** Modify `core/model/types.ts`, `core/model/factories.ts`. Test: `core/model/factories.test.ts`.

- [ ] **Step 1 (test):** In `factories.test.ts`, add cases: `createFurnitureInstance` with no `height` returns `height === DEFAULT_FURNITURE_HEIGHT_MM`; with `height: 420` returns `420`. Import `DEFAULT_FURNITURE_HEIGHT_MM`.
- [ ] **Step 2:** Run `pnpm exec vitest run core/model/factories.test.ts`. Expect FAIL (no `height` on the result / no export).
- [ ] **Step 3 (feat):** Add `height: number` to `FurnitureInstance` (`types.ts`). Add `export const DEFAULT_FURNITURE_HEIGHT_MM = 750`, `height?: number` to `NewFurnitureOptions`, and `height: options.height ?? DEFAULT_FURNITURE_HEIGHT_MM` in `createFurnitureInstance` (`factories.ts`). Export the constant from `core/index.ts`.
- [ ] **Step 4:** Run the gate (`pnpm typecheck && pnpm lint && pnpm exec vitest run`). Typecheck flags any `FurnitureInstance` literal missing `height`; in source files add `height`, in test files this is the test-author's job in the cycle that owns the file. Expect the new cases PASS.
- [ ] **Step 5 (refactor):** Review; commit an empty `refactor:` marker if nothing to clean.
- [ ] **Commit:** `test: furniture instance carries a height`, then `feat: default a furniture instance height at construction`, then the refactor marker.

## Task 2: Schema migration v10 to v11 backfills height

**Files:** Create `core/migrations/schema/add-furniture-height.ts` (+ `.test.ts`). Modify `core/migrations/schema/index.ts`. `CURRENT_SCHEMA_VERSION` is already 11 from Task 1.

- [ ] **Step 1 (test):** New `add-furniture-height.test.ts`. A version-10 project whose floor has a furniture instance with no `height` migrates to one with `height === DEFAULT_FURNITURE_HEIGHT_MM`; an instance with `height: 300` keeps `300`; a floor with no furniture array is returned unchanged; `meta.schemaVersion` is not touched by the migration (the orchestrator advances it). Use array index access with `?.` to satisfy `noUncheckedIndexedAccess` (see [[verify-real-exit-codes-not-piped-tail]]).
- [ ] **Step 2:** Run `pnpm exec vitest run core/migrations/schema/add-furniture-height.test.ts`. Expect FAIL.
- [ ] **Step 3 (feat):** Create `add-furniture-height.ts` mirroring `add-floor-furniture.ts`: `from: 10`, walk `project.floors`, for each floor walk `furniture` (when an array) and set `height` to `DEFAULT_FURNITURE_HEIGHT_MM` when absent, leaving present values. Guard non-array floors/furniture. Register `addFurnitureHeightMigration` in `index.ts`.

```ts
import { DEFAULT_FURNITURE_HEIGHT_MM } from '../../model/factories'
import type { ProjectShape, SchemaMigration } from '../types'

export const addFurnitureHeightMigration: SchemaMigration = {
  from: 10,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) return project
    const migratedFloors = floors.map((floor) => {
      const floorRecord = floor as Record<string, unknown>
      const furniture = floorRecord.furniture
      if (!Array.isArray(furniture)) return floorRecord
      const migrated = furniture.map((piece) => {
        const record = piece as Record<string, unknown>
        return typeof record.height === 'number'
          ? record
          : { ...record, height: DEFAULT_FURNITURE_HEIGHT_MM }
      })
      return { ...floorRecord, furniture: migrated }
    })
    return { ...project, floors: migratedFloors } satisfies ProjectShape
  },
}
```

- [ ] **Step 4:** Run the gate. Expect PASS, including the existing migration round-trip tests (the chain now ends at 11).
- [ ] **Step 5 (refactor):** Marker or small cleanup.
- [ ] **Commit:** `test:` then `feat: migrate furniture instances to carry a height` then refactor marker.

## Task 3: A command sets furniture height

**Files:** Modify `core/commands/handlers/furniture-commands.ts` (+ `.test.ts`).

- [ ] **Step 1 (test):** In `furniture-commands.test.ts`, dispatch `setFurnitureHeight(floorId, furnitureId, 1200)` on a project with one placed piece; assert the instance height becomes `1200` and that one undo restores the prior height. Mirror the existing `resizeFurniture` test.
- [ ] **Step 2:** Run it; expect FAIL (no export).
- [ ] **Step 3 (feat):** Add `SET_FURNITURE_HEIGHT`, `SetFurnitureHeightParams { floorId; furnitureId; height }`, `setFurnitureHeight(...)`, a handler that maps the floor's furniture and replaces the matching instance's `height` (mirror `resizeFurnitureHandler`), and register it in `registerFurnitureCommands`. Export `setFurnitureHeight` from `core/index.ts`.
- [ ] **Step 4:** Run the gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker or cleanup.
- [ ] **Commit:** `test:` / `feat: add a set-furniture-height command` / refactor.

## Task 4: Library items carry height; placement defaults from it

**Files:** Modify `storage/assets/asset-source.ts`, `storage/assets/pack-source.ts` (+ `.test.ts`), `storage/assets/user-source.ts` (+ `.test.ts`), `editor/plan/use-furniture-placement.ts`, `editor/plan/use-furniture-layer.ts`.

### Cycle 4.1: pack items carry the declared height

- [ ] **Step 1 (test):** In `pack-source.test.ts`, a pack whose manifest asset declares `dimensions.height` lists a `LibraryItem` with that `height`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add `height: number` to `LibraryItem` (`asset-source.ts`). In `pack-source.ts` set `height: asset.dimensions.height` beside the existing `footprint`.
- [ ] **Step 4:** Gate. Typecheck will flag `user-source.ts` (its `LibraryItem` now lacks `height`); fix it in Cycle 4.2's GREEN, or add a temporary `height` there in this GREEN to keep the build green and refine in 4.2. Prefer doing 4.2's source change here so the tree stays green, leaving 4.2 to add its own test and the import default.
- [ ] **Step 5 (refactor):** Marker.
- [ ] **Commit:** `test:` / `feat: carry the declared height onto pack library items` / refactor.

### Cycle 4.2: user imports default a height

- [ ] **Step 1 (test):** In `user-source.test.ts`, a stored user entry without a height lists a `LibraryItem` whose `height === DEFAULT_FURNITURE_HEIGHT_MM`; an entry with a stored height surfaces it.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add optional `height` to `UserLibraryMeta` and set `LibraryItem.height` to `meta.height ?? DEFAULT_FURNITURE_HEIGHT_MM` (an import has no parsed geometry yet, so it defaults, the same editable bridge the footprint uses; ADR-0093). Import the constant from `core`.
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker.
- [ ] **Commit:** `test:` / `feat: default a height for imported user library items` / refactor.

### Cycle 4.3: placement copies the item height onto the instance

- [ ] **Step 1 (test):** The placement path builds the instance through `createFurnitureInstance`. Add or extend the placement hook test so that arming a library item with `height: 815` and placing dispatches `placeFurniture` with an instance whose `height === 815`. (Follow the existing `use-furniture-placement` test fixture.)
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** In `use-furniture-placement.ts`, pass `height: armed.item.height` into `createFurnitureInstance`. In `use-furniture-layer.ts` (the ghost) pass the armed item's `height` too so the ghost box matches the piece that will land.
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker.
- [ ] **Commit:** `test:` / `feat: place furniture at the library item height` / refactor.

## Task 5: The Inspector edits height

**Files:** Modify `editor/plan/furniture-inspector.tsx` (+ `.test.tsx`).

- [ ] **Step 1 (test):** In `furniture-inspector.test.tsx`, the inspector renders a height field showing the instance height; committing a new value dispatches `setFurnitureHeight(floorId, id, mm)`. Mirror the width/depth `LengthField` assertions already in the file.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add a `LengthField` for height beside width and depth, `valueMm={furniture.height}`, `onCommitMm={(mm) => dispatch(setFurnitureHeight(floorId, furniture.id, mm))}`. Keep the component under 40 lines (extract a `DimensionsFields` helper if it grows).
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker or the helper extraction.
- [ ] **Commit:** `test:` / `feat: edit furniture height in the inspector` / refactor.

## Task 6: The scene graph carries furniture

**Files:** Create `core/model/furniture-footprint.ts` (+ `.test.ts`). Modify `core/scene/scene-graph.ts` (+ `.test.ts`), `core/scene/scene-graph-for-floor.ts` (+ `.test.ts`), `core/index.ts`, and every `SceneGraph` literal.

### Cycle 6.1: footprint corners helper

- [ ] **Step 1 (test):** `furniture-footprint.test.ts`: a 600 by 400 footprint at the origin with rotation 0 returns the four corners at `(+/-300, +/-200)` in a stable order; rotation 90 swaps the axes (corners at `(+/-200, +/-300)`); a nonzero `position` offsets all four. Allow a small floating tolerance.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Implement `furnitureFootprintCorners`. Compute `alongUnit = (cos a, sin a)` and `acrossUnit = (-sin a, cos a)` where `a = rotation * (Math.PI / 180)` (name the per-degree radian constant or reuse a core angle helper; do not import the editor's `DEG_TO_RAD`). Return `position +/- (width/2)*alongUnit +/- (depth/2)*acrossUnit` in a fixed winding order. Export from `core/index.ts`. Optionally have `editor/plan/draw-furniture.ts` `furnitureSymbol` reuse this in a later refactor; do not change it in this `feat`.
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker.
- [ ] **Commit:** `test:` / `feat: compute a furniture footprint's rotated corners` / refactor.

### Cycle 6.2: furniture scene nodes

- [ ] **Step 1 (test):** In `scene-graph.test.ts`, `deriveSceneGraph` of a project with one placed piece yields one `FurnitureSceneNode` with `id === 'furniture:' + instanceId`, the floor id, `elevationZ`, `height`, and `footprintCorners` equal to `furnitureFootprintCorners(position, rotation, footprint)`. In `scene-graph-for-floor.test.ts`, `sceneGraphForFloor` keeps only the active floor's furniture and the empty graph has `furniture: []`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add `FURNITURE_NODE_PREFIX`, `FurnitureSceneNode`, `deriveFurnitureNode` (compute `footprintCorners` from the instance), `deriveFurnitureNodesForFloor`, `furniture: FurnitureSceneNode[]` on `SceneGraph`, and `furniture: project.floors.flatMap(deriveFurnitureNodesForFloor)` in `deriveSceneGraph`. Add `furniture: []` to `emptyGraph` and `furniture: graph.furniture.filter(onFloor(floorId))` in `sceneGraphForFloor`. Export the type and prefix from `core/index.ts`. Run `grep -rln "underlays: \[\]" core engine bridge editor --include='*.ts' --include='*.tsx'` and add `furniture: []` to every source-file `SceneGraph` literal it finds (the test-author handles test-file literals in this cycle's RED).
- [ ] **Step 4:** Gate. The typecheck pass surfaces every remaining `SceneGraph` literal without `furniture`; finish them. Expect PASS.
- [ ] **Step 5 (refactor):** Marker, or lift the rotated-corner math in `draw-furniture.ts` onto the new helper while the 2D furniture tests stay green.
- [ ] **Commit:** `test:` / `feat: derive furniture scene nodes` / refactor.

## Task 7: The engine builds a furniture massing box

**Files:** Modify `engine/materials/material-provider.ts`, `engine/index.ts`. Create `engine/scene/furniture-builder.ts` (+ `.test.ts`).

- [ ] **Step 1 (test):** `furniture-builder.test.ts`: `buildFurnitureMassing(node, new NeutralMaterialProvider())` returns a `THREE.Group` whose `userData.entityId` is the raw instance id (no `furniture:` prefix); whose world-space bounding box spans the footprint in x and z and `[elevationZ, elevationZ + height]` in y; and whose meshes use a material named `'furniture'`. Build the node from `deriveFurnitureNode` so the corners are real.
- [ ] **Step 2:** Run `pnpm exec vitest run engine/scene/furniture-builder.test.ts`; expect FAIL.
- [ ] **Step 3 (feat):** Add `'furniture'` to the `SurfaceRole` union. Create `buildFurnitureMassing`: extrude `node.footprintCorners` from `base = node.elevationZ` to `top = node.elevationZ + node.height` through `geometryFromSections` (mirror `junction-fill-builder.ts`: base cap, top cap wound from signed area, one side quad per edge), all vertices through `planToWorld`, the mesh material `materials.material('furniture')`. Set `group.name = node.id` and `group.userData.entityId = node.id.slice(FURNITURE_NODE_PREFIX.length)`; comment the prefix split. Export from `engine/index.ts`.
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Clean any duplicated section-building against the junction/wall prism helpers; keep functions under 40 lines.
- [ ] **Commit:** `test:` / `feat: build a furniture massing box` / refactor.

## Task 8: Furniture joins both build paths

**Files:** Modify `engine/scene/floor-subgroups.ts` (+ `.test.ts`), `engine/scene/build-scene.ts` (+ `.test.ts`), `engine/index.ts`.

- [ ] **Step 1 (test):** In `floor-subgroups.test.ts`, `buildFurnitureSubgroup(node, materials)` returns a group that contains the box mesh, an edge-overlay child (line segments), and meshes flagged `castShadow`. In `build-scene.test.ts`, `buildScene` of a graph with one furniture node adds a descendant whose `userData.entityId` is the raw instance id.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add `buildFurnitureSubgroup` (mirror `buildOpeningSubgroup`: `buildFurnitureMassing` + `addEdgeOverlay` + `markShadowCasters`). In `build-scene.ts` `buildFloorGroup`, filter `graph.furniture` by the floor model id and `group.add(buildFurnitureMassing(node, materials))` for each (alongside the openings loop). Export `buildFurnitureSubgroup`.
- [ ] **Step 4:** Gate; expect PASS.
- [ ] **Step 5 (refactor):** Marker.
- [ ] **Commit:** `test:` / `feat: render furniture in the built scene` / refactor.

## Task 9: The reconciler reuses furniture boxes

**Files:** Modify `bridge/react/framed-scene-reconciler.ts` (+ `.test.ts` / `framed-scene-reconciler-reuse.test.ts`).

- [ ] **Step 1 (test):** In the reuse test file, reconciling twice with the same furniture node reference keeps the same box group (captured before the second reconcile, per the capture-before lesson [[three-dimensional-wall-shell-resume]]); a new furniture node reference for the same id rebuilds the box. Mirror the opening reuse test.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3 (feat):** Add `furniture: FurnitureSceneNode[]` to `FloorEntities` and the `floorEntities` filter; add `furniture: Map<string, SubgroupBuild<FurnitureSceneNode>>` to `CachedFloorBuild`; add `reuseOrBuildFurniture(node, materials, prev)` (reuse when `cached.node === node`, mirror `reuseOrBuildOpening`); build the furniture `subgroupMap` in `buildFloorBuild` and include its groups in the `frameFloor` sub-group list. Keep `buildFloorBuild` under 40 lines (extract a sub-group assembly helper if needed).
- [ ] **Step 4:** Gate; expect PASS, including the existing reconciler reuse suite.
- [ ] **Step 5 (refactor):** Clean the assembly helper; marker otherwise.
- [ ] **Commit:** `test:` / `feat: reuse unchanged furniture boxes across edits` / refactor.

## Task 10: A scene-webgl baseline shows the box

**Files:** Modify `bridge/react/scene-harness-view.tsx`, `e2e/tests/scene-visual-regression.spec.ts`. Create the darwin baseline PNG.

- [ ] **Step 1:** Add `furniture: []` to the `SHELL_FIXTURE` and `JUNCTION_FIXTURE` literals (Task 6's typecheck already forced this if these are typed; confirm). Add a `FURNITURE_FIXTURE`: the four-wall shell plus one `FurnitureSceneNode` (build it with `deriveFurnitureNode` against a placed instance, or write the node literal with `footprintCorners` from `furnitureFootprintCorners`), a roughly 1200 by 600 by 750 mm box centered in the room at elevation 0. Add it to `HARNESS_FIXTURES` as `furniture`.
- [ ] **Step 2:** Add a test to `scene-visual-regression.spec.ts`: `await captureShell(page, '&scene=furniture', 'scene-furniture-webgl.png')`.
- [ ] **Step 3:** Generate the darwin baseline on this machine: `pnpm build && pnpm exec playwright test --project=scene-webgl --update-snapshots`. Confirm `e2e/tests/scene-visual-regression.spec.ts-snapshots/scene-furniture-webgl-scene-webgl-darwin.png` appears and the box is visible in the room.
- [ ] **Step 4:** Re-run `pnpm exec playwright test --project=scene-webgl` (no update) and confirm all scene baselines, including the new one, pass. CI runs `--project=chromium` only, so this darwin-only baseline is CI-safe (the home and scene baselines are darwin-only by the same convention).
- [ ] **Commit:** one `test(e2e): show a furniture massing box in the scene baseline` commit (exempt from the RGB sequence; may touch the harness source and the spec together).

## Task 11: Decision record, follow-up issue, final verification

**Files:** Create `docs/knowledge/decisions/ADR-0094-furniture-massing-in-3d.md`. Modify the ADR-0044 status note.

- [ ] **Step 1 (docs):** Write ADR-0094: the massing box (footprint corners extruded between elevation and elevation-plus-height, neutral `'furniture'` role, raw-id tag for selection), the per-instance `height` field and the `v10 -> v11` migration, and the decision to render massing before real geometry. Cross-link ADR-0044, ADR-0092, ADR-0093, and note the real-geometry follow-up. Humanize the prose (specs and ADRs are human-read; no em-dashes, no AI-vocab). Add a one-line status note to ADR-0044 that furniture massing shipped and real geometry is tracked separately. Commit `docs: record the furniture massing decision (ADR-0094)`.
- [ ] **Step 2 (issue):** File the #175b follow-up issue: "Assets: render real furniture geometry in the 3D preview" describing the GLB loader (read asset bytes from the content cache, parse, normalize origin and scale to the instance box, swap the box for the model, loading and failure fallback), linked to #175 and ADR-0044, on the assets-and-furniture track. Note that the massing box and the per-instance `height` are the scale-to-box target it builds on.
- [ ] **Step 3 (verify):** On Node 22 run, checking each real exit code: `pnpm typecheck`, `pnpm lint` (0 errors, no net-new warnings), `pnpm format:check`, `pnpm exec vitest run`, `pnpm build`, `pnpm rgb:audit origin/main..HEAD` (clean), `pnpm exec playwright test --project=chromium` (journeys green), `pnpm exec playwright test --project=scene-webgl` (scene baselines green incl. furniture). Record the counts.

---

## Self-review

- **Spec coverage:** massing box (Tasks 6 to 8), at position/rotation/elevation with height (Tasks 1, 6, 7), neutral surface and edge line and shadows (Tasks 7, 8), height carried through model with placement default and inspector edit and migration (Tasks 1 to 5), threads like openings through scene graph / builder / reconciler / both build paths (Tasks 6, 8, 9), 3D selection in step with the plan via the raw-id tag (Task 7 contract, exercised by the existing generic pick and outline), camera includes furniture (automatic via `sceneBounds`, no task needed), testing including the scene baseline (Task 10), deferred real geometry tracked (Task 11 issue and ADR). All spec sections map to a task.
- **Placeholder scan:** no TBD or "handle edge cases"; each cycle names its test and its implementation. The two ripples (height literal, `SceneGraph.furniture`) carry explicit grep commands and a role split.
- **Type consistency:** `FurnitureInstance.height`, `LibraryItem.height`, `FurnitureSceneNode.{footprintCorners, elevationZ, height}`, `furnitureFootprintCorners`, `setFurnitureHeight`, `FURNITURE_NODE_PREFIX`, `buildFurnitureMassing`, and `buildFurnitureSubgroup` are used under one name throughout. The mesh `userData.entityId` is the raw id everywhere selection reads it.
