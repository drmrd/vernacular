---
name: vernacular-domain-reference
description: Use when working on Vernacular geometry, units, light, or file format questions. Triggers - wall topology, room derivation, hole rings, millimetre units, unit conversion, y-up plan, plan-to-world mapping, winding, tone mapping, PBR Neutral, AgX, OKLab, NOAA solar position, sky dome, spherical harmonics, GTAO ambient occlusion, vernacular.json, .building archive, schema version, migration ladder, registries, construction profiles, and period terms such as sash, muntin, transom, reveal.
---

# Vernacular domain reference

## Overview

Every domain-theory decision in this repo has exactly one implementing module and one ADR of
record. This skill is the map: it states the theory a mid-level generalist would otherwise have
to reconstruct, and names the file where each piece lives. When code and an older ADR disagree,
this skill states current code reality and flags the stale text.

## When to use

- You need to understand or modify wall topology, room derivation, units, coordinates, the
  color and lighting pipeline, the file format, or the registry model.
- You are reading a `core/`, `engine/lighting/`, or `engine/postprocessing/` module and need the
  theory behind it.
- You hit an unfamiliar period-architecture term (sash, muntin, reveal) in code or specs.

## When NOT to use

- Running the app, the scene harness, or Storybook: use vernacular-run-and-operate.
- Why a design decision holds, its invariants, and known-weak points: use
  vernacular-architecture-contract.
- Baseline tiers, tolerances, and test evidence: use vernacular-validation-and-qa.
- Settled rendering-defect history (z-fighting ladder, baseline sagas): use
  vernacular-failure-archaeology.

## Quick reference

| Theory area                                  | Home modules                                                                                                               | ADRs             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Wall topology, planar faces, rooms, holes    | `core/geometry/`, `core/topology/`                                                                                         | 0026, 0058, 0097 |
| Millimetre storage and unit conversion       | `core/model/types.ts`, `core/units/`                                                                                       | 0027             |
| Plan and world coordinate conventions        | `editor/plan/viewport.ts`, `core/scene/plan-to-world.ts`, `core/scene/winding.ts`                                          | 0099, 0139       |
| Color-managed rendering, tone mapping        | `engine/renderer/create-renderer.ts`, `engine/renderer/tone-mapping.ts`, `core/environment/tone-mapping.ts`, `core/color/` | 0142, 0147       |
| Solar position, sky, light probe             | `core/environment/`, `engine/lighting/`                                                                                    | 0144, 0148       |
| Ambient occlusion                            | `engine/postprocessing/`                                                                                                   | 0151             |
| Vernacular Floor Plan Format                 | `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, `core/format/`, `core/migrations/`, `schema/`                     | 0047             |
| Registries, era model, construction profiles | `core/registries/`, `core/architecture-era/`                                                                               | 0006, 0046, 0137 |

ADR files live at `docs/knowledge/decisions/ADR-NNNN-<slug>.md`.

## 1. Wall topology to rooms

Rooms are never stored. They are a pure derived projection of wall centerlines, recomputed on
demand (design spec section 3.2; ADR-0026). The pipeline has three layers, all pure TypeScript
in `core/` with no React, Three.js, or DOM.

### 1.1 Geometry primitives (`core/geometry/`)

- `polygonArea` (`polygon.ts`): signed shoelace area. Counter-clockwise is positive. The sign is
  load-bearing: it is how the face walk rejects the unbounded outer face.
- `pointInPolygon`, `insetPolygon`, `outsetPolygon` (`polygon.ts`): containment and
  thickness-aware offsets.
- `segmentIntersection` (`segment.ts`): parametric intersection, `null` for parallel, collinear,
  or disjoint pairs. Collinear overlapping walls are deliberately not noded (out of scope since
  ADR-0026).
- `pointOnSegment` (`segment.ts`): closed-segment containment within tolerance, used for
  T-junction detection.

### 1.2 Arrangement noding (`core/topology/wall-graph.ts`)

`buildWallGraph(walls)` produces a `PlanarGraph` (flat arrays: `vertices: Point[]`,
`edges: GraphEdge { a, b, wallId }`) in three passes:

1. Endpoint merge: endpoints within `DEFAULT_JUNCTION_TOLERANCE_MM` (1 mm) merge into one
   vertex. Zero-length walls are skipped.
2. X-crossing registration: interior intersections become shared vertices.
3. T-junction splitting: edges are split where an existing vertex lies on their interior;
   sub-edges keep the original `wallId`.

The endpoint scan is O(n squared) over wall count. A spatial index behind the same signature is
the known deferred optimization.

### 1.3 Face enumeration (`core/topology/rooms.ts`)

`deriveRooms(walls, options?)` runs the standard planar-subdivision half-edge walk: two directed
half-edges per undirected edge, outgoing fans per vertex sorted by `atan2` angle, and each
half-edge's successor is the clockwise-previous of its twin in the head vertex's fan. Twin lookup
matches reversed endpoints plus `wallId`, so parallel edges between the same vertex pair resolve
correctly. Faces whose signed area exceeds `MIN_ROOM_AREA` (1 square mm) become rooms; the outer
face traces negative and is excluded by that single filter. Dangling stub excursions
(`v -> s -> v`) are collapsed.

The `Room` record as of 2026-07-05:

| Field                     | Meaning                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `id`                      | `ROOM_ID_PREFIX` (`room:`) plus `roomKey(room)`                |
| `polygon`                 | centerline boundary corners, plan space                        |
| `clearPolygon`            | centerline inset inward by each bounding wall's half thickness |
| `outerPolygon`            | centerline offset outward: the gross-area boundary             |
| `area`                    | clear (thickness-aware) floor area, square millimetres         |
| `wallIds`                 | sorted, unique bounding wall ids                               |
| `name?`, `ceilingHeight?` | merged from a stored `RoomOverride` via `applyRoomOverrides`   |
| `holes?`                  | interior void rings (see 1.4)                                  |

STALE-DOC FLAG: ADR-0026 describes room area as centerline area with the thickness-aware inset
"deferred". The inset has since landed: `area` is the clear thickness-aware area and the code is
current. Trust `core/topology/rooms.ts`, not the ADR's deferral note.

`roomKey(room)` is the sorted wall-id string WITHOUT the `room:` prefix. `Project.roomOverrides`
is keyed by `roomKey`, not by `Room.id`. `room.id === ROOM_ID_PREFIX + roomKey(room)` always.

### 1.4 Hole rings: donut and courtyard rooms (ADR-0058)

A free-standing inner wall loop (light well, chimney mass, inner vault) splits the arrangement
into components; the walk traces each separately and nothing ties them together. A containment
pass after the walk fixes this: candidate `inner` becomes a hole of `outer` when every vertex of
`inner.polygon` lies inside `outer.polygon` AND the two share no bounding walls (the disjoint
guard separates a true island from a shared-wall subdivision). Each contained room holes only its
immediate (smallest) container. The container's `area` subtracts each hole's centerline footprint.
The inner region still reports as its own room: geometry cannot tell an open courtyard from an
enclosed inner room, so both are reported and the open-versus-enclosed call is a labeling concern.

Projection: `core/scene/scene-graph-deriver.ts` copies `holes` onto `RoomSceneNode` and memoizes
room nodes in a WeakMap keyed by the `Floor.walls` array reference, so any wall edit rebuilds the
whole floor's topology and an opening-only edit reuses it. Rendering fills holes as
opposite-wound sub-paths (canvas nonzero winding rule) in `editor/plan/draw-plan.ts`.

### 1.5 DCEL status (ADR-0097)

A doubly-connected edge list (a persistent half-edge structure with stored twin, next, and face
pointers) was evaluated and DEFERRED. The current walk rebuilds half-edge machinery transiently
per call. Revisit only when curved walls (issue #80) or courtyards and atria (issue #78) are
scheduled; the trigger deliverable is a time-boxed spike. Do not build an ad hoc persistent
topology cache: the derived-not-serialized property is the line not to cross.

### 1.6 Other topology modules

| Module                            | Job                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `core/topology/wall-footprint.ts` | four ground-plane corners per wall edge; mitered ends where face lines cross the junction fan neighbor        |
| `core/topology/junction-fill.ts`  | polygons that close the gaps between mitered wall ends at a junction                                          |
| `core/topology/opening-edge.ts`   | resolves which graph edge hosts an opening (matches `hostWallId`, scans for the edge containing the center)   |
| `core/topology/openings.ts`       | opening plan geometry on the host centerline; `MIN_OPENING_WIDTH_MM` = 50 (a drag floor, not a building code) |
| `core/topology/stair-well.ts`     | the stair footprint rectangle, the stairwell void polygon on the upper floor                                  |

## 2. Units: millimetres are canonical (ADR-0027)

Storage is real-valued millimetres everywhere: `Point.x/y`, `Wall.thickness`, `Floor.elevation`,
`Floor.defaultCeilingHeight`, opening dimensions, furniture dimensions (all documented in
`core/model/types.ts`). Areas are square millimetres. `Millimeters` is a plain `number` alias
(`core/units/length-units.ts`), deliberately not branded.

STALE-DOC FLAG: design spec section 7.3 says internal storage is SI meters. ADR-0027 records the
deliberate divergence; the model's millimetres win. Never "fix" code toward meters.

Conversion rules that matter:

- Imperial factors are exact: 1 inch = 25.4 mm, 1 foot = 304.8 mm, computed as integer fractions
  (`inches * 254 / 10`, `feet * 3048 / 10`) so integer inputs give exact terminating decimals.
- Metric conversions snap the product to 15 significant digits (`toPrecision(15)`) to strip
  sub-ULP noise without rounding away user precision.
- `formatLength` / `parseLength` / `formatArea` / `UnitPreferences` live in `core/units/`;
  `round-trip.test.ts` pins the no-drift guarantee. Parsing accepts free-form feet-and-inches,
  decimal feet, and metric strings with an `AssumedUnit` of `mm | cm | m | in | ft`.
- `ProjectMeta.units` is `'imperial' | 'metric'`; it is a display preference, never a storage
  unit.

## 3. Coordinate conventions

Three frames, two conversion choke points. Never write a parallel projection.

| Frame              | Convention                                                                                   | Choke point                                                    |
| ------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Plan (document)    | `Point {x, y}` in mm; x rightward, y increases upward (north). Normative in the format spec. | n/a (this is storage)                                          |
| Screen (2D canvas) | y increases downward                                                                         | `worldToScreen` / `screenToWorld` in `editor/plan/viewport.ts` |
| World (3D)         | right-handed, y-up, millimetres                                                              | `planToWorld` / `worldToPlan` in `core/scene/plan-to-world.ts` |

- 2D: `worldToScreen` negates y (`screen.y = -point.y * scale + offset.y`); `screenToWorld` is
  its exact inverse, which is why draw and hit-test round-trips survived the ADR-0099 flip. Every
  2D consumer funnels through this one pair. SVG and PDF export apply their own y flip in
  `core/export/svg/svg-view.ts`.
- 3D: `planToWorld(point, height)` returns `{ x: point.x, y: height, z: 0 - point.y }`. Plan
  north (+y) maps to world -Z. This is a proper rotation, not a reflection; mapping plan y to +Z
  mirrors the building east-west (the ADR-0139 bug). `0 - point.y` (not `-point.y`) keeps plan
  y = 0 at world +0 rather than negative zero. Camera presets share north = -Z.
- Winding: after ADR-0139 the map is orientation-preserving, so cap builders wind the top cap
  naturally and reverse the base. `core/scene/winding.ts` reads the actual world normal. Two
  world-space quantities never pass through the map and carry their own negations: the opening
  swing angle (`core/scene/opening-motion.ts`) and the near-wall fade normal's Z
  (`engine/scene/near-wall-transparency.ts`).
- Sun direction: `sunWorldDirection` (`core/environment/sun-world-direction.ts`) subtracts
  `Site.northBearing` from the solar azimuth, then lays the heading into the ADR-0139 frame:
  heading 0 points down world -Z, heading pi/2 down world +X, altitude becomes +Y.

## 4. The color-managed rendering pipeline (ADR-0142, ADR-0147)

- Working space: linear sRGB (the three.js default; nothing overrides `workingColorSpace`).
  Light tints are written explicitly linear via
  `color.setRGB(r, g, b, THREE.LinearSRGBColorSpace)` in `engine/lighting/lighting-rig.ts`.
- Output: `renderer.outputColorSpace = SRGBColorSpace`, set explicitly in
  `engine/renderer/create-renderer.ts` so a backend change cannot silently drop it.
  `toneMappingExposure` is an option defaulting to 1.
- Tone mapping is per lighting mode, one owner per layer:
  - Policy (core): `toneMappingOperatorFor(mode, colorCheck)` in
    `core/environment/tone-mapping.ts` returns `'agx'` for realistic mode, `'neutral'` for
    schematic, and `'neutral'` in both modes while the color check is on.
  - Translation (engine): `applyToneMappingOperator` in `engine/renderer/tone-mapping.ts` maps
    the domain string to `AgXToneMapping` or `NeutralToneMapping`. Renderer creation seeds
    Neutral through this same helper.
  - Wiring (bridge): `bridge/react/scene-lighting.tsx`, keyed on the EFFECTIVE mode (a realistic
    request without a located site falls back to schematic, and the operator falls back with it).
- Why two operators: Khronos PBR Neutral (`NeutralToneMapping`, three r184) compresses only
  highlights and preserves hue, so a painted wall reads as the picked color; it cannot hold real
  daylight's dynamic range. AgX rolls a wide range into display range with a filmic shoulder but
  drifts hue as surfaces brighten. Schematic mode (where paint decisions happen) keeps Neutral;
  realistic mode takes AgX; the color check forces Neutral in both so the two modes cannot
  disagree about a paint color.
- Perceptual color math is OKLab (`core/color/oklab.ts`), the internal color representation per
  the design spec glossary. `kelvinToLinearRgb` (`core/color/color-temperature.ts`) clamps to
  2700 to 6500 K and peak-normalizes; it is the schematic slider's conversion and is deliberately
  NOT reused for sky tints (it can neither reach horizon red nor dim; ADR-0144).

## 5. Solar, sky, light probe, ambient occlusion

All numerics are pure `core/environment/` (unit-tested in Node, no GPU); `engine/` only applies
finished values through the `LightingProvider` seam.

### 5.1 Sun position (ADR-0144)

- `solarPosition` (`core/environment/solar-position.ts`): the published NOAA solar-calculator
  formulas. Returns radians: azimuth clockwise from true north, GEOMETRIC altitude (no
  atmospheric-refraction correction; under 0.2 degrees once the sun is a few degrees up).
  At zenith or nadir the azimuth denominator vanishes and the function returns 0 by convention.
  Test references were computed with astral 3.2 (an independent NOAA implementation) and checked
  analytically (equinox local-noon altitude = 90 degrees minus latitude).
- `utcOffsetMinutesFor` (`core/environment/timezone-offset.ts`): IANA id to UTC offset minutes
  via `Intl.DateTimeFormat` (zero-dependency ECMA-402), sampled at 12:00 UTC, falling back to 0
  for unknown ids. Lives in core, not the bridge, by recorded decision.
- `skyLighting` (`core/environment/sky-model.ts`): sun and sky tints from altitude and cloud
  cover, with its own horizon and zenith curves; the sun dims toward the horizon and
  extinguishes just below it (`sunIntensity` falls to zero). `DEFAULT_CLOUD_COVER = 0`.
- `computeEnvironmentLighting` (`core/environment/environment-lighting.ts`) composes
  `EnvironmentLighting`: sun direction, sun color, sky color, `sunIntensity`, `cloudCover`, and
  `skyAmbient`.

### 5.2 Sky dome and spherical-harmonics probe (ADR-0148)

- `skyDomeRadiance` (`core/environment/sky-dome.ts`): analytic dome, pure function of view
  elevation, sun altitude, cloud cover; ground bounce below the horizon.
- `projectDomeToSphericalHarmonics` (`core/environment/spherical-harmonics.ts`): projects the
  dome into 9 RGB coefficient triples (order-2). `SH_COEFFICIENT_COUNT` (27) is the cross-layer
  contract: produced in core, carried on `EnvironmentLighting.skyAmbient`, consumed by
  `probe.sh.fromArray` in the engine. The basis constants match three's `SphericalHarmonics3`.
  `NEUTRAL_DOME_SPHERICAL_HARMONICS` backs the color check's white-balanced dome.
- IMPORT RULE: `core/environment/spherical-harmonics.ts` must not import from
  `color-check.ts`. The dependency runs the other way; reversing it is a circular-import crash
  because the harmonics module computes constants eagerly at load.
- In solar mode the probe REPLACES the hemisphere fill (`attachSkyEnvironment` zeroes the shared
  rig's fill; running both double-counts the sky ambient). Schematic mode keeps its hemisphere
  fill, balanced for legibility, not physics.
- The visible sky is three's `SkyMesh` addon, attached by the solar provider through a cached
  dynamic import (never a static import: it drags `three/webgpu` onto the entry chunk; a
  source-reading guard test enforces this). `cloudSpeed` is pinned to 0 for baseline determinism.

### 5.3 Providers and the rig (`engine/lighting/`)

- `LightingProvider` contract: `apply` (one-time creation) plus
  `update(scene, lighting, bounds)` (re-aim and re-tint an applied rig; null bounds makes the
  shadow refit a no-op).
- `BasicLightingProvider`: static schematic rig; `update` is a documented no-op.
- `SolarLightingProvider`: sets sun and sky colors independently, refits the shadow frustum
  along the computed direction, scales the direct sun by `sunIntensity` (night scenes stay
  sky-lit, never black).
- Both providers build the same rig via `buildLightingRig` at `DAYLIGHT_SUN_INTENSITY` (1.6) in
  `engine/lighting/lighting-rig.ts`, so the modes cannot drift structurally.

### 5.4 GTAO ambient occlusion (ADR-0151)

- `buildAmbientOcclusionPipeline` (`engine/postprocessing/ambient-occlusion.ts`): `GTAONode`
  composed through three's `RenderPipeline` (the node stack). The legacy
  `EffectComposer`/`GTAOPass` is not an option under `WebGPURenderer`. Normals are reconstructed
  from depth (no dedicated normal target). The occlusion multiplies the whole frame; an
  indirect-only split is deferred. Tone mapping still applies after the pass.
- `renderSceneFrame` (`engine/postprocessing/render-scene-frame.ts`) is the single draw seam:
  given a pipeline it draws through the pass, given null it draws `gl.render(scene, camera)`.
  Both the live view (a `useFrame` takeover) and the harness static frame call it.
- Activation is keyed on the effective lighting mode (`bridge/react/effective-lighting-mode.ts`):
  one predicate turns the solar provider, AgX, and AO on together. Realistic without
  `Site.latLong` falls back to schematic everywhere at once.
- `AO_DEFAULT_PARAMS` (`engine/postprocessing/ambient-occlusion-params.ts`) is r184-only tuning.
  r185 changes the occlusion character and r186 makes `distanceExponent` and `distanceFallOff`
  no-ops, so a three.js bump re-tunes these values and re-renders affected baselines.

Canonical harness environment states (named in `app/harness-environment.ts`, selected by the
`?scene=` query parameter): `equinox-noon`, `winter-afternoon`, `color-check`, `overcast-noon`,
`ambient-occlusion`. Operating the harness is vernacular-run-and-operate's ground.

## 6. The Vernacular Floor Plan Format (ADR-0047)

Normative spec: `docs/specs/2026-06-10-vernacular-floor-plan-format.md`. Three nested packaging
tiers:

1. Document: `vernacular.json`, one JSON object, the project entity tree, git-diffable, no
   binary data. The unit of schema validation and of fixtures.
2. Folder: the working form. `vernacular.json` plus `assets/<contentHash>.<ext>`
   (content-addressed bytes), optional `previews/`, generated `ATTRIBUTIONS.md`, and a
   `.house-autosave/` sidecar that is not part of the format.
3. Archive: `*.building`, a ZIP of the Folder layout at its root. (Renamed pre-0.3.0 from
   `project.json` / `.house.zip` with no compatibility shim.)

Normative invariants worth memorizing: geometry is millimetres; `Point` y increases upward;
rooms are derived and never stored (only `roomOverrides`, keyed by the sorted bounding-wall-id
room key, with `customPolygon` as the escape hatch); openings are wall-hosted; registry ids are
validated as well-formed strings only, membership resolves against registries; processors must
round-trip unknown `extensions` and reserved keys (the preservation rule). Asset references are
`{ scope, contentHash }` with scope `pack:<id>@<version> | user | project`, serialized as
`<scope>#<contentHash>` (`core/model/asset-reference.ts`, ADR-0007).

Validation lives in `core/format/` (Ajv): `validate-document.ts`, `load-validation-gate.ts`
(validate-after-migration on load), `tolerant-validation.ts`, and the optional
`strict-profile.ts` that additionally checks registered vendor namespaces.

### Schema versioning and the migration ladder

- The CORE JSON Schema is GENERATED from `core/model/` types (`pnpm schema:generate`, drift
  guard `pnpm schema:check`) and committed immutable under `schema/<version>/vernacular.schema.json`
  with `additionalProperties: false`. Adding any persisted field therefore requires a version
  bump plus a registered migration, even when the migration is an identity passthrough.
- `CURRENT_SCHEMA_VERSION = 16` (`core/model/factories.ts`) as of 2026-07-05. Committed schema
  directories: 8 through 16. Migrations for versions 1 through 7 exist in code but predate the
  committed-schema practice.
- Migrations are registered in `core/migrations/schema/index.ts`; the orchestrator
  (`core/migrations/migrate.ts`) chains them and owns the `meta.schemaVersion` stamp.
  Registry-level migrations have a framework (`core/migrations/registries/`) with zero entries
  as of 2026-07-05.

| From | To  | Migration                     | Adds                                     |
| ---- | --- | ----------------------------- | ---------------------------------------- |
| 1    | 2   | add-room-overrides            | `Project.roomOverrides`                  |
| 2    | 3   | add-floor-openings            | `Floor.openings[]`                       |
| 3    | 4   | add-floor-dimensions          | `Floor.dimensions[]`                     |
| 4    | 5   | add-period-and-style          | period and style tags                    |
| 5    | 6   | add-stairs                    | stairs                                   |
| 6    | 7   | add-underlay-kind             | underlay kind                            |
| 7    | 8   | add-palettes-paint-and-site   | palettes, paint, site                    |
| 8    | 9   | add-surface-treatment         | surface treatments                       |
| 9    | 10  | add-floor-furniture           | `Floor` furniture                        |
| 10   | 11  | add-furniture-height          | furniture height                         |
| 11   | 12  | add-wall-construction-profile | `Wall.constructionProfile` (passthrough) |
| 12   | 13  | add-site-grade-elevation      | `Site.gradeElevation`                    |
| 13   | 14  | add-site-timezone             | `Site.timezone`                          |
| 14   | 15  | add-environment-scenes        | environment scenes                       |
| 15   | 16  | add-weather-cloud-cover       | cloud cover                              |

## 7. Registries and the era model

The registry pattern (ADR-0006): model data carries bare string ids; the registry vouches for
them at its boundary, so a project can reference a pack entry the model layer never heard of.
Core machinery is `core/registries/registry.ts` (`createRegistry`, `getEntry`,
`mergeRegistries`); each registry carries its own version, recorded per-project in
`ProjectMeta.registryVersions`.

- Era model: the design spec (section 3.2) calls it the era hierarchy; it is realized as two
  axes, period and style. Effective value resolves `room ?? floor ?? project` and is NEVER
  stored (`core/architecture-era/resolve-period.ts`, `resolve-style.ts`).
- Periods (`core/registries/periods.ts`): colonial, early-republic, antebellum, victorian,
  edwardian, interwar, postwar, contemporary, unknown, each with an approximate date range.
- Styles (`core/registries/styles.ts`): `category: 'academic' | 'vernacular'`. Academic entries
  with a recognized vernacular variant set `hasVernacularVariant: true` (gothic-revival,
  italianate, second-empire); named vernacular folk forms are seeded directly (folk-victorian,
  hall-and-parlor, i-house, gabled-ell, shotgun, saltbox).
- Room purposes (`core/registries/room-purposes.ts`): modern set plus historic reception
  (parlor, front-parlor, back-parlor, drawing-room, morning-room, conservatory, vestibule) and
  historic service (butlers-pantry, scullery, larder) vocabularies.
- Element types (`core/registries/element-types.ts` plus `crank-window-element-types.ts` and
  `curved-opening-element-types.ts`): walls, doors (single/double swing, french, dutch, pocket,
  bypass, sliding-glass, barn, bifold, pivot, cased-opening), windows (double-hung, single-hung,
  sliding, picture, transom, sidelight, casement, awning, hopper, arched, round-top, lancet),
  and straight-stair. A new opening kind is a registry addition, not a schema change.
  `OpeningFillKind` is `door-leaf | window-sash | window-sash-hung`; crank windows carry their
  hinge edge (jamb for casement, head for awning, sill for hopper).
- Wall construction profiles (ADR-0137, `core/registries/construction-profiles.ts`):
  `ConstructionSystem` is `platform-frame | balloon-frame | solid-masonry`. A profile is ordered
  material layers, interior face first, each with a thickness in mm; the assembly total drives
  the wall footprint. Builtins: platform-framed-drywall (13/89/13), balloon-framed-lath-and-plaster
  (16/7/89/7/16), solid-masonry-brick (16/215), solid-masonry-stone (16/300).
  `Wall.constructionProfile` is an optional bare id; `effectiveWallThickness`
  (`core/scene/construction-profile.ts`) resolves it, falling back to `Wall.thickness` when the
  field is absent or the id is unknown, and `engine/scene/wall-builder.ts` reads only that
  helper. The 2D plan wall symbol still reads raw `thickness` (a named follow-up).
- Also in `core/registries/`: finishes, trim-profiles, floor-patterns, palettes, opening-kind.
  As of 2026-07-05 `finishId` is carried by the model but read by nothing in `engine/`
  (issue #449 wires it).

## 8. Period-architecture glossary

The design spec's own glossary (section 12 of `docs/specs/2026-06-01-vernacular-design.md`)
covers acronyms (OKLab, IBL, OPFS, and so on), not building vocabulary. The terms below are
defined from their actual usage sites in this repo.

| Term                                      | Meaning here                                                                                  | Where used                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| sash                                      | the frame holding a window's glass; the body that fills a window void                         | `OpeningFillKind` `window-sash` in `core/registries/element-types.ts`                                         |
| hung sash (double/single)                 | sashes that slide vertically; double-hung moves both, single-hung the lower only              | `window-sash-hung` fill; `double-hung-window`, `single-hung-window` types                                     |
| muntin                                    | strip dividing a sash into smaller panes                                                      | explicit non-goal: sashes render as a single pane (`docs/specs/2026-06-14-three-dimensional-opening-fill.md`) |
| lite                                      | one pane of glass; "divided lites" is a muntin grid                                           | same spec, deferred with muntins                                                                              |
| transom                                   | window above a door or opening                                                                | `transom-window` element type                                                                                 |
| sidelight                                 | narrow fixed window beside a door                                                             | `sidelight-window` element type                                                                               |
| reveal                                    | the exposed jamb surface between wall face and frame; fills sit in the void with a reveal gap | reserved `reveal` mesh role in the wall shell; gap constants in the opening-fill spec                         |
| jamb / head / sill                        | sides / top / bottom of an opening frame                                                      | crank-window hinge edges; sash frame parts                                                                    |
| casement, awning, hopper                  | crank windows hinged at jamb, head, sill respectively                                         | `core/registries/crank-window-element-types.ts`                                                               |
| cased opening                             | a trimmed doorless opening                                                                    | `cased-opening` element type                                                                                  |
| pocket door                               | door sliding into a wall cavity                                                               | `pocket-door` element type                                                                                    |
| leaf                                      | the swinging body of a door                                                                   | `door-leaf` fill kind                                                                                         |
| segmental arch / round-top / lancet       | shallow arc, semicircular, and pointed-Gothic window heads                                    | `core/registries/curved-opening-element-types.ts`                                                             |
| lath and plaster                          | historic finish: plaster keyed into wood strips over studs                                    | `balloon-framed-lath-and-plaster` profile                                                                     |
| balloon vs platform framing               | continuous full-height studs vs storey-stacked framing                                        | `ConstructionSystem` docstring, `core/registries/construction-profiles.ts`                                    |
| wythe                                     | one vertical brick layer; solid walls are counted in wythes                                   | "double-wythe" comment on `solid-masonry-brick`                                                               |
| parlor, scullery, larder, butler's pantry | historic reception and service rooms                                                          | `core/registries/room-purposes.ts`                                                                            |
| vernacular (style)                        | folk building forms as opposed to academic high styles                                        | `StyleCategory` in `core/registries/styles.ts`; also the app's namesake                                       |

## Common mistakes

- Storing or caching room geometry. Rooms, footprints, and fills are pure functions of the
  walls, rebuilt per dispatch. A persistent topology cache is the ADR-0097 failure mode.
- Reading ADR-0026 and assuming room `area` is centerline area. The thickness-aware clear-area
  inset has landed; the ADR's deferral note is stale.
- Keying `roomOverrides` by `Room.id`. The key is `roomKey(room)`, without the `room:` prefix.
- Mapping plan y to world +Z, or "fixing" a winding by flipping one builder. Go through
  `planToWorld` and read ADR-0139 first; a reflection here mirrors the whole building.
- Converting units ad hoc. Use `core/units/`; the integer-fraction and 15-digit-snap rules exist
  to keep round trips drift-free.
- Reusing `kelvinToLinearRgb` for sky or sun tints. It clamps at 2700 K and peak-normalizes; the
  sky model has its own curves.
- Adding a persisted model field without bumping `CURRENT_SCHEMA_VERSION`, regenerating
  `schema/<n>/`, and registering a migration. `additionalProperties: false` makes the old
  document invalid otherwise, and `pnpm schema:check` fails on drift.
- Static-importing `three/webgpu`, `three/tsl`, `SkyMesh`, or `GTAONode`. They load through
  cached dynamic imports; guard tests exist, and a static import bloats the entry chunk.
- Importing `color-check.ts` from `spherical-harmonics.ts` (circular-import crash).
- Turning AO, AgX, or the solar provider on independently. All three key on the one effective-
  lighting-mode predicate.
- Trusting CLAUDE.md's line that source layers are placeholders. All six layers are live code;
  that line is stale.

## Provenance and maintenance

All facts verified against the repo on 2026-07-05. Re-verification one-liners (run from the
repo root):

| Fact                                    | Re-verify with                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Junction tolerance 1 mm                 | `grep -n "DEFAULT_JUNCTION_TOLERANCE_MM" core/topology/wall-graph.ts`                                                    |
| MIN_ROOM_AREA, Room fields, roomKey     | `sed -n '1,95p' core/topology/rooms.ts`                                                                                  |
| Min opening width 50 mm                 | `grep -n "MIN_OPENING_WIDTH_MM" core/topology/openings.ts`                                                               |
| mm conversion factors and 15-digit snap | `cat core/units/length-units.ts`                                                                                         |
| planToWorld sign convention             | `cat core/scene/plan-to-world.ts`                                                                                        |
| 2D y flip                               | `grep -n "point.y" editor/plan/viewport.ts`                                                                              |
| Output color space and exposure default | `grep -n "outputColorSpace\|toneMappingExposure" engine/renderer/create-renderer.ts`                                     |
| Per-mode operator policy                | `cat core/environment/tone-mapping.ts engine/renderer/tone-mapping.ts`                                                   |
| DAYLIGHT_SUN_INTENSITY 1.6              | `grep -n "DAYLIGHT_SUN_INTENSITY" engine/lighting/lighting-rig.ts`                                                       |
| SH_COEFFICIENT_COUNT 27                 | `grep -n "SH_COEFFICIENT_COUNT" core/environment/spherical-harmonics.ts`                                                 |
| AO params r184-only                     | `cat engine/postprocessing/ambient-occlusion-params.ts`                                                                  |
| Harness state names                     | `grep -n "equinox-noon\|winter-afternoon\|color-check\|overcast-noon\|ambient-occlusion" app/harness-environment.ts`     |
| CURRENT_SCHEMA_VERSION 16               | `grep -n "CURRENT_SCHEMA_VERSION = " core/model/factories.ts`                                                            |
| Committed schema versions 8..16         | `ls schema/`                                                                                                             |
| Migration ladder                        | `grep -n "from:" core/migrations/schema/*.ts \| grep -v test`                                                            |
| Registry migrations still empty         | `cat core/migrations/registries/index.ts`                                                                                |
| Registry entry ids                      | `grep -rn "id: '" core/registries/`                                                                                      |
| Construction profile layers             | `sed -n '55,105p' core/registries/construction-profiles.ts`                                                              |
| Asset reference serialization           | `cat core/model/asset-reference.ts`                                                                                      |
| ADR numbers cited here                  | `ls docs/knowledge/decisions/ \| grep -E "0026\|0027\|0047\|0058\|0097\|0099\|0137\|0139\|0142\|0144\|0147\|0148\|0151"` |
| finishId still unread in engine         | `grep -rn "finishId" engine/ --include="*.ts" \| grep -v test`                                                           |
