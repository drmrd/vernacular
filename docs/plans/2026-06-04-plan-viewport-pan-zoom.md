# Plan Viewport: Pan, Zoom, Grid, and Rulers Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The test and implementation code shown in each task are the **controller's reference blueprint**, not handed to the agents verbatim: the `test-author` authors its test independently from the behavior description plus the public signatures, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fixed scale-only plan viewport into an interactive infinite canvas: smooth (non-stepped) pan and zoom-to-cursor, an adaptive grid, and rulers, with every coordinate transform and grid/ruler computation living in pure, unit-tested modules and only thin Canvas-and-pointer glue in `PlanView`.

**Architecture:** Extend `editor/plan/viewport.ts` from a single `scale` to `scale` plus a screen-pixel `offset` (pan), so `worldToScreen`/`screenToWorld` account for both; add pure viewport operations (`panBy`, `clampScale`, `zoomAtCursor`, `wheelZoomFactor`) and a shared 1-D axis-sampling primitive (`axisSamples`). New pure modules derive an adaptive grid (`grid.ts`) and ruler ticks (`ruler.ts`) from that primitive; `draw-plan.ts` grows `drawGrid` and `drawRulers` behind the existing narrow `PlanDrawingContext` seam (ADR-0021) and `drawPlan` orchestrates the paint order (grid beneath rooms, rulers above walls). A pure `fit.ts` computes a snap-to-fit viewport from content bounds. `PlanView` holds the viewport in React state and wires middle-mouse / spacebar-drag pan, scroll/trackpad zoom-to-cursor, and a fit-to-content key to the pure pieces.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, Vitest for units. No new dependencies. No `core/` change (slice stays entirely within `editor/plan/`).

**Status: complete.** All sections landed on `feat/plan-viewport-pan-zoom` via the red-green-blue cycle (full check chain green, `eslint .` at zero problems, `rgb:audit` clean). ADR-0030 (the viewport projection model) was recorded in the local knowledge graph and `ROADMAP.md` marks the slice done with its deferrals. Deviations from the blueprint below, all settled during GREEN/BLUE:

- **`gridSpacingMm`** could not use the nested ternary in the Task C1 snippet (the repo lints `no-nested-ternary` and `no-magic-numbers`): it ships as a `NICE_MULTIPLIERS.find(...)` selection with named `DECADE_BASE`/`HALF_DECADE` constants, behavior-identical.
- **Drawing helpers extracted during BLUE:** `gridLinesAlongAxis` (grid) and `drawRulerTicks` (rulers) were factored out to remove the per-axis duplication, each using an options/`span` object to stay within `max-params`.
- **`PlanView` glue split into two files** to satisfy `max-lines`: the camera input (pan, zoom, fit) moved to `editor/plan/use-viewport-controls.ts`, leaving `plan-view.tsx` as tool/render wiring. Both stay coverage-excluded glue.
- **Snap-to-fit:** the cheap pure path shipped (`computeFitViewport` + `contentBounds`) with fit-to-content wired to the `f` key; fit-to-selection is deferred to slice 5, as planned.

---

## Scope boundary (design spec §6.2, §6.6, §10 Phase 1; this is slice 3 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 3: pan and zoom infinite canvas, grid, rulers**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slice 1 (wall topology and room derivation) is complete; slices 2 (units) and 11 (project stores) are being built in parallel worktrees and own `core/units/`, `storage/`, and `core/migrations/` respectively. **This slice touches only `editor/plan/`** (plus `ROADMAP.md` and the local knowledge graph), to avoid colliding with the shell-chrome and `app/` save/open work.

**In scope for slice 3:**

- `editor/plan/viewport.ts`: a screen-pixel `offset` on `Viewport`; `worldToScreen`/`screenToWorld` honoring pan and zoom; `panBy`, `clampScale`, `zoomAtCursor` (zoom about the cursor), `wheelZoomFactor` (continuous, non-stepped), and the shared `axisProjection` / `axisSamples` stepping primitive. `ScreenPoint` and `ViewportSize` types.
- `editor/plan/fit.ts`: `contentBounds` (axis-aligned bounds of points) and `computeFitViewport` (scale-and-center bounds into the canvas with padding) — powers snap-to-fit and snap-to-selection.
- `editor/plan/grid.ts`: `gridSpacingMm` (adaptive 1-2-5 nice-number spacing) and `visibleGridLines`.
- `editor/plan/ruler.ts`: `rulerTicks` (tick positions plus raw-millimetre labels).
- `editor/plan/draw-plan.ts`: `drawGrid` and `drawRulers` behind an extended `PlanDrawingContext`; `drawPlan` orchestrates grid beneath content and rulers above it, gated by options.
- `editor/plan/plan-view.tsx`: viewport in React state; middle-mouse / spacebar-drag pan, scroll/trackpad zoom-to-cursor, fit-to-content key; grid and rulers enabled.

**Out of scope for slice 3, deferred with intent (also recorded in `ROADMAP.md`):**

- **Unit-aware ruler/grid labels.** Ruler labels show the **raw millimetre value** (for example `"1000"`). Human-readable, unit-aware labels (for example `1 m` / `3' 4"`) need the formatters from **slice 2 (units & measurement)** and follow there. This mirrors the slice-1 deferral of formatted area labels.
- **Snap-to-selection wiring.** `computeFitViewport` accepts any bounds, so fit-to-selection is a one-line caller change once selection bounds are wanted; this slice wires only **fit-to-content** to a key. Fit-to-selection UI is a follow-up (selection lands fully in slice 5).
- **DOM overlay mirroring (CSS world matrix), inertia/animated camera, and a ruler/grid toggle in chrome.** The spec's DOM overlay for interactive UI (§6.2) and any toolbar controls are later polish; this slice renders grid and rulers on the Canvas and pans/zooms without animation.
- **Visual-regression baseline refresh.** Grid and rulers are an intentional change to the rendered plan, so the darwin `home-chromium-darwin.png` baseline differs. CI skips visual regression where no platform baseline exists (linux), so CI stays green; the darwin baseline refresh is a documented follow-up (it is a generated artifact, regenerated with `pnpm e2e:update-snapshots`). The **functional** wall-drawing e2e is unaffected because the default viewport keeps `scale = DEFAULT_PLAN_SCALE` and a zero offset, leaving the pointer-to-world mapping identical.

**Acceptance for slice 3:** `worldToScreen`/`screenToWorld` round-trip under pan and zoom; `panBy` translates by a screen delta; `zoomAtCursor` keeps the world point under the cursor fixed and clamps to `[MIN_PLAN_SCALE, MAX_PLAN_SCALE]`; `wheelZoomFactor` is continuous and direction-correct; `computeFitViewport` centers and scales content with padding; `gridSpacingMm` returns 1-2-5 nice spacing that never falls below the minimum on-screen gap; `visibleGridLines` and `rulerTicks` cover the canvas at that spacing under pan/zoom; `drawGrid`/`drawRulers` paint through the narrow seam, with grid beneath rooms and rulers above walls. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the functional wall-drawing e2e still passes.

---

## File structure

New and modified files, grouped by responsibility:

```
editor/plan/
  viewport.ts        (modify)  offset on Viewport; pan/zoom ops; axis sampling primitive
  viewport.test.ts   (modify)  pan/zoom/sampling behaviors (slice-1 tests stay green)
  fit.ts             (create)  contentBounds, computeFitViewport
  fit.test.ts        (create)
  grid.ts            (create)  gridSpacingMm, visibleGridLines
  grid.test.ts       (create)
  ruler.ts           (create)  rulerTicks
  ruler.test.ts      (create)
  draw-plan.ts       (modify)  drawGrid, drawRulers; drawPlan orchestration + seam growth
  draw-plan.test.ts  (modify)  grid/ruler drawing + order (slice-1 tests stay green)
  plan-view.tsx      (modify, infra)  viewport state; pan/zoom/fit glue; enable grid+rulers

ROADMAP.md           (modify, infra)  mark slice 3 complete; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slice 1 confirmed. `viewport.ts` is the shared home for the `ScreenPoint` / `ViewportSize` types and the `axisProjection` / `axisSamples` primitive that `grid.ts` and `ruler.ts` both consume (keeps the stepping logic DRY and lets `pnpm dup` stay quiet). `PlanView` is coverage-excluded glue (jsdom has no 2D canvas), validated by the existing wall-drawing end-to-end spec.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// editor/plan/viewport.ts
export const DEFAULT_PLAN_SCALE = 0.08 // unchanged
export const MIN_PLAN_SCALE = 0.002 // ~1 m spans 2 px (far zoom-out)
export const MAX_PLAN_SCALE = 4 // 1 mm spans 4 px (close zoom-in)

export interface ScreenPoint {
  x: number
  y: number
}
export interface ViewportSize {
  width: number
  height: number
}

/** Pan is a screen-pixel translation of the world origin. Absent offset means the origin (no pan). */
export interface Viewport {
  scale: number
  offset?: ScreenPoint
}

export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint
export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point
export function panBy(viewport: Viewport, deltaPx: ScreenPoint): Viewport
export function clampScale(scale: number): number
/** New viewport scaled by `factor` (clamped) about `cursor`, keeping the world point under the cursor fixed. */
export function zoomAtCursor(viewport: Viewport, cursor: ScreenPoint, factor: number): Viewport
/** Continuous (non-stepped) zoom multiplier from a wheel deltaY; >1 zooms in (deltaY<0), <1 zooms out. */
export function wheelZoomFactor(deltaY: number): number

/** A 1-D affine map screen = world * scale + translate, for one axis of a viewport. */
export interface AxisProjection {
  scale: number
  translate: number
}
export function axisProjection(
  viewport: Viewport,
  orientation: 'horizontal' | 'vertical',
): AxisProjection
export interface AxisSample {
  worldValue: number
  screen: number
}
/** World multiples of `spacingMm` visible across [0, lengthPx], with their screen positions. */
export function axisSamples(
  projection: AxisProjection,
  lengthPx: number,
  spacingMm: number,
): AxisSample[]

// editor/plan/fit.ts
export interface Bounds {
  min: Point
  max: Point
}
export function contentBounds(points: readonly Point[]): Bounds | null
export function computeFitViewport(bounds: Bounds, size: ViewportSize, paddingPx?: number): Viewport

// editor/plan/grid.ts
export const GRID_MIN_LINE_SPACING_PX = 12
export function gridSpacingMm(scale: number): number
export interface GridLine {
  orientation: 'vertical' | 'horizontal'
  worldValue: number
  screen: number
}
export interface VisibleGrid {
  spacingMm: number
  lines: GridLine[]
}
export function visibleGridLines(viewport: Viewport, size: ViewportSize): VisibleGrid

// editor/plan/ruler.ts
export const RULER_THICKNESS_PX = 20
export interface RulerTick {
  worldValue: number
  screen: number
  label: string
}
export function rulerTicks(
  viewport: Viewport,
  lengthPx: number,
  orientation: 'horizontal' | 'vertical',
): RulerTick[]

// editor/plan/draw-plan.ts (additions)
export function drawGrid(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void
export function drawRulers(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void
// PlanDrawingContext gains: fillText, fillRect, font, textAlign, textBaseline
// DrawPlanOptions gains: grid?: boolean; rulers?: boolean (absent = off; PlanView enables both)
```

---

## Section A: viewport pan and zoom (`editor/plan/viewport.ts`)

### Task A1: projection honors a pan offset

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (`/test-first` — behavior: "worldToScreen and screenToWorld account for a screen-pixel pan offset and still round-trip")

```ts
import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld } from './viewport'

describe('viewport pan offset', () => {
  it('translates world points by the screen-pixel offset', () => {
    const viewport = { scale: 0.1, offset: { x: 30, y: -20 } }
    expect(worldToScreen({ x: 1000, y: 2000 }, viewport)).toEqual({ x: 130, y: 180 })
  })

  it('round-trips screen back to world under pan and zoom', () => {
    const viewport = { scale: 0.08, offset: { x: 45, y: 60 } }
    const screen = worldToScreen({ x: 1234, y: 5678 }, viewport)
    expect(screenToWorld(screen, viewport)).toEqual({ x: 1234, y: 5678 })
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run editor/plan/viewport.test.ts`
Expected: FAIL (offset is ignored; `worldToScreen` returns `{ x: 100, y: 200 }`).

- [ ] **Step 3: Minimal implementation** — add `ScreenPoint`/`ViewportSize`, the optional `offset`, and the `MIN`/`MAX` constants, and fold the offset into both transforms:

```ts
import type { Point } from '../../core'

export const DEFAULT_PLAN_SCALE = 0.08
export const MIN_PLAN_SCALE = 0.002
export const MAX_PLAN_SCALE = 4

export interface ScreenPoint {
  x: number
  y: number
}
export interface ViewportSize {
  width: number
  height: number
}
export interface Viewport {
  scale: number
  offset?: ScreenPoint
}

const ORIGIN: ScreenPoint = { x: 0, y: 0 }
const offsetOf = (viewport: Viewport): ScreenPoint => viewport.offset ?? ORIGIN

export function worldToScreen(point: Point, viewport: Viewport): ScreenPoint {
  const offset = offsetOf(viewport)
  return { x: point.x * viewport.scale + offset.x, y: point.y * viewport.scale + offset.y }
}

export function screenToWorld(screen: ScreenPoint, viewport: Viewport): Point {
  const offset = offsetOf(viewport)
  return { x: (screen.x - offset.x) / viewport.scale, y: (screen.y - offset.y) / viewport.scale }
}
```

- [ ] **Step 4: Run to verify GREEN** — Run: `pnpm exec vitest run editor/plan/viewport.test.ts`. Expected: PASS. The slice-1 tests (no `offset`) still pass because `offsetOf` defaults to the origin.

- [ ] **Step 5: BLUE + commit** — `/clean-code-review` then `/refactor`.

### Task A2: `panBy` translates the offset by a screen delta

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "panBy adds a screen-pixel delta to the viewport offset")

```ts
import { panBy } from './viewport'

describe('panBy', () => {
  it('adds a screen-pixel delta to the offset', () => {
    expect(panBy({ scale: 0.1 }, { x: 12, y: -8 }).offset).toEqual({ x: 12, y: -8 })
    expect(panBy({ scale: 0.1, offset: { x: 5, y: 5 } }, { x: 10, y: 20 }).offset).toEqual({
      x: 15,
      y: 25,
    })
  })

  it('leaves the scale unchanged', () => {
    expect(panBy({ scale: 0.1 }, { x: 10, y: 10 }).scale).toBe(0.1)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`panBy` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export function panBy(viewport: Viewport, deltaPx: ScreenPoint): Viewport {
  const offset = offsetOf(viewport)
  return { ...viewport, offset: { x: offset.x + deltaPx.x, y: offset.y + deltaPx.y } }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A3: `clampScale` bounds the zoom

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "clampScale holds the scale within [MIN_PLAN_SCALE, MAX_PLAN_SCALE]")

```ts
import { clampScale, MIN_PLAN_SCALE, MAX_PLAN_SCALE } from './viewport'

describe('clampScale', () => {
  it('clamps below the minimum and above the maximum, passing through in-range values', () => {
    expect(clampScale(MIN_PLAN_SCALE / 10)).toBe(MIN_PLAN_SCALE)
    expect(clampScale(MAX_PLAN_SCALE * 10)).toBe(MAX_PLAN_SCALE)
    expect(clampScale(0.1)).toBe(0.1)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`clampScale` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export function clampScale(scale: number): number {
  return Math.min(MAX_PLAN_SCALE, Math.max(MIN_PLAN_SCALE, scale))
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A4: `zoomAtCursor` zooms about the cursor

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "zoomAtCursor scales by the factor and keeps the world point under the cursor fixed; it clamps at the limits")

```ts
import { zoomAtCursor, worldToScreen, screenToWorld, MAX_PLAN_SCALE } from './viewport'

describe('zoomAtCursor', () => {
  it('scales by the factor and keeps the world point under the cursor fixed', () => {
    const viewport = { scale: 0.1, offset: { x: 0, y: 0 } }
    const cursor = { x: 300, y: 200 }
    const worldUnder = screenToWorld(cursor, viewport)
    const zoomed = zoomAtCursor(viewport, cursor, 2)

    expect(zoomed.scale).toBe(0.2)
    const after = worldToScreen(worldUnder, zoomed)
    expect(after.x).toBeCloseTo(cursor.x, 6)
    expect(after.y).toBeCloseTo(cursor.y, 6)
  })

  it('clamps to the maximum scale', () => {
    const zoomed = zoomAtCursor(
      { scale: MAX_PLAN_SCALE, offset: { x: 0, y: 0 } },
      { x: 0, y: 0 },
      4,
    )
    expect(zoomed.scale).toBe(MAX_PLAN_SCALE)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`zoomAtCursor` not exported).

- [ ] **Step 3: Minimal implementation** — solve the fixed point: the world point under the cursor must reproject to the same screen point at the new scale, so `offset' = cursor - worldUnder * scale'`:

```ts
export function zoomAtCursor(viewport: Viewport, cursor: ScreenPoint, factor: number): Viewport {
  const scale = clampScale(viewport.scale * factor)
  const worldUnder = screenToWorld(cursor, viewport)
  return {
    scale,
    offset: { x: cursor.x - worldUnder.x * scale, y: cursor.y - worldUnder.y * scale },
  }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A5: `wheelZoomFactor` is continuous and direction-correct

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "wheelZoomFactor returns a continuous multiplier: >1 for scroll-up, <1 for scroll-down, 1 at rest")

```ts
import { wheelZoomFactor } from './viewport'

describe('wheelZoomFactor', () => {
  it('zooms in for negative deltaY and out for positive deltaY', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
  })

  it('is continuous (non-stepped): a larger scroll magnitude moves the factor further from 1', () => {
    expect(wheelZoomFactor(-50)).toBeLessThan(wheelZoomFactor(-100))
    expect(wheelZoomFactor(50)).toBeGreaterThan(wheelZoomFactor(100))
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`wheelZoomFactor` not exported).

- [ ] **Step 3: Minimal implementation** — an exponential keeps the factor smooth and symmetric in log-space:

```ts
const ZOOM_WHEEL_SENSITIVITY = 0.0015

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY)
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A6: `axisSamples` steps world multiples across the visible length

**Files:**

- Modify: `editor/plan/viewport.ts`
- Test: `editor/plan/viewport.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "axisSamples returns the world multiples of the spacing visible across [0, lengthPx] with their screen positions; axisProjection reads one axis of the viewport")

```ts
import { axisProjection, axisSamples } from './viewport'

describe('axisSamples', () => {
  it('steps world multiples of the spacing across the visible length, projected to screen', () => {
    const samples = axisSamples({ scale: 0.1, translate: 0 }, 100, 200)
    expect(samples.map((s) => s.worldValue)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(samples.map((s) => s.screen)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('includes only multiples within the visible range when panned', () => {
    // screen = world * 0.1 - 50; visible world is [500, 1500]
    const samples = axisSamples({ scale: 0.1, translate: -50 }, 100, 500)
    expect(samples.map((s) => s.worldValue)).toEqual([500, 1000, 1500])
  })
})

describe('axisProjection', () => {
  it('reads the horizontal axis (scale, x-offset) and the vertical axis (scale, y-offset)', () => {
    const viewport = { scale: 0.1, offset: { x: 30, y: -20 } }
    expect(axisProjection(viewport, 'horizontal')).toEqual({ scale: 0.1, translate: 30 })
    expect(axisProjection(viewport, 'vertical')).toEqual({ scale: 0.1, translate: -20 })
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`axisProjection` / `axisSamples` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export interface AxisProjection {
  scale: number
  translate: number
}

export function axisProjection(
  viewport: Viewport,
  orientation: 'horizontal' | 'vertical',
): AxisProjection {
  const offset = offsetOf(viewport)
  return { scale: viewport.scale, translate: orientation === 'horizontal' ? offset.x : offset.y }
}

export interface AxisSample {
  worldValue: number
  screen: number
}

export function axisSamples(
  projection: AxisProjection,
  lengthPx: number,
  spacingMm: number,
): AxisSample[] {
  const { scale, translate } = projection
  const worldAtStart = (0 - translate) / scale
  const worldAtEnd = (lengthPx - translate) / scale
  const low = Math.min(worldAtStart, worldAtEnd)
  const high = Math.max(worldAtStart, worldAtEnd)
  const samples: AxisSample[] = []
  for (let world = Math.ceil(low / spacingMm) * spacingMm; world <= high; world += spacingMm) {
    samples.push({ worldValue: world, screen: world * scale + translate })
  }
  return samples
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

---

## Section B: fit to content (`editor/plan/fit.ts`)

### Task B1: `contentBounds` is the axis-aligned bounds of points

**Files:**

- Create: `editor/plan/fit.ts`
- Test: `editor/plan/fit.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "contentBounds returns the min/max corner of a point set, or null when empty")

```ts
import { describe, it, expect } from 'vitest'
import { contentBounds } from './fit'

describe('contentBounds', () => {
  it('returns the axis-aligned bounds of the points', () => {
    expect(
      contentBounds([
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 1000, y: -500 },
      ]),
    ).toEqual({ min: { x: 0, y: -500 }, max: { x: 4000, y: 3000 } })
  })

  it('returns null when there are no points', () => {
    expect(contentBounds([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`contentBounds` not exported / module not found).

- [ ] **Step 3: Minimal implementation**

```ts
import type { Point } from '../../core'

export interface Bounds {
  min: Point
  max: Point
}

export function contentBounds(points: readonly Point[]): Bounds | null {
  const [first, ...rest] = points
  if (first === undefined) {
    return null
  }
  let minX = first.x
  let minY = first.y
  let maxX = first.x
  let maxY = first.y
  for (const point of rest) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task B2: `computeFitViewport` scales and centers bounds into the canvas

**Files:**

- Modify: `editor/plan/fit.ts`
- Test: `editor/plan/fit.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "computeFitViewport scales bounds to fit the canvas with padding and centers them")

```ts
import { computeFitViewport } from './fit'
import { worldToScreen } from './viewport'

describe('computeFitViewport', () => {
  it('scales the bounds to fit within the padded canvas and centers them', () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } }
    const viewport = computeFitViewport(bounds, { width: 800, height: 600 }, 24)

    // The tighter of (752/4000, 552/3000) governs the scale; height is tighter here.
    expect(viewport.scale).toBeCloseTo(552 / 3000, 9)
    // The world center maps to the canvas center.
    const center = worldToScreen({ x: 2000, y: 1500 }, viewport)
    expect(center.x).toBeCloseTo(400, 6)
    expect(center.y).toBeCloseTo(300, 6)
  })

  it('keeps the scale within the zoom limits for a degenerate (single-point) bounds', () => {
    const bounds = { min: { x: 100, y: 100 }, max: { x: 100, y: 100 } }
    const viewport = computeFitViewport(bounds, { width: 800, height: 600 })
    expect(viewport.scale).toBeLessThanOrEqual(4)
    expect(viewport.scale).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`computeFitViewport` not exported).

- [ ] **Step 3: Minimal implementation** — fit the tighter axis, clamp, then center the bounds:

```ts
import { clampScale, MAX_PLAN_SCALE, type Viewport, type ViewportSize } from './viewport'

const DEFAULT_FIT_PADDING_PX = 24

export function computeFitViewport(
  bounds: Bounds,
  size: ViewportSize,
  paddingPx: number = DEFAULT_FIT_PADDING_PX,
): Viewport {
  const worldWidth = bounds.max.x - bounds.min.x
  const worldHeight = bounds.max.y - bounds.min.y
  const availableWidth = size.width - 2 * paddingPx
  const availableHeight = size.height - 2 * paddingPx
  const scale = clampScale(
    Math.min(
      worldWidth > 0 ? availableWidth / worldWidth : MAX_PLAN_SCALE,
      worldHeight > 0 ? availableHeight / worldHeight : MAX_PLAN_SCALE,
    ),
  )
  const centerX = (bounds.min.x + bounds.max.x) / 2
  const centerY = (bounds.min.y + bounds.max.y) / 2
  return {
    scale,
    offset: { x: size.width / 2 - centerX * scale, y: size.height / 2 - centerY * scale },
  }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

---

## Section C: adaptive grid (`editor/plan/grid.ts`)

### Task C1: `gridSpacingMm` picks adaptive 1-2-5 nice spacing

**Files:**

- Create: `editor/plan/grid.ts`
- Test: `editor/plan/grid.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "gridSpacingMm returns a 1-2-5 nice-number world spacing whose on-screen size never drops below the minimum gap")

```ts
import { describe, it, expect } from 'vitest'
import { gridSpacingMm, GRID_MIN_LINE_SPACING_PX } from './grid'

describe('gridSpacingMm', () => {
  it('rounds up to a 1-2-5 nice number for the on-screen minimum gap', () => {
    // minimum world gap = GRID_MIN_LINE_SPACING_PX / scale, rounded up to 1-2-5 * 10^k
    expect(gridSpacingMm(0.1)).toBe(200) // 12 / 0.1 = 120 -> 200
    expect(gridSpacingMm(0.01)).toBe(2000) // 1200 -> 2000
    expect(gridSpacingMm(1)).toBe(20) // 12 -> 20
  })

  it('never returns a spacing whose on-screen size is below the minimum gap', () => {
    for (const scale of [0.002, 0.03, 0.08, 0.5, 4]) {
      expect(gridSpacingMm(scale) * scale).toBeGreaterThanOrEqual(GRID_MIN_LINE_SPACING_PX)
    }
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`gridSpacingMm` / `GRID_MIN_LINE_SPACING_PX` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
export const GRID_MIN_LINE_SPACING_PX = 12

export function gridSpacingMm(scale: number): number {
  const minWorld = GRID_MIN_LINE_SPACING_PX / scale
  const magnitude = 10 ** Math.floor(Math.log10(minWorld))
  const normalized = minWorld / magnitude // in [1, 10)
  const niceMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceMultiplier * magnitude
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C2: `visibleGridLines` covers the canvas at the adaptive spacing

**Files:**

- Modify: `editor/plan/grid.ts`
- Test: `editor/plan/grid.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "visibleGridLines returns the vertical and horizontal world-aligned lines crossing the canvas, with their screen positions, at the adaptive spacing")

```ts
import { visibleGridLines } from './grid'

describe('visibleGridLines', () => {
  it('returns vertical and horizontal lines covering the canvas at the adaptive spacing', () => {
    const viewport = { scale: 0.1, offset: { x: 0, y: 0 } }
    const grid = visibleGridLines(viewport, { width: 100, height: 100 })

    expect(grid.spacingMm).toBe(200) // gridSpacingMm(0.1)
    const verticals = grid.lines.filter((line) => line.orientation === 'vertical')
    const horizontals = grid.lines.filter((line) => line.orientation === 'horizontal')
    expect(verticals.map((line) => line.worldValue)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(verticals.every((line) => line.screen === line.worldValue * 0.1)).toBe(true)
    expect(horizontals).toHaveLength(6)
  })

  it('shifts the visible lines when the viewport is panned', () => {
    const grid = visibleGridLines(
      { scale: 0.1, offset: { x: -50, y: 0 } },
      { width: 100, height: 50 },
    )
    const verticals = grid.lines.filter((line) => line.orientation === 'vertical')
    // visible world x is [500, 1500]; verticals at multiples of 200 within it
    expect(verticals.map((line) => line.worldValue)).toEqual([600, 800, 1000, 1200, 1400])
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`visibleGridLines` not exported).

- [ ] **Step 3: Minimal implementation** — reuse the shared axis primitive so vertical lines come from the horizontal axis (constant world x) and horizontal lines from the vertical axis:

```ts
import { axisProjection, axisSamples, type Viewport, type ViewportSize } from './viewport'

export interface GridLine {
  orientation: 'vertical' | 'horizontal'
  worldValue: number
  screen: number
}

export interface VisibleGrid {
  spacingMm: number
  lines: GridLine[]
}

export function visibleGridLines(viewport: Viewport, size: ViewportSize): VisibleGrid {
  const spacingMm = gridSpacingMm(viewport.scale)
  const verticals = axisSamples(axisProjection(viewport, 'horizontal'), size.width, spacingMm).map(
    (sample): GridLine => ({
      orientation: 'vertical',
      worldValue: sample.worldValue,
      screen: sample.screen,
    }),
  )
  const horizontals = axisSamples(axisProjection(viewport, 'vertical'), size.height, spacingMm).map(
    (sample): GridLine => ({
      orientation: 'horizontal',
      worldValue: sample.worldValue,
      screen: sample.screen,
    }),
  )
  return { spacingMm, lines: [...verticals, ...horizontals] }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

---

## Section D: rulers (`editor/plan/ruler.ts`)

### Task D1: `rulerTicks` positions ticks with raw-millimetre labels

**Files:**

- Create: `editor/plan/ruler.ts`
- Test: `editor/plan/ruler.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "rulerTicks returns ticks at the grid spacing with screen positions and raw-millimetre labels, honoring pan and zoom")

```ts
import { describe, it, expect } from 'vitest'
import { rulerTicks } from './ruler'

describe('rulerTicks', () => {
  it('places ticks at the grid spacing with raw-millimetre labels along the horizontal axis', () => {
    const ticks = rulerTicks({ scale: 0.1, offset: { x: 0, y: 0 } }, 100, 'horizontal')
    expect(ticks.map((tick) => tick.worldValue)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(ticks.map((tick) => tick.label)).toEqual(['0', '200', '400', '600', '800', '1000'])
    expect(ticks[0]?.screen).toBe(0)
  })

  it('uses the vertical-axis offset for vertical ruler ticks', () => {
    const ticks = rulerTicks({ scale: 0.1, offset: { x: 0, y: -50 } }, 50, 'vertical')
    // visible world y is [500, 1000]; ticks at multiples of 200 within it
    expect(ticks.map((tick) => tick.worldValue)).toEqual([600, 800, 1000])
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`rulerTicks` not exported).

- [ ] **Step 3: Minimal implementation** — share the grid spacing and axis primitive; the label is the raw rounded millimetre value (unit-aware formatting is deferred to the units slice):

```ts
import { gridSpacingMm } from './grid'
import { axisProjection, axisSamples, type Viewport } from './viewport'

export const RULER_THICKNESS_PX = 20

export interface RulerTick {
  worldValue: number
  screen: number
  label: string
}

export function rulerTicks(
  viewport: Viewport,
  lengthPx: number,
  orientation: 'horizontal' | 'vertical',
): RulerTick[] {
  const spacingMm = gridSpacingMm(viewport.scale)
  return axisSamples(axisProjection(viewport, orientation), lengthPx, spacingMm).map((sample) => ({
    worldValue: sample.worldValue,
    screen: sample.screen,
    // Raw millimetre value; unit-aware formatting arrives with the units slice.
    label: String(Math.round(sample.worldValue)),
  }))
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

---

## Section E: Canvas drawing (`editor/plan/draw-plan.ts`)

### Task E1: `drawGrid` strokes the grid lines

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawGrid strokes one vertical line per visible column and one horizontal line per row, spanning the canvas, in a single grid color")

The slice-1 `recordingContext()` already records `segments` (with `from`, `to`, `style`) and `ops`; this test reuses it unchanged.

```ts
import { drawGrid } from './draw-plan'

describe('drawGrid', () => {
  it('strokes vertical and horizontal grid lines spanning the canvas in one color', () => {
    const recorder = recordingContext()
    drawGrid(recorder.ctx, { scale: 0.1, offset: { x: 0, y: 0 } }, { width: 100, height: 100 })

    // 6 verticals + 6 horizontals at 200 mm spacing across a 100 px (1000 mm) canvas
    expect(recorder.segments).toHaveLength(12)
    const styles = new Set(recorder.segments.map((segment) => segment.style))
    expect(styles.size).toBe(1)
    const verticals = recorder.segments.filter((segment) => segment.from[0] === segment.to[0])
    expect(verticals).toHaveLength(6)
    expect(verticals.every((segment) => segment.from[1] === 0 && segment.to[1] === 100)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`drawGrid` not exported).

- [ ] **Step 3: Minimal implementation** — `drawGrid` uses only members already on `PlanDrawingContext` (`strokeStyle`, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `stroke`):

```ts
import { visibleGridLines } from './grid'
import { worldToScreen, type Viewport, type ViewportSize } from './viewport'

const GRID_LINE_COLOR = '#e6e9ee'
const GRID_LINE_WIDTH = 1

export function drawGrid(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void {
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = GRID_LINE_WIDTH
  for (const line of visibleGridLines(viewport, size).lines) {
    ctx.beginPath()
    if (line.orientation === 'vertical') {
      ctx.moveTo(line.screen, 0)
      ctx.lineTo(line.screen, size.height)
    } else {
      ctx.moveTo(0, line.screen)
      ctx.lineTo(size.width, line.screen)
    }
    ctx.stroke()
  }
}
```

(The `worldToScreen` import is only needed by later tasks; the `implementer` adds imports as the test requires them.)

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task E2: `drawRulers` fills the ruler bands and draws tick labels

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawRulers fills the top and left ruler bands and draws the raw-millimetre tick labels as text")

This task **extends the shared `recordingContext()` fake** with the new seam members so every fake in the file stays a valid `PlanDrawingContext` once the members become required in Step 3. Add to the fake: a `texts: { text: string; x: number; y: number }[]` array and a `fillRects: { x: number; y: number; w: number; h: number }[]` array, plus `font`, `textAlign`, `textBaseline` string fields and `fillText`/`fillRect` recorders. Then:

```ts
describe('drawRulers', () => {
  it('fills the top and left ruler bands and draws raw-millimetre tick labels', () => {
    const recorder = recordingContext()
    drawRulers(recorder.ctx, { scale: 0.1, offset: { x: 0, y: 0 } }, { width: 100, height: 100 })

    // a band along the top and a band along the left
    expect(recorder.fillRects.length).toBeGreaterThanOrEqual(2)
    // raw-mm labels (the tick at world 200 mm) appear as text
    expect(recorder.texts.map((entry) => entry.text)).toContain('200')
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`drawRulers` not exported; the new fake members are excess until the interface grows).

- [ ] **Step 3: Minimal implementation** — grow `PlanDrawingContext` with `fillText`, `fillRect`, `font`, `textAlign`, `textBaseline`, then implement `drawRulers`:

```ts
export interface PlanDrawingContext {
  // ...existing members...
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillText(text: string, x: number, y: number): void
  fillRect(x: number, y: number, width: number, height: number): void
}

import { rulerTicks, RULER_THICKNESS_PX } from './ruler'

const RULER_BAND_COLOR = '#f5f7fa'
const RULER_TICK_COLOR = '#c2c8d0'
const RULER_TEXT_COLOR = '#5a6470'
const RULER_FONT = '10px sans-serif'
const RULER_LABEL_INSET_PX = 2

export function drawRulers(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void {
  ctx.fillStyle = RULER_BAND_COLOR
  ctx.fillRect(0, 0, size.width, RULER_THICKNESS_PX)
  ctx.fillRect(0, 0, RULER_THICKNESS_PX, size.height)
  ctx.font = RULER_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  for (const tick of rulerTicks(viewport, size.width, 'horizontal')) {
    ctx.strokeStyle = RULER_TICK_COLOR
    ctx.beginPath()
    ctx.moveTo(tick.screen, 0)
    ctx.lineTo(tick.screen, RULER_THICKNESS_PX)
    ctx.stroke()
    ctx.fillStyle = RULER_TEXT_COLOR
    ctx.fillText(tick.label, tick.screen + RULER_LABEL_INSET_PX, RULER_LABEL_INSET_PX)
  }
  for (const tick of rulerTicks(viewport, size.height, 'vertical')) {
    ctx.strokeStyle = RULER_TICK_COLOR
    ctx.beginPath()
    ctx.moveTo(0, tick.screen)
    ctx.lineTo(RULER_THICKNESS_PX, tick.screen)
    ctx.stroke()
    ctx.fillStyle = RULER_TEXT_COLOR
    ctx.fillText(tick.label, RULER_LABEL_INSET_PX, tick.screen + RULER_LABEL_INSET_PX)
  }
}
```

- [ ] **Step 4: Run to verify GREEN** — Run `pnpm exec vitest run editor/plan/draw-plan.test.ts`. Expected: PASS, including the slice-1 tests (the enriched fake still satisfies every existing call). Run `pnpm typecheck` to confirm the grown interface type-checks across the whole file.

- [ ] **Step 5: BLUE + commit**

### Task E3: `drawPlan` paints grid beneath content and rulers above it

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with grid and rulers enabled, drawPlan strokes the grid before filling rooms and draws ruler text after stroking walls")

```ts
describe('drawPlan grid and rulers', () => {
  it('paints the grid beneath rooms and the rulers above the walls when enabled', () => {
    const recorder = recordingContext()
    const room = {
      id: 'room:r',
      kind: 'room' as const,
      floorId: 'f',
      polygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      area: 12_000_000,
    }
    drawPlan(recorder.ctx, {
      walls: [wall],
      rooms: [room],
      viewport: { scale: DEFAULT_PLAN_SCALE, offset: { x: 0, y: 0 } },
      width: 200,
      height: 200,
      selectedIds: new Set<string>(),
      grid: true,
      rulers: true,
    })

    const { ops } = recorder
    // a grid line is stroked before the first room fill
    expect(ops.indexOf('stroke')).toBeLessThan(ops.indexOf('fill'))
    // ruler bands are filled and labels drawn after the room fills
    expect(ops).toContain('fillRect')
    expect(ops.indexOf('fillText')).toBeGreaterThan(ops.lastIndexOf('fill'))
  })

  it('omits the grid and rulers when the flags are absent', () => {
    const recorder = recordingContext()
    drawPlan(recorder.ctx, {
      walls: [wall],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })
    expect(recorder.ops).not.toContain('fillText')
    expect(recorder.ops).not.toContain('fillRect')
    expect(recorder.segments).toHaveLength(1) // only the wall
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`grid`/`rulers` are not accepted options; no grid/ruler ops recorded).

- [ ] **Step 3: Minimal implementation** — add the optional flags and call the new draws in order around the existing room/wall/preview painting:

```ts
export interface DrawPlanOptions {
  walls: WallSceneNode[]
  viewport: Viewport
  width: number
  height: number
  selectedIds: ReadonlySet<string>
  preview?: PreviewSegment
  rooms?: readonly RoomSceneNode[]
  grid?: boolean
  rulers?: boolean
}

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  const size = { width: options.width, height: options.height }
  if (options.grid) {
    drawGrid(ctx, options.viewport, size)
  }
  for (const room of options.rooms ?? []) {
    drawRoom(ctx, room, options.viewport)
  }
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
  if (options.preview) {
    drawPreview(ctx, options.preview, options.viewport)
  }
  if (options.rulers) {
    drawRulers(ctx, options.viewport, size)
  }
}
```

- [ ] **Step 4: Run to verify GREEN** — Run `pnpm exec vitest run editor/plan/draw-plan.test.ts`. Expected: PASS, with the slice-1 tests (which omit the flags) unchanged.

- [ ] **Step 5: BLUE + commit**

---

## Section F: glue and documentation (infrastructure)

### Task F1: PlanView holds the viewport and wires pan, zoom, and fit (infrastructure)

**Files:**

- Modify: `editor/plan/plan-view.tsx`

This is controller-authored Canvas-and-pointer glue with no RGB triple (jsdom has no 2D canvas; ADR-0021). All of its logic is already factored into the pure modules above; this task only wires them. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Hold the viewport in React state** — replace the module-level `const VIEWPORT` with state initialized to the slice-1 default so the functional wall-drawing e2e mapping is unchanged:

```tsx
const [viewport, setViewport] = useState<Viewport>({ scale: DEFAULT_PLAN_SCALE })
```

- [ ] **Step 2: Make `eventToWorld` read the live viewport** — change the helper to take the current viewport (drop the module constant):

```tsx
function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  const rect = event.currentTarget.getBoundingClientRect()
  return screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewport)
}
```

Thread `viewport` through `usePlanInteraction` and its `applyPointer`/`onPointerDown`/`onPointerMove` calls.

- [ ] **Step 3: Add a pan-and-zoom hook** — a small `useViewportControls(canvasRef, viewport, setViewport)` that owns the browser-only camera input and returns the pan handlers and a `panning` flag for the cursor. Spacebar-held is tracked with `window` key listeners; a pan starts on middle-button **or** spacebar-held primary-button drag; the wheel zooms about the cursor:

```tsx
function eventToCanvas(
  event: PointerEvent<HTMLCanvasElement> | WheelEvent,
  canvas: HTMLCanvasElement,
): ScreenPoint {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function useViewportControls(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setViewport: Dispatch<SetStateAction<Viewport>>,
) {
  const spaceHeld = useRef(false)
  const panLast = useRef<ScreenPoint | null>(null)
  const [panning, setPanning] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld.current = true
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld.current = false
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Native (non-passive) wheel listener so preventDefault can stop page scroll while zooming.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const cursor = eventToCanvas(event, canvas)
      setViewport((current) => zoomAtCursor(current, cursor, wheelZoomFactor(event.deltaY)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, setViewport])

  const isPanGesture = (event: PointerEvent<HTMLCanvasElement>): boolean =>
    event.button === 1 || (event.button === 0 && spaceHeld.current)

  const onPanPointerDown = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isPanGesture(event)) {
      return false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panLast.current = { x: event.clientX, y: event.clientY }
    setPanning(true)
    return true
  }

  const onPanPointerMove = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const last = panLast.current
    if (!last) {
      return false
    }
    setViewport((current) =>
      panBy(current, { x: event.clientX - last.x, y: event.clientY - last.y }),
    )
    panLast.current = { x: event.clientX, y: event.clientY }
    return true
  }

  const onPanPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (panLast.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      panLast.current = null
      setPanning(false)
    }
  }

  return { panning, onPanPointerDown, onPanPointerMove, onPanPointerUp }
}
```

- [ ] **Step 4: Compose pan with the existing tool interaction in the handlers** — in `PlanView`, a pan gesture takes priority; otherwise the existing tool path runs. The pointer-down/move handlers call the pan hook first and fall through to `usePlanInteraction` when no pan is active:

```tsx
const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
  if (controls.onPanPointerDown(event)) {
    return
  }
  interaction.onPointerDown(event)
}

const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
  if (controls.onPanPointerMove(event)) {
    return
  }
  interaction.onPointerMove(event)
}

const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => controls.onPanPointerUp(event)
```

- [ ] **Step 5: Wire fit-to-content to a key** — pressing `f` fits the current walls and rooms; this uses `contentBounds` over the scene-graph wall endpoints and room polygon points and `computeFitViewport`:

```tsx
useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'f') {
      return
    }
    const points = [
      ...graph.walls.flatMap((node) => [node.start, node.end]),
      ...graph.rooms.flatMap((node) => node.polygon),
    ]
    const bounds = contentBounds(points)
    if (bounds) {
      setViewport(computeFitViewport(bounds, { width: PLAN_WIDTH, height: PLAN_HEIGHT }))
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [graph.walls, graph.rooms])
```

- [ ] **Step 6: Enable grid and rulers in the redraw and thread the live viewport** — pass `viewport`, `grid: true`, and `rulers: true` into the `drawPlan` call inside `usePlanRedraw`, and add `viewport` to the redraw dependencies so pan/zoom repaints. Set the canvas cursor to `grab`/`grabbing` while panning.

- [ ] **Step 7: Verify** — Run the full check chain:

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green; `eslint .` at zero problems. `PlanView` stays coverage-excluded glue. Confirm the **functional** wall-drawing e2e logic is unaffected by reasoning: the initial viewport is `{ scale: DEFAULT_PLAN_SCALE }` with no offset, so `eventToWorld` maps the e2e's canvas clicks to the same world points as before.

- [ ] **Step 8: Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).**

### Task F2: roadmap update (infrastructure)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 3 done and record its deferrals** — flip the slice-3 row from `in progress` to `done`, and add a slice-3 scope/deferrals block mirroring the slice-1 block: raw-millimetre ruler labels until the units slice; fit-to-selection wiring and DOM-overlay mirroring deferred; the darwin visual-regression baseline refresh is a generated-artifact follow-up (CI skips visual regression on linux where no baseline exists; the functional wall-drawing e2e is unaffected).

- [ ] **Step 2: Verify** — `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task F3: knowledge curation (post-merge, controller-run)

- [ ] After the section-level work lands, run the `knowledge-curator` to add local **ADR-0030: 2D plan viewport projection model (pan offset + zoom)** — the screen-pixel-offset projection, zoom-about-cursor fixed-point, adaptive 1-2-5 grid spacing, the shared axis-sampling primitive, raw-label deferral, and the optional grid/ruler draw flags — and to refresh ADR-0021's cross-links for the grown `PlanDrawingContext` seam (`fillText`/`fillRect`/`font`/`textAlign`/`textBaseline`) and the viewport's new pan/zoom surface. Regenerate the local index with `pnpm knowledge:index`. No `docs/specs/` change is required because this implements behavior the spec already mandates (§6.2, §6.6). Run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Self-review

**Spec coverage:** §6.6 "smooth (non-stepped) pan and zoom, infinite canvas" is covered by Section A (`panBy`, `zoomAtCursor`, `wheelZoomFactor` as a continuous multiplier) and the `PlanView` glue (Task F1: middle-mouse / spacebar-drag pan, scroll/trackpad zoom-to-cursor). §6.6 "snap-to-fit / snap-to-selection" is covered by Section B (`computeFitViewport`) with fit-to-content wired (Task F1 Step 5) and fit-to-selection deferred per the scope boundary. §10 Phase 1 "Pan/zoom Canvas + DOM overlay; grid + rulers" — the grid is Sections C and E1; the rulers are Sections D and E2; the Canvas pan/zoom is Sections A and F1; the DOM overlay (CSS world matrix) is explicitly deferred in the scope boundary. §6.2 Canvas rendering through the narrow seam is covered by Section E (the `PlanDrawingContext` grows by five members, per ADR-0021's "extend the interface rather than reach for the full DOM type").

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders. Every code step shows concrete code; every run step shows the exact `pnpm exec vitest run <path>` command and the expected PASS/FAIL. Task F1 is labeled `(infrastructure)` glue with no RGB triple, matching the slice-1 convention for `PlanView` wiring; it is reviewed by the clean-code-reviewer.

**Type consistency:** `Point` comes from `core` unchanged. `ScreenPoint`/`ViewportSize`/`Viewport`/`AxisProjection`/`AxisSample` live in `viewport.ts` and are imported by `fit.ts`, `grid.ts`, `ruler.ts`, and `draw-plan.ts`. `Viewport.offset` is optional everywhere (slice-1 call sites pass `{ scale }`); `offsetOf` supplies the origin default. `GridLine.orientation` and the ruler/`axisProjection` `orientation` parameter share the `'horizontal' | 'vertical'` union (note grid lines are labeled by their **screen** orientation: a `'vertical'` line is a constant-world-x line drawn from the horizontal axis). `gridSpacingMm` is the single source of grid spacing, consumed by both `visibleGridLines` and `rulerTicks`. `drawGrid`/`drawRulers` take `(ctx, viewport, size)` (three params, no `max-params` disable needed); `DrawPlanOptions` gains optional `grid`/`rulers` booleans (absent = off, so slice-1 draw tests stay green); `PlanDrawingContext` gains `font`/`textAlign`/`textBaseline`/`fillText`/`fillRect`.

**Ordering:** viewport projection and the axis primitive (A) precede the grid (C), rulers (D), and fit (B), all of which consume them; the grid spacing (C1) precedes both `visibleGridLines` (C2) and `rulerTicks` (D1); the drawing (E) consumes the grid/ruler computations; the glue and docs (F) follow the modules they wire. The `recordingContext` fake is enriched in E2 (the first task to need `fillText`/`fillRect`) so every fake in `draw-plan.test.ts` remains a valid `PlanDrawingContext` once the interface grows.

**Back-compatibility:** `Viewport.offset` and the `grid`/`rulers` options are optional, so every slice-1 test and call site compiles and passes unchanged. The functional wall-drawing e2e is preserved because the initial viewport keeps `scale = DEFAULT_PLAN_SCALE` and a zero offset. The only intentional behavior change visible to e2e is the rendered grid/rulers, which affects the darwin visual-regression baseline only (a generated artifact; CI skips it on linux), recorded as a follow-up in Task F2.

```

```
