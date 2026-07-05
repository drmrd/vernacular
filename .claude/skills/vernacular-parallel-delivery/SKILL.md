---
name: vernacular-parallel-delivery
description: Use when running two or more red-green-blue lanes at once. Triggers include creating or naming a git worktree for a parallel slice, writing a file-scope fence for a concurrent agent, assigning ADR numbers to parallel branches, choosing merge order for sibling slices, rebasing a lane after main moved, refreshing visual baselines during an integration, or a multi-branch integration failing pnpm rgb:audit. Keywords, worktree, lane, scope fence, ADR collision, cherry-pick rebuild, merge order.
---

# Parallel delivery: worktrees, lanes, and integration

## Overview

Run each concurrent slice in its own sibling git worktree with a written file-scope fence, and let exactly one integrator serialize merges, rebases, and baseline refreshes. Parallelism here fails on shared files and shared numbers (ADRs, baselines), never on logic, so the discipline is about territory, not cleverness.

## When to use

- You are about to run two or more red-green-blue TDD lanes at the same time.
- You are dispatching a subagent into a worktree and need to bound what it may touch.
- Two branches both want to add an ADR, edit a shared interface, or refresh baselines.
- A combined multi-branch integration fails `pnpm rgb:audit` and you need a clean history.

## When NOT to use

- Single-branch work: the cycle itself, commit taxonomy, and PR gates live in vernacular-change-control.
- Getting a fresh worktree building (installs, browsers, emitted-config traps): vernacular-build-and-env.
- What the baseline tiers are and how each one refreshes: vernacular-validation-and-qa.
- ADR writing conventions and numbering format: vernacular-docs-and-writing.

## Quick reference

| Task                                                                     | Command or rule                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Create a lane worktree                                                   | `git worktree add -b feat/<slug> ../vernacular.wt/<slug> origin/main`              |
| Worktree naming trap                                                     | The directory path must NOT contain the literal string `scene-`                    |
| Prove spec routing is sane                                               | `pnpm exec playwright test --list --project=chromium` lists non-scene specs        |
| Audit a lane before its PR                                               | `pnpm rgb:audit --range origin/main..HEAD`                                         |
| Highest ADR number on origin/main (assign highest+1, highest+2 per lane) | `git ls-tree --name-only origin/main docs/knowledge/decisions/ \| sort \| tail -1` |
| Detect ADR duplicates                                                    | `ls docs/knowledge/decisions/ \| cut -d- -f1-2 \| sort \| uniq -d`                 |
| Rebuild an integration commit                                            | `git cherry-pick --allow-empty --empty=keep <sha>`                                 |
| Insert a missing BLUE marker                                             | `git commit --allow-empty -m "refactor: mark the <behavior> cycle blue"`           |
| Prove rebuilt tree identical                                             | `git rev-parse HEAD^{tree} <reviewed-tip>^{tree}` prints the same hash twice       |
| List / remove worktrees                                                  | `git worktree list` / `git worktree remove ../vernacular.wt/<slug>`                |

## Worktrees: one lane, one sibling directory

A lane is one slice of work with its own branch, worktree, and file territory. Keep every lane worktree OUTSIDE the main clone, as a sibling under `../vernacular.wt/`:

```
git worktree add -b feat/<slug> ../vernacular.wt/<slug> origin/main
```

Reasons the sibling location is mandatory: a worktree nested inside the clone shows up in `git status`, gets scanned by lint and format checks, and confuses tooling that walks the repo root. The committed orchestration plan (`docs/plans/2026-06-27-public-beta-dependency-waves.md`, execution protocol) records this as the practiced pattern: never work in the main clone; clean up the worktree after merge.

Branch off `origin/main`, not local `main`. Local `main` in a long-lived clone is routinely stale while lanes are merging.

### The `scene-` path trap (verified in playwright.config.ts)

`playwright.config.ts` routes specs to projects with unanchored regexes:

- `scene-webgl` project: `testMatch: /scene-.*\.spec\.ts/`
- `chromium`, `firefox`, `webkit` projects: `testIgnore: /scene-.*\.spec\.ts/`

Playwright matches regexes against the ABSOLUTE file path. If the worktree directory contains `scene-` anywhere (for example `../vernacular.wt/scene-solar-fix/`), every spec's absolute path matches both regexes: every spec silently reroutes into the GPU-only `scene-webgl` project and the three browser projects run zero tests. Nothing errors; suites just quietly run in the wrong project or not at all.

Rules:

1. Never put `scene-` in a worktree directory or any parent directory name. Reword (`solar-scene`, `scenefix`), do not hyphenate after `scene`.
2. After creating any worktree that will run e2e, verify routing: `pnpm exec playwright test --list --project=chromium` must list the ordinary specs.

## File-scope fences

Before dispatching an agent into a lane, write the fence into its instructions:

1. The exact files and directories the lane may create or edit (its territory).
2. An explicit list of shared files it must NOT touch even if a change seems necessary. At minimum: `package.json`, `pnpm-lock.yaml`, `eslint.config.js`, `playwright.config.ts`, `vite.config.ts`, `tsconfig*.json`, the `core/index.ts` barrel (unless the lane owns an additive export), CI workflow files, and any file named in another live lane's fence.
3. The stop instruction, verbatim intent: "If completing the task appears to require editing a file outside this list, STOP and report back. Do not edit shared config."

Lanes are derived from shared hot files, not from logical dependencies. Two issues with no dependency between them still serialize if they would both edit the same file. The lane tables in `docs/plans/2026-06-27-public-beta-dependency-waves.md` are the worked example: run at most one active issue per lane at a time, and a set of issues that all touch one hot file (there, `bridge/react/webgpu-scene-view.tsx`) forms a single sequential lane owned by one worker across waves.

Append-only shared files (barrels like `core/index.ts`, coverage manifests) are the one tolerated overlap: strictly additive edits at the tail. Expect a trivial both-added conflict on rebase and resolve it by keeping both blocks.

## ADR numbers: pre-assign at dispatch, re-verify before landing

Two parallel lanes that each "take the next ADR number" will take the same one. This has merged unnoticed twice: `ADR-0076` and `ADR-0081` each exist as two different files on disk as of 2026-07-05 (`ls docs/knowledge/decisions/ | cut -d- -f1-2 | sort | uniq -d`). Later collisions were caught and cost renumber commits (for example `e8cd175f`, "renumber the slice-0 ADRs to 0142 and 0143 after the ADR-0141 collision on main", and `1f4288ec` for a pan-ADR collision).

Protocol:

1. At dispatch time the orchestrator reads the highest number on `origin/main` (`git ls-tree --name-only origin/main docs/knowledge/decisions/ | sort | tail -1`) and assigns each lane an explicit number in its fence: lane one gets next, lane two gets next plus one, and so on.
2. Lanes never pick their own numbers and never renumber themselves mid-flight.
3. Before each lane lands, the integrator re-runs the same `git ls-tree` against a fresh `git fetch origin` and confirms the assigned number is still free on `origin/main`. If taken (a lane landed out of order, or an unrelated branch merged), renumber on the branch before merge. Renumbering on a branch is one commit; a duplicate on `main` is permanent noise.

## Shared-interface sequencing

Making an optional field required on a shared interface (or adding a new required field) breaks every sibling lane's fixtures at typecheck time, because fixtures construct object literals of that type. This is a known, documented cost: see `docs/plans/2026-06-03-wall-drawing-proof-of-life.md` (adding required `walls` to `SceneGraph` forced a fixture edit in the engine test that constructs a `SceneGraph` literal).

Before any lane changes a shared interface:

1. Grep the construction sites first: search all layers and test fixtures for object literals of that type (`grep -rn ': SceneGraph' core/ engine/ bridge/ editor/` style queries, plus the type name itself). Count the blast radius before committing to the change.
2. If the blast radius crosses another live lane's territory, the interface change waits: land the independent slice first, then rebase the interface lane and absorb the fixture edits in one place.
3. Prefer optional-with-default over required when siblings are live; tighten to required in a follow-up slice after the lanes drain.

## Audit ranges

Always audit a lane with an explicit range against the remote:

```
pnpm rgb:audit --range origin/main..HEAD
```

The script's built-in default is `main..HEAD` (see `scripts/rgb-audit/rgb-audit.mjs`), which silently audits the wrong range whenever local `main` is stale, and in a parallel run local `main` is almost always stale. Never hand-compute a merge base; `origin/main..HEAD` after a `git fetch origin` is the range. The cycle rules the audit enforces (RED `test:` before GREEN `feat:`/`fix:`, every GREEN closed by a BLUE `refactor:`, GREEN touches no test files) belong to vernacular-change-control.

## Rebase hazards when main moves

Every time a sibling lane merges, the remaining lanes rebase onto the new `origin/main`. Two traps:

1. A sibling's shared-doc edits can vanish in a mechanical rebase. If your lane and the merged sibling both edited a shared file (a barrel, a shared plan or spec, a coverage manifest), conflict auto-resolution or a careless "take ours" can silently drop the sibling's already-merged hunks, and your later merge then reverts them. After EVERY rebase, for each shared file your lane touches, run `git diff origin/main -- <file>` and confirm the output contains only your lane's additions. Any removed sibling content there is a reverted-edit bug in waiting.
2. Both-added tail conflicts in append-only files resolve by keeping both blocks, sibling's first (matching merge order), yours after. This is the documented resolution for the `core/index.ts` pattern (`docs/plans/2026-06-09-two-dimensional-plan-export.md`, shared-file note).

After the rebase, re-run `pnpm rgb:audit --range origin/main..HEAD` and the full check chain before the PR updates.

## Merge order and baseline ownership

The integrator (one session, usually the orchestrating one) serializes integration:

1. Merge the independent slice first: the lane with no shared-file overlap against the others. Every remaining lane then rebases once against a main that moved in the simplest possible way.
2. Between merges, exactly one party refreshes visual baselines: the integrator. Lanes never refresh baselines in parallel; two lanes racing on the same screenshot directories produce baseline churn that reverts each other. The three baseline tiers, their platforms, and refresh commands are in vernacular-validation-and-qa; the parallel-delivery rule is only about ownership: story baselines come from the `refresh-story-baselines.yml` workflow, scene baselines from a local darwin render, app baselines from a local or docker run, and in all three cases a single integrator triggers the refresh after a merge, inspects the diff, and commits it alone.
3. Re-verify each remaining lane (rebase, shared-doc check, audit, check chain) before its merge. Never merge two lanes back to back without the intervening rebase and re-audit of the second.

## Integration rebuild: when the combined history fails the audit

Combining several lanes (or salvaging an interleaved history) can produce a branch whose TREE is correct and reviewed but whose COMMIT SEQUENCE fails `pnpm rgb:audit` (GREEN commits without closing BLUEs, orphaned cycles, mixed test-plus-source commits). Do not weaken the audit and do not merge a failing history. Rebuild a clean linear history that reaches the identical tree:

```
git fetch origin
REVIEWED=$(git rev-parse HEAD)                      # the reviewed integration tip
git checkout -b feat/<slug>-rebuilt origin/main
```

Then, oldest first, cherry-pick the integration's commits into a valid cycle order:

```
git cherry-pick --allow-empty --empty=keep <sha>
```

- `--allow-empty` preserves the intentionally empty BLUE marker commits; `--empty=keep` keeps commits that become empty because an earlier pick already contains their change. Both flags, always.
- Reorder so every cycle reads RED test, GREEN feat/fix, BLUE refactor, and every GREEN closes with a BLUE before the next RED. Where a closing BLUE never existed, insert one: `git commit --allow-empty -m "refactor: mark the <behavior> cycle blue"`.
- Split a commit that mixes test and implementation files with `git cherry-pick -n <sha>`, then commit the test files as `test:` and the source files as `feat:` (in that order).

Verify, in this order, before touching the PR:

```
pnpm rgb:audit --range origin/main..HEAD             # must exit 0
git rev-parse HEAD^{tree} $REVIEWED^{tree}           # must print the SAME hash twice
git diff $REVIEWED HEAD                              # equivalent check: must be empty
```

The tree-identity check is what lets the existing review carry over: the rebuilt branch is byte-for-byte the same content, only the commit boundaries moved. If the hashes differ, you changed content during the rebuild; diff the two trees, fix the rebuilt branch, and re-verify. (If `origin/main` advanced after the reviewed tip was cut, rebuild off the same base the reviewed tip used, or accept that the diff will show main's changes and re-review.) Then retarget or reopen the PR on the rebuilt branch through the normal flow in vernacular-change-control.

## Common mistakes

- Putting the worktree inside the main clone, or naming its path with `scene-` (silently reroutes every Playwright spec).
- Auditing `main..HEAD` by default, or guessing a merge base, instead of `origin/main..HEAD` after a fetch.
- Two lanes each holding "the next" ADR number; or verifying the number against the lane's own branch instead of `origin/main`.
- Letting a lane make a shared field required without grepping construction sites across layers and fixtures first.
- Two lanes both fenced onto the same hot file "because the edits look disjoint". If both fences name a file, the lanes are sequential.
- Trusting a mechanical rebase: not re-diffing shared docs afterward, then merging a branch that reverts a sibling's landed edits.
- Two lanes refreshing the same baseline directory; baseline refresh belongs to the one integrator, between merges.
- Rebuilding a failing integration and merging without the `^{tree}` identity check against the reviewed tip.
- Merging two lanes back to back without rebasing and re-auditing the second in between.

## Provenance and maintenance

All facts verified against the repo on 2026-07-05. Re-verify with:

- Playwright `scene-` routing regexes: `grep -n 'scene-' playwright.config.ts` (testMatch line 74, testIgnore lines 48, 53, 58).
- rgb:audit `--range` flag and `main..HEAD` default: `grep -n 'DEFAULT_RANGE\|--range' scripts/rgb-audit/rgb-audit.mjs`; smoke test `pnpm rgb:audit --range HEAD~4..HEAD`.
- Cycle classification (test(e2e) and Infrastructure-trailer exemptions): `grep -n -A14 'function classify' scripts/rgb-audit/cycle-audit.mjs`.
- ADR duplicates still on disk: `ls docs/knowledge/decisions/ | cut -d- -f1-2 | sort | uniq -d` (prints ADR-0076 and ADR-0081 as of 2026-07-05).
- Highest ADR on main (ADR-0152 as of 2026-07-05): `git ls-tree --name-only origin/main docs/knowledge/decisions/ | sort | tail -1`.
- Renumber-commit history: `git log --oneline --all --grep='renumber' -i -- docs/knowledge/decisions`.
- Lane/wave orchestration plan and fence wording: `sed -n '95,220p' docs/plans/2026-06-27-public-beta-dependency-waves.md`.
- Required-shared-field fixture cost example: `grep -n 'required' docs/plans/2026-06-03-wall-drawing-proof-of-life.md`.
- Both-added barrel-conflict resolution: `grep -n 'both-added' docs/plans/2026-06-09-two-dimensional-plan-export.md`.
- Baseline refresh workflows exist: `ls .github/workflows/refresh-*.yml`.
- cherry-pick flags on the installed git (2.54.0 as of 2026-07-05): `git cherry-pick -h | grep -E 'empty'`.
- Sibling worktree convention in live use: `git worktree list`.
