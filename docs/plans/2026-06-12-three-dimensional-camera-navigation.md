# Three-Dimensional Camera Navigation Implementation Plan

> **For agentic workers:** This plan is executed from the main thread with the
> project's role-separated red-green-blue subagents (test-author for RED,
> implementer for GREEN, clean-code-reviewer then refactorer for BLUE). Each cycle
> is committed test -> feat -> refactor from the main thread; the subagents do not
> commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live three-dimensional pane navigable: orbit, pan, and zoom via
`OrbitControls` behind an engine facade, a hand-rolled first-person walk mode (WASD
plus pointer-lock mouse-look at eye height), and a reset-to-framed-view control,
all as per-view session state.

**Architecture:** The Three.js `OrbitControls` is constructed in `engine/` behind a
plain facade so `bridge/` never imports `three` (rules.md rule 1). The walk
movement is pure vector math in `core/` (Node-testable, like `frameSceneCamera`).
The `bridge/` React-Three-Fiber wrappers wire either to the live camera and own the
DOM input. The pane owns a small per-view navigation state (mode, userControlled)
that is session-only: never in the model, never in undo, not persisted.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber` 9, `three` 0.184
(`OrbitControls` from `three/examples/jsm`, typed by `@types/three`), Vitest +
`@testing-library/react` for units, Playwright `scene-webgl` project for the
semantic visual tier.

---

## Background the executor needs

- **Layer rule (rules.md rule 1):** `engine/` is the only layer that imports the
  `three` package. `bridge/` may touch Three.js scene state through R3F hooks
  (`useThree`, `useFrame`) but must not `import 'three'`. `core/` imports neither
  React nor Three.js.
- **Existing camera pieces:**
  - `core/scene/camera-framing.ts`: `frameSceneCamera(bounds)` and
    `DEFAULT_CAMERA_POSE`, returning a `CameraPose { position, target, near, far }`
    with `Vector3 = { x, y, z }` (`core/scene/vector3.ts`).
  - `bridge/react/framed-scene.ts`: `buildFramedScene(graph) -> { root, pose }`.
  - `bridge/react/webgpu-scene-view.tsx`: the live pane. It builds the framed
    scene, mounts an R3F `Canvas`, and applies the pose through a `FrameCamera`
    effect that mutates the camera directly. This file is modified by this plan.
  - `bridge/react/scene-canvas.tsx`: renders `WebGPUSceneView` when WebGPU is
    available, otherwise an accessible fallback. Not modified.
- **Coverage-excluded glue (foundation 6.3):** R3F components that only run under a
  real rendering context (`WebGPUSceneView` and the two new control wrappers) are
  not unit-tested by mounting a `Canvas`; their behavior is proven by the
  `scene-webgl` semantic e2e tier. Their testable logic (the walk math, the orbit
  facade, the toolbar) is unit-tested directly.
- **Semantic e2e pattern:** `e2e/tests/scene-live-view.spec.ts` settles the canvas
  to a stable frame (two consecutive identical screenshots), performs a gesture,
  settles again, and asserts the frames differ. New navigation e2e tests reuse this
  `stableFrame` shape. They live in `e2e/tests/scene-*.spec.ts`, which the
  Playwright config routes to the GPU `scene-webgl` project, and self-skip without
  WebGPU.
- **Running the gate e2e:** the Playwright `webServer` runs `pnpm preview` on port 4173. Kill any stale 4173 listener and rebuild before the scene-webgl run, since
  it serves the built bundle, not the dev server.

## File structure

Created:

- `core/scene/walk-camera.ts` - `WalkState`, `WalkInput`, `advanceWalk`,
  `walkLookTarget`, and the eye-height/speed/pitch/look-distance constants. Pure,
  no Three.js.
- `core/scene/walk-camera.test.ts` - Node tests for the walk math.
- `engine/scene/orbit-controls.ts` - `OrbitController` interface and
  `createOrbitController(camera, domElement)`. Only this slice's `three/examples`
  importer.
- `engine/scene/orbit-controls.test.ts` - jsdom test against a real camera.
- `bridge/react/scene-nav-toolbar.tsx` - `NavMode` type and the `SceneNavToolbar`
  DOM component (orbit/walk toggle + reset). Plain `<button>`s, no `three`, no
  editor imports.
- `bridge/react/scene-nav-toolbar.test.tsx` - jsdom component test.
- `bridge/react/orbit-camera-controls.tsx` - R3F wrapper over the engine facade
  (glue).
- `bridge/react/walk-camera-controls.tsx` - R3F wrapper over the core walk math
  with pointer-lock and key/pointer listeners (glue).
- `e2e/tests/scene-navigation.spec.ts` - orbit-drag and walk-key semantic tests.

Modified:

- `core/index.ts` - export the walk-camera public API.
- `engine/index.ts` - export `createOrbitController` and `OrbitController`.
- `bridge/react/webgpu-scene-view.tsx` - add the navigation state, render the
  toolbar above the canvas in a flex column, mount both control wrappers, and gate
  `FrameCamera` on `userControlled`.

---

## Task 1: Walk movement math (core)

**Files:**

- Create: `core/scene/walk-camera.ts`
- Test: `core/scene/walk-camera.test.ts`

- [ ] **Step 1: Write the failing test (RED)**

Create `core/scene/walk-camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { advanceWalk, WALK_EYE_HEIGHT_MM, WALK_SPEED_MM_PER_S } from './walk-camera'
import type { WalkInput, WalkState } from './walk-camera'

const STILL: WalkInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  yawDelta: 0,
  pitchDelta: 0,
}

function atOrigin(): WalkState {
  return { position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 }, yaw: 0, pitch: 0 }
}

describe('advanceWalk movement', () => {
  it('moves forward along -Z at yaw 0, scaled by walk speed and dt', () => {
    const next = advanceWalk(atOrigin(), { ...STILL, forward: true }, 1)
    expect(next.position.x).toBeCloseTo(0, 5)
    expect(next.position.z).toBeCloseTo(-WALK_SPEED_MM_PER_S, 5)
  })

  it('strafes right along +X at yaw 0', () => {
    const next = advanceWalk(atOrigin(), { ...STILL, right: true }, 1)
    expect(next.position.x).toBeCloseTo(WALK_SPEED_MM_PER_S, 5)
    expect(next.position.z).toBeCloseTo(0, 5)
  })

  it('moves back along +Z and left along -X', () => {
    const back = advanceWalk(atOrigin(), { ...STILL, back: true }, 1)
    expect(back.position.z).toBeCloseTo(WALK_SPEED_MM_PER_S, 5)
    const left = advanceWalk(atOrigin(), { ...STILL, left: true }, 1)
    expect(left.position.x).toBeCloseTo(-WALK_SPEED_MM_PER_S, 5)
  })

  it('keeps the vertical position pinned at eye height while moving', () => {
    const next = advanceWalk(atOrigin(), { ...STILL, forward: true, right: true }, 0.5)
    expect(next.position.y).toBe(WALK_EYE_HEIGHT_MM)
  })

  it('normalizes diagonal movement so it is not faster than a single axis', () => {
    const next = advanceWalk(atOrigin(), { ...STILL, forward: true, right: true }, 1)
    const distance = Math.hypot(next.position.x, next.position.z)
    expect(distance).toBeCloseTo(WALK_SPEED_MM_PER_S, 5)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: FAIL (cannot resolve `./walk-camera`).

- [ ] **Step 3: Write the minimal implementation (GREEN)**

Create `core/scene/walk-camera.ts`:

```ts
import type { Vector3 } from './vector3'

/** Eye height above the floor datum for walk mode, in millimeters. */
export const WALK_EYE_HEIGHT_MM = 1700

/** Walking speed in millimeters per second. */
export const WALK_SPEED_MM_PER_S = 3000

/** The session state of the first-person walk camera. */
export interface WalkState {
  /** World position; `y` stays pinned to eye height above the floor datum. */
  position: Vector3
  /** Heading about the vertical axis, in radians. Yaw 0 faces -Z. */
  yaw: number
  /** Look elevation in radians; clamped away from straight up and down. */
  pitch: number
}

/** One frame of walk input: held movement keys plus pointer look deltas. */
export interface WalkInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  yawDelta: number
  pitchDelta: number
}

/**
 * Advances the walk camera by one frame. Held movement keys move the camera on the
 * horizontal plane relative to its heading at a fixed speed scaled by the frame
 * time; the vertical position stays at eye height. This step ignores the look
 * deltas (added in the look task).
 */
export function advanceWalk(state: WalkState, input: WalkInput, dtSeconds: number): WalkState {
  const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0)
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  // Forward unit vector at this heading is (sin yaw, 0, -cos yaw); right is its
  // horizontal perpendicular (cos yaw, 0, sin yaw).
  let dx = Math.sin(state.yaw) * forward + Math.cos(state.yaw) * strafe
  let dz = -Math.cos(state.yaw) * forward + Math.sin(state.yaw) * strafe
  const magnitude = Math.hypot(dx, dz)
  if (magnitude > 0) {
    const step = (WALK_SPEED_MM_PER_S * dtSeconds) / magnitude
    dx *= step
    dz *= step
  }
  return {
    position: {
      x: state.position.x + dx,
      y: state.position.y,
      z: state.position.z + dz,
    },
    yaw: state.yaw,
    pitch: state.pitch,
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: BLUE review and refactor**

Dispatch the clean-code-reviewer on the diff, then the refactorer if it has
actionable findings. Keep tests green. If no actionable findings, an empty refactor
marker commit closes the cycle.

- [ ] **Step 6: Commit the cycle (test -> feat -> refactor)**

The test file and implementation are committed as the RED then GREEN of one cycle.
Stage and commit them in order from the main thread:

```bash
git add core/scene/walk-camera.test.ts
git commit -m "test: pin walk-camera horizontal movement at eye height"
git add core/scene/walk-camera.ts
git commit -m "feat: add walk-camera movement math in core"
git commit --allow-empty -m "refactor: no changes after walk-movement review"
```

---

## Task 2: Walk look (yaw, pitch, and clamp) (core)

**Files:**

- Modify: `core/scene/walk-camera.ts`
- Test: `core/scene/walk-camera.test.ts`

- [ ] **Step 1: Add the failing test (RED)**

Append to `core/scene/walk-camera.test.ts`:

```ts
import { MAX_WALK_PITCH_RAD } from './walk-camera'

describe('advanceWalk look', () => {
  const still: WalkInput = {
    forward: false,
    back: false,
    left: false,
    right: false,
    yawDelta: 0,
    pitchDelta: 0,
  }
  const start = (): WalkState => ({
    position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
    yaw: 0,
    pitch: 0,
  })

  it('adds the yaw delta to the heading', () => {
    const next = advanceWalk(start(), { ...still, yawDelta: 0.5 }, 0)
    expect(next.yaw).toBeCloseTo(0.5, 5)
  })

  it('adds the pitch delta', () => {
    const next = advanceWalk(start(), { ...still, pitchDelta: 0.25 }, 0)
    expect(next.pitch).toBeCloseTo(0.25, 5)
  })

  it('clamps pitch short of straight up and straight down', () => {
    const up = advanceWalk(start(), { ...still, pitchDelta: 10 }, 0)
    expect(up.pitch).toBeCloseTo(MAX_WALK_PITCH_RAD, 5)
    const down = advanceWalk(start(), { ...still, pitchDelta: -10 }, 0)
    expect(down.pitch).toBeCloseTo(-MAX_WALK_PITCH_RAD, 5)
    expect(MAX_WALK_PITCH_RAD).toBeLessThan(Math.PI / 2)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: FAIL (`MAX_WALK_PITCH_RAD` undefined; yaw/pitch deltas ignored).

- [ ] **Step 3: Implement yaw and pitch (GREEN)**

In `core/scene/walk-camera.ts`, add the constant near the others:

```ts
/** Pitch is clamped to just short of vertical so the view never flips. */
export const MAX_WALK_PITCH_RAD = Math.PI / 2 - 0.01
```

Replace the `yaw`/`pitch` passthrough at the end of `advanceWalk` with:

```ts
const pitch = Math.max(
  -MAX_WALK_PITCH_RAD,
  Math.min(MAX_WALK_PITCH_RAD, state.pitch + input.pitchDelta),
)
return {
  position: {
    x: state.position.x + dx,
    y: state.position.y,
    z: state.position.z + dz,
  },
  yaw: state.yaw + input.yawDelta,
  pitch,
}
```

Update the JSDoc on `advanceWalk` to drop the "ignores the look deltas" sentence.

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: PASS (all movement and look tests).

- [ ] **Step 5: BLUE review and refactor**

Dispatch clean-code-reviewer, then refactorer if actionable. Tests stay green.

- [ ] **Step 6: Commit the cycle**

```bash
git add core/scene/walk-camera.test.ts
git commit -m "test: pin walk-camera yaw and clamped pitch from look input"
git add core/scene/walk-camera.ts
git commit -m "feat: apply yaw and clamped pitch in walk-camera"
git commit --allow-empty -m "refactor: no changes after walk-look review"
```

---

## Task 3: Walk look target (core)

**Files:**

- Modify: `core/scene/walk-camera.ts`, `core/index.ts`
- Test: `core/scene/walk-camera.test.ts`

- [ ] **Step 1: Add the failing test (RED)**

Append to `core/scene/walk-camera.test.ts`:

```ts
import { walkLookTarget, WALK_LOOK_DISTANCE_MM } from './walk-camera'

describe('walkLookTarget', () => {
  it('projects a point ahead along -Z at yaw 0, pitch 0', () => {
    const target = walkLookTarget({
      position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
      yaw: 0,
      pitch: 0,
    })
    expect(target.x).toBeCloseTo(0, 5)
    expect(target.y).toBeCloseTo(WALK_EYE_HEIGHT_MM, 5)
    expect(target.z).toBeCloseTo(-WALK_LOOK_DISTANCE_MM, 5)
  })

  it('aims up when pitch is positive', () => {
    const target = walkLookTarget({
      position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
      yaw: 0,
      pitch: 0.5,
    })
    expect(target.y).toBeGreaterThan(WALK_EYE_HEIGHT_MM)
  })

  it('turns the aim with yaw', () => {
    const target = walkLookTarget({
      position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
      yaw: Math.PI / 2,
      pitch: 0,
    })
    expect(target.x).toBeCloseTo(WALK_LOOK_DISTANCE_MM, 5)
    expect(target.z).toBeCloseTo(0, 5)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: FAIL (`walkLookTarget` undefined).

- [ ] **Step 3: Implement walkLookTarget (GREEN)**

In `core/scene/walk-camera.ts`, add the constant and function:

```ts
/** How far ahead the walk camera looks when computing its lookAt target, in mm. */
export const WALK_LOOK_DISTANCE_MM = 1000

/** The world point the walk camera looks at, projected ahead along its heading and pitch. */
export function walkLookTarget(state: WalkState): Vector3 {
  const cosPitch = Math.cos(state.pitch)
  return {
    x: state.position.x + Math.sin(state.yaw) * cosPitch * WALK_LOOK_DISTANCE_MM,
    y: state.position.y + Math.sin(state.pitch) * WALK_LOOK_DISTANCE_MM,
    z: state.position.z - Math.cos(state.yaw) * cosPitch * WALK_LOOK_DISTANCE_MM,
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec vitest run core/scene/walk-camera.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the core barrel**

In `core/index.ts`, add beside the other `scene/` exports:

```ts
export {
  advanceWalk,
  walkLookTarget,
  WALK_EYE_HEIGHT_MM,
  WALK_SPEED_MM_PER_S,
  WALK_LOOK_DISTANCE_MM,
  MAX_WALK_PITCH_RAD,
} from './scene/walk-camera'
export type { WalkState, WalkInput } from './scene/walk-camera'
```

Run: `pnpm exec vitest run core/ && pnpm typecheck`
Expected: PASS / no type errors.

- [ ] **Step 6: BLUE review and refactor**

Dispatch clean-code-reviewer, then refactorer if actionable.

- [ ] **Step 7: Commit the cycle**

```bash
git add core/scene/walk-camera.test.ts
git commit -m "test: pin walk-camera look target projection"
git add core/scene/walk-camera.ts core/index.ts
git commit -m "feat: add walkLookTarget and export the walk-camera API"
git commit --allow-empty -m "refactor: no changes after walk look-target review"
```

---

## Task 4: Orbit controls facade (engine)

**Files:**

- Create: `engine/scene/orbit-controls.ts`
- Modify: `engine/index.ts`
- Test: `engine/scene/orbit-controls.test.ts`

- [ ] **Step 1: Write the failing test (RED)**

Create `engine/scene/orbit-controls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createOrbitController } from './orbit-controls'

describe('createOrbitController', () => {
  it('aims the camera at the target after setTarget', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 10_000)
    camera.position.set(0, 0, 100)
    const element = document.createElement('div')
    const controller = createOrbitController(camera, element)

    controller.setTarget({ x: 100, y: 0, z: 0 })

    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const expected = new THREE.Vector3(100, 0, -100).normalize()
    expect(direction.x).toBeCloseTo(expected.x, 4)
    expect(direction.y).toBeCloseTo(expected.y, 4)
    expect(direction.z).toBeCloseTo(expected.z, 4)

    controller.dispose()
  })

  it('toggles enablement and disposes without throwing', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 10_000)
    const element = document.createElement('div')
    const controller = createOrbitController(camera, element)

    expect(() => {
      controller.setEnabled(false)
      controller.setEnabled(true)
      controller.update()
      controller.dispose()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run engine/scene/orbit-controls.test.ts`
Expected: FAIL (cannot resolve `./orbit-controls`).

- [ ] **Step 3: Write the minimal implementation (GREEN)**

Create `engine/scene/orbit-controls.ts`:

```ts
import type { Camera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Vector3 } from '../../core'

/**
 * A view-layer-friendly handle on the orbit controls that hides the Three.js type,
 * so the bridge wrapper that holds it does not import `three` (rules.md rule 1).
 */
export interface OrbitController {
  /** Set the point the camera orbits around and re-apply the controls. */
  setTarget(target: Vector3): void
  /** Enable or disable the controls (disabled while walk mode drives the camera). */
  setEnabled(enabled: boolean): void
  /** Re-apply the controls to the camera (call after moving the camera externally). */
  update(): void
  /** Detach the controls' input listeners. */
  dispose(): void
}

/**
 * Constructs `OrbitControls` for the live camera and canvas, configured for
 * architectural navigation (rotate, pan, and zoom), and returns a plain facade.
 * The bridge owns the user-interaction detection through its own listeners, so the
 * facade stays a thin, testable wrapper over the controls.
 */
export function createOrbitController(camera: Camera, domElement: HTMLElement): OrbitController {
  const controls = new OrbitControls(camera, domElement)
  controls.enableRotate = true
  controls.enablePan = true
  controls.enableZoom = true
  return {
    setTarget(target: Vector3) {
      controls.target.set(target.x, target.y, target.z)
      controls.update()
    },
    setEnabled(enabled: boolean) {
      controls.enabled = enabled
    },
    update() {
      controls.update()
    },
    dispose() {
      controls.dispose()
    },
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec vitest run engine/scene/orbit-controls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Export from the engine barrel**

In `engine/index.ts`, add beside the other `scene/` exports:

```ts
export type { OrbitController } from './scene/orbit-controls'
export { createOrbitController } from './scene/orbit-controls'
```

Run: `pnpm typecheck`
Expected: no type errors (the import path resolves through `@types/three`).

- [ ] **Step 6: BLUE review and refactor**

Dispatch clean-code-reviewer, then refactorer if actionable. Confirm the
layer-boundary test still passes (`bridge/` does not import `three`; this file is in
`engine/`):

Run: `pnpm exec vitest run tests/architecture/layer-boundaries.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit the cycle**

```bash
git add engine/scene/orbit-controls.test.ts
git commit -m "test: pin the engine orbit-controls facade aiming the camera"
git add engine/scene/orbit-controls.ts engine/index.ts
git commit -m "feat: wrap OrbitControls behind an engine facade"
git commit --allow-empty -m "refactor: no changes after orbit-facade review"
```

---

## Task 5: Navigation toolbar (bridge)

**Files:**

- Create: `bridge/react/scene-nav-toolbar.tsx`
- Test: `bridge/react/scene-nav-toolbar.test.tsx`

- [ ] **Step 1: Write the failing test (RED)**

Create `bridge/react/scene-nav-toolbar.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'

afterEach(cleanup)

describe('SceneNavToolbar', () => {
  it('renders orbit, walk, and reset controls in a labeled toolbar', () => {
    render(<SceneNavToolbar mode="orbit" onModeChange={vi.fn()} onReset={vi.fn()} />)

    expect(screen.getByRole('toolbar', { name: /navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
  })

  it('marks the active mode button as pressed', () => {
    render(<SceneNavToolbar mode="walk" onModeChange={vi.fn()} onReset={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a mode change when a mode button is clicked', async () => {
    const onModeChange = vi.fn()
    render(<SceneNavToolbar mode="orbit" onModeChange={onModeChange} onReset={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Walk' }))

    expect(onModeChange).toHaveBeenCalledWith('walk')
  })

  it('reports a reset when the reset button is clicked', async () => {
    const onReset = vi.fn()
    render(<SceneNavToolbar mode="orbit" onModeChange={vi.fn()} onReset={onReset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run bridge/react/scene-nav-toolbar.test.tsx`
Expected: FAIL (cannot resolve `./scene-nav-toolbar`).

- [ ] **Step 3: Write the minimal implementation (GREEN)**

Create `bridge/react/scene-nav-toolbar.tsx`:

```tsx
/** The navigation mode of the three-dimensional pane. Per-view session state. */
export type NavMode = 'orbit' | 'walk'

interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
}

/**
 * The navigation chrome over the three-dimensional canvas: an orbit/walk mode
 * toggle and a reset-to-framed-view button. Plain DOM buttons (no `three`, no
 * editor imports) so they are keyboard reachable and announce their pressed state.
 */
export function SceneNavToolbar({ mode, onModeChange, onReset }: SceneNavToolbarProps) {
  return (
    <div role="toolbar" aria-label="3D navigation" className="scene-nav-toolbar">
      <button type="button" aria-pressed={mode === 'orbit'} onClick={() => onModeChange('orbit')}>
        Orbit
      </button>
      <button type="button" aria-pressed={mode === 'walk'} onClick={() => onModeChange('walk')}>
        Walk
      </button>
      <button type="button" onClick={onReset}>
        Reset view
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec vitest run bridge/react/scene-nav-toolbar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: BLUE review and refactor**

Dispatch clean-code-reviewer, then refactorer if actionable.

- [ ] **Step 6: Commit the cycle**

```bash
git add bridge/react/scene-nav-toolbar.test.tsx
git commit -m "test: pin the 3D navigation toolbar buttons and pressed state"
git add bridge/react/scene-nav-toolbar.tsx
git commit -m "feat: add the 3D navigation toolbar"
git commit --allow-empty -m "refactor: no changes after nav-toolbar review"
```

---

## Task 6: Orbit wrapper, pane wiring, and the orbit e2e (bridge)

This cycle's RED is the orbit semantic e2e, committed as `test:` (an e2e that is a
cycle's RED is committed `test:`, not `test(e2e):`, so rgb:audit sees a RED before
the GREEN). The GREEN adds the orbit wrapper, the per-view navigation state, the
toolbar wiring, and the auto-framing-yields change to `FrameCamera`.

**Files:**

- Create: `bridge/react/orbit-camera-controls.tsx`, `e2e/tests/scene-navigation.spec.ts`
- Modify: `bridge/react/webgpu-scene-view.tsx`

- [ ] **Step 1: Write the failing e2e (RED)**

Create `e2e/tests/scene-navigation.spec.ts`:

```ts
import { test, expect, type Locator } from '@playwright/test'

// Exercises the live three-dimensional pane's navigation (orbit drag and walk
// keys). Runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there) and self-skips without WebGPU, because the live pane
// renders through the WebGPU backend. The assertion is semantic, not a pixel
// baseline (the WebGPU render is not pixel-stable, ADR-0045): it settles the canvas
// to a stable frame, performs a gesture, settles again, and requires a change.

async function stableFrame(canvas: Locator): Promise<Buffer> {
  let last = await canvas.screenshot()
  await expect
    .poll(
      async () => {
        const next = await canvas.screenshot()
        const steady = next.equals(last)
        last = next
        return steady
      },
      { message: 'waiting for the live 3D canvas to reach a stable frame' },
    )
    .toBe(true)
  return last
}

async function drawnSceneCanvas(page: import('@playwright/test').Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  // Draw a closed-ish set of walls so the framed scene has geometry to orbit.
  await plan.click({ position: { x: 100, y: 120 } })
  await plan.click({ position: { x: 320, y: 120 } })
  await plan.click({ position: { x: 320, y: 260 } })
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Walls: \d/)).toBeVisible()

  const pane = page.getByRole('region', { name: /3d preview/i })
  const canvas = pane.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(200)
  return canvas
}

test.describe('Live three-dimensional navigation', () => {
  test('orbit drag changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const before = await stableFrame(canvas)

    const box = await canvas.boundingBox()
    if (box === null) throw new Error('canvas has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 })
    await page.mouse.up()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Rebuild and run the scene-webgl project (kill any stale preview server first):

```bash
lsof -ti :4173 | xargs kill -9 2>/dev/null || true
pnpm build
pnpm exec playwright test --project scene-webgl scene-navigation.spec.ts
```

Expected: FAIL (no orbit controls yet, so the drag does not change the frame), or
self-skip if this machine lacks WebGPU. If it self-skips, proceed; the gate run on a
WebGPU machine is where this gates.

- [ ] **Step 3: Write the orbit wrapper (GREEN part 1)**

Create `bridge/react/orbit-camera-controls.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { createOrbitController, type OrbitController } from '../../engine'
import type { Vector3 } from '../../core'

interface OrbitCameraControlsProps {
  enabled: boolean
  target: Vector3
  onUserControl: () => void
}

/**
 * Wires the engine orbit facade to the live camera and canvas. Holds the facade,
 * not an `OrbitControls` instance, so this file does not import `three`. Marks the
 * camera as user-controlled on the first pointer interaction through a listener it
 * owns on the canvas. Coverage-excluded glue (foundation 6.3); proven by the
 * scene-webgl navigation e2e.
 */
export function OrbitCameraControls({ enabled, target, onUserControl }: OrbitCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)

  useEffect(() => {
    const controller: OrbitController = createOrbitController(camera, domElement)
    const markControlled = () => onUserControl()
    domElement.addEventListener('pointerdown', markControlled)
    return () => {
      domElement.removeEventListener('pointerdown', markControlled)
      controller.dispose()
    }
    // The controller is bound to this camera and canvas for the pane's lifetime.
  }, [camera, domElement, onUserControl])

  // Target and enablement change with the framed pose and the active mode, so they
  // are applied through a controller kept on a ref-like closure. Re-create cheaply
  // by re-running the binding effect is avoided; instead apply via a second effect.
  useEffect(() => {
    const controller = createOrbitController(camera, domElement)
    controller.setTarget(target)
    controller.setEnabled(enabled)
    return () => controller.dispose()
  }, [camera, domElement, target, enabled])

  return null
}
```

Note for the implementer: two `createOrbitController` calls attach two control
instances, which is wrong. Replace the body with a single controller held in a
`useRef`, created once in the binding effect, with separate effects calling
`setTarget`/`setEnabled` on the ref. The implementer writes that minimal correct
form; the shape above only shows the inputs and outputs. The reviewer must confirm
exactly one controller is constructed per mount and disposed on unmount.

- [ ] **Step 4: Wire the pane (GREEN part 2)**

Modify `bridge/react/webgpu-scene-view.tsx`. Change `FrameCamera` to apply the pose
only while the camera is not user-controlled:

```tsx
function FrameCamera({ pose, active }: { pose: CameraPose; active: boolean }) {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    if (!active) return
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.near = pose.near
    camera.far = pose.far
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
    camera.updateProjectionMatrix()
  }, [camera, pose, active])
  return null
}
```

Add navigation state and the toolbar to `WebGPUSceneView`, wrapping the existing
`Canvas` in a flex column so the canvas still fills the pane height:

```tsx
import { useCallback, useMemo, useState } from 'react'
import { SceneNavToolbar, type NavMode } from './scene-nav-toolbar'
import { OrbitCameraControls } from './orbit-camera-controls'

export function WebGPUSceneView() {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const graph = useMemo(
    () => sceneGraphForFloor(rawGraph, activeFloorId),
    [rawGraph, activeFloorId],
  )
  const { root, pose } = useMemo(() => buildFramedScene(graph), [graph])

  const [mode, setMode] = useState<NavMode>('orbit')
  const [userControlled, setUserControlled] = useState(false)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
  const resetView = useCallback(() => setUserControlled(false), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SceneNavToolbar mode={mode} onModeChange={setMode} onReset={resetView} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Canvas
          camera={{
            position: [pose.position.x, pose.position.y, pose.position.z],
            near: pose.near,
            far: pose.far,
          }}
          gl={(defaultProps) =>
            createSceneRenderer({ canvas: defaultProps.canvas as HTMLCanvasElement })
          }
        >
          <primitive key={root.uuid} object={root} />
          <FrameCamera pose={pose} active={!userControlled} />
          <OrbitCameraControls
            enabled={mode === 'orbit'}
            target={pose.target}
            onUserControl={markUserControlled}
          />
        </Canvas>
      </div>
    </div>
  )
}
```

(The walk wrapper is added in Task 7.)

- [ ] **Step 5: Run the unit gate and the orbit e2e (GREEN verify)**

```bash
pnpm typecheck
pnpm exec vitest run bridge/ core/ engine/
lsof -ti :4173 | xargs kill -9 2>/dev/null || true
pnpm build
pnpm exec playwright test --project scene-webgl scene-navigation.spec.ts
pnpm exec playwright test --project scene-webgl scene-live-view.spec.ts
```

Expected: unit tests PASS; the orbit e2e PASSES on a WebGPU machine (the drag now
changes the frame); the live-view regression still PASSES (auto-framing still fires
before any interaction). Both e2e self-skip without WebGPU.

- [ ] **Step 6: BLUE review and refactor**

Dispatch clean-code-reviewer on the diff. Watch for: exactly one orbit controller
per mount; `bridge/` not importing `three` (run the layer-boundaries test); the
flex wrapper not regressing the pane-height test. Run:

```bash
pnpm exec vitest run tests/architecture/layer-boundaries.test.ts
pnpm exec playwright test --project chromium three-d-preview-canvas.spec.ts
```

Then the refactorer if actionable.

- [ ] **Step 7: Commit the cycle**

```bash
git add e2e/tests/scene-navigation.spec.ts
git commit -m "test: require an orbit drag to change the live 3D frame"
git add bridge/react/orbit-camera-controls.tsx bridge/react/webgpu-scene-view.tsx
git commit -m "feat: orbit, pan, and zoom the live 3D camera with a nav toolbar"
git commit --allow-empty -m "refactor: no changes after orbit-wiring review"
```

---

## Task 7: Walk wrapper and the walk e2e (bridge)

This cycle's RED is the walk semantic e2e (committed `test:`). The GREEN adds the
walk wrapper and mounts it in the pane.

**Files:**

- Create: `bridge/react/walk-camera-controls.tsx`
- Modify: `e2e/tests/scene-navigation.spec.ts`, `bridge/react/webgpu-scene-view.tsx`

- [ ] **Step 1: Add the failing walk e2e (RED)**

Append a second test to `e2e/tests/scene-navigation.spec.ts` (reuse `stableFrame`
and `drawnSceneCanvas`):

```ts
test('a walk movement key changes the settled frame', async ({ page }) => {
  await page.goto('/')
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

  const canvas = await drawnSceneCanvas(page)

  // Enter walk mode: the camera drops to eye height (a deliberate takeover), so
  // settle after switching before capturing the baseline frame.
  await page.getByRole('button', { name: 'Walk' }).click()
  const standing = await stableFrame(canvas)

  // Movement keys act whenever walk mode is on; they do not depend on pointer
  // capture, which is unreliable headless. Hold W to walk forward.
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyW')

  const walked = await stableFrame(canvas)
  expect(walked.equals(standing)).toBe(false)
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
lsof -ti :4173 | xargs kill -9 2>/dev/null || true
pnpm build
pnpm exec playwright test --project scene-webgl scene-navigation.spec.ts
```

Expected: the walk test FAILS (no walk wrapper, so the camera does not move on
W), or self-skips without WebGPU. The orbit test still passes.

- [ ] **Step 3: Write the walk wrapper (GREEN part 1)**

Create `bridge/react/walk-camera-controls.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  advanceWalk,
  walkLookTarget,
  WALK_EYE_HEIGHT_MM,
  type WalkInput,
  type WalkState,
} from '../../core'

const LOOK_SENSITIVITY = 0.0025

interface WalkCameraControlsProps {
  enabled: boolean
  onUserControl: () => void
}

/**
 * Hand-rolled first-person walk: WASD movement (active whenever walk mode is on)
 * plus pointer-lock mouse-look. Reads the pure walk math from core and applies the
 * result to the live camera each frame. Coverage-excluded glue (foundation 6.3);
 * proven by the scene-webgl navigation e2e. The movement keys are decoupled from
 * pointer capture so the keyboard half works without a captured pointer.
 */
export function WalkCameraControls({ enabled, onUserControl }: WalkCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const stateRef = useRef<WalkState>({
    position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
    yaw: 0,
    pitch: 0,
  })
  const inputRef = useRef<WalkInput>({
    forward: false,
    back: false,
    left: false,
    right: false,
    yawDelta: 0,
    pitchDelta: 0,
  })

  // Seed the walk state from the current camera when walk mode turns on, and wire
  // the keyboard, click-to-capture, and pointer-look listeners.
  useEffect(() => {
    if (!enabled) return
    const forward = camera.getWorldDirection(/* see implementer note */ undefined as never)
    void forward
    // Implementer: derive yaw/pitch from the camera's world direction and set
    // stateRef to (camera.position.x, WALK_EYE_HEIGHT_MM, camera.position.z) with
    // that yaw/pitch, then onUserControl() (entering walk takes over the camera).

    const keyFlag = (code: string, down: boolean) => {
      const input = inputRef.current
      if (code === 'KeyW') input.forward = down
      else if (code === 'KeyS') input.back = down
      else if (code === 'KeyA') input.left = down
      else if (code === 'KeyD') input.right = down
      else return
      if (down) onUserControl()
    }
    const onKeyDown = (event: KeyboardEvent) => keyFlag(event.code, true)
    const onKeyUp = (event: KeyboardEvent) => keyFlag(event.code, false)
    const onClick = () => domElement.requestPointerLock()
    const onPointerMove = (event: PointerEvent) => {
      if (document.pointerLockElement !== domElement) return
      inputRef.current.yawDelta += -event.movementX * LOOK_SENSITIVITY
      inputRef.current.pitchDelta += -event.movementY * LOOK_SENSITIVITY
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    domElement.addEventListener('click', onClick)
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      domElement.removeEventListener('click', onClick)
      window.removeEventListener('pointermove', onPointerMove)
      if (document.pointerLockElement === domElement) document.exitPointerLock()
      // Reset transient input so a re-entry does not inherit stale held keys.
      inputRef.current = {
        forward: false,
        back: false,
        left: false,
        right: false,
        yawDelta: 0,
        pitchDelta: 0,
      }
    }
  }, [enabled, camera, domElement, onUserControl])

  useFrame((_, delta) => {
    if (!enabled) return
    const next = advanceWalk(stateRef.current, inputRef.current, delta)
    // Consume the per-frame look deltas so they are applied once.
    inputRef.current.yawDelta = 0
    inputRef.current.pitchDelta = 0
    stateRef.current = next
    camera.position.set(next.position.x, next.position.y, next.position.z)
    const look = walkLookTarget(next)
    camera.lookAt(look.x, look.y, look.z)
  })

  return null
}
```

Implementer note: replace the `getWorldDirection(... as never)` placeholder with a
real seed. Read the camera's world direction into a fresh object via the R3F
camera's `getWorldDirection` (it accepts a `THREE.Vector3`, but this file must not
import `three`; instead read `camera.getWorldDirection` into a target obtained from
R3F, or compute yaw from `camera.rotation`). The minimal correct approach that
avoids importing `three`: derive yaw and pitch from the camera's current forward via
`useThree`'s camera object, which exposes `getWorldDirection(target)` where `target`
can be any object with `x/y/z` and a `copy`/`set`; if that is awkward without a
`three` `Vector3`, seed yaw and pitch to face the framed target by computing the
horizontal heading from `(pose.target - camera.position)` passed in as a prop.
Prefer passing the framed `pose.target` and the camera position is read from the
camera; compute `yaw = atan2(dir.x, -dir.z)` and `pitch = clamp(asin(dir.y))`. The
test-author/implementer split here is glue, so keep it minimal and let the e2e prove
movement. Do not import `three` in this file (run the layer-boundaries test).

- [ ] **Step 4: Mount the walk wrapper (GREEN part 2)**

In `bridge/react/webgpu-scene-view.tsx`, import and mount it beside the orbit
wrapper inside the `Canvas`:

```tsx
import { WalkCameraControls } from './walk-camera-controls'
```

```tsx
          <OrbitCameraControls
            enabled={mode === 'orbit'}
            target={pose.target}
            onUserControl={markUserControlled}
          />
          <WalkCameraControls enabled={mode === 'walk'} onUserControl={markUserControlled} />
```

- [ ] **Step 5: Run the unit gate and the walk e2e (GREEN verify)**

```bash
pnpm typecheck
pnpm exec vitest run bridge/ core/ engine/
pnpm exec vitest run tests/architecture/layer-boundaries.test.ts
lsof -ti :4173 | xargs kill -9 2>/dev/null || true
pnpm build
pnpm exec playwright test --project scene-webgl scene-navigation.spec.ts
```

Expected: unit + layer-boundary tests PASS; both navigation e2e tests PASS on a
WebGPU machine (orbit drag and walk W each change the frame); self-skip otherwise.

- [ ] **Step 6: BLUE review and refactor**

Dispatch clean-code-reviewer. Watch for: no `three` import in the wrapper; the
per-frame look deltas consumed exactly once; listeners cleaned up on disable and
unmount; `eslint` function-length and magic-number rules (extract the key-code map
and sensitivity if flagged). Then the refactorer if actionable.

- [ ] **Step 7: Commit the cycle**

```bash
git add e2e/tests/scene-navigation.spec.ts
git commit -m "test: require a walk key to change the live 3D frame"
git add bridge/react/walk-camera-controls.tsx bridge/react/webgpu-scene-view.tsx
git commit -m "feat: first-person walk mode for the live 3D camera"
git commit --allow-empty -m "refactor: no changes after walk-wiring review"
```

---

## Task 8: Roadmap, knowledge index, and the full gate

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the roadmap**

In `ROADMAP.md`, update the three-dimensional preview track's "Camera navigation"
row to reflect that orbit, pan, zoom, walk, and reset have landed and that named
presets remain a follow-on. Find the row:

```
| 5. Camera navigation (presets, walk mode)  | -- | scoped |
```

Change it to two rows (the landed scope and the deferred presets), matching the
table's column widths:

```
| 5. Camera navigation (orbit, pan, zoom, walk, reset)  | <PR#>  | merged |
| 5b. Camera presets (top-down, elevations, from-door/window)  | --  | scoped |
```

Update the prose paragraph that lists merged slices to mention camera navigation,
and run the humanizer over any reworded prose (ROADMAP.md is human-read; rule 17).

- [ ] **Step 2: Regenerate the local knowledge index**

```bash
pnpm knowledge:index
```

(The generated `INDEX.md`/`index.json` are gitignored; this only refreshes the
local cache so `/knowledge` finds ADR-0064.)

- [ ] **Step 3: Run the full local gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build
pnpm rgb:audit
```

Expected: all green; `rgb:audit` clean over `main..HEAD` (each cycle is
test -> feat -> refactor; the navigation e2e tests were committed `test:` as their
cycles' RED).

- [ ] **Step 4: Run the GPU e2e tree (after a rebuild)**

```bash
lsof -ti :4173 | xargs kill -9 2>/dev/null || true
pnpm build
pnpm exec playwright test --project chromium
pnpm exec playwright test --project scene-webgl
```

Expected: chromium tree green (including `three-d-preview-canvas.spec.ts`);
scene-webgl green (the harness baseline `scene-shell-webgl` unchanged, the live-view
and navigation specs pass) or self-skipping where WebGPU is unavailable.

- [ ] **Step 5: Commit the roadmap and finalize**

```bash
git add ROADMAP.md
git commit -m "docs: mark camera navigation landed in the roadmap"
```

Then ask the user for a commit-timestamp window (they kept real times on PR #93),
push, and open the PR.

---

## Self-review checklist (run before execution)

- **Spec coverage:** orbit/pan/zoom (Tasks 4, 6), walk (Tasks 1-3, 7), reset (Task
  6 `FrameCamera` gating + toolbar), per-view session state (Task 6 state), no
  persistence/collision/presets (out of scope, not built), toolbar accessibility
  (Task 5), auto-framing-yields (Task 6), testing tiers (unit Tasks 1-5, semantic
  e2e Tasks 6-7), unchanged harness baseline (no harness edits). All covered.
- **Layer boundaries:** `core/scene/walk-camera.ts` imports only `./vector3`;
  `engine/scene/orbit-controls.ts` is the only `three/examples` importer;
  `bridge/` wrappers import from `../../core` and `../../engine` and R3F, never
  `three`. Verified by `tests/architecture/layer-boundaries.test.ts` in Tasks 4, 6, 7.
- **Type consistency:** `WalkState`/`WalkInput`/`advanceWalk`/`walkLookTarget` names
  match across core and the walk wrapper; `OrbitController`/`createOrbitController`
  match across engine and the orbit wrapper; `NavMode`/`SceneNavToolbar` props match
  across the toolbar, its test, and the pane.
- **Glue caveats:** the orbit wrapper must construct exactly one controller per
  mount (the plan flags the two-call placeholder for the implementer to collapse to
  a `useRef`); the walk wrapper must seed yaw/pitch without importing `three` (the
  plan flags the placeholder). Both are confirmed by the reviewer and the e2e.
