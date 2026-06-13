# Three-Dimensional Camera Navigation

**Date:** 2026-06-12
**Status:** Accepted (slice 4 of the three-dimensional preview track)
**Scope:** The first navigation slice of the three-dimensional preview track. It
makes the live three-dimensional pane navigable: the camera orbits, pans, and
zooms, and a first-person walk mode moves through the building at eye height. It
builds against the conventions and seams pinned by the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`), in particular
the view-state ownership rule (foundation section 5.3) and the no-new-dependency
controls decision (foundation section 5.8). The decisions specific to this slice
live in ADR-0064. No lighting, color-temperature slider, selection sync, or
accessibility proxy land here; those are later slices.

This is foundation slice 5 (camera navigation) in the foundation spec's slice
map, taken now as the user-facing fourth slice. The three geometry slices before
it (the wall shell, the floor slabs and ceilings, the opening voids) built a lit
shell that the camera could only look at from a single framed pose. This slice
lets the user move.

It is the track's first slice that is view-layer glue rather than pure geometry,
so its testing shape differs from the geometry slices and is described in full in
section 5.

---

## 1. Goal

After this slice, the live three-dimensional pane is navigable through a small
toolbar over the canvas:

- **Orbit, pan, and zoom.** Dragging orbits the camera around the framed target,
  a modifier-drag or secondary-drag pans, and the wheel zooms. This is the
  default mode.
- **Walk.** A walk mode drops the camera to eye height and moves it with the
  W, A, S, and D keys on the horizontal plane while the pointer, once captured,
  aims the view. Releasing pointer capture (the Escape key) returns the cursor;
  the keys still move the camera while walk mode is active.
- **Reset to the framed view.** A reset control returns the camera to the pose
  the framing helper derives from the scene bounds, the same pose the pane opens
  with.

The camera state is per-view and session-only. It lives in the view layer, never
in the project model and never in undo history (foundation section 5.3), and it
is not persisted with autosave: reopening a project opens on the framed view, the
way the pane opens today. Selection remains the shared, persisted state it
already is; the camera is the per-view state the design specification (section
6.5) describes.

The pane already reframes its camera to the scene whenever the plan changes
(drawing the first wall frames the camera on it). That automatic framing now
yields to the user: once the user has orbited or walked, edits no longer move the
camera out from under them, and the reset control brings the framing back on
demand.

This slice ships orbit, pan, zoom, walk, and reset. The named camera presets the
foundation lists (top-down, the four elevations, from a door, from a window) and
walk-mode collision against walls are out of scope and recorded as additive
follow-ons in section 4.

## 2. What this slice inherits

These are fixed by the foundation and the earlier slices, and are not re-decided
here:

- **The framing helper** (`frameSceneCamera`, `DEFAULT_CAMERA_POSE`): bounds in, a
  `CameraPose` (position, target, near, far) out, with the fixed default pose for
  an empty or degenerate scene (foundation section 2.3). The reset control and the
  pane's initial pose both come from it; this slice adds no new framing math.
- **The framed-scene assembly** (`buildFramedScene`): build the scene, frame the
  camera on its world bounds, then light it. The pane keeps building the scene this
  way; navigation acts on the camera the pose initializes.
- **The live pane** (`WebGPUSceneView`): the React Three Fiber canvas that mounts
  the WebGPU renderer, rebuilds the scene scoped to the active floor, and applies
  the framed pose through a camera effect. The navigation controls attach to this
  pane's camera.
- **The view modes** (`plan`, `split`, `preview`): the three-dimensional pane is
  visible in `split` and `preview`. Navigation is available wherever the pane is.
- **The layer boundary** (rules.md rule 1): `engine/` is the only layer that
  imports the Three.js package; `bridge/` is the layer that touches both React
  state and Three.js scene state but does not import `three` itself. The orbit
  controls, which need a `three/examples` import, are constructed in `engine/`
  behind a plain facade; the hand-rolled walk math, which is pure vector
  arithmetic, lives in `core/`; the React glue that wires either to the live camera
  lives in `bridge/`.
- **No new dependency** (foundation section 5.8): `OrbitControls` ships with the
  existing `three` install under `three/examples/jsm/controls`. Walk mode is hand
  rolled. Nothing new is added to the dependency set, so the thirty-day cooldown
  does not gate this slice.
- World units are millimeters, with no scale factor.

## 3. Design

### 3.1 The per-view navigation state

The pane owns a small navigation state, held in the React view layer and reset on
reload:

- `mode`: `'orbit' | 'walk'`, the active navigation mode, defaulting to `orbit`.
- `userControlled`: a flag set the moment the user first orbits or walks, which
  tells the framing effect to stop reframing on edits.

The reset control clears `userControlled`, and the framing effect (section 3.5)
reapplies the framed pose on that transition, so reset reframes the camera to the
scene bounds without storing a separate signal.

This is the per-view camera state the foundation locates in the view layer
(section 5.3). It is session state: it is not written to the model, not pushed
onto the undo stack, and not persisted with autosave. The walk camera's own
position, yaw, and pitch are likewise session state, held by the walk controller
while walk mode is active.

### 3.2 The orbit controls facade in the engine

`OrbitControls` is a Three.js class, so it is constructed in the engine layer, the
only layer that imports `three`. A factory `createOrbitController(camera,
domElement)` instantiates it against the live camera and the canvas element and
returns a plain facade that hides the Three.js type from its caller:

```ts
interface OrbitController {
  setTarget(target: Vector3): void
  setEnabled(enabled: boolean): void
  update(): void
  dispose(): void
}
```

The bridge wrapper holds the facade, not an `OrbitControls` instance, so it never
imports `three`. The facade configures the common architectural-navigation case:
rotate, pan, and zoom enabled, the target set from the framed pose so orbiting
turns around the building rather than the origin. `setEnabled(false)` parks orbit
while walk mode is active. `update` reapplies the controls after the target moves,
and `dispose` detaches the controls' listeners when the pane unmounts. Detecting
that the user has grabbed the camera is left to the bridge wrapper, which owns the
canvas pointer and key listeners (section 3.4), so the facade stays a thin,
unit-testable wrapper over the controls. Damped, inertial motion is left off in
this slice and recorded as an additive follow-on (section 4).

### 3.3 The walk camera math in core

Walk mode is hand rolled (foundation section 5.8), and its movement is pure vector
arithmetic with no Three.js dependency, so it lives in `core/` beside
`frameSceneCamera`. The walk camera carries a small state and advances it from
input:

```ts
interface WalkState {
  position: Vector3 // world position, with y pinned to eye height
  yaw: number // heading about the vertical axis, radians
  pitch: number // look elevation, radians, clamped away from straight up or down
}

interface WalkInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  yawDelta: number // from pointer motion
  pitchDelta: number // from pointer motion
}

function advanceWalk(state: WalkState, input: WalkInput, dtSeconds: number): WalkState
function walkLookTarget(state: WalkState): Vector3
```

`advanceWalk` turns the held movement keys into motion on the horizontal plane
relative to the current heading, at a fixed walking speed scaled by the frame
time, so a held key moves the camera smoothly. The vertical position stays pinned
to a fixed eye height, so the walker neither climbs nor sinks (this slice has no
collision and no gravity; the walker is at a constant eye height above the floor
datum). Pointer motion turns `yawDelta` and `pitchDelta` into heading and look
changes, with pitch clamped short of straight up and straight down so the view
never flips. `walkLookTarget` projects a point in front of the walker along the
current heading and pitch, which the bridge feeds to the camera's `lookAt`.

Keeping this in core makes the navigation math deterministic and unit-testable in
Node, which matters because the rest of walk mode (pointer capture, key and
pointer event listeners, the per-frame camera update) is browser glue that the
node tests cannot reach.

### 3.4 The bridge wrappers and the camera

Two React Three Fiber components inside the canvas wire the engine facade and the
core math to the live camera:

- **The orbit wrapper** reads the camera and the canvas element from the fiber
  context, constructs the engine orbit facade on mount, sets its target from the
  framed pose, enables it only in orbit mode, marks `userControlled` on the first
  pointer interaction through a `pointerdown` listener it adds to the canvas, and
  disposes the facade on unmount.
- **The walk wrapper** is active in walk mode. It listens for the movement keys
  and, when the user clicks the canvas, requests pointer capture and reads pointer
  motion as look input. Each frame it calls `advanceWalk` and applies the result to
  the camera position and `lookAt(walkLookTarget(...))`. The movement keys act
  whenever walk mode is on; pointer capture gates only the mouse-look, so the
  keyboard half of walk mode does not depend on pointer capture being granted.
  Escape releases capture (the browser default) without leaving walk mode.

Both wrappers are React-and-Three glue that runs only under a real rendering
context, so they are coverage-excluded glue like `WebGPUSceneView` itself
(foundation section 6.3); their behavior is proven by the semantic end-to-end
tests of section 5, and the testable logic they call (the facade, the walk math)
is unit-tested directly.

Decoupling the movement keys from pointer capture is also what makes walk mode
testable end to end: pointer capture is unreliable under a headless browser, while
a key press is not, so the walk end-to-end test drives movement with the keyboard.

### 3.5 Auto-framing yields to the user

The pane today applies the framed pose to the camera whenever the pose changes,
which reframes on every edit. With interactive controls that would fight a user
who has orbited away: drawing a wall would yank the camera back to the framed
pose. The framing effect now applies the pose only while `userControlled` is
false. Before the user touches the controls the pane still auto-frames (so the
first wall a user draws still brings the camera onto it, the behavior the live
pane already has), and after the user orbits or walks the camera is theirs until
they reset. The reset control reapplies the framed pose and clears the flag.

### 3.6 The navigation toolbar

A small toolbar sits over the canvas with three controls: an orbit/walk mode
toggle and a reset-view button. The controls are ordinary focusable buttons with
accessible names and pressed state, so they are keyboard reachable and announce
their state, which the node test asserts. The toolbar is plain DOM chrome outside
the rendering canvas; it is laid out above the canvas in a column so the canvas
still fills the remaining height of the pane (the pane-fills-its-height behavior
the earlier canvas-height fix established stays intact, asserted against the pane
region, not the canvas).

The full accessible surface for the three-dimensional view (the focusable
per-entity proxy layer, the selection announcements, the color-blind-safe
highlight of foundation section 5.7) is the selection-sync slice's work, not this
one. This slice adds only the navigation toolbar's own button accessibility.

## 4. Generalizations kept additive

None of the following is built in this slice; each is recorded as the shape its
additive change takes, so a future session does not mistake the orbit-walk-reset
scope for a closed design.

- **Named camera presets** (top-down, the four elevations, from a door, from a
  window) are each a pose the framing layer derives, the axis-aligned ones from the
  scene bounds and the opening-anchored ones from an opening's position and facing.
  They are a preset list in the toolbar that sets the camera to a derived pose,
  additive against the same per-view camera state and the same framing helper this
  slice uses.
- **Walk-mode collision** against walls (foundation open question 9) is a query
  the walk controller runs before committing a step, blocking or sliding the
  movement the walk math proposes. The walk math already produces a proposed next
  position each frame, so collision is a filter on that proposal, not a rewrite of
  the movement.
- **Persisting the camera pose** with autosave (foundation open question 9) is a
  per-view persistence channel outside the undoable model and outside the file
  format's model schema, resolved here as session-only. Adding it later writes and
  restores the per-view camera state this slice already isolates in the view layer.
- **Damped, inertial motion** for orbit and a smoothed walk are a configuration on
  the orbit facade and a velocity term in the walk math, both additive to the
  controllers this slice builds.
- **Touch and gamepad navigation** are further input sources feeding the same
  orbit facade and walk input, additive at the bridge wrappers.

## 5. Testing strategy

This slice is view-layer glue, not pure geometry, so its tests are weighted
differently from the geometry slices. The deterministic logic (the walk math, the
orbit facade, the toolbar) is unit-tested and gates; the interactive camera
behavior, which only a real render shows, is covered by self-skipping semantic
end-to-end tests rather than a pixel baseline.

### 5.1 Tier one: deterministic unit tests (gating)

The red-green-blue cycles live here. These run with no rendering context:

- **The walk math** in core, in Node: `advanceWalk` moving forward, back, and
  strafing relative to heading; the vertical position staying at eye height
  regardless of the movement keys; pointer motion changing yaw and pitch with pitch
  clamped short of vertical; `walkLookTarget` pointing along the heading and pitch.
- **The orbit facade** in engine, against a real perspective camera and a DOM
  element: the factory constructing a controller, `setTarget` setting the orbit
  target, `setEnabled` toggling the controls, `onStart` invoking its listener, and
  `dispose` detaching without error.
- **The navigation toolbar** in the bridge, in the DOM test environment: the
  orbit/walk toggle and the reset button rendering as accessible buttons, the
  toggle reflecting and changing the mode, and the controls invoking their
  handlers. This is pure DOM and does not mount the rendering canvas.

This tier is deterministic and is part of the gating check chain.

### 5.2 Tier two: semantic end-to-end navigation (self-skipping)

The interactive camera behavior is proven the way the live-pane regression already
is (the two-stable-frames comparison in the `scene-webgl` Playwright project): the
test settles the canvas to a stable frame, performs a navigation gesture, settles
again, and asserts the frame changed. Two gestures are covered:

- **Orbit**: with geometry in the scene, a drag across the canvas changes the
  settled frame.
- **Walk**: switching to walk mode and pressing a movement key changes the settled
  frame. The gesture uses the keyboard, not pointer capture, for the reason section
  3.4 gives.

These run only where WebGPU is available and self-skip otherwise, like the
existing live-pane test. The R3F wrappers and the `WebGPUSceneView` integration are
the coverage-excluded glue this tier exercises.

The deterministic visual harness (`SceneHarnessView`) renders a single static
frame with no controls, so this slice does not change it and the committed pixel
baseline is not refreshed. This slice also adds no field to the scene graph, no
change to the file format, and no migration.

## 6. Out of scope

- Named camera presets (top-down, the four elevations, from a door, from a window);
  additive against the same framing helper and per-view state (section 4).
- Walk-mode collision against walls; the walker passes through walls at eye height
  in this slice (foundation open question 9, section 4).
- Persisting the camera pose with autosave; the camera is session-only this slice
  (foundation open question 9, section 4).
- Damped or inertial orbit and smoothed walk (section 4).
- Touch and gamepad navigation (section 4).
- The three-dimensional accessibility surface: the focusable per-entity proxy
  layer, selection announcements, and the color-blind-safe highlight (foundation
  section 5.7, the selection-sync slice). This slice adds only the navigation
  toolbar's button accessibility.
- The color-temperature slider, the paint material, lighting tuning, and selection
  sync (later slices).

## 7. References

- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 2.3 (the framing helper and the default pose the reset uses), 5.3
  (view-state ownership: the camera is per-view, in the view layer, never in the
  model or undo), 5.8 (the no-new-dependency controls decision: `OrbitControls`
  behind a bridge wrapper and a hand-rolled walk mode), 6.3 (what stays
  coverage-excluded glue), and the open questions on walk collision and camera
  persistence resolved here as no collision and session-only.
- Design specification `docs/specs/2026-06-01-vernacular-design.md` section 6.5
  (the two views observe one scene graph; camera state is per-view).
- ADR-0064 (this slice's decisions: the navigation state, the engine orbit facade,
  the core walk math, the bridge wrappers, and auto-framing yielding to the user).
- ADR-0045 (the framing helper, the live pane, and the visual and semantic testing
  tiers this slice extends).
- ADR-0061, ADR-0062, ADR-0063 (the wall shell, the floor slabs and ceilings, and
  the opening voids that the camera now navigates).
- ADR-0044 (the track delivery model; this is the three-dimensional preview track's
  first navigation slice).
