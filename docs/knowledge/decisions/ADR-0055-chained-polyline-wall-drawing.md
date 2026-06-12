---
slug: decisions/ADR-0055-chained-polyline-wall-drawing
title: 'ADR-0055: Chained polyline wall drawing buffers vertices and commits one wall per segment'
type: decision
tags: [editor, plan, wall-drawing, state-machine, rooms, canvas, accessibility, testability]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0054-smart-angle-snap,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-11-chained-polyline-wall-drawing.md,
    editor/plan/wall-tool.ts,
    editor/plan/use-plan-interaction.ts,
    editor/plan/snap.ts,
    editor/plan/use-snapping.ts,
    editor/plan/draw-plan.ts,
    core/topology/rooms.ts,
  ]
status: current
updated: 2026-06-11
---

# ADR-0055: Chained polyline wall drawing buffers vertices and commits one wall per segment

## Status

Accepted. This evolves the wall-tool state machine from ADR-0021 and composes with the
snap origin that ADR-0033 and ADR-0054 read. The makeover specification already mandates
the behavior in its "Wall drawing and editing" section ("chained polyline drawing: click
to start ... click to commit each segment and continue, backspace to remove the last
vertex, enter or double-click to finish"), so no `docs/specs/` change is needed. It lands
in the chained-polyline slice on a branch off `main`, after the cancel-in-progress-wall
work that gave the tool its Escape handling.

## Context

The wall tool is a two-state machine today: `idle`, or `drawing` from a single anchored
`start`. The first click anchors the start, the second click commits one wall and returns
to idle. Escape abandons an anchored start. That is a single segment per gesture, so a
run of connected walls means clicking the same corner twice, once to end the previous wall
and once to start the next, and there is no way to take back a corner short of drawing the
wall and deleting it.

Period plans are mostly closed runs: a room is a loop of connected segments, and an
addition is a short open run hung off an existing corner. The makeover asks for a chained
draw where one gesture lays a whole run, each click drops a corner, a wrong corner backs
off, and closing the run onto its first corner is what makes a room. Two facts in the
existing code shape the design. Rooms are derived, not authored: `deriveRooms` in
`core/topology/rooms.ts` reads the flat wall list and finds rooms as closed cycles in the
wall graph, so a loop becomes a room the moment its segments exist, with no room command.
And the snap chain already anchors its angle, perpendicular, and parallel kinds on a single
`origin` point, which a multi-segment run needs to advance corner by corner.

## Decision

### The drawing state holds the run's vertices

`WallToolState` keeps `idle`, and its `drawing` phase carries `vertices: Point[]` (the
corners dropped so far) in place of the single `start`. A click while drawing appends the
snapped cursor as the next corner. The first click of a fresh gesture anchors `vertices`
to a single corner, exactly as the old `start` did.

### Vertices buffer in tool state and commit one wall per segment on finish

Nothing reaches the model while the run is open. The corners live in tool state, so
backspace and Escape are pure: backspace pops the last vertex (an empty buffer returns the
tool to idle, which is how the first click is backed out), and Escape drops the whole
buffer. Abandoning a half-drawn run therefore leaves no debris to clean up.

Finishing commits the run as a separate `addWall` per segment, so each wall is its own
undo entry and a later Ctrl+Z (Cmd+Z) peels the run back one segment at a time. This keeps
`addWall` exactly as it is, with no run-scoped coalescing and no signature change. A run of
fewer than two vertices has no segment to commit and finishes as a cancel.

### Closing the run onto its first corner forms a room

The corners of the open run are not committed walls yet, so the endpoint snap cannot see
them on its own. The interaction layer feeds the run's open corners to the snap chain as
extra endpoint candidates, so the cursor snaps onto the first corner as the run comes back
around. The endpoint kind sits above the angle lock in the priority chain (ADR-0054), so
returning to the start beats the lock and the cursor lands on the first corner exactly. A
click there, once the run has at least three corners, appends the closing segment and
finishes. The closed loop of committed walls is picked up by `deriveRooms` with no further
work, which is why closing the path is what forms a room. Enter or a double-click finishes
an open run instead; a double-click commits the corner under the cursor as the final
vertex before finishing.

### Extending a run later is the same gesture, not a mode

Walls stay individual entities joined by shared endpoints; a run is never sealed into a
single object. So picking a chain back up is just starting a draw whose first click snaps
to a free wall endpoint: the new segments join the graph at that corner, and if they close
a cycle a room derives. There is no reopen step and no polyline object to mutate.

### The snap origin advances to the last committed vertex

The interaction layer feeds the snap chain the last corner in the buffer as `origin`,
where it fed the single `start` before. So the default angle lock, the perpendicular and
parallel kinds, and the length and bearing readout all measure from the previous corner of
the run, segment by segment. The held free-angle modifier (Alt, which is Option on a Mac)
is unchanged.

### Rendering reuses the existing preview channels

The committed-so-far segments of the open run paint through the existing
`ghost: PreviewSegment[]` channel that the move drag already uses, and the live segment
from the last corner to the cursor paints through the existing `preview`. The first corner
keeps a start marker as the visible close target, and the endpoint snap lights the
indicator when the cursor returns to it. The `PlanDrawingContext` seam does not change.

## Consequences

- A single gesture lays a whole run of walls, and closing the run forms a room, which is
  the common path for drawing a period room. The two-click single wall is the one-segment
  case of the same machine, finished with Enter or a double-click.
- Undo granularity is per segment, by choice: a finished run is several entries, and one
  undo removes the last segment, not the whole run. Backspace gives the same per-segment
  trim while the run is still open, before anything is committed.
- The model is untouched until finish, so an abandoned run costs nothing and never leaves
  orphaned walls. The trade is that the open run shows as a ghost rather than as real walls
  until it is finished.
- No `core/` change. `addWall` keeps its signature, room derivation stays reactive to the
  wall list, and the slice is confined to `editor/plan`.
- The snap chain gains the run's open corners as endpoint candidates while a draw is
  active. The scan stays linear in the corner count per resolve, in line with the existing
  kinds, and the candidates clear the moment the run finishes or is abandoned.
- The shared e2e `drawWall` helper now finishes the run (it presses Enter after the second
  click) so the tool returns to idle before the next interaction. The journeys that draw a
  wall and then select, delete, or undo it keep working unchanged behind that helper.

## Alternatives considered

- **Commit each segment live, on the click that drops the corner.** Rejected: the walls
  would be real mid-run, so backspace and Escape would have to unwind committed history
  rather than trim a buffer, and an abandoned run would leave walls behind unless something
  undid them. Buffering keeps the back-out paths pure and the model clean until finish.
- **Collapse the run into one atomic undo entry via command coalescing.** Rejected: undo
  is per segment by decision, so a finished run reads as its individual walls. Coalescing
  would have meant a run-scoped token on `addWall` and a `coalesceWith`, which the
  per-segment choice makes unnecessary.
- **Model the run as a single polyline entity.** Rejected: a sealed polyline would block
  the "extend later" requirement, since picking the run back up would mean reopening and
  mutating that object. Keeping walls as individual entities lets a later draw extend any
  free endpoint, and rooms already derive from the flat wall set rather than from an
  authored polyline.
- **Auto-close within a tolerance of the first corner instead of requiring a click there.**
  Rejected: the endpoint snap already pulls the cursor onto the first corner, so a
  deliberate click closes the loop predictably, and an open run that happens to pass near
  its start is not closed by accident.

## References

- ADR-0021 (the 2D plan rendering and interaction model, including the wall-tool state
  machine this evolves).
- ADR-0033 (the drawing-snap model whose `origin` now advances per segment) and ADR-0054
  (the default angle lock that reads that origin).
- `core/topology/rooms.ts` (`deriveRooms`), which turns a closed run of walls into a room
  with no room command.
- Design specification: the makeover spec's "Wall drawing and editing" section, and the
  original design sections 6.2 and 6.6.
- Implementation plan: `docs/plans/2026-06-11-chained-polyline-wall-drawing.md`.
