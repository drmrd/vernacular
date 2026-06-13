---
slug: decisions/ADR-0064-three-dimensional-camera-navigation
title: 'ADR-0064: Camera navigation for the three-dimensional preview: orbit, walk, and reset as per-view state'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    camera,
    navigation,
    orbit-controls,
    walk-mode,
    pointer-lock,
    view-state,
    per-view,
    framing,
    bridge,
    engine,
    core,
    react-three-fiber,
    testing,
    semantic-e2e,
    playwright,
  ]
related:
  [
    decisions/ADR-0063-three-dimensional-opening-voids,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0004-three-js-r3f-webgpu,
  ]
sourceFiles:
  [
    docs/specs/2026-06-12-three-dimensional-camera-navigation.md,
    docs/plans/2026-06-12-three-dimensional-camera-navigation.md,
    core/scene/walk-camera.ts,
    engine/scene/orbit-controls.ts,
    bridge/react/orbit-camera-controls.tsx,
    bridge/react/walk-camera-controls.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/webgpu-scene-view.tsx,
    e2e/tests/scene-navigation.spec.ts,
  ]
status: current
updated: 2026-06-12
---

# ADR-0064: Camera navigation for the three-dimensional preview: orbit, walk, and reset as per-view state

## Status

Accepted, landed. This is slice 4 of the three-dimensional preview track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]) and its first
navigation slice, on top of the three geometry slices: the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]), the floor
slabs and ceilings ([[ADR-0062-three-dimensional-floor-slabs-and-ceilings]]), and
the opening voids ([[ADR-0063-three-dimensional-opening-voids]]). It is foundation
slice 5 (camera navigation). The slice specification
(`docs/specs/2026-06-12-three-dimensional-camera-navigation.md`) and the track
foundation spec are authoritative for scope; this record captures the decisions
that make the lit shell navigable.

## Context

The geometry slices built a lit shell, but the camera could only look at it from
the one pose the framing helper derives from the scene bounds. The pane reframes
on edits and otherwise sits still; there is no way to orbit around the building or
walk through it. This slice adds navigation.

It is the track's first slice that is view-layer glue rather than pure geometry.
The geometry slices were processor work tested by deterministic Node assertions on
buffer geometry. Camera navigation is React-and-Three wiring over an interactive
camera, so the decisions here are about where the camera state lives, which layer
owns the Three.js controls, and how to test interactive behavior that no Node
assertion can reach.

The foundation pinned the shape of the answer in two places. View-state ownership
(section 5.3) puts camera state in the view layer, never in the model and never in
undo. The controls decision (section 5.8) avoids a new dependency: orbit, pan, and
zoom use `OrbitControls` from the existing `three` install behind a thin bridge
wrapper, and walk mode is hand rolled. The foundation also left two open questions
to this slice: whether walk mode collides with walls, and whether the camera pose
is persisted with autosave.

## Decision

### Navigation is per-view session state in the view layer

The pane owns a small navigation state: the active mode (`orbit` or `walk`), a flag
that records the user has taken control of the camera, and a reset signal. This is
the per-view camera state the foundation locates in the view layer (section 5.3).
It is session state. It is not written to the model, not pushed onto undo, and not
persisted with autosave, so reopening a project opens on the framed view, the way
the pane opens today. This resolves the foundation's open question on persistence
as session-only, consistent with the design specification's split between shared,
persisted selection ([[ADR-0020-bridge-owned-selection-outside-undo]]) and per-view
camera state (design specification section 6.5).

### The Three.js orbit controls live in engine behind a plain facade

`OrbitControls` is a Three.js class imported from `three/examples`, and rules.md
rule 1 makes the engine layer the only importer of `three`. So the controls are
constructed in engine by a factory `createOrbitController(camera, domElement)` that
returns a plain facade (`setTarget`, `setEnabled`, `update`, `dispose`), not the
`OrbitControls` instance. The bridge wrapper holds the facade and never imports
`three`, the same boundary the wall-shell slice enforced when it moved the `Box3`
bounds out of the bridge into `engine/scene/scene-bounds.ts`. Detecting that the
user has grabbed the camera stays in the bridge wrapper, which owns the canvas
pointer and key listeners, so the facade is a thin wrapper the engine can unit-test
in isolation: a test constructs a real camera and a DOM element, sets the target,
calls `update`, and asserts the camera now looks at the target, without a rendering
context.

### The walk math is pure and lives in core

Walk mode is hand rolled (foundation section 5.8). Its movement is pure vector
arithmetic with no Three.js dependency, so it lives in `core/` beside
`frameSceneCamera`: a `WalkState` (position pinned to eye height, yaw, pitch) and
an `advanceWalk(state, input, dtSeconds)` that turns held movement keys into motion
on the horizontal plane relative to heading at a fixed walking speed, keeps the
vertical position at eye height, and turns pointer motion into yaw and pitch with
pitch clamped short of vertical. A `walkLookTarget` projects the point the camera
looks at. Keeping this in core makes the navigation math deterministic and testable
in Node, which is where the correctness lives; the browser glue around it (pointer
capture, event listeners, the per-frame camera write) carries no math.

This slice runs walk mode at a constant eye height with no collision, resolving the
foundation's open question on collision as none for now. The walker passes through
walls. Collision becomes a filter on the proposed next position the walk math
already produces, an additive change recorded in the spec.

### The movement keys are decoupled from pointer capture

In walk mode the W, A, S, and D keys move the camera whenever the mode is active;
pointer capture gates only the mouse-look. This keeps the keyboard half of walk
mode working before or without pointer capture, and it is what makes walk mode
testable end to end: pointer capture is unreliable under a headless browser, while
a key press is not, so the walk end-to-end test drives movement with the keyboard.

### Auto-framing yields to the user on first interaction

The pane applies the framed pose to the camera whenever the pose changes, which
reframes on every edit. With interactive controls that fights a user who has
orbited away. The framing effect now applies the pose only while the user has not
taken control: before the first orbit or walk the pane still auto-frames, so the
first wall a user draws still brings the camera onto it (the behavior the live-pane
test asserts), and after the user navigates the camera is theirs until they reset.
The reset control reapplies the framed pose and clears the flag. This keeps the
existing live-pane regression green rather than trading it away for interactivity.

### A small accessible toolbar carries the controls

A navigation toolbar over the canvas carries the orbit/walk toggle and the reset
button as ordinary focusable buttons with accessible names and pressed state. It is
plain DOM chrome outside the rendering canvas, laid out in a column above the
canvas so the canvas still fills the pane height the earlier canvas-height fix
established. The full three-dimensional accessibility surface (the per-entity proxy
layer, selection announcements, the color-blind-safe highlight of foundation
section 5.7) is the selection-sync slice; this slice adds only the toolbar buttons'
own accessibility.

### Testing splits along the glue boundary

The deterministic logic gates through tier-one unit tests: the walk math in core
(Node), the orbit facade in engine (against a real camera and DOM element), and the
toolbar in the bridge (DOM environment, no canvas). The interactive camera
behavior, which only a real render shows, is proven by self-skipping semantic
end-to-end tests in the `scene-webgl` Playwright project, the same two-stable-frames
comparison the live-pane regression uses: a drag changes the settled frame (orbit),
and a movement key changes it (walk). The R3F wrappers and the `WebGPUSceneView`
integration stay coverage-excluded glue, proven by that tier. The deterministic
visual harness renders a static frame with no controls, so its committed baseline
is not refreshed, and this slice adds no scene-graph field, no file-format change,
and no migration.

## Consequences

- The live three-dimensional pane is navigable: the user orbits, pans, and zooms
  around the building, walks through it at eye height, and resets to the framed
  view, all from a toolbar over the canvas.
- Camera state is per-view session state in the view layer, off the model and off
  undo, and not persisted, so a reload opens on the framed view. Persisting it
  later is an additive per-view channel.
- The Three.js controls are constructed in engine behind a plain facade, so the
  bridge wrapper stays free of `three` and the controls are unit-testable; the walk
  math is pure core and deterministic in Node.
- Walk mode has no collision this slice; the walker passes through walls. Collision
  is an additive filter on the walk math's proposed step.
- The movement keys work independently of pointer capture, which keeps walk usable
  without a captured pointer and makes it testable under a headless browser.
- Auto-framing yields to the user after the first interaction and returns on reset,
  so edits no longer yank a navigated camera and the live-pane regression stays
  green.
- The interactive behavior is proven by semantic end-to-end frame-difference tests
  rather than a pixel baseline, and the gating proof stays the deterministic unit
  tests; the static visual baseline is untouched.

## Alternatives considered

- **Hold the camera state in the model or the undo stack.** Rejected: the
  foundation puts camera state in the view layer (section 5.3) and the design
  specification makes it per-view (section 6.5). Putting it in the model would
  serialize it, make navigation undoable, and force a file-format and migration
  change for ephemeral session state.
- **Persist the camera pose with autosave.** Rejected for this slice as the
  foundation's open question: the camera is session-only, so a reload opens on the
  framed view, matching how the pane behaves today. Persistence is an additive
  per-view channel when it is wanted, and the slice isolates the state so adding it
  is local.
- **Import `OrbitControls` directly into the bridge wrapper.** Rejected: it breaks
  rule 1 (engine is the only `three` importer), the same boundary the wall-shell
  slice enforced for `Box3`. The engine facade keeps the bridge free of `three` and
  makes the controls testable without a render.
- **Add a camera-controls dependency** (a richer orbit-and-fly library). Rejected:
  the foundation chose no new dependency (section 5.8) to avoid the thirty-day
  cooldown on the navigation slices. `OrbitControls` ships with `three`, and walk
  mode is small enough to hand roll. A richer library is a separate pinned,
  cooldown-cleared decision if ever wanted.
- **Use a Three.js first-person or fly controls class for walk mode.** Rejected:
  those carry their own input model (always-moving flight, edge-of-screen look) that
  does not match WASD-plus-pointer-lock at a fixed eye height, and they would put
  the walk math behind a `three` import rather than in pure, testable core. Hand
  rolling the small amount of walk math keeps it deterministic and in core.
- **Reframe the camera on every edit even after the user navigates.** Rejected: it
  yanks a navigated camera back on each edit. Yielding auto-framing to the user on
  first interaction keeps the helpful initial framing and the live-pane regression
  while letting the user keep their view.
- **Pin a pixel baseline for the navigated frames.** Rejected: a graphics-processor
  render is not pixel-stable across drivers, and the deterministic correctness is
  the walk math and the facade, already unit-tested. The semantic frame-difference
  test proves the camera moved without a brittle baseline, as the live-pane test
  already does.

## References

- Slice specification `docs/specs/2026-06-12-three-dimensional-camera-navigation.md`.
- Implementation plan `docs/plans/2026-06-12-three-dimensional-camera-navigation.md`.
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2.3 (the framing helper), 5.3 (view-state ownership), 5.8 (the
  no-new-dependency controls decision), 6.3 (coverage-excluded glue), and the open
  questions on walk collision and camera persistence resolved here.
- [[ADR-0063-three-dimensional-opening-voids]],
  [[ADR-0062-three-dimensional-floor-slabs-and-ceilings]],
  [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the geometry
  the camera now navigates, and the engine-only-`three` boundary this slice keeps.
- [[ADR-0045-three-dimensional-render-harness-and-conventions]]: the framing helper,
  the live pane, and the semantic and visual testing tiers this slice extends.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]: the track delivery
  model; this is the track's first navigation slice.
- [[ADR-0020-bridge-owned-selection-outside-undo]]: the shared, persisted selection
  state the per-view camera state is contrasted against.
- [[ADR-0004-three-js-r3f-webgpu]]: the renderer stack and the React Three Fiber
  canvas the navigation attaches to.
