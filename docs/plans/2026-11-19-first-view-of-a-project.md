# The first view of a project: implementation plan

It builds `docs/specs/2026-11-19-first-view-of-a-project.md` ("the specification" below). Issues: #737 and #627. Read against `main` at `1c02bbc5`.

## Global constraints

- Red, green, blue for every behavior. The test author writes the failing test and retrofits any sibling fixture, sample, or reminder case that a changed public surface breaks. The implementer makes it pass without touching tests. The reviewer and the refactorer close the cycle, with an empty marker commit when there is nothing to change. Commit order per cycle: `test:`, then `feat:` or `fix:`, then `refactor:`. Journeys (`test(e2e):`) and documents (`docs:`) are exempt from that order.
- A cycle's RED must fail on `main` when it is written. Where an assertion would pass at once, it goes into the RED of the cycle whose behavior it guards, as a second case in the same commit.
- Each pull request works in a sibling worktree under `vernacular.wt/`, with no `scene-` in the worktree name. No `git stash`. A pull request edits only the files of its fence and the shared files listed for it. A need outside the fence stops the work and goes back to the orchestrator.
- Every new optional field is a schema revision with no migration step and no fallback to a version step (ADR-0178). It takes the next free `CURRENT_SCHEMA_REVISION` at merge time and checks it again before the merge. A revision must not tighten what an earlier revision accepted.
- Gates before every merge: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Add `pnpm schema:check` where the schema changes and `pnpm integration:audit` where a journey is added. Then the clean-code review, the pull-request review, and `ci-complete` green.
- ADR-0204 and ADR-0205 belong to this plan. Check at dispatch and again before each landing that no other branch took them.
- Every decision record and every amendment of a record or a specification passes the humanizer before its pull request opens (`.claude/rules.md`, rule 17).

## Documents first

A documents pull request (`docs/first-view-of-a-project`) adds the specification and this plan. It edits no other specification and writes no decision record. Each change to an approved document lands with the code it describes, under ADR-0204 or ADR-0205 (specification, section 8). The humanizer pass of the specification is due before it opens.

Every code pull request below merges after the documents pull request, because its records cite the specification.

## Pull request 1: the opening time for the house (#737)

Goal: a project whose north is set opens at a time when its front takes sun, and every opened project seeds the light on screen from its own site.

What a user sees: a project with a site location, or a stored north bearing, opens at the time chosen for the house (specification, section 5.4). The Environment panel shows that time. A project with no site opens at 20 March, 10:30, as today. In the default schematic style nothing else changes on screen.

Needs: the documents pull request on `main`. It must not depend on #744, the entrance guess, the entrance mark, the kernel, or the next pull request of the session layer. No open question of the owner blocks it. Open question 2 (does the light follow site edits) is built on its recommended answer, and the other answer would change one test of this pull request (cycle 1.6) and add one behavior later.

Branch: `feat/opening-time-for-the-house`.

Fence. May touch:

- `core/environment/opening-instant.ts`, `core/environment/environment-state.ts`, and their tests; `core/environment/opening-conditions.test.ts` (new); `core/index.ts` (export lines).
- `bridge/environment/environment-session-store.ts` and its test.
- `editor/shell/shell-providers.tsx` (the line that creates the environment store) and `editor/shell/shell-providers-opening-light.test.tsx` (new).
- `e2e/tests/journeys/opening-time-for-the-house.spec.ts` (new) and one row of `e2e/journey-coverage.json`.
- Documents: `docs/knowledge/decisions/ADR-0205-*.md` (new); an amendment section in ADR-0193 and in ADR-0146; calls 4 and 27, the sentence "no caller changes", and the bullet on a north-facing house in section 6.1 of `docs/specs/2026-11-15-daylight-and-shadow.md`.
- At landing: a comment on #772 (specification, section 5.4).

Must not touch: `core/scene/`, `core/model/`, `schema/`, `core/format/`, `session/`, `storage/`, `app/` (including `app/harness-environment.ts`), `engine/`, `bridge/react/` (the scene view, the lighting, and the fade), `editor/environment/`, `tests/architecture/opening-instant-seam.test.ts`.

The rule the cycles build (specification, section 5.4). A minute qualifies when the sun is at least 25 degrees up and the dot product of `sunWorldDirection(solarPosition(...), northBearing)` with the front's world normal `(front.x, 0, -front.y)` is at least 0.5. The scan tries 20 March 2026, then 21 June 2026 at latitude 0 or more or 21 December 2026 below 0, then gives the fixed instant. Within a date it takes the qualifying minute with the least `|minutesSinceMidnight - 630|`, the earlier of two equally near. It resolves `daylightSiteFor(site, front, date)` once per date, not once per minute. The cloud cover is `DEFAULT_CLOUD_COVER`.

### Cycle 1.1: a site with an implied north opens at the fixed instant

- Test file: `core/environment/opening-conditions.test.ts` (new).
- Test: "opens a site whose north is implied at 20 March 10:30 under the default cloud cover, for every front".
- Setup: call `openingConditions({ site, front })` from `core/index.ts`. Sites: `undefined`, `{}`, `{ northBearing: Number.NaN }`, and `{ latLong: { latitude: Number.NaN, longitude: 0 } }`. Fronts: `(0, -1)`, `(0, 1)`, `(1, 0)`, `(-1, 0)`, and `(0.6, -0.8)`.
- Assertion: `observedAt` equals `{ date: '2026-03-20', minutesSinceMidnight: 630 }` and `cloudCover` equals `DEFAULT_CLOUD_COVER` in every case. Second case in the same commit: `openingInstant({ site })` returns that instant also for the located site `{ latLong: { latitude: 40.71, longitude: -74.01 }, timezone: 'America/New_York', northBearing: 0 }`.
- Why it fails today: `openingConditions` does not exist.
- Implementation: `core/environment/opening-instant.ts`, `core/index.ts`.

### Cycle 1.2: a set north opens at the qualifying minute of 20 March nearest 10:30

- Test file: `core/environment/opening-conditions.test.ts`.
- Test: "opens a house whose north is set at the minute of 20 March nearest 10:30 at which the sun is at least 25 degrees up and meets the front at a cosine of at least 0.5".
- Setup: the site `{ northBearing: 0 }` (the sample place with a stored bearing). Fronts: south `(0, -1)`, east `(1, 0)`, west `(-1, 0)`.
- Assertion: south opens at `2026-03-20` 10:30, east at 10:00, west at 14:00, each with `DEFAULT_CLOUD_COVER`. The test computes the check with the project's own functions: `daylightSiteFor(site, front, date)`, `solarPosition` at that place and offset, and `sunWorldDirection` under that north. At each chosen minute the sun is at least 25 degrees up (south 44.99, east 41.49, west 41.55) and the cosine is at least 0.5 (0.5948, 0.5001, 0.5001). Second case in the same commit: for fronts every 10 degrees around the circle, wherever the result falls on 20 March, the chosen minute qualifies by that check and no minute of that date nearer 10:30 does.
- Why it fails today: cycle 1.1's function returns 10:30 for every input, so east and west fail.
- Implementation: `core/environment/opening-instant.ts`.

### Cycle 1.3: a located site scans in its own civil time

- Test file: `core/environment/opening-conditions.test.ts`.
- Test: "scans a located site in its own civil time".
- Setup: the site `{ latLong: { latitude: 40.71, longitude: -74.01 }, timezone: 'America/New_York', northBearing: 0 }`. Fronts west `(-1, 0)` and south `(0, -1)`.
- Assertion: west opens at `2026-03-20` 15:04 (sun 41.02 degrees up, cosine 0.5023, offset -240 from `utcOffsetMinutesFor`). South opens at 10:30.
- Why it fails today: an implementation that passes cycles 1.1 and 1.2 can read the sample place for every site, which gives 14:00 for the west front.
- Implementation: `core/environment/opening-instant.ts`.

### Cycle 1.4: the solstice of the hemisphere, then the fixed instant

- Test file: `core/environment/opening-conditions.test.ts`.
- Test: "falls back to the summer solstice of the site's hemisphere, and to the fixed instant when no minute of either day qualifies".
- Setup and assertion:
  - `{ northBearing: 0 }` with the front north-west `(-0.7071, 0.7071)` opens at `2026-06-21` 15:32 (sun 41.67, cosine 0.5002).
  - Latitude -40, longitude 0, no timezone, bearing 0, front south-east `(0.7071, -0.7071)`: opens at `2026-12-21` 08:20 (sun 41.59, cosine 0.5015). It fails on 21 June too, so the hemisphere decides.
  - `{ northBearing: 0 }` with the front north `(0, 1)`: the fixed instant.
  - Latitude 0, longitude 0, no timezone, bearing 0, front `(0.5, -0.8660)`: the fixed instant, because 21 June is scanned and fails.
  - Latitude -0.01, longitude 0, same front: `2026-12-21` 10:30 (cosine 0.5163).
  - Latitude 89, longitude 0, bearing 0, front south: the fixed instant, because the sun stays below 25 degrees.
  - Second case in the same commit: the minute property of cycle 1.2 for each solstice result.
- Why it fails today: the scan of cycle 1.2 covers 20 March only.
- Implementation: `core/environment/opening-instant.ts`.

### Cycle 1.5: the environment store starts from a given state

- Test file: `bridge/environment/environment-session-store.test.ts`.
- Test: "starts from the state it is given, and from the default state when given none".
- Setup: `createEnvironmentSessionStore(state)` with a state at 21 June 08:00 and cloud cover 0.4, and `createEnvironmentSessionStore()`.
- Assertion: `getEnvironment()` returns the given state. With no argument it returns `DEFAULT_ENVIRONMENT_STATE`.
- Why it fails today: the factory takes no argument (`bridge/environment/environment-session-store.ts:9-10`).
- Implementation: `bridge/environment/environment-session-store.ts`.

### Cycle 1.6: the shell seeds the light per opened project

- Test file: `editor/shell/shell-providers-opening-light.test.tsx` (new). Follow the setup of `editor/shell/shell-providers.test.tsx`, which takes `createEditorSession` from `session/testing`.
- Test: "seeds the light on screen from the project that opened, once, and leaves it when the site changes".
- Setup: a project with one closed room drawn with `addWall` and the site `{ northBearing: 0 }`. With no door, its front is plan-down. Render `ShellProviders` with a probe that reads `useEnvironmentSession()`. Dispatch `setSiteNorthBearing(Math.PI / 2)` and re-render. Then render a second shell with a session for the same room with the site `{ northBearing: Math.PI / 2 }`.
- Assertion: the first probe reads 20 March 10:30, since the front faces south. After the site edit and the re-render it still reads 10:30. The second shell reads 20 March 14:00, because a bearing of pi/2 turns plan-down to the west. The mode is `'schematic'` and the color check is off in both.
- Why it fails today: the store starts from the constant default (`editor/shell/shell-providers.tsx:79`).
- Implementation: `editor/shell/shell-providers.tsx` creates the store once, in a state initializer, from `openingConditions` of `session.getProject().site` and `frontDirection(session.getSceneGraph())`. A pure helper in `core/environment/environment-state.ts` turns the conditions into an `EnvironmentState`.

### Cycle 1.7: the journey

- Test file: `e2e/tests/journeys/opening-time-for-the-house.spec.ts`, plus a row in `e2e/journey-coverage.json`.
- Test: "opens a house whose front faces west at the time its front takes the sun".
- Setup: draw the closed room the journeys share. Open the site editor and set "North bearing (degrees)" (`editor/metadata/site-editor.tsx:155`) to 90. Wait for the save, then reload.
- Assertion: the output under "Observation date and time" in the Environment panel reads `2026-03-20 14:00` (`formatObservationDateTime`, `core/environment/observation-time.ts:65-68`).

Journeys and pictures: no scene harness state reads the opening rule. Each pins its `observedAt` in `app/harness-environment.ts`, and a state with no environment gets `openingInstant`, which stays fixed. No live-view or story baseline moves. In the default schematic style the sun update does nothing, so the visible change is the panel's time, which the journey proves.

Decision record: writes ADR-0205 for the chosen time and the seeding per project. It amends ADR-0193 ("The opening instant seam", and the two consequences on the opening instant) and ADR-0146 (the session light is seeded per project). The daylight specification's edits of the fence land under it.

Leaves: the stored light (pull request 2). `openingInstant` keeps its signature for its three callers.

## Pull request 2: the opening light (#737)

Goal: a project stores the light it opens in, on the user's click, and opens in it on every computer.

What a user sees: under the Environment panel, "Use this light when the project opens", a status line, and a control that clears the stored light. After a click the project reopens in that light, also after export and import.

Needs: pull request 1.

Branch: `feat/opening-light`.

Fence. May touch:

- `core/model/types.ts` (`Project.openingLight`), `core/model/environment-scene.ts` (`ViewingConditions`), `core/model/factories.ts` (the revision constant and its comment), `core/model/known-keys.json`, `core/format/generated/`, `schema/<version>/revision-<R>/` (new).
- `core/commands/handlers/opening-light-commands.ts` (new) and its test, `core/commands/handlers/register-all-project-commands.ts`, `core/commands/testing/project-command-samples.ts`, `core/commands/testing/extensions-fixture.ts`, `core/commands/testing/command-removals.ts`.
- `core/environment/opening-instant.ts` and `core/environment/opening-conditions.test.ts`.
- `editor/shell/shell-providers.tsx` and `editor/shell/shell-providers-opening-light.test.tsx`.
- `editor/environment/opening-light-control.tsx` (new), its test and story, and its new story baselines `e2e/stories/__screenshots__/editor-openinglightcontrol--*-linux.png`. `editor/shell/tool-rail.tsx` and `editor/shell/tool-rail.test.tsx`. `bridge/react/use-project-opening-light.ts` (new), `bridge/index.ts`, `core/index.ts`.
- `tests/format/opening-light-schema.test.ts` (new), `tests/format/cleared-fields.test.ts`, `tests/format/schema-drift.test.ts` (the reminder case).
- `e2e/tests/journeys/opening-light.spec.ts` (new) and one row of `e2e/journey-coverage.json`.
- Documents: ADR-0205 (extended); amendments in ADR-0193, ADR-0146, and ADR-0143; in the daylight specification, the status line, decision 7, the non-goal of section 2, the two approach rows of section 5, and the #737 risk row of section 9; locked decision 3 of `docs/specs/2026-07-01-realistic-environmental-lighting.md`; section 4.1 of the format specification; section 3.1 of the design specification.

Must not touch: `editor/environment/environment-panel.tsx` and its stories (so its three story baselines stay), `core/scene/`, `session/`, `storage/`, `app/`, `engine/`, `core/migrations/`.

### Cycle 2.1: the field is a schema revision

- Test file: `tests/format/opening-light-schema.test.ts` (new). The test author also updates the reminder case of `tests/format/schema-drift.test.ts` (`:58-63`) to the new revision.
- Test: "accepts a project with an opening light at the new revision, keeps it through an encode and decode, and leaves the schema of saved scenes as it was".
- Setup: `createEmptyProject(...)` with `openingLight: { observedAt: '2026-06-21T08:00', weather: { cloudCover: 0.4 } }` and one saved scene. Encode it with `encodeDocument` and read it back with `decodeDocument` (both from `core/index.ts`).
- Assertion: the decoded project holds the same `openingLight` and the same scene, with no faults. The written `meta.schemaRevision` is `CURRENT_SCHEMA_REVISION`, one more than on `main` when the cycle starts. `schema/<version>/revision-<R>/vernacular.schema.json` exists, and its `$id` names that revision. The definition of `EnvironmentScene` in it equals the one in `schema/17/revision-1/vernacular.schema.json`. Second case: `openingLight: null` is refused. No case refuses a malformed `observedAt`, because the scene's schema must not tighten.
- Why it fails today: the strict check refuses the unknown key `openingLight` (ADR-0190).
- Implementation: `core/model/types.ts`, `core/model/environment-scene.ts`, `core/model/factories.ts`, then `pnpm schema:generate` for `schema/`, `core/model/known-keys.json`, and `core/format/generated/`.

### Cycle 2.2: set and clear, with undo, keeping third-party data

- Test file: `core/commands/handlers/opening-light-commands.test.ts` (new). The test author also adds the two commands to `core/commands/testing/project-command-samples.ts`, gives the extensions fixture an opening light with `extensions`, declares the clear command in `core/commands/testing/command-removals.ts`, and adds a case to `tests/format/cleared-fields.test.ts`.
- Test: "stores a light as the opening light, keeps the extensions of the light it replaces, clears it, and undoes each step".
- Setup: a `Dispatcher` over `registerAllProjectCommands`, on a project whose `openingLight` carries `extensions: { 'com.example': { note: 'kept' } }`. Dispatch the set command with `{ observedAt: '2026-06-21T08:00', weather: { cloudCover: 0.4 } }`, then the clear command, then undo twice.
- Assertion: after set, `project.openingLight` holds the new time and weather and the old `extensions`. After clear, the key is absent (`'openingLight' in project` is false). The first undo brings the set value back, and the second brings back the original. The extensions test over every command sample passes. An encoded project after the clear holds no `openingLight` key.
- Why it fails today: the commands do not exist.
- Implementation: `core/commands/handlers/opening-light-commands.ts`, `core/commands/handlers/register-all-project-commands.ts`, `core/index.ts`.

### Cycle 2.3: a stored light wins when it is well formed

- Test file: `core/environment/opening-conditions.test.ts`.
- Test: "opens at a well-formed stored light over every other rule, also under sample daylight, and ignores a malformed one".
- Setup: `openingConditions({ site, front, stored })`. `stored` is `2026-06-21T08:00` with cloud cover 0.4. Sites: `undefined`; `{ northBearing: 0 }` with the front north; and the New York site. Then the same with `stored` without `weather`. Then `stored` with `observedAt: 'noon'` on `{ northBearing: 0 }` with the front west.
- Assertion: each well-formed case returns 21 June 08:00 and cloud cover 0.4. Without `weather`, the cloud cover is `DEFAULT_CLOUD_COVER`. The malformed one returns the chosen time, 20 March 14:00.
- Why it fails today: the function ignores `stored`.
- Implementation: `core/environment/opening-instant.ts`.

### Cycle 2.4: the shell opens a project in its stored light

- Test file: `editor/shell/shell-providers-opening-light.test.tsx`.
- Test: "opens a project in its stored light, and a later set or clear leaves the light on screen alone".
- Setup: a project with `openingLight` at 21 June 08:00, rendered as in cycle 1.6. Then dispatch the clear command and re-render.
- Assertion: the probe reads 21 June 08:00 before and after the clear.
- Why it fails today: the seed of pull request 1 passes no stored light.
- Implementation: `editor/shell/shell-providers.tsx`.

### Cycle 2.5: the control

- Test file: `editor/environment/opening-light-control.test.tsx` (new), and the story `editor/environment/opening-light-control.stories.tsx` (new, written by the test author).
- Test: "stores the light on screen on a click, says what is stored, and dispatches nothing while the light changes".
- Setup: render the control with an environment at 21 June 08:00 and cloud cover 0, no stored light, and a dispatch spy. Click "Use this light when the project opens". Re-render with a stored light at 21 June 08:00. Re-render with another environment, as a slider move would. Click the clear control.
- Assertion: before the click the line reads "Opens in the default light." and nothing was dispatched. The click dispatches exactly one command: the set command with `observedAt: '2026-06-21T08:00'` and `weather: { cloudCover: 0 }`. With the stored light the line reads "Opens at 21 June 2026, 08:00, clear sky." The re-render with another environment dispatches nothing. The clear control dispatches exactly one clear command.
- Why it fails today: the control does not exist.
- Implementation: `editor/environment/opening-light-control.tsx`.

### Cycle 2.6: the control in the tool rail

- Test file: `editor/shell/tool-rail.test.tsx`.
- Test: "shows the opening light control between the Environment panel and the saved scenes, and the button stores the light of the session".
- Setup: render the tool rail with a session and an environment store at a chosen light, as the existing tests of the file do.
- Assertion: the control follows the Environment panel and precedes the saved scenes in document order. A click on the button leaves `session.getProject().openingLight` equal to the store's light.
- Why it fails today: the rail does not mount the control.
- Implementation: `editor/shell/tool-rail.tsx`, `bridge/react/use-project-opening-light.ts`, `bridge/index.ts`.

### Cycle 2.7: the journey

- Test file: `e2e/tests/journeys/opening-light.spec.ts`, plus a row in `e2e/journey-coverage.json`.
- Test: "stores the light the project opens in and reopens in it".
- Setup: draw the closed room. Set the time of day to 08:00, click "Use this light when the project opens", wait for the save, and reload.
- Assertion: the output under "Observation date and time" reads `2026-03-20 08:00`, and the status line names that light. A second case moves the slider without clicking, reloads, and reads `2026-03-20 08:00` again.

Journeys and pictures: the new story adds its own baselines, rendered on the CI runner with the refresh workflow. The three `editor-environmentpanel--*-linux.png` baselines do not move, because the panel is not edited. No scene or live-view baseline moves. The app baseline `home.png` should not move, since the Environment section sits below the rail's fold in its capture; the pull request runs it to be sure.

Decision record: extends ADR-0205 with the stored values, their home, the write rule, the validity check, and the relation to scenes. It amends ADR-0143 (the shared value type) and the rest of ADR-0193 (the consequence "Nothing is added to the document" and the "Not decided" bullet on #737).

Leaves: applying the stored light to the screen from the control (left to the builder in the specification).

## Pull request 3: the entrance guess (#627, first part)

Goal: with no door marked, the entrance is the widest swing or pivot door in an outside wall of the ground floor.

What a user sees: on a project whose widest outside door is sliding, upstairs, or below grade, the sample sun turns to the hinged ground-floor door. Nothing else.

Needs: the documents pull request. It can be built beside pull request 1. Open question 3 (floor before family) is built on its recommended answer. Its other answer swaps two rules and one test case.

Branch: `feat/entrance-guess-on-the-ground-floor`.

Fence. May touch: `core/scene/front-direction.ts`, `core/registries/opening-kind.ts` (a helper that returns the door family) and its test, `core/scene/front-direction-floors.test.ts` (new), `core/scene/front-direction-families.test.ts` (new), `core/scene/entrance.test.ts` (new), `core/index.ts`. Documents: `docs/knowledge/decisions/ADR-0204-*.md` (new); an amendment section in ADR-0193; in the daylight specification, call 1, the `frontDirection` bullet of section 6.1, and the item of section 10 on how the widest exterior door is found.

Must not touch: `core/scene/exterior-walls.ts` and `core/scene/scene-graph.ts` (kernel), `bridge/`, `editor/`, `app/`, the harness fixtures.

### Cycle 3.1: the floors in order

- Test file: `core/scene/front-direction-floors.test.ts` (new).
- Test: "takes the entrance from the ground floor, then from the floors above grade, then from the floors below it".
- Setup: three floor nodes in `nodes`: `floor:basement` at elevation -2400, `floor:ground` at 0, and `floor:upper` at 2700; `gradeElevation: 0`. A closed box room on each floor. Doors, with ids that sort basement first: `a-basement`, a 1626 mm `french-door` in the basement room's west wall; `b-upper`, a 1626 mm `french-door` in the upper room's east wall; `c-ground`, an 813 mm `single-swing-door` in the ground room's north wall.
- Assertion: with all three doors, `frontDirection` is plan-up `(0, 1)`. Without `c-ground`, it is east `(1, 0)`: the floor above grade comes first, although the id order would pick the basement door. Third case: the graph with all three doors and no `nodes` field counts every floor as at grade. The two French doors then tie on family, width, and direction, so the id decides and the front is west `(-1, 0)`. The existing case at `core/scene/front-direction.test.ts:316-338` keeps passing for the same reason.
- Why it fails today: the function compares the doors of every floor alike (`core/scene/front-direction.ts:67-76`).
- Implementation: `core/scene/front-direction.ts`.

### Cycle 3.2: hinged doors first, within a level

- Test file: `core/scene/front-direction-families.test.ts` (new).
- Test: "prefers a swing or pivot door to a wider sliding, folding, or cased door on the same level".
- Setup: one closed room for each of the first three cases. Case one: an 813 mm `single-swing-door` in the south wall and an 1829 mm `sliding-glass-door` in the east wall. Case two: a 914 mm `pivot-door` in the west wall and a 965 mm `barn-door` in the north wall. Case three: an 813 mm `bifold-door` in the south wall and a 914 mm `cased-opening` in the east wall. Case four: a ground floor with a 1524 mm `bypass-door` in its south wall, and a floor above with an 813 mm `single-swing-door` in its east wall.
- Assertion: case one faces south `(0, -1)`, case two west `(-1, 0)`, and case three east `(1, 0)`, since with no hinged door the widest of the rest wins. Case four faces south: the floor ranks before the family (call 19).
- Why it fails today: the widest door of any family wins.
- Implementation: `core/scene/front-direction.ts`, `core/registries/opening-kind.ts`.

### Cycle 3.3: the entrance is named

- Test file: `core/scene/entrance.test.ts` (new).
- Test: "names the guessed door with its floor and its front, and no door when there is no exterior door".
- Setup: the graph of cycle 3.2, case one. A graph with one room and no door. Two floors at elevation 0, each with a closed room and a 900 mm `single-swing-door` with the id `door` in its south wall.
- Assertion: `entranceOf` returns the swing door's node, `source: 'guessed'`, and the front `(0, -1)`. For the room with no door, `door` is undefined, `source` is `'none'`, and the front is plan-down. For the two floors, the door of the floor that comes first in document order wins, by its `floorId`. `frontDirection` equals `entranceOf(...).front` in every case.
- Why it fails today: `entranceOf` does not exist.
- Implementation: `core/scene/front-direction.ts`, `core/index.ts`.

Journeys and pictures: none. The harness fixture with a door has a single swing door on its ground floor (`bridge/react/harness-fixtures.ts:74-84`). So the sample daylight state keeps its front, and no scene baseline moves.

Decision record: writes ADR-0204 with the guess. It amends ADR-0193 ("The front direction": the sentence on the widest exterior door, the bullet "It counts doors only", and the consequence on adding a wider door).

Leaves: the mark (pull request 4).

## Pull request 4: the entrance mark (#627, second part)

Goal: a user marks one door as the main entrance, and the front and the sample sun follow it.

What a user sees: a "Main entrance" checkbox in the door inspector. The guessed door shows the line "Vernacular treats this door as the entrance until one is marked." There is a palette command too. The mark survives a reload, export, and import.

Needs: pull request 3. It can run beside pull request 2. Open question 6 (a report for several marks) changes only the text of the ADR-0179 amendment, unless the owner wants a notice now.

Branch: `feat/main-entrance-mark`.

Fence. May touch:

- `core/model/types.ts` (`Opening.entrance`), `core/model/factories.ts`, `core/model/known-keys.json`, `core/format/generated/`, `schema/<version>/revision-<R>/` (new).
- `core/scene/scene-graph.ts` (the opening node copies the field), `core/scene/front-direction.ts`.
- `core/commands/handlers/entrance-commands.ts` (new), `core/commands/entrance-rule.ts` (new: the check that counts marked doors), `core/commands/handlers/register-all-project-commands.ts`, `core/commands/testing/project-command-samples.ts`, `core/commands/testing/extensions-fixture.ts` (a marked door). The handlers that add openings: `core/commands/handlers/transform-commands.ts` (paste), `core/commands/handlers/opening-commands.ts` (add opening, `retypeOpening`), `core/commands/handlers/project-commands.ts` (add floor).
- `editor/plan/opening-inspector.tsx`, its stories, and the story baselines `e2e/stories/__screenshots__/editor-openinginspector--*-linux.png`. `editor/shell/inspector.tsx`, `bridge/react/use-entrance.ts` (new), `bridge/react/use-front-direction.ts` (reads the same memo), `bridge/index.ts`, `editor/commands/entrance-commands.ts` (new), `editor/commands/command-set.ts`, `core/index.ts`.
- The tests named in the cycles; `tests/format/cleared-fields.test.ts`; `tests/format/schema-drift.test.ts` (the reminder case); `e2e/tests/journeys/mark-main-entrance.spec.ts` (new); one row of `e2e/journey-coverage.json`.
- Documents: ADR-0204 (extended); amendments in ADR-0193, ADR-0038, and ADR-0179; section 4.1 of the format specification; section 3.1 of the design specification; the `frontDirection` bullet of section 6.1 of the daylight specification.

Must not touch: `core/clipboard/clipboard.ts` (the paste handler drops the mark instead, and the kernel edits the clipboard), `core/scene/exterior-walls.ts`, `session/` (including `session/handle/`), `storage/`, `app/`, `core/repairs/`, `engine/`.

### Cycle 4.1: the field is a schema revision

- Test file: `tests/format/entrance-schema.test.ts` (new). The test author also updates the reminder case of `tests/format/schema-drift.test.ts` to the new revision.
- Test: "accepts a door marked as the main entrance at the new revision and keeps the mark through an encode and decode".
- Setup: a project with one floor, one wall, and one `single-swing-door` with `entrance: true`.
- Assertion: no faults under the strict check. The decoded opening keeps `entrance: true`. `CURRENT_SCHEMA_REVISION` is one more than on `main` when the cycle starts, and its schema is published. Second case: `entrance: false` and `entrance: 'yes'` are refused. The opening has no earlier schema to tighten, since the field is new.
- Why it fails today: the strict check refuses the unknown key.
- Implementation: `core/model/types.ts`, `core/model/factories.ts`, `pnpm schema:generate`.

### Cycle 4.2: a marked door wins

- Test file: `core/scene/entrance-marked.test.ts` (new).
- Test: "names the first marked door over the guess, on any wall, with the tie rules, and ignores a mark on a window".
- Setup: build each graph with `deriveSceneGraph` from a project, so the copy onto the node is under test.
  - Case one: room A from x 0 to 4000 and room B from x 4000 to 6000, both from y 0 to 3000. A 1626 mm `french-door` in room A's south wall, unmarked. An 813 mm `single-swing-door` marked, in the shared wall at x 4000. The center of the floor's walls is at x 3000.
  - Case two: rooms of equal width, from x 0 to 3000 and from x 3000 to 6000, with the marked door in the shared wall at x 3000, on the center.
  - Case three: rooms stacked, from y 0 to 3000 and from y 3000 to 6000, both from x 0 to 4000, with the marked door in the shared wall at y 3000, on the center.
  - Case four: two marked doors, one on each of two floors.
  - Case five: a marked `double-hung-window` and the French door of case one.
- Assertion: case one gives the marked door, `source: 'marked'`, and the front `(1, 0)`, away from the center. Case two gives `(1, 0)`: both normals tie on the center and on plan-down, and plan-right decides. Case three gives `(0, -1)`, by plan-down. Case four gives the door on the floor that comes first in document order. Case five ignores the window, and the guess (the French door, south) wins.
- Why it fails today: the opening node has no field, and the guess ignores marks.
- Implementation: `core/scene/scene-graph.ts`, `core/scene/front-direction.ts`.

### Cycle 4.3: set and clear, with undo

- Test file: `core/commands/handlers/entrance-commands.test.ts` (new). The test author adds the two commands to `core/commands/testing/project-command-samples.ts` and a case to `tests/format/cleared-fields.test.ts`.
- Test: "marks one door as the main entrance, removes every other mark, and undoes it".
- Setup: two floors, each with a door, one of them already marked. Dispatch the set command for the other door, then the clear command, then undo twice.
- Assertion: after set, only the chosen door carries `entrance: true`, and the other has no `entrance` key. After clear, no opening has the key. Each undo restores the state before its command. An encoded project after the clear holds no `entrance` key.
- Why it fails today: the commands do not exist.
- Implementation: `core/commands/handlers/entrance-commands.ts`, `core/commands/handlers/register-all-project-commands.ts`, `core/index.ts`.

### Cycle 4.4: what carries the mark

- Test file: `core/commands/handlers/entrance-carried.test.ts` (new).
- Test: "drops the mark from pasted, added, and retyped openings, and keeps it through a move and an undone delete".
- Setup: a floor with a closed room and a marked door. Paste a copy of the door's wall and door (`pasteEntities`). Add an opening whose parameters carry `entrance: true`. Add a floor whose opening carries it. Change the marked door's type to `double-hung-window`. Translate the marked door's wall. Delete the door and undo.
- Assertion: the pasted, added, and added-floor openings have no `entrance` key, and neither has the retyped opening. After the move and after the undone delete, the door carries the mark.
- Why it fails today: the paste handler appends copies unchanged (`core/commands/handlers/transform-commands.ts:157-165`). The add handler appends its parameter (`core/commands/handlers/opening-commands.ts:52`). `retypeOpening` spreads every field (`:232-246`).
- Implementation: `core/commands/handlers/transform-commands.ts`, `core/commands/handlers/opening-commands.ts`, `core/commands/handlers/project-commands.ts`.

### Cycle 4.5: one marked door after every command

- Test file: `core/commands/one-marked-door.test.ts` (new).
- Test: "counts the marked doors of a project, and finds at most one after every registered command".
- Setup: the extensions fixture with its main opening marked. For each entry of `COMMAND_SAMPLES` (`core/commands/testing/command-samples.ts`), dispatch the sample on a fresh copy.
- Assertion: the count of marked doors is at most one after each command. The count of a project with two marked doors is 2, and of one with none is 0.
- Why it fails today: the counting check does not exist.
- Implementation: `core/commands/entrance-rule.ts`, `core/index.ts`.

### Cycle 4.6: the inspector

- Test file: `editor/plan/opening-inspector-entrance.test.tsx` (new). The test author adds "Marked entrance" and "Guessed entrance" stories to `editor/plan/opening-inspector.stories.tsx`.
- Test: "shows Main entrance ticked on the marked door and unticked with a note on the guessed door, and dispatches set and clear".
- Setup: render `OpeningInspector` for a door with the entrance role `'marked'`, then `'guessed'`, then `'other'`, and once for a window, with a dispatch spy.
- Assertion: `'marked'` shows the checkbox checked and no note. Unticking dispatches the clear command once. `'guessed'` shows it unchecked with "Vernacular treats this door as the entrance until one is marked." Ticking dispatches the set command for that door once. `'other'` shows it unchecked with no note. A window shows no checkbox.
- Why it fails today: the inspector has no such control or prop.
- Implementation: `editor/plan/opening-inspector.tsx`.

### Cycle 4.7: the role comes from the whole project, by floor and id

- Test file: `editor/shell/inspector-entrance.test.tsx` (new; reuse `editor/shell/inspector-test-support.tsx`).
- Test: "passes the entrance role of the selected door, judged on the whole project and matched by floor and id".
- Setup: a project with a ground floor holding the guessed door with the id `door`, and an upper floor, shown as the active floor, holding another door with the same id `door`. Select each in turn. Then mark the upper door and select each again.
- Assertion: before the mark, the ground door's inspector shows the guessed note and the upper door's shows neither. After marking the upper door, its inspector shows the box ticked, and the ground door's shows neither.
- Why it fails today: the inspector does not compute the role.
- Implementation: `editor/shell/inspector.tsx`, `bridge/react/use-entrance.ts`, `bridge/react/use-front-direction.ts`, `bridge/index.ts`.

### Cycle 4.8: the palette command

- Test file: `editor/commands/entrance-commands.test.ts` (new).
- Test: "offers Mark as main entrance only when one door is selected, and dispatches the set command".
- Setup: the command context with no selection, one wall, one window, one door, and two doors selected.
- Assertion: the command is enabled only for one door. Running it dispatches the set command for that door.
- Why it fails today: the command does not exist.
- Implementation: `editor/commands/entrance-commands.ts`, `editor/commands/command-set.ts`.

### Cycle 4.9: the journey

- Test file: `e2e/tests/journeys/mark-main-entrance.spec.ts`, plus a row in `e2e/journey-coverage.json`.
- Test: "marks a door as the main entrance and keeps the mark after a reload".
- Setup: draw the closed room, place two doors, select the second, and tick "Main entrance". Reload and select it again.
- Assertion: the box is ticked. The first door's inspector shows it unticked with no note.

Journeys and pictures: the story baseline `e2e/stories/__screenshots__/editor-openinginspector--default-linux.png` moves. Its story shows a `single-swing-door` (`editor/plan/opening-inspector.stories.tsx:37`) that now carries the checkbox. The two new stories add baselines. They render on the CI runner. No scene or live-view baseline moves. The sample sun follows the mark, which cycle 4.2 proves through `frontDirection`.

Decision record: extends ADR-0204 with the mark. It amends ADR-0038 (a new optional field on an opening), ADR-0179 (the rule of one marked door, and what loading does with several, as open question 6 settles), and the rest of ADR-0193 (the case of an interior door, and the "Not decided" bullet on the entrance).

Leaves: the report of several marks on load (open question 6), the plan symbol, walk mode at the entrance, and the doorway preset at the entrance.

## Pull request 5: the view from the front (#627, last part)

Goal: the 3D view opens from the front, and "Reset view" and a new "Entrance" preset return to it.

What a user sees: the first 3D view stands in front of the house. It is turned 30 degrees toward the side the opening light leaves in shade and looks down 20 degrees, with the front wall solid. "Reset view" returns there. "Entrance" sits beside "Doorway", and their tooltips tell them apart. Walk mode starts outside the front.

Needs: pull request 1 (the shaded side reads the light the project opened in). The build of the distance rule of #744 on `main`, after the owner approves its design (24 November at the earliest). Open question 1 decides the side rule; the plan builds its recommended answer. Open question 5 decides whether #744 meets the constraint.

Branch: `feat/view-from-the-front`.

Fence. May touch:

- `core/scene/entry-pose.ts` (new: `entryPose` and `shadedSide`) and its tests, `core/index.ts`.
- `bridge/react/fit-camera.ts` and its test, `bridge/react/scene-camera-effects.tsx`, `bridge/react/webgpu-scene-view.tsx` (pass the front and the side to the camera rig), `bridge/react/scene-nav-toolbar.tsx`, and the new tests `bridge/react/scene-nav-toolbar-entrance.test.tsx`, `bridge/react/frame-camera-entry.test.tsx`, and `bridge/react/near-wall-fade-entry-view.test.ts`.
- Where the side is held for the session: the bridge's scene session or environment glue, as the builder chooses. If that needs `editor/shell/shell-providers.tsx`, stop and ask.
- `e2e/tests/journeys/perceived-color-readout.spec.ts`; `e2e/tests/scene-live-view-visual-regression.spec.ts` and its new `-darwin` baseline; `e2e/tests/scene-camera-fit.spec.ts`, only if its reading under the front view falls below the threshold, with a new derivation.
- Documents: ADR-0204 (extended); amendments in ADR-0075 and ADR-0083; call 12, the #627 row of section 7, and the sentence of section 6.5 on the entrance-facing camera in the daylight specification.

Must not touch: the fade itself (`engine/scene/near-wall-transparency*.ts`, `bridge/react/near-wall-fade.tsx`, `core/scene/camera-outside-building.ts`), which belongs to #744. `bridge/react/framed-scene.ts` and the harness (`bridge/react/scene-harness-view.tsx`, which calls `fitCameraToBounds` without a front at `:75`; `app/harness-environment.ts`). `session/`, `storage/`, `app/`.

### Cycle 5.1: the shaded side

- Test file: `core/scene/entry-pose.test.ts` (new).
- Test: "chooses the side of the front that the opening light leaves in more shade, and plan-left when the sun is down or the sides tie".
- Setup: `shadedSide({ site, front, light })`, with the light given explicitly, for each row of the table in specification section 5.3. One more case: `{ northBearing: 0 }`, front south, with the light at `2026-06-21` 00:00, when the sun is below the horizon.
- Assertion: plan-left for no site at 20 March 10:30 (plan-left cosine -0.3827). Plan-right for north up, front east, at 10:00 (+0.5577 on plan-left). Plan-left for north up, front west, at 14:00 (-0.5568). Plan-right for north up, front north, at 10:30 (+0.3827). Plan-right for the Sydney site (`Australia/Sydney`, latitude -33.87, longitude 151.21), front north, at 11:22 (+0.4255). Plan-left at midnight.
- Why it fails today: `shadedSide` does not exist.
- Implementation: `core/scene/entry-pose.ts`, `core/index.ts`.

### Cycle 5.2: the pose, and its agreement with the light

- Test files: `core/scene/entry-pose.test.ts` and `core/scene/entry-pose-daylight.test.ts` (new), in one RED commit.
- Test: "stands in front of the house, 30 degrees toward the given side and 20 degrees above, at the fit distance".
- Setup: bounds from (0, 0, 0) to (10000, 3000, -8000) in world millimetres. Fronts `(0, -1)`, `(0, 1)`, `(1, 0)`, `(-1, 0)`, and `(0.6, -0.8)`, each with both sides. A viewport of aspect 16/9 and a vertical field of view of 50 degrees.
- Assertion: the target is the center of the bounds. Let `F = (f.x, 0, -f.y)`, and let `S` be `(f.y, 0, f.x)` for plan-left and its opposite for plan-right. Let `h = cos 30° · F + sin 30° · S`. The unit vector from the target to the position equals `(cos 20° · h.x, sin 20°, cos 20° · h.z)` within 1e-9. The distance equals `cameraFitDistance(diagonal, viewport)`. `near` and `far` equal `cameraDepthRange(diagonal)`. All eight corners of the bounds project inside the frustum. Null and zero-size bounds give `DEFAULT_CAMERA_POSE`. In the daylight file, for each row of the side table, with the sun of `daylightSiteFor` and `sunWorldDirection` under that row's light: the camera is on the outward side of the front, and the side face it sees has the cosine the table gives for the chosen side, which is negative in every row.
- Why it fails today: `entryPose` does not exist.
- Implementation: `core/scene/entry-pose.ts`.

### Cycle 5.3: the live view opens and resets to the entry pose, and the harness does not move

- Test files: `bridge/react/frame-camera-entry.test.tsx` (new) and `bridge/react/near-wall-fade-entry-view.test.ts` (new), in one RED commit.
- Test: "fits the camera to the entry pose of the front while the user has not taken it, and again after Reset view, and keeps the present fit when no front is given".
- Setup: a fittable camera and the bounds of a closed room with a door in its south wall. Call `fitCameraToBounds` with a front and a side; call it without them. Take the navigation state of `use-scene-navigation` over, then reset it.
- Assertion: with a front and a side, the camera's position and target equal `entryPose(bounds, front, side, viewport)`, and after a user move and a reset they equal it again. Without them, the pose equals `frameSceneCamera(bounds, viewport)`, as the harness needs. The fade part is written against the interface of #744 once that is on `main`: build the framed scene of the room as `bridge/react/framed-scene-reconciler-near-wall-fade.test.ts` builds it, put the camera at `entryPose`, and run the fade update of the distance rule. The south wall's materials keep their baseline opacity. If #744's interface cannot express this test, the cycle stops and goes back to the orchestrator.
- Why it fails today: the fit takes no front and always uses `frameSceneCamera` (`bridge/react/fit-camera.ts:61-66`).
- Implementation: `bridge/react/fit-camera.ts`, `bridge/react/scene-camera-effects.tsx`, `bridge/react/webgpu-scene-view.tsx`.

### Cycle 5.4: the Entrance preset

- Test file: `bridge/react/scene-nav-toolbar-entrance.test.tsx` (new).
- Test: "offers an Entrance preset beside Doorway, with tooltips that tell them apart, and applies the entry pose".
- Setup: render the toolbar in orbit and in walk mode. Resolve the pose of a preset request for `'entrance'` with bounds, a front, and a side.
- Assertion: the "Entrance" button's tooltip says it looks at the front from outside. "Doorway" says it stands in a door and looks in. In walk mode "Entrance" is inert like the other presets. The request's pose equals `entryPose`.
- Why it fails today: there is no such preset (`bridge/react/scene-nav-toolbar.tsx:26-32`; `PresetChoice` at `:13`).
- Implementation: `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/scene-camera-effects.tsx`.

### Cycle 5.5: the first picture

- Test files: `e2e/tests/scene-live-view-visual-regression.spec.ts` (a new case and its baseline) and `e2e/tests/journeys/perceived-color-readout.spec.ts`.
- Test: "captures the first view of the drawn room from the front" (live view, no preset), and the perceived-color journey updated to the first view.
- Setup: the drawn room the live-view specs share, with a door in its south wall. No preset. Wait for the readiness attribute and a stable frame.
- Assertion: the canvas matches the new baseline `live-view-entry-webgpu` within the standing live-view tolerances (ADR-0171). The journey's click at the canvas center now lands on the near wall, which the distance rule leaves solid at the entry distance. The journey expects that wall's outer face.

Journeys and pictures: one new live-view baseline, rendered on the live-view job's runner. The same `-darwin` baseline serves the development machine. `live-view-top-down-webgpu` does not move, because it pins "Top down". No scene harness baseline moves, which cycle 5.3's no-front case guards. `e2e/tests/scene-camera-fit.spec.ts` checks that the model's proxies spread over at least 0.25 of the canvas height. The front view may spread them less than the corner view, so the pull request runs it and reports the reading. The pull request description carries captures of three plans.

Decision record: extends ADR-0204 with the shaded side, the pose, and the preset. It amends ADR-0075 (the pose the view opens on) and ADR-0083 (the new preset).

Leaves: walk mode at the entrance, the doorway preset at the entrance, and the whole building as the opening scope (specification, section 9).

## Order, and what runs side by side

```
documents
  1 opening time  ──> 2 opening light
  3 entrance guess ──> 4 entrance mark
  #744 design (24 November at the earliest) ──> #744 build ──> 5 view from the front (also after 1) ──> daylight default
```

- Every code pull request merges after the documents pull request.
- Pull requests 1 and 3 run side by side. They share only `core/index.ts`. Pull request 1 is the first to merge, as the owner's note on answer 4 asks.
- Pull request 2 starts when 1 has merged, and 4 when 3 has merged. 2 and 4 run side by side. The second to merge rebases, regenerates the schema at the next revision, and has the test author renumber the drift reminder case.
- Pull request 5 starts when the build of #744 is on `main`. It needs 1, and none of 2 to 4.
- Whether 3 and 4 land before 5 is open question 4. This plan assumes they do.

Files that more than one pull request of this plan edits:

| File                                                                                                                                                                                                | Edited by, in merge order                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `core/index.ts`                                                                                                                                                                                     | 1 and 3 as they merge, then 2 and 4, then 5 |
| `editor/shell/shell-providers.tsx`                                                                                                                                                                  | 1, 2                                        |
| `core/environment/opening-instant.ts`                                                                                                                                                               | 1, 2 (and read by 5)                        |
| `core/scene/front-direction.ts`                                                                                                                                                                     | 3, 4                                        |
| `core/model/types.ts`, `core/model/factories.ts`, `schema/`, `core/model/known-keys.json`, `core/format/generated/`, `tests/format/schema-drift.test.ts`                                            | 2 and 4 as they merge                       |
| `core/commands/handlers/register-all-project-commands.ts`, `core/commands/testing/project-command-samples.ts`, `core/commands/testing/extensions-fixture.ts`, `tests/format/cleared-fields.test.ts` | 2 and 4 as they merge                       |
| `bridge/index.ts`                                                                                                                                                                                   | 2 and 4 as they merge                       |
| `e2e/journey-coverage.json`                                                                                                                                                                         | 1, then 2 and 4 as they merge               |

## Merge points with the session layer and the kernel

The session layer plan (`docs/plans/2026-11-15-session-layer-and-document-identity.md`): its pull requests 1 to 5 are on `main`. Its next is pull request 6, the project index and the preview.

| Session layer pull request           | Shared with this plan                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6, the project index and the preview | `core/index.ts` only. This plan does not touch `core/export/svg/`, `storage/`, `session/`, or `app/`.                                                                                                                                                                                 |
| 9, the settings port                 | `editor/shell/shell-providers.tsx`, which is in its fence. Pull requests 1 and 2 change the one line that creates the environment store. The second to merge rebases.                                                                                                                 |
| 10, the Projects page                | The light is seeded once per opened project. A return from the Projects page to the project that is still open must not seed again and must not drop the light on screen. The shell test of cycle 1.6 holds the rule for a re-render. Pull request 10 adds the case of its own route. |
| 12, a project that does not open     | `core/repairs/` is a possible home for a repair of several marks, if the owner wants one (open question 6). A repair that drops a malformed opening light would be a write on the user's click.                                                                                       |

No pull request of this plan edits `session/`, `storage/`, `app/`, `src/`, `eslint.config.js`, `vitest.config.ts`, or `.github/workflows/`. Tests take the session constructor from `session/testing`.

The geometric kernel (#687; its plan is not on `main` yet). Files and duties shared with it:

| File or duty                                                                                                                      | Kernel pull requests                       | This plan                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `core/scene/front-direction.ts` (the tie tolerance moves into the one tolerance module)                                           | 2                                          | 3, 4                                        |
| `core/scene/scene-graph.ts`                                                                                                       | 6, 8, 9, 14                                | 4                                           |
| `core/scene/exterior-walls.ts` (read here, not edited)                                                                            | 6, 11                                      | the guess reads it                          |
| `core/commands/handlers/transform-commands.ts`                                                                                    | 6                                          | 4                                           |
| `core/commands/handlers/opening-commands.ts`                                                                                      | 18                                         | 4                                           |
| `core/model/types.ts`, `core/commands/testing/`                                                                                   | 14, 18                                     | 2, 4                                        |
| `core/model/factories.ts`, `schema/`, `core/model/known-keys.json`, `core/format/generated/`, `tests/format/schema-drift.test.ts` | 13 and 14 (version steps), 18 (a revision) | 2, 4 (revisions)                            |
| The version fixtures and the migrations keep `openingLight` and `entrance`                                                        | 13, 14                                     | 2, 4 when they land before the version step |
| `editor/shell/inspector.tsx`                                                                                                      | 4, 8, 14, 18                               | 4                                           |
| `core/index.ts`                                                                                                                   | most                                       | all                                         |
| `engine/scene/near-wall-transparency-enrollment.ts`, `near-wall-run-owner.ts`                                                     | 11, 13                                     | none; the build of #744 shares them         |

The second to merge rebases. A kernel version step that lands before pull request 2 or 4 resets the revision count, and the field becomes revision 1 of the new version. A field that lands before a kernel version step is in that version's schema. The coverage check then requires the new version's fixture under `tests/fixtures/projects/versions/` to carry it, and the kernel's migrations must keep it. Kernel pull requests 13 and 14 each owe a fixture with both fields and a migration test that keeps them.

The command layer's first pull request touches every handler file mechanically. Whichever of it and pull request 4 merges second rebases.

The build of #744 shares `bridge/react/webgpu-scene-view.tsx` and possibly `e2e/tests/journeys/perceived-color-readout.spec.ts` with pull request 5. If #744 already changes what that journey's click hits, pull request 5 starts from its version.

## Size

| Pull request               | Cycles |
| -------------------------- | ------ |
| 1, the opening time        | 7      |
| 2, the opening light       | 7      |
| 3, the entrance guess      | 3      |
| 4, the entrance mark       | 9      |
| 5, the view from the front | 5      |
| Total                      | 31     |

Estimate: 6 to 9 working days for one builder, not measured. Basis: the kernel plan's own rate after its review, about 5 to 8 cycles a day. Add four journeys, three story baseline renders on the runner, one live-view baseline, two schema rebases, and the reviews. Pull request 1 alone is about one to one and a half days. The estimate leaves out #744, whose design and build are their own, and the documents pull request. The longest chain is pull requests 3 and 4 (12 cycles). With 1 and 2 beside it, two builders finish them in about three days each, and 5 follows #744.

## Risks

- A RED that passes at once. The plan folds every guard assertion into the RED of the behavior it guards. If a test author still finds a RED green, the cycle stops and the orchestrator merges it into the next one.
- The opening time scans up to two dates minute by minute on each open, with the site resolved once per date. It runs once per opened project, not per frame. No time was measured.
- Several chosen minutes sit just above the threshold (cosine 0.5001). The tests compute the check with the project's own functions, so they hold. A later change to `solarPosition` moves them, and the tests then fail for a good reason.
- `America/New_York` and `Australia/Sydney` read the runtime's time zone data. The existing timezone tests of `core/environment/` rely on the same data.
- The schema revision numbers collide with any other lane that publishes a revision. The drift check catches it before the merge, and its reminder case must be renumbered by the test author.
- The story baselines render on the CI runner, not locally. Pull requests 2 and 4 use the refresh workflow.
- The new live-view baseline needs the live-view job's runner, and its frame depends on the fade of #744. A change to #744 after pull request 5 moves it.
- `e2e/tests/scene-camera-fit.spec.ts` may fall under its threshold with the front view. Then the threshold needs a new derivation in pull request 5, with its reason.
- The every-command test sees only the commands with samples. A later command that copies doors needs a sample that carries a marked door.
- The design of #744 may slip past 24 November, or may not accept the constraint of open question 5. Pull request 5 and the daylight default slip with it.
