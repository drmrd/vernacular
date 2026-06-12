# Smart Angle Snap Implementation Plan

> **Execution:** This project uses the red-green-blue TDD flow from `CLAUDE.md`,
> orchestrated from the main thread (test-author for RED, implementer for GREEN,
> clean-code-reviewer then refactorer for BLUE). Steps use checkbox (`- [ ]`) syntax.
> Each cycle commits `test:` then `feat:` then `refactor:` (a possibly empty marker),
> per the rgb:audit rules. The glue cycle uses a `test:` journey as its RED, the
> cancel-wall precedent for coverage-excluded wiring.

**Goal:** Lock a drawn wall's direction to the nearest 45-degree increment off the world
axes and off nearby walls by default, with a held modifier to free the angle and a live
length-and-bearing readout, finishing the absolute angle snap ADR-0033 deferred.

**Architecture:** The lock is a new pure `angle` kind in `editor/plan/snap.ts`, computed
from the in-progress origin, the cursor, and the walls, sitting in the directional tier
above perpendicular, parallel, and grid. A `freeAngle` flag on the snap context
suppresses it. A pure `draw-readout` module turns the in-progress segment into a length
and bearing; the plan overlay paints a near-cursor chip and announces the engaged lock.
The interaction layer tracks the held modifier and threads the flag. See ADR-0054.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (chromium journey).

---

## File structure

- Modify `editor/plan/snap.ts`: add `angle` to `SnapKind`; add `freeAngle?: boolean` to
  `SnapContext`; add the `angleSnap` resolver and its direction helpers; insert `angle`
  into `snapPoint`'s chain above the perpendicular kind.
- Modify `editor/plan/snap.test.ts`: unit tests for the world lock, the wall-relative
  lock, the priority placement, and the free-angle suppression.
- Create `editor/plan/draw-readout.ts`: `segmentReadout` (length and bearing from a
  segment) and `formatReadout` (the chip text).
- Create `editor/plan/draw-readout.test.ts`: unit tests for both.
- Modify `editor/plan/overlay-announce.ts`: add `angleLockAnnouncement(bearingDeg)`.
- Modify `editor/plan/overlay-announce.test.ts`: unit test the announcement.
- Modify `editor/plan/use-snapping.ts`: thread `freeAngle` from inputs into the context.
- Modify `editor/plan/use-plan-interaction.ts`: track the held Alt modifier, re-resolve
  at the last cursor on toggle, and pass `freeAngle` into `useSnapping`.
- Modify `editor/plan/plan-overlay.tsx`: accept the in-progress `preview` segment, paint
  the readout chip, and announce the angle lock through the live region.
- Modify `editor/plan/plan-view.tsx`: thread the wall-tool `preview` into the overlay
  props.
- Create `e2e/tests/journeys/smart-angle-snap.spec.ts`: the journey.
- Modify `e2e/tests/journeys/support.ts`: a `liveRegion` selector and an
  `angleModifier`-aware draw helper.

`journey-coverage.json` is not touched: smart angle snap is not one of the gated
acceptance capabilities, so no entry flips.

---

### Task 1: Lock a drawn direction to the nearest world 45 degrees

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `snap.test.ts`. The origin is the in-progress start; the cursor sits off the axes
and must lock onto the nearest 45-degree ray, projecting the cursor onto that ray.

```ts
describe('angle snap', () => {
  // Origin at the world origin; a single far wall keeps the other kinds out of range.
  const context = (overrides: Partial<SnapContext> = {}): SnapContext => ({
    walls: [],
    gridSpacingMm: 0,
    toleranceMm: 1,
    origin: { x: 0, y: 0 },
    ...overrides,
  })

  it('locks a near-horizontal drag onto the world 0-degree ray', () => {
    // Cursor at (1000, 50): bearing about 2.9 degrees, nearest world ray is 0.
    const result = snapPoint({ x: 1000, y: 50 }, context())
    expect(result).toEqual({ point: { x: 1000, y: 0 }, kind: 'angle' })
  })

  it('locks a near-diagonal drag onto the world 45-degree ray', () => {
    // Cursor at (1000, 900): bearing about 42 degrees, nearest world ray is 45.
    const result = snapPoint({ x: 1000, y: 900 }, context())
    expect(result?.kind).toBe('angle')
    expect(result?.point.x).toBeCloseTo(950, 5)
    expect(result?.point.y).toBeCloseTo(950, 5)
  })

  it('does not lock before a segment has a start', () => {
    expect(snapPoint({ x: 1000, y: 50 }, context({ origin: undefined }))).toBeNull()
  })

  it('does not lock when the cursor sits on the origin', () => {
    expect(snapPoint({ x: 0, y: 0 }, context())).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: FAIL (the resolver returns grid or null, not an `angle` result).

- [ ] **Step 3: Write the minimal implementation**

In `snap.ts`, add `'angle'` to the `SnapKind` union. Add the direction helpers and the
resolver, then insert it into the chain above `perpendicularSnap`.

```ts
const DEGREES_PER_TURN = 360
const ANGLE_STEP_DEG = 45
const DEG_TO_RAD = Math.PI / 180

/** The unit ray directions every 45 degrees off the world axes. */
function worldDirections(): Vector[] {
  const directions: Vector[] = []
  for (let deg = 0; deg < DEGREES_PER_TURN; deg += ANGLE_STEP_DEG) {
    const radians = deg * DEG_TO_RAD
    directions.push({ x: Math.cos(radians), y: Math.sin(radians) })
  }
  return directions
}

/** The candidate ray nearest the origin-to-cursor bearing, by largest dot product. */
function nearestDirection(offset: Vector, directions: readonly Vector[]): Vector | null {
  let best: Vector | null = null
  let bestDot = -Infinity
  for (const dir of directions) {
    const dot = offset.x * dir.x + offset.y * dir.y
    if (dot > bestDot) {
      best = dir
      bestDot = dot
    }
  }
  return best
}

/** Lock the drawn direction to the nearest 45-degree ray off the world axes. */
function angleSnap(cursor: Point, context: SnapContext): Candidate | null {
  const origin = context.origin
  if (context.freeAngle === true || origin === undefined) {
    return null
  }
  const offset = { x: cursor.x - origin.x, y: cursor.y - origin.y }
  if (offset.x === 0 && offset.y === 0) {
    return null
  }
  const direction = nearestDirection(offset, worldDirections())
  if (direction === null) {
    return null
  }
  const along = offset.x * direction.x + offset.y * direction.y
  const point = { x: origin.x + along * direction.x, y: origin.y + along * direction.y }
  return { point, referenceId: '', distanceMm: distance(cursor, point) }
}
```

Add `freeAngle?: boolean` to the `SnapContext` interface. The `angle` candidate carries
no wall reference yet, so give `asResult` a path that drops an empty `referenceId`:

```ts
function asResult(candidate: Candidate, kind: SnapKind): SnapResult {
  const base: SnapResult = { point: candidate.point, kind }
  return candidate.referenceId === '' ? base : { ...base, referenceId: candidate.referenceId }
}
```

Insert into `snapPoint` directly above the perpendicular kind:

```ts
const angle = angleSnap(cursor, context)
if (angle !== null) {
  return asResult(angle, 'angle')
}
const perpendicular = perpendicularSnap(cursor, context)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/plan/snap.ts editor/plan/snap.test.ts
git commit -m "feat: lock a drawn wall direction to the nearest world 45 degrees"
```

(The RED test commit precedes this; commit the test first as `test:`, then this as
`feat:`. See the execution note on the test-then-feat split.)

---

### Task 2: Lock relative to the nearest wall's direction

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('locks relative to the nearest wall when one is closer than a world ray', () => {
  // A wall along 30 degrees; drawing near 33 degrees should lock to the wall (30),
  // not to the world 45 ray.
  const radians = 30 * (Math.PI / 180)
  const wall: WallSceneNode = {
    id: 'wall-1',
    kind: 'wall',
    start: { x: 0, y: 0 },
    end: { x: 1000 * Math.cos(radians), y: 1000 * Math.sin(radians) },
    thickness: 100,
  }
  // Cursor near 33 degrees, far enough from the wall segment that no edge snap wins.
  const cursor = {
    x: 1000 * Math.cos(33 * (Math.PI / 180)),
    y: 1000 * Math.sin(33 * (Math.PI / 180)),
  }
  const result = snapPoint(cursor, {
    walls: [wall],
    gridSpacingMm: 0,
    toleranceMm: 1,
    origin: { x: 0, y: 0 },
  })
  expect(result?.kind).toBe('angle')
  expect(result?.referenceId).toBe('wall-1')
  // The locked point lies on the 30-degree ray.
  const bearing = Math.atan2(result!.point.y, result!.point.x) * (180 / Math.PI)
  expect(bearing).toBeCloseTo(30, 4)
})
```

Confirm the exact `WallSceneNode` shape from `core` when writing the fixture (the
existing snap tests already construct one; mirror that shape).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: FAIL (the lock only considers world rays, so it picks 45 with no reference).

- [ ] **Step 3: Write the minimal implementation**

Add wall-relative directions and tag the chosen direction with the wall it came from.

```ts
interface DirectedCandidate {
  direction: Vector
  referenceId: string
}

/** World rays (no reference) plus the nearest wall's rays (tagged with the wall). */
function candidateDirections(cursor: Point, context: SnapContext): DirectedCandidate[] {
  const candidates: DirectedCandidate[] = worldDirections().map((direction) => ({
    direction,
    referenceId: '',
  }))
  const reference = nearestWall(cursor, context.walls)
  const wallDir = reference ? wallDirection(reference) : null
  if (reference !== null && wallDir !== null) {
    const baseDeg = Math.atan2(wallDir.y, wallDir.x) * (180 / Math.PI)
    for (let step = 0; step < DEGREES_PER_TURN; step += ANGLE_STEP_DEG) {
      const radians = (baseDeg + step) * DEG_TO_RAD
      candidates.push({
        direction: { x: Math.cos(radians), y: Math.sin(radians) },
        referenceId: reference.id,
      })
    }
  }
  return candidates
}
```

Replace `angleSnap`'s body to scan the directed candidates and keep the reference of the
winning direction:

```ts
function angleSnap(cursor: Point, context: SnapContext): Candidate | null {
  const origin = context.origin
  if (context.freeAngle === true || origin === undefined) {
    return null
  }
  const offset = { x: cursor.x - origin.x, y: cursor.y - origin.y }
  if (offset.x === 0 && offset.y === 0) {
    return null
  }
  let best: Candidate | null = null
  let bestDot = -Infinity
  for (const { direction, referenceId } of candidateDirections(cursor, context)) {
    const along = offset.x * direction.x + offset.y * direction.y
    if (along <= bestDot) {
      continue
    }
    bestDot = along
    best = {
      point: { x: origin.x + along * direction.x, y: origin.y + along * direction.y },
      referenceId,
      distanceMm: 0,
    }
  }
  return best
}
```

`distanceMm` is unused for the angle candidate (it never competes inside `nearestFeature`),
so a fixed zero is fine; the chain takes the first `angle` result regardless of distance.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS (both Task 1 and Task 2 tests green).

- [ ] **Step 5: Commit**

```bash
git add editor/plan/snap.ts editor/plan/snap.test.ts
git commit -m "feat: lock a drawn wall direction relative to the nearest wall"
```

---

### Task 3: Feature snaps outrank the angle lock

**Files:**

- Modify: `editor/plan/snap.test.ts` (no `snap.ts` change expected; the chain order
  already places the feature kinds above `angle`)

- [ ] **Step 1: Write the failing test**

```ts
it('prefers an endpoint within tolerance over the angle lock', () => {
  const wall: WallSceneNode = {
    id: 'wall-1',
    kind: 'wall',
    start: { x: 700, y: 30 },
    end: { x: 1500, y: 30 },
    thickness: 100,
  }
  // Cursor sits within tolerance of the wall's start endpoint (700, 30), which is at an
  // off-45 bearing from the origin; the endpoint must win over the angle lock.
  const result = snapPoint(
    { x: 702, y: 31 },
    {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 20,
      origin: { x: 0, y: 0 },
    },
  )
  expect(result).toEqual({ point: { x: 700, y: 30 }, kind: 'endpoint', referenceId: 'wall-1' })
})
```

- [ ] **Step 2: Run the test to verify it fails or passes**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS already, because `endpoint` precedes `angle` in the chain. If it FAILS,
the chain order regressed; restore `endpoint` (and `intersection`/`midpoint` when
present) above `angle`. Treat a green run here as the behavior being locked by the test.

- [ ] **Step 3: Implementation**

No production change expected. This task pins the priority so a later reorder cannot
silently demote the feature kinds.

- [ ] **Step 4: Commit**

```bash
git add editor/plan/snap.test.ts
git commit -m "test: pin that feature snaps outrank the angle lock"
```

This is a standalone `test:` that documents an invariant; close it with an empty refactor
marker per the rgb:audit rule (see Task 4's note on markers) or fold it into Task 2's
refactor marker if the cycles are committed together.

---

### Task 4: The free-angle flag suppresses the lock

**Files:**

- Modify: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('frees the angle so the chain falls through to the prior behavior', () => {
  // freeAngle drops the lock; with a grid set, the cursor snaps to the grid instead.
  const result = snapPoint(
    { x: 1000, y: 900 },
    {
      walls: [],
      gridSpacingMm: 100,
      toleranceMm: 1,
      origin: { x: 0, y: 0 },
      freeAngle: true,
    },
  )
  expect(result).toEqual({ point: { x: 1000, y: 900 }, kind: 'grid' })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS (Task 1 already added the `freeAngle` guard). If it FAILS, the guard is
missing; add `if (context.freeAngle === true) return null` at the top of `angleSnap`.

- [ ] **Step 3: Commit**

```bash
git add editor/plan/snap.test.ts
git commit -m "test: free the angle lock when the free-angle flag is set"
git commit --allow-empty -m "refactor: close the angle-snap resolver cycle"
```

The empty refactor marker closes the snap-resolver GREEN before the next module, per the
rgb:audit "close every GREEN with a refactor" rule.

---

### Task 5: The draw readout (length and bearing)

**Files:**

- Create: `editor/plan/draw-readout.ts`
- Test: `editor/plan/draw-readout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_METRIC_PREFERENCES } from '../../core'
import { segmentReadout, formatReadout } from './draw-readout'

describe('segmentReadout', () => {
  it('reports the length in millimeters and the bearing in [0, 360)', () => {
    const readout = segmentReadout({ start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } })
    expect(readout.lengthMm).toBeCloseTo(3000, 5)
    expect(readout.bearingDeg).toBeCloseTo(0, 5)
  })

  it('normalizes a downward bearing to a positive angle', () => {
    const readout = segmentReadout({ start: { x: 0, y: 0 }, end: { x: 0, y: -1000 } })
    expect(readout.bearingDeg).toBeCloseTo(270, 5)
  })
})

describe('formatReadout', () => {
  it('joins the adaptive length and the rounded bearing', () => {
    const text = formatReadout({ lengthMm: 2400, bearingDeg: 45 }, DEFAULT_METRIC_PREFERENCES)
    expect(text).toBe('2.40 m 45°')
  })
})
```

Confirm the exact metric output of `formatAdaptiveLength(2400, DEFAULT_METRIC_PREFERENCES)`
when writing the test (it formats meters at two decimal places, so `2.40 m`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/draw-readout.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

```ts
import { distance, formatAdaptiveLength, type UnitPreferences } from '../../core'
import type { PreviewSegment } from './draw-plan'

const RAD_TO_DEG = 180 / Math.PI
const DEGREES_PER_TURN = 360

export interface DrawReadout {
  lengthMm: number
  bearingDeg: number
}

/** The in-progress segment's length in millimeters and bearing in [0, 360) degrees. */
export function segmentReadout(segment: PreviewSegment): DrawReadout {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const raw = Math.atan2(dy, dx) * RAD_TO_DEG
  const bearingDeg = ((raw % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN
  return { lengthMm: distance(segment.start, segment.end), bearingDeg }
}

/** The chip text: the adaptive length and the rounded bearing, e.g. "2.40 m 45 degrees". */
export function formatReadout(readout: DrawReadout, preferences: UnitPreferences): string {
  return `${formatAdaptiveLength(readout.lengthMm, preferences)} ${Math.round(readout.bearingDeg)}°`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/draw-readout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/plan/draw-readout.ts editor/plan/draw-readout.test.ts
git commit -m "test: cover the draw readout length and bearing"
git commit -m "feat: add the draw readout length and bearing formatter"
git commit --allow-empty -m "refactor: close the draw-readout cycle"
```

(Commit the test first, then the implementation, then the marker.)

---

### Task 6: Announce the engaged angle lock

**Files:**

- Modify: `editor/plan/overlay-announce.ts`
- Test: `editor/plan/overlay-announce.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `overlay-announce.test.ts`:

```ts
import { angleLockAnnouncement } from './overlay-announce'

describe('angleLockAnnouncement', () => {
  it('names the locked bearing in whole degrees', () => {
    expect(angleLockAnnouncement(45)).toBe('Locked to 45 degrees')
  })

  it('rounds the bearing to a whole number', () => {
    expect(angleLockAnnouncement(89.6)).toBe('Locked to 90 degrees')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/plan/overlay-announce.test.ts`
Expected: FAIL (`angleLockAnnouncement` not exported).

- [ ] **Step 3: Write the minimal implementation**

Add to `overlay-announce.ts`:

```ts
/** Screen-reader text naming the angle the drawn wall is locked to. */
export function angleLockAnnouncement(bearingDeg: number): string {
  return `Locked to ${Math.round(bearingDeg)} degrees`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/plan/overlay-announce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/plan/overlay-announce.ts editor/plan/overlay-announce.test.ts
git commit -m "test: announce the engaged angle lock by its bearing"
git commit -m "feat: announce the engaged angle lock by its bearing"
git commit --allow-empty -m "refactor: close the angle-lock announcement cycle"
```

---

### Task 7: Wire the lock, the modifier, and the readout into the plan

This is the coverage-excluded glue cycle. Following the cancel-wall precedent, the journey
is the `test:` RED; the wiring `feat:` makes it pass; a `refactor:` closes it. The glue
spans the snapping hook, the interaction hook, the overlay, and the plan view.

**Files:**

- Create: `e2e/tests/journeys/smart-angle-snap.spec.ts`
- Modify: `e2e/tests/journeys/support.ts`
- Modify: `editor/plan/use-snapping.ts`
- Modify: `editor/plan/use-plan-interaction.ts`
- Modify: `editor/plan/plan-overlay.tsx`
- Modify: `editor/plan/plan-view.tsx`

- [ ] **Step 1: Write the failing journey**

Add a `liveRegion` selector to `support.ts`:

```ts
  liveRegion: (page: Page) => page.locator('.plan-overlay__live'),
```

Create `e2e/tests/journeys/smart-angle-snap.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, selectors } from './support'

test('locks a drawn wall to a square angle and frees it with the modifier', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  // Start a wall, then move toward a near-vertical point: the lock should square it to
  // 90 degrees and announce the lock.
  await canvas.click({ position: { x: 200, y: 360 } })
  await canvas.hover({ position: { x: 230, y: 120 } })
  await expect(selectors.liveRegion(page)).toHaveText(/Locked to (90|270) degrees/)

  // Holding the free-angle modifier drops the lock; the announcement clears.
  await page.keyboard.down('Alt')
  await canvas.hover({ position: { x: 230, y: 120 } })
  await expect(selectors.liveRegion(page)).not.toHaveText(/Locked to/)
  await page.keyboard.up('Alt')
})
```

- [ ] **Step 2: Run the journey to verify it fails**

Run: `pnpm exec playwright test e2e/tests/journeys/smart-angle-snap.spec.ts --project=chromium`
Expected: FAIL (no chip, no lock announcement yet). Build first if the runner serves a
stale bundle: `pnpm build` then re-run (see the vite-config and stale-bundle notes).

- [ ] **Step 3: Thread `freeAngle` through `useSnapping`**

In `use-snapping.ts`, add `freeAngle?: boolean` to `SnappingInputs`, and spread it into
the context:

```ts
function buildContext({
  walls,
  viewport,
  origin,
  tracePoints,
  freeAngle,
}: SnappingInputs): SnapContext {
  return {
    walls,
    gridSpacingMm: DEFAULT_SNAP_GRID_MM,
    toleranceMm: SNAP_PIXEL_TOLERANCE / viewport.scale,
    ...(origin ? { origin } : {}),
    ...(tracePoints && tracePoints.length > 0 ? { tracePoints } : {}),
    ...(freeAngle ? { freeAngle } : {}),
  }
}
```

- [ ] **Step 4: Track the held modifier and re-resolve in `use-plan-interaction`**

Add a held-modifier hook beside `useCancelWallOnEscape`, store the last raw world cursor,
re-resolve on toggle, and pass `freeAngle` into `useSnapping`.

```ts
/** Tracks the Alt (Option) key as the held free-angle modifier while the wall tool is active. */
function useFreeAngleModifier(tool: ToolId): boolean {
  const [free, setFree] = useState(false)
  useEffect(() => {
    if (tool !== 'draw-wall') {
      setFree(false)
      return
    }
    const update = (event: KeyboardEvent) => setFree(event.altKey)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
    }
  }, [tool])
  return free
}
```

In `usePlanInteraction`, keep the last raw (pre-snap) cursor and re-resolve when the
modifier toggles so the ghost updates without a move:

```ts
const freeAngle = useFreeAngleModifier(tool)
const lastRawCursor = useRef<Point | null>(null)
const snapping = useSnapping({
  walls,
  viewport,
  origin: drawingOrigin(toolState),
  ...(tracePoints ? { tracePoints } : {}),
  freeAngle,
})
useEffect(() => {
  if (tool === 'draw-wall' && lastRawCursor.current) {
    setPointer(snapping.resolve(lastRawCursor.current))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-resolve only on modifier toggle
}, [freeAngle])
```

Record the raw cursor in `onPointerMove` before resolving:

```ts
const onPointerMove = useCallback(
  (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'draw-wall') {
      const raw = eventToWorld(event, viewport)
      lastRawCursor.current = raw
      setPointer(snapping.resolve(raw))
    }
  },
  [tool, viewport, snapping],
)
```

- [ ] **Step 5: Paint the chip and announce the lock in `plan-overlay.tsx`**

Add `preview?: PreviewSegment` to `PlanOverlayProps`. When present, paint a chip at the
segment end with `formatReadout`, and when the snap kind is `angle`, announce
`angleLockAnnouncement(segmentReadout(preview).bearingDeg)`:

```tsx
const readout = props.preview ? segmentReadout(props.preview) : null
const announcement =
  snap?.kind === 'angle' && readout
    ? angleLockAnnouncement(readout.bearingDeg)
    : snap
      ? snapAnnouncement(snap)
      : selectionAnnouncement(selected)
```

Render the chip near the segment end (reusing `PositionedPill`):

```tsx
{
  props.preview && readout ? (
    <PositionedPill
      className="plan-overlay__readout"
      screen={worldToScreen(props.preview.end, viewport)}
      text={formatReadout(readout, preferences)}
    />
  ) : null
}
```

Add a `.plan-overlay__readout` rule to `plan-overlay.css` mirroring the existing
`.plan-overlay__chip` so the pill reads as a near-cursor label.

- [ ] **Step 6: Thread the wall-tool preview into the overlay in `plan-view.tsx`**

In `usePlanController`, pass the wall-tool preview into the overlay props (only the
wall-draw preview, not the merged endpoint/dimension previews):

```ts
    overlay: {
      viewport: layers.viewport,
      graph: layers.graph,
      selectedIds: layers.selectedIds,
      selection: layers.selection,
      preferences: layers.preferences,
      snap: interaction.snap,
      ...(interaction.preview ? { preview: interaction.preview } : {}),
    },
```

- [ ] **Step 7: Run the journey to verify it passes**

Run: `pnpm build && pnpm exec playwright test e2e/tests/journeys/smart-angle-snap.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 8: Commit (journey, then glue, then marker)**

```bash
git add e2e/tests/journeys/smart-angle-snap.spec.ts e2e/tests/journeys/support.ts
git commit -m "test: add the smart-angle-snap journey"
git add editor/plan/use-snapping.ts editor/plan/use-plan-interaction.ts editor/plan/plan-overlay.tsx editor/plan/plan-overlay.css editor/plan/plan-view.tsx
git commit -m "feat: wire the angle lock, free-angle modifier, and draw readout into the plan"
git commit --allow-empty -m "refactor: close the angle-snap wiring cycle"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. Fix any zero-warning lint findings (max-lines-per-function,
no-magic-numbers, max-params) by extracting helpers, never by suppressing.

- [ ] **Step 2: Run the RGB and integration audits**

Run: `pnpm rgb:audit && pnpm integration:audit`
Expected: both clean. The audit range is `origin/main..HEAD`.

- [ ] **Step 3: Run the full chromium journey suite**

Run: `pnpm exec playwright test --project=chromium`
Expected: all journeys pass, including the existing draw-wall, edit-endpoint, and
switch-floor journeys (their horizontal walls are already on a 45-multiple, so the lock
leaves them unchanged).

---

## Self-review notes

- Spec coverage: the makeover "Wall drawing and editing" angle-snap sentence maps to
  Tasks 1, 2 (world and nearby-wall 45-degree locks), Task 4 (the held free modifier),
  and Tasks 5 to 7 (the live angle and length readout). ADR-0054 records the model.
- The `angle` kind sits above perpendicular, parallel, and grid (Task 1 insertion) and
  below endpoint and midpoint (Task 3 invariant), the priority ADR-0054 sets.
- Type consistency: `freeAngle?: boolean` is the one new field name, used identically in
  `SnapContext` (Task 1), `SnappingInputs` (Task 7), and the interaction hook (Task 7).
  `segmentReadout`/`formatReadout`/`angleLockAnnouncement` keep the same signatures from
  definition through use.
- No journey-coverage entry flips: smart angle snap is not a gated capability.
