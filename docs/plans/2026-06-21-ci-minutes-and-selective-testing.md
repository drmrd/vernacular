# CI Cost Control & Selective Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut GitHub Actions minutes (~6,800/mo today, exhausting the 3,000 Pro allotment in ~13 days) without losing test coverage, by making PR-time CI selective and adding a merge queue that runs the full battery before anything lands on `main`.

**Architecture:** A native GitHub merge queue runs the complete suite on the `merge_group` event, which becomes the backstop that guarantees `main` stays green. Because of that backstop, pull-request runs can safely shrink: a `select-tests.mjs` script picks only the unit-test layers a change can affect (sound because `eslint-plugin-boundaries` enforces the layer DAG), and a `decide.mjs` script gates the heavy suites (e2e, Storybook visual, Lighthouse) on changed paths, draft state, and labels. A permission-gated slash-command workflow lets you force any suite on demand by flipping a label the decision scripts read live. A single `ci-complete` aggregator job is the only required status check, which is what lets PR and merge-queue runs require different work while satisfying one branch rule.

**Tech Stack:** GitHub Actions, Node 22 + pnpm 10.33.4, Vitest 3 (project `unit`), Playwright 1.60, plain dependency-injected `.mjs` CLIs (no new dependencies), `actions/github-script@v7`, GitHub repository rulesets (merge queue).

## Global Constraints

- **Node 22** (`.nvmrc`), **pnpm 10.33.4** (`packageManager`). Every workflow job sets up both via the existing `pnpm/action-setup@v3` + `actions/setup-node@v4` steps.
- **No new runtime or dev dependencies.** All new logic is plain Node `.mjs` using only `node:` built-ins plus the preinstalled `git` and `gh` CLIs. `actions/github-script` is a GitHub Action, not an npm package.
- **Commits use RGB-exempt conventional types only:** `ci:`, `chore:`, `docs:`, and `test:`. Do NOT use `feat:`, `fix:`, or `refactor:` anywhere in this plan. Reason: `scripts/rgb-audit/cycle-audit.mjs` classifies only `feat`/`fix` (GREEN) and `refactor` (BLUE) into the red-green-blue cycle; `ci`/`chore`/`docs` are `exempt` and `test:` (non-e2e scope) is a harmless unconsumed RED. Using exempt types keeps the PR's `pnpm rgb:audit` green and keeps `release-please` from cutting spurious version bumps for tooling work.
- **Conventional Commits**, subject in sentence case (never Start-Case / PascalCase / UPPER-CASE — enforced by `commitlint.config.js`). **No em-dashes** in code, comments, or commit messages (house style).
- **Selection must never under-select.** Over-selecting tests (running extra) is always acceptable; missing an affected test is not. When in doubt, a rule should widen the set. The merge queue runs everything regardless, so PR-time selection is a speed optimization, never a correctness boundary.
- **`max-lines-per-function` is 40 and `max-lines` is 300** (eslint `warn`). Keep new functions small; the DI shells in this plan already do.

## Context & expected savings

Measured over Jun 13-21 (8.4 days): ~290 CI runs at ~11 billable min each (success), all `ubuntu-latest` (1x). The unit-test step alone is 5.2 min and gates every run; e2e (2.3) + Storybook (1.0) + Lighthouse (2.3, main-only) run on top. Per-suite contribution of a successful PR run: Check 6.5 / e2e 2.3 / Storybook 1.0 / ping-pong 1.0.

- **Phase 2** (selective unit tests) attacks the 5.2-min gate, the single biggest line item, on the majority of PRs that touch only upper layers.
- **Phase 3** (heavy-suite gating) stops e2e/Storybook from running on every intermediate agent push and on drafts.
- **Phase 1** (merge queue) both enables the above safely and batches multiple queued PRs into one full run, which is where the agent-swarm throughput stops multiplying minutes.

There is no branch protection on `main` today (`gh api repos/drmrd/vernacular/branches/main/protection` returns 404), which is why CI has been bypassable. Phase 1 closes that gap.

---

## File Structure

**Create:**

- `scripts/ci/layers.mjs` — the enforced layer DAG (`LAYERS`) plus `layerOf()` and `affectedLayers()` reverse-closure. Pure, no I/O.
- `scripts/ci/layers.test.mjs` — unit tests for the above.
- `scripts/ci/select-tests.mjs` — DI CLI: diff against the PR base, map to affected layers via `layers.mjs` + `ci-coupling.json`, emit a Vitest path filter (`mode` = `all` | `some` | `none`, `paths`).
- `scripts/ci/select-tests.test.mjs` — unit tests with injected git/coupling.
- `scripts/ci/decide.mjs` — DI CLI: choose which heavy suites (`e2e`, `visual`, `lighthouse`) a run needs, from event/paths/draft/labels.
- `scripts/ci/decide.test.mjs` — unit tests with injected deps.
- `ci-coupling.json` — declarative map of non-obvious couplings (global-rebuild inputs and path-to-layer edges). The one file you edit when you learn a new coupling.
- `.github/rulesets/main-merge-queue.json` — version-controlled ruleset body (branch protection + required check + merge queue) applied via `gh api`.
- `.github/workflows/slash-command.yml` — permission-gated `issue_comment` handler that flips CI labels and re-runs.

**Modify:**

- `.github/workflows/ci.yml` — add `merge_group` trigger, the `ci-complete` aggregator, the `decide` job, selective unit step, and `if:` gates on heavy jobs.
- `package.json` — add a `test:select` convenience script (Phase 2).

Each phase below is independently mergeable and leaves CI working. Recommended order is 1 → 2 → 3 → 4, but Phase 2 and Phase 3 are independent of each other.

---

## Phase 1: Merge queue + branch protection + aggregator

### Task 1.1: Restructure `ci.yml` for `merge_group` and add the `ci-complete` aggregator

**Files:**

- Modify: `.github/workflows/ci.yml` (full replacement)

**Interfaces:**

- Produces: a status check named **`ci-complete`** on both `pull_request` and `merge_group` events. This exact context name is consumed by the ruleset in Task 1.2 and must not change.

- [ ] **Step 1: Replace `.github/workflows/ci.yml` with the restructured workflow**

This keeps every existing step verbatim; it only adds the `merge_group` trigger, makes the heavy suites run in the queue, and adds the aggregator. (Selective unit tests and the `decide` gate arrive in Phases 2-3.)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  merge_group:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Set up pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10.33.4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Format check
        run: pnpm format:check
      - name: Test
        run: pnpm test
      - name: Integration-acceptance audit
        run: pnpm integration:audit
      - name: Build
        run: pnpm build

  ping-pong:
    name: Ping-pong compliance
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    needs: check
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Set up pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10.33.4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Audit the red-green-blue commit history
        run: pnpm rgb:audit --range "origin/${{ github.base_ref }}..HEAD"

  storybook-build:
    name: Storybook build and component tests
    runs-on: ubuntu-latest
    needs: check
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10.33.4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
      - name: Run Storybook component tests
        run: pnpm storybook:test
      - name: Build Storybook
        run: pnpm build-storybook
      - name: Visual-regression diff of Storybook stories
        run: pnpm stories:test
      - name: Upload static Storybook
        uses: actions/upload-artifact@v4
        with:
          name: storybook-static
          path: storybook-static
          retention-days: 7
      - name: Upload story visual diff report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: storybook-visual-report
          path: playwright-report
          retention-days: 7

  e2e:
    name: End-to-end (chromium)
    runs-on: ubuntu-latest
    needs: check
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10.33.4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
      - name: Build production bundle
        run: pnpm build
      - name: Run Playwright (chromium)
        run: pnpm exec playwright test --project=chromium
      - name: Upload Playwright HTML report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 7

  lighthouse:
    name: Lighthouse CI
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    needs: check
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10.33.4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Chrome for Lighthouse
        uses: browser-actions/setup-chrome@v1
      - name: Build production bundle
        run: pnpm build
      - name: Run Lighthouse CI
        run: pnpm lhci
      - name: Upload Lighthouse results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lighthouseci
          path: .lighthouseci
          retention-days: 7

  ci-complete:
    name: ci-complete
    if: always()
    runs-on: ubuntu-latest
    needs: [check, ping-pong, storybook-build, e2e, lighthouse]
    steps:
      - name: Gate on required jobs
        run: |
          echo "check=${{ needs.check.result }} ping-pong=${{ needs.ping-pong.result }} storybook=${{ needs.storybook-build.result }} e2e=${{ needs.e2e.result }} lighthouse=${{ needs.lighthouse.result }}"
          for result in "${{ needs.check.result }}" "${{ needs.ping-pong.result }}" "${{ needs.storybook-build.result }}" "${{ needs.e2e.result }}" "${{ needs.lighthouse.result }}"; do
            if [ "$result" = "failure" ] || [ "$result" = "cancelled" ]; then
              echo "A required job did not pass: $result"
              exit 1
            fi
          done
          echo "All gating jobs passed or were skipped."
```

Notes for the implementer:

- A job skipped by an `if:` reports `result == 'skipped'`, which the loop treats as passing. That is the mechanism that lets `ci-complete` be the single required check even when different jobs run on PR vs merge queue.
- `lighthouse` now runs on `push` and `merge_group` but not `pull_request` (was previously gated to `main`/tags); the queue is the right place for it.
- `check` gained `fetch-depth: 0` so Phase 2's diff-against-base works without another change.

- [ ] **Step 2: Validate the workflow is parseable**

Run: `cd ~/workspace/vernacular && ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'yaml ok'"`
Expected: `yaml ok` (Ruby ships with YAML on macOS; no install needed). The authoritative check of `needs`/`if`/expression logic is the PR's own CI run, which GitHub rejects outright if the workflow is malformed.

- [ ] **Step 3: Commit**

```bash
cd ~/workspace/vernacular
git add .github/workflows/ci.yml
git commit -m "ci: add merge_group trigger and ci-complete aggregator"
```

---

### Task 1.2: Add and apply the branch ruleset (protection + required check + merge queue)

**Files:**

- Create: `.github/rulesets/main-merge-queue.json`

**Interfaces:**

- Consumes: the `ci-complete` status check produced in Task 1.1.

- [ ] **Step 1: Create `.github/rulesets/main-merge-queue.json`**

```json
{
  "name": "main protection and merge queue",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "ci-complete" }]
      }
    },
    {
      "type": "merge_queue",
      "parameters": {
        "merge_method": "MERGE",
        "grouping_strategy": "ALLGREEN",
        "max_entries_to_build": 5,
        "max_entries_to_merge": 5,
        "min_entries_to_merge": 1,
        "min_entries_to_merge_wait_minutes": 5,
        "check_response_timeout_minutes": 60
      }
    }
  ]
}
```

Rationale for the parameter choices (leave a short note in the PR body):

- `merge_method: MERGE` preserves the red-green-blue commit history on `main` so `release-please` keeps seeing your Conventional Commits. Do not switch to `SQUASH` without re-checking `release-please`.
- `grouping_strategy: ALLGREEN` only merges a batch if the whole group is green (safest).
- `required_approving_review_count: 0` matches a solo/agent workflow; raise later if collaborators join.

- [ ] **Step 2: Apply the ruleset to the repository**

Run:

```bash
cd ~/workspace/vernacular
gh api -X POST repos/drmrd/vernacular/rulesets \
  --input .github/rulesets/main-merge-queue.json \
  --jq '{id, name, enforcement}'
```

Expected: a JSON object echoing `name: "main protection and merge queue"` and `enforcement: "active"` with a numeric `id`. If it prints `id`, the rule is live.

(If you need to re-apply after edits, list rulesets with `gh api repos/drmrd/vernacular/rulesets --jq '.[] | {id,name}'`, then `gh api -X PUT repos/drmrd/vernacular/rulesets/<id> --input .github/rulesets/main-merge-queue.json`.)

- [ ] **Step 3: Verify branch protection now reports the required check**

Run: `gh api repos/drmrd/vernacular/rules/branches/main --jq '[.[].type]'`
Expected: an array containing `"pull_request"`, `"required_status_checks"`, and `"merge_queue"`.

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/vernacular
git add .github/rulesets/main-merge-queue.json
git commit -m "ci: version the main protection and merge-queue ruleset"
```

**Phase 1 done:** opening a PR now shows a required `ci-complete` check; merging goes through "Merge when ready," and the full suite runs on the `merge_group` event before fast-forwarding `main`.

---

## Phase 2: Selective unit gate on pull requests

### Task 2.1: The layer DAG and reverse-closure helpers

**Files:**

- Create: `scripts/ci/layers.mjs`
- Test: `scripts/ci/layers.test.mjs`

**Interfaces:**

- Produces:
  - `LAYERS: readonly string[]` — `['core','storage','engine','bridge','editor','app']`, lowest first.
  - `layerOf(file: string): string | null` — the layer a repo-relative path belongs to, or null.
  - `affectedLayers(changedLayers: Iterable<string>): string[]` — the lowest changed layer and every layer above it (a suffix of `LAYERS`), lowest first; `[]` when none.

- [ ] **Step 1: Write the failing test**

Create `scripts/ci/layers.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { affectedLayers, layerOf, LAYERS } from './layers.mjs'

describe('layerOf', () => {
  it('maps a path to its top-level layer', () => {
    expect(layerOf('engine/renderer/create-renderer.ts')).toBe('engine')
    expect(layerOf('core/index.ts')).toBe('core')
  })

  it('returns null for paths outside the layer stack', () => {
    expect(layerOf('scripts/ci/decide.mjs')).toBe(null)
    expect(layerOf('README.md')).toBe(null)
  })
})

describe('affectedLayers', () => {
  it('returns the changed layer and every layer above it', () => {
    expect(affectedLayers(['engine'])).toEqual(['engine', 'bridge', 'editor', 'app'])
    expect(affectedLayers(['editor'])).toEqual(['editor', 'app'])
  })

  it('a core change pulls in the whole stack', () => {
    expect(affectedLayers(['core'])).toEqual([...LAYERS])
  })

  it('unions multiple changed layers to the lowest suffix', () => {
    expect(affectedLayers(['app', 'storage'])).toEqual([
      'storage',
      'engine',
      'bridge',
      'editor',
      'app',
    ])
  })

  it('ignores unknown layers and returns empty for none', () => {
    expect(affectedLayers([])).toEqual([])
    expect(affectedLayers(['nonsense'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/layers.test.mjs`
Expected: FAIL with a module-not-found / cannot-resolve `./layers.mjs` error.

- [ ] **Step 3: Write the implementation**

Create `scripts/ci/layers.mjs`:

```js
// scripts/ci/layers.mjs
//
// Pure helpers describing the enforced layer DAG (see eslint.config.js
// `layerRules`) and the reverse-dependency closure that picks which layers'
// co-located unit tests a change can affect. No filesystem or process access.
// eslint-plugin-boundaries forbids upward imports, which is what makes the
// reverse closure sound at layer granularity.

/**
 * The layer stack in dependency order, lowest first. A layer may import only
 * from layers earlier in this list.
 * @type {readonly string[]}
 */
export const LAYERS = ['core', 'storage', 'engine', 'bridge', 'editor', 'app']

/**
 * Map a repo-relative file path to its layer, or null if it is not in a layer.
 *
 * @param {string} file
 * @returns {string | null}
 */
export function layerOf(file) {
  const top = file.split('/')[0]
  return LAYERS.includes(top) ? top : null
}

/**
 * Reverse-dependency closure: given the changed layers, return the lowest one
 * and every layer above it. Because the stack is a linear chain, that is a
 * suffix of LAYERS.
 *
 * @param {Iterable<string>} changedLayers
 * @returns {string[]} affected layers, lowest first (empty when none match)
 */
export function affectedLayers(changedLayers) {
  const indices = [...changedLayers]
    .map((layer) => LAYERS.indexOf(layer))
    .filter((index) => index !== -1)
  if (indices.length === 0) {
    return []
  }
  return LAYERS.slice(Math.min(...indices))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/layers.test.mjs`
Expected: PASS, 3 `describe` blocks, all assertions green.

- [ ] **Step 5: Commit**

```bash
cd ~/workspace/vernacular
git add scripts/ci/layers.test.mjs
git commit -m "test(ci): cover the layer DAG and reverse closure"
git add scripts/ci/layers.mjs
git commit -m "ci: add layer DAG and reverse-closure helpers"
```

---

### Task 2.2: The coupling map and `select-tests.mjs`

**Files:**

- Create: `ci-coupling.json`
- Create: `scripts/ci/select-tests.mjs`
- Test: `scripts/ci/select-tests.test.mjs`

**Interfaces:**

- Consumes: `layers.mjs` (`layerOf`, `affectedLayers`).
- Produces: `runSelectTests(argv: string[], deps): Promise<number>` where
  `deps = { runGit(args: string[]): string, readCoupling(): object, setOutput(name: string, value: string): void, log(line: string): void }`.
  It sets two outputs: `mode` (`all` | `some` | `none`) and `paths` (space-separated Vitest path filters such as `editor/ app/`).

- [ ] **Step 1: Create the coupling map `ci-coupling.json`**

```json
{
  "runAll": [
    "vite.config.ts",
    "vitest.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.node.json",
    "eslint.config.js",
    ".nvmrc"
  ],
  "runAllPrefixes": ["src/"],
  "edges": {
    "schema/": ["core"],
    "resources/": ["engine"]
  }
}
```

Notes: `runAllPrefixes` includes `src/` because `src` is outside the boundaries-tracked layers, so imports from `src` into a layer are not audited and could couple anywhere; rebuilding everything is the safe choice. `edges` add layers to the changed set before the reverse closure runs (so `schema/` -> `core` -> whole stack; `resources/` -> `engine` and above). This file is the single place to record a newly discovered coupling.

- [ ] **Step 2: Write the failing test**

Create `scripts/ci/select-tests.test.mjs`:

```js
import { describe, expect, it, vi } from 'vitest'
import { runSelectTests } from './select-tests.mjs'

const COUPLING = {
  runAll: ['vite.config.ts', 'package.json'],
  runAllPrefixes: ['src/'],
  edges: { 'schema/': ['core'], 'resources/': ['engine'] },
}

function deps(changedFiles) {
  const outputs = {}
  return {
    runGit: vi.fn(() => changedFiles.join('\n')),
    readCoupling: () => COUPLING,
    setOutput: (name, value) => {
      outputs[name] = value
    },
    log: vi.fn(),
    outputs,
  }
}

describe('runSelectTests', () => {
  it('selects the changed layer and everything above it', async () => {
    const d = deps(['editor/plan/plan-view.tsx'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('some')
    expect(d.outputs.paths).toBe('app/ editor/')
  })

  it('treats a runAll input as a full run', async () => {
    const d = deps(['package.json'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('all')
  })

  it('treats a runAllPrefixes match as a full run', async () => {
    const d = deps(['src/setupTests.ts'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('all')
  })

  it('expands edge prefixes before the closure (schema reaches core -> all)', async () => {
    const d = deps(['schema/project.schema.json'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.paths).toBe('app/ bridge/ core/ editor/ engine/ storage/')
  })

  it('includes changed non-layer test dirs (scripts, tests)', async () => {
    const d = deps(['scripts/pack/vernacular-pack.mjs'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('some')
    expect(d.outputs.paths).toBe('scripts/')
  })

  it('reports none when nothing test-bearing changed', async () => {
    const d = deps(['docs/plans/whatever.md'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('none')
    expect(d.outputs.paths).toBe('')
  })

  it('reports none for an empty diff', async () => {
    const d = deps([])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('none')
  })

  it('passes the base ref through to git', async () => {
    const d = deps(['core/index.ts'])
    await runSelectTests(['--base', 'origin/release'], d)
    expect(d.runGit.mock.calls[0][0].join(' ')).toContain('origin/release...HEAD')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/select-tests.test.mjs`
Expected: FAIL, cannot resolve `./select-tests.mjs`.

- [ ] **Step 4: Write the implementation**

Create `scripts/ci/select-tests.mjs`:

```js
#!/usr/bin/env node
// scripts/ci/select-tests.mjs
//
// select-tests CLI: from the files changed since the PR base, pick the Vitest
// path filters for the unit suite. Sound at layer granularity because
// eslint-plugin-boundaries forbids upward imports (see scripts/ci/layers.mjs);
// non-code couplings live in ci-coupling.json. Output modes:
//   all  -> run the whole unit suite (a global input changed)
//   some -> run `paths` only
//   none -> no unit-bearing files changed; the merge queue still runs all.
// Dependency-injected for tests; the shell at the bottom wires real deps.

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { affectedLayers, layerOf } from './layers.mjs'

const DEFAULT_BASE = 'origin/main'
const EXTRA_TEST_DIRS = ['tests', 'scripts']

/**
 * @typedef {object} SelectDeps
 * @property {(args: readonly string[]) => string} runGit
 * @property {() => { runAll?: string[], runAllPrefixes?: string[], edges?: Record<string, string[]> }} readCoupling
 * @property {(name: string, value: string) => void} setOutput
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} argv
 * @param {SelectDeps} deps
 * @returns {Promise<number>}
 */
export async function runSelectTests(argv, deps) {
  const { mode, paths } = select(argv, deps)
  deps.setOutput('mode', mode)
  deps.setOutput('paths', paths.join(' '))
  deps.log(`select-tests: mode=${mode}${paths.length > 0 ? ` paths=${paths.join(' ')}` : ''}`)
  return 0
}

/**
 * @param {readonly string[]} argv
 * @param {SelectDeps} deps
 * @returns {{ mode: 'all' | 'some' | 'none', paths: string[] }}
 */
function select(argv, deps) {
  const base = resolveBase(argv)
  const changed = changedFiles(deps.runGit, base)
  if (changed.length === 0) {
    return { mode: 'none', paths: [] }
  }
  const coupling = deps.readCoupling()
  if (changed.some((file) => isRunAll(file, coupling))) {
    return { mode: 'all', paths: [] }
  }
  const dirs = selectionDirs(changed, coupling)
  return dirs.length === 0 ? { mode: 'none', paths: [] } : { mode: 'some', paths: dirs }
}

/**
 * @param {string[]} changed
 * @param {{ edges?: Record<string, string[]> }} coupling
 * @returns {string[]} sorted, de-duplicated path filters
 */
function selectionDirs(changed, coupling) {
  const layers = new Set()
  for (const file of changed) {
    const layer = layerOf(file)
    if (layer !== null) {
      layers.add(layer)
    }
    for (const [prefix, added] of Object.entries(coupling.edges ?? {})) {
      if (file.startsWith(prefix)) {
        for (const extra of added) {
          layers.add(extra)
        }
      }
    }
  }
  const dirs = affectedLayers(layers).map((layer) => `${layer}/`)
  for (const dir of EXTRA_TEST_DIRS) {
    if (changed.some((file) => file.startsWith(`${dir}/`))) {
      dirs.push(`${dir}/`)
    }
  }
  return [...new Set(dirs)].sort()
}

/**
 * @param {string} file
 * @param {{ runAll?: string[], runAllPrefixes?: string[] }} coupling
 * @returns {boolean}
 */
function isRunAll(file, coupling) {
  if ((coupling.runAll ?? []).includes(file)) {
    return true
  }
  return (coupling.runAllPrefixes ?? []).some((prefix) => file.startsWith(prefix))
}

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function resolveBase(argv) {
  const flagIndex = argv.indexOf('--base')
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    return argv[flagIndex + 1]
  }
  return DEFAULT_BASE
}

/**
 * @param {(args: readonly string[]) => string} runGit
 * @param {string} base
 * @returns {string[]}
 */
function changedFiles(runGit, base) {
  const raw = runGit(['diff', '--name-only', `${base}...HEAD`])
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

// Run only when invoked directly, never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runSelectTests(process.argv.slice(2), {
    runGit: (args) => execFileSync('git', args, { encoding: 'utf8' }),
    readCoupling: () => JSON.parse(readFileSync('ci-coupling.json', 'utf8')),
    setOutput: (name, value) =>
      appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/stdout', `${name}=${value}\n`),
    log: (line) => console.log(line),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exit(2)
    })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/select-tests.test.mjs`
Expected: PASS, all 8 assertions green.

- [ ] **Step 6: Sanity-check against real history**

Run: `cd ~/workspace/vernacular && GITHUB_OUTPUT=/dev/stdout node scripts/ci/select-tests.mjs --base "$(git rev-parse HEAD~5)"`
Expected: a `mode=...` line and (if `some`) a `paths=...` line reflecting the layers touched in the last 5 commits. Confirm it never prints a layer _below_ a changed one.

- [ ] **Step 7: Commit**

```bash
cd ~/workspace/vernacular
git add ci-coupling.json scripts/ci/select-tests.test.mjs
git commit -m "test(ci): cover changed-file to unit-test selection"
git add scripts/ci/select-tests.mjs
git commit -m "ci: select unit-test layers from the PR diff"
```

---

### Task 2.3: Wire selection into the `check` job

**Files:**

- Modify: `.github/workflows/ci.yml` (the `check` job only)
- Modify: `package.json` (add `test:select`)

**Interfaces:**

- Consumes: `select-tests.mjs` outputs `mode` and `paths`.

- [ ] **Step 1: Add a convenience script to `package.json`**

In the `scripts` block, add after the existing `"test"` line:

```json
    "test:select": "node scripts/ci/select-tests.mjs",
```

- [ ] **Step 2: Replace the `check` job's `Test` step with selection-aware steps**

In `.github/workflows/ci.yml`, inside the `check` job, replace this single step:

```yaml
- name: Test
  run: pnpm test
```

with:

```yaml
- name: Select unit tests (pull requests)
  id: select
  if: github.event_name == 'pull_request'
  run: node scripts/ci/select-tests.mjs --base "origin/${{ github.base_ref }}"
- name: Unit tests (selected)
  if: github.event_name == 'pull_request' && steps.select.outputs.mode == 'some'
  run: pnpm exec vitest run --project unit ${{ steps.select.outputs.paths }}
- name: Unit tests (skipped note)
  if: github.event_name == 'pull_request' && steps.select.outputs.mode == 'none'
  run: echo "No unit-bearing layers changed; the full suite runs in the merge queue."
- name: Unit tests (full)
  if: github.event_name != 'pull_request' || steps.select.outputs.mode == 'all'
  run: pnpm test
```

Behavior matrix: merge_group/push -> full; PR + `all` -> full; PR + `some` -> selected; PR + `none` -> skipped. Over-selection (Vitest path filters are substring matches) only ever adds tests, never drops them.

- [ ] **Step 3: Validate YAML**

Run: `cd ~/workspace/vernacular && ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'yaml ok'"`
Expected: `yaml ok`

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/vernacular
git add package.json .github/workflows/ci.yml
git commit -m "ci: run only the affected unit-test layers on pull requests"
```

**Phase 2 done:** a PR touching only `editor/` runs `editor/ app/` unit tests instead of all 373 files; `core/` or config changes still run everything; the merge queue always runs the full suite.

---

## Phase 3: Gate the heavy suites with a decision job

### Task 3.1: `decide.mjs`

**Files:**

- Create: `scripts/ci/decide.mjs`
- Test: `scripts/ci/decide.test.mjs`

**Interfaces:**

- Produces: `runDecide(argv: string[], deps): Promise<number>` where
  `deps = { runGit(args): string, readLabels(): string[], readDraft(): boolean, event: string, setOutput(name, value): void, log(line): void }`.
  Sets outputs `e2e`, `visual`, `lighthouse` as the strings `"true"` / `"false"`.

- [ ] **Step 1: Write the failing test**

Create `scripts/ci/decide.test.mjs`:

```js
import { describe, expect, it, vi } from 'vitest'
import { runDecide } from './decide.mjs'

function deps({ event = 'pull_request', changed = [], labels = [], draft = false } = {}) {
  const outputs = {}
  return {
    runGit: vi.fn(() => changed.join('\n')),
    readLabels: () => labels,
    readDraft: () => draft,
    event,
    setOutput: (name, value) => {
      outputs[name] = value
    },
    log: vi.fn(),
    outputs,
  }
}

describe('runDecide', () => {
  it('runs everything in the merge queue', async () => {
    const d = deps({ event: 'merge_group' })
    await runDecide([], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('runs everything on push to main', async () => {
    const d = deps({ event: 'push' })
    await runDecide([], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('on a PR, runs e2e for runtime-layer changes but not lighthouse', async () => {
    const d = deps({ changed: ['engine/renderer/create-renderer.ts'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', lighthouse: 'false' })
  })

  it('on a PR, runs the visual suite for story and editor changes', async () => {
    const d = deps({ changed: ['editor/shell/toolbar.stories.tsx'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs.visual).toBe('true')
  })

  it('skips heavy suites for a docs-only PR', async () => {
    const d = deps({ changed: ['docs/plans/x.md'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false', lighthouse: 'false' })
  })

  it('skips heavy suites on a draft even when paths match', async () => {
    const d = deps({ changed: ['editor/plan/plan-view.tsx'], draft: true })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false' })
  })

  it('run:e2e overrides a draft', async () => {
    const d = deps({ changed: ['core/index.ts'], draft: true, labels: ['run:e2e'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs.e2e).toBe('true')
  })

  it('ci:full forces all suites', async () => {
    const d = deps({ changed: ['README.md'], labels: ['ci:full'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('ci:skip-heavy forces all heavy suites off', async () => {
    const d = deps({ changed: ['editor/plan/plan-view.tsx'], labels: ['ci:skip-heavy'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false', lighthouse: 'false' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/decide.test.mjs`
Expected: FAIL, cannot resolve `./decide.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/ci/decide.mjs`:

```js
#!/usr/bin/env node
// scripts/ci/decide.mjs
//
// decide CLI: choose which heavy suites (e2e, visual, lighthouse) a run needs.
// merge_group and push always get the full set, because the merge queue is the
// backstop that keeps main green. Pull requests get a selective answer from the
// changed paths, the PR draft state, and override labels (read live so a
// slash-command label takes effect on a re-run). Dependency-injected for tests.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_BASE = 'origin/main'
const E2E_PATHS = ['app/', 'editor/', 'bridge/', 'engine/', 'e2e/']
const VISUAL_PATHS = ['editor/', 'bridge/react/', '.storybook/']
const VISUAL_SUFFIX = '.stories.tsx'

/** @typedef {{ e2e: boolean, visual: boolean, lighthouse: boolean }} Decision */

/**
 * @typedef {object} DecideDeps
 * @property {(args: readonly string[]) => string} runGit
 * @property {() => string[]} readLabels
 * @property {() => boolean} readDraft
 * @property {string} event
 * @property {(name: string, value: string) => void} setOutput
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} argv
 * @param {DecideDeps} deps
 * @returns {Promise<number>}
 */
export async function runDecide(argv, deps) {
  const decision = decide(argv, deps)
  deps.setOutput('e2e', String(decision.e2e))
  deps.setOutput('visual', String(decision.visual))
  deps.setOutput('lighthouse', String(decision.lighthouse))
  deps.log(
    `decide: e2e=${decision.e2e} visual=${decision.visual} lighthouse=${decision.lighthouse}`,
  )
  return 0
}

/**
 * @param {readonly string[]} argv
 * @param {DecideDeps} deps
 * @returns {Decision}
 */
function decide(argv, deps) {
  if (deps.event !== 'pull_request') {
    return { e2e: true, visual: true, lighthouse: true }
  }
  const labels = deps.readLabels()
  if (labels.includes('ci:full')) {
    return { e2e: true, visual: true, lighthouse: true }
  }
  if (labels.includes('ci:skip-heavy')) {
    return { e2e: false, visual: false, lighthouse: false }
  }
  const changed = changedFiles(deps.runGit, resolveBase(argv))
  const active = !deps.readDraft()
  return {
    e2e: labels.includes('run:e2e') || (active && touchesAny(changed, E2E_PATHS)),
    visual: labels.includes('run:visual') || (active && touchesVisual(changed)),
    lighthouse: false,
  }
}

/**
 * @param {string[]} changed
 * @param {readonly string[]} prefixes
 * @returns {boolean}
 */
function touchesAny(changed, prefixes) {
  return changed.some((file) => prefixes.some((prefix) => file.startsWith(prefix)))
}

/**
 * @param {string[]} changed
 * @returns {boolean}
 */
function touchesVisual(changed) {
  return changed.some(
    (file) =>
      file.endsWith(VISUAL_SUFFIX) || VISUAL_PATHS.some((prefix) => file.startsWith(prefix)),
  )
}

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function resolveBase(argv) {
  const flagIndex = argv.indexOf('--base')
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    return argv[flagIndex + 1]
  }
  return DEFAULT_BASE
}

/**
 * @param {(args: readonly string[]) => string} runGit
 * @param {string} base
 * @returns {string[]}
 */
function changedFiles(runGit, base) {
  return runGit(['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  const repo = process.env.GITHUB_REPOSITORY ?? ''
  const prNumber = process.env.PR_NUMBER ?? ''
  const ghJson = (apiPath) => JSON.parse(execFileSync('gh', ['api', apiPath], { encoding: 'utf8' }))
  runDecide(process.argv.slice(2), {
    runGit: (args) => execFileSync('git', args, { encoding: 'utf8' }),
    readLabels: () =>
      prNumber === ''
        ? []
        : ghJson(`repos/${repo}/issues/${prNumber}`).labels.map((label) => label.name),
    readDraft: () =>
      prNumber === '' ? false : ghJson(`repos/${repo}/pulls/${prNumber}`).draft === true,
    event: process.env.GITHUB_EVENT_NAME ?? '',
    setOutput: (name, value) =>
      appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/stdout', `${name}=${value}\n`),
    log: (line) => console.log(line),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exit(2)
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/workspace/vernacular && pnpm exec vitest run scripts/ci/decide.test.mjs`
Expected: PASS, all 9 assertions green.

- [ ] **Step 5: Commit**

```bash
cd ~/workspace/vernacular
git add scripts/ci/decide.test.mjs
git commit -m "test(ci): cover heavy-suite decision logic"
git add scripts/ci/decide.mjs
git commit -m "ci: decide which heavy suites a run needs"
```

---

### Task 3.2: Create the CI labels and gate the heavy jobs

**Files:**

- Modify: `.github/workflows/ci.yml` (add `decide` job; gate `storybook-build`, `e2e`, `lighthouse`)

**Interfaces:**

- Consumes: `decide.mjs` outputs `e2e`, `visual`, `lighthouse`.

- [ ] **Step 1: Create the four CI labels**

Run:

```bash
gh label create run:e2e      -R drmrd/vernacular -c "1d76db" -d "CI: force the e2e suite on this PR"        --force
gh label create run:visual   -R drmrd/vernacular -c "1d76db" -d "CI: force the Storybook visual suite"      --force
gh label create ci:full      -R drmrd/vernacular -c "5319e7" -d "CI: run the full battery on this PR"       --force
gh label create ci:skip-heavy -R drmrd/vernacular -c "5319e7" -d "CI: gate-only; skip heavy suites"         --force
```

Expected: four `Label created.` (or `Label updated.`) lines.

- [ ] **Step 2: Add the `decide` job to `.github/workflows/ci.yml`**

Insert this job immediately after the `check` job and before `ping-pong`:

```yaml
decide:
  name: Decide heavy suites
  runs-on: ubuntu-latest
  outputs:
    e2e: ${{ steps.d.outputs.e2e }}
    visual: ${{ steps.d.outputs.visual }}
    lighthouse: ${{ steps.d.outputs.lighthouse }}
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Set up Node
      uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
    - name: Decide
      id: d
      env:
        GH_TOKEN: ${{ github.token }}
        GITHUB_EVENT_NAME: ${{ github.event_name }}
        GITHUB_REPOSITORY: ${{ github.repository }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
      run: node scripts/ci/decide.mjs --base "origin/${{ github.base_ref }}"
```

(`decide.mjs` uses only `node:` built-ins plus `git` and `gh`, so no `pnpm install` is needed; this job stays ~20s.)

- [ ] **Step 3: Gate the three heavy jobs on the decision**

In `.github/workflows/ci.yml`, change each job header as follows.

`storybook-build`: replace

```yaml
storybook-build:
  name: Storybook build and component tests
  runs-on: ubuntu-latest
  needs: check
```

with

```yaml
storybook-build:
  name: Storybook build and component tests
  runs-on: ubuntu-latest
  needs: [check, decide]
  if: needs.decide.outputs.visual == 'true'
```

`e2e`: replace

```yaml
e2e:
  name: End-to-end (chromium)
  runs-on: ubuntu-latest
  needs: check
```

with

```yaml
e2e:
  name: End-to-end (chromium)
  runs-on: ubuntu-latest
  needs: [check, decide]
  if: needs.decide.outputs.e2e == 'true'
```

`lighthouse`: replace

```yaml
lighthouse:
  name: Lighthouse CI
  if: github.event_name != 'pull_request'
  runs-on: ubuntu-latest
  needs: check
```

with

```yaml
lighthouse:
  name: Lighthouse CI
  runs-on: ubuntu-latest
  needs: [check, decide]
  if: needs.decide.outputs.lighthouse == 'true'
```

- [ ] **Step 4: Add `decide` to the aggregator's needs**

In the `ci-complete` job, change:

```yaml
needs: [check, ping-pong, storybook-build, e2e, lighthouse]
```

to:

```yaml
needs: [check, decide, ping-pong, storybook-build, e2e, lighthouse]
```

and add `"${{ needs.decide.result }}"` to the `for` loop's result list and the echo line.

- [ ] **Step 5: Validate YAML**

Run: `cd ~/workspace/vernacular && ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'yaml ok'"`
Expected: `yaml ok`

- [ ] **Step 6: Commit**

```bash
cd ~/workspace/vernacular
git add .github/workflows/ci.yml
git commit -m "ci: gate e2e, visual, and lighthouse suites on the decision job"
```

**Phase 3 done:** heavy suites run on a PR only when paths/labels warrant and the PR is non-draft; the merge queue still runs all three.

---

## Phase 4: Slash-command overrides

### Task 4.1: Permission-gated `issue_comment` handler

**Files:**

- Create: `.github/workflows/slash-command.yml`

**Interfaces:**

- Consumes: the labels created in Task 3.2 (`run:e2e`, `run:visual`, `ci:full`, `ci:skip-heavy`), which `decide.mjs` reads live.

- [ ] **Step 1: Create `.github/workflows/slash-command.yml`**

```yaml
name: Slash commands

on:
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  actions: write
  contents: read

jobs:
  command:
    name: Apply CI slash command
    if: ${{ github.event.issue.pull_request && startsWith(github.event.comment.body, '/') }}
    runs-on: ubuntu-latest
    steps:
      - name: Apply command
        uses: actions/github-script@v7
        with:
          script: |
            const association = context.payload.comment.author_association
            const allowed = ['OWNER', 'MEMBER', 'COLLABORATOR']
            const command = context.payload.comment.body.trim()
            const labelFor = {
              '/test e2e': 'run:e2e',
              '/test visual': 'run:visual',
              '/ci full': 'ci:full',
              '/ci skip-heavy': 'ci:skip-heavy',
            }
            const label = labelFor[command]
            if (label === undefined) { return }

            const react = (content) => github.rest.reactions.createForIssueComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: context.payload.comment.id,
              content,
            })

            if (!allowed.includes(association)) {
              await react('-1')
              core.info(`Ignoring command from association: ${association}`)
              return
            }
            await react('rocket')

            const prNumber = context.issue.number
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: prNumber,
              labels: [label],
            })

            const pr = await github.rest.pulls.get({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: prNumber,
            })
            const runs = await github.rest.actions.listWorkflowRunsForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              head_sha: pr.data.head.sha,
              event: 'pull_request',
              per_page: 20,
            })
            const ci = runs.data.workflow_runs.find((run) => run.name === 'CI')
            if (ci !== undefined) {
              await github.rest.actions.reRunWorkflow({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: ci.id,
              })
            }
```

Why this shape:

- `issue_comment` workflows always run from the **default branch** copy of this file with the repo's `GITHUB_TOKEN`, so PR-authored code never influences this job (safe by construction; no `pull_request_target`, no untrusted checkout).
- Permission is gated on `author_association` (`OWNER`/`MEMBER`/`COLLABORATOR`); other commenters get a thumbs-down and nothing runs.
- The command only **adds a label** and **re-runs the latest CI run**. Because `decide.mjs` reads labels live (Task 3.1), the re-run picks up the new label. Labels stay the single source of truth, so there is no second triggering path to keep in sync. This is the override/escape-hatch pattern, not a replacement for the deterministic `decide` job.

- [ ] **Step 2: Validate YAML and the embedded script**

Run: `cd ~/workspace/vernacular && ruby -ryaml -e "YAML.load_file('.github/workflows/slash-command.yml'); puts 'yaml ok'"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
cd ~/workspace/vernacular
git add .github/workflows/slash-command.yml
git commit -m "ci: add permission-gated slash-command overrides"
```

- [ ] **Step 4: Live smoke test (manual, after the PR carrying this plan is open)**

On a test PR, comment `/test e2e`. Expected: a rocket reaction within ~30s, a `run:e2e` label appears, and a fresh CI run starts whose `e2e` job is no longer skipped. Comment from a non-collaborator account (or simulate by temporarily narrowing `allowed`) and confirm a thumbs-down with no run.

**Phase 4 done:** you can force any suite from a PR comment without editing YAML or bypassing the gate.

---

## Self-Review

**1. Spec coverage:**

- "Reliably decide when heavy suites run" -> Phase 3 (`decide.mjs` + gates). Covered.
- "Analyze changes -> which unit/integration tests run" -> Phase 2 (`select-tests.mjs` + layer closure). Unit tests = layer selection; integration/e2e = Phase 3 path gating; full suite always in the queue. Covered.
- "Custom rules for non-obvious couplings" -> `ci-coupling.json` (`runAll`, `runAllPrefixes`, `edges`). Covered.
- "Merge queue" -> Phase 1 (`merge_group` + ruleset). Covered.
- "Slash commands for on-demand tests, permission-gated" -> Phase 4. Covered.
- Branch protection gap (CI being ignored) -> Phase 1 Task 1.2. Covered.

**2. Placeholder scan:** No `TODO`/`TBD`/"add error handling"/"similar to". Every code step shows complete, runnable code; every command has an expected result.

**3. Type/name consistency:**

- `select-tests.mjs` outputs `mode`/`paths`; consumed by ci.yml `steps.select.outputs.mode`/`paths`. Match.
- `decide.mjs` outputs `e2e`/`visual`/`lighthouse`; consumed by `needs.decide.outputs.*`. Match.
- `layers.mjs` exports `LAYERS`/`layerOf`/`affectedLayers`; imported by `select-tests.mjs` and its test. Match.
- Required check context `ci-complete` is the job `name` in ci.yml and the `context` in the ruleset. Match.
- Labels `run:e2e`/`run:visual`/`ci:full`/`ci:skip-heavy` are created in 3.2, read in `decide.mjs`, and written in `slash-command.yml`. Match.

## Risks & rollback

- **Merge-queue double-runs.** If `ci-complete` is mistakenly produced only on `pull_request`, the queue will block. Mitigation: ci.yml triggers on `merge_group`, and `ci-complete` runs `if: always()` on both. Rollback: delete the ruleset (`gh api -X DELETE repos/drmrd/vernacular/rulesets/<id>`).
- **Under-selection.** Guarded by the safety bias (over-select), the enforced boundaries, and the full suite in the queue. If a real miss is found, add an `edges`/`runAll` entry to `ci-coupling.json` (one-line fix, no code).
- **Flaky heavy tests in the queue** can block merges for everyone. Stabilize visual/e2e baselines before relying on the queue; Playwright `retries: 2` already helps.
- **Phase independence:** Phases 2-4 each leave CI green on their own. If a phase misbehaves, revert its commits without touching the others.

## Expected outcome

- PR runs drop from ~11 billable min toward ~2-7 min depending on blast radius (selected unit gate + skipped heavy suites + skipped Lighthouse).
- The full battery runs once per merge-queue group rather than once per intermediate push.
- Net: well under the 3,000-min Pro allotment at the current throughput, with the merge queue absorbing bursts. If usage is still tight, this pairs with the (separately pinned) self-hosted-runner decision to remove the ceiling entirely.
