# Visible Sky and Sky Image-Based Lighting Implementation Plan

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author, commits
> `test:`), `/implement` (implementer, commits `feat:`), `/clean-code-review`, `/refactor`
> (commits `refactor:`, possibly an empty marker). Do NOT use the generic subagent-driven harness.
> One behavior equals one full test -> feat -> refactor cycle; close every GREEN with a BLUE
> BEFORE the next `test:` commit, and run
> `node scripts/rgb-audit/rgb-audit.mjs --range origin/main..HEAD` before every push. Feat-only
> commits (none are planned here) need an `Infrastructure:` trailer. Source current-state facts
> from MERGED main after PR #454: read `core/environment/{sky-model,environment-lighting,color-check}.ts`,
> `engine/lighting/{lighting-rig,lighting-provider,solar-lighting-provider}.ts`,
> `engine/renderer/tone-mapping.ts`, `bridge/react/scene-lighting.tsx`, issue #436, and
> ADR-0144/0146/0147.

**Goal:** Realistic mode shows a sky (sun disc, procedural clouds driven by the cloud-cover
dial, dusk gradients) and is lit by that same sky through a spherical-harmonics light probe,
replacing the flat hemisphere fill that today leaves dusk renders reading as unfinished.

**Architecture:** Core stays the source of truth: a new analytic sky-dome radiance function
extends the slice-1a sky model from one averaged ambient tint to a view-direction-dependent
dome, and a pure spherical-harmonics projection turns that dome into nine RGB coefficients
carried on `EnvironmentLighting`. The engine grows one module that attaches a `SkyMesh` (the
TSL sky addon, WebGPU-native with a WebGL2 fallback) plus a `THREE.LightProbe` to the solar
rig and drives both from the provider's existing `update`. No renderer access is needed
anywhere, so the provider contract and the bridge wiring do not change shape; the bridge is
untouched. The color check neutralizes the probe exactly as it neutralizes the sun and sky
tints, in core.

**Tech Stack:** TypeScript, Three.js r184 (`three/examples/jsm/objects/SkyMesh.js`,
`LightProbe`, `SphericalHarmonics3`), Vitest, Playwright scene-webgl tier (CI-only baselines).

## Global Constraints

- core/ imports no React/Three.js; engine/ is the only Three.js importer (addon imports from
  `three/examples/jsm/` count as Three.js and live in engine only).
- All model mutations flow through `dispatch(command)`; nothing here touches the model or undo.
- ESLint zero-problems gate (warnings count; baseline 44): max-lines-per-function 40, max-lines
  300, max-params 3, complexity 10, no-magic-numbers (name a `const`). Test files relax
  no-magic-numbers and get 120-line functions.
- Vitest filter: `pnpm exec vitest run <path>` (never `pnpm test -- <x>`). Full gate:
  `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, checking each
  command's own exit code (no piped tail). `app/app.test.tsx` has known full-suite flakiness;
  re-run once or in isolation before judging a failure there.
- Conventional Commits; NO Co-Authored-By, NO session trailers, NO em-dash in new text. Author
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- Branch `feat/realistic-lighting-visible-sky` off main (slice 1b merged as PR #454).
- This slice adds NO dependencies.
- Story/scene visual baselines render only on the CI runner; never generate locally.

## Locked decisions

Deviations discovered during execution go through ADR-0148, not silent drift.

1. **Diffuse image-based lighting ships as CPU spherical harmonics driving a `LightProbe`; the
   PMREM cubemap waits for the materials slice (#449).** Issue #436 left this fork to the plan.
   The SH probe wins on every axis that matters now: it is exact for a smooth analytic sky
   (no GPU filtering artifacts at 64 px), the projection is pure core math that unit-tests in
   Node, it needs no renderer access (so the provider contract keeps its shape and the review's
   B8 warning stays moot), and it is cheap enough to recompute on every scrub tick, which
   dissolves the issue's 5-10 Hz throttling requirement instead of implementing it. What it
   cannot do is specular reflection, and nothing before #449 has reflective materials; the
   PMREM path is verified in r184, so adding `scene.environment` there later is additive.
2. **The probe replaces the hemisphere fill in solar mode.** Both model the same physical thing
   (diffuse sky ambient); running both double-counts it. `attachSkyEnvironment` zeroes the
   shared rig's fill intensity and the probe carries the ambient. Schematic mode keeps the
   hemisphere fill untouched (ADR-0079 legibility balance is schematic policy).
3. **The visible sky is the `SkyMesh` addon, added by the solar provider at `apply`.** Its
   `sunPosition` uniform takes the NOAA-derived `sunDirection` directly, `showSunDisc` stays
   on, and `cloudCoverage` follows the cloud-cover dial. The mesh is the far-field background,
   which satisfies the issue's `scene.background` bullet without touching scene state; no
   separate background assignment is needed or wanted.
4. **Cloud motion is frozen: `cloudSpeed` is pinned to 0.** The addon animates clouds by time,
   which would make every scene baseline nondeterministic. Static clouds this slice; cloud
   motion is a layer-9 concern. `cloudDensity`/`cloudScale`/`cloudElevation` keep the addon
   defaults, named as constants.
5. **`EnvironmentLighting` carries everything the rig needs**: it gains `cloudCover` (a
   passthrough for the sky mesh) and `skyAmbient` (27 numbers, nine RGB spherical-harmonic
   coefficient triples in `SphericalHarmonics3.fromArray` order). Both fields are REQUIRED,
   which breaks every fixture that fabricates the interface; that lands as one end-to-end
   cycle whose RED updates all fixtures (the slice-1b sunIntensity lesson). `colorCheckLighting`
   replaces `skyAmbient` with a neutral white dome's coefficients so the check reads
   white-balanced under the probe exactly as it does under the hemisphere.

## File Structure

Created (pure core, unit-testable, no GPU):

- `core/environment/sky-dome.ts` : `skyDomeRadiance(viewElevation, sunAltitude, cloudCover)`.
- `core/environment/sky-dome.test.ts`
- `core/environment/spherical-harmonics.ts` : `SH_COEFFICIENT_COUNT`,
  `projectDomeToSphericalHarmonics`, `evaluateSphericalHarmonics`,
  `NEUTRAL_DOME_SPHERICAL_HARMONICS`.
- `core/environment/spherical-harmonics.test.ts`

Created (engine):

- `engine/lighting/sky-environment.ts` : `attachSkyEnvironment`, `updateSkyEnvironment`.
- `engine/lighting/sky-environment.test.ts`

Modified:

- `core/environment/environment-lighting.ts` : `cloudCover` + `skyAmbient` on the interface,
  composed in `computeEnvironmentLighting`.
- `core/environment/color-check.ts` : neutralize `skyAmbient`.
- `core/index.ts` : export the new names.
- `engine/lighting/lighting-rig.ts` : optional `sky`/`probe` on `LightingRig`;
  `disposeLightingRig` tears them down.
- `engine/lighting/solar-lighting-provider.ts` : attach at `apply`, drive at `update`.
- `engine/index.ts` : export the sky-environment helpers if the bridge ever needs them (it
  does not today; only export what a test or consumer uses).
- Fixture updates in RED commits: `core/environment/environment-lighting.test.ts`,
  `core/environment/color-check.test.ts`, `engine/lighting/solar-lighting-provider.test.ts`,
  `engine/lighting/basic-lighting-provider.test.ts` (only if it fabricates the interface).
- `docs/knowledge/decisions/ADR-0148-visible-sky-and-sh-light-probe.md` (new; 0147 is the
  highest on main at the time of writing; re-verify before landing).

---

## Task 1: Analytic sky-dome radiance (core)

**Files:** Create `core/environment/sky-dome.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes: `LinearRgb`, the sky-model tint constants' behavior (not the constants themselves;
  the dome has its own).
- Produces:

```ts
/**
 * Radiance of the analytic sky dome in a view direction, as linear-light sRGB.
 * `viewElevation` is the view direction's angle above the horizon in radians
 * (negative looks at the ground); `sunAltitude` and `cloudCover` mean what they
 * mean in skyLighting. Above the horizon the dome blends a horizon tint into a
 * zenith tint on sin(viewElevation); below it returns the ground bounce. The
 * whole dome dims as the sun sets and flattens toward grey under cloud, matching
 * the sky model's ambient behavior.
 */
export function skyDomeRadiance(
  viewElevation: number,
  sunAltitude: number,
  cloudCover: number,
): LinearRgb
```

**Steps:**

- [ ] **Step 1: RED.** `core/environment/sky-dome.test.ts`, relational assertions in the
      sky-model test style (named constants, one behavior per `it`):
      zenith view is bluer (higher blue fraction) than horizon view under a high clear sun;
      every view direction dims monotonically as the sun goes from high to below the horizon;
      cloud cover pulls a view direction toward grey (channel spread shrinks) and never
      brightens it; a below-horizon view returns a ground tint dimmer than the zenith view
      under a high sun; the dome at horizon level roughly matches the sky model's ambient
      family (same order of magnitude as `skyLighting().skyColor`, pinned loosely, e.g.
      within a factor of two of its luminance, so the two models cannot drift apart silently).
      Commit `test: shade the analytic sky dome by view elevation`.
- [ ] **Step 2: GREEN.** Implement with named horizon/zenith/ground dome tints and the same
      `mix`/`clampToUnitInterval`/`overcastAdjusted`-style helpers the sky model uses (reuse
      by import where exported, re-derive privately where not; do not export sky-model
      privates just for this). Full gate. Commit
      `feat: add the analytic sky-dome radiance model`.
- [ ] **Step 3: BLUE.** `/clean-code-review` then `/refactor` (or empty marker).

---

## Task 2: Spherical-harmonics projection and evaluation (core)

**Files:** Create `core/environment/spherical-harmonics.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes: `skyDomeRadiance` (Task 1).
- Produces:

```ts
/** Nine RGB triples, flattened; the order matches three's SphericalHarmonics3.fromArray. */
export const SH_COEFFICIENT_COUNT = 27
/** Evaluates a flattened 9-band-coefficient set in a unit direction (y up). */
export function evaluateSphericalHarmonics(
  coefficients: readonly number[],
  direction: Vector3,
): LinearRgb
/**
 * Projects the analytic sky dome into nine spherical-harmonic RGB coefficients by
 * numeric integration over a fixed deterministic direction grid. Pure and cheap
 * enough to run on every scrub tick, so no regeneration throttle is needed.
 */
export function projectDomeToSphericalHarmonics(sunAltitude: number, cloudCover: number): number[]
/** The color-check reference: a uniform NEUTRAL_REFERENCE_WHITE dome, band 0 only. */
export const NEUTRAL_DOME_SPHERICAL_HARMONICS: readonly number[]
```

**Steps:**

- [ ] **Step 1: RED.** Property-style tests that avoid pinning basis-convention signs:
      the array length is `SH_COEFFICIENT_COUNT`; a clear high-sun projection reconstructs
      (via `evaluateSphericalHarmonics`) brighter toward `{x:0,y:1,z:0}` than toward
      `{x:1,y:0,z:0}`, and brighter at the horizon than toward `{x:0,y:-1,z:0}` matching the
      dome's own ordering at those elevations; the horizontal-linear structure vanishes for
      the azimuthally symmetric dome (reconstruction at `{x:1,y:0,z:0}` equals
      `{x:0,y:0,z:1}` to a tight tolerance); reconstruction error against `skyDomeRadiance`
      at a handful of elevations stays within a generous named tolerance (SH order 2 blurs);
      `NEUTRAL_DOME_SPHERICAL_HARMONICS` reconstructs the same white in every direction.
      Commit `test: project the sky dome onto spherical harmonics`.
- [ ] **Step 2: GREEN.** Standard real SH basis up to band 2 (nine basis functions), numeric
      integration over a fixed latitude-longitude grid (named grid-resolution constants;
      deterministic, no randomness), solid-angle weighting. Full gate. Commit
      `feat: project the analytic sky dome onto spherical harmonics`.
- [ ] **Step 3: BLUE.**

---

## Task 3: `EnvironmentLighting` carries cloud cover and the sky ambient (core, fixture-breaking)

**Files:** Modify `core/environment/environment-lighting.ts`, `core/environment/color-check.ts`,
`core/index.ts`. RED also updates the fixtures in
`core/environment/environment-lighting.test.ts`, `core/environment/color-check.test.ts`,
`engine/lighting/solar-lighting-provider.test.ts`, and (if it fabricates the interface)
`engine/lighting/basic-lighting-provider.test.ts`; grep `EnvironmentLighting` construction
sites first; a required-field change breaks sibling fixtures.

**Interfaces:**

- Produces (on the existing interface):

```ts
export interface EnvironmentLighting {
  sunDirection: Vector3
  sunColor: LinearRgb
  skyColor: LinearRgb
  sunIntensity: number
  /** Cloud-cover fraction the sky was computed with; the visible sky mesh reads it. */
  cloudCover: number
  /** Nine RGB spherical-harmonic triples of the sky dome, SphericalHarmonics3 order. */
  skyAmbient: readonly number[]
}
```

`computeEnvironmentLighting` fills both from its existing inputs (`cloudCover` passthrough;
`skyAmbient` via `projectDomeToSphericalHarmonics(angles.altitude, input.cloudCover)`).
`colorCheckLighting` also replaces `skyAmbient` with `NEUTRAL_DOME_SPHERICAL_HARMONICS`.

**Steps:**

- [ ] **Step 1: RED (one commit, all fixtures updated here).**
      `environment-lighting.test.ts`: the computed lighting carries the input cloud cover and
      a 27-long `skyAmbient` whose reconstruction is dimmer for a below-horizon sun than for a
      noon sun. `color-check.test.ts`: the neutralized lighting's `skyAmbient` is
      `NEUTRAL_DOME_SPHERICAL_HARMONICS` while `sunDirection`/`sunIntensity` still pass
      through. Update every fixture fabricating `EnvironmentLighting` to include the two new
      fields (guard indexed access; test files are typechecked under
      noUncheckedIndexedAccess). Commit
      `test: carry cloud cover and the sky-ambient harmonics on the lighting`.
- [ ] **Step 2: GREEN.** Implement; export nothing new beyond what core/index.ts already
      groups. Full gate. Commit
      `feat: carry cloud cover and the sky-ambient harmonics on the lighting`.
- [ ] **Step 3: BLUE.**

---

## Task 4: The rig owns an optional sky mesh and light probe (engine)

**Files:** Create `engine/lighting/sky-environment.ts` + test. Modify
`engine/lighting/lighting-rig.ts` (extend `LightingRig`, extend `disposeLightingRig`),
`engine/index.ts` (only if a consumer outside engine needs the names; default to not
exporting).

**Interfaces:**

- Consumes: `LightingRig`, `EnvironmentLighting` (Task 3 shape).
- Produces:

```ts
export interface LightingRig {
  sun: THREE.DirectionalLight
  fill: THREE.HemisphereLight
  /** The visible sky, solar mode only. */
  sky?: SkyMesh
  /** The sky's diffuse image-based light, solar mode only; replaces the fill. */
  probe?: THREE.LightProbe
}
/**
 * Adds the visible sky and its light probe to an applied rig and zeroes the
 * hemisphere fill (the probe carries the ambient; running both double-counts it).
 * Cloud motion is frozen (cloudSpeed 0) so scene baselines stay deterministic.
 */
export function attachSkyEnvironment(scene: THREE.Object3D, rig: LightingRig): void
/** Drives the sky's sun position and cloud coverage plus the probe from the lighting. */
export function updateSkyEnvironment(rig: LightingRig, lighting: EnvironmentLighting): void
```

**Steps:**

- [ ] **Step 1: RED.** `sky-environment.test.ts` (engine tests import `three`; the addon
      import is `three/examples/jsm/objects/SkyMesh.js` and is engine-legal): after
      `attachSkyEnvironment`, the scene contains the sky mesh and a `LightProbe`, the rig
      records both, the fill intensity is 0, and the sky's `cloudSpeed` uniform value is 0
      with `showSunDisc` on; `updateSkyEnvironment` copies `lighting.sunDirection` into the
      `sunPosition` uniform, `lighting.cloudCover` into `cloudCoverage`, and
      `lighting.skyAmbient` into the probe (`probe.sh.fromArray`; assert a couple of
      coefficient values round-trip); `disposeLightingRig` removes and disposes the sky and
      probe when present and still works when absent. Commit
      `test: attach and drive the visible sky and its light probe`.
- [ ] **Step 2: GREEN.** Implement with named constants (sky scale, defaults kept from the
      addon but pinned as consts). Full gate. Commit
      `feat: attach the visible sky and its light probe to the rig`.
- [ ] **Step 3: BLUE.**

---

## Task 5: The solar provider shows the sky (engine)

**Files:** Modify `engine/lighting/solar-lighting-provider.ts`; RED extends
`engine/lighting/solar-lighting-provider.test.ts` and pins the schematic negative in
`engine/lighting/basic-lighting-provider.test.ts`.

**Steps:**

- [ ] **Step 1: RED.** After `SolarLightingProvider.apply`, the scene contains the sky mesh
      and probe (and the fill is zeroed); after `update`, the sky's sun position matches the
      lighting's `sunDirection` and the probe's coefficients match `skyAmbient`; `dispose`
      leaves no sky, probe, or lights behind; `BasicLightingProvider.apply` adds NO sky mesh
      and NO probe. Commit `test: light the solar scene from its own visible sky`.
- [ ] **Step 2: GREEN.** `apply` calls `attachSkyEnvironment` after `buildLightingRig`;
      `update` calls `updateSkyEnvironment(this.rig, lighting)` beside the existing color,
      shadow, and intensity calls (guard the not-yet-applied case the way the file already
      does). Full gate. Commit `feat: light the solar scene from its own visible sky`.
- [ ] **Step 3: BLUE.** The bridge needs NO change: `SceneLighting` already feeds
      `computeEnvironmentLighting` the cloud cover and hands providers the (optionally
      color-check-neutralized) lighting. Confirm by reading, not by editing.

---

## Task 6: Acceptance (`test(e2e):` commits, cycle-exempt)

**Files:** Modify `e2e/tests/scene-solar.spec.ts` only if a new named state is added (default:
no new states; the four canonical states now render a sky and their CI baselines simply
change). Verify `app/harness-environment.ts` needs nothing: the states already carry
site + instant + cloudCover/colorCheck, and the sky rides on `realistic: true`.

**Steps:**

- [ ] Run the full local gate plus `pnpm exec playwright test e2e/tests/environment-panel.spec.ts`
      (the DOM journey must stay green; it never looks at pixels).
- [ ] If and only if review during the slice surfaced a state worth pinning that the four
      canonical states miss (e.g. a dusk sky), add ONE `captureShell` case mirroring the
      existing tolerance constants and commit
      `test(e2e): render the dusk sky baseline`. Otherwise land nothing here and note in the
      PR body that the existing scene-solar baselines regenerate on CI (they are still
      ungenerated; the `run:visual` label renders them fresh with the sky in place).

---

## Task 7: Knowledge, ADR-0148

- [ ] **Step 1:** Verify 0148 is the next free number across origin/main and open branches.
- [ ] **Step 2:** Write `ADR-0148-visible-sky-and-sh-light-probe.md`: the SH-versus-PMREM
      fork and why the probe won (exact for a smooth sky, pure-core testable, renderer-free,
      throttle requirement dissolved); the probe-replaces-fill decision and the double-count
      argument; frozen cloud motion for baseline determinism; `EnvironmentLighting` as the
      single carrier (cloudCover + skyAmbient) and the color-check neutral dome; what waits
      for #449 (PMREM cubemap, `scene.environment`, specular). Mark that this resolves the
      deferral recorded in ADR-0144's staging section. Humanizer pass (ADRs are human-read);
      no em-dashes. Commit `docs: record ADR-0148 for the visible sky and its light probe`.
- [ ] **Step 3:** Update the #451 epic checklist and close #436 via the PR (`Closes #436`).

---

## After the plan is executed

- Run `/clean-code-review` and `/review` across the whole branch, run the rgb audit locally,
  push, `gh pr create` (closes #436), take ci-complete to green; the owner merges.
- All scene-solar baselines (including slice 1a's, still ungenerated) render on CI with the
  sky visible once the owner runs the `run:visual` label; that run doubles as the owner's
  visual acceptance of the sky.
- Deferred on purpose: PMREM cubemap + `scene.environment` + specular IBL (#449); cloud
  motion and richer weather (spec layer 9); ambient occlusion (#442) is the spine's next
  indirect-light step after this.

---

## Self-review

- Issue #436 scope bullets: visible sky (Tasks 4-5), IBL with the fork decided (Tasks 1-3,
  locked decision 1), background satisfied by the mesh (locked decision 3), throttling
  dissolved by the CPU probe (locked decision 1), renderer access avoided entirely and the
  dispose contract extended (Task 4). The re-scope's "decide in the slice plan" items are all
  decided in Locked decisions.
- Type consistency: `skyAmbient: readonly number[]` (27, `SH_COEFFICIENT_COUNT`) produced in
  Task 2, carried in Task 3, consumed via `probe.sh.fromArray` in Task 4, asserted in Task 5.
  `cloudCover` rides `EnvironmentLighting` from Task 3 into the `cloudCoverage` uniform in
  Task 4. `skyDomeRadiance(viewElevation, sunAltitude, cloudCover)` is the only radiance
  seam; both the SH projection (Task 2) and its tests consume it.
- Scope honesty: no bridge task exists because the bridge already passes everything through;
  Task 5 Step 3 verifies that by reading. The fixture-breaking interface change is one
  end-to-end cycle per the slice-1b lesson, with the four construction-site test files named.
