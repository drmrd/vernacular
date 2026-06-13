# Three-Dimensional Lighting and Color Temperature Implementation Plan

> **For agentic workers:** This plan is executed from the main thread with the project's role-separated red-green-blue subagents (test-author for RED, implementer for GREEN, clean-code-reviewer + refactorer for BLUE). Subagents do not commit; the main thread commits each step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a color-temperature slider to the live three-dimensional pane that warms and cools the scene light, give the sun a percentage-closer soft shadow, and land the PaintMaterial stub at the material seam.

**Architecture:** The color temperature is per-view session state in the view layer. A pure `core/color/` helper turns kelvin into a linear-light color. The lights move out of `buildFramedScene` (which stays geometry only) into a bridge `<SceneLighting>` component that drives the engine `LightingProvider` and updates the light color on change, so the slider does not rebuild the shell. The visible warmth lives in the light (ADR-0065); the PaintMaterial stub carries the light color at the material seam without re-tinting. The sun casts a PCF soft shadow sized from the scene bounds; the renderer enables the shadow map.

**Tech Stack:** TypeScript, Three.js (engine only), React Three Fiber (bridge glue), Vitest (Node + jsdom), Playwright (`scene-webgl` GPU project).

**Authoritative docs:** spec `docs/specs/2026-06-13-three-dimensional-lighting-color-temperature.md`, decision `docs/knowledge/decisions/ADR-0065-three-dimensional-lighting-and-color-temperature.md`, foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md` (sections 5.2, 5.3, 5.4, 5.6, 6).

---

## Conventions for every cycle

- **RED** dispatches `test-author` (cannot read implementation source). Commit the failing test as `test: ...`. For the one end-to-end cycle, commit the spec as `test:` (not `test(e2e):`) so `rgb:audit` sees a RED before the glue GREEN.
- **GREEN** dispatches `implementer` (cannot read test files). Commit the minimal implementation as `feat: ...`.
- **BLUE** dispatches `clean-code-reviewer`, then `refactorer` for any actionable findings. Commit `refactor: ...`; if there are no findings, land an empty `refactor: ...` marker so every GREEN is closed before the next RED.
- Each subagent is told the exact allowed files and to STOP rather than touch shared config (`eslint.config.js`, `tsconfig`, `vite.config.ts`). The main thread owns barrels and cross-file wiring.
- After each GREEN, run the full unit suite (`pnpm test`), not just the target test, because shared-type edits can break sibling `toEqual`/`toMatchObject` assertions.
- Commits: Conventional Commits, no em-dash, no `Co-Authored-By`, author `Dan Moore <9156191+drmrd@users.noreply.github.com>` (verify `git config user.email`; pass `--author` if it differs). Plain `git commit` (clock is correct, no timestamp offset).
- Lint is zero-problems: watch `no-magic-numbers` (name constants; published-coefficient blocks use a scoped `eslint-disable` with a rationale), `no-nested-ternary`, `max-lines-per-function` (40), `max-params` (3).

## File structure

Created:

- `core/color/color-temperature.ts` plus `core/color/color-temperature.test.ts`
- `engine/lighting/lighting-rig.ts` plus `engine/lighting/lighting-rig.test.ts`
- `engine/scene/shadow-casters.ts` plus `engine/scene/shadow-casters.test.ts`
- `engine/materials/paint-material-provider.ts` plus `engine/materials/paint-material-provider.test.ts`
- `bridge/react/scene-lighting.tsx`
- `e2e/tests/scene-helpers.ts`
- `e2e/tests/scene-color-temperature.spec.ts`

Modified:

- `core/index.ts` (barrel), `engine/index.ts` (barrel)
- `engine/lighting/basic-lighting-provider.ts` plus its test (soft-shadow config, export `SUN_DIRECTION`)
- `engine/renderer/create-renderer.ts` (enable shadow map)
- `bridge/react/scene-nav-toolbar.tsx` plus its test (slider)
- `bridge/react/webgpu-scene-view.tsx` (color-temp state, mount `<SceneLighting>`)
- `bridge/react/framed-scene.ts` plus its test (return bounds, mark shadow casters, drop lighting, PaintMaterial default)
- `bridge/react/scene-harness-view.tsx` (mount `<SceneLighting>` at a fixed temperature, optional `colorTemperatureK` prop)
- `app/app.tsx` (pass an optional `temp` query parameter to the harness)
- `e2e/tests/scene-navigation.spec.ts` (import the shared helpers)
- `e2e/tests/scene-visual-regression.spec.ts` (default baseline refresh + warm baseline)
- `ROADMAP.md` (lighting row status)

---

## Task 0: Land the docs

- [ ] **Step 1: Commit spec, ADR, and this plan**

```bash
git add docs/specs/2026-06-13-three-dimensional-lighting-color-temperature.md \
        docs/knowledge/decisions/ADR-0065-three-dimensional-lighting-and-color-temperature.md \
        docs/plans/2026-06-13-three-dimensional-lighting-color-temperature.md
git commit -m "docs: spec, ADR-0065, and plan for three-dimensional lighting and color temperature"
```

- [ ] **Step 2: Flip the ROADMAP lighting row to in progress**

In `ROADMAP.md`, change the lighting row status cell from `scoped` to `in progress` (the row beginning `| 6. Lighting (color-temperature slider, soft shadows, paint-material stub)`). Commit:

```bash
git add ROADMAP.md
git commit -m "docs: mark lighting slice in progress in the roadmap"
```

- [ ] **Step 3: Regenerate the local knowledge index (gitignored)**

Run: `pnpm knowledge:index`
Expected: index regenerates with ADR-0065; nothing to commit (the index is gitignored).

---

## Task 1 (Cycle 1): Kelvin to linear-light color (pure core)

**Files:**

- Create: `core/color/color-temperature.ts`
- Test: `core/color/color-temperature.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: RED. Write the failing test** (`test-author`; allowed file `core/color/color-temperature.test.ts` only)

```ts
import { describe, it, expect } from 'vitest'
import {
  kelvinToLinearRgb,
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  DEFAULT_COLOR_TEMPERATURE_K,
} from './color-temperature'

describe('kelvinToLinearRgb', () => {
  it('warms toward red at the low end (r > g > b)', () => {
    const warm = kelvinToLinearRgb(MIN_COLOR_TEMPERATURE_K)
    expect(warm.r).toBeGreaterThan(warm.g)
    expect(warm.g).toBeGreaterThan(warm.b)
  })

  it('is close to a neutral white at the high end', () => {
    const cool = kelvinToLinearRgb(MAX_COLOR_TEMPERATURE_K)
    const lowestChannel = Math.min(cool.r, cool.g, cool.b)
    expect(lowestChannel).toBeGreaterThan(0.8)
  })

  it('raises the blue channel as the temperature rises', () => {
    const warm = kelvinToLinearRgb(3000)
    const mid = kelvinToLinearRgb(4500)
    const cool = kelvinToLinearRgb(6000)
    expect(mid.b).toBeGreaterThan(warm.b)
    expect(cool.b).toBeGreaterThan(mid.b)
  })

  it('normalizes the brightest channel to one at every temperature', () => {
    for (const kelvin of [2700, 3500, 5000, 6500]) {
      const rgb = kelvinToLinearRgb(kelvin)
      expect(Math.max(rgb.r, rgb.g, rgb.b)).toBeCloseTo(1, 5)
    }
  })

  it('clamps inputs outside the supported band', () => {
    expect(kelvinToLinearRgb(1000)).toEqual(kelvinToLinearRgb(MIN_COLOR_TEMPERATURE_K))
    expect(kelvinToLinearRgb(10000)).toEqual(kelvinToLinearRgb(MAX_COLOR_TEMPERATURE_K))
  })

  it('defaults to the cool end of the supported band', () => {
    expect(DEFAULT_COLOR_TEMPERATURE_K).toBe(MAX_COLOR_TEMPERATURE_K)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run core/color/color-temperature.test.ts`
Expected: FAIL (module `./color-temperature` not found).

- [ ] **Step 3: GREEN. Implement** (`implementer`; allowed files `core/color/color-temperature.ts`, `core/index.ts`)

```ts
import { srgbToLinear, type LinearRgb } from './oklab'

/** The supported color-temperature band (design specification 6.7). */
export const MIN_COLOR_TEMPERATURE_K = 2700
export const MAX_COLOR_TEMPERATURE_K = 6500
/** The neutral default: near-white daylight, so the scene opens close to the prior white baseline. */
export const DEFAULT_COLOR_TEMPERATURE_K = 6500

const MAX_CHANNEL = 255

function clampChannel(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/* eslint-disable no-magic-numbers -- Tanner Helland's published blackbody-to-sRGB
   approximation coefficients (the 100 scale, the 66/60/19 breakpoints, and the per-channel
   fit constants); a documented fit, not unexplained numbers. */
function redChannel(t: number): number {
  return t <= 66 ? MAX_CHANNEL : 329.698727446 * (t - 60) ** -0.1332047592
}

function greenChannel(t: number): number {
  return t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * (t - 60) ** -0.0755148492
}

function blueChannel(t: number): number {
  if (t >= 66) return MAX_CHANNEL
  if (t <= 19) return 0
  return 138.5177312231 * Math.log(t - 10) - 305.0447927307
}
/* eslint-enable no-magic-numbers */

/**
 * Converts a color temperature in kelvin to a linear-light color for a physically
 * shaded renderer. The input is clamped to the supported band, and the output is
 * normalized so the brightest channel is one, so warming the light changes its hue
 * without dimming the scene.
 */
export function kelvinToLinearRgb(kelvin: number): LinearRgb {
  const clamped = Math.min(MAX_COLOR_TEMPERATURE_K, Math.max(MIN_COLOR_TEMPERATURE_K, kelvin))
  const t = clamped / 100
  const srgb = {
    r: clampChannel(redChannel(t) / MAX_CHANNEL),
    g: clampChannel(greenChannel(t) / MAX_CHANNEL),
    b: clampChannel(blueChannel(t) / MAX_CHANNEL),
  }
  const linear = { r: srgbToLinear(srgb.r), g: srgbToLinear(srgb.g), b: srgbToLinear(srgb.b) }
  const peak = Math.max(linear.r, linear.g, linear.b)
  return { r: linear.r / peak, g: linear.g / peak, b: linear.b / peak }
}
```

Add to `core/index.ts` beside the other `./color/*` exports:

```ts
export {
  kelvinToLinearRgb,
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  DEFAULT_COLOR_TEMPERATURE_K,
} from './color/color-temperature'
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run core/color/color-temperature.test.ts`
Expected: PASS. Then `pnpm test` (whole suite) stays green.

- [ ] **Step 5: Commit RED then GREEN**

```bash
git add core/color/color-temperature.test.ts && git commit -m "test: kelvin to linear-light color conversion"
git add core/color/color-temperature.ts core/index.ts && git commit -m "feat: convert color temperature to a linear-light color in core"
```

- [ ] **Step 6: BLUE.** Dispatch `clean-code-reviewer` on the diff, then `refactorer` for findings. Commit `refactor: ...` (empty marker if none):

```bash
git commit --allow-empty -m "refactor: close color-temperature conversion cycle"
```

---

## Task 2 (Cycle 2): Lighting-rig color application and teardown (engine)

**Files:**

- Create: `engine/lighting/lighting-rig.ts`, `engine/lighting/lighting-rig.test.ts`
- Modify: `engine/index.ts`

- [ ] **Step 1: RED** (`test-author`; allowed file `engine/lighting/lighting-rig.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BasicLightingProvider } from './basic-lighting-provider'
import { setLightingColor, removeLighting } from './lighting-rig'

describe('setLightingColor', () => {
  it('tints the directional sun and the hemisphere sky to a linear color', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)

    setLightingColor(scene, { r: 1, g: 0.5, b: 0.25 })

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const hemisphere = scene.children.find(
      (child) => child instanceof THREE.HemisphereLight,
    ) as THREE.HemisphereLight
    const precision = 5
    expect(sun.color.r).toBeCloseTo(1, precision)
    expect(sun.color.g).toBeCloseTo(0.5, precision)
    expect(sun.color.b).toBeCloseTo(0.25, precision)
    expect(hemisphere.color.r).toBeCloseTo(1, precision)
    expect(hemisphere.color.g).toBeCloseTo(0.5, precision)
    expect(hemisphere.color.b).toBeCloseTo(0.25, precision)
  })
})

describe('removeLighting', () => {
  it('removes the lights an applied rig added, so a re-apply does not stack them', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)

    removeLighting(scene)

    expect(scene.children.some((child) => child instanceof THREE.DirectionalLight)).toBe(false)
    expect(scene.children.some((child) => child instanceof THREE.HemisphereLight)).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run engine/lighting/lighting-rig.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: GREEN** (`implementer`; allowed files `engine/lighting/lighting-rig.ts`, `engine/index.ts`)

```ts
import * as THREE from 'three'

import type { Bounds3, LinearRgb } from '../../core'

/**
 * Operations on a lighting rig already applied to a scene (see BasicLightingProvider).
 * The lights live on the persistent render scene, so the color and shadow update in
 * place when the color temperature or the scene bounds change, without a rebuild.
 */
function isRigLight(
  child: THREE.Object3D,
): child is THREE.DirectionalLight | THREE.HemisphereLight {
  return child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight
}

/** Tints the sun and the hemisphere sky to a linear-light color. */
export function setLightingColor(scene: THREE.Object3D, color: LinearRgb): void {
  for (const child of scene.children) {
    if (isRigLight(child)) {
      child.color.setRGB(color.r, color.g, color.b, THREE.LinearSRGBColorSpace)
    }
  }
}

/** Removes the rig's lights so a remount re-applies cleanly rather than stacking them. */
export function removeLighting(scene: THREE.Object3D): void {
  for (const child of scene.children.filter(isRigLight)) {
    scene.remove(child)
  }
}
```

Add to `engine/index.ts`:

```ts
export { setLightingColor, removeLighting } from './lighting/lighting-rig'
```

(The `Bounds3` import is used in Cycle 4 when `fitSunShadowToBounds` is added to this file; remove it now if the implementer's minimal version does not yet reference it, and re-add in Cycle 4.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run engine/lighting/lighting-rig.test.ts` then `pnpm test`.
Expected: PASS.

- [ ] **Step 5: Commit + BLUE**

```bash
git add engine/lighting/lighting-rig.test.ts && git commit -m "test: lighting-rig color application and teardown"
git add engine/lighting/lighting-rig.ts engine/index.ts && git commit -m "feat: set and clear the scene light color through the lighting rig"
git commit --allow-empty -m "refactor: close lighting-rig color cycle"
```

---

## Task 3 (Cycle 3): The sun casts a soft shadow (engine)

**Files:**

- Modify: `engine/lighting/basic-lighting-provider.ts`, `engine/lighting/basic-lighting-provider.test.ts`

- [ ] **Step 1: RED** (`test-author`; allowed file `engine/lighting/basic-lighting-provider.test.ts`) — add to the existing describe:

```ts
it('configures the directional sun to cast a shadow with a real shadow map', () => {
  const scene = new THREE.Scene()

  new BasicLightingProvider().apply(scene)

  const sun = scene.children.find(
    (child) => child instanceof THREE.DirectionalLight,
  ) as THREE.DirectionalLight
  expect(sun.castShadow).toBe(true)
  expect(sun.shadow.mapSize.width).toBeGreaterThan(0)
  expect(sun.shadow.mapSize.height).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run engine/lighting/basic-lighting-provider.test.ts`
Expected: FAIL (`sun.castShadow` is `false` by default).

- [ ] **Step 3: GREEN** (`implementer`; allowed file `engine/lighting/basic-lighting-provider.ts`)

Add the shadow constants and export `SUN_DIRECTION` (Cycle 4 reuses it), and configure the sun:

```ts
/** A fixed default sun direction, raised toward +Y. Exported so the shadow fitter
 *  positions the sun along the same direction relative to the scene bounds. */
export const SUN_DIRECTION = new THREE.Vector3(1, 2, 1)

const SHADOW_MAP_SIZE = 2048
const SHADOW_BIAS = -0.0005
```

In `apply`, after creating the sun:

```ts
sun.castShadow = true
sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
sun.shadow.bias = SHADOW_BIAS
```

Replace the existing local `SUN_DIRECTION` const with the exported one (delete the old `const SUN_DIRECTION = ...`). The percentage-closer soft filter is a renderer setting (Cycle 9), not a light property; it is verified in the visual tier.

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run engine/lighting/basic-lighting-provider.test.ts` then `pnpm test`.
Expected: PASS (the original directional + hemisphere assertions still pass).

- [ ] **Step 5: Commit + BLUE**

```bash
git add engine/lighting/basic-lighting-provider.test.ts && git commit -m "test: the basic lighting sun casts a shadow"
git add engine/lighting/basic-lighting-provider.ts && git commit -m "feat: cast a soft shadow from the directional sun"
git commit --allow-empty -m "refactor: close sun-shadow cycle"
```

---

## Task 4 (Cycle 4): Fit the sun shadow frustum to the scene bounds (engine)

**Files:**

- Modify: `engine/lighting/lighting-rig.ts`, `engine/lighting/lighting-rig.test.ts`, `engine/index.ts`

- [ ] **Step 1: RED** (`test-author`; allowed file `engine/lighting/lighting-rig.test.ts`)

```ts
import { fitSunShadowToBounds } from './lighting-rig'

describe('fitSunShadowToBounds', () => {
  it('sizes the sun shadow frustum to cover the scene bounds', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2600, z: 3000 } }

    fitSunShadowToBounds(scene, bounds)

    const sun = scene.children.find(
      (child) => child instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight
    const camera = sun.shadow.camera
    const radius = Math.hypot(4000, 2600, 3000) / 2
    expect(camera.right - camera.left).toBeGreaterThanOrEqual(radius * 2)
    expect(camera.top - camera.bottom).toBeGreaterThanOrEqual(radius * 2)
    expect(camera.far).toBeGreaterThanOrEqual(radius * 2)
  })

  it('does nothing for null bounds', () => {
    const scene = new THREE.Scene()
    new BasicLightingProvider().apply(scene)
    expect(() => fitSunShadowToBounds(scene, null)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run engine/lighting/lighting-rig.test.ts`
Expected: FAIL (`fitSunShadowToBounds` not exported).

- [ ] **Step 3: GREEN** (`implementer`; allowed files `engine/lighting/lighting-rig.ts`, `engine/index.ts`)

Add to `lighting-rig.ts` (import `SUN_DIRECTION` and `Bounds3`):

```ts
import { SUN_DIRECTION } from './basic-lighting-provider'

const SHADOW_DISTANCE_FACTOR = 3
const MIN_SHADOW_NEAR = 1

/**
 * Positions the sun along its fixed direction outside the scene bounds and sizes its
 * orthographic shadow camera to cover them, so the shell casts a shadow without
 * wasting shadow-map resolution. The light direction is preserved.
 */
export function fitSunShadowToBounds(scene: THREE.Object3D, bounds: Bounds3 | null): void {
  if (bounds === null) return
  const sun = scene.children.find((child) => child instanceof THREE.DirectionalLight) as
    | THREE.DirectionalLight
    | undefined
  if (sun === undefined) return

  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  )
  const radius =
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ) / 2
  const distance = radius * SHADOW_DISTANCE_FACTOR

  sun.position.copy(center).addScaledVector(SUN_DIRECTION.clone().normalize(), distance)
  sun.target.position.copy(center)
  sun.target.updateMatrixWorld()

  const camera = sun.shadow.camera
  camera.left = -radius
  camera.right = radius
  camera.top = radius
  camera.bottom = -radius
  camera.near = Math.max(MIN_SHADOW_NEAR, distance - radius)
  camera.far = distance + radius
  camera.updateProjectionMatrix()
}
```

Add to `engine/index.ts`:

```ts
export { setLightingColor, removeLighting, fitSunShadowToBounds } from './lighting/lighting-rig'
```

(Update the Cycle 2 export line in place to this one line.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run engine/lighting/lighting-rig.test.ts` then `pnpm test`.
Expected: PASS.

- [ ] **Step 5: Commit + BLUE**

```bash
git add engine/lighting/lighting-rig.test.ts && git commit -m "test: fit the sun shadow frustum to the scene bounds"
git add engine/lighting/lighting-rig.ts engine/lighting/basic-lighting-provider.ts engine/index.ts && git commit -m "feat: size the sun shadow camera from the scene bounds"
git commit --allow-empty -m "refactor: close shadow-frustum cycle"
```

(`basic-lighting-provider.ts` appears here only if exporting `SUN_DIRECTION` was not already committed in Cycle 3; if it was, drop it from the add list.)

---

## Task 5 (Cycle 5): Mark shell meshes as shadow casters and receivers (engine)

**Files:**

- Create: `engine/scene/shadow-casters.ts`, `engine/scene/shadow-casters.test.ts`
- Modify: `engine/index.ts`

- [ ] **Step 1: RED** (`test-author`; allowed file `engine/scene/shadow-casters.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { markShadowCasters } from './shadow-casters'

describe('markShadowCasters', () => {
  it('flags every mesh in the tree as a shadow caster and receiver', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    const nested = new THREE.Group()
    const deepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    nested.add(deepMesh)
    root.add(mesh, nested)

    markShadowCasters(root)

    expect(mesh.castShadow).toBe(true)
    expect(mesh.receiveShadow).toBe(true)
    expect(deepMesh.castShadow).toBe(true)
    expect(deepMesh.receiveShadow).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure** — `pnpm exec vitest run engine/scene/shadow-casters.test.ts` (module not found).

- [ ] **Step 3: GREEN** (`implementer`; allowed files `engine/scene/shadow-casters.ts`, `engine/index.ts`)

```ts
import * as THREE from 'three'

/** Flags every mesh in a built scene tree as a shadow caster and receiver, so each
 *  wall both throws and catches shadows under the directional sun. */
export function markShadowCasters(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
}
```

Add to `engine/index.ts`:

```ts
export { markShadowCasters } from './scene/shadow-casters'
```

- [ ] **Step 4: Run, expect pass** — target test then `pnpm test`.

- [ ] **Step 5: Commit + BLUE**

```bash
git add engine/scene/shadow-casters.test.ts && git commit -m "test: mark shell meshes as shadow casters and receivers"
git add engine/scene/shadow-casters.ts engine/index.ts && git commit -m "feat: flag scene meshes as shadow casters and receivers"
git commit --allow-empty -m "refactor: close shadow-caster cycle"
```

---

## Task 6 (Cycle 6): PaintMaterial stub at the material seam (engine)

**Files:**

- Create: `engine/materials/paint-material-provider.ts`, `engine/materials/paint-material-provider.test.ts`
- Modify: `engine/index.ts`

- [ ] **Step 1: RED** (`test-author`; allowed file `engine/materials/paint-material-provider.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { PaintMaterialProvider } from './paint-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }

describe('PaintMaterialProvider', () => {
  it('returns a role-named material for each surface role', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })

    const material = provider.material('interiorFace')

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.name).toBe('interiorFace')
  })

  it('caches one material per role', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })
    expect(provider.material('top')).toBe(provider.material('top'))
  })

  it('carries the light color it was constructed with', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })
    expect(provider.lightColor).toEqual(LIGHT_COLOR)
  })
})
```

- [ ] **Step 2: Run, expect failure** — module not found.

- [ ] **Step 3: GREEN** (`implementer`; allowed files `engine/materials/paint-material-provider.ts`, `engine/index.ts`)

```ts
import * as THREE from 'three'

import type { LinearRgb } from '../../core'
import type { MaterialProvider, SurfaceRole } from './material-provider'

/** A light warm gray shared by every surface role until the paint track assigns real colors. */
const NEUTRAL_COLOR = 0xd8d4cc

export interface PaintMaterialOptions {
  lightColor: LinearRgb
}

/**
 * The stub of the color-temperature-responsive paint material (foundation 5.2). It
 * replaces NeutralMaterialProvider at the material seam and carries the light color, so
 * the paint track widens it to real surface colors additively. The visible warmth comes
 * from the lights (ADR-0065), so the stub does not tint its albedo and avoids double-tinting.
 */
export class PaintMaterialProvider implements MaterialProvider {
  readonly lightColor: LinearRgb
  private readonly materials = new Map<SurfaceRole, THREE.Material>()

  constructor(options: PaintMaterialOptions) {
    this.lightColor = options.lightColor
  }

  material(role: SurfaceRole): THREE.Material {
    const cached = this.materials.get(role)
    if (cached) {
      return cached
    }
    const created = new THREE.MeshStandardMaterial({ color: NEUTRAL_COLOR, name: role })
    this.materials.set(role, created)
    return created
  }
}
```

Add to `engine/index.ts`:

```ts
export type { PaintMaterialOptions } from './materials/paint-material-provider'
export { PaintMaterialProvider } from './materials/paint-material-provider'
```

- [ ] **Step 4: Run, expect pass** — target test then `pnpm test`.

- [ ] **Step 5: Commit + BLUE**

```bash
git add engine/materials/paint-material-provider.test.ts && git commit -m "test: PaintMaterial stub carries the light color at the material seam"
git add engine/materials/paint-material-provider.ts engine/index.ts && git commit -m "feat: add the PaintMaterial stub at the material seam"
git commit --allow-empty -m "refactor: close PaintMaterial-stub cycle"
```

---

## Task 7 (Cycle 7): Color-temperature slider in the toolbar (bridge, DOM-tested)

**Files:**

- Modify: `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/scene-nav-toolbar.test.tsx`, `bridge/react/webgpu-scene-view.tsx`

The slider props are required, so `webgpu-scene-view.tsx` must pass them in the same cycle to typecheck. The four existing toolbar tests gain the two new props (the test-author amends RED fixtures).

- [ ] **Step 1: RED** (`test-author`; allowed file `bridge/react/scene-nav-toolbar.test.tsx`)

Add the two props to every existing `render(<SceneNavToolbar ... />)` call: `colorTemperatureK={6500} onColorTemperatureChange={vi.fn()}`. Add `import { fireEvent } from '@testing-library/react'` and two new tests:

```ts
  it('renders a color-temperature slider spanning the supported kelvin band', () => {
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={vi.fn()}
      />,
    )

    const slider = screen.getByRole('slider', { name: /color temperature/i })
    expect(slider).toHaveAttribute('min', '2700')
    expect(slider).toHaveAttribute('max', '6500')
    expect(slider).toHaveValue('6500')
    expect(slider).toHaveAttribute('aria-valuetext', '6500 kelvin')
  })

  it('reports a color-temperature change when the slider moves', () => {
    const onColorTemperatureChange = vi.fn()
    render(
      <SceneNavToolbar
        mode="orbit"
        onModeChange={vi.fn()}
        onReset={vi.fn()}
        colorTemperatureK={6500}
        onColorTemperatureChange={onColorTemperatureChange}
      />,
    )

    fireEvent.change(screen.getByRole('slider', { name: /color temperature/i }), {
      target: { value: '3000' },
    })

    expect(onColorTemperatureChange).toHaveBeenCalledWith(3000)
  })
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run bridge/react/scene-nav-toolbar.test.tsx`
Expected: FAIL (no slider role; typecheck error on the new props).

- [ ] **Step 3: GREEN** (`implementer`; allowed files `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/webgpu-scene-view.tsx`)

In `scene-nav-toolbar.tsx`:

```tsx
import { MIN_COLOR_TEMPERATURE_K, MAX_COLOR_TEMPERATURE_K } from '../../core'

const COLOR_TEMPERATURE_STEP_K = 100

interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
}
```

Add the destructured props and, after the reset button (still inside the toolbar div):

```tsx
<label className="scene-nav-toolbar__temperature">
  Color temperature
  <input
    type="range"
    min={MIN_COLOR_TEMPERATURE_K}
    max={MAX_COLOR_TEMPERATURE_K}
    step={COLOR_TEMPERATURE_STEP_K}
    value={colorTemperatureK}
    aria-label="Color temperature"
    aria-valuetext={`${colorTemperatureK} kelvin`}
    onChange={(event) => onColorTemperatureChange(Number(event.target.value))}
  />
</label>
```

In `webgpu-scene-view.tsx`, add a small hook beside `useSceneNavigation` and pass the props (keeps the component body under the 40-line limit):

```tsx
import { sceneGraphForFloor, DEFAULT_COLOR_TEMPERATURE_K, type CameraPose } from '../../core'

function useColorTemperature() {
  const [colorTemperatureK, setColorTemperatureK] = useState(DEFAULT_COLOR_TEMPERATURE_K)
  return { colorTemperatureK, setColorTemperatureK }
}
```

In the component body:

```tsx
const { colorTemperatureK, setColorTemperatureK } = useColorTemperature()
```

Update the toolbar element:

```tsx
<SceneNavToolbar
  mode={mode}
  onModeChange={setMode}
  onReset={resetView}
  colorTemperatureK={colorTemperatureK}
  onColorTemperatureChange={setColorTemperatureK}
/>
```

(The slider has no lighting effect yet; Cycle 9 wires it. `useState` is already imported.)

- [ ] **Step 4: Run, expect pass** — `pnpm exec vitest run bridge/react/scene-nav-toolbar.test.tsx`, `pnpm typecheck`, then `pnpm test`.

- [ ] **Step 5: Commit + BLUE**

```bash
git add bridge/react/scene-nav-toolbar.test.tsx && git commit -m "test: color-temperature slider in the scene navigation toolbar"
git add bridge/react/scene-nav-toolbar.tsx bridge/react/webgpu-scene-view.tsx && git commit -m "feat: add the color-temperature slider to the scene toolbar"
git commit --allow-empty -m "refactor: close color-temperature-slider cycle"
```

---

## Task 8 (Cycle 8): buildFramedScene returns bounds, marks casters, drops lighting (bridge, Node-tested)

**Files:**

- Modify: `bridge/react/framed-scene.ts`, `bridge/react/framed-scene.test.ts`

After this cycle the unit suite stays green, but the visual harness renders unlit until Cycle 9 mounts `<SceneLighting>` and Cycle 10 refreshes the baseline. That is expected; the gate at the end is the green checkpoint.

- [ ] **Step 1: RED** (`test-author`; allowed file `bridge/react/framed-scene.test.ts`) — add two tests using the existing walls `graph` fixture:

```ts
it('returns the scene world bounds alongside the framed pose', () => {
  const { bounds } = buildFramedScene(graph)

  expect(bounds).not.toBeNull()
  expect(bounds?.max.x).toBeGreaterThan(bounds?.min.x ?? 0)
})

it('marks the shell meshes as shadow casters and receivers', () => {
  const { root } = buildFramedScene(graph)

  // findByEntityId returns the wall mesh; read the shadow flags structurally so the
  // bridge test does not import three.
  const wall = findByEntityId(root, 'wall:w1') as {
    castShadow: boolean
    receiveShadow: boolean
  } | null
  expect(wall?.castShadow).toBe(true)
  expect(wall?.receiveShadow).toBe(true)
})
```

(Reuse the `graph` defined in the first existing test; if it is local to that test, lift it to a shared `const graph` in the describe so both tests use it. `findByEntityId` is already imported.)

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run bridge/react/framed-scene.test.ts`
Expected: FAIL (`bounds` is undefined; `castShadow` is `false`).

- [ ] **Step 3: GREEN** (`implementer`; allowed file `bridge/react/framed-scene.ts`)

```ts
import {
  frameSceneCamera,
  kelvinToLinearRgb,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type SceneGraph,
} from '../../core'
import {
  buildScene,
  markShadowCasters,
  PaintMaterialProvider,
  sceneBounds,
  type SceneRoot,
} from '../../engine'

export interface FramedScene {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
}

/**
 * Builds the Three.js scene from the graph through the PaintMaterial seam, flags its
 * meshes as shadow casters and receivers, and frames a camera on its world bounds.
 * Lighting is no longer added here: the lights live on the persistent render scene via
 * <SceneLighting> so the color-temperature slider updates them without a rebuild, and
 * keeping the lights out of the build keeps them out of the framed bounds.
 */
export function buildFramedScene(graph: SceneGraph): FramedScene {
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
  })
  const root = buildScene(graph, materials)
  markShadowCasters(root)
  const bounds = sceneBounds(root)
  const pose = frameSceneCamera(bounds)
  return { root, pose, bounds }
}
```

- [ ] **Step 4: Run, expect pass** — target test then `pnpm test` (the empty-scene test still returns `DEFAULT_CAMERA_POSE`).

- [ ] **Step 5: Commit + BLUE**

```bash
git add bridge/react/framed-scene.test.ts && git commit -m "test: framed scene returns bounds and marks shadow casters"
git add bridge/react/framed-scene.ts && git commit -m "feat: build the framed scene with shadows and the paint material, lights aside"
git commit --allow-empty -m "refactor: close framed-scene bounds-and-shadows cycle"
```

---

## Task 9 (Cycle 9): Wire the lighting end to end (glue, e2e-proven)

This cycle's RED is the end-to-end test; its GREEN is the glue that makes the slider tint the live scene and re-lights the harness. Commit the spec as `test:` so `rgb:audit` sees a RED before the `feat:` GREEN.

**Files:**

- Create: `e2e/tests/scene-helpers.ts`, `e2e/tests/scene-color-temperature.spec.ts`, `bridge/react/scene-lighting.tsx`
- Modify: `e2e/tests/scene-navigation.spec.ts`, `bridge/react/webgpu-scene-view.tsx`, `bridge/react/scene-harness-view.tsx`, `app/app.tsx`, `engine/renderer/create-renderer.ts`

- [ ] **Step 1: RED. Extract e2e helpers and add the color-temperature spec**

Create `e2e/tests/scene-helpers.ts` by moving `stableFrame` and `drawnSceneCanvas` verbatim out of `scene-navigation.spec.ts` (keep their comments), exporting both:

```ts
import { expect, type Locator, type Page } from '@playwright/test'

export async function stableFrame(canvas: Locator): Promise<Buffer> {
  // ... (moved verbatim from scene-navigation.spec.ts) ...
}

export async function drawnSceneCanvas(page: Page): Promise<Locator> {
  // ... (moved verbatim from scene-navigation.spec.ts) ...
}
```

Update `scene-navigation.spec.ts` to import them: `import { drawnSceneCanvas, stableFrame } from './scene-helpers'` and delete the moved local definitions.

Create `e2e/tests/scene-color-temperature.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { drawnSceneCanvas, stableFrame } from './scene-helpers'

// Runs in the GPU scene-webgl Playwright project (the config routes scene-*.spec.ts
// there) and self-skips without WebGPU. The assertion is semantic, not a pixel
// baseline: settle the canvas, move the slider to the warm end, settle again, and
// require the frame to change, proving the slider tints the live scene.
test.describe('Live three-dimensional color temperature', () => {
  test('the color-temperature slider changes the settled frame', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnSceneCanvas(page)
    const cool = await stableFrame(canvas)

    await page.getByRole('slider', { name: /color temperature/i }).fill('2700')

    const warm = await stableFrame(canvas)
    expect(warm.equals(cool)).toBe(false)
  })
})
```

Commit the RED (it fails today: after Cycle 8 the live view has no lights, so the slider does nothing and the frames match):

```bash
git add e2e/tests/scene-helpers.ts e2e/tests/scene-navigation.spec.ts e2e/tests/scene-color-temperature.spec.ts
git commit -m "test: the color-temperature slider changes the live scene frame"
```

- [ ] **Step 2: GREEN. Create `bridge/react/scene-lighting.tsx`**

```tsx
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'

import { kelvinToLinearRgb, type Bounds3 } from '../../core'
import {
  BasicLightingProvider,
  fitSunShadowToBounds,
  removeLighting,
  setLightingColor,
} from '../../engine'

interface SceneLightingProps {
  colorTemperatureK: number
  bounds: Bounds3 | null
}

/**
 * View-layer glue: applies the engine lighting rig to the persistent render scene once,
 * then tints it from the color temperature and fits its shadow to the scene bounds,
 * without rebuilding geometry. The lights live on the render scene rather than on the
 * keyed geometry group, so a rebuild does not discard them and a temperature change does
 * not rebuild the geometry. Runs only under a real render; coverage-excluded, proven by
 * the scene-webgl tier.
 */
export function SceneLighting({ colorTemperatureK, bounds }: SceneLightingProps) {
  const scene = useThree((state) => state.scene)
  const provider = useMemo(() => new BasicLightingProvider(), [])

  useLayoutEffect(() => {
    provider.apply(scene)
    return () => removeLighting(scene)
  }, [provider, scene])

  useLayoutEffect(() => {
    setLightingColor(scene, kelvinToLinearRgb(colorTemperatureK))
  }, [scene, colorTemperatureK])

  useLayoutEffect(() => {
    fitSunShadowToBounds(scene, bounds)
  }, [scene, bounds])

  return null
}
```

- [ ] **Step 3: GREEN. Mount it in the live view** (`bridge/react/webgpu-scene-view.tsx`)

Destructure `bounds`: `const { root, pose, bounds } = useMemo(() => buildFramedScene(graph), [graph])`. Import `SceneLighting`. Inside the `<Canvas>`, after `<FrameCamera>`:

```tsx
<SceneLighting colorTemperatureK={colorTemperatureK} bounds={bounds} />
```

- [ ] **Step 4: GREEN. Re-light the harness** (`bridge/react/scene-harness-view.tsx`)

Import `DEFAULT_COLOR_TEMPERATURE_K` from `../../core` and `SceneLighting`. Give the component an optional prop and use the bounds:

```tsx
export function SceneHarnessView({
  colorTemperatureK = DEFAULT_COLOR_TEMPERATURE_K,
}: {
  colorTemperatureK?: number
} = {}) {
  const { root, pose, bounds } = useMemo(() => buildFramedScene(SHELL_FIXTURE), [])
```

Inside the `<Canvas>`, before `<StaticFrame>` (so the lights exist before the single static render):

```tsx
        <primitive object={root} />
        <SceneLighting colorTemperatureK={colorTemperatureK} bounds={bounds} />
        <StaticFrame target={pose.target} />
```

- [ ] **Step 5: GREEN. Pass an optional temperature param to the harness** (`app/app.tsx`)

```tsx
const COLOR_TEMPERATURE_PARAM = 'temp'

function requestedColorTemperature(): number | undefined {
  const raw = new URLSearchParams(globalThis.location?.search ?? '').get(COLOR_TEMPERATURE_PARAM)
  if (raw === null) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}
```

In `App`:

```tsx
if (requestedFixture() === SCENE_HARNESS_FIXTURE) {
  return <SceneHarnessView colorTemperatureK={requestedColorTemperature()} />
}
```

(Passing `undefined` triggers the prop default. The harness clamps through `kelvinToLinearRgb`, so an out-of-band `temp` is safe.)

- [ ] **Step 6: GREEN. Enable the shadow map on the renderer** (`engine/renderer/create-renderer.ts`)

```ts
const { WebGPURenderer: Renderer, PCFSoftShadowMap } = await import('three/webgpu')
const renderer = new Renderer({
  canvas: options.canvas,
  antialias: options.antialias ?? true,
  forceWebGL: options.forceWebGL ?? false,
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = PCFSoftShadowMap
await renderer.init()
return renderer
```

If `three/webgpu` does not re-export `PCFSoftShadowMap`, import it from a second lazy `await import('three')` instead. This factory needs GPU `init()`, so it is verified in the visual tier (Cycle 10), not a Node test.

- [ ] **Step 7: Verify GREEN end to end**

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build
lsof -ti :4173 | xargs kill -9 2>/dev/null; true   # kill any stale vite preview on 4173
pnpm exec playwright test --project=scene-webgl scene-color-temperature
```

Expected: the color-temperature spec now PASSES (the warm frame differs from the cool frame). If a one-time WebGPU settle changes the first post-change frame independent of the tint (as walk mode saw), absorb it: after `drawnSceneCanvas`, nudge the slider once and settle before capturing `cool`.

- [ ] **Step 8: Commit GREEN, then BLUE**

```bash
git add bridge/react/scene-lighting.tsx bridge/react/webgpu-scene-view.tsx bridge/react/scene-harness-view.tsx app/app.tsx engine/renderer/create-renderer.ts
git commit -m "feat: tint the live scene light from the color-temperature slider"
```

Dispatch `clean-code-reviewer` (note: the React glue files are coverage-excluded; review for the `three`-import boundary in the bridge and the effect dependencies). Then `refactorer` for findings. Commit:

```bash
git commit --allow-empty -m "refactor: close lighting wiring cycle"
```

---

## Task 10 (Cycle 10): Refresh and add the visual baselines (test infrastructure)

**Files:**

- Modify: `e2e/tests/scene-visual-regression.spec.ts`
- Snapshots: `e2e/tests/scene-visual-regression.spec.ts-snapshots/scene-shell-webgl-scene-webgl-darwin.png` (refresh), `scene-shell-warm-webgl-scene-webgl-darwin.png` (add)

- [ ] **Step 1: Add the warm-baseline test** to `scene-visual-regression.spec.ts`, mirroring the existing test but at `'/?fixture=scene-harness&temp=2700'` and screenshotting `'scene-shell-warm-webgl.png'` with the same `threshold: 0.35, maxDiffPixelRatio: 0.05`. Keep the WebGL2 self-skip.

- [ ] **Step 2: Rebuild and regenerate both baselines**

```bash
pnpm build
lsof -ti :4173 | xargs kill -9 2>/dev/null; true   # kill any stale vite preview on 4173
pnpm exec playwright test --project=scene-webgl scene-visual-regression --update-snapshots=all
```

Expected: the default `scene-shell-webgl` baseline refreshes (now lit with a soft shadow) and the warm `scene-shell-warm-webgl` baseline is created.

- [ ] **Step 3: Review the baselines by eye** before committing (section 9.12 of the design spec): the default frame shows the lit shell with a soft shadow on the floor; the warm frame is visibly warmer (more orange) than the default. If either looks wrong (no shadow, or no tint difference), stop and debug before committing the PNGs.

- [ ] **Step 4: Commit the baselines**

```bash
git add e2e/tests/scene-visual-regression.spec.ts e2e/tests/scene-visual-regression.spec.ts-snapshots/
git commit -m "test(e2e): refresh the shell baseline with shadows and add a warm color-temperature baseline"
```

---

## Final gate and rollout

- [ ] **Step 1: Full local gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build
```

Expected: all green; `integration:audit` reports its expected pass count with zero failures.

- [ ] **Step 2: red-green-blue audit**

Run: `pnpm rgb:audit -- --range origin/main..HEAD` (use `origin/main..HEAD`, not the default local range, per the merging-parallel-worktree note).
Expected: CLEAN. Every cycle reads test -> feat -> refactor; the e2e RED is a `test:` commit; the baseline commit is `test(e2e):` (audit-exempt); `docs:` commits are exempt.

- [ ] **Step 3: Full e2e after a rebuild**

```bash
pnpm build
lsof -ti :4173 | xargs kill -9 2>/dev/null; true   # kill any stale vite preview on 4173
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=scene-webgl
```

Expected: chromium tree green; scene-webgl green (visual baselines match, navigation and color-temperature semantic checks pass) or self-skips only where no GPU context exists.

- [ ] **Step 4: Flip the ROADMAP lighting row to merged** (after the PR merges, with the PR number), commit `docs: ...`, and update the resume memory.

- [ ] **Step 5: Cut the PR.** Ask the user for a commit-timestamp window before windowing dates (real times were kept on #93 and #95; the user chooses per slice). Push the branch, open the PR with a humanized description, and wait for CI (Check, e2e-chromium, ping-pong, storybook) before merge.

---

## Self-review against the spec

- **Color-temperature parameter, per-view, 2700 to 6500, default 6500 (spec section 1, 2):** Cycle 1 (consts), Cycle 7 (state + slider). Covered.
- **Kelvin to linear-light, normalized, clamped, in core (spec section 3):** Cycle 1. Covered.
- **Tint the light; sun + hemisphere sky (spec section 4, ADR-0065):** Cycles 2, 9. Covered.
- **PCF soft shadow, bounds-sized frustum, meshes flagged, renderer shadow map (spec section 4, 6):** Cycles 3, 4, 5, 8 (mark), 9 (renderer). Covered.
- **PaintMaterial stub carries light color, no re-tint, replaces neutral at the seam (spec section 5):** Cycles 6, 8 (default in buildFramedScene). Covered.
- **Live update without geometry rebuild; lights on the persistent scene; bounds out of buildFramedScene (spec section 6):** Cycles 8, 9. Covered.
- **Testing: pure core, engine Node, glue e2e-proven, visual tier with a warm baseline (spec section 7):** Cycles 1-6 (unit), 9 (semantic e2e), 10 (baselines). Covered.
- **Out of scope honored:** no real paint colors, no solar model, no presets, session-only state, no WebGL2 wiring. No task adds any of these.

Type-consistency check: `kelvinToLinearRgb` returns `LinearRgb`; `setLightingColor`/`PaintMaterialProvider`/`SceneLighting` consume `LinearRgb`; `fitSunShadowToBounds`/`buildFramedScene`/`SceneLighting` use `Bounds3 | null` (the `sceneBounds` return type); the slider props `colorTemperatureK: number` / `onColorTemperatureChange: (kelvin: number) => void` match `webgpu-scene-view.tsx`. Consistent across tasks.
