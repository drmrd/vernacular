# Underlay actions menu

Date: 2026-06-15

## Problem

The underlay controls take prominent, always-on space on the plan canvas. "Load
image" is a permanent button anchored over the drawing. Next to it sits an
unlabeled "Trace underlay" checkbox. Both are occasional, per-floor setup
actions, not everyday drawing tools, yet they hold prime canvas position
alongside the select and wall tools.

The trace checkbox is also misnamed. It does not trace the image. Toggling it
adds the four corners of the underlay's footprint rectangle as snap targets for
the wall tool, nothing more. The name promises edge or feature tracing that the
control does not deliver, and there is no text saying what it does.

The owner raised these as issue #200 (de-prioritize "Load image") and issue #203
(clarify, rename, and de-prioritize the trace checkbox).

## Approach

Move every underlay control into a low-prominence launcher pinned to the bottom
of the tool rail, set apart from the drawing tools by a divider. The launcher is
a small icon with an "Underlay" label. Activating it opens a flyout next to the
rail that carries "Load image" and, once an image is placed, the per-underlay
rows that exist today: opacity, visibility, calibrate, and remove. When the
flyout is closed the rail shows only the small launcher and the canvas is clear,
so the space the always-on button used is reclaimed. The flyout follows the menu
pattern the project and export menus already use: a labeled trigger, an
expanded-state attribute, a menu role, and dismissal on Escape and on a click
outside.

Retire the canvas-anchored reference control whose only job was hosting these
controls over the plan. The underlay drawing and the calibration pointer
handling live in the underlay hook and the plan view, not in that control, so
they are untouched.

Rename and relocate the trace toggle to match what it does. It is a snap source,
not a tracer, so move it into the snap settings as an "Underlay corners" source,
off by default, with a one-line description: snap the wall tool to the four
corners of a visible underlay's footprint. The wall tool reads its footprint
corners from this snap preference instead of a separate trace-mode flag. The
function that computes the footprint corners is unchanged.

## Scope

In scope:

- A rail-pinned underlay launcher and a flyout that carries "Load image" and the
  existing per-underlay rows, with the standard menu keyboard and dismissal
  behavior.
- Removal of the always-on "Load image" button and the trace checkbox from the
  canvas, and removal of the now-empty canvas reference control.
- An "Underlay corners" snap source in the snap settings, off by default, with a
  description, driving the wall tool's footprint-corner snapping.
- Tests at each layer: the launcher and flyout through the DOM, the snap source
  driving the wall tool's snap targets, and the existing footprint-corner
  geometry staying green.

## Deferred, by design

- **No richer image tracing.** Snapping to edges or features detected inside the
  underlay image is a separate, larger feature. The renamed source is honest
  about being corner-only; edge or feature tracing is tracked on its own.
- **No change to the underlay itself.** How an image is loaded, decoded, placed,
  calibrated, or persisted does not change. This slice only relocates the
  controls.
- **No new multi-underlay management.** The flyout shows the same per-underlay
  rows the panel shows today; richer management of several underlays is out of
  scope.

## Verification

- DOM tests on the launcher and flyout: the launcher sits in the rail and is
  labeled; activating it opens the flyout; the flyout shows "Load image" and,
  with an underlay present, the per-underlay rows; Escape and an outside click
  close it; "Load image" invokes the loader.
- A test that the canvas no longer renders a "Load image" button or a trace
  checkbox.
- A test that the wall tool receives the underlay footprint corners as snap
  targets only when the "Underlay corners" source is on, and none when it is
  off.
- The footprint-corner geometry tests stay unchanged and green.
