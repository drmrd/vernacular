---
slug: decisions/ADR-0221-deterministic-policy-is-checked-in-ci
title: 'ADR-0221: Deterministic repository policy is checked in CI'
type: decision
tags: [tooling, ci, policy, commitlint, red-green-blue, tdd, git, github-actions]
related:
  [decisions/ADR-0025-rgb-audit-and-foundation-acceptance, decisions/ADR-0012-eslint-guardrails]
sourceFiles:
  [
    scripts/policy-check/policy-check.mjs,
    scripts/policy-check/rule-severity.mjs,
    scripts/policy-check/report.mjs,
    scripts/policy-check/git-input.mjs,
    scripts/policy-check/identities.mjs,
    scripts/policy-check/commit-rules.mjs,
    scripts/policy-check/branch-rules.mjs,
    scripts/policy-check/milestone-codes.mjs,
    scripts/policy-check/markdown-code.mjs,
    scripts/policy-check/prose-rules.mjs,
    scripts/policy-check/package-pins.mjs,
    scripts/policy-check/spec-adr.mjs,
    scripts/policy-check/e2e-rules.mjs,
    scripts/rgb-audit/rgb-audit.mjs,
    scripts/rgb-audit/cycle-audit.mjs,
    scripts/rgb-audit/scope-rules.mjs,
    scripts/rgb-audit/commit-diff.mjs,
    scripts/rgb-audit/test-files.mjs,
    package.json,
    .github/workflows/ci.yml,
  ]
status: current
updated: 2026-11-20
---

# ADR-0221: Deterministic repository policy is checked in CI

## Status

Current. Accepted on 2026-11-20 with the branch `feat/policy-checks-in-ci`, built in seventeen
test-first cycles from the plan `docs/plans/2026-11-19-policy-checks-in-ci.md`, plus one more
cycle for the owner's review decisions of the same day. It extends
[[ADR-0025-rgb-audit-and-foundation-acceptance]]: the red-green-blue auditor gains two scope rules
and takes its exit code from the severity table described below.

## Context

Many of the repository's rules can be decided by a script: the author identity, the forbidden
commit trailers, the branch prefix, exact dependency pins, an ADR next to a spec change, no
em-dash in new prose. Until this change, reviewer agents checked them by reading the diff and the
log, and some of them nobody checked. A review of the pull-request reviewer reports found no
violation of the trailer, em-dash, or author rules in any of them, so the reading took review time
and found nothing.

commitlint ran only in the local `commit-msg` hook under `.husky/`. A git worktree without
installed dependencies has no hook folder, so commits made there were never linted, and CI did not
lint them either. The auditor checked that a GREEN commit changes no test files, but not that a
`test:` commit changes only tests or that a `refactor:` commit leaves the tests alone.

## Decision

### One script, one required job

`pnpm policy:check` runs `scripts/policy-check/policy-check.mjs`. The shell reads git output for a
commit range, small pure modules each apply one rule, and one severity table decides which
findings fail the run and which only warn. It takes `--base` (default `origin/main`), `--head`
(default `HEAD`), `--branch` (default: the output of `git rev-parse --abbrev-ref HEAD`), and
`--fork-pr`, which turns author findings into warnings (see "Fork pull requests" below). Exit
code 0 means no failing finding, 1 means at least one, and 2 means an internal fault such as an
unknown rule id or a commitlint process that died on a signal.

The commits come from `git log --reverse --no-merges <base>..<head>` and the changes come from the
three-dot diff `<base>...<head>`, so a branch that merged `main` into itself is not charged with
main's commits. Head content of a file is read with `git show <head>:<path>`.

The new `policy` job in `.github/workflows/ci.yml` runs only on pull requests, has no `needs`, and
installs dependencies because commitlint and its config live in `node_modules`. It checks out full
history and passes the base, head sha, and branch through environment variables
(`POLICY_BASE`, `POLICY_HEAD`, `POLICY_BRANCH`), never as inline expressions in the script, since
the pull request author picks the branch name. A fourth variable, `POLICY_FORK_FLAG`, holds
`--fork-pr` when the head repository is not this repository and is empty otherwise.
`ci-complete` lists `policy` in its `needs`, so a failing rule fails the required check. On `push`
and `merge_group` the job is skipped, which `ci-complete` treats as a pass.

### The rules

| Rule id                 | Severity | What it checks                                                                                                                |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `commit-message-format` | fail     | commitlint over `<base>..<head>`                                                                                              |
| `forbidden-trailer`     | fail     | co-author, AI-session, `Generated-by`, `Assisted-by` trailers and the generated-with footer                                   |
| `author-identity`       | fail     | the author is the owner identity, or a bot on its own branch                                                                  |
| `fork-author-identity`  | warn     | the same author check on a fork pull request, reported under this id when `--fork-pr` is passed                               |
| `branch-prefix`         | fail     | the branch starts with a commit type and a slash, with a bot prefix, or with `integration/`                                   |
| `milestone-code`        | warn     | short codes or numbered phases in commit subjects and the branch name                                                         |
| `em-dash`               | warn     | an em-dash on an added line of a `.md`, `.mdx`, or `.txt` file, outside code                                                  |
| `spec-needs-adr`        | fail     | a modified, renamed, or deleted spec under `docs/specs/` comes with an added, modified, or renamed ADR                        |
| `exact-pin`             | fail     | every dependency in a changed `package.json` is an exact version                                                              |
| `e2e-timing-or-focus`   | warn     | fixed-time waits, focused tests, and static skips on added lines under `e2e/`                                                 |
| `ordering`              | fail     | auditor: a GREEN commit follows an unconsumed RED commit                                                                      |
| `independence`          | fail     | auditor: a GREEN commit changes no test file                                                                                  |
| `blue`                  | fail     | auditor: each GREEN commit is closed by a BLUE commit                                                                         |
| `test-scope`            | fail     | auditor: a RED commit changes only test assets                                                                                |
| `refactor-scope`        | fail     | auditor: a BLUE commit changes no test file, unless that file's change is a rename, import and export lines, or comment lines |

The table lists the rules in the order of `RULE_SEVERITY`. The first ten run in `policy:check`.
The last five run in `pnpm rgb:audit`, in the existing `ping-pong` job. The rule is to fail what
can be decided exactly and to warn where a pattern can misfire: a milestone code, an em-dash in
prose, or a timing call in an e2e file.

A few details of the warning rules. The em-dash rule skips `CHANGELOG.md`, `LICENSE`, `NOTICE`, and
`CODE_OF_CONDUCT.md`, skips lines inside fenced blocks (read from the head version of the file, so
a fence opened on an unchanged line counts), and removes inline code spans before it looks. The
e2e rule skips lines that start with `//` or `*`, and it leaves a conditional self-skip such as
`test.skip(!hasWebGpu, 'needs WebGPU')` alone: only a skip with a title or with no arguments warns.

### The severity table and how to promote a rule

`RULE_SEVERITY` in `scripts/policy-check/rule-severity.mjs` is a frozen object with one line per
rule id and is the only place that says `fail` or `warn`. `severityOf` throws on an id the table
does not list, so a new rule cannot be added without a severity. Both scripts read the table:
`policy:check` exits 1 only when a finding is `fail`, and `rgb:audit` now does the same, printing
`(warning)` after the rule id of a `warn` violation.

To promote a rule from `warn` to `fail`, change its value in `RULE_SEVERITY`. The test
"states every rule severity in one table" in `scripts/policy-check/policy-check.test.mjs` pins the
whole table, so the promotion is a `test:` commit that changes the expected table, then a `feat:`
commit that changes the one line, then the BLUE step. Demoting a rule works the same way.

### The owner's decisions of 2026-11-20

The pull request review raised five questions, and the owner settled them on 2026-11-20. The
sections below describe the rules as they stand after these decisions.

- An added spec needs no ADR. A spec that is modified, renamed, or deleted still needs one. Writing
  a new spec is the first step of the documented workflow, and 10 of the 15 merged pull requests
  that the first version of the rule would have failed only added a spec.
- `refactor-scope` stays `fail`. A test file whose changed lines are all comments is now exempt,
  along with the rename and move case.
- On a fork pull request, the CI job passes `--fork-pr`, and an author finding becomes the warning
  rule `fork-author-identity`. An outside contributor's commits do not carry the owner identity, so
  without this a fork pull request could never pass `ci-complete`.
- `*-story-support.ts` and `*-story-support.tsx` files are test assets.
- `integration/` is an accepted branch prefix.

### Bot exemptions

The owner identity is `Dan Moore <9156191+drmrd@users.noreply.github.com>`, and a commit passes
the author rule when both its name and email match. Two bots are exempt, each only on the branches
its tooling creates: `41898282+github-actions[bot]@users.noreply.github.com` (release-please) on a
branch that starts with `release-please--branches--`, and
`49699333+dependabot[bot]@users.noreply.github.com` on a branch that starts with `dependabot/`.
These are the only bot authors in the history. A human commit on a bot branch, such as a pushed
`Release-As` commit, is still checked. A bot commit on any other branch, or on an unknown branch,
fails. Bot commits still go through commitlint and the trailer rule. Only the author is checked,
not the committer, because the web interface commits as `GitHub <noreply@github.com>`.

### Fork pull requests

The CI job compares `github.event.pull_request.head.repo.full_name` with `github.repository`.
When they differ, it passes `--fork-pr`, and the script reports each `author-identity` finding
under the rule id `fork-author-identity`, which is `warn`. The finding keeps its message and sha,
so the warning still names the author. Every other rule applies to a fork pull request as it does
to any other.

### Branch prefixes

A branch passes when it starts with one of the ten commit types of the `type-enum` rule in
`commitlint.config.js` (`feat fix refactor docs chore test style perf build ci`), then a slash,
then at least one character, when it starts with one of the two bot prefixes, or when it starts
with `integration/`. The script reads the type list from `commitlint.config.js`, so it has one
home. CLAUDE.md names only `feat/`, `fix/`, and `docs/`, but the merged history also has `chore/`,
`test/`, `build/`, `ci/`, and `integration/` branches, and failing them would break current
practice.

When no `--branch` is given and `git rev-parse` prints `HEAD`, the branch is unknown: the branch
rules are skipped and the bot exemption never applies.

### Two definitions of a test file

`scripts/rgb-audit/test-files.mjs` holds both.

- `isTestFile` is the strict pattern the auditor already used: a path that ends in `.test.ts`,
  `.test.tsx`, `.test.mjs`, or `.test.js`. The `independence` and `refactor-scope` rules use it.
- `isTestAsset` is wider: a test file, a `.spec.ts` or `.spec.tsx` file, a `-contract.ts` file, a
  `-test-support`, `-test-kit`, `-test-fixture(s)`, or `-test-setup` module, anything under a
  `testing/`, `fixtures/`, `__screenshots__/`, or `-snapshots/` folder, a file ending in
  `fixture.ts` or `fixtures.json` and the like, anything under `tests/` or `e2e/`, stories, and
  `-story-support.ts` or `-story-support.tsx` modules. The `test-scope` rule uses it.

The strict pattern alone would fail 96 of the 638 `test:` commits since 2026-08-01, almost all for
support files that `eslint.config.js` already lints as test files. The wide one fails 2 of them.

### What stays local

Two checks stay out of the repository and run only in the owner's personal tooling. A denylist of
product names cannot be committed without writing those names into the repository, which the naming
policy forbids. The commit timestamp check is personal to the owner and is not repository policy.

## Consequences

### Reviewer text to trim

The reviewer agents and rules files can stop checking by hand what CI now checks. The plan's
section "Follow-up: reviewer text that can drop the automated checks" lists each file and the
items to trim, named by heading.
`.claude/` is not writable from the sandbox, so the owner applies those edits, tracked in a
follow-up issue. Two checks stay with the reviewers: whether an architectural change needs an ADR, and
em-dashes in code comments and commit bodies.

### The refactor rule exempts rename, import, and comment changes in tests

The owner kept `refactor-scope` as a failing rule, with two exemptions for a test file: a change
that only follows a rename or a move, and a change to comment lines only. The strict rule fails 32
of 550 `refactor:` commits since 2026-08-01. The rename exemption clears 2 of those 32, and 4 of
the 139 strict failures over all history. Of the 30 commits it still flagged since 2026-08-01, 17
change implementation and tests together, 11 only tidy tests, and 2 change only comments.

The exemptions do not cover every rename. When a rename changes a name that test bodies use,
and not only the imports, no commit shape passes: `refactor:` fails `refactor-scope`, `test:`
fails `test-scope`, and `feat:` or `fix:` fails `independence`. Such a change needs an exempt
commit type or an `Infrastructure:` trailer (see ADR-0025), or a split into two commits where the
first does not typecheck.

A test file is exempt when git reports it as a pure rename (`similarity index 100%`), or when every
added and removed line is an import or export statement, a bare `from '...'` line, a line of names
inside such a statement, or a comment line that starts with `//`, `/*`, or `*`. Any other changed
line keeps the violation.

The auditor reads the whole commit diff with `git show -M --format= --unified=0 <sha>` and no
pathspec, once for each `refactor:` commit that touches a test file. The plan named the test files
as a pathspec, but `git log --name-only` lists only the new path of a rename, and with only that
path `git show -M` reports a new file instead of a rename. The diff is split into one section per
file, and each hunk is read on its own: lines before a section's first hunk header are file
headers, and the open import state is reset at every hunk header. A section with no hunk, such as
a binary file or a mode-only change, counts as exempt.

Before the comment exemption, the rule flagged 135 of the 6,532 non-merge commits in the whole
history. It flagged 4 of the last 20 merged pull requests: #908, #916, #913, and #875. The first
three are refactors that changed tests. In #875 the only test change was one comment line that
named a moved path, and the comment exemption now clears that kind of change.

### Where the build differs from the plan

- A member call such as `test.setTimeout(...)` passes. The rule warns about a
  bare `setTimeout(` and about `window.setTimeout(`, `globalThis.setTimeout(`, and
  `self.setTimeout(`. The plan's pattern caught every `setTimeout(`, and 8 of its 10 matches in
  `e2e/` were Playwright's `test.setTimeout`, which sets a test's time limit and does not wait.
- The script calls git with a 64 MiB output buffer. Node's default of 1 MiB
  is close to the largest pull request diff on `main`, which is 980,620 bytes.
- On a detached HEAD, the note
  `policy:check: detached HEAD, branch rules skipped; pass --branch <name>` is logged before the
  summary line, and the summary drops "on <branch>".
- commitlint runs once over the range. When it rejects a message, its
  output is logged after the summary line and before the findings. When it passes, nothing of its
  output is logged, so its warnings stay quiet.
- A backtick fence whose info string contains a backtick is not an opening
  fence, as CommonMark requires. The plan's pattern accepted it. A tilde fence may carry backticks.
- For exact pins, a version passes when it is `major.minor.patch` with an optional prerelease and
  build part, or `npm:<name>@<that version>`, where the name may be scoped. Leading zeros pass, as
  in the plan's pattern. `workspace:`, `link:`, and `file:` versions, `$` references, the `-`
  removal value, and non-string values fail on purpose. The checked sections are `dependencies`, `devDependencies`,
  `optionalDependencies`, `peerDependencies`, and `pnpm.overrides`, read from the head version of
  each added or modified `package.json`. The message names the section, the package, and the value
  as JSON. The line is found by searching from the section's key, not from the top of the file, so
  a key of the same name in another section is not reported. A file that does not parse gives one
  finding.
- A spec renamed out of `docs/specs/` counts as a spec change, and the finding
  reports its old path.
- The plan's shared types have no module of their own. The `Finding` typedef is
  declared in `commit-rules.mjs` and imported from there, the auditor keeps its own `Violation`
  typedef in `cycle-audit.mjs`, and the `ReadFile` typedef lives in `prose-rules.mjs`, where
  `package-pins.mjs` imports it.

### Accepted gaps

- The generated-with footer match is the text `generated with [claude code]` in any letter case. A
  footer that names another tool is not caught.
- The session trailer pattern matches any hyphenated key that ends in `-session:` at the start of a
  line, so a body line such as `pre-session: ...` is flagged. That false positive is accepted.
- A bare `dependabot/` branch passes, since the bot prefixes need nothing after them.
- GitHub shows at most 10 error and 10 warning annotations for each step. A run with more findings
  shows only the first of them as annotations. The summary line still gives the full counts, and a
  local run lists every finding.
- A path that git quotes even with `core.quotePath=false`, such as one with a tab or a double
  quote, is read with its quotes.

## Alternatives considered

- Keep review by reading. Rejected. The reviewers found no violation of these rules in their
  reports, and a reviewer can miss a line that a script will not. A script also runs on every pull
  request, not only on the ones that get a full review.
- Use a pre-push hook only. Rejected. Hooks are local and a worktree without installed dependencies
  has none, which is how commitlint was skipped. A hook can also be bypassed with `--no-verify`. A
  required CI job applies to every pull request.
- Run the rules in one combined job with `ping-pong`. Rejected. `ping-pong` waits for `check`, and the new job
  has no `needs`, so it reports in about a minute. The auditor's rules stay in `rgb:audit`, which
  reads the same severity table, so the two jobs share one source of truth for severity.

## References

- [[ADR-0025-rgb-audit-and-foundation-acceptance]]: the red-green-blue auditor that gains the
  `test-scope` and `refactor-scope` rules and the severity table.
- [[ADR-0012-eslint-guardrails]]: the lint setup that already treats test support files as tests.
- `docs/plans/2026-11-19-policy-checks-in-ci.md`: the plan, with the decisions and their evidence.
- `.claude/rules.md`: the rules these checks enforce.
