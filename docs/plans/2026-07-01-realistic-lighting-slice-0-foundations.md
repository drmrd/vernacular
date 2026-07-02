# Realistic Environmental Lighting, Slice 0 (Foundations) Implementation Plan

> Correction (post-authoring): ADR-0140 was claimed by a concurrent branch, so the ADR numbers
> below shifted up by one. The renderer color-management record landed as ADR-0141, and the
> environment-model-foundations record (which holds the optional-`environmentScenes` and
> timezone-on-`Site` deviations) landed as ADR-0142. Wherever the text below cites "ADR-0140"
> read ADR-0141, and wherever it cites "ADR-0141" read ADR-0142.

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author writes
> a failing test and commits `test:`), `/implement` (implementer writes the minimal pass and
> commits `feat:`), `/clean-code-review` (clean-code-reviewer audits the diff), `/refactor`
> (refactorer improves or lands an empty `refactor:` marker). Do NOT use the generic
> superpowers subagent-driven-development harness here; it cannot dispatch the role-separated
> agents. Steps use checkbox (`- [ ]`) syntax for tracking. One behavior equals one full
> test -> feat -> refactor cycle; close every GREEN with a (possibly empty) BLUE before the
> next RED.

**Goal:** Lay the foundations for realistic environmental lighting: a color-managed renderer,
a pure-core observation-time model, a persisted `Site.timezone` (schema v14), a persisted
`EnvironmentScene[]` with undoable commands (schema v15), the site editor mounted in the app
shell (closing #407), and a readout-only date/time scrubber. Nothing on screen changes except
the tone-map and color-space switch.

**Architecture:** Slice 0 touches four seams without adding any new rendering behavior. The
renderer gains sRGB output and Khronos PBR Neutral tone mapping in the one place that builds a
backend (`engine/renderer/create-renderer.ts`). The persisted model grows two fields across
two sequential schema versions (v14 `Site.timezone`, v15 `Project.environmentScenes`), each
its own migration. A new pure-core `core/environment/` module owns the observation-time type
and its helpers. Environment scenes mutate only through `dispatch` (mirroring
`site-commands.ts`), and the site editor mounts in the tool rail. The date/time scrubber is
per-view session state (mirroring `useColorTemperature`) and does NOT drive lighting yet.

**Tech Stack:** TypeScript, React, Three.js r184 (WebGPU renderer, lazy-imported), Vitest
(unit + storybook projects), Playwright (scene-webgl visual tier), `ts-json-schema-generator`
for the generated schema.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from
`CLAUDE.md`, `.claude/rules.md`, and the slice-0 current-state findings.

- `core/` imports neither React nor Three.js. `engine/` is the only Three.js importer.
  `engine/renderer/create-renderer.ts` keeps its lazy `await import('three/webgpu')`; do NOT
  add a static `three` import anywhere in engine source.
- All model mutations flow through `dispatch(command)`. Undo works only by reassigning a
  whole top-level slice of the project root (the inverse-capture proxy records only the root's
  own top-level keys), so command handlers reassign `state.environmentScenes = [...]` and
  `state.site = {...}` rather than mutating in place.
- Schema JSON is GENERATED, never hand-edited. Run `pnpm schema:generate` to emit a new
  `schema/<N>/vernacular.schema.json`; `pnpm schema:check` and `tests/format/schema-drift.test.ts`
  gate drift. Leave every existing `schema/<N>/` directory byte-for-byte immutable.
- ESLint warnings FAIL CI. Limits: `max-lines-per-function` 40, `max-lines` 300, `max-params`
  3, `complexity` 10, `max-depth` 3, `no-nested-ternary` (error), `no-magic-numbers` (free
  literals: -1, 0, 1, 2, 100; otherwise name a `const`, `enforceConst`). Test and story files
  relax: `no-magic-numbers` off, `max-lines-per-function` 120.
- Vitest: filter with `pnpm exec vitest run <path>` (NOT `pnpm test -- <x>`, which breaks
  filtering and coverage). Full gate: `pnpm typecheck && pnpm lint && pnpm format:check &&
pnpm test && pnpm build`.
- Conventional Commits. No `Co-Authored-By` trailer, no `Claude-Session` trailer, no
  em-dash in any newly composed text (prose OR code comments). Author identity
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- three is pinned 0.184.0, `@types/three` 0.184.1. `NeutralToneMapping` (value `7`, Khronos
  PBR Neutral) and `SRGBColorSpace` (value `'srgb'`) are both re-exported from `three/webgpu`.
- Dependency changes obey the 30-day cooldown and exact-pin rules. Slice 0 adds NO dependencies.

## Locked cross-area decisions

These resolve the open questions the investigators surfaced. They are load-bearing for
type consistency across tasks.

1. **Two sequential schema bumps.** v14 adds `Site.timezone` (passthrough migration); v15 adds
   `Project.environmentScenes` (backfill migration). Two versions, two migrations, two
   generated schema directories, two guard-test edits. Task 2 does v14, Task 4 does v15. Never
   cram both into one version.
2. **`environmentScenes` is a REQUIRED array** (mirrors `Project.stairs`): typed
   `environmentScenes: EnvironmentScene[]`, initialized `[]` in `createEmptyProject`, backfilled
   by an `add-stairs`-style migration, and left as `[]` (never collapsed to `undefined`) by the
   remove handler.
3. **Observation-time representation.** `EnvironmentScene.observedAt` is an ISO 8601 civil
   datetime string (`YYYY-MM-DDThh:mm`), which serializes cleanly and diffs cleanly.
   `ObservationInstant` is the structured working form the session-state scrubber holds
   (`{ date, minutesSinceMidnight }`). Timezone lives on `Site` (the "where"), NOT inside
   `ObservationInstant` (the "when"), matching the spec's own split (timezone is a `Site`
   field; each scene carries an observation instant). Slice 1a's solar math will combine
   `Site.latLong`, `Site.timezone`, and an `ObservationInstant`. This deviates from an
   investigator's parenthetical that folded timezone into `ObservationInstant`; the deviation
   is recorded in ADR-0141.

## Blocker resolved in this slice

`registerSiteCommands` is defined, exported (`core/index.ts:602-612`), and unit-tested, but
`createCommandRegistry` in `bridge/session/editor-session.ts:86-99` never calls it, so a live
session throws on any `site/*` command (`dispatcher.ts` rejects unregistered types). Mounting
the site editor (#407) and the environment-scene commands both depend on wiring
`registerSiteCommands(registry)` AND `registerEnvironmentSceneCommands(registry)` into
`createCommandRegistry`. Task 5, step group 5D closes this with an integration test.

## File Structure

Created:

- `core/environment/observation-time.ts` : pure `ObservationInstant` type plus ISO
  conversion, parse, format, and default helpers. No React, no Three.js.
- `core/environment/observation-time.test.ts` : unit tests for the helpers.
- `core/model/environment-scene.ts` : `EnvironmentScene` and `WeatherConditions` model types.
- `core/migrations/schema/add-site-timezone.ts` : v13 -> v14 passthrough migration.
- `core/migrations/schema/add-site-timezone.test.ts` : migration unit tests.
- `core/migrations/schema/add-environment-scenes.ts` : v14 -> v15 backfill migration.
- `core/migrations/schema/add-environment-scenes.test.ts` : migration unit tests.
- `core/commands/handlers/environment-scene-commands.ts` : add/remove/rename commands.
- `core/commands/handlers/environment-scene-commands.test.ts` : command unit tests.
- `engine/renderer/create-renderer.test.ts` : renderer color-management unit test (self-skips
  without a WebGL2 backend).
- `e2e/tests/scene-color-check-swatch.spec.ts` : scene-webgl neutral color-check acceptance;
  baseline renders on CI.
- `bridge/session/editor-session.test.ts` : integration test that a live session dispatches a
  site command (only if this file does not already exist; otherwise add a `describe` block).
- `schema/14/vernacular.schema.json`, `schema/15/vernacular.schema.json` : generated, committed.
- `docs/knowledge/decisions/ADR-0140-color-managed-renderer.md`
- `docs/knowledge/decisions/ADR-0141-environment-foundations.md`

Modified:

- `engine/renderer/create-renderer.ts` : add `toneMappingExposure?` option; set
  `outputColorSpace`, `toneMapping`, `toneMappingExposure`.
- `core/model/site.ts` : add `timezone?: string` to `Site`.
- `core/model/types.ts` : add `environmentScenes: EnvironmentScene[]` to `Project`; import the type.
- `core/model/factories.ts` : bump `CURRENT_SCHEMA_VERSION` 13 -> 14 -> 15; init `environmentScenes: []`.
- `core/model/factories.test.ts` : guard bump 13 -> 14 -> 15.
- `core/migrations/schema/index.ts` : register the two new migrations.
- `core/commands/handlers/site-commands.ts` : add `setSiteTimezone`.
- `core/commands/handlers/site-commands.test.ts` : add a `setSiteTimezone` case.
- `core/index.ts` : export the observation-time helpers, the environment-scene types and
  commands, and `setSiteTimezone`.
- `editor/metadata/site-editor.tsx` : add a timezone text field.
- `editor/metadata/site-editor.test.tsx` : add a timezone case.
- `editor/shell/editor-shell.tsx` : mount the site editor in the tool rail.
- `bridge/react/webgpu-scene-view.tsx` : add the `useObservationDateTime` hook and wire it.
- `bridge/react/scene-nav-toolbar.tsx` : add `ObservationDateTimeControl` and its props.
- `bridge/react/scene-nav-toolbar.test.tsx` : add an observation-scrubber case.

---

## Task 1: Color-managed renderer

**Files:**

- Modify: `engine/renderer/create-renderer.ts`
- Test: `engine/renderer/create-renderer.test.ts` (create)
- Test (acceptance, CI baseline): `e2e/tests/scene-color-check-swatch.spec.ts` (create)
- Docs: `docs/knowledge/decisions/ADR-0140-color-managed-renderer.md` (create)

**Interfaces:**

- Consumes: nothing from other slice-0 tasks.
- Produces: `SceneRendererOptions` gains `toneMappingExposure?: number`. The returned
  `WebGPURenderer` has `outputColorSpace === 'srgb'`, `toneMapping === NeutralToneMapping`
  (7), `toneMappingExposure === (options.toneMappingExposure ?? 1)`.

### 1A: renderer sets sRGB output and Khronos PBR Neutral tone mapping

- [ ] **Step 1: Write the failing test.** Create `engine/renderer/create-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSceneRenderer } from './create-renderer'

// Khronos PBR Neutral is three's NeutralToneMapping constant (value 7); sRGB output is
// 'srgb'. Assert the literals rather than importing three/webgpu into the unit graph, which
// would defeat the lazy-import invariant. no-magic-numbers is off in test files.
const NEUTRAL_TONE_MAPPING = 7
const SRGB_COLOR_SPACE = 'srgb'
const CUSTOM_EXPOSURE = 1.2

describe('createSceneRenderer color management', () => {
  it('renders in sRGB with Khronos PBR Neutral tone mapping at unit exposure', async (ctx) => {
    let renderer
    try {
      renderer = await createSceneRenderer({ forceWebGL: true })
    } catch {
      // The jsdom unit runner has no WebGL2 backend to construct; the byte-exact color
      // acceptance is the scene-webgl tier in scene-color-check-swatch.spec.ts.
      ctx.skip()
      return
    }
    expect(renderer.outputColorSpace).toBe(SRGB_COLOR_SPACE)
    expect(renderer.toneMapping).toBe(NEUTRAL_TONE_MAPPING)
    expect(renderer.toneMappingExposure).toBe(1)
  })

  it('honors a configured tone-mapping exposure', async (ctx) => {
    let renderer
    try {
      renderer = await createSceneRenderer({
        forceWebGL: true,
        toneMappingExposure: CUSTOM_EXPOSURE,
      })
    } catch {
      ctx.skip()
      return
    }
    expect(renderer.toneMappingExposure).toBe(CUSTOM_EXPOSURE)
  })
})
```

- [ ] **Step 2: Run the test, expect RED.** On a machine or CI tier with a WebGL2 backend the
      first case fails (`toneMapping` is `NoToneMapping`, 0, not 7). Under jsdom it self-skips.

Run: `pnpm exec vitest run engine/renderer/create-renderer.test.ts`
Expected: FAIL (assertion 0 !== 7) where a backend exists, or SKIPPED under jsdom. If it
SKIPS, note that in the RED evidence: the GPU acceptance in step group below carries the real gate.

- [ ] **Step 3: Commit the test.**

```bash
git add engine/renderer/create-renderer.test.ts
git commit -m "test: assert the scene renderer is color-managed with Neutral tone mapping"
```

- [ ] **Step 4: Implement.** Edit `engine/renderer/create-renderer.ts`. Add the option to the
      interface:

```ts
/** Options for constructing the WebGPU scene renderer. */
export interface SceneRendererOptions {
  canvas?: HTMLCanvasElement
  antialias?: boolean
  /**
   * Force the WebGL 2 backend regardless of WebGPU availability. Production leaves
   * this off: WebGPURenderer targets WebGPU when `navigator.gpu` is present and
   * already auto-falls-back to its WebGL 2 backend when it is not. The visual
   * harness sets it so the committed baseline is a deterministic hardware-WebGL
   * render that never collides with a future WebGPU baseline.
   */
  forceWebGL?: boolean
  /**
   * Tone-mapping exposure multiplier applied before the Khronos PBR Neutral operator.
   * Defaults to 1 (no exposure change). Realistic daylight scenes tune this later; the
   * schematic baseline leaves it at 1 (ADR-0140).
   */
  toneMappingExposure?: number
}
```

Destructure the two new constants from the existing lazy import and set the three properties
after the shadow-map block, before `renderer.init()`:

```ts
export async function createSceneRenderer(
  options: SceneRendererOptions = {},
): Promise<WebGPURenderer> {
  const {
    WebGPURenderer: Renderer,
    PCFSoftShadowMap,
    NeutralToneMapping,
    SRGBColorSpace,
  } = await import('three/webgpu')
  const renderer = new Renderer({
    canvas: options.canvas,
    antialias: options.antialias ?? true,
    forceWebGL: options.forceWebGL ?? false,
  })
  // Soft shadow maps stay within the feature set both the WebGPU and the WebGL 2 backend
  // express (foundation spec 5.6); PCF soft filtering softens the directional sun's shadow
  // edges over the cheaper hard-edged basic map.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  // Color management (ADR-0140): render output is sRGB and tone mapping is Khronos PBR
  // Neutral, which preserves base color and compresses only highlights, so paint hue is not
  // skewed the way a filmic operator would. Exposure defaults to 1 (no change).
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = options.toneMappingExposure ?? 1
  await renderer.init()
  return renderer
}
```

- [ ] **Step 5: Run the test, expect GREEN** (or SKIP under jsdom).

Run: `pnpm exec vitest run engine/renderer/create-renderer.test.ts`
Expected: PASS where a backend exists; SKIPPED under jsdom.

- [ ] **Step 6: Run the full gate.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm exec vitest run engine/renderer && pnpm build`
Expected: all pass. (Verify each command's own exit code; a piped tail can mask a failure.)

- [ ] **Step 7: Commit the implementation.**

```bash
git add engine/renderer/create-renderer.ts
git commit -m "feat: color-manage the scene renderer with sRGB output and Neutral tone mapping"
```

- [ ] **Step 8: BLUE.** Dispatch `/clean-code-review` on the diff, then `/refactor`. Land the
      refactor result, or an empty `refactor:` marker commit if there are no actionable findings.

### 1B: neutral color-check swatch acceptance (scene-webgl tier, baseline on CI)

The byte-exact "known sRGB albedo swatch renders to the expected output pixel within tolerance"
gate cannot run under jsdom and its baseline cannot render locally (amd64 chromium crashes
under local emulation; story and scene baselines render on the CI runner). Author the spec now;
the baseline lands when the branch reaches CI with the `run:visual` label.

- [ ] **Step 1: Write the scene-webgl spec.** Create `e2e/tests/scene-color-check-swatch.spec.ts`
      matching the `scene-*` naming so it runs in the hardware-GPU `scene-webgl` Playwright project.
      Render a fixed, known sRGB albedo swatch through a `createSceneRenderer`-built scene and
      screenshot it. Follow the structure of `e2e/tests/scene-visual-regression.spec.ts` and use
      `stableFrame(canvas)` from `e2e/tests/scene-helpers.ts` before the screenshot. Read that spec
      and helper first and mirror their harness-launch, canvas-locate, and `toHaveScreenshot`
      tolerance conventions exactly (do not invent a new harness).

- [ ] **Step 2: Confirm the spec self-skips without a baseline PNG.**

Run: `pnpm exec playwright test scene-color-check-swatch --project scene-webgl`
Expected: SKIPPED or PASS-pending-baseline locally (the spec self-skips when its snapshot PNG
is missing). Record this: the real gate is the CI baseline.

- [ ] **Step 3: Commit the spec.**

```bash
git add e2e/tests/scene-color-check-swatch.spec.ts
git commit -m "test(e2e): add the neutral color-check swatch scene-webgl acceptance"
```

- [ ] **Step 4: Note the deferred baseline.** The CI baseline must render on the runner
      (`run:visual` label, `refresh-story-baselines.yml`). This session is local, so flag it in the
      final handoff and the tracking issue rather than attempting a local baseline.

### 1C: ADR-0140

- [ ] **Step 1: Scaffold and write ADR-0140** (`/adr color-managed-renderer "Color-managed renderer"`).
      Record: the choice of Khronos PBR Neutral over a filmic operator (base-color preservation),
      sRGB output color space, configurable exposure, and that this extends/supersedes the tone
      and lighting reasoning in ADR-0065 and ADR-0079. Run the `humanizer` skill (ADRs are
      human-read). Commit `docs: add ADR-0140 for the color-managed renderer`.

---

## Task 2: `Site.timezone` and schema version 14

**Files:**

- Modify: `core/model/site.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`,
  `core/migrations/schema/index.ts`
- Create: `core/migrations/schema/add-site-timezone.ts`,
  `core/migrations/schema/add-site-timezone.test.ts`, `schema/14/vernacular.schema.json` (generated)

**Interfaces:**

- Consumes: nothing from other slice-0 tasks.
- Produces: `Site.timezone?: string`. `CURRENT_SCHEMA_VERSION === 14`.
  `addSiteTimezoneMigration: SchemaMigration` with `from: 13`. Used by Task 5's `setSiteTimezone`.

### 2A: v13 -> v14 passthrough migration and the `timezone` field

- [ ] **Step 1: Write the failing migration test.** Create
      `core/migrations/schema/add-site-timezone.test.ts` (copy the structure of
      `add-site-grade-elevation.test.ts`, shifting the version to 13):

```ts
import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addSiteTimezoneMigration } from './add-site-timezone'

const VERSION_THIRTEEN = 13

interface SiteShape {
  northBearing?: number
  timezone?: string
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  site?: SiteShape
}

/**
 * Builds a version-13 project document whose site predates the `timezone` field.
 * Returned as a plain `ProjectShape` so the migration is exercised structurally,
 * exactly as a loaded-from-disk version-13 document would arrive.
 */
function makeVersionThirteenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_THIRTEEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    site: { northBearing: 0 },
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-site-timezone schema migration', () => {
  it('starts its forward step from schema version 13', () => {
    expect(addSiteTimezoneMigration.from).toBe(VERSION_THIRTEEN)
  })

  it('leaves an existing site unchanged (an optional field needs no backfill)', () => {
    const migrated = addSiteTimezoneMigration.migrate(makeVersionThirteenDocument())

    expect(asDocument(migrated).site?.timezone).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addSiteTimezoneMigration.migrate(makeVersionThirteenDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_THIRTEEN)
  })
})
```

Also update the version guard in `core/model/factories.test.ts` (currently `it('is 13')`):

```ts
describe('CURRENT_SCHEMA_VERSION', () => {
  it('is 14', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(14)
  })
})
```

- [ ] **Step 2: Run the tests, expect RED.**

Run: `pnpm exec vitest run core/migrations/schema/add-site-timezone.test.ts core/model/factories.test.ts`
Expected: FAIL (`add-site-timezone` module not found; guard expected 14, got 13).

- [ ] **Step 3: Commit the tests.**

```bash
git add core/migrations/schema/add-site-timezone.test.ts core/model/factories.test.ts
git commit -m "test: cover the site timezone field and its version-14 migration"
```

- [ ] **Step 4: Implement.** Create `core/migrations/schema/add-site-timezone.ts`:

```ts
import type { SchemaMigration } from '../types'

/**
 * Migrates a version-13 document to version 14. `Site.timezone` is an optional
 * field, so a version-13-and-earlier document simply omits it and is already valid
 * at version 14; this migration is a passthrough. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addSiteTimezoneMigration: SchemaMigration = {
  from: 13,
  migrate(project) {
    return project
  },
}
```

Register it in `core/migrations/schema/index.ts` (add the import beside the others and append
to the array):

```ts
import { addSiteTimezoneMigration } from './add-site-timezone'
```

```ts
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
  addStairsMigration,
  addUnderlayKindMigration,
  addPalettesPaintAndSiteMigration,
  addSurfaceTreatmentMigration,
  addFloorFurnitureMigration,
  addFurnitureHeightMigration,
  addWallConstructionProfileMigration,
  addSiteGradeElevationMigration,
  addSiteTimezoneMigration,
]
```

Add `timezone?: string` to `Site` in `core/model/site.ts`, after `gradeElevation`:

```ts
  /**
   * Ground-surface elevation in millimeters: the datum the ground plane sits at and
   * the threshold the whole-building view treats as below grade. Absent means the
   * 0 datum, decoupling grade from the finished-floor-zero convention only when set.
   */
  gradeElevation?: number
  /**
   * IANA time-zone identifier for the site, for example `America/New_York`. Used
   * with the site location and an observation instant to place the sun (slice 1a).
   * Absent means the timezone has not been set.
   */
  timezone?: string
}
```

Bump the version in `core/model/factories.ts` and extend the changelog comment. Append to the
comment block that ends at the `v13` line:

```ts
// v13 adds an optional `Site.gradeElevation` field (a passthrough migration);
// v14 adds an optional `Site.timezone` field (a passthrough migration).
export const CURRENT_SCHEMA_VERSION = 14
```

(`createEmptyProject` needs no change; `timezone` is optional.)

- [ ] **Step 5: Regenerate the schema.**

Run: `pnpm schema:generate`
Expected: writes `schema/14/vernacular.schema.json`. Confirm `schema/13/` is untouched
(`git status --short schema/` shows only the new `schema/14/` directory as added).

- [ ] **Step 6: Run the tests and the drift gate, expect GREEN.**

Run: `pnpm exec vitest run core/migrations/schema/add-site-timezone.test.ts core/model/factories.test.ts && pnpm exec vitest run tests/format/schema-drift.test.ts && pnpm schema:check`
Expected: PASS.

- [ ] **Step 7: Full gate.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 8: Commit the implementation** (include the generated schema directory):

```bash
git add core/model/site.ts core/model/factories.ts core/migrations/schema/add-site-timezone.ts core/migrations/schema/index.ts schema/14
git commit -m "feat: add an optional Site.timezone field at schema version 14"
```

- [ ] **Step 9: BLUE.** `/clean-code-review` then `/refactor`; land the result or an empty
      `refactor:` marker.

---

## Task 3: `ObservationInstant` core type and helpers

**Files:**

- Create: `core/environment/observation-time.ts`, `core/environment/observation-time.test.ts`
- Modify: `core/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (imported by Task 6 and, as a string, related to Task 4's `observedAt`):

```ts
export interface ObservationInstant {
  readonly date: string // ISO 8601 calendar date, YYYY-MM-DD
  readonly minutesSinceMidnight: number // 0..1439, local wall-clock
}
export const MINUTES_PER_DAY: number
export const DEFAULT_OBSERVATION_INSTANT: ObservationInstant
export function observationInstantToIso(instant: ObservationInstant): string // YYYY-MM-DDThh:mm
export function parseObservationInstant(iso: string): ObservationInstant
export function formatObservationDateTime(instant: ObservationInstant): string // "YYYY-MM-DD hh:mm"
```

### 3A: the observation-time helpers

- [ ] **Step 1: Write the failing test.** Create `core/environment/observation-time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OBSERVATION_INSTANT,
  MINUTES_PER_DAY,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'

const NOON = 12 * 60
const QUARTER_PAST_NINE_AM = 9 * 60 + 15

describe('observation-time helpers', () => {
  it('defaults to summer-solstice noon', () => {
    expect(DEFAULT_OBSERVATION_INSTANT.date).toBe('2026-06-21')
    expect(DEFAULT_OBSERVATION_INSTANT.minutesSinceMidnight).toBe(NOON)
  })

  it('spans a full day in minutes', () => {
    expect(MINUTES_PER_DAY).toBe(1440)
  })

  it('serializes to a zero-padded ISO 8601 civil datetime', () => {
    const instant: ObservationInstant = {
      date: '2026-06-21',
      minutesSinceMidnight: QUARTER_PAST_NINE_AM,
    }
    expect(observationInstantToIso(instant)).toBe('2026-06-21T09:15')
  })

  it('serializes midnight as 00:00', () => {
    expect(observationInstantToIso({ date: '2026-01-01', minutesSinceMidnight: 0 })).toBe(
      '2026-01-01T00:00',
    )
  })

  it('round-trips through parse', () => {
    const instant: ObservationInstant = { date: '2026-12-04', minutesSinceMidnight: 16 * 60 }
    expect(parseObservationInstant(observationInstantToIso(instant))).toEqual(instant)
  })

  it('parses a datetime-local input string', () => {
    expect(parseObservationInstant('2026-03-20T06:30')).toEqual({
      date: '2026-03-20',
      minutesSinceMidnight: 6 * 60 + 30,
    })
  })

  it('formats a readable readout', () => {
    expect(formatObservationDateTime({ date: '2026-06-21', minutesSinceMidnight: NOON })).toBe(
      '2026-06-21 12:00',
    )
  })
})
```

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run core/environment/observation-time.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Commit the test.**

```bash
git add core/environment/observation-time.test.ts
git commit -m "test: cover the observation-time type and its helpers"
```

- [ ] **Step 4: Implement.** Create `core/environment/observation-time.ts`:

```ts
/**
 * A civil (wall-clock) observation moment: the calendar date and the time of day a
 * scene is observed at. Timezone lives on the `Site` (the "where"), not here (the
 * "when"), so a scene's wall-clock time reads the same wherever the project sits.
 * Slice 0 shows this as a readout only; slice 1a combines it with the site latitude,
 * longitude, and timezone to place the sun (ADR-0141).
 */
export interface ObservationInstant {
  /** ISO 8601 calendar date, `YYYY-MM-DD`. */
  readonly date: string
  /** Minutes since local midnight, 0..1439. */
  readonly minutesSinceMidnight: number
}

const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
/** Minutes in a full civil day; the exclusive upper bound for `minutesSinceMidnight`. */
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY

const NOON_MINUTES = 12 * MINUTES_PER_HOUR
/** Summer-solstice noon: a bright, unambiguous default for the readout. */
export const DEFAULT_OBSERVATION_INSTANT: ObservationInstant = {
  date: '2026-06-21',
  minutesSinceMidnight: NOON_MINUTES,
}

const ISO_TIME_RADIX = 10
const ISO_FIELD_WIDTH = 2

function twoDigits(value: number): string {
  return value.toString(ISO_TIME_RADIX).padStart(ISO_FIELD_WIDTH, '0')
}

function hoursAndMinutes(minutesSinceMidnight: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(minutesSinceMidnight / MINUTES_PER_HOUR),
    minutes: minutesSinceMidnight % MINUTES_PER_HOUR,
  }
}

/** Serializes to an ISO 8601 civil datetime `YYYY-MM-DDThh:mm` (a `datetime-local` value). */
export function observationInstantToIso(instant: ObservationInstant): string {
  const { hours, minutes } = hoursAndMinutes(instant.minutesSinceMidnight)
  return `${instant.date}T${twoDigits(hours)}:${twoDigits(minutes)}`
}

/** Parses an ISO 8601 civil datetime `YYYY-MM-DDThh:mm` back into an `ObservationInstant`. */
export function parseObservationInstant(iso: string): ObservationInstant {
  const [date, time] = iso.split('T')
  const [hours, minutes] = time.split(':').map((field) => Number.parseInt(field, ISO_TIME_RADIX))
  return { date, minutesSinceMidnight: hours * MINUTES_PER_HOUR + minutes }
}

/** Formats a readable readout `YYYY-MM-DD hh:mm` for the scrubber. */
export function formatObservationDateTime(instant: ObservationInstant): string {
  const { hours, minutes } = hoursAndMinutes(instant.minutesSinceMidnight)
  return `${instant.date} ${twoDigits(hours)}:${twoDigits(minutes)}`
}
```

Export from `core/index.ts` (add a block next to the color-temperature export at lines 540-547):

```ts
export type { ObservationInstant } from './environment/observation-time'
export {
  DEFAULT_OBSERVATION_INSTANT,
  MINUTES_PER_DAY,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
} from './environment/observation-time'
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run core/environment/observation-time.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add core/environment/observation-time.ts core/index.ts
git commit -m "feat: add the pure-core observation-time type and helpers"
```

- [ ] **Step 8: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

---

## Task 4: `EnvironmentScene[]` persistence and commands (schema version 15)

**Files:**

- Create: `core/model/environment-scene.ts`,
  `core/migrations/schema/add-environment-scenes.ts`,
  `core/migrations/schema/add-environment-scenes.test.ts`,
  `core/commands/handlers/environment-scene-commands.ts`,
  `core/commands/handlers/environment-scene-commands.test.ts`,
  `schema/15/vernacular.schema.json` (generated)
- Modify: `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`,
  `core/migrations/schema/index.ts`, `core/index.ts`

**Interfaces:**

- Consumes: `CURRENT_SCHEMA_VERSION === 14` from Task 2.
- Produces:

```ts
export interface WeatherConditions {
  summary?: string
  extensions?: Extensions
}
export interface EnvironmentScene {
  id: string
  name: string
  observedAt: string // ISO 8601 civil datetime, YYYY-MM-DDThh:mm
  weather?: WeatherConditions
  extensions?: Extensions
}
// Project gains: environmentScenes: EnvironmentScene[]  (required)
// CURRENT_SCHEMA_VERSION === 15
export const ADD_ENVIRONMENT_SCENE = 'environment-scene/add'
export const REMOVE_ENVIRONMENT_SCENE = 'environment-scene/remove'
export const RENAME_ENVIRONMENT_SCENE = 'environment-scene/rename'
export function addEnvironmentScene(scene: EnvironmentScene): Command<AddEnvironmentSceneParams>
export function removeEnvironmentScene(id: string): Command<RemoveEnvironmentSceneParams>
export function renameEnvironmentScene(
  id: string,
  name: string,
): Command<RenameEnvironmentSceneParams>
export function registerEnvironmentSceneCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>
```

### 4A: the model type, the required array, and the v14 -> v15 backfill migration

- [ ] **Step 1: Write the failing tests.** Create
      `core/migrations/schema/add-environment-scenes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addEnvironmentScenesMigration } from './add-environment-scenes'

const VERSION_FOURTEEN = 14

interface DocumentShape {
  meta?: { schemaVersion?: number }
  environmentScenes?: unknown
}

function makeVersionFourteenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_FOURTEEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    stairs: [],
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-environment-scenes schema migration', () => {
  it('starts its forward step from schema version 14', () => {
    expect(addEnvironmentScenesMigration.from).toBe(VERSION_FOURTEEN)
  })

  it('backfills an absent environmentScenes array to empty', () => {
    const migrated = addEnvironmentScenesMigration.migrate(makeVersionFourteenDocument())

    expect(asDocument(migrated).environmentScenes).toEqual([])
  })

  it('preserves an already-present environmentScenes array', () => {
    const scenes = [{ id: 's1', name: 'Noon', observedAt: '2026-06-21T12:00' }]
    const doc = { ...makeVersionFourteenDocument(), environmentScenes: scenes } as ProjectShape

    expect(asDocument(addEnvironmentScenesMigration.migrate(doc)).environmentScenes).toBe(scenes)
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addEnvironmentScenesMigration.migrate(makeVersionFourteenDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_FOURTEEN)
  })
})
```

Add a `createEmptyProject` initializer assertion and bump the version guard in
`core/model/factories.test.ts`:

```ts
describe('CURRENT_SCHEMA_VERSION', () => {
  it('is 15', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(15)
  })
})

describe('createEmptyProject environment scenes', () => {
  it('initializes an empty environment-scenes array', () => {
    expect(
      createEmptyProject({ name: 'H', units: 'metric', period: 'victorian', appVersion: '0.1.0' })
        .environmentScenes,
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run core/migrations/schema/add-environment-scenes.test.ts core/model/factories.test.ts`
Expected: FAIL (migration module missing; guard expected 15; `environmentScenes` undefined).

- [ ] **Step 3: Commit the tests.**

```bash
git add core/migrations/schema/add-environment-scenes.test.ts core/model/factories.test.ts
git commit -m "test: cover environment-scene persistence and the version-15 migration"
```

- [ ] **Step 4: Implement.** Create `core/model/environment-scene.ts`:

```ts
import type { Extensions } from './types'

/**
 * Non-rendering weather placeholder for an environment scene. Slice 1a wires a
 * turbidity or cloud-cover dial through this; slice 0 persists it verbatim and
 * renders nothing from it (documented like `Obstruction`).
 */
export interface WeatherConditions {
  /** Free-text summary, for example `'clear'` or `'overcast'`. Absent means unspecified. */
  summary?: string
  /** Third-party extension data; see {@link Extensions}. */
  extensions?: Extensions
}

/**
 * A saved viewing condition: a named observation instant plus weather. Scenes reload
 * identically and can be shared, so a paint can be checked across several conditions
 * (design spec 3.1; ADR-0141). `observedAt` is an ISO 8601 civil datetime string
 * (`YYYY-MM-DDThh:mm`) for clean JSON diffs; the working form is `ObservationInstant`.
 */
export interface EnvironmentScene {
  id: string
  name: string
  /** ISO 8601 civil datetime `YYYY-MM-DDThh:mm`; parse with `parseObservationInstant`. */
  observedAt: string
  weather?: WeatherConditions
  /** Third-party extension data; see {@link Extensions}. */
  extensions?: Extensions
}
```

In `core/model/types.ts`, import the type near the top (beside the other model imports) and add
the required array to `Project`:

```ts
import type { EnvironmentScene } from './environment-scene'
```

```ts
export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  /**
   * Floor-spanning stairs. A sibling of `floors` because each stair connects two
   * floors; see the design specification, sections 3.1 and 3.2.
   */
  stairs: Stair[]
  /**
   * Saved environment scenes (named observation conditions). A required sibling
   * array like `stairs`, reassigned whole by undoable commands so the inverse-capture
   * proxy records the root-level change. Empty means no saved scenes (ADR-0141).
   */
  environmentScenes: EnvironmentScene[]
  /**
   * Per-room user metadata keyed by `roomKey(room)`. A sibling of `meta` and
   * `floors` so an undoable command can reassign it whole (the inverse-capture
   * proxy records only the root's own top-level keys). Absent means no overrides.
   */
  roomOverrides?: Record<string, RoomOverride> | undefined
  palettes?: ProjectPalette[] | undefined
  paint?: Record<string, SurfaceTreatment> | undefined
  site?: Site | undefined
  extensions?: Extensions
}
```

In `core/model/factories.ts`, initialize the array in `createEmptyProject`, bump the version,
and extend the changelog comment:

```ts
// v14 adds an optional `Site.timezone` field (a passthrough migration);
// v15 adds the required top-level `environmentScenes` array (an absent-by-default backfill).
export const CURRENT_SCHEMA_VERSION = 15
```

```ts
export function createEmptyProject(options: NewProjectOptions): Project {
  return {
    meta: {
      name: options.name,
      units: options.units,
      period: options.period,
      ...(options.style !== undefined ? { style: options.style } : {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: options.appVersion,
      registryVersions: {},
    },
    floors: [],
    stairs: [],
    environmentScenes: [],
  }
}
```

Create `core/migrations/schema/add-environment-scenes.ts` (backfill, copy the `add-stairs.ts`
idiom):

```ts
import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-14 document to version 15 by backfilling the required top-level
 * `environmentScenes` array; an already-present array is preserved unchanged. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addEnvironmentScenesMigration: SchemaMigration = {
  from: 14,
  migrate(project) {
    // `environmentScenes` is absent on version-14-and-earlier documents (the normal
    // case); the spread copies through `undefined` and the `Array.isArray` fallback
    // supplies `[]`.
    const environmentScenes = project.environmentScenes
    return {
      ...project,
      environmentScenes: Array.isArray(environmentScenes) ? environmentScenes : [],
    } satisfies ProjectShape
  },
}
```

Register in `core/migrations/schema/index.ts`:

```ts
import { addEnvironmentScenesMigration } from './add-environment-scenes'
```

```ts
  addSiteGradeElevationMigration,
  addSiteTimezoneMigration,
  addEnvironmentScenesMigration,
]
```

- [ ] **Step 5: Regenerate the schema.**

Run: `pnpm schema:generate`
Expected: writes `schema/15/vernacular.schema.json`; `schema/14/` and earlier untouched.

- [ ] **Step 6: Run tests and drift gate, expect GREEN.**

Run: `pnpm exec vitest run core/migrations/schema/add-environment-scenes.test.ts core/model/factories.test.ts tests/format/schema-drift.test.ts && pnpm schema:check`
Expected: PASS.

- [ ] **Step 7: Full gate.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass. (A required new `Project` field can break fixtures that build a `Project`
literal without `environmentScenes`. If typecheck flags any, they are constructing `Project`
by hand; add `environmentScenes: []` to each. Grep first: `grep -rn "stairs: \[\]" --include=*.ts`
locates the sibling-array construction sites.)

- [ ] **Step 8: Commit** (include the generated schema directory):

```bash
git add core/model/environment-scene.ts core/model/types.ts core/model/factories.ts core/migrations/schema/add-environment-scenes.ts core/migrations/schema/index.ts schema/15
git commit -m "feat: persist a required EnvironmentScene array at schema version 15"
```

- [ ] **Step 9: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

### 4B: add / remove / rename commands

- [ ] **Step 1: Write the failing tests.** Create
      `core/commands/handlers/environment-scene-commands.test.ts` (mirror `site-commands.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import {
  addEnvironmentScene,
  registerEnvironmentSceneCommands,
  removeEnvironmentScene,
  renameEnvironmentScene,
} from './environment-scene-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { EnvironmentScene } from '../../model/environment-scene'
import type { Project } from '../../model/types'

const NOON: EnvironmentScene = {
  id: 'scene-1',
  name: 'Summer noon',
  observedAt: '2026-06-21T12:00',
}

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerEnvironmentSceneCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('addEnvironmentScene', () => {
  it('appends a scene', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(addEnvironmentScene(NOON))
    expect(project.environmentScenes).toEqual([NOON])
  })

  it('restores the prior array on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.undo()
    expect(project.environmentScenes).toEqual([])
  })
})

describe('removeEnvironmentScene', () => {
  it('drops a scene by id and leaves an empty array (never undefined)', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(removeEnvironmentScene('scene-1'))
    expect(project.environmentScenes).toEqual([])
  })
})

describe('renameEnvironmentScene', () => {
  it('renames a scene by id', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(renameEnvironmentScene('scene-1', 'Summer midday'))
    expect(project.environmentScenes[0]?.name).toBe('Summer midday')
  })
})
```

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run core/commands/handlers/environment-scene-commands.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Commit the test.**

```bash
git add core/commands/handlers/environment-scene-commands.test.ts
git commit -m "test: cover the environment-scene add, remove, and rename commands"
```

- [ ] **Step 4: Implement.** Create `core/commands/handlers/environment-scene-commands.ts`
      (mirror `site-commands.ts`; every handler reassigns the whole `state.environmentScenes` array):

```ts
import type { EnvironmentScene } from '../../model/environment-scene'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_ENVIRONMENT_SCENE = 'environment-scene/add'

export interface AddEnvironmentSceneParams {
  scene: EnvironmentScene
}

export function addEnvironmentScene(scene: EnvironmentScene): Command<AddEnvironmentSceneParams> {
  return { type: ADD_ENVIRONMENT_SCENE, params: { scene }, description: 'Add environment scene' }
}

const addEnvironmentSceneHandler: CommandHandler<Project, AddEnvironmentSceneParams> = {
  apply(state, params) {
    // Reassign the whole array so the inverse-capture proxy records the root-level
    // change and undo restores the prior array reference.
    state.environmentScenes = [...state.environmentScenes, params.scene]
  },
}

export const REMOVE_ENVIRONMENT_SCENE = 'environment-scene/remove'

export interface RemoveEnvironmentSceneParams {
  id: string
}

export function removeEnvironmentScene(id: string): Command<RemoveEnvironmentSceneParams> {
  return { type: REMOVE_ENVIRONMENT_SCENE, params: { id }, description: 'Remove environment scene' }
}

const removeEnvironmentSceneHandler: CommandHandler<Project, RemoveEnvironmentSceneParams> = {
  apply(state, params) {
    // A required array stays an array: an emptied list is `[]`, never undefined.
    state.environmentScenes = state.environmentScenes.filter((scene) => scene.id !== params.id)
  },
}

export const RENAME_ENVIRONMENT_SCENE = 'environment-scene/rename'

export interface RenameEnvironmentSceneParams {
  id: string
  name: string
}

export function renameEnvironmentScene(
  id: string,
  name: string,
): Command<RenameEnvironmentSceneParams> {
  return {
    type: RENAME_ENVIRONMENT_SCENE,
    params: { id, name },
    description: 'Rename environment scene',
  }
}

const renameEnvironmentSceneHandler: CommandHandler<Project, RenameEnvironmentSceneParams> = {
  apply(state, params) {
    state.environmentScenes = state.environmentScenes.map((scene) =>
      scene.id === params.id ? { ...scene, name: params.name } : scene,
    )
  },
}

export function registerEnvironmentSceneCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ADD_ENVIRONMENT_SCENE, addEnvironmentSceneHandler)
    .register(REMOVE_ENVIRONMENT_SCENE, removeEnvironmentSceneHandler)
    .register(RENAME_ENVIRONMENT_SCENE, renameEnvironmentSceneHandler)
}
```

Export from `core/index.ts` (mirror the site-commands export block at 596-612):

```ts
export type { EnvironmentScene, WeatherConditions } from './model/environment-scene'
export type {
  AddEnvironmentSceneParams,
  RemoveEnvironmentSceneParams,
  RenameEnvironmentSceneParams,
} from './commands/handlers/environment-scene-commands'
export {
  ADD_ENVIRONMENT_SCENE,
  REMOVE_ENVIRONMENT_SCENE,
  RENAME_ENVIRONMENT_SCENE,
  addEnvironmentScene,
  registerEnvironmentSceneCommands,
  removeEnvironmentScene,
  renameEnvironmentScene,
} from './commands/handlers/environment-scene-commands'
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run core/commands/handlers/environment-scene-commands.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add core/commands/handlers/environment-scene-commands.ts core/index.ts
git commit -m "feat: add undoable environment-scene add, remove, and rename commands"
```

- [ ] **Step 8: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

---

## Task 5: Site editor mount, timezone control, and command wiring (#407)

**Files:**

- Modify: `core/commands/handlers/site-commands.ts`, `core/commands/handlers/site-commands.test.ts`,
  `core/index.ts`, `editor/metadata/site-editor.tsx`, `editor/metadata/site-editor.test.tsx`,
  `editor/shell/editor-shell.tsx`, `bridge/session/editor-session.ts`
- Create: `bridge/session/editor-session.test.ts` (only if absent)

**Interfaces:**

- Consumes: `Site.timezone` (Task 2), `registerEnvironmentSceneCommands` (Task 4),
  `registerSiteCommands` (existing).
- Produces:

```ts
export const SET_SITE_TIMEZONE = 'site/set-timezone'
export interface SetSiteTimezoneParams {
  timezone: string
}
export function setSiteTimezone(timezone: string): Command<SetSiteTimezoneParams>
```

### 5A: the `setSiteTimezone` command

- [ ] **Step 1: Write the failing test.** Append to `core/commands/handlers/site-commands.test.ts`.
      Add `setSiteTimezone` to the import list and a new `describe`:

```ts
import {
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
} from './site-commands'
```

```ts
describe('setSiteTimezone', () => {
  it('records an IANA timezone', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setSiteTimezone('America/New_York'))
    expect(project.site?.timezone).toBe('America/New_York')
  })
})
```

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run core/commands/handlers/site-commands.test.ts`
Expected: FAIL (`setSiteTimezone` not exported).

- [ ] **Step 3: Commit the test.**

```bash
git add core/commands/handlers/site-commands.test.ts
git commit -m "test: record a site timezone through dispatch"
```

- [ ] **Step 4: Implement.** In `core/commands/handlers/site-commands.ts`, add after the
      north-bearing handler (before `registerSiteCommands`):

```ts
export const SET_SITE_TIMEZONE = 'site/set-timezone'

export interface SetSiteTimezoneParams {
  timezone: string
}

export function setSiteTimezone(timezone: string): Command<SetSiteTimezoneParams> {
  return { type: SET_SITE_TIMEZONE, params: { timezone }, description: 'Set site timezone' }
}

const setSiteTimezoneHandler: CommandHandler<Project, SetSiteTimezoneParams> = {
  apply(state, params) {
    state.site = { ...state.site, timezone: params.timezone }
  },
}
```

Register it:

```ts
export function registerSiteCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(SET_SITE_LOCATION, setSiteLocationHandler)
    .register(SET_SITE_NORTH_BEARING, setSiteNorthBearingHandler)
    .register(SET_SITE_TIMEZONE, setSiteTimezoneHandler)
    .register(ADD_OBSTRUCTION, addObstructionHandler)
    .register(REMOVE_OBSTRUCTION, removeObstructionHandler)
}
```

Export from `core/index.ts` (extend the existing site-commands export block at 596-612):

```ts
export type {
  AddObstructionParams,
  RemoveObstructionParams,
  SetSiteLocationParams,
  SetSiteNorthBearingParams,
  SetSiteTimezoneParams,
} from './commands/handlers/site-commands'
export {
  ADD_OBSTRUCTION,
  REMOVE_OBSTRUCTION,
  SET_SITE_LOCATION,
  SET_SITE_NORTH_BEARING,
  SET_SITE_TIMEZONE,
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
} from './commands/handlers/site-commands'
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run core/commands/handlers/site-commands.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add core/commands/handlers/site-commands.ts core/index.ts
git commit -m "feat: add a setSiteTimezone command"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

### 5B: the timezone field in the site editor

- [ ] **Step 1: Write the failing test.** In `editor/metadata/site-editor.test.tsx`, add a case
      that types a timezone and asserts the dispatched command. Follow the file's existing setup
      (`userEvent.setup()`, `dispatch = vi.fn()`, `getByLabelText`, `.type('...{Enter}')`). New case:

```ts
it('dispatches setSiteTimezone on commit', async () => {
  const dispatch = vi.fn()
  const user = userEvent.setup()
  render(<SiteEditor site={{}} dispatch={dispatch} />)

  await user.type(screen.getByLabelText(/timezone/i), 'America/New_York{Enter}')

  const command = dispatch.mock.calls.at(-1)?.[0]
  expect(command?.type).toBe(setSiteTimezone('America/New_York').type)
  expect(command?.params).toEqual({ timezone: 'America/New_York' })
})
```

Add `setSiteTimezone` to the test's `core` import.

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run --project unit editor/metadata/site-editor.test.tsx`
Expected: FAIL (no field labeled "timezone").

- [ ] **Step 3: Commit the test.**

```bash
git add editor/metadata/site-editor.test.tsx
git commit -m "test: edit the site timezone in the site editor"
```

- [ ] **Step 4: Implement.** In `editor/metadata/site-editor.tsx`, add a `LabeledTextInput`
      subcomponent beside `LabeledNumberInput` (keep each function under 40 lines), add
      `setSiteTimezone` to the `core` import, seed timezone state, and render the field:

```ts
import { useState, type KeyboardEvent } from 'react'
import {
  setSiteLocation,
  setSiteNorthBearing,
  setSiteTimezone,
  type Command,
  type Site,
} from '../../core'
import { Stack } from '../design-system'
```

```ts
interface LabeledTextInputProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  onCommit: () => void
}

function LabeledTextInput({ label, value, onValueChange, onCommit }: LabeledTextInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onCommit()
    }
  }
  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
```

In `SiteEditor`, add the state and commit, and render the field inside the `Stack` after the
north-bearing input:

```ts
const [timezone, setTimezone] = useState(site.timezone ?? '')
const commitTimezone = () => dispatch(setSiteTimezone(timezone))
```

```tsx
<LabeledTextInput
  label="Timezone"
  value={timezone}
  onValueChange={setTimezone}
  onCommit={commitTimezone}
/>
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run --project unit editor/metadata/site-editor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add editor/metadata/site-editor.tsx
git commit -m "feat: edit the site timezone in the site editor"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

- [ ] **Step 8: Story baseline.** If `editor/metadata/site-editor.stories.tsx` exists, the new
      field changes its rendered output. Update the story if needed and flag that its visual
      baseline re-renders on CI (story baselines render on the CI runner). Do not attempt a local
      baseline render.

### 5C: mount the site editor in the tool rail

- [ ] **Step 1: Write the failing test.** The tool rail is rendered by `EditorShell`. Add a case
      to the editor-shell test (or its rail-focused test) asserting the site editor's fields are
      present. Read the existing `editor/shell/editor-shell.test.tsx` first and match its render
      harness (it provides an `EditorSession` via the bridge providers). Minimal assertion:

```ts
it('mounts the site editor in the tool rail', () => {
  // ...render EditorShell with a session per the existing harness...
  expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument()
})
```

If the shell test harness is heavy, instead assert through the rail: confirm the `SiteEditor`
is reachable. Keep to the existing harness; do not build a new one.

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run --project unit editor/shell/editor-shell.test.tsx`
Expected: FAIL (no latitude/timezone field in the rail).

- [ ] **Step 3: Commit the test.**

```bash
git add editor/shell/editor-shell.test.tsx
git commit -m "test: mount the site editor in the tool rail"
```

- [ ] **Step 4: Implement.** In `editor/shell/editor-shell.tsx`, import `SiteEditor` and
      `SectionLabel`, then render it inside `ToolRail` after `UnderlayMenuPanel`. Add to the imports:

```ts
import { SiteEditor } from '../metadata/site-editor'
```

Ensure `SectionLabel` is imported from `../design-system` (add it to the existing design-system
import if not already present). In `ToolRail`, wrap the editor in a section so it matches the
sibling rail panels. The `project` and `session` are already in scope:

```tsx
return (
  <div className="editor-shell__rail">
    <ProjectIdentity name={project.meta.name} periodLabel={railPeriodLabel(project.meta.period)} />
    <ToolsNav />
    <EditLayerPanel />
    <OverallDimensions extent={overall} />
    <LibraryLauncherPanel />
    <UnderlayMenuPanel />
    <section className="editor-shell__rail-panel" aria-label="Site">
      <SectionLabel>Site</SectionLabel>
      <SiteEditor
        key={siteEditorKey(project.site)}
        site={project.site ?? {}}
        dispatch={session.dispatch}
      />
    </section>
  </div>
)
```

Add a small module-level helper so the editor remounts (reseeding its `useState`) when an
undo/redo changes the site. Place it beside `railPeriodLabel`:

```ts
// The SiteEditor seeds its inputs at mount, so remount it (via key) whenever the persisted
// site identity changes, for example after undo, so the fields reflect the model.
function siteEditorKey(site: Project['site']): string {
  return JSON.stringify(site ?? {})
}
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run --project unit editor/shell/editor-shell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add editor/shell/editor-shell.tsx
git commit -m "feat: mount the site editor in the tool rail (#407)"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

- [ ] **Step 8: Story baseline.** The editor-shell / home story output changes. Flag the
      baseline for CI re-render; do not render locally.

### 5D: wire the command registries into the live session (the blocker)

- [ ] **Step 1: Write the failing test.** Create `bridge/session/editor-session.test.ts` (or add
      a `describe` if it already exists). Assert a live session dispatches a `site/*` command
      without throwing and that the change is applied and undoable:

```ts
import { describe, expect, it } from 'vitest'
import { createEditorSession } from './editor-session'
import { createEmptyProject, setSiteTimezone, addEnvironmentScene } from '../../core'
import type { EnvironmentScene } from '../../core'

function newSession() {
  return createEditorSession(
    createEmptyProject({ name: 'H', units: 'metric', period: 'victorian', appVersion: '0.1.0' }),
  )
}

describe('createEditorSession command wiring', () => {
  it('dispatches a site command through the live registry', () => {
    const session = newSession()
    session.dispatch(setSiteTimezone('America/New_York'))
    expect(session.getProject().site?.timezone).toBe('America/New_York')
    session.undo()
    expect(session.getProject().site?.timezone).toBeUndefined()
  })

  it('dispatches an environment-scene command through the live registry', () => {
    const session = newSession()
    const scene: EnvironmentScene = { id: 's1', name: 'Noon', observedAt: '2026-06-21T12:00' }
    session.dispatch(addEnvironmentScene(scene))
    expect(session.getProject().environmentScenes).toEqual([scene])
  })
})
```

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: FAIL (dispatcher throws on the unregistered `site/set-timezone` and
`environment-scene/add` command types).

- [ ] **Step 3: Commit the test.**

```bash
git add bridge/session/editor-session.test.ts
git commit -m "test: dispatch site and environment-scene commands through a live session"
```

- [ ] **Step 4: Implement.** In `bridge/session/editor-session.ts`, add the two registrars to
      the `core` import and call them in `createCommandRegistry`:

```ts
import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerDimensionCommands,
  registerEnvironmentSceneCommands,
  registerFurnitureCommands,
  registerOpeningCommands,
  registerPaintCommands,
  registerProjectCommands,
  registerRoomCommands,
  registerSiteCommands,
  registerStairCommands,
  registerTransformCommands,
  registerUnderlayCommands,
  registerWallCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'
```

```ts
function createCommandRegistry(): CommandRegistry<Project> {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  registerWallCommands(registry)
  registerRoomCommands(registry)
  registerUnderlayCommands(registry)
  registerOpeningCommands(registry)
  registerFurnitureCommands(registry)
  registerDimensionCommands(registry)
  registerStairCommands(registry)
  registerTransformCommands(registry)
  registerPaintCommands(registry)
  registerSiteCommands(registry)
  registerEnvironmentSceneCommands(registry)
  return registry
}
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add bridge/session/editor-session.ts
git commit -m "feat: wire the site and environment-scene commands into the live session"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

---

## Task 6: Observation date/time scrubber (session state, readout only)

**Files:**

- Modify: `bridge/react/webgpu-scene-view.tsx`, `bridge/react/scene-nav-toolbar.tsx`,
  `bridge/react/scene-nav-toolbar.test.tsx`

**Interfaces:**

- Consumes: `ObservationInstant`, `DEFAULT_OBSERVATION_INSTANT`, `observationInstantToIso`,
  `parseObservationInstant`, `formatObservationDateTime` (Task 3).
- Produces: a per-view `useObservationDateTime` hook and an `ObservationDateTimeControl` in the
  toolbar's environment group. Does NOT feed `SceneLighting` or `LiveSceneCanvas`.

### 6A: the toolbar control and its props

- [ ] **Step 1: Write the failing test.** In `bridge/react/scene-nav-toolbar.test.tsx`, add a
      case. Read the file's existing render helper first (how it supplies the required
      `colorTemperatureK`/`onColorTemperatureChange` props) and mirror it:

```ts
it('shows the observation datetime and reports changes parsed to an instant', async () => {
  const onObservationChange = vi.fn()
  const user = userEvent.setup()
  render(
    <SceneNavToolbar
      mode="orbit"
      onModeChange={() => {}}
      onReset={() => {}}
      colorTemperatureK={6500}
      onColorTemperatureChange={() => {}}
      observationInstant={{ date: '2026-06-21', minutesSinceMidnight: 720 }}
      onObservationChange={onObservationChange}
    />,
  )

  const input = screen.getByLabelText(/observation date and time/i)
  expect(input).toHaveValue('2026-06-21T12:00')

  fireEvent.change(input, { target: { value: '2026-12-04T16:00' } })
  expect(onObservationChange).toHaveBeenCalledWith({ date: '2026-12-04', minutesSinceMidnight: 960 })
})
```

(Use whatever event utility the file already imports; `fireEvent.change` on the
`datetime-local` input is the reliable path.)

- [ ] **Step 2: Run, expect RED.**

Run: `pnpm exec vitest run --project unit bridge/react/scene-nav-toolbar.test.tsx`
Expected: FAIL (no control labeled "observation date and time").

- [ ] **Step 3: Commit the test.**

```bash
git add bridge/react/scene-nav-toolbar.test.tsx
git commit -m "test: show and change the observation date and time in the toolbar"
```

- [ ] **Step 4: Implement.** In `bridge/react/scene-nav-toolbar.tsx`, import the helpers and the
      type from core, extend the props, add the control, and place it in the environment group.

Add to the core import block at the top:

```ts
import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
  DEFAULT_OBSERVATION_INSTANT,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
} from '../../core'
import type { CameraPreset, ObservationInstant } from '../../core'
```

Extend `SceneNavToolbarProps` (optional with a default so existing callers and stories keep
compiling):

```ts
interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  observationInstant?: ObservationInstant
  onObservationChange?: (instant: ObservationInstant) => void
  selectionEnabled?: boolean
  onToggleSelection?: () => void
  revealInterior?: boolean
  onToggleRevealInterior?: () => void
  onPreset?: (preset: PresetChoice) => void
  canDoorway?: boolean
  scope?: SceneScope
  onScopeChange?: (scope: SceneScope) => void
  showUnderground?: boolean
  onToggleUnderground?: () => void
}
```

Add the control component beside `ColorTemperatureControl`:

```tsx
interface ObservationDateTimeControlProps {
  observationInstant: ObservationInstant
  onObservationChange: (instant: ObservationInstant) => void
}

/**
 * The observation date/time scrubber with a live readout. Session view state only: it
 * shows the instant and reports changes, and does not drive the lighting yet (slice 1a
 * wires it to the solar provider).
 */
function ObservationDateTimeControl({
  observationInstant,
  onObservationChange,
}: ObservationDateTimeControlProps) {
  return (
    <label className="scene-nav-toolbar__observation">
      Observation date and time
      <input
        type="datetime-local"
        value={observationInstantToIso(observationInstant)}
        aria-label="Observation date and time"
        onChange={(event) => onObservationChange(parseObservationInstant(event.target.value))}
      />
      <output className="scene-nav-toolbar__observation-readout">
        {formatObservationDateTime(observationInstant)}
      </output>
    </label>
  )
}
```

Destructure the new props (with defaults) in `SceneNavToolbar` and render the control in the
environment group:

```tsx
export function SceneNavToolbar({
  mode,
  onModeChange,
  onReset,
  colorTemperatureK,
  onColorTemperatureChange,
  observationInstant = DEFAULT_OBSERVATION_INSTANT,
  onObservationChange = () => {},
  selectionEnabled = false,
  onToggleSelection = () => {},
  revealInterior = true,
  onToggleRevealInterior = () => {},
  onPreset,
  canDoorway,
  scope = 'floor',
  onScopeChange = () => {},
  showUnderground = true,
  onToggleUnderground = () => {},
}: SceneNavToolbarProps) {
```

```tsx
<div className="scene-nav-toolbar__environment">
  <ColorTemperatureControl
    colorTemperatureK={colorTemperatureK}
    onColorTemperatureChange={onColorTemperatureChange}
  />
  <ObservationDateTimeControl
    observationInstant={observationInstant}
    onObservationChange={onObservationChange}
  />
</div>
```

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run --project unit bridge/react/scene-nav-toolbar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add bridge/react/scene-nav-toolbar.tsx
git commit -m "feat: add a readout-only observation date and time control to the toolbar"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

### 6B: hold the scrubber as per-view session state

- [ ] **Step 1: Write the failing test.** The hook is a private function in
      `webgpu-scene-view.tsx`, so cover it through the rendered view like the color-temperature
      state is covered. Read the existing `bridge/react/webgpu-scene-view.test.tsx` and add a case
      that the observation control renders with the default readout. If that view test is a heavy
      R3F render, instead assert the wiring by confirming the control's default value appears:

```ts
it('seeds the observation control at the default instant', () => {
  // ...render the view per the existing harness...
  expect(screen.getByLabelText(/observation date and time/i)).toHaveValue('2026-06-21T12:00')
})
```

If the existing view test cannot mount the toolbar cheaply, treat 6A's toolbar test as the
behavioral gate and make this step a `feat`-only wiring change verified by the full gate plus a
targeted render. Note which path you took in the commit body.

- [ ] **Step 2: Run, expect RED** (control absent from the view until wired).

Run: `pnpm exec vitest run --project unit bridge/react/webgpu-scene-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Commit the test.**

```bash
git add bridge/react/webgpu-scene-view.test.tsx
git commit -m "test: seed the observation scrubber in the scene view"
```

- [ ] **Step 4: Implement.** In `bridge/react/webgpu-scene-view.tsx`, add the hook beside
      `useColorTemperature` and wire it into `WebGPUSceneView`. Add imports:

```ts
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  DEFAULT_OBSERVATION_INSTANT,
  type Bounds3,
  type CameraPose,
  type ObservationInstant,
  type OpeningSceneNode,
  type Point,
  type SceneGraph,
} from '../../core'
```

Add the hook after `useColorTemperature`:

```ts
// Per-view observation date/time session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the toolbar readout and, once wired in
// slice 1a, the solar lighting. Slice 0 does not drive lighting from it.
function useObservationDateTime() {
  const [observationInstant, setObservationInstant] = useState<ObservationInstant>(
    DEFAULT_OBSERVATION_INSTANT,
  )
  return { observationInstant, setObservationInstant }
}
```

Consume it beside the color-temperature hook and pass it to the toolbar:

```ts
const { colorTemperatureK, setColorTemperatureK } = useColorTemperature()
const { observationInstant, setObservationInstant } = useObservationDateTime()
```

```tsx
colorTemperatureK = { colorTemperatureK }
onColorTemperatureChange = { setColorTemperatureK }
observationInstant = { observationInstant }
onObservationChange = { setObservationInstant }
```

Do NOT thread `observationInstant` into `SceneLighting` or `LiveSceneCanvas`; the
does-not-drive-lighting boundary is the point of this slice.

- [ ] **Step 5: Run, expect GREEN.**

Run: `pnpm exec vitest run --project unit bridge/react/webgpu-scene-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full gate; commit.**

```bash
git add bridge/react/webgpu-scene-view.tsx
git commit -m "feat: hold the observation date and time as per-view session state"
```

- [ ] **Step 7: BLUE.** `/clean-code-review` then `/refactor`; land or empty marker.

- [ ] **Step 8: Scene visual baseline.** The toolbar's environment group gains a control, so any
      scene story that shows the toolbar changes. Flag the baseline for CI re-render; do not render
      locally.

---

## Task 7: Knowledge, ADR-0141

- [ ] **Step 1: Write ADR-0141** (`/adr environment-foundations "Environment model foundations"`).
      Record: the `EnvironmentState`/observation-time ownership split (timezone on `Site`,
      observation instant in session state and `EnvironmentScene.observedAt` as an ISO string), the
      environment-scene persistence and its required-array shape, schema versions 14 and 15, and
      that this extends ADR-0067 (material provider seam) and ADR-0130 (finishes) only by reference
      for later slices. State the deviation from the investigator note that folded timezone into
      `ObservationInstant`, with the "when versus where" rationale. Run the `humanizer` skill.
      Commit `docs: add ADR-0141 for the environment model foundations`.

- [ ] **Step 2: Regenerate the local knowledge index** (optional, gitignored):
      `pnpm knowledge:index`.

---

## After the plan is executed

- **Deferred CI baselines:** the neutral color-check swatch (1B), the site-editor story (5B/5C),
  and the scene toolbar story (6) all need baselines rendered on the CI runner (`run:visual`
  label / `refresh-story-baselines.yml`). This is local-only work; hand these off.
- **GitHub issues (draft, do not run this session):** file the epic and slice issues for the
  owner. Epic and spine slices on the `public-beta` milestone, later layers on `1.0`, label
  `area:3d-preview`; link #86, #407 (closed by Task 5), #378/#379, #88, #83, and the
  ground/grade issues #207/#409/#413.
- **Reviews before landing:** run `/clean-code-review` and `/review` across the branch (parallel
  or background RGB skips independent review) and surface any ADR-undocumented deviation for
  sign-off. File a tracking issue for every deferred slice.

---

## Self-review

**Spec coverage (slice-0 acceptance bullets):**

- "A deterministic test renders a known sRGB albedo swatch and asserts the output pixel matches
  within tolerance" -> Task 1B (scene-webgl acceptance; baseline on CI) plus the Task 1A unit
  assertions on the renderer's color-management properties.
- "The version 13 to version 14 migration round-trips a document with no timezone and one with
  a timezone, losing no data" -> Task 2A (passthrough migration test).
- "ObservationInstant helpers are unit-tested" -> Task 3A.
- "Environment scenes survive a save and load and undo correctly" -> Task 4A (persistence,
  migration, factory init, serialization is automatic per `project-json.ts`) and Task 4B (undo
  through dispatch).
- "The site editor is mounted and edits latitude, longitude, north bearing, and timezone" ->
  Task 5B (timezone field), Task 5C (mount), plus the existing latitude/longitude/north-bearing
  fields; Task 5D wires the registry so the edits actually apply at runtime (#407 blocker).
- Slice-0 change "session-state date and time scrubber that shows a readout and does not yet
  drive the lighting" -> Task 6 (control + hook, explicitly not threaded into lighting).
- ADR requirement ("a new record captures the EnvironmentState contract ... and schema version
  14"; tone-mapping supersedes/extends ADR-0065 and ADR-0079) -> ADR-0140 (Task 1C), ADR-0141
  (Task 7).

**Placeholder scan:** every code step carries complete code. The two intentionally soft spots
are honestly flagged, not hidden: the renderer unit test self-skips without a WebGL2 backend
(the byte-exact gate is the CI scene-webgl tier), and the two view-level UI tests (5C, 6B)
defer to the existing render harness, whose exact shape the executing agent must read before
matching. Neither is a "TODO"; both name the concrete fallback gate.

**Type consistency:** `ObservationInstant` is `{ date: string; minutesSinceMidnight: number }`
everywhere (Task 3 defines it; Tasks 6A/6B consume it). `EnvironmentScene.observedAt` is a
`string` (ISO civil datetime) in the model (Task 4A), the commands (Task 4B), and the tests;
the structured form is only `ObservationInstant`, never stored. `CURRENT_SCHEMA_VERSION` moves
13 -> 14 (Task 2) -> 15 (Task 4), with the guard test edited in lockstep in each task.
`registerEnvironmentSceneCommands` and `registerSiteCommands` are the exact names wired in Task
5D. `setSiteTimezone`/`SET_SITE_TIMEZONE`/`SetSiteTimezoneParams`, and the environment-scene
`add`/`remove`/`rename` creators, match between their defining task, their exports in
`core/index.ts`, and their consuming tests.
