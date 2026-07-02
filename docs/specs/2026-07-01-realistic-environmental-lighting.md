# Realistic environmental lighting (epic specification)

> Status: draft for review. Date: 2026-07-01. Author: Dan Moore.
> Relationship to prior design: realizes design specification section 6.7
> (`SolarLightingProvider` behind the `LightingProvider` seam) and picks up the work
> ADR-0079 deferred (tone mapping, a richer multi-light rig, a solar-aware sun). This is an
> epic broader than 6.7 pictured, so it decomposes into a dependency-ordered set of slices.

## Mission

Let an old-house renovator see, with reasonable fidelity, what a home looks like inside and
outside at any time of day and year, at its real location and orientation, with real
daylight, window glass, paints, and surroundings factored in. The owner set correctness
above efficiency for this feature and asked to sequence the work carefully.

The load-bearing acceptance criterion for the whole epic: the real-time view must be
color-accurate enough to make interior-decorating decisions, for example choosing a paint
color and trusting how it reads under real daylight. A reserved photo mode is the accuracy
backstop if a specific decision cannot be trusted in real time.

## Scope

The epic covers sunlight, home orientation, obstructions, artificial lighting, time of day
and year, latitude and longitude, window glass including stained glass, and weather. That is
too much for one implementation cycle, so it decomposes into slices. Each slice is its own
specification, plan, and red-green-blue implementation cycle, with an Architecture Decision
Record where the change is architectural.

The first release wave is the spine: slices 0, 1a, 1b, 2, and 3. It ends with a
controllable, correctly colored daylit environment and physically based paint that reads
correctly under it. Later layers 4 through 11 build on the spine and ship afterward.

## Locked decisions

Five design forks were settled in the brainstorming session that produced this spec.

1. **Fidelity: real-time physically based rendering now**, with the color-accuracy
   acceptance criterion above. A progressive path-traced photo mode is reserved as a later,
   separable slice, not built in the spine. The reserved photo mode is the accuracy backstop.
2. **Modes: two coexisting lighting providers** behind the existing seam. "Schematic" is
   today's `BasicLightingProvider`, tuned for legibility and kept as the editing default.
   "Realistic" is the new `SolarLightingProvider`, a controllable Environment mode with
   controls for location, date, time of day, and weather or sky state, plus a neutral
   color-check toggle.
3. **Environment-state ownership: location and timezone persist on `Site`**; the active
   date, time, and weather are per-view session state, scrubbed live and kept out of undo,
   the way camera and color temperature already work; named environment scenes persist on
   the project so a paint can be checked across several saved conditions.
4. **First slice and sequencing: the spine is 0, then 1, then 2, then 3.** Foundations,
   then the solar provider with the Environment panel, then daylight through glass, then
   physically based materials. Slice 1 splits into 1a (the engine-side provider) and 1b
   (the panel) for the decoupling reason given under Architecture below.
5. **Stained-glass fidelity: layered.** A transmissive colored-glass material for how the
   window looks, plus a sun-aligned projected light cookie so the stained pattern is cast in
   color onto interior surfaces in real time. True path-traced colored transport is reserved
   for photo mode. **Artificial lighting is a later wave**, not part of the spine.

## Architecture

### Layering and the decoupling contract

The feature threads through four layers, and the existing seams keep the user interface and
the renderer apart without special effort.

- `core/` holds pure domain logic: solar position math, color conversions, the
  `ObservationInstant` and `EnvironmentScene` types, and the command handlers. It imports
  neither React nor Three.js.
- `engine/` is the only module that imports Three.js. It holds the `SolarLightingProvider`,
  the analytic sky and image-based lighting, tone mapping in the renderer, and the physically
  based material provider.
- `bridge/` is the only module that knows about both the React or session state and the
  engine. It reads session and model state and translates it into engine calls.
- `editor/` holds the Environment panel. It writes plain values into session state and
  dispatches commands. It never imports Three.js.

The single boundary between the panel and the provider is a pure value object,
`EnvironmentState`: the observation instant (date, time of day, timezone), the resolved
location (latitude and longitude read from `Site`), the weather or sky parameters, the mode,
and the color-check flag. It carries no React and no Three.js.

This mirrors an existing precedent. Color temperature already flows from the user interface
to the renderer as a plain number: the panel writes `colorTemperatureK` into session state,
the bridge component receives it as a prop, converts it with the pure-core `kelvinToLinearRgb`,
and calls the engine setter `setLightingColor(scene, rgb)` (`bridge/react/scene-lighting.tsx`).
The user interface never touches Three.js, the engine never touches React, and the bridge
passes only value objects. The layering invariants make a cross-layer shortcut a lint and
review failure rather than a matter of discipline.

### Seam evolution

The `LightingProvider` interface today is a single method, `apply(scene)`
(`engine/lighting/lighting-provider.ts`). It gains an optional
`update(scene, environment: EnvironmentState)`. `BasicLightingProvider.update` is a no-op,
so its behavior is unchanged. `SolarLightingProvider.update` recomputes the sun from the
pure-core solar math and repositions the moving sun along with the sky and image-based
lighting. The bridge pushes an `EnvironmentState` on change, the same way it pushes
`colorTemperatureK` today. The provider swap point stays where it is today,
`bridge/react/scene-lighting.tsx`, so selecting a mode changes the provider and nothing else.

The rig helpers `setLightingColor` and `fitSunShadowToBounds` are currently hard-coded to
one `DirectionalLight` and one `HemisphereLight` coupled through an exported `SUN_DIRECTION`
constant (`engine/lighting/lighting-rig.ts`). Slice 1a generalizes them for a sun that moves.

### Verification checkpoint for the decoupling

Slice 1 splits so the decoupling is proven, not promised. The engine half (1a) lands and is
verified by a visual-regression story that renders the scene at fixed environment states, so
the `EnvironmentState` contract and the provider are exercised end to end before any panel
exists. The panel (1b) then lands as a separate cycle whose only job is to write that same
contract. The story is permanent regression coverage, not throwaway scaffolding.

## Data model changes

### Observation instant

A pure-core `ObservationInstant` captures the moment to render: a calendar date, a
time of day, and a timezone. It is deterministic and unit-tested, the way
`kelvinToLinearRgb` is. The active instant is per-view session state, scrubbed live and kept
out of undo. `Meta.period` stays an architectural era (Victorian and so on) and is unrelated.

### Timezone on Site

`Site` gains an optional `timezone` field holding an IANA zone identifier, since a timezone
is a property of a location. It may be derived from latitude and longitude later; for the
spine it is a persisted field a user can set. `Site` is `additionalProperties: false`, so the
new field requires a schema bump to version 14 and a passthrough migration that upgrades
version 13 documents without data loss. The migration mirrors the existing
`core/migrations/schema/add-site-grade-elevation.ts`. `CURRENT_SCHEMA_VERSION` moves to 14 in
`core/model/factories.ts`.

### Environment scenes

The project persists an `EnvironmentScene[]`: each entry has an identifier, a name, an
observation instant, and weather parameters, for example "Summer noon, clear" or "December
4pm, overcast." Scenes reload identically and can be shared, so a paint can be checked
across several saved conditions. Add, remove, and rename flow through `dispatch` and
participate in undo. The exact persisted home of the array is settled in slice 0's plan.

## Spine slices

### Slice 0: foundations

Color-managed renderer, the observation-time model, environment-scene persistence, and the
mounted site editor. Nothing on screen changes except the tone-map and color-space switch.

Changes:

- Set the renderer output color space to sRGB and tone mapping to Khronos PBR Neutral, with
  a configurable exposure, in `engine/renderer/create-renderer.ts`. Khronos PBR Neutral
  preserves base color and compresses only highlights, so it does not skew paint hue the way
  a filmic operator would. Three.js r184 provides it natively.
- Add the pure-core `ObservationInstant` type and helpers.
- Add the `timezone` field to `Site`, schema version 14, and the passthrough migration.
- Persist `EnvironmentScene[]` on the project with add, remove, and rename commands.
- Mount the `SiteEditor` in the app shell, closing issue #407, and add a timezone control.
- Add a session-state date and time scrubber that shows a readout and does not yet drive the
  lighting.

Acceptance:

- A deterministic test renders a known sRGB albedo swatch and asserts the output pixel
  matches the expected value within tolerance. This is the neutral color-check reference
  validated against known colors.
- The version 13 to version 14 migration round-trips a document with no timezone and one
  with a timezone, losing no data.
- `ObservationInstant` helpers are unit-tested.
- Environment scenes survive a save and load and undo correctly.
- The site editor is mounted and edits latitude, longitude, north bearing, and timezone.

### Slice 1a: solar provider and sky (engine)

Changes:

- A pure-core solar-position function maps latitude, longitude, date, time, and timezone to
  a sun azimuth and altitude. A NOAA or Meeus grade algorithm is accurate to well within
  what architectural visualization needs and is simple to validate. The final algorithm
  choice is settled in this slice's plan; a higher-accuracy solar position algorithm is
  available later if sun studies need it.
- Map the sun azimuth and altitude to a world direction through `northBearing` and
  `planToWorld` (plan north maps to world negative Z, per ADR-0139).
- An analytic clear-sky model colors the sun and the ambient light and produces an
  image-based lighting environment, so ambient is correctly colored and directional. A
  single turbidity or cloud-cover dial modulates it, the first and cheapest layer of weather.
- Implement `SolarLightingProvider` with `apply` and `update(scene, environmentState)`.
- Generalize `setLightingColor` and `fitSunShadowToBounds` for a moving sun.

Acceptance:

- The solar-position function agrees with published reference values at several known
  instants and locations within a stated tolerance.
- The world-direction mapping is asserted for known north bearings.
- A visual-regression story renders canonical environment states, for example equinox noon
  and a winter late afternoon at a fixed location, and matches CI baselines.
- The shadow frustum refits as the sun moves, and shadows track the sun.
- Ambient is colored by the sky model and supplied as image-based lighting.

### Slice 1b: Environment panel (user interface)

Changes:

- An Environment panel in the editor exposes the mode toggle (Schematic and Realistic), a
  location readout, date and time-of-day scrubbers, a weather or cloud-cover dial, and the
  neutral color-check toggle.
- All controls write `EnvironmentState` through session state and `dispatch`.

Acceptance:

- The panel drives the provider end to end.
- Toggling the mode swaps `BasicLightingProvider` and `SolarLightingProvider` with no
  geometry rebuild.
- The color-check toggle renders the neutral white-balanced reference.

### Slice 2: daylight through glass

Changes:

- Make `markShadowCasters` role-aware (`engine/scene/shadow-casters.ts`) so a glass pane no
  longer casts an opaque shadow while the sash and leaf frames still cast. Sunlight then
  streams through windows and the muntin and frame pattern falls on the floor. The change is
  small and high-impact and can land even under the artistic sun.
- Shape the glass role so a future stained-glass light cookie can attach to it.

Acceptance:

- A story shows daylight entering a window with the frame shadow pattern on the floor.
- Frames still cast shadows; glass does not.

### Slice 3: physically based materials

Changes:

- A `PhysicalMaterialProvider` swaps in at the `MaterialProvider` seam (ADR-0067), parallel
  to the lighting seam, without touching geometry builders.
- Wire `finishId` (flat, matte, eggshell, satin, semi-gloss, gloss) to roughness, sheen, and
  specular, upgrading painted surfaces to `MeshPhysicalMaterial`. Today `finishId` is dead
  data: no engine file reads it, and solid paints render at default roughness. This slice
  makes the finish registry live.
- Reconcile paint appearance under daylight image-based lighting and Neutral tone mapping.

Acceptance:

- Solid paints render with their finish rather than a default roughness.
- The decorating color-accuracy gate: a known paint color rendered under neutral daylight
  image-based lighting and Neutral tone mapping reads within a stated tolerance of its
  reference swatch when the color-check reference is active. This is the epic's headline gate.

## Testing and verification

- Pure-core logic is unit-tested: solar position against published ephemeris values, color
  round-trips, and the schema migration.
- Rendering is covered by visual-regression stories whose baselines render on the CI runner,
  since an amd64 headless browser is unreliable under local emulation. Environment-state
  fixtures pin canonical instants so the provider is verified before any panel exists.
- The neutral color-check reference is an acceptance gate for slice 0 and again for slice 3.
- The performance budget from design specification 6.10 holds: interactive at sixty frames
  per second on integrated graphics, within the per-edit scene-update and render budgets.

## Knowledge and Architecture Decision Records

- A new record captures the `EnvironmentState` contract, the observation-time ownership
  split between session and persisted state, the environment-scene persistence, and schema
  version 14.
- The lighting records ADR-0065 and ADR-0079 are superseded or extended for the tone-mapping
  operator choice, the moving solar sun, the two coexisting provider modes, and image-based
  lighting.
- The material-provider record ADR-0067 and the finishes record ADR-0130 are extended for
  the `PhysicalMaterialProvider` that makes `finishId` live.

Record numbers are assigned when each record is authored, alongside the slice it documents.

## Later layers

These build on the spine and ship afterward. Each is its own specification, plan, and cycle.

4. **Glass and glazing model.** Persist glazing on openings (clear, obscured, tinted,
   stained, leaded); a transmissive `MeshPhysicalMaterial`; the layered stained-glass target
   from decision 5, meaning a transmissive material plus a sun-aligned projected light cookie
   for colored light on surfaces; a muntin or divided-light grid. Ties to the finishes epic.
5. **Realism and legibility reconciliation.** A mode selector with both providers coexisting,
   auto-exposure, and legibility aids. May fold into slice 1b's controls.
6. **Self-shadowing structure: roof and eaves.** Roof geometry (issue #86, an extra-large
   epic of its own) so eaves and overhangs shade windows. The ground already receives
   shadows and the shadow plumbing is ready, so lighting consumes this for free once it exists.
7. **Site context and obstructions.** Neighbor massing reusing the already-modeled
   `Site.obstructions[]`, vegetation canopies, and terrain slope as shadow casters. Ties to
   the landscape and multi-building epics.
8. **Artificial lighting.** Fixtures as light-emitting placeable assets with lumens, color
   temperature, and distribution; on and off; night scenes; emissive lamp and stained-glass
   materials. Depends on slices 0 and 3.
9. **Weather and sky states.** Presets modulating the sun, the sky, and shadow softness,
   growing the single dial from slice 1a into a richer set.
10. **High-fidelity photo mode.** A progressive path-traced still with global illumination,
    colored transport through stained glass, and soft obstruction shadows. The reserved
    accuracy backstop, promoted from reserved to built when a decorating decision needs it.
11. **Sun studies and analysis outputs.** Shadow studies across a day and a year, daylight
    factor heatmaps, and exportable stills and animations for the renovator who wants to
    plan around light.

## Delivery

Delivery is tracked GitHub-native. The epic and its slice issues will be filed on GitHub with
the `public-beta` milestone for the spine (0, 1a, 1b, 2, 3) and `1.0` for the later layers,
under the `area:3d-preview` label. Related existing issues to link: #86 (roof), #407 (site
editor mount), #378 and #379 (finishes), #88 (landscape), #83 (multi-building), and the
ground and grade issues #207, #409, and #413. The `gh` commands are handed to the owner
directly, since this session is read-only against GitHub.

## Open questions and risks

- Bounced daylight and colored interreflection dominate perceived interior paint color, and
  full color bleeding is the honest ceiling of the real-time raster path. Slice 1a's
  image-based lighting plus an indirect-light approximation carry most of the way; the
  reserved photo mode is the backstop for a decision that cannot be trusted in real time.
- Roof and eaves geometry does not exist yet (issue #86), so realistic window shading from
  overhangs waits on that separate epic. The spine does not depend on it.
- The exact persisted home of `EnvironmentScene[]` is settled in slice 0's plan.
