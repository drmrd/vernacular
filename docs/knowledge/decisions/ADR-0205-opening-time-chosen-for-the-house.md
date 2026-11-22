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
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0184-known-keys-from-the-schema-for-the-save-time-graft,
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
    core/model/environment-scene.ts,
    core/model/types.ts,
    core/model/known-keys.json,
    core/environment/observation-time.ts,
    core/commands/handlers/opening-light-commands.ts,
    bridge/react/use-project-opening-light.ts,
    editor/environment/opening-light-control.tsx,
    editor/shell/tool-rail.tsx,
    schema/17/revision-3/vernacular.schema.json,
    core/environment/opening-conditions-stored.test.ts,
    core/commands/handlers/opening-light-commands.test.ts,
    editor/environment/opening-light-control.test.tsx,
    tests/format/opening-light-schema.test.ts,
    e2e/tests/journeys/opening-light.spec.ts,
  ]
status: current
updated: 2026-11-22
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
stored light. The section "Extension, 2026-11-22: the stored light" below describes it.

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
- The scan resolves `daylightSiteFor(site, front, date)` once for each date, not once for each
  minute. That gives the place, the north bearing, and the UTC offset in force on that date.
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
the edited call leaves it out. The stored light arrived afterwards, and the extension below covers
it.

## Consequences

- A project with a site location, or with a stored north bearing, opens at the time chosen for its
  house, and the Environment panel shows that time. A project with no site opens at 20 March, 10:30,
  as before.
- This holds for a project saved before this change too. One with a location or a stored bearing
  now opens at another time than 10:30. Nothing in its document changes.
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
  `bridge/react/scene-lighting.tsx`. `openingConditions` reads it too, for the fallback. The
  architecture test `tests/architecture/opening-instant-seam.test.ts` keeps its list of owners.
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

- The stored light. It is built now, and the extension below describes it.
- A house with no front that takes sun on either date. It opens at the fixed instant, and under the
  true sun its front can be in shade. At latitude 40 that is a front within about 23 degrees of
  north. Its owner can store a better light, as the extension below describes.
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

## Extension, 2026-11-22: the stored light

The pull request of the opening light is the second part of #737. It stores the light a project
opens in, in the document, on the user's click. It follows the owner's answers 6, 7, and 8 of the
first-view specification and its section 5.5. His answer on new fields was "Schema revisions, no
fallback (Recommended)".

### What is stored

`Project` gains an optional `openingLight: { observedAt, weather?, extensions? }`. It is revision 3
of schema version 17, published at `schema/17/revision-3/vernacular.schema.json`
([[ADR-0178-schema-version-and-revision]]). The field is additive, so a file without it loads with
no migration step. The table of known keys is regenerated with an `OpeningLight` entry
([[ADR-0184-known-keys-from-the-schema-for-the-save-time-graft]]), so a save keeps the unknown keys
and the `extensions` of a stored light. A cleared light removes the key. The key is never written
as `null` or `false`.

`ViewingConditions` is a type in `core/model/environment-scene.ts`, the time and weather that a
saved scene and the opening light share. `EnvironmentScene` and `OpeningLight` both extend it. The
type is a change in code only (call 11). The `EnvironmentScene` definition in the published schema
is the same as in revision 2, with `observedAt` a plain string, because a revision cannot tighten
what an earlier one accepted. So the schema does not refuse a malformed `observedAt` in either
record. The reader ignores a malformed stored light instead, as the next section says.

Because `EnvironmentScene` now extends `ViewingConditions`, the generated `EnvironmentScene`
definition lists its properties as `observedAt`, `weather`, `id`, `name`, `extensions`. Revision 2
listed them as `id`, `name`, `observedAt`, `weather`, `extensions`. The definition is otherwise the
same, and property order has no meaning in JSON Schema, so a diff of the two schemas shows a move
and no change.

The style, the quality level, and the color check are not stored. They stay session state and
device settings.

### Which light a project opens in

`openingConditions` takes the stored light as an optional `stored` input and reads it first. A
well-formed stored light wins over every rule above, also under sample daylight, where a project
with no site opens in it as well (call 12). A stored light with no `weather` opens at
`DEFAULT_CLOUD_COVER`, a clear sky. `storedOpeningConditions` in
`core/environment/opening-instant.ts` is the one reading of a stored light. The control uses it
too, so the status line and the opening always agree.

A stored light is well-formed when `isObservationInstantIso` accepts its `observedAt`. That check
asks for the exact shape `YYYY-MM-DDThh:mm` and for a real calendar instant: a date that exists
(not 30 February, not month 13), an hour from 0 to 23, and a minute from 0 to 59. A stored light
that fails the check is ignored when the project opens, so the project opens in the light chosen
for the house, by the two rules above (call 23). Nothing repairs or deletes it. The status line
then reads "Opens in the default light."

Applying, renaming, or removing a saved scene leaves the stored light alone. It is its own record.
A scene stays a named light that the user applies by hand, and the same values can live in both
places. `openingInstant` is unchanged.

The shell seeds the light once, when the project opens. `SessionStateProviders` reads the `site`
and the `openingLight` of the project in its state initializer and passes both to
`openingEnvironmentFor(site, sceneGraph, stored)`. This is the recommended answer (a) to open
question 2. Storing a light does not move the light on screen, and it does not need to, because the
user is looking at that light. Clearing or undoing does not move it either. The stored light shows
at the next open.

### Two commands

`opening-light/set` (`setOpeningLight`, "Set opening light") stores the time and the cloud cover.
It keeps the other keys of the record it replaces, `extensions` included (call 24), and removes a
weather that the new light lacks. `opening-light/clear` (`clearOpeningLight`, "Clear opening
light") removes the key. Each assigns or removes one top-level key of the project, so undo restores
the earlier stored light, including the state of no stored light. The set handler builds the new
record and assigns it whole, so the capture of the inverse sees the change at the root.

### Only on the click

This is answer 8. Moving the time, the date, or the cloud cover dispatches nothing, so the document
stays clean and autosave does not run. The button dispatches exactly one command, which marks the
project as changed once. No migration, repair, or autosave path writes the field.

### The control

`OpeningLightControl` in `editor/environment/opening-light-control.tsx` is a component of its own.
`EnvironmentRailSection` in `editor/shell/tool-rail.tsx` places it between the Environment panel
and the saved scenes (call 13). `useProjectOpeningLight` in the bridge subscribes it to the stored
light, so it updates after a click, a clear, and an undo. `EnvironmentPanel` and its stories did
not change, so the story baselines of the panel stay.

It has three parts: a status line, a button "Use this light when the project opens", and a button
"Clear the opening light".

### Choices the builder made

The first-view specification leaves the first three of these to the builder (section 5.5). The
fourth is a detail of the control. The pull request body names all four for the owner.

- The command names are `opening-light/set` and `opening-light/clear`. They follow
  `environment-scene/add` and `site/set-location`.
- The status line reads "Opens at 21 June 2026, 08:00, clear sky." or "Opens in the default
  light.". A cloud cover of 0 reads "clear sky", 1 reads "overcast sky", and any other value reads
  "<percent>% cloud cover", rounded to the percent that the Environment panel shows. A stored light
  with no weather reads "clear sky". A stored light that is ignored reads "Opens in the default
  light."
- The control does not apply the stored light to the screen. The stored light already shows at the
  next open, and a saved scene covers "go back to that light" by hand. If the owner wants the
  button, it is a small follow-up.
- The clear button is disabled while nothing is stored, not hidden, so the control keeps its shape.

### Consequences of the extension

- A project saved by this build can carry one more key. A build at a lower revision reads it
  tolerantly, keeps it through a save, and says that a newer build saved the project
  ([[ADR-0178-schema-version-and-revision]]).
- The same time and weather can live in a saved scene and in the opening light. That is the cost
  of keeping the opening light its own record.
- The stored light travels with the file, so the project opens in it on any computer.
- The control has a story of its own. The Environment panel's stories did not change.

### Options not taken in the extension

- A pointer from the project to a saved scene. It would share one record, but renaming or removing
  that scene would change how the project opens. The specification marks it not taken.
- A light kept for each device. It needs no document change, but a project would look different on
  each computer. Not taken.
- Writing the light on every move of a control. Autosave would then rewrite the document for each
  slider step, and the owner chose a click (answer 8).
- A schema that refuses a malformed `observedAt`. A revision cannot tighten an earlier one, so the
  reader ignores the value instead.

### Still open after the extension

- Open question 2 stands as built, answer (a). The owner can overrule it.
- A button that applies the stored light to the screen is not built.
- Nothing offers to repair a malformed stored light. If the repairs of the session layer ever offer
  to drop one, that write happens on the user's click.

### Evidence of the extension

On 2026-11-22, `pnpm exec vitest run` on the seven files below passed 68 tests.

- `core/environment/opening-conditions-stored.test.ts`: a stored light wins, also with no site,
  and a malformed one is ignored.
- `core/environment/observation-time.test.ts`: the check refuses an impossible date, hour, and
  minute.
- `core/commands/handlers/opening-light-commands.test.ts`: set, clear, undo, and the kept
  `extensions`.
- `tests/format/opening-light-schema.test.ts`: the schema at revision 3 with and without the
  field, an encode and decode round trip, and the `.building` archive round trip.
- `editor/environment/opening-light-control.test.tsx` and `editor/shell/tool-rail.test.tsx`: the
  control, its wording, and its place in the rail.
- `editor/shell/shell-providers-opening-light.test.tsx`: the shell seeds the stored light.
- `e2e/tests/journeys/opening-light.spec.ts`, listed in `e2e/journey-coverage.json`: it stores 08:00
  on a project that would open at 10:30, reloads, and reads the stored time. This record cites it
  but did not run it.
