---
slug: decisions/ADR-0083-three-dimensional-camera-presets
title: 'ADR-0083: Camera viewpoint presets for the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, camera, presets, framing, preview]
related:
  [
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0075-three-dimensional-preview-camera-fit,
    decisions/ADR-0081-three-dimensional-opening-fill,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles:
  [
    docs/specs/2026-06-14-three-dimensional-camera-presets.md,
    docs/plans/2026-06-14-three-dimensional-camera-presets.md,
    core/scene/camera-presets.ts,
    core/scene/camera-framing.ts,
    bridge/react/fit-camera.ts,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/webgpu-scene-view.tsx,
    e2e/tests/scene-camera-presets.spec.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0083: Camera viewpoint presets for the three-dimensional preview

## Status

Accepted. Issue #165, the next item on the three-dimensional preview track after the
camera fit ([[ADR-0075-three-dimensional-preview-camera-fit]]). It builds on the
camera navigation work ([[ADR-0064-three-dimensional-camera-navigation]]) and reuses
the fit math that frames the model when the preview opens.

## Context

The preview opens on one three-quarter view and gives the user orbit, pan, zoom,
walk, and a reset back to that view. Several canonical viewpoints are tedious to
reach by dragging: a straight top-down read of the layout, a flat look at one
facade, and the view from a doorway looking into the rooms. The top-down read in
particular is almost impossible to land by eye because the orbit controls clamp
near the straight-down pole. The owner asked for named presets for these views.

The framing math already lives in `frameSceneCamera` (`core/scene/camera-framing.ts`),
which fits the model's bounding sphere to the viewport along the three-quarter
diagonal. The scene graph already carries each opening's center, host wall normal,
width, height, and sill height, and openings became selectable in the three-dimensional
view with the opening-fill slice ([[ADR-0081-three-dimensional-opening-fill]]). So the
poses can be derived from data the preview already has, without any new model fields.

The decisions are where the preset pose math lives, how the top-down view carries an
up vector the framed view never needed, how the doorway view picks its direction, and
how a preset reaches the live camera without disturbing the orbit and reset behavior.

## Decision

Keep the pose math pure in core and apply it at the render edge, the same split the
camera fit uses.

A new `core/scene/camera-presets.ts` returns a `CameraPose` for the top-down view and
the four elevations from the world bounds, and a second function returns the doorway
pose from an opening node and the bounds. Both reuse the bounding-sphere fit and the
near and far derivation from `camera-framing.ts`, so a preset fills the pane and clears
z-fighting the same way the framed view does. The shared fit helper is lifted out of
`frameSceneCamera` so both callers solve the camera distance the same way.

The presets follow the established plan-to-world map: plan x to world X, plan y to
world Z, height to world Y up, with the plan drawn screen-style y-down so plan-north is
the smaller world Z. East is world +X, west is -X, south is +Z, north is -Z. An
elevation is named for the facade it frames, so the north elevation stands on the north
(-Z) side and looks south at the north face. The top-down camera looks straight down and
sets its up vector to world -Z so plan-north sits at the top of the pane.

To carry that up vector, `CameraPose` gains an optional `up`. When it is absent the pose
keeps world +Y up, so every existing pose and the framed view are unchanged. The apply
path always sets the camera up from the pose, defaulting to world +Y, which matters
because resetting after a top-down view has to restore the upright three-quarter frame
rather than leave the camera rolled. `fitCameraToBounds` resets the up the same way.

The doorway view stands the camera at the chosen opening's center, raised to the
opening's vertical middle, and looks horizontally along the wall normal toward the
interior. The interior is the side the model's center lies on: of the two normal
directions the view takes the one pointing toward the center of the bounds. The toolbar
resolves which opening to frame, using the current selection when it is an opening and
otherwise the first opening on the active floor, and disables the doorway button when
the floor has no openings.

A new `applyCameraPose` in `bridge/react/fit-camera.ts` snaps the live camera to a pose,
and a small in-canvas component computes the requested preset pose against the live
viewport and applies it, exactly as the fit component does. Applying a preset marks the
camera user-controlled so the fit does not immediately override it, and the orbit target
stays the center of the model.

## Alternatives considered

- **Orthographic projection for the top-down and elevation views.** A true plan or
  elevation drawing is a parallel projection. Switching the preview to an orthographic
  camera for these presets would change the renderer setup, the fit math, and the
  picking path, all of which assume one perspective camera. The axis-aligned perspective
  views read correctly with only mild perspective, so the orthographic projection is
  deferred rather than taken on here.
- **Move the orbit target to the doorway standing point.** Orbiting around the standing
  point after the doorway view would feel more natural, but it means threading a live
  target out of the in-canvas apply component and back into the orbit controls. The
  preset pose itself is exact either way, so the orbit pivot stays the model center and
  the plumbing stays simple.
- **Carry the presets as scene-build data.** The poses could be precomputed in the
  framed scene. Rejected for the same reason the fit is not: the viewport is a fact of
  the live canvas, not of the scene graph, so the pose is solved at the render edge
  where the live size and field of view are known.

## Consequences

- The preview gains a top-down view, four elevations, and a doorway view as toolbar
  buttons, which closes issue #165.
- `CameraPose` carries an optional up vector, and both the apply path and the fit reset
  it, so the top-down view and the reset after it stay upright. The default keeps every
  existing pose unchanged.
- The fit helper is shared between the framed view and the presets, so core keeps one
  place that solves the camera distance.
- Orbiting straight out of the top-down view starts from the orbit controls' pole and
  the first drag can snap, and orbiting out of the doorway view turns around the model
  center rather than the standing point. Both are recorded as follow-ups; the preset
  views themselves are exact.
