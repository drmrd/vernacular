# Repository policy checks in CI: implementation plan

> **For agentic workers:** run every cycle from the main thread with the role-separated agents of
> this repository: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`. A background
> agent cannot dispatch them. The test-author never sees implementation files and the implementer
> never sees test files, so the Interfaces block of each cycle is the only contract between them:
> pass it to both, word for word. Tick the checkboxes as the work lands.

**Goal:** move the deterministic repository policy that reviewer agents check by reading (or that
nobody checks) into one script, `pnpm policy:check`, that runs on every pull request in a new
required CI job, and extend `scripts/rgb-audit` with two commit file-scope rules.

**Architecture:** a dependency-injected Node CLI under `scripts/policy-check/`, in the shape of
`scripts/rgb-audit/rgb-audit.mjs` and `scripts/ci/decide.mjs`: a thin shell reads `git` output
for the pull request range, pure modules parse it and apply one rule each, and one severity table
decides which findings fail the job and which only warn. A new `policy` job in
`.github/workflows/ci.yml` runs it on pull requests with no `needs`, and `ci-complete` gains it in
its `needs` list, so a failing rule fails the required check. The two new history rules live in
the existing auditor (`ping-pong` job), which reads the same severity table.

**Tech stack:** Node 22 ESM (`.mjs` with JSDoc types), Node built-ins only, the existing
`@commitlint/cli` 21.0.1 devDependency, Vitest unit project, GitHub Actions.

**Spec:** none, by owner decision. The requirements are the owner decisions copied into Global
Constraints and the Decisions section below. ADR-0221 (Task W3) records them.

## Global Constraints

- Work only in `/Users/dan/workspace/vernacular.wt/policy-checks`, branch
  `feat/policy-checks-in-ci`. Never use `git stash` in any form.
- Conventional Commits, with the ten types of the `type-enum` rule in `commitlint.config.js`.
- Author identity on every commit: `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- No `Co-Authored-By:` trailer and no AI-session trailer (`Claude-Session:` or similar) in any
  commit, even when the session harness asks for one. Once cycle 3 lands, the branch's own CI run
  fails on them.
- No em-dash characters in any new text: plan, ADR, comments, commit messages.
- No internal shorthand or milestone codes in names, subjects, or text. No third-party product
  names.
- No new dependencies. Node built-ins plus the installed commitlint only.
- Size limits from `eslint.config.js`: functions at most 40 lines (blank lines and comments
  skipped), files at most 300 lines, at most 3 parameters, complexity at most 10, nesting depth at
  most 3, no magic numbers outside `-1, 0, 1, 2, 100` (name a `const`), no flag arguments. ESLint
  applies these only to `**/*.{ts,tsx}`: `eslint --print-config scripts/rgb-audit/cycle-audit.mjs`
  shows no size rules for `.mjs`. So the code meets them by hand and Task W4 checks them with an
  explicit command. Test files get the relaxed test limits: function length 120, magic numbers
  allowed.
- Red-green-blue: one behavior per cycle. RED is a `test:` commit that changes only test files
  (including `*-test-support.mjs` helpers). GREEN is `feat:` and touches no test file. BLUE is a
  `refactor:` commit, or the empty marker
  `git commit --allow-empty -m "refactor: mark the <name> cycle blue"`. A `refactor:` commit never
  changes a `*.test.*` file. If review finds a problem in test code, fix it in a `test:` commit
  after the `refactor:` commit, not inside it.
- Model routing for dispatches: test-author and implementer on `sonnet` at medium effort,
  clean-code-reviewer on `opus` at high effort, refactorer on `sonnet` at medium effort, the final
  `/review` on `opus` at high effort.
- ADR number ADR-0221 is pre-assigned. `docs/knowledge/decisions/` has no 0221 on
  `a0a5cbba` (checked 2026-11-19). Check again against `origin/main` before landing.

## Decisions taken in this plan (with the evidence)

1. **Branch prefixes.** Allowed: any commit type from `commitlint.config.js` followed by `/` and a
   non-empty rest, plus the bot prefixes `release-please--branches--` and `dependabot/`.
   CLAUDE.md names only `feat/ fix/ docs/`, but the merged history of `origin/main` has 177
   `feat/`, 88 `fix/`, 63 `docs/`, 12 `chore/`, 7 `test/`, 4 `build/`, 3 `ci/` pull-request
   branches. The latest are #933 `test/share-near-wall-fade-fixtures` and #867
   `ci/run-the-live-view-start-up-spec-on-macos`. Failing those would break the current practice.
   The type list is read from `commitlint.config.js` so it has one home. `integration/` (4 uses,
   last on 2026-07-01) is not allowed. Owner may veto this.
2. **Bot exemption.** The only bot authors in history are
   `41898282+github-actions[bot]@users.noreply.github.com` (release-please, 6 commits) and
   `49699333+dependabot[bot]@users.noreply.github.com` (3 commits). A commit is
   exempt from the author rule only when its author email is one of these two and the branch
   starts with that bot's prefix (`release-please--branches--` or `dependabot/`). A human commit on
   a bot branch (for example a pushed `Release-As` commit) is still checked. Bot commits still go
   through commitlint and the trailer rule; their messages pass both today. Only the author is
   checked, not the committer (the web UI commits as `GitHub <noreply@github.com>`).
3. **The test file definition for the `test:` scope rule.** The existing auditor defines a test
   file as `/\.test\.(ts|tsx|mjs|js)$/`. Used alone for the `test:` rule, 96 of 638 `test:`
   commits since 2026-08-01 would fail, almost all for test support files
   (`*-test-support.ts`, `*-test-kit.ts`, `*-test-fixtures.ts`, `tests/` harness, stories,
   `*-contract.ts`, which `eslint.config.js` already lints as test files). With the wider
   "test asset" definition in cycle 15, 2 of 638 fail. Over all history it is 36 of 1954. The
   `independence` rule and the new `refactor:` rule keep the existing strict definition.
4. **Whole-file pin check.** The pin rule parses the head version of each changed `package.json`
   and checks every entry of `dependencies`, `devDependencies`, `optionalDependencies`,
   `peerDependencies`, and `pnpm.overrides`. Checking only added lines cannot tell which section a
   line belongs to (`engines` has `>=22.18.0` by design). `main` passes today (checked), so the
   result is the same in practice and stricter.
5. **Conditional e2e skips are not flagged.** `e2e/` has 46 `test.skip(<condition>, <reason>)`
   self-skips (WebGPU, WebKit). Only a skip with a title or with no arguments warns.
6. **Detached HEAD locally.** When no `--branch` is given and `git rev-parse --abbrev-ref HEAD`
   prints `HEAD`, the branch rules are skipped with a logged note, and the bot exemption never
   applies.

Resolved 2026-11-19: the owner kept the `refactor:` rule as failing, with an exemption for
test-file changes that only follow a rename or move (pure renames and import/export-path lines;
see cycle 16). The evidence that led to it: the strict `refactor:` rule
fails 32 of 550 `refactor:` commits since 2026-08-01 (139 of 1769 over all history). 21 of the 32
changed implementation and tests together: renames, moves, and retirements whose tests import the
moved names (`6a9381e5`, `f1a4a309`, `72ddaebf`). 11 changed only tests. Under the rule, a rename
that touches test imports needs a `refactor:` for the implementation and then a `test:` for the
tests, and the commit between them does not typecheck. If the owner prefers a warning, it is a
one-line change in `RULE_SEVERITY` (cycle 17 makes the auditor honor the table).

## Review Focus

1. A branch that merged `main` into itself: main's commits and changes must not count as the pull
   request's. Commits come from `git log --no-merges base..head` and changes from the three-dot
   diff `base...head`. Cycle 11 asserts the exact git arguments.
2. A diff line whose added text starts with `++ ` shows up as `+++ ...` inside a hunk and must
   parse as an added line, not a file header. Cycle 2 tests it.
3. A rename or deletion: a spec moved out of `docs/specs/` still needs an ADR, a deleted ADR does
   not count as one, and a deleted `package.json` or Markdown file is never read at head. Cycles
   7, 8, and 9 test these.
4. An em-dash on an added line inside a fenced block whose opening fence is on an unchanged line
   above it is exempt, and so is one in inline code. Cycle 7 tests it with head content.
5. Detached HEAD or a branch given on the command line: the rule set changes as Decision 6
   describes. Cycle 12 tests it. The CI step passes the branch through an environment variable,
   never by inline `${{ }}` in the script, because branch names come from the pull request author.

---

## File structure

| File                                               | Responsibility                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/policy-check/git-input.mjs`               | parse `git log`, unified diff, and name-status output             |
| `scripts/policy-check/identities.mjs`              | owner identity and bot identities with their branch prefixes      |
| `scripts/policy-check/commit-rules.mjs`            | forbidden trailers, author identity                               |
| `scripts/policy-check/branch-rules.mjs`            | branch prefix                                                     |
| `scripts/policy-check/milestone-codes.mjs`         | milestone-code warnings for subjects and the branch name          |
| `scripts/policy-check/markdown-code.mjs`           | which lines of a Markdown file are fenced code; strip inline code |
| `scripts/policy-check/prose-rules.mjs`             | em-dash warnings                                                  |
| `scripts/policy-check/package-pins.mjs`            | exact pins in `package.json`                                      |
| `scripts/policy-check/spec-adr.mjs`                | a spec change needs an ADR                                        |
| `scripts/policy-check/e2e-rules.mjs`               | e2e timing, skip, and only warnings                               |
| `scripts/policy-check/rule-severity.mjs`           | `RULE_SEVERITY`, the one severity table, and `severityOf`         |
| `scripts/policy-check/report.mjs`                  | plain lines and GitHub annotations                                |
| `scripts/policy-check/policy-check.mjs`            | CLI shell: options, git reads, commitlint, collect, report, exit  |
| `scripts/rgb-audit/test-files.mjs`                 | `isTestFile` (moved existing pattern) and `isTestAsset`           |
| `scripts/rgb-audit/scope-rules.mjs`                | `test-scope` and `refactor-scope` violations                      |
| `scripts/rgb-audit/cycle-audit.mjs` (modify)       | call the scope rules; use `isTestFile`                            |
| `scripts/rgb-audit/rgb-audit.mjs` (modify)         | exit code from the severity table                                 |
| `package.json` (modify)                            | `policy:check` script                                             |
| `.github/workflows/ci.yml` (modify)                | `policy` job; `ci-complete` needs it                              |
| `docs/knowledge/decisions/ADR-0221-...md` (create) | the decision record                                               |

Tests sit next to their module as `*.test.mjs`. Vitest's unit project picks them up through the
default include (`vite.config.ts` excludes only `e2e/**`, `.claude/**`, and build folders), and
`scripts/ci/select-tests.mjs` selects `scripts/` on a pull request that changes it. Run one cycle's
tests with `pnpm exec vitest run --project unit <path>`.

The worktree has no `node_modules` and no `.husky/_`, so hooks do not run there. Task 0 installs
dependencies; Task W4 runs commitlint over the range by hand.

## Shared types (every cycle uses these names)

```js
/** @typedef {{ sha: string, authorName: string, authorEmail: string, subject: string, message: string }} PolicyCommit */
/** @typedef {{ file: string, line: number, text: string }} AddedLine */
/** @typedef {{ status: string, path: string, previousPath?: string }} ChangedFile */
/** @typedef {{ rule: string, message: string, sha?: string, file?: string, line?: number }} Finding */
/** @typedef {(path: string) => string} ReadFile  head content of a repository path */
```

`message` is the full raw commit message (`%B`, trailing newline trimmed); `subject` is its first
line. `status` is the first letter of the name-status code (`A M D R C T`); `previousPath` is
present only for `R` and `C`. Rule functions return `[]` when nothing is wrong and never return
null.

Rule ids (exact strings): `commit-message-format`, `forbidden-trailer`, `author-identity`,
`branch-prefix`, `milestone-code`, `em-dash`, `spec-needs-adr`, `exact-pin`,
`e2e-timing-or-focus`, and the auditor's `ordering`, `independence`, `blue`, `test-scope`,
`refactor-scope`.

---

### Task 0: Set up the worktree

- [ ] **Step 1:** `cd /Users/dan/workspace/vernacular.wt/policy-checks && pnpm install --frozen-lockfile`.
      Expected: exit 0.
- [ ] **Step 2:** `pnpm exec vitest run --project unit scripts/rgb-audit` passes, and
      `ls docs/knowledge/decisions | grep -c ADR-0221` prints `0`.

### Cycle 1: parse the commit log

**Files:** create `scripts/policy-check/git-input.mjs`; test `scripts/policy-check/git-input-commits.test.mjs`.

**Interfaces:** produces `parseCommitLog(raw: string): PolicyCommit[]`. Input format: records
separated by `\x1e`; each record is `sha \x1f authorName \x1f authorEmail \x1f message`, made by
`--format=%x1e%H%x1f%an%x1f%ae%x1f%B`. Empty input gives `[]`. Records that are only whitespace are
dropped. Leading newline of a record (git puts one between records) is trimmed; the message keeps
its inner newlines.

- [ ] **Step 1: Write the failing tests**

```js
it('returns no commits for empty output') // parseCommitLog('') -> []
it('reads sha, author, subject, and the full message of each record', () => {
  const raw =
    '\x1eaaa\x1fDan Moore\x1f9156191+drmrd@users.noreply.github.com\x1ffeat: add x\n\nBody line\nInfrastructure: glue\n' +
    '\n\x1ebbb\x1fdependabot[bot]\x1f49699333+dependabot[bot]@users.noreply.github.com\x1fbuild(deps): bump y\n'
  expect(parseCommitLog(raw)).toEqual([
    {
      sha: 'aaa',
      authorName: 'Dan Moore',
      authorEmail: '9156191+drmrd@users.noreply.github.com',
      subject: 'feat: add x',
      message: 'feat: add x\n\nBody line\nInfrastructure: glue',
    },
    {
      sha: 'bbb',
      authorName: 'dependabot[bot]',
      authorEmail: '49699333+dependabot[bot]@users.noreply.github.com',
      subject: 'build(deps): bump y',
      message: 'build(deps): bump y',
    },
  ])
})
```

- [ ] **Step 2:** `pnpm exec vitest run --project unit scripts/policy-check/git-input-commits.test.mjs` FAILS (module missing).
- [ ] **Step 3:** implement `parseCommitLog` in `git-input.mjs`. Declare the separators as named constants.
- [ ] **Step 4:** the same command PASSES.
- [ ] **Step 5:** commits `test: pin how the policy check reads the commit log`, `feat: parse the commit log for the policy check`, then BLUE.

### Cycle 2: parse the pull request diff

**Files:** modify `scripts/policy-check/git-input.mjs`; test `scripts/policy-check/git-input-diff.test.mjs`.

**Interfaces:** produces `parseUnifiedDiff(raw: string): AddedLine[]` and
`parseNameStatus(raw: string): ChangedFile[]`.

`parseUnifiedDiff` reads `git diff --unified=0` output with a two-state machine. A `diff --git`
line enters the header state. In the header state, `+++ b/<path>` sets the current file and
`+++ /dev/null` clears it. A hunk header `@@ -a[,b] +c[,d] @@` enters the hunk state and sets the
next new line number to `c`. In the hunk state, every line starting with `+` is an added line
`{ file, line, text }` (text without the `+`) and advances the line number; lines starting with
`-` or `\` do not. `Binary files ... differ` yields nothing.

`parseNameStatus` reads tab-separated lines: `M\tpath`, `R087\told\tnew` gives
`{ status: 'R', path: 'new', previousPath: 'old' }`.

- [ ] **Step 1: Write the failing tests**

```js
it('numbers added lines by their line in the new file across two hunks')
// @@ -3,0 +4,2 @@ with '+one','+two' then @@ -10 +12 @@ with '-old','+new'
// -> [{file:'docs/a.md',line:4,text:'one'},{...line:5,text:'two'},{...line:12,text:'new'}]
it('reads an added line that starts with ++ as an added line, not a file header')
// hunk line '+++ heading' -> { file: 'docs/a.md', line: 1, text: '++ heading' }
it('gives no added lines for a deleted file or a binary file')
// '+++ /dev/null' section and 'Binary files a/x.png and b/x.png differ' -> []
it('reads modified, added, deleted, and renamed paths from name-status output')
// 'M\tpackage.json\nA\tdocs/knowledge/decisions/ADR-0300-x.md\nD\told.md\nR100\tdocs/specs/a.md\tdocs/archive/a.md'
// -> [{status:'M',path:'package.json'},{status:'A',path:'docs/knowledge/decisions/ADR-0300-x.md'},
//     {status:'D',path:'old.md'},{status:'R',path:'docs/archive/a.md',previousPath:'docs/specs/a.md'}]
```

- [ ] **Steps 2 to 5:** run, see FAIL; implement; run, see PASS; commits
      `test: pin how the policy check reads the pull request diff`,
      `feat: parse added lines and changed paths for the policy check`, then BLUE.

### Cycle 3: refuse co-author and AI-session trailers

**Files:** create `scripts/policy-check/commit-rules.mjs`; test `scripts/policy-check/trailer-rule.test.mjs`.

**Interfaces:** produces `trailerFindings(commits: PolicyCommit[]): Finding[]`, rule
`forbidden-trailer`, one finding per offending line, with `sha`. A line offends when, matched
case-insensitively at the start of a message line (leading spaces allowed), it is
`co-authored-by:`, a hyphenated key ending in `-session:` (`/^\s*[a-z0-9]+(?:-[a-z0-9]+)*-session\s*:/im`),
`generated-by:`, or `assisted-by:`, or when the line contains `generated with [claude code]`.

- [ ] **Step 1: Write the failing tests**

```js
it('refuses a Co-Authored-By trailer in any letter case') // 'Co-authored-by: X <x@y>' -> 1 finding, sha 'aaa'
it('refuses AI-session trailers such as Claude-Session') // 'Claude-Session: https://...' and 'AI-Session: 1' -> 2 findings
it('refuses a generated-with footer line') // 'Generated with [Claude Code](https://...)' -> 1 finding
it('accepts the Infrastructure and Signed-off-by trailers and session words in prose')
// 'Infrastructure: glue', 'Signed-off-by: dependabot[bot] <support@github.com>',
// 'the editor session: kept' (mid-line), 'Session: plain' -> []
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to refuse co-author and session trailers`,
      `feat: refuse co-author and AI-session trailers in pull request commits`, then BLUE.

### Cycle 4: require the owner's author identity

**Files:** create `scripts/policy-check/identities.mjs`; modify `scripts/policy-check/commit-rules.mjs`;
test `scripts/policy-check/author-rule.test.mjs`.

**Interfaces:** produces `authorFindings(commits: PolicyCommit[], branch: string): Finding[]`,
rule `author-identity`, one finding per commit, with `sha`; message names the actual
`name <email>`. `identities.mjs` exports
`OWNER_IDENTITY = { name: 'Dan Moore', email: '9156191+drmrd@users.noreply.github.com' }` and
`BOT_IDENTITIES`, a frozen array of `{ email, branchPrefix }`:
`41898282+github-actions[bot]@users.noreply.github.com` with `release-please--branches--`, and
`49699333+dependabot[bot]@users.noreply.github.com` with `dependabot/`. A commit passes when name
and email both equal the owner's, or when its email is a bot's and `branch` starts with that bot's
prefix. An empty `branch` never exempts.

- [ ] **Step 1: Write the failing tests**

```js
it('accepts commits by the owner identity')
it('refuses a commit whose name or email differs from the owner identity')
// { authorName: 'Dan Moore', authorEmail: 'dan@example.com' } -> 1 finding, message contains 'dan@example.com'
it(
  'exempts a release-please commit on a release-please branch and a dependabot commit on a dependabot branch',
)
it("refuses a bot commit on a branch that is not that bot's")
// dependabot email on 'feat/x' -> 1 finding; github-actions email on 'dependabot/npm_and_yarn/x' -> 1 finding
it('does not exempt a bot commit when the branch is unknown') // branch '' -> 1 finding
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to require the owner author identity`,
      `feat: require the owner author identity with release-please and dependabot exempt`, then BLUE.

### Cycle 5: require a branch prefix

**Files:** create `scripts/policy-check/branch-rules.mjs`; test `scripts/policy-check/branch-rule.test.mjs`.

**Interfaces:** produces `branchFindings(branch: string, commitTypes: readonly string[]): Finding[]`,
rule `branch-prefix`, at most one finding, no `sha`. Consumes `BOT_IDENTITIES` (cycle 4) for the
bot prefixes. A branch passes when it starts with `<type>/` for a type in `commitTypes` and has at
least one character after the slash, or starts with a bot prefix. `branch === ''` gives `[]` (the
CLI logs the skip, cycle 12). The CLI passes `commitTypes` from
`commitlint.config.js` `rules['type-enum'][2]`; tests pass the literal ten-type list.

- [ ] **Step 1: Write the failing tests**

```js
const TYPES = ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf', 'build', 'ci']
it('accepts a branch named after any commit type') // feat/policy-checks-in-ci, test/share-fixtures, ci/run-x -> []
it('accepts the release-please and dependabot branches') // release-please--branches--main--components--vernacular, dependabot/npm_and_yarn/x -> []
it('refuses a branch without a commit-type prefix') // feature/x, integration/preview, main -> 1 finding each
it('refuses a prefix with nothing after the slash') // 'feat/' -> 1 finding
it('skips the rule when the branch is unknown') // '' -> []
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to require a commit-type branch prefix`,
      `feat: require a commit-type prefix on the pull request branch`, then BLUE.

### Cycle 6: warn about milestone codes

**Files:** create `scripts/policy-check/milestone-codes.mjs`; test `scripts/policy-check/milestone-codes.test.mjs`.

**Interfaces:** produces `milestoneCodeFindings(commits: PolicyCommit[], branch: string): Finding[]`,
rule `milestone-code`; subject findings carry `sha`, the branch finding has none. A subject offends
when it matches `/\b[A-Z]{1,2}\d{1,2}(?:\.\d+)?\b/` (a short code such as `M3`, `A2`, `P1.2`) or
`/\b(?:[Pp]hase|[Ss]tage|[Ww]ave|[Mm]ilestone|[Ss]print|[Ll]ane|[Ss]lice)[\s_-]+(?:\d+[A-Za-z]?|[A-Z])\b/`.
A branch offends when, after its first `/`, a token split on `[-/_.]` matches `/^[a-z]{1,2}\d{1,2}$/`,
or a token in `phase stage wave milestone sprint lane slice` is followed by a token matching
`/^(?:\d+[a-z]?|[a-z])$/`. Calibration: the subject patterns hit 9 of the last 3000 subjects on
`main`, all real shorthand ("lane 5", "slice 2", "slice-A").

- [ ] **Step 1: Write the failing tests**

```js
it('warns about a short code or a numbered phase in a subject')
// 'feat: finish M3 walls', 'docs: plan for slice 2', 'fix: close wave A' -> one finding each, with sha
it('leaves ADR numbers, versions, and ordinary words alone')
// 'docs: record ADR-0221', 'build: bump to 4.1.10', 'feat: WebGL2 fallback', 'fix: H.264 note',
// 'docs: tick the executed steps', 'feat: stage a change for review' -> []
it('warns about a code in the branch name') // 'feat/m3-walls', 'fix/lane-5-fade' -> 1 finding each, no sha
it('leaves a plain branch name alone') // 'build/vitest-browser-4-1-10', 'feat/policy-checks-in-ci' -> []
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to warn about milestone codes`,
      `feat: warn about milestone codes in subjects and branch names`, then BLUE.

### Cycle 7: warn about em-dashes in added prose

**Files:** create `scripts/policy-check/markdown-code.mjs` and `scripts/policy-check/prose-rules.mjs`;
test `scripts/policy-check/em-dash-rule.test.mjs`.

**Interfaces:** produces `emDashFindings(addedLines: AddedLine[], readFile: ReadFile): Finding[]`,
rule `em-dash`, with `file` and `line`. The character is U+2014 only. Prose files end in `.md`,
`.mdx`, or `.txt`. Exempt paths: `CHANGELOG.md`, `LICENSE`, `NOTICE`, `CODE_OF_CONDUCT.md`.
For each prose file with added lines, `readFile(file)` is called once; a line is code when it is a
fence line or between an opening fence `/^ {0,3}(`{3,}|~{3,})/`and a closing fence of the same
character at least as long (an unclosed fence runs to the end of the file). On other lines, inline
code spans (backtick runs and what they enclose) are removed before the check.`markdown-code.mjs`exports`fencedLineNumbers(content: string): Set<number>`(1-based) and`withoutInlineCode(text: string): string`. `readFile` is never called for a file with no added
lines (a deleted file has none).

- [ ] **Step 1: Write the failing tests** (in the test source, write the em-dash as `'\u2014'`
      so the file itself carries no em-dash)

```js
it('warns about an em-dash on an added Markdown line') // file, line asserted
it('ignores an added line inside a fenced block opened on an unchanged line') // fence at line 1 of head content, added line 3
it('ignores an em-dash inside inline code and on tilde fences')
it('ignores source files and the exempt canonical files') // core/a.ts, CHANGELOG.md, LICENSE -> []
it('reads each prose file once and never reads a file with no added lines') // readFile = vi.fn(); call count asserted
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to warn about em-dashes in added prose`,
      `feat: warn about em-dashes in added prose outside code`, then BLUE.

### Cycle 8: require exact dependency pins

**Files:** create `scripts/policy-check/package-pins.mjs`; test `scripts/policy-check/package-pins.test.mjs`.

**Interfaces:** produces `exactPinFindings(changedFiles: ChangedFile[], readFile: ReadFile): Finding[]`,
rule `exact-pin`, with `file` and, when found, `line` (the first line of the file containing
`"<name>":`). Checked files: status other than `D`, path matching `/(^|\/)package\.json$/`.
Sections: `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`,
`pnpm.overrides`. A version passes when it matches
`/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/` or is `npm:<name>@<that exact form>`.
The message names section, package, and value. A file that does not parse as JSON gives one
finding saying so.

- [ ] **Step 1: Write the failing tests**

```js
it('accepts exact versions, prereleases, and exact npm aliases') // '19.2.6', '1.0.0-rc.1', 'npm:foo@2.0.0'
it('refuses caret, tilde, and other ranges in every dependency section')
// dependencies '^1.2.3', devDependencies '~4.0.0', peerDependencies '>=1', pnpm.overrides 'x' '*' -> 4 findings with line
it('leaves engines and scripts alone') // engines.node '>=22.18.0' -> []
it('skips a deleted package.json and files that are not package.json') // readFile not called
it('reports a package.json that does not parse')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to refuse dependency ranges`,
      `feat: require exact dependency pins in every package.json`, then BLUE.

### Cycle 9: a spec change needs an ADR

**Files:** create `scripts/policy-check/spec-adr.mjs`; test `scripts/policy-check/spec-adr.test.mjs`.

**Interfaces:** produces `specNeedsAdrFindings(changedFiles: ChangedFile[]): Finding[]`, rule
`spec-needs-adr`, at most one finding with `file` set to the first spec path; message lists every
spec path. A spec change is any entry whose `path` or `previousPath` starts with `docs/specs/`. An
ADR is an entry with status `A`, `M`, or `R` whose `path` matches
`/^docs\/knowledge\/decisions\/ADR-\d{4}-[^/]+\.md$/`.

- [ ] **Step 1: Write the failing tests**

```js
it('accepts a pull request without spec changes')
it('refuses a spec change without an added or modified ADR') // M docs/specs/x.md -> 1 finding, file 'docs/specs/x.md'
it('accepts a spec change with an added or a modified ADR')
it('counts a spec moved out of docs/specs as a spec change') // R previousPath 'docs/specs/a.md' -> 1 finding
it('does not count a deleted ADR or a file outside decisions') // D ADR, A docs/knowledge/INDEX.md -> 1 finding
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect a spec change to need an ADR`,
      `feat: require an ADR in any pull request that changes a spec`, then BLUE.

### Cycle 10: warn about e2e timing waits, static skips, and focused tests

**Files:** create `scripts/policy-check/e2e-rules.mjs`; test `scripts/policy-check/e2e-rules.test.mjs`.

**Interfaces:** produces `e2eTimingFindings(addedLines: AddedLine[]): Finding[]`, rule
`e2e-timing-or-focus`, with `file` and `line`. Checked lines: files under `e2e/` ending in `.ts`,
`.tsx`, or `.mjs`, excluding lines whose trimmed text starts with `//` or `*`. Patterns:
`/\bwaitForTimeout\s*\(/`, `/\bsleep\s*\(/`, `/\bsetTimeout\s*\(/`,
`/\b(?:test|it|describe)(?:\.describe)?\.only\s*\(/`, and the static skip
`/\b(?:test|it|describe)(?:\.describe)?\.skip\s*\(\s*(?:['"`]|\))/`.

- [ ] **Step 1: Write the failing tests**

```js
it('warns about waitForTimeout, sleep, and setTimeout in an added e2e line')
it('warns about a focused test and a skip with a title or with no arguments')
// "test.only('x', ...)", "test.describe.only(", "test.skip('x', ...)", 'test.skip()'
it('leaves a conditional self-skip alone') // "test.skip(!hasWebGpu, 'needs WebGPU')", "test.skip(" at end of line
it('ignores comments and files outside e2e') // '// waitForTimeout(5)' in e2e, 'core/a.test.ts' with test.only -> []
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to warn about e2e waits and focus`,
      `feat: warn about timing waits, static skips, and focused e2e tests`, then BLUE.

### Cycle 11: run the rules and set the exit code from the severity table

**Files:** create `scripts/policy-check/rule-severity.mjs`, `scripts/policy-check/report.mjs`,
`scripts/policy-check/policy-check.mjs`; tests `scripts/policy-check/policy-check.test.mjs` and the
shared helper `scripts/policy-check/fake-git-test-support.mjs` (a test asset, written by the
test-author).

**Interfaces:**

- `rule-severity.mjs`: `RULE_SEVERITY`, a frozen object, one line per rule:
  `commit-message-format`, `forbidden-trailer`, `author-identity`, `branch-prefix`,
  `spec-needs-adr`, `exact-pin`, `ordering`, `independence`, `blue`, `test-scope`,
  `refactor-scope` are `'fail'`; `milestone-code`, `em-dash`, `e2e-timing-or-focus` are `'warn'`.
  `severityOf(rule: string): 'fail'|'warn'` throws `Error('unknown policy rule: <rule>')` for an
  id not in the table.
- `report.mjs`: `formatPlainLine(finding, severity): string` gives
  `  [<severity>] [<rule>] <location><message>`, where location is `<file>:<line>: `,
  `<file>: `, `<first 8 of sha>: `, or empty, in that order of preference.
- `policy-check.mjs`: `runPolicyCheck(argv: readonly string[], deps): Promise<number>` with
  `deps = { runGit(args: readonly string[]): string, runCommitlint({ base, head }): { status: number, output: string }, log(line: string): void, githubActions: boolean }`.
  It calls git with exactly these argument arrays:
  - commits: `['log', '--reverse', '--no-merges', '--format=%x1e%H%x1f%an%x1f%ae%x1f%B', '<base>..<head>']`
  - changed paths: `['-c', 'core.quotePath=false', 'diff', '--name-status', '--find-renames', '<base>...<head>']`
  - added lines: `['-c', 'core.quotePath=false', 'diff', '--unified=0', '--no-color', '--no-ext-diff', '--find-renames', '<base>...<head>']`
  - head file: `['show', '<head>:<path>']`
  - branch (only when `--branch` is absent): `['rev-parse', '--abbrev-ref', 'HEAD']`

  It runs every rule of cycles 3 to 10 (cycle 13 adds commitlint), with `commitTypes` taken from
  the default export of `commitlint.config.js` and `readFile` answered by the `show` call. It logs
  the summary line first, then one line per finding, failing findings before warnings. Summary: `policy:check: clean (<base>..<head> on <branch>)`,
  or `policy:check: <f> failing and <w> warning finding(s) in <base>..<head> on <branch>`.
  Returns 0 when no finding has severity `fail`, else 1. The direct-invocation block (copy the
  pattern of `rgb-audit.mjs`) wires `execFileSync('git', ...)`, commitlint through
  `spawnSync('pnpm', ['exec', 'commitlint', '--from', base, '--to', head], { encoding: 'utf8' })`,
  `console.log`, `process.env.GITHUB_ACTIONS === 'true'`, sets `process.exitCode`, and exits 2 on
  a thrown error. A `spawnSync` result with `status === null` throws.

In this cycle the tests pass explicit `--base origin/main --head HEAD --branch feat/x`, and
`runCommitlint` returns `{ status: 0, output: '' }`. The fake git in the helper answers by the
distinctive argument (`log`, `--name-status`, `--unified=0`, `show`, `rev-parse`).

- [ ] **Step 1: Write the failing tests**

```js
it('states every rule severity in one table') // expect(RULE_SEVERITY).toEqual({...the 14 entries...})
it('refuses an unknown rule id') // expect(() => severityOf('nope')).toThrow('unknown policy rule: nope')
it('reports a clean range and exits 0') // log contains 'policy:check: clean (origin/main..HEAD on feat/x)'
it('exits 1 and names the rule when a failing rule fires') // commit by 'dan@example.com' -> '[fail] [author-identity] aaaaaaaa: '
it('exits 0 when only warning rules fire') // added em-dash line in docs/a.md -> '[warn] [em-dash] docs/a.md:3: '
it('reads commits without merges and changes from the merge base')
// runGit calls include the log array with 'origin/main..HEAD' and both diff arrays with 'origin/main...HEAD'
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin the policy check run and its exit codes`,
      `feat: run the repository policy rules with one severity table`, then BLUE.

### Cycle 12: resolve the range and branch for a local run

**Files:** modify `scripts/policy-check/policy-check.mjs`; test `scripts/policy-check/policy-check-range.test.mjs`.

**Interfaces:** flags `--base <ref>` (default `origin/main`), `--head <ref>` (default `HEAD`),
`--branch <name>` (default: trimmed output of the `rev-parse` call). When the resolved branch is
`HEAD`, the branch is treated as `''` and the run logs
`policy:check: detached HEAD, branch rules skipped; pass --branch <name>`.

- [ ] **Step 1: Write the failing tests**

```js
it('defaults to origin/main..HEAD and the current branch') // argv [], rev-parse 'feat/x\n' -> summary '... on feat/x'
it('takes base, head, and branch from flags without asking git for the branch') // no rev-parse call
it('skips the branch rules on a detached HEAD and says so') // rev-parse 'HEAD' -> no branch-prefix finding, note logged
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: pin the default range and branch of a local policy check`,
      `feat: resolve the policy check range and branch for local runs`, then BLUE.

### Cycle 13: run commitlint over the range

**Files:** modify `scripts/policy-check/policy-check.mjs`; test `scripts/policy-check/policy-check-commitlint.test.mjs`.

**Interfaces:** `runCommitlint` is called once with `{ base, head }`. A non-zero `status` gives one
finding, rule `commit-message-format`, message
`commitlint rejected at least one commit message in <base>..<head>`, and the run logs every line
of `output` before the findings. Status 0 logs nothing from commitlint (its warnings stay quiet).

- [ ] **Step 1: Write the failing tests**

```js
it('lints the commit messages of the range with commitlint') // called with { base: 'origin/main', head: 'abc123' }
it('fails the run and shows the commitlint output when it rejects a message')
// { status: 1, output: 'subject may not be empty' } -> exit 1, log has that text and '[fail] [commit-message-format]'
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect the policy check to run commitlint`,
      `feat: run commitlint over the pull request commits`, then BLUE.

### Cycle 14: write GitHub annotations in CI

**Files:** modify `scripts/policy-check/report.mjs` and `policy-check.mjs`; test `scripts/policy-check/policy-check-annotations.test.mjs`.

**Interfaces:** `formatAnnotation(finding, severity): string` gives
`::error <props>::<message>` for `fail` and `::warning <props>::<message>` for `warn`. Props are
comma-joined `file=<file>`, `line=<line>`, `title=<rule>`, each only when present (title always).
A finding with `sha` and no `file` prefixes the message with the first 8 characters of the sha
and a space. Escaping: in the message `%` `\r` `\n` become `%25` `%0D` `%0A`; in property values
also `:` and `,` become `%3A` and `%2C`. When `deps.githubActions` is true the run logs
annotations instead of plain finding lines; the summary line stays.

- [ ] **Step 1: Write the failing tests**

```js
it('writes a failing finding as an error annotation with file and line')
// '::error file=docs/specs/x.md,title=spec-needs-adr::...'
it('writes a warning finding as a warning annotation') // '::warning file=docs/a.md,line=3,title=em-dash::...'
it('prefixes a commit finding with its short sha') // '::error title=author-identity::aaaaaaaa ...'
it('escapes newlines and percent signs in the message')
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits `test: expect GitHub annotations from the policy check in CI`,
      `feat: annotate policy findings in GitHub Actions`, then BLUE.

### Cycle 15: a test commit changes only test assets

**Files:** create `scripts/rgb-audit/test-files.mjs` and `scripts/rgb-audit/scope-rules.mjs`;
modify `scripts/rgb-audit/cycle-audit.mjs`; test `scripts/rgb-audit/cycle-audit-scope.test.mjs`.

**Interfaces:** consumes `auditCommits` and `parseGitLog` of `cycle-audit.mjs` (unchanged
signatures; tests build commits with the `record`/`gitLog` helper style of
`cycle-audit.test.mjs`). The `Violation` rule union gains `'test-scope'` and `'refactor-scope'`.
A commit classified RED (so `test:` without scope `e2e`, no `Infrastructure:` trailer) whose files
include a path that is not a test asset gives
`{ sha, rule: 'test-scope', message: 'RED commit <sha> changes non-test file(s): <comma-joined list>' }`.
`test-files.mjs` exports `isTestFile(path)` (the existing `/\.test\.(ts|tsx|mjs|js)$/`, moved
there and used by the independence rule) and `isTestAsset(path)`, true when any of these hold:
`isTestFile`; `/\.spec\.tsx?$/`; `/-contract\.ts$/`;
`/-test-(?:support|kit|fixtures?|setup)\.(?:ts|tsx|mjs)$/`;
`/(^|\/)(?:testing|fixtures|__screenshots__)\//`; `/-snapshots\//`; `/fixtures?\.(?:ts|tsx|json|mjs)$/`;
starts with `tests/` or `e2e/`; ends with `.stories.tsx`. A RED commit with no files (empty) is
fine.

- [ ] **Step 1: Write the failing tests**

```js
it('accepts a RED commit that changes tests, test support, fixtures, stories, and e2e files')
// core/a.test.ts, bridge/react/x-test-support.tsx, core/scene/y-test-fixtures.ts, storage/fs/directory-contract.ts,
// tests/architecture/import-graph.ts, editor/a.stories.tsx, e2e/tests/a.spec.ts -> []
it('flags a RED commit that changes implementation') // core/a.test.ts + core/a.ts -> test-scope, message lists 'core/a.ts'
it('does not apply the scope rule to e2e-scoped or Infrastructure commits')
```

- [ ] **Steps 2 to 5:** FAIL with `pnpm exec vitest run --project unit scripts/rgb-audit`; implement;
      PASS (the existing rgb-audit tests stay green); commits
      `test: expect rgb:audit to flag a test commit that changes implementation`,
      `feat: require test commits to change only test assets`, then BLUE.

### Cycle 16: a refactor commit changes no test files

**Files:** modify `scripts/rgb-audit/scope-rules.mjs` and `cycle-audit.mjs`; test
`scripts/rgb-audit/cycle-audit-refactor-scope.test.mjs`.

**Interfaces:** a BLUE (`refactor:`) commit whose files include a path for which `isTestFile` is
true gives `{ sha, rule: 'refactor-scope', message: 'BLUE commit <sha> modifies test file(s): <list>' }`.
Uses the strict `isTestFile`, not `isTestAsset`. It still closes the open GREEN cycle (the blue
rule is unchanged). An `Infrastructure:` commit is exempt.

Owner decision (2026-11-19): a test-file change in a refactor commit is allowed when it only follows
a rename or a move. A test file is exempt when git reports it as a pure rename (similarity 100) or
when every added and removed line of its diff is an import or export statement or a continuation
of one (`import ... from '...'`, `export ... from '...'`, a bare `from '...'` line, or a line of
names inside such a statement). Any other changed line (an assertion, a test name, a fixture
value) keeps the violation. The auditor gets the needed data with one extra git call for each
refactor commit that touches a test file: `git show -M --format= --unified=0 <sha> -- <test files>`
(rename detection gives the similarity). Keep the line classifier a pure function in
`scope-rules.mjs` (for example `isImportOnlyChange(diffText)`) so the tests can feed it diff text
directly, and inject the git call through the existing `runGit` seam.

- [ ] **Step 1: Write the failing tests**

```js
it('flags a refactor commit that changes a test file') // core/a.ts + core/a.test.ts (assertion line changed) -> refactor-scope listing core/a.test.ts
it('accepts an empty refactor marker and one that changes test support only') // [] and core/x-test-support.ts -> []
it('accepts a refactor commit whose test-file change only updates import paths') // diff lines are import ... from './new-path' -> []
it('accepts a refactor commit that purely renames a test file') // R100 old.test.ts -> new.test.ts -> []
it('flags a refactor commit that mixes an import update with an assertion change') // -> refactor-scope
it('still closes the cycle when it flags the refactor') // RED, GREEN, flagged BLUE -> only the refactor-scope violation
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits
      `test: expect rgb:audit to flag a refactor commit that changes tests`,
      `feat: forbid test file changes in refactor commits`, then BLUE.

### Cycle 17: the auditor takes its exit code from the severity table

**Files:** modify `scripts/rgb-audit/rgb-audit.mjs`; test `scripts/rgb-audit/rgb-audit-severity.test.mjs`.

**Interfaces:** `runRgbAudit(argv, { runGit, log, severityOf })`, where `severityOf` is optional
and defaults to `severityOf` from `scripts/policy-check/rule-severity.mjs`. Exit 1 only when a
violation has severity `fail`. A `warn` violation prints `  [<rule>] (warning) <message>`; a
`fail` one keeps today's `  [<rule>] <message>`. The heading line is unchanged.

- [ ] **Step 1: Write the failing tests**

```js
it('exits 0 and marks the line as a warning when every violation is a warning')
// lone GREEN with severityOf = () => 'warn' -> exit 0, log contains '[ordering] (warning)'
it('keeps failing on violations the table marks as failing') // default severityOf, lone GREEN -> exit 1
```

- [ ] **Steps 2 to 5:** FAIL, implement, PASS; commits
      `test: expect rgb:audit to honor the policy severity table`,
      `feat: take the rgb:audit exit code from the severity table`, then BLUE.

### Task W1: the pnpm script

- [ ] Add `"policy:check": "node scripts/policy-check/policy-check.mjs"` after `rgb:audit` in
      `package.json`.
- [ ] `git fetch origin main && pnpm policy:check`. Expected: exit 0 with the clean line or only
      warnings for this branch. Also `pnpm policy:check --branch feature/x` exits 1 with
      `[fail] [branch-prefix]`.
- [ ] Commit `build: add the policy:check script`.

### Task W2: the CI job

- [ ] In `.github/workflows/ci.yml` add, after `ping-pong`:

```yaml
policy:
  name: Repository policy
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-24.04
  timeout-minutes: 10
  permissions:
    contents: read
  steps:
    # checkout with fetch-depth: 0, pnpm/action-setup@v3 version 10.33.4,
    # actions/setup-node@v4 with node-version-file '.nvmrc' and cache 'pnpm',
    # pnpm install --frozen-lockfile (commitlint and its config come from node_modules)
    - name: Check commits and changes against repository policy
      env:
        POLICY_BASE: origin/${{ github.base_ref }}
        POLICY_HEAD: ${{ github.event.pull_request.head.sha }}
        POLICY_BRANCH: ${{ github.head_ref }}
      run: pnpm policy:check --base "$POLICY_BASE" --head "$POLICY_HEAD" --branch "$POLICY_BRANCH"
```

The job has no `needs`, so it runs beside `check` and `decide` and reports in about a minute.
Unlike `decide` it installs dependencies, because commitlint and its conventional config live
in `node_modules`. The checkout is the pull request merge commit; the head sha is one of its
parents, so with full history `<base>..<head>` is the pull request's own commits. Skipped on
`push` and `merge_group`, which `ci-complete` treats as passing.

- [ ] Add `policy` to the `ci-complete` `needs` list, to its echo line
      (`policy=${{ needs.policy.result }}`), and to its `for result in` loop. Warnings never fail
      the job, so they never fail `ci-complete`.
- [ ] `pnpm exec prettier --check .github/workflows/ci.yml` exits 0.
- [ ] Commit `ci: run the repository policy check on each pull request`.

### Task W3: ADR-0221

- [ ] Write `docs/knowledge/decisions/ADR-0221-deterministic-policy-is-checked-in-ci.md` with the
      frontmatter keys `knowledge:index` requires (`slug`, `title`, `type: decision`, `tags`,
      `related` including `decisions/ADR-0025-rgb-audit-and-foundation-acceptance`, `sourceFiles`,
      `status: current`, `updated` from `date +%F`). Sections: Status, Context (reviewers read for
      rules a script can decide; commitlint only in a local hook the worktrees skip), Decision (the
      rule list, the severity table and how to promote a rule, bot exemptions, branch prefixes,
      the two test definitions, what stays local and out of the repository: the product-name
      denylist and the timestamp check, named only in those general terms), Consequences
      (reviewer text to trim, the `refactor:` import-only exemption and why), Alternatives
      considered (keep review by reading; a pre-push hook only; one combined job with
      `ping-pong`), References.
- [ ] Run the `humanizer` skill on the ADR prose (rules.md rule 17), then
      `grep -c $'\u2014'` on the file prints 0 and `pnpm knowledge:index` exits 0.
- [ ] Commit `docs: record the decision to check deterministic policy in CI`.

### Task W4: verify the branch

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, checking each
      command's own exit code.
- [ ] `pnpm rgb:audit --range origin/main..HEAD` prints the clean line.
- [ ] `pnpm policy:check` exits 0; `pnpm exec commitlint --from origin/main --to HEAD` exits 0.
- [ ] Size limits on the new and changed non-test scripts, exit 0:

```bash
pnpm exec eslint --no-config-lookup --rule '{"max-lines-per-function":["error",{"max":40,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":300,"skipBlankLines":true,"skipComments":true}],"max-params":["error",3],"complexity":["error",10],"max-depth":["error",3],"no-magic-numbers":["error",{"ignore":[-1,0,1,2,100],"ignoreArrayIndexes":true,"enforceConst":true}]}' $(ls scripts/policy-check/*.mjs scripts/rgb-audit/*.mjs | grep -v -e '\.test\.mjs$' -e '-test-support\.mjs$')
```

- [ ] `git log origin/main..HEAD --format='%an <%ae>%n%B' | grep -c -i -e '^co-authored-by:' -e '-session:'` prints 0.
- [ ] `/clean-code-review` over the branch, then `/review`, before landing.

## Follow-up: reviewer text that can drop the automated checks (do not edit here)

The main thread files one issue for these. `.claude/` agent and skill files are not writable from
the sandbox, so the owner applies them. Items are named by heading, with item and line numbers as
they stand on `main` after #938, which rewrote the reviewer files.

- `.claude/agents/pr-reviewer.md`, "Audit checklist": "No Co-Authored-By trailers" (item 2, the
  `Co-Authored-By` grep) is now the `forbidden-trailer` rule. "No em-dashes in newly composed
  prose" (item 9, line 43) becomes "read the `em-dash` warnings of the Repository policy job" for
  Markdown and text; code comments and commit bodies still need a read. "Red-green-blue cycle
  adherence in commit history" (item 1) keeps judgment calls only, since ordering, independence,
  blue, and both scope rules are mechanical. "Knowledge graph updates" (item 3) can cite
  `spec-needs-adr` for a modified, renamed, or deleted spec; whether an architectural change needs
  an ADR stays a review judgment.
- `.claude/agents/clean-code-reviewer.md`, line 41 ("No em-dashes in any text. No Co-Authored-By
  trailers in commit messages."): drop the trailer sentence and point the em-dash clause at the CI
  warning.
- `.claude/commands/review.md` line 9: the reviewer's check for `Co-Authored-By` trailers is now
  the `forbidden-trailer` rule.
- `.claude/rules.md`: "No Co-Authored-By trailers" (rule 7, checked in CI), "No em-dashes" (rule 8,
  warned in CI), "Conventional Commits" (rule 9, commitlint runs in CI too), "Descriptive branch
  names" (rule 12, the allowed prefixes are the ten commit types, the two bot prefixes, and
  `integration/`), "Author identity" (rule 13, checked in CI with the bot exemption and a warning
  on fork pull requests), and the e2e timing entry under "Anti-patterns" (CI warns). Rule 5 is the
  cooldown and says nothing about pins, so it needs no change.
- `CLAUDE.md`: "Hard invariants" item 6 (exact pins, now checked in CI), "Naming and language
  policies" item 3, and the rest of the "Hard invariants" list: the same branch prefix and
  enforcement notes.
- `CONTRIBUTING.md`: "How to propose a change" step 2 (lines 72-74, branch names: list the accepted
  prefixes), "Exact version pins" (lines 98-99, now checked in CI), the commitlint note under
  "Conventions" (line 109) and the `commit-msg` hook under "Hooks and release engineering" (line
  165), which both describe commitlint as running in the hook only.
- `.claude/skills/vernacular-change-control/SKILL.md`: "Commit conventions" (lines 92-93, commitlint
  only through the hook, and `/review` counting trailers by hand) and "The PR path" (line 108, the
  CI job list has no `policy` job).
- `.claude/skills/vernacular-diagnostics-and-tooling/SKILL.md`: add `pnpm policy:check` to "Quick
  reference: which tool answers which question", and the `test-scope` and `refactor-scope` rows to
  the violation table under "rgb:audit: the TDD history auditor (ADR-0025)".
- `.claude/skills/vernacular-validation-and-qa/SKILL.md`: the hook table (line 54, commitlint) and
  the CI job table (line 67, next to `ping-pong`) have no `policy` job.
- `.claude/skills/vernacular-docs-and-writing/SKILL.md`: the manual em-dash scan (line 36) and the
  em-dash row (line 126) can point at the CI warning.
- `.claude/skills/vernacular-build-and-env/SKILL.md`: the `commit-msg` hook (line 63) and "Exact
  pins, no ranges" (line 73): both are now checked in CI as well.
- `.claude/agents/test-author.md` and `refactorer.md`: one line each on the scope rules (a `test:`
  commit carries only test assets; a `refactor:` commit changes a `*.test.*` file only for a
  rename, import and export lines, or comment lines).
