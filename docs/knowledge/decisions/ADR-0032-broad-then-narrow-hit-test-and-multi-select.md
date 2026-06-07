---
slug: decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select
title: 'ADR-0032: Broad-then-narrow plan hit testing and additive multi-select'
type: decision
tags:
  [
    architecture,
    editor,
    plan,
    hit-testing,
    spatial-index,
    selection,
    marquee,
    multi-select,
    geometry,
    testability,
  ]
related:
  [
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-06-selection-and-hit-testing.md,
    core/geometry/polygon.ts,
    core/index.ts,
    editor/plan/spatial-index.ts,
    editor/plan/hit-test.ts,
    editor/plan/marquee.ts,
    editor/plan/draw-plan.ts,
    editor/plan/plan-view.tsx,
    editor/plan/use-plan-selection.ts,
    bridge/selection/selection-store.ts,
  ]
status: current
updated: 2026-06-06
---

# ADR-0032: Broad-then-narrow plan hit testing and additive multi-select

## Status

Accepted, landed. The 2D plan is selectable: a click picks the wall or room
under the cursor, a shift-click toggles into an additive multi-selection, and a
rubber-band marquee replaces the selection with everything fully inside it. A
broad-phase spatial index over per-entity axis-aligned bounds backs both the
click hit test and the marquee. This is slice 5 of Phase 1 (the 2D plan editor),
implementing behavior the design specification already mandates (sections 6.2
and 6.9); no `docs/specs/` change was required. ADR-0021 remains the parent
record for the plan path, ADR-0020 the parent record for the selection store;
this ADR records the hit-test architecture and the multi-select extension that
build on both.

## Context

ADR-0021 shipped the plan path with a single hit test, `hitTestWalls`, a linear
point-to-segment scan that returned the nearest wall centerline within
tolerance. It deferred two things the specification calls for: a quadtree
spatial index over scene entities (section 6.2, "hit testing via a quadtree
spatial index"; section 6.9, "2D hit testing: quadtree spatial index"), and
selecting rooms, not just walls. ADR-0020 shipped the selection store as
single-select only (`select` replaces rather than adds), but left its
`ReadonlySet` surface deliberately multi-select-shaped, noting group selection
would "extend the store without changing its contract."

This slice closes both gaps. Two design constraints carried over from the prior
plan ADRs. First, testability: every piece of geometry must be a pure function
unit-tested in plain Node, leaving only Canvas-and-pointer wiring in the
coverage-excluded glue. Second, the specification names a quadtree, but a slice
that ships a correct broad-phase contract should not be blocked on tuning a tree
that the current entity count cannot measure.

## Decision

### A broad-phase index defined by its query interface, not its data structure

`editor/plan/spatial-index.ts` introduces `buildSpatialIndex(entities)`
returning a `SpatialIndex` with two queries:

- `queryPoint(point, tolerance)`: the ids whose stored bounds, expanded outward
  by `tolerance` on every side, contain the point.
- `queryBounds(region)`: the ids whose stored bounds intersect the region
  (touching edges count as intersecting).

Each indexed entity is an `{ id, bounds }` pair, where `bounds` is the single
`{ min, max }` rectangle type from `editor/plan/fit.ts`. The contract is the
query interface; the internal structure is an implementation detail tested only
through that contract. The shipped implementation is a correctness-first linear
scan, and `buildSpatialIndex` documents in place that the specification's
quadtree is "an internal detail behind this contract and not yet materialized."
The two queries share the same pair of pure predicates (`pointInBounds` over an
`expandBounds`, and `boundsIntersect`), so a future quadtree swaps the storage
without touching the meaning of a query. An empty index returns `[]` from both.

### `hitTest` is broad-phase candidates, then a precise narrow phase

`editor/plan/hit-test.ts` keeps `hitTestWalls` and `DEFAULT_HIT_TOLERANCE_MM`
and adds three exports:

- `wallBounds(wall)`: the axis-aligned bounds spanning a wall's `start` and
  `end`, normalized so orientation does not matter.
- `roomBounds(room)`: the axis-aligned bounds spanning every vertex of the room
  polygon (it reuses `contentBounds` from `fit.ts` rather than re-deriving the
  corner sweep).
- `hitTest(scene, point, tolerance)`: the unified hit test that returns one
  entity id or `null`.

`hitTest` runs broad-then-narrow. It builds the index over `wallBounds` and
`roomBounds` for the scene, queries `queryPoint(point, tolerance)` for the
candidate id set, then resolves the narrow phase in a fixed precedence: among the
candidate walls it reuses `hitTestWalls` (the same nearest-centerline rule
ADR-0021 established) and, only if no wall is in range, returns the first
candidate room whose polygon contains the point. A wall in range always beats a
room. The broad phase keeps the narrow phase off every non-candidate entity; the
narrow phase reuses the existing distance rule rather than restating it.

### Room containment lives in pure `core/geometry`

The room narrow phase needs point-in-polygon. `core/geometry/polygon.ts` gains a
pure `pointInPolygon(point, polygon)` (exported through `core/index.ts` beside
`polygonArea`). It is an even-odd ray-casting test that handles convex and
non-convex polygons, with a documented, deterministic boundary rule: a point on
an edge or at a vertex counts as inside. The crossing loop uses a half-open edge
convention so each vertex is counted exactly once, and an explicit on-edge check
makes the inclusive boundary deterministic rather than incidental. This is the
one piece of this slice's geometry that belongs in `core/`, since it is a pure
domain primitive with no editor or Canvas dependency. The line-projection math
for the parallel slice (snapping) deliberately stayed in `editor/plan` so the
two parallel slices did not collide in `core/geometry` (ADR-0033).

### The marquee is window (contained) selection

`editor/plan/marquee.ts` adds `entitiesInRect(scene, rect)`: the ids of the
walls fully inside `rect` (both endpoints inside) and the rooms fully inside
(every polygon vertex inside), excluding any entity that only partially overlaps.
This is window/contained selection, not crossing selection. A point counts as
inside the rectangle by the same inclusive boundary rule used elsewhere, so an
entity touching the rect edge is contained.

### Multi-select extends the bridge selection store, still outside undo

The selection store (`bridge/selection/selection-store.ts`, ADR-0020) grows two
methods that route through the same private `setSelected` notify path as
`select` and `clear`:

- `toggle(id)`: builds the next immutable `ReadonlySet` from the current one,
  adding the id when absent and removing it when present, preserving the rest.
  This is additive multi-select, driven by shift-click.
- `setSelection(ids)`: materializes any `Iterable<string>` into a fresh
  `ReadonlySet` and replaces the whole selection wholesale, driven by the marquee
  on release.

Both keep the immutable-replacement discipline ADR-0020 requires for a tear-free
`useSyncExternalStore` source, and neither goes through `dispatch`, so selection
stays bridge-owned and outside the undo history (section 7.1). This is the group
selection ADR-0020 anticipated: the store's contract and its consumers did not
change, only its surface grew.

### Drawing and glue

`draw-plan.ts` grows `drawMarquee(ctx, rect, viewport)`, which projects the rect
corners through `worldToScreen` and paints a screen-space rectangle through the
existing narrow `PlanDrawingContext` seam (ADR-0021), gated by a new optional
`marquee?: Bounds` on `DrawPlanOptions`; and a selected-room highlight inside
`drawRoom`, driven by the existing `selectedIds` the way `drawWall` already swaps
to a selected color. Both use only seam members already present, so the seam did
not grow and every recording fake stayed valid.

The Canvas-and-pointer wiring lives in coverage-excluded glue. `plan-view.tsx`
delegates the selection state machine to a sibling `use-plan-selection.ts` hook
(the same glue-split pattern slices 3 and 4 used for `use-viewport-controls.ts`
and `use-snapping.ts`): a plain click runs `hitTest` and `select` or `clear`, a
shift-click runs `toggle`, and a left-button drag past a small threshold under
the select tool accumulates a normalized marquee rect, paints it live via the
`marquee` option, and on release calls `setSelection(entitiesInRect(...))`. The
marquee path never fires while the wall tool is active, so wall drawing is
unaffected.

## Consequences

- The hit test is now broad-then-narrow with an explicit wall-beats-room
  precedence, and it picks rooms as well as walls. The expensive narrow-phase
  geometry runs only over the candidate set the index returns, so adding entity
  kinds (openings, furniture) is a matter of registering their bounds and adding
  a narrow-phase branch, not rescanning the whole scene.
- The spatial index is correctness-first behind a query contract. A quadtree can
  replace the linear scan behind `queryPoint` / `queryBounds` with zero change to
  `hitTest`, `entitiesInRect`, or any caller. Quadtree depth and rebalance
  tuning, and dirty-region incremental rebuilds, are deferred until the entity
  count makes them measurable.
- `pointInPolygon` is the reusable room-containment primitive in `core/`, with a
  pinned inclusive boundary rule, available to any future containment query (a
  later crossing-marquee, room labeling, point-in-room tests in 3D) without
  re-deriving the even-odd test.
- The selection store is now genuinely multi-select (`toggle`, `setSelection`)
  while remaining a bridge observable outside undo. ADR-0020's prediction held:
  the `ReadonlySet` surface absorbed group selection without a contract change.
- The marquee is window-only by design. Crossing selection (a right-to-left drag
  that grabs partial overlaps) is deferred to a later editing slice; it is a new
  predicate over the same `queryBounds` candidates, not a new architecture.
- Selection still does not persist and does not sync to 3D. The store stays
  in-memory; autosave-snapshot persistence arrives with the project-stores slice
  and the 2D-to-3D selection sync with the 3D preview phase (section 6.9), both
  attaching to the existing store rather than changing it.

## Alternatives considered

- **Ship a quadtree now to match the spec's wording literally.** Rejected as
  premature: the contract the spec actually depends on is the point/rectangle
  query, and a tuned tree cannot be measured at the current entity count. The
  query interface lets the tree land later behind the same signatures.
- **Put `pointInPolygon` in `editor/plan` beside the snap projection math.**
  Rejected: containment is a pure domain primitive with no editor dependency, so
  it belongs in `core/geometry`. The snap line-projection math stayed in
  `editor/plan` only to avoid a `core/geometry` collision with the parallel
  snapping slice (ADR-0033); that reasoning does not apply to a primitive only
  this slice needed.
- **Resolve wall-versus-room hits by raw nearest distance.** Rejected: a room
  fill is a large area and a wall a thin line, so a distance contest would let a
  room steal a click meant for a wall on its boundary. An explicit
  wall-beats-room precedence is predictable and matches the user's intent.
- **Hold multi-select state on the editor session or in a command.** Rejected
  for the same reasons ADR-0020 records: selection must not enter the undo
  history or couple to dispatch. `toggle` and `setSelection` stay on the bridge
  store.
- **Crossing (right-to-left) marquee selection now.** Deferred: window selection
  covers the slice's acceptance, and crossing is an additive predicate over the
  same broad-phase candidates that a later editing slice can add.

## References

- Design specification, sections 6.2 (hit testing via a quadtree spatial index;
  the DOM overlay for selection rings), 6.9 (selection shared across views,
  persisted with autosave; 2D hit testing via a quadtree spatial index), and 7.1
  (selection is not in the undo history).
- Implementation plan: `docs/plans/2026-06-06-selection-and-hit-testing.md`.
- ADR-0020 (the bridge-owned selection store this slice extends with `toggle`
  and `setSelection`, keeping selection outside undo).
- ADR-0021 (the parent record for the plan path; this slice reuses its
  `hitTestWalls` narrow phase, its `PlanDrawingContext` Canvas seam, and its
  glue-split convention).
- ADR-0026 (room derivation; the `graph.rooms` polygons whose bounds the index
  stores and whose containment `pointInPolygon` answers).
- ADR-0031 (the viewport projection whose `worldToScreen` the marquee draw uses
  and whose scale converts the pixel hit/marquee tolerance to world units).
- ADR-0033 (the parallel snapping slice; its line-projection math stayed in
  `editor/plan` so it would not collide with this slice's `core/geometry` work).
