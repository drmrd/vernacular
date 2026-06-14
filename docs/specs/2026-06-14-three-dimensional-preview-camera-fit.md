# Three-dimensional preview camera fit

Date: 2026-06-14

## Problem

The owner reported that the three-dimensional preview does not frame the model
well. In the full preview the model sits small and floating near the middle of
the pane rather than filling it, so the view reads as "not top-aligned" with the
model "halfway down". In split view the model is framed off to one side and the
two panes look misaligned. This is issue #123.

A measurement on a four-wall room confirms the symptom. In the full preview the
model's projected extent covers roughly a tenth of the pane height, centered. In
the slim split pane the model spans nearly the full width while staying tiny
vertically, so part of it reaches past the visible edge.

## Root cause

The camera framing ignores the shape of the viewport. `frameSceneCamera` in
`core/scene/camera-framing.ts` places the camera along the (1, 1, 1) diagonal at a
fixed distance of the bounds diagonal from the target, and the live canvas keeps
the renderer's default vertical field of view. The distance is set without
reference to the field of view or to the canvas aspect ratio, so the bounding
sphere subtends only a fraction of the frustum. A wide pane leaves the model small
and centered; a narrow pane, where the horizontal field of view is much tighter
than the vertical, cannot contain the model's width, so it spills past the edge.

The render harness frames the same way against its pinned canvas, so the committed
visual baseline shows the same loose, undersized model.

## Approach

Make the framing fit the model to the viewport.

`frameSceneCamera` gains an optional viewport argument carrying the canvas aspect
ratio and the camera's vertical field of view. When it is supplied, the function
keeps the existing target (the center of the bounds) and the existing (1, 1, 1)
view direction, but it computes the camera distance so the bounding sphere fits
inside the frustum. The binding constraint is the smaller of the vertical and
horizontal half-angles, so the sphere stays inside both the top-and-bottom and the
left-and-right frustum planes whatever the aspect ratio. A small margin leaves a
thin border around the model rather than letting it touch the edge. Without the
viewport argument the function keeps its current loose behavior, which still backs
the empty-scene default pose and any caller that has no live canvas yet.

The live preview and the harness both read the aspect ratio and the field of view
from the mounted canvas and reframe through the new path. Because the live preview
reframes whenever the canvas size changes, resizing the pane or moving between
full and split view refits the model instead of leaving a stale frame. Reframing
still yields to the user once they orbit or walk, exactly as before, and the reset
control refits to the current viewport.

## Scope

In scope:

- The aspect-aware and field-of-view-aware fit in `frameSceneCamera`, fully unit
  tested as pure code.
- The live preview and the harness reading the canvas aspect ratio and field of
  view and reframing through it, including reframing on resize.
- A refreshed visual baseline showing the model filling the harness canvas.
- A live preview check that the model fills more of the pane and stays on screen
  in split view.

## Deferred, by design

- The navigation toolbar above the preview canvas pushes the canvas down a little
  in full view and, because it wraps in the slim split pane, by more in split
  view, so the preview canvas top does not line up with the plan canvas top. That
  is a chrome-layout question separate from the framing and is left for a later
  pass. This slice frames the model correctly inside whatever canvas height the
  toolbar leaves.
- No camera presets or a top-down framing option. The framing keeps the single
  three-quarter view direction. Presets remain a scoped roadmap item.
- No change to the orbit, walk, or reset behavior beyond refitting to the live
  viewport.

## Verification

- Pure unit tests on `frameSceneCamera`: with a viewport the bounding sphere fits
  inside both frustum half-angles, fills most of the limiting half-angle (so the
  model is no longer tiny), and a narrower aspect ratio pulls the camera farther
  back. The existing no-viewport tests stay green.
- The render harness visual baseline, refreshed, shows the filled model.
- A live preview end-to-end check in the hardware-GPU project confirms the model
  fills more of the pane and stays within the slim split pane.
