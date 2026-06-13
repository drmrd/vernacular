---
slug: decisions/ADR-0072-live-drag-readouts
title: 'ADR-0072: Cursor-adjacent readouts for live drag edits'
type: decision
tags: [architecture, editor, two-dimensional, interaction, drag, readout, overlay, feedback, units]
related:
  [
    decisions/ADR-0071-select-mode-hover-preview,
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
    decisions/ADR-0020-selection-state-outside-undo,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-live-drag-previews-and-readouts.md,
    docs/plans/2026-06-13-live-drag-previews-and-readouts.md,
    editor/plan/drag-readout.ts,
    editor/plan/draw-readout.ts,
    editor/plan/use-selection-move.ts,
    editor/plan/use-wall-editing.ts,
    editor/plan/plan-overlay.tsx,
    editor/plan/plan-scene.ts,
    e2e/tests/live-drag-readout.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0072: Cursor-adjacent readouts for live drag edits

## Status

Accepted. Third story in the edit-feedback cluster raised from owner feedback
(issues #116 through #120), after the default-interaction work
([[ADR-0070-two-dimensional-pan-and-default-interaction]]) and the Select-mode
hover preview ([[ADR-0071-select-mode-hover-preview]]), which forward-referenced
this cursor-adjacent readout.

## Context

The wall tool already shows a live readout: while a segment stretches to the
cursor, a DOM pill in the plan overlay reads its length and bearing through
`segmentReadout` and `formatReadout`, formatted with the project's unit
preference. The other drag gestures preview their geometry but report no number.
Moving a selection draws a ghost of the moved entities with no displacement.
Dragging a wall endpoint redraws the wall to the cursor with no length. The
machinery for a live number exists; it is wired to one gesture only.

The owner asked for cursor-adjacent readouts on the live drags. The decision is
where the readout lives, what it reports, and how the gestures feed it without
each reinventing a pill.

## Decision

### One readout leaf, fed by whichever drag is live

The plan overlay already renders a positioned readout pill for the wall tool. The
scene grows a single optional readout leaf, an anchor point plus the value to
show, and the overlay renders that one pill wherever the leaf is set. A drag hook
populates the leaf while its gesture runs and clears it on release. Only one drag
is ever live at a time, so a single leaf is enough and the overlay needs no
per-gesture branch. The wall tool's existing pill is the template; move and
endpoint drags reuse the same component and the same placement rule rather than
each adding their own overlay element.

### The readout is a length and a bearing, reused from the wall tool

Every drag reduces to a segment: the move reports the displacement from the press
point to the cursor, and the endpoint drag reports the reshaped wall from its
fixed end to the cursor. Both are a length and a bearing, so both run through the
existing `segmentReadout` and `formatReadout` and read in the same vocabulary the
wall tool already established. A move is reported as one distance-and-direction
rather than separate horizontal and vertical offsets, because a single
length-and-bearing matches the wall-tool pill and reads as the natural answer to
"how far, which way." The readout content is computed by a small pure module,
`drag-readout.ts`, that takes the two points and returns the anchor and the
formatted text, unit-tested without React or a canvas.

### Anchored at the live point, offset clear of the cursor

The pill anchors at the live point of the drag, the cursor for a move and the
dragged endpoint for an endpoint edit, and carries the wall tool's offset so it
sits beside the pointer rather than under it. The readout is transient view state
held alongside each drag's ghost, never stored and never undoable, the same
standing as the selection set ([[ADR-0020-selection-state-outside-undo]]) and the
hover id from the previous slice. At rest, and the moment a drag releases, no
readout shows.

### One wall reported for a shared junction

When a dragged endpoint is a junction shared by several walls, the readout reads
the wall whose handle was grabbed, not a pill per wall stacked at one point. That
wall is the one the user aimed at, and a single legible length beats a cluster of
overlapping pills.

## Consequences

The numbers that drive a drag are visible while the drag is live, so a user can
move a selection a set distance or pull a wall to a target length without
committing and correcting. The cost is one scene leaf, one pure readout module,
and a few lines in two drag hooks; the overlay pill, the formatter, and the unit
source are all reused, so no second readout vocabulary or unit path enters the
editor. Because the readout is view-only it adds no command, no migration, and
nothing to undo. The same leaf and pill are what the opening-handles slice (#119)
reuses for its width-and-distance readout, and the endpoint-angle slice (#120)
inherits the endpoint readout unchanged when it adds the free-angle modifier.
Opening drags and keyboard nudges raise no readout in this slice by design; the
pill is a pointer-driven affordance over the gestures that already preview a
ghost.
