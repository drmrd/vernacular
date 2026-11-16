---
slug: decisions/ADR-0196-plan-space-daylight-field
title: 'ADR-0196: Interior daylight is a plan-space field computed in core'
type: decision
tags: [lighting, daylight, core, interior-light, three-dimensional, plan-geometry]
related:
  [
    decisions/ADR-0172-indirect-only-ambient-occlusion,
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0153-daylight-through-glass-role-stamp,
    decisions/ADR-0161-sky-specular-environment-map,
    decisions/ADR-0186-performance-gated-on-counts-and-reported-as-times,
  ]
sourceFiles:
  [
    core/daylight/daylight-field.ts,
    core/daylight/form-factor.ts,
    core/daylight/sky-visibility.ts,
    core/daylight/room-validation.ts,
    core/daylight/room-geometry.ts,
    core/daylight/room-average.ts,
    core/daylight/doorway-light.ts,
    tests/daylight/shell-field.test.ts,
    docs/specs/2026-11-15-daylight-and-shadow.md,
  ]
status: proposed
updated: 2026-11-16
---

# ADR-0196: Interior daylight is a plan-space field computed in core

## Status

Proposed. This record covers the core math, which is written and tested. The display rule, the
color check's bypass of the field, the engine texture, and the bounce channels are not decided
yet, and they are listed below. The record stays proposed until the window-lit rooms land and the
owner ratifies it. It amends no other record while it is proposed.

## Context

A closed room receives the whole sky today. The environment light carries no visibility, so a
room with one small window reads as bright as the exterior wall outside it.

The design for daylight and shadow (`docs/specs/2026-11-15-daylight-and-shadow.md`, sections 6.8
and 8) gives each floor one small grid in plan coordinates. For each cell the grid holds how much
sky light reaches it through the room's windows. Later it will also hold the light that bounces
from sunlit floors. Both parts use one data shape.

## Decision

Interior daylight is a plan-space field computed in `core/daylight/`. It is pure TypeScript, so it
is the same on both rendering backends and has no dependency on React or three.js.

### The data shape

`DaylightField` holds an origin and a cell size in plan millimetres, a column count and a row
count, and a `Float32Array` with four values for each cell: bounce red, bounce green, bounce
blue, and sky visibility. The data is row-major, and row 0 starts at the origin's y. The cell size
is 100 mm (`DAYLIGHT_FIELD_CELL_SIZE_MM`). The origin is the lower corner of the bounding box of
the floor's room outlines, snapped down to a multiple of the cell size. Sky visibility is channel
3 (`SKY_VISIBILITY_CHANNEL`). The bounce channels hold 0 for now.

### The inputs

A `DaylightRoom` has an outline, a ceiling height, a floor color, a list of apertures, and an
optional `openToSky` flag. A `DaylightAperture` has a span of two points on the room outline, a
sill and a head (both above the floor), a reveal depth, and `opensTo`, which is `'sky'` for a
window or `{ room: index }` for an interior doorway. A room with `openToSky` holds visibility 1 in
every cell. A cell whose center lies in no room also holds 1.

### The work plane and the direct term

The field is evaluated on a plane 850 mm above the floor (`DAYLIGHT_WORK_PLANE_HEIGHT_MM`). For
each cell center and each aperture of the cell's room, the solver takes the configuration factor
from a point on a horizontal plane to a rectangle on a vertical wall. It uses the closed form for
that case, with the part of the rectangle below the work plane cut off first. The rectangle is
first cut down to what the point sees through the reveal: the outer face of the opening, one
reveal depth further out, is scaled toward the foot of the point and overlapped with the inner
face.

For a window, the factor is multiplied by the sky's luminance toward one direction, the mean
direction of the sky in front of a vertical opening. That direction points along the aperture's
outward normal and rises by `atan(2 / pi)` above the horizon. Plan `(x, y)` maps to world
`(x, up, -y)`. The sky is a function from a direction to a number in which 1 is the mean of the
open sky. `UNIFORM_SKY` returns 1 everywhere. A sky value below 0 or `NaN` counts as 0. A value
above 1 is legal, so nothing caps it. Only a cell's final visibility is capped.

### The room-average term

Light that bounces between the room's surfaces is one number for the whole room. The entering flux
is the sum over its apertures of half the opening area (width times sill-to-head height) times the
aperture's weight. The term added to every cell is the flux times the room's mean reflectance,
divided by the total surface area times one minus that reflectance. The surface area is twice the
floor area plus the perimeter times the ceiling height. The mean reflectance weights the floor
color's luminance by the floor area and `UNPAINTED_SURFACE_REFLECTANCE` (0.66, the luminance of
the wall color `#d8d4cc`) by the rest.

A cell's visibility is the direct term plus the room-average term, clamped at 1. A room with no
windows and no lit neighbor therefore returns 0.

### The doorway pass

A doorway passes a share of the neighbor room's mean visibility, computed from that neighbor's
sky apertures alone. The doorway's weight is that mean, so a hall next to a lit room borrows
light. Light crosses one doorway and no more: a room's own doorways count for nothing when it is
the source, so two rooms that open only to each other stay dark. A doorway into a room that is
open to the sky weighs 1 in any direction.

### The cache

The form factors depend on geometry only. `createDaylightFieldSolver(rooms)` validates and
measures the rooms one time, on the first call of any method, and keeps the form factor from every
cell to every aperture of its room. Each call to `field(sky)` re-weights those numbers for the
sky it is given. `geometryPasses` reports how many times the geometry was measured, so a test can
check that a second sky costs no second pass. A caller that changes the rooms builds a new solver.

### The refusals

Bad input throws a `RangeError` whose message names the place, as "Daylight field room 2,
aperture 1: ..." with zero-based indexes. The refused kinds are:

- an outline with fewer than three points;
- a ceiling height that is not a finite number above 0;
- an outline coordinate that is not a finite number, with a message that names the room;
- a floor color channel that is not a finite number;
- a sill or head that is not a finite number, a head that is not above the sill, and a head above
  the ceiling;
- a reveal depth that is not a finite number of 0 or more;
- a span of no length, and a span with an end point more than 1 mm off the room outline
  (`OUTLINE_TOLERANCE_MM`; the tolerance absorbs the rounding error of a window on an angled wall,
  and an end point a few millimetres off the wall is still refused);
- a span whose two sides are both inside, or both outside, the room (it does not lie on the
  outline);
- a doorway that opens to its own room, and a doorway that opens to a room that does not exist.

## Why this approach and not the others

The specification weighs four ways to light an interior (its section 5, "Interior light").

- Probes rendered on the GPU would see furniture and future roofs. They are also a large amount of
  work that all comes after the scene stage, they have to render again on every scrub of the time
  of day, they leak light through 100 mm walls, and they behave differently on the two backends.
- Screen-space bounce shows color bleed near what is on screen. It cannot darken a room, because
  it does not know that a ceiling that is off screen blocks the sky. It may return later as an
  addition at the highest quality level.
- A single brightness for each room, set on its materials, has no falloff from the window and
  cannot add bounce.
- Baked light maps need unique texture coordinates on every surface and have to be baked again on
  every scrub.

A plan-space field is the largest of the four to build in total, but it is plain math, it is the
same on both backends, and it is cheap to update. Because the form factors are cached, a scrub only
re-weights them. The price is that it is analytic: furniture does not block light, and the field
does not vary with height.

## What the numbers look like

The harness shell, taken as one room, is 3880 by 2880 mm clear, with the east window and a reveal
of 120 mm. Under a uniform sky the sky visibility over the room has a mean of 0.049, a minimum of
0.018, and a maximum of 0.309 at the cell nearest the window. These are the values measured by
`tests/daylight/shell-field.test.ts`, which asserts only that the mean lies between 0 and 1, that
the cell nearest the window is the brightest, that every value is finite, and that the values
fall along the row from the window to the far wall. The measured numbers are reported, not
asserted.

## Known limits and approximations

- The model reads bright. For a test room of 4000 by 3000 mm with one 1000 by 1200 mm window, the
  mean is about 5.3 percent of the open sky. The standard average daylight factor rule of thumb
  gives about 3 percent (2.95 percent, from 1.2 x 90 / (60.4 x (1 - 0.628^2))). That figure already
  assumes glass that passes all of the light, so the glass is not a cause of the gap. Two things
  cause it. The first reflection uses the room's mean reflectance, where the split-flux method uses
  the floor's. The entering flux ignores the reveal and the part of a window that lies below the
  work plane. For a room lit by its own windows, the error against that figure is below a factor of
  2 (5.3 over 2.95 is about 1.8).
- The model has no loss in the glass. With clear double glazing, which passes about 0.8 of visible
  light, the rule of thumb gives about 2.4 percent. The missing loss is a further overestimate on
  top of the gap above.
- The doorway weight uses the neighbor's mean illuminance ratio as if it were a radiance. A hall's
  direct term is therefore too high by about one over the mean reflectance, roughly 1.6 times.
  Together with the gap above, light that a room borrows through a doorway reads about 2.9 times
  too bright (1.6 times 1.8).
- A cell whose center lies outside every room holds 1. When a room's walls do not fall on the 100
  mm grid, some cells along each wall have their center outside the room, so a strip along the
  inside of each wall reads as open sky. In the harness shell, `sampleSkyVisibility` at the plan
  point (80, 1500) returns 1, against about 0.042 at the center of the room. The lookup in the
  engine has to handle this. Issue #753 tracks it.
- The hall's entering flux stays below the source room's only while the neighbor's mean times the
  door area is below the window area. Ordinary rooms meet that, and the code does not enforce it.
- The direct term ignores a concave room's own walls. In an L-shaped room, a cell around the inner
  corner gets light that it cannot see.
- Furniture and partial walls do not block light, and the field does not vary with height.
- A cell whose center lies exactly on a shared wall goes to the room that comes first in the input.
- A self-intersecting outline cancels its own area with no error.
- A doorway into a room that is open to the sky weighs 1 in any direction.
- The single sky direction for each opening is an approximation of the cosine-weighted sky in
  front of it.

## Not decided yet

The specification puts these in the scope of this record. They wait for the window-lit rooms
change, and this record does not settle them.

- The display rule: how dark a room is shown. The field is linear, and a real room gets a few
  percent of the outdoor light, which renders close to black at exposure 1.
- The color check's bypass of the field, so that the color gates do not move.
- The engine texture and the lighting hook that reads it. The lighting hook spike is recorded at
  the end of this record. On the development Mac it passed on both backends. It settles that a
  lookup of a plan-space texture works inside the scene pass. The route of the hook, either the
  context of the scene pass or the renderer's own context node, is still to be chosen. The engine
  texture stays undecided, because the spike used a throwaway texture.
- The bounce channels. They wait for the scene stage of the refactor round, because floor bounce
  adds light and the occlusion context cannot add light.

## Will amend

A proposed record amends nothing, so these are listed and left unedited. When this record becomes
current, the amendments go into the records named here.

- ADR-0172: the occlusion context carries one more factor, the field's sky visibility.
- ADR-0156: the color check bypasses the field, with visibility 1 and bounce 0.

## Consequences

- Window-lit rooms have a tested source of numbers before any engine work starts. The lighting
  hook spike passed, so the engine side does not have to wait.
- The math has no dependency on the renderer, so both backends agree by construction.
- The field's error is bounded but not small. For a room lit by its own windows, the model reads up
  to a factor of 2 bright against the figure with lossless glass. Light borrowed through a doorway
  reads about 2.9 times bright, and real glass widens both. Anything that reads the field as a
  measurement needs the limits above. The reserved photo mode is the accuracy backstop.
- The field is built from `DaylightRoom` values only. A short adapter from the scene graph, and
  later a mapper from the plan geometry, supply them.
- The math is held by the tests in `core/daylight/` (`form-factor.test.ts`,
  `daylight-field.test.ts`, `sky-visibility.test.ts`, `room-average.test.ts`,
  `room-validation.test.ts`, `hard-inputs.test.ts`, `angled-wall.test.ts`,
  `bad-outline-and-sky.test.ts`, and `sky-direction.test.ts`) and by
  `tests/daylight/shell-field.test.ts`. The first group states closed forms and hand checks. The
  last builds the harness shell and reports its mean, minimum, and maximum, and with
  `PLOT_DAYLIGHT_FIELD=1` it writes a heat map of the room to the system's temporary folder.

## Lighting hook spike, 2026-11-15

A throwaway branch tested where a per-room daylight field can enter the lighting of the 3D view, on
three.js 0.184.0. The field was a half-float `DataTexture` (RGBA, 100 mm cells, linear filtering, no
mipmaps). Cells whose centers fall in the shell's clear rectangle (plan 60..3940 by 60..2940 mm)
held sky visibility 0.25 and a warm bounce of (0.2, 0.16, 0.11); every other cell held visibility 1
and no bounce. A fragment looked the field up by its world position, offset one cell (100 mm) along
its world normal, with plan (x, y) taken as world (x, -z).

Readings are OKLab L of square pixel regions of the frame. In the harness every variant and its
control loaded four times (two invocations of two runs each), and in the live view twice. Every load
of a variant gave the same reading to four decimals as every other load of it, so the noise band is
0.0000. WebGL 2 means the scene harness on its forced WebGL 2 backend, on the Mac's GPU. WebGPU
means two things: the same harness with the forced backend switched off (the renderer reported
`isWebGPUBackend`), and the editor's live view with a drawn room, realistic lighting, a site at 40 N
75 W, and 2026-03-20 12:00. Both WebGPU runs were on the development Mac. The Linux
software-rendering run was not made.

| Question                                        | WebGL 2 | WebGPU |
| ----------------------------------------------- | ------- | ------ |
| 1. Lookup inside the occlusion context          | Yes     | Yes    |
| 2. Lookup at the plain level, no occlusion node | Yes     | Yes    |
| 3a. Added light through `scene.environmentNode` | Yes     | Yes    |
| 3b. Added light through a custom light node     | Yes     | Yes    |

### Question 1: the lookup

The occlusion term of the scene pass context was multiplied by the field's visibility. In the
window-light state (interior camera) the interior regions went dark on both backends: the north wall
went from 0.5547 to 0.3400, the east wall beside the window from 0.5547 to 0.3375, the floor near
the east wall from 0.6276 to 0.4056, and the floor at the left of the frame from 0.6258 to 0.4051.
The window-light frame shows nothing outside except through the window, so the exterior check used
the equinox-noon state (the same shell seen from outside with its top open). There the outer south
wall (0.6825), the outer east wall (0.6372), and two lawn regions (0.5443, 0.5456) did not move at
all, while the inner faces of the north and west walls went from 0.5718 to 0.3555 and from 0.5940 to
0.4144. The WebGPU harness gave the same numbers within 0.0002. In the live view on WebGPU, the far
wall faces went from 0.5887 to 0.4314 and from 0.5845 to 0.4091, the floor from 0.6490 to 0.4770,
and both lawn regions and the sky stayed put. The live view darkens less because the faded near
walls lie over the room, and transparent materials are exempt from the occlusion context.

```ts
const offset = positionWorld.add(normalWorld.mul(CELL))
const plan = vec2(offset.x, offset.z.negate())
const uv = plan.sub(uniform(origin)).div(vec2(COLUMNS * CELL, ROWS * CELL))
const visibility = texture(field, uv, float(0)).a

scenePass.contextNode = builtinAOContext(occlusion.r.mul(visibility))
```

The code blocks in this section are sketches of the spike's code. `CELL` is the 100 mm cell size,
and `COLUMNS` and `ROWS` are the size of the field in cells.

### Question 2: the plain level

The plain level is the quality level that has no ambient occlusion pass, so a draw there has no
occlusion node in the graph. Two variants ran there, and both gave the same darkening as question 1.
The first kept a pipeline scene pass whose context held the field alone. The second dropped the
pass and set the renderer's own context node before a plain `renderer.render`. Window-light north
wall: 0.5547 to 0.3400 for both, on both backends. Live view floor: 0.6490 to 0.4770 for both. The
equinox-noon exterior regions did not move.

The scene pass does not have to stay at the plain level. `Renderer.contextNode` is a public context
that every node material reads when it builds, and a `PassNode` only merges its own context over it
during its render. Both variants and the plain control used the same frame budget: 3 render calls
and 84 draw calls in the window-light harness, 3 and 59 in the live view. The renderer context
applies to everything drawn through that renderer, so at the occlusion level the pass context must
carry the product of occlusion and field, as in question 1, because the pass context replaces the
renderer's `getAO` hook rather than combining with it.

```ts
renderer.contextNode = builtinAOContext(visibility)
renderer.render(scene, camera)
```

### Question 3: added light

Both routes added the warm bounce inside the room and nothing outside it, on both backends.
Window-light north wall: 0.5547 to 0.6468 through the environment and 0.6468 through the light node.
Floor near the east wall: 0.6276 to 0.6891 through both. Live view floor: 0.6490 to 0.6988 through
both. The equinox-noon exterior regions and the live-view lawn and sky did not move. Neither route
adds a render pass. One frame of the occlusion pipeline drew 5 render calls with or without either
route (127 draw calls in the window-light harness, 160 in equinox-noon, 90 in the live view).

The two routes differ in what they touch. Setting `scene.environmentNode` replaces the
`scene.environment` path, so the sky map has to be carried over through `pmremTexture`, and the
bounce also lands in specular reflections (the door wall read 0.6490 against 0.6468 through the
light node). The light node adds to diffuse irradiance only, but the light class has to be
registered with the renderer's node library. Both routes put the bounce into indirect diffuse light,
which the occlusion context multiplies afterwards. If one context carries both window-lit rooms and
floor bounce, the bounce would be scaled by the room's sky visibility a second time. The bounce
design has to allow for that.

```ts
// Environment route
scene.environmentNode = pmremTexture(skyMap).add(texture(field, uv, float(0)).rgb)

// Light node route
class BounceLightNode extends AnalyticLightNode {
  setup({ context }) {
    context.irradiance.addAssign(texture(field, uv, float(0)).rgb.mul(Math.PI))
  }
}
renderer.library.addLight(BounceLightNode, BounceLight)
scene.add(new BounceLight())
```

### Conclusion

Window-lit rooms can land before the scene stage. The field lookup works inside the occlusion
context on WebGL 2 and on WebGPU, adds no render pass, and reaches the plain level through the
renderer's context node without a scene pass.
