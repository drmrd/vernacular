# GREEN commit proof

Status: approved by the owner, 2026-11-20. Decision record: ADR-0225.

## Why

The red-green-blue cycle keeps a GREEN commit to the smallest code that makes its RED test pass, and keeps refactors in their own BLUE commit. Today only a reviewer who reads the diff checks that a GREEN commit is minimal. `rgb:audit` checks commit order and which files each commit may touch. It never runs a test. Nothing proves that a RED test failed before its GREEN commit, that it passes after, or that the RED test needed each line the GREEN commit added.

This work replaces that reading with a script. It is one item of the 2026-11-19 workflow token review: deterministic checks replace review effort where a script gives a better answer.

## Goals

- For each GREEN commit in a pull request range, prove three things with the unit tests of its RED commits:
  1. The RED tests fail at the parent of the GREEN commit.
  2. The RED tests pass at the GREEN commit.
  3. The RED tests run every executable line that the GREEN commit adds.
- Mutate the added GREEN lines with Stryker, run only the RED tests against each mutant, and report each mutant that survives.
- Run the same script in CI on every pull request and locally after each GREEN commit.
- Make the weekly Stryker job run to completion (issue #487).

## Non-goals

- No check of old history. The script checks pull request ranges only.
- No proof for cycles whose RED tests are only end-to-end tests. Those cycles keep today's level of proof.
- No change to the commit rules that `rgb:audit` enforces, and no change to its speed.
- No change to which folders the weekly full Stryker run mutates.

## Anti-goals

- A check that fails pull requests on noise. A surviving mutant can be equivalent (no test can tell it from the original), so mutants never block.
- A check that slows the fast ping-pong job. The new work goes in its own job.
- A check that forces UI or 3D cycles to add unit tests they do not need.

## Decisions (owner, 2026-11-20)

| Topic                                                        | Decision                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Uncovered added line                                         | Blocks the check.                                         |
| Surviving mutant on an added line                            | Warning annotation only.                                  |
| Which tests count                                            | Only the test files that the paired RED commits changed.  |
| RED commit with only end-to-end test files                   | The cycle is skipped. The report lists it and the reason. |
| RED tests do not fail at the parent, or do not pass at GREEN | Blocks the check.                                         |
| Folders that incremental Stryker mutates                     | `core/`, `storage/`, `session/`, `scripts/`.              |
| Shape                                                        | A new script and a new CI job (approach 1 below).         |
| Lines that a GREEN commit only moves                         | Exempt from coverage and mutation.                        |
| Uncovered line in a script's direct-invocation block         | Warning only; uncovered lines outside it still block.     |
| Mutation check time in CI                                    | Capped at 15 min, newest GREEN commit first.              |

## Approaches

1. **New `scripts/green-proof/` script and its own pull request job (chosen).** It reuses the cycle pairing of `rgb:audit` and the file-section split in `scripts/rgb-audit/commit-diff.mjs`. It checks out each RED and GREEN commit in a temporary worktree and runs Vitest and Stryker there. `rgb:audit` stays a fast, git-only check. The cost is a CI job that takes minutes on a pull request with many cycles.
2. **Add the checks to `rgb:audit`.** One report, but the ping-pong job grows from seconds to minutes and one script would mix a history audit with test runs. Rejected.
3. **Stryker only.** Stryker reports mutants with no coverage, so one tool could give both answers. A line with no mutation operator gets no check, and Stryker does not run on the four UI folders, which still need coverage. Rejected.

## Design

### Cycle pairing

The script reads the range the same way `rgb:audit` does (`parseGitLog`, the same commit roles: `test:` without the `e2e` scope is RED, `feat:` and `fix:` are GREEN, `refactor:` is BLUE, infrastructure commits are exempt). A GREEN commit pairs with every RED commit since the previous GREEN, the same pool that `rgb:audit` consumes. `rgb:audit` today keeps only a count of that pool, so the pairing needs the list of RED commits. The builder can export a pairing function from `cycle-audit.mjs` or write one in the new script. Prefer one source of the role rules.

The RED test set of a GREEN commit is the union of test files that its RED commits added or changed and that still exist at the GREEN commit. A RED commit with no preceding pool or a GREEN commit with no RED pool already fails `rgb:audit`; the new script skips those commits with a note.

### Which tests run

- A RED test file is a unit test if the Vitest `unit` project selects it (`vitest.config.ts`): not under `e2e/`, not `*.browser.test.ts`, not a story.
- **Only end-to-end or browser tests in the set:** skip the cycle, with a note that names the reason.
- **Mixed set (unit tests plus end-to-end or browser tests):** run the unit tests. Report the RED and coverage results as warnings, not failures, because the other tests can be the ones that need the lines. _(Orchestrator's call.)_
- **No test file in the set:** a RED commit can change only test assets (fixtures, `-contract.ts`, `-test-support` files, snapshots); 8 of 548 RED commits since 2026-09-01 did. The script then runs the unit tests that import those assets (`vitest related` in the `unit` project). _(Orchestrator's call.)_

### Checks for one GREEN commit

1. **RED fails at the parent.** At the GREEN commit's parent, run the RED unit test files. At least one test must fail. A run that fails because a file does not load (a missing module or export) counts as a fail. Vitest strips types and does not type-check, so a RED test can fail only on a type error (a new parameter or field). When the run passes, the script type-checks the RED files at the parent with the repository TypeScript config; a type error in a RED file counts as a fail. A run that passes and type-checks clean blocks. _(Orchestrator's call: `tsc` runs only in this case, so its cost is rare.)_
2. **RED passes at GREEN.** At the GREEN commit, run the same files. Every test must pass. A failure blocks.
3. **Diff coverage.** In the same run, collect V8 coverage for the source files the GREEN commit changed. Map it to the added lines of the GREEN diff. A line is executable if the coverage report has a line entry for it. An executable added line with a count of zero blocks. Added lines with no entry (types, imports, comments, blank lines) are exempt. Moved lines are exempt: an added line whose text, with leading and trailing whitespace removed, matches a line that the same GREEN commit removes in any file. Each removed line can exempt one added line only. `commit-diff.mjs` splits a diff into file sections but does not read hunk line numbers, so the script needs a new hunk parser that gives the new-file line number of each added line.

   The direct-invocation block of a script is the exception. It is the top-level `if` that runs the command only when Node starts the file itself, so no unit test can reach its body. An uncovered added line inside that block is a warning (`uncovered-guard-line`), not a failure. The script finds the block by its text in the GREEN commit's version of the file, with no marker comment. The block starts at a line that begins at column 0 with `if (`, ends with `{`, and has a condition that contains `import.meta.url` or the name of a top-level `const` whose initializer contains `import.meta.url`. It ends at the next line that begins with `}` at column 0. A file without such a block gets no exemption, and neither does a guard of another shape: an indented `if`, an `if` without braces, a condition split over several lines, or a block with no closing brace at column 0. Their uncovered lines block as before. So do uncovered lines outside the block, such as a wrapper that starts a real process. Command wiring therefore goes inside the block or in a module of default dependencies that the RED tests run.

4. **Incremental mutation.** For added lines in `core/`, `storage/`, `session/`, and `scripts/`, run Stryker with line ranges (`--mutate path:start-end`) and only the RED unit tests. Each surviving mutant becomes a warning, placed as described under "Report and exit code". Mutants with no coverage are already covered by check 3 and are not reported twice.

   Check 4 has a time budget. The script runs it newest GREEN commit first and starts no new mutation run once the budget is spent. A run that has started finishes, so the check can go over the budget by one GREEN commit's mutation time. Only mutation time counts against the budget. Checks 1 to 3 still run on every GREEN commit and still block. The budget is the option `--mutation-budget-minutes <n>`, a whole number of minutes greater than 0. Without it there is no cap, so a local run mutates every cycle it checks. A GREEN commit that the budget did not reach gets a note in its block of the report.

Files out of scope for checks 3 and 4: files that are not JavaScript or TypeScript source, and files in the coverage `exclude` list of `vite.config.ts`. Coverage must reach `scripts/**/*.mjs`, which the current coverage `include` list leaves out, so the script passes its own include list for the changed files.

### Finding kinds

The severities live in the shared table `scripts/policy-check/rule-severity.mjs`.

| Rule                            | Severity | When                                                                             |
| ------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `red-passes-before-green`       | fail     | The RED unit tests pass and type-check at the parent (check 1).                  |
| `red-fails-at-green`            | fail     | A RED unit test does not pass at the GREEN commit (check 2).                     |
| `uncovered-added-line`          | fail     | The RED tests do not run an executable added line (check 3).                     |
| `uncovered-guard-line`          | warning  | The same, for a line inside the direct-invocation block (check 3).               |
| `mixed-red-passes-before-green` | warning  | Check 1 fails for a mixed set.                                                   |
| `mixed-uncovered-added-line`    | warning  | Check 3 fails for a mixed set, outside the direct-invocation block.              |
| `surviving-mutant`              | warning  | A mutant on an added line survives the RED tests or runs none of them (check 4). |
| `mutation-run-failed`           | warning  | Stryker exits nonzero for a group of mutants (check 4).                          |

A GREEN commit that the mutation budget did not reach gets the note `mutation check not reached: the time budget was spent`. A note is not a finding. It has no severity and no annotation, and it never changes the exit code.

### Report and exit code

The script reuses the finding format of `scripts/policy-check/report.mjs`. Each finding has a rule, the sha of its GREEN commit, and a message, and most also have a file and a line. That line number belongs to the GREEN commit's version of the file, which can differ from the head of the pull request.

The report starts with a count of proven, skipped, and failed GREEN commits. When the mutation budget ran out, the same line also gives the number of GREEN commits that the mutation check did not reach. Then it lists each GREEN commit with its result (proven, skipped with its reason, or failed), its notes, its step times, and its own findings, indented under it. Within a commit, failing findings come before warnings.

In CI each finding becomes a GitHub annotation, and the message starts with the short sha of the GREEN commit. GitHub puts an annotation on that line of the pull request's head. A line number from an earlier GREEN commit would point at the wrong line there, so an annotation names the line only when its GREEN commit is the head commit of the run. For an earlier commit it names only the file. The policy check shares `report.mjs`, and its output does not change.

Blocking findings make the exit code nonzero. Warnings never do, and a GREEN commit whose only findings are warnings counts as proven.

### Interfaces

- `pnpm green:proof --range <base>..<head>` checks every GREEN commit in a range.
- `pnpm green:proof --commit <sha>` checks one GREEN commit. After each GREEN commit the orchestrator runs it in the background while the BLUE review runs, so the proof adds little time to the cycle. The RED, GREEN, and refactor agents never run it.
- `--mutation-budget-minutes <n>` caps check 4 (see check 4). Local runs leave it out.
- New CI job `GREEN proof` on `pull_request`, after `check`, with full history (`fetch-depth: 0`). `ci-complete` lists it as required. It passes `--mutation-budget-minutes 15`, so check 4 spends at most about 15 min plus the run already started. It exits quickly when the range has no GREEN commit.

### Weekly Stryker fix (#487)

The weekly job has failed on every run. Stryker instruments 6,621 mutants in 158 files and then stops with `Cannot find Checker plugin "typescript". In fact, no Checker plugins were loaded.`, although `@stryker-mutator/typescript-checker` 8.7.1 is installed. A second defect: `mutate:check` passes `--dryRun`, but the Stryker flag is `--dryRunOnly`; the weekly job does not call it. Fix both so that the weekly run completes. The incremental run then uses the same config with `--mutate` and a narrow test list.

There is another risk: the 8.7.1 Vitest runner passes Vitest 1 pool options (`threads`, `poolOptions.threads`) that Vitest 4 removed. The plan starts with a spike that runs Stryker 8.7.1 on one file. If it fails, upgrade all three Stryker packages to the newest release older than 30 days (10.0.0 on 2026-11-20; 10.1.1 becomes eligible on 2026-11-22; its runner accepts `vitest >=2.0.0`) in a `build:` commit. _(Orchestrator's call.)_

The Stryker config type-checks mutants with `tsconfig.json`, which does not include `scripts/` (that folder is in `tsconfig.tooling.json`). Mutants in `scripts/` need a checker config that covers them.

## Constraints

- Node scripts in `scripts/` follow the item 7 style: ES modules, injected dependencies for git and process calls, unit tests beside them, the repository ESLint limits (40-line functions, 300-line files, three parameters).
- Temporary worktrees live under the system temporary folder and are removed on exit, including on failure.
- No new dependency. Vitest 4.1.12, `@vitest/coverage-v8` 4.1.12, and Stryker 8.7.1 are already pinned. A Stryker upgrade, if the spike needs one, keeps the 30-day cooldown and exact pins.
- Each worktree gets `pnpm install --frozen-lockfile`, one time for each different lockfile in the range; cycles with the same lockfile use that install again. A link to the main clone's `node_modules` is not safe: the main clone can hold other versions than the lockfile pins (on 2026-11-20 it had Vitest 4.1.8, not 4.1.12). _(Orchestrator's call.)_
- The work follows red-green-blue cycles and lands with ADR-0225.

## Open until measured

The first measurement ran checks 1 to 3 on the 28 GREEN commits of PR #961 (`35f8101b^1..35f8101b^2`: 17 `feat:`, 11 `fix:`) in 3 to 6 min. One mutation run of a script file costs about 101 s, so check 4 on all 28 would add about 47 min. The owner decided on 2026-11-20 to cap check 4 in CI at 15 min, as described under check 4. Still open: how many of the 28 GREEN commits that budget reaches. The plan's full measurement records it and sets the job timeout from the capped run.

## Left to the builder

- Where the shared pairing function lives.
- How Stryker runs only the RED tests (a generated Vitest config, or the runner's test filter).
- How to map V8 coverage to lines (Vitest's JSON or lcov reporter).
- Worktree reuse between the parent and GREEN runs of one cycle.
- The checker config for mutants in `scripts/`.
