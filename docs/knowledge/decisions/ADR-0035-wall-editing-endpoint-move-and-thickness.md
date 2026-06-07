---
slug: decisions/ADR-0035-wall-editing-endpoint-move-and-thickness
title: 'ADR-0035: Wall editing (endpoint move and thickness) via two undoable commands behind a glue-side id boundary'
type: decision
tags:
  [architecture, core, commands, undo-redo, editor, plan, wall-editing, canvas, units, testability]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0033-drawing-snap-model,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-06-wall-editing.md,
    core/commands/handlers/wall-commands.ts,
    core/index.ts,
    editor/plan/wall-editing.ts,
    editor/plan/draw-plan.ts,
    editor/plan/use-wall-editing.ts,
    editor/plan/selected-wall.ts,
    editor/plan/wall-thickness-editor.tsx,
    editor/shell/editor-shell.tsx,
  ]
status: current
updated: 2026-06-06
---

# ADR-0035: Wall editing (endpoint move and thickness) via two undoable commands behind a glue-side id boundary

## Status

Accepted, landed. The user can now edit an existing wall: dragging either
endpoint of the single selected wall moves it to a snapped position, and a
unit-aware inspector input changes the selected wall's thickness. Both edits
flow through `dispatch(command)` and undo through the dispatcher's captured
inverse. This is slice 6 of Phase 1 (the 2D plan editor), implementing behavior
the design specification already mandates (sections 6.2 and 6.6); no
`docs/specs/` change was required. It extends the plan path ADR-0021 established
and the command machinery ADR-0005 established, and reuses the slice-4 snapping
(ADR-0033), the slice-5 selection store (ADR-0020), and the slice-2 unit
formatters (ADR-0027). This ADR records the wall-editing decisions themselves.

## Context

Slices 1 through 5 stood up the wall topology and derived rooms, the units
module, the interactive viewport, snapping, and selection with a hit-test index.
Wall drawing already dispatched `addWall` through the dispatcher. The remaining
gap was editing an existing wall: moving an endpoint and changing the thickness.

Two model facts shaped the slice. `Wall` already carries `thickness` and its
`start`/`end` geometry, so both edits are fully specifiable against today's model
with no `core/model/types.ts` change and no schema migration. And the scene graph
exposes walls as `WallSceneNode`s whose ids are namespaced (`wall:<id>`) while the
pure commands locate a wall by its raw `Wall.id` on a raw `floorId`. That
namespacing mismatch had to be resolved somewhere, and the question was where.

## Decision

### Two pure, undoable commands following the `addWall` pattern

`core/commands/handlers/wall-commands.ts` gains two commands beside the existing
`addWall`, each following the `addWall` shape exactly: a `type` constant
(`MOVE_WALL_ENDPOINT = 'floor/move-wall-endpoint'`,
`SET_WALL_THICKNESS = 'floor/set-wall-thickness'`), a params interface
(`MoveWallEndpointParams`, `SetWallThicknessParams`), a creator returning
`{ type, params, description }`, and a `CommandHandler<Project, P>` whose `apply`
reassigns `state.floors` immutably.

- `moveWallEndpoint(floorId, wallId, end, to)` replaces the named endpoint
  (`'start'` or `'end'`) of the target wall with `to`.
- `setWallThickness(floorId, wallId, thickness)` sets the target wall's
  `thickness`.

Both reassign the whole `floors` slice exactly as `addWall` does, so the
root-level inverse-capture proxy records the change and the dispatcher captures
the inverse automatically (ADR-0005). Neither handler authors an inverse:
dispatching then `undo` restores the prior endpoint or thickness via the captured
inverse, and a failed command rolls back atomically. Because the
immutable-update convention rebuilds the `floors` array with `map`, every
untouched floor and wall keeps its reference, so the memoized scene-graph deriver
(ADR-0018) re-derives only the edited wall (and the rooms its move reshapes).

`registerWallCommands` chains all three registrations
(`ADD_WALL`, `MOVE_WALL_ENDPOINT`, `SET_WALL_THICKNESS`). All three types and
creators are barrel-exported from `core/index.ts` (`WallEnd`,
`MoveWallEndpointParams`, `SetWallThicknessParams`, `MOVE_WALL_ENDPOINT`,
`SET_WALL_THICKNESS`, `moveWallEndpoint`, `setWallThickness`).

### A shared `updateWall` floor-and-wall traversal helper

Both handlers locate one wall on one floor and return a new wall object, so the
"map the floors, then map the target floor's walls, then update only the target
wall" traversal is factored into one small private helper:

```ts
function updateWall(
  floors: Floor[],
  floorId: string,
  wallId: string,
  update: (wall: Wall) => Wall,
): Floor[]
```

`moveWallEndpoint`'s handler passes `(wall) => ({ ...wall, [params.end]: params.to })`
and `setWallThickness`'s passes `(wall) => ({ ...wall, thickness: params.thickness })`.
This is real shared shape, not coincidental: both edits are a single-wall
in-place replacement that must preserve the whole-floors immutable reassignment.
A future single-wall edit should reuse `updateWall` rather than restate the
double-`map`.

### The raw-id vs namespaced-scene-node-id boundary lives only at the glue

The pure command creators and handlers take a **raw** `floorId` and `wallId` and
never see the namespaced `wall:<id>` form; handlers locate the target by
`floor.id === floorId` then `wall.id === wallId`. The `wall:` prefix is a
scene-graph node-id concern, so it is stripped once, at the glue boundary, in two
places that both define a local `WALL_NODE_PREFIX = 'wall:'` constant:

- `editor/plan/use-wall-editing.ts` derives the raw id with
  `drag.wall.id.slice(WALL_NODE_PREFIX.length)` and reads `floorId` straight off
  the scene node before dispatching `moveWallEndpoint`.
- `editor/shell/editor-shell.tsx` derives the raw id the same way and reads
  `floorId` off the scene node before handing props to the thickness editor.

This keeps the namespacing out of `core/`: the commands stay a pure function of
raw model ids, and only the glue that bridges the scene graph to the commands
knows the prefix.

### `pickWallEndpoint`: the pure grab rule

`editor/plan/wall-editing.ts` exports
`pickWallEndpoint(wall, point, toleranceMm): WallEnd | null`, the pure rule for
which endpoint a pointer grabs. It measures the straight-line `distance` (from
`core`) from the point to each endpoint and:

- returns `null` when both endpoints are beyond `toleranceMm`,
- otherwise returns the **nearer** endpoint, with `'start'` winning an exact tie
  (the comparison `distanceToEnd < distanceToStart` is strict, so `'end'` is
  chosen only when strictly nearer).

`WallEnd` is imported from `core` so the return type is identical to
`MoveWallEndpointParams.end`, single-sourcing the union. The `no-nested-ternary`
rule is satisfied by naming the comparison (`endIsNearer`) rather than nesting
the start/end/null choice.

### Endpoint handles painted through the narrow plan-drawing seam

`editor/plan/draw-plan.ts` gains `drawEndpointHandles(ctx, wall, viewport)`, which
projects both endpoints through `worldToScreen` and paints a filled dot at each
(named module constants `ENDPOINT_HANDLE_COLOR`, `ENDPOINT_HANDLE_RADIUS_PX`).
It uses only members already on the `PlanDrawingContext` structural seam
(ADR-0021: `fillStyle`, `beginPath`, `arc`, `fill`), so the seam grows by zero and
every existing recording fake stays valid. The same primitive `drawStartMarker`
and `drawSnapIndicator` already paint, confirming again that the seam grows by a
few members per feature at most.

`drawPlan` gates the handles on a new optional `endpointHandles?: WallSceneNode`
on `DrawPlanOptions`: when set, it calls `drawEndpointHandles` as an overlay above
the wall strokes; when absent, no handles are painted and the slice-1/3/4/5 draw
output is unchanged. The option being optional keeps every existing `drawPlan`
call site and test green.

### The endpoint-drag and selected-wall glue

`editor/plan/use-wall-editing.ts` is coverage-excluded Canvas-and-pointer glue
(jsdom has no 2D canvas). It wires the pure pieces: a pointer-down under the
select tool runs `pickWallEndpoint` (with a screen-pixel grab radius converted to
a world tolerance so the target stays fixed on-screen across zoom) and, on a hit,
captures the pointer and begins a drag; motion resolves the moving cursor through
the slice-4 snapping (`useSnapping`, with the fixed endpoint as the snap origin)
and previews the wall; release dispatches an undoable `moveWallEndpoint`, or
nothing when the endpoint did not move. The grab handler returns whether it
grabbed so the composition gives the drag priority over the marquee/click
selection on that pointer-down. `editor/plan/selected-wall.ts`
(`singleSelectedWall`) is the tool-gated derivation of the single editable wall
that the drag glue and the handle painting key off.

### The inline unit-aware thickness editor

`editor/plan/wall-thickness-editor.tsx` (`WallThicknessEditor`) is a small DOM
component with its own React Testing Library test (no canvas, so not
coverage-excluded glue). It takes raw `floorId`, `wallId`, current `thickness`,
a loose `dispatch`, and the active `UnitPreferences` as props rather than reading
the session directly, so the test drives it without the provider tree.

- It renders the current thickness formatted with
  `formatLength(thickness, lengthFormatOptions(preferences))` (slice-2 formatters,
  ADR-0027) in a labeled text input.
- On commit (Enter), it parses the entered string with
  `parseLength(text, { assumeUnit })`, where `assumeUnit` is the active system's
  bare-number unit (`mm` for metric, `ft` for imperial, named in
  `ASSUME_UNIT_BY_SYSTEM`), and dispatches exactly one
  `setWallThickness(floorId, wallId, parsed)` carrying the parsed millimetre
  value.
- An **unparseable** entry (one that makes `parseLength` throw) dispatches
  **nothing**; the try/catch around `parseLength` is the only place that rule
  lives, and the input keeps its invalid text.

The shell renders it in the inspector aside when exactly one selected id names a
wall, and **keys it on `${wallNode.id}:${wallNode.thickness}`** so it remounts
(and re-reads its formatted initial value) when the selected wall changes or when
an undo restores a different thickness. The component captures its initial
formatted value at mount, so the key is what keeps the displayed value honest
across undo.

## Consequences

- Every wall edit is undoable for free: the two handlers describe only the
  forward edit and the dispatcher captures the inverse, so a moved endpoint or a
  changed thickness round-trips through `undo`/`redo` with no hand-authored
  inverse, and the rooms re-derive from the wall graph after every edit.
- `updateWall` is the template for any future single-wall edit (for example a
  later construction-type edit): pass an `(wall) => Wall` updater and inherit the
  whole-floors immutable reassignment and the entity-keyed referential identity.
- The raw-id boundary is a reusable convention: when a command acts on a model
  entity that the scene graph exposes under a namespaced node id, strip the
  namespace at the glue and keep the command a pure function of raw model ids.
  The two `WALL_NODE_PREFIX` constants mark that boundary explicitly.
- The `endpointHandles` option confirms the ADR-0021 seam discipline once more:
  a new overlay is one optional `DrawPlanOptions` field plus a guarded call,
  reusing existing seam members, so the recording fake and every existing draw
  test stay valid.
- Keying the inspector editor on id-and-thickness is the pattern for a
  capture-at-mount input that must stay in sync with an undoable model value:
  remount on the value rather than reconciling controlled state with external
  changes.

## Deferred

Recorded here and in `ROADMAP.md`:

- **Construction type** is deferred to the old-house architectural-vocabulary
  milestone, which owns the construction-type registry and era-aware catalogs.
  `Wall` gains no `constructionType` field in this slice; editing it lands with
  that vocabulary work. This is why slice 6 ships endpoint move and thickness, the
  two wall-editing operations fully specifiable against today's model.
- **The perpendicular-drag thickness gizmo** (the design specification's
  on-canvas thickness gesture) is deferred in favor of the inline unit-aware
  input, mirroring how slice 3 painted rulers on the Canvas and deferred the
  DOM-overlay gizmos.
- **Junction-cohesive dragging** (moving a shared junction so every incident wall
  moves together) is deferred; this slice moves only the selected wall's
  endpoint. The room derivation re-runs from the wall graph regardless, so a moved
  endpoint that lands on or off a junction reshapes the derived rooms either way.
- **Multi-wall batch editing** is deferred; both edits act on a single selected
  wall, consistent with the slice-5 deferral of selection batch operations.
- **Default unit preferences.** The inline editor picks
  `DEFAULT_METRIC_PREFERENCES` or `DEFAULT_IMPERIAL_PREFERENCES` from the
  project's `meta.units`; a project-level unit-preferences store is later work,
  mirroring how slice 3 deferred unit-aware ruler labels.

## References

- Design specification, sections 6.2 and 6.6 (wall editing the specification
  already mandates; no `docs/specs/` change required).
- Slice plan: `docs/plans/2026-06-06-wall-editing.md` (Task G4 specifies this
  curation).
- ADR-0005 (command pattern, the single dispatch boundary, and the
  framework-captured inverse the two commands rely on, plus the immutable
  whole-floors reassignment convention they follow).
- ADR-0018 (scene-graph derivation; the referential identity the immutable
  updates preserve, so only the edited wall and reshaped rooms re-derive).
- ADR-0020 (the bridge selection store the editing glue reads to find the single
  selected wall; editing stays out of undo just as selection does).
- ADR-0021 (the 2D plan path and the `PlanDrawingContext` seam the endpoint
  handles paint through, with no seam growth).
- ADR-0027 (the slice-2 units module whose `formatLength` / `parseLength` and
  preferences the inline thickness editor reuses against millimetre storage).
- ADR-0033 (the slice-4 snapping the endpoint drag reuses to resolve the moving
  cursor).
  </content>
  </invoke>
