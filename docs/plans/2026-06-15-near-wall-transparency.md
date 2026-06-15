# Plan: near-wall transparency (#122)

Spec: `docs/specs/2026-06-15-near-wall-transparency.md`
ADR: `ADR-0086-near-wall-transparency`
Branch: `feat/near-wall-transparency` (off origin/main 35ea7801, worktree `~/workspace/vernacular.wt/near-wall-transparency`)
Mode: LOW-BANDWIDTH / LOCAL-ONLY (plain `git commit`, no push/PR/GitHub).

## Design summary

Fade an exterior wall when the camera is on its outside. Three units.

1. **Pure core `core/scene/exterior-walls.ts`** `exteriorWalls(walls: WallSceneNode[], rooms: RoomSceneNode[]): ExteriorWall[]`
   where `ExteriorWall = { wallId: string; outwardNormal: Point }` (plan-space unit normal pointing outside).
   - For each wall: `normal` = unit left-normal of `start -> end`; `midpoint` = (start+end)/2.
   - `plus` = midpoint + normal\*(thickness/2 + EPS); `minus` = midpoint - normal\*(thickness/2 + EPS).
   - `plusInside` = some room's `clearPolygon` contains `plus` (use `pointInPolygon` from `core/geometry/polygon`); `minusInside` likewise.
   - Exterior iff exactly one side is inside: outwardNormal = the OUTSIDE side (`minusInside` -> +normal; `plusInside` -> -normal). Both-inside (partition) or both-outside (free-standing) -> not exterior.

2. **Engine `engine/scene/near-wall-transparency.ts`** (uses three; unit-tested on a built scene):
   - `cameraFacesWallOutside(cameraXZ, pointXZ, outwardNormalXZ): boolean` (pure): horizontal dot `(cx-px)\*nx + (cz-pz)\*nz > 0`.
   - `prepareNearWallTransparency(root, exterior: ExteriorWall[]): NearWallTarget[]`: for each exterior wall, find its mesh by `userData.entityId`, CLONE `mesh.material` (the per-face array) into private instances (so opacity animates independently; interior walls keep the shared cached materials), and record on the mesh (`userData.nearWall = { outwardNormal: {x,0,z}, point: {x, z} }` in world via `planToWorld`). Return the targets (mesh + world normal + world point).
   - `updateNearWallTransparency(targets, cameraPosition)`: for each target, if `cameraFacesWallOutside`, set every cloned material `transparent = true, opacity = FADED_OPACITY (0.1), depthWrite = false`; else `transparent = false, opacity = 1, depthWrite = true`.
   - Constants: `FADED_OPACITY = 0.1`, `FACE_SAMPLE_EPS` in core.

3. **Bridge wiring** (coverage-excluded glue): `bridge/react/framed-scene.ts` `buildFramedScene` runs `prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms))` and returns the targets on `FramedScene`. The live view (`webgpu-scene-view.tsx`) adds a `useFrame` component calling `updateNearWallTransparency(targets, camera.position)` each frame; the harness (`scene-harness-view.tsx`) applies it once for its fixed camera so the deterministic baseline shows the effect.

## Cycles (each: test -> feat -> refactor; commit from main thread)

1. **Core exterior walls.** RED (`core/scene/exterior-walls.test.ts`): a 4-wall rectangular room returns all four walls as exterior with outward normals pointing away from the room center; a wall with a room on both sides (partition) is not returned. GREEN (`core/scene/exterior-walls.ts` + barrel export). BLUE.
2. **Engine fade pass.** RED (`engine/scene/near-wall-transparency.test.ts`): `cameraFacesWallOutside` is true for a camera on the +normal side and false on the other; after `prepareNearWallTransparency` an exterior wall mesh has its OWN material array (not the provider's shared instance) and `userData.nearWall`; after `updateNearWallTransparency` with a camera outside one wall, that wall's materials are transparent (opacity 0.1, depthWrite false) and a wall the camera is inside of stays opaque. GREEN (`engine/scene/near-wall-transparency.ts` + engine barrel). BLUE.
3. **Build seam + live wiring.** RED (unit, `bridge/react/framed-scene.test.ts`): `buildFramedScene` of a single-room graph returns one `nearWallTargets` entry per exterior wall. GREEN: `framed-scene.ts` runs `prepareNearWallTransparency` and returns the targets; `webgpu-scene-view.tsx` adds a `NearWallFade` `useFrame` that calls `updateNearWallTransparency(targets, camera.position)` each frame. BLUE marker. (Local-only note: the deterministic harness is left unchanged so no per-platform visual baseline has to be regenerated in this mode; the rendered effect was confirmed by inspection and is deferred for a committed baseline, see the spec.)

## Gate (run in the worktree; LOCAL only)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit --range origin/main..HEAD` clean.
- e2e: chromium + scene-webgl (fresh build, kill stale 4173). No committed baselines change (the harness is left unchanged); the home darwin baseline drift is pre-existing (not refreshed).
- Real commit times. DO NOT push/PR/merge or touch GitHub.

## Notes / deferred (in the spec + ADR-0086)

- Front-facing (camera-side) trigger only, not occlusion ray-casting; binary fade at one opacity; exterior walls only; opening bodies not faded with their host wall; no user toggle.

## Subagent file scope (state exactly; STOP rather than edit shared config)

- Cycle 1: test `core/scene/exterior-walls.test.ts`; impl `core/scene/exterior-walls.ts` + `core/index.ts`.
- Cycle 2: test `engine/scene/near-wall-transparency.test.ts`; impl `engine/scene/near-wall-transparency.ts` + `engine/index.ts`.
- Cycle 3: test `bridge/react/framed-scene.test.ts`; wiring `bridge/react/framed-scene.ts` + `bridge/react/webgpu-scene-view.tsx`. No eslint/vite/tsconfig/playwright config edits.
