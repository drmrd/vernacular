# Plan: three-dimensional camera presets (#165)

Spec: `docs/specs/2026-06-14-three-dimensional-camera-presets.md`
ADR: `ADR-0083-three-dimensional-camera-presets`
Branch: `feat/three-dimensional-camera-presets` (off origin/main f3662a5a, worktree `~/workspace/vernacular.wt/three-dimensional-camera-presets`)

## Design summary

Named camera presets in the 3D nav toolbar. Pure pose math in core (reusing the
`camera-framing.ts` sphere-fit), applied to the live camera at the render edge like the
existing `FrameCamera` fit. No model/schema change; openings already carry the data.

### Axis map (from `core/scene/plan-to-world.ts`)

`planToWorld(point, height) = { x: point.x, y: height, z: point.y }`. Plan is drawn
y-down, so plan-north is the smaller world Z. Therefore: East = +X, West = -X,
South = +Z, North = -Z. Y is up.

### Core additions

`core/scene/camera-framing.ts` (extend, keep `frameSceneCamera` behavior byte-identical):

- `CameraPose` gains `up?: Vector3` (optional; absent means world +Y).
- `export function cameraFitDistance(diagonal: number, viewport?: CameraViewport): number`
  - no viewport: returns `diagonal` (loose fallback). viewport: returns the existing
    `fitDistance(diagonal / 2, viewport)` (sphere-to-frustum, the limiting half-angle).
  - `cameraOffset`'s viewport branch becomes `cameraFitDistance(diagonal, viewport) / Math.hypot(1,1,1)`; the no-viewport branch still returns `diagonal`. (Net: no behavior change to `frameSceneCamera`.)
- `export function cameraDepthRange(diagonal: number): { near: number; far: number }` = `{ near: diagonal * NEAR_FRACTION, far: diagonal * FAR_MULTIPLE }`; `frameSceneCamera` uses it too.

`core/scene/camera-presets.ts` (new):

- `export type CameraPreset = 'top' | 'north' | 'south' | 'east' | 'west'`
- Module table `PRESET_VIEW: Record<CameraPreset, { dir: Vector3; up: Vector3 }>` where `dir`
  is the unit center-to-camera direction:
  - `top`:   dir `(0, 1, 0)`,  up `(0, 0, -1)`
  - `north`: dir `(0, 0, -1)`, up `(0, 1, 0)`
  - `south`: dir `(0, 0, 1)`,  up `(0, 1, 0)`
  - `east`:  dir `(1, 0, 0)`,  up `(0, 1, 0)`
  - `west`:  dir `(-1, 0, 0)`, up `(0, 1, 0)`
- `export function cameraPresetPose(preset: CameraPreset, bounds: Bounds3 | null, viewport?: CameraViewport): CameraPose`
  - `bounds === null` or zero diagonal -> `DEFAULT_CAMERA_POSE`.
  - center = bounds midpoint; diagonal = hypot of bounds size; `distance = cameraFitDistance(diagonal, viewport)`.
  - position = center + dir * distance; target = center; `{ near, far } = cameraDepthRange(diagonal)`; up = table up.
- `export function doorwayPose(opening: OpeningSceneNode, bounds: Bounds3 | null, viewport?: CameraViewport): CameraPose`
  - `bounds === null` -> `DEFAULT_CAMERA_POSE`.
  - eye = `opening.sillHeight + opening.height * 0.5`; position = `planToWorld(opening.center, eye)`.
  - world normal = normalize(`opening.normal.x, 0, opening.normal.y`) (guard zero length).
  - inward = flip the world normal if `dot(normal, boundsCenter - position) < 0` (point toward the model center).
  - target = position + inward (unit step, horizontal so target.y === eye); up `(0,1,0)`; `{ near, far } = cameraDepthRange(diagonal)`.
- Export `CameraPreset`, `cameraPresetPose`, `doorwayPose` through `core/index.ts`.

### Bridge additions

`bridge/react/fit-camera.ts`:

- `FittableCamera` gains optional `up?: { set(x: number, y: number, z: number): void }`.
- `export function applyCameraPose(camera: FittableCamera, pose: CameraPose): void` -> sets
  position, near, far, up (`pose.up ?? {0,1,0}` via `camera.up?.set`), `lookAt(target)`, `updateProjectionMatrix()`.
- `fitCameraToBounds` also sets up from `pose.up ?? {0,1,0}` (resets to +Y after a top-down view; pose from `frameSceneCamera` has no up so it defaults to +Y).

`bridge/react/scene-nav-toolbar.tsx`:

- Props gain `onPreset: (preset: PresetChoice) => void` and `canDoorway: boolean`, where
  `PresetChoice = CameraPreset | 'doorway'` (define/export the union here).
- Add a `role="group" aria-label="Camera presets"` button group: Top down, North, South,
  East, West, Doorway (Doorway `disabled={!canDoorway}`). Extract a `CameraPresetButtons`
  subcomponent so each function stays under the 40-line limit.

`bridge/react/webgpu-scene-view.tsx`:

- `useSceneNavigation` gains `presetRequest: { preset: PresetChoice; nonce: number } | null`
  and `applyPreset(preset)` (sets `userControlled` true and bumps the nonce so re-clicking the
  same preset re-applies). `resetView` unchanged (clears userControlled; FrameCamera refits and resets up).
- Resolve the doorway opening: selected opening if a selected id is an opening, else
  `graph.openings[0] ?? null`; `canDoorway = resolvedOpening !== null`.
- New in-canvas `PresetCamera({ bounds, opening, request })`: on a new `request` (dep on the
  request object), compute the pose against the live viewport (`useThree` size + `camera.fov`,
  deg->rad) via `cameraPresetPose` / `doorwayPose` and `applyCameraPose(camera, pose)`. Glue,
  coverage-excluded; justify the single `react-hooks/exhaustive-deps` disable (fire only on
  request, not on size). Orbit target stays `pose.target` of the framed scene (unchanged).
- Wire `PresetCamera` into `LiveSceneCanvas` and the toolbar props through.

## Cycles (each: test -> feat -> refactor; commit from main thread)

1. **Core: `CameraPose.up` + top-down pose.** RED (test-author, `core/scene/camera-presets.test.ts`):
   `cameraPresetPose('top', bounds, viewport)` -> position above center (dir +Y), target = center,
   up = `(0,0,-1)`, near/far = `cameraDepthRange(diagonal)`, and the sphere fits the viewport
   (distance == `cameraFitDistance(diagonal, viewport)`); null/zero bounds -> `DEFAULT_CAMERA_POSE`.
   GREEN (implementer, `core/scene/camera-presets.ts` + `core/scene/camera-framing.ts` + `core/index.ts`).
   BLUE.
2. **Core: four elevations.** RED: each of north/south/east/west sits on the named world side at
   center height, target = center, up = +Y, position offset along the right axis by the fit distance.
   GREEN (camera-presets.ts). BLUE.
3. **Core: doorway pose.** RED (`core/scene/camera-presets.test.ts`): `doorwayPose(opening, bounds, viewport)`
   stands at `planToWorld(center, sill + height/2)`, looks along the inward normal (target.y == eye;
   direction points toward the bounds center, including when the raw normal points away), up = +Y, near/far
   from diagonal. GREEN. BLUE.
4. **Bridge: `applyCameraPose` + fit up-reset.** RED (`bridge/react/fit-camera.test.ts`, add or create):
   a fake `FittableCamera` capturing calls; `applyCameraPose` sets position/near/far/up/lookAt(target)/
   updateProjectionMatrix; a pose with `up` sets that up; `fitCameraToBounds` sets up to +Y. GREEN
   (`bridge/react/fit-camera.ts`). BLUE.
5. **Bridge UI: toolbar preset buttons.** RED (`bridge/react/scene-nav-toolbar.test.tsx`, RTL):
   the six preset buttons render; clicking each calls `onPreset` with the right tag; Doorway is
   disabled when `canDoorway` is false and enabled when true. GREEN (`scene-nav-toolbar.tsx`). BLUE
   (extract `CameraPresetButtons`).
6. **Bridge wiring + e2e.** RED (`e2e/tests/scene-camera-presets.spec.ts`, committed `test:`): in the
   scene-webgl project, draw a room with an opening, open the 3D view, read the accessibility-proxy
   positions, click "Top down", and assert at least one proxy moved past a threshold (camera moved);
   then click "Doorway" and assert another move. (Pin the threshold against a GREEN probe.) GREEN
   (`webgpu-scene-view.tsx` wiring; coverage-excluded glue). BLUE marker.

## Gate (run in the worktree)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit` clean on **origin/main..HEAD** (each cycle test->feat->refactor; e2e RED as `test:`)
- e2e: chromium project + scene-webgl project, after a fresh `pnpm build` and killing any stale 4173.
- Real commit times. Touches no shell/editor/app/css -> do NOT refresh the home darwin baseline.

## Notes / deferred (in the spec + ADR-0083)

- Perspective, not orthographic (axis-aligned perspective for top/elevations).
- Orbit target stays the model center after a preset (no target-lift plumbing).
- Top-down orbit-pole singularity (first drag after top-down may snap).
- Doorway near-plane can clip the jamb (room view is the point).
- No keyboard shortcuts / preset menu (toolbar buttons only).

## Subagent file scope (state exactly; STOP rather than edit shared config)

- test-author cycles 1-3: only `core/scene/camera-presets.test.ts`.
- implementer cycles 1-3: only `core/scene/camera-presets.ts`, `core/scene/camera-framing.ts`, `core/index.ts`.
- cycle 4: test in `bridge/react/fit-camera.test.ts`; impl in `bridge/react/fit-camera.ts`.
- cycle 5: test in `bridge/react/scene-nav-toolbar.test.tsx`; impl in `bridge/react/scene-nav-toolbar.tsx`.
- cycle 6: e2e in `e2e/tests/scene-camera-presets.spec.ts`; wiring in `bridge/react/webgpu-scene-view.tsx` (+ toolbar props already in place). No edits to eslint/vite/tsconfig/playwright config.
