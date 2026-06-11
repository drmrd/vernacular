# Three-Dimensional Render Harness and Conventions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan is executed by the orchestrating (main) thread dispatching the project's role-separated red-green-blue subagents (`test-author`, `implementer`, `refactorer`) one behavior at a time. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the testing foundation and the pinned coordinate, datum, and winding conventions for the three-dimensional preview track, so every later slice lands against a reviewed visual baseline and one fixed set of conventions rather than eyeballed, per-slice choices.

**Architecture:** Two test tiers. (1) Pure-core helpers in `core/scene/` (plan-to-world mapping, loop winding, vertical datum spans, the camera-framing helper, and the curve-capable contour types), unit-tested in Node with no graphics context. (2) Engine-layer geometry and scene-tree assertion helpers in `engine/testing/`, plus a WebGPU-capable Playwright visual harness that boots the app against a fixed fixture and compares the rendered three-dimensional canvas to a committed, human-reviewed baseline, self-skipping where WebGPU is unavailable. This slice is the foundation referenced by `docs/specs/2026-06-09-three-dimensional-preview-foundation.md` sections 2, 3.2, 6, and 7 (slice 0).

**Tech Stack:** TypeScript, Three.js (`three` and `three/webgpu`), React Three Fiber, Vitest (Node unit tests), Playwright (end-to-end visual regression with built-in perceptual screenshot comparison). No new dependencies (a 30-day cooldown applies).

---

## Scope and conventions inherited from the foundation spec

- Axes (section 2.1): the plan world is screen-style y-down; Three.js is right-handed, Y-up. A plan point `(x, y)` at vertical height `v` maps to world `(x, v, y)` (plan `x` to world `X`, plan `y` to world `Z`, vertical is world `Y`). The map is orientation-flipping, so one winding convention is fixed here.
- Datum (section 2.2): the finished-floor surface is the floor group local `Y = 0`. A wall base is `Y = 0`, its top `Y = height`. A floor slab top is flush at `Y = 0` and its thickness extends to negative `Y`.
- Units (section 2.3): world units are millimeters throughout, no scale factor.
- Camera framing (section 2.3): a pure helper takes axis-aligned bounds and returns camera position, target, `near`, and `far` (`near` a small fraction of the bounds diagonal, `far` a few multiples of it). An empty or degenerate scene returns a fixed default framing centered at the origin, never a NaN pose.
- Contour (section 3.2): a contour is an ordered, closed list of `line` or exact `arc` segments in a local two-dimensional frame, never pre-tessellated. Slice 0 introduces the types only; the rectangle generator lands in slice 2. Hole winding is opposite the outer-loop winding.

### Out of scope for slice 0 (named so it is not silently assumed)

- Any wall, opening, floor-slab, or ceiling geometry (slices 1, 2, 4). Slice 0 pins the loop-winding rule and the plan-to-world map that those slices inherit; it does not build meshes.
- The exact wall-exterior-face normal assertion (it needs a wall context and a mesher; slice 1 asserts it against these conventions).
- The rectangle void-contour generator (slice 2).
- A deterministic software-rasterizer continuous-integration path (a follow-on; see foundation spec section 9). Slice 0 self-skips the visual harness where WebGPU is unavailable, exactly as the existing two-dimensional baseline self-skips where no platform baseline exists.

---

## File structure

**New pure-core modules (no React, no Three.js):**

- `core/scene/vector3.ts` - the `Vector3` value type `{ x, y, z }` and `Bounds3 { min, max }`, used by the world-space helpers. Re-exported from `core/index.ts`.
- `core/scene/plan-to-world.ts` - `planToWorld(point, height)`; the single source of the axis mapping (section 2.1).
- `core/scene/winding.ts` - `signedArea`, `loopOrientation`, `canonicalOuterLoop`, `canonicalHoleLoop`, and `loopWorldNormal` (Newell normal after `planToWorld`); pins the winding convention (sections 2.1, 3.2).
- `core/scene/vertical-datum.ts` - `wallVerticalSpan(height)` and `floorSlabVerticalSpan(thickness)`; pins the datum (section 2.2).
- `core/scene/camera-framing.ts` - `frameSceneCamera(bounds)`, `DEFAULT_CAMERA_POSE`, and the `CameraPose` type; the framing helper with empty-scene fallback (section 2.3).
- `core/scene/contour.ts` - the `Contour` and `ContourSegment` types (section 3.2), type-only this slice.

**New engine test-support module (imports Three.js; not shipped in the production bundle):**

- `engine/testing/geometry-assertions.ts` - `readPositions`, `readNormals`, `readIndex`, `materialGroups` over a `THREE.BufferGeometry`, and scene-tree helpers `findByEntityId(root, id)` and `collectEntityIds(root)` over a built `SceneRoot` (section 6.1).
- `engine/testing/index.ts` - barrel for the testing helpers.

**New end-to-end visual harness and fixture:**

- `e2e/tests/scene-visual-regression.spec.ts` - boots the app against a fixed fixture, waits for the three-dimensional pane to settle, screenshots the canvas, compares to a committed baseline, self-skips where WebGPU is unavailable.
- `e2e/fixtures/scene-harness-project.ts` (or a query-param hook in the app) - the deterministic fixture project the harness loads. The mechanism is chosen in Task 7 after reading how the app currently boots a project.
- `e2e/tests/scene-visual-regression.spec.ts-snapshots/` - the committed, reviewed baseline image(s).

**Modified (additive only):**

- `core/index.ts` - re-export the new `core/scene/` public symbols. (Shared-file coordination risk: the old-house vocabulary and assets tracks may also touch this barrel; keep additions to a contiguous block and expect a merge.)
- `playwright.config.ts` - add a WebGPU-capable project with the verified launch flags (Task 1).

---

## Task 1: Verify and configure a WebGPU-capable Playwright runner

This is the gating prerequisite (foundation spec section 6.2). It is an empirical verification plus a config change, not a unit red-green-blue cycle. The orchestrator runs the verification directly because it depends on this machine's GPU and on Playwright's launched browser, which a Node unit test cannot exercise.

**Files:**

- Modify: `playwright.config.ts`
- Scratch (not committed): a throwaway probe spec under `e2e/tests/` deleted after verification.

- [ ] **Step 1: Install dependencies and the Playwright browser in this worktree**

Run (in the worktree root):

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Expected: install completes honoring the lockfile; Chromium downloads.

- [ ] **Step 2: Probe whether Chromium under Playwright exposes a working WebGPU device on this machine**

Write a throwaway probe `e2e/tests/webgpu-probe.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('chromium exposes a usable WebGPU adapter', async ({ page }) => {
  await page.goto('about:blank')
  const report = await page.evaluate(async () => {
    if (!('gpu' in navigator)) return { hasGpu: false as const }
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
    return { hasGpu: true as const, hasAdapter: adapter !== null }
  })
  expect(report.hasGpu).toBe(true)
  expect(report).toMatchObject({ hasAdapter: true })
})
```

Run it against Chromium while trying launch-flag sets, in this order, stopping at the first that passes:

```bash
# Attempt A: new headless + unsafe WebGPU + GPU in tests
pnpm exec playwright test e2e/tests/webgpu-probe.spec.ts --project=chromium
```

The flags are supplied via the config in Step 3; iterate the config's `launchOptions.args` across these candidates and re-run:

1. `['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-gpu-in-tests']` with `headless: false` (headed).
2. `['--enable-unsafe-webgpu', '--use-angle=metal', '--use-gpu-in-tests']`, `channel: 'chromium'`, new headless (`headless: true`, Playwright's Chromium uses new headless by default).
3. Headed (`headless: false`) with `['--enable-unsafe-webgpu']` only.

Record which candidate first yields `hasAdapter: true`. If none do on this machine, that is a real finding: document it (Step 5) and have the harness self-skip here, exactly as the two-dimensional baseline self-skips on platforms with no committed baseline. Do not fake a pass.

- [ ] **Step 3: Add the verified WebGPU project to `playwright.config.ts`**

Add a dedicated project (leave the existing `chromium`, `firefox`, `webkit` projects untouched so the two-dimensional suite is unchanged). Example shape, with `<VERIFIED_ARGS>` and `<VERIFIED_HEADLESS>` replaced by the Step 2 result:

```ts
{
  name: 'webgpu',
  testMatch: /scene-visual-regression\.spec\.ts/,
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: {
      headless: <VERIFIED_HEADLESS>,
      args: <VERIFIED_ARGS>,
    },
  },
},
```

Constrain the existing three projects with `testIgnore: /scene-visual-regression\.spec\.ts/` so only the `webgpu` project runs the three-dimensional harness.

- [ ] **Step 4: Re-run the probe through the named project to confirm**

Run:

```bash
pnpm exec playwright test e2e/tests/webgpu-probe.spec.ts --project=webgpu
```

Expected: PASS (`hasAdapter: true`) if this machine is WebGPU-capable; otherwise a clean skip path is confirmed.

- [ ] **Step 5: Delete the probe; record the outcome**

Remove `e2e/tests/webgpu-probe.spec.ts`. Note the verified flag set (or the negative result) in the slice-0 ADR drafted at the end of the slice, so the runner decision is durable.

- [ ] **Step 6: Commit the config**

```bash
git add playwright.config.ts
git commit -m "test(e2e): add a WebGPU-capable Playwright project for the three-dimensional harness"
```

---

## Task 2: `planToWorld` axis mapping (convention, section 2.1)

**Files:**

- Create: `core/scene/vector3.ts`
- Create: `core/scene/plan-to-world.ts`
- Test: `core/scene/plan-to-world.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { planToWorld } from './plan-to-world'

describe('planToWorld', () => {
  it('maps plan (x, y) at height v to world (x, v, y)', () => {
    expect(planToWorld({ x: 3, y: 7 }, 2700)).toEqual({ x: 3, y: 2700, z: 7 })
  })

  it('places a point on the finished floor at world Y = 0', () => {
    expect(planToWorld({ x: -1, y: 4 }, 0)).toEqual({ x: -1, y: 0, z: 4 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run core/scene/plan-to-world.test.ts`
Expected: FAIL with "Cannot find module './plan-to-world'".

- [ ] **Step 3: Minimal implementation**

`core/scene/vector3.ts`:

```ts
/** A point in Three.js world space: right-handed, Y-up, millimeters. */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/** An axis-aligned bounding box in world space. */
export interface Bounds3 {
  min: Vector3
  max: Vector3
}
```

`core/scene/plan-to-world.ts`:

```ts
import type { Point } from '../model/types'
import type { Vector3 } from './vector3'

/**
 * Maps a plan point (screen-style y-down) at vertical height `height` into
 * Three.js world space (right-handed, Y-up): plan x to world X, plan y to world
 * Z, height to world Y. This is the single source of the axis mapping; every
 * three-dimensional consumer goes through it (foundation spec section 2.1).
 */
export function planToWorld(point: Point, height: number): Vector3 {
  return { x: point.x, y: height, z: point.y }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run core/scene/plan-to-world.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `core/index.ts` (additive block):

```ts
export type { Vector3, Bounds3 } from './scene/vector3'
export { planToWorld } from './scene/plan-to-world'
```

Run `pnpm typecheck` then:

```bash
git add core/scene/vector3.ts core/scene/plan-to-world.ts core/scene/plan-to-world.test.ts core/index.ts
git commit -m "feat(core): map plan coordinates into Three.js world space"
```

---

## Task 3: Loop winding convention (sections 2.1, 3.2)

Pins the single winding convention so floor faces point up (`+Y`) after the plan-to-world flip, and holes wind opposite to outer loops. Pure math (Newell's method); no Three.js.

**Files:**

- Create: `core/scene/winding.ts`
- Test: `core/scene/winding.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import type { Point } from '../model/types'
import { signedArea, canonicalOuterLoop, canonicalHoleLoop, loopWorldNormal } from './winding'

// A unit square in the plan frame, listed counter-clockwise in screen y-down.
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

describe('loop winding convention', () => {
  it('computes a signed area whose sign encodes orientation', () => {
    expect(signedArea(square)).toBeCloseTo(1, 10)
    expect(signedArea([...square].reverse())).toBeCloseTo(-1, 10)
  })

  it('orients a floor outer loop so its world normal points up (+Y) after planToWorld', () => {
    const outer = canonicalOuterLoop(square)
    const normal = loopWorldNormal(outer, 0)
    expect(normal.y).toBeGreaterThan(0)
    expect(Math.abs(normal.x)).toBeLessThan(1e-9)
    expect(Math.abs(normal.z)).toBeLessThan(1e-9)
  })

  it('winds a hole opposite to the canonical outer loop', () => {
    const outer = canonicalOuterLoop(square)
    const hole = canonicalHoleLoop(square)
    expect(Math.sign(signedArea(hole))).toBe(-Math.sign(signedArea(outer)))
  })

  it('is idempotent: re-canonicalizing an already-canonical loop is a no-op in orientation', () => {
    const outer = canonicalOuterLoop(square)
    expect(Math.sign(signedArea(canonicalOuterLoop(outer)))).toBe(Math.sign(signedArea(outer)))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run core/scene/winding.test.ts`
Expected: FAIL with "Cannot find module './winding'".

- [ ] **Step 3: Minimal implementation**

`core/scene/winding.ts`:

```ts
import type { Point } from '../model/types'
import { planToWorld } from './plan-to-world'
import type { Vector3 } from './vector3'

/** Shoelace signed area in the plan frame. Positive and negative encode the
 *  two orientations; the absolute value is the polygon area. */
export function signedArea(loop: Point[]): number {
  let sum = 0
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] as Point
    const b = loop[(i + 1) % loop.length] as Point
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Newell's-method normal of the loop after mapping it to world space at
 *  `height`. For a horizontal floor loop this is +/- world Y. */
export function loopWorldNormal(loop: Point[], height: number): Vector3 {
  const world = loop.map((p) => planToWorld(p, height))
  const normal: Vector3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < world.length; i += 1) {
    const a = world[i] as Vector3
    const b = world[(i + 1) % world.length] as Vector3
    normal.x += (a.y - b.y) * (a.z + b.z)
    normal.y += (a.z - b.z) * (a.x + b.x)
    normal.z += (a.x - b.x) * (a.y + b.y)
  }
  return normal
}

/** The canonical outward winding for a floor or face outer loop: oriented so
 *  its world normal points up (+Y) after planToWorld (foundation spec 2.1). */
export function canonicalOuterLoop(loop: Point[]): Point[] {
  return loopWorldNormal(loop, 0).y >= 0 ? loop : [...loop].reverse()
}

/** A hole is wound opposite the canonical outer loop, matching THREE.Shape
 *  hole expectations (foundation spec 3.2). */
export function canonicalHoleLoop(loop: Point[]): Point[] {
  return [...canonicalOuterLoop(loop)].reverse()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run core/scene/winding.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `core/index.ts`:

```ts
export { signedArea, loopWorldNormal, canonicalOuterLoop, canonicalHoleLoop } from './scene/winding'
```

```bash
git add core/scene/winding.ts core/scene/winding.test.ts core/index.ts
git commit -m "feat(core): pin the world-up winding convention for scene loops"
```

---

## Task 4: Vertical datum spans (section 2.2)

**Files:**

- Create: `core/scene/vertical-datum.ts`
- Test: `core/scene/vertical-datum.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { wallVerticalSpan, floorSlabVerticalSpan } from './vertical-datum'

describe('vertical datum', () => {
  it('places a wall base at local Y = 0 and its top at Y = height', () => {
    expect(wallVerticalSpan(2700)).toEqual({ base: 0, top: 2700 })
  })

  it('flushes a floor slab top with the finished floor and extends thickness below', () => {
    expect(floorSlabVerticalSpan(150)).toEqual({ top: 0, bottom: -150 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run core/scene/vertical-datum.test.ts`
Expected: FAIL with "Cannot find module './vertical-datum'".

- [ ] **Step 3: Minimal implementation**

`core/scene/vertical-datum.ts`:

```ts
/** Local-Y span of a wall: base on the finished floor, top at its height
 *  (foundation spec section 2.2). */
export function wallVerticalSpan(height: number): { base: number; top: number } {
  return { base: 0, top: height }
}

/** Local-Y span of a floor slab: top flush with the finished floor (Y = 0),
 *  thickness extending below (foundation spec section 2.2). */
export function floorSlabVerticalSpan(thickness: number): { top: number; bottom: number } {
  return { top: 0, bottom: -thickness }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run core/scene/vertical-datum.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `core/index.ts`:

```ts
export { wallVerticalSpan, floorSlabVerticalSpan } from './scene/vertical-datum'
```

```bash
git add core/scene/vertical-datum.ts core/scene/vertical-datum.test.ts core/index.ts
git commit -m "feat(core): pin the vertical floor datum for walls and slabs"
```

---

## Task 5: Camera-framing helper with empty-scene fallback (section 2.3)

**Files:**

- Create: `core/scene/camera-framing.ts`
- Test: `core/scene/camera-framing.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import type { Bounds3 } from './vector3'
import { frameSceneCamera, DEFAULT_CAMERA_POSE } from './camera-framing'

const houseBounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10000, y: 2700, z: 8000 },
}

describe('frameSceneCamera', () => {
  it('targets the center of the bounds', () => {
    const pose = frameSceneCamera(houseBounds)
    expect(pose.target).toEqual({ x: 5000, y: 1350, z: 4000 })
  })

  it('derives near and far from the bounds diagonal so thin geometry does not z-fight', () => {
    const pose = frameSceneCamera(houseBounds)
    const diagonal = Math.hypot(10000, 2700, 8000)
    expect(pose.near).toBeGreaterThan(0)
    expect(pose.near).toBeLessThan(diagonal)
    expect(pose.far).toBeGreaterThan(diagonal)
    expect(pose.far / pose.near).toBeGreaterThan(100)
  })

  it('positions the camera away from the target so the bounds are in view', () => {
    const pose = frameSceneCamera(houseBounds)
    const dx = pose.position.x - pose.target.x
    const dy = pose.position.y - pose.target.y
    const dz = pose.position.z - pose.target.z
    expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(Math.hypot(10000, 2700, 8000) / 2)
    expect(pose.position.y).toBeGreaterThan(pose.target.y)
  })

  it('returns the fixed default pose for an empty scene (null bounds), never NaN', () => {
    expect(frameSceneCamera(null)).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('returns the fixed default pose for degenerate (zero-size) bounds', () => {
    const pose = frameSceneCamera({ min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } })
    expect(pose).toEqual(DEFAULT_CAMERA_POSE)
    expect(Number.isNaN(pose.near)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run core/scene/camera-framing.test.ts`
Expected: FAIL with "Cannot find module './camera-framing'".

- [ ] **Step 3: Minimal implementation**

`core/scene/camera-framing.ts`:

```ts
import type { Bounds3, Vector3 } from './vector3'

export interface CameraPose {
  position: Vector3
  target: Vector3
  near: number
  far: number
}

const NEAR_FRACTION = 0.01
const FAR_MULTIPLE = 4
const DEFAULT_DIAGONAL = 10000

/** Fixed framing for an empty or degenerate scene: centered at the origin with
 *  a valid (non-NaN) near and far derived from a default diagonal. */
export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: { x: DEFAULT_DIAGONAL, y: DEFAULT_DIAGONAL, z: DEFAULT_DIAGONAL },
  target: { x: 0, y: 0, z: 0 },
  near: DEFAULT_DIAGONAL * NEAR_FRACTION,
  far: DEFAULT_DIAGONAL * FAR_MULTIPLE,
}

/**
 * Derives a camera pose framing the given world bounds. `near` is a small
 * fraction of the bounds diagonal and `far` a few multiples of it, so a
 * ten-meter house with hundred-millimeter walls does not z-fight. An empty
 * (null) or zero-size scene returns the fixed default pose (foundation spec 2.3).
 */
export function frameSceneCamera(bounds: Bounds3 | null): CameraPose {
  if (bounds === null) return DEFAULT_CAMERA_POSE
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
  const diagonal = Math.hypot(size.x, size.y, size.z)
  if (diagonal === 0) return DEFAULT_CAMERA_POSE
  const target: Vector3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
  return {
    target,
    position: {
      x: target.x + diagonal,
      y: target.y + diagonal,
      z: target.z + diagonal,
    },
    near: diagonal * NEAR_FRACTION,
    far: diagonal * FAR_MULTIPLE,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run core/scene/camera-framing.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `core/index.ts`:

```ts
export type { CameraPose } from './scene/camera-framing'
export { frameSceneCamera, DEFAULT_CAMERA_POSE } from './scene/camera-framing'
```

```bash
git add core/scene/camera-framing.ts core/scene/camera-framing.test.ts core/index.ts
git commit -m "feat(core): frame the scene camera from bounds with an empty-scene fallback"
```

---

## Task 6: Curve-capable contour types (section 3.2)

Type-only this slice. A compile-checked construction test pins the shape so slice 2's rectangle generator and the later arc generators all author into one frame.

**Files:**

- Create: `core/scene/contour.ts`
- Test: `core/scene/contour.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import type { Point } from '../model/types'
import type { Contour } from './contour'

describe('Contour', () => {
  it('represents a closed rectangle in an opening local frame as line segments', () => {
    const start: Point = { x: -450, y: 0 }
    const rectangle: Contour = {
      start,
      segments: [
        { kind: 'line', to: { x: 450, y: 0 } },
        { kind: 'line', to: { x: 450, y: 2100 } },
        { kind: 'line', to: { x: -450, y: 2100 } },
        { kind: 'line', to: start },
      ],
    }
    expect(rectangle.segments).toHaveLength(4)
    expect(rectangle.segments.every((s) => s.kind === 'line')).toBe(true)
  })

  it('admits an exact arc segment as an additive variant', () => {
    const arc: Contour = {
      start: { x: -450, y: 2100 },
      segments: [
        { kind: 'arc', to: { x: 450, y: 2100 }, center: { x: 0, y: 2100 }, clockwise: false },
        { kind: 'line', to: { x: -450, y: 2100 } },
      ],
    }
    expect(arc.segments[0]?.kind).toBe('arc')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run core/scene/contour.test.ts`
Expected: FAIL with "Cannot find module './contour'".

- [ ] **Step 3: Minimal implementation**

`core/scene/contour.ts`:

```ts
import type { Point } from '../model/types'

/**
 * A segment of a closed contour in a local two-dimensional frame. Core emits
 * exact arcs; the engine owns tessellation and level of detail. The union is
 * open to further variants (elliptical, spline) additively (foundation spec 3.2).
 */
export type ContourSegment =
  | { kind: 'line'; to: Point }
  | { kind: 'arc'; to: Point; center: Point; clockwise: boolean }

/** An ordered, closed list of segments; the last segment closes back to start. */
export interface Contour {
  start: Point
  segments: ContourSegment[]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run core/scene/contour.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `core/index.ts`:

```ts
export type { Contour, ContourSegment } from './scene/contour'
```

```bash
git add core/scene/contour.ts core/scene/contour.test.ts core/index.ts
git commit -m "feat(core): add the curve-capable contour types for opening voids"
```

---

## Task 7: Node geometry and scene-tree assertion helpers (section 6.1)

Engine-layer test-support utilities so slice 1 onward asserts geometry (positions, normals, winding, material groups) and scene-tree identity (`userData.entityId`) without re-deriving Three.js internals each test. They live under `engine/testing/` and are exercised by a meta-test on hand-built geometry. Confirm in this task whether the existing coverage config excludes `engine/testing/`; if not, add it (test-only code is not production code).

**Files:**

- Create: `engine/testing/geometry-assertions.ts`
- Create: `engine/testing/index.ts`
- Test: `engine/testing/geometry-assertions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { readPositions, readNormals, materialGroups, findByEntityId, collectEntityIds } from '.'

describe('geometry assertion helpers', () => {
  it('reads vertex positions as flat triples from a BufferGeometry', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    )
    expect(readPositions(geometry)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ])
  })

  it('reads computed face normals', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3),
    )
    geometry.computeVertexNormals()
    const normals = readNormals(geometry)
    expect(normals).toHaveLength(3)
    expect(normals[0]?.y).toBeCloseTo(-1, 5)
  })

  it('reports material groups by start, count, and material index', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.addGroup(0, 3, 0)
    geometry.addGroup(3, 3, 1)
    expect(materialGroups(geometry)).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ])
  })

  it('finds an object by entityId and collects all entity ids in a built root', () => {
    const root = new THREE.Group()
    const child = new THREE.Group()
    child.userData.entityId = 'wall:1'
    root.add(child)
    expect(findByEntityId(root, 'wall:1')).toBe(child)
    expect(findByEntityId(root, 'missing')).toBeNull()
    expect(collectEntityIds(root)).toEqual(['wall:1'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run engine/testing/geometry-assertions.test.ts`
Expected: FAIL with "Cannot find module '.'" / missing exports.

- [ ] **Step 3: Minimal implementation**

`engine/testing/geometry-assertions.ts`:

```ts
import * as THREE from 'three'
import type { Vector3 } from '../../core'

function triples(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < attribute.count; i += 1) {
    out.push({ x: attribute.getX(i), y: attribute.getY(i), z: attribute.getZ(i) })
  }
  return out
}

export function readPositions(geometry: THREE.BufferGeometry): Vector3[] {
  const attribute = geometry.getAttribute('position')
  return attribute ? triples(attribute) : []
}

export function readNormals(geometry: THREE.BufferGeometry): Vector3[] {
  const attribute = geometry.getAttribute('normal')
  return attribute ? triples(attribute) : []
}

export function readIndex(geometry: THREE.BufferGeometry): number[] {
  return geometry.index ? Array.from(geometry.index.array) : []
}

export interface MaterialGroup {
  start: number
  count: number
  materialIndex: number
}

export function materialGroups(geometry: THREE.BufferGeometry): MaterialGroup[] {
  return geometry.groups.map((g) => ({
    start: g.start,
    count: g.count,
    materialIndex: g.materialIndex ?? 0,
  }))
}

export function findByEntityId(root: THREE.Object3D, entityId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((object) => {
    if (found === null && object.userData.entityId === entityId) found = object
  })
  return found
}

export function collectEntityIds(root: THREE.Object3D): string[] {
  const ids: string[] = []
  root.traverse((object) => {
    if (typeof object.userData.entityId === 'string') ids.push(object.userData.entityId)
  })
  return ids
}
```

`engine/testing/index.ts`:

```ts
export {
  readPositions,
  readNormals,
  readIndex,
  materialGroups,
  findByEntityId,
  collectEntityIds,
} from './geometry-assertions'
export type { MaterialGroup } from './geometry-assertions'
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run engine/testing/geometry-assertions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/testing/geometry-assertions.ts engine/testing/index.ts engine/testing/geometry-assertions.test.ts
git commit -m "test(engine): add geometry and scene-tree assertion helpers"
```

---

## Task 8: The visual render harness and reviewed baseline (section 6.2)

Boots the app against a deterministic fixture, waits for the three-dimensional pane to settle, screenshots the canvas, and compares to a committed baseline using Playwright's perceptual comparison. Self-skips where WebGPU is unavailable. The initial baseline is the current lit empty scene (slice 1 produces the first shell baseline).

**Files:**

- Create: `e2e/tests/scene-visual-regression.spec.ts`
- Create: the fixture hook (mechanism chosen in Step 1)
- Create (committed after review): `e2e/tests/scene-visual-regression.spec.ts-snapshots/`

- [ ] **Step 1: Decide the deterministic fixture mechanism**

Read how the app currently selects/loads a project (search `app/` and `bridge/` for the session/project bootstrap). Choose the lightest deterministic hook, preferring a URL query parameter the app already honors or a minimal added one (for example `/?fixture=scene-harness`) that seeds a fixed project. If no such hook exists, add a minimal, test-only seam in `app/` that loads a committed fixture when the query parameter is present, and nothing otherwise (no behavior change for normal users). Pin the canvas size and disable animation for determinism (the renderer renders a single static frame).

- [ ] **Step 2: Write the harness spec (self-skipping)**

```ts
import { test, expect } from '@playwright/test'

test.describe('Three-dimensional scene visual baseline', () => {
  test('renders the lit scene to a stable canvas', async ({ page }) => {
    await page.goto('/?fixture=scene-harness')
    const canvas = page.locator('canvas')
    // Skip cleanly where the runner has no WebGPU device, like the 2D baseline
    // self-skips where no platform baseline exists.
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'No WebGPU device on this runner; scene harness self-skips here.')
    await expect(canvas).toBeVisible()
    // Wait for the renderer to settle (one painted frame, no pending animation).
    await page.waitForTimeout(500)
    await expect(canvas).toHaveScreenshot('scene-empty.png')
  })
})
```

- [ ] **Step 3: Run against the WebGPU project; review the produced image**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/tests/scene-visual-regression.spec.ts --project=webgpu --update-snapshots=missing
```

Open the produced `scene-empty.png` and confirm by eye that it is a non-blank, lit render (the clear color of the WebGPU canvas, not a transparent or DOM-only frame). Per the regenerating-the-baseline note, `--update-snapshots=missing` writes only the absent baseline; review it before committing.

- [ ] **Step 4: Re-run to confirm the baseline matches deterministically**

Run:

```bash
pnpm exec playwright test e2e/tests/scene-visual-regression.spec.ts --project=webgpu
```

Expected: PASS within the configured perceptual tolerance.

- [ ] **Step 5: Commit the harness and the reviewed baseline**

```bash
git add e2e/tests/scene-visual-regression.spec.ts e2e/tests/scene-visual-regression.spec.ts-snapshots app
git commit -m "test(e2e): add the three-dimensional scene visual baseline harness"
```

---

## Task 9: Close the slice (knowledge and verification)

- [ ] **Step 1: Run the full check chain in the worktree**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. (The visual harness runs under `pnpm e2e`, separately, on a WebGPU-capable runner.)

- [ ] **Step 2: Draft the slice-0 ADR**

Record the durable decisions this slice made: the WebGPU-capable Playwright runner configuration and the verification outcome on this machine (Task 1), and the confirmation that the coordinate, datum, and winding conventions are now pinned by tests. Use the `adr` skill to scaffold, then have the `knowledge-curator` review and the orchestrator regenerate and re-propagate the local index.

- [ ] **Step 3: Confirm the red-green-blue sequence**

Run: `pnpm rgb:audit` (range `origin/main..HEAD`) to confirm each behavior landed as test then feat then refactor, with the `test(e2e)`/`build` exemptions honored.

---

## Self-review

- **Spec coverage:** WebGPU runner (Task 1), visual harness (Task 8), Node geometry + scene-tree helpers (Task 7), camera-framing helper with empty-scene fallback (Task 5), and the coordinate/datum/winding conventions (Tasks 2, 3, 4) and contour types (Task 6) all map to foundation spec sections 2.1, 2.2, 2.3, 3.2, 6.1, 6.2, and 7 (slice 0). The wall-exterior-face normal and the rectangle void generator are explicitly deferred to slices 1 and 2 against these conventions.
- **Placeholder scan:** Task 1 and Task 8 contain genuine empirical decision points (the verified flag set; the fixture mechanism) that cannot be pre-decided without running on this machine and reading the boot path; both give concrete candidate sets and a decision procedure rather than "TBD".
- **Type consistency:** `Vector3`/`Bounds3` (Task 2) are consumed by `winding.ts` (Task 3), `camera-framing.ts` (Task 5), and `geometry-assertions.ts` (Task 7); `CameraPose` (Task 5) and `Contour`/`ContourSegment` (Task 6) are used consistently; `planToWorld` (Task 2) is reused by `loopWorldNormal` (Task 3).
