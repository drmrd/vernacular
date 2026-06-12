---
slug: decisions/ADR-0060-immediate-commit-wall-drawing
title: 'ADR-0060: Immediate-commit wall drawing with active-vertex snapping'
type: decision
tags: [editor, plan, wall-tool, drawing, snapping, interaction, rooms]
related:
  [
    decisions/ADR-0055-chained-polyline-wall-drawing,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
  ]
sourceFiles: [editor/plan/wall-tool.ts, editor/plan/use-plan-interaction.ts, editor/plan/snap.ts]
status: current
updated: 2026-06-12
---

# ADR-0060: Immediate-commit wall drawing with active-vertex snapping

## Status

Accepted. Supersedes the buffering decision in ADR-0055. The wall tool now commits
each segment as it is placed rather than holding the run in tool state until an
explicit finish.

## Context

ADR-0055 made the wall tool a buffering polyline: clicks accumulated corners in tool
state and committed one `addWall` per segment only when the run was finished (Enter
or a double-click) or closed back onto its own first corner. That kept an abandoned
run from leaving any walls and gave per-segment undo by replaying the buffer.

The makeover specification's "Wall drawing and editing" section actually described
the unbuffered behavior: "click to commit each segment and continue." ADR-0055
buffered instead, so this decision brings the tool back in line with the spec rather
than charting new ground.

In real use the buffering broke the core loop of the app. Drawing a wall to close a
space already bounded on its other sides, or a partition across an existing room,
appeared to place the wall, but because the run was never finished the segment was
never committed, so the room never derived. The room derivation itself is correct:
`rooms.test.ts` and a live trace both form the room the instant the closing segment
is committed. The failure was entirely that the finish step is invisible, so users
with a single-wall mental model never reached it.

Two smaller problems rode along. The tool was a polyline by default with no
single-wall mode, which surprised users. And finishing with a double-click could
drop a tiny stray segment: the first click of the double-click placed a corner and
the second placed another a pixel away before the finish fired.

## Decision

Each segment commits the moment its end corner is placed.

- The first click of a run anchors the start and commits nothing. Every later click
  commits one wall from the previous corner to the clicked point, so a wall exists
  as soon as you place its end. Closing a space or dropping a partition forms the
  room with no finish keypress.
- The active run's corners, including the corner currently being drawn from, are snap
  targets. The cursor snaps back onto any placed corner. Snapping onto the **first**
  corner and clicking closes the loop (the closing segment commits and the run ends,
  so the room derives). Snapping onto the **last** corner and clicking ends the run
  with no new segment. Because the cursor snaps onto that last corner when it is
  near, a slightly imprecise double-click lands exactly on it and ends cleanly rather
  than leaving a sliver.
- Enter and a double-click still end the run, now as a plain stop: the placed
  segments are already committed, so finishing adds nothing.
- Backspace, while drawing, undoes the last committed segment through the session
  undo stack and steps the draw-from corner back one. Per-segment undo is the
  ordinary command history (each segment is its own `addWall`), so it also works
  after the run ends.
- The committed walls render from the scene like any wall, so the only in-progress
  overlay is the rubber-band preview from the last corner to the cursor. The tool no
  longer paints the run as a separate ghost.

The number of walls a run produces is unchanged from ADR-0055: `n` clicks still make
`n - 1` walls, and a loop close still makes `n`. Only the moment of commit moved
earlier, so journeys that draw with clicks and a trailing Enter keep their wall
counts; the Enter now ends an already-built run.

## Why this approach

- **It fixes the room-forming failure at the source.** A wall that exists the instant
  it is placed is a wall the room derivation can see. There is no hidden state to
  flush.
- **It matches how people expect a wall tool to behave.** Click, click, the wall is
  there; keep clicking to chain; click where you are, or press Escape, to stop. The
  polyline is no longer a mode the user has to know they are in.
- **Active-vertex snapping removes the double-click sliver** and gives a single,
  discoverable way to end a run: click the corner you just placed.

## Trade-offs and non-goals

- **Abandoning a run no longer discards it.** Escape stops drawing, but the segments
  already placed remain and are removed with undo. ADR-0055 avoided that by holding
  the run unentered; immediate visibility is judged the better trade because the
  silent-no-room failure was worse than an extra undo.
- **No explicit single-wall versus polyline mode.** One tool draws one wall or many;
  ending the chain is a click on the active corner, Escape, or another tool. A
  separate single-segment mode is unnecessary once each segment is real on placement.
- **Discoverability of the end gesture** beyond the snap is a later refinement (a
  near-cursor hint). This ADR does not add on-canvas instructional text.

## References

- ADR-0055 (chained-polyline wall drawing; its buffering is superseded here).
- ADR-0026 (room derivation; the committed segments are what it enumerates).
- ADR-0033 (drawing snap model; the active-vertex candidates extend the snap chain).
- ADR-0005 (command pattern; each segment is one undoable `addWall`).
