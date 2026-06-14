---
slug: decisions/ADR-0075-three-dimensional-preview-camera-fit
title: 'ADR-0075: Aspect-aware camera fit for the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, camera, framing, viewport, preview, bug]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell,
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0057-three-dimensional-preview-as-a-view-mode,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-preview-camera-fit.md,
    docs/plans/2026-06-14-three-dimensional-preview-camera-fit.md,
    core/scene/camera-framing.ts,
    bridge/react/webgpu-scene-view.tsx,
    bridge/react/scene-harness-view.tsx,
    e2e/tests/scene-camera-fit.spec.ts,
  ]
status: current
updated: 2026-06-14
---

# ADR-0075: Aspect-aware camera fit for the three-dimensional preview

## Status

Accepted. First of the owner's three-dimensional and floor-management backlog
items (issues #121 through #127), taken up after the edit-feedback cluster (#116
through #120) closed. It corrects framing first laid down in the wall-shell slice
([[ADR-0061-three-dimensional-wall-shell]]) and carried by the camera navigation
work ([[ADR-0064-three-dimensional-camera-navigation]]).

## Context

`frameSceneCamera` derives the camera pose that frames the model when the preview
opens, when an edit reshapes the scene, and when the reset control runs. It targets
the center of the world bounds, points the camera down the (1, 1, 1) diagonal, and
sets the distance to one bounds diagonal. The live canvas and the render harness
both keep the renderer's default vertical field of view.

That distance is chosen without the field of view or the canvas aspect ratio, so it
does not fit the model to the frame. The owner saw the result as issue #123: in the
full preview the model sits small near the middle of the pane, and in split view it
is framed off to one side with the two panes looking misaligned. A measurement on a
four-wall room bears this out. In the full preview the model's projected extent
covers about a tenth of the pane height. In the slim split pane the horizontal
field of view is far tighter than the vertical, so the model spans nearly the full
width while staying tiny vertically and runs past the visible edge. The harness
frames the same way, so the committed baseline shows the same undersized model. The
scene helpers already carried a note that the framing "does not yet adapt to an
extreme narrow aspect", and the split view worked around it by always settling the
full-width canvas first.

The decision is where the fit math lives and how the live viewport reaches it.

## Decision

Fit the model to the viewport, and keep the fit math pure.

`frameSceneCamera` takes an optional viewport argument with the canvas aspect ratio
and the camera's vertical field of view in radians. When it is given, the function
keeps the center target and the (1, 1, 1) view direction and solves the camera
distance so the model's bounding sphere fits the frustum. It compares the vertical
half-angle with the horizontal half-angle that the aspect ratio implies, fits to the
smaller of the two so the sphere clears both pairs of frustum planes, and applies a
fixed margin so a thin border remains. The near and far planes stay derived from the
bounds diagonal, which keeps thin walls clear of z-fighting and stays valid across
the new distances. Without the viewport argument the function keeps its previous
behavior, which still serves the empty-scene default pose and any caller that frames
before a canvas has measured itself.

The viewport values are runtime facts of the mounted canvas, not of the model, so
they enter at the render edge rather than at scene-build time. The live preview and
the harness read the aspect ratio and the field of view from the camera and the
canvas size inside the React Three Fiber tree and reframe through the pure function.
The live preview reframes whenever the canvas size changes, so a pane resize or a
move between full and split view refits the model. Reframing still yields to the
user on the first orbit or walk and resumes on reset, unchanged from the navigation
slice.

The fit targets the bounding sphere rather than the projected silhouette of the
box. The sphere is rotation-independent, so the same simple solve holds for any
view direction, and the small margin covers the looseness of a sphere around a box.

## Alternatives considered

- **Fit at scene-build time.** Pass the aspect ratio into the scene build so the
  pose carries the fit. Rejected: the aspect ratio belongs to the canvas, not the
  scene graph, and it changes on resize without the scene changing, so the fit
  belongs at the render edge where the live size is known.
- **Fit the projected box silhouette.** Tighter than a sphere, but it must be
  recomputed for the view direction and the aspect ratio together, and the gain
  over a sphere with a small margin does not pay for the added math.
- **Widen the field of view instead of moving the camera.** Changing the field of
  view to fit distorts the three-quarter look the navigation slice settled on and
  fights the user's own field of view once they orbit. Moving the camera keeps the
  look and the lens fixed.

## Consequences

- The model fills the preview in both the full and the split panes, and a resize
  refits it. This closes the framing half of issue #123.
- The render harness baseline changes, so the three committed scene baselines are
  refreshed in this change.
- The navigation toolbar still sits above the preview canvas and wraps in the slim
  split pane, so the preview canvas top does not yet line up with the plan canvas
  top. That chrome-layout item is recorded as a follow-up and is out of scope here.
- `frameSceneCamera` keeps one pure signature with an optional viewport, so core
  stays free of any rendering dependency and the fit stays unit tested.
