# Daylight and shadow, the early pull requests: implementation plan

> **Execution:** role-separated red, green, blue cycles, run from the orchestrating session with
> `/test-first`, `/implement`, `/clean-code-review`, and `/refactor`, as `CLAUDE.md` describes.

**Goal:** land the six early pull requests of the daylight design: harness fixtures, a shadow that
reaches across the lawn, calibrated daylight with a white point, sample daylight for a project with
no site, the daylight field math, and the lighting hook spike.

**Architecture:** every target, curve, and fit lives in `core/` as pure TypeScript with Node tests.
`engine/` applies what `core/` computed, behind the existing `LightingProvider` seam, and no pull
request here adds a render pass. Each pixel gate is measured in the scene harness on the forced
WebGL 2 backend and frozen with its readings.

**Tech stack:** TypeScript, Vitest (unit project), Playwright (`scene-webgl` for the harness,
`chromium` for one journey), three.js 0.184.0 through `engine/` only.

**Spec:** `docs/specs/2026-11-15-daylight-and-shadow.md`. Read the sections named in each pull
request before starting it. Pull request #735 (the wall winding fix, #491) has merged (commit
`e7b6274f` on `main`), and the plan builds on it.

## Global constraints

- The layer rules hold: `core/` imports no React and no three.js, `engine/` is the only three.js
  importer, `bridge/` holds the React glue. three.js stays at 0.184.0. No new runtime dependency.
- No frame time is measured in this plan. No pull request here needs one, and timing runs only
  under conditions that the project owner schedules (spec section 6.7).
- Nothing is stored in the document or on the device (#737 is open). No schema version changes.
- The opening instant comes from one function, `openingInstant` (pull request 4).
- Exposure stays 1 and AgX stays the daylight operator. The targets and tolerances of the
  color-accuracy and tone-map-extreme gates do not move (0.06 and 0.04). The states those gates
  use, and the finish-contrast state, keep the present shell.
- A threshold that reads pixels is measured and then frozen (spec sections 3 and 6.9). This plan
  holds no final pixel threshold. Node tests state exact values or closed forms.
- `pnpm rgb:audit` accepts a `feat:` or `fix:` commit only after a `test:` commit, and it does not
  count `test(e2e):`. Every cycle that changes product code therefore starts with a Node test and
  ends with a `refactor:` commit (an empty marker when the review finds nothing). Scene specs and
  baselines are `test(e2e):` commits. Records and documents are `docs:` commits.
- The test author does not read implementation bodies. The implementer does not read test files:
  it gets the failing output and the contract of the cycle. A RED that changes a public name also
  updates the tests and fixtures that use the name, and runs `pnpm typecheck`.
- A RED also rewrites each existing case that the cycle's contract contradicts. The cycles name
  the known ones by file and line (lines as of `main` at `89d111f1`). If the GREEN run shows
  another, the implementer stops and reports, and the test author rewrites it.
- Each cycle lists the files that may change ("its test" is the `.test.ts` file beside a source
  file). An agent that needs another file stops and reports.
- Commit subjects: Conventional Commits, plain English, at most 100 characters, no milestone code,
  no number of a pull request or a cycle. No worktree directory name contains `scene-`.
- Local gate before each push, each command checked for its own exit code: `pnpm typecheck`,
  `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`,
  `pnpm rgb:audit --range origin/main..HEAD`, and `pnpm exec playwright test --project=scene-webgl`
  (the full scene project, because every pull request here touches rendering). `/clean-code-review`
  and `/review` run before the merge, which is a merge commit after `ci-complete` is green.
- Decision records are human-read prose: no em-dashes, and the `humanizer` skill runs on them
  (`.claude/rules.md` rule 17). Frontmatter follows ADR-0186. An amendment is a section
  `## Amendment <date>: <what changed>` with `updated:` bumped, as #735 amended ADR-0139. Run
  `pnpm knowledge:index` after each. This plan uses ADR-0192, ADR-0193, and ADR-0196.

## Decisions this plan makes

The spec leaves these to the builder (section 10). The pull request named holds the detail.

1. The south window is a fixture of its own, `shell-south-window`, placed west of the door because
   the sunlit-wall gate samples the wall east of the door. New harness states: `shadow-on-lawn`,
   `daylight-reference`, `sample-daylight`. New paint key: `daylight-white`. New whole-frame
   baselines go into `e2e/tests/scene-solar.spec.ts`, because the Linux refresh workflow uploads
   only that folder and the folder of `scene-visual-regression.spec.ts`.
2. Numeric gates print `[reading] <label>: <value>` through `logReading` (pull request 1).
3. The shadow fit is a pure function in `core/` that returns a box. The engine keeps its sphere
   fit and the bias pair of ADR-0158, and finds the ground plane in the scene it is given. The cap
   on texel size is what the reference project of ADR-0186 needs for its whole lawn shadow at the
   lowest gated sun, rounded up to half a millimetre (pull request 2).
4. `EnvironmentLighting.sunIntensity` is renamed `sunLevel`. The direct to diffuse curve is
   `1 + 4 * max(0, sin h) / sin(45 degrees)`. The white code floor is 225, and the level behind it
   comes from the tone curve of the pinned three.js build, transcribed into `core/` and confirmed
   by a pixel gate. The present tint pairs stay as raw inputs, because the three targets fix two
   scales and a white point and no hue (pull request 3).
5. The dome never falls below the level it has today with the sun below the horizon. Read
   literally, the ratio curve sends the dome to zero at sunset, which gives a black scene.
6. The dome's term toward the sun follows from one target: at the reference instant the horizon
   toward the sun is three times as bright as the horizon away from it (an estimate, and ADR-0192
   states its source). The color check's sun is 1.6 above the horizon and off below it.
7. The sample place is latitude 40, longitude 1.86 east, UTC offset 0. The longitude cancels the
   equation of time on the default date, so 10:30 on the clock is 10:30 solar time that day. The
   default instant is `{ date: '2026-03-20', minutesSinceMidnight: 630 }`.
8. `daylightSiteFor` takes the date as a third parameter, because the offset of a real site depends
   on the date. `OpeningInstantInput` is `{ site: Site | undefined }`. The widest exterior door is
   found floor by floor, and ties go to the door nearest plan-down, then to the lowest id.
9. The daylight field is evaluated on a work plane 850 mm above the floor. Light crosses one
   interior doorway. `DaylightRoom` gains `openToSky`. The "inter-reflection floor" of the spec is
   read as the room-average term, so a sealed room returns 0 (pull request 5).
10. The photometric anchor is this plan's decision: the level card at the reference instant
    receives 80 000 lux, exported as `REFERENCE_HORIZONTAL_ILLUMINANCE_LUX`. The physical reference
    is the clear-sky daylight availability equations of the IES Lighting Handbook. For a sun 45
    degrees up they give a direct normal illuminance of `127.5 klx * exp(-0.21 / sin 45 degrees)`,
    which is 94.7 klx and puts 67.0 klx on level ground, and a sky illuminance of
    `0.8 + 15.5 * sqrt(sin 45 degrees)`, which is 13.8 klx. The sum is 80.8 klx, rounded to 80 000
    lux, and its split of 4.8 to 1 agrees with the first target. ADR-0192 repeats the arithmetic
    and cites the edition.

Five more decisions depart from the letter of the spec, and each is stated here so that a reviewer
does not have to find it:

11. The tone curve puts code 225 near linear 2.1, where spec section 6.2 estimates 1.5. The sun
    term then comes out near eight times today's, not four. The targets stand (spec section 9), and
    cycle 3.6 computes both values.
12. Spec section 6.3 says that the sky mesh matches the dome at the zenith and at the far horizon.
    One gain cannot meet both. Cycle 3.8 fits the gain to one region near the horizon and records
    the residual at the zenith. The scattering constants are pinned, not tuned.
13. Spec section 6.9 sets every threshold of the sky gate at a midpoint, with today's sky as the
    defect probe. Cycle 3.9 uses exact relations for two of them ("not clipped" and "darker than
    the sunlit white wall"), because each is a relation with no free number. The blue of the clear
    sky and the grey of the overcast sky keep their midpoints.
14. Spec section 8 puts the display rule and the color check's bypass of the field into the scope
    of ADR-0196. Both wait for the window-lit rooms pull request. The record that cycle 5.5
    proposes covers the core math only and names the two as not decided yet.
15. Spec section 6.5 lists the removal of the location test in `effectiveLightingMode` under the
    default switch. Spec section 6.1 needs it for sample daylight, so cycle 4.4 removes it.

## Review focus

Inputs the spec implies and no gate of section 6.9 covers. Each has a test in the cycle named.

1. A plan with no exterior door, no door at all, or no walls. The front is plan-down and sample
   daylight still puts the sun on that side. Cycle 4.2.
2. A real site where the sun is below the horizon at the opening instant (a polar site in winter).
   The view keeps today's night level: no black face and every value finite. Cycles 3.6 and 2.1.
3. A house with many floors or a very large footprint. The shadow fit covers every caster, the far
   end of the shadow gives way, and every value is finite. Cycles 2.1 and 2.3.
4. A room with no window, two rooms that open only to each other, and an aperture that names a room
   that does not exist. The field returns 0, ends, or throws an error that names the room. Cycle 5.4.
5. A north bearing set with no location. The bearing is kept, the place is the sample place, the
   notice shows, and the front may be in shade. Cycles 4.1 and 4.5.

---

## Order and lanes

| #   | Pull request                             | Branch                                      | Starts after                       | Record            |
| --- | ---------------------------------------- | ------------------------------------------- | ---------------------------------- | ----------------- |
| 1   | Daylight fixtures                        | `feat/daylight-harness-fixtures`            | #735 merged                        | none              |
| 2   | Shadow reach                             | `fix/shadow-reach-on-the-lawn`              | 1 merged                           | amends ADR-0158   |
| 3   | Daylight calibration and the white point | `feat/daylight-calibration-and-white-point` | 2 merged                           | ADR-0192          |
| 4   | Sample daylight                          | `feat/sample-daylight`                      | 3 merged                           | ADR-0193          |
| 5   | The daylight field core math             | `feat/daylight-field-core-math`             | any time                           | ADR-0196 proposed |
| 6   | The lighting hook spike                  | `feat/lighting-hook-spike` (never merged)   | any time; its note after cycle 5.5 | a note in 0196    |

Pull requests 1 to 4 are the main sequence. Each merges before the next one branches, and no two of
them are open at the same time: all four refresh the baselines of `scene-solar.spec.ts`, and they
share `app/harness-environment.ts`, `core/environment/`, and `engine/lighting/`. Only pull request 4
refreshes story baselines. Pull requests 5 and 6 are independent of the main sequence and of each
other, and each runs in its own sibling worktree beside it. Pull request 5 moves no baseline and
shares only `core/index.ts` with pull requests 2, 3, and 4 (the one that merges second rebases,
and nothing else is at stake). Pull request 6 merges nothing and must not refresh or commit a
baseline. The spike can start at any time, but its note goes into ADR-0196, which cycle 5.5
creates, so the note waits for that cycle.

## How a pixel gate is set

The orchestrating session measures and applies the probes. The test author writes the spec text.

- [ ] Write the spec with its regions and a `logReading` call for each reading. A region is a
      square on the 320 by 240 harness frame, chosen on the captured frame so that it lies on one
      surface, at least 4 px inside its edges (the `squareRegion` form of
      `e2e/tests/scene-sunlit-wall.spec.ts`).
- [ ] Defect reading: capture with the defect probe that the gate names. "Today's render" is the
      build of the last commit before the GREEN of the cycle. Any other probe is a local edit that
      is never committed. Shipped reading: capture the build with the change.
- [ ] Noise: `--repeat-each=5` on both builds. The band is the largest reading minus the smallest.
- [ ] Threshold: the midpoint of the two readings. It must clear both by more than the noise band,
      or the cycle stops. Freeze it in a named constant in the spec file. The comment beside it
      records both readings, the noise band, the date, and the machine.
- [ ] Run the spec on the defect build once more and paste the failing output into the pull request
      text. The Linux reading comes from the log of the baseline refresh run and goes there too.

## Baselines and the color gates

- [ ] Each pull request lists the baselines it expects to move. One party, the orchestrating
      session, refreshes one time, after the last code cycle. A baseline that fails its comparison
      and is not on the list stops the pull request.
- [ ] macOS family: `pnpm build`, then
      `pnpm exec playwright test --project=scene-webgl --update-snapshots=all`. Restore every file
      that is not on the list (`git checkout -- <path>`), then run the project without the flag.
- [ ] Linux family: push the branch, run `gh workflow run refresh-scene-baselines.yml --ref <branch>`,
      download the artifact (`gh run download <run> -n scene-baselines`), and copy only the listed
      files into the two snapshot folders.
- [ ] Look at every refreshed image beside the old one before committing it. Commits:
      `test(e2e): refresh the scene baselines for <the change>` and
      `test(e2e): refresh the linux scene baselines for <the change>`.
- [ ] The color gates, before the first commit of the branch and after the last one:
      `pnpm exec playwright test --project=scene-webgl e2e/tests/scene-color-accuracy.spec.ts --reporter=list | grep '\[reading\]'`.
      The six readings (three swatches, near-white, near-black, and the near-black chroma) go into
      the pull request text with both columns. If a reading moves, stop (spec section 9).

---

## Pull request 1: daylight fixtures

Spec sections 6.9 and 7, and call 23 of section 4.2. Nothing changes in the application.

### Cycle 1.1: the numeric gates print their readings

- Files: `e2e/tests/scene-helpers.ts`, `scene-color-accuracy.spec.ts`, `scene-sunlit-wall.spec.ts`,
  `scene-ambient-occlusion.spec.ts` (all under `e2e/tests/`).
- [ ] `export function logReading(label: string, value: string): void` writes
      `[reading] <label>: <value>` with `console.log`. Each of the six color gate cases logs its
      sampled hex and its distance (the chroma for the achromatic case). The sunlit-wall gate logs
      both lightness values and the gap. The occlusion contrast gate logs its contrast. No
      assertion and no constant changes.
- [ ] Run the three specs and keep the output: these are the readings before the plan. Commit:
      `test(e2e): print the readings of the numeric scene gates`.

### Cycle 1.2: the shell with a south window

- Files: `bridge/react/harness-fixtures.ts`, `bridge/react/harness-fixtures.test.ts` (create).
- [ ] RED: `HARNESS_FIXTURES['shell-south-window']` has the walls and rooms of the shell. Its
      openings are the two of the shell plus one with `id: 'opening:south-window'`,
      `type: 'double-hung-window'`, `hostWallId: 'south'`, `center: { x: 800, y: 0 }`,
      `along: { x: 1, y: 0 }`, `normal: { x: 0, y: 1 }`, `width: 1000`, `height: 1200`,
      `sillHeight: 900`, `hostThickness: 120`. The window (plan x 300 to 1300) does not overlap the
      door (1550 to 2450). `HARNESS_FIXTURES.shell.openings` still has exactly two entries.
- [ ] GREEN: the fixture. Commits: `test: expect a shell fixture with a south window`,
      `feat: add a shell fixture with a south window`, then `refactor:`.

### Cycle 1.3: the daylight states take the window, and one state frames the cast shadow

- Files: `app/harness-environment.ts`, its test.
- [ ] RED: `equinox-noon`, `winter-afternoon`, and `overcast-noon` have
      `scene: 'shell-south-window'`. `color-check` has no `scene`; `color-accuracy`,
      `finish-contrast`, and `window-light` have `scene: 'shell'`; `ambient-occlusion` has
      `scene: 'furniture'`. `shadow-on-lawn` has the canonical site, `observedAt` of `2026-03-20`
      at 720 minutes, `realistic: true`, `scene: 'shell-south-window'`, and a `cameraPose` above
      the ground whose target has `y === 0` and `z < -3060` (the lawn north of the north wall).
      `resolveHarnessScene('shell-south-window')` is `undefined`: the key is not a query value.
      Old cases to rewrite in `app/harness-environment.test.ts`: `:33-47` and `:77-84` (the exact
      `toEqual` of `equinox-noon`, `winter-afternoon`, and `overcast-noon` gains
      `scene: 'shell-south-window'`), `:105-111` (the `scene` of `equinox-noon` and
      `winter-afternoon` is `'shell-south-window'`, not undefined), and `:182-184`
      (`resolveHarnessScene('equinox-noon')` is `'shell-south-window'`, and the state with no
      paired fixture that resolves to undefined is `color-check`).
- [ ] GREEN: the states. Starting pose: `position: { x: 1500, y: 7000, z: -8500 }`,
      `target: { x: 1500, y: 0, z: -4200 }`, `near: 100`, `far: 40000`. At that instant the shadow
      of the north wall runs about 2.2 m north and 1.0 m west.
- [ ] The orchestrator captures `?fixture=scene-harness&scene=shadow-on-lawn`. The frame must hold
      the north wall, the whole shadow, and sunlit lawn past its tip. If it does not, a new RED
      states the missing property and GREEN moves the pose.
- [ ] Commits: `test: expect the daylight harness states to use the south window`,
      `feat: give the daylight harness states the south window and frame the cast shadow`, then
      `refactor:`. If the pose moves:
      `test: expect the shadow state to frame the whole shadow on the lawn`,
      `fix: move the camera of the shadow state to frame the whole shadow`, then its own
      `refactor:`.

### Cycle 1.4: the baselines

- Files: `e2e/tests/scene-solar.spec.ts` and its snapshot folder.
- [ ] Add the case `renders the shadow on the lawn to its baseline` (`&scene=shadow-on-lawn`,
      `scene-shadow-on-lawn-webgl.png`, the standing shell tolerances).
- [ ] Expected to move, both families: `scene-equinox-noon`, `scene-winter-afternoon`, and
      `scene-overcast-noon` (the window appears, and sun falls through it). Added:
      `scene-shadow-on-lawn`. Eight files. Must not move: `scene-color-check`,
      `scene-ambient-occlusion`, `scene-window-light`, `scene-finish-contrast`, the six files of
      `scene-visual-regression.spec.ts`, the live-view frame.
- [ ] The sunlit-wall readings equal those of cycle 1.1 inside the noise band. If they do not, the
      window reaches a sampled region: stop.
- [ ] Refresh and read the color gates. Commits:
      `test(e2e): add the baseline of the shadow on the lawn`, then the two refresh commits with
      `the south window` as the change.

---

## Pull request 2: shadow reach

Spec section 6.4 and the "Shadow reach" row of section 6.9. Today `sceneBounds` skips the ground
plane (`engine/scene/scene-bounds.ts:17`) and `fitSunShadowAlongUnitDirection`
(`engine/lighting/lighting-rig.ts`) fits the bounding sphere of the casters alone.

**Interfaces** (new `core/environment/shadow-fit.ts`, exported from `core/index.ts`):

```ts
export interface ShadowFitInput {
  casters: Bounds3
  ground: Bounds3 | null // the ground plane's extent; min.y equals max.y
  sunDirection: Vector3 // unit, from the scene toward the sun
  maxRadius: number // millimetres, the cap on the radius of the fitted sphere
}
/** Half the diagonal of a box: the radius the engine fits its shadow camera to. */
export function boundsRadius(bounds: Bounds3): number
/** The casters and their shadow on the ground, clipped to the ground extent and to the cap. */
export function shadowFitBounds(input: ShadowFitInput): Bounds3
export const MAX_SHADOW_TEXEL_MM: number // added in cycle 2.3
```

The rule: project each caster corner that lies above the ground along the sun ray onto the ground
plane, clamp each projected point to the ground rectangle on each axis, and take the box of the
casters and those points. With the sun at or below the horizon the projected points take the limit:
the edge of the ground rectangle on the side away from the sun. If the radius of that box exceeds
`maxRadius`, shrink it linearly toward the caster box until the radius equals `maxRadius`. The
caster box is never shrunk, so the far end of the shadow gives way first.

### Cycle 2.1: the fit in `core/`

- Files: `core/environment/shadow-fit.ts` (create), its test (create), `core/index.ts`.
- [ ] RED, with casters `{ min: (0, 0, -3000), max: (4000, 2600, 0) }`, ground
      `{ min: (-5000, 0, -8000), max: (9000, 0, 5000) }`, and `maxRadius: 1e9` unless stated:
  - sun `(0, 1, 0)`, and `ground: null` with any sun: the result equals the casters;
  - sun `(0.7071, 0.7071, 0)`: `min.x` is `-2600` within 1, and nothing else moves;
  - sun `(cos 5 degrees, sin 5 degrees, 0)`: `min.x` is `-5000` (clipped to the ground);
  - sun `(1, 0, 0)` and sun `(0.995, -0.0995, 0)`: `min.x` is `-5000` and every number is finite;
  - casters with `min.y` of `-2400` (a basement): `min.y` stays, and no corner below the ground
    is projected;
  - `maxRadius: 4000` with the 5 degree sun: `boundsRadius(result)` is 4000 within 1, `max` equals
    the casters' `max`, and `min.x` lies between `-5000` and `0`;
  - `maxRadius: 2000` (under the casters' own radius of 2817.8), and casters of 60 m by 40 m by 30 m
    with `maxRadius: 20000`: the result equals the casters and every number is finite;
  - `boundsRadius` of the first casters is `Math.hypot(4000, 2600, 3000) / 2`.
- [ ] GREEN: the two functions. Commits:
      `test: expect a shadow fit that covers the casters and their shadow on the ground`,
      `feat: compute the shadow fit from the casters and the ground extent`, then `refactor:`.

### Cycle 2.2: the engine reports the ground extent and the shadow map size

- Files: `engine/scene/ground-plane.ts`, `engine/lighting/lighting-rig.ts`, their tests,
  `engine/index.ts`.
- [ ] RED: `groundExtent(root)` returns the world box of the ground plane that `addGroundPlane`
      built (the footprint plus 5000 on each side, with `min.y` and `max.y` at the grade), finds a
      plane nested under a parent object, and returns `null` when there is none. `SHADOW_MAP_SIZE`
      is exported and equals `2048`.
- [ ] GREEN: `export function groundExtent(root: THREE.Object3D): Bounds3 | null` and the export.
      Commits: `test: expect the engine to report the ground extent and the shadow map size`,
      `feat: report the ground extent and the shadow map size from the engine`, then `refactor:`.

### Cycle 2.3: the cap on texel size, measured on the reference project

- Files: `tests/performance/shadow-fit-reach.test.ts` (create), `core/environment/shadow-fit.ts`,
  `core/index.ts`.
- [ ] RED: build the framed scene of `createReferenceProject()` the way
      `tests/performance/scene-rebuild-counts.test.ts` does, and take its `bounds` and
      `groundExtent(root)`. Texel size is `2 * boundsRadius(fit) / SHADOW_MAP_SIZE`. Call the texel
      size of the uncapped fit at the winter-afternoon sun `(-0.7980, 0.0911, 0.5957)` `needed`.
      Then `MAX_SHADOW_TEXEL_MM === Math.ceil(needed * 2) / 2`. With
      `maxRadius: MAX_SHADOW_TEXEL_MM * SHADOW_MAP_SIZE / 2` the fit of the reference project
      equals its uncapped fit (the whole lawn shadow is kept). For casters twice as wide and twice
      as deep, with the ground grown by the same amount, the capped fit is smaller than the
      uncapped fit and still contains the casters. A house of six floors, each 60 m by 40 m and
      3 m high, built as a project in the test and framed the same way (the reference project has
      four floors): at that sun the capped fit contains the bounds of every floor, every number is
      finite, and its radius is at most the larger of the cap's radius and the casters' own.
- [ ] GREEN: the constant. The comment beside it records `needed`, the caster-only texel size, the
      reference bounds, and the date. If `needed` exceeds 20 mm, stop and report: the rule needs
      the owner. Commits:
      `test: expect the shadow texel cap to keep the reference project's lawn shadow`,
      `feat: cap the shadow texel size at what the reference project needs`, then `refactor:`.

### Cycle 2.4: the solar provider fits the receivers

- Files: `engine/lighting/solar-lighting-provider.ts`, its test.
- [ ] RED: a scene with a ground plane, the shell's caster bounds, and the winter-afternoon sun.
      After `update`, the shadow camera's `right` equals `boundsRadius(shadowFitBounds(...))` for
      those inputs and is larger than the casters' radius. `sun.shadow.normalBias` equals
      `Math.SQRT2 / SHADOW_MAP_SIZE * 2 * right` and `sun.shadow.bias` is unchanged (the pair of
      ADR-0158 follows the fit). With no ground plane the fit equals today's. With `bounds: null`
      nothing is fitted.
- [ ] GREEN: `update` passes the result of `shadowFitBounds`, with `ground: groundExtent(scene)`
      and `maxRadius: MAX_SHADOW_TEXEL_MM * SHADOW_MAP_SIZE / 2`, to `fitSunShadowToDirection`.
      `BasicLightingProvider` does not change. Commits:
      `test: expect the solar shadow frustum to cover the shadow on the ground`,
      `fix: fit the solar shadow frustum to the casters and their shadow on the ground`, then
      `refactor:`.

### Cycle 2.5: the gate, the baselines, and the record

- Files: `e2e/tests/scene-shadow-reach.spec.ts` (create), the snapshot folder of
  `scene-solar.spec.ts`, ADR-0158.
- [ ] Gate, by the procedure. State: `&scene=winter-afternoon`. Regions: `SHADOWED_LAWN`, a 24 px
      square on the lawn east of the east wall that reads sunlit on the defect build and shadowed
      on the shipped build (past today's cut-off, about 3 m from the building's center), and
      `SUNLIT_LAWN`, sunlit in both builds. Reading: OKLab L of `SUNLIT_LAWN` minus L of
      `SHADOWED_LAWN`. Defect probe: today's render, where the two are equal. This cycle has no
      GREEN, so the probe build is the last commit before the GREEN of cycle 2.4. Constant:
      `SHADOW_REACH_MIN_GAP`.
- [ ] Expected to move, both families: `scene-winter-afternoon` (the shadow runs to the edge of
      the lawn) and `scene-shadow-on-lawn` (its tip lies past today's frustum). May move, because
      a larger fit makes shadow edges coarser: `scene-equinox-noon`, `scene-color-check`,
      `scene-ambient-occlusion`, `scene-window-light`, `scene-finish-contrast`. Refresh one of
      these only if its comparison fails, and derive a derived pair again in that case (the
      comments in `scene-solar.spec.ts` name the probes). Must not move: `scene-overcast-noon` (no
      direct sun), the six schematic files, the live-view frame. The sunlit-wall and occlusion
      contrast readings stay inside their noise bands.
- [ ] ADR-0158 gains `## Amendment <date>: the fit covers the receivers`: the fit rule, the cap
      and its measurement, and that the bias pair follows with no new constant.
- [ ] Refresh and read the color gates. Commits:
      `test(e2e): gate the reach of the winter afternoon shadow across the lawn`, the two refresh
      commits with `the shadow reach` as the change, and
      `docs: record the shadow fit over the receivers`.

---

## Pull request 3: daylight calibration and the white point

Spec sections 6.2 and 6.3, and the gates "Sun to shade", "Daylight white", "Sky", and "Sunlit wall"
of section 6.9. Today the sun term is `DAYLIGHT_SUN_INTENSITY` (1.6,
`engine/lighting/lighting-rig.ts:29`) times the fade of `skyLighting`, and the dome is scaled by
`HORIZON_DOME_SCALE` in `core/environment/sky-dome.ts`. At the reference instant that is a direct
to diffuse ratio of about 0.7 to 1 on level ground (this plan's arithmetic). If a three.js bump is
open when this branch starts, stop: it lands first (spec section 3).

Two estimates of the spec do not hold against the transcribed tone curve, and cycle 3.6 computes
both: code 225 needs a linear level near 2.1, not 1.5, and the solve then gives a sun term about
eight times today's, not four. The targets stand (spec section 9). The pull request text states the
computed values, so the owner sees them before the merge.

**Interfaces** (all in `core/environment/`, exported from `core/index.ts`):

```ts
// tone-response.ts: the tone curve of the pinned three.js build, neutral input, exposure 1
export function agxNeutralResponse(linear: number): number // display-encoded, 0 to 1
export function agxNeutralInverse(encoded: number): number // bisection on the response
// light-model.ts: what a matte surface returns, with no shadow and no specular term
export function skyAmbientLevel(skyAmbient: readonly number[], normal: Vector3): LinearRgb
export type MatteSurface = { normal: Vector3; reflectance: LinearRgb }
export function predictedMatteRadiance(
  lighting: EnvironmentLighting,
  surface: MatteSurface,
): LinearRgb
// daylight-reference.ts and ground-surface.ts (cycle 3.5)
export const DAYLIGHT_REFERENCE_PLACE: LatLong // { latitude: 40, longitude: 1.86 }
export const DAYLIGHT_REFERENCE_INSTANT: ObservationInstant // 2026-03-20, 630 minutes
export function referenceLightingInput(): EnvironmentLightingInput // offset 0, bearing 0, clear sky
export const GROUND_SURFACE_HEX = '#5f8a4f'
export const GROUND_SURFACE_COLOR: LinearRgb
// sky-dome.ts and spherical-harmonics.ts (changed signatures, cycle 3.5)
export type SkyDomeInput = { sunDirection: Vector3; cloudCover: number } // unit sun, world frame
export function skyDomeRadiance(view: Vector3, sky: SkyDomeInput): LinearRgb
export function projectDomeToSphericalHarmonics(sky: SkyDomeInput): number[]
// daylight-calibration.ts (cycle 3.6)
export const WHITE_CODE_FLOOR = 225
export const NIGHT_DIFFUSE_LEVEL: number // 0.35 * 0.4445, today's level below the horizon
export const REFERENCE_HORIZONTAL_ILLUMINANCE_LUX = 80_000 // lux on the level card, decision 10
export const LUX_PER_UNIT_IRRADIANCE: number // the photometric anchor
export function directToDiffuseRatio(sunAltitude: number): number
export function sunLevelAt(sunAltitude: number, cloudCover: number): number
export function diffuseLevelAt(sunAltitude: number, cloudCover: number): number
export type LevelCardLight = { sun: LinearRgb; sky: LinearRgb }
export function levelCardLight(sunAltitude: number, cloudCover: number): LevelCardLight
export type DaylightCalibration = {
  whitePoint: LinearRgb
  sunScale: number
  sunlitWhiteLevel: number
}
export const DAYLIGHT_CALIBRATION: DaylightCalibration
```

`skyAmbientLevel` is the irradiance over pi from the nine coefficients, with the band factors 1,
2/3, and 1/4. A "level" is a luminance with the weights 0.2126, 0.7152, and 0.0722. Values on the
level card come from `levelCardLight`, a closed form over the upper dome (the term toward the sun
cancels there). It returns what a white level card returns from each source, which is irradiance
over pi. Values on a wall come from `predictedMatteRadiance`, which reads the harmonics the engine
renders. No value-import cycle may appear among these modules, and cycle 3.6 gives the module map.
The reference height is the sun height of `referenceLightingInput()`, 44.9877 degrees (0.785183
rad). Tests and code take it from `solarPosition`, never from a rounded 45.

### Cycle 3.1: the sky mesh takes a gain

Spec section 9 names this risk as the first task: the addon assigns its color node on the material
(`SkyMesh.js:371`).

- Files: `engine/lighting/sky-environment.ts`, `engine/lighting/lighting-rig.ts`, their tests.
- [ ] RED: after `attachSkyEnvironment` resolves, the sky's `turbidity`, `rayleigh`,
      `mieCoefficient`, and `mieDirectionalG` uniforms hold 2, 1, 0.005, and 0.8. `rig.skyGain` is
      a `THREE.Vector3` of `(1, 1, 1)`, and the material's color node is no longer the node the
      addon assigned. The module still names the addon only inside a dynamic `import()`.
- [ ] GREEN: the four named constants, `LightingRig.skyGain?: THREE.Vector3`, and a color node
      that is the addon's node times that vector. No pixel moves at `(1, 1, 1)`.
- [ ] Check with the vector at `(0.5, 0.5, 0.5)` as a local edit: the sky region of
      `&scene=equinox-noon` reads darker in the harness (WebGL 2), and the same holds in the live
      view on the Mac (WebGPU, realistic mode, through a throwaway scene spec, not an embedded
      browser pane). If either fails, the fallback of the spec applies: a local copy of the addon's
      color node in `engine/lighting/sky-color-node.ts` (create), noted in ADR-0192.
- [ ] Commits: `test: expect the visible sky to pin its scattering constants and take a gain`,
      `feat: pin the sky scattering constants and give the visible sky a gain`, then `refactor:`.

### Cycle 3.2: the reference state, the white paint, and the readings before the change

- Files: `app/harness-environment.ts`, `app/harness-paint.ts`, their tests.
- [ ] RED: `daylight-reference` has a `site` of latitude 40, longitude 1.86, `northBearing: 0`,
      and `timezone: 'UTC'`, `observedAt` of `2026-03-20` at 630, `realistic: true`,
      `scene: 'shell-south-window'`, and a `cameraPose` from the south-west that shows the south
      wall (the front, by its door) and the west wall (in shade).
      `resolveHarnessPaint('daylight-white')` paints the `right` side (the exterior) of the four
      walls `#ededed` in `matte` and nothing else. The linear value of `#ededed` is 0.85 within
      0.005.
- [ ] GREEN: the state and the paint key. Starting pose: `position: { x: -4500, y: 3200, z: 5000 }`,
      `target: { x: 2000, y: 1300, z: -1500 }`, `near: 100`, `far: 40000`. Commits:
      `test: expect a reference daylight harness state and a white wall paint`,
      `feat: add the reference daylight harness state and the white wall paint`, then `refactor:`.
- [ ] Write the four specs of cycle 3.9 with their regions and `logReading` calls, capture five
      times, and keep the readings: they are "today's render" for every gate of this pull request.
      The specs stay uncommitted until cycle 3.9.

### Cycle 3.3: the tone curve and the matte light model

- Files: `core/environment/tone-response.ts` (create), `core/environment/light-model.ts` (create),
  their tests (create), `core/index.ts`.
- [ ] RED:
  - `agxNeutralResponse` times 255 is 127.6 at 0.18, 157.2 at 0.34, 201.9 at 1, 223.7 at 2, and
    254.5 at 16, each within 0.2, and it never decreases;
  - `agxNeutralInverse(225 / 255)` is 2.100 within 0.005, and the inverse of the response of 0.5
    is 0.5 within 1e-4;
  - `skyAmbientLevel(NEUTRAL_DOME_SPHERICAL_HARMONICS, n)` is `(1, 1, 1)` for three normals, and
    for an ambient whose radiance is `1 + y` the level is `1 + 2/3` for the normal up, `1 - 2/3`
    for the normal down, and `1` for a horizontal normal;
  - `predictedMatteRadiance` is the reflectance times
    `sunColor * sunIntensity * 1.6 * max(0, n . sun) / pi + skyAmbientLevel`, and a surface turned
    away from the sun gets the sky term alone. (Cycle 3.4 replaces `sunIntensity * 1.6`.)
- [ ] GREEN: the four functions. The curve's source is `agxToneMapping` in
      `three/src/nodes/display/ToneMappingFunctions.js` of the pinned build. For a neutral input
      both matrices keep the value, so the response is
      `x = clamp((log2(max(v, 1e-10)) + 12.47393) / 16.5, 0, 1)`, the sixth-degree polynomial of
      that file, the power 2.2, and the sRGB encoding. Every coefficient is a named constant.
- [ ] Commits: `test: expect the neutral tone response and a matte light model`,
      `feat: state the neutral tone response and the matte light model in core`, then `refactor:`.

### Cycle 3.4: the sun level moves into `core/`

- Files: `core/environment/sky-model.ts`, `environment-lighting.ts`, `color-check.ts`,
  `light-model.ts`, their tests, `engine/lighting/lighting-rig.ts`, `solar-lighting-provider.ts`,
  `basic-lighting-provider.ts`, and the tests under `engine/lighting/` that build an
  `EnvironmentLighting`.
- [ ] RED: `EnvironmentLighting` and `SkyLighting` have `sunLevel` and no `sunIntensity`. At
      latitude 40, longitude -75, offset -240, `2026-03-20` at 720, `sunLevel` is `1.6 * 0.8267`
      within 0.001. After `SolarLightingProvider.apply` the sun's intensity is 0, and `update`
      sets it to `lighting.sunLevel` unchanged. `predictedMatteRadiance` reads `sunLevel`. Old
      cases to rewrite: `core/environment/sky-model.test.ts:81-86` (full sun is 1.6 at the zenith
      and `0.35 * 1.6` on the horizon), `engine/lighting/solar-lighting-provider.test.ts:117` and
      `:120-129` (the intensity after `update` is `lighting.sunLevel`, with no engine factor), and
      every fixture that builds an `EnvironmentLighting` with `sunIntensity`.
      `core/environment/color-check.test.ts:52` and `:58` keep their pass-through meaning under
      the new name until cycle 3.7.
- [ ] GREEN: the rename and the level in `core/`. `DAYLIGHT_SUN_INTENSITY` becomes
      `SCHEMATIC_SUN_INTENSITY` (still 1.6), read by `BasicLightingProvider` alone.
      `SolarLightingProvider.apply` builds its rig with a sun intensity of 0, and the first
      `update` sets the level. No pixel moves: the full scene project passes with no refresh.
      Commits:
      `test: expect the sun level in the environment lighting`,
      `feat: move the sun level into the environment lighting`, then `refactor:`.

### Cycle 3.5: the dome brightens toward the sun and takes its ground from the lawn

- Files: `core/environment/sky-dome.ts`, `spherical-harmonics.ts`, `environment-lighting.ts`,
  `daylight-reference.ts` (create), `ground-surface.ts` (create), their tests,
  `core/environment/color-check.test.ts`, `core/index.ts`, `engine/scene/ground-plane.ts`, its
  test.
- [ ] RED:
  - the sun of `referenceLightingInput()` stands 44.9877 degrees up within 1e-4;
  - with the sun at exactly that computed height toward `+x`, the luminance of the dome at the
    view `(1, 0, 0)` is 3 times its luminance at `(-1, 0, 0)`, within 1e-6 (a rounded 45 degrees
    gives 3.0009 and fails);
  - at the view `(0, 1, 0)` the radiance does not depend on the sun's azimuth, and at
    `cloudCover: 1` it does not depend on the view's azimuth;
  - the cosine-weighted mean of the upper dome is the same for a sun toward `+x` and toward `-z`,
    within 1e-6 (the term cancels on level ground);
  - a view below the horizon returns `GROUND_SURFACE_COLOR` times the light on a level card: the
    sun term `sunColor * sunLevel * sun.y / pi` plus that mean of the upper dome. With the sun
    below the horizon it returns the lawn times the sky alone;
  - the ground plane's material color equals `GROUND_SURFACE_HEX`;
  - old cases to rewrite: `core/environment/spherical-harmonics.test.ts:90-101` (the dome is no
    longer the same at every azimuth; the case becomes "the same radiance at every azimuth with
    the sun at the zenith or under full overcast, and a horizon toward the sun brighter than the
    horizon away from it under a clear sky with the sun at the reference height"), and every call
    of the two old signatures in `sky-dome.test.ts`, `spherical-harmonics.test.ts`,
    `environment-lighting.test.ts`, and `color-check.test.ts:25`.
- [ ] GREEN: the upper dome times `1 + gain * (1 - cloudCover) * (view.x * sun.x + view.z * sun.z)`
      with `gain = (3 - 1) / ((3 + 1) * cos(reference height))`, which is 0.706955 and is computed
      from the reference height, not typed in. Also the ground from the lawn and the new
      signatures. The fixed tint `(0.12, 0.1, 0.08)` goes. The engine builds the lawn color
      from the same hex, so the lawn's own pixels do not move.
- [ ] Commits: `test: expect a dome that brightens toward the sun over a ground lit by the sun`,
      `feat: brighten the dome toward the sun and compute its ground from the lawn`, then
      `refactor:`.

### Cycle 3.6: the three targets, the white point, and the two scales

The rules. `directToDiffuseRatio(h)` is `1 + 4 * max(0, sin h) / sin(45 degrees)`, so it is
exactly 1 at the horizon and below. `sunColor` is the raw sun tint divided by the white point and
scaled to luminance 1.
`sunLevel = sunScale * fade(h) * cloud transmission`, with today's fade and transmission. The
dome is scaled so that the sky level on the level card is
`max(direct / directToDiffuseRatio(h), NIGHT_DIFFUSE_LEVEL) * (1 - 0.3 * cloudCover)`, where
`direct = sunScale * fade(h) * sin(h) / pi` is taken for a clear sky. The white point is the color
of sun plus sky on the level card at the reference instant, scaled to luminance 1. `sunScale` is a
frozen number: the reference wall's level is linear in it, so solve once with the scale at 1 and
record the solve in the comment beside it.

- Files: `core/environment/daylight-calibration.ts` (create), its test (create), `sky-model.ts`,
  `sky-dome.ts`, `spherical-harmonics.ts`, `environment-lighting.ts`, their tests, `core/index.ts`.
- [ ] RED, with `L = computeEnvironmentLighting(referenceLightingInput())` and `card` the result
      of `levelCardLight`:
  - `directToDiffuseRatio` is 5 at 45 degrees, 1 at 0 and below, and rises between;
  - at the reference height the luminance of `card.sun` over that of `card.sky` equals
    `directToDiffuseRatio` of that height within 1e-6, and `card.sun + card.sky` has three equal
    channels within 1e-6;
  - `card.sky` at the reference, scaled so its largest channel is 1 and encoded to sRGB, has OKLab
    `b < 0` and a chroma between 0.02 and 0.10 (this plan's arithmetic gives 0.083);
  - at 20 and at 10 degrees, `card.sun + card.sky`, scaled and encoded the same way, has `a > 0`,
    `b > 0`, and a chroma of at least 0.01;
  - a wall with reflectance 0.85 and the normal `(0, 0, 1)` returns a luminance whose
    `agxNeutralResponse` times 255 is 225 within 0.5, the same wall square to the sun stays under
    code 250, and `DAYLIGHT_CALIBRATION.sunlitWhiteLevel === agxNeutralInverse(225 / 255)`;
  - `sunLevelAt(pi / 2, 0) === DAYLIGHT_CALIBRATION.sunScale`, and `L.sunLevel` equals
    `sunLevelAt` of the reference height;
  - at any height at or below 0 the luminance of `card.sky` is `NIGHT_DIFFUSE_LEVEL` within 1e-4,
    and `diffuseLevelAt` never decreases with height;
  - at `cloudCover: 1`: `sunLevel` is 0, the diffuse level is 0.7 times the clear one, and
    `card.sky` has three equal channels;
  - a polar night (latitude 78.2, longitude 15.6, offset 60, `2026-12-21` at 630): `sunLevel` is
    0, all 27 coefficients are finite, and a white vertical wall returns more than 0;
  - `REFERENCE_HORIZONTAL_ILLUMINANCE_LUX === 80000`, and `LUX_PER_UNIT_IRRADIANCE * pi` times
    the luminance of `card.sun + card.sky` at the reference height is 80000 within 0.01 (the card
    values are irradiance over pi, so the product is the card's irradiance in lux);
  - old cases to rewrite: `core/environment/sky-dome.test.ts:97-101` (the ground is no longer
    dimmer than the zenith under a high sun; with the sun at 90 degrees the ground is between 1.3
    and 2.0 times the zenith in luminance, about 1.6 by this plan's arithmetic);
    `sky-dome.test.ts:103-110` (it compares the dome with the hemisphere fill tint, which daylight
    no longer reads; the level-card cases above replace it);
    `core/environment/spherical-harmonics.test.ts:80-88` (the horizon is no longer brighter than
    the ground; the case becomes "under a clear sun at 90 degrees the reconstructed ground is
    brighter than the reconstructed horizon");
    `core/environment/sky-model.test.ts:81-86` (`sunScale` at the zenith and `0.35 * sunScale` on
    the horizon) and `:106-109` (the luminance of `sunColor` is 1 at every height, in place of a
    red channel of 1); and the assertion of cycle 3.4, which becomes
    `DAYLIGHT_CALIBRATION.sunScale * 0.8267` within 0.1 percent.
- [ ] GREEN: the module, on this map, which has no value-import cycle. `daylight-calibration.ts`
      holds the raw tint pairs of the sun and of the dome, the fade and the cloud transmission
      (moved from `sky-model.ts`), the closed-form mean of the upper dome, the white point, the
      levels, `levelCardLight`, the gain of cycle 3.5, and the frozen `sunScale`. Of the modules in
      `core/environment/` it imports only `tone-response.ts`, `solar-position.ts`, and
      `daylight-reference.ts` (which imports types alone). `sky-model.ts` and `sky-dome.ts` import
      it and keep no tint and no scale of their own that daylight reads.
      `sky-model.ts` keeps the tint pair of the hemisphere fill, which only the zeroed fill reads.
      `sky-dome.ts` also imports `ground-surface.ts`. `spherical-harmonics.ts` imports
      `sky-dome.ts`, and `environment-lighting.ts` imports `sky-model.ts` and
      `spherical-harmonics.ts`. `HORIZON_DOME_SCALE` goes.
- [ ] If the shade chroma falls outside its band, stop and report. Do not move the band. Put
      `sunScale`, the white point, and the diffuse level at the reference into the pull request
      text, beside today's values.
- [ ] Commits: `test: expect daylight calibrated from three stated targets`,
      `feat: derive the sun scale, the dome level, and the white point from three targets`, then
      `refactor:`.

### Cycle 3.7: the color check's sun is pinned

- Files: `core/environment/color-check.ts`, its test.
- [ ] RED: `colorCheckLighting` returns `sunLevel: 1.6` for a sun above the horizon at any height
      and any cloud cover, `sunLevel: 0` when `sunDirection.y <= 0`, the white sun color, and the
      neutral dome. `COLOR_CHECK_SUN_LEVEL` is exported and equals 1.6. Old cases to rewrite:
      `core/environment/color-check.test.ts:52-56` (a fractional level in gives 1.6 out, because
      the fixture's sun direction has a `y` of 0.75) and `:58-62` (it becomes the case of a sun
      direction with `y <= 0`, which gives 0). GREEN: the pin. Commits:
      `test: expect the color check sun pinned at its level with no fade`,
      `fix: pin the color check sun at its recorded level with no fade`, then `refactor:`.

### Cycle 3.8: the visible sky matches the dome

- Files: `engine/lighting/sky-environment.ts`, its test.
- [ ] RED: `export function skyMeshGain(): THREE.Vector3` returns a new vector whose `x`, `y`,
      and `z` are `SKY_MESH_GAIN` divided by the red, green, and blue of
      `DAYLIGHT_CALIBRATION.whitePoint`. `rig.skyGain` equals that vector after the attach.
      `SKY_MESH_GAIN` is one number, exported from `sky-environment.ts` and not from
      `engine/index.ts`.
- [ ] GREEN, measured and then frozen. With `SKY_MESH_GAIN` at 1, capture `&scene=equinox-noon`
      and read a sky region near the top of the frame, on the side away from the sun. Convert it
      with `agxNeutralInverse` of its encoded luminance. The target is the luminance of
      `skyDomeRadiance` in the view direction of that region, and the gain is the target over the
      reading. The comment beside the constant records both, and a second pair read at the zenith
      through a temporary camera pose that is not committed. The constants of cycle 3.1 are not
      tuned. ADR-0192 states the residual at the zenith.
- [ ] Commits: `test: expect the visible sky scaled to the dome and to the white point`,
      `feat: scale the visible sky to the dome and apply the white point`, then `refactor:`.

### Cycle 3.9: the gates

Procedure: "How a pixel gate is set". Each constant lives in its spec file, created under
`e2e/tests/`. "Today" is the reading of cycle 3.2.

| Spec                           | State and paint                                           | Reading                                                                                                      | Shipped against defect                                                             |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `scene-tone-curve.spec.ts`     | `daylight-reference`, `daylight-white`                    | Code of the sunlit south wall minus the code the light model predicts                                        | The shipped difference against a probe that maps daylight to the Neutral operator  |
| `scene-daylight-white.spec.ts` | `equinox-noon` and `winter-afternoon`, `daylight-white`   | Noon south wall: chroma and L. Afternoon east wall (shade): OKLab b. Afternoon south wall (low sun): b       | Each against today                                                                 |
| `scene-sun-to-shade.spec.ts`   | `shadow-on-lawn`                                          | Sunlit lawn over shadowed lawn, each as `agxNeutralInverse` of its encoded luminance                         | Low edge against today. High edge against a probe that zeroes the sky ambient      |
| `scene-sky.spec.ts`            | `equinox-noon` with `daylight-white`, and `overcast-noon` | Clear sky: OKLab b, largest channel, L against the sunlit south wall of the same frame. Overcast sky: chroma | Clear against today's near-white sky. Overcast chroma against the clear sky chroma |

- [ ] Exact relations, with no midpoint (decision 13): the clear sky's largest channel is under
      250, the clear sky's L is under the L of the sunlit white south wall in the same
      `equinox-noon` frame, and the reference wall reads at least
      `WHITE_CODE_FLOOR` minus the frozen tone curve tolerance. If the tone curve difference
      exceeds 3 codes, stop: the transcription or the model is wrong.
- [ ] The standing gates are derived again. `SUNLIT_WALL_MIN_GAP`: the two walls no longer receive
      the same sky, so predict both faces with `predictedMatteRadiance` through
      `agxNeutralResponse`, set the threshold at half the predicted gap, and record the model and
      the measured values as the comment does today. `AO_CONTRAST_MINIMUM` and the pair of the
      `scene-ambient-occlusion` baseline: repeat the probes that their comments name.
- [ ] Commits: `test(e2e): confirm the daylight tone curve on the reference wall`,
      `test(e2e): gate white, cool shade, and a warm low sun on white walls`,
      `test(e2e): gate the ratio of sunlit to shaded lawn`,
      `test(e2e): gate a blue clear sky and a grey overcast sky`,
      `test(e2e): derive the sunlit wall and occlusion gates again under calibrated light`.

### Cycle 3.10: baselines and the record

- [ ] Expected to move, both families: `scene-equinox-noon`, `scene-winter-afternoon`,
      `scene-overcast-noon`, `scene-ambient-occlusion`, `scene-window-light`, `scene-shadow-on-lawn`,
      and `scene-color-check` (its sunlit walls get brighter). Fourteen files. Must not move: the
      six schematic files and the live-view frame.
- [ ] `scene-finish-contrast` holds a small sun streak beside the east window, and the pinned sun
      makes it brighter. It is expected to stay under its ratio of 0.304. If it fails, stop.
- [ ] Review the fourteen images side by side with the materials in mind (spec section 9). File an
      issue for each glass or finish defect. The sun level is not lowered to hide one.
- [ ] ADR-0192, "Daylight is calibrated from three targets with a fixed white point" (status
      `current`): the three targets, the derived values, the raw tints as inputs, the night level,
      the photometric anchor and its source, the sky gain and its residual, and the color check
      below the horizon. Amendments in ADR-0156 (what the check measures, its sun at 1.6 with the
      code corrected, daylight calibrated separately), ADR-0148, and ADR-0161 (the term toward the
      sun, the computed ground, the calibrated sky mesh).
- [ ] Refresh and read the color gates. Commits: the two refresh commits with `calibrated daylight`
      as the change, and `docs: record the daylight calibration and the white point`.

---

## Pull request 4: sample daylight

Spec section 6.1 and the "Sample daylight" row of section 6.9. Today `effectiveLightingMode`
(`bridge/react/effective-lighting-mode.ts`) returns realistic only with `site.latLong`, and
`useSolarLightingUpdate` (`bridge/react/scene-lighting.tsx`) does nothing without it. Section 6.5
lists the removal of that test under the default switch, but section 6.1 needs it here. The lighting
mode still defaults to schematic after this pull request. The plan compass and the site editor do
not change.

**Interfaces.** `DaylightSite` is the shape of spec section 6.1, unchanged.

```ts
// core/scene/front-direction.ts (create)
export type PlanDirection = { readonly x: number; readonly y: number } // unit, y-up plan frame
export const PLAN_DOWN: PlanDirection // { x: 0, y: -1 }
export type FrontDirectionInput = Pick<SceneGraph, 'walls' | 'rooms' | 'openings'>
export function frontDirection(input: FrontDirectionInput): PlanDirection
// core/environment/daylight-site.ts (create)
export type DaylightSample = DaylightSite['sample']
export function daylightSampleOf(site: Site | undefined): DaylightSample
export function daylightSiteFor(
  site: Site | undefined,
  front: PlanDirection,
  date: string,
): DaylightSite
// core/environment/opening-instant.ts (create)
export type OpeningInstantInput = { readonly site: Site | undefined }
export function openingInstant(input: OpeningInstantInput): ObservationInstant
// bridge/react
export function effectiveLightingMode(realistic: boolean): LightingMode
export function ambientOcclusionActiveFor(realistic: boolean): boolean
export function useFrontDirection(): PlanDirection // use-front-direction.ts (create)
```

The implied bearing is `Math.atan2(front.x, -front.y)`: with it, true south is the front.

### Cycle 4.1: the site the sun is computed for

- Files: `core/environment/daylight-site.ts` (create), its test (create), `core/index.ts`.
- [ ] RED:
  - a site with `latLong` (51.5, -0.1), `northBearing: 0.3`, and `Europe/London`: the same
    location and bearing, offset 0 on `2026-03-20` and 60 on `2026-07-01`, `sample: 'none'`;
  - a site with only `latLong` (40, -75): bearing 0, offset -300, `sample: 'none'`;
  - a site with only `northBearing: 1.2`: the place is `DAYLIGHT_REFERENCE_PLACE`, the bearing is
    1.2 for every front, the offset is 0, `sample: 'location'`;
  - a site with only `northBearing: Math.PI` and the front `(0, -1)`: the bearing stays `pi`, the
    sample is `'location'`, and at `DAYLIGHT_REFERENCE_INSTANT` the cosine of the sun to the front
    is -0.595 within 0.005. A stored bearing is kept also when it leaves the front in shade;
  - `undefined` and `{}`: the sample place, offset 0, `sample: 'location-and-north'`, and a
    bearing of 0 for the front `(0, -1)`, `pi / 2` for `(1, 0)`, `-pi / 2` for `(-1, 0)`, and `pi`
    in absolute value for `(0, 1)`;
  - for each of those four fronts and for `(0.6, -0.8)`, with the sun of
    `computeEnvironmentLighting` at `DAYLIGHT_REFERENCE_INSTANT` and the front as the world vector
    `(front.x, 0, -front.y)`: the sun stands 45.0 degrees up within 0.2, the cosine to the front
    is 0.595 within 0.005 and at least 0.5, the cosine to the side east of the front,
    `(-front.y, front.x)`, is 0.383 within 0.005, and the cosines to the other side and to the
    back are negative;
  - a polar site with a location keeps its true sun and `sample: 'none'`, and `daylightSampleOf`
    agrees with `daylightSiteFor(...).sample` for the four rows of the table in spec section 6.1.
- [ ] GREEN: the module. Commits: `test: expect a sample site with the front turned to the sun`,
      `feat: compute the daylight site with a sample place and an implied north`, then `refactor:`.

### Cycle 4.2: the front direction

- Files: `core/scene/front-direction.ts` (create), its test (create), `core/index.ts`.
- [ ] RED, on small scene graphs built in the test:
  - a rectangular room with one door in its south wall gives `(0, -1)`, and with the door in the
    east wall `(1, 0)`. The result is the outward normal of the host wall, also when the opening's
    own `normal` points into the room;
  - of two exterior doors the wider one wins, and a window wider than every door does not count;
  - of two doors of equal width, the one whose outward direction is nearer `(0, -1)` wins, and of
    two that are equal there too, the lower id;
  - a door in a wall between two rooms does not count: a plan whose only door is an interior
    door gives `PLAN_DOWN`, and beside an exterior door the interior one never wins, however wide;
  - with two floors whose plans overlap, a door on the upper floor is judged against the rooms of
    its own floor (group by `floorId`);
  - no door, no opening, no room, and no wall each give `PLAN_DOWN`, and every result has length
    1 within 1e-9.
- [ ] GREEN: the function, on `exteriorWalls` and `openingKindOfType`. Commits:
      `test: expect the front direction from the widest exterior door`,
      `feat: find the front direction from the widest exterior door`, then `refactor:`.

### Cycle 4.3: one function gives the opening instant

- Files: `core/environment/opening-instant.ts` (create), its test (create), `observation-time.ts`,
  `environment-state.ts`, their tests, `core/index.ts`, `bridge/react/scene-lighting.tsx`,
  `bridge/react/scene-harness-view.test.ts`, `tests/architecture/opening-instant-seam.test.ts`
  (create).
- [ ] RED: `openingInstant({ site: undefined })` and `openingInstant({ site })` for a located site
      both equal `{ date: '2026-03-20', minutesSinceMidnight: 630 }`.
      `DEFAULT_ENVIRONMENT_STATE.observedAt` equals `openingInstant({ site: undefined })`. With
      `readLayerSources` of `tests/architecture/import-graph.ts`: no file names
      `DEFAULT_OBSERVATION_INSTANT`, and no file that is not a test names
      `DAYLIGHT_REFERENCE_INSTANT`, except `core/environment/opening-instant.ts`,
      `daylight-reference.ts`, `daylight-calibration.ts`, and `core/index.ts`. The barrel has
      re-exported the name since cycle 3.5 and keeps that export, so it is on the list.
- [ ] GREEN: the function returns `DAYLIGHT_REFERENCE_INSTANT`. The old constant goes.
      `SceneLighting` takes its default from `openingInstant({ site })`. Commits:
      `test: expect one function to give the instant a session opens at`,
      `feat: open each session at the March equinox morning through one function`, then
      `refactor:`.

### Cycle 4.4: daylight does not need a location

- Files: `bridge/react/effective-lighting-mode.ts`, its test (create), `scene-lighting.tsx`,
  `use-front-direction.ts` (create), `use-ambient-occlusion.ts`,
  `ambient-occlusion-render-takeover.tsx`, `webgpu-scene-view.tsx`, `scene-harness-view.tsx`, and
  the bridge tests that call the changed functions.
- [ ] RED: `effectiveLightingMode(true)` is `'realistic'` and `effectiveLightingMode(false)` is
      `'schematic'`. `ambientOcclusionActiveFor(true)` is true.
- [ ] GREEN: `SceneLighting` gains the prop `front: PlanDirection` and computes its lighting from
      `daylightSiteFor(site, front, observedAt.date)` for every site. The live view passes
      `useFrontDirection()`, which is `frontDirection` of the whole project graph from
      `useSceneGraph()`, not of the active floor. The harness passes `frontDirection` of its
      fixture. Commits: `test: expect daylight to render without a site location`,
      `feat: render daylight at the sample site when the project has no location`, then
      `refactor:`.

### Cycle 4.5: the sample notice

- Files: `editor/environment/environment-panel.tsx`, its test, its stories,
  `e2e/tests/environment-panel.spec.ts`.
- [ ] RED, in realistic mode: with no site, and with a site that has only `northBearing: 0.5`, the
      panel shows a `role="status"` notice with exactly "Sample daylight. Set the location and north
      in the Site panel for true sun angles." With a location and no bearing it does not. The text
      "Realistic lighting needs the site location" is gone. A located site with no timezone still
      shows the timezone notice. Schematic mode shows its notice as today. With a site that has
      only `northBearing: Math.PI`, the bearing that leaves a plan-down front in shade (cycle 4.1),
      the sample notice still shows.
- [ ] GREEN: the notice, chosen by `daylightSampleOf(site) !== 'none'`. The story `MissingLocation`
      becomes `SampleDaylight`.
- [ ] The journey in `e2e/tests/environment-panel.spec.ts` expects the new text. Run it with
      `pnpm exec playwright test --project=chromium e2e/tests/environment-panel.spec.ts`.
- [ ] Commits: `test: expect the sample daylight notice in the environment panel`,
      `feat: say in the environment panel that the daylight is a sample`, then `refactor:`, then
      `test(e2e): expect the sample daylight notice in the environment journey`.

### Cycle 4.6: the no-site state, its gate, the baselines, and the record

- Files: `app/harness-environment.ts`, its test, `e2e/tests/scene-sample-daylight.spec.ts`
  (create), `e2e/tests/scene-solar.spec.ts`, the snapshot folders, the records.
- [ ] RED: `sample-daylight` has `site: {}`, `observedAt` of `2026-03-20` at 630,
      `realistic: true`, `scene: 'shell-south-window'`, and the `cameraPose` of
      `daylight-reference`. GREEN: the state.
- [ ] Gate, by the procedure: OKLab L of the south wall minus L of the west wall. The threshold is
      half the gap that `predictedMatteRadiance` predicts, with the zero gap as the defect reading
      (as the sunlit-wall gate). Constant: `SAMPLE_DAYLIGHT_MIN_GAP`. Also assert that the south
      wall of this frame reads the same as the south wall of `daylight-reference`, inside the
      noise band: the two states share a camera, and the implied north gives the reference sun.
- [ ] Add the case `renders sample daylight to its baseline` (`scene-sample-daylight-webgl.png`).
      It is added in both families. No other scene baseline moves, because every other state pins a
      located site and its own instant. The live-view frame does not move (it is schematic).
- [ ] Story baselines expected to move: the stories of `EnvironmentPanel` (the default instant
      shows as 20 March at 10:30, `editor-environmentpanel--missing-location-linux.png` goes, and
      `editor-environmentpanel--sample-daylight-linux.png` arrives). Dispatch
      `refresh-story-baselines.yml` on the branch and commit the `story-baselines` artifact. A
      story of another component that moves stops the pull request.
- [ ] ADR-0193, "Sample daylight for a project with no site location" (status `current`): the
      sample place and why its longitude is 1.86, the front direction and its tie-break, the
      implied north, the notice, the opening instant seam and #737, and the date parameter of
      `daylightSiteFor`. Amendments in ADR-0144 (the fallback to schematic is gone) and ADR-0146
      (the notice).
- [ ] Refresh and read the color gates. Commits: `test: expect a harness state with no site`,
      `feat: add the harness state that renders sample daylight`, `refactor:`,
      `test(e2e): gate a sunlit front under sample daylight`, the refresh commits with
      `sample daylight` as the change,
      `test(e2e): refresh the environment panel story baselines for sample daylight`, and
      `docs: record sample daylight for a project with no site location`.

---

## Pull request 5: the daylight field core math

Spec section 6.8 and the "Daylight field, Node" row of section 6.9. Node only: no pixel, no engine
file, no bridge file. Everything is new under `core/daylight/` and `tests/daylight/`. One field
covers the rooms of one floor.

**Interfaces** (exported from `core/index.ts`). `DaylightField`, `DaylightRoom`, and
`DaylightAperture` are the shapes of spec section 6.8, in `core/daylight/daylight-field.ts`.
`DaylightRoom` gains `openToSky?: boolean`. The data is row-major, four values for each cell, with
row 0 at `origin.y`.

```ts
// core/daylight/daylight-field.ts
export const DAYLIGHT_FIELD_CELL_SIZE_MM = 100
export const SKY_VISIBILITY_CHANNEL = 3 // channels 0 to 2 hold the bounce color
export function createDaylightField(rooms: readonly DaylightRoom[]): DaylightField
export function daylightFieldCellIndex(field: DaylightField, column: number, row: number): number
export function sampleSkyVisibility(field: DaylightField, point: Point): number
// core/daylight/form-factor.ts: x along the wall from the foot of the point, z above its height
export type WallRectangle = { x0: number; x1: number; z0: number; z1: number }
export function horizontalPointToWallRectangle(rectangle: WallRectangle, distance: number): number
export type Reveal = { distance: number; depth: number }
export function visibleThroughReveal(rectangle: WallRectangle, reveal: Reveal): WallRectangle | null
// core/daylight/sky-visibility.ts
export type SkyLuminance = (direction: Vector3) => number // 1 is the mean of the open sky
export const UNIFORM_SKY: SkyLuminance
export const DAYLIGHT_WORK_PLANE_HEIGHT_MM = 850
export const UNPAINTED_SURFACE_REFLECTANCE = 0.66 // the luminance of #d8d4cc
export interface DaylightFieldSolver {
  field(sky: SkyLuminance): DaylightField
  enteringFlux(room: number, sky: SkyLuminance): number
  interreflection(room: number, sky: SkyLuminance): number
  readonly geometryPasses: number
}
export function createDaylightFieldSolver(rooms: readonly DaylightRoom[]): DaylightFieldSolver
```

The math, stated once for both roles:

- Form factor. With `G(x, z) = (atan(x / d) - d / hypot(d, z) * atan(x / hypot(d, z))) / (2 * pi)`,
  the factor of the rectangle is `G(x1, z1) - G(x0, z1) - G(x1, z0) + G(x0, z0)`. The part of a
  rectangle below the point's height is cut off first.
- Reveal. The opening is the same rectangle on the inner face and, one reveal depth further out,
  on the outer face. Seen from the point, the outer one scales by `d / (d + depth)` toward the foot
  of the point. The visible rectangle is the overlap of the two, or `null`.
- Direct term of a cell: the sum over the room's apertures of the form factor from the cell center
  at the work plane height, times a weight. For a sky aperture the weight is `sky(direction)`, with
  the direction along the aperture's outward normal, raised by `atan(2 / pi)` (the mean direction
  of the sky that a vertical opening faces). Plan `(x, y)` maps to world `(x, up, -y)`. For a
  doorway the weight is the mean visibility of the room it names, computed from that room's sky
  apertures alone.
- Entering flux of a room: the sum over its apertures of `0.5 * weight * width * (head - sill)`.
- Room-average term: `flux * rho / (S * (1 - rho))`. `S` is twice the floor area plus the perimeter
  times the ceiling height. `rho` is the area-weighted mean of the floor color's luminance (over
  the floor) and `UNPAINTED_SURFACE_REFLECTANCE` (over the rest).
- Visibility of a cell in a room: `min(1, direct + room-average)`. A room with `openToSky` holds 1.
  A cell whose center lies in no room holds 1. The bounce channels hold 0 in this pull request.

### Cycle 5.1: the form factor and the reveal

- Files: `core/daylight/form-factor.ts` (create), its test (create).
- [ ] RED: the rectangle `[0, 1000] x [0, 1000]` at distance 1000 gives 0.055734 within 1e-6. The
      rectangle `[-500, 500] x [50, 1250]` at 1000 gives 0.087041 within 1e-6. A rectangle of
      `1e12` by `1e12` from the foot gives 0.25 within 1e-6. Mirroring `x` gives the same value.
      Widening a rectangle never lowers the value. A rectangle wholly below the point gives 0. With
      a reveal depth of 120 the second rectangle becomes `[-446.43, 446.43] x [50, 1116.07]` within
      0.01 and gives 0.071836. A reveal that hides the whole opening gives `null`.
- [ ] GREEN: the two functions. Commits:
      `test: expect the closed form of a point to rectangle form factor`,
      `feat: compute the form factor from a floor point to a wall opening`, then `refactor:`.

### Cycle 5.2: the field and its grid

- Files: `core/daylight/daylight-field.ts` (create), its test (create), `core/index.ts`.
- [ ] RED: rooms that cover 12 m by 9 m give 120 columns and 90 rows with `cellSize: 100`. The
      origin is the lowest corner of the rooms' bounding box, snapped down to a multiple of 100.
      `data.length` is `4 * columns * rows`. A new field holds visibility 1 and bounce 0 in every
      cell. `daylightFieldCellIndex` is `4 * (row * columns + column)`. `sampleSkyVisibility` reads
      the cell that contains the point and returns 1 outside the grid. No rooms give a field of 0
      columns and 0 rows.
- [ ] GREEN: the shapes and the three functions. Commits:
      `test: expect a daylight field grid in plan coordinates`,
      `feat: add the daylight field grid in plan coordinates`, then `refactor:`.

### Cycle 5.3: sky visibility through windows

The test room: outline `(0, 0)` to `(4000, 3000)`, ceiling 2600, floor color `(0.5, 0.5, 0.5)`, one
sky aperture with the span `(4000, 1000)` to `(4000, 2000)`, sill 900, head 2100, reveal 0.

- Files: `core/daylight/sky-visibility.ts` (create), its test (create), `core/index.ts`.
- [ ] RED, under `UNIFORM_SKY` unless stated:
  - the cell that contains `(3050, 1550)` holds the form factor of its own center plus
    `interreflection(0, sky)`, within 1e-6;
  - a room with `openToSky` holds 1 in every cell, and a cell outside every room holds 1;
  - the field of the test room is symmetric about `y = 1500` within 1e-6;
  - widening the span to `(4000, 500)` to `(4000, 2500)` lowers no cell, and a reveal of 120
    raises none;
  - a sky that is 2 for every direction with a positive `x` and 1 elsewhere doubles the direct
    term of the east window;
  - `UNPAINTED_SURFACE_REFLECTANCE` is the luminance of `#d8d4cc` within 0.005;
  - after three calls of `field`, `geometryPasses` is 1 (a time scrub weights the cached factors
    again and computes none).
- [ ] GREEN: the solver with the direct term. `interreflection` may return 0 until cycle 5.4.
      Commits: `test: expect sky visibility that falls off from a window`,
      `feat: compute sky visibility from the windows of a room`, then `refactor:`.

### Cycle 5.4: the room-average term, doorways, and the hard inputs

- Files: `core/daylight/sky-visibility.ts`, its test.
- [ ] RED:
  - for the test room, `enteringFlux` is 600000 and `interreflection` is 0.016785 within 1e-5
    (`S` is 60400000 and `rho` is 0.62821);
  - a room whose only aperture has its head at 800 (under the work plane) holds exactly
    `interreflection` in every cell: this is the inter-reflection floor of the spec;
  - a room with no aperture holds 0 in every cell, and every value is finite;
  - energy: the sum over the test room's cells of `visibility - interreflection`, times the cell
    area, is at most `enteringFlux`, and `interreflection * S * (1 - rho)` equals
    `enteringFlux * rho` within 1e-6;
  - a hall with one doorway to the test room and no window has a mean above 0 and below the test
    room's mean;
  - two rooms that open only to each other hold 0, and the call returns;
  - an aperture that names room 7 of two rooms, or its own room, throws a `RangeError` whose
    message names the room index, and a floor color of `(1, 1, 1)` gives finite values.
- [ ] GREEN: the term, the doorway weight, and the checks. Commits:
      `test: expect a room-average term, borrowed light, and safe answers for sealed rooms`,
      `feat: add the room-average term and light borrowed through a doorway`, then `refactor:`.

### Cycle 5.5: the shell's field, plotted, and the record

- Files: `tests/daylight/shell-field.test.ts` (create),
  `docs/knowledge/decisions/ADR-0196-plan-space-daylight-field.md` (create).
- [ ] The test builds the shell as one `DaylightRoom` (the clear rectangle of 3880 by 2880, the
      east window with a reveal of 120) and asserts that the mean visibility lies between 0 and 1
      and that the cell nearest the window is the brightest. With `PLOT_DAYLIGHT_FIELD=1` it also
      writes the visibility channel as an SVG heat map into the system's temporary folder and
      prints the path. Attach the image and the mean, the minimum, and the maximum to the pull
      request text.
- [ ] ADR-0196, "Interior daylight is a plan-space field computed in core" (status `proposed`):
      the data shape, the work plane, the form factor, the room-average term, the single doorway
      pass, `openToSky`, the known limits of spec section 6.8, and what waits for the spike. The
      display rule and the color check's bypass of the field belong to the record's scope (spec
      section 8), but they wait for the window-lit rooms pull request: the proposed record names
      both under "Not decided yet" (decision 14). It lists ADR-0172 and ADR-0156 under "Will
      amend" and edits neither: a proposed record amends nothing. Commits:
      `test: check the daylight field of the harness shell`,
      `docs: propose the plan-space daylight field`.

---

## Pull request 6: the lighting hook spike

Spec section 9, first three rows. A throwaway branch in its own worktree. It is never opened as a
pull request and no product code from it merges. It measures no frame time. The red, green, blue
cycle does not apply to it.

- [ ] Question 1, the lookup. Where `engine/postprocessing/ambient-occlusion.ts` installs
      `scenePass.contextNode = builtinAOContext(occlusion.r)`, multiply the occlusion term by a
      value read from a half-float data texture by world position (`x` and `z` through an origin
      and a cell size), offset one cell along the world normal. Fill the texture with 0.25 inside
      the shell's clear rectangle and 1 outside. Pass: in `&scene=window-light` on the harness
      (WebGL 2) the interior regions read darker and an exterior region reads the same inside the
      noise band, and the same holds on WebGPU in the live view on the Mac, read through a
      throwaway scene spec.
- [ ] Question 2, the plain level. Remove the gather (no occlusion node in the graph) and keep the
      pipeline's scene pass, with the context holding the texture value alone. Pass: the darkening
      still shows on both backends. Report whether that scene pass has to stay at the plain level.
- [ ] Question 3, added light. Add a constant warm radiance of 0.2 inside the rectangle, once
      through `scene.environmentNode` and once through a custom light node. Report which one works
      on each backend and whether either adds a render pass (compare the render call count of one
      frame).
- [ ] The result is a section `## Lighting hook spike, <date>` in ADR-0196: yes or no for each
      question on each backend, the working code excerpt, the three.js version, and one sentence:
      window-lit rooms can or cannot land before the scene stage. The note waits for cycle 5.5,
      which creates the record. Commit it to the branch of pull request 5 once that cycle is done
      there, or, after pull request 5 has merged, through a pull request from
      `docs/lighting-hook-spike-note`. Until then the result stays in the spike worktree. Commit:
      `docs: record the result of the lighting hook spike`. Then delete the spike branch and its
      worktree.

---

## Not in this plan

- The entrance-facing first camera (#627): it has its own design. It will call `frontDirection`.
- The daylight default, the drafting style, and the quality levels (ADR-0194, ADR-0195): they need
  the timing command of #684 and a controlled timing run that the owner schedules.
- Window-lit rooms in the engine: they need the result of the spike.
- The plan geometry mapper: it needs the kernel stage (#687).
- Floor bounce and the frame-owner work: they need the scene stage (#689).
- Stored light (#737): its design is open, and nothing here stores anything.

## After the last pull request

- [ ] Refresh the skill notes under `.claude/skills/` that list the harness states, the scene
      baselines, and the numeric gates.
- [ ] File an issue for anything a pull request scoped down, and for each defect found in the
      side-by-side review of cycle 3.10.
- [ ] Tell the owner which values of spec section 6.2 changed from estimate to measurement.
