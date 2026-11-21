---
slug: decisions/ADR-0225-green-commits-are-proven-by-their-red-tests
title: 'ADR-0225: GREEN commits are proven by their RED tests'
type: decision
tags: [tooling, ci, red-green-blue, tdd, testing, mutation, stryker, vitest, coverage]
related:
  [
    decisions/ADR-0025-rgb-audit-and-foundation-acceptance,
    decisions/ADR-0221-deterministic-policy-is-checked-in-ci,
  ]
sourceFiles:
  [
    scripts/green-proof/green-proof.mjs,
    scripts/green-proof/prove-cycle.mjs,
    scripts/green-proof/prove-coverage.mjs,
    scripts/green-proof/prove-mutation.mjs,
    scripts/green-proof/mutation.mjs,
    scripts/green-proof/mutation-budget.mjs,
    scripts/green-proof/mutation-report.mjs,
    scripts/green-proof/test-set.mjs,
    scripts/green-proof/diff-lines.mjs,
    scripts/green-proof/guard-block.mjs,
    scripts/green-proof/coverage.mjs,
    scripts/green-proof/type-check.mjs,
    scripts/green-proof/vitest-run.mjs,
    scripts/green-proof/worktree.mjs,
    scripts/green-proof/green-proof-report.mjs,
    scripts/rgb-audit/cycle-pairing.mjs,
    scripts/policy-check/rule-severity.mjs,
    stryker.conf.json,
    vitest.stryker.config.ts,
    tsconfig.stryker.json,
    package.json,
    .github/workflows/ci.yml,
    .github/workflows/mutation.yml,
  ]
status: current
updated: 2026-11-21
---

# ADR-0225: GREEN commits are proven by their RED tests

## Status

Accepted. It builds on [[ADR-0025-rgb-audit-and-foundation-acceptance]] and
[[ADR-0221-deterministic-policy-is-checked-in-ci]]. The auditor keeps its commit-order and scope
rules, and the new script reports through the same severity table.

## Context

The red-green-blue cycle asks a GREEN commit to hold the smallest code that makes its RED test
pass. Before this change, only the pull request reviewer checked that, by reading each GREEN diff
and judging whether every added line was needed. That took review time, and a reviewer can miss a
line.

`pnpm rgb:audit` checks the order of commits and which files each commit may touch. It never runs
a test. Nothing proved that a RED test failed before its GREEN commit, that it passed after, or
that it ran the lines the GREEN commit added.

The weekly Stryker job, which would be the natural place for a mutation check, had never finished.
It failed on every run (issue #487), so there was no working mutation tooling to build on.

## Decision

### Three proofs and one mutation check

`pnpm green:proof` pairs each GREEN commit in a range with the RED commits since the previous GREEN
commit, the same pool `rgb:audit` consumes. The pairing lives in
`scripts/rgb-audit/cycle-pairing.mjs` and uses the auditor's own role rules, so they have one home.
For each GREEN commit the script runs the unit tests of its RED commits:

1. **RED fails at the parent.** At least one test must fail. A file that does not load counts as a
   failure. Vitest does not type-check, so when the run passes, the script type-checks the RED
   files at the parent with a generated tsconfig. A type error counts as a failure. A run that
   passes and type-checks clean blocks.
2. **RED passes at GREEN.** Every test must pass.
3. **RED runs every executable line the GREEN commit adds.** The run collects V8 coverage in lcov
   form for the changed source files and maps it to the added lines of the diff. An added line with
   a coverage entry and a count of zero blocks. Lines with no entry (types, imports, comments,
   blank lines) are exempt. So are files with no record at all: those on the coverage `exclude`
   list, and files Vitest never instruments (its own `vitest.config.*` and `vite.config.*`, setup
   files, test files), which it adds to `coverage.exclude` where a user config cannot override
   them. The script keeps no copy of either list. A changed source with no record is listed as a
   note. Vitest reads coverage settings only from the root config, so `vitest.config.ts` reuses
   the coverage block of `vite.config.ts`; before this change the exclude list never applied to
   `pnpm test` runs.

   "No record" must really mean excluded, so the run also includes a control file the script
   writes at `.green-proof/coverage-control.mjs`. No test loads it. Vitest gives an included file
   that nothing loaded a zero-count record, and the control pins that on every run. A missing lcov
   file, or an lcov file with no record for the control, is an internal error (exit 2). The
   control file never shows up in a note, a finding, or a mutation target.

4. **Mutation.** Stryker mutates the covered added lines and runs only the RED tests against each
   mutant. A mutant that survives is a warning.

### Which tests count

Only the test files that the paired RED commits changed, and only those that still exist at the
GREEN commit. A unit test is a test file that is not under `e2e/` and not `*.browser.test.ts`.

- A set of only end-to-end or browser tests: the cycle is skipped, and the report names the reason.
- A mixed set: the unit tests run, and the findings of check 1 and check 3 become warnings
  (`mixed-red-passes-before-green`, `mixed-uncovered-added-line`), because the other tests may be
  the ones that need the lines. Check 2 still blocks, since a unit test that fails at GREEN is
  broken whatever else the set holds.
- A set with no test file, only test assets such as fixtures or support modules: the script runs
  the unit tests that import those assets (`vitest related`).

### Moved lines and the direct-invocation block

An added line is exempt when its trimmed text matches a line that the same GREEN commit removes
somewhere. Each removed line exempts one added line only, so a pure move costs no proof.

A script's direct-invocation block is the top-level `if` that runs the command only when Node
starts the file, so no unit test reaches its body. An uncovered added line inside it is the warning
`uncovered-guard-line`. The script finds the block by its shape, with no marker comment: a line at
column 0 that starts with `if (` and ends with `{`, whose condition holds `import.meta.url` or a
top-level `const` initialised from it, closed by the next `}` at column 0. A guard of any other
shape gets no exemption, and neither do uncovered lines outside the block, such as a wrapper that
starts a real process. Command wiring belongs inside the block or in a module of default
dependencies that a RED test runs.

### The four mutated folders and how Stryker is driven

Mutation targets are the covered added lines in `core/`, `storage/`, `session/`, and `scripts/`.
Using only covered lines means a mutant with no coverage never repeats a check 3 finding.

The script writes its configs under `<worktree>/.green-proof/`, which no commit tracks and the
worktree removal deletes: a Vitest config that narrows `include` to the RED files with
`vitest.related` set to false, a Stryker config whose `mutate` array holds `path:start-end`
ranges, the JSON reporter, and `thresholds.break` set to null. A green proof run sets
`incremental` to false, so it never reads or writes the weekly incremental file.

The checker differs by folder. Mutants in `core/`, `storage/`, and `session/` use the `typescript`
checker with the committed `tsconfig.stryker.json`. Mutants in `scripts/` run with no checker: the
scripts are `.mjs` and the tooling config has no `checkJs`, so a checker cannot reject a mutant
there. A spike confirmed this: the same 21 mutants and the same result with and without the
checker, in 11 s against 101 s. A Stryker run that exits nonzero gives one `mutation-run-failed`
warning for that cycle. Mutation is advisory, so its failure is advisory too.

### The rule ids and their severities

The severities live in `RULE_SEVERITY` in `scripts/policy-check/rule-severity.mjs`, the same table
as the policy rules.

| Rule id                         | Severity | What it reports                                                       |
| ------------------------------- | -------- | --------------------------------------------------------------------- |
| `red-passes-before-green`       | fail     | the RED unit tests pass and type-check at the parent                  |
| `red-fails-at-green`            | fail     | a RED unit test does not pass at the GREEN commit                     |
| `uncovered-added-line`          | fail     | the RED tests do not run an executable added line                     |
| `uncovered-guard-line`          | warn     | the same, for a line in the direct-invocation block                   |
| `mixed-red-passes-before-green` | warn     | check 1 fails for a mixed set                                         |
| `mixed-uncovered-added-line`    | warn     | check 3 fails for a mixed set, outside the direct-invocation block    |
| `surviving-mutant`              | warn     | a mutant on an added line survives the RED tests or runs none of them |
| `mutation-run-failed`           | warn     | Stryker exits nonzero for a group of mutants                          |

The rule is to fail what can be decided exactly and to warn where a pattern can misfire. A
surviving mutant can be equivalent, meaning no test can tell it from the original, so mutants never
block. Exit code 0 means no failing finding, 1 means at least one, and 2 means an internal error
such as a range that names no commit. A commit whose only findings are warnings counts as proven.

### Options and report

`--range <base>..<head>` checks every GREEN commit in a range, `--commit <sha>` checks one, and
`--base` (default `origin/main`) sets the base for `--commit` and for a default range.
`--mutation-budget-minutes <n>` caps check 4 and takes a whole number of minutes above 0. The log
uses `--no-merges` and a two-dot range, so a branch that merged `main` into itself is not charged
with main's GREEN commits.

The report starts with a count of proven, skipped, and failed GREEN commits, then lists each commit
with its result, notes, step times, and findings, failing findings first. In CI each finding is a
GitHub annotation that starts with the short sha. An annotation names a line only for the head
commit of the run, because a line number from an earlier GREEN commit would point at the wrong line
of the pull request head. The finding format is shared with `policy:check`, whose output does not
change.

### Worktree and install policy

Each cycle runs in one temporary git worktree under `os.tmpdir()`, removed on exit, including after
a failure and after a Ctrl-C (SIGINT). Ctrl-C stops the running child process, the worktree is
removed, and the process exits 2. This holds because a terminal Ctrl-C reaches the whole process
group. A SIGINT or SIGTERM sent only to the `green:proof` process is ignored.
Each distinct
`pnpm-lock.yaml` in the range gets one `pnpm install --frozen-lockfile`, and cycles with the same
lockfile reuse that install. The script never links the main clone's `node_modules`: on
2026-11-20 the main clone held Vitest 4.1.8 while the lockfile pinned 4.1.12, so a link could prove
a cycle against the wrong versions.

### The CI job

A new job `green-proof` (display name "GREEN proof") runs on `pull_request` only, after `check`,
with full history. It does not install at the root, because the script uses Node built-ins and
installs inside its own worktree. `ci-complete` lists it in `needs`, so a failing proof fails the
required check, and a skipped job on `push` and `merge_group` counts as a pass. The job runs
`pnpm green:proof --range "$PROOF_RANGE" --mutation-budget-minutes 15`, with the range passed
through an environment variable and never as an inline expression. It is a separate job so the
fast `ping-pong` job stays fast. The job timeout is 60 minutes, twice the longest measured run rounded up to 5 minutes.

### The mutation time budget

Mutation dominates the cost: one run over a script file takes about 101 s, and a pull request with
28 GREEN commits would add about 47 minutes. The owner capped check 4 in CI at 15 minutes. The
script proves cycles newest GREEN commit first, starts no new mutation run once the time spent on
earlier runs reaches the budget, and lets a run that has started finish. Only mutation time counts.
Checks 1 to 3 run on every GREEN commit and still block. A commit the budget did not reach gets the
note `mutation check not reached: the time budget was spent`, which is not a finding and never
changes the exit code. The header also counts how many cycles were not reached. Without the option
there is no cap, so a local run mutates every cycle it checks.

### Who runs it locally

The main thread runs `pnpm green:proof --commit HEAD` in the background after each GREEN commit,
while the `/clean-code-review` agent reviews the cycle, so the proof adds little time. It reads the
summary before dispatching `/refactor` and passes it on in the refactor brief. A failing finding
goes to the main thread first. The RED, GREEN, and refactor agents never run it. Locally the
script needs the sandbox off, because `git worktree add` fails inside it.

### The weekly Stryker job (#487)

The weekly job stopped after instrumenting with `Cannot find Checker plugin "typescript"`, with
`@stryker-mutator/typescript-checker` installed. It had four causes:

- pnpm's layout hides the default `@stryker-mutator/*` plugin glob from core, so
  `stryker.conf.json` now lists `plugins` explicitly.
- The root `tsconfig.json` has `references`, which puts the checker in build mode, turns on
  `declaration`, and fails with TS4058 on an unrelated test setup file. The committed
  `tsconfig.stryker.json` extends it without `references`, and the checker starts.
- Stryker 8.7.1 rejects the `vitest.related` option, and without it the initial run crashes on
  Vitest 4. Core, `vitest-runner`, and `typescript-checker` moved together to 10.0.0, the newest
  release past the 30-day cooldown on 2026-11-20 (10.1.1 was still inside it). 10.0.0 accepts
  `related: false`.
- `mutate:check` passed `--dryRun`, which is not a Stryker flag. It is now `--dryRunOnly`.

The initial test run takes about 7 to 8 minutes on the owner's Mac for 6361 tests, and the default
dry-run limit of 5 minutes killed it, so `dryRunTimeoutMinutes` is 30. The dry run needs a Vitest
config that leaves out `**/*.browser.test.ts`, which need a real browser, and
`tests/format/current-schema-validator.test.ts`, which sees the instrumented `core/` as schema
drift. That config is `vitest.stryker.config.ts`. A full run of `core/` is an estimated 270 minutes
on that Mac and far more on a hosted runner, so the weekly job runs in incremental mode, with the
incremental file on the orphan branch `stryker-incremental`. The job has a 360-minute limit, and a
run that is cancelled or times out still saves its partial file, so the next week resumes from it.

## Consequences

- A pull request with GREEN commits gains a CI job. The first measurement ran checks 1 to 3 over the
  28 GREEN commits of one earlier pull request in 3 to 6 minutes on the owner's machine, and
  uncapped mutation would have added about 47 more. With the 15-minute cap, that range took
  29 min 43 s under heavy load, and the cap was never reached. That reading is weak: 27 of the 28
  Stryker runs stopped at start, because those commits predate the Stryker 10 upgrade, so the
  mutation time there is not a real measure. The cap and the 60-minute job timeout rest on this
  pull request's own range, which changes only tooling under `scripts/`. No range with application
  code has been measured yet. One synthetic 6-line change in `core/` spent 399 s in the mutation
  check on a loaded machine. The cap and the warn-only status of check 4 keep the job inside its
  timeout.
  The 16 GREEN commits of this decision's own pull request took 12 min 16 s: mutation 17 s median and
  64 s at most per commit, 33 surviving mutants, all 16 commits reached.
- Check 4 cannot run on commits made before the Stryker 10 upgrade and its `plugins` line. Their own
  Stryker crashes under Vitest 4, so each such commit gets a `mutation-run-failed` warning. This
  affects only history from before this change.
- Reviewers can stop reading GREEN diffs for minimality and look only at cycles the job skipped.
  The reviewer and command text that says so lives under `.claude/`, which the sandbox cannot
  write, so the owner applies those edits.
- Equivalent mutants are noise, and that is why mutants stay warnings. A surviving mutant means the
  line deserves a look, not that the code is wrong.
- Cycles whose RED tests are only end-to-end tests stay unproven. The report lists them with the
  reason. The first measurement found three failures, all true: real process wrappers and
  fallbacks outside the guard block that the RED tests did not reach. Measuring them led to the
  direct-invocation exemption.
- Check 4 depends on the cap. A pull request with many script cycles will often leave its older
  GREEN commits unmutated, and that is the intended trade.
- The weekly job is only as fresh as its incremental file, and a Stryker upgrade that changes
  mutant ids means seeding the file again.

## Alternatives considered

- **Add the checks to `rgb:audit`.** One report, but the fast ping-pong job would grow from seconds
  to minutes, and one script would mix a history audit with test runs. Rejected.
- **Stryker only.** Stryker reports mutants with no coverage, so one tool could answer the coverage
  question too. But a line with no mutation operator gets no check, and Stryker does not run over
  the UI folders, which still need coverage. Rejected.
- **Link the main clone's `node_modules` into each worktree.** Faster, but unsafe, as the Vitest
  version mismatch above shows. Rejected for one install per lockfile.
- **Let mutants block.** Equivalent mutants would fail pull requests on noise. Rejected.

## References

- Spec: `docs/specs/2026-11-20-green-commit-proof.md`.
- Plan: `docs/plans/2026-11-20-green-commit-proof.md`, including its spike and measurement
  results.
- Issue #487, the weekly Stryker job that never completed.
- Pull request #961, the 28-commit range of the first measurement.
