---
slug: decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location
title: 'ADR-0193: Sample daylight for a project with no site location'
type: decision
tags:
  [
    architecture,
    core,
    bridge,
    editor,
    lighting,
    environment,
    daylight,
    site,
    session-state,
    3d-preview,
  ]
related:
  [
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0146-environment-panel-and-session-contract,
    decisions/ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point,
    decisions/ADR-0143-environment-model-foundations,
    decisions/ADR-0139-plan-to-world-orientation,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0158-millimeter-scale-shadow-and-occlusion-constants,
    decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall,
    decisions/ADR-0205-opening-time-chosen-for-the-house,
    decisions/ADR-0204-the-main-entrance-and-the-view-from-the-front,
  ]
sourceFiles:
  [
    core/environment/daylight-site.ts,
    core/environment/daylight-site.test.ts,
    core/environment/daylight-site-location-not-finite.test.ts,
    core/environment/daylight-reference.ts,
    core/environment/environment-lighting.ts,
    core/environment/opening-instant.ts,
    core/environment/environment-state.ts,
    core/environment/opening-conditions.test.ts,
    core/scene/front-direction.ts,
    bridge/react/effective-lighting-mode.ts,
    bridge/react/use-ambient-occlusion.ts,
    bridge/react/use-front-direction.ts,
    bridge/react/scene-lighting.tsx,
    bridge/react/live-scene-view.tsx,
    bridge/react/scene-harness-view.tsx,
    editor/shell/shell-providers.tsx,
    editor/environment/environment-panel.tsx,
    app/harness-environment.ts,
    tests/architecture/opening-instant-seam.test.ts,
    e2e/tests/scene-helpers.ts,
    docs/specs/2026-11-15-daylight-and-shadow.md,
    docs/plans/2026-11-15-daylight-and-shadow.md,
  ]
status: current
updated: 2026-11-21
---

# ADR-0193: Sample daylight for a project with no site location

## Status

Current. Lands with the sample daylight change of the daylight and shadow work. It follows section
6.1 of `docs/specs/2026-11-15-daylight-and-shadow.md` and decisions 7, 8, and 15 of
`docs/plans/2026-11-15-daylight-and-shadow.md`. It amends
[[ADR-0144-solar-lighting-provider-and-sky]], [[ADR-0146-environment-panel-and-session-contract]],
[[ADR-0147-per-mode-tone-mapping]], and [[ADR-0151-ambient-occlusion-render-pipeline]], and each of
those carries an amendment dated 2026-11-16.

## Context

Realistic lighting used to need a site location. `effectiveLightingMode` returned realistic only
when `site.latLong` was set, and the solar update in `bridge/react/scene-lighting.tsx` did nothing
without one. A project with no location stayed on the schematic rig in realistic mode
([[ADR-0144-solar-lighting-provider-and-sky]]), and the Environment panel said "Realistic lighting
needs the site location" ([[ADR-0146-environment-panel-and-session-contract]]). So a user who had
not filled in the Site panel could not see daylight at all.

Sessions opened at `DEFAULT_OBSERVATION_INSTANT`, 21 June 2026 at noon, in
`core/environment/observation-time.ts`. Two places read that constant: the default environment
state and a parameter default of `SceneLighting`.

## Decision

A project with no location renders daylight at a sample site. The sun is computed by the same
`computeEnvironmentLighting` as before. Only its input changes.

### The sample place

The sample place is `DAYLIGHT_REFERENCE_PLACE` in `core/environment/daylight-reference.ts`:
latitude 40, longitude 1.86 east. The sample site uses it with a UTC offset of 0
(`SAMPLE_UTC_OFFSET_MINUTES` in `core/environment/daylight-site.ts`). It is the place where the
calibration of [[ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point]] holds
its targets. A project without a location therefore opens in the light the calibration was set for.

The longitude is 1.86 so that the clock reads solar time on the default date. `solarPosition` turns
clock time into solar time by adding the equation of time and 4 minutes for each degree of
longitude east, and by subtracting the UTC offset. At offset 0, 1.86 degrees adds 7.44 minutes,
which cancels the equation of time on 20 March 2026. A scratch computation through `solarPosition`
on 2026-11-16 put solar noon at the sample place on that date within one second of 12:00 on the
clock. At 10:30 the sun stood 44.9877 degrees up at an azimuth of 147.24 degrees, which is 32.76
degrees east of due south.

### The daylight site

`daylightSiteFor(site, front, date)` in `core/environment/daylight-site.ts` returns the site the
sun is computed for, a `DaylightSite` of `latLong`, `northBearing`, `utcOffsetMinutes`, and
`sample`. `daylightSampleOf(site)` returns the `sample` field alone, for a caller that needs only
to know whether the light is a sample. The two agree for every row of the table, and a test checks
that.

| The stored site                  | Location used    | North used                     | UTC offset                     | `sample`               |
| -------------------------------- | ---------------- | ------------------------------ | ------------------------------ | ---------------------- |
| Has `latLong` and `northBearing` | The stored one   | The stored bearing             | From the timezone, on the date | `'none'`               |
| Has `latLong`, no `northBearing` | The stored one   | 0, so plan-up is north         | From the timezone, on the date | `'none'`               |
| No `latLong`, has `northBearing` | The sample place | The stored bearing             | 0                              | `'location'`           |
| No `latLong`, no `northBearing`  | The sample place | Implied, so the front is south | 0                              | `'location-and-north'` |

The offset of a located site comes from `utcOffsetMinutesFor(site.timezone, date, longitude)`, with
the longitude estimate of [[ADR-0146-environment-panel-and-session-contract]] when the timezone is
missing. No site at all reads as the last row, and so does an empty site.

A stored location gives the true sun, even where that leaves the front in shade. The spec's reason
is that a true location must give true light, and a sun turned to flatter the entrance would be
wrong for the address the user typed. A polar site with a location keeps its true sun for every
front, and the tests check it.

A stored north bearing is kept for every front, and north is implied only in the last row. A
bearing counts as missing when it is `undefined` or not a finite number. `daylightSiteFor` and
`daylightSampleOf` both read `NaN` or an infinite bearing as no bearing, so a site with no location
and such a bearing gets the implied north and reads as `'location-and-north'`. A located site with
such a bearing uses 0, as in the second row. A bearing of exactly
0 is finite, so it is a bearing and not a gap: `{ northBearing: 0 }` keeps 0 and reads as
`'location'`. A stored bearing is kept also when it
leaves the front in shade. With a bearing of pi and a front that points plan-down, the sun at the
default instant meets the front at a cosine of -0.5948, so the front is in shade, and the bearing
stands. A bearing is something the user set, and the implied north is only a stand-in for a
missing one.

`daylightSiteFor` takes the date because the UTC offset of a real site depends on it. Daylight
saving moves the offset during the year: `Europe/London` gives 0 on 2026-03-20 and 60 on
2026-07-01. `SceneLighting` passes `observedAt.date`, so the offset is the one in force on the day
the sun is computed for. The sample place has an offset of 0 on every date.

### The front direction

`frontDirection(input)` in `core/scene/front-direction.ts` returns the direction the building
faces, as a unit vector in the y-up plan frame. Its input is the walls, rooms, and openings of a
scene graph. It returns the outward normal of the wall that hosts the widest exterior door.

- It judges floor by floor. For each floor id among the walls it runs `exteriorWalls` on that
  floor's walls, rooms, and openings, so a door on an upper floor is judged against the rooms of
  its own floor.
- It counts doors only, by `openingKindOfType(opening.type) === 'door'`. A window does not count,
  however wide. A door in a wall between two rooms is not in an exterior wall and does not count
  either.
- The result is the host wall's `outwardNormal`, not the opening's own normal, which can point into
  the room.
- Of two doors of equal width, the one whose outward direction is nearer plan-down wins, judged by
  the dot product with plan-down. Two fronts whose dot products differ by no more than 1e-9
  (`DIRECTION_TIE_TOLERANCE`) are equally near. The normals are computed from wall endpoints, so
  two walls that mirror each other can differ in the last bits. Without the tolerance, that
  rounding would pick the front where the plan means a tie.
- Of two that are equally near, the opening id that sorts first as a string wins, so `opening:10`
  comes before `opening:9`.
- With no exterior door it returns `PLAN_DOWN`, `{ x: 0, y: -1 }`. That covers a plan with no
  door, no opening, no room, or no wall, and a plan whose only door is interior.

### The implied north

In the last row of the table the bearing is `Math.atan2(front.x, -front.y)`. With it, true south
is the front. A front that points plan-down gives 0, plan-right pi/2, plan-left -pi/2, and plan-up
pi in absolute value.

At the default instant the sun then stands the same way to every front. The scratch computation
above checked this for the four fronts along the axes and for the front `(0.6, -0.8)`, each with
the sun of `computeEnvironmentLighting`. The sun was 44.9877 degrees up for each. The front took it
at a cosine of 0.5948, the side east of the front at 0.3827, and the other side and the back at
-0.3827 and -0.5948, so both are in shade.

### The lighting mode no longer tests for a location

`effectiveLightingMode(realistic)` in `bridge/react/effective-lighting-mode.ts` and
`ambientOcclusionActiveFor(realistic)` in `bridge/react/use-ambient-occlusion.ts` take the flag
alone, so a realistic request gives realistic lighting with or without a location. Spec section
6.5 listed this removal under the switch of the default mode, but sample daylight needs it, so it
lands here.

`SceneLighting` takes a new prop, `front: PlanDirection`. It computes its lighting from
`daylightSiteFor(site, front, observedAt.date)` for every site.

- The live view passes `useFrontDirection()` (`bridge/react/use-front-direction.ts`), which is
  `frontDirection` of the whole project graph from `useSceneGraph()`, not of the active floor. The
  sun stays put when the user changes floors.
- The harness view passes `frontDirection` of its fixture.

### The notice in the Environment panel

The panel in `editor/environment/environment-panel.tsx` shows this notice in realistic mode while
`daylightSampleOf(site)` is not `'none'`:

> Sample daylight. Set the location and north in the Site panel for true sun angles.

That is every site without a location: no site, an empty site, and a site with only a bearing,
also a bearing that leaves the front in shade. It is a `role="status"` paragraph, the notice
pattern of [[ADR-0146-environment-panel-and-session-contract]]. It replaces the old missing-location
notice. A located site with no timezone still shows the timezone notice, and schematic mode still
shows its own notice.

### The opening instant seam

`openingInstant({ site })` in `core/environment/opening-instant.ts` is the one function that gives
the instant a session opens at. Today it returns `DAYLIGHT_REFERENCE_INSTANT`,
`{ date: '2026-03-20', minutesSinceMidnight: 630 }`, which is 20 March 2026 at 10:30, for every
input. `DEFAULT_ENVIRONMENT_STATE.observedAt` and the default `observedAt` of `SceneLighting` both
come from it.

The old default, 21 June at noon, is gone with its constant. The architecture test
`tests/architecture/opening-instant-seam.test.ts` reads the sources of the six layers and checks
two things. No file there names `DEFAULT_OBSERVATION_INSTANT`. No file that is not a test names
`DAYLIGHT_REFERENCE_INSTANT`, except `core/environment/opening-instant.ts`,
`core/environment/daylight-reference.ts`, and the `core/index.ts` barrel.
`core/environment/environment-lighting.ts` is not an owner: its fallback sun reads the reference
through `referenceLightingInput()` (see the amendment of 2026-11-17 in
[[ADR-0158-millimeter-scale-shadow-and-occlusion-constants]]).

The function takes the site although it does not read it yet. The opening light may become stored
state later (#737), for example an instant at which a located house's front takes the sun.
`openingInstant` is the one place that decides the instant, but a rule that depends on the site
would need more than a new body for it. The live session reads the function once, when
`core/environment/environment-state.ts` loads: `DEFAULT_ENVIRONMENT_STATE` calls
`openingInstant({ site: undefined })`, and the store in
`bridge/environment/environment-session-store.ts` starts from that state. The live view always
passes the session's `observedAt` to `SceneLighting`, so the default of that prop never calls
`openingInstant` there. The `sample-daylight` harness state calls it with no site as well. Such a
rule would therefore also need the session state to be seeded for each project, from that
project's site.

### The harness state

`sample-daylight` in `app/harness-environment.ts` has the site `{}`, the instant
`openingInstant({ site: undefined })`, realistic lighting, the fixture `shell-south-window`, and
the camera pose of the `daylight-reference` state. The fixture's door is centered in its south wall
(`bridge/react/harness-fixtures.ts`), so its front is plan-down and the implied north is 0. With
the sample place, offset 0, and the reference instant, the state gets the same sun as
`daylight-reference`, which pins the reference place with north up and UTC.

Its gate checks two things: the front is sunlit, and the front shows the same sun as in the
reference state. The two states share a camera, so the comparison is direct. The gate's threshold
and readings live in its spec file under `e2e/tests/`, and this record states neither.

The gate reads two wall squares of the south-west camera view: the south face, which is the front,
and the west face. Both squares are defined once in `e2e/tests/scene-helpers.ts`, as
`SOUTH_WEST_VIEW_SOUTH_WALL` and `SOUTH_WEST_VIEW_WEST_WALL`. Other gates read them from the same
camera too. The tone curve gate in `e2e/tests/scene-tone-curve.spec.ts` renders the
`daylight-reference` state and reads `SOUTH_WEST_VIEW_SOUTH_WALL`. The daylight white gate in
`e2e/tests/scene-daylight-white.spec.ts` renders the `daylight-reference` state and reads
`SOUTH_WEST_VIEW_WEST_WALL`. The low sun gate in `e2e/tests/scene-low-sun.spec.ts` renders the
`low-sun` state and reads both squares.

## Consequences

- Realistic mode lights every project in daylight, located or not, and the panel says when the
  light is a sample.
- The lighting mode still defaults to schematic: `DEFAULT_ENVIRONMENT_STATE.mode` is `'schematic'`.
  The switch of the default is separate work (spec section 6.5).
- The plan compass and the site editor do not change. They show the stored bearing. The implied
  north exists only inside the sun computation, and the notice discloses it.
- Every session opens at 20 March 2026 at 10:30, located or not, and the panel shows that instant by
  default.
- With no stored bearing, the sample sun follows the front. Adding a door wider than the present
  front door on another exterior wall turns the implied north, and the sun with it.
- `frontDirection` runs on each change of the project graph, since `useFrontDirection` memoizes it
  on the graph alone. It runs also in schematic mode and for a located site, where the sun does not
  use its result. A review timed the pure function in Node at 0.9 ms for 25 rooms, 4.6 ms for 3
  floors of 100 rooms, 70 ms for 900 rooms on one floor, and 155 ms for 10 floors of 400 rooms. No
  frame time was measured. A tracking issue covers the cost.
- A located house whose front faces north opens with its front in shade in every session. #737
  covers a better opening instant for such a house. The true-sun rule does not change.
- Nothing is added to the document. Saved environment scenes hold a time and weather only, so they
  stay valid.

## Not decided

- The entrance. Spec section 6.1 says that `frontDirection` returns the outward direction of the
  entrance once the entrance-facing first camera (#627) adds that field. Until then it uses the
  widest exterior door. The camera and the sun are to call the same function, so the first view
  and the first light agree.
- The opening light as stored state, and the opening instant for a located house whose front faces
  away from the sun (#737).
- The switch of the default lighting mode to realistic (spec section 6.5).

## References

- `docs/specs/2026-11-15-daylight-and-shadow.md`, sections 6.1 and 8.
- `docs/plans/2026-11-15-daylight-and-shadow.md`, decisions 7, 8, and 15, and the section on
  sample daylight.
- [[ADR-0144-solar-lighting-provider-and-sky]] (the solar provider and the old fallback).
- [[ADR-0146-environment-panel-and-session-contract]] (the panel, its notices, and the timezone
  estimate).
- [[ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point]] (the reference place
  and instant).
- [[ADR-0143-environment-model-foundations]] (the stored site and observation time).
- [[ADR-0139-plan-to-world-orientation]] (the plan frame the front and the bearing live in).
- [[ADR-0147-per-mode-tone-mapping]] and [[ADR-0151-ambient-occlusion-render-pipeline]] (the
  operator and the occlusion pass that follow the lighting mode).

## Amendment 2026-11-17: a stored location that is not finite counts as missing

A stored location with a latitude or a longitude that is not a finite number now counts as
missing, in `daylightSiteFor` and in `daylightSampleOf`, as a bearing that is not finite already
does. The private `usableLatLong` in `core/environment/daylight-site.ts` states the rule, beside
`usableNorthBearing`. Such a site reads as the same site without a location: it gets the sample
place at offset 0, its stored bearing or the implied north, and the matching `sample` value. A
location at latitude 0 and longitude 0 is finite, so it is a place and not a gap.

The rule is here because the lighting fallback alone would give the wrong answer. Since the
amendment of 2026-11-17 in [[ADR-0158-millimeter-scale-shadow-and-occlusion-constants]], solar
angles that are not finite give the reference sun at the reference instant. A site with a `NaN`
latitude would then get that sun whatever time the person chose, and `daylightSampleOf` would
report `'none'`, so the panel would show no sample notice. With the rule, the site gets the sample
place at the person's time, and the panel shows the notice.

`core/environment/daylight-site-location-not-finite.test.ts` guards the rule. It checks three
locations that are not finite, each with no other field, with a bearing, and with a timezone,
against the same site without a location, in both functions. Two more tests check the sample place
and the implied north for a `NaN` latitude, and that latitude 0 and longitude 0 is kept.
`pnpm exec vitest run core/environment/daylight-site-location-not-finite.test.ts --project unit`
passed 11 tests on 2026-11-17, and `core/environment/daylight-site.test.ts` passed its 46.

## Note 2026-11-17: an exterior door is a door on an exterior run

`frontDirection` did not change, but `exteriorWalls` now lists exterior runs
([[ADR-0218-exterior-walls-follow-the-rooms-along-the-wall]]). An exterior door is a door whose
center lies on a stretch of wall with a room along one side only, and the front is the outward
normal of that run. So the front can turn in an existing project in either direction. A door that
the old midpoint test missed now counts, such as one in the long wall of a house split by a
centered partition. A door that the old test counted wrongly no longer counts: on the flush ell
floor of ADR-0218, the door from the main room into the ell stood on a wall the old test listed
whole, and with an 800 mm door added in the north wall the front turns from plan-down to plan-up.
That flip came from a probe run in the branch review against the old function from `main`, and no
committed test holds it. With no stored location or north bearing, the sample sun turns with the
front.

## Amendment (2026-11-19): the opening time chosen for the house

The time a project opens at now depends on its site and its front
([[ADR-0205-opening-time-chosen-for-the-house]]). Four passages of this record change.

- "The opening instant seam" says that `openingInstant` is the one function that gives the instant
  a session opens at. It still returns `DAYLIGHT_REFERENCE_INSTANT` for every input, located or
  not, and keeps its signature and its three callers. But the time a project opens at now comes from
  `openingConditions({ site, front })` in the same file. A site whose north is implied keeps the
  fixed instant. A site whose north is set opens at the minute nearest 10:30 at which the sun is at
  least 25 degrees up and meets the front at a cosine of at least 0.5, on 20 March, then on the
  summer solstice of its hemisphere, else at the fixed instant.
- The last paragraph of that section says that a rule that reads the site would need the session
  state to be seeded for each project. It now is. The editor shell creates the environment store
  once for each opened project, from `openingEnvironmentFor(site, sceneGraph)` in
  `core/environment/environment-state.ts` (`editor/shell/shell-providers.tsx`). The architecture
  test of the seam keeps its owners.
- The consequence "Every session opens at 20 March 2026 at 10:30, located or not" now holds only
  for a site whose north is implied, and for a front that finds no qualifying minute on either date.
- The consequence "A located house whose front faces north opens with its front in shade in every
  session" now holds only for a front that finds no qualifying minute. At latitude 40 that is a
  front within about 23 degrees of north. Other located houses open at a time when the front takes
  the sun. The true-sun rule does not change.

ADR-0205 settles one half of the "Not decided" bullet on #737: the opening instant for a located
house whose front faces away from the sun. The stored light is still open, and the pull request of
the opening light amends this record again.

## Amendment (2026-11-21): the entrance guess ranks the floor and the door family

With no door marked, the front now comes from a guessed entrance
([[ADR-0204-the-main-entrance-and-the-view-from-the-front]]). `frontDirection` returns the front of
`entranceOf`, in the same file. Four passages of this record change. The text above stays as it
was written.

- "The front direction" says that the function "returns the outward normal of the wall that hosts
  the widest exterior door". It now returns the outward normal of the exterior run that hosts the
  guessed entrance. Only the first level with an exterior door competes: the levels at or above
  grade from the lowest up, then the levels below grade from the highest down. On that level the
  widest door still wins, after the family rank of the next bullet.
- The bullet "It counts doors only ..." still holds for what counts, but the door families now rank.
  A door of the `swing` or `pivot` family comes before a door of the `slide`, `fold`, or `cased`
  family on the same level, however wide. The ties after the width are the ones this record set,
  plan-down and then the opening id, and a last tie on the floor that comes first in the walls
  follows them.
- The consequence "Adding a door wider than the present front door on another exterior wall turns
  the implied north" now holds only for a door on the same level and of the same rank as the
  present front door. A wider door on a level tried later does not turn it, and neither does a
  wider sliding, folding, or cased door beside a hinged front door. A door can also turn it without
  being wider: any door on a level tried earlier, or a hinged door on a level whose front door
  slides, folds, or is cased.
- The "Not decided" bullet "The entrance" says that until #627 `frontDirection` "uses the widest
  exterior door". The guess part of that bullet is settled by ADR-0204: the function now uses the
  guessed entrance. What stays open is the door marked by the user, and the camera and the sun
  calling the same function.

## Amendment (2026-11-21): a marked door wins over the guess

A door that the owner marks as the main entrance now sets the front
([[ADR-0204-the-main-entrance-and-the-view-from-the-front]]). Two passages of this record change,
beyond what the amendment above says.

- "The front direction" returns `PLAN_DOWN` for "a plan whose only door is interior". That holds
  only while no door is marked. A marked door, interior or not, gives the front. On an exterior run
  it is the outward normal of the run. On an interior wall it is the side that faces away from the
  center of the bounds of the wall endpoints on its floor, then the side nearer plan-down, then the
  side nearer plan-right.
- The "Not decided" bullet "The entrance" is decided. The mark is built, and it wins over the
  guess. The camera of #627 and the sun still call the same function, and the camera is the part
  that stays open.
