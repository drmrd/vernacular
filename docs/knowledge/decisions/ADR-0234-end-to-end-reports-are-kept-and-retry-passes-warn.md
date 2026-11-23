---
slug: decisions/ADR-0234-end-to-end-reports-are-kept-and-retry-passes-warn
title: 'ADR-0234: Every end-to-end report is kept, and a retry pass only warns'
type: decision
tags: [tooling, ci, playwright, github-actions, e2e]
related:
  [
    decisions/ADR-0171-live-view-ci-render-lane,
    decisions/ADR-0225-green-commits-are-proven-by-their-red-tests,
  ]
sourceFiles:
  [
    .github/workflows/ci.yml,
    playwright.config.ts,
    playwright.stories.config.ts,
    scripts/ci/retry-warning.mjs,
  ]
status: current
updated: 2026-11-23
---

# ADR-0234: Every end-to-end report is kept, and a retry pass only warns

## Status

Current. Decided by the owner on 20 November 2026 as two rules, and landed with the branch
`fix/keep-e2e-reports-and-warn-on-retries`. The owner settled the trace question on 23 November
2026 (see "The trace setting").

## Context

CI runs each Playwright test up to three times, so a test that fails once and passes on a retry
leaves the job green. The only sign was a line "1 flaky" in the job log. The job uploaded its
report only when the job failed, so the screenshot and the error of a first attempt that a retry
covered were thrown away with the runner.

Issue #881 collected five such cases among 72 green runs of the end-to-end job from 16 to 18
November 2026. Each was a journey that clicks or drags on the plan canvas, and in each the first
attempt aimed at a point the canvas had already left. The cause turned out to be a web font that
arrives late. On the linux runner, the fallback face is wider than the web face, so the header
wraps to a second row until the font files arrive, and then the plan canvas jumps up by 22
pixels. A separate change made the journeys wait for the fonts. This record covers the other half
of the issue: how CI should treat a retry pass, and how to keep the evidence of one.

## Decision

Two rules, and a few details that follow from them.

**Every end-to-end job keeps its report.** `e2e`, `scene-visual`, `storybook-build`, and
`live-view-visual` upload their report on every run that is not cancelled, green runs too. The
artifact is kept for 7 days. It holds the screenshot and the error of each failed attempt, also for
a test that passed on its retry. The report has no trace of the first attempt.

**A retry pass leaves the job green and writes a warning.** After the test step, each job runs
`node scripts/ci/retry-warning.mjs` on the Playwright JSON report. A test whose status in that
report is `flaky` (failed, then passed on a retry) is listed in the job summary under "Warning:
tests passed only on a retry", with its file, line, project, failed attempts, and first error. The
script also prints a `::warning` annotation for each one, so the test file shows the warning. The
script always exits 0. When no test passed only on a retry, it writes one line saying so, with the
number of tests and reports it read. That line shows that the step ran on a real report: a job
summary without it points to a fault in the wiring, and a count above zero shows the report was
not empty.

The details:

- Under `CI`, both Playwright configs add the `json` reporter beside `github` and `html`. The JSON
  file goes to `reports/playwright/`, not into `playwright-report/`, because the HTML reporter
  empties its own folder.
- `live-view-visual` passes `--reporter=list,json` on each of its seven steps, which keeps the
  readable log on the macOS runner. Each step gets its own `--output` folder and its own JSON file
  through `PLAYWRIGHT_JSON_OUTPUT_FILE`. Playwright empties the output folder at the start of each
  run, so without separate folders a green run would delete the evidence of every step but the
  last. That job has no HTML report. `test-results/` and the JSON files hold the screenshot and the
  error.
- The artifact name ends in `-attempt-<run attempt>`. `actions/upload-artifact@v4` refuses a second
  artifact with the same name in one workflow run. Once the upload runs on every run, a re-run of a
  green job would fail at the upload step and turn the job red. The suffix avoids that and keeps
  the report of the earlier attempt.
- `storage-browser` and the `pnpm storybook:test` step run Vitest in browser mode and have no
  retries. The two manual baseline-refresh workflows already upload on `always()`. None of them
  changed.

### The trace setting

`trace: 'on-first-retry'` stays. The owner's first rule keeps the screenshot and the error but not a trace, and he read that as "no trace of the first attempt, and no new trace setting". A run with no retry
holds no trace at all. When a retry does happen, the report holds a trace of the second attempt,
which is the best evidence there is for a hard failure. The owner confirmed this on 23 November 2026.

## Alternatives considered

- **Upload the report only when a test was retried.** This needs a step that reads the report
  before the upload and then decides. A green run would then have nothing to compare against, and
  the one-line note could not tell a skipped step from a clean run. One artifact per run is cheap
  at 7 days of retention.
- **Fail the job on a retry pass now.** A known flake could then block merges. The owner chose to
  start with a warning and see how often it fires.
- **A custom Playwright reporter.** It would collect the same data inside the test runner, but it
  adds a module that the runner loads on every run. A plain script on the JSON report works the
  same way on every job, has unit tests under `scripts/ci/`, and follows the shape of
  `decide.mjs` and `select-tests.mjs`.
- **`trace: 'off'` under `CI`.** It would honor "no trace" more literally, but a hard failure would
  lose its retry trace.

## Consequences

Every end-to-end run adds one artifact, and the macOS job adds the JSON files of seven steps. A
person reading a green job can see a retry pass in its summary and open the report to read the
failed attempt. The cost is storage for 7 days.

The decision is meant to be temporary on the second rule. A follow-up issue tracks the switch to
failing the job on a retry pass. It waits for 100 runs in a row of the four jobs, on `main` and in
the merge queue, with no retry pass. The switch sets `failOnFlakyTests` under `CI` in both
configs (Playwright 1.60 supports it), keeps `retries: 2`, and keeps the warning step so that a red
job still says why. When it lands, this record gets a superseding note and `CONTRIBUTING.md` is
updated.

The green-run proof of ADR-0225 applies to the script. It exempts the direct-invocation block at
the bottom of `scripts/ci/retry-warning.mjs` and requires the tests to reach every other added
line.
