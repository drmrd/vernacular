# Plan: Opening resize handles (#119)

Spec: docs/specs/2026-06-13-opening-resize-handles.md
ADR: ADR-0073

## Goal

Add drag-to-resize handles to a selected opening: a handle at each jamb, dragging
a jamb resizes the opening from the opposite (fixed) jamb, the dragged jamb snaps
flush to the host wall end, and a width readout pill follows the handle. One new
atomic command `resizeOpeningEdge`, no Opening model change, one undo step. Reuses
the #118 readout seam (the `??` merge in usePlanController) + the wall-editing
handle pattern.

## Existing seams (from exploration)

- MODEL/COMMANDS: `core/commands/handlers/opening-commands.ts` has placeOpening,
  moveOpening(position), resizeOpening(dims), flipOpening, removeOpening, registered via
  `registerOpeningCommands`. `Opening` = { position (mm from wall start to CENTER), width,
  height, sillHeight, hostWallId, orientation }.
- CLAMP: `core/topology/openings.ts` deriveOpeningGeometry already clamps width to wall length
  and center to keep the opening on the wall; returns { center, along, normal, width, jambStart,
  jambEnd }. The start jamb sits at `position minus width/2` along the wall and the end jamb at
  `position plus width/2`, so the START jamb is the lower position and the END jamb the higher.
- FOOTPRINT DRAG (today): `editor/plan/use-opening-editing.ts` drags whole opening, dispatches
  moveOpening on release, no live preview. `opening-drag.ts` openingDragPosition(hostWall, world)
  projects world onto wall axis (unclamped). `opening-geometry.ts` openingCorners(node),
  projectPointOntoWall(start, end, world).
- OpeningSceneNode (core/scene/scene-graph.ts:84): { id, kind, floorId, type, center, along,
  normal, width, height, sillHeight, hostThickness, orientation, ... }. Carries center/along/width.
  Raw opening id = node.id.slice(OPENING_NODE_PREFIX.length).
- HANDLE PATTERN (mirror): `editor/plan/wall-editing.ts` pickWallEndpoint(wall, point, tolMm);
  `draw-plan.ts` drawEndpointHandles (ENDPOINT_HANDLE_RADIUS_PX=5, gated on options.endpointHandles
  = the selected WallSceneNode | null); `use-wall-editing.ts` HANDLE_GRAB_PIXELS=10 -> world tol
  via /viewport.scale; useGrabHandler/useDragMoveHandler/useReleaseHandler; readout = preview ?
  dragReadout(...) : undefined.
- COMPOSE: `compose-pointer-handlers.ts` order down: pan -> wallEditing -> openingEditing ->
  selectionMove. The resize grab must come BEFORE the footprint grab. Add openingResizing source,
  composed ABOVE openingEditing.
- READOUT SEAM (#118): `drag-readout.ts` dragReadout(from, to, prefs) -> { anchor, text } (length
  and BEARING). For width we need LENGTH-ONLY: add lengthReadout(anchor, lengthMm, prefs) using
  `core/units/format-adaptive-length.ts` formatAdaptiveLength (no bearing). Merge point
  plan-view.tsx usePlanController line 252: `readout = selectionMove.readout ?? wallEditing.readout`
  -> add `?? openingResizing.readout`.
- SELECT: `selected-opening.ts` singleSelectedOpening(tool, selectedIds, graph) -> OpeningSceneNode
  | null (select tool + exactly one id). Reuse for the resize hook's selected opening and the handle
  gating. `use-opening-layer.ts` already computes selectedOpening for the footprint editing hook;
  thread it (or selectedOpening) out for the resize hook + handle draw.
- HOST WALL: `resolveHostWall(project, node)` in use-opening-editing.ts finds the Wall (start/end)
  from the project. Need the same for the resize hook (snap-to-wall-end uses wall start/end).
- E2E: opening proxies = `page.getByRole('option', { name: / wide$/ })`; placed via the "Opening"
  tool then clicking a wall (opening-host-guard.spec.ts). Readout = `.plan-overlay__readout`
  (selectors.drawReadout). live-drag-readout.spec.ts is the drag-readout e2e template.

## Decided forks (from notes, ADR-0073)

- F1 edge handles, one per jamb; drag a jamb, OPPOSITE jamb fixed -> width + center both change.
- F2 atomic command resizeOpeningEdge(floorId, openingId, edge:'start'|'end', newJambPosition);
  handler holds opposite jamb fixed, width=|newJamb-fixedJamb|, position=midpoint, clamp, ONE undo.
- F3 snap the dragged jamb to the host wall's near end within HANDLE_GRAB_PIXELS tol (focused
  jamb-to-wall-end, NOT the full snap chain; full chain = future).
- F4 readout = WIDTH (length-only) near the dragged handle via lengthReadout; 3rd `??` source.
  Distance-to-wall-end readout DEFERRED.
- F5 drawOpeningResizeHandles (sister of drawEndpointHandles), 2 circles at the jambs, new
  DrawPlanOptions flag, shown when exactly one opening selected.
- F6 use-opening-resizing hook (grab/move/release), composed ABOVE the footprint drag.
- F7 clamp: MIN_OPENING_WIDTH (introduce; none exists today) + max (fixed jamb to wall end).

## Jamb / edge mapping (confirm in cycle 2/3)

- START jamb sits at `position - width/2` (deriveOpeningGeometry jambStart); END jamb at
  `position + width/2` (jambEnd). Both measured in mm along the wall from wall start.
- Dragging edge='start' moves the start jamb; fixed jamb = end jamb at `position + width/2`.
  Dragging edge='end' moves the end jamb; fixed jamb = start jamb at `position - width/2`.
- newWidth = abs(newJambPosition - fixedJambPosition); newPosition = (newJambPosition +
  fixedJambPosition) / 2. Clamp newWidth >= MIN_OPENING_WIDTH (pin the dragged jamb at the floor,
  do not cross). Clamp the dragged jamb within [0, wallLength]. Snap dragged jamb to 0 or
  wallLength when within tol.

## RGB cycles (test->feat->refactor each; commit from main thread)

### Cycle 1: pure pickOpeningResizeHandle

- New `editor/plan/opening-resize.ts`. pickOpeningResizeHandle(node, point, tolMm):
  'start' | 'end' | null. Compute the two jamb world points from node center/along/width
  (reuse openingFootprint-style math or jambStart/jambEnd from a small helper), pick the nearer
  within tol, null when both clear. Mirror pickWallEndpoint's tie rule (start wins on tie).
- RED: opening-resize.test.ts. GREEN: implement. BLUE: reviewer + refactorer marker.

### Cycle 2: pure openingResizeEdge geometry

- In opening-resize.ts (or a sibling): openingResizeEdge(params) -> { width, position }.
  Inputs: the dragged edge, the dragged jamb position along the wall (unclamped, from projecting
  the cursor onto the wall axis), the opening's current width+position (to derive the fixed jamb),
  the wall length, and snap tolerance. Output the clamped+snapped new width and center position.
- Introduce MIN_OPENING_WIDTH constant (find a home; likely core if the command also clamps, or
  share between command + hook). Confirm jamb<->position mapping.
- RED: tests for grow, shrink, clamp-to-min (no cross), clamp-to-wall, snap-to-end. GREEN. BLUE.

### Cycle 3: core resizeOpeningEdge command + handler + undo

- `core/commands/handlers/opening-commands.ts`: RESIZE_OPENING_EDGE const, ResizeOpeningEdgeParams
  { floorId, openingId, edge, newJambPosition }, resizeOpeningEdge factory, handler holding the
  opposite jamb fixed (compute width+position from the opening's current width+position + the new
  jamb position; clamp to MIN_OPENING_WIDTH; the wall-length clamp can stay in deriveOpeningGeometry
  since geometry already clamps, but keep the command self-consistent). Register in
  registerOpeningCommands.
- RED: opening-commands.test.ts new cases (apply sets width+position, holds opposite jamb, undo
  restores, type const + sibling-ref equality on untouched openings). GREEN. BLUE.

### Cycle 4: lengthReadout helper (pure)

- `editor/plan/drag-readout.ts`: lengthReadout(anchor: Point, lengthMm: number, prefs): DragReadout
  -> { anchor, text: formatAdaptiveLength(lengthMm, prefs) }. No bearing.
- RED: drag-readout.test.ts new case. GREEN. BLUE marker.

### Cycle 5: drawOpeningResizeHandles + gating (visual)

- `draw-plan.ts`: drawOpeningResizeHandles(ctx, node, viewport) drawing two endpoint-style circles
  at the jamb world points. Add DrawPlanOptions field (e.g. openingResizeHandles?: OpeningSceneNode)
  drawn in drawPlan when set. plan-scene buildScene sets it from the selected opening (one opening
  selected -> the node, else undefined).
- RED: draw-plan.test.ts (or the scene test) asserts the handles draw when one opening selected and
  not otherwise (mirror how endpointHandles is tested). GREEN. BLUE.
- NOTE: the scene-leaf addition (openingResizeHandles) is wired in plan-view buildScene; watch
  exact-match scene toEqual tests (sweep; use toMatchObject or update). Home visual baseline:
  handles only show on a SELECTED opening, which the static home baseline has none of -> baseline
  should be UNCHANGED. Confirm; only refresh if it shifts.

### Cycle 6: use-opening-resizing hook + wiring + readout merge (e2e-proven glue)

- New `editor/plan/use-opening-resizing.ts` mirroring use-wall-editing: deps { session,
  selectedOpening, graph (host wall lookup), viewport, preferences }. Grab picks the jamb handle
  (pickOpeningResizeHandle) within HANDLE_GRAB_PIXELS/scale, captures pointer, returns true; move
  projects the cursor onto the wall axis, computes openingResizeEdge, sets a live preview width for
  the readout (lengthReadout at the dragged jamb world point); release dispatches resizeOpeningEdge.
  Expose readout: DragReadout | undefined. Coverage-excluded glue.
- Compose in compose-pointer-handlers ABOVE openingEditing (resize grab beats footprint grab);
  add openingResizing to PointerSources + the down/move/up chains.
- usePlanLayers: resolve the hook; thread selectedOpening (from use-opening-layer or a new
  singleSelectedOpening call) to the resize hook + buildScene handle leaf. usePlanController:
  `readout = selectionMove.readout ?? wallEditing.readout ?? openingResizing.readout`.
- Verified by the cycle-7 e2e (jsdom has no canvas). This cycle's RED is the e2e (cycle 7) OR a
  small jsdom/unit seam if one fits; prefer the e2e as the proof. If the e2e is the RED, commit it
  test: (NOT test(e2e):) so rgb:audit sees the GREEN's preceding RED.

### Cycle 7: e2e drag-resize + snap-to-end + readout

- `e2e/tests/opening-resize-handles.spec.ts` (chromium): draw a wall, place an opening (Opening
  tool -> click wall), select the opening via its `/ wide$/` proxy, read the opening's pre-drag
  width from the proxy name, press a jamb handle (compute its screen position from the proxy box /
  wall geometry), drag along the wall, assert `.plan-overlay__readout` visible + /\d/ while
  dragging, release, assert the opening's width changed (proxy name) and readout count 0. A second
  assertion or test for snap-to-wall-end (drag the jamb toward the wall end, release, width extends
  flush). Commit test: as the cycle RED if not already committed in cycle 6.

## Gate

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`;
`pnpm rgb:audit origin/main..HEAD` clean; full chromium + scene-webgl e2e after build (kill stale 4173).
Home darwin visual baseline: only refresh if the STATIC render shifts (handles show only on a selected
opening; expect UNCHANGED).

## Watch / gotchas

- MIN_OPENING_WIDTH does not exist; introduce one constant and share it (command + geometry).
- lint-staged eslint --fix can empty a RED file whose import can't resolve yet; verify eslint-clean,
  drop leaked stashes, reformat in BLUE (the #117 gotcha).
- max-lines-per-function (40) / max-params (3): the resize hook will need the grab/move/release split
  like use-wall-editing; bundle deps into a control object. max-lines (300) on draw-plan.ts /
  opening-resize.ts after tests -> dedupe in BLUE.
- Adding a DrawPlanOptions / PlanScene field can break exact-match toEqual scene tests; sweep first
  ([[required-shared-field-breaks-siblings]]).
- Compose order: openingResizing MUST sit above openingEditing (footprint) so a jamb-handle press
  resizes rather than moves. Add it to onPointerDown, onPointerMove, AND onPointerUp.
- Confirm the jamb<->edge mapping against deriveOpeningGeometry (start jamb = lower position) before
  wiring the command, so dragging the visible start handle resizes the start side.
- e2e RED that is a cycle's RED -> commit test: not test(e2e): (rgb:audit exemption rule).
- Close every GREEN with a BLUE marker before the next RED ([[close-green-with-blue-before-next-red]]).

## Defer / out of scope

- Height + sill-height handles (inspector only this slice).
- Full snap chain for the dragged jamb (focused jamb-to-wall-end only; full chain = future).
- Distance-to-wall-end secondary readout (snap already signals flush).
- Free-angle endpoint modifier -> #120.
