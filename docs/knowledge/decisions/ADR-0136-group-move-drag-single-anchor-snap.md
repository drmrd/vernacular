---
slug: decisions/ADR-0136-group-move-drag-single-anchor-snap
title: 'ADR-0136: Group move-drag snaps by a single representative anchor'
type: decision
tags: [architecture, editor, plan, selection, move-drag, snapping, geometry]
related:
  [
    decisions/ADR-0126-marquee-crossing-and-set-operations,
    decisions/ADR-0040-clipboard-and-transforms,
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0059-precision-snapping-preferences,
  ]
sourceFiles: [editor/plan/move-drag.ts, editor/plan/use-selection-move.ts]
status: current
updated: 2026-06-29
---

# ADR-0136: Group move-drag snaps by a single representative anchor

## Status

Accepted, landed. The select-tool move-drag now snaps. A drag of one or more
selected entities resolves a single point against the live snap targets and
translates the whole selection rigidly by that correction. This builds on the
group move-drag that [[ADR-0126-marquee-crossing-and-set-operations]] and the
transforms in [[ADR-0040-clipboard-and-transforms]] established, and it reuses
the snap chain and preferences from [[ADR-0033-drawing-snap-model]] and
[[ADR-0059-precision-snapping-preferences]].

## Context

Group move-drag already translated a multi-entity selection rigidly, but the
release committed the raw pointer delta with no snapping. Dragging a wall toward
another wall's endpoint or onto the grid landed it a few millimetres off, and the
user had no way to seat the moved geometry against existing features. Drawing a
new wall has snapped since the early plan work; moving an existing one did not,
which read as an inconsistency rather than a deliberate choice.

What a multi-entity selection should snap to is less obvious. A single dragged
point has one obvious answer. A group of walls and dimensions has many
candidate points, and snapping each one independently would shear the selection:
two endpoints that started a metre apart could each grab a different target and
end up a different distance apart, breaking the relative geometry the drag is
meant to preserve. A move-drag is a translation, so whatever the group snaps to,
it has to move every member by the same vector.

## Decision

### One representative anchor drives a rigid translation

`editor/plan/move-drag.ts` resolves snapping through a single
`snappedDragDelta` helper shared by the live ghost, the readout chip, and the
release commit. It takes the first ghost segment's start as the representative
anchor, offers that anchor's raw-dragged position to the snap resolver, and takes
the difference between the snapped position and the anchor's original position as
the delta the whole group shares. Every segment then translates by that one
delta, so the selection keeps its exact internal geometry and only its placement
changes. The displacement chip measures the same snapped delta rather than the
raw cursor distance, so the number the user reads matches what the release will
commit. With no resolver supplied, or with no segments to anchor on, the helper
falls back to the raw pointer delta, so the pure state machine stays usable
without a snap context and the existing unsnapped tests still hold.

The anchor is the first segment's start rather than a computed centroid or
bounding-box corner. It is stable across the drag, cheap to read, and visible to
the user as a concrete point on the geometry they grabbed. A representative point
also means the snap indicators and tolerances behave exactly as they do when
drawing a single wall, with no new notion of "the group snapped."

### The hook supplies the snap resolver and excludes the selection

`editor/plan/use-selection-move.ts` builds the resolver the pure layer calls. It
reads the live snap preferences, filters the dragged selection out of the snap
targets, builds a snap context with `buildSnapContext`, and returns the snapped
point. Filtering the selection out matters: without it the moved walls would snap
to their own pre-move endpoints and the drag would stick to where it started.
The hook owns this glue so the move-drag state machine stays a pure unit with no
dependency on the scene graph or the preferences store.

### A translation has no draw-origin, so directional snaps stay off

The resolver passes no origin to `buildSnapContext`. The perpendicular, parallel,
and angle snaps all need a draw-origin to define the line they project onto, and a
translation has none: there is no in-progress segment being drawn, only an
existing one being moved. Leaving the origin unset disables exactly those snaps
and keeps the ones that make sense for a move, which are grid, endpoint,
midpoint, intersection, and edge. This falls out of the existing snap context
shape rather than needing a new flag.

## Consequences

- Moving a wall or a group now seats cleanly on the grid and on existing
  geometry, matching the precision that drawing a wall already had.
- The selection always translates rigidly. Relative spacing inside the group is
  preserved by construction because one delta moves every member.
- Snapping lives behind an optional resolver argument, so the move-drag state
  machine stays a pure function that is unit-tested without a React or scene
  dependency, and the resolver itself is thin glue in the hook.
- A group is anchored on whichever entity happens to be first in the ghost
  segment list. The drag does not pick the member nearest a target, so a user who
  wants a different corner to seat has to grab a selection ordered to put that
  corner first. This is the deliberate trade named below.

## Alternatives considered

- **Snap every selected point independently.** Rejected because it shears the
  selection: each point would chase its own nearest target and the group would
  deform. A move-drag is a translation by definition, so a single shared delta is
  the correct model.
- **Snap by the best-fitting endpoint across the whole selection.** Picking, each
  frame, whichever selected point lands closest to a target and translating the
  group by that correction would let any corner of the selection do the seating,
  not just the first. It is a real ergonomic improvement and is left as a future
  enhancement. It was deferred here because it needs a per-frame search over every
  selected point against every target and a tie-break rule, and the single-anchor
  rule already delivers correct, predictable snapping for the common case.
- **A centroid or bounding-box anchor.** Rejected because neither is a point on
  the geometry the user grabbed, so the snap would seat an invisible reference
  against a target and feel detached from what is on screen.

## References

- ADR-0126 (the marquee crossing and set operations that build the multi-entity
  selection this drag moves).
- ADR-0040 (the clipboard and transforms that the move-drag commit reuses through
  `translateEntities`).
- ADR-0033 (the drawing snap model whose chain and resolver this reuses).
- ADR-0059 (the precision snapping preferences that gate which snap kinds engage).
- Issue #372 (group move-drag snapping) and issue #201 (bounding-box multi-select
  and group drag-move).
