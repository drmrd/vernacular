---
slug: decisions/ADR-0205-opening-time-chosen-for-the-house
title: 'ADR-0205: A project opens at a time chosen for its house'
type: decision
tags: [architecture, core, bridge, editor, lighting, environment, daylight, site, session-state]
related:
  [
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
    decisions/ADR-0146-environment-panel-and-session-contract,
    decisions/ADR-0143-environment-model-foundations,
    decisions/ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point,
    decisions/ADR-0139-plan-to-world-orientation,
  ]
sourceFiles:
  [
    core/environment/opening-instant.ts,
    core/environment/environment-state.ts,
    core/environment/angle-units.ts,
    core/index.ts,
    bridge/environment/environment-session-store.ts,
    editor/shell/shell-providers.tsx,
    core/environment/opening-conditions.test.ts,
    core/environment/opening-environment.test.ts,
    bridge/environment/environment-session-store.test.ts,
    editor/shell/shell-providers-opening-light.test.tsx,
    e2e/tests/journeys/opening-time-for-the-house.spec.ts,
    e2e/journey-coverage.json,
    tests/architecture/opening-instant-seam.test.ts,
    docs/specs/2026-11-19-first-view-of-a-project.md,
    docs/plans/2026-11-19-first-view-of-a-project.md,
    docs/specs/2026-11-15-daylight-and-shadow.md,
  ]
status: current
updated: 2026-11-19
---

# ADR-0205: A project opens at a time chosen for its house

## Status

Current. Accepted on 2026-11-19 with the pull request of the opening time, the first part of #737.
It follows section 5.4 of `docs/specs/2026-11-19-first-view-of-a-project.md`, called the first-view
specification below, and its plan, `docs/plans/2026-11-19-first-view-of-a-project.md`.

This record amends two others, and each carries a dated amendment that points here.
[[ADR-0193-sample-daylight-for-a-project-with-no-site-location]] changes in its section "The
opening instant seam" and in its two consequences on the opening instant.
[[ADR-0146-environment-panel-and-session-contract]] changes because the session light is now
seeded for each project. The record also explains four edits of the daylight specification,
`docs/specs/2026-11-15-daylight-and-shadow.md`, listed under "The edits of the daylight
specification".

The pull request of the opening light, the second part of #737, extends this record with the
stored light.

## Context

Every project opened at one fixed instant: 20 March 2026 at 10:30 (`DAYLIGHT_REFERENCE_INSTANT`).
`openingInstant` returned it for every input, and the environment store of the editor shell
started from `DEFAULT_ENVIRONMENT_STATE`, which reads that instant once when its module loads.

For a site whose north is implied, that instant works. Sample daylight turns the sun to the front,
so the front takes sun at a cosine of 0.5948
([[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]). For a site whose north is set,
the true sun applies. A front that faces away from the sun at 10:30 then opens in shade. The
first-view specification counts the reach at the sample place: at the fixed instant, a front takes
a cosine of 0.5 or more only when it faces within 45 degrees of the sun, which is 90 of 360
directions. Half of all fronts get no sun at all.

The owner asked, "With no stored light and a north set, when should a project open?" He answered
"A time chosen for the house (Recommended)" on 18 November 2026 (answer 5 of the table "Decisions
of the owner" in the first-view specification).

## Decision

### The rule

`openingConditions({ site, front })` in `core/environment/opening-instant.ts` returns the instant
and the cloud cover a project opens at.

1. A site whose north is implied opens at the fixed instant. `daylightSiteFor` reports such a site
   as `'location-and-north'`: no site, an empty site, or a site with neither a usable location nor
   a usable bearing. Sample daylight already turns its sun to the front.
2. Any other site opens at a time chosen for the house. That covers a real location, and also the
   sample place with a stored bearing (`'location'` in ADR-0193).

For the second case:

- The scan tries 20 March 2026 first. If no minute of that date qualifies, it tries the summer
  solstice of the site's hemisphere: 21 June 2026 at latitude 0 or more, 21 December 2026 below 0.
  If no minute of that date qualifies either, the fixed instant applies.
- For each date it resolves `daylightSiteFor(site, front, date)` once. That gives the place, the
  north bearing, and the UTC offset in force on that date.
- A minute qualifies when the sun is at least 25 degrees up and the unit vector toward the sun has
  a dot product of at least 0.5 with the front's outward normal laid in the ground plane. The
  vector toward the sun is `sunWorldDirection(solarPosition(...), northBearing)`. The normal in the
  world is `(front.x, 0, -front.y)`, since plan north is world -Z
  ([[ADR-0139-plan-to-world-orientation]]).
- The scan walks out from 10:30 in steps of one minute, within the civil date, and takes the
  first minute that qualifies. So it takes the qualifying minute nearest 10:30. Of two minutes
  equally near, the earlier wins: `minutesAtOffset` lists the earlier one first. There is no wrap
  past midnight.
- The cloud cover is `DEFAULT_CLOUD_COVER`, a clear sky.

A front that already qualifies at 10:30 opens at 10:30, like a project whose north is implied.
The time moves only as far as the house needs.

`sunLightsFront`, `nearestQualifyingMinute`, `datesToTry`, `firstQualifyingInstant`, and
`northIsImplied` are the private steps of the rule, in the same file. The rule reads the sun
height in degrees through `toDegrees` in `core/environment/angle-units.ts`.

### The seed, one time at open

The editor shell seeds the light on screen when a project opens. `SessionStateProviders` in
`editor/shell/shell-providers.tsx` creates the environment store in a state initializer:
`createEnvironmentSessionStore(openingEnvironmentFor(site, sceneGraph))`, with the site of the
project and the scene graph of the whole project. `openingEnvironmentFor` in
`core/environment/environment-state.ts` takes the front from `frontDirection` and turns the
conditions into an `EnvironmentState` through `environmentStateOpenedWith`. The mode and the color
check keep their defaults, as when a saved scene is applied.

`createEnvironmentSessionStore` takes the start state as an optional parameter, and with none it
starts from `DEFAULT_ENVIRONMENT_STATE` as before.

The editor shell remounts for each new session (`app/app.tsx` keys the subtree on the session). So
each opened project gets its own seed. While the project stays open, a later edit of the site or of
the plan does not move the light on screen. Only the controls of the Environment panel move it.

### What is the owner's, what is a working assumption, and what is open

The owner's choice is answer 5, "A time chosen for the house (Recommended)", with what that option
stated: a sun at least 25 degrees up, a cosine of at least 0.5 on the front, 20 March, then
midsummer.

The rest are working assumptions of the first-view specification, called "calls" in its section
4.2. The owner did not take them, and he or a reviewer can change them without reopening his
answer.

- Call 9: the light on screen is seeded once when a project opens, and later edits do not move it.
- Call 10: a site whose north is implied keeps the fixed instant. The scan steps one minute, the
  step of the time slider. Of two qualifying minutes equally near 10:30, the earlier wins. The sky
  is clear.
- Call 18: the exact reading of the cosine, the three-dimensional sun vector against the front's
  normal in the ground plane. It is the cosine of the sample daylight gate in section 6.9 of the
  daylight specification.
- Call 21: midsummer is the summer solstice of the site's hemisphere, and the fixed instant is the
  last fallback.
- Call 27: `openingInstant` keeps its signature and returns the fixed instant for every input.
  Only `openingConditions` reads the front.

One question is open for the owner: open question 2 of the first-view specification. Does the
light on screen follow a change of the site or the entrance while the user has not touched the
light? This pull request builds the recommended answer, "No": the light is seeded once, and a new
location shows its chosen time at the next open. The other answer, "Yes, until the user first moves
a light control", would change one test, the first case of
`editor/shell/shell-providers-opening-light.test.tsx`, and add one behavior.

### The edits of the daylight specification

Section 8 of the first-view specification gives these edits of
`docs/specs/2026-11-15-daylight-and-shadow.md` to this record:

- Call 4 in its section 4.2. It said that a located site opens at 10:30 on the same date. It now
  says that a site whose north is set opens at the time chosen for the house, and a site with an
  implied north at the fixed instant.
- Call 27 in its section 4.2. It said that a stored or computed light could replace the opening
  instant without touching the callers. It now says that `openingInstant` keeps the fixed instant
  for its callers, and that the shell seeds the light from `openingConditions` once for each
  opened project.
- The sentence in its section 6.1 that ended "and no caller changes". It now says that
  `openingInstant` keeps the fixed instant and its callers, that `openingConditions` gives the
  opening time, and that the shell seeds the store from it.
- The bullet in its section 6.1 on a located house whose front faces north. It said that such a
  house opens in shade in every session. It now says that a located house opens at a time when its
  front takes the sun, where one exists, and that a front near north has none.

The section 8 row for call 4 also names the stored light. This pull request does not build it, so
the edited call leaves it out. The pull request of the opening light adds it.

## Consequences

- A project with a site location, or with a stored north bearing, opens at the time chosen for its
  house, and the Environment panel shows that time. A project with no site opens at 20 March, 10:30,
  as before.
- In the default schematic style nothing else changes on screen, because the sun update does
  nothing there. In realistic mode the front of such a house opens in sun where the rule finds a
  minute.
- Reach at the sample place, from the first-view specification: the scan on 20 March reaches 247 of
  360 front directions, and the solstice adds 66. The 47 left, fronts within about 23 degrees of
  north, open in shade at the fixed instant. For a located site the times are civil times. They
  shift with the longitude and with summer time, and the reach does not, because the scan covers
  the whole day.
- `openingInstant` keeps its signature and its three callers: `DEFAULT_ENVIRONMENT_STATE` in
  `core/environment/environment-state.ts`, the `sample-daylight` state in
  `app/harness-environment.ts`, and the parameter default of `SceneLighting` in
  `bridge/react/scene-lighting.tsx`. `openingConditions` reads it too, for the fallback. The architecture test
  `tests/architecture/opening-instant-seam.test.ts` keeps its list of owners.
- No scene baseline moves. Every scene harness state pins its own `observedAt` or calls
  `openingInstant`, which stays fixed, and no harness code changed. The only live-view baseline,
  `live-view-top-down-webgpu`, draws a project with no site. Its north is implied, so it opens at
  the fixed instant. No file under `editor/environment/` changed, so the story baselines of the
  Environment panel stay too.
- Every opened project now computes its front once, when it opens, also when the north is implied.
  #772 asks to compute the front only when a light reads it, and it gets a comment when this lands.
- The scan runs once for each opened project, over at most two dates of 1440 minutes each. It does
  not run for each frame. Nobody measured how long it takes.
- Several chosen minutes sit just above the cosine threshold, near 0.5001. A later change to
  `solarPosition` can move them, and the tests then fail for a good reason.

## Options not taken

- Keep the fixed instant for every project. It needs no new code, but under a set north half of all
  fronts at the sample place open with no sun at all.
- Turn the sun to the front for a site whose north is set, as sample daylight does for an implied
  north. Every front would open in sun, but a true location must give true light, and the daylight
  specification keeps that rule. A sun turned to flatter the house would be wrong for the address
  the user typed.
- Give `openingInstant` itself the rule. One function would decide the opening light, but it takes
  no front, and each of its three callers would have to pass one. `DEFAULT_ENVIRONMENT_STATE` is
  built when its module loads, with no project, so it has no front to pass. The store would still
  need a seed for each project.
- Let the light follow edits of the site until the user first moves a light control (the other
  answer to open question 2). A new location would show its time at once, but the store would need
  to know whether the user has touched the light. The owner has not chosen it.
- Scan 21 June for every site. The rule would be simpler to state, but 21 June is midwinter in the
  southern hemisphere. The south-east front at latitude -40 in the tests finds no minute on 21 June
  and opens on 21 December.

## What stays open

- The stored light. A project does not store a light yet. The pull request of the opening light
  adds `openingLight` to the document on the user's click, and a stored light then wins over this
  rule. It extends this record.
- A house with no front that takes sun on either date. It opens at the fixed instant, and under the
  true sun its front can be in shade. At latitude 40 that is a front within about 23 degrees of
  north. Its owner will be able to store a better light.
- Open question 2, above.
- The Projects page of the session layer. A return to the project that is still open must not seed
  the light again and must not drop it.

## Evidence

On 2026-11-19, `pnpm exec vitest run` with the four unit files below and `--project unit` passed 69
tests. `tests/architecture/opening-instant-seam.test.ts` passed its 2 tests unchanged.

- `core/environment/opening-conditions.test.ts`. A site whose north is implied opens at 20 March
  10:30 under `DEFAULT_CLOUD_COVER` for four sites and five fronts. With the site
  `{ northBearing: 0 }`, the south front opens at 10:30, the east front at 10:00, and the west front
  at 14:00. For fronts every 10 degrees around the circle that take sun on 20 March, the chosen
  minute qualifies and no qualifying minute of that date is nearer 10:30. The test checks each
  minute with the project's own `daylightSiteFor`, `solarPosition`, and `sunWorldDirection`. The
  located site at latitude 40.71, longitude -74.01, `America/New_York`, opens its west front at
  15:04 civil time and its south front at 10:30, and 14:00 does not qualify there. The solstice
  cases: a north-west front at the sample place opens on 21 June at 15:32; a south-east front at
  latitude -40 opens on 21 December at 08:20; a front 60 degrees east of south at latitude -0.01
  opens on 21 December at 10:30. A north front at the sample place, the same 60-degree front at
  latitude 0 (where 21 June is scanned), and a south front at latitude 89 keep the fixed instant.
  `openingInstant` returns the fixed instant for the located site. No case holds two qualifying
  minutes equally near 10:30, so the tie rule rests on the code.
- `core/environment/opening-environment.test.ts`. A closed square room with no door faces
  plan-down. With north up it opens at 10:30. With north turned a quarter it opens at 14:00. With no
  site it opens in `DEFAULT_ENVIRONMENT_STATE`.
- `bridge/environment/environment-session-store.test.ts`. The store starts from the state it is
  given, and from `DEFAULT_ENVIRONMENT_STATE` when given none.
- `editor/shell/shell-providers-opening-light.test.tsx`. The shell seeds 10:30 for the room with
  north up and keeps 10:30 after a dispatch of `setSiteNorthBearing` and a re-render. A second
  shell, for the room with north turned a quarter, seeds 14:00. Both are schematic with the color
  check off.
- `e2e/tests/journeys/opening-time-for-the-house.spec.ts`, listed in `e2e/journey-coverage.json`.
  It draws a closed room and reads `2026-03-20 10:30` in the Environment panel. It sets "North
  bearing (degrees)" to 90, waits for the save, reloads, and reads `2026-03-20 14:00`. This
  record cites it but did not run it.

## References

- `docs/specs/2026-11-19-first-view-of-a-project.md`: the table "Decisions of the owner", sections
  4.2, 4.3, 5.4, and 8.
- `docs/plans/2026-11-19-first-view-of-a-project.md`: "Pull request 1".
- `docs/specs/2026-11-15-daylight-and-shadow.md`: calls 4 and 27 and section 6.1.
- #737: remember a project's light. #772: compute the front only when a light reads it.
- [[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]: the daylight site, the implied
  north, and the opening instant seam.
- [[ADR-0146-environment-panel-and-session-contract]]: the session store of the light.
- [[ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point]]: the reference place
  and instant.
- [[ADR-0143-environment-model-foundations]]: the stored site and observation time.
- [[ADR-0139-plan-to-world-orientation]]: the plan frame of the front and the bearing.
