---
slug: decisions/ADR-0171-live-view-ci-render-lane
title: 'ADR-0171: Live-view WebGPU visual regression runs on a macOS CI lane'
type: decision
tags: [ci, visual-regression, webgpu, 3d-preview, testing]
related:
  [
    decisions/ADR-0149-harness-lighting-readiness,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0152-linux-scene-baseline-lane,
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
  ]
sourceFiles:
  [
    .github/workflows/ci.yml,
    e2e/tests/scene-live-view-visual-regression.spec.ts,
    e2e/tests/journeys/perceived-color-readout.spec.ts,
    e2e/tests/journeys/close-doors-and-windows.spec.ts,
    scripts/ci/decide.mjs,
  ]
status: current
updated: 2026-11-17
---

# ADR-0171: Live-view WebGPU visual regression runs on a macOS CI lane

## Status

Current. Rendering-realism lane 3 (issue #469), decided in the gates-first spec of 2026-09-06.

> Amended on 2026-11-15 (issue #721). GitHub retired the `macos-14` runner image, and the job
> could no longer start. It now runs on `macos-15`, pinned by number. Run 43765231877 on the
> `macos-15-arm64` image (macOS 15.8.2) ran the spec without a skip and passed against the
> committed `-darwin` baseline at the standing tolerances, so points 1 and 2 of the decision hold
> on the new image. A move to a later image is a deliberate change that needs the same proof.

> Amended on 2026-11-16 (issue #745). The job now runs a second spec on the same adapter: the
> perceived-color journey (`e2e/tests/journeys/perceived-color-readout.spec.ts`), under the
> `chromium` project, after the visual diff. Its step sets `E2E_REQUIRE_WEBGPU=1`, so a runner
> that gives no WebGPU adapter fails the step instead of skipping it. For the journey, this closes
> the silent-skip gap that the Consequences section describes. The visual spec still self-skips
> without an adapter.

> Amended on 2026-11-17 (issue #782). The job runs a third spec on the same adapter: the
> close-doors-and-windows journey (`e2e/tests/journeys/close-doors-and-windows.spec.ts`), in its
> own step after the perceived-color journey. That step also uses the `chromium` project and sets
> `E2E_REQUIRE_WEBGPU=1`. The journey compares frames taken within one run and commits no
> baseline, so it adds nothing to the baseline refresh rule below. Its run time on the runner is
> not measured yet, and the cost figures under Consequences predate it.

## Context

The live-view visual spec (`e2e/tests/scene-live-view-visual-regression.spec.ts`) pixel-tests
the render path a user actually sees: the editor's live pane through `WebGPUSceneView` on a
real WebGPU adapter. It landed with one darwin baseline and ran only on the development Mac,
because the linux CI runners expose no WebGPU adapter and the spec self-skips there. So no CI
job covered the live render path, which is how the session-state regression fixed by #603
reached main unseen, and ADR-0151 had already recorded the backend-split risk as uncovered.

## Decision

CI runs the live-view spec in a dedicated `live-view-visual` job on the `macos-15` runner,
aggregated by `ci-complete` like every other heavy job. Since 2026-11-16 the job also runs the
perceived-color journey on the same adapter, and since 2026-11-17 the close-doors-and-windows
journey (see the amendments above).

1. **The runner is `macos-15`.** It was `macos-14` when the lane landed. A probe on the lane
   branch (run 34067553157, on `macos-14`) showed its chromium exposes a Metal-backed WebGPU
   adapter: the spec ran there rather than self-skipping, and passed in 7 seconds.
2. **One baseline serves the development Mac and the runner.** The probe passed against the
   committed `-darwin` baseline at the standing tolerances (per-pixel 0.35, ratio 0.05), and
   the seeded-defect run reported the same 31579-pixel diff the development Mac measured
   locally, so the two environments render the frame alike. The lane committed no new pixels
   and no new snapshot suffix. If a runner image update ever drifts past the tolerances, the
   job fails with the actual render attached, and the fix is a deliberate baseline refresh,
   the standing scene-tier rule.
3. **The job shares the e2e decide gate** (`decide.outputs.e2e`). The captured frame
   composites editor overlay text over the canvas, so the paths that can move the frame are
   the paths of the e2e list, and the gate brings `ci:full`, `ci:skip-heavy`, `run:e2e`, and
   draft handling with it. This lane left `decide.mjs` unchanged, with only `app/`, `editor/`,
   `bridge/`, `engine/`, and `e2e/` in that list. Since 2026-11-17 the list also holds the files
   that shape an end-to-end run (see the amendment at the end of this record).

## Evidence

The red proof (run 34067973637) seeded a live-view-only transform defect, a 0.35 radian yaw
around the live scene contents in `bridge/react/webgpu-scene-view.tsx`. The new job failed at
31579 differing pixels (ratio 0.12) while the harness jobs, the e2e suite, and the scene
visual job all stayed green, and `ci-complete` failed on the aggregate. The defect commit was
dropped before merge. A camera-seed defect was tried first and the spec masked it: the capture
applies the top-down preset after mount, so the initial camera never reaches the frame. Defects
for this gate must move the rendered scene, not the opening vantage.

## Consequences

- A triggered run costs about a minute and a half of macOS-runner time (the probe ran 76
  seconds and the red proof 80; install and build dominate, and the spec itself takes
  seconds), and macOS minutes bill at ten times linux minutes. The e2e gate keeps
  the job off docs-only pull requests; this lane's own first head demonstrated the skip. A
  pull request that changes only configuration skips the job unless the file is on the e2e
  list (see the amendment of 2026-11-17).
- The live path now has the same drift discipline as the harness tier: an intentional visual
  change refreshes the baseline deliberately, on the development Mac, in the pull request that
  makes the change.
- The spec still self-skips where no adapter exists, so a future runner-image change that
  removes the adapter would surface as a silent skip, not a failure. The job's `--reporter=list`
  output names the skip when it happens; a skip on a pull request that should exercise the
  live view is a signal to investigate the runner image, and a follow-up gate that fails on
  an unexpected skip is open as a hardening option. The two journeys already have that gate:
  each step sets `E2E_REQUIRE_WEBGPU=1`, and each spec then fails without an adapter.

## References

- Issue #469 (the lane), issue #603 (the regression class that motivated it).
- `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md`, lane 3.
- Probe run 34067553157; red-proof run 34067973637.
- ADR-0149 (where scene baselines render), ADR-0152 (the linux scene lane this complements).

## Amendment 2026-11-17: the paths that turn on the heavy suites

Issue #810. On a pull request, `scripts/ci/decide.mjs` turns on a heavy suite when a changed
path starts with an entry of its lists. Until now the lists held the application layers,
`e2e/`, and `.storybook/`. The files that shape a heavy run were on no list, so a pull request
that changed only such a file ran neither the end-to-end suite nor the story visuals. Pull
request #773 is the example. It changed only `playwright.config.ts`, to read the preview port
from `E2E_PORT`, and the lists of the time turned on no heavy suite for it.

The rule: a path is on a list when a change to it can alter the result of a heavy suite and no
cheaper job proves the change. Selecting too much is accepted. A push to `main` runs every
suite, so a path left off costs a late failure, not a lost one.

The lists as committed. `E2E_PATHS` is `app/`, `editor/`, `bridge/`, `engine/`, `e2e/`,
`playwright.config.ts`, `vite.config.ts`, `index.html`, `src/`, `public/`, `pnpm-lock.yaml`.
`VISUAL_PATHS` is `editor/`, `bridge/react/`, `.storybook/`, `playwright.stories.config.ts`,
`e2e/stories/`, `vite.config.ts`, `vitest.config.ts`, `public/`, `src/setupTests.ts`,
`scripts/serve-static.mjs`, `scripts/story-index.mjs`, `pnpm-lock.yaml`. A `.stories.tsx` file
still turns on the visual suite.

| Entry                          | Suite      | Reason                                                                         |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| `playwright.config.ts`         | end-to-end | It sets the projects, the preview port and server, and the retries.            |
| `vite.config.ts`               | both       | The e2e job builds and previews with it; the story test project extends it.    |
| `index.html`                   | end-to-end | It is the entry document of the bundle that the suite loads.                   |
| `src/`                         | end-to-end | Only this suite runs the bootstrap, service worker, and storage hook.          |
| `public/`                      | both       | The app serves it (manifest, starter pack); the stories use its mock worker.   |
| `pnpm-lock.yaml`               | both       | It sets the version of every tool and library that a heavy suite runs.         |
| `playwright.stories.config.ts` | visual     | It sets the story server, the snapshot path, and the diff tolerance.           |
| `e2e/stories/`                 | visual     | Its spec and baselines run only in the story job.                              |
| `vitest.config.ts`             | visual     | It defines the `storybook` test project, which runs only in that job.          |
| `src/setupTests.ts`            | visual     | The `storybook` project extends `vite.config.ts`, whose `setupFiles` names it. |
| `scripts/serve-static.mjs`     | visual     | It is the web server command of `playwright.stories.config.ts`.                |
| `scripts/story-index.mjs`      | visual     | The story visual spec imports it.                                              |

The build in `check` proves only that `vite.config.ts` compiles. The story build copies
`public/`, and `.storybook/preview.ts` starts the mock service worker that `package.json` places
there. `src/setupTests.ts` also turns on the end-to-end suite through `src/`, and `e2e/stories/`
does through `e2e/`. Both are accepted. #720 shows why the lockfile is on the lists: it upgraded
Vite, Vitest, and Storybook in `package.json` and the lockfile only, and its paths turned on no
suite. Four merged pull requests since 2026-08-01 changed the lockfile and no listed path, so
this adds about one run a month of both suites and this job.

Off on purpose. `tsconfig*.json`: the typecheck and the build in `check` prove them. An option
that changes the emitted code is an accepted gap. `tsconfig.json` sets `jsx`, `target`, and
`useDefineForClassFields`; this record does not check which of them reach the bundle. The rest
of `scripts/`: its unit tests prove it. `package.json`: `check` installs with
`--frozen-lockfile`, so a version change also changes the lockfile, while a release pull request
changes `package.json` for the version number alone. A change to a script alone is an accepted
gap. `lighthouserc.json`: Lighthouse never runs on a pull request. `.nvmrc`: `check` reads it
and proves the Node version.

This job shares the `e2e` gate. It now also runs for a pull request that changes only
`playwright.config.ts`, `vite.config.ts`, `index.html`, `src/`, `public/`, or `pnpm-lock.yaml`.
Each such run costs what Consequences gives for a triggered run, and that figure predates the
third spec. Since 2026-08-01 these paths changed in 2, 0, 0, 2, 0, and 6 commits, in that
order, out of 1542 on `main`. These are commit counts from the git history, not pull request
counts.

Two choices stay open for one follow-up issue, which has no number yet. Two analyses disagree on
both.

- `core/` and `storage/`. The scene that the live view renders and the journeys run code from
  both layers, yet the lists have left them out since `decide.mjs` landed, and no record says
  why. The first analysis puts them on the e2e list. The review leaves them off, because this
  job would then run for many more pull requests. In the git history since 2026-08-01, 27
  merged pull requests changed these layers. Sixteen also changed a listed path and ran the
  suites anyway. The other eleven are the added cost: with the layers listed, each would have
  run the end-to-end suite and this job. Only #794 changed nothing outside the two layers: a
  fix to the site grade in the memoized scene graph deriver, which reached `main` with no
  live-view run from its paths. The history cannot show whether a label turned a suite on by
  hand. The commit counts (201 for `core/`, 42 for `storage/`) overstate the cost.
- `.github/workflows/ci.yml`. A change can alter every heavy job: the runner image, the
  install, the commands. #697 and #722 changed runner images, and their paths turned on no
  suite. The first analysis puts the file on both lists. The review leaves it off: a person
  edits it on purpose and can ask for a full run by hand with `/ci full`. It changed in 9
  commits since 2026-08-01; three merged pull requests changed it and no listed path.

The tests are in `scripts/ci/decide.test.mjs`, block "the paths that shape a heavy run". Two
rows prove that each Playwright config turns on its own suite and only that one. Seven rows
prove the suites for `vite.config.ts`, `vitest.config.ts`, `index.html`, two `src/` files, a
`public/` file, and the story spec; the `public/` row expects both suites. Five more rows cover
the lockfile and the files that the story job loads: the mock service worker, `src/setupTests.ts`,
the two story scripts, and `pnpm-lock.yaml`. Guard rows prove that `README.md`, a spec under
`docs/`, `scripts/ci/decide.mjs`, `tsconfig.json`, `package.json`, and
`scripts/knowledge-index.mjs` turn on nothing, that an end-to-end test outside `e2e/stories/`
leaves the story visuals off, and that a draft still skips. The run gave 1 file and 32 tests
passed: the 10 earlier cases and 22 new ones.

This pull request changes `scripts/ci/` and this record, so its own rule turns on no heavy suite.
The unit step selects the tests of `scripts/`.
