# The first view of a project: the entrance, the first camera, and the light it opens in

Status: written on 2026-11-19 from the eight answers the project owner gave on 18 November 2026. Revised on 2026-11-20 with his two answers of 19 November on the entrance (rows 9 and 10 of the table below), and on 2026-11-22 with his answer 11 on the opening light and with the framing rule of the floor view (ADR-0222, amendment of 22 November). Section 4.2 lists the calls this document makes. They are working assumptions. Section 4.3 lists the questions still open for the owner. This document settles #627 (open the 3D view facing the front entrance) and #737 (remember a project's light). Every statement about the code was read from `main` at `1c02bbc5`. The paths and line numbers were checked again against `main` at `82170819` on 2026-11-20.

## Decisions of the owner, 18, 19, and 22 November 2026

On 18 November the owner took eight decisions in two dialogs. On 19 November he answered two more questions on the entrance, and on 22 November one on the opening light. The third column quotes his answer and the note recorded with it. For rows 9, 10, and 11, it gives the text of the option he chose. The fourth column says what this document takes from each answer. Where an answer needs a more exact reading, the fourth column points to a working assumption (section 4.2) or an open question (section 4.3).

| #   | Question                                                                                                                                                    | His answer and the recorded note                                                                                                                                                                                                                  | What this document takes from it                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where should a project record its front?                                                                                                                    | "On a door (Recommended)"                                                                                                                                                                                                                         | One door carries a mark that says it is the main entrance (section 5.2).                                                                                                                                                                                                                                                                 |
| 2   | With no door marked, which door is the entrance?                                                                                                            | "Widest hinged door, ground floor (Recommended)" (the widest swing or pivot door in an outside wall of the ground floor; this changes ADR-0193)                                                                                                   | The guess of section 5.2. What happens when the ground floor has no hinged door is answer 9. The order of the other floors is call 20.                                                                                                                                                                                                   |
| 3   | What should the 3D view show first?                                                                                                                         | "The front, off to one side (Recommended)" (30 degrees to the shaded side, 20 degrees above; "Reset view" and a new "Entrance" preset return to it)                                                                                               | The entry view of section 5.3. Which side counts as shaded for a house whose north is set is open question 1.                                                                                                                                                                                                                            |
| 4   | A view from the front fades the front wall. What should we do?                                                                                              | "Build the distance rule first (Recommended)" (#744 first; the view from the front lands with it, after his approval on 24 November at the earliest; until then the corner view stays; only the opening time can land this week)                  | The view from the front lands with the distance rule of #744. Until then the 3D view keeps opening on the corner view. Only the opening time lands in the week of 18 November (section 6). Building the rule ahead of the 3D scene stage of the refactor round is call 17. The constraint this document puts on #744 is open question 5. |
| 5   | With no stored light and a north set, when should a project open?                                                                                           | "A time chosen for the house (Recommended)" (this changes call 4 of the daylight specification)                                                                                                                                                   | The rule of section 5.4. Its thresholds and dates are those the option stated: the sun at least 25 degrees up, a cosine of at least 0.5 on the front, 20 March, then midsummer. The exact reading of the cosine is call 18, and the hemisphere and the last fallback are call 21.                                                        |
| 6   | What should a project store of its light?                                                                                                                   | "Time, date, and cloud cover (Recommended)"                                                                                                                                                                                                       | The time of day, the date, and the cloud cover, as a record of its own (section 5.5).                                                                                                                                                                                                                                                    |
| 7   | Where should the stored light be?                                                                                                                           | "In the project file (Recommended)"                                                                                                                                                                                                               | In the project document, so it travels with the file (section 5.5).                                                                                                                                                                                                                                                                      |
| 8   | When should Vernacular write the stored light?                                                                                                              | "Only on your click (Recommended)"                                                                                                                                                                                                                | Only when the user clicks "Use this light when the project opens" (section 5.5).                                                                                                                                                                                                                                                         |
| 9   | With no hinged door in an outside wall of the ground floor, does a ground-floor sliding door beat a hinged door upstairs?                                   | "Yes, floor ranks first (Recommended)" (the option read: the guess looks at the floor first, then at the door type; a house with only a sliding door on the ground floor opens at that door)                                                      | Rule 2 of the guess, the ground floor first, ranks before rule 3, the door family (section 5.2). Call 19 of section 4.2 states the same rule.                                                                                                                                                                                            |
| 10  | The entrance work has three pull requests: the guess, the mark, and the view from the front. Do the guess and the mark land before the view from the front? | "Yes, each when ready (Recommended)" (the option read: the guess and the mark merge when each is built and reviewed; they do not wait for the distance fade of #744; the view from the front follows later)                                       | The guess and the mark each merge once built and reviewed, the mark after the guess. Neither waits for #744. The view from the front lands after both (section 6).                                                                                                                                                                       |
| 11  | On opening, does the light on screen follow a change of the site or the entrance while the user has not touched the light? (open question 2)                | "(a) Seed once (Recommended)" (the option read: the light is seeded once when a project opens, and only the light controls change it after that; a site or entrance edit does not move it; a new location shows its chosen time at the next open) | Call 9 stands as built: the light on screen is seeded once per opened project (section 5.4). The other answer, following edits until the first light control is moved, is rejected.                                                                                                                                                      |

The same evening the owner took a rule for new optional fields in the kernel design: "Schema revisions, no fallback (Recommended)". The record of his answers says that the same rule holds for the two fields here (section 5.6).

## 1. Why this document exists

Two issues of the public beta decide what a user sees when the 3D view opens.

| Issue | Problem                                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| #627  | The 3D view opens on a generic corner view. Nothing in the model or the application knows which door is the entrance.                        |
| #737  | The time of day, the date, and the weather go back to one default each time a project opens. The owner reopened that decision on 2026-11-15. |

They are one design because the daylight specification (`docs/specs/2026-11-15-daylight-and-shadow.md`) ties them together. The first camera and the first light read one front direction (its section 6.1). A first view that faces the front is one of the conditions for daylight as the default view (its section 7). Its decision 7, that a project remembers no light, stood only until #737 was settled.

Today, on `main` at `82170819`:

- The first camera is a fit of the whole view. While the user has not taken the camera, `FrameCamera` fits the scene bounds (`bridge/react/scene-camera-effects.tsx:20-28`, mounted at `bridge/react/webgpu-scene-view.tsx:73`). The pose stands along the direction (1, 1, 1) from the center of the bounds (`frameSceneCamera`, `core/scene/camera-framing.ts:70-84`). That is above the plan-right, plan-down corner, looking down at about 35 degrees.
- The scene harness uses the same fit. It calls `fitCameraToBounds` for every state without a camera override (`bridge/react/scene-harness-view.tsx:90`). The function says it is shared by the live view and the harness (`bridge/react/fit-camera.ts:55-59`).
- "Reset view" clears user control, and the same fit applies again (`resetView`, `bridge/react/use-scene-navigation.ts:39-42`). A mount that finds a saved camera starts under user control (`:27-31`). Only a pane under user control leaves a camera behind (`:102-119`). So a return from the plan view keeps the camera when the user had steered it or applied a preset. Otherwise the fit applies again.
- The presets are "Top down" and four elevations (`core/scene/camera-presets.ts:14`, `:36-56`; buttons at `bridge/react/scene-nav-toolbar.tsx:26-32`). There is also a doorway view that stands inside a door and looks into the model (`doorwayPose`, `core/scene/camera-presets.ts:74`). It takes the selected door, or the first door in view (`chooseDoorwayTarget`, `bridge/react/use-doorway-target.ts:57-71`).
- In orbit, an exterior wall fades to an opacity of 0.1 when two things hold. The camera is outside the room outlines or above the building top, and it is on the outward side of the wall. Distance plays no part (`bridge/react/near-wall-fade.tsx:55`, `core/scene/camera-outside-building.ts:36-39`, `engine/scene/near-wall-transparency.ts:9`, `:103-109`). The fade works by exterior run (ADR-0086, note of 2026-11-17). It is binary (ADR-0086). A fade that changes a draw flag marks the material for a rebuild of its shader (`setDrawFlags`, `engine/scene/near-wall-transparency.ts:356-367`; ADR-0086, note of 2026-11-19).
- The fade is on by default: `revealInterior: true` (`bridge/scene-session/scene-session-store.ts:55`) and `enabled={nav.mode === 'orbit' && nav.revealInterior}` (`bridge/react/webgpu-scene-view.tsx:173-178`). The corner view stands outside the plan-right and plan-down walls. So those walls fade in every first view today, and the rooms show. A faded wall takes no click (ADR-0086, note of 2026-11-15; ADR-0056).
- Walk mode starts where the orbit camera stands, at an eye height of 1700 mm above the active floor (`seedWalkState`, `bridge/react/walk-session.ts:59-77`; `WALK_EYE_HEIGHT_MM`, `core/scene/walk-camera.ts:5`).
- A door is an `Opening` with an id, a type, a host wall, a position, and a size (`core/model/types.ts:102-118`). It has no field for a role. Opening ids are unique within a floor, not within the project (format specification, section 4.2). The scene node id is `opening:<id>`, with the floor in a separate field (`core/scene/scene-graph.ts:244-247`).
- `frontDirection` returns the outward normal of the exterior run that hosts the widest exterior door, of any door family, on any floor (`core/scene/front-direction.ts:67-76`; exterior runs since ADR-0218). Its tie rules are in `beats` (`:31-42`). Its input is `Pick<SceneGraph, 'walls' | 'rooms' | 'openings'>` (`:11`). The live view reads it for the whole project through `useFrontDirection` (`bridge/react/use-front-direction.ts:13-16`).
- `openingInstant` returns 20 March 2026 at 10:30 for every input (`core/environment/opening-instant.ts:13-16`). An architecture test keeps the fixed instant out of every file but its owners (`tests/architecture/opening-instant-seam.test.ts:13-17`).
- The light on screen is window state. `EnvironmentState` holds the mode, the instant, the cloud cover, and the color check (`core/environment/environment-state.ts:16-28`). Its store starts from one constant (`bridge/environment/environment-session-store.ts:9-10`). It is created once per editor shell (`editor/shell/shell-providers.tsx:89`). The shell remounts when a new session arrives, because `EditorWorkspace` keys the subtree on the session (`app/app.tsx:237`, `:246`; `app/use-session-key.ts`). So each opened project starts from the default.
- The Environment panel shows the instant as `YYYY-MM-DD hh:mm` (`formatObservationDateTime`, `core/environment/observation-time.ts:95-97`, used at `editor/environment/environment-panel.tsx:145`).
- The document holds saved environment scenes, each a name with a time and weather (`core/model/environment-scene.ts:23-31`, `core/model/types.ts:310`). They are applied by hand. Applying one leaves the mode and the color check alone (`applyEnvironmentScene`, `core/environment/environment-state.ts:49-59`). A scene without weather applies `DEFAULT_CLOUD_COVER`, which is 0 (`:56`; `core/environment/sky-model.ts:33`).
- The settings port is on `main` (ADR-0180; `session/settings/settings-service.ts`, `bridge/react/settings-context.ts`). The snap preferences are kept through it (`editor/plan/snap-preferences-store.ts`).
- The document is at schema version 17, revision 1 (`CURRENT_SCHEMA_VERSION` and `CURRENT_SCHEMA_REVISION`, `core/model/factories.ts:43`, `:49`). The codec reads and writes `meta.schemaRevision` (`core/format/codec/revision.ts`, `core/format/codec/encode-document.ts`). Revision 1 is published at `schema/17/revision-1/vernacular.schema.json`. In that schema, `EnvironmentScene.observedAt` is a plain string.

What the user should see: the 3D view opens from the front of the house, with the entrance side toward the camera. A project opens in the light its owner chose for it, on any computer. With no light chosen, a house whose north is set opens at a time when its front takes sun, where the sky allows that.

Names used here. The main entrance is the one door a project marks. The front is the outward direction of the entrance door's wall. The entry view is the camera pose the 3D view opens on. The opening light is the time, date, and weather stored in the document. The distance rule is the fade rule that #744 designs. In it, the camera's distance decides whether a wall fades.

## 2. Goals, non-goals, and anti-goals

Goals:

1. The first 3D view faces the front of the house.
2. The first camera and the first light read the same front, so they cannot disagree.
3. A user can say which door is the entrance, and the guess is right for most houses without that.
4. A user can return to the entry view.
5. A project can remember the light it opens in, and it opens in that light on every computer.
6. With nothing stored, a house whose north is set opens at a time that suits it, under the true sun.

Non-goals:

- The switch of the default style to daylight, the drafting style, and the quality levels. They are the daylight default work (section 9).
- The design of the distance rule. #744 designs it. This document states the one constraint the entry view puts on it (section 5.3).
- Walk mode that starts at the entrance. Section 9 lists it as later work.
- A plan symbol for the entrance. The plan drawing work owns plan symbols.
- More than one named entrance, and entrances per building.
- Remembering the camera between sessions.

Anti-goals:

- A first view and a first light that take different sides of the house for the front.
- A document that changes because the user moved the time slider.
- A stored light that makes sample daylight look like the true sun. The sample notice stays, whatever is stored.
- A sun that is turned to flatter a located house. A real location keeps the true sun.
- A file format change that does not follow ADR-0178.
- Interim code in the fade that a later design removes.

## 3. Constraints

- The hard invariants in `.claude/rules.md` apply. The front, the entry pose, the shaded side, and the opening light rule are pure functions in `core/`. Every change to the document goes through `dispatch`.
- The daylight specification stands where this document does not say otherwise. The true-sun rule for a located site, the sample notice, the implied north, and the gates of its section 6.9 do not change. Every gate there pins its own instant and camera, for example `observedAt` in each state of `app/harness-environment.ts`. So no scene harness baseline moves because of this work.
- The design fits the session layer specification (`docs/specs/2026-11-15-session-layer-and-document-identity.md`). The document handle holds no camera and no view state (its section 5.4, point 2, and section 5.12, point 2). So the light on screen stays window state. Every change to a document goes through `dispatch` (section 5.12, point 3). A new field must be in the bundled schema, because the strict check refuses a field it does not know (ADR-0190).
- A new optional field is a schema revision (ADR-0178). It raises `schemaRevision` and needs no migration step. There is no fallback to a version step. A revision makes additive changes only, so it must not tighten what an earlier revision accepted.
- No new runtime dependency.

## 4. Decisions

### 4.1 Taken by the owner

See the table "Decisions of the owner, 18, 19, and 22 November 2026" at the top. Numbers 1 to 8 are the question numbers of the two dialogs of 18 November. Numbers 9 and 10 are his answers of 19 November, which settled open questions 3 and 4 of section 4.3. Number 11 is his answer of 22 November, which settled open question 2.

### 4.2 Calls this document makes

The owner did not take these, apart from call 19, which his answer 9 settled, and call 9, which his answer 11 settled. Each of the others is a working assumption that a reviewer or the owner can change without reopening his answers. Calls 7 and 26 rest on the recommended answer to an open question of section 4.3.

| #   | Call                                                                                                                                                                                                                                                                                        | Section |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | The mark is a field on the door, `entrance: true`, and not a reference from the project to a door id.                                                                                                                                                                                       | 5.2     |
| 2   | One function in `core/` names the entrance door: the first marked door in document order, else the guess. Every reader calls it. Setting the mark clears every other mark. Clearing removes every `entrance` key. A test checks the rule after every registered command.                    | 5.2     |
| 3   | Only a door can be marked. A marked door wins over the guess, also when its wall is not an exterior run.                                                                                                                                                                                    | 5.2     |
| 4   | Every handler that adds openings from its parameters drops the mark: paste, add opening, and add floor. A change of type to a window drops it. Handlers that move or rewrite existing openings keep it.                                                                                     | 5.2     |
| 5   | A floor with no floor node in the input of the front function counts as at grade.                                                                                                                                                                                                           | 5.2     |
| 6   | The entry view frames what the 3D view shows: the active floor in the floor view, which also draws the floors below, and the whole building in the building view (ADR-0222, amendment of 22 November). The default scope does not change.                                                   | 5.3     |
| 7   | The entry view turns toward the side whose face takes the lower sun cosine under the light the project opened in. The side is chosen once when the project opens. With the sun below the horizon, or the two sides equal within 1e-9, it turns to plan-left of the front (open question 1). | 5.3     |
| 8   | The scene harness keeps its present camera, so no scene baseline moves.                                                                                                                                                                                                                     | 5.3     |
| 9   | The light on screen is seeded once when a project opens. Later edits of the plan, the site, the entrance, or the stored light do not move it (answer 11).                                                                                                                                   | 5.4     |
| 10  | A site whose north is implied from the front keeps the fixed instant. The scan runs in steps of one minute, the step of the time slider. Of two qualifying minutes equally near 10:30, the earlier wins. The sky is clear.                                                                  | 5.4     |
| 11  | A scene and the opening light share one value type in the code. The published schema of a scene does not change.                                                                                                                                                                            | 5.5     |
| 12  | A stored opening light wins over the sample rule, also when it leaves the front in shade under sample daylight.                                                                                                                                                                             | 5.4     |
| 13  | The control for the opening light is its own component under the Environment panel, in the Environment section of the tool rail. The panel's story baselines do not move.                                                                                                                   | 5.5     |
| 14  | The wording of the controls and notices in section 5, other than the button label of answer 8.                                                                                                                                                                                              | 5       |
| 15  | Each part with no format change lands as its own pull request first. The two format changes are two revisions, in either order.                                                                                                                                                             | 5.6, 6  |
| 16  | The view from the front adds one live-view baseline of the first view, with no preset, as the proof of the first picture.                                                                                                                                                                   | 7       |
| 17  | The distance rule of #744 is built ahead of the 3D scene stage of the refactor round, apart from the other refinements of #256. The option the owner chose was worded that way in his brief. Its record amends section 6 of the round specification.                                        | 5.3, 11 |
| 18  | The cosine of the opening rule is the dot product of the unit vector toward the sun, in three dimensions, with the front's unit outward normal laid in the ground plane. That is the cosine of the daylight specification's sample daylight gate.                                           | 5.4     |
| 19  | The floor ranks before the door family in the guess. A ground-floor sliding door beats a hinged door upstairs. The owner settled this on 19 November (answer 9), so it is no longer a working assumption.                                                                                   | 5.2     |
| 20  | The order of the floors in the guess: floors at or above grade from the lowest up, then floors below grade from the highest down. Floors at one elevation are one level.                                                                                                                    | 5.2     |
| 21  | The midsummer of the opening rule is the summer solstice of the site's hemisphere: 21 June at latitude 0 or more, 21 December below it. When no minute of either day qualifies, the fixed instant applies.                                                                                  | 5.4     |
| 22  | The front of a marked door on a wall that is not an exterior run points away from the center of its floor's walls, with two tie rules.                                                                                                                                                      | 5.2     |
| 23  | A stored light counts only when its `observedAt` has the exact stored shape. Otherwise the rules that follow apply.                                                                                                                                                                         | 5.4     |
| 24  | Setting the opening light keeps the `extensions` of the record it replaces.                                                                                                                                                                                                                 | 5.5     |
| 25  | The mark also has a command in the palette, enabled when one door is selected.                                                                                                                                                                                                              | 5.2     |
| 26  | The constraint on #744: at the entry distance, the front wall is not faded, for a house of any size (open question 5).                                                                                                                                                                      | 5.3     |
| 27  | `openingInstant` keeps its signature and returns the fixed instant for every input. Only `openingConditions` reads the front.                                                                                                                                                               | 5.4     |
| 28  | The inspector matches the entrance door by its floor and its id together.                                                                                                                                                                                                                   | 5.2     |

### 4.3 Open questions for the owner

The document is written on the recommended answer of each question still open. The first option is the recommended one. Questions 3 and 4 were settled on 19 November, and question 2 on 22 November. They stay in the list so that the numbers of the others do not change.

1. Answer 3 says "the shaded side". For a house whose north is set, which side is that? Under answer 5 such a house opens at a time chosen for its front, and a fixed side is then often in the sun. For example, an east front with north up opens at 10:00 on 20 March, and the plan-left side (south) then takes the sun at a cosine of +0.56. (a) The side that the light the project opened in leaves in more shade, chosen once at open (call 7). (b) Always plan-left of the front, which is shaded only under sample daylight with an implied north. It changes the side input of the entry pose.
2. Settled on 22 November (answer 11), on option (a). The light on screen does not follow a change of the site or the entrance while the user has not touched the light. (a) No. It is seeded once when the project opens, and only the controls change it (call 9). A new location shows its chosen time at the next open. (b) Yes, until the user first moves a light control. It changes one test of the opening time and adds one behavior.
3. Settled on 19 November (answer 9). With no hinged door in an outside wall of the ground floor, a ground-floor sliding door beats a hinged door upstairs: the floor ranks first.
4. Settled on 19 November (answer 10). The guess and the mark land before the view from the front, each when it is built and reviewed.
5. For the design of #744: the entry view needs the front wall solid at the entry distance for a house of any size. That rules out a fixed distance in millimetres. (a) Accept it as a fixed constraint of #744, which then measures relative to the model or the orbit target (call 26). (b) Leave it open, and accept that answer 4 may reopen when #744 is designed.
6. A file with several marks. It can come from an edit outside Vernacular, or from a build older than the mark: such a build keeps the unknown field, and its paste copies it. (a) No report yet. The first marked door in document order wins everywhere, the next edit of the mark heals the file, and a check that counts marks is ready for the load checks of the command layer. (b) A notice when the project opens, which edits the document handle of the session layer.
   Settled on 21 November on option (a), by the builder, since the issue left the choice open (ADR-0204, extension of 21 November). The owner can still overrule it.
7. Which later items of section 9 get an issue now? (a) All five, in the `1.0` milestone, since none blocks the beta. (b) Only some, or later.

## 5. The design

### 5.1 What a user sees

1. The 3D view opens from the front. The entrance side faces the camera, a little to one side and from a little above. The side in view is the one the opening light leaves in shade. The shadow on the lawn shows once daylight is the default style.
2. "Reset view" returns to that view. The camera presets gain "Entrance", which goes there too. The tooltips of "Entrance" and "Doorway" say which is which. "Entrance" looks at the front from outside. "Doorway" stands in a door and looks in.
3. Walk mode still starts where the orbit camera stands. After this work that is outside the front, not at the corner.
4. The inspector of a door has a "Main entrance" checkbox. With no door marked, the door that Vernacular takes for the entrance says so.
5. Under the Environment panel, a control reads "Use this light when the project opens". A line beside it says what is stored, or that the project opens in the default light.
6. A project with a stored light opens in it on any computer, also after export and import.
7. A project whose north is set and that has no stored light opens at a time when its front takes sun, if the sky gives one.

Items 1 to 3 wait for the distance rule of #744 (answer 4). Items 4 to 7 do not (section 6).

### 5.2 The entrance: the mark and the guess

One function in `core/` answers which door is the entrance and where the front is. It grows from `frontDirection` (`core/scene/front-direction.ts`). The entry view, the sun, and the door inspector all read it. Section 6.1 of the daylight specification requires that for the camera and the sun.

```ts
// core/scene/front-direction.ts
interface Entrance {
  readonly door: OpeningSceneNode | undefined // undefined: no exterior door and no mark
  readonly source: 'marked' | 'guessed' | 'none'
  readonly front: PlanDirection
}
function entranceOf(input: FrontDirectionInput): Entrance
function frontDirection(input: FrontDirectionInput): PlanDirection // entranceOf(input).front
```

`FrontDirectionInput` gains the floor nodes and the grade as optional fields:

```ts
type FrontDirectionInput = Pick<SceneGraph, 'walls' | 'rooms' | 'openings'> &
  Partial<Pick<SceneGraph, 'nodes' | 'gradeElevation'>>
```

`SceneGraph.nodes` holds each floor's elevation (`core/scene/scene-graph.ts:35-40`, `:178`). `SceneGraph.gradeElevation` holds the grade (`:192`). `useFrontDirection` and the harness already pass a whole scene graph (`bridge/react/use-front-direction.ts:15`, `bridge/react/scene-harness-view.tsx:270`), so they need no change. Hand-built inputs in tests keep working, because the new fields are optional (call 5).

The mark (answer 1). `Opening` gains an optional field:

```ts
interface Opening {
  // ...
  /** True on the one door that is the project's main entrance. Absent on every other opening. */
  entrance?: true
}
```

- The scene graph copies the field to the opening node (`OpeningSceneNode`, `core/scene/scene-graph.ts:105`).
- A field on the door needs no reference. A reference from the project would need a floor id and an opening id, because opening ids are unique only within a floor. It would also name a missing door after a delete. The field moves with its door and is deleted with it. An undo of the delete brings both back. Three handlers remove openings today: remove opening (`core/commands/handlers/opening-commands.ts:271`), delete selection (`core/commands/handlers/transform-commands.ts:30-43`), and remove floor (`core/commands/handlers/project-commands.ts:232`). They need no change.
- The trade: the shape of the file does not hold "at most one". Commands hold it, in kind with ADR-0179. Setting the mark clears every other mark in the same step.
- Handlers that add openings from their parameters drop `entrance` (call 4). The paste handler drops it, because `instantiateClipboard` copies every field (`core/clipboard/clipboard.ts:116`) and the paste handler appends the copies unchanged (`core/commands/handlers/transform-commands.ts:157-165`). The add opening handler drops it (`core/commands/handlers/opening-commands.ts:52`). So does the add floor handler (`core/commands/handlers/project-commands.ts:226`).
- A change of type to a window drops the mark in `retypeOpening` (`core/commands/handlers/opening-commands.ts:232-246`), which spreads every field today. The mark carries only from a door to a door.
- A test runs every registered command through the samples of `core/commands/testing/command-samples.ts`. It checks that at most one door is marked after each.
- `entranceOf` names the first marked door in document order: floors in order, then openings in order within a floor. The inspector and the handlers call it too. Only that door shows the box ticked. The inspector matches it by floor and id together, because ids repeat across floors (call 28). Clearing the mark removes every `entrance` key. A mark on an opening that is not a door is ignored.
- A file with several marks passes the strict check, because the schema cannot say "at most one". It opens, and `entranceOf` names the first. The next command that sets or clears the mark removes every extra mark. So the file heals with the first edit of the entrance.
- Such a file can come from an edit outside Vernacular. It can also come from a build older than the mark. That build reads the file tolerantly and keeps the unknown field (ADR-0178), and its paste copies every field. A paste appends to the end of a floor's openings, so the original door stays first on its floor. The copy wins only when it lands on an earlier floor.
- ADR-0179 says that loading reports a document that breaks a rule. It leaves to the command layer specification whether anything is repaired. No load-time report exists on `main` for any rule. The handle raises only `'saved-by-newer-build'` and `'saved-with-faults'` (`session/handle/handle-types.ts:19`). This document adds a pure check that counts marked doors. Whether a report comes now or with the load checks of the command layer is open question 6.
- Two commands: mark a door as the main entrance, and clear the mark. Both reassign `floors` whole, which is what the undo capture records (`core/commands/inverse-capture.ts:10-15`).
- The control is a checkbox, "Main entrance", in the door inspector (`OpeningInspector`, `editor/plan/opening-inspector.tsx:264`, mounted at `editor/shell/inspector.tsx:394`). There is also a command in the palette, enabled when one door is selected (call 25).

The front of a marked door is the outward normal of its exterior run. Its wall may not be on an exterior run, for example while the rooms are not closed yet. Then the front is chosen as follows (call 22). Let c be the center of the bounds of the endpoints of all walls on the door's floor, and p the door's center. Of the wall's two unit normals, the one n with n · (p − c) > 0 wins. When the two normals are equal within 1e-9 millimetres on that measure, the normal nearer plan-down wins. When they are equal on that too, the normal nearer plan-right wins.

The guess (answer 2). With no mark, `entranceOf` picks a door by these rules, in order:

1. Doors on exterior runs only, as today (ADR-0218).
2. The ground floor first. The floors form levels by elevation. Every floor at the lowest elevation at or above the grade is on the ground level. That is the same test that hides a floor below grade in the building view (`hiddenFloorIds`, `bridge/react/view-scene-graph.ts:22-30`). A floor with no node counts as at grade (call 5). When the ground level has no exterior door, the next level counts, in this order: the levels above grade from the lowest up, then the levels below grade from the highest down (call 20). Within one level, every floor's doors compete under rules 3 to 5.
3. Doors of the `swing` and `pivot` families before doors of the `slide`, `fold`, and `cased` families. The registry has these five door families (`core/registries/opening-kind.ts:7-13`). Rule 2 ranks before rule 3 (answer 9).
4. The widest. Then the one that faces nearest plan-down. Then the id that sorts first. These three are the rules of ADR-0193, unchanged (`core/scene/front-direction.ts:31-42`). Then the floor that comes first in document order, since ids repeat across floors.
5. With no exterior door, plan-down.

Rules 2 and 3 are new. They stop a balcony door, a basement door, or a wide sliding door from being taken for the entrance. A wide pair of swing doors at the back still wins over a narrower front door. In the registry a double door and a French door are 1626 mm wide by default, and a single door is 813 mm (`core/registries/element-types.ts:81`, `:94`, `:110`). On an existing project whose widest exterior door is sliding, upstairs, or in a basement, the guess and the sample sun turn when this lands.

The existing test that lets an upper-floor door win over a narrower ground-floor door keeps passing (`core/scene/front-direction.test.ts:316-338`). Its hand-built input has no floor nodes, so both floors count as at grade. For a derived graph of the same plan, the ground door now wins.

No rule was measured against drawn plans that could test it. The five drawn projects of the test corpus (`tests/fixtures/projects/corpus/`) have one floor and single swing doors, so they cannot test rules 2 and 3.

When the guess is in use, the inspector of the guessed door shows the checkbox unticked. Beside it is the line "Vernacular treats this door as the entrance until one is marked." Ticking the box marks it.

The guess can move when the user adds a door, and the sample sun moves with it. ADR-0193 records that. A mark ends it.

Left to the builder: the command names, the name of the field on the scene node, and the name of the check that counts marked doors.

The builder chose these on 21 November (ADR-0204). The commands are `project/mark-main-entrance` and `project/clear-main-entrance`, built by `markMainEntrance(floorId, openingId)` and `clearMainEntrance()`. The scene node field is `entrance`, the same as the document field. The check is `countMarkedDoors`. The palette command has the id `mark-main-entrance` and the label "Mark as main entrance". The entrance role of a door in the inspector comes from `entranceRoleOf`, and `entranceOf` is called from the editor through `selectedOpeningContext` and the palette command in `editor/commands/entrance-commands.ts`, with no `use-entrance` hook.

### 5.3 The entry view

The entry view (answer 3) replaces the corner view as the pose the live 3D view opens on and returns to. It lands with the distance rule of #744 (answer 4), not before.

```ts
// core/scene/, beside the presets
type Side = 'left' | 'right' // of the front, in plan
function shadedSide(input: {
  site: Site | undefined
  front: PlanDirection
  light: OpeningConditions
}): Side
function entryPose(
  bounds: Bounds3 | null,
  front: PlanDirection,
  side: Side,
  viewport?: CameraViewport,
): CameraPose
```

- Target: the center of the framing box, which in the floor view is the box of the active floor. That is the target of `frameSceneCamera` today. So the orbit pivot, which follows the target of the framed pose until the user steers (`bridge/react/webgpu-scene-view.tsx:84-89`), does not move.
- The side (call 7, on the recommended answer to open question 1). Plan-left of the front is the plan vector `(front.y, -front.x)`, and plan-right is its opposite. `shadedSide` takes the light the project opened in (section 5.4). It computes the sun as the light on screen does, through `daylightSiteFor` and `sunWorldDirection` (`core/environment/sun-world-direction.ts:17`). It returns the side whose face takes the lower cosine. With the sun below the horizon, or the two cosines equal within 1e-9, it returns plan-left. The side is chosen once when the project opens, like the light.
- Direction: start from the front, as the world vector `(front.x, 0, -front.y)` (plan north is world -Z; `planToWorld`, `core/scene/plan-to-world.ts:22-27`). Turn 30 degrees about the vertical toward the side's world vector. For plan-left that is `(front.y, 0, front.x)`. Then raise the camera so that it looks down at 20 degrees.
- Distance: the fit distance of the framing box, as the presets use it (`cameraFitDistance`, `core/scene/camera-framing.ts:89-92`), with the live viewport. The near and far planes come from `cameraDepthRange` over the box of everything drawn, so the floors below the frame still render.
- An empty or zero-size scene returns the fixed default pose, as today.

The side under the rule, computed with the project's own sun code:

| Site and front                                                     | Opening light   | Plan-left cosine | Plan-right cosine | Side       |
| ------------------------------------------------------------------ | --------------- | ---------------- | ----------------- | ---------- |
| No site (implied north), any front                                 | 20 March, 10:30 | -0.3827          | +0.3827           | Plan-left  |
| North up, front east                                               | 20 March, 10:00 | +0.5577          | -0.5577           | Plan-right |
| North up, front west                                               | 20 March, 14:00 | -0.5568          | +0.5568           | Plan-left  |
| North up, front north (no minute qualifies)                        | 20 March, 10:30 | +0.3827          | -0.3827           | Plan-right |
| Latitude -33.87, longitude 151.21, `Australia/Sydney`, front north | 20 March, 11:22 | +0.4255          | -0.4255           | Plan-right |

The two angles come from the recorded note of answer 3. They were not measured on drawn plans. At 30 degrees the front keeps about 87 percent of its width on screen, and the side shows at half its depth. The pull request shows captures of three plans at these values.

The door is not centered. The pose frames what the view shows, so the door sits where it is on the front.

Where it applies:

- The live view applies `entryPose` wherever it applies the fit today: the first frame, each refit while the user has not taken the camera, and "Reset view". That fit is `FrameCamera` (`bridge/react/scene-camera-effects.tsx:29-39`), which frames the framing box with `frameSceneCamera` and takes the near and far planes from the box of everything drawn with `withDepthRangeOf`. `entryPose` replaces the `frameSceneCamera` call there. `fitCameraToBounds` (`bridge/react/fit-camera.ts:69-75`) does not change, so the harness, which calls it (`bridge/react/scene-harness-view.tsx:90`), keeps its present pose (call 8).
- A new preset, "Entrance", applies the same pose from the preset row (`bridge/react/scene-nav-toolbar.tsx:26-32`). Like every preset it is inert in walk mode.
- The harness keeps `frameSceneCamera` and its pinned poses (`bridge/react/framed-scene.ts:86`, `:181`).
- The front comes from the whole project, through `useFrontDirection`. The pose frames the active floor in the default floor scope (`scope: 'floor'`, `bridge/scene-session/scene-session-store.ts:58`; ADR-0222, amendment of 22 November). So the view of an upper floor also opens from the front of the house (call 6).

The entry view and the wall fade (answer 4). The front wall must be solid in the entry view. Under the present rule it is not. The entry view stands on the outward side of the front wall, outside the rooms. So that wall and its door fade to 0.1 (section 1). No camera position avoids it. Any camera that sees the front from outside is on its outward side. A camera above the building top also counts as outside.

So the distance rule of #744 is designed and built first, and the entry view lands after it. The corner view stays the first view until then. The rule is built ahead of the 3D scene stage of the refactor round (call 17).

This document puts one constraint on #744 (call 26, open question 5). At the entry distance, the front wall of the entry view is not faded, for a house of any size. The entry distance grows with the model, so a fixed distance in millimetres cannot meet it. The measure must be relative to the model or to the orbit target. The rest of the design of #744 is its own: the shape of the fade, how it combines with the direction test, what fades with a wall, walk mode and the presets, and the meaning of "Reveal interior". Its decision record amends ADR-0086 and its notes, and ADR-0056, since what a click hits follows the fade. It also amends section 6 of the refactor round specification. That record is not one of the two records of this document.

This document adds no hold on the fade and no other interim rule.

Left to the builder: where the pose and the side are held in the bridge, and the name of the preset in code.

### 5.4 The light a project opens in

One pure function in `core/` gives the time and weather a project opens in. It lives beside `openingInstant` in `core/environment/opening-instant.ts`. So the architecture test of the seam keeps its list of owners (`tests/architecture/opening-instant-seam.test.ts:13-17`).

```ts
interface OpeningConditionsInput {
  readonly site: Site | undefined
  readonly front: PlanDirection
  readonly stored?: ViewingConditions // section 5.5; absent until the opening light lands
}
interface OpeningConditions {
  readonly observedAt: ObservationInstant
  readonly cloudCover: number
}
function openingConditions(input: OpeningConditionsInput): OpeningConditions
```

`openingInstant(input)` keeps its signature and returns the fixed instant for every input, located or not (call 27). Only `openingConditions` reads the front. The callers of `openingInstant` do not change: the default state (`core/environment/environment-state.ts:25`), the harness (`app/harness-environment.ts:239`), and the parameter default of `SceneLighting` (`bridge/react/scene-lighting.tsx:154`).

The rules, in order:

1. A stored opening light wins (section 5.5), when its `observedAt` passes `isObservationInstantIso` (`core/environment/observation-time.ts:76`). A stored light without `weather` opens at `DEFAULT_CLOUD_COVER`. A stored light whose `observedAt` fails the check counts as absent, and rules 2 and 3 apply (call 23). The stored light wins also under sample daylight, where it can leave the front in shade (call 12). The anti-goal of the daylight specification about a shaded entrance concerns the default, not a light the user chose.
2. A site whose north is implied from the front gets the fixed instant, 20 March 2026 at 10:30, with `DEFAULT_CLOUD_COVER`. Sample daylight already turns that sun to the front. That covers no site, an empty site, and a site with neither a usable location nor a usable bearing. That is the last row of the table in ADR-0193, where a value that is not finite counts as missing.
3. Any other site gets a time chosen for the house (answer 5). That covers a real location, and also the sample place with a stored bearing (`'location'` in ADR-0193). The rule is stated below.

The time chosen for the house:

- The scan tries 20 March 2026 first. If no minute of that date qualifies, it tries the summer solstice of the site's hemisphere: 21 June 2026 at latitude 0 or more, 21 December 2026 below 0. If no minute of that date qualifies either, it returns the fixed instant (call 21).
- For each scanned date, it resolves `daylightSiteFor(site, front, date)` once (`core/environment/daylight-site.ts`). That gives the place, the north bearing, and the UTC offset. The offset is the one the live view uses: one offset per date, sampled at 12:00 UTC (`core/environment/timezone-offset.ts:38-43`).
- It tries the minutes of that civil date from 00:00 to 23:59, in steps of one minute.
- A minute qualifies when two things hold (call 18). The sun is at least 25 degrees up. And the unit vector toward the sun has a dot product of at least 0.5 with the front's unit outward normal laid in the ground plane. The vector toward the sun is `sunWorldDirection(solarPosition(...), northBearing)`, and the front's normal in the world is `(front.x, 0, -front.y)`. That is the cosine of the sample daylight gate of the daylight specification (its section 6.9).
- Of the qualifying minutes, it takes the one with the least `|minutesSinceMidnight - 630|` on the same civil date. There is no wrap past midnight. Of two equally near, the earlier wins (call 10).
- The cloud cover is `DEFAULT_CLOUD_COVER`.

A house whose front already takes good sun at 10:30 therefore opens at 10:30, like a project with no location. The time moves only as far as the house needs.

The two thresholds come from the daylight specification. Its sample daylight gate asks for a cosine of at least 0.5 on the front (section 6.9). Its calibration turns the light warm below about 20 degrees of sun height (section 6.2). 25 degrees keeps clear of that.

What the rule gives. These figures were computed on 2026-11-19 with a copy of the project's `solarPosition` (`core/environment/solar-position.ts`), with the rule above. The offsets were set by hand: 0 at the sample place and at longitude 0, -240 for New York on 20 March 2026, and +660 for Sydney on 20 March 2026. At the sample place (latitude 40, longitude 1.86, offset 0) the clock reads solar time. At 10:30 on 20 March the sun is 44.99 degrees up at an azimuth of 147.24 degrees.

| Site, with north up unless it is implied             | Front                          | Opens at                                           | Sun height | Front cosine |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------------- | ---------- | ------------ |
| Sample place with a stored bearing of 0              | South `(0, -1)`                | 20 March, 10:30                                    | 44.99      | 0.5948       |
| Sample place with a stored bearing of 0              | East `(1, 0)`                  | 20 March, 10:00                                    | 41.49      | 0.5001       |
| Sample place with a stored bearing of 0              | West `(-1, 0)`                 | 20 March, 14:00                                    | 41.55      | 0.5001       |
| Sample place with a stored bearing of 0              | North-west `(-0.7071, 0.7071)` | 21 June, 15:32                                     | 41.67      | 0.5002       |
| Sample place with a stored bearing of 0              | North `(0, 1)`                 | The fixed instant                                  |            |              |
| Latitude -40, longitude 0, no timezone               | South-east `(0.7071, -0.7071)` | 21 December, 08:20                                 | 41.59      | 0.5015       |
| Latitude 40.71, longitude -74.01, `America/New_York` | West `(-1, 0)`                 | 20 March, 15:04 civil time                         | 41.02      | 0.5023       |
| Latitude 0, longitude 0, no timezone                 | `(0.5, -0.8660)`               | The fixed instant (21 June is scanned)             |            |              |
| Latitude -0.01, longitude 0, no timezone             | `(0.5, -0.8660)`               | 21 December, 10:30                                 |            | 0.5163       |
| Latitude 89, longitude 0, no timezone                | South `(0, -1)`                | The fixed instant (the sun stays below 25 degrees) |            |              |

At the fixed instant, a front takes a cosine of 0.5 or more only when it faces within 45 degrees of the sun's direction. That is 90 of 360 directions. Half of all fronts get no sun at all then. The scan on 20 March reaches 247 of 360 directions, and the solstice scan adds 66. The 47 left, fronts within about 23 degrees of north, open in shade under the true sun. Their owner can store a better light. For a located site the times are civil times and shift with longitude and summer time. The reach does not shift, because the scan covers the whole day. The opening time pull request asserts these figures in unit tests, with the project's own offset function.

This rule changes call 4 of the daylight specification ("A located site opens at the same date and at 10:30 civil time"). See section 8.

The light on screen is seeded once per opened project (call 9, on the owner's answer 11). Today the store starts from a constant. After this work the shell creates it from `openingConditions` of the project that opened, with the front of the whole project graph. That changes call 27 of the daylight specification and its sentence in section 6.1 that "no caller changes". `openingConditions` takes inputs that `openingInstant` did not read, and the shell seeds the store per project. The mode and the color check keep their defaults, as when a scene is applied. An edit of the site, the entrance, or the stored light does not move the light on screen.

The sample notice does not change. It follows the site, not the instant.

Every opened project with a set north now reads the front once when it opens. So #772, which asks to compute the front only when a light reads it, needs a comment when the opening time lands.

Left to the builder: the year constant of the solstice dates and the name of the function.

### 5.5 The opening light in the document

What is stored, and in what form (answer 6):

```ts
/** A time and weather: what a saved scene holds beside its id and name. */
interface ViewingConditions {
  /** ISO 8601 civil datetime, YYYY-MM-DDThh:mm. */
  observedAt: string
  weather?: WeatherConditions
}
interface EnvironmentScene extends ViewingConditions {
  id: string
  name: string
  extensions?: Extensions
}
interface OpeningLight extends ViewingConditions {
  extensions?: Extensions
}
interface Project {
  // ...
  /** The light the project opens in. Absent means the default of section 5.4. */
  openingLight?: OpeningLight
}
```

- It holds the time of day, the date, and the cloud cover.
- The shared type is a code change only (call 11). The published schema of `EnvironmentScene` must stay as it is in revision 1, with `observedAt` a plain string. A revision cannot tighten what an earlier revision accepted (ADR-0178). So the schema does not refuse a malformed `observedAt` in either record. Rule 1 of section 5.4 ignores a malformed stored light instead.
- The style, the quality level, and the color check are not stored. The style is session state (daylight specification, section 6.5). "Open the 3D view in drafting" and the quality level are device settings (calls 15 and 18 of the daylight specification).
- It is its own record. A scene stays a named light that the user applies by hand. A light applied from a scene can be made the opening light with the same control, which copies the values. Removing or renaming a scene never changes how the project opens. The trade: the same values can live in two places.
- The lighting specification (`docs/specs/2026-07-01-realistic-environmental-lighting.md`, locked decision 3) splits the session light from persisted scenes. The opening light adds a third, persisted kind. ADR-0205 records that.

Where it lives (answer 7): in the project document, beside `site` and `environmentScenes` (`core/model/types.ts:295-325`). The light travels with the file.

When it is written (answer 8): only on the user's click.

- Two commands: set the opening light, and clear it. Each assigns or removes one top-level key, so undo restores the earlier stored light. Undo does not move the light on screen.
- Setting the light keeps the `extensions` of the record it replaces (call 24). Third-party data on the opening light then survives a new click.
- The control sits in the Environment section of the tool rail, between the Environment panel and the saved scenes (`EnvironmentRailSection`, `editor/shell/tool-rail.tsx:74-93`; call 13). It has three parts. The button reads "Use this light when the project opens". A line reads "Opens at 21 June 2026, 08:00, clear sky." or "Opens in the default light.". A control clears the stored light.
- Moving the time, the date, or the cloud cover dispatches nothing. The document stays clean, and autosave does not run.
- Setting the light marks the project as changed once. Autosave writes it like any other command.
- No migration, repair, or autosave path writes the field. If the session layer's repairs ever offer to drop a malformed opening light, that is a write on the user's click of the repair.

Left to the builder: the command names, the final wording of the status line, and whether the control can also apply the stored light to the screen. The builder chose as follows (ADR-0205, extension of 2026-11-22):

- The commands are `opening-light/set` and `opening-light/clear`. They follow `environment-scene/add` and `site/set-location`.
- The status line reads "Opens at 21 June 2026, 08:00, clear sky." or "Opens in the default light.". A cloud cover of 0 reads "clear sky", 1 reads "overcast sky", and any other value reads "<percent>% cloud cover". A stored light with no weather reads "clear sky". A stored light that is ignored reads "Opens in the default light.".
- The control does not apply the stored light to the screen. The stored light shows at the next open, and a saved scene covers going back to a light by hand.
- The clear control is a button, disabled while nothing is stored.
- A stored light is well formed only when its `observedAt` is a real calendar instant: a date that exists, hour 0 to 23, minute 0 to 59. A stored light that fails the check is ignored when the project opens.

### 5.6 The format change

| Field          | On        | Value                                   | Arrives with      |
| -------------- | --------- | --------------------------------------- | ----------------- |
| `entrance`     | `Opening` | `true`, optional                        | The entrance mark |
| `openingLight` | `Project` | `{ observedAt, weather?, extensions? }` | The opening light |

- Both are additive, so each is a schema revision (ADR-0178). The codec on `main` already writes the revision (`core/format/codec/encode-document.ts`), so neither waits for other work.
- The document is at version 17, revision 1 (`core/model/factories.ts:43`, `:49`). Each field takes the next free revision of the version on `main` when its pull request lands. If nothing else lands between them, they are revisions 2 and 3 of version 17, in the order they merge.
- The geometric kernel stage of the refactor round (#687) plans two version steps. A version step starts the revision count of the new version at 0 (ADR-0178). If one lands first, the field becomes a revision of the new version. Each pull request checks the number again before its merge.
- If a field lands before a kernel version step, the new version's schema holds it. The coverage check then asks that version's fixture to carry the field (`tests/format/version-fixtures.test.ts`, `tests/format/version-fixture-coverage.ts`). The kernel's migrations must also keep both fields. Each kernel version step owes a fixture with both fields and a migration test that keeps them.
- Neither field adds a migration step. A file without the fields is valid as it is. Neither falls back to a version step.
- Each pull request raises `CURRENT_SCHEMA_REVISION` and publishes its schema at `schema/<version>/revision-<R>/vernacular.schema.json` (`schema/README.md`, "Revisions"). It regenerates the table of known keys (ADR-0184, `core/model/known-keys.json`) and the generated validators (`core/format/generated/`) with `pnpm schema:generate`. The drift check (`tests/format/schema-drift.test.ts`) fails if the schema changes and neither the version nor the revision rises. Its reminder case names the current revision (`:58-63`), so each pull request updates it.
- The fixtures of existing versions do not change. The coverage check reads the revision 0 schema of each version (`tests/format/version-fixtures.test.ts:20-25`).
- A build at a lower revision reads a file with the fields tolerantly, keeps them through a save, and says that a newer build saved the project (`checkModeFor`, `core/format/codec/revision.ts`; ADR-0178).
- A cleared mark or a cleared opening light removes the key. Neither is ever written as `false` or `null`.
- The format specification (`docs/specs/2026-06-10-vernacular-floor-plan-format.md`, section 4.1) and section 3.1 of the design specification gain the two fields with their records.

How the parts fit the session layer and the other work:

| Part                           | Format change | Can start                                              |
| ------------------------------ | ------------- | ------------------------------------------------------ |
| The opening time for the house | None          | Now                                                    |
| The opening light              | One revision  | When the opening time is on `main`                     |
| The entrance guess             | None          | Now                                                    |
| The entrance mark              | One revision  | When the entrance guess is on `main`                   |
| The view from the front        | None          | When the distance rule of #744 is on `main` (answer 4) |

The seeding of the light per project relies on the remount of the editor shell for a new session (section 1). The Projects page of the session layer must not seed again when the user returns to the project that is still open. It must not drop the light on screen either.

## 6. Order of work

Each row is one pull request off `main`, built in red, green, and blue cycles. The plan (`docs/plans/2026-11-19-first-view-of-a-project.md`) holds the cycles.

| Pull request                   | Branch                                    | Issue | What the owner sees                                                        | What it proves                                                                                                                   | Needs                                                                                            | Record             |
| ------------------------------ | ----------------------------------------- | ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| The opening time for the house | `feat/opening-time-for-the-house`         | #737  | A house whose north is set opens at a time when its front takes sun        | The light on screen is seeded per project from one pure function. The true-sun rule and the sample notice hold                   | This specification on `main`                                                                     | ADR-0205           |
| The opening light              | `feat/opening-light`                      | #737  | "Use this light when the project opens". The project reopens in it         | The stored light survives a reload and an export and import. Moving the slider never changes the document                        | The opening time                                                                                 | ADR-0205, extended |
| The entrance guess             | `feat/entrance-guess-on-the-ground-floor` | #627  | On some projects the sample sun turns to the hinged ground-floor door      | The guess picks the door each rule names. No scene baseline moves                                                                | This specification on `main`                                                                     | ADR-0204           |
| The entrance mark              | `feat/main-entrance-mark`                 | #627  | "Main entrance" on a door. The sample sun follows it                       | A mark overrides the guess. At most one door is marked after every command. The field lands as a revision with no migration step | The entrance guess                                                                               | ADR-0204, extended |
| The view from the front        | `feat/view-from-the-front`                | #627  | The 3D view opens from the front. "Reset view" and "Entrance" return to it | The camera and the sun read one front. The front wall is solid in the first view. No scene harness baseline moves                | The opening time, the entrance guess, the entrance mark, and the distance rule of #744 on `main` | ADR-0204, extended |

What lands when, under the owner's answers 4 and 10:

- First: the opening time for the house. It lands before the distance rule of #744 is designed. The note of answer 4 still holds: of these parts, only the opening time can land in the week of 18 November.
- After it, with no wait for #744 or for the kernel: the opening light.
- The entrance guess, then the entrance mark. Each merges once it is built and reviewed (answer 10). Neither waits for #744.
- The view from the front comes last. It lands after the guess and the mark (answer 10), after the design of #744 is approved (24 November at the earliest), and after the build of #744 is on `main`. Its code needs only the opening time and #744. Until it lands the 3D view opens on the corner view. "Reset view" returns to the corner view, and there is no "Entrance" preset.

The daylight default waits for the view from the front only. The opening light is not a condition of it. The entrance mark is not one either, but the view from the front lands after the mark, so the daylight default waits for the mark in practice. It waits for the distance rule of #744 too. It also waits for the controlled timing run of the daylight specification (its sections 6.7 and 7). This document does not change that.

Proofs of what the user sees:

- No committed pixel baseline moves with the opening time, the opening light, the guess, or the mark.
- Every scene harness state pins its own instant and camera. The harness fixture with a door has one single swing door on its ground floor (`bridge/react/harness-fixtures.ts:74-84`), so the guess does not turn its front.
- The only live-view baseline, `live-view-top-down-webgpu`, pins the "Top down" preset and captures the canvas only (`e2e/tests/scene-live-view-visual-regression.spec.ts:59-67`).
- The story baseline `e2e/stories/__screenshots__/editor-openinginspector--default-linux.png` moves with the mark. Its story shows a single swing door (`editor/plan/opening-inspector.stories.tsx:37`).
- The control of the opening light adds story baselines of its own.
- The view from the front adds one live-view baseline of the first view (call 16). The baselines that #744 moves are its own.

## 7. Tests

The opening time for the house is done when:

- In unit tests, each row of the table in section 5.4 opens where the table says. Each chosen minute qualifies, and no qualifying minute of that day is nearer 10:30.
- A site with an implied north gets the fixed instant and `DEFAULT_CLOUD_COVER`, for every front. `openingInstant` returns the fixed instant for a located site too.
- The store of a newly opened project starts from `openingConditions` of that project. A second project opened in the same window starts from its own. An edit of the site does not move the light on screen.
- The architecture test of the opening instant seam still passes with its owners unchanged.
- A journey sets a north bearing that turns the drawn room's front to the west and reloads. The Environment panel's output under "Observation date and time" then reads `2026-03-20 14:00`.

The opening light is done when:

- The set command stores the time and the cloud cover and keeps the `extensions` of the record it replaces. The clear command removes the key. Undo restores the earlier stored light.
- `openingConditions` returns the stored light when there is one, also under sample daylight. A stored light with a malformed `observedAt` is ignored. Applying, renaming, or removing a scene leaves the stored light as it was.
- Moving the time, the date, or the cloud cover dispatches no command. The button dispatches exactly one.
- A document with an opening light passes the schema at the new revision, and so does one without it. A document with a saved scene still passes. The schema of `EnvironmentScene` is the same as in revision 1. The light survives an encode and decode and a `.building` archive round trip. A cleared light writes no key.
- A journey stores a light, reloads, and reads the stored time in the panel.

The entrance guess is done when:

- The guess picks the door each rule of section 5.2 names, on small scene graphs built in the test. The cases: a ground-floor door over a wider basement door and a wider upstairs door; a floor above grade before a floor below it when the ground floor has no door; a `swing` or `pivot` door over a wider `slide` door; a ground-floor sliding door over a hinged door upstairs; and the width, direction, id, and floor ties. The cases of ADR-0193 that still apply keep passing.
- `entranceOf` names the guessed door and says it is guessed.

The entrance mark is done when:

- The set command marks a door and clears every other mark on every floor. The clear command removes every `entrance` key. Undo restores the earlier state in both cases.
- Deleting the marked door and undoing the delete brings back the door with its mark. A pasted copy of the marked door has no mark, nor does an added opening or floor. A change of type to a window drops the mark. A move keeps it.
- After every registered command on a fixture with a marked door, at most one door is marked.
- `entranceOf` returns the marked door over the guess, also for a door in a wall that is not an exterior run, with the tie rules of section 5.2. A graph with two marks gives the first in document order. The inspector ticks only that door, also when another floor has an opening with the same id.
- A document with the mark passes the schema at the new revision. A document without it passes too. `entrance: false` fails.
- A journey marks a door, reloads, and finds the box still ticked.

The view from the front is done when:

- In unit tests, for fronts along the four axes and one oblique front, and for both sides, the camera of `entryPose` stands on the front side of the center. It is turned 30 degrees toward the side and looks down at 20 degrees. The bounds of what the view shows are inside the frustum. Null and zero-size bounds give the default pose.
- In unit tests, `shadedSide` returns the side of each row of the table in section 5.3. With the sun below the horizon it returns plan-left.
- In unit tests, under the light each project opened in, the face the entry camera looks at is the front, and the side the camera sees has a negative cosine where the table says so. This is the test that the first view and the first light agree.
- `fitCameraToBounds` without a front gives the same pose as today.
- The live view applies the entry pose while the user has not taken the camera. "Reset view" returns to it, and the "Entrance" preset applies it.
- With the distance rule of #744 on `main`, the front wall is not faded at the entry pose.
- The journey that clicks the canvas center in the first view is updated (`e2e/tests/journeys/perceived-color-readout.spec.ts:36-42`). It expects the far wall today, because the near wall is faded. Under the distance rule the near wall at the entry distance is solid. It runs on the live-view job (`.github/workflows/ci.yml:361`).
- A new live-view baseline of the first view, with no preset, shows the drawn room from the front.
- No scene harness baseline moves.

## 8. Decision records and other documents

ADR-0204 and ADR-0205 are free on `main` at `1c02bbc5`, and still free at `82170819`, where the highest record is ADR-0218. This document takes them, and two are enough. The decision record of #744 is not one of them and takes its own number.

| Record   | Scope                                                                                                                              | Written by                     | Extended by                                | Amends                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0204 | The main entrance and the view from the front: the guess, the mark on the door, the shaded side, the pose, the preset              | The entrance guess             | The entrance mark; the view from the front | ADR-0193 (the front direction). With the mark: ADR-0038 (a new field on an opening) and ADR-0179 (the rule of one marked door). With the view: ADR-0075 and ADR-0083 (the pose the view opens on and the new preset) |
| ADR-0205 | The opening light: the chosen time, the seeding per project, the stored values, their home, the write rule, the relation to scenes | The opening time for the house | The opening light                          | ADR-0193 (the opening instant seam and its consequences) and ADR-0146 (the session light is seeded per project). With the opening light: ADR-0146 again (the new control) and ADR-0143 (the shared value type)       |

A record is written in the pull request that changes the code it describes. A later pull request adds a dated section to it.

What changes in ADR-0193. It stays current. Each of the two records adds a dated amendment section to it.

- With ADR-0204, from the entrance guess, three passages change. One is the sentence "It returns the outward normal of the wall that hosts the widest exterior door" ("The front direction"). One is the bullet "It counts doors only ...", because the door families now rank. One is the consequence "Adding a door wider than the present front door on another exterior wall turns the implied north". With the mark, two more change: the case "a plan whose only door is interior", since a marked interior door now wins, and the "Not decided" bullet on the entrance.
- With ADR-0205, from the opening time, four passages change. They are the sentence "Today it returns `DAYLIGHT_REFERENCE_INSTANT` ... for every input", the last paragraph of "The opening instant seam", and the consequences "Every session opens at 20 March 2026 at 10:30, located or not" and "A located house whose front faces north opens with its front in shade in every session". With the opening light, two more change: the consequence "Nothing is added to the document", and the "Not decided" bullet on #737.

What changes in the daylight specification (`docs/specs/2026-11-15-daylight-and-shadow.md`). A change to a specification needs a record that explains it. Each change is made in the pull request named, under the record named.

| Where in the daylight specification                                                                                                                                                          | The change                                                                                                                                             | Pull request                      | Record   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | -------- |
| Call 4: "A located site opens at the same date and at 10:30 civil time"                                                                                                                      | A site whose north is set opens at the time chosen for the house. A site with an implied north opens at the fixed instant. A stored opening light wins | The opening time for the house    | ADR-0205 |
| Call 27, and the sentence "no caller changes" in section 6.1                                                                                                                                 | `openingConditions` takes the site and the front, and the shell seeds the store per project                                                            | The opening time for the house    | ADR-0205 |
| Section 6.1, the bullet on a located house whose front faces north                                                                                                                           | Such a house opens at a time when its front takes sun, where one exists                                                                                | The opening time for the house    | ADR-0205 |
| The status line ("decision 7 is reopened under #737"), decision 7, the non-goal of section 2, the two approach rows "Open again under #737" in section 5, and the #737 risk row of section 9 | #737 is settled. A project stores a light on the user's click, in the document                                                                         | The opening light                 | ADR-0205 |
| Call 1, and the `frontDirection` bullet of section 6.1                                                                                                                                       | The guess is the widest hinged door of the ground floor, and a marked door wins                                                                        | The entrance guess, then the mark | ADR-0204 |
| Section 10, the item "How the widest exterior door is found before the kernel stage, and the tie-break when two doors are equal"                                                             | The rule and its ties are in this document                                                                                                             | The entrance guess                | ADR-0204 |
| Call 12, the #627 row of section 7, and the sentence of section 6.5 on the entrance-facing camera                                                                                            | #627 lands in parts. The daylight default waits for the view from the front only                                                                       | The view from the front           | ADR-0204 |

Other documents:

- The lighting specification, `docs/specs/2026-07-01-realistic-environmental-lighting.md`, locked decision 3, changes with the opening light under ADR-0205. The opening light is a third, persisted kind beside the session light and the saved scenes.
- The format specification, section 4.1, and the design specification, section 3.1, gain `entrance` with the mark (ADR-0204) and `openingLight` with the opening light (ADR-0205).
- The refactor round specification (`docs/specs/2026-11-14-architecture-refactor-round.md`), section 6, changes with the record of #744, not with these two (call 17).
- #772 needs a comment when the opening time lands (section 5.4).

## 9. Left to the daylight default work, and later work

Left to the daylight default work, which needs no new design from here:

- The default style becomes daylight, with the Daylight and Drafting control.
- The device settings "Open the 3D view in drafting" and "3D quality", through the settings port.
- The whole first frame: the sky that arrives one chunk late and the readiness flag of #630.
- The controlled timing run, and ADR-0194 and ADR-0195.

It takes one thing from this document: the view from the front on `main`.

Later work. Each needs an issue (open question 7).

| Item                                              | Why it costs no rework                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Walk mode that starts outside the entrance        | `entranceOf` returns the door as well as the front.                                     |
| The doorway preset takes the entrance door        | The same.                                                                               |
| A plan symbol for the main entrance               | The mark is on the door, so the plan drawing work reads it from the opening.            |
| An entrance per building, and named entrances     | The mark is a field on a door. A second role or a building adds values, not a new home. |
| The whole building as the scope the view opens in | The entry pose already frames whatever the view shows.                                  |

## 10. Risks

- The view from the front waits for #744, whose design is not approved yet. If that design is late, the view from the front and the daylight default wait with it.
- The view from the front also lands after the entrance mark (answer 10). If the mark is late, the view from the front waits for it even with #744 on `main`.
- If #744 chooses a rule that fades the front wall at the entry distance, the entry view does not meet its constraint. Answer 4 is then open again.
- The guess is not measured on drawn plans. It can still pick the wrong door, and then the sample sun lights the wrong side too. The mark is the remedy.
- The two camera angles are not measured. The captures in the pull request are the check.
- "At most one marked door" is held by commands, one test over the command samples, and a check that counts marks. A new command that copies doors can break it if its sample does not exercise it.
- A file can carry several marks after an edit outside Vernacular or a paste in an older build. It opens, and the first mark wins everywhere. Until open question 6 is settled, nothing tells the user.
- The chosen time differs from project to project. A front within about 23 degrees of north still opens in shade at latitude 40.
- Several chosen minutes sit just above the cosine threshold, near 0.5001. A later change to `solarPosition` can move them, and the tests then fail for a good reason.
- A user who moves the slider and does not press the button reopens in the earlier light. That is the cost of a document that only a command changes.
- The two revisions and the kernel's version steps share the revision constant and the published schema. A pull request that takes a number another took first fails the drift check before its merge.
- The story baseline of the opening inspector moves with the mark, and the view from the front adds a live-view baseline. No scene harness baseline moves with this work.

## 11. Where this document changes approved documents

1. The first view and the wall fade. The daylight specification describes a first view with a sunlit entrance (its section 6.5). On `main`, an exterior wall that the camera sees from outside fades to an opacity of 0.1 at any distance (`engine/scene/near-wall-transparency.ts:9`, `:103-109`). So the entrance wall of an entry view would be almost transparent. ADR-0056 names #744 as the issue for a fade that depends on distance. The owner chose to build the distance rule of #744 first (answer 4). The refactor round puts the fade refinements of #256 with its 3D scene stage (`docs/specs/2026-11-14-architecture-refactor-round.md`, section 6). This document builds the distance rule ahead of that stage (call 17). The record of #744 amends section 6 of the round specification. This document does not design #744, and it adds no interim rule to the fade.
2. The guess. Call 1 of section 4.2 of the daylight specification, and ADR-0193, set the guess to the widest exterior door. The owner's answer 2 changes it (section 8).
3. The opening time. Call 4 of the daylight specification sets a located site to 10:30 on 20 March. The owner's answer 5 changes it (section 8).
4. The remembered light. Decision 7 of the daylight specification stores no light. The owner reopened it on 2026-11-15, and his answers 6 to 8 settle it (section 8).
