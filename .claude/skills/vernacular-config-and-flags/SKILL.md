---
name: vernacular-config-and-flags
description: 'Use when locating, changing, or adding a Vernacular configuration axis: URL query params (fixture=scene-harness, temp, paint, scene, e2e, e2e-storage), import.meta.env PROD/DEV gates, localStorage/IndexedDB/OPFS keys, ci-coupling.json, CI labels and slash commands (run:e2e, run:visual, ci:full, ci:skip-heavy), screenshot diff tolerances, Stryker or Lighthouse thresholds, .npmrc cooldown, release-please knobs, Playwright env vars (CI, E2E_BASE_URL, PLAYWRIGHT_VERSION).'
---

# Vernacular configuration and flags

## Overview

This is the catalog of every configuration axis in the repo: what each controls, its default, whether it is production or test-only, what guards it, and the exact file that reads it. Answer flag questions from here, then re-run the one-liners in "Provenance and maintenance" before acting: flags drift.

## When to use

- You need to know what a query parameter, storage key, label, threshold, or env var does, or where it is read.
- You are about to add, rename, or remove a configuration axis.
- A CI job ran (or skipped) unexpectedly and you suspect a label, coupling edge, or decision constant.
- A visual diff failed and you need the exact tolerance for that suite.

## When NOT to use

- Recreating the toolchain, installing dependencies, or working around the cooldown mechanics: vernacular-build-and-env.
- What the CI jobs do end to end, baseline tiers, or how to add tests: vernacular-validation-and-qa.
- Launching the app, harness, storybook, or the release machinery: vernacular-run-and-operate.
- Triaging a failure whose cause you do not know yet: vernacular-debugging-playbook.

## Quick reference

| Axis                              | Declared in                                                                         | Read by                                                                            | Status                        |
| --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| URL query params                  | ad hoc (no registry)                                                                | `app/app.tsx`, `src/main.tsx`, `bridge/react/furniture-model-signals.tsx`          | test-only seams               |
| `import.meta.env.PROD` / `.DEV`   | Vite built-ins                                                                      | `src/main.tsx`, `app/validate-loaded-project.ts`, `editor/design-system/field.tsx` | production                    |
| localStorage                      | `editor/plan/snap-preferences-store.ts`                                             | editor shell                                                                       | production                    |
| IndexedDB / OPFS / caches / locks | `storage/` modules                                                                  | `storage/`                                                                         | production                    |
| `ci-coupling.json`                | repo root                                                                           | `scripts/ci/select-tests.mjs`                                                      | CI                            |
| PR labels + slash commands        | `.github/workflows/slash-command.yml`                                               | `scripts/ci/decide.mjs`, `ci.yml`                                                  | CI                            |
| Screenshot tolerances             | `playwright.config.ts`, `playwright.stories.config.ts`, `e2e/tests/scene-*.spec.ts` | Playwright                                                                         | CI + local                    |
| Stryker thresholds                | `stryker.conf.json`                                                                 | `.github/workflows/mutation.yml` (weekly)                                          | non-gating                    |
| Lighthouse assertions             | `lighthouserc.json`                                                                 | `ci.yml` lighthouse job                                                            | CI (push/merge_group/ci:full) |
| Dependency cooldown               | `.npmrc`                                                                            | pnpm                                                                               | production                    |
| Release knobs                     | `release-please-config.json`                                                        | `.github/workflows/release-please.yml`                                             | release                       |
| Playwright env vars               | environment                                                                         | `playwright*.config.ts`, `package.json` scripts                                    | CI + local                    |

## URL query parameters

All are test seams. A normal page load carries none of them, and each one is a documented no-op for real users. There are exactly three read sites as of 2026-07-05 (verify with the one-liner below).

| Param         | Values                                                                           | Default when absent                      | Effect                                                                                                                                                                                                                                                  | Read in                                      |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `fixture`     | `scene-harness`                                                                  | editor boots normally                    | Mounts the deterministic 3D render harness instead of the editor: no storage, no autosave, no editor chrome                                                                                                                                             | `app/app.tsx`                                |
| `temp`        | kelvin number                                                                    | 6500 (`DEFAULT_COLOR_TEMPERATURE_K`)     | Harness light color temperature. Supported band 2700..6500 K (`core/color/color-temperature.ts`); non-numeric values are ignored                                                                                                                        | `app/app.tsx`                                |
| `paint`       | `demo`                                                                           | no paint                                 | Paints the harness floor `#cc6633` and all four walls `#3f7f5f` (matte) for the painted-shell baseline                                                                                                                                                  | `app/app.tsx`                                |
| `scene`       | see keyspace below                                                               | default wall shell, no environment state | Selects a harness geometry fixture and/or a named canonical lighting environment                                                                                                                                                                        | `app/app.tsx` + `app/harness-environment.ts` |
| `e2e-storage` | presence only                                                                    | durable browser ports wired              | App boots with in-memory defaults; `src/e2e-storage-hook.ts` is dynamically imported and exposes `window.vernacularE2eStorage` for the durable-storage and crash-recovery specs                                                                         | `src/main.tsx`                               |
| `e2e`         | presence only (specs pass `?e2e=1`; any value works, the check is `.has('e2e')`) | off                                      | Renders a hidden element (`data-testid="furniture-model-signals"`) that gains `data-model-loaded-<id>` attributes after each real furniture model swap. Runtime flag, not a build gate, so it survives the production preview build the e2e run targets | `bridge/react/furniture-model-signals.tsx`   |

Guard condition: `temp`, `paint`, and `scene` are only read when `fixture=scene-harness` is present. On their own they do nothing.

### The `scene` keyspace

One namespace, two kinds of key, resolved by `resolveHarnessScene` in `app/harness-environment.ts`. Geometry keys win; the key sets must stay disjoint (pinned by that module's tests).

Geometry fixture keys: `junctions` (T-junction plus acute bay, ADR-0080), `furniture` (wall shell plus one massing box, ADR-0094), `adjacent-rooms` (two rooms sharing a wall, viewed from below, ADR-0150).

Named environment states (all pin the canonical site: latitude 40, longitude -75, north bearing 0, timezone America/New_York, realistic lighting on):

| Key                 | Observation instant    | Extras                                 |
| ------------------- | ---------------------- | -------------------------------------- |
| `equinox-noon`      | 2026-03-20, minute 720 | none                                   |
| `winter-afternoon`  | 2026-12-21, minute 960 | none                                   |
| `color-check`       | 2026-03-20, minute 720 | `colorCheck: true`                     |
| `overcast-noon`     | 2026-03-20, minute 720 | `cloudCover: 1`                        |
| `ambient-occlusion` | 2026-03-20, minute 720 | pairs the `furniture` geometry fixture |

## import.meta.env

No custom `VITE_` variables exist anywhere in the tree as of 2026-07-05. `PROD` and `DEV` are the only env axes the source reads.

| Gate   | Site                                                                                                                                                                | Behavior                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD` | `src/main.tsx` passes `isProduction: import.meta.env.PROD` to `registerServiceWorker`; `storage/service-worker/register-service-worker.ts` returns early when false | Service worker registers only in production builds. Dev and test loads never register it (the worker script is only emitted by production builds anyway)                                                        |
| `DEV`  | `app/validate-loaded-project.ts`                                                                                                                                    | Non-fatal load gate: after migration, validates the document against the CORE schema and `console.warn`s on a shape break. Never rejects a load; production skips the check entirely (Ajv gate is built lazily) |
| `DEV`  | `editor/design-system/field.tsx`                                                                                                                                    | `console.error` when a `hint` is supplied but the child is not a single React element                                                                                                                           |

Adding the first `VITE_` variable would be an architectural change: write an ADR and route it through the red-green-blue cycle (vernacular-change-control).

## Browser persistence surfaces

### localStorage

Exactly one key in the source tree as of 2026-07-05:

- `vernacular.snap-preferences` (`SNAP_PREFERENCES_STORAGE_KEY` in `editor/plan/snap-preferences-store.ts`). Snap preferences for the plan editor. Defaults (`DEFAULT_SNAP_PREFERENCES` in `editor/plan/snap-preferences.ts`): enabled `true`, every snap kind on except `trace`, `pixelRadius` 12 (clamped to a minimum of 1). Malformed stored JSON falls back to the defaults; write failures (quota, private mode) are swallowed and the change still applies in memory. The store is created once per editor shell mount (`editor/shell/editor-shell.tsx`), which is the "editor preference" its comment refers to; there is no separate shell-preference key.

### IndexedDB (all databases at version 1)

| Database                  | Object store | Purpose                                      | File                                                |
| ------------------------- | ------------ | -------------------------------------------- | --------------------------------------------------- |
| `vernacular`              | `projects`   | Fallback project store when OPFS is unusable | `storage/indexeddb/indexeddb-project-store.ts`      |
| `vernacular-recent`       | `recent`     | Recent-projects list behind "Open recent"    | `storage/recent/indexeddb-recent-project-store.ts`  |
| `vernacular-handles`      | `handles`    | Persisted file-system directory handles      | `storage/filesystem/directory-handle-store.ts`      |
| `vernacular-user-library` | `assets`     | User library asset index                     | `storage/indexeddb/indexeddb-user-library-index.ts` |

### OPFS, caches, locks

- OPFS (origin-private file system) is the primary project backend: one subdirectory per project id containing `vernacular.json` (`PROJECT_FILE` in `storage/folder/folder-project-store.ts`). Crash-recovery snapshots live in a `.house-autosave/` sidecar per project (`session-start.json`, `snapshot-*.json`; `storage/snapshots/snapshot-store.ts`).
- Guard: the snapshot store resolves only when the OPFS backend is both selected and usable (`app/resolve-snapshot-store.ts`); on the IndexedDB fallback crash recovery stays off.
- Backend selection: `app/resolve-project-store.ts` probes capabilities once; OPFS when `selectProjectStoreBackend` says so and `opfsUsable()` passes, else the IndexedDB default. The folder and zip backends require a user gesture and never auto-boot.
- Cache Storage: names prefixed `vernacular-shell-` (`storage/service-worker/shell-cache.ts`).
- Web Locks: `vernacular-project-<id>` (`storage/locks/project-lock.ts`).

## ci-coupling.json

Consumed only by `scripts/ci/select-tests.mjs`, which picks the Vitest path filters for the PR-selective unit-test step in the `ci.yml` check job. Contents as of 2026-07-05:

- `runAll`: 8 exact paths whose change runs the whole unit suite: `vite.config.ts`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `.nvmrc`.
- `runAllPrefixes`: `["src/"]`.
- `edges`: `{"schema/": ["core"], "resources/": ["engine"]}`. An edge means: a change under the key prefix adds the listed layers to the selected test set even though no import edge exists (layer selection is otherwise derived from the enforced layer DAG in `scripts/ci/layers.mjs`).

Output modes: `all` (a global input changed), `some` (run listed paths), `none` (nothing unit-bearing changed; the merge queue still runs everything). Changes under `tests/` or `scripts/` always add those directories.

When to edit: you add a non-imported file that a layer's tests depend on. Prefer a new `edges` entry over a `runAll` entry unless the file genuinely affects every layer. Update `scripts/ci/select-tests.test.mjs` alongside.

## Heavy-suite decision, labels, and slash commands

`scripts/ci/decide.mjs` chooses which heavy suites run. Logic, in order:

1. Event is not `pull_request` (push to main, merge_group): e2e, visual, and lighthouse all true.
2. PR with label `ci:full`: all three true (this is the only way lighthouse runs on a PR).
3. PR with label `ci:skip-heavy`: all three false.
4. Otherwise, on a PR: `e2e` = `run:e2e` label OR (non-draft AND a changed path starts with `app/`, `editor/`, `bridge/`, `engine/`, or `e2e/`); `visual` = `run:visual` label OR (non-draft AND a changed file ends `.stories.tsx` or starts with `editor/`, `bridge/react/`, or `.storybook/`); `lighthouse` = false.

Labels are read live from the GitHub API on each run, so re-running the workflow picks up a freshly applied label.

Slash commands (`.github/workflows/slash-command.yml`, fires on PR issue comments starting with `/`):

| Comment          | Label applied   | Then                                                |
| ---------------- | --------------- | --------------------------------------------------- |
| `/test e2e`      | `run:e2e`       | re-runs the latest `ci.yml` run for the PR head SHA |
| `/test visual`   | `run:visual`    | same                                                |
| `/ci full`       | `ci:full`       | same                                                |
| `/ci skip-heavy` | `ci:skip-heavy` | same                                                |

Guard: the comment author's `author_association` must be `OWNER`, `MEMBER`, or `COLLABORATOR`; anyone else gets a thumbs-down reaction and no label. Accepted commands get a rocket reaction. A label applied by hand does NOT re-trigger CI by itself; re-run the workflow (or use the comment command, which does both).

Scene-lane guard: the `decide` job also emits `scene=true` when any `*-scene-webgl-linux.png` baseline exists under `e2e/tests/`; the `scene-visual` job (chromium/SwiftShader) runs only then. As of 2026-07-05 eleven such baselines are committed, so the lane is live. They are seeded/refreshed by the manually dispatched `refresh-scene-baselines.yml` workflow.

## Screenshot tolerances

| Suite   | Where set                                                                                                                                       | maxDiffPixelRatio | Per-pixel threshold | What it absorbs                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| App e2e | `SCREENSHOT_DIFF_TOLERANCE` in `playwright.config.ts`                                                                                           | 0.02              | Playwright default  | Antialias variation across chromium, firefox, webkit                                                                                  |
| Stories | `STORY_DIFF_TOLERANCE` in `playwright.stories.config.ts` (plus `animations: 'disabled'`)                                                        | 0.01              | Playwright default  | Sub-pixel antialiasing between the docker-rendered baseline and the CI runner                                                         |
| Scene   | `SHELL_MAX_DIFF_PIXEL_RATIO` / `SHELL_THRESHOLD`, duplicated in `e2e/tests/scene-visual-regression.spec.ts` and `e2e/tests/scene-solar.spec.ts` | 0.05              | 0.35                | GPU driver and antialiasing variation in real-GPU renders; geometric correctness is pinned by Node tests instead (ADR-0061, ADR-0065) |

`e2e/tests/scene-camera-fit.spec.ts` is not a screenshot test: it asserts a numeric framing metric with `MIN_MODEL_SPREAD_FRACTION = 0.25`.

Rule: widen a tolerance per-story or per-capture only, and only after a specific capture proves flaky. Never widen a suite default to make one diff pass. Baseline tiers, platforms, and refresh commands: vernacular-validation-and-qa.

## Stryker (mutation testing)

`stryker.conf.json`: thresholds high 80 / low 60 / break 50. The run fails when the mutation score drops below 50. Scope: `core/**/*.ts` minus tests; typescript checker on. Report at `reports/stryker/mutation.html` (uploaded as artifact `stryker-report`, 14 days).

Guards: runs weekly (`.github/workflows/mutation.yml`, cron `30 3 * * 0`, plus `workflow_dispatch`); a guard step skips when `core/` holds no non-test `.ts` files. It never gates PRs. Commands: `pnpm mutate` (full), `pnpm mutate:check` (`--dryRun`).

## Lighthouse

`lighthouserc.json`: desktop preset, 3 runs against `pnpm preview --port 4173 --strictPort`. Assertions:

| Category       | Level                        | minScore |
| -------------- | ---------------------------- | -------- |
| accessibility  | error (the only failing one) | 0.9      |
| performance    | warn                         | 0.8      |
| best-practices | warn                         | 0.9      |
| seo            | warn                         | 0.8      |

Guard: `decide.mjs` returns `lighthouse: false` on every PR except under the `ci:full` label, so this normally runs only on push to main and in the merge queue. Command: `pnpm lhci`.

## .npmrc

- `minimum-release-age=43200`: refuses any package (direct or transitive) whose newest matching release is younger than 30 days.
- `save-exact=true` and `save-prefix=` (empty): exact version pins, never `^`/`~` ranges.
- 56 `minimum-release-age-exclude[]` entries in three categories: 25 `@rollup/rollup-*` per-platform binaries, 9 typescript-eslint monorepo packages (8 `@typescript-eslint/*` plus `typescript-eslint`), 22 `@babel/*` infrastructure packages.

Stale pointer, flagged: the `.npmrc` comment cites `docs/knowledge/decisions/ADR-0013-cooldown-exclusions.md`, which is absent from the tree as of 2026-07-05. The comment text in `.npmrc` itself is the rationale of record until that ADR exists. Do not bypass the cooldown; install mechanics and the narrow exception procedure live with vernacular-build-and-env.

## release-please-config.json

| Knob                                            | Value                                                                         | Meaning                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `release-type`                                  | `node`                                                                        | version lives in `package.json` (0.3.1 as of 2026-07-05)            |
| `include-component-in-tag` / `include-v-in-tag` | false / true                                                                  | tags look like `v0.3.0`                                             |
| `draft` / `prerelease`                          | false / false                                                                 | real releases, published directly                                   |
| `bump-minor-pre-major`                          | true                                                                          | while below 1.0.0, a breaking change bumps the minor, not the major |
| `bump-patch-for-minor-pre-major`                | true                                                                          | while below 1.0.0, a `feat` bumps the patch, not the minor          |
| `changelog-path`                                | `CHANGELOG.md`                                                                |                                                                     |
| `changelog-sections`                            | all 10 commit types mapped; `chore` visible (`hidden: false`), `style` hidden | controls which commits appear in release notes                      |

Consumed by `.github/workflows/release-please.yml` on push to main. Release operation (resyncs, gates): vernacular-run-and-operate.

## Playwright and platform environment variables

| Variable             | Default                              | Effect                                                                                                                                                                                                        | Read in                                                                 |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CI`                 | unset locally; set on GitHub runners | `forbidOnly` on, retries 2, workers 1, reporters `github` + `html`, no webServer reuse                                                                                                                        | both `playwright.config.ts` and `playwright.stories.config.ts`          |
| `E2E_BASE_URL`       | `http://localhost:4173`              | Overrides the app e2e base URL and the webServer health-check URL                                                                                                                                             | `playwright.config.ts` only (the stories config pins its own port 6107) |
| `PLAYWRIGHT_VERSION` | derived, not user-set                | Computed inside the `e2e:update-snapshots` and `stories:update-snapshots` scripts from the installed `@playwright/test` version; selects the docker image tag `mcr.microsoft.com/playwright:v<version>-noble` | `package.json` scripts                                                  |
| `process.platform`   | host value                           | `darwin` adds the scene-webgl GPU launch flags (`--enable-unsafe-webgpu --use-angle=metal --use-gpu-in-tests --ignore-gpu-blocklist`); every other platform gets no extra flags and falls back to SwiftShader | `playwright.config.ts`                                                  |

## How to add a new configuration axis

1. Pick the narrowest surface. User preference: a store in `editor/` or `storage/` behind an injected port. Test seam: a URL parameter read at exactly one site. Build-mode gate: `import.meta.env.PROD`/`DEV`. CI knob: a root-level file consumed by a script under `scripts/ci/`.
2. Declare it in exactly one module and export the key or constant. Model: `editor/plan/snap-preferences-store.ts` (exported key, injected `StoragePort`, sanitize on read, silent write failure, defaults from a sibling pure module).
3. Guard it explicitly. A test-only URL param must be a provable no-op without the param; say so in a comment at the read site (mirror `app/app.tsx` and `src/main.tsx`). Dev-only warnings go behind `DEV`; production-only behavior behind `PROD`.
4. Name it in plain English, prefixed `vernacular.` or `vernacular-` for storage keys. No shorthand (`.claude/rules.md` rule 10).
5. Prove it with a test in the same red-green-blue cycle as the change: a unit test covering the default path and the sanitize/fallback path, and, for a URL seam, the e2e spec that consumes it (the way `e2e/tests/scene-furniture-model-swap.spec.ts` proves `?e2e`).
6. If the axis changes which CI suites run, update `ci-coupling.json` or the constants in `scripts/ci/decide.mjs`, plus `scripts/ci/*.test.mjs`.
7. If it is architectural (a new env var class, a new storage surface, a new CI gate), write an ADR (vernacular-change-control gates this).
8. Update this skill's tables and the Provenance list; if it changes what counts as evidence, tell vernacular-validation-and-qa's maintainer path too.

## Common mistakes

- Using `?temp=`, `?paint=`, or `?scene=` without `?fixture=scene-harness`: they are only read inside the harness branch.
- Editing `vite.config.js` or `vitest.config.js` at the root: those are emitted tsc artifacts; the sources (and the `ci-coupling.json` `runAll` entries) are the `.ts` files. See vernacular-build-and-env.
- Applying `run:e2e`/`run:visual` labels by hand and waiting: the label alone never re-triggers CI. Use the comment command, or apply the label and re-run the workflow manually.
- Widening a suite-level screenshot tolerance to silence one flaky capture.
- Treating the weekly Stryker `break: 50` as a PR gate (it is not), or treating Lighthouse warn-level scores as failures (only accessibility at 0.9 errors).
- Expecting crash recovery on the IndexedDB fallback: the `.house-autosave/` sidecar needs OPFS.
- Citing ADR-0013 for the cooldown exclusions: the file does not exist as of 2026-07-05; the `.npmrc` comments carry the rationale.

## Provenance and maintenance

Everything above verified against the working tree on 2026-07-05 (main, post v0.3.0; package version 0.3.1). Re-verify before relying on any row:

- URL params: `rg -n "URLSearchParams" src app editor bridge engine storage core -g '!*.test.*'` (expect the three read sites listed above)
- Env gates and no custom vars: `rg -n "import.meta.env" src app editor bridge engine storage core -g '!*.test.*'` and `rg -n "VITE_" src app editor bridge engine storage core index.html vite.config.ts` (expect zero `VITE_` hits)
- Harness scene keyspace: `rg -n "HARNESS_ENVIRONMENT_STATES|HARNESS_GEOMETRY_SCENE_KEYS" app/harness-environment.ts`
- Color temperature band: `sed -n '3,8p' core/color/color-temperature.ts`
- localStorage keys: `rg -n "localStorage|STORAGE_KEY" editor app src storage -g '!*.test.*'` (expect only snap preferences)
- IndexedDB names: `rg -n "DB_NAME|STORE_NAME" storage -g '!*.test.*'`
- Snapshot sidecar: `rg -n "AUTOSAVE_DIR|SESSION_START_FILE|SNAPSHOT_PREFIX" storage/snapshots/snapshot-store.ts`
- Coupling: `cat ci-coupling.json`
- Decision constants: `sed -n '14,18p' scripts/ci/decide.mjs`
- Slash commands and allowed associations: `rg -n "labelFor|allowed" .github/workflows/slash-command.yml`
- Tolerances: `rg -n "TOLERANCE|SHELL_THRESHOLD|SHELL_MAX_DIFF" playwright.config.ts playwright.stories.config.ts e2e/tests/scene-visual-regression.spec.ts e2e/tests/scene-solar.spec.ts`
- Scene lane gate: `find e2e/tests -name '*-scene-webgl-linux.png' | wc -l` (11 as of 2026-07-05; 0 disables the scene-visual job)
- Stryker: `rg -n "thresholds" -A 4 stryker.conf.json`; schedule: `rg -n "cron" .github/workflows/mutation.yml`
- Lighthouse: `cat lighthouserc.json`
- Cooldown: `grep -c "minimum-release-age-exclude" .npmrc` (expect 56) and `grep -n "minimum-release-age=" .npmrc`
- ADR-0013 still absent: `ls docs/knowledge/decisions | grep -c 0013` (expect 0)
- Release knobs: `cat release-please-config.json`; current version: `rg -n '"version"' package.json`
- Playwright env: `rg -n "E2E_BASE_URL|process.env.CI|process.platform" playwright.config.ts playwright.stories.config.ts`
