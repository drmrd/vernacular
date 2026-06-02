# Vernacular: Phase 0d.2 Hooks and Release Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the workflow tooling that the design specification's engineering norms call for: Husky-managed git hooks (pre-commit, commit-msg, pre-push), commitlint enforcing Conventional Commits on every commit, release-please managing the changelog and version bumps from Conventional Commit messages, lint-staged for the pre-commit hook's incremental scope, plus the GitHub PR template (with the knowledge-update checkbox) and bug and feature issue templates.

**Architecture:** Husky stores hooks under `.husky/`. The pre-commit hook runs `lint-staged` over only the staged files. The commit-msg hook runs commitlint. The pre-push hook runs the full check chain plus a knowledge-index sync check. release-please is configured as a GitHub Actions workflow (`.github/workflows/release-please.yml`) using its action and a `release-please-config.json`. Templates land under `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/*.md`.

**Tech Stack:** Markdown plus pnpm dev dependencies. Cooldown applies; the existing exclude list (rollup native binaries, typescript-eslint monorepo, Babel infrastructure per ADR-0013) is expected to be enough but the plan documents what to do if a new transitive blocks install.

**Scope boundary:** This plan does NOT add the testing scaffolds (Playwright, Storybook, Lighthouse, axe-core, Stryker, performance harness) listed for Phase 0e. It does NOT introduce any source code (Phase 0f). It does NOT yet add the custom local ESLint rules deferred from 0d.1 (still 0d.x follow-up).

---

## File Structure

| File                                                         | Purpose                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `.husky/pre-commit`                                          | Pre-commit hook: lint-staged, knowledge-index regen                    |
| `.husky/commit-msg`                                          | commit-msg hook: commitlint                                            |
| `.husky/pre-push`                                            | Pre-push hook: full check chain                                        |
| `commitlint.config.js`                                       | commitlint configuration (extends conventional + project subjects)     |
| `package.json`                                               | New devDeps, `prepare` script for Husky, `lint-staged` config          |
| `pnpm-lock.yaml`                                             | Updated lockfile                                                       |
| `.github/PULL_REQUEST_TEMPLATE.md`                           | PR template with summary, test plan, knowledge update, out of scope    |
| `.github/ISSUE_TEMPLATE/bug.md`                              | Bug report template                                                    |
| `.github/ISSUE_TEMPLATE/feature.md`                          | Feature request template                                               |
| `.github/ISSUE_TEMPLATE/config.yml`                          | Disables blank issues; points to security advisory for vulnerabilities |
| `.github/workflows/release-please.yml`                       | release-please workflow                                                |
| `release-please-config.json`                                 | release-please configuration                                           |
| `.release-please-manifest.json`                              | release-please manifest tracking the current version                   |
| `CONTRIBUTING.md`                                            | Mentions hooks, commitlint, release-please                             |
| `docs/knowledge/decisions/ADR-0014-hooks-release-tooling.md` | ADR documenting Husky + commitlint + release-please choice             |
| `docs/knowledge/INDEX.md`, `docs/knowledge/index.json`       | Regenerated                                                            |
| `ROADMAP.md`                                                 | Marks 0d.2 in progress                                                 |

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1**

```
pwd
git branch --show-current
git status --short
```

Expected: directory matches, branch is `feat/phase-0d2-hooks-release`, clean tree. If wrong, STOP and report BLOCKED.

---

### Task 2: Install new devDependencies under cooldown

The cooldown is active. The existing exclusion list (rollup binaries, typescript-eslint, Babel) covers most transitive friction. If pnpm refuses a transitive that does not fall into one of those categories, STOP and report the package name and reason; the controller will decide whether to expand the exclusion list (with an ADR amendment) or pin an older direct version.

- [ ] **Step 1: Install**

```
pnpm add -D husky @commitlint/cli @commitlint/config-conventional lint-staged
```

- [ ] **Step 2: Verify**

```
pnpm ls husky @commitlint/cli @commitlint/config-conventional lint-staged --depth=0
```

Expected: each package listed. Capture resolved versions.

---

### Task 3: Initialize Husky and add the `prepare` script

- [ ] **Step 1: Run Husky's init**

```
pnpm exec husky init
```

This creates `.husky/pre-commit` with a default body and adds a `prepare` script to `package.json`. We overwrite the hook content in Tasks 4 through 6.

- [ ] **Step 2: Verify the `prepare` script landed**

```
node -e "console.log(require('./package.json').scripts.prepare)"
```

Expected output: `husky`.

- [ ] **Step 3: Verify the `.husky/` directory exists**

```
test -d .husky && echo ok
```

Expected: `ok`.

---

### Task 4: Write the pre-commit hook

- [ ] **Step 1: Replace `.husky/pre-commit`**

Overwrite the file with this content:

```sh
#!/usr/bin/env sh

# Run lint-staged on staged files (lint + format + typecheck where applicable).
pnpm exec lint-staged

# If knowledge entries changed, regenerate the index and stage the result.
# This keeps INDEX.md and index.json in sync without an extra contributor step.
if git diff --cached --name-only | grep -qE '^docs/knowledge/(decisions|patterns|anti-patterns|components|runbooks|incidents)/'; then
  pnpm knowledge:index
  git add docs/knowledge/INDEX.md docs/knowledge/index.json
fi
```

- [ ] **Step 2: Make it executable**

```
chmod +x .husky/pre-commit
```

- [ ] **Step 3: Verify**

```
head -1 .husky/pre-commit
```

Expected: `#!/usr/bin/env sh`.

---

### Task 5: Write the commit-msg hook

- [ ] **Step 1: Create `.husky/commit-msg`**

```sh
#!/usr/bin/env sh
pnpm exec commitlint --edit "$1"
```

- [ ] **Step 2: Make it executable**

```
chmod +x .husky/commit-msg
```

---

### Task 6: Write the pre-push hook

- [ ] **Step 1: Create `.husky/pre-push`**

```sh
#!/usr/bin/env sh

# Full project check chain on push. Slow checks (Playwright, Lighthouse)
# stay in CI; this is the fast local guard.
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

- [ ] **Step 2: Make it executable**

```
chmod +x .husky/pre-push
```

---

### Task 7: Add `lint-staged` config and commitlint config to `package.json`

- [ ] **Step 1: Add `lint-staged` config**

Insert this block in `package.json` immediately before the `dependencies` key:

```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,cjs}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml,html,css}": ["prettier --write"]
  },
```

- [ ] **Step 2: Verify**

```
node -e "const p=require('./package.json'); console.log(JSON.stringify(p['lint-staged'], null, 2))"
```

Expected: prints the lint-staged config object.

---

### Task 8: Create `commitlint.config.js`

- [ ] **Step 1: Write the file**

```js
// commitlint.config.js
// Extends conventional. Restricts the type list to the project's
// canonical set (see CONTRIBUTING.md). Subject case is sentence-case
// to match our prior commits.

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf', 'build', 'ci'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'body-max-line-length': [1, 'always', 100],
    'footer-max-line-length': [1, 'always', 100],
  },
}
```

- [ ] **Step 2: Verify the config loads**

```
pnpm exec commitlint --help > /dev/null && echo ok
```

Expected: `ok`.

---

### Task 9: Test the hooks locally

The hooks should be active now. Run a smoke test by trying to commit a bad commit message.

- [ ] **Step 1: Make a trivial change**

```
echo "" >> CONTRIBUTING.md
```

- [ ] **Step 2: Attempt a non-conventional commit and confirm it is rejected**

```
git add CONTRIBUTING.md
git commit -m "this is a bad message" 2>&1 | tail -10 || true
```

Expected: commitlint rejects the message with a clear error. The commit does not land.

- [ ] **Step 3: Reset the test change**

```
git restore --staged CONTRIBUTING.md
git checkout -- CONTRIBUTING.md
```

- [ ] **Step 4: Verify the tree is clean again**

```
git status --short
```

Expected: empty.

---

### Task 10: Create `release-please-config.json`

release-please is configured to track a single-package repo. The version is held in `.release-please-manifest.json` (separate file, not in package.json, because package.json `version` is intentionally `0.0.0` until 1.0).

- [ ] **Step 1: Create the config**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "include-v-in-tag": true,
  "draft": false,
  "prerelease": false,
  "packages": {
    ".": {
      "package-name": "vernacular",
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "extra-files": []
    }
  },
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug fixes" },
    { "type": "perf", "section": "Performance" },
    { "type": "refactor", "section": "Refactoring" },
    { "type": "docs", "section": "Documentation" },
    { "type": "test", "section": "Tests" },
    { "type": "build", "section": "Build" },
    { "type": "ci", "section": "CI" },
    { "type": "chore", "section": "Chores", "hidden": false },
    { "type": "style", "section": "Style", "hidden": true }
  ]
}
```

- [ ] **Step 2: Create the manifest pinned to current `0.0.0`**

```json
{
  ".": "0.0.0"
}
```

Write to `.release-please-manifest.json`.

---

### Task 11: Create the release-please GitHub Actions workflow

- [ ] **Step 1: Write `.github/workflows/release-please.yml`**

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 2: Verify YAML parses**

```
pnpm dlx js-yaml < .github/workflows/release-please.yml > /dev/null && echo ok
```

Expected: `ok`.

---

### Task 12: Create the PR template

- [ ] **Step 1: Create `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## Summary

<!-- 1 to 3 sentences describing the change and the motivation. -->

## Test plan

<!-- A checklist of what was verified. -->

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` exits 0
- [ ] CI green
- [ ] <other manual checks>

## Knowledge graph

<!-- Architectural decisions land alongside an ADR or component entry. Tick one. -->

- [ ] No knowledge graph update needed (change is mechanical or documentation-only)
- [ ] Added or updated an entry under `docs/knowledge/`; ran `pnpm knowledge:index`

## Out of scope

<!-- What this PR deliberately defers. Use the `Phase 0...` numbering when applicable. -->
```

---

### Task 13: Create issue templates

- [ ] **Step 1: Create `.github/ISSUE_TEMPLATE/bug.md`**

```markdown
---
name: Bug report
about: Report a defect or unexpected behavior
title: '[bug] '
labels: ['bug', 'triage']
---

## What happened

<!-- The smallest reproducible behavior. Include OS, browser, Node and pnpm versions. -->

## What you expected

<!-- The behavior you expected instead. -->

## Reproduction

<!-- Step-by-step. A failing test or screenshot is gold. -->

## Environment

- OS:
- Browser and version:
- Node.js version:
- pnpm version:
- Vernacular commit SHA:
```

- [ ] **Step 2: Create `.github/ISSUE_TEMPLATE/feature.md`**

```markdown
---
name: Feature proposal
about: Propose a new capability
title: '[feature] '
labels: ['enhancement', 'triage']
---

## Problem

<!-- Describe the problem first. The solution comes second. -->

## Proposed solution

<!-- The shape of what you have in mind. Mocks, sketches, code snippets all welcome. -->

## Alternatives considered

<!-- Briefly. Why this approach over others? -->

## Related context

<!-- Spec sections, ADRs, prior issues, external references. -->
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE/config.yml`** to disable blank issues and point security to the advisory

```yaml
blank_issues_enabled: false
contact_links:
  - name: Security vulnerability
    url: https://github.com/drmrd/vernacular/security/advisories/new
    about: Please report security issues privately, not as a public issue.
```

---

### Task 14: Update `CONTRIBUTING.md`

- [ ] **Step 1: Add a "Hooks and release engineering" section**

Insert immediately before the existing "Working with Claude Code" section:

```markdown
## Hooks and release engineering

Husky installs three git hooks at `pnpm install` time via the `prepare` script:

- `pre-commit`: runs `lint-staged` on staged files (ESLint plus Prettier). If you touched a knowledge graph entry, the hook regenerates `INDEX.md` and `index.json` and stages them automatically.
- `commit-msg`: runs `commitlint` over your commit message. Conventional Commits are enforced; non-conforming messages are rejected.
- `pre-push`: runs the full local check chain (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`).

If you need to bypass a hook in a clean-up situation, use `git commit --no-verify`. This is allowed but discouraged; CI will catch most issues that the hook would have.

`release-please` watches `main` and opens release PRs as Conventional Commits accumulate. Merging a release PR cuts a tag and refreshes `CHANGELOG.md`. The current pre-release version is tracked in `.release-please-manifest.json`; the package.json `version` stays at `0.0.0` until the first 1.0.
```

- [ ] **Step 2: Verify**

```
grep -c "Hooks and release engineering" CONTRIBUTING.md
```

Expected: `1`.

---

### Task 15: Create ADR-0014

- [ ] **Step 1: Write `docs/knowledge/decisions/ADR-0014-hooks-release-tooling.md`**

```markdown
---
slug: decisions/ADR-0014-hooks-release-tooling
title: 'ADR-0014: Husky, commitlint, lint-staged, release-please'
type: decision
tags: [tooling, hooks, conventional-commits, release-engineering]
related: [decisions/ADR-0009-test-pyramid-rgb-tdd, decisions/ADR-0012-eslint-guardrails]
sourceFiles:
  [
    .husky/pre-commit,
    .husky/commit-msg,
    .husky/pre-push,
    commitlint.config.js,
    package.json,
    release-please-config.json,
    .release-please-manifest.json,
    .github/workflows/release-please.yml,
  ]
status: current
updated: 2026-06-02
---

# ADR-0014: Husky, commitlint, lint-staged, release-please

## Status

Accepted. Implemented in Phase 0d.2.

## Context

The project commits to Conventional Commits and a Clean Code rule set, and aspires to a clean release history. Without local enforcement, contributors land mis-typed commit messages, forget to run the lint-staged subset, and skip the full check chain before pushing; CI catches these but only after a round trip. release-please mechanizes the changelog and version bumps from those commits.

## Decision

- **Husky** owns the hook installation. The `prepare` npm lifecycle hook calls Husky so that `pnpm install` puts the hooks in place automatically.
- **`pre-commit`** runs `lint-staged` (only changed files, fast) and auto-regenerates the knowledge index when an entry was touched. The hook stages the regenerated index so the contributor does not have to.
- **`commit-msg`** runs `commitlint` configured against `@commitlint/config-conventional` with the project's narrowed type list (`feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`, `build`, `ci`).
- **`pre-push`** runs the full check chain. Heavy checks (Playwright, Lighthouse, mutation tests) stay in CI; the pre-push guard catches the typecheck/lint/format/test/build pipeline.
- **`lint-staged`** is configured in `package.json` per glob: TS files get ESLint plus Prettier; other recognized formats get Prettier only.
- **`release-please`** runs on push to `main` as a GitHub Actions workflow. The release type is `node`; the version is stored in `.release-please-manifest.json` (separate from `package.json` so `version` can stay `0.0.0` until 1.0). The changelog sections map Conventional Commits to human-friendly headings.

## Consequences

- A new contributor's first `pnpm install` activates all three hooks automatically.
- Non-conforming commit messages are rejected locally, not at PR time.
- The knowledge graph stays in sync without contributor effort.
- Mechanical release management: a PR merge to `main` either updates the open release PR or, if a release PR exists, opens a tag and refreshes the changelog when merged.
- Hooks can be bypassed with `--no-verify` when necessary; CI is the final guard.

## References

- Design specification, section 8.2 (Changelog and release engineering), section 8.5 (Pre-commit hooks).
- ADR-0009 (test pyramid; the pre-push hook runs the unit test pyramid before push).
- ADR-0012 (the ESLint guardrails that the pre-commit hook applies via lint-staged).
```

---

### Task 16: Regenerate the knowledge index

- [ ] **Step 1**

```
pnpm knowledge:index
```

Expected output: `indexed 15 entries; wrote docs/knowledge/INDEX.md and docs/knowledge/index.json`.

---

### Task 17: Update ROADMAP

In `ROADMAP.md`, change the 0d.2 row's status from `next` to `in progress`. Promote 0e to `next`.

Find:

```
| 0d.2  | Husky + commitlint + release-please + PR/issue templates | pending     |
```

Replace with:

```
| 0d.2  | Husky + commitlint + release-please + PR/issue templates | in progress |
```

And the existing 0e row should change from `pending` to `next`.

---

### Task 18: Apply Prettier formatting

- [ ] **Step 1**

```
pnpm format
```

- [ ] **Step 2**

```
pnpm format:check
```

Expected: `All matched files use Prettier code style!`.

---

### Task 19: All-checks rehearsal

- [ ] **Step 1**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 2**

```
pnpm knowledge:index
git diff --quiet docs/knowledge/INDEX.md docs/knowledge/index.json && echo "index in sync" || echo "OUT OF SYNC"
```

Expected: `index in sync`.

---

### Task 20: Commit using a conventional message

The commit-msg hook is now active, so the commit message must be conventional.

- [ ] **Step 1: Stage**

```
git add \
  .husky/ \
  package.json \
  pnpm-lock.yaml \
  commitlint.config.js \
  release-please-config.json \
  .release-please-manifest.json \
  .github/workflows/release-please.yml \
  .github/PULL_REQUEST_TEMPLATE.md \
  .github/ISSUE_TEMPLATE/ \
  CONTRIBUTING.md \
  ROADMAP.md \
  docs/knowledge/decisions/ADR-0014-hooks-release-tooling.md \
  docs/knowledge/INDEX.md \
  docs/knowledge/index.json
```

- [ ] **Step 2: Pre-commit check chain**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```
git commit -m "$(cat <<'EOF'
chore(hooks): add Husky, commitlint, lint-staged, release-please (Phase 0d.2)

Wires up the workflow tooling called for by the design spec's
engineering norms:

* Husky pre-commit, commit-msg, pre-push hooks (installed by the
  `prepare` script so `pnpm install` activates them).
  - pre-commit: lint-staged (ESLint + Prettier on changed files);
    auto-regenerates docs/knowledge/INDEX.md and index.json if an
    entry was touched and stages the result.
  - commit-msg: commitlint enforcing Conventional Commits with the
    project's narrowed type list.
  - pre-push: full local check chain (typecheck, lint, format
    check, test, build).
* lint-staged config in package.json for the per-glob commands.
* commitlint.config.js extending @commitlint/config-conventional.
* release-please workflow at .github/workflows/release-please.yml
  plus release-please-config.json and .release-please-manifest.json.
  Tracks version in the manifest so package.json `version` stays
  at 0.0.0 until 1.0.
* PR template with summary, test plan, knowledge update, out of
  scope sections. Bug and feature issue templates plus a
  config.yml that disables blank issues and points security
  reports at the advisory link.
* ADR-0014 documents the tooling choice.
* CONTRIBUTING.md gains a Hooks and release engineering section.
* ROADMAP.md marks 0d.2 in progress; 0e promoted to next.

Phase 0e (testing scaffolds: Playwright, Storybook, Lighthouse,
axe-core, Stryker, performance harness) builds on this.
EOF
)"
```

- [ ] **Step 4: Verify**

```
git log --oneline -3
git log -1 --format=%B | grep -c "^Co-Authored-By:"
```

Expected: new commit at top; trailer count `0`.

---

### Task 21: Push and open the PR

- [ ] **Step 1: Push (the pre-push hook will run)**

```
git push -u origin feat/phase-0d2-hooks-release
```

If the pre-push hook fails on something, the push is rejected. Fix the issue and retry. (The plan's all-checks rehearsal in Task 19 should have caught everything.)

- [ ] **Step 2: Open the PR**

```
gh pr create --base main --head feat/phase-0d2-hooks-release --title "Phase 0d.2: Husky + commitlint + release-please + templates" --body "$(cat <<'EOF'
## Summary

Phase 0d.2 of the Vernacular implementation per `docs/plans/2026-06-02-vernacular-phase-0d2-hooks-release.md`. Adds the workflow tooling on top of the Phase 0d.1 lint guardrails: Husky-managed git hooks, commitlint enforcing Conventional Commits, lint-staged for the pre-commit's incremental scope, release-please managing the changelog and version bumps, GitHub PR and issue templates.

## Files

* `.husky/pre-commit`, `commit-msg`, `pre-push` hooks
* `commitlint.config.js`
* `package.json`: new devDeps; `prepare` script; `lint-staged` config
* `release-please-config.json` and `.release-please-manifest.json`
* `.github/workflows/release-please.yml`
* `.github/PULL_REQUEST_TEMPLATE.md`
* `.github/ISSUE_TEMPLATE/bug.md`, `feature.md`, `config.yml`
* `docs/knowledge/decisions/ADR-0014-hooks-release-tooling.md`
* `CONTRIBUTING.md`: Hooks and release engineering section
* `ROADMAP.md`: 0d.2 in progress, 0e next

## Test plan

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` exits 0
- [ ] CI green
- [ ] Husky hooks fire locally (a non-conventional commit is rejected by the commit-msg hook)
- [ ] `pnpm knowledge:index` is idempotent (no diff after a re-run)
- [ ] Confirm release-please workflow YAML is valid
- [ ] PR template renders correctly in GitHub UI

## Knowledge graph

- [x] Added entry: `docs/knowledge/decisions/ADR-0014-hooks-release-tooling.md`

## Out of scope

Phase 0e (testing scaffolds: Playwright, Storybook, Lighthouse, axe-core, Stryker, performance harness), Phase 0f+ (source skeleton). Custom local ESLint rules deferred from 0d.1 are still pending as a 0d.x follow-up.
EOF
)"
```

- [ ] **Step 3: Verify**

```
gh pr view --json url,state --jq '"\(.state) \(.url)"'
```

Expected: state OPEN.

---

## What Phase 0d.2 explicitly does NOT include

- Phase 0e testing scaffolds (Playwright, Storybook, Lighthouse, axe-core, Stryker, perf harness).
- Phase 0f source skeleton.
- Phase 0d.x custom local ESLint rules (`no-direct-three-imports-outside-engine`, `no-direct-storage-API-outside-storage`).
- Renovate or Dependabot configuration that respects the cooldown. (The dep cooldown ADR mentions configuring these in 0d; this plan does not. Add it in a 0d.3 follow-up when the project is closer to needing automated bumps.)

---

## Self-review notes (planning author only)

Spec coverage of this plan vs. spec section 8.5 (Pre-commit hooks):

- Lint (only changed files): implemented via lint-staged.
- Typecheck (incremental): runs in pre-push, not pre-commit (typecheck is global by nature with `tsc --noEmit`; running it on every commit is slow).
- Format check (Prettier): implemented via lint-staged.
- Conventional commit message format: implemented via commitlint.
- Knowledge-graph update warning: implemented via auto-regeneration plus auto-staging (stronger than a warning).
- Test affected paths (`vitest run --changed`): implemented in pre-push as full `pnpm test`. Future optimization could narrow this to changed paths once the test surface is large enough to need it.
- Asset-pack manifest validation: deferred to Phase 0i when packs become real.
- Clean-code-reviewer warnings: deferred to the agent workflow, not a Husky hook.

Spec coverage vs. section 8.2 (Changelog and release engineering):

- Conventional Commits enforced via commitlint: implemented.
- Automated changelog via release-please: implemented.
- SemVer strictly: handled by release-please.
- Release branches `release/v<X>.<Y>.x` for back-porting: deferred until needed.
- Tags on every release; release notes mirrored to GitHub Releases: handled by release-please's default behavior.

Placeholder scan: none.

Type consistency: hook script paths, package names, and workflow file names are consistent.

Em-dash audit: ran on the plan text before commit.
