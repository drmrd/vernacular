# Two-dimensional pan and the default interaction

Status: accepted
Issue: #116
Related ADR: ADR-0070

## Why

When the editor opens, the active tool is wall drawing. A first click on the
canvas drops a wall vertex, which is a surprising default for someone who only
wanted to look around their plan. Panning the view is possible today through
middle-mouse drag or a spacebar-held drag, but neither is visible, so most
people never find them.

This slice makes looking around the plan the thing that happens by default, and
makes click-drag panning the obvious gesture, while keeping wall drawing one
deliberate click away.

## What changes

### The default tool is Select

The editor boots with the Select tool active instead of the wall tool. Drawing
a wall is now an explicit choice: pick the Wall tool, then draw. Opening the
editor and dragging the canvas pans the view rather than starting a wall.

### Drag-to-pan is the primary gesture in Select mode

While the Select tool is active, a primary-button press on the canvas resolves
into one of three outcomes based on what the pointer does next:

- A press and release that never travels past the existing click threshold is a
  click. It selects the entity under the cursor, or clears the selection on
  empty space, exactly as before.
- A drag that crosses the threshold pans the view. The plan follows the cursor.
- A drag that crosses the threshold while Shift is held draws a selection
  marquee, the behavior that a plain drag used to have. The marquee keeps its
  slice-5 semantics: on release it replaces the selection with everything fully
  inside the rectangle. It moves onto Shift unchanged; making a Shift-marquee add
  to the existing selection instead of replacing it is a separate later change.

A press that lands on an already-selected entity still begins a move of that
selection. That path is decided before this one and is unchanged.

The choice between pan and marquee is locked when the drag first crosses the
threshold, read from whether Shift is down at that moment, so a drag does not
flip between the two midway.

### Middle-mouse and spacebar panning are unchanged

Middle-button drag still pans under any tool. A spacebar-held primary drag still
pans under any tool, including in the middle of drawing a wall: hold the
spacebar, drag to reposition the plan, release, and the half-drawn wall is right
where it was. This is the spring-loaded pan the issue asks for. The existing
code already preserves the in-progress run because the pan gesture takes the
pointer before the wall tool sees it and never touches the wall-tool state; this
slice adds a test that pins that behavior so it cannot regress.

### The cursor advertises panning

In Select mode the canvas shows the open-hand (`grab`) cursor at rest and the
closed-hand (`grabbing`) cursor while a pan is in progress, the conventional
signal that the surface can be dragged. The other tools keep their crosshair.
A later slice (hover preview, issue #117) will make the resting cursor aware of
what is under it; until then the open hand is a uniform invitation to drag.

### The tools panel leads with Select

The tools panel lists Select first and gives its button a description that names
the drag-to-pan and Shift-drag-marquee gestures, so the default tool and its
primary gesture are both discoverable from the panel.

## Boundaries

- No new command and no model change. Panning is view state, and the tool choice
  is editor state; neither is undoable and neither touches the project.
- The pan math is the existing pure `panBy`; this slice does not add a second
  implementation of it.
- Inertial or animated panning is out of scope, consistent with the slice-3
  deferral.
- Touch and trackpad two-finger panning are out of scope here; this is about the
  primary-button gesture and the existing wheel zoom.

## How it is verified

- Pure and hook-level tests for the Select-mode pointer state machine: a short
  press selects, a plain drag pans, a Shift-drag marquees, the pan-versus-marquee
  choice is fixed at threshold crossing, and a press on a selected entity still
  moves it.
- A test that the default tool is Select.
- An end-to-end test that opens the editor, drags the canvas, and asserts the
  plan panned (not a wall drawn and not a marquee selection), plus a test that
  the spacebar pan in the middle of a wall run leaves the run intact.
