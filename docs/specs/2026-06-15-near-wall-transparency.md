# Near-wall transparency in the three-dimensional preview

Date: 2026-06-15

## Problem

When the camera sits outside the building and looks in, the near exterior wall fills
the view: the viewer stares at an opaque facade instead of the rooms behind it. The
owner asked for those near exterior walls to fade to roughly ninety percent
transparent so the interior is visible from outside, and to come back to solid as the
camera moves around to where they no longer block the view. This is issue #122.

## Approach

Fade an exterior wall when the camera is on its outside, so the wall stands between
the camera and the interior. Three pieces, each small and testable on its own.

First, decide which walls are exterior, in pure core. A wall has two faces, offset
from its centerline by half its thickness along the wall normal. A face is on the
outside when a point just past it lies in no room; it is on the inside when that point
lies in a room. A wall with one outside face and one inside face is an exterior wall,
and its outward normal is the direction of the outside face. A wall with a room on
both sides is an interior partition and never fades. The room interiors are the room
nodes' clear polygons, tested with the point-in-polygon helper core already has.

Second, prepare the exterior wall meshes so their transparency can be driven per wall.
The neutral material provider caches one material per surface role, shared across every
wall, so changing one would change all of them. A build-time pass clones the materials
of each exterior wall mesh into its own instances and records, on the mesh, the
wall's outward normal and a point on it in world space. Interior walls keep the shared
materials untouched.

Third, fade per frame from the camera. A small per-frame update reads the live camera
position and, for each prepared exterior wall, asks whether the camera is on the wall's
outside: the camera is outside when the vector from the wall point to the camera points
the same way as the outward normal. A wall whose outside faces the camera is between the
camera and the interior, so its cloned materials go transparent (about ninety percent,
with depth writing off so the rooms show through); otherwise they are solid. The
outside test is horizontal, so it does not depend on the camera's height.

The exterior decision and the camera-side decision are pure functions, unit tested. The
material preparation is an engine pass tested on a built scene. The per-frame wiring is
rendering glue covered by an end-to-end check in the hardware-GPU project.

## Scope

In scope:

- A pure core function that returns the exterior walls of a floor and each one's outward
  normal, from the wall nodes and the room nodes.
- A pure decision for whether the camera is on a wall's outside, given the camera
  position, a point on the wall, and the outward normal.
- An engine pass that clones the exterior wall meshes' materials and records each wall's
  outward normal and point on the mesh.
- A per-frame update that fades the prepared exterior walls that face the camera and
  restores the rest, wired into the live preview.
- An end-to-end check that orbiting to an outside view makes the near exterior wall
  transparent and that it returns to solid from the other side.

## Deferred, by design

- **The front-facing trigger only.** Walls are chosen by which side the camera is on,
  not by ray-casting which walls occlude the room the camera looks at. The occlusion
  trigger is a heavier alternative left for later if the front-facing one proves too
  blunt.
- **A binary fade.** A wall is either solid or transparent, with no gradual ramp by
  angle or distance, and one fixed transparency. A smooth ramp is a later refinement.
- **Exterior walls only.** Interior partitions stay solid so the rooms keep their walls.
  A free-standing wall with no room on either side is not faded.
- **The openings ride their host wall's geometry but keep their own meshes,** so a door
  or window body in a faded wall is not faded in this pass; fading the opening bodies
  with their wall is a follow-up.
- **No user control.** There is no toggle to turn the effect off; that is a later chrome
  question, like the controls hint and the edge overlay before it.

## Verification

- Unit tests on the exterior-walls function: a rectangular room of four walls returns
  all four as exterior with outward normals pointing away from the room; a partition
  between two rooms is not returned.
- Unit tests on the camera-side decision: a camera on the outward-normal side is on the
  outside, a camera on the other side is not.
- An engine test: after the preparation pass, an exterior wall mesh carries its own
  material instances (not the shared ones) and records its outward normal and point.
- The deterministic render harness shows the effect: with the harness camera outside the
  fixture, the near exterior walls read as transparent and the interior shows through, so
  the committed scene-shell baselines are refreshed to capture it. The harness applies the
  fade for its fixed camera, the same update the live preview runs each frame, so the
  visible output is deterministic.
- A live end-to-end check in the hardware-GPU project that orbiting the camera around the
  model changes the settled frame as different walls fade in and out, confirming the
  per-frame update is wired to the live camera.
