# Selection and Hit Testing Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` authors its test independently from the behavior description plus the public signatures in this plan, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract and (rarely) a one-line illustrative snippet.

**Goal:** Make the two-dimensional plan selectable. Clicking selects the entity under the cursor (a wall or a room), a rubber-band marquee selects everything fully inside it, a modifier toggles multi-select, and a broad-phase spatial index (the hit-test index) backs both. Selected rooms gain a highlight, and the marquee draws while dragging.

**Architecture:** A pure broad-phase index `editor/plan/spatial-index.ts` stores axis-aligned bounds per entity id and answers point and rectangle queries (the design specification calls for a quadtree spatial index, sections 6.2 and 6.9; the **public contract is the query interface** and the internal structure is an implementation detail tested only through that contract). `editor/plan/hit-test.ts` grows `wallBounds`, `roomBounds`, and a unified `hitTest(scene, point, tolerance)` that uses the index for broad-phase candidates, then a precise narrow phase (nearest wall centerline within tolerance, falling back to the room whose polygon contains the point; a wall beats a room). `editor/plan/marquee.ts` adds `entitiesInRect` (window/contained selection). `core/geometry/polygon.ts` adds a pure `pointInPolygon` (exported through `core/index.ts`). The bridge selection store grows `toggle` and `setSelection` for multi-select; selection state stays bridge-owned and outside undo history (ADR-0020). `draw-plan.ts` grows `drawMarquee` (gated by a new optional `marquee?: Bounds` on `DrawPlanOptions`) and highlights selected rooms in `drawRoom` using the existing `selectedIds`. `plan-view.tsx` (thin glue, coverage-excluded) wires click-to-select, shift-to-toggle, click-empty-to-clear, and drag-to-marquee, and passes the marquee rect to `drawPlan` while dragging.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest for units. No new dependencies. The pure modules in `core/` and `editor/plan/` carry the behavior; `plan-view.tsx` is browser-only glue validated by the existing wall-drawing end-to-end spec.

---

## Scope boundary (design specification sections 6.2, 6.9, 10 Phase 1; this is slice 5 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 5: selection (click, marquee, multi-select) and the hit-test index**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 (wall topology and room derivation), 2 (units), and 3 (pan, zoom, grid, and rulers) are done.

**Coordination with slice 4 (snapping), a known sequencing point.** Slice 4 (snapping) is being built in a parallel worktree and also modifies `editor/plan/draw-plan.ts` and `editor/plan/plan-view.tsx`. **Slice 4 merges to `main` first; this branch then rebases onto it.** To keep that rebase mechanical, this slice keeps its additions to the two shared files narrow and localized: in `draw-plan.ts` it only adds `drawMarquee`, the optional `marquee?: Bounds` option, and a selected-room highlight inside the existing `drawRoom`; in `plan-view.tsx` it only adds the selection wiring (and, if needed, extracts that wiring into a small sibling helper module, the way slice 3 split `use-viewport-controls.ts`). This slice **owns** `core/geometry/polygon.ts`, `core/index.ts` (the `pointInPolygon` export), `editor/plan/spatial-index.ts`, `editor/plan/marquee.ts`, `editor/plan/hit-test.ts`, and `bridge/selection/selection-store.ts`; slice 4 touches none of those, so they cannot collide.

**In scope for slice 5:**

- `core/geometry/polygon.ts`: a pure `pointInPolygon(point, polygon)` (ray-casting / even-odd), exported through `core/index.ts`.
- `editor/plan/spatial-index.ts`: `buildSpatialIndex(entities)` returning a `SpatialIndex` with `queryPoint(point, tolerance)` and `queryBounds(region)`, the broad-phase index over per-entity axis-aligned bounds.
- `editor/plan/hit-test.ts`: `wallBounds`, `roomBounds`, and the unified `hitTest(scene, point, tolerance)` (broad phase through the index, narrow phase by nearest wall centerline then containing room). The existing `hitTestWalls` and `DEFAULT_HIT_TOLERANCE_MM` stay.
- `editor/plan/marquee.ts`: `entitiesInRect(scene, rect)` for window/contained selection.
- `bridge/selection/selection-store.ts`: `toggle` and `setSelection` added to `SelectionStore` for additive multi-select and marquee replacement (still bridge-owned, outside undo: ADR-0020).
- `editor/plan/draw-plan.ts`: `drawMarquee` behind the existing `PlanDrawingContext` seam, gated by a new optional `marquee?: Bounds`; a selected-room highlight inside `drawRoom`.
- `editor/plan/plan-view.tsx`: click-to-select / shift-to-toggle / click-empty-to-clear and drag-to-marquee wiring, passing the live marquee rect to `drawPlan`.

**Out of scope for slice 5, deferred with intent (also recorded in `ROADMAP.md`):**

- **Window (contained) marquee only.** The marquee selects entities **fully inside** the rectangle (a wall needs both endpoints inside; a room needs every vertex inside). Crossing selection (a right-to-left drag that also grabs partially-overlapping entities) is deferred to a later editing slice.
- **Only walls and rooms are selectable.** Openings and furniture do not exist yet; they become selectable when their slices land (openings in slice 7), at which point they register their own bounds with the index.
- **Selection persistence and 2D-to-3D sync are later slices.** The design specification persists selection with autosave and shares it across views (section 6.9); here the store stays in-memory. Autosave-snapshot persistence arrives with the project-stores slice (11) and the 3D selection sync with the 3D preview phase.
- **The index is correctness-first.** It answers the contract's point and rectangle queries correctly; quadtree depth and rebalance tuning, and dirty-region incremental rebuilds (rebuilding only the changed region rather than the whole index per edit), are deferred until the entity count makes them measurable.
- **Selection keyboard affordances beyond click and marquee are deferred.** Select-all and arrow-key nudging are later work; an Escape-to-clear may be included as trivial glue in Task I1 if it stays a one-liner.

**Acceptance for slice 5:** `pointInPolygon` is correct for inside and outside points (with a documented rule for points on an edge or vertex); `buildSpatialIndex` answers `queryPoint` (ids whose bounds are within tolerance of the point) and `queryBounds` (ids whose bounds intersect the region, empty index returns `[]`) as a broad phase; `wallBounds` and `roomBounds` span their entity's extent; `hitTest` returns the nearest wall within tolerance, falls back to the containing room (a wall in range beats a room), and returns `null` on a miss; `entitiesInRect` returns fully-contained walls and rooms and excludes partially-overlapping ones; `toggle` and `setSelection` give additive multi-select and marquee replacement; `drawMarquee` and the selected-room highlight paint through the narrow `PlanDrawingContext` seam. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the functional wall-drawing end-to-end spec still passes.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  geometry/polygon.ts        (modify)  add pointInPolygon (alongside polygonArea)
  geometry/polygon.test.ts   (modify)  pointInPolygon behaviors (polygonArea tests stay green)
  index.ts                   (modify, infra)  export pointInPolygon from the barrel

editor/plan/
  spatial-index.ts           (create)  IndexedEntity, SpatialIndex, buildSpatialIndex
  spatial-index.test.ts      (create)
  hit-test.ts                (modify)  wallBounds, roomBounds, hitTest (hitTestWalls stays)
  hit-test.test.ts           (modify)  bounds + hitTest behaviors (hitTestWalls tests stay green)
  marquee.ts                 (create)  entitiesInRect
  marquee.test.ts            (create)
  draw-plan.ts               (modify)  drawMarquee; marquee? option; selected-room highlight
  draw-plan.test.ts          (modify)  marquee + room-highlight behaviors (slice-3 tests stay green)
  plan-view.tsx              (modify, infra)  selection + marquee wiring
  use-plan-selection.ts      (create, infra, only if plan-view.tsx would exceed max-lines)

bridge/
  selection/selection-store.ts       (modify)  add toggle, setSelection
  selection/selection-store.test.ts  (modify)  toggle + setSelection behaviors (existing tests stay green)

ROADMAP.md                   (modify, infra)  mark slice 5 done; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slices 1 and 3 confirmed. `Bounds` (the `{ min, max }` rectangle) is the single rectangle type, imported from `editor/plan/fit.ts` by `spatial-index.ts`, `hit-test.ts`, `marquee.ts`, and `draw-plan.ts`; `Point` comes from `core` unchanged. `WallSceneNode`, `RoomSceneNode`, and `SceneGraph` come from `core/scene/scene-graph.ts` (via the `core` barrel). `plan-view.tsx` (and any extracted `use-plan-selection.ts`) is coverage-excluded glue (jsdom has no 2D canvas), validated by the existing wall-drawing end-to-end spec.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// core/geometry/polygon.ts (exported via core/index.ts)
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean

// editor/plan/spatial-index.ts
export interface IndexedEntity {
  id: string
  bounds: Bounds // Bounds from editor/plan/fit.ts
}
export interface SpatialIndex {
  /** Ids whose stored bounds lie within `tolerance` of `point` (bounds expanded by tolerance, then point-in-bounds). */
  queryPoint(point: Point, tolerance: number): string[]
  /** Ids whose stored bounds intersect `region`. */
  queryBounds(region: Bounds): string[]
}
export function buildSpatialIndex(entities: readonly IndexedEntity[]): SpatialIndex

// editor/plan/hit-test.ts (additions; existing hitTestWalls and DEFAULT_HIT_TOLERANCE_MM stay)
export function wallBounds(wall: WallSceneNode): Bounds
export function roomBounds(room: RoomSceneNode): Bounds
export function hitTest(scene: SceneGraph, point: Point, tolerance: number): string | null

// editor/plan/marquee.ts
export function entitiesInRect(scene: SceneGraph, rect: Bounds): string[]

// bridge/selection/selection-store.ts (additions to SelectionStore)
toggle(id: string): void
setSelection(ids: Iterable<string>): void

// editor/plan/draw-plan.ts (addition; gated by a new optional marquee?: Bounds on DrawPlanOptions)
export function drawMarquee(ctx: PlanDrawingContext, rect: Bounds, viewport: Viewport): void
// DrawPlanOptions gains: marquee?: Bounds (absent = no marquee; PlanView sets it only while dragging)
// drawRoom (private) gains a selected-room highlight driven by the existing selectedIds
```

---

## Section A: point-in-polygon (`core/geometry/polygon.ts`)

### Task A1: `pointInPolygon` classifies a point against a polygon

**Files:**

- Modify: `core/geometry/polygon.ts`
- Test: `core/geometry/polygon.test.ts`

**Behavior under test (`pointInPolygon(point, polygon)`):** A point strictly inside the polygon returns `true`; a point outside returns `false`. The implementation uses ray casting (even-odd / crossing-number) so it handles convex and non-convex polygons. Pick and **document one consistent boundary rule** for a point lying exactly on an edge or at a vertex (for example: a point on an edge counts as inside, applied uniformly via the half-open edge convention in the crossing test) and let the test pin that chosen rule with at least one on-edge case, so the behavior is deterministic rather than incidental. Cover a clearly-inside point, a clearly-outside point, and the documented on-edge case for a simple rectangle, plus one non-convex (for example L-shaped) polygon where a point in the reflex notch reads as outside.

- [ ] **Step 1 (RED):** `/test-first` for the behavior above, importing `pointInPolygon` from `./polygon`. Verify it fails because `pointInPolygon` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the minimal ray-casting `pointInPolygon` so the test passes, leaving `polygonArea` untouched and its tests green. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. The crossing loop is the same wrap-around iteration `polygonArea` already uses, so the BLUE phase should check for any shared edge-iteration helper worth extracting (only if it is real duplication, not coincidental). Commit `refactor:` (empty marker if no change).

---

## Section B: the hit-test index (`editor/plan/spatial-index.ts`)

### Task B1: `buildSpatialIndex` + `queryPoint` return entities near a point

**Files:**

- Create: `editor/plan/spatial-index.ts`
- Test: `editor/plan/spatial-index.test.ts`

**Behavior under test (`buildSpatialIndex(entities).queryPoint(point, tolerance)`):** Given several `IndexedEntity` records (each an `id` plus axis-aligned `Bounds`), `queryPoint` returns the ids of the entities whose bounds lie within `tolerance` of the query point (equivalently, whose bounds expanded by `tolerance` on every side contain the point) and **excludes** entities whose bounds are farther than the tolerance. Cover: a point inside one entity's bounds (returned) with a second, distant entity (excluded); and a point just outside an entity's bounds but within tolerance (returned). The returned ids are the broad-phase candidate set; ordering is unspecified, so the test compares as a set.

- [ ] **Step 1 (RED):** `/test-first` importing `buildSpatialIndex` (and the `IndexedEntity` / `SpatialIndex` types) from `./spatial-index`; `Bounds` from `./fit`. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `buildSpatialIndex` returning a `SpatialIndex` whose `queryPoint` answers the behavior. A correctness-first implementation may scan the stored bounds; the quadtree internals are an implementation detail behind the interface and are not part of the contract. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Watch `no-magic-numbers` (name any literal margins) and keep the bounds-overlap predicate factored so Task B2 can reuse it. Commit `refactor:`.

### Task B2: `queryBounds` returns entities intersecting a rectangle

**Files:**

- Modify: `editor/plan/spatial-index.ts`
- Test: `editor/plan/spatial-index.test.ts`

**Behavior under test (`buildSpatialIndex(entities).queryBounds(region)`):** `queryBounds` returns the ids of the entities whose stored bounds **intersect** the query rectangle and excludes entities whose bounds are disjoint from it (including the touching-versus-overlapping edge case, pinned to whichever inclusive/exclusive rule the implementation documents). Also cover: an **empty index** (`buildSpatialIndex([])`) returns an empty array for `queryBounds`. Compare as a set.

- [ ] **Step 1 (RED):** `/test-first` for `queryBounds` and the empty-index case. Verify it fails because `queryBounds` is not yet implemented. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `queryBounds` using the shared axis-aligned-bounds intersection predicate from Task B1. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `queryPoint` and `queryBounds` share one intersection predicate (real duplication) rather than two near-copies. Commit `refactor:`.

---

## Section C: bounds and the unified hit test (`editor/plan/hit-test.ts`)

### Task C1: `wallBounds` spans a wall's endpoints

**Files:**

- Modify: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

**Behavior under test (`wallBounds(wall)`):** Returns the axis-aligned `Bounds` whose `min` is the per-axis minimum of the wall's `start` and `end` and whose `max` is the per-axis maximum, for a wall in any orientation (including one drawn right-to-left or bottom-to-top, so the function normalizes rather than assuming `start <= end`).

- [ ] **Step 1 (RED):** `/test-first` importing `wallBounds` from `./hit-test` and `Bounds` from `./fit`. Verify it fails because `wallBounds` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `wallBounds`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Note any min/max-corner logic shared with `roomBounds` (Task C2) and `contentBounds` in `fit.ts` for a possible extraction if it is real duplication. Commit `refactor:`.

### Task C2: `roomBounds` spans a room polygon's vertices

**Files:**

- Modify: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

**Behavior under test (`roomBounds(room)`):** Returns the axis-aligned `Bounds` spanning every vertex of `room.polygon` (the min and max corner over all vertices).

- [ ] **Step 1 (RED):** `/test-first` importing `roomBounds` from `./hit-test`. Verify it fails because `roomBounds` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `roomBounds`. `contentBounds(room.polygon)` from `fit.ts` already computes the bounds of a point set and returns a non-null result for a non-empty polygon, so reuse it rather than re-deriving the corner sweep. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `wallBounds` and `roomBounds` do not duplicate the corner sweep that `contentBounds` already owns. Commit `refactor:`.

### Task C3: `hitTest` returns the nearest wall within tolerance

**Files:**

- Modify: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

**Behavior under test (`hitTest(scene, point, tolerance)`):** Given a `SceneGraph` with several walls, `hitTest` returns the id of the wall whose centerline is nearest the point when that nearest distance is within `tolerance`; when two walls are in range, the nearer one wins. This is the narrow phase after the broad phase: `hitTest` builds the index over `wallBounds`/`roomBounds`, queries `queryPoint(point, tolerance)` for candidates, and resolves walls among the candidates by centerline distance (the same nearest-centerline rule `hitTestWalls` already encodes; reuse it over the candidate walls rather than restating the distance math).

- [ ] **Step 1 (RED):** `/test-first` importing `hitTest` from `./hit-test`, building a `SceneGraph` with two walls so the nearer is selected. Verify it fails because `hitTest` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `hitTest` so it indexes the scene, broad-phase queries the point with the tolerance, and returns the nearest in-range wall id from the candidates. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `hitTest` small (one level of abstraction): broad phase, then a narrow-phase helper per entity kind. Reuse `hitTestWalls` for the wall narrow phase rather than duplicating the centerline-distance loop. Commit `refactor:`.

### Task C4: `hitTest` falls back to the containing room, and a wall beats a room

**Files:**

- Modify: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

**Behavior under test (`hitTest(scene, point, tolerance)`):** With no wall centerline within tolerance of the point, `hitTest` returns the id of the room whose polygon **contains** the point (via `pointInPolygon`). When a wall **is** within tolerance and the point is also inside a room, the **wall wins** (a wall beats a room). Cover both: a point inside a room but far from any wall (returns the room id) and a point inside a room and also within tolerance of a wall (returns the wall id).

- [ ] **Step 1 (RED):** `/test-first` for the room-fallback and wall-beats-room cases, building a `SceneGraph` with a wall and a room. Verify it fails (rooms are not yet considered). Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the narrow-phase precedence: resolve the nearest in-range wall first; if none, return the first candidate room whose polygon contains the point (using `pointInPolygon` over the broad-phase room candidates). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the wall-then-room precedence explicit and readable; avoid a nested ternary (`no-nested-ternary`). Commit `refactor:`.

### Task C5: `hitTest` returns null on a miss

**Files:**

- Modify: `editor/plan/hit-test.ts`
- Test: `editor/plan/hit-test.test.ts`

**Behavior under test (`hitTest(scene, point, tolerance)`):** When the point is neither within tolerance of any wall centerline nor inside any room polygon, `hitTest` returns `null`. Cover a point in empty space well away from every wall and room.

- [ ] **Step 1 (RED):** `/test-first` for the miss case. Verify it fails (or, if the prior tasks already return `null` here, that the new assertion exercises an unpinned path). Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the miss path so `hitTest` returns `null` when no wall and no room is hit. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Commit `refactor:` (empty marker if the precedence logic already produced this).

---

## Section D: marquee selection (`editor/plan/marquee.ts`)

### Task D1: `entitiesInRect` returns fully-contained walls and rooms

**Files:**

- Create: `editor/plan/marquee.ts`
- Test: `editor/plan/marquee.test.ts`

**Behavior under test (`entitiesInRect(scene, rect)`):** Returns the ids of the walls **fully contained** in `rect` (both endpoints inside) and the rooms **fully contained** (every polygon vertex inside), and **excludes** any wall or room only partially overlapping the rectangle (window/contained selection, not crossing). Cover: a wall entirely inside (included), a wall straddling the boundary with one endpoint outside (excluded), a room entirely inside (included), and a room with one vertex outside (excluded). Compare as a set. A point counts as inside the rectangle by the same documented boundary rule used elsewhere (a point on the rect edge counts as inside).

- [ ] **Step 1 (RED):** `/test-first` importing `entitiesInRect` from `./marquee`, with a `SceneGraph` holding contained and straddling walls and rooms. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `entitiesInRect` testing each wall's two endpoints and each room's vertices for containment in `rect` (a small point-in-bounds predicate; reuse the bounds predicate from `spatial-index.ts` if it is shared, broad-phase filtering candidates with `queryBounds` first is allowed but not required for correctness). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the point-in-rect containment check shared rather than copied per entity kind. Commit `refactor:`.

---

## Section E: multi-select store (`bridge/selection/selection-store.ts`)

### Task E1: `toggle` adds or removes one id, preserving the rest

**Files:**

- Modify: `bridge/selection/selection-store.ts`
- Test: `bridge/selection/selection-store.test.ts`

**Behavior under test (`store.toggle(id)`):** Toggling an id not currently selected **adds** it to the selection; toggling an id already selected **removes** it; either way the rest of the selection is preserved (additive multi-select). A `toggle` that changes the set notifies subscribers. Cover: toggle into an empty selection (now `{id}`); toggle a second id (now both); toggle one of two back off (now just the other). The store stays bridge-owned and outside undo history (ADR-0020).

- [ ] **Step 1 (RED):** `/test-first` against `createSelectionStore().toggle`. Verify it fails because `toggle` is not on `SelectionStore`. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `toggle` on the store, building the next immutable `ReadonlySet` from the current one and reusing the existing private `setSelected` notify path. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `select`, `clear`, `toggle`, and `setSelection` all route through one `setSelected` so the subscribe/notify contract stays single-sourced. Commit `refactor:`.

### Task E2: `setSelection` replaces the whole selection

**Files:**

- Modify: `bridge/selection/selection-store.ts`
- Test: `bridge/selection/selection-store.test.ts`

**Behavior under test (`store.setSelection(ids)`):** Replaces the entire current selection with exactly the given ids (any `Iterable<string>`), used by the marquee on release. After `setSelection(['a', 'b'])` the selection is `{a, b}` regardless of what was selected before; `setSelection([])` clears it. A replacement that changes the set notifies subscribers.

- [ ] **Step 1 (RED):** `/test-first` against `createSelectionStore().setSelection`. Verify it fails because `setSelection` is not on `SelectionStore`. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `setSelection` materializing the iterable into a fresh `ReadonlySet` and routing through `setSelected`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Commit `refactor:` (empty marker if no change).

---

## Section F: marquee and room highlight drawing (`editor/plan/draw-plan.ts`)

### Task F1: `drawMarquee` paints the marquee rectangle

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawMarquee(ctx, rect, viewport)`):** Paints the marquee rectangle (a translucent fill and/or a dashed/solid stroke) at the rectangle's **screen** position, projecting `rect.min` and `rect.max` through `worldToScreen(_, viewport)` so the marquee tracks pan and zoom. The behavior is observed through the slice-3 recording fake context (`recordingContext()` in `draw-plan.test.ts`): it records a stroked or filled rectangle covering the projected screen span (for example a `fillRect`, or a closed four-segment path) at the expected screen coordinates. `drawMarquee` uses only members already on `PlanDrawingContext` (`strokeStyle`, `fillStyle`, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `closePath`, `stroke`, `fill`, `fillRect`), so the seam does not grow and every existing fake stays valid.

- [ ] **Step 1 (RED):** `/test-first` importing `drawMarquee` from `./draw-plan`, asserting a marquee rectangle is recorded at the projected screen span for a known `rect` and `viewport`. Verify it fails because `drawMarquee` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `drawMarquee`, projecting the two corners and painting one rectangle through the existing seam. Name the marquee colors and line width as module constants (`no-magic-numbers`). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Commit `refactor:`.

### Task F2: `drawPlan` paints the marquee when the option is set

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawPlan(ctx, options)` with `options.marquee`):** When `DrawPlanOptions.marquee` is a `Bounds`, `drawPlan` paints the marquee (above the walls, as an overlay; ordering relative to the rulers is unspecified but consistent) by calling `drawMarquee`; when `marquee` is absent, no marquee is painted and the slice-3 draw output is unchanged. The `marquee` field is optional, so every existing `drawPlan` test (which omits it) stays green. Observe through the recording fake: with `marquee` set, a marquee rectangle appears; without it, none does.

- [ ] **Step 1 (RED):** `/test-first` for the marquee-present and marquee-absent cases of `drawPlan`. Verify it fails because `marquee` is not an accepted option. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `marquee?: Bounds` on `DrawPlanOptions` and the gated `drawMarquee` call inside `drawPlan`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawPlan` a readable paint-order sequence; this addition is a single guarded call, so `max-lines-per-function` stays satisfied. Commit `refactor:`.

### Task F3: `drawRoom` highlights a selected room

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (selected-room highlight, exercised through `drawPlan`):** A room whose id is in `options.selectedIds` is drawn **visibly distinguished** from an unselected room (for example a highlighted outline stroked around the room, or a distinct fill), mirroring how `drawWall` already swaps to `SELECTED_WALL_COLOR` for a selected wall. An unselected room keeps its current fill-only appearance, so the slice-1/slice-3 room-drawing tests stay green. Observe through the recording fake: with the room's id in `selectedIds`, a highlight stroke or distinct fill is recorded for that room; with an empty `selectedIds`, only the existing room fill is recorded. `drawRoom` uses only existing seam members.

- [ ] **Step 1 (RED):** `/test-first` driving `drawPlan` with a room once in `selectedIds` and once not, asserting the selected case records the extra highlight and the unselected case does not. Verify it fails because `drawRoom` ignores selection today. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the highlight branch in `drawRoom` (it needs the room's selected state; thread `selectedIds` or the per-room boolean into `drawRoom` the way `drawWall` already receives `options`). Name any new highlight color/width constant. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep `drawRoom` within `max-lines-per-function` and `max-params` (pass an options object or the per-room boolean, not a fourth positional parameter). Commit `refactor:`.

---

## Section G: glue and documentation (infrastructure)

### Task G1: wire selection and the marquee into `plan-view.tsx` (infrastructure)

**Files:**

- Modify: `editor/plan/plan-view.tsx`
- Create (only if needed for `max-lines`): `editor/plan/use-plan-selection.ts`
- Modify: `core/index.ts` (export `pointInPolygon` from the barrel)

This is controller-authored Canvas-and-pointer glue with no RGB triple (jsdom has no 2D canvas). All of its logic lives in the pure modules above; this task only wires them. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Export `pointInPolygon` from the core barrel.** Add `export { pointInPolygon } from './geometry/polygon'` alongside the existing `polygonArea` export in `core/index.ts` (it joins the value-export block, not the type block).
- [ ] **Step 2: Upgrade click-to-select to the unified `hitTest`.** In the existing `applyPointer` select-tool branch, replace `hitTestWalls(walls, world, DEFAULT_HIT_TOLERANCE_MM)` with `hitTest(graph, world, tolerance)` so a click can select a room as well as a wall. Convert the pixel tolerance to world units via the viewport scale (`tolerance = DEFAULT_HIT_TOLERANCE_MM` stays a world distance today; keep it world-space, and where any pixel radius is used, divide by `viewport.scale`). On a hit, `selection.select(hit)`; on a miss, `selection.clear()`.
- [ ] **Step 3: Add shift-to-toggle.** When the pointer-down event has the shift modifier and the select tool is active, call `selection.toggle(hit)` for a hit (additive multi-select) instead of `select`; a shift-click on empty space leaves the selection unchanged (or clears, per the documented choice) rather than replacing it.
- [ ] **Step 4: Add drag-to-marquee.** When the select tool is active (the wall tool is **not** active) and no pan gesture is in progress, a left-button drag accumulates a marquee rect (`Bounds` from the press world point to the current world point, normalized so `min <= max`). Pass that rect to `drawPlan` as `marquee` while dragging so it paints live; on release, call `selection.setSelection(entitiesInRect(graph, rect))`. A bare click (press and release without a drag past a small threshold) keeps the Step 2/3 click-select behavior rather than selecting an empty marquee. The marquee path must **not** fire while the wall tool is active, so wall drawing is unaffected.
- [ ] **Step 5: Keep the wall-drawing end-to-end spec green.** The marquee and selection wiring only run under the `select` tool; the `draw-wall` tool path is unchanged, and the default viewport still maps the end-to-end canvas clicks to the same world points. Optionally wire Escape-to-clear here **only if** it is a trivial one-liner (otherwise defer per the scope boundary).
- [ ] **Step 6: Respect `max-lines`.** If `plan-view.tsx` would exceed `max-lines` with the marquee state machine, extract the selection/marquee wiring into a small `use-plan-selection.ts` hook (returning the pointer handlers and the live marquee rect), the way slice 3 split `use-viewport-controls.ts`. Keep both files coverage-excluded glue.
- [ ] **Step 7: Verify.** Run the full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Expected: all green; `eslint .` at zero problems; `plan-view.tsx` (and any `use-plan-selection.ts`) stays coverage-excluded glue. Confirm by reasoning that the functional wall-drawing end-to-end logic is unaffected (selection wiring is gated on the `select` tool).
- [ ] **Step 8:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task G2: roadmap update (infrastructure, final task, after the code lands)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 5 done and record its deferrals.** Flip the slice-5 row from `pending` to `done`, update the current-status sentence to include slice 5, and add a "Slice 5 (done) scope and deferrals" block mirroring the slice-1 and slice-3 voice: window (contained) marquee only with crossing selection deferred; only walls and rooms selectable (openings and furniture later); selection persistence with autosave and 2D-to-3D selection sync are later slices (the store stays in-memory); the index is correctness-first with quadtree tuning and dirty-region incremental rebuilds deferred; keyboard affordances beyond click and marquee (select-all, arrow nudging) deferred.
- [ ] **Step 2: Verify.** `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task G3: knowledge curation (post-merge, controller-run)

- [ ] After the section-level work lands, run the `knowledge-curator` to add a local ADR for the hit-test index and selection model: the broad-phase spatial-index interface (`queryPoint` / `queryBounds`) with the quadtree as an internal detail, the broad-then-narrow `hitTest` pipeline with wall-beats-room precedence, `pointInPolygon` and its documented boundary rule, the window-only marquee (`entitiesInRect`), and the bridge selection store growing `toggle` / `setSelection` while staying outside undo history (cross-link ADR-0020). No `docs/specs/` change is required because this implements behavior the specification already mandates (sections 6.2 and 6.9). Regenerate the local index with `pnpm knowledge:index` and run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Self-review

**Spec coverage:** Section 6.2 ("hit testing via a quadtree spatial index over scene entities") is covered by Section B (`buildSpatialIndex`, `queryPoint`, `queryBounds`) as the broad-phase index and Section C (`hitTest`) as the broad-then-narrow pipeline; the quadtree is an internal detail behind the query interface, with depth/rebalance tuning deferred in the scope boundary. Section 6.9 ("2D hit testing: quadtree spatial index"; "Selection state: shared across views, persisted with autosave") is covered by Sections B/C (the index) and Section E (the shared bridge store), with autosave persistence and 2D-to-3D sync explicitly deferred to later slices per the scope boundary. Section 10/11 Phase 1 ("Selection (click, marquee, multi-select)") maps to: click via `hitTest` and the Task G1 wiring; marquee via `entitiesInRect`, `drawMarquee`, and the Task G1 drag wiring; multi-select via `toggle` and `setSelection`. The selected-room highlight (Section F3) completes the slice-1 deferral ("no room selection or hit-testing belongs with slice 5"). `pointInPolygon` (Section A) backs the room narrow phase and the room-containment marquee test.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders. Every behavior task names the signature under test and the concrete cases to pin; every infrastructure step is a concrete wiring instruction. No literal test bodies or full implementations are included, per the role-separated cycle; the only code shown is the public-contract block and a single one-line barrel-export instruction.

**Type-name consistency:** The public names are spelled identically across every task and the contract block: `pointInPolygon`, `buildSpatialIndex`, `IndexedEntity`, `SpatialIndex`, `queryPoint`, `queryBounds`, `wallBounds`, `roomBounds`, `hitTest`, `entitiesInRect`, `toggle`, `setSelection`, `drawMarquee`. `Bounds` is the single rectangle type (from `editor/plan/fit.ts`), `Point` is from `core` unchanged, and `WallSceneNode` / `RoomSceneNode` / `SceneGraph` come from `core/scene/scene-graph.ts` via the `core` barrel. The existing `hitTestWalls` and `DEFAULT_HIT_TOLERANCE_MM` are retained; `hitTest` reuses `hitTestWalls` for the wall narrow phase. `DrawPlanOptions.marquee` and `SelectionStore.toggle` / `setSelection` are additive, so slice-1/3 call sites and tests compile and pass unchanged.

**Ordering and dependencies:** `pointInPolygon` (A) precedes the room narrow phase (C4) and the marquee room test (D1) that rely on containment; the spatial index (B) precedes `hitTest` (C3-C5), which consumes it; `wallBounds`/`roomBounds` (C1-C2) precede `hitTest` (C3+), which indexes them; the store changes (E) precede the glue (G1) that calls `toggle`/`setSelection`; the drawing (F) precedes the glue (G1) that passes `marquee` and relies on the room highlight; the roadmap update (G2) is the final task after all code lands. Within `draw-plan.test.ts` the existing `recordingContext()` fake already exposes every member `drawMarquee` and the room highlight use (the seam does not grow), so all fakes in the file stay valid `PlanDrawingContext` values.

**Back-compatibility:** `Viewport`, `DrawPlanOptions` (now with optional `marquee`), and `SelectionStore` (now with `toggle`/`setSelection`) remain compatible with every existing call site and test. The functional wall-drawing end-to-end spec is preserved because all new wiring is gated on the `select` tool and the default viewport keeps the original scale and zero offset, leaving the `draw-wall` pointer-to-world mapping identical. The rebase onto slice 4 is mechanical because this slice's edits to the two shared files (`draw-plan.ts`, `plan-view.tsx`) are localized additions and this slice owns every other touched file.
