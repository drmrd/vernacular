# Discoverable three-dimensional camera controls

Date: 2026-06-15

## Problem

The three-dimensional preview already moves the camera several ways: a drag orbits,
a right drag pans, the wheel zooms, walk mode drives a first-person view with the W,
A, S, and D keys, and a toolbar button resets the view. None of that is visible. A
first-time viewer sees a static model and a row of mode buttons with no sign that the
canvas itself responds to a drag or a scroll, and no cursor change to say the canvas
is grabbable. The owner raised this as issue #125: there is no obvious, immediate way
to move or rotate the camera, the way a drag visibly pans the two-dimensional plan.

## Approach

Make the controls visible without changing how they work. Two small additions to the
preview pane:

- **A grab cursor on the canvas.** The pane shows a grab cursor at rest and a
  grabbing cursor while a drag is in progress, the same affordance the plan view uses
  for its pan gesture. This is the immediate "you can drag this" signal the pane is
  missing.
- **A controls hint.** A small caption in a corner of the pane lists the camera
  controls for the active mode. In orbit mode it reads as drag to orbit, right-drag
  to pan, and scroll to zoom. In walk mode it reads as drag to look and W, A, S, D to
  move. The caption does not take pointer events, so it never blocks a drag.

The hint text is derived from the active navigation mode by a pure function, so the
mapping from mode to control list is unit tested on its own. The hint is a small
presentational component that renders that list, tested through the DOM. The cursor
and the hint are placed in the preview pane, which only mounts when the hardware
renderer is available, so an end-to-end check in the hardware-GPU project confirms the
caption shows and the canvas carries the grab cursor.

Nothing about orbit, pan, zoom, walk, or reset changes. The default drag stays an
orbit. This slice only surfaces what is already there.

## Scope

In scope:

- A pure function mapping the navigation mode to its list of control descriptions,
  unit tested.
- A controls-hint component that renders the list for the active mode, tested through
  the DOM, placed over the canvas and inert to pointer events.
- The grab and grabbing cursor on the preview pane, tracking whether a drag is in
  progress.
- An end-to-end check in the hardware-GPU project that the hint shows for the active
  mode and the canvas carries the grab cursor.

## Deferred, by design

- **No new interaction.** This does not add an on-screen camera gizmo, a view cube, or
  draggable axis handles. Those are a larger interaction question and are left for a
  later pass if the hint and cursor prove not to be enough.
- **No dismissal or auto-hide.** The hint stays visible while the preview is open. A
  control to dismiss it, or a fade after first use, is deferred; it would need a piece
  of persisted view state that this slice does not introduce.
- **No change to the controls themselves.** The mouse buttons, the wheel, the walk
  keys, and the reset button keep their current behavior.
- **No keyboard discoverability for orbit mode.** Orbit mode is mouse-driven; surfacing
  keyboard equivalents for it is out of scope.

## Verification

- Unit tests on the mode-to-controls function: orbit returns the orbit, pan, and zoom
  lines; walk returns the look and move lines.
- A DOM test on the hint component: it shows the orbit lines in orbit mode and the walk
  lines in walk mode.
- An end-to-end check in the hardware-GPU project: opening the three-dimensional view
  shows the controls hint for the active mode, and the preview pane reports a grab
  cursor.
