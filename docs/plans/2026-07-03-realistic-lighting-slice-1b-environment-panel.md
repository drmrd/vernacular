# Realistic Environmental Lighting, Slice 1b (Environment Panel) Implementation Plan

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author, commits
> `test:`), `/implement` (implementer, commits `feat:`), `/clean-code-review`, `/refactor`
> (commits `refactor:`, possibly an empty marker). Do NOT use the generic subagent-driven harness.
> One behavior equals one full test -> feat -> refactor cycle; close every GREEN with a BLUE.
> Source current-state facts from the MERGED slice-1a code, not from the older plans' predictions:
> read `bridge/react/scene-lighting.tsx`, `bridge/react/webgpu-scene-view.tsx`,
> `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/environment-controls.tsx`,
> `bridge/react/scene-display-options.tsx`, `bridge/react/use-project-site.ts`,
> `editor/shell/editor-shell.tsx`, `editor/metadata/site-editor.tsx`, `core/environment/*`,
> `core/commands/handlers/environment-scene-commands.ts`, `app/harness-environment.ts`, and the
> "Slice 1b" acceptance in `docs/specs/2026-07-01-realistic-environmental-lighting.md`, plus
> ADR-0142, ADR-0143, and ADR-0144.

**Goal:** Give the realistic-lighting inputs a user-facing home: an Environment panel in the
editor exposing the Schematic/Realistic mode toggle, a site-location readout with the
missing-location fallback explanation, the observation date/time scrubber, a cloud-cover dial
that finally feeds the slice-1a sky model, the neutral color-check toggle, and save/recall of the
named environment scenes persisted by slice 0. All controls write one pure value object,
`EnvironmentState`, through shared session state; scene save/recall flows through `dispatch`.

**Architecture:** Slice 1a left the provider swap and the solar update in
`bridge/react/scene-lighting.tsx`, keyed on per-view `useState` inside `WebGPUSceneView`, with a
stopgap toggle in the scene toolbar's display options and the readout scrubber in the toolbar's
environment group. Slice 1b moves the environment session state into a bridge-owned external
store (mirroring `createSurfaceSelectionStore` / `SurfaceSelectionProvider`), so the editor-layer
panel in the tool rail and the bridge scene view read and write the same `EnvironmentState`. The
core type `EnvironmentState` (mode, observation instant, cloud cover, color check) is the
panel-to-provider contract the spec named and the slice-1a plan reserved; location and timezone
are NOT duplicated into it, they stay on `Site` and the bridge composes the two when computing
`EnvironmentLighting`, exactly as `useSolarLightingUpdate` does today. Cloud cover replaces the
pinned `DEFAULT_CLOUD_COVER`, and a pure-core color-check helper neutralizes the sun and sky
tints so the render shows the white-balanced reference. No geometry path changes: the provider
swap stays where slice 1a put it, on the persistent render scene.

**Tech Stack:** TypeScript, React, Three.js r184 WebGPU (lazy, engine-only), Vitest (unit +
storybook projects), Storybook stories with play functions, Playwright (scene-webgl visual tier,
CI-only baselines; DOM-level journeys locally).

## Global Constraints

- core/ imports no React/Three.js; engine/ is the only Three.js importer; editor/ never imports
  Three.js and reaches the session only through bridge hooks and `dispatch`. All model mutations
  flow through `dispatch(command)`; handlers reassign whole top-level project slices.
- Session state (the environment state, like camera and color temperature) stays out of the
  model and out of undo (spec locked decision 3; ADR-0065 precedent).
- Schema JSON is GENERATED. `pnpm schema:generate` emits `schema/<N>/vernacular.schema.json`;
  `pnpm schema:check` and `tests/format/schema-drift.test.ts` gate drift. Existing `schema/<N>/`
  directories stay byte-for-byte immutable.
- ESLint zero-problems gate (warnings count): max-lines-per-function 40, max-lines 300 (counted
  skipping blanks/comments), max-params 3, complexity 10, no-nested-ternary, no-magic-numbers
  (free: -1, 0, 1, 2, 100; otherwise name a `const`). Test/story files relax no-magic-numbers
  and max-lines-per-function (120).
- Story-coverage guardrail (`scripts/story-coverage`): every new `.tsx` exporting a PascalCase
  component needs a co-located `<name>.stories.tsx` (ADR-0111). Story and scene visual baselines
  render only on the CI runner (`run:visual` label); never attempt a local baseline.
- Vitest filter: `pnpm exec vitest run <path>` (never `pnpm test -- <x>`). Full gate:
  `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, verifying each
  command's own exit code (no piped tail).
- Conventional Commits; NO Co-Authored-By, NO Claude-Session trailer, NO em-dash in newly
  composed text (prose or code comments). Author
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- Branch `feat/realistic-lighting-slice-1b-environment-panel` off `main` (slice 1a is merged;
  main carries `SolarLightingProvider`, `EnvironmentLighting`, `utcOffsetMinutesFor`, and the
  schema-15 environment scenes).
- Slice 1b adds NO dependencies.

## Locked decisions

These resolve the open forks so the tasks stay type-consistent. Deviations discovered during
execution go through ADR-0146 (Task 12), not silent drift.

1. **The Environment panel lives in the tool rail (editor layer), not the scene toolbar.** It is
   a labeled rail section directly after Site, implemented in `editor/environment/`. Three
   reasons. First, the spec's layering contract assigns the panel to `editor/` ("editor/ holds
   the Environment panel"), and the scene toolbar is bridge-layer, which cannot import the
   design system (the constraint `editor/shell/scene-pane.tsx` documents). Second, shell
   precedent: the rail hosts named, structured panels (Library, Underlay, Site) while the
   toolbar is a one-row strip of per-view quick toggles already at its density limit, and this
   panel needs vertical layout for six controls plus a scenes list plus a fallback notice.
   Third, the rail is visible in every view mode including split, so the panel drives the 3D
   pane live while both are on screen, and it sits beside the SiteEditor that the
   missing-location path points at.
2. **Environment session state moves to a bridge-owned external store.** The panel and the
   scene view live in different React subtrees, so the per-view `useState` in `WebGPUSceneView`
   cannot serve both. `createEnvironmentSessionStore()` plus `EnvironmentSessionProvider` and a
   `useEnvironmentSession()` hook mirror the surface-selection store idiom; `EditorShell` mounts
   the provider once. "Per-view" today means the one 3D preview pane; the store moves per-pane
   if multiple panes ever exist (record in ADR-0146). The state never touches the model or undo.
3. **`EnvironmentState` is the pure-core panel-level value object**: `{ mode, observedAt,
cloudCover, colorCheck }`. This is the name the slice-1a plan reserved for the panel-level
   session contract. Location and timezone are read live from `Site` (the spec's own wording:
   "the resolved location ... read from Site") and composed with the state in the bridge, so the
   persisted "where" cannot drift from a session copy. Color temperature stays OUTSIDE the
   contract: it is the schematic rig's tint (ADR-0065) and remains view-local state.
4. **Single home for the realistic controls; the toolbar slims to schematic-only.** The
   observation scrubber (slice 0) and the display-options "Realistic lighting" button (slice
   1a's stopgap) move into the panel. The toolbar keeps the color-temperature slider; display
   options returns to view-styling toggles (surface edges). No control is duplicated in two
   places. Toolbar unit tests change in lockstep; affected story and scene baselines re-render
   on CI.
5. **Environment-scene save/recall ships in this slice, minimally.** The spec's slice-1b change
   list says the controls write "through session state and dispatch", and dispatch has meaning
   for this panel only through the slice-0 environment-scene commands; locked decision 3 of the
   spec gives the scenes their purpose (checking a paint across saved conditions) and no other
   spine slice owns their UI, so without this the commands ship dead through the whole spine.
   Scope: save the current conditions under a typed name, apply a saved scene, remove one.
   Rename stays command-only for now (file a tracking issue; see After the plan is executed).
   Applying a scene sets `observedAt` and `cloudCover` and leaves `mode` and `colorCheck` alone,
   because a scene persists exactly a "when and weather" (`observedAt` + `weather`), not a mode.
6. **`WeatherConditions` gains an optional numeric `cloudCover` (0..1) at schema version 16.**
   The dial's value must round-trip through saved scenes, and the free-text `summary` cannot
   carry a number cleanly. `WeatherConditions` is `additionalProperties: false`, so the new
   optional field needs a schema bump with a passthrough migration, mirroring
   `add-site-timezone` (v13 -> v14). `summary` stays for human labels.
7. **The color-check contract neutralizes tint, not geometry.** A pure-core helper replaces the
   computed sun and sky colors with `NEUTRAL_REFERENCE_WHITE` while keeping the sun direction
   and the `sunUp` flag, so shadows still read while every surface is lit white-balanced. In
   schematic mode the same flag pins the rig tint to the same white instead of
   `kelvinToLinearRgb(colorTemperatureK)`. One boolean, one meaning in both modes. The visual
   acceptance is a new canonical harness state with a CI baseline.

## File Structure

Created (pure core, unit-testable, no GPU):

- `core/environment/environment-state.ts` : `LightingMode`, `EnvironmentState`,
  `DEFAULT_ENVIRONMENT_STATE`, `captureEnvironmentScene`, `applyEnvironmentScene`.
- `core/environment/environment-state.test.ts`
- `core/environment/color-check.ts` : `NEUTRAL_REFERENCE_WHITE`, `colorCheckLighting`.
- `core/environment/color-check.test.ts`
- `core/migrations/schema/add-weather-cloud-cover.ts` : v15 -> v16 passthrough migration.
- `core/migrations/schema/add-weather-cloud-cover.test.ts`
- `schema/16/vernacular.schema.json` : generated, committed.

Created (bridge):

- `bridge/environment/environment-session-store.ts` : the external store.
- `bridge/environment/environment-session-store.test.ts`
- `bridge/react/environment-session-context.ts` : context + `useEnvironmentSessionStore` +
  `useEnvironmentSession`.
- `bridge/react/environment-session-context.test.tsx`
- `bridge/react/environment-session-provider.tsx` : the provider component.
- `bridge/react/use-project-environment-scenes.ts` : `useProjectEnvironmentScenes()`.

Created (editor):

- `editor/environment/environment-panel.tsx` + `.test.tsx` + `.stories.tsx`
- `editor/environment/environment-scenes.tsx` + `.test.tsx` + `.stories.tsx`

Created (acceptance):

- `e2e/tests/environment-panel.spec.ts` : DOM-level journey (no GPU needed; the rail renders in
  every view mode).

Modified:

- `core/model/environment-scene.ts` : `cloudCover?: number` on `WeatherConditions`.
- `core/model/factories.ts` : `CURRENT_SCHEMA_VERSION` 15 -> 16 + changelog comment.
- `core/model/factories.test.ts` : version guard 15 -> 16.
- `core/migrations/schema/index.ts` : register the new migration.
- `core/index.ts` : export the new environment-state and color-check names.
- `bridge/index.ts` : export the store, provider, and hooks.
- `bridge/react/scene-lighting.tsx` : `cloudCover` and `colorCheck` props; schematic white
  override; comment updates (the pinned-clear-sky and missing-location notes are stale after
  this slice).
- `bridge/react/webgpu-scene-view.tsx` : consume the shared session; drop the local
  mode/observation state; keep view-local color temperature.
- `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/environment-controls.tsx`,
  `bridge/react/scene-display-options.tsx`, `bridge/react/scene-nav-toolbar.test.tsx` :
  toolbar slimming (locked decision 4).
- `bridge/react/scene-harness-view.tsx` : `HarnessEnvironment` passthrough for `cloudCover` and
  `colorCheck`.
- `app/harness-environment.ts` + `app/harness-environment.test.ts` : `color-check` and
  `overcast-noon` canonical states.
- `e2e/tests/scene-solar.spec.ts` : two new baseline captures.
- `editor/shell/editor-shell.tsx` : mount the provider and the rail section. If the added lines
  tip the file over max-lines, extract `ToolRail` to `editor/shell/tool-rail.tsx` as part of the
  BLUE step rather than restructuring up front.
- `core/environment/sky-model.ts` : retire the stale "until weather lands" wording on
  `DEFAULT_CLOUD_COVER` (the constant remains as the absent-weather default).
- `docs/knowledge/decisions/ADR-0146-environment-panel-and-session-contract.md` (new; confirm
  the next free number first; 0145 is the highest on origin/main at the time of writing).

---

## Task 1: `WeatherConditions.cloudCover` and schema version 16 (core)

**Files:** Create `core/migrations/schema/add-weather-cloud-cover.ts` + test. Modify
`core/model/environment-scene.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`,
`core/migrations/schema/index.ts`. Generate `schema/16/vernacular.schema.json`.

**Interfaces:**

- Produces: `WeatherConditions.cloudCover?: number` (0 clear .. 1 overcast),
  `CURRENT_SCHEMA_VERSION === 16`, `addWeatherCloudCoverMigration: SchemaMigration` with
  `from: 15`. Consumed by Task 2's conversions and Task 10's saved scenes.

**Steps:**

- [ ] **Step 1: Write the failing tests.** Create `add-weather-cloud-cover.test.ts` copying the
      `add-site-timezone.test.ts` structure shifted to version 15: `from` is 15; a version-15
      document with a scene whose weather has no `cloudCover` migrates unchanged (optional field,
      no backfill); a scene already carrying `weather.cloudCover` is preserved; the migration does
      not set `meta.schemaVersion` itself. Bump the guard in `core/model/factories.test.ts` to
      `is 16`.
- [ ] **Step 2: Run, expect RED.**
      `pnpm exec vitest run core/migrations/schema/add-weather-cloud-cover.test.ts core/model/factories.test.ts`
- [ ] **Step 3: Commit** `test: cover the weather cloud-cover field and its version-16 migration`
- [ ] **Step 4: Implement.** Add to `WeatherConditions` in `core/model/environment-scene.ts`:

```ts
  /** Cloud-cover fraction, 0 (clear) to 1 (fully overcast). Absent means unspecified. */
  cloudCover?: number
```

Create the passthrough migration (mirror `add-site-timezone.ts`, `from: 15`, returns the
project unchanged, doc comment explaining an optional field needs no backfill and that the
orchestrator advances `meta.schemaVersion`). Register it at the end of `SCHEMA_MIGRATIONS` in
`core/migrations/schema/index.ts`. In `core/model/factories.ts` set
`CURRENT_SCHEMA_VERSION = 16` and extend the changelog comment
(`// v16 adds an optional WeatherConditions.cloudCover field (a passthrough migration).`).

- [ ] **Step 5: Regenerate the schema.** `pnpm schema:generate` writes `schema/16/`; confirm
      `git status --short schema/` shows ONLY the new directory.
- [ ] **Step 6: Run the tests and drift gates, expect GREEN.** Add
      `pnpm exec vitest run tests/format/schema-drift.test.ts && pnpm schema:check`.
- [ ] **Step 7: Full gate; commit** (include `schema/16`)
      `feat: add an optional weather cloud-cover field at schema version 16`
- [ ] **Step 8: BLUE** (`/clean-code-review` then `/refactor`; land or empty marker).

---

## Task 2: `EnvironmentState` value object and scene conversions (core)

**Files:** Create `core/environment/environment-state.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes: `ObservationInstant`, `DEFAULT_OBSERVATION_INSTANT`, `observationInstantToIso`,
  `parseObservationInstant`, `DEFAULT_CLOUD_COVER`, `EnvironmentScene` (Task 1's field).
- Produces:

```ts
export type LightingMode = 'schematic' | 'realistic'
/**
 * The panel-level session contract (spec: Architecture): everything the Environment
 * panel owns. Location and timezone stay on Site; the bridge composes the two.
 */
export interface EnvironmentState {
  readonly mode: LightingMode
  readonly observedAt: ObservationInstant
  readonly cloudCover: number // 0 clear .. 1 overcast
  readonly colorCheck: boolean
}
export const DEFAULT_ENVIRONMENT_STATE: EnvironmentState
// { mode: 'schematic', observedAt: DEFAULT_OBSERVATION_INSTANT,
//   cloudCover: DEFAULT_CLOUD_COVER, colorCheck: false }
export interface EnvironmentSceneIdentity {
  id: string
  name: string
}
/** Persists the current "when and weather" as a named scene (observedAt ISO + weather). */
export function captureEnvironmentScene(
  state: EnvironmentState,
  identity: EnvironmentSceneIdentity,
): EnvironmentScene
/** Recalls a scene's when-and-weather into the state; mode and colorCheck are untouched. */
export function applyEnvironmentScene(
  state: EnvironmentState,
  scene: EnvironmentScene,
): EnvironmentState
```

**Steps:**

- [ ] **Step 1: Write the failing test.** Assert the default state's four fields;
      `captureEnvironmentScene` serializes `observedAt` through `observationInstantToIso` and
      writes `weather.cloudCover`; `applyEnvironmentScene` parses `observedAt` back, reads
      `weather.cloudCover`, falls back to `DEFAULT_CLOUD_COVER` when `weather` is absent, and
      preserves the incoming `mode` and `colorCheck`; a capture-then-apply round-trip reproduces
      the original `observedAt` and `cloudCover`.
- [ ] **Step 2: Run, expect RED.**
      `pnpm exec vitest run core/environment/environment-state.test.ts`
- [ ] **Step 3: Commit** `test: cover the environment-state value object and its scene round-trip`
- [ ] **Step 4: Implement** the type, the default, and the two small pure functions. Export the
      names from `core/index.ts` beside the other `environment/` exports.
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: add the pure-core environment-state value object`
- [ ] **Step 8: BLUE.**

---

## Task 3: Neutral color-check lighting helper (core)

**Files:** Create `core/environment/color-check.ts` + test. Modify `core/index.ts`.

**Interfaces:**

- Consumes: `EnvironmentLighting`, `LinearRgb`.
- Produces:

```ts
/** The white-balanced reference tint the color check renders under (linear-light sRGB). */
export const NEUTRAL_REFERENCE_WHITE: LinearRgb // { r: 1, g: 1, b: 1 }
/** Neutralizes the sun and sky tints; direction and sunUp pass through untouched. */
export function colorCheckLighting(lighting: EnvironmentLighting): EnvironmentLighting
```

**Steps:**

- [ ] **Step 1: Write the failing test.** Feed a fabricated `EnvironmentLighting` (tinted colors,
      a known direction, `sunUp: true`) and assert both output colors equal
      `NEUTRAL_REFERENCE_WHITE`, the direction is unchanged, and `sunUp` passes through (also with
      `sunUp: false`).
- [ ] **Step 2: Run, expect RED. Step 3: Commit**
      `test: neutralize the sun and sky tints for the color check`
- [ ] **Step 4: Implement** (a spread replacing the two colors). Export from `core/index.ts`.
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: add the neutral color-check lighting helper`
- [ ] **Step 8: BLUE.**

---

## Task 4: Environment session store, provider, and hooks (bridge)

**Files:** Create `bridge/environment/environment-session-store.ts` + test,
`bridge/react/environment-session-context.ts` + test,
`bridge/react/environment-session-provider.tsx`. Modify `bridge/index.ts`.

**Interfaces:**

- Consumes: `EnvironmentState`, `DEFAULT_ENVIRONMENT_STATE` (Task 2).
- Produces (mirror the `surface-selection-store` / `SurfaceSelectionProvider` idiom exactly:
  external store, `createContext<Store | null>`, hook that throws without a provider,
  `useSyncExternalStore` for the value):

```ts
export interface EnvironmentSessionStore {
  subscribe(listener: () => void): () => void
  getEnvironment(): EnvironmentState
  setEnvironment(next: EnvironmentState): void
}
export function createEnvironmentSessionStore(): EnvironmentSessionStore // seeds the default
export function useEnvironmentSessionStore(): EnvironmentSessionStore
export function useEnvironmentSession(): {
  environment: EnvironmentState
  setEnvironment: (next: EnvironmentState) => void
}
export function EnvironmentSessionProvider(props: {
  store: EnvironmentSessionStore
  children: ReactNode
}): ReactElement
```

**Steps:**

- [ ] **Step 1: Write the failing tests.** Store test: `getEnvironment()` starts at
      `DEFAULT_ENVIRONMENT_STATE`; `setEnvironment` replaces the value and notifies subscribers;
      unsubscribe stops notifications. Context test (mirror
      `surface-selection-context.test.tsx`): a probe component under the provider reads the
      default and re-renders on `setEnvironment`; the hook throws a descriptive error outside a
      provider.
- [ ] **Step 2: Run, expect RED. Step 3: Commit**
      `test: cover the shared environment session store and hook`
- [ ] **Step 4: Implement** the store (plain closure over a value + listener set), the context,
      the provider, and the `bridge/index.ts` exports.
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: add the bridge-owned environment session store and provider`
- [ ] **Step 8: BLUE.**

---

## Task 5: Thread the shared session through the scene lighting and the shell (bridge)

**Files:** Modify `bridge/react/scene-lighting.tsx`, `bridge/react/webgpu-scene-view.tsx`,
`editor/shell/editor-shell.tsx`, `core/environment/sky-model.ts` (comment only).

Two behaviors. Both are R3F/shell wiring with no jsdom render harness, the same coverage
boundary slice 1a hit in its Task 8: the pure logic is core-tested (Tasks 2 and 3) and the
visual truth is the CI scene-webgl tier (Task 11). Land each as a feat-only commit whose body
names that boundary, and still close each with a BLUE.

**Steps (behavior 5a: cloud cover and color check reach the provider):**

- [ ] Extend `SceneLightingProps` with `cloudCover?: number | undefined` (default
      `DEFAULT_CLOUD_COVER`) and `colorCheck?: boolean | undefined` (default `false`), keeping the
      exactOptionalPropertyTypes-friendly `| undefined` style the file already uses. In
      `useSolarLightingUpdate`, take both through the input object, pass `cloudCover` to
      `computeEnvironmentLighting`, and hand the provider
      `colorCheck ? colorCheckLighting(lighting) : lighting`. In the schematic branch of
      `SceneLighting`, tint with
      `colorCheck ? NEUTRAL_REFERENCE_WHITE : kelvinToLinearRgb(colorTemperatureK)`. Update the
      now-stale comments: the `useSolarLightingUpdate` doc ("the slice-1b weather layer owns cloud
      cover") and the `DEFAULT_CLOUD_COVER` doc in `core/environment/sky-model.ts` (the constant
      becomes the absent-weather default, not a placeholder).
- [ ] Full gate; commit `feat: thread cloud cover and the color check through the scene lighting`
      (body: coverage boundary note; the visual gate is Task 11's baselines). **BLUE.**

**Steps (behavior 5b: one session, two subtrees):**

- [ ] In `editor/shell/editor-shell.tsx`, create the store once
      (`useMemo(() => createEnvironmentSessionStore(), [])`, beside the surface-selection store)
      and wrap the `AppFrame` subtree in `EnvironmentSessionProvider` (inside
      `SurfaceSelectionProvider`, so both the rail and the viewport see it).
- [ ] In `bridge/react/webgpu-scene-view.tsx`, delete the local `useObservationDateTime` and
      `useRealisticLighting` hooks and rework the grouped `useEnvironmentSession` local hook: the
      shared `environment` comes from the context hook, color temperature stays view-local
      (`useColorTemperature`). Feed `SceneLighting` with
      `realistic={environment.mode === 'realistic'}`, `observedAt={environment.observedAt}`,
      `cloudCover={environment.cloudCover}`, `colorCheck={environment.colorCheck}`. Until Task 6
      lands, keep the toolbar props compiling by passing the context values where the old local
      state went; Task 6 then removes those props entirely.
- [ ] Full gate; commit
      `feat: share the environment session between the tool rail and the scene view` (body:
      coverage boundary note; behavior is gated by the panel tests, the e2e journey, and the CI
      visual tier). **BLUE.**

---

## Task 6: Slim the scene toolbar to schematic-only controls (bridge)

**Files:** Modify `bridge/react/scene-nav-toolbar.tsx`, `bridge/react/scene-nav-toolbar.test.tsx`,
`bridge/react/environment-controls.tsx`, `bridge/react/scene-display-options.tsx`,
`bridge/react/webgpu-scene-view.tsx`.

**Steps:**

- [ ] **Step 1: Write the failing test.** In `scene-nav-toolbar.test.tsx`, replace the
      observation-scrubber and realistic-toggle cases: the toolbar renders NO control named
      /observation date and time/i and NO button named /realistic lighting/i
      (`queryBy... toBeNull`), still renders the color-temperature slider, and the display-options
      group holds only the surface-edges toggle. Read the file's existing render helper first and
      keep its prop conventions.
- [ ] **Step 2: Run, expect RED.**
      `pnpm exec vitest run --project unit bridge/react/scene-nav-toolbar.test.tsx`
- [ ] **Step 3: Commit** `test: keep the scene toolbar to schematic-only environment controls`
- [ ] **Step 4: Implement.** Drop `ObservationDateTimeControl` and the observation props from
      `environment-controls.tsx` (keep the exported `EnvironmentControls` group holding the
      color-temperature slider; its accessible names must not change, the scene e2e resolves the
      slider by name). Drop the realistic button and props from `scene-display-options.tsx`
      (restore its doc comment to the edge-overlay-only story). Drop
      `observationInstant` / `onObservationChange` / `realisticLighting` /
      `onToggleRealisticLighting` from `SceneNavToolbarProps` and the pass-throughs in
      `webgpu-scene-view.tsx`'s `SceneViewToolbar`.
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: move the realistic lighting controls out of the scene toolbar`
- [ ] **Step 8: BLUE.** Flag that toolbar-showing story/scene baselines re-render on CI.

---

## Task 7: Environment panel: mode toggle, location readout, missing-location notice (editor)

**Files:** Create `editor/environment/environment-panel.tsx` + `.test.tsx` + `.stories.tsx`.
Modify `editor/shell/editor-shell.tsx`, `editor/shell/editor-shell.test.tsx` (mirror the
site-editor mount case), `bridge/react/scene-lighting.tsx` (comment only).

**Interfaces:**

- Consumes: `EnvironmentState`, `LightingMode` (Task 2), `Site` (core). The panel is a pure
  controlled component, like `SiteEditor`: the rail wires the hooks, so tests and stories need
  no providers.
- Produces:

```ts
export interface EnvironmentPanelProps {
  site: Site | undefined
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
}
export function EnvironmentPanel(props: EnvironmentPanelProps): ReactElement
```

Rendered content for this task: a segmented Schematic/Realistic toggle (role group named
"Lighting mode", two buttons with `aria-pressed`, mirroring the toolbar's `ModeToggle` idiom);
a location readout (latitude, longitude, and timezone from `site`, or "Location: not set");
and, only when `environment.mode === 'realistic'` and `site?.latLong === undefined`, the
fallback notice with this exact copy: "Realistic lighting needs the site location. Set latitude
and longitude in the Site panel; until then the view falls back to schematic lighting." Keep
every subcomponent under the 40-line function limit.

**Steps:**

- [ ] **Step 1: Write the failing test.** Cases: clicking "Realistic" calls
      `onEnvironmentChange` with `mode: 'realistic'` (rest of the state preserved); with a site
      carrying `latLong` and `timezone` the readout shows the coordinates and zone and no notice;
      with `mode: 'realistic'` and no `latLong` the notice text is visible; with
      `mode: 'schematic'` and no `latLong` it is not. Follow the `site-editor.test.tsx` setup
      (`userEvent.setup()`, `dispatch`-style `vi.fn()`).
- [ ] **Step 2: Run, expect RED.**
      `pnpm exec vitest run --project unit editor/environment/environment-panel.test.tsx`
- [ ] **Step 3: Commit**
      `test: toggle the lighting mode and surface the missing-location notice`
- [ ] **Step 4: Implement** the component plus `environment-panel.stories.tsx` (mirror
      `site-editor.stories.tsx`: `fn()` args, a play function that presses Realistic and asserts
      the callback; the story-coverage guardrail requires the story in the same commit).
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: add the environment panel with mode, location readout, and fallback notice`
- [ ] **Step 8: BLUE.**

**Steps (behavior 7b: mount in the tool rail):**

- [ ] **Step 1: Write the failing test.** In the editor-shell test, mirror the existing
      site-editor mount case: the rail renders a section named "Environment" with the
      Schematic/Realistic buttons present.
- [ ] **Steps 2-3: RED, commit** `test: mount the environment panel in the tool rail`
- [ ] **Step 4: Implement.** In `ToolRail`, read `useEnvironmentSession()` and render, directly
      after the Site section:

```tsx
<section aria-label="Environment">
  <SectionLabel>Environment</SectionLabel>
  <EnvironmentPanel
    site={project.site}
    environment={environment}
    onEnvironmentChange={setEnvironment}
  />
</section>
```

Update the stale forward reference in `bridge/react/scene-lighting.tsx` (the ADR-0144
missing-location comment now points at `editor/environment/environment-panel.tsx`). If
`editor-shell.tsx` trips max-lines, extract `ToolRail` to `editor/shell/tool-rail.tsx` in BLUE.

- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: mount the environment panel in the tool rail`
- [ ] **Step 8: BLUE.** Flag shell-level visual baselines for CI re-render.

---

## Task 8: Panel scrubber and cloud-cover dial (editor)

**Files:** Modify `editor/environment/environment-panel.tsx` + `.test.tsx` (+ story play if it
asserts control presence).

**Steps:**

- [ ] **Step 1: Write the failing test.** The panel renders a `datetime-local` input named
      /observation date and time/i seeded from `observationInstantToIso(environment.observedAt)`;
      a `fireEvent.change` to `2026-12-04T16:00` calls `onEnvironmentChange` with
      `observedAt: { date: '2026-12-04', minutesSinceMidnight: 960 }` and everything else
      preserved. A range input named /cloud cover/i (min 0, max 1) seeded from
      `environment.cloudCover`; changing it to `0.6` reports `cloudCover: 0.6`; a readout shows
      the percentage (`60%`).
- [ ] **Steps 2-3: RED, commit**
      `test: scrub the observation time and cloud cover from the environment panel`
- [ ] **Step 4: Implement.** Reuse the observation control markup that Task 6 removed from the
      toolbar (label + `datetime-local` + `formatObservationDateTime` readout), now writing
      through `onEnvironmentChange({ ...environment, observedAt: parseObservationInstant(v) })`.
      The dial is a range input (name the step and percent constants; `aria-valuetext` with the
      percentage) writing `cloudCover`.
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: scrub the observation time and cloud cover from the environment panel`
- [ ] **Step 8: BLUE.**

---

## Task 9: Panel color-check toggle (editor)

**Files:** Modify `editor/environment/environment-panel.tsx` + `.test.tsx`.

**Steps:**

- [ ] **Step 1: Write the failing test.** A button named /color check/i with
      `aria-pressed={environment.colorCheck}`; clicking it reports the flipped `colorCheck` with
      the rest of the state preserved.
- [ ] **Steps 2-3: RED, commit**
      `test: toggle the neutral color check from the environment panel`
- [ ] **Step 4: Implement** (mirror the toolbar's `ToolbarToggle` pressed-button idiom; a short
      caption noting it renders the white-balanced reference).
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: add the color-check toggle to the environment panel`
- [ ] **Step 8: BLUE.**

---

## Task 10: Saved environment scenes (bridge hook + editor section)

**Files:** Create `bridge/react/use-project-environment-scenes.ts`,
`editor/environment/environment-scenes.tsx` + `.test.tsx` + `.stories.tsx`. Modify
`bridge/index.ts`, `editor/shell/editor-shell.tsx` (rail wiring).

**Interfaces:**

- Consumes: `EnvironmentScene`, `addEnvironmentScene`, `removeEnvironmentScene`,
  `captureEnvironmentScene`, `applyEnvironmentScene`, `Command` (core); `useEditorSession`
  (bridge).
- Produces:

```ts
// bridge: a stable-snapshot subscription, mirroring useProjectSite
export function useProjectEnvironmentScenes(): EnvironmentScene[]

// editor: a controlled component like the panel
export interface EnvironmentScenesProps {
  scenes: EnvironmentScene[]
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
  dispatch: (command: Command) => void
}
export function EnvironmentScenes(props: EnvironmentScenesProps): ReactElement
```

`useProjectEnvironmentScenes` reads `session.getProject().environmentScenes ?? EMPTY_SCENES`
with a module-level `EMPTY_SCENES` constant so the `useSyncExternalStore` snapshot stays
referentially stable for a project without the optional array (ADR-0143 shape).

**Steps:**

- [ ] **Step 1: Write the failing test.** For the component
      (`environment-scenes.test.tsx`): typing a name and pressing "Save scene" dispatches an
      `environment-scene/add` command whose scene has the typed name, the ISO of the current
      `observedAt`, and `weather.cloudCover` equal to the current dial (assert via the command's
      `params`; the id is a generated UUID, assert it is a non-empty string); an "Apply" button on
      a listed scene calls `onEnvironmentChange` with that scene's instant and cloud cover, mode
      untouched; "Remove" dispatches `environment-scene/remove` with the scene id; an empty list
      renders a short empty message. Ids come from `globalThis.crypto.randomUUID()` (the factories
      convention).
- [ ] **Steps 2-3: RED, commit**
      `test: save, apply, and remove environment scenes from the panel`
- [ ] **Step 4: Implement** the bridge hook, the component (list rows named by scene name, with
      the `observedAt` readout via `formatObservationDateTime(parseObservationInstant(...))`), the
      story with a two-scene fixture and `fn()` args, the `bridge/index.ts` export, and the rail
      wiring inside the Environment section:

```tsx
<EnvironmentScenes
  scenes={scenes}
  environment={environment}
  onEnvironmentChange={setEnvironment}
  dispatch={session.dispatch}
/>
```

where `const scenes = useProjectEnvironmentScenes()`. Add/remove are already undoable through
the slice-0 handlers; nothing new touches undo.

- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: manage saved environment scenes from the environment panel`
- [ ] **Step 8: BLUE.**

---

## Task 11: Canonical color-check and overcast states, visual and journey acceptance

**Files:** Modify `app/harness-environment.ts` + `app/harness-environment.test.ts`,
`bridge/react/scene-harness-view.tsx`, `e2e/tests/scene-solar.spec.ts`. Create
`e2e/tests/environment-panel.spec.ts`.

**Steps (behavior 11a: named states through the harness, unit-cycled):**

- [ ] **Step 1: Write the failing test.** In `app/harness-environment.test.ts`:
      `harnessEnvironmentState('color-check')` resolves to the canonical site, the equinox-noon
      instant, `realistic: true`, and `colorCheck: true`; `harnessEnvironmentState('overcast-noon')`
      resolves the same site and instant with `cloudCover: 1`; the two existing states still
      resolve without the new fields.
- [ ] **Steps 2-3: RED, commit**
      `test: resolve the color-check and overcast canonical environment states`
- [ ] **Step 4: Implement.** Extend `HarnessEnvironmentState` (app) and `HarnessEnvironment`
      (bridge) with `cloudCover?: number` and `colorCheck?: boolean`; add the two named states
      reusing `CANONICAL_SITE` and the equinox-noon instant; forward both fields through
      `HarnessLighting` into `SceneLighting`. The `scene` query-param namespace must stay disjoint
      from the geometry fixtures (see the App comment).
- [ ] **Steps 5-7: GREEN, full gate, commit**
      `feat: pin color-check and overcast states in the render harness`
- [ ] **Step 8: BLUE.**

**Steps (behavior 11b: acceptance specs; `test(e2e):` commits are cycle-exempt):**

- [ ] Add two `captureShell` cases to `e2e/tests/scene-solar.spec.ts`
      (`&scene=color-check` -> `scene-color-check-webgl.png`, `&scene=overcast-noon` ->
      `scene-overcast-noon-webgl.png`), mirroring the existing tolerance constants. Baselines
      render only on the CI runner (`run:visual`); the spec self-skips locally. Commit
      `test(e2e): render the color-check and overcast environment baselines`.
- [ ] Create `e2e/tests/environment-panel.spec.ts`, a DOM-level journey needing no GPU (the rail
      renders in plan view). Read `e2e/tests/smoke.spec.ts` and one `journeys/` spec first and
      mirror the boot pattern. Flow: load the app; the Environment section shows "Schematic"
      pressed; press "Realistic" on a fresh project and the missing-location notice appears; set
      latitude and longitude through the Site panel inputs (Enter commits) and the notice clears
      while the readout shows the coordinates; scrub the cloud-cover dial and the percentage
      readout follows; save a scene named "Winter dusk" and it appears in the saved-scenes list;
      remove it and the list empties. Commit
      `test(e2e): drive the environment panel through the live editor`.

---

## Task 12: Knowledge, ADR-0146

- [ ] **Step 1: Confirm the number.** ADR-0145 is the highest committed record on origin/main as
      of this plan; verify nothing has claimed 0146 across origin/main and open branches before
      writing (both prior slices had to shift numbers after concurrent claims).
- [ ] **Step 2: Write ADR-0146**
      (`/adr environment-panel-and-session-contract "Environment panel and session contract"`).
      Record: the `EnvironmentState` value object as the panel-provider contract (the name
      slice 1a reserved) and what deliberately stays out of it (site location and timezone, color
      temperature); the bridge-owned session store and the one-pane meaning of "per-view"; the
      rail placement decision and its rationale (locked decision 1); the toolbar slimming; the
      color-check neutralization contract; `WeatherConditions.cloudCover` and schema version 16;
      the scenes save/apply/remove scope with rename deferred; and that this extends ADR-0143
      (environment model), ADR-0144 (solar provider; its missing-location and cloud-cover forward
      references now resolve here), and ADR-0065 (session-state lighting controls). Run the
      `humanizer` skill (ADRs are human-read). Commit
      `docs: record ADR-0146 for the environment panel and session contract`.
- [ ] **Step 3: Regenerate the local knowledge index** (optional, gitignored):
      `pnpm knowledge:index`.

---

## After the plan is executed

- **Deferred CI baselines:** the two new scene-solar baselines (11b), the toolbar-affected story
  and scene baselines (Task 6), the shell/rail baselines (7b), and the two new component-story
  baselines (7, 10) all render on the CI runner (`run:visual` label /
  `refresh-story-baselines.yml`).
- **Tracking issues to file:** rename-in-panel for saved environment scenes (command exists,
  UI deferred; locked decision 5). Issue #436 (sky image-based lighting, Stage B) stays open and
  is NOT part of this slice; nothing here touches `scene.environment`.
- **Reviews before landing:** run `/clean-code-review` and `/review` across the whole branch
  (parallel or background RGB skips independent review) and surface any ADR-undocumented
  deviation for sign-off before opening the PR.

---

## Self-review

**Spec coverage (Slice 1b changes and acceptance):**

- "An Environment panel in the editor exposes the mode toggle (Schematic and Realistic), a
  location readout, date and time-of-day scrubbers, a weather or cloud-cover dial, and the
  neutral color-check toggle" -> Tasks 7 (mode, readout, notice), 8 (scrubber, dial), 9 (color
  check), in `editor/environment/`, matching the spec's layer assignment.
- "All controls write `EnvironmentState` through session state and dispatch" -> Task 2 (the
  value object), Task 4 (the shared session store the controls write), Task 10 (the dispatch
  path: the slice-0 environment-scene commands).
- "The panel drives the provider end to end" -> Tasks 4, 5, 7, 8 wire panel -> store -> bridge ->
  `provider.update`; the state -> provider half is already pinned by the slice-1a canonical
  baselines, the panel -> state half by the component tests, and the whole path by the Task 11b
  journey plus the new CI baselines.
- "Toggling the mode swaps `BasicLightingProvider` and `SolarLightingProvider` with no geometry
  rebuild" -> the swap point is untouched from slice 1a (`SceneLighting`, keyed provider on the
  persistent render scene, ADR-0144); Task 7's toggle writes the mode the swap reads; the
  journey exercises the toggle live.
- "The color-check toggle renders the neutral white-balanced reference" -> Task 3 (the
  contract), 5a (both modes wired), 9 (the toggle), 11 (the `color-check` CI baseline).
- Missing-location UX (deferred to 1b by ADR-0144's fallback note) -> Task 7's notice and the
  comment handoff in `scene-lighting.tsx`.
- Weather touchpoint left pinned by slice 1a (`DEFAULT_CLOUD_COVER`, "the slice-1b weather layer
  owns cloud cover") -> Tasks 1, 5a, 8, and the `overcast-noon` baseline.

**Scope honesty:** The saved-scenes UI is not named in the slice-1b acceptance bullets; locked
decision 5 states the argument for carrying it here (the spec's "and dispatch", the purpose
given for scenes in spec locked decision 3, and no other spine home) so the reviewer can strike
Task 10 in one place if the owner disagrees. Rename UI is explicitly deferred with a tracking
issue. Tasks 5a and 5b are feat-only wiring commits with the same coverage boundary slice 1a's
bridge wiring had; their behavioral gates (core unit tests, panel tests, the journey, CI
baselines) are named in the commit bodies rather than pretended at.

**Type consistency:** `EnvironmentState { mode, observedAt, cloudCover, colorCheck }` is defined
once (Task 2) and consumed by the store (Task 4), the view and lighting wiring (Task 5), and
every panel control (Tasks 7-10). `captureEnvironmentScene` / `applyEnvironmentScene` (Task 2)
are the only scene conversions and Task 10 uses exactly them, so the panel cannot invent its own
serialization. `WeatherConditions.cloudCover` (Task 1) is written by `captureEnvironmentScene`
and read back by `applyEnvironmentScene` with the `DEFAULT_CLOUD_COVER` fallback.
`NEUTRAL_REFERENCE_WHITE` and `colorCheckLighting` (Task 3) appear in both `SceneLighting`
branches (Task 5a) and nowhere else. `SceneLighting`'s prop names extend the merged
slice-1a file (`realistic`, `site`, `observedAt` keep their existing names and defaults;
`cloudCover` and `colorCheck` join them), and `HarnessEnvironment` (bridge) mirrors
`HarnessEnvironmentState` (app) field for field, as it does today.
