---
slug: decisions/ADR-0231-the-live-3d-readiness-signal-names-the-drawn-revision
title: 'ADR-0231: The live 3D readiness signal names the drawn revision'
type: decision
tags: [rendering, readiness, bridge, react-three-fiber, live-view, e2e, testing]
related:
  [
    decisions/ADR-0197-scene-renderer-lifecycle,
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
    decisions/ADR-0225-green-commits-are-proven-by-their-red-tests,
  ]
sourceFiles:
  [
    bridge/react/scene-revision.ts,
    bridge/react/drawn-frame-size.ts,
    bridge/react/live-scene-frame-signal.tsx,
    bridge/react/scene-readiness.ts,
    bridge/react/scene-readiness-boundary.tsx,
    bridge/react/webgpu-scene-view.tsx,
    e2e/tests/live-pane-frames.ts,
    e2e/tests/scene-helpers.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0231: The live 3D readiness signal names the drawn revision

## Status

Accepted on 2026-11-21 for issue #747. It replaces the first-frame flag of the live 3D pane that
ADR-0197 describes.

## Context

The live 3D pane said only one thing about its frames: `data-harness-ready` turned `true` once the
renderer of a mount had drawn its first frame. Nothing told a reader which scene that frame held,
or whether a later edit had reached the screen. Scene tests filled the gap by comparing
screenshots. They captured a frame, made an edit, and polled until the picture changed. That wait
is slow and indirect, and it cannot tell an edit that arrived from a frame drawn during a resize.
One selection test compared two frames of a blank pane and passed without seeing the room it was
meant to check.

A frame drawn during a resize is a real case. The drawing buffer and the camera aspect follow the
canvas size one step behind it, so a frame can be drawn at the old size and stretched to the new
one. The old flag counted such a frame as drawn.

## Decision

The wrapper with the test id `live-scene-canvas` carries two attributes:

- `data-scene-revision`: the revision of the scene the pane holds in this render.
- `data-drawn-revision`: the revision of the last counted frame, or `''` until the mount has drawn
  one.

`data-harness-ready` stays on the same element. It now means that the mount has drawn its first
counted frame, so `editor/shell/scene-pane.tsx` reads it unchanged.

**A frame counts only when it was drawn at the canvas's current size.** `frameMatchesCanvasSize` in
`bridge/react/drawn-frame-size.ts` accepts a frame when the CSS size is above zero, the drawing
buffer equals the CSS size times the pixel ratio, floored the way the renderer floors it, and the
camera aspect sits within `ASPECT_TOLERANCE` (1e-6) of the canvas aspect. An orthographic camera has
no aspect, so the buffer alone decides. The check reads a structural type, so the bridge still
imports nothing from three.js.

**The revision counts what the pane mounts, not what the session changes.** `useSceneRevision` in
`bridge/react/scene-revision.ts` holds a counter for each mount of the live view. The counter goes
up by one each time the view hands its canvas a framed scene object different from the last one,
and the first scene of a mount is 1. The framed scene reconciler returns the same object when
nothing drawable changed and a new one when a floor build, a paint, a model, or the edge overlay
setting changes the drawn content. So when the drawn revision equals the scene revision, the frame
on screen holds the latest scene. A remount after a view switch (ADR-0170) starts again at 1 with
the drawn revision empty, so a stale value cannot carry over from an earlier mount.

**The size check also gates `onDrawnFrame`.** `LiveSceneFrameSignal` runs the check on every frame,
after the ambient occlusion render and the color sampler. A rejected frame calls neither callback.
A counted frame calls `onDrawnFrame` each time and reports its revision once, so the state changes
once per revision and not once per frame. The `data-live-view-ready` fact "a frame was drawn since
the pipeline settled" therefore waits for a counted frame as well. The pane has one notion of a
drawn frame, and both readers use it.

**The glue stays in `webgpu-scene-view.tsx`.** `LiveSceneCanvas` calls the two hooks and passes
their values to the boundary and the signal. That file is outside unit coverage, so every rule
lives in the new modules, where unit tests run it (ADR-0225). The added glue is a few lines.

**End-to-end tests wait on the drawn revision.** `e2e/tests/live-pane-frames.ts` gives
`liveSceneRevisions`, `waitForDrawnSceneRevision`, and `waitForDrawnSceneChange`, and
`settledSceneCanvas` in `e2e/tests/scene-helpers.ts` waits for the drawn revision after its size
poll. A test that waited for an edit to arrive by comparing screenshots now waits for the drawn
revision to pass its earlier value and equal the scene revision. Screenshot comparisons that are
the assertion itself stay: a camera move, a lighting change, and a selection outline build no new
scene, so they cannot wait on the revision. Their first frame is captured after the drawn revision
has caught up.

Revisions only go up, and they may skip a number. A render that React discards can count a scene
that never commits. Unit tests may assert exact numbers. End-to-end tests compare revisions and
never assert an exact number.

## Consequences

- A test can tell that an edit is on screen without reading pixels, and a frame drawn during a
  resize no longer passes for a finished one.
- The product can read the same attributes to notice a canvas that stopped drawing, for example a
  scene revision that stays ahead of the drawn revision.
- A grade-only edit does not advance the revision. When the floor set is unchanged, the reconciler
  refreshes the ground plane in place on the cached scene, so the framed scene object is the same.
  A test that needs to see a grade change must still compare frames. No current test does.
- `waitForDrawnSceneChange` has to take its first reading after any view switch. Across a remount
  the revision restarts, and a wait that read the old mount's value could hang.
- A resize neither resets nor advances the drawn revision. Frames during the resize are rejected,
  and the next counted frame draws the revision the pane already reported.
- The scene harness keeps its own ready frame and does not run the size check yet. Adopting it
  there is separate work.

## Alternatives considered

- **The session change count.** It moves on changes the pane never redraws for, such as a
  selection, an edit to a floor that is not shown, or a tool state. A test that waited for the drawn
  frame to match it would hang on those. It would also need a new session API, where the counter
  needs nothing outside `bridge/react/`.
- **A number for each scene object, held in a weak map.** Scenes A, B, and then A again would give
  1, 2, 1, so the revision could go backwards and a wait for "later than before" would break. The
  counter gives 1, 2, 3.
- **Keeping `onDrawnFrame` ungated and gating only the revision.** The pane would then have two
  meanings of a drawn frame, and the live-view readiness fact could still settle on a frame drawn at
  the old size.
- **Logic in `webgpu-scene-view.tsx`.** The file is excluded from coverage, so a rule placed there
  could not be proven by a test.

## References

- Issue #747, and issue #829 for the stale `data-live-view-ready` value after a remount.
- ADR-0197 for the renderer lifecycle and the earlier first-frame flag, ADR-0170 for the remount on
  a view switch, and ADR-0225 for the coverage rule.
- `bridge/react/framed-scene-reconciler.ts` for when the framed scene object changes.
