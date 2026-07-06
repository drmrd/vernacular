---
name: vernacular-validation-and-qa
description: 'Use when validating a Vernacular change: deciding what evidence must pass before merge, reading ci-complete or a skipped CI job, adding or running tests at any tier (vitest unit or storybook projects, playwright e2e, scene-webgl GPU harness, story visuals, tests/ architecture and format suites), refreshing app, scene, or story screenshot baselines, diagnosing a self-skipped spec or missing-snapshot failure, the journey-coverage gate, snapshot tolerances, or test-quality rules.'
---

# Vernacular validation and QA

## Overview

A change is done when the right tier of evidence proves it, not when the code compiles. This skill maps every gate, every test tier, and the three screenshot-baseline families, with exact refresh recipes and the anti-vacuity patterns that keep a green run meaningful.

## When to use

- Before claiming a change is ready: which gates must pass, locally and in CI.
- A CI job skipped, failed, or a snapshot comparison failed and you need to know what that means.
- You are adding a test and need the right directory, naming, and config.
- A visual baseline needs refreshing, or you suspect a refresh is noise.
- `pnpm integration:audit` fails, or you are adding a user-facing capability.

## When NOT to use

- Interpreting diagnostic tool output (traces, reports, probes): see vernacular-diagnostics-and-tooling.
- The red-green-blue cycle, commit ordering, `rgb:audit`, review agents, and merge rules: see vernacular-change-control.
- Root-causing a failing test rather than classifying it: see vernacular-debugging-playbook.
- Starting the app, harness, or Storybook outside a test run: see vernacular-run-and-operate.
- Rendering-defect campaigns that decide when a scene baseline may legitimately change: see vernacular-rendering-defect-campaign.

## Quick reference

| Task                                              | Command (repo root)                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Full local acceptance bar (same as pre-push hook) | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |
| Unit suite                                        | `pnpm test`                                                                   |
| One unit file                                     | `pnpm exec vitest run --project unit <path>`                                  |
| Storybook component tests (real chromium)         | `pnpm storybook:test`                                                         |
| App e2e, all local browser projects               | `pnpm build && pnpm e2e`                                                      |
| App e2e, chromium only (what CI runs)             | `pnpm build && pnpm e2e --project=chromium`                                   |
| Scene GPU harness specs (darwin dev Mac)          | `pnpm build && pnpm e2e --project=scene-webgl`                                |
| Story visual diff (needs built Storybook)         | `pnpm build-storybook && pnpm stories:test`                                   |
| Journey-coverage gate                             | `pnpm integration:audit`                                                      |
| Seed a missing app-visual baseline (darwin)       | `pnpm e2e --update-snapshots=missing --project=chromium`                      |
| Refresh scene -darwin baselines (dev Mac)         | `pnpm e2e --project=scene-webgl --update-snapshots=all`                       |
| Refresh scene -linux baselines                    | Dispatch `refresh-scene-baselines.yml`, commit the `scene-baselines` artifact |
| Refresh story baselines                           | Dispatch `refresh-story-baselines.yml`, commit the `story-baselines` artifact |
| Mutation score (core/ only, advisory)             | `pnpm mutate` (weekly in CI, never gates PRs)                                 |

## The acceptance bar

### Local hooks (husky)

| Hook       | Runs                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| pre-commit | lint-staged: `eslint --fix` + `prettier --write` on staged files              |
| commit-msg | commitlint (Conventional Commits)                                             |
| pre-push   | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |

Playwright and Lighthouse deliberately stay out of pre-push; CI owns them.

### CI (`.github/workflows/ci.yml`, triggers: push to main, pull_request, merge_group)

`ci-complete` is the single required status check on main (repository ruleset, verified 2026-07-05). It aggregates all other jobs and fails only if a needed job ended `failure` or `cancelled`. A **skipped conditional job counts as pass on PRs**. The merge queue (`merge_group`) and pushes to main run the full heavy set, because `scripts/ci/decide.mjs` returns all-true for any non-PR event. The merge queue is the backstop; a green PR is not proof the heavy suites ran.

| Job             | Condition                           | Content                                                                                                             |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| check           | always                              | typecheck, lint, format:check, unit tests (selective on PRs, see below), `pnpm integration:audit`, build            |
| decide          | always                              | computes e2e / visual / lighthouse booleans; detects committed `*-scene-webgl-linux.png` to arm scene-visual        |
| ping-pong       | PRs only                            | `pnpm rgb:audit --range origin/<base>..HEAD` (see vernacular-change-control)                                        |
| storybook-build | decide.visual                       | `pnpm storybook:test`, `pnpm build-storybook`, `pnpm stories:test`                                                  |
| e2e             | decide.e2e                          | build + `playwright test --project=chromium` only. Firefox and webkit never run in CI; they are local-only coverage |
| scene-visual    | linux scene baselines exist in tree | `playwright test --project=scene-webgl` on the GPU-less runner (SwiftShader)                                        |
| lighthouse      | decide.lighthouse                   | `pnpm lhci`; hardcoded false on PRs unless `ci:full`                                                                |

decide on PRs (`scripts/ci/decide.mjs`): label `ci:full` forces everything, `ci:skip-heavy` skips everything heavy; otherwise e2e runs when the diff touches `app/`, `editor/`, `bridge/`, `engine/`, or `e2e/`, and visual runs when it touches `editor/`, `bridge/react/`, `.storybook/`, or any `.stories.tsx`. Draft PRs get no heavy suites unless labeled. Labels come from PR comments via `slash-command.yml`: `/test e2e` -> `run:e2e`, `/test visual` -> `run:visual`, `/ci full` -> `ci:full`, `/ci skip-heavy` -> `ci:skip-heavy`.

Selective unit tests on PRs: `scripts/ci/select-tests.mjs` maps changed files to layer directories using the enforced layer DAG, plus `ci-coupling.json` (`runAll` for global inputs like `package.json` and `src/`; `edges` add `core` for `schema/` changes and `engine` for `resources/`). `tests/` and `scripts/` changes select those directories. The full suite always runs in the merge queue.

Mutation testing (`mutation.yml`): Stryker over `core/**` only, weekly (Sunday 03:30 UTC) plus manual dispatch; `thresholds.break` is 50 (a score below 50 fails the run). It never gates PRs.

## Test topology

| Suite                                                                   | Proves                                                                                                             | Files and naming                                                                                     | Picked up by                                                                                                                       | Run                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Unit (vitest project `unit`, jsdom, globals, setup `src/setupTests.ts`) | Domain logic, components, hooks                                                                                    | `<name>.test.ts(x)` co-located with source in any layer, plus `src/`, `scripts/`, `tests/`           | `vitest.config.ts` -> extends `vite.config.ts` (its `test.exclude` skips `e2e/**` and `.claude/**`)                                | `pnpm test`                                              |
| Architecture boundaries                                                 | ESLint boundaries config really rejects upward imports                                                             | `tests/architecture/layer-boundaries.test.ts` (`// @vitest-environment node`)                        | unit project                                                                                                                       | `pnpm exec vitest run --project unit tests/architecture` |
| Format conformance                                                      | VFPF schema, archive, and corpus invariants                                                                        | `tests/format/*.test.ts` (schema-conformance, schema-drift, building-archive-conformance, corpus-\*) | unit project                                                                                                                       | `pnpm exec vitest run --project unit tests/format`       |
| Story-coverage ratchet                                                  | Every exported component in `app/`, `editor/`, `bridge/` has a story or an allowlist entry; stale entries fail too | `scripts/story-coverage/story-coverage.test.ts` + `uncovered-components.ts` (ADR-0111, ADR-0124)     | unit project                                                                                                                       | `pnpm test`                                              |
| Storybook component tests (vitest project `storybook`)                  | Each story renders and passes its play/a11y annotations in a real browser                                          | `<Component>.stories.tsx` under `src/`, `app/`, `editor/`, `bridge/` (`.storybook/main.ts` globs)    | `vitest.config.ts` storybook project, headless chromium via `@vitest/browser-playwright`                                           | `pnpm storybook:test`                                    |
| App e2e                                                                 | User-visible behavior against the built app                                                                        | `e2e/tests/**/*.spec.ts` NOT matching `scene-*`                                                      | `playwright.config.ts` projects chromium, firefox, webkit (all three `testIgnore` scene specs); serves `dist/` via preview on 4173 | `pnpm build && pnpm e2e`                                 |
| Journeys                                                                | Required capabilities reachable from the assembled editor                                                          | `e2e/tests/journeys/*.spec.ts` (27 specs as of 2026-07-05)                                           | same app e2e projects; gated by `integration:audit`                                                                                | `pnpm build && pnpm e2e`                                 |
| Scene GPU (`scene-webgl` project)                                       | Deterministic 3D harness pixels and live-view semantics                                                            | any `e2e/tests/scene-*.spec.ts`                                                                      | `playwright.config.ts` `testMatch: /scene-.*\.spec\.ts/`; darwin gets Metal ANGLE flags, other platforms get none (SwiftShader)    | `pnpm build && pnpm e2e --project=scene-webgl`           |
| Story visuals                                                           | Pixel baselines for every testable built story                                                                     | `e2e/stories/story-visual.spec.ts`, one test per id in `storybook-static/index.json`                 | `playwright.stories.config.ts` (own config: serves `storybook-static/` on 6107, so not part of `pnpm e2e`)                         | `pnpm build-storybook && pnpm stories:test`              |
| Accessibility                                                           | axe scans of key surfaces                                                                                          | `e2e/tests/accessibility.spec.ts`, `scene-accessibility.spec.ts`                                     | app e2e / scene-webgl projects                                                                                                     | with the e2e runs above                                  |

Naming triggers routing: a `.test.ts(x)` suffix means vitest unit; `.stories.tsx` means both the storybook component project and (via the built index) the story visual suite; a `.spec.ts` under `e2e/tests/` means app e2e; a `scene-` prefix on that spec moves it out of chromium/firefox/webkit and into `scene-webgl`. The `testMatch` regex is unanchored and matches the whole path, so keep `scene-` out of clone and worktree directory names or every spec routes into the GPU project.

## The three baseline tiers

All facts date-stamped 2026-07-05.

|                   | App visual                                                                                      | Scene WebGL                                                                                                                                                                                                        | Stories                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Spec              | `e2e/tests/visual-regression.spec.ts` (full-page home)                                          | `e2e/tests/scene-visual-regression.spec.ts` (6 fixtures) + `scene-solar.spec.ts` (5 states)                                                                                                                        | `e2e/stories/story-visual.spec.ts` (auto-enumerated)               |
| Baselines         | `e2e/tests/visual-regression.spec.ts-snapshots/home-<browser>-<platform>.png`                   | `e2e/tests/scene-*.spec.ts-snapshots/<name>-webgl-scene-webgl-<platform>.png`                                                                                                                                      | `e2e/stories/__screenshots__/<story-id>-linux.png` (87 files)      |
| Platform families | Only `-darwin` committed (chromium, firefox, webkit); no `-linux`, so the spec self-skips in CI | Both `-darwin` (authoritative dev-Mac Metal render, ADR-0149) and `-linux` (runner SwiftShader render, ADR-0152, seeded 2026-07-05)                                                                                | `-linux` only, pinned by `snapshotPathTemplate` regardless of host |
| Rendered where    | Locally per platform                                                                            | `-darwin`: dev Mac, real GPU via Metal ANGLE. `-linux`: ubuntu runner, CPU SwiftShader (deterministic run to run)                                                                                                  | ubuntu amd64 runner (or amd64 docker)                              |
| Checked in CI     | Not currently (skips while no `-linux` baseline exists)                                         | scene-visual job diffs the `-linux` family; `-darwin` stays local-only evidence                                                                                                                                    | storybook-build job diffs on every visual-flagged run              |
| Tolerance         | `maxDiffPixelRatio: 0.02` (global, `playwright.config.ts`)                                      | per-pixel `threshold: 0.35` + `maxDiffPixelRatio: 0.05` (in-spec constants)                                                                                                                                        | `maxDiffPixelRatio: 0.01`, animations disabled                     |
| Tolerance absorbs | Same-platform antialiasing and font-raster noise                                                | Graphics-driver and antialiasing variation; the geometry is proven separately by Node tests (ADR-0061) and the lighting math by core/engine tests (ADR-0065), so the pixels only need to witness gross regressions | Sub-pixel antialiasing between the render host and the CI runner   |

### Exact refresh recipes

**App visual (darwin, local):**

```sh
pnpm build && pnpm e2e --update-snapshots=missing --project=chromium
```

Use `=missing` to seed, `=all` to force-overwrite. Drop `--project` to refresh the firefox and webkit darwin baselines too. For `-linux` app baselines there is `pnpm e2e:update-snapshots` (docker, pinned Playwright image); note it renders host-architecture linux pixels and passes bare `--update-snapshots` across every project, so on an arm64 Mac its output will not match the amd64 CI runner. No `-linux` app baselines are committed as of 2026-07-05.

**Scene WebGL, `-darwin` family (dev Mac with a real GPU only):**

```sh
pnpm build && pnpm e2e --project=scene-webgl --update-snapshots=all
```

**Scene WebGL, `-linux` family:** dispatch the `Refresh scene baselines` workflow (`refresh-scene-baselines.yml`, `workflow_dispatch` on main), download the `scene-baselines` artifact, commit its PNGs into the two `scene-*.spec.ts-snapshots/` directories as a `test(e2e):` commit. An intentional harness change must refresh BOTH families (ADR-0152).

**Stories:** dispatch the `Refresh story baselines` workflow (`refresh-story-baselines.yml`), download the `story-baselines` artifact, replace `e2e/stories/__screenshots__/`, commit. The docker route (`pnpm stories:update-snapshots`) only matches CI when the host is amd64: arm64 docker renders arm64 chromium pixels that differ from the runner, and amd64 emulation under qemu crashes chromium (ADR-0117). Dev Macs are arm64, so the workflow is the only correct source there.

### Stale doc flags

- `e2e/tests/scene-solar.spec.ts` header comment still says CI neither renders nor checks scene baselines; ADR-0152 made that false on 2026-07-05.
- ADR-0149's "no CI path gates the scene tier" clause is superseded by ADR-0152.
- `CLAUDE.md` still calls the source layers placeholders; all six layers carry real code.

## Self-skip and anti-vacuity patterns

Every conditional skip in this repo is paired with something that stops the suite from passing vacuously. Reuse these patterns; never add a bare skip.

| Pattern                                                                                      | Where                                                                       | Guards against                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing-baseline platform skip with a regeneration hint in the skip message                  | `visual-regression.spec.ts`                                                 | Failing on platforms that legitimately have no baseline, while telling the reader how to seed one                                                                                                            |
| `hasWebGl2` in-page probe (`canvas.getContext('webgl2') !== null`)                           | harness specs (`scene-visual-regression`, `scene-solar`)                    | Skipping anywhere except a machine with no usable GL stack; deliberately narrower than the WebGPU guard so the harness runs on SwiftShader                                                                   |
| `hasWebGpu` guard (`navigator.gpu`)                                                          | live-view scene specs (navigation, selection, camera, color temperature)    | Pixel-asserting a nondeterministic WebGPU backend; these specs assert semantically instead (a settled frame changes after an action, via the two-identical-screenshots poll in `e2e/tests/scene-helpers.ts`) |
| Zero-stories loud failure                                                                    | first test in `story-visual.spec.ts` asserts at least one testable story id | A missing `storybook-static/index.json` silently registering zero baseline tests                                                                                                                             |
| Two-layer scene gating: spec probes the environment, CI job gates on committed `-linux` PNGs | ADR-0152                                                                    | Running specs against snapshots that do not exist vs skipping on machines that cannot render                                                                                                                 |
| Coverage ratchets that fail on stale entries                                                 | `scripts/story-coverage/` allowlist; `integration:audit` required list      | Allowlists silently growing or coverage claims going stale                                                                                                                                                   |
| Capability-specific skips with the reason inline                                             | webkit OPFS skips in `durable-storage.spec.ts` and export specs             | Blanket browser exclusions                                                                                                                                                                                   |
| `forbidOnly: !!process.env.CI` in both Playwright configs                                    | config                                                                      | A `.only` sneaking a partial suite past CI                                                                                                                                                                   |

## Baseline review discipline

`.claude/rules.md` codifies the rejection: "Snapshot baselines committed without diff review."

1. Never commit a refreshed PNG you have not looked at. Open before/after (or the Playwright HTML diff report) for every changed file.
2. A refresh must trace to an intentional visual change you can name. Land it as a `test(e2e):` commit that names the intent (history examples: "pin the ambient-occlusion interior baseline", "refresh the site-editor story baseline for the timezone field").
3. If the suite is green against the old baselines, the refresh is sub-tolerance noise: revert the PNGs instead of committing churn. Churned baselines destroy the diff signal for the next real change.
4. Never refresh to silence a failure you cannot explain. Diagnose first (vernacular-debugging-playbook); a baseline update is a claim that the new pixels are correct.

## The journey-coverage gate

`pnpm integration:audit` (runs in the CI check job, exit 1 on violation) reads `e2e/journey-coverage.json` and fails if any capability with `"status": "required"` has no journey test whose title matches EXACTLY, as a literal string inside a `test('...')` call in some `e2e/tests/journeys/*.spec.ts`. 11 capabilities, all required, as of 2026-07-05.

To add a required capability:

1. Write the journey spec at `e2e/tests/journeys/<slug>.spec.ts` driving the real assembled editor; give the test the exact capability title.
2. Add `{ "id": "<slug>", "title": "<exact test title>", "status": "required" }` to `e2e/journey-coverage.json` in the same change (a `pending` status is tracked but unenforced; flip it to `required` in the change that lands the test).
3. Update the human-readable table in `e2e/JOURNEYS.md`. Note: its Status column is stale as of 2026-07-05 (shows `pending` where the json says `required`); the json is the source of truth.
4. Run `pnpm integration:audit` and confirm "clean".

## Adding a test at each tier

| You want to prove                             | Put the test at                                                                                                                                                                                                       | It runs via                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure domain logic or a component behavior     | `<source-dir>/<name>.test.ts(x)` next to the source                                                                                                                                                                   | `pnpm test`; pre-push; CI check (selected by layer on PRs, full in merge queue)                                                                                                                                                                                                   |
| A cross-layer or repo-level invariant         | `tests/<area>/<name>.test.ts` (use `// @vitest-environment node` if it touches fs)                                                                                                                                    | same unit project; `tests/` changes always select it on PRs                                                                                                                                                                                                                       |
| A file-format guarantee                       | `tests/format/<name>.test.ts` against `schema/` and `tests/fixtures/`                                                                                                                                                 | same                                                                                                                                                                                                                                                                              |
| A component renders and is accessible         | `<Component>.stories.tsx` co-located; remove any allowlist entry for that file                                                                                                                                        | `pnpm storybook:test`; CI storybook-build. The story ALSO auto-enrolls in the story visual suite, so seed its `-linux` baseline via the refresh workflow in the same PR or `stories:test` fails on a missing snapshot. Opt a story out of automation with Storybook's `!test` tag |
| A user can do something in the real app       | `e2e/tests/<name>.spec.ts` (no `scene-` prefix)                                                                                                                                                                       | `pnpm e2e` locally (3 browsers); CI chromium only, when decide says so                                                                                                                                                                                                            |
| A required product capability stays reachable | `e2e/tests/journeys/<slug>.spec.ts` + matrix entry (see above)                                                                                                                                                        | e2e + `integration:audit`                                                                                                                                                                                                                                                         |
| Live 3D pane behavior (WebGPU)                | `e2e/tests/scene-<name>.spec.ts` with the `hasWebGpu` guard, asserting semantically via `scene-helpers.ts`                                                                                                            | `scene-webgl` project; skips on CI (SwiftShader has no WebGPU)                                                                                                                                                                                                                    |
| Deterministic 3D pixels                       | a new named harness state or fixture captured in `scene-visual-regression.spec.ts` or `scene-solar.spec.ts` (they reuse `captureShell` with the `hasWebGl2` probe and, for lit states, the `data-harness-ready` wait) | `scene-webgl` project; refresh both baseline families                                                                                                                                                                                                                             |

## FIRST and the codified anti-patterns

From `.claude/rules.md` (applied at every BLUE phase and at PR review):

FIRST: **F**ast (unit tests in milliseconds), **I**ndependent (no shared mutable state), **R**epeatable (deterministic; log random seeds in property-based tests), **S**elf-validating (pass or fail, no manual inspection), **T**imely (written before the implementation, which is the red-green-blue RED phase).

Rejected outright:

- Tests that mock the system under test instead of exercising it.
- Tests modified to make them pass instead of fixing the implementation.
- Test names that describe methods rather than behaviors.
- Commented-out tests without a tracked issue and an explanatory ADR.
- E2E tests that depend on timing (`sleep(500)`); use explicit wait-for-condition (see the `expect.poll` idioms in `scene-helpers.ts` and the harness specs).
- Snapshot baselines committed without diff review.
- Skipping the BLUE phase of the TDD cycle (see vernacular-change-control).

## Common mistakes

- Running `pnpm e2e` without `pnpm build` first, or against a stale preview server. The Playwright web server serves `dist/` on 4173 and `reuseExistingServer` is true locally, so a leftover server keeps serving the old build; kill it after rebuilding.
- `pnpm test -- <path>` does not filter the suite. Use `pnpm exec vitest run --project unit <path>`.
- Naming a non-GPU spec `scene-*.spec.ts`: it silently leaves the chromium/firefox/webkit projects. Conversely, a harness pixel spec outside the `scene-` pattern never reaches the GPU project.
- Treating a green PR as proof the heavy suites ran. Skipped conditional jobs count as pass on PRs; only the merge queue runs everything, and CI e2e is chromium-only even there.
- Expecting CI to catch firefox/webkit or app-visual regressions. Both are local-only evidence as of 2026-07-05.
- Refreshing scene baselines on the wrong machine, or only one family. `-darwin` needs the Metal dev Mac; `-linux` only comes from the dispatch workflow; harness changes need both.
- Refreshing story baselines via docker on an arm64 Mac. The pixels will not match the amd64 runner; use the workflow.
- Adding a story without seeding its `-linux` baseline in the same PR: `stories:test` fails on the missing snapshot.
- Committing a baseline refresh without eyeballing it, or committing sub-tolerance churn instead of reverting it.
- Adding a `test.skip` without a paired anti-vacuity check (loud failure, ratchet, or narrow probe).

## Provenance and maintenance

All facts verified against the repo at commit 6b7d74c6 on 2026-07-05. Volatile items and their re-verification one-liners:

- Pre-push chain: `cat .husky/pre-push`
- ci-complete is the only required check: `gh api repos/drmrd/vernacular/rules/branches/main`
- CI job set and conditions: `sed -n '1,120p' .github/workflows/ci.yml`
- decide rules and path triggers: `sed -n '1,70p' scripts/ci/decide.mjs`
- Selective-test coupling: `cat ci-coupling.json`
- App tolerance (0.02): `grep -n SCREENSHOT_DIFF_TOLERANCE playwright.config.ts`
- Scene tolerances (0.35 / 0.05): `grep -n 'SHELL_' e2e/tests/scene-visual-regression.spec.ts`
- Story tolerance (0.01) and -linux pinning: `grep -n 'STORY_DIFF_TOLERANCE\|snapshotPathTemplate' playwright.stories.config.ts`
- Committed baseline families: `ls e2e/tests/visual-regression.spec.ts-snapshots e2e/tests/scene-visual-regression.spec.ts-snapshots e2e/tests/scene-solar.spec.ts-snapshots`
- Story baseline count (87): `ls e2e/stories/__screenshots__ | wc -l`
- Scene project routing and launch flags: `grep -n 'testMatch\|testIgnore\|SCENE_WEBGL_LAUNCH_ARGS' playwright.config.ts`
- Journey gate state: `pnpm integration:audit && cat e2e/journey-coverage.json`
- Journey spec count (27): `ls e2e/tests/journeys/*.spec.ts | wc -l`
- Stryker break threshold (50) and scope: `cat stryker.conf.json`
- Mutation schedule: `sed -n '1,10p' .github/workflows/mutation.yml`
- Refresh workflows: `ls .github/workflows/refresh-*.yml`
- Scene lane decision record: `head -60 docs/knowledge/decisions/ADR-0152-linux-scene-baseline-lane.md`
- FIRST and anti-patterns: `sed -n '85,111p' .claude/rules.md`
