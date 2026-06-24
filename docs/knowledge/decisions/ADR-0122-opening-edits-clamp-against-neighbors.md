---
slug: decisions/ADR-0122-opening-edits-clamp-against-neighbors
title: 'ADR-0122: Opening edits clamp against same-wall neighbors'
type: decision
tags: [editor, openings, overlap, drag, resize, inspector, core]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0005-command-pattern-with-inverse,
    decisions/ADR-0038-openings-as-typed-wall-hosted-entities,
    decisions/ADR-0073-opening-resize-handles,
  ]
sourceFiles:
  [
    core/model/opening-overlap.ts,
    editor/plan/use-opening-editing.ts,
    editor/plan/use-opening-resizing.ts,
    editor/plan/opening-inspector.tsx,
    editor/shell/inspector.tsx,
  ]
status: current
updated: 2026-06-24
---

# ADR-0122: Opening edits clamp against same-wall neighbors

## Status

Accepted, landed. The three ways an existing opening changes its span on a wall now refuse to put it
on top of a neighbor. Dragging an opening along its wall, dragging one of its jamb handles, and typing
a wider value in the inspector all stop the opening flush against the nearest neighbor instead of
overlapping it.

## Context

When a door or window is first placed, a guard already blocks a drop that would land on another opening
on the same wall (the `openingWouldOverlap` predicate added with the initial-placement work). That guard
only covered placement. Once an opening existed, three other paths could still push its span across a
neighbor:

- dragging the opening's footprint along the wall,
- dragging a jamb handle to widen it,
- typing a larger width in the inspector.

Two overlapping openings do not describe a buildable wall, and the void each opening cuts would merge
into a shape the wall builder is not meant to produce. So the same rule that protects placement should
protect every edit that moves a jamb.

The resize tool already had a precedent worth matching: a jamb drag clamps to the wall ends and to a
minimum width rather than rejecting the gesture outright. Stopping flush against an obstacle reads as
direct manipulation; snapping the opening back to where it started reads as the editor fighting you. We
wanted the neighbor to feel like the wall end already feels.

## Decision

Keep the geometry in `core` and apply it at the editor seam, mirroring how the placement guard is
structured (a pure predicate in `core`, used by editor glue).

`core/model/opening-overlap.ts` gains three clamp helpers alongside the existing predicate. All three
read an opening, a proposed value, and the openings to test against, and return a value that keeps the
span clear of same-wall neighbors. Touching at an endpoint is allowed; only a strict overlap is
prevented. Neighbors on a different host wall, and the opening compared against itself, never constrain.

- `clampOpeningMove` clamps a new center into the largest overlap-free interval that contains the
  opening's current position, so a drag slides flush against the blocking neighbor but stops there.
- `clampOpeningResizeJamb` clamps a single dragged jamb to the near edge of the closest neighbor on the
  side the jamb is moving toward.
- `clampOpeningWidth` clamps a width, kept centered on the opening's position, to the smaller of the two
  side gaps.

`clampOpeningMove` and `clampOpeningResizeJamb` share one private helper, `neighborEdgeLimits`, that
returns the raw jamb-coordinate bounds the current span imposes from its neighbors. `clampOpeningWidth`
measures side gaps from the fixed center instead, so it stays separate.

The three edit paths each call the matching helper before dispatching their command. The footprint-drag
release clamps the move; the jamb drag captures the opening and its floor's openings when the handle is
grabbed and clamps the dragged jamb, so the live width readout and the committed resize agree; the
inspector clamps a committed width. The command handlers stay pure reducers and are not changed.

When the helper is handed input that already overlaps (an opening sitting inside a pre-existing overlap,
which a well-formed plan does not produce), there is no valid clamp target, so the helper returns the
opening's current value unchanged rather than a nonsensical one.

## Consequences

- An opening can no longer be dragged, jamb-resized, or inspector-widened onto a same-wall neighbor. It
  stops flush against the obstacle, consistent with the existing wall-end and minimum-width clamps.
- The clamp arithmetic lives in `core` and is unit tested directly; the inspector wiring has its own
  unit test; the drag-move and jamb-resize gestures are covered by an end-to-end journey that fails if
  the guard is removed.
- A different wall is never consulted, so two openings at the same along-wall position on opposite walls
  are untouched, and moving an opening past a neighbor by routing around it is simply not offered: the
  opening stops at the first neighbor in its path.
- The rule is enforced at the editor seam, not in the command handlers. A future non-editor caller that
  dispatches a move or resize directly is not bound by it. If that path appears, the predicate and clamp
  helpers are ready to move into the handlers or a shared guard without changing the geometry.
