# Drawing Snapping Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The test and implementation code shown in each task are the **controller's reference blueprint**, not handed to the agents verbatim: the `test-author` authors its test independently from the behavior description plus the public signatures, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive snapping to wall **drawing**. While a wall is being drawn, the moving cursor snaps to the best nearby feature (a wall endpoint, a wall midpoint, a perpendicular or parallel line through the in-progress start, or the grid), and a snap indicator is painted at the snapped point so the user sees where the next click will land.

**Architecture:** A new pure module `editor/plan/snap.ts` computes the best snap for a freely moving cursor from the cursor position, the wall scene nodes, a grid spacing, a world-space tolerance, and an optional in-progress segment origin, returning the snapped world point and the kind of snap. `editor/plan/draw-plan.ts` grows a `drawSnapIndicator` behind the existing narrow `PlanDrawingContext` seam (ADR-0021), gated by a new optional `snap` field on `DrawPlanOptions`, painted above the walls and the preview. `editor/plan/plan-view.tsx` (thin, coverage-excluded glue) converts a pixel tolerance to world units via the viewport scale, builds the snap context (walls from the scene graph, a default grid spacing, the wall tool's in-progress start as the origin), snaps the cursor before feeding it to the wall tool, and passes the snap result to `drawPlan` so the indicator renders. No `core/` change: the small line-projection math lives inside `snap.ts` so slice 4 stays fully decoupled from slice 5 (selection), which runs in parallel and owns the `core/geometry/polygon.ts` and spatial-index work.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, Vitest for units. No new dependencies. No `core/` change (this slice stays entirely within `editor/plan/`).

---

## Scope boundary (design spec §6.2, §6.6, §10/§11 Phase 1; this is slice 4 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 4: snapping (endpoint, midpoint, perpendicular, parallel, grid)**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 (wall topology and room derivation), 2 (units and measurement), and 3 (pan, zoom, grid, rulers) are complete. Slice 5 (selection and the hit-test index) is being built in a parallel worktree and owns `core/geometry/polygon.ts` and the spatial index. **This slice touches only `editor/plan/`** (plus `ROADMAP.md` and the local knowledge graph), so it does not collide with the selection work: the small line-projection math for perpendicular and parallel snaps lives inside `snap.ts` rather than in `core/geometry/`.

**In scope for slice 4:**

- `editor/plan/snap.ts`: `snapPoint` (the best snap for a freely moving cursor, or `null` when nothing snaps), the `SnapKind` union, the `SnapResult` and `SnapContext` types, and the `DEFAULT_SNAP_GRID_MM` and `SNAP_PIXEL_TOLERANCE` constants. Endpoint, midpoint, grid, parallel, and perpendicular candidates, resolved in a fixed priority order.
- `editor/plan/draw-plan.ts`: `drawSnapIndicator` behind the existing `PlanDrawingContext` seam, gated by a new optional `snap?: SnapResult` on `DrawPlanOptions`; `drawPlan` paints the indicator above the walls and the preview.
- `editor/plan/plan-view.tsx`: derive a world-space tolerance from the pixel tolerance and the viewport scale, build the `SnapContext`, snap the cursor before feeding it to the wall tool, and pass the `SnapResult` to `drawPlan`.

**Out of scope for slice 4, deferred with intent (also recorded in `ROADMAP.md`):**

- **Snapping while editing walls.** Snapping applies to wall **drawing** only. Snapping while dragging an existing wall endpoint (or moving a wall) is part of **slice 6 (wall editing)** and follows there. This mirrors the slice-3 deferral of fit-to-selection until selection lands.
- **The five listed kinds only.** Snap to wall-line **intersections** (where two existing wall lines cross), snap to the **nearest point along a wall edge** (an "on-wall" snap rather than to an endpoint or midpoint), and **absolute angle / orthogonal** snaps (0, 45, and 90 degrees measured against the world axes, independent of any existing wall) are deferred. The slice ships the endpoint, midpoint, perpendicular, parallel, and grid kinds the design spec names for Phase 1, and no others.
- **Snap settings UI.** Per-kind enable/disable toggles and a user-configurable snap threshold belong with the editor-preferences surface (design spec §11 lists "snap thresholds" among editor preferences). This slice uses fixed default constants (`DEFAULT_SNAP_GRID_MM`, `SNAP_PIXEL_TOLERANCE`); wiring them to a preferences panel is a follow-up.
- **Canvas snap indicator (DOM overlay deferred).** The snap indicator is painted on the Canvas, consistent with the slice-3 decision to draw the grid and rulers on the Canvas. The design spec's DOM-overlay snap indicators (§6.2, CSS transforms mirroring the Canvas world matrix) are later polish and follow with the overlay work.

**Acceptance for slice 4:** endpoint, midpoint, grid, parallel, and perpendicular snaps each fire within `toleranceMm` and resolve in the stated priority (endpoint, then midpoint, then perpendicular, then parallel, then grid); grid is the always-available fallback when `gridSpacingMm > 0`; `snapPoint` returns `null` when grid snapping is disabled and no feature is in range; `drawSnapIndicator` paints a small marker at the snapped point through the narrow `PlanDrawingContext` seam. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the functional wall-drawing end-to-end spec still passes (the default viewport is unchanged, so the pointer-to-world mapping is identical and the snapped point coincides with the click when nothing else is in range and the grid catches the cursor).

---

## File structure

New and modified files, grouped by responsibility:

```
editor/plan/
  snap.ts            (create)  snapPoint; SnapKind, SnapResult, SnapContext; default constants
  snap.test.ts       (create)  endpoint/midpoint/grid/priority/parallel/perpendicular/no-snap behaviors
  draw-plan.ts       (modify)  drawSnapIndicator; snap option on DrawPlanOptions; drawPlan paints it last
  draw-plan.test.ts  (modify)  snap-indicator drawing (slice-1/3 tests stay green)
  plan-view.tsx      (modify, infra)  derive tolerance; build SnapContext; snap the cursor; pass snap to drawPlan

ROADMAP.md           (modify, infra)  mark slice 4 complete; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slices 1 and 3 confirmed. `snap.ts` is a pure module with no React or Canvas dependency: it imports `Point` from `core` and `WallSceneNode` from `core` (the scene-node type), plus nothing from `draw-plan.ts` or `viewport.ts`. The tolerance arrives already in world units (millimeters), so `snap.ts` never sees the viewport or the screen. `plan-view.tsx` is coverage-excluded glue (jsdom has no 2D canvas), validated by the existing wall-drawing end-to-end spec; if it would exceed `max-lines`, the snapping wiring is split into a small helper module the way slice 3 split `use-viewport-controls.ts`.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// editor/plan/snap.ts
import type { Point, WallSceneNode } from '../../core'

export type SnapKind = 'endpoint' | 'midpoint' | 'perpendicular' | 'parallel' | 'grid'

export interface SnapResult {
  point: Point // snapped world point (millimeters)
  kind: SnapKind
  referenceId?: string // id of the wall that produced an endpoint/midpoint/parallel/perpendicular snap
}

export interface SnapContext {
  walls: readonly WallSceneNode[]
  gridSpacingMm: number // <= 0 disables grid snapping
  toleranceMm: number // world-space snap radius (caller derives it from a pixel tolerance / viewport scale)
  origin?: Point // in-progress segment start; enables perpendicular and parallel snapping
}

/** Best snap for a freely moving cursor, or null when nothing snaps (grid disabled and no feature in range). */
export function snapPoint(cursor: Point, context: SnapContext): SnapResult | null

export const DEFAULT_SNAP_GRID_MM = 100
export const SNAP_PIXEL_TOLERANCE = 12

// editor/plan/draw-plan.ts (additions)
// drawn above walls and preview; gated by a new optional `snap?: SnapResult` on DrawPlanOptions
export function drawSnapIndicator(
  ctx: PlanDrawingContext,
  snap: SnapResult,
  viewport: Viewport,
): void
```

**Priority order.** When several candidates are in range, `snapPoint` returns the highest-priority one: **endpoint, then midpoint, then perpendicular, then parallel, then grid.** Endpoint, midpoint, perpendicular, and parallel snaps only fire when their candidate point lies within `toleranceMm` of the cursor. Grid is the always-available fallback when `gridSpacingMm > 0`: the nearest grid intersection is always within half a cell of the cursor, so the grid candidate is never out of range and is what `snapPoint` returns when no feature snap applies. Perpendicular and parallel candidates require `origin`: each projects the cursor onto the line through `origin` whose direction is perpendicular / parallel to the nearest reference wall's direction, and is accepted only when the cursor lies within `toleranceMm` of that line.

---

## Section A: snap computation (`editor/plan/snap.ts`)

### Task A1: endpoint snap

**Files:**

- Create: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (`/test-first` - behavior: "a cursor within `toleranceMm` of a wall endpoint snaps to that endpoint with kind `'endpoint'` and the wall's id as `referenceId`")

The behavior under test is `snapPoint(cursor, context)` from `./snap`. With one wall in `context.walls`, a `cursor` placed a few millimeters from one of that wall's endpoints (well inside `toleranceMm`), and `gridSpacingMm` set so the grid does not coincide with the endpoint, the result is the exact endpoint coordinate, `kind === 'endpoint'`, and `referenceId === wall.id`. A tiny illustrative shape of the assertion (not a full test):

```ts
// wall.start = { x: 1000, y: 1000 }; cursor = { x: 1003, y: 998 }; toleranceMm = 50
expect(snapPoint(cursor, context)).toEqual({
  point: { x: 1000, y: 1000 },
  kind: 'endpoint',
  referenceId: wall.id,
})
```

- [ ] **Step 2: Run to verify RED** - Run: `pnpm exec vitest run editor/plan/snap.test.ts`. Expected: FAIL (`snapPoint` / the module is not found).

- [ ] **Step 3: Minimal implementation** - introduce the `SnapKind`, `SnapResult`, `SnapContext` types and the constants, then return the nearest endpoint within `toleranceMm` (each wall contributes its `start` and `end`). Use the existing `distance` primitive from `core` for the proximity test. Keep the grid fallback out of scope until Task A3, but the function must already return a `SnapResult` shape.

- [ ] **Step 4: Run to verify GREEN** - Run: `pnpm exec vitest run editor/plan/snap.test.ts`. Expected: PASS.

- [ ] **Step 5: BLUE + commit** - `/clean-code-review` then `/refactor`.

### Task A2: midpoint snap

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "a cursor within `toleranceMm` of a wall's midpoint, but not near either endpoint, snaps to the midpoint with kind `'midpoint'` and the wall's id as `referenceId`")

With one wall whose midpoint is `((start + end) / 2)`, a `cursor` placed a few millimeters from that midpoint and far from both endpoints returns the midpoint coordinate, `kind === 'midpoint'`, and the wall's id. Choose a `gridSpacingMm` that does not coincide with the midpoint so the grid is not the winner.

- [ ] **Step 2: Run to verify RED** - Expected: FAIL (midpoint candidates are not yet considered).

- [ ] **Step 3: Minimal implementation** - add a midpoint candidate per wall (the average of `start` and `end`), tested against `toleranceMm` like the endpoint candidate. Endpoint candidates still take priority when both are in range (resolved fully in Task A4); this task only needs midpoint to fire when no endpoint is in range.

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A3: grid snap (the always-available fallback)

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with no wall feature in range, the cursor snaps to the nearest grid intersection, rounding to the nearest multiple of `gridSpacingMm` on each axis, with kind `'grid'` and no `referenceId`")

With `context.walls` empty (or every wall far away), `gridSpacingMm` positive, and a `cursor` whose coordinates are not multiples of the spacing, the result point is each axis rounded to the nearest multiple of `gridSpacingMm`, `kind === 'grid'`, and `referenceId` is absent. A tiny illustrative shape:

```ts
// gridSpacingMm = 100; cursor = { x: 1240, y: 1860 }
expect(snapPoint(cursor, context)).toEqual({ point: { x: 1200, y: 1900 }, kind: 'grid' })
```

- [ ] **Step 2: Run to verify RED** - Expected: FAIL (no grid candidate yet).

- [ ] **Step 3: Minimal implementation** - when `gridSpacingMm > 0`, compute the nearest grid intersection by rounding each axis (`Math.round(value / gridSpacingMm) * gridSpacingMm`) and return it as the fallback `SnapResult` when no feature snap applies. The nearest grid intersection is always within half a cell, so it is always accepted (no `toleranceMm` gate on the grid candidate).

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A4: priority (feature snaps beat grid; endpoint beats midpoint)

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "when an endpoint, a midpoint, and the grid are all in range, the endpoint wins; when only a midpoint and the grid are in range, the midpoint wins")

Construct a scene where, for one cursor, a wall endpoint, a wall midpoint, and a grid intersection all lie within `toleranceMm`; assert `kind === 'endpoint'`. Then construct a cursor where only a midpoint and the grid are in range (no endpoint within tolerance); assert `kind === 'midpoint'`. This pins the priority chain: endpoint over midpoint over grid.

- [ ] **Step 2: Run to verify RED** - Expected: FAIL if the earlier tasks happened to resolve ties by distance rather than by the fixed priority order.

- [ ] **Step 3: Minimal implementation** - resolve candidates by the fixed priority order **endpoint, midpoint, perpendicular, parallel, grid**, returning the first kind that has an in-range candidate (with grid always in range when enabled), rather than by nearest distance. Within a single kind, ties break by nearest candidate. Keep the function within `max-lines-per-function` by collecting candidates per kind into a small ordered list and selecting the first non-empty kind; avoid a nested ternary (the repo lints `no-nested-ternary`).

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS, with the Task A1-A3 tests unchanged.

- [ ] **Step 5: BLUE + commit**

### Task A5: parallel snap

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with `origin` set and a reference wall nearby, a cursor near the line through `origin` that runs parallel to that wall snaps onto that line, with kind `'parallel'` and the wall's id as `referenceId`")

Set `context.origin` to a known start point and include one reference wall with a clear direction (for example a horizontal wall, so the parallel line through `origin` is horizontal). Place the `cursor` slightly off that line (its perpendicular distance to the line is within `toleranceMm`) but far from any endpoint, midpoint, or grid feature. The result point is the cursor projected **onto** the parallel line (so it lies exactly on the line through `origin` with the wall's direction), `kind === 'parallel'`, and `referenceId` is the wall's id. A tiny illustrative shape:

```ts
// origin = { x: 0, y: 0 }; wall is horizontal; cursor = { x: 2000, y: 8 }; toleranceMm = 50
// snapped point lies on y = 0 (the parallel line through origin): { x: 2000, y: 0 }
expect(snapPoint(cursor, context).kind).toBe('parallel')
```

- [ ] **Step 2: Run to verify RED** - Expected: FAIL (no parallel candidate yet).

- [ ] **Step 3: Minimal implementation** - when `origin` is set, take the nearest reference wall's unit direction, build the line through `origin` with that direction, project the cursor onto it (the standard point-onto-line projection: `origin + ((cursor - origin) . dir) * dir`), and accept the candidate only when the cursor's perpendicular distance to that line is within `toleranceMm`. Slot it into the priority chain after perpendicular and before grid. Keep the projection helper small and pure; it is the only line-projection math in the slice and it stays inside `snap.ts` (no `core/` change).

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A6: perpendicular snap

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with `origin` set, a cursor near the line through `origin` that runs perpendicular to a reference wall snaps onto that line, with kind `'perpendicular'` and the wall's id as `referenceId`")

Mirror Task A5 but with the reference line **perpendicular** to the wall direction. With `origin` set and a horizontal reference wall, the perpendicular line through `origin` is vertical; a cursor slightly off that vertical line (within `toleranceMm`) but far from endpoints, midpoints, and grid features returns the cursor projected onto the vertical line, `kind === 'perpendicular'`, and the wall's id. Since perpendicular outranks parallel, also confirm that a cursor near **both** the perpendicular and the parallel lines resolves to `'perpendicular'`.

- [ ] **Step 2: Run to verify RED** - Expected: FAIL (no perpendicular candidate yet).

- [ ] **Step 3: Minimal implementation** - reuse the parallel projection helper with the wall direction rotated 90 degrees (swap and negate components) to get the perpendicular direction, project the cursor onto the line through `origin` with that direction, and accept within `toleranceMm`. Slot it into the priority chain after midpoint and before parallel, matching the contract's `endpoint > midpoint > perpendicular > parallel > grid` order.

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS, with all earlier tasks unchanged.

- [ ] **Step 5: BLUE + commit**

### Task A7: no snap

**Files:**

- Modify: `editor/plan/snap.ts`
- Test: `editor/plan/snap.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with `gridSpacingMm <= 0` and no wall feature in range and no `origin`, `snapPoint` returns `null`")

With grid snapping disabled (`gridSpacingMm` set to `0` or negative), no wall within `toleranceMm`, and no `origin` (so no perpendicular or parallel candidate), `snapPoint` returns `null`.

- [ ] **Step 2: Run to verify RED** - Expected: FAIL if the grid fallback fires regardless of `gridSpacingMm`, or if an empty candidate set returns a default instead of `null`.

- [ ] **Step 3: Minimal implementation** - gate the grid candidate on `gridSpacingMm > 0` and return `null` when the resolved candidate set is empty across every kind.

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS, with all earlier tasks unchanged.

- [ ] **Step 5: BLUE + commit**

---

## Section B: snap indicator drawing (`editor/plan/draw-plan.ts`)

### Task B1: `drawSnapIndicator` paints a marker at the snapped screen position

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawSnapIndicator paints a small marker centered at the snapped point's screen position through the `PlanDrawingContext` seam")

This is a `draw-plan.test.ts` behavior using the existing `recordingContext()` fake, mirroring how grid and ruler drawing are tested. The fake already records `arc` ops and `segments`; a ring marker is the natural shape (`arc` + `fill` or `stroke`), so no new fake members are required. The test calls `drawSnapIndicator(recorder.ctx, snap, viewport)` for a `SnapResult` at a known world point and asserts that a marker is drawn at the expected screen position, namely `worldToScreen(snap.point, viewport)` (for example, an `arc` centered there). A tiny illustrative shape:

```ts
// snap.point = { x: 1000, y: 0 }; viewport = { scale: DEFAULT_PLAN_SCALE }
// marker centered at worldToScreen({ x: 1000, y: 0 }, viewport)
drawSnapIndicator(recorder.ctx, snap, { scale: DEFAULT_PLAN_SCALE })
expect(recorder.ops).toContain('arc')
```

- [ ] **Step 2: Run to verify RED** - Run: `pnpm exec vitest run editor/plan/draw-plan.test.ts`. Expected: FAIL (`drawSnapIndicator` not exported).

- [ ] **Step 3: Minimal implementation** - project `snap.point` with `worldToScreen` and stroke or fill a small marker (a ring via `arc`, or a diamond via `moveTo`/`lineTo`) using only members already on `PlanDrawingContext`. Use named constants for the marker radius and color (the repo lints `no-magic-numbers`).

- [ ] **Step 4: Run to verify GREEN** - Expected: PASS, including the slice-1 and slice-3 tests (the marker uses existing seam members, so every fake stays a valid `PlanDrawingContext`).

- [ ] **Step 5: BLUE + commit**

### Task B2: `drawPlan` paints the snap indicator above walls and the preview

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "with a `snap` supplied, drawPlan paints the snap indicator after the walls and the preview; with no `snap`, it paints no indicator")

Call `drawPlan` with a wall, a preview, and a `snap` and assert the indicator's marker op (for example `arc`) appears after the last wall/preview stroke in the recorded `ops` order. Then call `drawPlan` with no `snap` and assert no extra marker is recorded (the slice-3 grid/ruler/wall ops are unchanged). The snap indicator paints **above** content but the rulers still paint last (they are the chrome band); place the snap draw between the preview and the rulers so the indicator sits over the plan but under the ruler bands. Confirm the assertion targets that ordering.

- [ ] **Step 2: Run to verify RED** - Expected: FAIL (`snap` is not an accepted option; no indicator op recorded).

- [ ] **Step 3: Minimal implementation** - add the optional `snap?: SnapResult` to `DrawPlanOptions` and, when present, call `drawSnapIndicator(ctx, options.snap, options.viewport)` after the wall and preview draws (and before `drawRulers`). A tiny illustrative shape of the added branch:

```ts
if (options.snap) {
  drawSnapIndicator(ctx, options.snap, options.viewport)
}
```

- [ ] **Step 4: Run to verify GREEN** - Run: `pnpm exec vitest run editor/plan/draw-plan.test.ts`. Expected: PASS, with the slice-1 and slice-3 tests (which omit `snap`) unchanged.

- [ ] **Step 5: BLUE + commit**

---

## Section C: glue and documentation (infrastructure)

### Task C1: PlanView snaps the cursor and renders the indicator (infrastructure)

**Files:**

- Modify: `editor/plan/plan-view.tsx`
- Possibly create: `editor/plan/use-snapping.ts` (only if `plan-view.tsx` would exceed `max-lines`)

This is controller-authored glue with no RGB triple; the snapping math is already in the tested pure `snap.ts`. Reviewed by `/clean-code-review`. `wall-tool.ts` itself needs **no** change: it already receives a `Point`, so the controller snaps the cursor before passing it in.

- [ ] **Step 1: Derive a world-space tolerance from the pixel tolerance and the live viewport scale** - the snap radius is `SNAP_PIXEL_TOLERANCE / viewport.scale`, so a fixed pixel tolerance maps to a varying world tolerance as the user zooms (a generous catch zoomed out, a tight one zoomed in):

```tsx
const toleranceMm = SNAP_PIXEL_TOLERANCE / viewport.scale
```

- [ ] **Step 2: Build the `SnapContext` and snap the cursor while drawing** - the context's `walls` are the scene-graph walls, `gridSpacingMm` is `DEFAULT_SNAP_GRID_MM`, `toleranceMm` is the derived radius, and `origin` is the wall tool's in-progress start when the tool is mid-draw (the `phase: 'drawing'` start) and absent otherwise. Snap the world cursor with `snapPoint` and feed the snapped point (when one exists, otherwise the raw cursor) to `advanceWallTool` and `wallPreviewSegment`. The wall tool still receives a plain `Point`; only the controller knows about snapping.

- [ ] **Step 3: Track the current `SnapResult` and pass it to `drawPlan`** - hold the latest snap (from the move handler) so the redraw can paint the indicator at the snapped point; pass it as the new `snap` option on the `drawPlan` call inside `usePlanRedraw`, and add it to the redraw dependencies so the indicator repaints as the cursor moves. The indicator shows only while the draw-wall tool is active (the select tool does not snap).

- [ ] **Step 4: Keep `plan-view.tsx` within `max-lines`** - if adding the snap context, the snapped-cursor wiring, and the snap state pushes `plan-view.tsx` over `max-lines`, extract the snapping wiring into a small `editor/plan/use-snapping.ts` helper (a `useSnapping` hook returning the snapped cursor and the current `SnapResult`), mirroring how slice 3 split `use-viewport-controls.ts`. Both files stay coverage-excluded glue.

- [ ] **Step 5: Verify** - Run the full check chain:

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green; `eslint .` at zero problems. `PlanView` (and any `use-snapping.ts`) stays coverage-excluded glue. Confirm the **functional** wall-drawing end-to-end logic is unaffected by reasoning: the default viewport is `{ scale: DEFAULT_PLAN_SCALE }` with no offset, so `eventToWorld` maps the e2e's canvas clicks to the same world points as before; with `DEFAULT_SNAP_GRID_MM` enabled the cursor snaps to the nearest grid intersection, so the recorded click world points stay deterministic and the drawn walls still terminate where the spec expects (the e2e clicks land on grid-aligned coordinates, or the spec's tolerance absorbs the snap). If the e2e asserts exact non-grid endpoints, adjust only the test's expected coordinates to the snapped values, not the wall-tool logic.

- [ ] **Step 6: Reviewed by `/clean-code-review`; commit `refactor:` (or `build:` if only wiring).**

### Task C2: roadmap update (infrastructure)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 4 done and record its deferrals** - flip the slice-4 row in the Phase 1 slice table from `pending` to `done`, and add a slice-4 scope/deferrals block mirroring the slice-1 and slice-3 blocks: snapping applies to wall drawing only (editing-time snapping is slice 6); the five listed kinds only (wall-line intersection, on-wall nearest-point, and absolute angle/orthogonal snaps deferred); per-kind enable/disable and a configurable threshold belong with the editor-preferences UI (this slice uses fixed default constants); the indicator is painted on the Canvas, with the DOM-overlay snap indicators (§6.2) deferred. Note the functional wall-drawing end-to-end spec still passes.

- [ ] **Step 2: Verify** - `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task C3: knowledge curation (post-merge, controller-run)

- [ ] After the section-level work lands, run the `knowledge-curator` to add a local **ADR: drawing-snap model (candidate kinds, fixed priority, world-space tolerance)** - the pure `snap.ts` seam, the `endpoint > midpoint > perpendicular > parallel > grid` priority chain, the grid as the always-available fallback when enabled, the perpendicular/parallel line-projection living inside `snap.ts` to stay decoupled from the slice-5 `core/geometry` work, the pixel-to-world tolerance derivation in the controller, and the optional `snap` draw field on `DrawPlanOptions` - and to refresh ADR-0021's cross-links for the snap indicator drawing through the existing `PlanDrawingContext` seam. Regenerate the local index with `pnpm knowledge:index`. No `docs/specs/` change is required because this implements behavior the spec already mandates (§6.2, §6.6, §10/§11 Phase 1). Run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Self-review

**Spec coverage:** §10/§11 Phase 1 "Wall drawing with snapping (endpoint, midpoint, perpendicular, parallel, grid)" is covered kind by kind: endpoint (Task A1), midpoint (Task A2), grid (Task A3), parallel (Task A5), and perpendicular (Task A6), with the fixed priority chain pinned by Task A4 and the disabled-grid / no-feature `null` path by Task A7. §6.6 "snapping" language (the 2D camera and navigation surface) is the cursor-snapping behavior these tasks deliver. §6.2 "snap indicators" is the Canvas-painted indicator (Tasks B1 and B2) through the narrow `PlanDrawingContext` seam, with the spec's DOM-overlay snap indicators explicitly deferred in the scope boundary. §11 editor-preferences "snap thresholds" is acknowledged: this slice ships fixed constants and defers the preferences UI.

**Placeholder scan:** No "TBD" / "TODO" / "handle edge cases" placeholders. Every behavior task names the signature under test (`snapPoint`, `drawSnapIndicator`), states the behavior precisely, and gives the exact `pnpm exec vitest run <path>` command with the expected PASS/FAIL. Per the project's role separation, the tasks show only tiny illustrative assertion shapes, never full test bodies or full implementations: the `test-author` writes the test from the behavior plus the public signatures, and the `implementer` writes minimal code from the failing-test output. Tasks C1-C3 are labeled `(infrastructure)` glue with no RGB triple, matching the slice-1 and slice-3 convention for `PlanView` wiring and roadmap/knowledge updates; they are reviewed by the clean-code-reviewer.

**Type consistency:** `Point` and `WallSceneNode` come from `core` unchanged (no `core/` change in this slice). `SnapKind`, `SnapResult`, `SnapContext`, `snapPoint`, `DEFAULT_SNAP_GRID_MM`, and `SNAP_PIXEL_TOLERANCE` live in `snap.ts` and are spelled identically in every task and in the `plan-view.tsx` glue. `SnapResult.referenceId` is optional (absent for grid snaps, present for endpoint/midpoint/perpendicular/parallel). `drawSnapIndicator(ctx, snap, viewport)` takes three params (no `max-params` disable needed) and consumes `worldToScreen` and `Viewport` from `viewport.ts`; `DrawPlanOptions` gains an optional `snap?: SnapResult` (absent = no indicator, so the slice-1 and slice-3 draw tests stay green). The world-space `toleranceMm` is derived once in the controller from `SNAP_PIXEL_TOLERANCE / viewport.scale`, so `snap.ts` never imports `viewport.ts`.

**Ordering:** the snap candidates are introduced in priority-friendly order (endpoint A1, midpoint A2, grid A3) before the priority chain is locked (A4), then the `origin`-dependent kinds (parallel A5, perpendicular A6) are added and the disabled-grid `null` path (A7) closes the contract; the drawing (B) consumes the `SnapResult` shape that Section A establishes; the glue and docs (C) follow the modules they wire. The `recordingContext` fake already records `arc` and the seam members the indicator needs, so no fake enrichment is required.

**Back-compatibility:** `DrawPlanOptions.snap` is optional, so every slice-1 and slice-3 draw test and call site compiles and passes unchanged. The functional wall-drawing end-to-end spec is preserved because the default viewport keeps `scale = DEFAULT_PLAN_SCALE` and a zero offset, leaving the pointer-to-world mapping identical; with grid snapping enabled the cursor lands on deterministic grid-aligned coordinates, and any exact-endpoint expectations in the e2e are updated to the snapped values (test expectations only, never the wall-tool logic). No `core/` module is touched, so the parallel slice-5 selection work over `core/geometry/polygon.ts` and the spatial index is unaffected.

**Em-dash scan:** the file uses hyphens throughout; no em-dash characters are present in the prose or the headings.
