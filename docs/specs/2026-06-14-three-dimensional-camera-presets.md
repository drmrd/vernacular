# Three-dimensional camera presets

Date: 2026-06-14

## Problem

The three-dimensional preview opens on a single three-quarter view and lets the
user orbit, pan, zoom, walk, and reset back to that view. When someone studies a
floor plan they often want a few canonical viewpoints that the orbit controls make
fiddly to reach by hand: a straight top-down read of the layout, a flat look at one
facade, or the view from a doorway looking into the rooms. Reaching any of these by
dragging is slow and imprecise, and the top-down read in particular is almost
impossible to land by eye. This is issue #165.

These viewpoints matter more for the period houses Vernacular serves. A top-down
view reads like the plan itself, the elevations show how a facade is composed, and
standing in a doorway is how an owner pictures walking through the rooms.

## Approach

Add named camera presets to the navigation toolbar. Each preset computes a camera
pose and snaps the live camera to it, the same way the reset control already snaps
the camera back to the framed three-quarter view.

The presets are:

- **Top down.** The camera looks straight down at the center of the model, with
  plan-north toward the top of the pane, so the view reads like the two-dimensional
  plan.
- **Four elevations (North, South, East, West).** The camera looks horizontally at
  the center of the model along a cardinal axis, framing one facade flat on. Each
  elevation is named for the facade it shows.
- **From a doorway.** The camera stands in a chosen door or window at the height of
  the opening's middle and looks horizontally into the building.

The pose math is pure and lives in core, beside the existing `frameSceneCamera`. The
preset poses reuse the same bounding-sphere fit and the same near and far derivation
that the framed view uses, so a preset fills the pane the same way the reset view
does and thin walls stay clear of z-fighting. The toolbar buttons and the wiring that
applies a pose to the live camera live at the render edge in the bridge layer, which
is the only layer that can read the live canvas.

### Axis and naming conventions

The plan-to-world map (`planToWorld`) sends plan x to world X, plan y to world Z, and
height to world Y, with Y up. The plan is drawn screen-style with y increasing
downward, so plan-north (the top of the plan) is the smaller world Z. The presets
follow from that map:

- East is world +X, west is world -X, south is world +Z, north is world -Z.
- An elevation is named for the facade it frames, so the North elevation places the
  camera on the north (-Z) side looking south at the north face, and likewise for the
  other three.
- The top-down view sets the camera's up vector to world -Z so plan-north sits at the
  top of the pane.

To carry the top-down up vector, `CameraPose` gains an optional `up`. When it is
absent the pose keeps world +Y up, so every existing pose and the framed view are
unchanged. The apply path always sets the camera's up from the pose (defaulting to
world +Y), so resetting after a top-down view restores the upright three-quarter
frame rather than leaving the camera rolled.

### The doorway view

The doorway preset frames a chosen opening. The scene graph already carries each
opening's center, its host wall's normal, its width, its height, and its sill height,
so the pose is derived without new model data. The camera stands at the opening's
center, raised to the opening's vertical middle (sill height plus half the opening
height), and looks horizontally along the wall normal toward the interior. The
interior direction is the side of the wall the model's center lies on: of the two
normal directions, the preset takes the one pointing toward the center of the bounds.

The toolbar chooses which opening to frame. If the current selection is an opening,
that opening is used, which lets someone pick a specific door in the three-dimensional
view (openings became selectable there in the opening-fill slice) or in the plan and
then step into it. Otherwise the first opening on the active floor is used. When the
floor has no openings the doorway button is disabled.

## Scope

In scope:

- A pure `cameraPresetPose` (or equivalent) in core that returns the pose for the
  top-down view and the four elevations from the world bounds, fully unit tested.
- A pure doorway pose function in core that returns the pose from an opening node and
  the world bounds, fully unit tested.
- The optional `up` on `CameraPose` and the apply path setting the camera up.
- Preset buttons in the navigation toolbar, with the doorway button disabled when no
  opening is available, covered by a component test.
- The bridge wiring that resolves the doorway opening, computes the pose against the
  live viewport, and snaps the live camera, with the model still filling the pane.
- An end-to-end check in the hardware-GPU project that a preset moves the camera.

## Deferred, by design

- **Perspective, not orthographic.** The presets keep the existing perspective
  camera and only align it to an axis, so the top-down and elevation views carry a
  small amount of perspective rather than the parallel projection of a true
  architectural drawing. A dedicated orthographic projection is a larger change to the
  render pipeline and is left for later.
- **Orbit target stays the model center.** After a preset the orbit controls still
  turn around the center of the model, so orbiting away from the doorway view swings
  around the building rather than around the standing point. The preset view itself is
  exact; only the subsequent orbit pivot is simplified.
- **Top-down orbit pole.** Orbiting immediately after the top-down view starts from
  the straight-down pole, which the orbit controls treat as a singular pose, so the
  first drag can snap. The applied top-down pose is exact; this only affects the first
  orbit out of it.
- **No near-plane tuning for the doorway.** Standing in the opening can clip the jamb
  at the edge of the frame. The view into the rooms is the point and reads correctly;
  fine near-plane handling is left for later.
- **No keyboard shortcuts or a preset menu.** The presets are toolbar buttons. Hotkeys
  and a collapsed menu are a later chrome pass.

## Verification

- Pure unit tests on the preset pose functions: the top-down camera sits above the
  center looking down with the -Z up vector; each elevation sits on the named side at
  the center height looking at the center; the doorway camera stands at the opening
  center, raised to the opening middle, looking along the inward normal; the near and
  far planes track the bounds diagonal; a viewport fits the bounding sphere to the
  frame.
- A component test on the toolbar: the preset buttons render and call back with the
  right preset, and the doorway button is disabled when no opening is available.
- An end-to-end check in the hardware-GPU project: clicking a preset moves the camera,
  observed through the projected accessibility proxies shifting from the framed view.
