# Snap Along Wall Implementation Plan

> **Execution:** This project uses the red-green-blue TDD flow from `CLAUDE.md`,
> orchestrated from the main thread (test-author for RED, implementer for GREEN,
> clean-code-reviewer then refactorer for BLUE). Steps use checkbox (`- [ ]`) syntax.
> Each cycle commits `test:` then `feat:` then `refactor:` (a possibly empty marker),
> per the rgb:audit rules. The journey commit is `test(e2e):` (RGB-exempt).

**Goal:** Add the two along-wall snap kinds ADR-0033 deferred (on-edge nearest point
and wall-line intersection) to the pure snap resolver, and prove the on-edge snap from
the assembled editor so `snap-along-wall` flips to required.

**Architecture:** Both kinds are pure additions to `editor/plan/snap.ts`, computed in
world space from `Point` and `WallSceneNode` and unit-tested in plain Node like the
existing five. They slot into the fixed-priority early-return chain at
`endpoint -> intersection -> midpoint -> edge -> perpendicular -> parallel -> grid`.
No wall-tool, viewport, or Canvas-seam change. See ADR-0053.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (chromium journey).

---

## File structure

- Modify `editor/plan/snap.ts`: add the `edge` and `intersection` members to
  `SnapKind`; add `nearestPointOnSegment` and `lineIntersection` pure helpers and the
  `nearestIntersection` candidate scan; insert the two kinds into `snapPoint`'s chain.
- Modify `editor/plan/snap.test.ts`: unit tests for the two kinds and their priority.
- Create `e2e/tests/journeys/snap-along-wall.spec.ts`: the journey.
- Modify `e2e/tests/journeys/support.ts`: a `liveRegion` selector.
- Modify `e2e/journey-coverage.json`: flip `snap-along-wall` to `required`.

`overlay-announce.ts` needs no change: it already interpolates the kind, so the new
kinds read as "Snapped to edge" and "Snapped to intersection".

---

### Task 1: On-edge snap (nearest point along a wall)

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to `editor/plan/snap.test.ts`:

```ts
describe('snapPoint on-edge snapping', () => {
  // Wall from (1000,1000) to (5000,1000): endpoints at x=1000,5000; midpoint x=3000.
  it('snaps a cursor near a wall, away from endpoints and midpoint, to the nearest point on it', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2000, y: 1005 }, context)).toEqual({
      point: { x: 2000, y: 1000 },
      kind: 'edge',
      referenceId: wall.id,
    })
  })

  it('returns null when the cursor is farther from every wall than the tolerance', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2000, y: 1100 }, context)).toBeNull()
  })

  it('prefers the midpoint over the on-edge point when the cursor is near the midpoint', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    // 5 mm above the midpoint (3000,1000); both midpoint and on-edge are in range.
    expect(snapPoint({ x: 3002, y: 1005 }, context)?.kind).toBe('midpoint')
  })

  it('prefers the on-edge point over a perpendicular construction line', () => {
    const wall = wallNode()
    // Origin sits off the wall; the perpendicular line through it is x = 2000.
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 2000, y: 5000 },
    }

    // (2002,1005): 2 mm from the perpendicular line x=2000 and 5 mm from the wall.
    expect(snapPoint({ x: 2002, y: 1005 }, context)?.kind).toBe('edge')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: the four new tests FAIL (no `edge` kind yet: the first returns `null`, the
perpendicular-priority test returns `'perpendicular'`).

- [ ] **Step 3: Add the `edge` kind and helper**

In `editor/plan/snap.ts`, extend the union:

```ts
export type SnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'edge'
  | 'perpendicular'
  | 'parallel'
  | 'grid'
  | 'trace'
```

Add the pure helper near `midpointOf`:

```ts
/** Nearest point on the segment [a, b] to p, clamped to the segment ends. */
function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return a
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  const clamped = Math.max(0, Math.min(1, t))
  return { x: a.x + clamped * dx, y: a.y + clamped * dy }
}
```

Insert the edge resolution into `snapPoint`, after the midpoint block and before the
perpendicular block:

```ts
const edge = nearestFeature(cursor, context, (wall) => [
  nearestPointOnSegment(cursor, wall.start, wall.end),
])
if (edge !== null) {
  return asResult(edge, 'edge')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS (all snap tests green).

- [ ] **Step 5: Commit (RED then GREEN)**

Commit the test addition as `test:` first, then the implementation as `feat:` (the
two-commit RED/GREEN sequence; when orchestrating with subagents these are two
separate commits around the test-author and implementer dispatches):

```bash
git commit -m "test: snap a drawn cursor onto the nearest point along a wall"
git commit -m "feat: resolve an on-edge snap to the nearest point along a wall"
```

- [ ] **Step 6: BLUE**

Run the clean-code-reviewer over the diff; apply the refactorer's findings, or land an
empty `refactor:` marker if there are none.

---

### Task 2: Wall-line intersection snap

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to `editor/plan/snap.test.ts`:

```ts
describe('snapPoint wall-line intersection snapping', () => {
  it('snaps to where two wall lines cross, even past the segment ends', () => {
    // A: line y=1000 over x in [1000,2000]. B: line x=4000 over y in [2000,3000].
    // The lines cross at (4000,1000), which lies past the end of both segments.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 2000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 4000, y: 2000 }, end: { x: 4000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    const result = snapPoint({ x: 4003, y: 1004 }, context)
    expect(result?.kind).toBe('intersection')
    expect(result?.point).toEqual({ x: 4000, y: 1000 })
  })

  it('prefers an intersection over the on-edge point when they coincide on a wall', () => {
    // A horizontal line y=1000; B vertical line x=2000 crossing it at (2000,1000),
    // which also lies on segment A, so the on-edge snap would otherwise fire there.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 5000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 2000, y: 2000 }, end: { x: 2000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2003, y: 1004 }, context)?.kind).toBe('intersection')
  })

  it('produces no intersection for parallel walls', () => {
    // Two parallel horizontal walls; the cursor sits clear of both edges.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 5000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 1000, y: 3000 }, end: { x: 5000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 3000, y: 2000 }, context)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: the first two new tests FAIL (no `intersection` kind: the pure-crossing test
returns `null`, the coincident test returns `'edge'`). The parallel test already
passes (it stays a guard).

- [ ] **Step 3: Add the `intersection` kind, helpers, and chain entry**

In `editor/plan/snap.ts`, extend the union with `intersection`:

```ts
export type SnapKind =
  | 'endpoint'
  | 'intersection'
  | 'midpoint'
  | 'edge'
  | 'perpendicular'
  | 'parallel'
  | 'grid'
  | 'trace'
```

Add the pure helpers:

```ts
/** Intersection of the infinite lines through walls a and b, or null when parallel. */
function lineIntersection(a: WallSceneNode, b: WallSceneNode): Point | null {
  const r = { x: a.end.x - a.start.x, y: a.end.y - a.start.y }
  const s = { x: b.end.x - b.start.x, y: b.end.y - b.start.y }
  const denominator = r.x * s.y - r.y * s.x
  if (denominator === 0) {
    return null
  }
  const offset = { x: b.start.x - a.start.x, y: b.start.y - a.start.y }
  const t = (offset.x * s.y - offset.y * s.x) / denominator
  return { x: a.start.x + t * r.x, y: a.start.y + t * r.y }
}

/** The nearest in-range crossing of two wall lines, or null when none qualifies. */
function nearestIntersection(cursor: Point, context: SnapContext): Candidate | null {
  let best: Candidate | null = null
  const { walls } = context
  for (const [index, a] of walls.entries()) {
    for (const b of walls.slice(index + 1)) {
      const point = lineIntersection(a, b)
      if (point === null) {
        continue
      }
      const distanceMm = distance(cursor, point)
      if (distanceMm <= context.toleranceMm && (best === null || distanceMm < best.distanceMm)) {
        best = { point, referenceId: a.id, distanceMm }
      }
    }
  }
  return best
}
```

Insert the intersection resolution into `snapPoint`, after the endpoint block and
before the midpoint block:

```ts
const intersection = nearestIntersection(cursor, context)
if (intersection !== null) {
  return asResult(intersection, 'intersection')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run editor/plan/snap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git commit -m "test: snap a drawn cursor onto a wall-line intersection"
git commit -m "feat: resolve a wall-line intersection snap"
```

- [ ] **Step 6: BLUE**

Clean-code-reviewer over the diff, then refactorer or an empty `refactor:` marker.
Watch the `max-lines-per-function` cap on `snapPoint` (it stays under 40 with the two
added early-return blocks).

---

### Task 3: The journey and the matrix flip

**Files:**

- Create: `e2e/tests/journeys/snap-along-wall.spec.ts`
- Modify: `e2e/tests/journeys/support.ts`
- Modify: `e2e/journey-coverage.json`

- [ ] **Step 1: Add the live-region selector to support.ts**

In `e2e/tests/journeys/support.ts`, add to the `selectors` object (the plan overlay's
polite live region carries the snap announcement; its class is stable):

```ts
  liveRegion: (page: Page) => page.locator('.plan-overlay__live'),
```

- [ ] **Step 2: Write the journey**

Create `e2e/tests/journeys/snap-along-wall.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('snaps a new wall onto an existing wall', async ({ page }) => {
  await gotoEditor(page)

  // An existing horizontal wall spanning screen x 120..520 at y 200.
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)

  const canvas = selectors.planCanvas(page)
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('plan canvas has no bounding box')
  }

  // Start a second wall well clear of the first, then move toward a point along the
  // existing wall that is clear of its endpoints, its midpoint, and the perpendicular
  // and parallel construction lines, so the on-edge snap is the only one in range.
  await canvas.click({ position: { x: 400, y: 360 } })
  await page.mouse.move(box.x + 250, box.y + 206)
  await expect(selectors.liveRegion(page)).toHaveText('Snapped to edge')

  // Commit the second wall at the snapped point; the plan now holds two walls.
  await canvas.click({ position: { x: 250, y: 206 } })
  await expectWallCount(page, 2)
})
```

- [ ] **Step 3: Flip the coverage matrix**

In `e2e/journey-coverage.json`, change the `snap-along-wall` capability `status` from
`"pending"` to `"required"`.

- [ ] **Step 4: Build and run the journey**

Run:

```bash
lsof -ti tcp:4173 | xargs kill -9 2>/dev/null; pnpm build
pnpm exec playwright test e2e/tests/journeys/snap-along-wall.spec.ts --project=chromium
```

Expected: 1 passed.

- [ ] **Step 5: Commit (RGB-exempt)**

```bash
git commit -m "test(e2e): require the snap-along-wall journey"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the full chain and audits**

Run, expecting all green:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm integration:audit   # expect: 8 required capabilities covered, 3 pending
pnpm rgb:audit           # expect: clean (main..HEAD)
```

- [ ] **Step 2: Re-run the journey against the committed spec**

```bash
pnpm exec playwright test e2e/tests/journeys/snap-along-wall.spec.ts --project=chromium
```

Expected: 1 passed.

---

## Self-review

- **Spec coverage:** ADR-0053's two kinds (Task 1 edge, Task 2 intersection), the
  priority placement (the chain in Tasks 1 and 3), the live-region observable (Task 3),
  and the gate flip (Task 3) are all covered. Smart angle snap and chained polyline are
  out of scope by the approved decision, so they have no task here.
- **Placeholder scan:** none; every step has its test code, implementation, command,
  and expected output.
- **Type consistency:** `SnapKind` gains `edge` then `intersection`; `nearestFeature`,
  `asResult`, `Candidate`, and `distance` already exist and are reused; the helper
  names (`nearestPointOnSegment`, `lineIntersection`, `nearestIntersection`) are used
  consistently. The journey title "snaps a new wall onto an existing wall" matches the
  matrix title exactly.
