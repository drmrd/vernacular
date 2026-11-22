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
    core/daylight/cells-under-walls.ts,
    tests/daylight/shell-field.test.ts,
    docs/specs/2026-11-15-daylight-and-shadow.md,
  ]
status: proposed
updated: 2026-11-22
---

# ADR-0196: Interior daylight is a plan-space field computed in core

## Status

Proposed. This record covers the core math, which is written and tested. The display rule, the
color check's bypass of the field, the engine texture, and the bounce channels are not decided
yet, and they are listed below. The record stays proposed until the window-lit rooms land and the
owner ratifies it. It amends no other record while it is proposed.

This record changes three sentences of spec section 6.8. The grid now has a margin of two cells on
every side, so a 12 by 9 m floor is 124 by 94 cells and not 120 by 90. A cell next to a room now
holds that room's visibility, so not every cell outside the rooms holds 1. Both changes fix the
strip of open sky along the inside of each wall that issue #753 reported. The third sentence said
that the offset along the surface normal keeps a thin partition from bleeding light between rooms.
That is not true of floors and ceilings, or of every wall face: with 100 mm cells, a filtered
lookup near a wall thinner than 200 mm blends its two sides, as the known limits below state.

The amendment of 2026-11-22 at the end of this record changes one more sentence of section 6.8.
It said that an interior doorway passes a share of the neighbor room's mean. It now says that the
doorway passes the neighbor room's interreflected light, which that room loses, so a hall borrows
light and never takes more than its source.

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
the floor's room outlines, snapped down to a multiple of the cell size and then moved two cells
further down on each axis (`DAYLIGHT_FIELD_MARGIN_CELLS`). The grid ends two cells past the first
cell edge at or beyond the far side of the box. So rooms of 12 by 9 m whose lower corner lies on a
multiple of the cell size take 124 columns and 94 rows. With the corner off the grid on both axes
they take 125 by 95. A 4000 by 3000 mm room at the plan origin has its grid origin at (-200, -200)
with 44 columns and 34 rows. The inner margin cell can hold a room's value under a wall that lies
on the box. The outer one always holds open sky, so a lookup that clamps to the edge of the grid
reads 1 outside it. Sky visibility is channel 3 (`SKY_VISIBILITY_CHANNEL`). The bounce channels
hold 0 for now.

### The inputs

A `DaylightRoom` has an outline, a ceiling height, a floor color, a list of apertures, and an
optional `openToSky` flag. A `DaylightAperture` has a span of two points on the room outline, a
sill and a head (both above the floor), a reveal depth, and `opensTo`, which is `'sky'` for a
window or `{ room: index }` for an interior doorway. A room with `openToSky` holds visibility 1 in
every cell.

A cell whose center lies in no room holds 1, unless one of its eight neighbors is a room cell.
Then it holds the sky visibility of one such neighbor, so a room's values reach one cell under its
walls and a filtered lookup at the foot of a wall reads the room. The room is the one whose outline
lies nearest the cell's center, and on an equal distance the one that comes first in the input.
Within that room the source is the nearest neighbor, an edge neighbor before a diagonal one. On a
tie the order is left, right, below, above, then lower left, lower right, upper left, upper right.
Only a cell whose center lies in a room is a source, never another copied cell, and only the sky
visibility is copied (`core/daylight/cells-under-walls.ts`).

An aperture may carry a `netTransmittance` from 0 to 1: the share of visible light that the
opening passes over its whole area, which includes the frame and the sash. A window that names
none passes 0.8 (`DEFAULT_WINDOW_NET_TRANSMITTANCE`). That is the net value for the opening, not a
value for the glass: single glazing passes about 0.9, and the frame, the sash, and any glazing bars
take about one tenth more. Dirt has no factor. Whether dirt and glazing bars need factors of their
own is a question for after the beta, and issue #805 tracks it. A doorway that names none passes 1
(`OPEN_DOORWAY_NET_TRANSMITTANCE`).

### The work plane and the direct term

The field is evaluated on a plane 850 mm above the floor (`DAYLIGHT_WORK_PLANE_HEIGHT_MM`). For
each cell center and each aperture of the cell's room, the solver takes the configuration factor
from a point on a horizontal plane to a rectangle on a vertical wall. It uses the closed form for
that case, with the part of the rectangle below the work plane cut off first. The rectangle is
first cut down to what the point sees through the reveal: the outer face of the opening, one
reveal depth further out, is scaled toward the foot of the point and overlapped with the inner
face.

For a window, the factor is multiplied by the window's net transmittance and by the sky's
luminance toward one direction, the mean direction of the sky in front of a vertical opening. That
direction points along the aperture's outward normal and rises by `atan(2 / pi)` above the
horizon. Plan `(x, y)` maps to world `(x, up, -y)`. The sky is a function from a direction to a
number in which 1 is the mean of the open sky. `UNIFORM_SKY` returns 1 everywhere. A sky value
below 0 or `NaN` counts as 0. A value above 1 is legal, so nothing caps it. Only a cell's final
visibility is capped.

### The room-average term

Light that bounces between the room's surfaces is one number for the whole room. The entering flux
is the sum over its apertures of a share of the opening area (width times sill-to-head height),
times the aperture's net transmittance and its weight. A window counts half its area, because it
sees only the half of its view that lies above the horizon (`VERTICAL_OPENING_SKY_SHARE`). A
doorway counts all of its area, because it sees the whole of the room on its other side
(`DOORWAY_HEMISPHERE_SHARE`). A doorway into a room that is open to the sky faces the outdoors, as
an open exterior door does, so it counts half, like a window.

The term added to every cell is the flux times the floor's reflectance, which the light from the
sky meets first, divided by the total surface area times one minus the room's mean reflectance,
which governs the later bounces. The surface area is twice the floor area plus the perimeter times
the ceiling height, plus the opening area of every doorway of another room that opens into this
one. The mean reflectance weights the floor color's luminance by the floor area,
`UNPAINTED_SURFACE_REFLECTANCE` (0.66, the luminance of the wall color `#d8d4cc`) by the walls and
the ceiling, and 0 by those doorways, because light that reaches one of them leaves the room. Such
a doorway counts its full opening area whatever its net transmittance, so a glazed door makes a
hole of its whole area in the room's balance, and the light that its glass does not pass is lost.
Windows are not holes: they keep the reflectance of the wall they sit in.

A cell's visibility is the direct term plus the room-average term, clamped at 1. A room with no
windows and no lit neighbor therefore returns 0.

### The doorway pass

A doorway's weight is the room-average term of the room it opens into, computed from that room's
sky apertures alone, times the doorway's own net transmittance. That term is also the mean
luminance of the surfaces the doorway shows, as the amendment at the end of this record derives.
The hall uses the weight in two places: in its entering flux, and in the direct term of each of
its cells, where it multiplies the cell's form factor to the doorway. The room that the doorway
opens into loses that light, because the doorway is a surface of reflectance 0 in its balance. So
a hall next to a lit room borrows light, and the lit room reads a little darker for it. Light
crosses one doorway and no more: a room's own doorways count for nothing when it is the source, so
two rooms that open only to each other stay dark. A doorway into a room that is open to the sky
weighs 1 in any direction.

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
- a net transmittance that is not a finite number from 0 to 1;
- a span of no length, and a span with an end point more than 1 mm off the room outline
  (`OUTLINE_TOLERANCE_MM`; the tolerance absorbs the rounding error of a window on an angled wall,
  and an end point a few millimetres off the wall is still refused);
- a span whose two sides are both inside, or both outside, the room (it does not lie on the
  outline). The side test probes twice the outline tolerance (2 mm) to each side of the span's
  midpoint, so a span that lies off its wall by up to the tolerance, inside or outside the room, is
  accepted with the right outside;
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
of 120 mm, at the default net transmittance of 0.8. Under a uniform sky the sky visibility over
the room has a mean of 0.036, a minimum of 0.011, and a maximum of 0.245 at the cell nearest the
window. These are the values measured by `tests/daylight/shell-field.test.ts`, which asserts only
that the mean lies between 0 and 1, that the cell nearest the window is the brightest, that every
value is finite, and that the values fall along the row from the window to the far wall. The
measured numbers are reported, not asserted. The shell has no doorway, and measured again on
2026-11-22 it gives the same three values (0.036345, 0.011247, and 0.244666).

The test room of the known limits below, 4000 by 3000 mm with one window, has a mean sky
visibility of 0.0393 on its own. With the 2000 by 3000 mm hall of
`core/daylight/doorway-test-support.ts` opening into it through a doorway 1000 mm wide and 2100
mm high, the test room's room-average term falls from 0.0107 to 0.0098 and its mean from 0.0393 to
0.0384, because the doorway takes light out of its balance. The hall's entering flux is 20524.5
square millimetres of open sky, its room-average term is 0.00074, and its mean is 0.00139. The
flux, the room-average terms, and the drop of every cell of the test room are asserted, in
`core/daylight/doorway-balance.test.ts` and `core/daylight/doorway-luminance.test.ts`. The hall's
mean was read with a throwaway probe and is reported, not asserted.

## Known limits and approximations

- The model reads bright. For a test room of 4000 by 3000 mm with one 1000 by 1200 mm window at
  the default net transmittance of 0.8, the mean is about 3.9 percent of the open sky. The standard
  average daylight factor rule of thumb gives about 2.4 percent for the same room and transmittance
  (0.8 x 1.2 x 90 / (60.4 x (1 - 0.628^2))), a factor of about 1.7. The first reflection uses the
  floor alone, where the split-flux method also counts the lower walls and adds light reflected
  from the ground. Issue #803 tracks the full method for the 1.0 milestone, with the floor and the
  lower walls as its first step. The entering flux ignores the reveal, and issue #804 tracks that
  for 1.0. Light that enters below the work plane is counted, as the split-flux method also counts
  the whole window.
- A doorway passes only the source room's interreflected light, as an even luminance. Direct
  light from the source's windows and skylights that lands on the doorway plane does not pass, and
  issue #1096 tracks it as future work. Until then a hall reads somewhat darker than it should. The
  hall of the test pair reads about 0.54 times its earlier mean (0.00139 against 0.00259). The
  earlier weight used the source's mean visibility at the work plane, which carried direct light
  that the source never lost, so the hall was brighter for the wrong reason. Light borrowed through
  a doorway also carries the source room's error, as the bullet above describes.
- A hall's share of the source's flux is bounded, as the amendment below derives. In the sweep of
  ordinary rooms in `core/daylight/doorway-flux-bound.test.ts` it peaks at 0.555, for a source of
  500 by 6000 mm with a white floor. A source of 100 by 40000 mm with a 6000 mm ceiling and a white
  floor gives its hall 0.593, and two halls along both of its long walls 0.744 together.
- With 100 mm cells, a filtered lookup on the floor or the ceiling blends across any wall thinner
  than two cells (200 mm). How much depends on where the grid falls. At the foot of a wall of
  thickness t between two rooms, the other room's share of the reading is at most 1 - t / 200, and
  it fades out over at most 100 - t / 2 mm: 43 percent over 43 mm for the default 114 mm wall, 75
  percent over 75 mm for a 50 mm wall, and none from 200 mm. The bound holds because a cell under
  a wall copies the room whose outline is nearer. Outside an exterior wall of thickness t, the
  ground at the foot of the wall can read up to 2 - t / 100 of the room's value (all of it for a
  wall under 100 mm), over at most 200 - t mm. A wall face looks the field up one cell along its
  normal, as in the lighting hook spike, but that does not keep every face clear. Where a 114 mm
  partition meets another wall, the other wall's face reads up to 43 percent of the room across
  the partition, within 43 mm of the inside corner. The outer face of an exterior wall thinner than
  100 mm reads up to 1 - t / 100 of the room's value. The window-lit rooms work (issue #789)
  chooses between a 50 mm cell and a room index for each cell, from real pictures.
- A corner sharper than a right angle, or a neck of a room narrower than one cell, can leave cells
  inside the room that hold open sky, because no room cell lies next to them. In a sweep of grid
  positions and turns, a filtered lookup read at least half open sky up to 71 mm from the tip of a
  45 degree corner and 136 mm from a 30 degree one, and the middle of a 1 m neck 80 mm wide held 1
  at one grid position in five. The window-lit rooms work (#789) decides the lookup.
- A sliver room narrower than one cell can own no cell center, and then a lookup inside it reads
  its neighbor's value. A 60 mm room open to the sky between two dark rooms owned no center at four
  grid positions in ten, and there it read 0. The window-lit rooms work (#789) decides the lookup.
- The copy step carries the sky visibility only, so a cell under a wall gets none of its room's
  bounce color. The window-lit rooms work (#789) decides the lookup before the bounce channels
  fill.
- The direct term ignores a concave room's own walls. In an L-shaped room, a cell around the inner
  corner gets light that it cannot see.
- Furniture and partial walls do not block light, and the field does not vary with height.
- A cell whose center lies exactly on a shared wall goes to the room that comes first in the input.
- A self-intersecting outline cancels its own area with no error.
- A doorway into a room that is open to the sky weighs 1 in any direction, and it keeps the
  window's factor of one half in the entering flux.
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
- The field's error is bounded but not small. For the window-lit test room above, the model reads
  about 1.7 times bright against the rule of thumb at the same net transmittance. Light borrowed
  through a doorway has been measured for the test pair above, and it reads dark until direct
  light crosses the doorway (#1096). Other rooms have not been measured against the rule of thumb.
  Anything that reads the field as a measurement needs the limits above. The reserved photo mode
  is the accuracy backstop.
- The field is built from `DaylightRoom` values only. A short adapter from the scene graph, and
  later a mapper from the plan geometry, supply them.
- The math is held by the tests in `core/daylight/` (`form-factor.test.ts`,
  `daylight-field.test.ts`, `sky-visibility.test.ts`, `room-average.test.ts`,
  `room-validation.test.ts`, `hard-inputs.test.ts`, `angled-wall.test.ts`,
  `bad-outline-and-sky.test.ts`, `sky-direction.test.ts`, `span-at-tolerance.test.ts`,
  `doorway-luminance.test.ts`, `doorway-balance.test.ts`, `doorway-flux-bound.test.ts`,
  `net-transmittance.test.ts`, `values-under-walls.test.ts`, and `field-margin.test.ts`) and by
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

## Amendment, 2026-11-22: one energy balance through a doorway

Issue #807 found two faults in the doorway pass. The doorway's entering flux kept the window's
factor of one half, so a hall got half the light its doorway sees. And the light that crossed the
doorway never left the source room, so a hall could take more flux than the room that lit it: a
source of 100 by 40000 mm under a 6000 mm ceiling, with a white floor, gave its hall 1.055 times its
own flux. The owner chose one energy balance over both rooms, and the even bounce only.

In the balance of the room it opens into, a doorway is a surface of reflectance 0. Its opening
area is added to that room's surface area and reflects nothing, so the room loses the light that
reaches it. The area is added to the room's surfaces, not cut out of the wall the doorway sits in.
The light that crosses is the source's room-average term, from its sky apertures alone, times the
doorway's opening area times its net transmittance, with a factor of 1. The hall takes that term as
the doorway's weight, as "The doorway pass" above describes.

The factor of 1 follows from the room-average model, in which the interreflected illuminance `E`
is the same on every surface of the source room:

- The balance of the source is `E * S'(1 - rho') = F * rhoFloor`, where `F` is the flux from its
  sky apertures, and `S'` and `rho'` count each doorway out of the room as area of reflectance 0.
- The mean exitance of the source's surfaces is `M = (rhoFloor * F + rho' * S' * E) / S'`.
  Putting `E * S'(1 - rho')` in place of `F * rhoFloor` gives `M = E`.
- A doorway faces a whole hemisphere of the source room, so its form factors to the source's
  surfaces sum to 1. The illuminance on the doorway plane is then `1 * M = E`, and the flux that
  crosses it is `1 * A * tau * E` for a doorway of area `A` and net transmittance `tau`. A window
  sees only the half of its hemisphere that lies above the horizon, which is why it keeps one half.

The bound comes out of the same algebra. With the source's balance written as
`S'(1 - rho') = S(1 - rho) + sum of A`, the flux that the hall takes through the doorway is
`tau * A * F * rhoFloor / (S(1 - rho) + sum of A)`. Because `S(1 - rho)` is never negative and `tau` is at most 1, that is at most
`rhoFloor * tau * F`, which is at most `F`. The bound holds for any room shape. Several doorways
out of one source share it, because every one of them adds to the same sum. Adding the doorway's
area, rather than cutting it out of the wall, is what keeps the bound unconditional: `S'(1 - rho')`
is then never less than the sum of the doorway areas. No cap or clamp is needed, and the code has
none. `core/daylight/doorway-flux-bound.test.ts` checks the closed form for the sweep of ordinary
rooms, the 100 by 40000 mm source, and two halls on each of two sources. It checks the bound alone
for 36 room shapes.

This change settles two edge cases by the literal reading of the decision:

- A doorway into a room that is open to the sky faces the outdoors, like an open exterior door,
  which the inputs already treat as a window with a net transmittance of 1. It keeps a weight of 1
  and the factor of one half.
- A glazed door, a doorway with a net transmittance below 1, makes a hole of its full opening area
  in its source's balance, though only `tau` of the light passes, and the rest is lost. A hole of
  `tau * A` would also keep the bound. The full area is the literal reading of the decision.

The record rejects two other choices:

- A factor of 1 with a clamp on the hall's flux. With the earlier weight and no hole in the
  source, a factor of 1 doubles every ratio, so the sweep of ordinary rooms would reach about 1.45
  of the source's flux and the clamp would bind in ordinary rooms. The light would also still be
  counted twice, once in the source and once in the hall.
- A view factor alone. The form factors from the doorway sum to 1, which settles the factor, but
  that does not conserve light by itself: the source still keeps the light that the hall takes.

Direct light from the source's windows and skylights that lands on the doorway plane does not
cross the doorway, and issue #1096 tracks it as future work. The figures that this amendment
changes are in "What the numbers look like" and "Known limits and approximations" above. The
tests are `core/daylight/doorway-balance.test.ts`, `core/daylight/doorway-luminance.test.ts`, and
`core/daylight/doorway-flux-bound.test.ts`.
