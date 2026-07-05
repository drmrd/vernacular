---
name: vernacular-change-control
description: Use when committing, branching, or merging any change in the Vernacular repo. Triggers - choosing a commit type or branch name, running the red-green-blue TDD cycle, a failing rgb:audit or ping-pong CI job (ordering, independence, blue violations), deciding whether a change needs an ADR, opening a PR and gating on ci-complete, CI slash-command labels (run:e2e, ci:full), Infrastructure trailer questions, or checking a hard rule and its rationale before acting.
---

# Vernacular change control

## Overview

Every change in this repo is classified before the first commit and mechanically audited after the last one. The commit history is itself a reviewed artifact: CI replays it commit by commit against the red-green-blue rules, so you cannot fix a bad history by making the final diff good.

## When to use

- Before the first commit on any branch: classify the change (table below) and pick the gates.
- When the `ping-pong` CI job or `pnpm rgb:audit` reports ordering, independence, or blue violations.
- When deciding whether a change needs an ADR (Architecture Decision Record).
- Before opening or merging a PR, and when a required check confuses you.
- When checking what a hard rule actually says and why it exists.

## When NOT to use

- How to run test suites, refresh visual baselines, or judge evidence: see vernacular-validation-and-qa.
- ADR, spec, and plan file formats, templates, and prose rules (humanizer): see vernacular-docs-and-writing.
- Running several branches at once, worktrees, merge order, integration rebuilds: see vernacular-parallel-delivery.
- Recreating the toolchain or environment: see vernacular-build-and-env.
- The full history of past incidents: see vernacular-failure-archaeology.

## Quick reference

| Task                               | Command                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| RED: write one failing test        | `/test-first <behavior description>`                                          |
| GREEN: minimal implementation      | `/implement`                                                                  |
| BLUE part 1: review                | `/clean-code-review` (defaults to `HEAD~1..HEAD`)                             |
| BLUE part 2: apply or mark         | `/refactor`                                                                   |
| Audit branch history locally       | `pnpm rgb:audit --range origin/main..HEAD`                                    |
| Full local check chain             | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |
| End-of-branch PR audit             | `/review`                                                                     |
| Scaffold an ADR (serial work only) | `/adr <short-slug> "Title"`                                                   |
| Check a hard rule                  | Read `.claude/rules.md`                                                       |

## The red-green-blue cycle

One cycle per behavior. Roles are enforced by subagent definitions in `.claude/agents/`; the history shape is enforced by `scripts/rgb-audit/`.

1. **RED**: `/test-first <behavior>` dispatches the `test-author` agent. It writes exactly one failing test, observes the failure, and commits with a `test:` prefix. The agent may not read implementation bodies in `core/`, `engine/`, `bridge/`, `editor/`, `app/`, or `storage/`; it works from the spec, ADRs, prior tests, and public type signatures.
2. **GREEN**: `/implement` dispatches the `implementer` agent. Minimal change to pass the failing test, full local check chain, commit with `feat:` or `fix:`. The agent may not read or modify any test file; it works from the runner output.
3. **BLUE, review half**: `/clean-code-review` dispatches the `clean-code-reviewer` agent over the latest commit (or a range you pass). Findings come back as must-fix, should-fix, and consider (severity definitions in `.claude/rules.md`).
4. **BLUE, refactor half**: `/refactor` dispatches the `refactorer` agent. It applies findings while keeping tests green (Edit-only, never tests). **If there are no actionable findings it still commits an empty marker**: `git commit --allow-empty -m "refactor: mark the <name> cycle blue"`. This marker is required, not optional; without a closing `refactor:` commit the audit flags the GREEN commit.
5. Repeat for the next behavior. **Close every GREEN with its BLUE before the next RED**: the auditor treats a new `test:` commit as proof the previous cycle never got its BLUE and emits a violation.

Skipping the BLUE phase is on the codified never-do list (`.claude/rules.md` anti-patterns; CLAUDE.md "Things never to do").

### Repairing a broken cycle history

Interactive rebase is unavailable in Claude Code sessions. To insert a missing BLUE marker or reorder commits on an unpushed branch: note the SHAs with `git log --oneline origin/main..HEAD`, `git reset --hard` to the last good commit, then re-apply the remainder in the correct order with `git cherry-pick <sha>` (use `--empty=keep` to preserve empty markers), inserting `git commit --allow-empty -m "refactor: mark the <name> cycle blue"` where the cycle closes. Re-run `pnpm rgb:audit --range origin/main..HEAD` until clean. For multi-branch integration rebuilds, see vernacular-parallel-delivery.

## rgb:audit: the mechanical history gate

`pnpm rgb:audit` runs `scripts/rgb-audit/rgb-audit.mjs`, which feeds `git log --reverse --no-merges <range>` into the pure state machine in `scripts/rgb-audit/cycle-audit.mjs` (design recorded in ADR-0025). CI runs it as the `ping-pong` job on every pull request over `origin/<base>..HEAD`. Default local range is `main..HEAD`; pass `--range origin/main..HEAD` when local `main` may be stale.

Commit classification (from `classify()` in `cycle-audit.mjs`):

| Commit                                                               | Audit role                                  |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Any commit with an `Infrastructure:` trailer                         | exempt                                      |
| `test:` (any scope except `e2e`)                                     | RED                                         |
| `test(e2e):`                                                         | exempt (end-to-end tests are not RED units) |
| `feat:`, `fix:`                                                      | GREEN                                       |
| `refactor:`                                                          | BLUE                                        |
| `docs:`, `chore:`, `ci:`, `build:`, `style:`, `perf:`, anything else | exempt                                      |
| Merge commits                                                        | excluded (`--no-merges`)                    |

The three rules:

| Rule         | Statement                                                                                       | Typical trip wire                                           |
| ------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ordering     | Every GREEN must be preceded by at least one RED not already consumed by an earlier GREEN       | A quick `fix:` hotfix with no failing test committed first  |
| independence | A GREEN commit changes no test file (suffixes `.test.ts`, `.test.tsx`, `.test.mjs`, `.test.js`) | Adjusting a unit test "while you are in there" during GREEN |
| blue         | Every ordering-valid GREEN is closed by a `refactor:` before the next RED or end of range       | Starting the next `/test-first` before `/refactor` ran      |

Notes that matter in practice:

- A leftover RED with no GREEN is not a violation (retroactive or standalone test commits pass the audit; the `pr-reviewer` still expects a justification).
- The independence regex does not match Playwright `*.spec.ts` files, but the implementer role rule is broader: the implementer must not touch any test file regardless of what the regex catches.
- The `Infrastructure:` trailer (format: `Infrastructure: <plain-English reason>`) exempts a commit entirely. Per ADR-0025 it exists for controller-authored glue (scripts, config, CI wiring) that has no test-first cycle of its own. Putting it on application code to dodge the audit defeats the gate and will be flagged at `/review`. Example of legitimate use: commit `03ab87e5` ("feat: gate the harness ready frame on ambient-occlusion settlement") carries a trailer explaining the behavior is only observable in a real-GPU harness capture.
- Exit codes: 0 clean, 1 at least one violation, 2 unexpected internal fault.
- The audit is static history analysis only: it never checks out or runs tests, so it cannot verify that a GREEN actually makes its RED pass. That clause is enforced by the agents and `/review`, not the script.

## Commit conventions

- Conventional Commits, enforced by commitlint via the `.husky/commit-msg` hook. Allowed types (`commitlint.config.js` type-enum, the authoritative list): `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`, `build`, `ci`. Note: `.claude/rules.md` rule 9 lists only seven types; the commitlint config is what actually gates, so trust it. Subject must not be start-case, pascal-case, or upper-case. Body and footer lines over 100 characters draw a warning.
- No `Co-Authored-By` trailers, ever (`.claude/rules.md` rule 7; `/review` mechanically counts them and requires zero).
- No em-dash characters in newly composed text (rule 8).
- Subjects describe the change in plain English. No milestone codes or internal shorthand (rule 10), no third-party product names (rule 11).
- Hooks: `pre-commit` runs lint-staged (eslint --fix plus prettier on staged files) and advisory reminders; `commit-msg` runs commitlint; `pre-push` runs the full chain (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`). A RED commit passes pre-commit because the hook does not run the test suite; the pre-push hook means you finish the cycle before pushing.

## Branch naming

`feat/<short-description>`, `fix/<short-description>`, or `docs/<short-description>`. Descriptive English, readable by a first-time reader, no milestone identifiers or internal codes. PRs target `main`; `main` is always releasable.

## The PR path

Verified against the live GitHub ruleset "main protection" (id 17955144) and `.github/workflows/ci.yml` as of 2026-07-05.

1. Direct pushes to `main` are rejected: the ruleset requires a pull request (zero approving reviews required) plus the single required status check **`ci-complete`**. Force pushes (non-fast-forward) and branch deletion are blocked on `main`.
2. Push your branch, open a PR against `main` (`gh pr create`). The pre-push hook runs the full local chain first.
3. CI on a PR runs: `check` (typecheck, lint, format, selective unit tests via `scripts/ci/select-tests.mjs`, `integration:audit`, build), `ping-pong` (`pnpm rgb:audit --range origin/<base>..HEAD`), and `decide` (`scripts/ci/decide.mjs`), which turns heavy suites on or off from changed paths, draft state, and labels. Lighthouse is hardcoded off on PRs unless a label forces it.
4. **`ci-complete` treats skipped jobs as passing.** It fails only if a needed job reports failure or cancelled. A green PR does not prove e2e or visual suites ran; the `merge_group` and push-to-main events run the full heavy set as the backstop. Check which jobs actually executed before treating green as strong evidence (evidence standards: vernacular-validation-and-qa).
5. CI slash-command labels (`.github/workflows/slash-command.yml`): commenting on the PR with `/test e2e` adds label `run:e2e`, `/test visual` adds `run:visual`, `/ci full` adds `ci:full` (all heavy suites), `/ci skip-heavy` adds `ci:skip-heavy`. Only comments from OWNER, MEMBER, or COLLABORATOR associations are honored. `decide` reads labels live, so a re-run picks them up.
6. Run `/review` (the `pr-reviewer` agent) before merge: rule 16 requires CI green **and** a pr-reviewer verdict. It audits the whole branch: red-green-blue adherence, zero `Co-Authored-By`, knowledge-graph updates where architectural files changed, spec/plan compliance, em-dash scan.
7. Merge with a merge commit (the ruleset allows merge, squash, and rebase, but repo history uses merge commits). Squash would collapse the red-green-blue history that the audit trail and future `git log` archaeology depend on; do not use it.

## ADR gating

An ADR is the unit of architectural memory, committed under `docs/knowledge/decisions/` (format and prose rules: vernacular-docs-and-writing).

- **Spec changes require an ADR.** Never modify `docs/specs/` without a corresponding ADR explaining the change (CLAUDE.md "Things never to do").
- **Architectural changes ship their ADR with the change**, in the same PR. `/review` flags PRs that touch architectural surfaces (new `core/` types, registries, layer-crossing patterns) without touching `docs/knowledge/`.
- Before proposing an architectural change, check for an existing ADR that already settled the question (`/knowledge <query>`, or grep `docs/knowledge/decisions/`).
- Doc staleness warning: `.claude/rules.md` rule 6 still calls ADRs an uncommitted local cache. Reality (and CLAUDE.md): `docs/knowledge/decisions/` is committed and authoritative alongside `docs/specs/`; only the generated `INDEX.md` / `index.json` stay gitignored.

### ADR numbering discipline

`/adr` computes the next number as max(existing)+1 from the files on disk. That is only safe when one lane is producing ADRs at a time. This has failed repeatedly:

- Renumber commits exist for collisions at 0050/0051, 0056, 0057, 0070, 0127, 0131/0132, 0140 (`85799c2f`), and 0141 (`e8cd175f`).
- Two duplicate pairs are still on disk as of 2026-07-05: two `ADR-0076-*.md` files and two `ADR-0081-*.md` files.
- Some low numbers (0002, 0008 through 0011, 0013 through 0015) are cited by `.claude/rules.md`, `.npmrc`, and other ADRs but have no file on disk; ADR-0025 documents keeping the ADR-0009 slug as a canonical citation anyway. Do not "fix" a citation to an absent ADR by renumbering the citation; the design spec is the authority behind those slugs.

Rule: when more than one branch might create an ADR, assign explicit ADR numbers to each lane up front and re-verify against `main` immediately before landing (lane mechanics: vernacular-parallel-delivery).

## Change classification table

Classify before the first commit. "RGB" = the full red-green-blue cycle above.

| Class                   | Definition                                                                                        | RGB required                | rgb:audit treatment                                                                      | ADR required                                         | Other gates                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Doc-only                | Markdown, plans, knowledge entries; no source or test files                                       | No                          | `docs:` commits are exempt                                                               | Only if recording a decision                         | Humanizer pass on prose (rule 17; see vernacular-docs-and-writing); PR + ci-complete still apply |
| Test-only               | New or backfilled tests, no implementation change                                                 | No (a lone RED is legal)    | `test:` = RED, never flagged if unconsumed; `test(e2e):` exempt                          | No                                                   | `/review` expects a justification for retroactive tests                                          |
| Implementation          | Behavior change in `core/`, `engine/`, `bridge/`, `editor/`, `app/`, `storage/`                   | Yes, one cycle per behavior | ordering + independence + blue all enforced                                              | No, unless it is also architectural                  | pre-push full chain; heavy CI suites per changed paths                                           |
| Architectural           | New layer-crossing pattern, new `core/` type family, registry, invariant, or dependency direction | Yes                         | Same as implementation                                                                   | **Yes, in the same PR**                              | Knowledge-graph update checked by `/review`; check prior ADRs first                              |
| Spec change             | Any edit under `docs/specs/`                                                                      | No (it is prose)            | `docs:` exempt                                                                           | **Yes, corresponding ADR mandatory**                 | Humanizer; spec + ADR land together                                                              |
| Infrastructure / config | Scripts, CI, build config, tooling glue                                                           | No                          | `build:`/`ci:`/`chore:` exempt by type; otherwise add `Infrastructure: <reason>` trailer | Only if it encodes a decision (e.g. ADR-0025 itself) | Full chain still runs on push                                                                    |

## Non-negotiables with rationale

Source: `.claude/rules.md` (17 rules). The table states each rule, why it exists, and the incident behind it where one exists. Nothing here may be routed around.

| #   | Rule                                                                                                                                                | Rationale / incident                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layer boundaries: `core/` imports no React or Three.js; `engine/` is the only Three.js importer; `bridge/` alone touches both React and scene state | Enforced by eslint-plugin-boundaries plus a committed fitness test. Incident (ADR-0017): the first config from ADR-0012 was a silent no-op with three defects (single-level globs, no import resolver, deprecated v5 rule form); an illegal `core -> storage` import passed lint cleanly. Lesson: a guard without a test that proves it fires is not a guard. `tests/architecture/layer-boundaries.test.ts` now pins it |
| 2   | Apache-2.0 project-wide; packs declare SPDX; export refuses incompatible mixes                                                                      | Licensing clarity for an open-source project that ships third-party asset packs. (Cited ADR-0002 file absent as of 2026-07-05)                                                                                                                                                                                                                                                                                          |
| 3   | All mutations via `dispatch(command)` at the bridge boundary                                                                                        | The framework captures the inverse for undo/redo (ADR-0005); a mutation outside dispatch is un-undoable state corruption                                                                                                                                                                                                                                                                                                |
| 4   | Asset references are content-addressed `(scope, contentHash)`                                                                                       | Dedupe, integrity, and cache-safety (ADR-0007)                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | 30-day dependency cooldown (`.npmrc` `minimum-release-age=43200`), exact pins only, frozen lockfile                                                 | Supply-chain defense: compromised or typosquatted releases are usually caught and yanked within days, so refusing anything younger than 30 days sidesteps the window (rationale in `.npmrc` comments). Exclusions exist for coordinated-release monorepos (rollup natives, typescript-eslint, babel); the cited ADR-0013 file is absent on disk, the `.npmrc` comments carry the reasoning. Never use `^`/`~` ranges    |
| 6   | Knowledge graph: architectural changes get ADRs                                                                                                     | Fast context recovery for future sessions. The rule text in `.claude/rules.md` is stale (says gitignored cache); ADR decisions ARE committed                                                                                                                                                                                                                                                                            |
| 7   | No `Co-Authored-By` trailers                                                                                                                        | Owner policy; `/review` counts and requires zero                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | No em-dashes in newly composed text                                                                                                                 | House language policy; also the mechanical floor of the humanizer rule. Downloaded canonical text is exempt                                                                                                                                                                                                                                                                                                             |
| 9   | Conventional Commits                                                                                                                                | Mechanical enforcement via commitlint; the audit's commit classification depends on types being honest                                                                                                                                                                                                                                                                                                                  |
| 10  | No cryptic internal identifiers anywhere persistent                                                                                                 | Public repo must read as English to a first-time reader; `ADR-NNNN` style conventions are fine                                                                                                                                                                                                                                                                                                                          |
| 11  | Never name third-party floor-planner or commercial products                                                                                         | Avoids any suggestion Vernacular clones a specific product; write "mainstream floor planners"                                                                                                                                                                                                                                                                                                                           |
| 12  | Descriptive branches; PRs to `main`; `main` always releasable                                                                                       | Release-please cuts releases from `main`; a broken `main` blocks everything                                                                                                                                                                                                                                                                                                                                             |
| 13  | Author identity `Dan Moore <9156191+drmrd@users.noreply.github.com>`                                                                                | Single consistent identity in a public history                                                                                                                                                                                                                                                                                                                                                                          |
| 14  | Red-green-blue TDD for application code; BLUE ends with a `refactor:` commit even if empty                                                          | The empty marker makes cycle completion auditable from history alone. (Cited ADR-0009 file absent; ADR-0025 explains the slug convention and implements the auditor)                                                                                                                                                                                                                                                    |
| 15  | Independent agents: test-author cannot read implementation, implementer cannot read tests                                                           | Prevents tests written to match the implementation and implementations written to game the test; the independence rule in rgb:audit is the mechanical shadow of this role fence                                                                                                                                                                                                                                         |
| 16  | PRs require CI green and a pr-reviewer verdict                                                                                                      | ci-complete is necessary but not sufficient (skipped heavy suites count as pass); the pr-reviewer audits what CI cannot                                                                                                                                                                                                                                                                                                 |
| 17  | Humanize new prose before commit                                                                                                                    | Public docs must not read machine-written; details in vernacular-docs-and-writing                                                                                                                                                                                                                                                                                                                                       |

### Incident-backed disciplines beyond the numbered rules

- **Close every GREEN with a BLUE before the next RED.** Mechanically enforced: the auditor emits a blue violation the moment a RED appears while a GREEN is unclosed. Repair recipe above.
- **Pre-assign ADR numbers to parallel lanes.** At least eight renumber incidents plus two duplicate pairs still on disk (see ADR numbering discipline above).
- **Failing tests do land in history today, by design of the RED phase.** Issue #268 (open as of 2026-07-05, labels chore/area:tooling/priority:medium) proposes changing the norms so only GREEN and BLUE produce commits, because RED commits break bisect and per-commit CI checkouts. Until it lands, the RED commit convention stands; do not unilaterally switch models, and do not treat red-at-a-commit as a defect during archaeology.
- **File a tracking issue for every deferred or scoped-down slice.** Debt lives in issues and ADR "deferred to issue #NNN" notes, not in code comments (the source tree has one TODO comment total as of 2026-07-05; 35 ADRs reference issues). If a PR ships less than its plan promised, the delta gets an issue before merge.
- **Empty BLUE markers are real and expected.** Main's history carries over 180 marker-style commits (`refactor: mark the <x> cycle blue`, `refactor: no changes needed after <y>`); commit `01292fa7` is a representative empty one. Do not "clean them up".

## Common mistakes

1. Starting the next `/test-first` before `/refactor` closed the current cycle. The audit flags the unclosed GREEN, not the new RED, so the violation SHA points one cycle back from where you made the mistake.
2. Committing a hotfix as `fix:` with no preceding `test:` commit. Ordering violation. Write the failing test first, even for one-liners.
3. Touching a `*.test.ts` file inside a GREEN commit. Independence violation. Split it: test changes belong to a RED commit (or the change is not RGB-shaped and needs reclassifying).
4. Auditing against `main..HEAD` with a stale local `main`. Always `pnpm rgb:audit --range origin/main..HEAD` after fetching.
5. Slapping an `Infrastructure:` trailer on application code to silence the audit. The trailer is for controller glue only; `/review` will catch it.
6. Treating a green `ci-complete` as proof the heavy suites ran. Skipped counts as pass on PRs; check the job list, or force with `/ci full`.
7. Editing `docs/specs/` without an ADR in the same change.
8. Running `/adr` from two concurrent branches. Both compute the same next number; pre-assign instead.
9. Squash-merging a PR. It destroys the red-green-blue history the whole audit trail is built on.
10. Believing stale docs: CLAUDE.md still calls the source layers placeholders (six layers hold roughly 94K LOC as of 2026-07-05), CONTRIBUTING.md still says the App smoke test is the only test, `.claude/rules.md` rule 6 predates committed ADRs, and rule 9's type list is shorter than the commitlint enum. When a doc and a config disagree, the config gates.

## Provenance and maintenance

All facts verified against the repo and live GitHub state on 2026-07-05. Re-verify with:

- Hard rules text: `cat .claude/rules.md`
- Commit types and message rules: `cat commitlint.config.js`
- Audit rules and exemptions: `sed -n '70,100p' scripts/rgb-audit/cycle-audit.mjs` (classify) and the rule functions below it
- Audit CLI, default range, exit codes: `grep -n 'EXIT\|DEFAULT_RANGE' scripts/rgb-audit/rgb-audit.mjs`
- Audit design rationale and Infrastructure trailer: `cat docs/knowledge/decisions/ADR-0025-rgb-audit-and-foundation-acceptance.md`
- Boundaries repair incident: `cat docs/knowledge/decisions/ADR-0017-layer-boundary-enforcement-repair.md`
- Hooks: `cat .husky/pre-commit .husky/commit-msg .husky/pre-push`
- Required check and merge methods: `gh api repos/drmrd/vernacular/rulesets/17955144`
- ci-complete skip-counts-as-pass logic: `sed -n '289,305p' .github/workflows/ci.yml`
- Heavy-suite decision and label names: `sed -n '1,70p' scripts/ci/decide.mjs` and `grep -n 'run:e2e\|ci:full' .github/workflows/slash-command.yml`
- Failing-tests-in-history proposal status: `gh issue view 268 --repo drmrd/vernacular --json state,title,labels`
- ADR duplicate numbers still on disk: `ls docs/knowledge/decisions | cut -c1-8 | sort | uniq -d`
- Renumber-incident commits: `git log --oneline --grep='renumber' | head -20`
- Cooldown value and exclusions: `cat .npmrc`
- Agent role fences: `ls .claude/agents/` and read `test-author.md`, `implementer.md`, `refactorer.md`, `pr-reviewer.md`
- Slash commands: `ls .claude/commands/`

Facts most likely to drift: the ruleset id and its required checks, the commitlint type list, issue #268's state, the duplicate ADR pairs (someone may finally renumber 0076/0081), and the CLAUDE.md staleness notes.
