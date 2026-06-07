---
slug: decisions/ADR-0025-rgb-audit-and-foundation-acceptance
title: 'ADR-0025: Ping-pong red-green-blue auditor and foundation acceptance'
type: decision
tags: [tooling, ci, tdd, red-green-blue, hooks, clean-code, foundation]
related:
  [
    decisions/ADR-0009-test-pyramid-rgb-tdd,
    decisions/ADR-0012-eslint-guardrails,
    decisions/ADR-0016-lighthouse-stryker-fixtures,
  ]
sourceFiles:
  [
    scripts/rgb-audit/cycle-audit.mjs,
    scripts/rgb-audit/rgb-audit.mjs,
    scripts/hooks/commit-reminders.mjs,
    .github/workflows/ci.yml,
  ]
status: current
updated: 2026-06-04
---

# ADR-0025: Ping-pong red-green-blue auditor and foundation acceptance

## Status

Accepted. Completes the foundation-acceptance phase (design specification
section 10). One acceptance item, the `clean-code-pr` CI gate, is deliberately
deferred; see the dedicated section below.

> Note on a related slug: several existing ADRs (ADR-0012, ADR-0016) list
> `decisions/ADR-0009-test-pyramid-rgb-tdd` in their `related:` block, and this
> ADR follows that convention so the graph cross-links consistently. The
> ADR-0009 file itself is not present in this local tree; the slug is retained
> as the canonical name for the test-pyramid / red-green-blue decision should
> that record be (re)written. The authoritative source for those invariants is
> the design specification (sections 9.4-9.5).

## Context

The design specification's independence-enforcement layer (section 9.5) calls
for a commit-history CI check that verifies the red-green-blue discipline
mechanically: test commits precede implementation commits, test files are
unchanged inside implementation commits, and each implementation commit is
closed by a refactor pass. Until now those invariants were enforced only by
agent-level access control (the `test-author` cannot read implementation and the
`implementer` cannot touch tests) and by the end-of-branch `pr-reviewer` audit.
Neither is a static gate that fails a pull request.

Section 10's foundation-acceptance criteria additionally require advisory
pre-commit reminders (a knowledge-update warning and a clean-code warning), the
`pnpm rgb:audit` script, CI green on pull requests, and unit tests covering every
public function in `core/`.

## Decision

### 1. The `rgb:audit` ping-pong compliance auditor

A two-module design separating pure logic from process glue, matching the
project's boundary discipline:

- `scripts/rgb-audit/cycle-audit.mjs` is pure: `parseGitLog(raw)` turns a
  delimiter-encoded `git log` dump into structured commits, and
  `auditCommits(commits)` runs a small state machine (carrying `pendingRed` and
  `openGreen`) over the oldest-first sequence and returns structured violations.
  No filesystem or process access.
- `scripts/rgb-audit/rgb-audit.mjs` is a dependency-injected shell. `runRgbAudit`
  takes `{ runGit, log }`, invokes `git log --reverse --no-merges` with a
  `%x1e`/`%x1f` record/unit-separated pretty format that also extracts the
  `Infrastructure` trailer, delegates to the pure module, and prints either a
  clean line or one line per violation. Exit code 0 is clean, 1 is a violation
  verdict, 2 is reserved for an unexpected internal fault.

Exposed as `pnpm rgb:audit` and wired into a `ping-pong` CI job that runs only on
pull requests over the `origin/<base>..HEAD` range.

The three enforced section-9.5 invariants:

- **Ordering**: every GREEN commit (`feat:` / `fix:`) must be preceded by an
  unconsumed RED commit (`test:`).
- **Independence**: a GREEN commit must change no test files
  (`*.test.{ts,tsx,mjs,js}`).
- **Blue presence**: every GREEN commit must be closed by a BLUE commit
  (`refactor:`) before the next RED or the end of the range.

The fourth section-9.5 clause ("each impl commit makes a previously-failing test
pass") is judged out of scope: verifying it requires checking out and running the
suite at each commit, which is brittle and slow. It is noted as a possible future
`--deep` mode.

### 2. Infrastructure-exemption convention

Controller-authored glue commits (the orchestrating human or agent wiring scripts,
config, and CI that have no test-first cycle of their own) opt out of the
GREEN-cycle requirements via a descriptive `Infrastructure: <reason>` git trailer.
The auditor classifies any commit carrying that trailer as `exempt`. Commit types
that are inherently outside a cycle are also exempt automatically: `docs`, `chore`,
`ci`, `build`, `style`, `test(e2e)` (end-to-end tests are not RED units), and
merge commits (excluded via `--no-merges`).

The trailer was chosen over the alternatives:

- A SHA allowlist does not survive rebase and is opaque.
- Commit-scope heuristics are implicit and easy to trip accidentally.
- The trailer is descriptive (it satisfies the naming policy: it reads as English
  and states a reason), survives rebase because it lives in the message, and
  self-documents why a given commit sidesteps the cycle.

### 3. Advisory pre-commit reminders

`scripts/hooks/commit-reminders.mjs` follows the same pure-selector / injected-shell
split. `reminderMessages(paths)` is pure: given staged repo-relative paths it
returns a clean-code-review reminder when any source-layer file
(`core|storage|engine|bridge|editor|app`) changed, and a knowledge-update reminder
when any source-layer or `docs/specs/` file changed. `runCommitReminders({ stagedPaths, log })`
prints them. Wired into `.husky/pre-commit` after `lint-staged`. It is strictly
advisory: it prints and never alters the exit status, so it can never block a
commit. This realizes the section-10 "knowledge-update warning, clean-code warning"
acceptance items and CLAUDE.md workflow steps 6 and 10.

### 4. The `clean-code-pr` CI gate is deferred with intent

The section-10 acceptance list includes a passing `clean-code-pr` gate, but the
clean-code-reviewer is a model-driven agent that runs locally during the BLUE
phase. The decided eventual implementation is a CI job that runs the reviewer over
the pull-request diff and fails on must-fix findings (per spec sections 9.7 and
9.11). That requires a model credential available to CI, accepts a per-pull-request
inference cost, and needs a strategy for non-deterministic reviewer output. Those
are real design questions, so the gate is scheduled as a follow-on rather than a
phase blocker. The `ping-pong` gate enforces the red-green-blue ordering,
independence, and blue-presence invariants in the meantime. The deferral is
recorded in ROADMAP.md and here so a future session inherits both the decision and
the chosen approach.

## Consequences

- Pull requests now fail mechanically when the red-green-blue discipline is broken,
  closing the gap between agent-level access control and the end-of-branch
  `pr-reviewer`. The auditor is static (history only); it does not run the suite,
  so a GREEN commit that does not actually pass its RED test still slips through
  until a `--deep` mode exists.
- The `Infrastructure:` trailer becomes a load-bearing convention: a controller
  glue commit without it will be audited as a cycle commit and likely flagged.
  Authors of such commits must add the trailer with a reason.
- The pre-commit reminders raise no false barriers (always exit 0) but rely on the
  author actually reading them; they supplement, not replace, the BLUE phase and
  the curator.
- Foundation acceptance is otherwise complete: the last untested public `core/`
  function, `Dispatcher.canRedo`, gained a characterization test, satisfying the
  "all public functions in core/ have unit tests" criterion.
- One acceptance criterion (`clean-code-pr`) remains open by design and is tracked
  for a follow-on phase.

## Alternatives considered

- **A SHA allowlist for infrastructure exemptions.** Rejected: brittle under
  rebase and opaque about intent.
- **Scope-based exemption heuristics (for example, exempt any commit whose scope
  is `scripts` or `ci`).** Rejected: implicit and easy to trip; the explicit
  trailer states intent.
- **Run the test suite per commit to verify the "previously-failing test now
  passes" clause now.** Rejected as out of scope: slow and brittle; deferred to a
  possible `--deep` mode.
- **Build the `clean-code-pr` CI gate in this phase.** Deferred: needs a CI model
  credential, per-pull-request cost acceptance, and non-deterministic-output
  handling; scheduled as a follow-on.
- **Make the pre-commit reminders blocking.** Rejected: the BLUE phase and ADR
  curation are owned by the workflow and the curator, not the commit hook; a
  blocking reminder would impede legitimate work-in-progress commits.

## References

- Design specification, sections 9.4-9.5 (red-green-blue cycle and independence
  enforcement), 9.7 and 9.11 (`clean-code-pr` gate), section 10 (foundation
  acceptance criteria).
- ADR-0012 (ESLint guardrails; the lint-level half of mechanical enforcement that
  this commit-history check complements).
- ADR-0016 (CI testing surfaces; this adds the `ping-pong` job alongside them).
- ROADMAP.md (the recorded `clean-code-pr` deferral).
- `.claude/rules.md` (the rubric the clean-code reminder points back to).
