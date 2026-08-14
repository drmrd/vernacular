# Decorating color-accuracy gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); each task below maps onto one or more such cycles.

**Goal:** Prove the epic's headline acceptance: a known paint color, rendered under the neutral daylight reference condition, reads within a stated perceptual tolerance of its reference swatch.

**Architecture:** A hybrid render-and-sample gate. `core/` owns three known mid-range paint swatches, an OKLab within-tolerance predicate over the existing `perceptualDistance`, and an empirically-derived tolerance constant, all unit-tested without a renderer. A new `scene-webgl` Playwright spec paints the shell floor each swatch color through a harness paint mode, renders it under the `color-check` reference lighting, samples the lit floor from the compositor screenshot, and asserts the sample passes the core predicate. The spec self-skips where WebGL 2 is unavailable and commits no pixel baseline.

**Tech Stack:** TypeScript, `core/` pure-TS color module, React harness view (`bridge/`, `app/`), Playwright `scene-webgl` project (WebGL 2 through three's `WebGPURenderer` WebGL backend), Vitest for the core and app unit tests.

## Global Constraints

Copied verbatim from the spec and the repo rules; every task's requirements implicitly include these.

- **No change to the shipped lighting rig.** The reference condition is fixed by ADR-0156: sun at `DAYLIGHT_SUN_INTENSITY`, sky-probe ambient at its noon value, exposure 1, Khronos PBR Neutral tone mapping, color check active. Do not touch the sun intensity, the ambient probe, or the default exposure. A gate that could only pass by moving those numbers would be revising ADR-0156, not implementing its gate.
- **No baseline churn.** Leave `paint=demo` and its committed `scene-shell-painted` baseline untouched. Leave the `scene=color-check` visual baseline (`e2e/tests/scene-solar.spec.ts-snapshots/scene-color-check-webgl-scene-webgl-{darwin,linux}.png`) untouched. The gate asserts a sampled color within a tolerance, not an image against a baseline, so it commits no new screenshot.
- **Tolerance is measured, not guessed.** The committed tolerance is the observed maximum cross-backend (darwin Metal + linux SwiftShader) sample-to-swatch spread plus a margin, pinned as a named `core/` constant with the derivation in a comment and in ADR-0157. Provisional ceiling about `0.05` OKLab distance.
- **Round-trip offset escalates, it does not widen the tolerance.** Measure the neutral-gray round-trip before setting the tolerance. A systematic offset beyond a small margin is surfaced to the owner (an ADR-0156 revision or a redefinition of the reference), never absorbed by loosening the tolerance.
- **ADR-0157 is pre-assigned** to this slice (max ADR on `main` is 0156). Any change to the spec's mechanism lands with ADR-0157 explaining it; any move to ADR-0156's calibration lands as an ADR-0156 revision in the same change.
- **OKLab only.** The gate reasons in OKLab through the single `perceptualDistance` seam. Do not add CIELAB or CIEDE2000.
- **Repo rules:** Conventional Commits (`type: subject`, no milestone tags). No em-dashes in newly composed prose. No `Co-Authored-By` and no `Claude-Session` trailers. Author identity `Dan Moore <9156191+drmrd@users.noreply.github.com>`. Exact dependency pins, 30-day cooldown, no new dependency for this slice (a PNG decoder is explicitly avoided). ESLint must report zero problems (warnings included): `max-lines-per-function` 40, `max-lines` 300, `max-params` 3, `no-nested-ternary`, `no-magic-numbers` with a named-const carve-out. `prettier --check .` gates the whole repo. Descriptive branch, file, and identifier names, no cryptic shorthand, no third-party product names.
- **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Verify each gate's own exit code (a piped `tail` masks failures). The `scene-webgl` end-to-end gate runs under `pnpm exec playwright test --project=scene-webgl`.

---

## Design decisions carried into this plan

Two refinements to the spec's literal prose. Both are forced by the harness reality, preserve the reference condition ADR-0156 fixes, and are documented in ADR-0157 (Task 5) and surfaced to the owner at `/review` before landing.

1. **Self-skip on WebGL 2, not WebGPU.** The spec's prose says the gate self-skips "without WebGPU, like the other live-view specs." That describes the live editor specs (`scene-color-temperature.spec.ts`), which render through the WebGPU live view and only run on darwin. This gate instead renders through the deterministic scene harness (`?fixture=scene-harness`), whose renderer is three's `WebGPURenderer` pinned to its WebGL 2 backend (`forceWebGL: true`, `bridge/react/scene-harness-view.tsx`). The harness is exactly what runs on both backends: darwin Metal locally and linux SwiftShader on the CI `scene-webgl` lane (`ci.yml` runs `playwright test --project=scene-webgl`). Measuring the cross-backend spread the tolerance is derived from is only possible if the gate runs on both, so it must guard on WebGL 2 (matching `scene-solar.spec.ts`), not WebGPU. Guarding on WebGPU would skip the gate on the linux runner and make the cross-backend measurement impossible.

2. **Sample the floor under the color-check reference lighting; add a floor-framing camera only if the default frame's floor patch is unreliable.** The shell fixture is a closed box: a floor slab, four walls, and a ceiling over the clear interior (`bridge/react/harness-fixtures.ts`, `SHELL_ROOM`). The `scene=color-check` state auto-frames the shell from outside. The floor is visible through the down-facing ceiling, but how much floor lands under a fixed sample patch is unknown until measured. The default path keeps `scene=color-check` literal and tunes the sample patch to a floor region (Task 4, Step 2). If no fixed patch reliably reads the floor across both backends, Task 4a adds a gate-only harness state that reuses the color-check reference lighting with an interior camera aimed at the floor, so the floor fills the frame and the center patch is unambiguously floor. That state carries no committed screenshot (the gate is a sampled-color assertion), so it adds zero baseline churn, and it leaves the existing `color-check` state and its baseline untouched. Only the camera differs; the camera is not part of ADR-0156's reference condition, so the reference condition is preserved exactly.

## File structure

- `core/color/color-accuracy.ts` (create): the three swatch definitions, the `withinColorTolerance` predicate, and the `COLOR_ACCURACY_TOLERANCE` constant. One responsibility: the color-accuracy numbers and judgment.
- `core/color/color-accuracy.test.ts` (create): unit tests for the swatch set and the predicate (same-color pass, shifted-color fail).
- `core/index.ts` (modify): re-export the three new symbols from the barrel.
- `app/harness-paint.ts` (create): a pure `resolveHarnessPaint(paintParam)` that maps the `paint` query value to a surface-treatment store. Absorbs the existing `demo` store from `app/app.tsx` and adds the hex floor-paint branch. One responsibility: harness paint resolution.
- `app/harness-paint.test.ts` (create): unit tests for the demo store, the hex floor store, and the null/invalid cases.
- `app/app.tsx` (modify): delete the inline `requestedHarnessPaint` body and its `DEMO_*` constants; delegate to `resolveHarnessPaint(searchParam('paint'))`.
- `app/harness-environment.ts` (modify, Task 4a only if needed): add the gate-only `color-accuracy` environment state and its floor camera pose.
- `app/harness-environment.test.ts` (modify, Task 4a only if needed): assert the new state resolves.
- `e2e/tests/scene-helpers.ts` (modify): add `sampleFloorColor`, which averages a center patch of the settled harness canvas to one sRGB triple through the compositor screenshot.
- `e2e/tests/scene-color-accuracy.spec.ts` (create): the gate. Renders each swatch, samples, asserts the core predicate.
- `docs/knowledge/decisions/ADR-0157-color-accuracy-gate.md` (create): the decision record.

---

## Task 1: Core color-accuracy module

The pure numbers and judgment: three swatches, the within-tolerance predicate, the tolerance constant. Verified without a renderer.

**Files:**

- Create: `core/color/color-accuracy.ts`
- Test: `core/color/color-accuracy.test.ts`
- Modify: `core/index.ts` (add three re-exports after the `./color/operations` export near line 599)

**Interfaces:**

- Consumes: `Color`, `NamedColor`, `colorFromHex` from `./color`; `perceptualDistance` from `./operations` (all existing).
- Produces:
  - `COLOR_ACCURACY_SWATCHES: readonly NamedColor[]` — three entries, in order: `{ name: 'Neutral mid-gray', color: colorFromHex('#808080') }`, `{ name: 'Warm saturated', color: colorFromHex('#cc6633') }`, `{ name: 'Cool saturated', color: colorFromHex('#3f7f5f') }`. Each swatch's `color.srgbHex` gives the gate its paint value.
  - `COLOR_ACCURACY_TOLERANCE: number` — the OKLab distance threshold. Ships at `0.05` provisionally; Task 4 replaces the value with the measured spread plus margin.
  - `withinColorTolerance(sample: Color, reference: Color, tolerance?: number): boolean` — `perceptualDistance(sample, reference) <= tolerance`, defaulting `tolerance` to `COLOR_ACCURACY_TOLERANCE`.

- [ ] **Step 1: Write the failing test**

Create `core/color/color-accuracy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  withinColorTolerance,
} from './color-accuracy'

describe('color-accuracy swatches', () => {
  it('defines a neutral, a warm, and a cool mid-range swatch', () => {
    expect(COLOR_ACCURACY_SWATCHES.map((swatch) => swatch.color.srgbHex)).toEqual([
      '#808080',
      '#cc6633',
      '#3f7f5f',
    ])
  })

  it('names every swatch', () => {
    for (const swatch of COLOR_ACCURACY_SWATCHES) {
      expect(swatch.name.length).toBeGreaterThan(0)
    }
  })
})

describe('withinColorTolerance', () => {
  it('passes a color compared to itself', () => {
    const gray = colorFromHex('#808080')
    expect(withinColorTolerance(gray, gray)).toBe(true)
  })

  it('fails a color shifted in hue beyond the tolerance', () => {
    // The warm and cool swatches sit far apart in OKLab, well beyond any render noise.
    expect(withinColorTolerance(colorFromHex('#cc6633'), colorFromHex('#3f7f5f'))).toBe(false)
  })

  it('fails a color shifted in value beyond the tolerance', () => {
    expect(withinColorTolerance(colorFromHex('#808080'), colorFromHex('#3a3a3a'))).toBe(false)
  })

  it('honors an explicit tolerance argument', () => {
    const gray = colorFromHex('#808080')
    const slightlyLighter = colorFromHex('#8a8a8a')
    expect(withinColorTolerance(gray, slightlyLighter, 0)).toBe(false)
    expect(withinColorTolerance(gray, slightlyLighter, 1)).toBe(true)
  })

  it('reads its default threshold from the exported constant', () => {
    expect(typeof COLOR_ACCURACY_TOLERANCE).toBe('number')
    expect(COLOR_ACCURACY_TOLERANCE).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/color/color-accuracy.test.ts`
Expected: FAIL — cannot resolve `./color-accuracy` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `core/color/color-accuracy.ts`:

```ts
import { colorFromHex, type Color, type NamedColor } from './color'
import { perceptualDistance } from './operations'

/**
 * The three known paint swatches the color-accuracy gate renders and samples. They span
 * the failure modes a wrong render path would show while staying in the tone-mapping
 * operator's roughly linear mid-range, where the reference condition (ADR-0156) promises a
 * faithful reproduction: a neutral mid-gray catches white-balance and value drift, a warm
 * and a cool saturated color catch an illuminant double-tint on either side of neutral. The
 * warm and cool colors reuse the shipped `paint=demo` colors. See ADR-0157.
 */
export const COLOR_ACCURACY_SWATCHES: readonly NamedColor[] = [
  { name: 'Neutral mid-gray', color: colorFromHex('#808080') },
  { name: 'Warm saturated', color: colorFromHex('#cc6633') },
  { name: 'Cool saturated', color: colorFromHex('#3f7f5f') },
]

/**
 * The OKLab perceptual-distance a rendered swatch may differ from its reference swatch and
 * still pass. Derived empirically from the maximum cross-backend (darwin Metal, linux
 * SwiftShader) spread of the sampled floor plus a margin, so renderer nondeterminism passes
 * and a real color error fails. See ADR-0157 for the derivation.
 */
export const COLOR_ACCURACY_TOLERANCE = 0.05

/**
 * Whether a sampled color reads within the color-accuracy tolerance of a reference swatch,
 * measured as the OKLab perceptual distance. The tolerance defaults to
 * COLOR_ACCURACY_TOLERANCE and is overridable so tests can pin an explicit threshold.
 */
export function withinColorTolerance(
  sample: Color,
  reference: Color,
  tolerance: number = COLOR_ACCURACY_TOLERANCE,
): boolean {
  return perceptualDistance(sample, reference) <= tolerance
}
```

Add to `core/index.ts`, immediately after the line `export { mixColors, nearestColor, perceptualDistance } from './color/operations'`:

```ts
export {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  withinColorTolerance,
} from './color/color-accuracy'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/color/color-accuracy.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full check chain for the touched layer**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: zero problems. `no-magic-numbers` accepts `0.05` because it is assigned to a named `const`; the `0` and `1` explicit-tolerance literals live in a `.test.ts` where `no-magic-numbers` is off.

- [ ] **Step 6: Commit**

```bash
git add core/color/color-accuracy.ts core/color/color-accuracy.test.ts core/index.ts
git commit -m "test: define the color-accuracy swatches and tolerance predicate"
```

(Per the repo's red-green-blue convention, split the RED test commit from the GREEN implementation commit if the subagent cycle produces two commits; close the cycle with a BLUE `/clean-code-review` then `/refactor`, landing an empty refactor marker if there are no findings.)

---

## Task 2: Harness paint mode (arbitrary floor hex)

Extract the harness paint resolution into a pure, testable function and add a branch that paints the shell floor an arbitrary hex, matte, without disturbing `paint=demo`.

**Files:**

- Create: `app/harness-paint.ts`
- Test: `app/harness-paint.test.ts`
- Modify: `app/app.tsx` (remove the inline `requestedHarnessPaint` body and the `DEMO_FLOOR_HEX`, `DEMO_WALL_HEX`, `DEMO_WALL_IDS` constants; delegate to the new resolver)

**Interfaces:**

- Consumes: `colorFromHex`, `solidTreatment`, `surfaceKey`, `type SurfaceTreatment` from `../core` (all existing, already imported by `app/app.tsx`).
- Produces: `resolveHarnessPaint(paintParam: string | null): Record<string, SurfaceTreatment> | undefined`.
  - `null` or any value that is neither `'demo'` nor a six-digit hex resolves to `undefined` (no paint).
  - `'demo'` resolves to the existing demo store: `floor:demo` painted `#cc6633` matte, plus the four walls (`south`, `east`, `north`, `west`) right-face painted `#3f7f5f` matte.
  - A six-hex-digit value (case-insensitive, no leading `#`) resolves to a single-entry store: `floor:demo` painted `#<hex>` matte.

- [ ] **Step 1: Write the failing test**

Create `app/harness-paint.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { colorFromHex, solidTreatment, surfaceKey } from '../core'
import { resolveHarnessPaint } from './harness-paint'

const floorKey = surfaceKey({ kind: 'floor', floorId: 'demo' })

describe('resolveHarnessPaint', () => {
  it('resolves an absent or unrecognized param to no paint', () => {
    expect(resolveHarnessPaint(null)).toBeUndefined()
    expect(resolveHarnessPaint('nonsense')).toBeUndefined()
    expect(resolveHarnessPaint('12345')).toBeUndefined() // five digits, not six
    expect(resolveHarnessPaint('12345g')).toBeUndefined() // non-hex digit
  })

  it('paints the shell floor an arbitrary six-hex color, matte', () => {
    const store = resolveHarnessPaint('808080')
    expect(store).toEqual({
      [floorKey]: solidTreatment(colorFromHex('#808080'), 'matte'),
    })
  })

  it('accepts upper-case hex', () => {
    const store = resolveHarnessPaint('CC6633')
    expect(store?.[floorKey]).toEqual(solidTreatment(colorFromHex('#cc6633'), 'matte'))
  })

  it('keeps the demo store: floor plus four painted walls', () => {
    const store = resolveHarnessPaint('demo')
    expect(store?.[floorKey]).toEqual(solidTreatment(colorFromHex('#cc6633'), 'matte'))
    for (const wallId of ['south', 'east', 'north', 'west']) {
      const key = surfaceKey({ kind: 'wall-face', wallId, side: 'right' })
      expect(store?.[key]).toEqual(solidTreatment(colorFromHex('#3f7f5f'), 'matte'))
    }
    expect(Object.keys(store ?? {})).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/harness-paint.test.ts`
Expected: FAIL — cannot resolve `./harness-paint`.

- [ ] **Step 3: Write the minimal implementation**

Create `app/harness-paint.ts`:

```ts
import { colorFromHex, solidTreatment, surfaceKey, type SurfaceTreatment } from '../core'

// A fixed demo paint store for the painted-shell baseline
// (`?fixture=scene-harness&paint=demo`): the harness room's floor painted a distinct color
// so the committed baseline shows real paint on a surface.
const DEMO_FLOOR_HEX = '#cc6633'
const DEMO_WALL_HEX = '#3f7f5f'
// The harness room's four walls (model ids, the scene `wall:` prefix stripped). South hosts
// the door (an opening wall), so painting all four exercises both wall mesh paths.
const DEMO_WALL_IDS = ['south', 'east', 'north', 'west']

// The color-accuracy gate paints the floor an arbitrary swatch color through
// `?fixture=scene-harness&scene=color-check&paint=<hex>`; a six-hex value (no leading #)
// paints only the floor, matte, so the sampled diffuse color is not skewed by a specular
// highlight (finish accuracy is a separate acceptance).
const FLOOR_HEX_PATTERN = /^[0-9a-fA-F]{6}$/

function demoPaintStore(): Record<string, SurfaceTreatment> {
  const store: Record<string, SurfaceTreatment> = {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(
      colorFromHex(DEMO_FLOOR_HEX),
      'matte',
    ),
  }
  for (const wallId of DEMO_WALL_IDS) {
    store[surfaceKey({ kind: 'wall-face', wallId, side: 'right' })] = solidTreatment(
      colorFromHex(DEMO_WALL_HEX),
      'matte',
    )
  }
  return store
}

function floorPaintStore(hex: string): Record<string, SurfaceTreatment> {
  return {
    [surfaceKey({ kind: 'floor', floorId: 'demo' })]: solidTreatment(
      colorFromHex(`#${hex}`),
      'matte',
    ),
  }
}

/**
 * Resolves the harness `paint` query value to a surface-treatment store, or undefined for no
 * paint. `demo` reproduces the committed painted-shell baseline (floor plus four walls); a
 * six-hex value paints only the shell floor that color, matte, for the color-accuracy gate.
 */
export function resolveHarnessPaint(
  paintParam: string | null,
): Record<string, SurfaceTreatment> | undefined {
  if (paintParam === 'demo') return demoPaintStore()
  if (paintParam !== null && FLOOR_HEX_PATTERN.test(paintParam)) return floorPaintStore(paintParam)
  return undefined
}
```

Modify `app/app.tsx`. Add the import near the other `./harness-*` imports:

```ts
import { resolveHarnessPaint } from './harness-paint'
```

Delete the `DEMO_FLOOR_HEX`, `DEMO_WALL_HEX`, `DEMO_WALL_IDS` constants and the whole inline `requestedHarnessPaint` function body, and replace the function with a one-liner that delegates:

```ts
function requestedHarnessPaint(): Record<string, SurfaceTreatment> | undefined {
  return resolveHarnessPaint(searchParam('paint'))
}
```

Leave the `SurfaceTreatment` import in `app/app.tsx` (still referenced by the `requestedHarnessPaint` return type). Remove the now-unused `colorFromHex`, `solidTreatment`, `surfaceKey` imports from `app/app.tsx` if nothing else in the file uses them (ESLint `unused-imports/no-unused-imports` is an error, so this must be clean; check with `pnpm lint` in Step 5).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/harness-paint.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the demo behavior is unchanged and lint is clean**

Run: `pnpm exec vitest run app && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: PASS and zero lint problems, including no unused imports in `app/app.tsx`. (The demo store is now covered by `harness-paint.test.ts`; the existing `scene-shell-painted` e2e baseline still exercises the rendered demo path unchanged.)

- [ ] **Step 6: Commit**

```bash
git add app/harness-paint.ts app/harness-paint.test.ts app/app.tsx
git commit -m "feat: paint the harness floor an arbitrary swatch color"
```

Close the cycle with `/clean-code-review` then `/refactor`.

---

## Task 3: End-to-end gate and the floor sample helper

The gate spec and the sampling helper. This task also runs the empirical calibration (Task 4) inline, because the gate cannot be authored blind: it renders on a real backend and the tolerance comes from that render. Author the spec, wire the helper, then calibrate in Task 4 before the final assertion is trusted.

**Files:**

- Modify: `e2e/tests/scene-helpers.ts` (add `sampleFloorColor` and its imports)
- Create: `e2e/tests/scene-color-accuracy.spec.ts`

**Interfaces:**

- Consumes: `COLOR_ACCURACY_SWATCHES`, `COLOR_ACCURACY_TOLERANCE`, `withinColorTolerance` from `../../core/color/color-accuracy`; `colorFromOkLab` from `../../core/color/color`; `srgbToOkLab`, `type Srgb` from `../../core/color/oklab`; `perceptualDistance` from `../../core/color/operations`.
  - Import from the specific core submodule paths, not the `../../core` barrel, to keep the Playwright transpile graph small. The `e2e/` tree is not in `tsconfig.json`'s `include` and not in the ESLint `boundaries/include` list, so importing `core` from a spec is allowed and Playwright transpiles the imported TS at runtime (the same way `scripts/` import core submodules). If Playwright's loader cannot resolve an extensionless relative import, append the `.ts` extension.
- Produces: `sampleFloorColor(page: Page, canvas: Locator): Promise<Srgb>`.

**Why the compositor screenshot, not an in-page pixel read:** the harness renderer (three's `WebGPURenderer` on its WebGL backend) does not preserve its drawing buffer, so an in-page `getImageData` on the live harness canvas reads an already-cleared buffer. `scene-solar.spec.ts` documents this. The helper therefore takes Playwright's compositor screenshot of the canvas, hands the PNG back into the page as a base64 data URL, and lets the browser's native image decoder give pixels. No image-decoding dependency is added.

- [ ] **Step 1: Add the sampling helper**

Append to `e2e/tests/scene-helpers.ts`. Add to the top-of-file import the `Srgb` type:

```ts
import { expect, type Locator, type Page } from '@playwright/test'
import type { Srgb } from '../../core/color/oklab'
```

Then add the helper:

```ts
// The side of the square patch (in screenshot pixels) averaged into one sRGB triple.
// Averaging a patch rather than one pixel damps per-pixel WebGL nondeterminism.
const FLOOR_PATCH_PX = 24
// Center of the frame, as a fraction of width and height, expressed as a numerator over a
// denominator so the magic-number rule stays satisfied. Tuned in Task 4 to land on the floor.
const PATCH_CENTER_X_NUM = 1
const PATCH_CENTER_X_DEN = 2
const PATCH_CENTER_Y_NUM = 1
const PATCH_CENTER_Y_DEN = 2
const SRGB_MAX = 255

// Averages a square patch of the settled harness canvas to one sRGB triple in 0..1. The
// harness renderer does not preserve its drawing buffer (see scene-solar.spec.ts), so the
// compositor screenshot, not an in-page pixel poll, is the source of truth: we screenshot the
// canvas, hand the PNG back to the page as a data URL, and read pixels from the browser's
// native decode. Returns gamma-encoded sRGB fractions, ready for srgbToOkLab.
export async function sampleFloorColor(page: Page, canvas: Locator): Promise<Srgb> {
  const png = await canvas.screenshot()
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return page.evaluate(
    async ({ url, patch, cx, cxDen, cy, cyDen, max }) => {
      const image = new Image()
      image.src = url
      await image.decode()
      const surface = document.createElement('canvas')
      surface.width = image.width
      surface.height = image.height
      const context = surface.getContext('2d')
      if (context === null) throw new Error('no 2d context for the sample surface')
      context.drawImage(image, 0, 0)
      const originX = Math.floor((image.width * cx) / cxDen - patch / 2)
      const originY = Math.floor((image.height * cy) / cyDen - patch / 2)
      const { data } = context.getImageData(originX, originY, patch, patch)
      let r = 0
      let g = 0
      let b = 0
      const channels = 4
      for (let i = 0; i < data.length; i += channels) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
      }
      const pixels = data.length / channels
      return { r: r / pixels / max, g: g / pixels / max, b: b / pixels / max }
    },
    {
      url: dataUrl,
      patch: FLOOR_PATCH_PX,
      cx: PATCH_CENTER_X_NUM,
      cxDen: PATCH_CENTER_X_DEN,
      cy: PATCH_CENTER_Y_NUM,
      cyDen: PATCH_CENTER_Y_DEN,
      max: SRGB_MAX,
    },
  )
}
```

- [ ] **Step 2: Write the gate spec**

Create `e2e/tests/scene-color-accuracy.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  withinColorTolerance,
} from '../../core/color/color-accuracy'
import { colorFromOkLab } from '../../core/color/color'
import { srgbToOkLab } from '../../core/color/oklab'
import { perceptualDistance } from '../../core/color/operations'
import { sampleFloorColor } from './scene-helpers'

// The color-accuracy gate, the headline acceptance of the realistic-environmental-lighting
// epic. It renders each known swatch on the shell floor under the color-check reference
// condition (ADR-0156: neutral daylight, exposure 1, PBR Neutral tone mapping), samples the
// lit floor, and asserts the sample reads within tolerance of the swatch in OKLab. It renders
// through the deterministic scene harness (WebGL 2 backend), so it runs on both darwin Metal
// and linux SwiftShader and self-skips only where no WebGL 2 context exists. It commits no
// pixel baseline; the assertion is the sampled color, not an image. See ADR-0157.

// Puts the harness in the reference condition with a swatch painted on the floor. The
// `scene` value selects the color-check reference lighting; `paint` is the swatch hex with
// its leading # stripped.
async function gotoPaintedReference(page: Page, sceneName: string, hex: string): Promise<void> {
  await page.goto(`/?fixture=scene-harness&scene=${sceneName}&paint=${hex}`)
}

// The harness self-skips only where no WebGL 2 context can be created (matching
// scene-solar.spec.ts); it renders through three's WebGL backend, not WebGPU.
async function requireWebGl2(page: Page): Promise<void> {
  const hasWebGl2 = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return probe.getContext('webgl2') !== null
  })
  test.skip(
    !hasWebGl2,
    'No WebGL 2 context on this runner; the color-accuracy gate self-skips here.',
  )
}

// The reference-lighting scene the gate renders under. Task 4 keeps this 'color-check' unless
// the auto-framed floor sample proves unreliable, in which case Task 4a swaps it for the
// gate-only floor-framing state and this constant changes in one place.
const REFERENCE_SCENE = 'color-check'

test.describe('Decorating color-accuracy gate', () => {
  for (const swatch of COLOR_ACCURACY_SWATCHES) {
    test(`the ${swatch.name} swatch reads within tolerance of its reference`, async ({ page }) => {
      const hex = swatch.color.srgbHex.slice(1)
      await gotoPaintedReference(page, REFERENCE_SCENE, hex)

      const harness = page.getByTestId('scene-harness')
      const canvas = harness.locator('canvas')
      await expect(canvas).toBeVisible()
      await requireWebGl2(page)
      await expect(harness).toHaveAttribute('data-harness-ready', 'true')

      const sampledSrgb = await sampleFloorColor(page, canvas)
      const sampled = colorFromOkLab(srgbToOkLab(sampledSrgb))
      const distance = perceptualDistance(sampled, swatch.color)

      expect(
        withinColorTolerance(sampled, swatch.color),
        `${swatch.name}: sampled ${sampled.srgbHex} vs reference ${swatch.color.srgbHex}, ` +
          `OKLab distance ${distance.toFixed(4)} > tolerance ${COLOR_ACCURACY_TOLERANCE}`,
      ).toBe(true)
    })
  }
})
```

- [ ] **Step 3: Run the gate locally (darwin has a Metal GPU, so it does not skip)**

Run: `pnpm build && pnpm exec playwright test --project=scene-webgl scene-color-accuracy`
Expected at this point: the three tests run (do not skip). They may PASS or FAIL depending on the provisional `0.05` tolerance and where the center patch lands. Proceed to Task 4 before trusting the result; the failure message prints the sampled hex, the reference hex, and the OKLab distance, which Task 4 reads.

Note: `pnpm build` first, because the `scene-webgl` project serves the built app from `http://localhost:4173` (`playwright.config.ts` `baseURL`). Confirm a preview server is serving, or run under the project's usual e2e harness that builds and previews.

- [ ] **Step 4: Commit the gate (calibration follows in Task 4)**

```bash
git add e2e/tests/scene-helpers.ts e2e/tests/scene-color-accuracy.spec.ts
git commit -m "test: gate decorating color accuracy against the reference condition"
```

---

## Task 4: Calibrate the tolerance and confirm the round-trip

The empirical heart of the slice. The orchestrator runs this from the main thread; it is a measurement loop, not a blind implementation. Do the round-trip check first, then set the tolerance from the observed spread, then confirm on both backends.

- [ ] **Step 1: Locate the floor sample patch**

Render the neutral-gray swatch and confirm the center patch lands on the floor.

Run: `pnpm exec playwright test --project=scene-webgl scene-color-accuracy -g 'Neutral mid-gray'`

Read the failure/pass message's sampled hex. A center patch on the neutral-gray floor reads as a near-neutral gray (roughly equal r, g, b, mid value). If instead it reads blue (sky), green (ground), or cream (a wall), the patch is off the floor:

- First, retune the patch center in `scene-helpers.ts` (`PATCH_CENTER_X_NUM/DEN`, `PATCH_CENTER_Y_NUM/DEN`) to a floor region, using the captured frame (temporarily add `await canvas.screenshot({ path: 'scratch-gray.png' })` in the spec, inspect it, then remove). The floor is visible through the shell's down-facing ceiling; a patch below and left of frame center is the likely floor region (compare the committed `scene-color-check` and `scene-shell-painted` baselines).
- If no fixed patch reliably reads the floor across runs and both backends, do Task 4a (add the floor-framing gate state), then set `REFERENCE_SCENE` in the spec to the new state name and set the patch center back to `1/2, 1/2` (the floor fills the frame under that camera).

Do not proceed until the neutral-gray sample reads as a gray.

- [ ] **Step 2: Measure the neutral-gray round-trip and escalate a systematic offset**

With the patch on the floor, read the printed OKLab distance for the neutral-gray case on darwin. This is the round-trip offset: the difference between the sampled lit floor and the gray's own albedo.

- If the distance is small (a few just-noticeable differences, comfortably under the provisional `0.05`), the round-trip holds. The reference is the raw albedo; continue.
- If the distance is a systematic offset beyond a small margin (for example consistently above roughly `0.03` in a fixed direction across repeated runs), STOP. This is a finding, not a tolerance to widen. Surface it to the owner: either the rig or the provider does not reproduce a mid albedo the way ADR-0156 asserts (an ADR-0156 revision), or the reference must be redefined as the expected rendered value rather than the raw albedo (a change to what the gate means). Both are the owner's call. Do not loosen the tolerance to hide it.

- [ ] **Step 3: Measure the cross-backend spread and set the tolerance**

Collect the sampled-to-swatch OKLab distance for all three swatches on both backends:

- darwin Metal, locally: run the full gate and record the three distances.
- linux SwiftShader, on CI: push the branch and let the `scene-webgl` CI lane run (`ci.yml` runs `playwright test --project=scene-webgl`). Read the three distances from the CI job log (the assertion message prints them; if the run passes and prints nothing, temporarily log the distance with `console.log` behind the assertion, or lower the tolerance to force the print, then restore).

Set `COLOR_ACCURACY_TOLERANCE` in `core/color/color-accuracy.ts` to the observed maximum of those six distances plus a margin (round to a clean value at or below the `0.05` provisional ceiling). Record the derivation in the constant's comment: the measured darwin max, the measured linux max, the margin, and the date.

- [ ] **Step 4: Confirm green on both backends**

Run locally: `pnpm exec playwright test --project=scene-webgl scene-color-accuracy`
Expected: three tests PASS on darwin.

Push and confirm the CI `scene-webgl` lane's three tests PASS on linux (and that they actually ran, not vacuously skipped: the job log must show three passing tests, not three skips).

- [ ] **Step 5: Run the full check chain and commit the calibrated tolerance**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: zero problems. (`core/color/color-accuracy.test.ts` asserts only that the tolerance is a positive number, so a new value does not break it.)

```bash
git add core/color/color-accuracy.ts e2e/tests/scene-helpers.ts
git commit -m "feat: pin the color-accuracy tolerance to the measured cross-backend spread"
```

---

## Task 4a (conditional): Gate-only floor-framing reference state

Do this only if Task 4, Step 1 shows the `scene=color-check` auto-frame yields no reliable floor patch. It adds a harness state that reuses the color-check reference lighting with an interior camera aimed at the floor, so the floor fills the frame. It carries no committed screenshot, so no baseline moves.

**Files:**

- Modify: `app/harness-environment.ts` (add the state and its camera pose)
- Modify: `app/harness-environment.test.ts` (assert the new state resolves)

**Interfaces:**

- Consumes: the existing `CANONICAL_SITE`, `EQUINOX_NOON_OBSERVATION`, `HARNESS_ENVIRONMENT_STATES`, `CameraPose` in `app/harness-environment.ts`.
- Produces: a new `HARNESS_ENVIRONMENT_STATES` entry keyed `'color-accuracy'`, and `resolveHarnessScene('color-accuracy') === 'shell'`.

- [ ] **Step 1: Write the failing test**

Add to `app/harness-environment.test.ts`, inside the `harnessEnvironmentState` describe block:

```ts
it('resolves color-accuracy to the color-check reference lighting with a floor-framing camera', () => {
  const state = harnessEnvironmentState('color-accuracy')
  expect(state?.colorCheck).toBe(true)
  expect(state?.realistic).toBe(true)
  expect(state?.observedAt).toEqual({ date: '2026-03-20', minutesSinceMidnight: 720 })
  expect(state?.scene).toBe('shell')
  expect(state?.cameraPose).toBeDefined()
})
```

And in the `resolveHarnessScene` describe block:

```ts
it('pairs the color-accuracy state with the shell geometry', () => {
  expect(resolveHarnessScene('color-accuracy')).toBe('shell')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/harness-environment.test.ts`
Expected: FAIL (the `color-accuracy` state does not exist yet).

- [ ] **Step 3: Add the state and its camera pose**

In `app/harness-environment.ts`, add near the other camera-pose constants:

```ts
// The shell interior is the plan rectangle (60, 60) to (3940, 2940) mm, 2600 mm tall;
// planToWorld maps plan (x, y) to world (x, height, -y), so the floor center at plan
// (2000, 1500) is world (2000, 0, -1500). This pose stands high near the south wall and
// looks down and north at the floor center, so the floor fills the frame under the same
// color-check reference lighting, with little wall or ceiling in view. Starting values only;
// tuned against the capture so the center sample patch is unambiguously floor.
const COLOR_ACCURACY_FLOOR_CAMERA: CameraPose = {
  position: { x: 2000, y: 2200, z: -600 },
  target: { x: 2000, y: 0, z: -1600 },
  near: 100,
  far: 10000,
}
```

Add the state to the `HARNESS_ENVIRONMENT_STATES` map (after the `color-check` entry):

```ts
[
  'color-accuracy',
  {
    site: CANONICAL_SITE,
    observedAt: EQUINOX_NOON_OBSERVATION,
    realistic: true,
    colorCheck: true,
    scene: 'shell',
    cameraPose: COLOR_ACCURACY_FLOOR_CAMERA,
  },
],
```

Extend the map's leading comment so it mentions the color-accuracy state alongside the others that share `EQUINOX_NOON_OBSERVATION`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/harness-environment.test.ts`
Expected: PASS. (The module's own disjointness test still holds: `color-accuracy` is not one of `HARNESS_GEOMETRY_SCENE_KEYS`.)

- [ ] **Step 5: Point the gate at the new state and confirm**

In `e2e/tests/scene-color-accuracy.spec.ts` set `const REFERENCE_SCENE = 'color-accuracy'` and reset the patch center in `scene-helpers.ts` to frame center (`1/2, 1/2`). Return to Task 4, Step 1 to confirm the neutral-gray sample now reads as gray, then continue the calibration.

- [ ] **Step 6: Commit**

```bash
git add app/harness-environment.ts app/harness-environment.test.ts e2e/tests/scene-color-accuracy.spec.ts e2e/tests/scene-helpers.ts
git commit -m "feat: frame the shell floor for the color-accuracy gate"
```

Close the cycle with `/clean-code-review` then `/refactor`.

---

## Task 5: ADR-0157 and knowledge curation

Record the gate's design so a future session picks up the reasoning.

**Files:**

- Create: `docs/knowledge/decisions/ADR-0157-color-accuracy-gate.md`

- [ ] **Step 1: Scaffold the ADR**

Run: `/adr color-accuracy-gate "Color-accuracy gate"` (this assigns and scaffolds; confirm it lands as ADR-0157, the pre-assigned number, and re-verify 0157 is still free on `main` before committing).

- [ ] **Step 2: Write the decision**

Record, in prose that passes the `humanizer` pass (ADRs are human-read):

- **Mechanism:** hybrid render-and-sample. Why not a pure-core analytic model (it would not catch a real illuminant, tone-map, or color-managed-output regression) and why not a committed pixel baseline (the gate asserts a color within a tolerance, not an unchanged image).
- **Metric:** OKLab `perceptualDistance`. Why not CIEDE2000 (it would add a CIELAB and D65 conversion the repo does not have, for accuracy the gate does not need), and the migration path (the gate reads its metric through the single `perceptualDistance` seam, so a CIEDE2000 sibling can be added and the gate migrated by changing one call).
- **Tolerance:** the empirical derivation, with the measured darwin and linux numbers and the margin.
- **Swatch set:** the three mid-range swatches and why near-white and near-black are deferred (tone-map shoulder and toe).
- **The two refinements to the spec's prose, for owner sign-off:** (1) the gate self-skips on WebGL 2, not WebGPU, because it renders through the harness WebGL backend and must run on both backends to measure the spread; (2) it samples the floor under the color-check reference lighting through a floor-framing camera when the default frame's floor is unreliable, which preserves ADR-0156's reference condition exactly (only the camera differs) while giving a clean sample. If Task 4a was not needed, state that the literal `scene=color-check` frame was sufficient and record the sample patch.
- **Citations:** ADR-0156 (the reference condition; it defers the tolerance and color space to this slice), ADR-0147, ADR-0148, ADR-0130, ADR-0067, ADR-0065.
- If Task 4, Step 2 forced an ADR-0156 revision, land that revision in this same change and cross-reference it here.

- [ ] **Step 3: Regenerate the local knowledge index (optional, gitignored) and commit**

```bash
pnpm knowledge:index   # optional; regenerates the gitignored local index
git add docs/knowledge/decisions/ADR-0157-color-accuracy-gate.md
git commit -m "docs: record the color-accuracy gate decision in ADR-0157"
```

---

## Pre-merge

- [ ] Run the full check chain, verifying each command's own exit code: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`.
- [ ] Run the gate on both backends: darwin locally and the linux `scene-webgl` CI lane; confirm three passing tests on each, not skips.
- [ ] `/clean-code-review` and `/review` (the pr-reviewer verifies the red-green-blue commit sequence and the ADR landed).
- [ ] Surface the two spec-prose refinements (WebGL 2 self-skip; floor-framing camera) to the owner for sign-off, and the `PaintMaterialProvider` retire-or-reserve follow-up if still open.
- [ ] Confirm no committed baseline moved: `git status` shows no changes under any `*-snapshots/` directory.
- [ ] File the deferred near-white/near-black tone-map-extreme gate as a follow-up issue.
- [ ] Window author and committer dates out of employer hours (Mon-Fri 08:30-18:30 local) before the first push.

## Self-review against the spec

- **Three mid-range swatches defined in core, rendered by the gate** — Task 1 (`COLOR_ACCURACY_SWATCHES`), Task 3 (the gate loops them). Covered.
- **Core predicate, OKLab `perceptualDistance`, unit-tested same-color pass and shifted-color fail** — Task 1 (`withinColorTolerance` + tests). Covered.
- **Tolerance a named core constant, measured spread plus margin, derivation in comment and ADR** — Task 1 (constant), Task 4 (measurement), Task 5 (ADR). Covered.
- **Harness paint mode paints the floor an arbitrary swatch color, matte, without changing `paint=demo`** — Task 2. Covered.
- **`scene-webgl` gate renders each swatch under the reference condition, samples the lit floor, asserts within tolerance, self-skips without WebGL 2, commits no pixel baseline** — Task 3 (+ Task 4a if needed). Covered. (Self-skip refined to WebGL 2 per the design decision, documented in ADR-0157.)
- **Neutral-gray round-trip measured before the tolerance is set; a systematic offset surfaced, not absorbed** — Task 4, Steps 2-3. Covered.
- **Gate passes on CI linux and locally on darwin** — Task 4, Step 4 and Pre-merge. Covered.
- **No baseline moves** — Global Constraints and Pre-merge check. Covered.
- **ADR-0157 records mechanism, metric, tolerance, swatch set, cites ADR-0156** — Task 5. Covered.
