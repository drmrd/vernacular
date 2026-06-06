# Wall Editing Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The `test-author` authors its test independently from the behavior description plus the public signatures in this plan, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking. This plan describes each **behavior** and names the **signature** under test; it deliberately ships no literal test bodies or full implementations, only the public contract.

**Goal:** Let the user edit an existing wall. Dragging either endpoint of the selected wall moves it to a new, snapped position, and a unit-aware input changes the selected wall's thickness. Both edits flow through `dispatch(command)` and are undoable through the dispatcher's captured inverse.

**Architecture:** Two new pure, undoable commands join the existing `addWall` handler in `core/commands/handlers/wall-commands.ts`: `moveWallEndpoint` replaces the named endpoint of a target wall, and `setWallThickness` sets its thickness. Both follow the `addWall` pattern exactly (a `type` constant, a params interface, a creator returning `{ type, params, description }`, and a `CommandHandler` whose `apply` reassigns `state.floors` immutably so the inverse-capture proxy records the change and the dispatcher captures the inverse for undo, ADR-0005). A pure `editor/plan/wall-editing.ts` decides which endpoint of a wall a pointer grabs (`pickWallEndpoint`). `editor/plan/draw-plan.ts` grows `drawEndpointHandles` behind the existing `PlanDrawingContext` seam, gated by a new optional `endpointHandles?: WallSceneNode` on `DrawPlanOptions`. A thin `editor/plan/use-wall-editing.ts` hook drives the endpoint drag (grab a handle, show a live preview, snap with the existing snapping, dispatch `moveWallEndpoint` on release) and composes into `plan-view.tsx` alongside the existing interaction and selection hooks. A small inline wall editor component shows the selected wall's thickness via `formatLength` and dispatches `setWallThickness` from a `parseLength`-validated input; it lands in the shell inspector.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Canvas 2D for the plan, React with React Testing Library, Vitest for units. No new dependencies. **No `core/model/types.ts` change and no schema migration:** `Wall` already carries `thickness` and geometry (`start`, `end`), so both edits are fully specifiable against the current model.

---

## Scope boundary (design specification sections 6.2, 6.6, 10 Phase 1; this is slice 6 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 6: wall editing (endpoint move and thickness)**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`. Slices 1 (wall topology and room derivation), 2 (units and measurement), 3 (pan, zoom, grid, and rulers), 4 (snapping), and 5 (selection and the hit-test index) are done. This slice builds on them: the endpoint drag reuses the slice-4 snapping (`snapPoint` / `useSnapping`) and the slice-5 selection store, and acts on the single selected wall.

**In scope for slice 6:**

- `core/commands/handlers/wall-commands.ts`: `MOVE_WALL_ENDPOINT` and `SET_WALL_THICKNESS` type constants, `MoveWallEndpointParams` and `SetWallThicknessParams`, the `moveWallEndpoint` and `setWallThickness` creators, their handlers, and `registerWallCommands` registering both alongside `ADD_WALL`. Both exported through `core/index.ts`.
- `editor/plan/wall-editing.ts`: `pickWallEndpoint(wall, point, toleranceMm)`, the pure rule for which endpoint of a wall a pointer grabs.
- `editor/plan/draw-plan.ts`: `drawEndpointHandles(ctx, wall, viewport)` behind the existing seam, gated by a new optional `endpointHandles?: WallSceneNode` on `DrawPlanOptions`.
- `editor/plan/use-wall-editing.ts` (infrastructure glue): grab a selected wall's endpoint within tolerance, live-preview the drag, snap with the existing snapping, and dispatch `moveWallEndpoint` on release.
- `editor/plan/plan-view.tsx` (infrastructure glue): draw the selected single wall's handles under the select tool, compose the endpoint-drag pointer handlers, and pass the live preview to `drawPlan`.
- A small inline wall editor component plus its wiring into the shell inspector (infrastructure glue): show the single selected wall's thickness via `formatLength` and dispatch a `parseLength`-validated `setWallThickness`.

**Out of scope for slice 6, deferred with intent (also recorded in `ROADMAP.md`):**

- **Construction type is deferred to the old-house architectural vocabulary milestone.** That milestone owns the construction-type registry and era-aware catalogs. `Wall` gains no `constructionType` field in this slice, and editing it lands with that vocabulary work. This is why slice 6 ships endpoint move and thickness, the two wall-editing operations fully specifiable against today's model, and leaves construction type for the milestone that defines its vocabulary.
- **Perpendicular-drag thickness gizmo.** The design specification's perpendicular-drag thickness gizmo is deferred; the inline unit-aware input covers thickness now, mirroring how slice 3 painted rulers on the Canvas and deferred the DOM-overlay gizmos.
- **Junction-cohesive dragging.** Moving a shared junction so every incident wall moves together is deferred; this slice moves only the selected wall's endpoint. The room derivation re-runs from the wall graph after every edit regardless, so a moved endpoint that lands on (or off) a junction reshapes the derived rooms either way.
- **Multi-wall batch editing.** Thickness editing and endpoint dragging act on a single selected wall. Applying one thickness or one nudge across a multi-selection is later work, consistent with the slice-5 deferral of selection batch operations.

**Acceptance for slice 6:** `moveWallEndpoint` and `setWallThickness` apply through the dispatcher and undo correctly through its captured inverse, leaving sibling walls and the untouched endpoint or property unchanged; `pickWallEndpoint` selects the right endpoint within tolerance, the nearer one on a near-tie, and `null` on a miss; `drawEndpointHandles` paints handle markers at the wall's start and end screen positions through the `PlanDrawingContext` seam and is gated by the `endpointHandles` option; dragging a selected wall's endpoint snaps and dispatches an undoable `moveWallEndpoint`; the thickness input formats the current value with `formatLength` and dispatches a `parseLength`-parsed `setWallThickness`, dispatching nothing on an unparseable entry. Full check chain green; `eslint .` at zero problems; `rgb:audit` clean; the wall-drawing end-to-end spec still passes.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  commands/handlers/wall-commands.ts       (modify)  moveWallEndpoint, setWallThickness, handlers, registration
  commands/handlers/wall-commands.test.ts  (modify)  both new command behaviors (addWall tests stay green)
  index.ts                                 (modify, infra)  export the new types and creators from the barrel

editor/plan/
  wall-editing.ts                          (create)  pickWallEndpoint
  wall-editing.test.ts                     (create)
  draw-plan.ts                             (modify)  drawEndpointHandles; endpointHandles? option
  draw-plan.test.ts                        (modify)  endpoint-handle behaviors (slice-1/3/4/5 tests stay green)
  use-wall-editing.ts                      (create, infra)  endpoint-drag pointer lifecycle
  plan-view.tsx                            (modify, infra)  compose the endpoint-drag glue; draw handles
  wall-thickness-editor.tsx                (create, infra)  inline unit-aware thickness input
  wall-thickness-editor.test.tsx           (create)  component behavior (React Testing Library)

editor/shell/
  editor-shell.tsx                         (modify, infra)  render the inline thickness editor in the inspector

ROADMAP.md                                 (modify, infra)  mark slice 6 done; record deferrals
```

There is **no** barrel under `editor/plan/`; modules import directly from sibling files, matching the house convention slices 1, 3, 4, and 5 confirmed. `Point` and `Wall` come from `core` unchanged; `WallSceneNode`, `SceneGraph`, and `Project` come from `core` via the barrel; `Viewport` is from `editor/plan/viewport.ts`. The endpoint drag reuses the slice-4 `snapPoint` / `useSnapping` and the slice-5 `SelectionStore` and selection hooks. `wall-editing.ts` and `draw-plan.ts` carry the testable behavior; `use-wall-editing.ts`, `plan-view.tsx`, and the editor-shell wiring are coverage-excluded glue (jsdom has no 2D canvas), validated by the existing wall-drawing end-to-end spec. The inline thickness editor is a small DOM component with no canvas dependency, so it carries its own React Testing Library test rather than being coverage-excluded glue.

The thickness command needs the underlying `Wall.id` and its `floorId`, but a `WallSceneNode` carries a namespaced id (`wall:<id>`) plus its `floorId`. **The chosen approach:** the glue (Task G1 and G2) derives the raw `Wall.id` by stripping the `wall:` prefix from the scene-node id and reads `floorId` directly from the scene node, then passes both raw values into the command creators. The pure command handlers and creators take a raw `floorId` and `wallId` and never see the namespaced form, so the prefix lives only at the glue boundary. The handlers locate the target wall by `floor.id === floorId` then `wall.id === wallId`.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// core/commands/handlers/wall-commands.ts (additions; exported via core/index.ts)
export const MOVE_WALL_ENDPOINT = 'floor/move-wall-endpoint'
export const SET_WALL_THICKNESS = 'floor/set-wall-thickness'
export type WallEnd = 'start' | 'end'
export interface MoveWallEndpointParams {
  floorId: string
  wallId: string
  end: WallEnd
  to: Point
}
export interface SetWallThicknessParams {
  floorId: string
  wallId: string
  thickness: number
}
export function moveWallEndpoint(
  floorId: string,
  wallId: string,
  end: WallEnd,
  to: Point,
): Command<MoveWallEndpointParams>
export function setWallThickness(
  floorId: string,
  wallId: string,
  thickness: number,
): Command<SetWallThicknessParams>
// registerWallCommands registers MOVE_WALL_ENDPOINT and SET_WALL_THICKNESS alongside ADD_WALL.

// editor/plan/wall-editing.ts
/** The endpoint of `wall` within `toleranceMm` of `point`, or null; the nearer wins on a tie. */
export function pickWallEndpoint(
  wall: WallSceneNode,
  point: Point,
  toleranceMm: number,
): WallEnd | null

// editor/plan/draw-plan.ts (addition; gated by a new optional endpointHandles?: WallSceneNode on DrawPlanOptions)
export function drawEndpointHandles(
  ctx: PlanDrawingContext,
  wall: WallSceneNode,
  viewport: Viewport,
): void
// DrawPlanOptions gains: endpointHandles?: WallSceneNode (absent = no handles; PlanView sets it only for the single selected wall under the select tool)
```

`WallEnd` is defined in `core/commands/handlers/wall-commands.ts` and re-exported from `core/index.ts`; `editor/plan/wall-editing.ts` imports it from `core` so the union is single-sourced and `pickWallEndpoint`'s return type matches the `MoveWallEndpointParams.end` field exactly.

---

## Section A: the wall-editing commands (`core/commands/handlers/wall-commands.ts`)

### Task A1: `moveWallEndpoint` replaces one endpoint and undoes

**Files:**

- Modify: `core/commands/handlers/wall-commands.ts`
- Test: `core/commands/handlers/wall-commands.test.ts`

**Behavior under test (`moveWallEndpoint(floorId, wallId, end, to)` dispatched through a `Dispatcher`):** Applying the command replaces the named endpoint (`'start'` or `'end'`) of the target wall (the wall on `floorId` whose `id` is `wallId`) with the point `to`, while the wall's other endpoint, its thickness, every other wall on that floor, and every other floor stay untouched. Dispatching the command and then calling `undo` restores the original endpoint (the dispatcher captures the inverse automatically, ADR-0005; the handler does not author an explicit inverse). The handler reassigns `state.floors` immutably, mapping only the target floor to a new object whose `walls` array maps only the target wall to a new object with the moved endpoint, mirroring the `addWall` handler's whole-floors reassignment so the inverse-capture proxy records the change. Cover: a `'start'` move and an `'end'` move (the other endpoint and the thickness unchanged), a sibling wall on the same floor left untouched, and a dispatch-then-undo round trip that restores the original endpoint.

- [ ] **Step 1 (RED):** `/test-first` for the behavior above. Import `moveWallEndpoint`, `registerWallCommands`, and the `WallEnd` type from the wall-commands module (and `Dispatcher` / `CommandRegistry` from `core`), register the wall commands, dispatch a `moveWallEndpoint`, assert the moved endpoint and the untouched neighbors, then `undo` and assert the original endpoint is restored. Verify it fails because `moveWallEndpoint` (and `MOVE_WALL_ENDPOINT` / its handler) is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `MOVE_WALL_ENDPOINT` constant, `MoveWallEndpointParams`, the `WallEnd` type, the `moveWallEndpoint` creator (returning `{ type, params, description }` with a clear `description` such as `'Move wall endpoint'`), and the handler that reassigns `state.floors` immutably, mapping the target floor's `walls` to set only the named endpoint of the target wall. Register the handler in `registerWallCommands` alongside `ADD_WALL`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Watch for shared floor-and-wall mapping shape between this handler and Task A2's `setWallThickness` handler: both locate one wall on one floor and return a new wall object, so factor the "map the floors, then map the target floor's walls, then update the target wall" traversal into one small private helper (a real shared shape, not coincidental) so neither handler restates it. Keep each handler's `apply` within `max-lines-per-function` and avoid a nested ternary when choosing the endpoint. Commit `refactor:` (empty marker if no change).

### Task A2: `setWallThickness` sets the thickness and undoes

**Files:**

- Modify: `core/commands/handlers/wall-commands.ts`
- Test: `core/commands/handlers/wall-commands.test.ts`

**Behavior under test (`setWallThickness(floorId, wallId, thickness)` dispatched through a `Dispatcher`):** Applying the command sets the target wall's `thickness` to the given value, while its endpoints, every other wall on that floor, and every other floor stay untouched. Dispatching and then calling `undo` restores the previous thickness (via the dispatcher's captured inverse). The handler reassigns `state.floors` immutably the same way Task A1's does. Cover: the thickness changes to the new value, the endpoints and a sibling wall are unchanged, and a dispatch-then-undo round trip restores the previous thickness.

- [ ] **Step 1 (RED):** `/test-first` for the behavior above. Import `setWallThickness` (and `registerWallCommands` / `Dispatcher` / `CommandRegistry`), register the wall commands, dispatch a `setWallThickness`, assert the new thickness and the untouched endpoints and neighbors, then `undo` and assert the previous thickness is restored. Verify it fails because `setWallThickness` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the `SET_WALL_THICKNESS` constant, `SetWallThicknessParams`, the `setWallThickness` creator (with a clear `description` such as `'Set wall thickness'`), and the handler that reassigns `state.floors` immutably to set only the target wall's `thickness`, reusing the shared floor-and-wall traversal helper from Task A1. Register the handler in `registerWallCommands`. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Confirm `moveWallEndpoint` and `setWallThickness` share the one floor-and-wall traversal helper rather than two near-copies, and that `registerWallCommands` chains all three registrations (`ADD_WALL`, `MOVE_WALL_ENDPOINT`, `SET_WALL_THICKNESS`) readably. Commit `refactor:` (empty marker if no change).

---

## Section B: picking a wall endpoint (`editor/plan/wall-editing.ts`)

### Task B1: `pickWallEndpoint` picks the endpoint a pointer grabs

**Files:**

- Create: `editor/plan/wall-editing.ts`
- Test: `editor/plan/wall-editing.test.ts`

**Behavior under test (`pickWallEndpoint(wall, point, toleranceMm)`):** Returns `'start'` when the point is within `toleranceMm` of `wall.start` (and nearer it than `wall.end`), `'end'` when the point is within tolerance of `wall.end` (and nearer it than `wall.start`), and `null` when neither endpoint is within tolerance. When the point is within tolerance of both endpoints, the **nearer** endpoint wins; pin the near-tie with at least one case where the point is closer to `start` than `end` and both are in range (returns `'start'`), and document the deterministic rule used at an exact tie (for example, `start` wins an exact tie). The distance is the straight-line distance from the point to the endpoint (reuse `distance` from `core`). `WallEnd` is imported from `core` so the return type matches the command params. Cover: a point on top of `start` (returns `'start'`), a point on top of `end` (returns `'end'`), a point in range of both but nearer `start` (returns `'start'`), and a point far from both (returns `null`).

- [ ] **Step 1 (RED):** `/test-first` importing `pickWallEndpoint` from `./wall-editing` and constructing a `WallSceneNode`. Verify it fails because the module does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `pickWallEndpoint`: measure the point's distance to each endpoint with `distance`, reject when both exceed `toleranceMm`, and otherwise return the nearer endpoint's label. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Avoid a nested ternary (`no-nested-ternary`) when choosing between `'start'`, `'end'`, and `null`; name the comparison so the near-tie rule is explicit. Commit `refactor:` (empty marker if no change).

---

## Section C: drawing endpoint handles (`editor/plan/draw-plan.ts`)

### Task C1: `drawEndpointHandles` paints a marker at each endpoint

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawEndpointHandles(ctx, wall, viewport)`):** Paints a handle marker at the wall's `start` and `end` **screen** positions, projecting each endpoint through `worldToScreen(_, viewport)` so the handles track pan and zoom. The behavior is observed through the slice-3/4/5 recording fake context (`recordingContext()` in `editor/plan/draw-plan-test-fixtures.ts`): the handle is a ring or filled dot recorded as an `arc` (the fake records `arcs` with `x`, `y`, `radius`, `fillStyle`), the same primitive `drawStartMarker` and `drawSnapIndicator` already use, so two arcs are recorded at the two projected endpoint screen coordinates. `drawEndpointHandles` uses only members already on `PlanDrawingContext` (`strokeStyle`, `fillStyle`, `lineWidth`, `beginPath`, `arc`, `stroke`, `fill`), so the seam does not grow and every existing fake stays valid. Cover: two markers recorded, at the projected screen positions of `wall.start` and `wall.end` for a known wall and viewport. Name the handle radius, color, and any line width as module constants (`no-magic-numbers`).

- [ ] **Step 1 (RED):** `/test-first` importing `drawEndpointHandles` from `./draw-plan` and the recording fake from `./draw-plan-test-fixtures`, asserting two arcs at the projected screen positions of a known wall's endpoints. Verify it fails because `drawEndpointHandles` is not exported. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` `drawEndpointHandles`, projecting both endpoints and painting one marker each through the existing seam. Add the handle radius/color/line-width module constants alongside the existing marker constants. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. The per-endpoint marker is the same shape `drawStartMarker` and `drawSnapIndicator` already paint; check for a shared single-marker helper worth extracting (only if it is real duplication, not coincidental). Keep `drawEndpointHandles` within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

### Task C2: `drawPlan` gates the endpoint handles on the option

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

**Behavior under test (`drawPlan(ctx, options)` with `options.endpointHandles`):** When `DrawPlanOptions.endpointHandles` is a `WallSceneNode`, `drawPlan` paints that wall's endpoint handles (as an overlay above the walls, so the handles are visible on top of the stroked wall) by calling `drawEndpointHandles`; when `endpointHandles` is absent, no handles are painted and the slice-1/3/4/5 draw output is unchanged. The `endpointHandles` field is optional, so every existing `drawPlan` test (which omits it) stays green. Observe through the recording fake: with `endpointHandles` set, two endpoint-handle arcs appear; without it, none do. Place the `drawEndpointHandles` call in the paint order above the walls and consistent with the other overlays (snap indicator, marquee); pin the relative order only loosely (handles painted after the wall strokes).

- [ ] **Step 1 (RED):** `/test-first` for the endpoint-handles-present and endpoint-handles-absent cases of `drawPlan`. Verify it fails because `endpointHandles` is not an accepted option. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the optional `endpointHandles?: WallSceneNode` on `DrawPlanOptions` and the gated `drawEndpointHandles` call inside `drawPlan` (above the wall loop, alongside the existing `preview` / `snap` / `marquee` guarded calls). Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. The addition is a single guarded call, so `drawPlan` stays a readable paint-order sequence within `max-lines-per-function`. Commit `refactor:` (empty marker if no change).

---

## Section D: the inline thickness editor (`editor/plan/wall-thickness-editor.tsx`)

### Task D1: the inline thickness editor formats and dispatches

**Files:**

- Create: `editor/plan/wall-thickness-editor.tsx`
- Test: `editor/plan/wall-thickness-editor.test.tsx`

**Behavior under test (the inline thickness editor, exercised with React Testing Library):** Given a single selected wall (its raw `wallId`, `floorId`, and current `thickness` in millimetres, plus a `dispatch` and the active `UnitPreferences`), the component renders the current thickness formatted via `formatLength` (using `lengthFormatOptions(preferences)`) in a labeled text input. Entering a valid length string and committing it (for example pressing Enter or blurring the input, whichever the component chooses; pin one) dispatches exactly one `setWallThickness` command carrying the **parsed millimetre value** (`parseLength` of the entered string, with the active system's `assumeUnit` so a bare number is interpreted) for the selected wall. An **unparseable** entry (one that makes `parseLength` throw) dispatches **nothing** (the input may show an invalid state, but no command is dispatched). Cover: the input shows the formatted current thickness on render; a valid entry dispatches one `setWallThickness` with the expected `floorId`, `wallId`, and parsed `thickness`; an unparseable entry dispatches nothing.

The component takes its data and `dispatch` as props rather than reading the session/selection directly, so the test drives it without the full provider tree and Task G2 supplies the props from the shell. Keep the component small and focused; if formatting-the-current-value and parsing-the-entry would push it past `max-lines`, extract a pure `wall-thickness-format.ts` (or co-located helper) wrapping `formatLength` / `parseLength` with the preferences-to-options resolution and the dispatch-nothing-on-throw rule, and unit-test that helper directly. Prefer the smaller component without the split if it stays within `max-lines`.

- [ ] **Step 1 (RED):** `/test-first` rendering the editor with a selected wall and a spy `dispatch`, asserting the formatted current value is shown, a valid commit dispatches one parsed `setWallThickness`, and an unparseable commit dispatches nothing. Verify it fails because the component does not exist. Commit `test:`.
- [ ] **Step 2 (GREEN):** `/implement` the component: format the current thickness with `formatLength(thickness, lengthFormatOptions(preferences))` for the input's initial value, hold the editing string in local state, and on commit call `parseLength(text, { assumeUnit })` inside a try/catch, dispatching `setWallThickness(floorId, wallId, parsed)` only on a successful parse. Commit `feat:`.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor`. Keep the component within `max-lines` and `max-lines-per-function` (extract the format/parse helper if needed, per the behavior note); name any literal `assumeUnit` choice rather than inlining a magic string; ensure the try/catch around `parseLength` is the only place the unparseable-entry rule lives. Commit `refactor:` (empty marker if no change).

---

## Section G: glue and documentation (infrastructure)

### Task G1: the endpoint-drag glue (`use-wall-editing.ts` + `plan-view.tsx`) (infrastructure)

**Files:**

- Create: `editor/plan/use-wall-editing.ts`
- Modify: `editor/plan/plan-view.tsx`

This is controller-authored Canvas-and-pointer glue with no RGB triple (jsdom has no 2D canvas). All of its decision logic lives in the pure modules above (`pickWallEndpoint`, `moveWallEndpoint`, the existing `snapPoint` / `useSnapping`, `drawEndpointHandles`); this task only wires them. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Identify the single selected wall.** In `PlanView`, when the select tool is active and exactly one id is selected and that id names a wall in the scene graph (a `wall:`-prefixed id present in `graph.walls`), resolve the selected `WallSceneNode`. Otherwise there is no editable wall and the endpoint-drag glue stays inert.
- [ ] **Step 2: Draw its endpoint handles.** Pass the selected `WallSceneNode` to `usePlanRedraw` / `drawPlan` as `endpointHandles` so `drawPlan` paints the handles (Task C2). When no single wall is selected (or the tool is not the select tool), pass nothing, so handles only appear when a wall is editable.
- [ ] **Step 3: Add the endpoint-drag hook.** Create `useWallEditing` (its exact name and the props it takes are the controller's choice; for example `useWallEditing({ session, selectedWall, viewport, walls })`) returning pointer handlers (`onPointerDown`, `onPointerMove`, `onPointerUp`) and the live drag `preview` (a `PreviewSegment` for the wall while one endpoint is being dragged). On pointer-down under the select tool, if there is a single selected wall and `pickWallEndpoint(selectedWall, world, tolerance)` returns an end, begin dragging that endpoint (capture the pointer, record which end). While dragging, resolve the moving cursor through the existing snapping (`useSnapping` / `snapPoint`, reusing the slice-4 endpoint/midpoint/perpendicular/parallel/grid priority) and update the live preview (the wall drawn with the dragged endpoint at the snapped point). On release, derive the raw `Wall.id` (strip the `wall:` prefix from the scene-node id) and the `floorId` (read from the scene node), and `session.dispatch(moveWallEndpoint(floorId, wallId, end, snappedPoint))`; if the drag never started or the release equals the original endpoint, dispatch nothing.
- [ ] **Step 4: Compose the handlers without disturbing the existing tools.** Extend `composePointerHandlers` (or its `PointerSources`) so the endpoint-drag handlers run **only** under the select tool and **only** when an endpoint grab is in progress, taking priority over the marquee/click selection on the pointer-down that grabbed a handle (so grabbing an endpoint starts a drag rather than starting a marquee). A select-tool pointer-down that does not grab a handle must fall through to the existing `usePlanSelection` click/marquee path unchanged, and the wall-draw tool path must be entirely unaffected (the endpoint-drag glue is gated on `tool === 'select'`). The pan gesture still takes top priority as it does today.
- [ ] **Step 5: Feed the live drag preview into the redraw.** While an endpoint drag is in progress, pass the drag `preview` to `drawPlan` (the same `preview?: PreviewSegment` channel the wall tool uses, or a dedicated path if the wall-tool preview would conflict; choose the minimal wiring that does not paint two previews at once). Add the relevant state to the `usePlanRedraw` dependencies so the drag repaints.
- [ ] **Step 6: Respect `max-lines`.** `plan-view.tsx` is already near the limit; the endpoint-drag state machine lives in `use-wall-editing.ts` (the way slice 3 split `use-viewport-controls.ts` and slice 5 split `use-plan-selection.ts`), leaving `plan-view.tsx` as composition. If composing the new hook still pushes `plan-view.tsx` past `max-lines`, lift the "resolve the single selected wall" derivation into a tiny sibling helper. Keep `use-wall-editing.ts` and `plan-view.tsx` coverage-excluded glue.
- [ ] **Step 7: Verify.** Run the full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Expected: all green; `eslint .` at zero problems; `plan-view.tsx` and `use-wall-editing.ts` stay coverage-excluded glue. Confirm by reasoning that the functional wall-drawing end-to-end logic is unaffected: the endpoint-drag glue is gated on `tool === 'select'`, and the `draw-wall` tool path and the default viewport (unchanged scale and zero offset) keep the end-to-end canvas clicks mapping to the same world points.
- [ ] **Step 8:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task G2: place the inline thickness editor in the shell (infrastructure)

**Files:**

- Modify: `editor/shell/editor-shell.tsx`
- Modify: `core/index.ts` (export the new command types and creators from the barrel)

This is controller-authored wiring with no RGB triple; the component's behavior is tested in Task D1. Reviewed by `/clean-code-review`.

- [ ] **Step 1: Export the commands from the core barrel.** In `core/index.ts`, add the new types (`MoveWallEndpointParams`, `SetWallThicknessParams`, `WallEnd`) to the wall-commands type-export and the new values (`MOVE_WALL_ENDPOINT`, `SET_WALL_THICKNESS`, `moveWallEndpoint`, `setWallThickness`) to the wall-commands value-export, joining the existing `ADD_WALL` / `addWall` / `registerWallCommands` lines.
- [ ] **Step 2: Choose the minimal placement: the inspector aside.** The shell already renders an `editor-shell__inspector` aside that today shows `'Wall selected'` / `'No selection'` from `useSelectionIds()`. That is the minimal home for the inline editor: render the `wall-thickness-editor` inside the inspector when exactly one selected id names a wall (a `wall:`-prefixed id present in the scene graph), and keep the existing no-selection text otherwise. No new layout region or CSS is required.
- [ ] **Step 3: Supply the editor's props from the session and selection.** Read the session with `useEditorSession` and the selection with `useSelectionIds`/`useSceneGraph` (already in scope in the shell), resolve the single selected `WallSceneNode`, derive its raw `Wall.id` (strip the `wall:` prefix) and `floorId` (from the scene node) and current `thickness`, and pass `{ floorId, wallId, thickness, dispatch: session.dispatch, preferences }` to the editor. For the active `UnitPreferences`, use the project meta's `units` to choose `DEFAULT_METRIC_PREFERENCES` or `DEFAULT_IMPERIAL_PREFERENCES` (a project-level unit-preferences store is later work; this slice picks the default for the project's `units`, mirroring how slice 3 deferred unit-aware ruler labels). State this default-preferences choice in the deferrals.
- [ ] **Step 4: Verify.** Run the full check chain. Expected: all green; `eslint .` at zero problems. The shell stays coverage-excluded glue; the editor component carries its own Task D1 test. Confirm the wall-drawing end-to-end spec is unaffected (the inspector addition is gated on a single wall being selected, which the wall-drawing flow does not trigger).
- [ ] **Step 5:** Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).

### Task G3: roadmap update (infrastructure, final task, after the code lands)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark slice 6 done and record its deferrals.** Flip the slice-6 row from `pending` to `done`, update the slice-6 row label so it reads as endpoint move and thickness with construction type called out as deferred (for example "Wall editing (endpoint move and thickness; construction type deferred)"), update the current-status sentence to include slice 6, and add a "Slice 6 (done) scope and deferrals" block mirroring the slice-4 and slice-5 voice: construction type deferred to the old-house architectural vocabulary milestone (which owns the construction-type registry and era-aware catalogs, so `Wall` gains no `constructionType` field here); the perpendicular-drag thickness gizmo deferred in favor of the inline unit-aware input; junction-cohesive dragging deferred (this slice moves only the selected wall's endpoint, and the room derivation re-runs from the wall graph regardless); multi-wall batch editing deferred (both edits act on a single selected wall); and the inline editor using the default unit preferences for the project's `units` until a project-level unit-preferences store lands. Close with the wall-drawing end-to-end note (the edit glue is gated on the select tool, so the functional end-to-end spec is unaffected).
- [ ] **Step 2: Verify.** `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task G4: knowledge curation (post-merge, controller-run)

- [ ] Skip during the slice. After the section-level work lands and merges, the controller runs the `knowledge-curator` to add or refresh a local ADR for the wall-editing commands: the two undoable commands (`moveWallEndpoint`, `setWallThickness`) following the `addWall` immutable-`state.floors`-reassignment pattern with the dispatcher capturing inverses (cross-link ADR-0005), the raw-`Wall.id`-vs-namespaced-scene-node-id boundary handled at the glue, the `pickWallEndpoint` grab rule, the `endpointHandles` draw option behind the narrow seam (cross-link the plan-drawing-seam ADR), and the inline unit-aware thickness input reusing the slice-2 `formatLength` / `parseLength` with the construction-type, gizmo, junction-cohesive, and multi-wall deferrals noted. No `docs/specs/` change is required because this implements behavior the specification already mandates (sections 6.2 and 6.6). Regenerate the local index with `pnpm knowledge:index` and run `pnpm rgb:audit` to confirm the red-green-blue ordering across the slice.

---

## Self-review

**Behavior coverage:** Every behavior maps to a task. The `moveWallEndpoint` command (apply-and-undo) is Task A1; the `setWallThickness` command (apply-and-undo) is Task A2; `pickWallEndpoint` (start/end/near-tie/null) is Task B1; `drawEndpointHandles` (markers at both endpoints through the seam) is Task C1; `drawPlan` gating on `endpointHandles` (present paints, absent does not) is Task C2; the inline thickness editor (formats the current value, dispatches a parsed `setWallThickness`, dispatches nothing on an unparseable entry) is Task D1. The endpoint-drag controller (grab a handle, live preview, snap, dispatch on release; wall-draw tool and marquee unaffected) is the infrastructure Task G1; placing and wiring the inline editor is the infrastructure Task G2; the roadmap update is Task G3; knowledge curation is the post-merge Task G4.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders. Every behavior task names the signature under test and the concrete cases to pin; every infrastructure step is a concrete wiring instruction. No literal test bodies or full implementations appear, per the role-separated cycle; the only code shown is the public-contract block.

**Type-name consistency:** The public names are spelled identically across every task and the contract block: `moveWallEndpoint`, `setWallThickness`, `MOVE_WALL_ENDPOINT`, `SET_WALL_THICKNESS`, `WallEnd`, `MoveWallEndpointParams`, `SetWallThicknessParams`, `pickWallEndpoint`, `drawEndpointHandles`, and the `endpointHandles?: WallSceneNode` option. `WallEnd` is single-sourced in `core/commands/handlers/wall-commands.ts`, re-exported from `core`, and imported by `editor/plan/wall-editing.ts`, so `pickWallEndpoint`'s return type matches `MoveWallEndpointParams.end`. `Point` and `Wall` come from `core` unchanged (no `core/model/types.ts` change, no migration); `WallSceneNode` / `SceneGraph` / `Project` come from `core` via the barrel; `Viewport` is from `editor/plan/viewport.ts`. The new `DrawPlanOptions.endpointHandles` is optional, so slice-1/3/4/5 call sites and `drawPlan` tests compile and pass unchanged, and `registerWallCommands` keeps the same signature while registering two more handlers. The namespaced-id boundary (`wall:<id>` scene-node id vs raw `Wall.id`) is resolved once, at the glue (Tasks G1 and G2), by stripping the prefix and reading `floorId` from the scene node; the pure commands only ever see raw ids.

**Ordering and dependencies:** The two commands (A) precede the endpoint-drag glue (G1) and the inline editor (D1, G2) that dispatch them; `pickWallEndpoint` (B) precedes the endpoint-drag glue (G1) that grabs with it; `drawEndpointHandles` and the `endpointHandles` option (C) precede the glue (G1) that passes a selected wall to paint; the inline editor component (D1) precedes its shell placement (G2); the core-barrel export (G2 Step 1) precedes nothing it is consumed by within this slice except the glue and the editor, both of which import from `core`; the roadmap update (G3) is the final task after all code lands; knowledge curation (G4) is post-merge. The `recordingContext()` fake already exposes `arc` / `stroke` / `fill` and the `arcs` recording array, so `drawEndpointHandles` needs no seam growth and every fake in `draw-plan.test.ts` stays a valid `PlanDrawingContext`.

**Back-compatibility and acceptance:** `Wall`, `DrawPlanOptions` (now with optional `endpointHandles`), `registerWallCommands`, and `SelectionStore` remain compatible with every existing call site and test. The functional wall-drawing end-to-end spec is preserved because all new editing wiring is gated on the `select` tool and the default viewport keeps the original scale and zero offset, leaving the `draw-wall` pointer-to-world mapping identical. At acceptance the two commands apply and undo through the dispatcher, `pickWallEndpoint` selects the right endpoint within tolerance, endpoint handles draw through the seam and are gated by the option, dragging a selected wall's endpoint snaps and dispatches an undoable move, and the thickness input formats the current value and dispatches a parsed `setWallThickness`, with the full check chain green, `eslint .` at zero problems, and `rgb:audit` clean.
