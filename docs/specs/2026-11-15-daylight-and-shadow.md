# Daylight and shadow in the default 3D view

Status: approved by the project owner on 2026-11-15, with two amendments made the same day. The timing before the default switch runs under controlled conditions (decision 11), and decision 7 was reopened under #737, which stores the opening light in the project document (ADR-0205, extension of 2026-11-22). The owner took the eleven decisions in section 4.1 before this document was written. Section 4.2 lists the technical calls the owner did not take. Most were stated with the options the owner chose from. The rest were made while this document was written, and the table says which.

## 1. Why this document exists

An old-house renovator who opens the 3D view today does not see the house as it would stand in daylight. The statements below were read from `main` at `ca1422fa`, and the pixel values were sampled from the committed scene baselines.

- The view opens in the schematic look (`DEFAULT_ENVIRONMENT_STATE.mode` is `'schematic'`, `core/environment/environment-state.ts:23-28`). It has a fixed sun, no cast shadows, no sky, and no contact shading. In the live-view baseline two white-painted wall faces read `(43,40,33)` beside a floor at `(166,162,152)`, so white paint shows as near black.
- Daylight needs a site location (`bridge/react/effective-lighting-mode.ts:12-14`), and a new project has none. Most users never see it.
- In daylight, no wall takes the sun. At equinox noon the south wall and the east wall of the shell fixture both read `(116,121,131)`. Issue #491 is about the cause: wall faces are wound inward, so each sunlit face is shadowed by the far face of its own wall.
- The sky outweighs the sun. A directional light returns `intensity * cos / pi` of the surface color, so the sun at 1.6 adds at most 0.51 of it, and the sky dome adds about 0.44 on a horizontal surface. Clear daylight runs near 5 to 1. White paint reads blue-violet, the window sun patch is only about 1.3 times the floor around it, and the sky renders near white at `(235,240,242)`.
- A closed room receives the whole sky. The environment light carries no visibility, and ambient occlusion reaches 250 mm. Interior walls lit through one window read `(110,115,125)`, about the same as a shaded exterior wall.

What the renovator should see: the house in morning light the moment the 3D view opens, with a sunlit side and a shade side, a shadow on the lawn, white paint that reads white, rooms that are dimmer than outdoors and brighter near their windows, and a warm house when the time slider moves toward evening. A drafting look stays one click away for people who want an even, shadowless model to edit in.

This document is the design for that. It builds on the lighting specifications (`docs/specs/2026-07-01-realistic-environmental-lighting.md`, `2026-07-04-gtao-ambient-occlusion.md`, `2026-07-26-decorating-color-accuracy-gate.md`, `2026-08-31-rendering-realism-gates-occlusion-coverings.md`, `2026-09-06-rendering-realism-gates-and-slices.md`) and it has to fit around the architecture refactor round (`docs/specs/2026-11-14-architecture-refactor-round.md`).

## 2. Goals, non-goals, and anti-goals

Goals:

1. Every project opens in daylight with sun, sky, and shadows, whether or not it has a site location.
2. White paint in midday sun reads white. Shade is mildly cool. A low sun turns the house warm.
3. The sun is several times stronger than the sky, so lit and shaded sides separate and cast shadows read on the ground.
4. Rooms are darker than outdoors and lit by their windows. Sunlit floors bounce light onto ceilings and walls.
5. The drafting look is an even, neutral, shadowless style that shows paint as its swatch color.
6. The view stays usable on weak hardware through a plainer quality level.
7. Every constant that sets the look is derived from a stated target and held by a numeric gate.

Non-goals:

- Night, dusk, the moon, and lamps. They stay in the 1.0 release (#446, #701).
- Remembering a project's light. Nothing is stored in the slices of this document, and each session opens at the default instant. The owner reopened that question, and #737 settled it: the project document stores the time of day, the date, and the cloud cover as an optional `openingLight`, written only when the user clicks "Use this light when the project opens" (ADR-0205, extension of 2026-11-22). A device setting was not taken, and a default instant chosen for the house is built (ADR-0205). A project with no stored light still opens at the default instant of the rules above.
- Photometric units with a camera exposure value. The relative scale stays and gains one stated anchor (section 6.2).
- Roof and eave shading (#86), glass tint and stained glass (#700), sun studies (#445, #703), and the reserved photo mode (#704).
- The ground texture, the horizon, and the surroundings, which another design area owns.
- A change to the document format or to any schema version.

Anti-goals. Each of these would make the work a failure even if every gate passed.

- The color-accuracy gate or the tone-map-extreme gate moves its target.
- Two light models again: one for daylight and another for drafting, or one per backend.
- Under sample daylight with no north set, a first view with a shaded entrance. A site with a real location is exempt, because it shows the true sun.
- A half-lit first frame, or a black wall face.
- Sample daylight that a user takes for the true sun at their address.
- A default view that stutters on the hardware the design specification names, with no way out that the user can find.
- A look-setting number chosen by eye.
- The application changing the look or the quality level without saying so.

## 3. Constraints

- The hard invariants in `.claude/rules.md` apply. `core/` holds every target, curve, and field computation and imports no Three.js. `engine/` is the only importer of Three.js. Every slice lands through a green pull request with the red, green, blue cycle.
- Every numeric gate runs in the scene harness on the forced WebGL 2 backend (`bridge/react/scene-harness-view.tsx:217`), on the macOS and Linux lanes. The Linux lane has no WebGPU. A feature that exists only on WebGPU can be checked only by the macOS live-view lane (ADR-0171). The light model is therefore the same on both backends, and quality levels change sampling cost only.
- The color check has its own light. `colorCheckLighting` (`core/environment/color-check.ts:15-22`) swaps in a white sun and a uniform white dome of radiance 1, and the gate samples a floor under the shell's ceiling, which only that dome reaches. The color-accuracy and tone-map-extreme gates (ADR-0157, ADR-0168) never read the daylight dome or the daylight sun color. They must read the same six samples after every slice here. The states those gates use, and the finish-contrast state, keep the present shell with no south window, so no sun patch can reach the sample at the floor center.
- The refactor round sets what can start when. The kernel stage (#687) creates one derived plan geometry per floor. The scene stage (#689) creates one scene view object that owns the frame order, every GPU resource, and the single tone-mapping writer (#680). Work that stays in `core/environment/` and `engine/lighting/` behind the `LightingProvider` seam, and adds no render pass, can land before the scene stage. Work that adds or reorders passes, writes exposure, or needs interior live-view baselines waits for it.
- Behavior changes do not ride inside refactor pull requests. The slices that move whole baseline families land before the scene stage moves geometry code.
- Thresholds follow the derivation rule of the 2026-08-31 specification (locked decision 6) and the two-probe midpoint of ADR-0157's amendment: measure the shipped reading and a seeded defect reading, measure the noise over five captures, place the threshold at the midpoint, and freeze it in a named constant with the readings beside it.
- The performance target is section 6.10 of the design specification: 60 fps on integrated GPUs, with 8 ms for the scene update and 8 ms for the render. CI gates counts and no CI job measures time (ADR-0186).
- three.js stays pinned at 0.184.0. The bump to 0.185.0 (locked decision 3 of the 2026-08-31 specification) never happened and belongs to another design area. If it happens, it lands before the daylight calibration slice so the daylight baselines are shot once.
- No new runtime dependency.

## 4. Decisions

### 4.1 Taken by the owner

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | One daylight look is the default. Each new project opens with sun, sky, and shadows at a default place and time. The schematic look becomes a drafting switch. The neutral color check stays. This reverses locked decision 2 of the lighting specification.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2   | White balance is a daylight preset: a fixed white point. White paint in midday sun reads white, shade is mildly cool, and a low sun turns the house warm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Interiors are believable in the beta, in two parts that are one design: rooms darker than the exterior and lit by their windows, then bounce light from sunlit floors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | Night and lamps stay in the 1.0 release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | New light features target WebGPU. The WebGL 2 fallback stays correct but plainer and keeps its notice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | For a project with no site location, the sample sun is placed so that the front of the house is turned to it. A notice says that this is sample daylight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 7   | A project does not remember its light between sessions. Each session opens at the default morning light. Nothing new is stored and the file format does not change. This is the behavior the slices of this document build. The owner reopened the decision on 2026-11-15, and #737 settled what is remembered, where, and when: the time, the date, and the cloud cover, in the project file, only on the user's click. The slices of this document still build the session behavior and store nothing. The stored light is a field of the document that a later pull request added (ADR-0205, extension of 2026-11-22), and a project with none opens as this decision says. |
| 8   | The drafting look is neutral even light with no cast shadows, edges drawn, a paper-colored background, and paint shown as its swatch color. The old schematic rig is removed. The color-temperature slider leaves the interface until lamps exist.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Window-lit rooms land before the scene stage of the refactor round if the technical spike passes, with one short adapter that the kernel stage replaces. Floor bounce comes after the scene stage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | When daylight cannot hold the frame rate, the view steps down to the plain quality level one time and says so, and the user can pin a level in the settings. The manual setting arrives first. The automatic step-down arrives after the scene stage.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 11  | As amended on 2026-11-15: the timing before the default switch runs on the maintainer's Mac only, for now, under controlled conditions that the owner schedules. The record states the chip and states that no Intel-class integrated GPU was measured. A tracking issue asks for that measurement before the beta release. The floor in the design specification does not change. A miss on that machine is a defect and not a reason to lower the default.                                                                                                                                                                                                                   |

### 4.2 Calls the owner did not take

The column "First stated in" says where a call comes from. "The options" marks a call that was part of the options the owner chose from. "This document" marks a call made while the document was written, where the options left a gap or a later check found one.

| #   | Call                                                                                                                                                                                                                                                                                                                                     | First stated in | Section |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- |
| 1   | The sample site is 40 N at the March equinox, 10:30 solar time. The front direction is the entrance: the likely entrance, which is the widest hinged door in an outside wall of the ground floor when there is one (ADR-0204). A door marked by the user (#627) is to win over that guess. With no exterior door the front is plan-down. | the options     | 6.1     |
| 2   | North is implied from the front only when the site has no location and no north bearing. A bearing set by the user is kept, also when it leaves the front in shade. The plan compass and the site editor do not change.                                                                                                                  | this document   | 6.1     |
| 3   | A site with a real location shows the true sun, also when the front is in shade. With no north bearing it keeps plan-up as north, as today, and that is not a sample.                                                                                                                                                                    | this document   | 6.1     |
| 4   | A site whose north is set opens at a time chosen for the house, as the owner chose on 18 November 2026 (ADR-0205). A site with an implied north opens at the fixed instant.                                                                                                                                                              | this document   | 6.1     |
| 5   | Daylight is calibrated on the relative scale in `core/`, from three stated targets, with exposure fixed at 1 and one photometric anchor.                                                                                                                                                                                                 | the options     | 6.2     |
| 6   | The sunlit white level holds at the reference instant only, so the solve gives one sun scale. The sun changes with its height through the ratio curve and the existing fade.                                                                                                                                                             | this document   | 6.2     |
| 7   | The color check's sun is pinned at 1.6 with no fade, as ADR-0156 says, and the code is corrected to match.                                                                                                                                                                                                                               | this document   | 6.2     |
| 8   | The white point lives in the light colors, in `core/`.                                                                                                                                                                                                                                                                                   | the options     | 6.2     |
| 9   | The existing sky mesh is calibrated to the dome. The dome gains a sun-relative term and a ground bounce computed from the lawn.                                                                                                                                                                                                          | the options     | 6.3     |
| 10  | The shadow frustum is fitted to the receivers as well as the casters.                                                                                                                                                                                                                                                                    | the options     | 6.4     |
| 11  | The fit covers the casters and their shadow on the ground, clipped to the ground plane, with a cap on texel size.                                                                                                                                                                                                                        | this document   | 6.4     |
| 12  | The entrance-facing first camera (#627) is its own slice. It is not designed here, and it lands before the daylight default.                                                                                                                                                                                                             | this document   | 6.5, 7  |
| 13  | Drafting is a neutral style inside one light model: the white dome and a weak key light, with no shadows. A legibility gate replaces tuning by eye.                                                                                                                                                                                      | the options     | 6.6     |
| 14  | The drafting key light is the weakest that passes the legibility gate. Drafting shares only the white dome with the color check, and the color check control is disabled in drafting with a hint.                                                                                                                                        | this document   | 6.6     |
| 15  | A setting opens the 3D view in drafting. It is a device setting and adds nothing to the document.                                                                                                                                                                                                                                        | the options     | 6.6     |
| 16  | The baselines and the end-to-end test of the color-temperature slider retire with it. The Kelvin math in `core/color/` stays for lamps.                                                                                                                                                                                                  | this document   | 6.6     |
| 17  | Quality is a policy table in `core/` with `full` and `plain`. The harness pins `full`.                                                                                                                                                                                                                                                   | the options     | 6.7     |
| 18  | Settings go through the settings port of ADR-0180. Until that port exists they last for the session.                                                                                                                                                                                                                                     | this document   | 6.7     |
| 19  | The timing conditions are written into the record with the figures. A miss of the render budget at `full` on the maintainer's Mac holds the default switch until the defect is corrected. The starting levels do not change.                                                                                                             | this document   | 6.7     |
| 20  | Interior light is a plan-space daylight field computed in `core/`, with one data shape for both parts.                                                                                                                                                                                                                                   | the options     | 6.8     |
| 21  | How dark a room is shown is a display rule separate from the field: a fixed compression first, an exposure that follows the walk camera later.                                                                                                                                                                                           | the options     | 6.8     |
| 22  | The display rule is an order of surfaces with a floor of readability, measured against the shaded exterior wall.                                                                                                                                                                                                                         | this document   | 6.8     |
| 23  | The south window of #492 is a fixture option that only the daylight harness states use. The states of the color gates keep the present shell.                                                                                                                                                                                            | this document   | 6.9, 7  |
| 24  | The wording of every notice and hint in section 6, except the sample daylight notice, which came with the options.                                                                                                                                                                                                                       | this document   | 6       |
| 25  | The order of work in section 7 and the record scopes in section 8.                                                                                                                                                                                                                                                                       | the options     | 7, 8    |
| 26  | The slices of the main sequence merge in order. The daylight field core math and the lighting hook spike are independent of that sequence. The record amendments of the winding fix land with that fix.                                                                                                                                  | this document   | 7       |
| 27  | `openingInstant` keeps the fixed instant for its callers. `openingConditions` reads the site and the front, and the shell seeds the session light from it once for each opened project (ADR-0205).                                                                                                                                       | this document   | 6.1     |

## 5. Approaches considered

Each table lists what was weighed and what was chosen. The owner chose among the first five topics. The outcomes of the other four are technical calls that were stated with the options.

Sample sun for a project with no site location (the owner's choice):

| Approach                                              | Trade                                                                                                                                                                                  | Outcome |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A sample place with plan-up as north                  | A real sun path at once. A front that faces plan-up or plan-left opens in shade, which is about half of all plans.                                                                     | Dropped |
| A studio light fixed to the house                     | A stable lit side. The time and date controls do nothing, so the warm low sun cannot be shown, and a second light model returns.                                                       | Dropped |
| A sample place with the front turned to the sun       | A real sun path at once and a sunlit entrance in the first view. The sun moves once when the user sets a real location or a north bearing, and again if they change the entrance door. | Chosen  |
| A sun tied to the camera, or a location form up front | Shadows swing as the user orbits, or a form stands in front of the first view.                                                                                                         | Dropped |

Whether a project remembers its light (the owner's choice, reopened on 2026-11-15):

| Approach                                    | Trade                                                               | Outcome                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| No: each session opens at the default light | Nothing stored. Saved environment scenes are applied by hand.       | The starting behavior                                                |
| An opening scene pointer in the document    | A schema change. It can be added later with no rework.              | Not taken under #737: the opening light is its own record (ADR-0205) |
| The last time and weather kept per device   | No document change, but a project looks different on each computer. | Not taken under #737: the light lives in the project file (ADR-0205) |

The drafting look (the owner's choice):

| Approach                                           | Trade                                                                                                                                                                                     | Outcome |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Keep today's schematic rig and repair it           | Small. Two light models, two sets of constants set by eye, and the Kelvin slider all live on. Restored shadows darken every interior.                                                     | Dropped |
| One light model, with drafting as a neutral style  | Medium, and every schematic baseline refreshes. Shaded faces are equal under a uniform white dome until contact shading arrives, so a weak key light and the edge overlay carry the form. | Chosen  |
| Merge drafting and the color check into one toggle | Fewer controls. Loses true color under today's shadows, which ADR-0146 gave the check on purpose.                                                                                         | Dropped |

When window-lit rooms arrive (the owner's choice):

| Approach                                                            | Trade                                                                      | Outcome |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- |
| Before the scene stage, through the existing occlusion context      | Rooms look right months earlier. One adapter is written and then replaced. | Chosen  |
| All interior work after the scene stage                             | No adapter. Rooms stay as bright as outdoors through most of the beta.     | Dropped |
| Core math now, everything visible after the kernel and scene stages | No adapter and no early pixels.                                            | Dropped |

When daylight cannot hold the frame rate (the owner's choice):

| Approach                                                   | Trade                                                               | Outcome |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------- |
| Step down once to the plain level, say so, and allow a pin | Needs a measured frame time, which needs the frame owner.           | Chosen  |
| Never automatic: the user picks a level                    | Small. A user with a weak GPU has to find the setting.              | Dropped |
| Open in drafting on weak hardware                          | The default look disappears for exactly the users with old laptops. | Dropped |

Reaching the sun to sky balance, and where the white point lives (technical call):

| Approach                                            | Trade                                                                                                                                                                 | Outcome |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Relative calibration stated in `core/`              | Medium. Touches `core/environment/` and `engine/lighting/` only. All daylight baselines refresh once. A stronger sun pushes highlights and glass panes harder.        | Chosen  |
| Photometric units with an exposure value            | Large, and it waits for the scene stage. Rewrites ADR-0156, moves every baseline and the near-black pin of ADR-0168, for no visible gain in daylight.                 | Dropped |
| Retune the tint constants by eye, or raise exposure | The first is how ADR-0079's numbers became indefensible. The second gives the same picture but exposure has three writers today and the color check needs exposure 1. | Dropped |
| White point in the light colors, in `core/`         | Small, identical on both backends, testable in Node.                                                                                                                  | Chosen  |
| White point as a gain at the end of the frame       | Where a user-chosen white balance would go. Needs the frame owner. The gain is linear, so the pixels match.                                                           | Later   |

The visible sky (technical call):

| Approach                                    | Trade                                                                                                               | Outcome |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| Calibrate the existing sky mesh to the dome | Small to medium. Keeps clouds and the sun disc. The mesh and the dome stay two models, held together by a gate.     | Chosen  |
| Draw the dome function as the sky           | Agreement by construction. Loses the clouds and reverses part of ADR-0148. Left to the area that owns the sky.      | Dropped |
| Capture the sky mesh into the environment   | Puts the renderer inside the provider (ADR-0161 kept it out) and leaves `core/` without the sky as a pure function. | Dropped |

Quality on weak hardware (technical call):

| Approach                          | Trade                                                                                           | Outcome |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| No levels; drafting is the escape | Small. The default can stutter and the user has to find the switch.                             | Dropped |
| Two levels fixed by backend       | Small. Does nothing for a weak GPU that supports WebGPU.                                        | Dropped |
| A policy table in `core/`         | Medium. The function takes a measured frame time from the start, so nothing is rewritten later. | Chosen  |

Interior light (technical call):

| Approach                                                | Trade                                                                                                                                                                       | Outcome |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A plan-space daylight field computed in `core/`         | Large in total. Pure math, the same on both backends, cheap to update. Analytic, so furniture does not block light and the field does not vary with height.                 | Chosen  |
| Probes rendered on the GPU                              | Sees furniture and future roofs. Very large, all after the scene stage, re-renders on every time scrub, leaks through 100 mm walls, and differs by backend.                 | Dropped |
| Screen-space bounce                                     | Color bleed near what is on screen. Cannot darken a room, because it does not know that a ceiling off screen blocks the sky. A possible later addition at the `full` level. | Later   |
| A brightness per room on materials, or baked light maps | The first has no falloff from the window and cannot add bounce. The second needs unique texture coordinates everywhere and re-bakes on every scrub.                         | Dropped |

## 6. The design

### 6.1 Sample daylight

Today `effectiveLightingMode` returns daylight only when `site.latLong` is set, and the Environment panel says "Realistic lighting needs the site location" (`editor/environment/environment-panel.tsx:39-40`). After this slice daylight never depends on a location, and the sample notice below replaces that one.

One function in `core/environment/` returns the site the sun is computed for:

```ts
interface DaylightSite {
  latLong: LatLong
  northBearing: number // radians, plan-up to true north
  utcOffsetMinutes: number
  sample: 'none' | 'location' | 'location-and-north'
}

function daylightSiteFor(site: Site | undefined, front: PlanDirection): DaylightSite
function frontDirection(input: FrontDirectionInput): PlanDirection
```

| The stored site                  | Location used    | North used                                                                    | `sample`               |
| -------------------------------- | ---------------- | ----------------------------------------------------------------------------- | ---------------------- |
| Has `latLong` and `northBearing` | The real one     | The stored bearing                                                            | `'none'`               |
| Has `latLong`, no `northBearing` | The real one     | Plan-up, as today (`northBearing ?? 0`, `bridge/react/scene-lighting.tsx:82`) | `'none'`               |
| No `latLong`, has `northBearing` | The sample place | The stored bearing                                                            | `'location'`           |
| No `latLong`, no `northBearing`  | The sample place | Implied, so that the front faces due south                                    | `'location-and-north'` |

- The sample place is latitude 40 N, with a longitude and offset chosen so that the clock reads solar time.
- A site with a real location shows the true sun, also when that leaves the front in shade at the default instant. A true location must give true light, and a sun turned to flatter the entrance would be wrong for the address the user typed. A located house opens at a time when its front takes the sun, on 20 March or on the summer solstice of its hemisphere, where one exists (ADR-0205). At latitude 40, a front within about 23 degrees of north has none and opens in shade at the fixed instant. The true-sun rule itself does not change.
- A site with a location and no bearing is not a sample. The site editor and the plan compass already show plan-up as its north (`editor/plan/compass.tsx:28`), and the sun agrees with them.
- A bearing set by the user is kept without a location too, and then the front can be in shade. North is implied from the front only in the last row.
- The plan compass and the site editor do not change. They show the stored bearing. The implied north exists only inside the sun computation, and the sample notice discloses it.
- `frontDirection` returns the front of `entranceOf`, the outward direction of the entrance (ADR-0204). With no door marked, the entrance is a guess. It looks at the ground level first, then at the levels above grade from the lowest up, then at the levels below grade from the highest down. On that level a hinged door comes before a sliding, folding, or cased one, and then the widest wins. With no exterior door the front is plan-down. A door that the owner marks as the main entrance wins over the guess (ADR-0204). Its front is the outward normal of its exterior run, or, for a door on an interior wall, the side that faces away from the center of its floor's walls. The camera of #627 and the sun still call the same function, so the first view and the first light agree by construction.
- `computeEnvironmentLighting` and the NOAA sun are unchanged. The sample site is only a different input.

The default observation instant moves from the June solstice at noon (`core/environment/observation-time.ts:23-26`) to the March equinox at 10:30. The sample daylight slice also gives "the instant a session opens at" one seam. Today two places read the constant: the default environment state behind `bridge/environment/environment-session-store.ts:10`, and a parameter default at `bridge/react/scene-lighting.tsx:140`. After the slice, one function in `core/environment/` returns the opening instant and nothing else reads the constant:

```ts
function openingInstant(input: OpeningInstantInput): ObservationInstant
```

It returns the fixed instant for every input, and its callers stay as they are. The time a project opens at comes from `openingConditions` in the same file, which also reads the front. The editor shell seeds the session store from it once for each opened project (ADR-0205).

At the default instant, at the sample site with an implied north, the sun is about 45 degrees up and 33 degrees east of the front, so the front takes sun at a cosine of about 0.59, one side at a grazing 0.38, and the other side and the back are in shade. Those figures are hand arithmetic. The slice asserts them in a Node test.

The panel shows this notice while the location is a sample, which is every value of `sample` except `'none'`. It uses the notice pattern of ADR-0146:

> Sample daylight. Set the location and north in the Site panel for true sun angles.

When the user sets a location the sun moves to its true place and the notice goes away. Saved environment scenes hold a time and weather only, so they stay valid. Nothing is added to the document.

### 6.2 Daylight calibration and the white point

One module in `core/environment/` states three targets and derives the sun and dome constants from them.

1. The ratio of direct to diffuse light on level ground, as a function of sun height: about 5 to 1 at 45 degrees, falling toward 1 to 1 at the horizon.
2. The white point: the color of sun plus sky on a level white card at the reference instant, which is the sample instant of section 6.1 under a clear sky. Every daylight color (sun, dome, visible sky) is divided by it before it reaches the engine.
3. The sunlit white level. It holds at the reference instant only. There, a wall painted a neutral white with a reflectance of 0.85, which is a typical white paint, that faces the sun at the front wall's angle, a cosine of about 0.59, returns the linear level that AgX at exposure 1 shows as white. That is the white code floor, about code 225, and the slice measures it. An unpainted wall has the light warm gray of `NEUTRAL_COLOR` (`engine/materials/role-appearance.ts:6`), so it reads a little darker than white paint, as it should.

The derivation solves once, at the reference instant, for the one sun scale that meets target 3 and the dome scale that then meets target 1, and divides both by target 2. Away from the reference instant the sun follows the existing fade with its height, and the dome follows from the sun through target 1's curve. Target 3 never applies there, so evening light dims and warms. One check is not a target: a white face square to the sun at the reference instant stays below clipping, so it still differs from pure white. The constants it produces replace the tints in `core/environment/sky-model.ts` and `core/environment/sky-dome.ts` and the engine's `DAYLIGHT_SUN_INTENSITY` (`engine/lighting/lighting-rig.ts:29`). The sun level moves into `EnvironmentLighting`, so the engine stops multiplying its own constant by the core's fade.

All of the following are estimates from sampled baselines and arithmetic, and the calibration slice measures each one before it freezes a constant. No frame time was measured for this document, on any machine. AgX at exposure 1 gives about 35 output codes per doubling of linear light (linear 0.18 near code 120, 0.34 near code 153). White paint reads white, at code 225 or above, near linear 1.5. Meeting both targets needs a sun term about four times today's and a sky a little below today's energy. Planning corrected these figures on 2026-11-15: the tone curve transcribed from the pinned three.js source puts code 225 near linear 2.1 and linear 0.18 near code 128, so the first solve gives a sun term near eight times today's and a dome above today's. They are still estimates, and the calibration slice measures them. The plan is `docs/plans/2026-11-15-daylight-and-shadow.md`, and its list of decisions names each place where it departs from the letter of this document.

Rules that hold the color gates still:

- Exposure stays 1 and AgX stays the daylight operator.
- `colorCheckLighting` keeps its white dome at radiance 1 and gains a pinned sun level of 1.6 with no fade. ADR-0156 says the check's sun is held with no horizon fade, and the code passes the fade through today. The record wins: the calibration slice corrects the code, and ADR-0192 notes the correction against ADR-0156. The sunlit walls of the `color-check` whole-frame baseline get brighter and that baseline refreshes.
- The slice reads all six samples of the color-accuracy and tone-map-extreme gates before and after, and records both sets in the pull request. If a sample moves, the slice stops, as section 9 says.

The record gives the relative scale one photometric anchor: what one unit of irradiance means in lux. Lamps (#701) later convert lumens through that constant, and night adds exposure control once one writer owns it. Nothing built on the relative scale is thrown away.

Node tests assert the ratio curve and the white point as plain numbers: at the reference the white card is neutral within a chroma bound, open shade is cool within a bound, and below about 20 degrees of sun height the lit card is warm.

### 6.3 The visible sky and the dome

The dome in `core/` stays the one authority for light (ADR-0148, ADR-0161). Three things change.

- The dome gains a term relative to the sun's azimuth, so the sky beside the sun is brighter than the sky opposite it. Today the dome is a function of view elevation only (`core/environment/sky-dome.ts`).
- The ground bounce is computed from the lawn color and the sun, and replaces the fixed brown `(0.12, 0.1, 0.08)`.
- The sky mesh's scattering constants (turbidity, Rayleigh, Mie) are pinned by name, as its cloud constants already are in `engine/lighting/sky-environment.ts`. Its output takes a gain and the white point, so its zenith and far-horizon values match the dome.

The sunlit-wall gate assumes both walls receive the same sky light. With the azimuth term that stops being true, so the calibration slice re-derives its margin.

### 6.4 Shadow reach

The shadow frustum is fitted to the building's bounding sphere, and `sceneBounds` skips the ground plane (`engine/scene/scene-bounds.ts:17`). Fragments outside the frustum are lit. In the winter-afternoon harness state (21 December at 16:00, sun about 5 degrees up) the shell's shadow is cut off about 3 m from the building's center, where it should run off the lawn.

The fit covers the casters and their shadow on the ground, clipped to the ground plane's extent. The ground plane reaches 5 m past the walls (`GROUND_MARGIN_MM`), which bounds the frustum at any sun height. The bias pair of ADR-0158 is derived from texel size and follows the fit with no new constant. The slice sets a cap on texel size from a measurement on the reference project of ADR-0186, and when the clipped fit would exceed it, the far end of the shadow gives way first.

### 6.5 Daylight as the default and the first view

`LightingMode` (`'schematic' | 'realistic'`) becomes the view style, `'daylight' | 'drafting'`, and the default is `'daylight'`. The style is session state, as the mode is today. `effectiveLightingMode` loses its location test. The tone-mapping policy maps daylight to AgX and drafting to Neutral, and the color check still forces Neutral.

The control reads "Daylight / Drafting". It sits in the 3D toolbar and the Environment panel, and it is a command in the model of ADR-0155. The application never switches style on its own.

A new project opens in daylight, facing the front, with the entrance sunlit and its shadow on the lawn. The words "facing the front" rest on the entrance-facing first camera of #627. That camera is its own slice, this document does not design it, and it lands before the daylight default (section 7). Two defects are closed in the same slice so that the first frame is whole. The sky mesh arrives one chunk after mount, because it is imported lazily (ADR-0148), and a cancelled occlusion build can leave readiness stuck false (#630). The live canvas holds the backdrop color until the lighting provider reports ready. That is the contract the harness already uses through `whenReady` and `data-harness-ready`.

### 6.6 The drafting style

Drafting is a configuration of the one daylight provider. `BasicLightingProvider`, the fixed `SUN_DIRECTION`, the hemisphere fill, and the constants of ADR-0079 are removed.

- Light: the uniform white dome at radiance 1, plus one weak white key light placed from the front direction of section 6.1. The color check shares that dome and nothing else. Its light is the dome plus the pinned sun of 1.6 at the daylight angle, with shadows.
- Tone mapping is Neutral. There is no sky mesh and there are no cast shadows. Rooms are not darkened.
- The background is the paper color of the design language (ADR-0154, `editor/design-system/tokens.css`), passed down to the engine as a value.
- The edge overlay (`engine/scene/edge-overlay.ts`) is on. It is off by default today.
- The key light is the weakest that passes the legibility gate (section 6.9), so paint stays as close to its swatch as legibility allows.
- Contact shading runs the occlusion pipeline outside daylight, which touches the frame path. It arrives after the scene stage.

The time and cloud controls change nothing in drafting. The color check control is disabled there, with the hint "Drafting already shows paint at its swatch color." In place of today's schematic notice the panel says:

> Drafting uses even light, so the time and cloud cover change nothing. Switch to Daylight to move the sun.

A device setting, "Open the 3D view in drafting", serves people who edit in 3D all day. The color-temperature slider leaves the 3D toolbar and returns with lamps (#701, #699). `scene-color-temperature.spec.ts` and the warm-light shell baseline retire with it. The Kelvin conversion in `core/color/color-temperature.ts` stays.

### 6.7 Quality levels

With daylight as the default, one shadow depth pass, the occlusion prepass with its 16-sample gather, and multisampling run all the time. A policy in `core/` decides how much of that a view pays for:

```ts
type QualityLevel = 'full' | 'plain'

interface QualityInput {
  backend: 'webgpu' | 'webgl2'
  pinned: QualityLevel | undefined // the user's setting
  frameTimeMs: number | undefined // filled in after the scene stage
}

interface QualitySettings {
  occlusionGather: boolean // false at plain
  shadowMapSize: number // 2048 at full, 1024 at plain
  maxPixelRatio: number | undefined // 1 at plain
}

function qualityLevelFor(input: QualityInput): QualityLevel
function qualitySettingsFor(level: QualityLevel): QualitySettings
```

- A pinned level always wins. With no pin, WebGPU starts at `full` and WebGL 2 starts at `plain`.
- Levels change sampling cost and never the light model. The WebGL 2 fallback shows the same sun, sky, shadows, white point, and room darkening as WebGPU, at the plain level, with the notice it has today (`editor/shell/scene-pane.tsx:35`): "The 3D preview is running without WebGPU. Shading and lighting can look slightly different here." Features that stay WebGPU only are the ones that cost passes: occlusion denoising, any screen-space bounce, and larger or cascaded shadow maps.
- The setting reads "3D quality" with the choices "Automatic", "Full", and "Plain". It arrives with the default switch. It goes through the settings port of ADR-0180, which arrives with the session stage (#685). If that port has not landed, the choice lasts for the session and moves to the port when it exists.
- The automatic step-down arrives after the scene stage, when one owner can measure frame time. It happens once per session, only from `full` to `plain`, only on a sustained miss, and never while shaders are still compiling. The slice sets the window and the threshold from timings. The view then says:

> The 3D view switched to plain quality to keep editing smooth. You can choose a quality level in Settings.

Timing before the switch. The default switch slice needs the local timing command of ADR-0186, run on the reference project in both styles and at both levels. That command arrives with #684 and is not in the tree at `ca1422fa`, so the slice depends on it. No frame time has been measured yet.

- The timing runs on the maintainer's Mac only, for now, under controlled conditions that the owner arranges and schedules: other applications closed, mains power, a fixed window size, and a stated number of runs. It is not run as a side effect of a development session, because other applications normally run on that machine and a casual run proves nothing.
- ADR-0195 records the figures with those conditions and names the chip, an Apple M5 Pro. It states two limits plainly. That machine is far above the floor of the design specification (integrated GPUs of the Intel Iris class, Apple M1), so its result says nothing about the floor. The second limit is that no Intel-class integrated GPU was measured.
- The slice files a tracking issue in the public-beta milestone that asks for the measurement on an Intel-class integrated GPU before the beta release. The floor in section 6.10 of the design specification does not change.
- A miss of the 8 ms render budget at the `full` level on that machine is a performance defect, because a machine at the floor would be far worse. The default switch does not ship until the defect is found and corrected. The starting levels stay as designed: `full` on WebGPU and `plain` on WebGL 2, with the manual setting.

### 6.8 The daylight field: window-lit rooms and floor bounce

The ceiling already blocks the sun and glass already lets it through (ADR-0153), so direct sun patches are right today. What is missing is visibility for the sky light, and light bounced off sunlit floors.

`core/` computes one small grid per floor in plan coordinates:

```ts
interface DaylightField {
  origin: Point // plan millimetres
  cellSize: number // about 100 mm
  columns: number
  rows: number
  data: Float32Array // four per cell: bounce red, green, blue, sky visibility
}

interface DaylightRoom {
  outline: readonly Point[]
  ceilingHeight: number
  floorColor: LinearRgb
  apertures: readonly DaylightAperture[]
}

interface DaylightAperture {
  span: readonly [Point, Point] // on the room outline
  sill: number
  head: number
  revealDepth: number
  opensTo: 'sky' | { room: number } // an interior doorway names its neighbor
}
```

A 12 by 9 m floor is 120 by 90 cells, plus a margin of two cells on every side (124 by 94). A cell outside every room holds visibility 1 and no bounce, unless one of its eight neighbors is a room cell; then it holds that room's visibility (ADR-0196). The shape, the texture format, the lookup, and the invalidation are the same for both parts.

Window-lit rooms fill the visibility channel. For each cell it is the share of sky light that arrives through the room's windows, from each window's size, sill, reveal depth, and facing, the dome's radiance toward it, and a room-average term for light reflected between the room's surfaces. An interior doorway passes the neighbor room's interreflected light and the light of that room's windows that falls on the doorway. The neighbor room loses both, so a hall borrows light and never takes more than its source. The bounce channels hold zero.

Floor bounce fills the color channels. Each window's outline is projected along the sun onto the floor and clipped to the room. That patch, times the floor's own color, is spread with distance and weighted so that ceilings receive most and floors none.

Cost of updates. The form factors from windows to cells depend only on geometry and are cached per room. A time scrub re-weights them by the sky and sun, and must stay inside the 8 ms scene update budget.

In the engine, the lighting rig owns one half-float texture for the field, as it owns the sky map (ADR-0161). A fragment looks it up by world position, offset one cell along its surface normal so that a wall face reads the room it faces. Near a wall thinner than two cells (200 mm), a filtered lookup can still blend the two sides (ADR-0196). Window-lit rooms multiply the visibility into the indirect light through the occlusion context that ADR-0172 installed (`scenePass.contextNode = builtinAOContext(...)`, `engine/postprocessing/ambient-occlusion.ts:101`). That adds no pass. Floor bounce adds light, which the occlusion context cannot do, so it needs a lighting hook of its own and waits for the scene stage.

How dark a room is shown is a separate rule. The field is linear, and a real room receives a few percent of the outdoor light, which renders near black at exposure 1. Two display rules read the same field:

- A fixed compression in `core/`, which arrives with window-lit rooms. Its reference surface is the sky-lit exterior: a shaded exterior wall under the open sky, where visibility is 1. It keeps one order in every daylight frame, from brightest to darkest: the sunlit exterior, the shaded exterior, the room near its window, the far side of the room, and then a floor of readability, a stated minimum that no room surface falls below. Orbit and cutaway views need this rule in any case. The starting estimate puts the mean of a window-lit room about one stop below the shaded exterior wall. The slice measures the mean and the floor and freezes both.
- An exposure that follows the walk camera into a room, so that windows glow. It needs the single exposure writer and arrives after the scene stage.

The color check bypasses the field (visibility 1, bounce 0), so the color gates do not move. Drafting bypasses it too.

Where the input comes from. The core math takes `DaylightRoom` values and knows nothing else. Before the kernel stage, one short adapter builds them from today's scene graph. The kernel stage's plan geometry replaces that adapter with a mapper, and the gate for the swap is that no baseline moves. Roofs (#86) later add an overhang term to the aperture.

Known limits: furniture and partial walls do not block light, and the field does not vary with height. The reserved photo mode (#704) is the accuracy backstop.

### 6.9 Gates

Every gate reads the harness on the forced WebGL 2 backend unless the table says otherwise. Pixel gates read OKLab L or chroma of a sampled patch, with five captures for the noise band.

| Gate                 | Harness state                                                                               | What it reads                                                                                                                                            | How the threshold is set                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wall face winding    | Node, no GPU                                                                                | The winding normal of every vertical wall triangle points away from the wall solid                                                                       | Exact. Arrives with the winding fix                                                                                                       |
| Sunlit wall          | `winter-afternoon`                                                                          | L of the south exterior minus L of the east exterior                                                                                                     | Half the gap the light model predicts, with the zero-gap defect as the second probe: 0.043 under today's light. Re-derived at calibration |
| Shadow reach         | `winter-afternoon`                                                                          | A lawn patch inside the shadow, more than 3 m from the building's center, against sunlit lawn                                                            | Midpoint between the fitted render and today's render, where the two patches are equal                                                    |
| Sun to shade         | A new state: the equinox-noon instant, camera on the cast shadow                            | Sunlit lawn against lawn inside the shadow, converted back to linear light, as a ratio                                                                   | A band. Low edge: midpoint with today's balance. High edge: midpoint with a probe that removes the sky                                    |
| Daylight white       | `equinox-noon` and `winter-afternoon`                                                       | Sunlit white wall: chroma under a bound and L over a floor. Shaded wall: cool within a bound. Low-sun wall: warm                                         | Midpoints between the calibrated render and today's render                                                                                |
| Sky                  | `equinox-noon` and `overcast-noon`                                                          | The clear sky is blue, is not clipped, and is darker than the sunlit white wall. The overcast sky is grey                                                | Midpoints, with today's near-white sky as the defect probe                                                                                |
| Sample daylight      | A new state: the shell with no site                                                         | The cosine between the front facade and the sun is at least 0.5 (Node), and the sunlit-wall relation holds on the front (pixel)                          | 0.5 stands between the designed 0.59 and a grazing face. The pixel margin is derived as for the sunlit wall                               |
| Drafting legibility  | The drafting shell                                                                          | Two wall faces at a square corner differ in L by a minimum, and no white-painted face falls below a floor                                                | Midpoints between the shipped key light and a probe with no key light                                                                     |
| Plain level          | One daylight state at `plain`                                                               | A whole-frame baseline                                                                                                                                   | The scene-tier derivation of ADR-0157's amendment                                                                                         |
| Color gates          | `color-accuracy` and the tone-map-extreme states, on the present shell with no south window | The six samples, before and after each slice                                                                                                             | Unchanged targets and tolerances (0.06 and 0.04)                                                                                          |
| Daylight field, Node | Node, no GPU                                                                                | See below                                                                                                                                                | Exact or closed form                                                                                                                      |
| Window-lit room      | `window-light` and the closed shell                                                         | The order of section 6.8: the shaded exterior wall, then the room near its window, then its far side, and no room surface below the floor of readability | Midpoints between the field render and a probe with visibility 1. The floor comes from the slice's measurement                            |
| Floor bounce         | `window-light`                                                                              | The ceiling above the sun patch is brighter than the far ceiling and shifts toward the floor's hue                                                       | Midpoints between the bounce render and a probe with no bounce                                                                            |
| Live daylight frame  | Live view, WebGPU, macOS lane                                                               | One whole-frame baseline in daylight                                                                                                                     | The standing live-view tolerances of ADR-0171                                                                                             |

Node tests for the daylight field: a windowless room returns the inter-reflection floor. A room open to the sky returns 1. A symmetric room gives a symmetric field. Widening a window never darkens a cell. The form factor from a point to a rectangle matches its closed form. Energy out never exceeds energy in.

## 7. Order of work

Each slice is a small pull request off `main` with its gate first. The rows of the main sequence, from the winding fix to the daylight default, merge in the order shown, each before the next one branches. The daylight field core math and the lighting hook spike are independent of that sequence and can run beside it. "Early" means before the refactor round reaches the scene stage.

| Slice                                 | What the owner sees                                                                                                  | Depends on                                                                                                                               | Baselines it refreshes                                                                                                                                                                                                   | Record                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Wall winding fix (#491)               | A sunlit side and a shade side on every house. Paint on the correct side of a wall                                   | Nothing. In progress on its own branch                                                                                                   | Both scene families and the live-view frame, with two gates re-derived                                                                                                                                                   | Amends ADR-0139 and ADR-0153, with that fix |
| Daylight fixtures                     | Nothing in the application                                                                                           | The winding fix                                                                                                                          | Only the daylight states that take the south window (#492), which is a fixture option. The states of the color gates and the finish-contrast state keep the present shell and do not move. Adds the shadow-framing state | None                                        |
| Shadow reach                          | The winter-afternoon shadow runs across the lawn                                                                     | Daylight fixtures                                                                                                                        | The daylight states of both scene families                                                                                                                                                                               | Amends ADR-0158                             |
| Daylight calibration                  | White walls white in sun, cool shade, strong shadows, a blue sky, a warm house at low sun                            | Shadow reach. The three.js bump first, if it happens                                                                                     | Every daylight baseline, once. The sunlit-wall margin is re-derived                                                                                                                                                      | ADR-0192                                    |
| Sample daylight                       | Daylight on a project with no site, the front sunlit, the sample notice                                              | Daylight calibration                                                                                                                     | Adds the no-site state. Story baselines of the Environment panel                                                                                                                                                         | ADR-0193                                    |
| Entrance-facing first camera (#627)   | A first view that faces the entrance                                                                                 | Sample daylight, because it calls the same `frontDirection`. Its own design, not in this document                                        | Set by its own design                                                                                                                                                                                                    | Its own                                     |
| Daylight default and drafting         | A new project opens in daylight. A Daylight / Drafting control. A quality setting. Timing figures                    | Sample daylight, the entrance-facing first camera (#627), the timing command of #684, and a controlled timing run with no miss at `full` | Every schematic baseline becomes a drafting baseline. The live-view frame. Adds a live daylight frame and a plain-level frame                                                                                            | ADR-0194, ADR-0195                          |
| Daylight field core math              | Test readings and a plotted field for the shell. No pixels                                                           | Nothing. Independent of the main sequence                                                                                                | None                                                                                                                                                                                                                     | ADR-0196, as proposed                       |
| Lighting hook spike                   | A yes or no on window-lit rooms before the scene stage                                                               | Nothing. Independent of the main sequence                                                                                                | None. The spike merges no product code                                                                                                                                                                                   | A note in ADR-0196                          |
| Window-lit rooms                      | Rooms darker than outdoors, brighter near windows, a dim hall                                                        | Core math, daylight calibration, and a passing spike. Else the scene stage                                                               | Daylight baselines that show an interior. The occlusion contrast gate is re-derived if its patches sit indoors                                                                                                           | ADR-0196 becomes current                    |
| Plan geometry mapper                  | Nothing. The adapter goes away                                                                                       | The kernel stage (#687)                                                                                                                  | None, and that is its gate                                                                                                                                                                                               | None                                        |
| Floor bounce and the frame-owner work | Bounce on ceilings above sun patches. Windows that glow when walking indoors. Contact shading in drafting. Step-down | The scene stage (#689)                                                                                                                   | Interior daylight baselines, the drafting baselines, and new live-view interior frames                                                                                                                                   | Amends ADR-0196, ADR-0194, and ADR-0195     |

The winding fix is given, not new design. Its branch re-sites the occlusion contrast gate and the finish contrast gate, adds the sunlit-wall gate, and expects to refresh fourteen macOS files and thirteen Linux files. Its amendments of ADR-0139 and ADR-0153 are being written on that branch and land with it.

The calibration slice and the default switch each refresh a whole baseline family once. Landing the main sequence early keeps those pixel changes out of the scene stage's pull requests. The last row is one row here and several pull requests in the plan.

## 8. Decision records

No record is written now. Each lands with the slice that implements it.

| Record   | Scope                                                                                                                              | Lands with                       | Amends or supersedes                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-0192 | Daylight calibration and the white point: the three targets, the derived constants, the photometric anchor, the sky calibration    | Daylight calibration             | Amends ADR-0156 (what the check measures, its sun pinned at 1.6 with the code corrected to carry no fade, and that daylight is calibrated separately), ADR-0148, and ADR-0161 (the dome's azimuth term, the computed ground bounce, the calibrated sky mesh)                               |
| ADR-0193 | Sample daylight for a project with no site location: the sample site, the front direction, the notice, the opening instant seam    | Sample daylight                  | Amends ADR-0144 (the fallback to schematic) and ADR-0146 (the notice)                                                                                                                                                                                                                      |
| ADR-0194 | Daylight as the default and the drafting style                                                                                     | Daylight default and drafting    | Supersedes locked decision 2 of the lighting specification and the rig of ADR-0079. Closes the open question of ADR-0153 on schematic shadows. Amends ADR-0147 (operator per style) and ADR-0174 (what the fallback shows). Notes against ADR-0065 that the slider is out of the interface |
| ADR-0195 | Quality levels: the policy, the two levels, and the timing record with its conditions, the chip (Apple M5 Pro), and its two limits | Daylight default and drafting    | New. Amended by the step-down                                                                                                                                                                                                                                                              |
| ADR-0196 | The plan-space daylight field: the data shape, both parts, the display rule, the bypass for the color check                        | Core math, then window-lit rooms | Amends ADR-0172 (the occlusion context carries one more factor) and ADR-0156 (the check bypasses the field)                                                                                                                                                                                |

The lighting specification (`docs/specs/2026-07-01-realistic-environmental-lighting.md`) is edited under ADR-0194, in the same pull request, to mark locked decision 2 as superseded. `docs/delivery-strategy.md` is checked in that pull request for wording that calls the schematic look the default.

## 9. Open risks and the spike that settles each

| Risk                                                                                                                                                                | What settles it                                                                                                  | If it fails                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A lookup of a plan-space texture by world position may not work inside the scene pass's lighting context on both backends                                           | The lighting hook spike: a throwaway branch that darkens the shell's interior on WebGPU and on forced WebGL 2    | Window-lit rooms wait for the scene stage. The core math and its tests still land early                                                   |
| The occlusion context exists only inside the occlusion pipeline, and the plain level has no gather                                                                  | The same spike, at the plain level                                                                               | The plain level keeps the pipeline's scene pass with the gather held at 1, and the timing shows what that costs                           |
| Nobody knows which hook takes the light that floor bounce adds (`scene.environmentNode` or a custom light node)                                                     | The same spike reports on both                                                                                   | The choice moves into the scene stage's design. Floor bounce is after that stage in any case                                              |
| The sky mesh's color may not take a gain without a fork. The addon assigns its color node on the material (`SkyMesh.js:371` in the pinned build)                    | The first task of the calibration slice                                                                          | A local copy of the addon's color node in `engine/lighting/`, kept in step at each three.js bump                                          |
| The AgX figures and the sample sun angles are estimates                                                                                                             | The calibration slice measures the operator in the harness. The sample daylight slice asserts the angles in Node | The targets stand and the derived constants change. Nothing else depends on the estimates                                                 |
| The six color gate samples are argued to be unchanged by calibration, not measured                                                                                  | The calibration slice reads them before and after                                                                | The slice stops and isolates the check further (its own dome, sun level, and exposure). The gate targets do not move                      |
| The frame cost of always-on shadows and occlusion is unmeasured. The one machine to be timed is far above the floor, and no Intel-class integrated GPU is available | The controlled timing run in the default switch slice, and the tracking issue for the missing hardware           | A miss at `full` is a performance defect. The default switch waits until it is corrected (section 6.7). The starting levels do not change |
| A sun about four times stronger pushes specular highlights and glass panes harder                                                                                   | The calibration slice's side-by-side baseline review, shared with the materials work                             | Glass and finish issues are filed against that area. The sun level is not lowered to hide them                                            |
| The short adapter for window-lit rooms may disagree with the kernel stage's plan geometry on room outlines                                                          | The plan geometry mapper's gate: no baseline moves                                                               | Differences are reviewed one by one, and the kernel's answer wins                                                                         |
| The opening light is stored state (#737)                                                                                                                            | ADR-0205, extension of 2026-11-22                                                                                | Only the opening instant seam of section 6.1 changed. No gate moved, because every gate pins its own instant                              |

## 10. Left to the builder

- Names of modules, functions, and fields beyond the shapes shown, and whether `EnvironmentLighting` renames `sunIntensity` or adds a field for the sun level.
- The form of the direct to diffuse curve between its two stated points, and the measured white code floor behind the sunlit white level.
- What the color check shows while the sun is below the horizon. No gate state covers it, and ADR-0192 states the choice.
- The date constant for the default instant, and how the sample site makes the clock read solar time.
- Settled by ADR-0204 and section 5.2 of `docs/specs/2026-11-19-first-view-of-a-project.md`: how the widest exterior door is found before the kernel stage, and the tie-break when two doors are equal.
- The cap on shadow texel size, the paper token for the drafting background, and the placement of the Daylight / Drafting control in the toolbar.
- The patch coordinates of every pixel gate, the camera of the two new harness states, each frozen threshold, and how a harness state asks for the south window.
- How the fields of several floors are packed into texture memory and how a fragment picks its floor.
- The compression curve for room brightness, which must keep the order of section 6.8, with the measured room mean and floor of readability. The window and threshold of the automatic step-down.
- The split of the last row of section 7 into pull requests.
