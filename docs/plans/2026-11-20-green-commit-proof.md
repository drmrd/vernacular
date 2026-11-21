# GREEN commit proof: implementation plan

> **For agentic workers:** run every cycle from the main thread with the role-separated agents of
> this repository: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`. A background
> agent cannot dispatch them. The test-author never sees implementation files and the implementer
> never sees test files, so the Interfaces block of each cycle is the only contract between them:
> pass it to both, word for word, with the Shared types section. Tick the checkboxes as the work
> lands.

**Goal:** prove each GREEN commit of a pull request with the unit tests of its RED commits (they
fail before it, pass at it, and run every line it adds), report surviving mutants on the added
lines as warnings, run it as a required CI job, and make the weekly Stryker job complete (#487).

**Architecture:** a dependency-injected Node CLI under `scripts/green-proof/`, in the shape of
`scripts/policy-check/policy-check.mjs`. The shell reads `git log` for the range with the
`rgb:audit` format, pairs each GREEN commit with its RED pool through a new
`scripts/rgb-audit/cycle-pairing.mjs` that reuses the auditor's role rules, and proves each cycle
in one temporary worktree that it checks out at the parent and then at the GREEN commit. Pure
modules build the Vitest, `tsc`, and Stryker command lines and read their output (Vitest JSON,
`tsc` text, lcov, the Stryker JSON report). Findings use the shared severity table and the
annotation format of `scripts/policy-check/report.mjs`.

**Tech stack:** Node 22 ESM (`.mjs` with JSDoc types), Node built-ins only, Vitest 4.1.12 with
`@vitest/coverage-v8` 4.1.12, Stryker 8.7.1 (or the upgrade Task 1 decides), GitHub Actions.

**Spec:** `docs/specs/2026-11-20-green-commit-proof.md`. ADR-0225 (Task 19) records the decision.

## Global Constraints

- Work only in `/Users/dan/workspace/vernacular.wt/green-proof`, branch `feat/green-commit-proof`.
  Never use `git stash` in any form.
- Conventional Commits with the ten types of `commitlint.config.js`; subjects at most 100
  characters. Author `Dan Moore <9156191+drmrd@users.noreply.github.com>`. No `Co-Authored-By:`
  and no AI-session trailer (`Claude-Session:` or similar) in any commit, even when the session
  harness asks for one; the `policy` job fails on them.
- No em-dash characters in any new text. No milestone codes. No third-party product names.
- No new dependency. A Stryker upgrade, if Task 1 needs one, keeps the 30-day cooldown and exact
  pins (`save-exact=true`).
- Size limits from `eslint.config.js`, met by hand for `.mjs` and checked in Task 20: functions at
  most 40 lines (blank lines and comments skipped), files at most 300 lines, at most 3 parameters,
  complexity at most 10, nesting depth at most 3, no magic numbers outside `-1, 0, 1, 2, 100`, no
  flag arguments. Test files: function length 120, magic numbers allowed.
- Red-green-blue: one behavior per cycle. RED is `test:` and changes only test assets (test files
  and `*-test-support.mjs`). GREEN is `feat:` or `fix:` and touches no test file. BLUE is a
  `refactor:` commit or the empty marker
  `git commit --allow-empty -m "refactor: mark the <name> cycle blue"`.
  A `refactor:` commit never changes a `*.test.*` file. Tasks 1, 2, 13, 17, 18, 19, and 20
  are exempt commit types (`build:`, `ci:`, `docs:`) and have no RED.
- After each GREEN commit from cycle 13a on, the main thread runs `pnpm green:proof --commit HEAD`
  (sandbox off) in the background while the `/clean-code-review` agent reviews the cycle, so the
  proof does not lengthen the loop. Before it dispatches `/refactor`, it reads the summary and adds
  it to the refactor brief; a failing finding goes to the main thread first. The RED, GREEN, and
  refactor agents never run `pnpm green:proof`. Once the tool works, it checks its own cycles.
- Model routing: test-author and implementer on `sonnet` at medium effort; clean-code-reviewer on
  `opus` at high effort for cycles 9 to 12, 13b, 16, and 16a (process, file system, and timing work), `sonnet` at
  medium otherwise; refactorer on `sonnet` at medium; the final `/review` on `opus` at high.
- ADR-0225 is pre-assigned. `origin/main` has no ADR-0225 (checked 2026-11-20 on `ad3e66f2`).
  Check again before landing.
- Temporary worktrees live under `os.tmpdir()` and are removed on exit, including on failure.
  Each lockfile in the range gets one `pnpm install --frozen-lockfile`; never link the main
  clone's `node_modules`.
- Locally, `git worktree add` fails inside the sandbox; run `pnpm green:proof` with the sandbox
  off and say so to the owner.

## Decisions taken in this plan

1. **Pairing lives in `scripts/rgb-audit/cycle-pairing.mjs`.** `cycle-audit.mjs` exports its
   `classify` function unchanged, and the pairing module uses it, so the role rules have one home.
   `cycle-audit.mjs` is 260 lines; a pairing function there would pass 300.
2. **Added-line parsing reuses `parseUnifiedDiff`** from `scripts/policy-check/git-input.mjs`,
   which already gives each added line its new-file number. Only removed lines need a new parser.
3. **Coverage comes from the lcov reporter** (`lcovonly`), read as `SF:` and `DA:<line>,<count>`.
   A changed source file with no `SF:` record (a file in the coverage `exclude` list) is out of
   scope and listed as a note, not a finding.
4. **Mixed RED sets:** check 1 and check 3 findings become warnings under their own rule ids.
   Check 2 (RED passes at GREEN) still blocks: a unit test that fails at GREEN is broken whatever
   other tests the set holds.
5. **Stryker runs only the RED tests through a generated Vitest config** that narrows `include` to
   the RED files, with `vitest.related: false`. Ranges go in the `mutate` array of a generated
   Stryker config (same `path:start-end` form as `--mutate`), so the script can also set
   `thresholds.break: null`, the JSON reporter, and the checker per group.
6. **Checker per folder group.** `core/`, `storage/`, `session/` mutants use the `typescript`
   checker with the committed `tsconfig.stryker.json`: the root project without `references`,
   which would put the checker in build mode (spike result (a)). The weekly job uses the same
   file. `scripts/` mutants run with `checkers: []`: the scripts are `.mjs` and
   `tsconfig.tooling.json` has no `checkJs`, so a checker cannot reject a mutant there. Task 1
   confirms this. The weekly job runs in incremental mode (Decision 10); a green proof run sets
   `incremental: false`, so it never reads or writes the weekly incremental file.
7. **Mutation targets are the added lines that check 3 found covered**, in the four folders. A
   file excluded from coverage then has no mutation target, and no-coverage mutants never repeat a
   check 3 finding.
8. **A Stryker run that exits nonzero** gives one `mutation-run-failed` warning for that cycle.
   Mutation is advisory, so its failure is advisory too.
9. **Generated files** (`tsconfig`, Vitest config, Stryker config, reports) go in
   `<worktree>/.green-proof/`, which no commit tracks and the worktree removal deletes.
10. **The weekly Stryker job runs in incremental mode** (owner decision, 2026-11-20). A full run
    of `core/` cannot finish in one job: 9189 mutants at about 34 per minute with 8 runners is an
    estimated 270 minutes on the owner's Mac and more than 800 minutes on a 4-vCPU hosted runner,
    against the 360-minute job limit. The owner runs the first full run (the seed) on his Mac.
    The incremental file lives on the orphan data branch `stryker-incremental`, which holds only
    `stryker-incremental.json`. Each weekly run copies it to `reports/stryker-incremental.json`,
    runs Stryker over the mutants that changed, and pushes the new file back to that branch
    without force, also when the score is below the break threshold.

## Review Focus

1. Vitest collects zero test files (a path the `unit` project does not select, a bad filter): this
   must be an internal error, never "the RED tests fail". Cycle 7 and cycle 10 test it.
2. A failure in the middle of a run (an install that fails, a crashed Vitest, a thrown error) must
   still remove the worktree and the temporary folder. Cycle 9 and cycle 11 test it.
3. A RED test file renamed or deleted by a later RED commit before the GREEN commit: only files
   that exist at the GREEN commit count. Cycle 4 tests it.
4. lcov `SF:` paths are absolute paths inside the temporary worktree; they must map back to
   repository paths, and a file with no record must not count as covered. Cycle 6 tests it.
5. A branch that merged `main` into itself: main's GREEN commits must not be checked. The log uses
   `--no-merges` and the two-dot range `<base>..<head>`. Cycle 11 asserts the git arguments.

---

## File structure

| File                                               | Responsibility                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/rgb-audit/cycle-audit.mjs` (modify)       | export `classify`                                                 |
| `scripts/rgb-audit/cycle-pairing.mjs`              | `pairGreenCycles`: each GREEN commit with its RED pool            |
| `scripts/green-proof/test-set.mjs`                 | which RED files are unit tests; the kind of the set               |
| `scripts/green-proof/diff-lines.mjs`               | removed lines, the moved-line exemption, proof source paths       |
| `scripts/green-proof/coverage.mjs`                 | parse lcov; split added lines into covered, uncovered, unrecorded |
| `scripts/green-proof/vitest-run.mjs`               | Vitest argv; read a Vitest JSON run                               |
| `scripts/green-proof/type-check.mjs`               | `tsc` targets, generated tsconfig, errors in the RED files        |
| `scripts/green-proof/worktree.mjs`                 | one temporary worktree, install per lockfile, cleanup             |
| `scripts/green-proof/prove-cycle.mjs`              | checks 1 to 4 for one cycle; the cycle result                     |
| `scripts/green-proof/mutation.mjs`                 | ranges, groups, generated Stryker and Vitest configs              |
| `scripts/green-proof/mutation-report.mjs`          | surviving mutants from the Stryker JSON report                    |
| `scripts/green-proof/mutation-budget.mjs`          | the check 4 time budget and its option value                      |
| `scripts/green-proof/green-proof.mjs`              | CLI shell: options, git reads, report, exit code, default deps    |
| `scripts/green-proof/green-proof-report.mjs`       | header, one block per cycle with its own findings, annotations    |
| `scripts/green-proof/guard-block.mjs`              | the direct-invocation block of a script, found by its text        |
| `scripts/green-proof/green-proof-test-support.mjs` | fake git, fake command runner, fake files for the tests           |
| `scripts/policy-check/rule-severity.mjs` (modify)  | the new rule ids                                                  |
| `stryker.conf.json`, `package.json` (modify)       | #487 fix; `green:proof` script                                    |
| `.github/workflows/ci.yml` (modify)                | `green-proof` job; `ci-complete` needs it                         |
| `docs/knowledge/decisions/ADR-0225-...md` (create) | the decision record                                               |

Tests sit beside their module as `*.test.mjs`; run one cycle's tests with
`pnpm exec vitest run --project unit <path>`.

## Shared types (every cycle uses these names)

```js
/** @typedef {import('../rgb-audit/cycle-audit.mjs').ParsedCommit} ParsedCommit */
/** @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine  { file, line, text } */
/** @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding */
/** @typedef {{ green: ParsedCommit, reds: ParsedCommit[] }} GreenCycle */
/** @typedef {'unit'|'mixed'|'other-only'|'assets-only'|'empty'} RedSetKind */
/** @typedef {{ kind: RedSetKind, unitFiles: string[], otherFiles: string[], assetFiles: string[] }} RedTestSet */
/** @typedef {Map<string, Map<number, number>>} LineCoverage  repository path -> line -> hit count */
/** @typedef {{ outcome: 'passed'|'failed'|'empty'|'error', testFiles: string[], detail: string }} VitestOutcome */
/** @typedef {{ status: number, stdout: string, stderr: string }} CommandResult */
/** @typedef {(command: string, args: readonly string[], options: { cwd: string }) => CommandResult} RunCommand */
/** @typedef {(args: readonly string[]) => string} RunGit  throws on a nonzero git exit */
/** @typedef {{ readFile(path: string): string, writeFile(path: string, text: string): void, makeTempDir(prefix: string): string, removeDir(path: string): void }} Files */
/** @typedef {'install'|'parent'|'typeCheck'|'green'|'mutation'} Step */
/** @typedef {{ sha: string, title: string, status: 'proven'|'skipped'|'failed', reason: string, notes: string[], findings: Finding[], timings: Partial<Record<Step, number>> }} CycleResult */
```

`title` is `<type>: <subject>` of the GREEN commit. `reason` is `''` unless the status is
`skipped`. `timings` are milliseconds from an injected `now(): number`.

Rule ids (exact strings, added to `RULE_SEVERITY` in cycle 10): `red-passes-before-green` (fail),
`red-fails-at-green` (fail), `uncovered-added-line` (fail), `mixed-red-passes-before-green`
(warn), `mixed-uncovered-added-line` (warn), `surviving-mutant` (warn), `mutation-run-failed`
(warn). Cycle 13b adds `uncovered-guard-line` (warn).

Skip reasons (exact strings): `no RED commit before this GREEN commit`;
`RED tests are only end-to-end, browser, or story tests: <comma-joined files>`;
`no unit test imports the RED test assets: <comma-joined files>`;
`the RED commits leave no test file at this commit`.

---

### Task 0: Set up the worktree

- [ ] `pnpm install --frozen-lockfile` exits 0; `pnpm exec vitest run --project unit scripts/rgb-audit scripts/policy-check` passes.

### Task 1: Stryker spike (no RED; decides the upgrade)

Goal: learn whether Stryker 8.7.1 runs under Vitest 4.1.12 on a line range with only named
tests, and record the facts later cycles rely on. Target: `core/units/format-area.ts` lines 10 to
20 with only `core/units/format-area.test.ts`.

- [x] **Step 1:** write a throwaway config `.green-proof/stryker-spike.json` (copy of
      `stryker.conf.json` with `"plugins": ["@stryker-mutator/vitest-runner",
"@stryker-mutator/typescript-checker"]`, `mutate: ["core/units/format-area.ts:10-20"]`,
      `reporters: ["json", "clear-text"]`, `thresholds.break: null`, and
      `vitest: { configFile: ".green-proof/vitest.red.config.mjs", related: false }`) and the
      Vitest config `mergeConfig(base, { test: { include: ['core/units/format-area.test.ts'] } })`
      over `../vite.config.ts`. Run `pnpm exec stryker run .green-proof/stryker-spike.json`.
- [x] **Step 2:** record in a "Spike results" section at the end of this plan: (a) whether the
      checker plugin loads with the explicit `plugins` list; (b) whether the run passes the dry
      run or fails on Vitest pool options (`threads`, `poolOptions.threads`); (c) that only
      mutants on lines 10 to 20 appear (whether the range end is inclusive, whether lines are
      1-based); (d) that the initial test run lists only `format-area.test.ts`; (e) the shape of
      `files` keys in the JSON report (relative or absolute) and of a mutant's `status`,
      `mutatorName`, `replacement`, `location.start.line`; (f) wall time.
- [x] **Step 3:** repeat with one `scripts/policy-check/report.mjs` range, the test
      `scripts/policy-check/report.test.mjs`, and `checkers: []`. Record whether it runs and
      whether a `typescript` checker would reject or ignore `.mjs` (Decision 6).
- [x] **Step 4, only if (b) fails:** upgrade `@stryker-mutator/core`, `vitest-runner`, and
      `typescript-checker` together to the newest release published at least 30 days before
      today (`pnpm view @stryker-mutator/core time --json`; 10.0.0 on 2026-11-20, 10.1.1 from
      2026-11-22). Check the `@stryker-mutator/instrumenter>@babel/core@7` override in
      `pnpm.overrides` still applies. Rerun Steps 1 and 3. Commit
      `build: upgrade Stryker to <version> for Vitest 4`.
- [x] **Step 5:** delete `.green-proof/`. Commit the results section
      `docs: record the Stryker spike results in the green proof plan`. If any of (a) to (e)
      contradicts Decisions 5 to 7, stop and bring it to the main thread before cycle 14.

### Task 2: the weekly Stryker job completes (#487, no RED)

**Files:** modify `stryker.conf.json`, `package.json`, `tsconfig.node.json`, `eslint.config.js`,
`.gitignore`, `.github/workflows/mutation.yml`; create `tsconfig.stryker.json`,
`vitest.stryker.config.ts`.

- [x] Add `"plugins": ["@stryker-mutator/vitest-runner", "@stryker-mutator/typescript-checker"]`
      to `stryker.conf.json` (pnpm's layout hides the default `@stryker-mutator/*` glob from
      core; Task 1 (a) confirms the cause). Leave `mutate` as it is (non-goal).
- [x] Point `tsconfigFile` at `tsconfig.stryker.json` (`{ "extends": "./tsconfig.json" }`, so no
      `references`; spike result (a)).
- [x] Point `vitest.configFile` at `vitest.stryker.config.ts`, which merges `vite.config.ts` and
      excludes `**/*.browser.test.ts` (they need a real browser) and
      `tests/format/current-schema-validator.test.ts` (the schema built from instrumented `core/`
      looks like drift). `tsconfig.node.json` type-checks it; `.gitignore` and the ESLint ignore
      list cover the `.js` and `.d.ts` files that `tsc -b` emits next to it.
- [x] Change `mutate:check` to `stryker run --dryRunOnly` (`--dryRun` is not a Stryker flag).
- [x] Set `dryRunTimeoutMinutes` to 30. Measured on the owner's Mac (M5 Pro): the initial test
      run takes 7 min 29 s and 8 min 17 s in two runs for 6361 tests (net 76 to 83 s, the rest
      overhead), and the default 5 minutes killed it. User CPU time about equals wall time, so
      the run is mostly serial and the runner's single-core speed sets its length, not its 4
      vCPUs. Allowing a hosted runner core up to 3 times slower gives about 25 minutes; 30 keeps
      a margin, and a hung run still fails long before the job limit. The incremental mode
      repeats this run every week.
- [x] `pnpm mutate:check` exits 0 with the final config: 205 files, 9189 mutants, 9 checkers and
      8 test runners, 9 min 20 s wall time.
- [x] Commit `build: make the weekly Stryker run complete under Vitest 4` with `Refs #487` in the
      body (not a closing keyword).
- [x] Add `"incremental": true` and `"incrementalFile": "reports/stryker-incremental.json"` to
      `stryker.conf.json` (`reports/` is gitignored). In `mutation.yml`: one concurrency group
      `mutation-stryker-incremental` with `cancel-in-progress: false`;
      `permissions: contents: write` only on the `stryker` job; `timeout-minutes: 360`. A step fetches
      `stryker-incremental` and copies `stryker-incremental.json` to
      `reports/stryker-incremental.json`; when the branch or the file is missing it fails at once
      with an error that names the seed section below. After `pnpm mutate`, a step that runs
      even when Stryker failed checks that the file is valid JSON, builds a commit on top of the
      fetched data commit (`github-actions[bot]`, message
      `chore: update the Stryker incremental file`), and pushes it without force; it skips the
      push when the file is unchanged. Stryker writes the file also when the score is below the
      break threshold, and saves a partial file when the job is cancelled or times out, so the
      next run resumes from those results. The HTML report upload stays. Commit
      `ci: run the weekly Stryker job in incremental mode` with `Refs #487`.
- [ ] The owner (or the main thread) seeds the data branch (next section).
- [ ] After the first push of this branch, dispatch `mutation.yml` on the branch
      (`gh workflow run mutation.yml --ref feat/green-commit-proof --repo drmrd/vernacular`) and
      confirm it completes and pushes to `stryker-incremental` before the pull request lands;
      then the body of the pull request may close #487.

### Seed the Stryker incremental file

The seed is one full run on the owner's Mac, an estimated 270 minutes. Run it in
`/Users/dan/workspace/vernacular.wt/green-proof` (or a checkout of `main` after this branch lands;
`core/` and its tests are the same) with the sandbox off:

```sh
cd /Users/dan/workspace/vernacular.wt/green-proof
mkdir -p reports
rm -f reports/stryker-incremental.json
pnpm mutate > reports/stryker-seed.log 2>&1; echo "exit $?"
```

Exit 0, or exit 1 when the score is below the break threshold of 50; in both cases the file is
written. If the run stops early (Ctrl-C, sleep, a crash), Stryker saves the results so far; run
`pnpm mutate` again without the `rm` and it resumes from them. Do not pass `--force`, which
discards them. The file lands at `reports/stryker-incremental.json` (gitignored), with the HTML
report at `reports/stryker/mutation.html`.

Publish it from a separate temporary worktree, never from this one (`git switch --orphan` empties
the working tree). Worktree commands need the sandbox off.

```sh
SEED=/Users/dan/workspace/vernacular.wt/green-proof/reports/stryker-incremental.json
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$SEED"
git -C /Users/dan/workspace/vernacular worktree add --detach /Users/dan/workspace/vernacular.wt/stryker-seed
cd /Users/dan/workspace/vernacular.wt/stryker-seed
git switch --orphan stryker-incremental
cp "$SEED" stryker-incremental.json
git add stryker-incremental.json
git commit -m "chore: seed the Stryker incremental file"
git ls-tree HEAD   # one entry: stryker-incremental.json
git push origin stryker-incremental
cd /Users/dan/workspace/vernacular
git worktree remove /Users/dan/workspace/vernacular.wt/stryker-seed
git branch -D stryker-incremental
```

The push is a plain push of a new branch, never a force push. To reseed later (after a Stryker
upgrade that changes mutant ids, say), run the seed again and push the new file as a normal commit
on top of `origin/stryker-incremental` from a temporary worktree of that branch.

### Cycle 3: pair each GREEN commit with its RED pool

**Files:** modify `scripts/rgb-audit/cycle-audit.mjs` (add `export` to `classify`); create
`scripts/rgb-audit/cycle-pairing.mjs`; test `scripts/rgb-audit/cycle-pairing.test.mjs`.

**Interfaces:** consumes `parseGitLog` and `classify(commit): 'red'|'green'|'blue'|'exempt'`.
Produces `pairGreenCycles(commits: ParsedCommit[]): GreenCycle[]`, one entry per GREEN commit in
order, `reds` being the RED commits since the previous GREEN (the pool `rgb:audit` consumes), `[]`
when there are none. BLUE and exempt commits neither add to nor clear the pool. Tests build input
with `gitLog`/`record` from `cycle-audit-test-support.mjs`.

- [ ] **Step 1: Write the failing tests**

```js
it('pairs a GREEN commit with every RED commit since the previous GREEN')
// r1 test, r2 test, g1 feat, b1 refactor, r3 test, g2 fix -> [{green g1, reds [r1, r2]}, {green g2, reds [r3]}]
it('gives a GREEN commit with no RED before it an empty pool') // g1 feat first -> [{ green: g1, reds: [] }]
it('ignores e2e-scoped tests and Infrastructure commits when filling the pool')
// test(e2e) e1, test r1 with infra 'glue', test r2, feat g1 -> reds [r2]
```

- [ ] **Steps 2 to 5:** FAIL (module missing); implement; PASS, with the existing rgb-audit tests
      green; commits `test: pin how GREEN commits pair with their RED commits`,
      `feat: pair each GREEN commit with its RED commits`, then BLUE.

### Cycle 4: the RED test set

**Files:** create `scripts/green-proof/test-set.mjs`; test `scripts/green-proof/test-set.test.mjs`.

**Interfaces:** produces `isUnitTestFile(path): boolean`: `isTestFile(path)` from
`scripts/rgb-audit/test-files.mjs`, not under `e2e/`, and not `*.browser.test.ts`. Produces
`redTestSet(cycle: GreenCycle, existsAtGreen: (path: string) => boolean): RedTestSet`: the union
of the RED commits' files that exist at GREEN, without duplicates, sorted. `unitFiles` are unit
test files; `otherFiles` are other test files (`isTestFile` or `/\.spec\.tsx?$/` or
`.stories.tsx`) that are not unit tests; `assetFiles` are the remaining `isTestAsset` paths.
`kind`: `unit` (unit files only among test files), `mixed` (unit and other), `other-only`,
`assets-only` (no test file, at least one asset), `empty` (nothing left).

- [ ] **Step 1: Write the failing tests**

```js
it('counts a test in tests/ or scripts/ as a unit test but not a browser, e2e, or story file')
// core/a.test.ts, tests/architecture/x.test.ts, scripts/a/b.test.mjs -> true;
// storage/s.browser.test.ts, e2e/tests/a.spec.ts, editor/a.stories.tsx -> false
it('collects the unit test files of every RED commit once') // r1 [core/a.test.ts], r2 [core/a.test.ts, core/b.test.ts] -> kind 'unit', unitFiles [a, b]
it('leaves out a RED file that no longer exists at the GREEN commit') // existsAtGreen false for core/old.test.ts -> not listed
it('marks a set with unit and end-to-end tests as mixed') // core/a.test.ts + e2e/tests/a.spec.ts -> 'mixed'
it('marks a set of only end-to-end, browser, or story tests as other-only')
it('marks a set of only fixtures and support files as assets-only') // core/x-test-fixtures.ts -> 'assets-only', assetFiles [it]
it('marks a set whose files are all gone as empty')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin which RED files count as unit tests`,
      `feat: build the RED test set of a GREEN commit`, then BLUE.

### Cycle 5: added lines that need proof

**Files:** create `scripts/green-proof/diff-lines.mjs`; test `scripts/green-proof/diff-lines.test.mjs`.

**Interfaces:** consumes `parseUnifiedDiff(raw): AddedLine[]`. Produces
`parseRemovedLines(raw: string): string[]`, the text (without `-`) of each removed line inside a
hunk of `git show --format= --unified=0` output; a `--- a/x` file header is not a removed line,
but a hunk line `---x` is (text `--x`). Produces `provableAddedLines(added: AddedLine[], removed:
string[]): AddedLine[]`, the added lines that are not moved: an added line is moved when its
trimmed text equals the trimmed text of a removed line not yet used; each removed line exempts at
most one added line; order is kept. Produces `isProofSource(path): boolean`: ends in `.ts`,
`.tsx`, `.mjs`, or `.js`, not `.d.ts`, and not `isTestAsset(path)`.

- [ ] **Step 1: Write the failing tests**

```js
it('reads removed lines from hunks but not file headers')
// header '--- a/core/a.ts', hunk lines '-const x = 1', '---y' -> ['const x = 1', '--y']
it('exempts an added line that matches a removed line in another file, ignoring indentation')
// added core/b.ts:4 '    return total' ; removed '  return total' (from core/a.ts) -> []
it('lets each removed line exempt only one added line')
// added 'count += 1' twice, removed once -> one line left, the second
it('keeps added lines whose text no removed line matches')
it('treats only JavaScript and TypeScript source as proof source')
// core/a.ts, scripts/x.mjs -> true; core/a.d.ts, docs/a.md, core/a-test-fixtures.ts, package.json -> false
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin which added lines a GREEN proof must cover`,
      `feat: exempt moved lines from the GREEN proof`, then BLUE.

### Cycle 6: line coverage from lcov

**Files:** create `scripts/green-proof/coverage.mjs`; test `scripts/green-proof/coverage.test.mjs`.

**Interfaces:** produces `parseLcov(raw: string, root: string): LineCoverage`. `SF:<path>` starts a
record; the key is the path relative to `root` (strip `root` and one `/`; a relative `SF` path is
kept); `DA:<line>,<count>[,<hash>]` sets the count; `end_of_record` closes it. Produces
`splitByCoverage(lines: AddedLine[], coverage: LineCoverage): { covered: AddedLine[], uncovered:
AddedLine[], unrecorded: string[] }`: a line with a `DA` count above 0 is covered, a count of 0 is
uncovered, a line with no `DA` entry in a recorded file is in neither list (not executable), and
the distinct files with no record go to `unrecorded`. Produces
`uncoveredLineFindings(lines: AddedLine[], sha: string, rule: string): Finding[]` with
`{ rule, sha, file, line, message: 'added line is not run by the RED tests' }`.

- [ ] **Step 1: Write the failing tests**

```js
it('keys coverage by repository path under the worktree root')
// root '/tmp/green-proof-x/worktree', 'SF:/tmp/green-proof-x/worktree/core/a.ts\nDA:3,2\nDA:4,0\nend_of_record'
// -> Map { 'core/a.ts' => Map { 3 => 2, 4 => 0 } }
it('splits added lines into covered, uncovered, and not executable')
// lines a.ts:3, a.ts:4, a.ts:5 (no DA) -> covered [3], uncovered [4]
it('lists a changed file with no coverage record instead of counting it covered')
// line in storage/download/download-blob.ts, no record -> unrecorded ['storage/download/download-blob.ts'], covered [], uncovered []
it('makes one finding per uncovered line under the given rule')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin how lcov maps to added lines`,
      `feat: map lcov line coverage to the added lines of a GREEN commit`, then BLUE.

### Cycle 7: run and read Vitest

**Files:** create `scripts/green-proof/vitest-run.mjs`; test `scripts/green-proof/vitest-run.test.mjs`.

**Interfaces:** produces `vitestArgs(request: { files: string[], jsonFile: string, related?:
boolean, coverage?: { include: string[], dir: string } }): string[]`, the arguments after `pnpm`:
`['exec', 'vitest', <'run' or 'related', '--run'>, '--project', 'unit', '--reporter=json',
'--outputFile=<jsonFile>', ...coverageArgs, ...files]`, where coverage adds
`--coverage.enabled=true`, `--coverage.provider=v8`, `--coverage.reporter=lcovonly`,
`--coverage.reportsDirectory=<dir>`, and one `--coverage.include=<path>` per path. Produces
`readVitestRun(status: number, jsonText: string, root: string): VitestOutcome`:
`error` when the text is empty or not JSON; `empty` when `numTotalTestSuites` is 0; `failed` when
`numFailedTests + numFailedTestSuites > 0`, or when `status` is nonzero with no failed test
(detail `Vitest exited <status>`); else `passed`. `testFiles` are `testResults[].name` relative to
`root`. `detail` lists the failed test names and suite messages, at most 20 lines.

- [ ] **Step 1: Write the failing tests**

```js
it('builds a unit run with JSON output and coverage for the changed files')
// -> exact array incl. '--coverage.include=core/a.ts', '--coverage.include=scripts/b.mjs', files last
it('builds a related run for test assets') // related: true -> [..., 'related', '--run', ...]
it('reads a run with a failing test as failed') // numFailedTests 1
it('reads a file that does not load as failed') // numFailedTestSuites 1, testResults[0].status 'failed', message "Cannot find module './x'"
it('reads a run that collected no test file as empty, not failed') // numTotalTestSuites 0, status 1
it('reads a missing or broken JSON report as an error') // '' and '{' -> 'error'
it('lists the test files of the run relative to the worktree')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin how the GREEN proof reads a Vitest run`,
      `feat: build and read the Vitest runs of the GREEN proof`, then BLUE.

### Cycle 8: type-check the RED files when the run passes

**Files:** create `scripts/green-proof/type-check.mjs`; test `scripts/green-proof/type-check.test.mjs`.

**Interfaces:** produces `typeCheckTargets(files: string[]): { config: string, files: string[] }[]`:
`.ts`/`.tsx` under `scripts/` use `tsconfig.tooling.json`, other `.ts`/`.tsx` use
`tsconfig.json`, `.mjs`/`.js` are left out (no `checkJs`); empty groups are omitted. Produces
`typeCheckConfigText(config: string, files: string[]): string`, the JSON of a tsconfig placed in
`.green-proof/`: `{ "extends": "../<config>", "include": [], "files": ["../<file>", ...] }`.
Produces `tscArgs(configPath: string): string[]` =
`['exec', 'tsc', '--noEmit', '--pretty', 'false', '-p', configPath]`. Produces
`typeErrorsIn(output: string, files: string[]): string[]`, the lines
`<file>(<line>,<col>): error TS<n>: ...` whose file is one of `files` (errors in imported files
are dropped).

- [ ] **Step 1: Write the failing tests**

```js
it('groups RED files by the tsconfig that covers them and skips .mjs')
// core/a.test.ts, scripts/x.test.ts, scripts/y.test.mjs -> [{tsconfig.json,[core/a.test.ts]},{tsconfig.tooling.json,[scripts/x.test.ts]}]
it('writes a tsconfig that checks only the given files') // JSON.parse(text) deep-equals the shape above
it('keeps only type errors located in the RED files')
// "core/a.test.ts(4,7): error TS2554: Expected 1 arguments, but got 2.\ncore/b.ts(1,1): error TS1: x" -> first line only
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin the type check of RED files`,
      `feat: type-check RED files that pass at the parent`, then BLUE.

### Cycle 9: one temporary worktree for the run

**Files:** create `scripts/green-proof/worktree.mjs`, `scripts/green-proof/green-proof-test-support.mjs`;
test `scripts/green-proof/worktree.test.mjs`.

**Interfaces:** produces `createWorktreeSession(deps: { runGit: RunGit, runCommand: RunCommand,
files: Files, now: () => number }): { checkout(sha: string): { root: string, installMs: number },
dispose(): void }`. First `checkout` makes `files.makeTempDir('green-proof-')` and runs
`git worktree add --detach <tmp>/worktree <sha>`; later ones run
`git -C <root> checkout --detach --force <sha>`. It reads `git rev-parse <sha>:pnpm-lock.yaml` and
runs `pnpm install --frozen-lockfile` (cwd root) only when that blob differs from the last install
(`installMs` is 0 otherwise). A nonzero install throws an `Error` naming the sha and the stderr
tail. `dispose` runs `git worktree remove --force <root>`, `files.removeDir(<tmp>)`, and
`git worktree prune`, ignores errors from each, does nothing when no checkout happened, and is
safe to call twice. The test support exports `fakeGit(answers)`, `fakeRunner(answers)` (each
records calls), and `fakeFiles()` (an in-memory `Files`).

- [ ] **Step 1: Write the failing tests**

```js
it('adds a detached worktree under a new temporary folder on the first checkout')
it('checks out later commits in the same worktree')
it('installs once for each different lockfile')
// shas a, b same blob, c new blob -> pnpm install calls: 2
it('removes the worktree and the temporary folder when disposed, even after a failed install')
// install status 1 -> checkout throws; dispose -> 'worktree remove' call and removeDir called
it('does nothing on dispose when nothing was checked out, and tolerates a second dispose')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin the temporary worktree of the GREEN proof`,
      `feat: check out GREEN proof commits in one temporary worktree`, then BLUE.

### Cycle 10: checks 1 and 2 for one cycle

**Files:** create `scripts/green-proof/prove-cycle.mjs`; modify
`scripts/policy-check/rule-severity.mjs` (the seven rule ids of Shared types); test
`scripts/green-proof/prove-cycle-red.test.mjs`.

**Interfaces:** produces `proveCycle(cycle: GreenCycle, context: { runGit, runCommand, files,
session, now }): CycleResult`. Git reads: `rev-parse <green>^` for the parent;
`ls-tree -r --name-only <green> -- <paths>` for `existsAtGreen`. Flow: an empty `reds` pool, an
`other-only` set, or an `empty` set gives `skipped` with its exact reason and no checkout. Else
check out the parent, run `vitestArgs({ files: unitFiles, jsonFile })` (cwd the worktree), and
read it. `failed` passes check 1. `passed` then runs the type check (cycle 8) when any target
exists; a type error in a RED file passes check 1. Otherwise check 1 gives
`{ rule: 'red-passes-before-green', sha, message: 'RED tests pass and type-check at the parent <short parent>: <files>' }`.
`empty` or `error` throws (exit 2 in the shell). Then check out the GREEN commit and run the same
files; any outcome other than `passed` gives
`{ rule: 'red-fails-at-green', sha, message: 'RED tests do not pass at the GREEN commit: <detail>' }`.
In a `mixed` set check 1 uses `mixed-red-passes-before-green`; check 2 keeps its rule
(Decision 4). `status` is `failed` when any finding has severity `fail`, else `proven`.
`timings` record `install`, `parent`, `typeCheck`, `green`. Tests use the cycle 9 test support.

- [ ] **Step 1: Write the failing tests**

```js
it('proves a cycle whose RED test fails at the parent and passes at GREEN') // status 'proven', findings []
it('counts a RED file that does not load at the parent as failing') // parent JSON: suite failed, "does not provide an export named 'x'"
it('counts a type error in a RED file as failing when the parent run passes')
// parent passed; tsc output has 'core/a.test.ts(3,9): error TS2345' -> proven, tsc called once
it('fails a cycle whose RED tests pass and type-check at the parent') // finding red-passes-before-green, status 'failed'
it('fails a cycle whose RED tests do not pass at GREEN') // red-fails-at-green with the failed test name
it('reports check 1 as a warning for a mixed set but still fails on check 2')
it(
  'skips a cycle with no RED pool, only end-to-end tests, or no test file left, without a checkout',
)
it('stops with an error when Vitest collects no test file') // parent JSON numTotalTestSuites 0 -> throws
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the GREEN proof to check RED before and after GREEN`,
      `feat: prove that RED tests fail before and pass at their GREEN commit`, then BLUE.

### Cycle 11: the CLI shell

**Files:** create `scripts/green-proof/green-proof.mjs`; test `scripts/green-proof/green-proof.test.mjs`.

**Interfaces:** produces `runGreenProof(argv: readonly string[], deps: { runGit, runCommand, files,
log, githubActions: boolean, now }): Promise<number>`. Options: `--range <base>..<head>`; or
`--commit <sha>` with `--base` (default `origin/main`), which reads `<base>..<sha>` and proves
only the cycle whose GREEN sha equals `git rev-parse <sha>`; with neither, the range
`origin/main..HEAD`. The log call is exactly the `rgb:audit` one:
`['log', '--reverse', '--no-merges', <range>, '--pretty=format:%x1e%H%x1f%s%x1f%(trailers:key=Infrastructure,valueonly,separator=%x20)', '--name-only']`.
No GREEN commit: log `green:proof: no GREEN commit in <range>`, create no worktree, return 0.
Otherwise one session for all cycles, disposed in `finally`. Output: a header
`green:proof: <p> proven, <s> skipped, <f> failed in <range>`; per cycle
`  <short sha> <status> <title>` plus ` (<reason>)` when skipped; its notes as `    note: <text>`;
a timing line `    time: install <x> s, parent <x> s, type-check <x> s, green <x> s, mutation <x> s`
(one decimal, missing steps 0.0); then all findings, failing before warnings, through
`formatPlainLine` (or `formatAnnotation` when `githubActions`). Exit 0 with no failing finding, 1
with one, 2 on a thrown error (logged as `green:proof: internal error: <message>`).

- [ ] **Step 1: Write the failing tests**

```js
it('reads the range with the rgb:audit log format and without merge commits') // exact args
it('exits 0 without a worktree when the range has no GREEN commit')
it('exits 1 and prints the finding when a cycle fails')
it('lists each cycle with its result, skip reason, and step times')
it('proves only the named commit with --commit') // two cycles in range; one proveCycle path run
it('removes the worktree and exits 2 when a step throws') // runner throws on vitest -> 'worktree remove' called, exit 2
it('writes GitHub annotations when running in GitHub Actions') // '::error file=...,title=uncovered-added-line::'
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the green:proof command to report each cycle`,
      `feat: add the green:proof command`, then BLUE.

### Cycle 12: check 3, diff coverage, and the asset-only path

**Files:** modify `scripts/green-proof/prove-cycle.mjs`; test `scripts/green-proof/prove-cycle-coverage.test.mjs`.

**Interfaces:** the GREEN run of cycle 10 gains `coverage: { include, dir: '.green-proof/coverage' }`,
where `include` lists the GREEN commit's changed files that pass `isProofSource`. Added lines come
from `git -c core.quotePath=false show --format= --unified=0 --no-color --no-ext-diff -M <green>`
through `parseUnifiedDiff`, `parseRemovedLines`, `provableAddedLines`, and `isProofSource`.
`splitByCoverage` over `parseLcov(<root>/.green-proof/coverage/lcov.info, root)` gives
`uncovered-added-line` findings (`mixed-uncovered-added-line` for a mixed set) and a note
`no coverage record (excluded from coverage): <files>` for `unrecorded`. Coverage is read only when
check 2 passed. An `assets-only` set runs `vitestArgs({ files: assetFiles, related: true, ... })`
at the parent; its `testFiles` become the unit files for the rest of the cycle; `empty` there gives
`skipped` with the assets reason.

- [ ] **Step 1: Write the failing tests**

```js
it('fails an added executable line that the RED tests never run') // DA 0 -> uncovered-added-line at core/a.ts:7
it('passes added lines with no coverage entry and lines moved from another file')
it('collects coverage only for the changed source files') // vitest call has --coverage.include=core/a.ts and not docs/x.md
it('notes a changed file with no coverage record instead of failing it')
it('reports uncovered lines as warnings for a mixed set')
it('runs the tests related to changed test assets when the RED commits changed no test file')
it('skips the cycle when no unit test imports the changed assets')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the GREEN proof to cover every added line`,
      `feat: require the RED tests to run every line a GREEN commit adds`, then BLUE.

### Task 13: the pnpm script and the first measurement (no RED)

- [ ] Add `"green:proof": "node scripts/green-proof/green-proof.mjs"` after `policy:check` in
      `package.json`, with the direct-invocation block and `defaultDeps()` (spawnSync with
      `maxBuffer: GIT_OUTPUT_LIMIT_BYTES`, `node:fs`, `os.tmpdir()`, `GITHUB_ACTIONS === 'true'`,
      `performance.now`; `writeFile` creates parent folders) and SIGINT and SIGTERM handlers that dispose the session and exit 130.
      Commit `build: add the green:proof script`.
- [ ] With the sandbox off, run `time pnpm green:proof --range 35f8101b^1..35f8101b^2` (28 GREEN
      commits: 17 `feat:`, 11 `fix:`; no lockfile change in the range, so one install).
- [ ] Record under "Measurement results" at the end of this plan: total time; install time;
      median and maximum of each step per GREEN commit; counts proven, skipped (with reasons),
      failed. Read every failure and every skip by hand: a false failure is a defect, fixed with
      its own `test:` and `fix:` cycle before cycle 14. Commit
      `docs: record the first green proof measurement in the plan`.
- [ ] Projection: total time plus 28 times the spike's per-file Stryker time. The projection came
      to about 50 to 53 min, and the owner decided (2026-11-20) to cap the mutation check in CI
      at 15 min, newest GREEN commit first (Cycle 16a).
- [ ] The first run (2026-11-20) gave 24 proven, 0 skipped, 4 failed, with 17
      `uncovered-added-line` findings. A hand check found all 17 true and no defect in the proof,
      but two gaps in the contract: the report does not say which GREEN commit a finding belongs
      to (Cycle 13a), and the direct-invocation block of a script can never be run by a unit test
      (Cycle 13b). Do not record that run. After Cycles 13a and 13b land, repeat the run with the
      sandbox off and record the measurement and the projection from that repeated run, then
      commit the "Measurement results" section.

### Cycle 13a: report each finding under its GREEN commit

**Behavior:** a finding's line number is a line of its GREEN commit's version of the file, not of
HEAD. Today `cycleLines` in `scripts/green-proof/green-proof-report.mjs` prints only the status,
notes, and time lines of a cycle, and `reportLines` prints all findings after the last cycle;
`formatPlainLine` drops the sha whenever a finding has a file. In CI, `formatAnnotation`
(`scripts/policy-check/report.mjs:45`) sends `file=` and `line=` and drops the sha, so GitHub puts
the annotation of an earlier GREEN commit on the wrong line of the pull request head. After this
cycle each cycle's findings print under its own status line, and an annotation names the line
only for a finding of the head commit.

**Files:** modify `scripts/green-proof/green-proof-report.mjs` and
`scripts/green-proof/green-proof.mjs`; test `scripts/green-proof/green-proof-report.test.mjs`
(create) and `scripts/green-proof/green-proof.test.mjs` (modify). Do not modify
`scripts/policy-check/report.mjs` or any file under `scripts/policy-check/`: the policy check
shares `report.mjs`, and its output stays the same.

**Interfaces:** `reportLines(results: CycleResult[], run: { range: string, headSha: string,
githubActions: boolean }): string[]` replaces the three-parameter form. `headSha` is the full sha
of the run's head commit. `resolveRange` returns `{ range, onlySha, headSha }`: with `--commit`,
`headSha` is the sha it already resolves; otherwise it runs
`git rev-parse --verify --end-of-options <head>^{commit}` (trimmed), where `<head>` is the text
after the last `..` of the range (`origin/main..HEAD` gives `HEAD`,
`35f8101b^1..35f8101b^2` gives `35f8101b^2`).

Plain output: the header is unchanged. For each cycle, in order: the status line, its `note:`
lines, its `time:` line (all as today), then that cycle's own findings, failing before warnings,
each group in finding order. A finding line is `formatPlainLine(finding, severity)` with two more
leading spaces, for example
`    [fail] [uncovered-added-line] core/a.ts:7: added line is not run by the RED tests`. Nothing
prints after the last cycle block.

GitHub Actions output: the same per-cycle lines, but each finding is a
`formatAnnotation(annotated, severity)` line, at column 0, right after its cycle's lines. For a
finding with no `file`, `annotated` is the finding unchanged (`formatAnnotation` already prefixes
`<short sha> `). For a finding with a `file`, `annotated` is
``{ ...finding, message: `${shortSha(result.sha)} ${finding.message}`, line: result.sha === headSha ? finding.line : undefined }``,
so the head commit gives
`::error file=core/a.ts,line=7,title=uncovered-added-line::g2000000 added line is not run by the RED tests`
and an earlier GREEN commit gives
`::error file=core/a.ts,title=uncovered-added-line::g1000000 added line is not run by the RED tests`.
The property order, the escaping, and the `<short sha> ` prefix are those `formatAnnotation`
already writes for a commit finding; nothing else changes. `hasFailingFinding` is unchanged. The
surviving-mutant findings of Cycle 16 take the same path.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/green-proof/green-proof-report.test.mjs (new; builds CycleResult objects directly)
it('prints each finding indented under the cycle it belongs to')
// failed cycles g1 and g2, one uncovered-added-line each at core/a.ts:7 -> exact lines in order:
// header, g1 status, g1 time, '    [fail] [uncovered-added-line] core/a.ts:7: ...', g2 status, g2 time, g2 finding
it('puts failing findings before warnings within one cycle')
// one cycle with mixed-uncovered-added-line then uncovered-added-line -> the fail line, then the warn line, both under it
it('annotates a finding of the head commit with its file, line, and short sha')
// headSha = g2 -> '::error file=core/a.ts,line=7,title=uncovered-added-line::g2000000 added line is not run by the RED tests'
it('annotates a finding of an earlier GREEN commit with its file and short sha but no line')
// headSha = g2, finding of g1 -> '::error file=core/a.ts,title=uncovered-added-line::g1000000 added line is not run by the RED tests'
it('keeps the annotation of a finding with no file as the policy check writes it')
// red-passes-before-green with only a sha -> '::error title=red-passes-before-green::g1000000 RED tests pass ...'

// scripts/green-proof/green-proof.test.mjs (modify)
// replace 'puts failing findings before warnings and counts each status in the header' with:
it("prints each cycle's findings under that cycle and counts each status in the header")
// g1 mixed (warn) then g2 (fail): the g1 warn line comes after g1's status line and before g2's;
// the g2 fail line comes after g2's status line
it('resolves the head of the range for the annotations')
// --range main..topic -> calls contain ['rev-parse', '--verify', '--end-of-options', 'topic^{commit}']
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS, with `scripts/policy-check/report.test.mjs` and
      `scripts/policy-check/policy-check-annotations.test.mjs` green and untouched; commits
      `test: expect green:proof findings under the GREEN commit they belong to`,
      `fix: report green:proof findings under their GREEN commit`, then BLUE.

**Review focus:** `git diff` of the GREEN commit shows no change under `scripts/policy-check/`;
`line=` appears only for a finding of the head commit; a fileless finding gets no second sha
prefix; `reportLines` and `cycleLines` stay within 40 lines and 3 parameters.

### Cycle 13b: warn on uncovered lines in the direct-invocation block

**Behavior:** 12 of the 17 findings of the first run were command-line wiring that no unit test
can run by design: the direct-invocation blocks of `scripts/policy-check/policy-check.mjs` and
`scripts/rgb-audit/rgb-audit.mjs`, and the real-process wrapper `spawnCommitlint` above the first.
Owner decision (2026-11-20): an uncovered added line inside the direct-invocation block is a
warning under its own rule, `uncovered-guard-line`, and does not fail the cycle. An uncovered line
outside the block, such as `spawnCommitlint`, still fails, so wiring goes in the block or in a
default-dependencies module that the RED tests run. No marker comments.

**Files:** create `scripts/green-proof/guard-block.mjs`; modify
`scripts/green-proof/prove-coverage.mjs` and `scripts/policy-check/rule-severity.mjs` (add
`'uncovered-guard-line': 'warn'` after `'uncovered-added-line'`); tests
`scripts/green-proof/guard-block.test.mjs` (create),
`scripts/green-proof/prove-cycle-coverage.test.mjs`,
`scripts/green-proof/green-proof-report.test.mjs`, and
`scripts/green-proof/green-proof-test-support.mjs` (modify).

**Interfaces:** `guardBlockLines(source: string): Set<number>`, the 1-based numbers of every line
in a direct-invocation block of `source`, the `if` line and the closing brace included; an empty
set when there is none. The rule works on `source.split('\n')`:

1. **Guard names.** A top-level const is a line that starts at column 0 with `const <name> =`
   (`<name>` matches `[A-Za-z_$][\w$]*`). Its initializer is the text after `=` on that line plus
   each following line that starts with a space, up to the first line that is blank or starts at
   column 0. The const is a guard name when its initializer contains `import.meta.url`. There is
   one level only: a const whose initializer names a guard name but not `import.meta.url` is not a
   guard name.
2. **Guard header.** A line that starts at column 0 with `if (`, whose text with trailing spaces
   removed ends with `{`, and whose condition (the text between `if (` and the last `)` of the
   line) contains `import.meta.url` or a guard name as a whole word.
3. **Block end.** The first later line that starts with `}` at column 0. With none, the header
   gives no block.

Nothing else is a guard, and those lines fail as today: an indented `if`; a brace-less
`if (isDirectInvocation) runFromCommandLine()` (its condition runs on import, so the line is not
uncovered; the function it calls lies outside any block and needs coverage); a header whose
condition spans lines; an `else` branch after the closing brace; a top-level `if` that tests
something else, such as `if (process.argv.includes('--check')) {` in
`scripts/schema/generate-schema.mjs`. The rule relies on Prettier's layout, which
`pnpm format:check` enforces. The shapes in the repository today: seven scripts use
`const invokedPath = process.argv[1]`, then
`const isDirectInvocation =` with the continuation
`  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath`, then
`if (isDirectInvocation) {`; `scripts/serve-static.mjs:73` uses
`if (process.argv[1] === fileURLToPath(import.meta.url)) {`;
`scripts/performance/report-times.mjs:344` uses `const invokedDirectly =` with the continuation
`  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href`, then
`if (invokedDirectly) {`. `scripts/green-proof/green-proof.mjs` uses the brace-less form.

`splitGuardLines(lines: AddedLine[], readSource: (file: string) => string): { guard: AddedLine[],
other: AddedLine[] }`: `readSource` is called once per distinct file of `lines`; a line is in
`guard` when `guardBlockLines` of its file's source holds its line number; both lists keep the
input order.

In `checkCoverage`, after `splitByCoverage`: `splitGuardLines(uncovered, (file) =>
files.readFile(join(root, file)))`. The worktree is checked out at the GREEN commit during check
3, so this reads the GREEN commit's version; only files with an uncovered line are read, and a
read that throws is an internal error. Findings:
`uncoveredLineFindings(other, sha, rule)` (rule as today, `mixed-uncovered-added-line` for a mixed
set) followed by `uncoveredLineFindings(guard, sha, 'uncovered-guard-line')` for both set kinds,
with the same message. Because `uncovered-guard-line` is `warn`, a cycle whose only uncovered
lines are in the block stays `proven`, and the Cycle 13a report prints the warning under it.

Test support retrofit (in the RED commit): `scenario` gains `sources?: Record<string, string>`,
each written to `<ROOT>/<file>` before the run; each file of `greenFiles` with no entry gets the
one-line source `export const x = 1\n`, so the existing uncovered-line tests still expect
`uncovered-added-line`.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/green-proof/guard-block.test.mjs (new)
it('finds the block of a guard that names a const built from import.meta.url')
// const invokedPath / const isDirectInvocation = + indented continuation / blank / 'if (isDirectInvocation) {'
// at line 5 / body with '    .then((code) => {' and '    })' / '}' at line 12 -> Set {5..12}
it('finds the block of a guard whose condition reads import.meta.url itself')
// 'if (process.argv[1] === fileURLToPath(import.meta.url)) {' at line 3, '}' at line 6 -> Set {3..6}
it('finds the block of a guard whose const initializer spans two lines and uses pathToFileURL')
// 'const invokedDirectly =' + '  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href'
// then 'if (invokedDirectly) {' with nested '    (code) => {' / '    },' / '  )' -> ends at the column-0 '}'
it('ignores a top-level if that does not test how the script was started')
// 'const root = fileURLToPath(new URL(".", import.meta.url))' and "if (process.argv.includes('--check')) {" -> empty Set
it(
  'gives no block for an indented guard, a brace-less guard, or a guard with no closing brace at column 0',
)
it('leaves the lines just before the if and just after its closing brace outside the block')
// a process wrapper ending on the line above 'if', and a line after '}' -> neither in the Set
it('splits lines into guard and other lines and reads each file once')
// two lines of scripts/x.mjs (one in, one out of the block) and one of core/a.ts -> readSource called twice

// scripts/green-proof/prove-cycle-coverage.test.mjs (modify)
it('warns on an uncovered line inside the direct-invocation block and keeps the cycle proven')
// greenFiles ['scripts/x.mjs'], sources with a guard at lines 10 to 14, diff adds line 11, DA 11,0
// -> one finding uncovered-guard-line at scripts/x.mjs:11, status 'proven'
it('still fails an uncovered line of a process wrapper outside the block')
// same source, diff adds lines 4 (inside a function above the guard) and 11, both DA 0
// -> uncovered-added-line at :4 and uncovered-guard-line at :11, status 'failed'

// scripts/green-proof/green-proof-report.test.mjs (modify)
it('prints a guard warning under a proven cycle without failing the run')
// proven cycle with an uncovered-guard-line finding -> '    [warn] [uncovered-guard-line] scripts/x.mjs:11: ...'
// under its status line; hasFailingFinding false
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits
      `test: expect uncovered direct-invocation lines to warn`,
      `feat: warn on uncovered lines in the direct-invocation block`, then BLUE.

**Review focus:** run `guardBlockLines` by hand over every `scripts/**/*.mjs`: it must find a block
in exactly nine files (the seven `isDirectInvocation` scripts with braces, `serve-static.mjs`, and
`report-times.mjs`), and none in `green-proof.mjs` or `generate-schema.mjs`. Lines one above the
`if` and one below the closing brace stay outside. Every function in `guard-block.mjs` stays within
40 lines, 3 parameters, complexity 10, and nesting depth 3; the regular expressions have no
unbounded backtracking.

### Cycle 14: mutation ranges and generated configs

**Files:** create `scripts/green-proof/mutation.mjs`; test `scripts/green-proof/mutation.test.mjs`.

**Interfaces:** produces `mutationTargets(covered: AddedLine[]): AddedLine[]` (files under
`core/`, `storage/`, `session/`, `scripts/`). Produces `mutateRanges(lines: AddedLine[]): string[]`,
sorted by file then line, consecutive lines merged, as `<file>:<start>-<end>` (a single line is
`<file>:<n>-<n>`; adjust to Task 1 (c) if the end is exclusive). Produces
`strykerGroups(ranges: string[]): { group: 'app'|'tooling', ranges: string[] }[]` (`scripts/` is
`tooling`), empty groups omitted. Produces `strykerConfig(base: object, request: { group, ranges,
vitestConfigFile: string, reportFile: string }): object`: `base` with `mutate: ranges`,
`vitest: { configFile, related: false }`, `reporters: ['json']`, `jsonReporter: { fileName }`,
`thresholds: { ...base.thresholds, break: null }`, `incremental: false` (the weekly job owns the
incremental file; Decision 10), and `checkers: ['typescript']` with
`tsconfigFile: 'tsconfig.stryker.json'` for `app`, `checkers: []` for `tooling`. Produces
`redVitestConfigText(testFiles: string[]): string`, an ES module that imports `mergeConfig` from
`vitest/config` and `../vite.config.ts`, and exports
`mergeConfig(base, { test: { include: <files>, exclude: ['**/*.browser.test.ts'] } })`.

- [ ] **Step 1: Write the failing tests**

```js
it('mutates only covered lines in core, storage, session, and scripts') // editor/x.tsx dropped
it('merges consecutive added lines into one range per run') // a.ts 3,4,5,9 -> ['core/a.ts:3-5', 'core/a.ts:9-9']
it('splits ranges into the app group and the tooling group')
it('keeps the base config but narrows mutate, tests, reporter, and break threshold')
// base = parsed stryker.conf.json shape; app -> checkers ['typescript']; tooling -> checkers []
it('writes a Vitest config that includes only the RED test files')
// text contains "include: [\"core/a.test.ts\"]" (JSON-quoted) and imports '../vite.config.ts'
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin the incremental Stryker configuration`,
      `feat: build incremental Stryker runs over added lines`, then BLUE.

### Cycle 15: surviving mutants from the report

**Files:** create `scripts/green-proof/mutation-report.mjs`; test `scripts/green-proof/mutation-report.test.mjs`.

**Interfaces:** produces `survivorFindings(reportJson: string, context: { sha: string, root:
string }): Finding[]`, one per mutant with `status === 'Survived'` in `files[<path>].mutants`
(path made relative to `root` if absolute): `{ rule: 'surviving-mutant', sha, file, line:
location.start.line, message: '<mutatorName> mutant survives the RED tests: <replacement>' }`.
`Killed`, `Timeout`, `CompileError`, `RuntimeError`, `Ignored`, `Pending` give nothing.
A `NoCoverage` mutant also gives a `surviving-mutant` finding, with the message
`'<mutatorName> mutant runs no RED test: <replacement>'`: it sits on a covered added line, so it
shows the same test gap. When a reported mutant has no `replacement`, the message ends after
`RED tests` or `RED test` with no `: ` suffix. A malformed report throws an `Error` whose message
starts with `Stryker report: `: text that is not JSON, JSON that is not an object, a `files` value
that is not a plain object (an array included), a file entry whose `mutants` is not an array, a
mutant that is not an object, or a reported mutant whose `location.start.line` is not a positive
integer. Cycle 16 catches the throw and reports `mutation-run-failed` for the group.

- [ ] **Step 1: Write the failing tests**

```js
it('reports a surviving mutant on its line') // ConditionalExpression, replacement 'true', line 12
it('ignores killed, timed-out, no-coverage, and compile-error mutants')
it('maps an absolute report path to the repository path')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin how surviving mutants are reported`,
      `feat: report surviving mutants as warnings`, then BLUE.

### Cycle 16: check 4 in the cycle

**Files:** modify `scripts/green-proof/prove-cycle.mjs`; test `scripts/green-proof/prove-cycle-mutation.test.mjs`.

**Interfaces:** after check 3, when check 2 passed and `mutationTargets(covered)` is not empty:
write `.green-proof/vitest.red.config.mjs` (`redVitestConfigText(unitFiles)`), and for each
`strykerGroups` entry write `.green-proof/stryker-<group>.json` from
`strykerConfig(JSON.parse(<root>/stryker.conf.json), ...)` with report file
`.green-proof/mutation-<group>.json`, run `pnpm exec stryker run .green-proof/stryker-<group>.json`
(cwd root), and add `survivorFindings`. A nonzero Stryker exit gives
`{ rule: 'mutation-run-failed', sha, message: 'Stryker exited <n> for the <group> group: <last stderr line>' }`
and no survivor read. `timings.mutation` covers all groups.

Refinements (main thread, 2026-11-21):

- Paths: the RED Vitest config is written to `<root>/.green-proof/vitest.red.config.mjs` and
  passed to `strykerConfig` as `vitestConfigFile: '.green-proof/vitest.red.config.mjs'`. The
  Stryker config is written to `<root>/.green-proof/stryker-<group>.json` with
  `reportFile: '.green-proof/mutation-<group>.json'`. The run is `runCommand('pnpm', ['exec',
'stryker', 'run', '.green-proof/stryker-<group>.json'], { cwd: root })`. The report is read from
  `<root>/.green-proof/mutation-<group>.json` and passed to
  `survivorFindings(text, { sha: <GREEN sha>, root })`.
- Before each Stryker run the cycle removes `<root>/.green-proof/mutation-<group>.json` with
  `files.removeFile`, so a stale report never reads as this run's.
- The groups run in the order `strykerGroups` gives. A failure of one group does not stop the
  next group.
- `<last output line>` in the exit message is the last non-blank line of stderr, else of stdout,
  else `no output`.
- A report that cannot be read (the file is missing, or `survivorFindings` throws) gives
  `{ rule: 'mutation-run-failed', sha, message: 'Stryker report for the <group> group is unreadable: <error message>' }`.
- Check 4 runs when check 2 passed, also when check 3 found uncovered lines, and also for a mixed
  set. The RED files of the Vitest config are the `unitFiles` of the set that ran at GREEN.
- A thrown `runCommand` propagates, as it does for Vitest.
- Known limit (advisory, no test): the RED Vitest config extends `vite.config.ts`, so a RED set
  that holds `tests/format/current-schema-validator.test.ts` fails the Stryker dry run on the
  instrumented `core/` and gives `mutation-run-failed`.

- [ ] **Step 1: Write the failing tests**

```js
it('runs Stryker over the covered added lines with only the RED tests') // one stryker call; written config mutate ['core/a.ts:7-8']
it('adds a warning for each surviving mutant without failing the cycle') // status 'proven'
it('runs no Stryker when no covered line is in a mutated folder') // editor/ only
it('warns when Stryker fails instead of failing the cycle')
it('runs no Stryker when the RED tests fail at GREEN')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the GREEN proof to mutate added lines`,
      `feat: mutate the added lines of each GREEN commit`, then BLUE.

### Cycle 16a: cap the mutation check with a time budget

**Behavior:** the Task 13 projection puts check 4 at about 101 s per GREEN commit, so about 50 to
53 min for a pull request of 28 GREEN commits. Owner decision (2026-11-20): cap check 4 in CI.
Checks 1 to 3 still run on every GREEN commit and still block. Check 4 runs newest GREEN commit
first and starts no new mutation run once the budget is spent; a run that has started finishes.
CI passes a 15 min budget. With no budget option there is no cap, so a local
`pnpm green:proof --commit HEAD` mutates its one cycle as Cycle 16 does. A cycle the budget did not
reach gets a note, not a finding: it fails nothing, adds no annotation, and the header counts it.
The cap belongs after Cycle 16 because it gates the check 4 that Cycle 16 wires in.

**Files:** create `scripts/green-proof/mutation-budget.mjs`; modify
`scripts/green-proof/green-proof.mjs`, `scripts/green-proof/green-proof-report.mjs`, and the
module that runs check 4 (`scripts/green-proof/prove-cycle.mjs`, or the module Cycle 16 moved
check 4 into); tests `scripts/green-proof/mutation-budget.test.mjs` (create),
`scripts/green-proof/green-proof-budget.test.mjs` (create),
`scripts/green-proof/prove-cycle-mutation.test.mjs`,
`scripts/green-proof/green-proof-report.test.mjs`, and
`scripts/green-proof/green-proof-cli-test-support.mjs` (modify). No change to
`scripts/policy-check/rule-severity.mjs`: a note has no rule id.

**Interfaces:** `mutation-budget.mjs` produces:

- `MUTATION_NOT_REACHED_NOTE`, the exact note text
  `mutation check not reached: the time budget was spent`.
- `parseBudgetMinutes(value: string): number`: a whole number of minutes greater than 0 written
  as digits only (`/^[1-9]\d*$/`); anything else throws
  `--mutation-budget-minutes needs a whole number of minutes greater than 0, got <value>`.
- `createMutationBudget(minutes: number | null): MutationBudget`, with
  `MutationBudget = { canStart(): boolean, spend(ms: number): void }`. `canStart()` is true while
  the milliseconds passed to `spend` add up to less than `minutes * 60000`; with `null` it is
  always true. The budget counts only check 4 time, never install or checks 1 to 3.

`CycleContext` (the deps of `proveCycle`) gains an optional `budget?: MutationBudget`; with none,
check 4 runs as in Cycle 16, so no existing construction site changes. Where Cycle 16 starts
check 4 (check 2 passed and `mutationTargets(covered)` is not empty), the cycle first asks
`budget.canStart()`. False: push `MUTATION_NOT_REACHED_NOTE` to `result.notes`, write no Stryker
config, run no Stryker, record no `timings.mutation`, and leave the status that checks 1 to 3
gave. True: run every group of that cycle as Cycle 16 does, then call
`budget.spend(result.timings.mutation)`. The budget is asked once per cycle, so both groups of a
started cycle run. A cycle that check 4 would not run anyway (skipped, check 2 failed, no
mutation target) never asks the budget and gets no note.

`parseOptions` in `green-proof.mjs` accepts `--mutation-budget-minutes <n>` through the same
`OPTION_KEYS` loop as the other options (an unknown option and a missing value throw as today),
then passes the value through `parseBudgetMinutes`. `Options` gains
`mutationBudgetMinutes: number | null`, default `null`. A thrown option error takes the existing
path: `green:proof: internal error: <message>` and exit 2. `proveAll` creates one budget for the
run and proves the cycles newest first (`[...cycles].reverse()`), then reverses the results, so
the report keeps range order. Every cycle still runs checks 1 to 3.

`reportLines` header: when `n`, the number of results whose `notes` include
`MUTATION_NOT_REACHED_NOTE`, is above 0, the header becomes
`green:proof: <p> proven, <s> skipped, <f> failed in <range>; cycles the mutation check did not reach: <n>`.
With `n` 0 the header is unchanged. The note prints as `    note: <text>` under its cycle like any
other note.

Test support retrofit (in the RED commit): `cliScenario` may gain a way for the fake clock to jump
by a set number of milliseconds on each `stryker` call, so a test can spend the budget. Existing
CLI tests keep their output.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/green-proof/mutation-budget.test.mjs (new)
it('accepts a whole number of minutes greater than 0') // '15' -> 15
it('rejects zero, a negative number, a fraction, and text') // '0', '-5', '1.5', '15m', '' -> throws with the value
it('allows new runs until the spent time reaches the budget') // 1 min: spend 59999 -> canStart true; spend 1 -> false
it('always allows a new run without a budget') // null: spend 10 h -> canStart true

// scripts/green-proof/prove-cycle-mutation.test.mjs (modify)
it('notes a cycle the budget did not reach and runs no Stryker') // canStart false -> no stryker call, note, status 'proven'
it('spends the time of every group of a started cycle') // app and tooling groups -> one canStart, spend(timings.mutation)
it('does not ask the budget when the RED tests fail at GREEN') // canStart never called, no note

// scripts/green-proof/green-proof-budget.test.mjs (new)
it('mutates the newest GREEN commit first and lets a started run finish')
// g1, g2, g3 each with a covered core/a.ts line; each stryker call moves the clock 10 min;
// --mutation-budget-minutes 15 -> stryker runs for g3 then g2, not g1; g1 has the note
it('still runs checks 1 to 3 on a cycle the budget did not reach') // g1 parent and green vitest calls happen
it('prints the cycles in range order and counts the unreached cycles in the header')
// header ends '; cycles the mutation check did not reach: 1'; block order g1, g2, g3
it('exits 2 when the budget is not a whole number of minutes greater than 0') // '0' and 'x'
it('mutates every cycle when no budget is given') // three stryker calls, header without the suffix

// scripts/green-proof/green-proof-report.test.mjs (modify)
it('keeps the header unchanged when every cycle that needed mutation was reached')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits
      `test: expect a time budget to cap the mutation check`,
      `feat: cap the mutation check with a time budget, newest GREEN commit first`, then BLUE.

Refinements (main thread, 2026-11-21, after Cycle 16):

- Cycle 16 put check 4 in `scripts/green-proof/prove-mutation.mjs` (`checkMutation`), called from
  `checkGreen` in `prove-cycle.mjs`. `checkMutation` returns nothing when `mutationTargets` is
  empty. The budget is asked there, after that test and before any config is written, so a cycle
  with no mutation target never asks it. `proveCycle` passes `context.budget` through.
- `green-proof-cli-test-support.mjs` has no coverage or Stryker answers today: its GREEN commits
  have an empty diff, so check 4 never runs in CLI tests. The RED commit gives `cliScenario` an
  option that makes each GREEN commit add one covered `core/a.ts` line (its `git show` diff, the
  lcov file a coverage run leaves, a `stryker.conf.json` base, and an exit-0 Stryker answer with an
  empty report), plus the clock jump on each `stryker` call. Existing CLI tests keep their output.
  `green-proof-stryker-test-support.mjs` holds the Stryker fake of `scenario`; reuse it.
- `MUTATION_NOT_REACHED_NOTE` is the only note text the header counts.

**Review focus:** checks 1 to 3 run on every cycle whatever the budget; the budget counts only
check 4 time; a started cycle runs all its groups; the note never becomes a finding, so it adds no
annotation and never changes the exit code; the report order is the range order; `parseOptions`,
`proveAll`, and `reportLines` stay within 40 lines, 3 parameters, and complexity 10, and
`green-proof.mjs` stays under 300 lines.

### Task 17: the full measurement (no RED)

- [x] Rerun `time pnpm green:proof --range 35f8101b^1..35f8101b^2 --mutation-budget-minutes 15`
      with the sandbox off, the same budget CI passes. Add to "Measurement results": the total
      time, the mutation step per cycle (median and maximum), the survivor count, and how many of
      the 28 GREEN commits the budget reached (28 minus the header's count of cycles the mutation
      check did not reach). Same rule as Task 13: a false failure gets its own cycle. The capped
      run must end within the checks 1 to 3 time plus the 15 min budget plus one mutation run; a
      longer run is a defect in the cap, fixed with its own `test:` and `fix:` cycle. The total
      sets the job's `timeout-minutes` (twice the measured time, rounded up to 5 minutes, at
      least 20). Commit `docs: record the full green proof measurement`.

### Task 18: the CI job (no RED)

- [ ] In `.github/workflows/ci.yml` add, after `policy`:

```yaml
green-proof:
  name: GREEN proof
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-24.04
  needs: check
  timeout-minutes: <from Task 17>
  permissions:
    contents: read
  steps:
    # checkout with fetch-depth: 0, pnpm/action-setup@v3 version 10.33.4,
    # actions/setup-node@v4 with node-version-file '.nvmrc' and cache 'pnpm'.
    # No root install: the script uses Node built-ins and installs in its own worktree.
    - name: Prove each GREEN commit with its RED tests
      env:
        PROOF_RANGE: origin/${{ github.base_ref }}..${{ github.event.pull_request.head.sha }}
      run: pnpm green:proof --range "$PROOF_RANGE" --mutation-budget-minutes 15
```

The 15 min budget caps only check 4 (Cycle 16a); checks 1 to 3 run on every GREEN commit.

- [ ] Add `green-proof` to the `ci-complete` `needs` list, to its echo line
      (`green-proof=${{ needs.green-proof.result }}`), and to its `for result in` loop.
- [ ] `pnpm exec prettier --check .github/workflows/ci.yml` exits 0.
- [ ] Commit `ci: prove each GREEN commit on pull requests`. After the push, read the job log on
      this pull request: it must prove this branch's own cycles, and its time must agree with
      Task 17 within reason.

### Task 19: ADR-0225 and the workflow line (no RED)

- [ ] Write `docs/knowledge/decisions/ADR-0225-green-commits-are-proven-by-their-red-tests.md`
      with the frontmatter of ADR-0221 (`slug`, `title`, `type: decision`, `tags`, `related`
      with `decisions/ADR-0025-rgb-audit-and-foundation-acceptance` and
      `decisions/ADR-0221-deterministic-policy-is-checked-in-ci`, `sourceFiles`,
      `status: current`, `updated` from `date +%F`). Sections: Status; Context (only review
      reading checked minimal GREEN commits; `rgb:audit` runs no test; the weekly job never
      completed); Decision (the three proofs and mutation, which tests count, skips and mixed
      sets, moved lines, the four mutated folders, the rule ids and their severities, the
      worktree and install policy, the CI job and its place in `ci-complete`, the 15 min
      mutation budget in CI, newest GREEN commit first, `--commit` run by the main thread in the
      background during each BLUE review, the #487 cause and fix, the Stryker version);
      Consequences (minutes of CI per
      pull request with the Task 17 numbers, equivalent mutants as noise kept to warnings,
      end-to-end-only cycles unproven); Alternatives considered (the spec's approaches 2 and 3);
      References (spec, plan, #487, PR #961 measurement).
- [ ] In `CLAUDE.md` "Workflow" step 6, add: the main thread runs `pnpm green:proof --commit HEAD`
      in the background during the review; the RED, GREEN, and refactor agents never run it.
- [ ] Run the `humanizer` skill on the ADR prose, then `grep -c $'\u2014'` on both files prints 0
      and `pnpm knowledge:index` exits 0.
- [ ] Commit `docs: record the decision to prove GREEN commits with their RED tests`.

### Task 20: verify the branch

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, checking each
      command's own exit code.
- [ ] `pnpm rgb:audit --range origin/main..HEAD` prints the clean line; `pnpm policy:check` exits
      0; `pnpm green:proof --range origin/main..HEAD` exits 0 (sandbox off).
- [ ] Size limits on the new and changed non-test scripts, exit 0: the `eslint --no-config-lookup`
      command of Task W4 in `docs/plans/2026-11-19-policy-checks-in-ci.md`, over
      `scripts/green-proof/*.mjs scripts/rgb-audit/*.mjs scripts/policy-check/rule-severity.mjs`
      without `*.test.mjs` and `*-test-support.mjs`.
- [ ] `git log origin/main..HEAD --format='%B' | grep -c -i -e '^co-authored-by:' -e '-session:'` prints 0.
- [ ] `/clean-code-review` over the branch, then `/review`, before landing. Confirm the
      `mutation.yml` dispatch of Task 2 completed.

## Follow-up (do not edit here; the main thread files one issue)

`.claude/` files are not writable from the sandbox. The owner adds `pnpm green:proof --commit HEAD`,
run by the main thread in the background during the BLUE review and never by the RED, GREEN, or
refactor agent, to `.claude/commands/clean-code-review.md` and to "The red-green-blue cycle" of
`.claude/skills/vernacular-change-control/SKILL.md`; adds `pnpm green:proof` and its rule ids to
`.claude/skills/vernacular-diagnostics-and-tooling/SKILL.md`; adds the `green-proof` job to the CI
job table of `.claude/skills/vernacular-validation-and-qa/SKILL.md`; and trims the minimal-GREEN
reading from `.claude/agents/pr-reviewer.md` to cycles the job skipped.

## Spike results

Run on 2026-11-20 with Vitest 4.1.12. Stryker 8.7.1 failed (b), so Step 4 upgraded core,
`vitest-runner`, and `typescript-checker` to 10.0.0 (10.1.1 is from 2026-10-23, inside the
cooldown). The facts below are for 10.0.0 unless they name 8.7.1.

- **(a)** The checker plugin loads with the explicit `plugins` list. Without the list, the run
  stops with "no Checker plugins were loaded". With `tsconfigFile: "tsconfig.json"` the checker
  fails to start: the root config has `references`, so the checker runs in build mode, turns on
  `declaration`, and reports TS4058 in `tests/performance/timing/frame-probe-test-setup.ts`. A
  generated `{ "extends": "../tsconfig.json" }` under `.green-proof/` has no `references`, and the
  checker starts with it.
- **(b)** 8.7.1 rejects `vitest.related` ("must NOT have additional properties"), and without it
  the initial run crashes with "Cannot destructure property 'moduleGraph' of 'project.server'".
  It did not fail on pool options. 10.0.0 accepts `related: false` and the dry run passes.
- **(c)** For `core/units/format-area.ts:10-20` the mutants are on lines 15, 16, and 20, and none
  are on line 21. Lines are 1-based and the end line is inclusive.
- **(d)** The initial test run lists only `format-area.test.ts` (5 tests), and the report's
  `testFiles` holds only `core/units/format-area.test.ts`.
- **(e)** `files` keys are repository-relative (`core/units/format-area.ts`). A mutant has
  `status` in PascalCase (`Killed`, `Survived`, `CompileError`), `mutatorName` such as
  `EqualityOperator`, `replacement` as source text (`"preferences.system !== 'metric'"`), and
  1-based `location.start.line` and `location.start.column`. A checker rejection is
  `CompileError` with the `tsc` message in `statusReason`.
- **(f)** 118 s wall for 6 mutants. Starting the checker took about 87 s of it, the initial test
  run 1 s.

**Step 3:** `scripts/policy-check/report.mjs:19-30` with `report.test.mjs` and `checkers: []`
runs in 11 s: 21 mutants, 20 killed, 1 survived. With the `typescript` checker the result is the
same (no `CompileError`, so the checker ignores `.mjs` mutants) and the run takes 101 s. Decision 6
holds for `scripts/`.

## Measurement results

All times come from the owner's development machine under uncontrolled conditions. Read them as
estimates, not as a benchmark.

**Task 13, repeated run after Cycles 13a and 13b (2026-11-20).** `time pnpm green:proof --range
35f8101b^1..35f8101b^2`, sandbox off, at 7cb79878. A full Stryker seed run used all cores at the
same time, so the times are high.

- Total: 6 min 7 s wall (220 s user, 85 s system). The first run, with no other load, took
  2 min 57 s.
- Install: one install of 15.4 s; the other 27 cycles reuse it (0.0 s).
- Per GREEN commit (28): parent step median 5.8 s, maximum 10.6 s; green step median 5.8 s,
  maximum 8.0 s; type-check 0.0 s (no TypeScript in the range); mutation 0.0 s (not wired until
  Cycle 14).
- Counts: 25 proven, 0 skipped, 3 failed. No false failure.
- Failures, all true (each line has a RED coverage count of 0):
  - 8a3e81ec: 6 `uncovered-added-line` (`spawnCommitlint` in `policy-check.mjs` 122 to 128, a real
    process wrapper outside the guard block; `locationOf` fallbacks in `report.mjs` 24 and 29)
    and 8 `uncovered-guard-line` warnings (`policy-check.mjs` 138 to 152).
  - e3ca5dfb: 1 `uncovered-added-line` (`report.mjs:27`, the plain-format branch; its RED tests
    run only with GitHub Actions output).
  - 90cb5194: 1 `uncovered-added-line` (`cycle-audit.mjs:221`, a rewrite inside the GREEN commit
    that its `test:`-only RED test does not reach) and 1 `uncovered-guard-line` warning
    (`rgb-audit.mjs:94`).
  - 6656c27d failed in the first run on `rgb-audit.mjs:94` only; it is proven now with one guard
    warning.
- Projection: every GREEN commit in the range changes only `.mjs` scripts, so each mutation run
  costs about the spike's 101 s for a script file. 28 times 101 s is about 47 min, so a pull
  request of this size would take about 50 to 53 min. The owner decided (2026-11-20) to cap the
  mutation check in CI at 15 min, newest GREEN commit first; checks 1 to 3 still run on every
  GREEN commit (Cycle 16a).

**Task 17, full measurement with the 15-minute budget (2026-11-21).** Sandbox off, at 59dc0ecc.
The full Stryker seed run used all cores during both runs, so the times are high.

- `time pnpm green:proof --range 35f8101b^1..35f8101b^2 --mutation-budget-minutes 15`: 29 min
  43 s wall (770 s user, 740 s system), exit 1. 25 proven, 0 skipped, 3 failed: the same three
  true failures as Task 13. Install 15.8 s once; parent step median 23.0 s, maximum 64.9 s; green
  step median 21.0 s, maximum 65.1 s; mutation step median 10.7 s, maximum 19.3 s, 322 s in all.
  The budget reached all 28 GREEN commits (no count in the header). But check 4 could not run on
  27 of them: they carry Stryker 8.7.1 and the old `stryker.conf.json`, from before the #487 fix,
  so each gives a `mutation-run-failed` warning (`Stryker exited 1 for the tooling group: }`).
  The warning is a true reading, so this is not a false failure. The last output line `}` tells
  the reader little (follow-up).
- Because of that, a second run proved this branch's own cycles: an autosquashed copy of the
  branch rebased onto `origin/main` 66818720, `--range origin/main..HEAD`. The first such run
  found two true failures in this branch (fc535c31 `prove-cycle.mjs:72`, the assets-only skip;
  51ea3f28 `prove-cycle.mjs:109` and `vitest-worktree.mjs:66`, the empty and unreadable Vitest
  throws). RED fixups in two new test files fixed them. The rerun: 12 min 16 s wall (640 s user,
  289 s system), exit 0, 16 proven, 0 skipped, 0 failed. Install 21.1 s once (26 s in all);
  parent step median 9.4 s, maximum 13.1 s; green step median 8.5 s, maximum 13.7 s; mutation
  step median 17.3 s, maximum 64.3 s, 394 s in all. All 16 GREEN commits were reached. 33
  surviving-mutant warnings; 10 `mutation-run-failed` warnings, on the cycles before the commit
  that adds the Stryker `plugins` line.
- The capped run ends within checks 1 to 3 plus the 15-minute budget plus one mutation run in
  both runs, because the mutation total stayed under the budget.
- Job timeout: twice the longer run (29 min 43 s), rounded up to 5 minutes: 60 minutes.
