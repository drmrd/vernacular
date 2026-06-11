# Journey Test Harness and Integration Acceptance Gate Implementation Plan

> **For agentic workers:** This plan is executed with the project's red-green-blue (RGB) TDD discipline where it touches testable logic, and with the project's infrastructure-commit convention where it touches tooling, end-to-end tests, and continuous-integration wiring. The orchestrator dispatches the role-separated subagents from the main thread: `/test-first` (test-author, RED), `/implement` (implementer, GREEN), `/clean-code-review` then `/refactor` (BLUE). This slice is almost entirely infrastructure and end-to-end coverage, which the rgb:audit exempts (commits carrying an `Infrastructure:` trailer, and `test(e2e):` commits, are exempt from the test-then-feat-then-refactor sequence; see `.claude/rules.md` rule 14 and the rgb:audit commit-sequence rules). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a journey-test layer that drives the real assembled editor through user flows, a machine-readable coverage matrix mapping each user-facing capability to the journey test that proves it, and a required integration-acceptance gate (a vitest-tested audit script plus continuous-integration wiring) so that no later makeover slice can be considered done until a journey test proves its capability is reachable from the composed application.

**Architecture:** Three pieces. First, a journey-test harness: a `e2e/tests/journeys/` directory with a shared `support.ts` that centralizes the app selectors and the common flows (boot the editor, draw a wall, read the wall count), plus a first journey spec that characterizes the existing draw-a-wall flow and proves the harness. Second, a coverage matrix: `e2e/journey-coverage.json` listing every makeover capability with an `id`, the exact journey test `title` that proves it, and a `status` of `required` or `pending`, alongside a human-readable `e2e/JOURNEYS.md`. Third, the gate: a dependency-injected `scripts/integration-audit/integration-audit.mjs` (mirroring `scripts/rgb-audit/`) that fails when any `required` capability has no matching journey test, wired into the `check` continuous-integration job and exposed as `pnpm integration:audit`; the journey specs themselves run in the existing `e2e` job because they live under `e2e/tests/`.

**Tech Stack:** Playwright (the existing `playwright.config.ts`, chromium project, preview server on port 4173), Vitest for the audit-script unit tests (matching `scripts/rgb-audit/rgb-audit.test.mjs`), Node ES modules with dependency injection for the audit CLI, and the existing `.github/workflows/ci.yml`. No new runtime or development dependencies (the dependency cooldown and exact-pin rules forbid adding any).

---

## Relationship to the design specification (read before starting)

This is slice 1 of the editor experience makeover, `docs/specs/2026-06-10-editor-experience-makeover.md`. The spec's "Testing strategy and the integration-acceptance gate" section is the contract: journey tests over the real wired application, shell integration tests asserting surfaces are mounted and dispatch-wired, a living coverage matrix, and a required integration-acceptance gate analogous to the existing rgb:audit. This slice delivers the harness, the matrix, and the gate, and seeds the matrix with every later capability marked `pending` so that each subsequent slice flips its own capability to `required` in the same change that adds its journey test. The root cause this addresses: the parallel tracks landed unit-green in isolation and were never exercised in the assembled application.

## Scope and boundaries

### In scope (this slice)

1. A journey-test directory and shared support helpers under `e2e/tests/journeys/`.
2. A first journey spec characterizing the existing draw-a-wall flow, proving the harness end to end.
3. The machine-readable coverage matrix `e2e/journey-coverage.json` and the human-readable `e2e/JOURNEYS.md`, seeded with the full makeover capability list (`draw-wall` marked `required` and covered; the rest `pending`).
4. The integration-acceptance audit: a dependency-injected `runIntegrationAudit` core, vitest unit tests, a thin CLI wiring the real filesystem, and a `pnpm integration:audit` script.
5. Continuous-integration wiring: the audit added to the `check` job (the journey specs already run in the `e2e` job).
6. An Architecture Decision Record for the integration-acceptance gate.

### Explicitly NOT in this slice

- Any new product behavior, shell change, or visual change. The shell stays exactly as it is on the branch base; this slice only adds tests, a matrix, a script, and continuous-integration wiring.
- The shell integration tests (React Testing Library) that assert each surface is mounted and dispatch-wired. Those land with the slices that mount the surfaces (paint and metadata wiring), so the test and the wiring arrive together. The matrix tracks them as `pending` capabilities here.
- Journey tests for any not-yet-built flow (undo, delete, floor switching, paint, the two- and three-dimensional toggle, endpoint editing, along-wall snapping). Each lands with its own slice. They appear in the matrix as `pending`.

### Hard invariants this slice must hold

- Conventional Commits, no `Co-Authored-By` trailers, no em-dashes in any prose or comment, descriptive English names with no milestone or phase codes, no third-party or commercial product names anywhere.
- The audit core is pure and dependency-injected (no direct filesystem or `process` access inside `runIntegrationAudit`), so it is unit-testable exactly like `runRgbAudit`.
- The journey support helpers centralize every app selector in one module, so that when later slices restyle the shell, only `support.ts` changes rather than every journey spec.
- No new dependency (cooldown and exact-pin rules).

## Decisions I made / open questions

These resolve the genuine forks so the slice can proceed autonomously. Each is a best-practice default; revisit only if a later cycle contradicts it.

1. **The whole slice lands as infrastructure and end-to-end commits, exempt from the rgb:audit sequence.** It contains no product-domain behavior, so the audit-script work lands as `build:` commits carrying an `Infrastructure:` trailer, the journey harness lands as `test(e2e):` commits, and the Architecture Decision Record lands as `docs:`. All three are exempt from the test-then-feat-then-refactor triple, which is correct for a tooling-and-coverage slice. The audit-script logic is still written test-first.

2. **The matrix is the single source of truth and keys capabilities to exact test titles.** A capability carries `{ id, title, status }`, where `title` is the exact Playwright test title that proves it. The audit treats a capability as covered when a journey test with that exact title exists. This is the same static-analysis posture as rgb:audit (it inspects the repository, it does not run the browser); the journey suite running in the `e2e` job is what actually exercises the flows.

3. **`pending` capabilities are tracked but not enforced.** The audit fails only on a `required` capability with no matching test, so seeding the full makeover capability list does not turn the build red on day one. Each later slice flips exactly its own capability from `pending` to `required` in the same change that adds the journey test, which is the gate doing its job: a slice cannot mark its capability done without a passing journey test.

4. **The first journey test characterizes existing, working behavior.** The draw-a-wall flow already works, so this journey passes immediately; it exists to prove the harness and the selectors and to seed the matrix's one `required` row. It is not a red-first test.

5. **The audit runs in `check`; the journeys run in `e2e`.** The static matrix audit is fast and has no browser dependency, so it belongs in the `check` job beside typecheck and lint. The journey specs live under `e2e/tests/` and therefore already run in the existing `e2e` job with no workflow change beyond the audit step.

## File structure

### New files

- `e2e/tests/journeys/support.ts`: the shared journey helpers and the centralized app selectors.
- `e2e/tests/journeys/draw-wall.spec.ts`: the first journey, characterizing the draw-a-wall flow.
- `e2e/journey-coverage.json`: the machine-readable coverage matrix.
- `e2e/JOURNEYS.md`: the human-readable matrix and an explanation of the gate.
- `scripts/integration-audit/integration-audit.mjs`: the dependency-injected audit core plus the CLI.
- `scripts/integration-audit/integration-audit.test.mjs`: the vitest unit tests for the audit core.
- `docs/knowledge/decisions/ADR-0049-integration-acceptance-gate.md`: the decision record.

### Modified files

- `package.json`: add the `integration:audit` script.
- `.github/workflows/ci.yml`: add the audit step to the `check` job.

---

## Task 1: Journey harness and the first journey

**Files:**

- Create: `e2e/tests/journeys/support.ts`
- Create: `e2e/tests/journeys/draw-wall.spec.ts`

- [ ] **Step 1: Write the shared support helpers**

`e2e/tests/journeys/support.ts`:

```ts
import { expect, type Page } from '@playwright/test'

// Every app selector the journeys depend on lives here, so that when a later
// makeover slice restyles the shell only this module changes, not each spec.
export const selectors = {
  planCanvas: (page: Page) => page.getByLabel('Floor plan'),
  wallCount: (page: Page, count: number) => page.getByText(`Walls: ${count}`),
  savedStatus: (page: Page) => page.getByText('All changes saved'),
  tool: (page: Page, name: string) => page.getByRole('button', { name }),
}

// Boot the assembled editor at its root and wait for the plan canvas.
export async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(selectors.planCanvas(page)).toBeVisible()
}

// Draw a single straight wall by clicking a start and an end point on the plan.
export async function drawWall(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
}

// Assert the shell reports the given number of walls.
export async function expectWallCount(page: Page, count: number): Promise<void> {
  await expect(selectors.wallCount(page, count)).toBeVisible()
}
```

- [ ] **Step 2: Write the first journey spec**

`e2e/tests/journeys/draw-wall.spec.ts`:

```ts
import { test } from '@playwright/test'
import { drawWall, expectWallCount, gotoEditor } from './support'

test.describe('Journey: draw a wall', () => {
  test('draws a wall and shows it on the plan', async ({ page }) => {
    await gotoEditor(page)
    await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
    await expectWallCount(page, 1)
  })
})
```

- [ ] **Step 3: Run the journey to verify it passes**

Run: `pnpm build && pnpm exec playwright test --project=chromium e2e/tests/journeys/draw-wall.spec.ts`
Expected: PASS (the draw-a-wall flow already works; this proves the harness).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/journeys/support.ts e2e/tests/journeys/draw-wall.spec.ts
git commit -m "test(e2e): add the journey harness and the draw-a-wall journey"
```

---

## Task 2: The coverage matrix

**Files:**

- Create: `e2e/journey-coverage.json`
- Create: `e2e/JOURNEYS.md`

- [ ] **Step 1: Write the machine-readable matrix**

`e2e/journey-coverage.json`. The `draw-wall` row is `required` and covered; every other makeover capability is `pending` and flips to `required` in the slice that adds its journey test.

```json
{
  "capabilities": [
    { "id": "draw-wall", "title": "draws a wall and shows it on the plan", "status": "required" },
    {
      "id": "cancel-wall",
      "title": "cancels a half-drawn wall with the cancel key",
      "status": "pending"
    },
    { "id": "undo-redo", "title": "undoes and redoes a wall", "status": "pending" },
    { "id": "delete-selection", "title": "deletes the selected entities", "status": "pending" },
    {
      "id": "switch-floor",
      "title": "switches floors and the canvas changes",
      "status": "pending"
    },
    { "id": "edit-color", "title": "edits a surface color and it applies", "status": "pending" },
    {
      "id": "toggle-three-d",
      "title": "toggles between the two- and three-dimensional views",
      "status": "pending"
    },
    {
      "id": "edit-endpoint",
      "title": "re-edits a wall endpoint after placement",
      "status": "pending"
    },
    {
      "id": "snap-along-wall",
      "title": "snaps a new wall onto an existing wall",
      "status": "pending"
    },
    {
      "id": "opening-host-guard",
      "title": "a wall cannot host on an opening",
      "status": "pending"
    },
    { "id": "donut-room", "title": "derives a room with an interior void", "status": "pending" }
  ]
}
```

- [ ] **Step 2: Write the human-readable matrix and gate explanation**

`e2e/JOURNEYS.md`:

```markdown
# Journey coverage

Each user-facing capability of the editor has a journey test that drives the real
assembled application and proves the capability is reachable. The machine-readable
source of truth is `journey-coverage.json`; this file is its readable view.

A capability is `required` once its slice has landed: the integration-acceptance
gate (`pnpm integration:audit`) fails if a `required` capability has no journey
test with the listed title. A `pending` capability is tracked but not yet
enforced; the slice that builds it flips it to `required` in the same change that
adds the journey test.

| Capability         | Journey test title                                   | Status   |
| ------------------ | ---------------------------------------------------- | -------- |
| draw-wall          | draws a wall and shows it on the plan                | required |
| cancel-wall        | cancels a half-drawn wall with the cancel key        | pending  |
| undo-redo          | undoes and redoes a wall                             | pending  |
| delete-selection   | deletes the selected entities                        | pending  |
| switch-floor       | switches floors and the canvas changes               | pending  |
| edit-color         | edits a surface color and it applies                 | pending  |
| toggle-three-d     | toggles between the two- and three-dimensional views | pending  |
| edit-endpoint      | re-edits a wall endpoint after placement             | pending  |
| snap-along-wall    | snaps a new wall onto an existing wall               | pending  |
| opening-host-guard | a wall cannot host on an opening                     | pending  |
| donut-room         | derives a room with an interior void                 | pending  |
```

- [ ] **Step 3: Commit**

```bash
git add e2e/journey-coverage.json e2e/JOURNEYS.md
git commit -m "build: add the journey coverage matrix" -m "Infrastructure: journey coverage matrix"
```

---

## Task 3: The audit core, clean case

**Files:**

- Create: `scripts/integration-audit/integration-audit.test.mjs`
- Create: `scripts/integration-audit/integration-audit.mjs`

- [ ] **Step 1: Write the failing test**

`scripts/integration-audit/integration-audit.test.mjs`:

```js
import { describe, expect, it, vi } from 'vitest'
import { runIntegrationAudit } from './integration-audit.mjs'

function deps({ capabilities, titles }) {
  return {
    readMatrix: async () => ({ capabilities }),
    readJourneyTitles: async () => titles,
    log: vi.fn(),
  }
}

describe('runIntegrationAudit', () => {
  it('reports clean when every required capability has a journey test', async () => {
    const d = deps({
      capabilities: [
        { id: 'draw-wall', title: 'draws a wall and shows it on the plan', status: 'required' },
      ],
      titles: ['draws a wall and shows it on the plan'],
    })
    const code = await runIntegrationAudit([], d)
    expect(code).toBe(0)
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('clean'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/integration-audit/integration-audit.test.mjs`
Expected: FAIL (cannot resolve `./integration-audit.mjs`).

- [ ] **Step 3: Write the minimal audit core plus CLI shell**

`scripts/integration-audit/integration-audit.mjs`:

```js
#!/usr/bin/env node
// scripts/integration-audit/integration-audit.mjs
//
// integration-audit CLI: verify that every capability the journey coverage
// matrix marks "required" has a matching journey test, so a feature cannot be
// considered done until a test proves it is reachable from the assembled editor.
// The dependency-injected core takes the parsed matrix and the journey test
// titles; the CLI at the bottom wires the real filesystem. Exit code 0 means
// clean; 1 means at least one required capability is missing its test.

const EXIT_CLEAN = 0
const EXIT_VIOLATIONS = 1

/**
 * @typedef {object} Capability
 * @property {string} id
 * @property {string} title the exact journey test title that proves it
 * @property {'required' | 'pending'} status
 */

/**
 * @typedef {object} IntegrationAuditDeps
 * @property {() => Promise<{ capabilities: Capability[] }>} readMatrix
 * @property {() => Promise<string[]>} readJourneyTitles
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} _argv
 * @param {IntegrationAuditDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runIntegrationAudit(_argv, { readMatrix, readJourneyTitles, log }) {
  const { capabilities } = await readMatrix()
  const titles = new Set(await readJourneyTitles())
  const required = capabilities.filter((capability) => capability.status === 'required')
  const pending = capabilities.filter((capability) => capability.status === 'pending')
  const missing = required.filter((capability) => !titles.has(capability.title))

  if (missing.length === 0) {
    log(
      `integration-audit: clean. ${required.length} required capabilities covered, ${pending.length} pending.`,
    )
    return EXIT_CLEAN
  }
  log(`integration-audit: ${missing.length} required capability(ies) missing a journey test:`)
  for (const capability of missing) {
    log(`  - ${capability.id}: no journey test titled "${capability.title}"`)
  }
  return EXIT_VIOLATIONS
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/integration-audit/integration-audit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/integration-audit/integration-audit.test.mjs scripts/integration-audit/integration-audit.mjs
git commit -m "build: add the integration-acceptance audit core" -m "Infrastructure: integration acceptance gate"
```

---

## Task 4: The audit core, missing-coverage case

**Files:**

- Modify: `scripts/integration-audit/integration-audit.test.mjs`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block in `scripts/integration-audit/integration-audit.test.mjs`:

```js
it('fails when a required capability lacks a journey test', async () => {
  const d = deps({
    capabilities: [{ id: 'undo-redo', title: 'undoes and redoes a wall', status: 'required' }],
    titles: [],
  })
  const code = await runIntegrationAudit([], d)
  expect(code).toBe(1)
  expect(d.log).toHaveBeenCalledWith(expect.stringContaining('undo-redo'))
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/integration-audit/integration-audit.test.mjs`
Expected: PASS (the Task 3 implementation already returns the violation exit code and logs the id). This test pins the behavior so a later refactor cannot regress it.

- [ ] **Step 3: Commit**

```bash
git add scripts/integration-audit/integration-audit.test.mjs
git commit -m "build: pin the missing-coverage audit verdict" -m "Infrastructure: integration acceptance gate"
```

---

## Task 5: The audit core, pending case

**Files:**

- Modify: `scripts/integration-audit/integration-audit.test.mjs`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```js
it('ignores pending capabilities', async () => {
  const d = deps({
    capabilities: [
      { id: 'edit-color', title: 'edits a surface color and it applies', status: 'pending' },
    ],
    titles: [],
  })
  const code = await runIntegrationAudit([], d)
  expect(code).toBe(0)
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/integration-audit/integration-audit.test.mjs`
Expected: PASS (a pending capability is never in the `required` set, so it cannot be missing).

- [ ] **Step 3: Commit**

```bash
git add scripts/integration-audit/integration-audit.test.mjs
git commit -m "build: pin that pending capabilities are not enforced" -m "Infrastructure: integration acceptance gate"
```

---

## Task 6: The audit CLI wiring and the package script

**Files:**

- Modify: `scripts/integration-audit/integration-audit.mjs`
- Modify: `package.json`

- [ ] **Step 1: Append the CLI to the audit module**

Add to the bottom of `scripts/integration-audit/integration-audit.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MATRIX_PATH = 'e2e/journey-coverage.json'
const JOURNEYS_DIR = 'e2e/tests/journeys'
const TEST_TITLE = /\btest\s*\(\s*(['"`])([^'"`]+)\1/g

// Collect every Playwright test title declared under the journeys directory.
async function realJourneyTitles() {
  const entries = await readdir(JOURNEYS_DIR)
  const specs = entries.filter((name) => name.endsWith('.spec.ts'))
  const titles = []
  for (const spec of specs) {
    const source = await readFile(path.join(JOURNEYS_DIR, spec), 'utf8')
    for (const match of source.matchAll(TEST_TITLE)) {
      titles.push(match[2])
    }
  }
  return titles
}

async function realMatrix() {
  return JSON.parse(await readFile(MATRIX_PATH, 'utf8'))
}

// Run the audit against the real filesystem when invoked as a CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIntegrationAudit(process.argv.slice(2), {
    readMatrix: realMatrix,
    readJourneyTitles: realJourneyTitles,
    log: (line) => console.log(line),
  })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error)
      process.exit(2)
    })
}
```

- [ ] **Step 2: Add the package script**

Modify `package.json` scripts, adding after the `rgb:audit` entry:

```json
    "integration:audit": "node scripts/integration-audit/integration-audit.mjs",
```

- [ ] **Step 3: Run the audit end to end against the real repository**

Run: `pnpm integration:audit`
Expected: prints `integration-audit: clean. 1 required capabilities covered, 10 pending.` and exits 0.

- [ ] **Step 4: Verify the gate bites (manual check, do not commit the change)**

Temporarily flip `undo-redo` to `"status": "required"` in `e2e/journey-coverage.json`, run `pnpm integration:audit`, and confirm it exits non-zero and names `undo-redo`. Then revert the change.

Run: `pnpm integration:audit; echo "exit: $?"`
Expected after the temporary flip: a non-zero exit naming `undo-redo`. After reverting: clean, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/integration-audit/integration-audit.mjs package.json
git commit -m "build: wire the integration-audit CLI and the package script" -m "Infrastructure: integration acceptance gate"
```

---

## Task 7: Continuous-integration wiring

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the audit step to the check job**

In `.github/workflows/ci.yml`, add a step to the `check` job immediately after the `Test` step (the journey specs themselves already run in the existing `e2e` job because they live under `e2e/tests/`):

```yaml
- name: Integration-acceptance audit
  run: pnpm integration:audit
```

- [ ] **Step 2: Verify the workflow is well formed**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!f.includes('Integration-acceptance audit')) throw new Error('audit step missing'); console.log('audit step present')"`
Expected: prints `audit step present`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "build: run the integration-acceptance audit in continuous integration" -m "Infrastructure: integration acceptance gate"
```

---

## Task 8: Architecture Decision Record

**Files:**

- Create: `docs/knowledge/decisions/ADR-0049-integration-acceptance-gate.md`

- [ ] **Step 1: Write the decision record**

`docs/knowledge/decisions/ADR-0049-integration-acceptance-gate.md`. Cover: the context (the parallel tracks landed unit-green in isolation and were never exercised in the assembled application, so finished surfaces shipped mounted nowhere); the decision (a journey-test layer over the real application, a coverage matrix keyed to exact test titles, and a required audit that fails when a `required` capability lacks its journey test, run in the `check` job, with the journeys running in the `e2e` job); the `pending`-to-`required` flip protocol that makes each later slice prove its capability; the relationship to the rgb:audit (a sibling static gate, the rgb:audit governing commit cadence and this one governing reachability); and the consequences (a feature is not done at unit-green, which is the durable fix for the built-but-unwired failure mode). Reference the makeover spec and ADR-0044. Use the frontmatter shape of a recent record such as `ADR-0048`, set `status: current`, and keep the prose free of em-dashes and product names.

- [ ] **Step 2: Regenerate the local knowledge index (optional, non-gating)**

Run: `pnpm knowledge:index`
Expected: regenerates the gitignored local index; nothing to commit.

- [ ] **Step 3: Commit**

```bash
git add docs/knowledge/decisions/ADR-0049-integration-acceptance-gate.md
git commit -m "docs: record the integration-acceptance gate (ADR-0049)"
```

---

## Final verification

- [ ] **Step 1: Run the full local check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm integration:audit`
Expected: all pass; the audit prints the clean line.

- [ ] **Step 2: Run the journey suite**

Run: `pnpm exec playwright test --project=chromium e2e/tests/journeys`
Expected: the draw-a-wall journey passes.

- [ ] **Step 3: Audit the commit cadence for this slice**

Run: `pnpm rgb:audit --range "origin/main..HEAD"`
Expected: clean. Every commit in this slice carries either an `Infrastructure:` trailer, a `test(e2e)` type, or a `docs:` type, all of which the audit exempts.

---

## Self-review

- **Spec coverage:** the spec's testing section names journey tests over the real application (Task 1), a living coverage matrix (Task 2), a required integration-acceptance gate (Tasks 3 through 7), and the recurrence-prevention rationale (Task 8). The shell integration tests are deferred by design to the slices that mount the surfaces, and the matrix tracks them.
- **Placeholder scan:** every step carries the actual file content, command, and expected output.
- **Type and name consistency:** `runIntegrationAudit(argv, deps)`, the `readMatrix` / `readJourneyTitles` / `log` dependency names, the `{ id, title, status }` capability shape, and the exact capability titles match between the matrix (Task 2), the tests (Tasks 3 through 5), the core (Task 3), and the CLI (Task 6). The first journey test title `draws a wall and shows it on the plan` matches the `draw-wall` capability row.
