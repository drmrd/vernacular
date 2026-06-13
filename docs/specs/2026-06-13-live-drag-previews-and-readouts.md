# Live drag readouts

Status: accepted
Issue: #118
Related ADR: ADR-0072

## Why

A drag in the plan editor moves geometry the moment the pointer moves, but it
tells the user nothing about the numbers behind the move. Drawing a wall is the
exception: while the wall tool stretches a segment to the cursor, a small pill
near the segment end reads the live length and bearing, so the user can stop at a
round number. The other drags give no such number. Moving a selection slides the
ghost across the canvas with no sense of how far. Dragging a wall endpoint
reshapes the wall with no sense of its new length. The user has to commit the
drag, read the result off a panel or a dimension, and drag again to correct.

This slice carries the wall-tool readout to the other drag gestures. The same
length-and-bearing pill that already follows a wall being drawn now follows a
selection being moved and a wall endpoint being dragged, so the number that
matters is visible while the drag is live, not after it lands.

## What changes

### Moving a selection shows how far it travelled

While a selection is being dragged, a readout pill sits next to the pointer and
reads the displacement from where the drag began: a distance and a bearing, in
the project's units. Start a move, and the pill reads the offset from the press
point to the current pointer. The ghost of the moved geometry is already drawn;
the readout puts a number on it. Release, and the pill clears.

The displacement is reported as a single length and bearing, the same form the
wall tool uses, rather than separate horizontal and vertical components. A move
reads most naturally as "this far, in this direction," and matching the wall-tool
pill keeps one readout vocabulary across the editor.

### Dragging a wall endpoint shows the wall's new length

While a wall endpoint is being dragged, a readout pill next to the dragged point
reads the length and bearing of the wall as it is being reshaped, measured from
its fixed end to the point under the cursor. The endpoint preview already redraws
the wall to the cursor; the readout names the length the user is dragging toward.
Release, and the pill clears.

When the dragged endpoint is a junction shared by more than one wall, the pill
reads the wall whose handle was grabbed. That is the wall the user aimed at, and
showing one clear length beats stacking a pill per wall at the same point.

### One readout, one position, one format

The three drags now share a single readout: the same pill component, the same
length-and-bearing format from the wall tool, anchored next to the live point of
the drag and offset clear of the cursor so it does not sit under the pointer. A
drag owns the readout while it runs; at rest, and on release, no readout shows.

## Boundaries

- No new command and no model change. The readout reports geometry that the drag
  is already previewing. It is transient view state, never stored and never
  undoable, the same standing as the ghost it annotates.
- The readout reuses the existing length-and-bearing formatter and the project's
  unit preference. It does not introduce a second number format or a second unit
  source.
- Opening drags stay as they are. Opening drag-to-resize handles, with their own
  width and distance readout, arrive in the opening-handles slice (#119), and the
  readout seam built here is what that slice reuses.
- The free-angle modifier for endpoint edits is out of scope. This slice shows
  the length of the edited wall under the existing drag behaviour; releasing an
  endpoint to a free angle is the endpoint-angle slice (#120).
- The readout is a pointer-driven affordance. A keyboard nudge of a selection
  does not raise a cursor-adjacent pill; the accessibility overlay already
  announces the change it makes.

## How it is verified

- A pure test for the displacement readout: given a drag origin and a current
  point, it reports the length and bearing between them in the wall-tool form.
- A pure test for the endpoint readout: given a wall's fixed end and the dragged
  point, it reports the length and bearing of the reshaped wall.
- Renderer or overlay tests that a move drag and an endpoint drag each raise the
  readout pill at the live point, and that both clear when the drag ends.
- An end-to-end test that drags a selection and asserts the readout pill appears
  with the expected text while dragging and clears on release.
