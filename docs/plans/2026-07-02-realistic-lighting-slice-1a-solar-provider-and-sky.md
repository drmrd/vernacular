# Realistic Environmental Lighting, Slice 1a (Solar Provider and Sky) Implementation Plan

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author, commits
> `test:`), `/implement` (implementer, commits `feat:`), `/clean-code-review`, `/refactor`
> (commits `refactor:`, possibly an empty marker). Do NOT use the generic subagent-driven harness.
> One behavior equals one full test -> feat -> refactor cycle; close every GREEN with a BLUE.
> Source current-state facts from `docs/brainstorm-prep/08-slice-1a-current-state.md` (read it
> first) and the "Slice 1a" acceptance in `docs/specs/2026-07-01-realistic-environmental-lighting.md`.

**Goal:** Turn the fixed schematic sun into a solar-driven, sky-colored directional light with a
`SolarLightingProvider` swappable against the existing basic lighting, so a scene can be lit for a
real location, date, and time. Slice 1a delivers the engine provider and the pure-core math; the
Environment panel is slice 1b.

**Architecture:** Pure-core owns the numerics: a solar-position function (location + instant +
UTC offset -> azimuth/altitude), a world-direction mapping that composes solar azimuth with
`Site.northBearing` and the plan-to-world convention, and an analytic clear-sky model that emits
sun and sky colors as `LinearRgb`. A core composition function turns `(site, observedAt, weather)`
into an `EnvironmentLighting` value object. The engine `SolarLightingProvider` consumes that value
object in `update(scene, environmentLighting)`, setting the directional light's direction and
color, the ambient/sky color, and refitting the shadow frustum; `LightingProvider` gains `update`.
The bridge `SceneLighting` selects the provider by a Schematic/Realistic mode (session state) and
computes `EnvironmentLighting` from the project `Site` plus the per-view observation instant.
Nothing changes in geometry builders; the provider swap is on the persistent render scene, so
toggling mode needs no rebuild.

**Tech Stack:** TypeScript, React, Three.js r184 WebGPU (lazy), Vitest (unit), Playwright
(scene-webgl visual tier, CI-only baselines).

## Global Constraints

- core/ imports no React/Three.js; engine/ is the only Three.js importer and keeps the lazy
  `await import('three/webgpu')`. All model mutations flow through `dispatch`.
- ESLint warnings do not fail CI, but the Clean Code rubric targets max-lines-per-function 40,
  max-lines 300, max-params 3, complexity 10, no-nested-ternary, no-magic-numbers (free: -1,0,1,2,100)
  and is applied at every BLUE. Test/story files relax no-magic-numbers and max-lines-per-function (120).
- Vitest filter: `pnpm exec vitest run <path>`. Full gate: `pnpm typecheck && pnpm lint &&
pnpm format:check && pnpm test && pnpm build`. Each command's own exit code (no piped tail).
- Conventional Commits; NO Co-Authored-By, NO Claude-Session trailer, NO em-dash in newly composed
  text (prose or code comments). Author `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- Branch off slice 0 (`feat/realistic-lighting-slice-0-foundations`) or off main once slice 0 merges.
  Slice 1a depends on `Site.timezone`, `ObservationInstant`, and the color-managed renderer from slice 0.

## Locked decisions (from the current-state findings, cross-area section)

1. **Core owns the numerics; the engine provider stays thin.** Pure-core computes an
   `EnvironmentLighting` value object; `SolarLightingProvider.update` only applies it to three.js
   objects. This keeps solar position, world direction, and sky color unit-tested in core with no GPU.
2. **Solar function takes an explicit UTC offset in minutes**, not an IANA string. A thin boundary
   helper (or the slice-1b panel) resolves `Site.timezone` to an offset; core stays free of a tz
   database. Document the fixed-offset assumption (no per-date DST resolution in core for the MVP).
3. **Algorithm: NOAA-grade solar position.** Accurate to well within architectural-visualization
   needs and validated against the NOAA solar calculator reference values. A higher-accuracy Meeus
   variant is a later option if sun studies need it.
4. **`LightingProvider` gains `update(scene, environmentLighting)`.** `apply` still does one-time
   light creation; `update` sets direction, colors, shadow, and ambient. `BasicLightingProvider.update`
   is a no-op (schematic lighting is static). `SolarLightingProvider` implements both.
5. **Sky ambient in two stages within the slice.** Stage A (cheap, immediate, locally testable):
   color the existing `HemisphereLight` from the sky model. Stage B (enhancement): a generated
   gradient environment map set as `scene.environment` for image-based reflections. Stage B is a
   spike (confirm the r184 WebGPU IBL path); if it slips, Stage A satisfies "ambient is colored by
   the sky model" and Stage B is tracked as a follow-on. The acceptance's "supplied as image-based
   lighting" is met by Stage B; land Stage A first so the slice is useful even if B needs iteration.
6. **Provider selection lives in `SceneLighting`** (bridge), keyed by a Schematic/Realistic mode held
   as per-view session state (mirroring `useColorTemperature`/`useObservationDateTime`). No geometry
   rebuild on toggle (lighting is on the persistent render scene, separate from the keyed geometry).

## File Structure

Created (pure core, fully unit-testable, no GPU):

- `core/environment/solar-position.ts` : `solarPosition(input): SolarAngles` (azimuth, altitude).
- `core/environment/solar-position.test.ts`
- `core/environment/sun-world-direction.ts` : `sunWorldDirection(angles, northBearing): Vector3`.
- `core/environment/sun-world-direction.test.ts`
- `core/environment/sky-model.ts` : `skyLighting(altitude, cloudCover): { sunColor; skyColor }` (LinearRgb).
- `core/environment/sky-model.test.ts`
- `core/environment/environment-lighting.ts` : `EnvironmentLighting` type + `computeEnvironmentLighting(input)`.
- `core/environment/environment-lighting.test.ts`

Created (engine):

- `engine/lighting/solar-lighting-provider.ts` : `SolarLightingProvider implements LightingProvider`.
- `engine/lighting/solar-lighting-provider.test.ts`

Modified:

- `core/environment/observation-time.ts` : add canonical instants `EQUINOX_NOON`, `WINTER_LATE_AFTERNOON`
  (only if the stories/tests need shared fixtures; otherwise define them in the test/harness).
- `core/index.ts` : export the new core types and functions.
- `engine/lighting/lighting-provider.ts` : add `update(scene, environmentLighting)` to the interface.
- `engine/lighting/basic-lighting-provider.ts` : implement a no-op `update`.
- `engine/lighting/lighting-rig.ts` : generalize `fitSunShadowToBounds` to accept a sun direction;
  add a sun/ambient-aware color setter (or extend `setLightingColor`).
- `engine/index.ts` : export `SolarLightingProvider` and any new lighting-rig helpers.
- `bridge/react/scene-lighting.tsx` : provider selection by mode; compute + pass `EnvironmentLighting`.
- `bridge/react/webgpu-scene-view.tsx` : hold the lighting mode as session state; pass site + observation.
- `app/app.tsx` + `bridge/react/scene-harness-view.tsx` : harness params for canonical env states (CI baselines).
- `e2e/tests/scene-solar.spec.ts` (new) : scene-webgl canonical-state acceptances (baselines on CI).
- `docs/knowledge/decisions/ADR-0143-solar-lighting-provider-and-sky.md` (new; confirm the next free number).

---

## Task 1: Solar position (pure core)

**Files:** Create `core/environment/solar-position.ts`, `core/environment/solar-position.test.ts`. Modify `core/index.ts`.

**Interfaces:**

- Produces:

```ts
export interface SolarPositionInput {
  latitude: number // decimal degrees, north positive
  longitude: number // decimal degrees, east positive
  observedAt: ObservationInstant // { date: 'YYYY-MM-DD', minutesSinceMidnight }
  utcOffsetMinutes: number // local civil time offset from UTC, e.g. -300 for EST
}
export interface SolarAngles {
  azimuth: number // radians, clockwise from true north
  altitude: number // radians, above the horizon (negative below)
}
export function solarPosition(input: SolarPositionInput): SolarAngles
```

**Steps:**

- [ ] **Step 1: Write the failing test.** In `solar-position.test.ts`, assert `solarPosition` against
      authoritative NOAA solar-calculator values for 2-3 known (location, instant) pairs, within a stated
      tolerance. TEST-AUTHOR ACTION: look up the reference azimuth/altitude from the NOAA Solar Calculator
      (or another authoritative published source) for these fixed cases and encode them as literals with a
      source comment. Suggested cases: (a) an equinox local noon at a mid-latitude northern city, sun near
      due south, altitude ~ (90 - latitude) degrees; (b) a summer-solstice morning; (c) a location in the
      southern hemisphere. Assert `toBeCloseTo(referenceRadians, 2)` (about 0.5 degree) for azimuth and
      altitude, and a monotonic sanity fact (altitude at local noon > altitude two hours earlier). Convert
      degrees to radians in the test. Do not invent reference numbers; use published ones.
- [ ] **Step 2: Run, expect RED** (module missing): `pnpm exec vitest run core/environment/solar-position.test.ts`.
- [ ] **Step 3: Commit** `test: cover the solar-position function against published ephemeris values`.
- [ ] **Step 4: Implement.** Implement the standard NOAA solar-position algorithm in
      `solar-position.ts`: from the civil instant and `utcOffsetMinutes`, form the Julian day and Julian
      century; compute the geometric mean longitude and anomaly of the sun, the equation of center, true
      longitude, apparent longitude, mean obliquity (corrected), declination, and the equation of time;
      derive the true solar time and hour angle from the local time and longitude; then solve for the
      solar zenith (hence altitude) and azimuth. Return radians, azimuth measured clockwise from true
      north. Keep functions small and name intermediate constants (no-magic-numbers is relaxed only in
      tests, not here, so name the coefficients or wrap the fit block with a scoped eslint-disable and a
      citation comment exactly as `core/color/color-temperature.ts` does for the Helland fit). The tests
      from Step 1 are the specification; iterate until they pass within tolerance. No `Date.now()`; if a
      `Date` is used for calendar math, construct it from explicit fields only.
- [ ] **Step 5: Run, expect GREEN.** Export from `core/index.ts` (type `SolarAngles`, `SolarPositionInput`,
      fn `solarPosition`).
- [ ] **Step 6: Full gate.**
- [ ] **Step 7: Commit** `feat: add the NOAA solar-position function`.
- [ ] **Step 8: BLUE** (`/clean-code-review` then `/refactor`).

---

## Task 2: Sun world direction (pure core)

**Files:** Create `core/environment/sun-world-direction.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes `SolarAngles` (Task 1), `Vector3` (`core/scene/vector3.ts`).
- Produces:

```ts
// Maps solar azimuth/altitude to a unit world direction pointing FROM the scene TOWARD the sun,
// composing the solar azimuth (clockwise from true north) with the site north bearing (plan-up to
// true north, radians) and the plan-to-world convention (plan north -> world -Z, ADR-0139).
export function sunWorldDirection(angles: SolarAngles, northBearing: number): Vector3
```

**Steps:**

- [ ] **Step 1: Write the failing test.** Assert known mappings: with `northBearing = 0`, an azimuth of
      0 (true north) and altitude 0 maps to world direction (0, 0, -1) within `toBeCloseTo(_, 5)` per
      component; azimuth 90 degrees (east), altitude 0 maps to (1, 0, 0); altitude 90 degrees (overhead)
      maps to (0, 1, 0). Add a case with a non-zero `northBearing` (e.g. plan rotated 90 degrees) asserting
      the direction rotates accordingly. Use a cross-product or dot-product sign check for orientation like
      `core/scene/plan-to-world.test.ts:27` if exact vectors are awkward.
- [ ] **Step 2: Run, expect RED.**
- [ ] **Step 3: Commit** `test: map solar angles to a world direction for known north bearings`.
- [ ] **Step 4: Implement.** Compute the horizontal components from azimuth (combined with
      `northBearing`) and the vertical component from altitude, then apply the plan-to-world axis
      convention (plan north -> world -Z) so the result matches `planToWorld`'s frame. Normalize. Keep it a
      small pure function; name any constants.
- [ ] **Step 5: Run, expect GREEN.** Export from `core/index.ts`.
- [ ] **Step 6: Full gate. Step 7: Commit** `feat: map solar angles to a world sun direction`.
- [ ] **Step 8: BLUE.**

---

## Task 3: Analytic sky-color model (pure core)

**Files:** Create `core/environment/sky-model.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Produces:

```ts
export interface SkyLighting {
  sunColor: LinearRgb // direct sun tint, warmer and dimmer near the horizon
  skyColor: LinearRgb // ambient/hemisphere sky tint, cooler
}
// altitude in radians (sun height); cloudCover 0..1 (0 clear, 1 overcast) desaturates toward grey.
export function skyLighting(altitude: number, cloudCover: number): SkyLighting
```

**Steps:**

- [ ] **Step 1: Write the failing test.** Assert relational, not absolute, facts (a fit, not a
      reference): (a) at high sun (altitude near pi/2) `sunColor` is near-white and brighter than at low
      sun; (b) near the horizon (altitude near 0) `sunColor` is warmer (r > b) and the summed intensity is
      lower; (c) below the horizon (negative altitude) the sun contributes little (near 0); (d) increasing
      `cloudCover` moves both colors toward neutral grey (reduces channel spread), asserted via
      `relativeLuminance`/channel-spread comparisons and `toBeGreaterThan`/`toBeLessThan`. Reuse
      `core/color` primitives (`LinearRgb`, `relativeLuminance`).
- [ ] **Step 2: Run, expect RED. Step 3: Commit** `test: cover the analytic sky-color model`.
- [ ] **Step 4: Implement.** A small analytic model: interpolate sun and sky colors as a function of
      sun altitude (warm/dim at the horizon, white/bright overhead) and blend toward grey by `cloudCover`.
      Do NOT reuse `kelvinToLinearRgb` directly (it clamps at 2700 K and is peak-normalized so it cannot
      dim); author dedicated altitude curves. Keep values in linear light (`LinearRgb`). Name the
      breakpoints/coefficients or wrap a documented fit in a scoped eslint-disable with a citation.
- [ ] **Step 5: GREEN.** Export from `core/index.ts`. **Step 6: gate. Step 7: Commit** `feat: add the analytic sky-color model`.
- [ ] **Step 8: BLUE.**

---

## Task 4: EnvironmentLighting composition (pure core)

**Files:** Create `core/environment/environment-lighting.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes Tasks 1-3, `Vector3`, `LinearRgb`, `ObservationInstant`, `LatLong`.
- Produces:

```ts
export interface EnvironmentLighting {
  sunDirection: Vector3 // unit world direction toward the sun
  sunColor: LinearRgb
  skyColor: LinearRgb // ambient/hemisphere tint
  sunUp: boolean // altitude > 0; when false, callers dim the direct sun
}
export interface EnvironmentLightingInput {
  latLong: LatLong
  northBearing: number
  utcOffsetMinutes: number
  observedAt: ObservationInstant
  cloudCover: number
}
export function computeEnvironmentLighting(input: EnvironmentLightingInput): EnvironmentLighting
```

**Steps:**

- [ ] **Step 1: failing test** asserting `computeEnvironmentLighting` composes the three functions:
      for a known input the `sunDirection` matches `sunWorldDirection(solarPosition(...), northBearing)`,
      `sunColor`/`skyColor` match `skyLighting(altitude, cloudCover)`, and `sunUp` is true at local noon /
      false at local midnight. Keep it a composition test (assert consistency with the piece functions),
      not new reference numbers.
- [ ] **Steps 2-3:** RED, commit `test: compose environment lighting from site, instant, and weather`.
- [ ] **Step 4: implement** the thin composition. **Steps 5-7:** GREEN, export, gate, commit
      `feat: compute environment lighting from site, instant, and weather`.
- [ ] **Step 8: BLUE.**

---

## Task 5: Generalize the lighting rig for a moving, two-tone sun (engine)

**Files:** Modify `engine/lighting/lighting-rig.ts`; add cases to `engine/lighting/lighting-rig.test.ts`. Modify `engine/index.ts` if new exports.

**Interfaces:**

- Produces (additive; keep existing signatures working):

```ts
// Position the directional light along an explicit unit direction and refit the shadow frustum.
export function fitSunShadowToDirection(
  scene: THREE.Object3D,
  direction: Vector3,
  bounds: Bounds3 | null,
): void
// Set the sun (directional) and sky (hemisphere) colors independently.
export function setSunAndSkyColor(
  scene: THREE.Object3D,
  sunColor: LinearRgb,
  skyColor: LinearRgb,
): void
```

Keep `fitSunShadowToBounds` and `setLightingColor` for the basic path (or have them delegate).

**Steps:**

- [ ] **Step 1: failing tests** in `lighting-rig.test.ts` (mirror the existing structure: build a
      `THREE.Scene`, `new BasicLightingProvider().apply(scene)`, find lights by `instanceof`): (a)
      `fitSunShadowToDirection` with a given unit direction positions the `DirectionalLight` on the
      opposite side of `center` along that direction and keeps the frustum covering `radius*2` (assert the
      position lies along the direction and the shadow-camera extents like the existing
      `fitSunShadowToBounds` test at lines 54-56); (b) `setSunAndSkyColor` sets the `DirectionalLight`
      color to `sunColor` and the `HemisphereLight` color to `skyColor` independently (`toBeCloseTo(_, 5)`).
- [ ] **Steps 2-3:** RED, commit `test: position the sun by direction and color sun and sky separately`.
- [ ] **Step 4: implement.** Factor the existing `fitSunShadowToBounds` center/radius/frustum math into
      a shared helper and add `fitSunShadowToDirection` that takes the direction as a parameter instead of
      the module `SUN_DIRECTION_NORMALIZED` constant; have `fitSunShadowToBounds` delegate with the
      constant so the basic path is unchanged. Add `setSunAndSkyColor`. Keep functions under 40 lines.
- [ ] **Steps 5-7:** GREEN, export from `engine/index.ts`, gate, commit
      `feat: position the sun by direction and set sun and sky colors independently`.
- [ ] **Step 8: BLUE.**

---

## Task 6: SolarLightingProvider and the provider `update` contract (engine)

**Files:** Modify `engine/lighting/lighting-provider.ts`, `engine/lighting/basic-lighting-provider.ts`;
create `engine/lighting/solar-lighting-provider.ts` + test; modify `engine/index.ts`.

**Interfaces:**

- Extends:

```ts
export interface LightingProvider {
  apply(scene: THREE.Object3D): void
  update(scene: THREE.Object3D, lighting: EnvironmentLighting, bounds: Bounds3 | null): void
}
```

- Produces: `class SolarLightingProvider implements LightingProvider`. `apply` creates the sun + sky
  lights (reuse the basic rig or its own). `update` sets sun direction via `fitSunShadowToDirection`,
  sun/sky colors via `setSunAndSkyColor`, dims the sun when `!lighting.sunUp`, and (Stage B) sets the
  sky environment. `BasicLightingProvider.update` is a no-op.

**Steps (behavior 6a: the contract + basic no-op):**

- [ ] Failing test: `BasicLightingProvider` still applies lights and `update` is a no-op that does not
      throw and does not change light count. RED, commit `test:`, implement the interface addition + no-op,
      GREEN, gate, commit `feat: add an update method to the lighting provider contract`, BLUE.

**Steps (behavior 6b: SolarLightingProvider.apply + update):**

- [ ] **Step 1: failing test** (`solar-lighting-provider.test.ts`, mirror `lighting-rig.test.ts`):
      after `apply(scene)` the scene has a `DirectionalLight` and `HemisphereLight`; after
      `update(scene, lighting, bounds)` with a known `EnvironmentLighting` (fixed `sunDirection`,
      `sunColor`, `skyColor`, `sunUp: true`), the directional light points along `sunDirection` (position
      on the far side of center), its color equals `sunColor`, the hemisphere color equals `skyColor`, and
      with `sunUp: false` the directional intensity drops to (near) zero. Use a fabricated
      `EnvironmentLighting` literal (no solar math in this engine test; the math is core-tested).
- [ ] **Steps 2-3:** RED, commit `test: apply and update the solar lighting provider`.
- [ ] **Step 4: implement** `SolarLightingProvider` using Task 5's helpers. **Steps 5-7:** GREEN,
      export from `engine/index.ts`, gate, commit `feat: add the solar lighting provider`. **Step 8: BLUE.**

---

## Task 7: Sky image-based lighting (engine, Stage B, spike)

**Files:** `engine/lighting/solar-lighting-provider.ts` (extend `update`), plus a small sky-environment
helper (e.g. `engine/lighting/sky-environment.ts`) + test where testable.

**Steps:**

- [ ] Spike first (document in the ADR): confirm the three.js r184 WebGPU path for setting
      `scene.environment` from a generated gradient equirectangular texture (whether PMREM is needed or
      available on the WebGPU backend). Keep it minimal: a two-color vertical gradient (sky to ground)
      built from `skyColor` and a ground tint.
- [ ] Because IBL correctness is a GPU/visual property, the unit-testable part is only the texture
      construction (dimensions, that the top rows encode `skyColor`, bottom rows the ground color): write a
      test on the pure texture-data builder if it is separable from three.js. The visual result is gated by
      Task 9 (scene-webgl). If the WebGPU IBL path proves involved, land Stage A only (Task 6 colored
      hemisphere) and file a tracking issue for Stage B; note it in the ADR consequences.
- [ ] Standard test -> feat -> refactor for the separable texture-data builder; feat-only for the
      three.js `scene.environment` wiring (GPU-only, like slice 0's renderer change), verified by the gate
      and the CI visual tier.

---

## Task 8: Provider selection, mode, and EnvironmentLighting wiring (bridge)

**Files:** Modify `bridge/react/scene-lighting.tsx`, `bridge/react/webgpu-scene-view.tsx`.

**Steps:**

- [ ] **8a (mode session state):** add a `useLightingMode` hook (session state, `'schematic' |
'realistic'`, default `'schematic'`) in `webgpu-scene-view.tsx`, mirroring `useObservationDateTime`.
      This is feat-only wiring plus a future panel control (slice 1b); the toggle behavior is unit-tested
      once a control exists (1b). For 1a, land the hook and thread it. If a minimal toggle is added to the
      toolbar for testing, cover it with a toolbar test; otherwise mark feat-only wiring.
- [ ] **8b (compute + apply EnvironmentLighting):** in `SceneLighting`, when mode is `'realistic'`,
      select `SolarLightingProvider`, compute `EnvironmentLighting` via `computeEnvironmentLighting` from
      `project.site` (latLong, northBearing, timezone -> utcOffsetMinutes at the boundary) and the per-view
      `observationInstant` + a cloud-cover value, and call `provider.update(scene, lighting, bounds)` in a
      layout effect keyed on those inputs. When mode is `'schematic'`, keep `BasicLightingProvider` and the
      existing color-temperature path. Selecting a provider must not rebuild geometry (it operates on the
      render scene). This is largely feat-only wiring (the R3F view has no unit-test harness, per slice 0);
      the behavior is gated by the pure-core tests (computeEnvironmentLighting) and the CI visual tier.
- [ ] Standard commits; feat-only wiring commits carry a body noting the coverage boundary, as slice 0
      did for the observation-time view wiring. Close each with a BLUE marker.

---

## Task 9: Canonical environment-state visual acceptances (CI-deferred baselines)

**Files:** Modify `app/app.tsx` + `bridge/react/scene-harness-view.tsx` (harness params); create
`e2e/tests/scene-solar.spec.ts`.

**Steps:**

- [ ] Extend the scene-harness seam (`?fixture=scene-harness`) with params that pin a fixed
      `ObservationInstant`, `Site.latLong`, `northBearing`, and mode `realistic` (mirror the existing
      `temp`/`scene` params parsed in `app.tsx`). Add named canonical states, for example
      `scene=equinox-noon` and `scene=winter-afternoon`, feeding fixed instants and a fixed location into
      `SceneHarnessView`. Determinism comes from the single static mount frame plus fixed inputs (no
      `Date.now()`).
- [ ] Add `e2e/tests/scene-solar.spec.ts` mirroring `scene-visual-regression.spec.ts` (`captureShell`,
      self-skip without webgl2/baseline). Commit as `test(e2e):`.
- [ ] The baselines render on the CI runner (darwin GPU) via the visual workflow; the spec self-skips
      locally without a baseline. Flag that these baselines, plus the slice-0 baseline regeneration, land
      on CI. Do not attempt local baselines.

---

## Task 10: Knowledge (ADR)

- [ ] Write ADR-0143 (confirm the next free number across all branches first; slice 0 used 0141 and 0142) for the solar lighting provider, the `EnvironmentLighting` contract, the analytic sky model,
      the sky IBL approach and its staging, and the `LightingProvider.update` addition. Record that it
      extends/supersedes ADR-0065 and ADR-0079 (lighting) and relates to ADR-0142 (environment foundations)
      and ADR-0141 (color-managed renderer). Run the humanizer pass before it lands. Commit `docs:`.

---

## Self-review

**Spec coverage (Slice 1a acceptance):**

- "solar-position function agrees with published reference values within a stated tolerance" -> Task 1.
- "world-direction mapping is asserted for known north bearings" -> Task 2.
- "visual-regression story renders canonical environment states ... matches CI baselines" -> Task 9
  (scene-webgl, CI baselines) built on the harness seam.
- "shadow frustum refits as the sun moves, and shadows track the sun" -> Task 5 (`fitSunShadowToDirection`)
  - Task 6 (provider `update`).
- "Ambient is colored by the sky model and supplied as image-based lighting" -> Task 3 (sky colors) +
  Task 6 Stage A (colored hemisphere) + Task 7 Stage B (IBL env map).
- "Implement SolarLightingProvider with apply and update(scene, environmentState)" -> Task 6 (the value
  object is `EnvironmentLighting`; the `EnvironmentState` name is reserved for the slice-1b panel-level
  session contract, noted in the ADR).
- "Generalize setLightingColor and fitSunShadowToBounds for a moving sun" -> Task 5.

**Placeholder honesty:** The NOAA solar formulae (Task 1) and the sky-color curves (Task 3) are
specified as "implement the named algorithm; the reference-value and relational tests are the
specification." This is deliberate: the exact numeric bodies are long, standard, and best driven by
the published-value tests rather than transcribed into the plan where an error would be invisible.
Every other task carries concrete interfaces, test shapes, and wiring. Task 7 Stage B is explicitly a
spike with a documented fallback (Stage A) so the slice cannot stall on the WebGPU IBL path.

**Type consistency:** `SolarAngles { azimuth, altitude }` flows Task 1 -> 2 -> 4. `EnvironmentLighting`
{ sunDirection, sunColor, skyColor, sunUp } is produced in Task 4 and consumed by Task 6's
`update(scene, lighting, bounds)` and Task 8's wiring. `Vector3` and `LinearRgb` are the existing core
types. `LightingProvider.update` has the same signature in the interface (Task 6a), both providers, and
the bridge call site (Task 8).
