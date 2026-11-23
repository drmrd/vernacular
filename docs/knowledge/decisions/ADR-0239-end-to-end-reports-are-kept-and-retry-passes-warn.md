---
slug: decisions/ADR-0239-end-to-end-reports-are-kept-and-retry-passes-warn
title: 'ADR-0239: Every end-to-end report is kept, and a retry pass only warns'
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

# ADR-0239: Every end-to-end report is kept, and a retry pass only warns

## Status

Current. Decided by the owner on 20 November 2026 as two rules, and landed with the branch
`fix/keep-e2e-reports-and-warn-on-retries`. The owner settled the trace question on 23 November
2026 (see "The trace setting").

## Context

CI runs each Playwright test up to three times, so a test that fails once and passes on a retry
leaves the job green. The signs were a "1 flaky" line in the job log and the error annotation of
the `github` reporter. Neither says that the test passed on a retry, the job summary said nothing,
and `live-view-visual` had only the log line. The job uploaded its report only when the job
failed, so the screenshot and the error of a first attempt that a retry covered were thrown away
with the runner.

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
`live-view-visual` upload their report on every run that is not canceled, green runs too. The
artifact is kept for 7 days. It holds the screenshot and the error of each failed attempt, also for
a test that passed on its retry. The report has no trace of the first attempt.

**A retry pass leaves the job green and writes a warning.** After the test step, each job runs
`node scripts/ci/retry-warning.mjs` on the Playwright JSON report. A test whose status in that
report is `flaky` (failed, then passed on a retry) is listed in the job summary under "Warning:
tests passed only on a retry", with its file, line, project, failed attempts, and first error. The
script also prints a `::warning` annotation for each one, so the test file shows the warning. The
script exits 0 in every case a runner step can reach. One edge exits 1: a working directory that
no longer exists. A runner step cannot hit it, and issue #1116 covers it. When no test passed
only on a retry, it writes one line saying so, with the number of tests and reports it read. That
line with a test count above zero shows that the step ran on a real report: a green job summary
that has neither this line nor the retry warning points to a fault in the wiring. When no report
could be read, the script writes `Retry check: not done. No Playwright JSON report could be read.`
instead.

The report and retry-check steps are skipped when the job's test step (the first of the seven in
`live-view-visual`) never ran, so an install or build failure adds no noise (the conditions use
`steps.<id>.conclusion != 'skipped'`).

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
- The artifact name ends in `-attempt-<run attempt>`. A re-run that reuses a fixed name may be
  refused as a name conflict, so each attempt keeps its own artifact name, and the report of the
  earlier attempt stays.
- `storage-browser` and the `pnpm storybook:test` step run Vitest in browser mode and have no
  retries. The two manual baseline-refresh workflows already upload on `always()`. None of them
  changed.

### The trace setting

`trace: 'on-first-retry'` stays. The owner's first rule keeps the screenshot and the error but not
a trace. It is read as "no trace of the first attempt, and no new trace setting", and the owner
confirmed that reading on 23 November 2026. A run with no retry holds no trace at all. When a
retry does happen, the report holds a trace of the second attempt, which is the best evidence
there is for a hard failure.

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

The decision is meant to be temporary on the second rule. Issue #1116 tracks the switch to
failing the job on a retry pass. It waits for 100 runs in a row of the four jobs, on `main` and in
the merge queue, with no retry pass. The switch sets `failOnFlakyTests` under `CI` in both
configs (Playwright 1.60 supports it), keeps `retries: 2`, and keeps the warning step so that a red
job still says why. When it lands, this record gets a superseding note and `CONTRIBUTING.md` is
updated.

The GREEN proof of ADR-0225 applies to the script. It exempts the direct-invocation block at
the bottom of `scripts/ci/retry-warning.mjs` and requires the tests to reach every other added
line.
