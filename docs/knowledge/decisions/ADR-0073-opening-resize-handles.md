---
slug: decisions/ADR-0073-opening-resize-handles
title: 'ADR-0073: Opening drag-to-resize handles'
type: decision
tags:
  [
    architecture,
    editor,
    two-dimensional,
    interaction,
    opening,
    resize,
    handle,
    snap,
    readout,
    command,
  ]
related:
  [
    decisions/ADR-0072-live-drag-readouts,
    decisions/ADR-0071-select-mode-hover-preview,
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-opening-resize-handles.md,
    docs/plans/2026-06-13-opening-resize-handles.md,
    editor/plan/opening-resize.ts,
    editor/plan/use-opening-resizing.ts,
    editor/plan/drag-readout.ts,
    editor/plan/draw-plan.ts,
    editor/plan/compose-pointer-handlers.ts,
    editor/plan/plan-view.tsx,
    core/commands/handlers/opening-commands.ts,
    e2e/tests/opening-resize-handles.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0073: Opening drag-to-resize handles

## Status

Accepted. Fourth story in the edit-feedback cluster raised from owner feedback
(issues #116 through #120), after the default-interaction work
([[ADR-0070-two-dimensional-pan-and-default-interaction]]), the Select-mode hover
preview ([[ADR-0071-select-mode-hover-preview]]), and the cursor-adjacent live
drag readouts ([[ADR-0072-live-drag-readouts]]), whose readout pill this slice
reuses for the opening's width.

## Context

An opening is a wall-hosted element ([[ADR-0038-openings-doors-and-windows]])
positioned by a center point along its host wall and a width. The select tool can
already drag the whole opening along the wall: `use-opening-editing.ts` grabs the
footprint and dispatches `moveOpening` on release. What it cannot do is resize the
opening on the canvas. Width is edited through the inspector as a number, away from
the plan, even though the size of a doorway is a spatial judgment the user is
making while looking at the wall.

The wall-editing slice established the pattern this slice follows. A selected wall
shows a circular handle at each endpoint (`drawEndpointHandles`); a press within a
screen-pixel grab tolerance picks the nearer endpoint (`pickWallEndpoint`); a hook
runs the grab, move, and release and dispatches an undoable command. The live drag
readouts slice ([[ADR-0072-live-drag-readouts]]) then gave every live drag a pill
near the pointer, merged into the overlay at a single `??` seam in the plan
controller, computed by the pure `drag-readout.ts`.

The decision is how an opening resizes from a handle: what a jamb drag does to the
opening's width and position, how that lands as an undoable edit, how the dragged
jamb relates to the wall end, and how the width reads out without reinventing the
readout the previous slice built.

## Decision

### Two jamb handles, the opposite jamb fixed

A selected opening shows a handle at each jamb, the two points where the opening
meets the wall centerline at `center +/- along * width / 2`. Dragging a jamb moves
that jamb along the wall while the opposite jamb stays fixed, so both the width and
the center change, the way a rectangle resizes when one edge is dragged. The
alternative, a handle that resizes symmetrically about the center, was rejected: an
edge handle that also moves the opposite edge does not match what the user grabs.
The handle the user pulls is the edge that moves, and the far edge is the anchor.

### One atomic command, one undo step

Resizing from a jamb dispatches a new `resizeOpeningEdge(floorId, openingId, width,
position)` command that sets the opening's width and center together in a single
undoable step. The resize hook computes that width and position from the dragged
jamb with the shared pure `computeOpeningResize`, which holds the opposite jamb
fixed, takes the new width as the distance from the fixed jamb to the dragged jamb
and the new center as their midpoint, floors the width at a minimum, and keeps the
dragged jamb on the wall. The command applies those values the way `moveOpening`
applies a view-computed position and `resizeOpening` applies view-computed
dimensions, and `deriveOpeningGeometry` stays the authoritative clamp that keeps
any opening on its host wall. Because width and position change together,
dispatching the existing `resizeOpening` and `moveOpening` as two commands would
record two undo steps for one gesture, so a dedicated atomic command is the right
grain. The `Opening` model is unchanged; the command writes the same
width-and-position fields, not a new field.

### Geometry clamped in a pure helper, snapped to the wall end

The new width and center are computed by a pure helper so the rules are tested
without a pointer. The dragged jamb cannot cross the fixed jamb: the width is
floored at a minimum opening width, introduced as a single named constant in core.
The dragged jamb cannot leave the wall: it is clamped to the wall span. When the
dragged jamb falls within the handle's grab tolerance of the host wall's near end,
it snaps to that end so the opening sits flush against the corner. The snap is a
focused jamb-to-wall-end check using the host wall's endpoints, not the full snap
chain the wall tool runs; the common framing case is the wall end, and reusing the
whole chain here would pull in vertex and grid targets the resize does not want.
Routing the dragged jamb through the full snap chain is recorded as a future
option.

### Width readout, length only, at the third readout seam

While a jamb drags, the readout pill reads the opening's live width. Width is a
single length with no direction, so it cannot reuse the length-and-bearing
`dragReadout` from the previous slice unchanged. `drag-readout.ts` grows a sibling
`lengthReadout(anchor, lengthMm, preferences)` that formats the adaptive length
alone. The resize hook exposes the same `{ anchor, text }` readout shape the move
and endpoint drags expose, and the plan controller merges it at the existing `??`
seam as a third source. The overlay pill, its placement, and the unit preference
are all reused; no second pill or unit path enters the editor. A separate
distance-to-wall-end readout is not added, because the snap to the wall end already
signals that the jamb is flush; it is noted as a possible later addition.

### A resize hook above the footprint drag

A new `use-opening-resizing` hook mirrors `use-wall-editing`: it picks the jamb
handle on press, recomputes and previews the resize on move with the width readout,
and dispatches `resizeOpeningEdge` on release. It composes into the pointer
handlers above the opening footprint drag, so a press on a jamb handle resizes and
a press inside the footprint clear of the handles still moves. Like the wall and
opening editing hooks it is coverage-excluded glue, proven end-to-end, with the
decisions living in the pure picker and the pure resize geometry, and the command
left a thin atomic setter.

## Consequences

The width of an opening becomes a direct-manipulation edit on the canvas, framed
the same way its position already is, so a user widens a door or narrows a window
by dragging a jamb and reads the result without opening the inspector. The snap to
the wall end makes the common flush-to-corner framing a single gesture. The cost is
one pure picker, one pure geometry module, one atomic command, a length-only
readout helper, a handle-draw routine, and a coverage-excluded hook; the readout
pill, the unit source, the handle pattern, and the overlay merge seam are reused
from the wall-editing and live-readout slices. Because the opening model is
unchanged, the slice adds no migration and the resize is one undoable step. The
endpoint-angle slice (#120) is independent and inherits none of this; the free
height and sill-height handles, the full snap chain for the dragged jamb, and a
distance-to-wall-end readout are left as recorded follow-ups.
