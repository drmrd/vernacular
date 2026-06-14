# Opening resize handles

Status: accepted
Issue: #119
Related ADR: ADR-0073

## Why

An opening already responds to direct manipulation in one way: select a door or
window under the Select tool, press inside its footprint, and it slides along its
host wall to wherever the pointer lands. What it does not do is resize on the
canvas. To make a door wider or a window narrower the user opens the inspector
and types a width, then looks back at the plan to judge the result. The size of
the opening is a spatial decision, so editing it through a number field and
checking the plan afterward is a detour around the thing the user is looking at.

This slice puts the width of an opening under the same direct manipulation its
position already has. A selected opening grows two small handles, one at each
jamb. Drag a handle and that jamb follows the pointer along the wall while the
opposite jamb stays put, so the opening widens or narrows in place. Drag the
handle toward the end of the wall and it snaps flush, so framing a doorway hard
against a corner is a single gesture. A readout next to the handle reads the live
width while the drag runs, so the user can stop at a round number without leaving
the canvas.

## What changes

### A selected opening shows a handle at each jamb

When exactly one opening is selected under the Select tool, a small round handle
appears at each of its two jambs, the points where the opening meets the wall on
either side. The handles sit on the wall centerline, the same line the opening is
measured along. They are the resize affordance, distinct from the footprint
itself, which still grabs the whole opening for an along-wall move. With no
opening selected, or with more than one entity selected, no handles show.

### Dragging a jamb resizes the opening from the opposite jamb

Press a jamb handle and drag it along the wall. That jamb follows the pointer
while the opposite jamb holds its position, so the opening's width and its center
both change as a rectangle resized from one edge. Drag the start-side handle and
the opening grows or shrinks toward the wall start; drag the end-side handle and
it changes toward the wall end. The edit lands as one undoable step on release,
so a single undo restores the opening's previous width and position together.

A jamb cannot cross the opposite jamb. The drag stops at a minimum opening width,
so pulling a handle past its partner pins the opening at that floor rather than
inverting it. The dragged jamb also cannot leave the wall: pushing it past the
near wall end clamps it to the end.

### The dragged jamb snaps to the wall end

When the dragged jamb comes within the handle's grab tolerance of the host wall's
end, it snaps to that end so the opening sits flush against the corner. The fixed
jamb does not move; only the dragged jamb extends to meet the wall end. This is
the common case of framing an opening tight to a wall junction, and the snap
removes the pixel-hunting the user would otherwise do to land exactly on the end.

### A width readout follows the dragged handle

While a jamb is being dragged, a readout pill sits next to the handle and reads
the opening's live width in the project's units. It is the same pill the move and
endpoint drags use, reading a length without a bearing, since the width of an
opening is a single number rather than a direction. The user drags until the
readout shows the width they want and releases. At rest, and the moment the drag
releases, no readout shows.

## Boundaries

- One new command and no model change. Resizing an opening from a jamb dispatches
  a single atomic `resizeOpeningEdge` command that recomputes the opening's width
  and position from the dragged jamb while holding the opposite jamb fixed. The
  `Opening` record keeps the width-and-position it has today; nothing new is
  stored, and one undo reverses the whole resize.
- The handles change width only, the dimension measured along the wall. Height
  and sill height stay in the inspector, where they are edited as numbers today;
  they have no along-wall handle and are out of this slice.
- The along-wall move is unchanged. Pressing inside the footprint still slides the
  opening; pressing a jamb handle resizes it. The handle grab takes priority over
  the footprint grab when the press lands on a handle, so the two gestures do not
  contend.
- The width readout reuses the readout pill and the project's unit preference
  introduced for the live drag readouts (#118). It reads a length only, with no
  bearing, and introduces no second number format or unit source. A separate
  distance-to-wall-end readout is not added; the snap to the wall end already
  signals that the jamb is flush.
- The free-angle modifier for wall endpoints is unrelated and out of scope; it is
  the endpoint-angle slice (#120). Resizing an opening moves a jamb along the
  fixed host wall, never off it.

## How it is verified

- A pure test that picks the jamb handle under a point: given a selected opening
  and a point within tolerance of a jamb, it reports that jamb, and reports none
  for a point clear of both.
- A pure test for the resize geometry: given the fixed jamb and a dragged jamb
  position along the wall, it reports the new width and center, clamped to the
  minimum width and to the wall, and snapped to the wall end within tolerance.
- A command test that `resizeOpeningEdge` holds the opposite jamb fixed, sets the
  opening's width and position from the dragged jamb, and reverses in one undo
  step.
- A pure test for the width-only readout: given an anchor and a length, it reports
  the anchor and the adaptive-length text with no bearing.
- A renderer test that the resize handles draw at the two jambs when one opening
  is selected and not otherwise.
- An end-to-end test that selects a placed opening, drags a jamb handle, and
  asserts the width readout appears while dragging, the opening's width changes,
  the jamb snaps to the wall end, and the readout clears on release.
