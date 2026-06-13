# Implementation plan: Select-mode hover preview (#117)

Spec: docs/specs/2026-06-13-select-mode-hover-preview.md
ADR: ADR-0071

Surfaces the hit-test pick as a hover highlight on the plan canvas while the
Select tool is at rest. Three RGB cycles plus an end-to-end glue cycle.

## Existing seams reused

- `hitTest(scene, point, tolerance)` (editor/plan/hit-test.ts): the pick, in
  opening > wall > dimension > room order. Unchanged.
- `drawPlan(ctx, options)` (editor/plan/draw-plan.ts): the canvas renderer, keyed
  off `selectedIds`. Gains a `hoveredId` option.
- `recordingContext()` (editor/plan/draw-plan-test-fixtures.ts): the fake 2D
  context the renderer suite asserts against (style/segment readback). No canvas
  needed for the render cycles.
- `usePlanSelection` / `composePointerHandlers` / `PlanScene`: the pointer and
  redraw glue the hover hook joins.

## Cycle 1 (pure): the hover-target resolver

New module `editor/plan/hover-target.ts`:

```
export function hoverTarget(
  graph: SceneGraph,
  point: Point,
  tolerance: number,
  selectedIds: ReadonlySet<string>,
): string | null
```

Returns `hitTest(graph, point, tolerance)` except it returns `null` when that id
is already in `selectedIds`. Pure, Node-tested.

Tests (RED): returns the hit-test pick over a wall; returns `null` over empty
space; returns `null` when the pick is already selected; respects the existing
pick order for at least one overlap case (opening over the room beneath it).

## Cycle 2 (render): drawPlan highlights the hovered entity

Thread an optional `hoveredId?: string` through `DrawPlanOptions` and the
per-layer draws. Each entity layer draws a hover style when
`node.id === hoveredId`. Because the resolver never returns a selected id, the
renderer can treat hovered and selected as mutually exclusive for a given id.

- Walls: new `HOVER_WALL_COLOR` stroke, lighter than `SELECTED_WALL_COLOR`,
  applied when `hoveredId === wall.id`.
- Rooms: a hover stroke on the polygon (no fill change), distinct from the
  selected room stroke.
- Openings and dimensions: thread a `hovered` flag through `toDrawableOpenings` /
  `toDrawableDimensions` (mirroring `selected`) so `drawOpening` / `drawDimension`
  draw a hover stroke. The hovered flag is `node.id === hoveredId`.

Tests (RED): a hovered wall, room, opening, and dimension each stroke with a
style different from both their default and their selected styles; an unhovered
entity is unchanged.

Watch: draw-plan.ts already carries a `max-lines` disable; keep the additions to
small ternaries inside existing per-layer routines, do not add new top-level
routines. `drawable-openings` / `drawable-dimensions` gain one field each.

## Cycle 3 (glue + e2e): the hover hook and wiring

New hook `editor/plan/use-plan-hover.ts`:

- Holds `hoveredId: string | undefined` state plus `onPointerMove` /
  `onPointerLeave` handlers.
- `onPointerMove`: when `tool !== 'select'` or `event.buttons !== 0`, clear and
  return. Otherwise set hovered to `hoverTarget(graph, screenToWorld(canvas,
viewport), DEFAULT_HIT_TOLERANCE_MM, selectedIds)` (undefined when null).
- `onPointerLeave`: clear.

Wire it:

- `usePlanLayers` resolves the hook; `buildScene` adds `hoveredId` to `PlanScene`
  and `buildDrawOptions` spreads it into the draw options; `usePlanRedraw` lists
  it as a leaf dep.
- `composePointerHandlers` calls `hover.onPointerMove` at the top of its
  `onPointerMove` (runs regardless of the early returns; internally inert during
  drags via the `buttons` gate) and `hover.onPointerLeave` in `onPointerLeave`.

Coverage-excluded glue, validated by the e2e (jsdom has no 2D canvas).

e2e `e2e/tests/select-hover-preview.spec.ts` (chromium, committed `test:` as the
cycle's RED since it is the cycle's failing test, not an audit-exempt
`test(e2e):`): draw a closed room with the wall tool, switch to Select, move the
pointer over a wall, assert the canvas changed (hover drawn); move to empty space,
assert it reverts and the selection is still empty.

## Gate

`pnpm typecheck && lint && format:check && test && integration:audit && build`,
`pnpm rgb:audit` clean over `origin/main..HEAD`, and the full chromium +
scene-webgl e2e tree after a rebuild (kill any stale 4173 first). Refresh the home
chromium darwin visual baseline only if the resting plan render actually shifts
(the hover highlight is pointer-driven, so the static baseline should not move).

## Deferred (noted, not built)

- Cursor-aware-of-target (open hand to pointer over a pickable entity): later
  refinement, see ADR-0071.
- Cursor-adjacent readouts / tooltips on hover: arrive with #118.
- Additive Shift-marquee and hover over selected entities: out of scope.
