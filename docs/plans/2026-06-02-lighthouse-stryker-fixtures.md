# Vernacular: Lighthouse CI, Stryker, fixtures, and factories scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the remaining foundation-tier testing scaffolds called out by the design spec's section 9 test pyramid (Lighthouse CI for performance and accessibility regression tracking, Stryker for weekly mutation testing on `core/`, plus the `tests/fixtures/` and `tests/factories/` directory scaffolds) without introducing any application source code.

**Architecture:** Lighthouse CI runs against the Vite production preview (`pnpm preview` on port 4173, matching the Playwright webServer port) so performance numbers reflect the production bundle. Configuration lives at `lighthouserc.json` with category-level assertions tuned for a stub-app baseline. Stryker mutation testing uses the Vitest runner against `core/**/*.ts`. Because `core/` is not yet populated, the Stryker workflow short-circuits cleanly when the target directory is empty; the scaffold activates the moment source lands. Stryker runs on a weekly schedule in its own workflow (`.github/workflows/mutation.yml`), not on every PR. Fixtures and factories are directory scaffolds with README placeholders; concrete factories (`makeWall`, `makeProject`) are deferred to the layer that introduces the underlying types.

**Tech Stack:** `@lhci/cli` for the Lighthouse runner and assertions; `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, and `@stryker-mutator/typescript-checker` for mutation testing. Both packages must clear the 15-day cooldown (`.npmrc` `minimum-release-age=21600`). If a transitive blocks install and is not already in the ADR-0013 exclusion list, STOP and report; do not expand the exclusion list as part of this plan.

**Scope boundary:** This plan does NOT introduce source code in `core/`, `engine/`, or any other layer. It does NOT scaffold the Three.js performance benchmark harness in `engine/profiling/` (deferred until the engine layer arrives). It does NOT define concrete factory functions such as `makeWall` or `makeProject` (those require the `core/` domain types). It does NOT change existing Storybook, Playwright, or axe-core setup. It does NOT activate Stryker on every PR (per spec the cadence is weekly on main). It does NOT change the existing Vitest unit-test surface beyond confirming the new `tests/factories/` directory does not pollute Vitest's include glob.

---

## File structure

| File                                                               | Purpose                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `lighthouserc.json`                                                | Lighthouse CI config: collect, assert, upload settings                                             |
| `stryker.conf.json`                                                | Stryker config: vitest runner, core/ target, reporters, thresholds                                 |
| `tests/fixtures/README.md`                                         | Explains the fixtures tree purpose and structure                                                   |
| `tests/fixtures/projects/README.md`                                | Placeholder for reusable project JSONs                                                             |
| `tests/fixtures/assets/README.md`                                  | Placeholder for license-tagged CC0 test assets                                                     |
| `tests/fixtures/registries/README.md`                              | Placeholder for frozen registry versions used in migration testing                                 |
| `tests/factories/README.md`                                        | Explains the factory pattern; lists future `makeWall`, `makeProject` factories                     |
| `package.json`                                                     | New devDeps; new scripts: `lhci`, `lhci:autorun`, `mutate`, `mutate:check`                         |
| `pnpm-lock.yaml`                                                   | Updated lockfile                                                                                   |
| `.gitignore`                                                       | Ignore `.lighthouseci/`, `reports/stryker/`, `.stryker-tmp/`                                       |
| `.prettierignore`                                                  | Same Lighthouse and Stryker output paths                                                           |
| `eslint.config.js`                                                 | Add ignores for new output directories                                                             |
| `vite.config.ts`                                                   | Confirm Vitest exclude list still keeps `tests/factories/` out (no change needed if patterns hold) |
| `.github/workflows/ci.yml`                                         | Add `lighthouse` job that runs on push to main and on tag pushes                                   |
| `.github/workflows/mutation.yml`                                   | New workflow: weekly Stryker run on main with `core/` guard                                        |
| `CONTRIBUTING.md`                                                  | Add Lighthouse CI and Stryker sections; extend the PR checklist                                    |
| `docs/knowledge/decisions/ADR-0016-lighthouse-stryker-fixtures.md` | ADR documenting the Lighthouse, Stryker, and fixtures choices                                      |
| `ROADMAP.md`                                                       | Move the in-progress marker to the Lighthouse CI / Stryker / fixtures row                          |
| `.superpowers/scratch/progress.md`                                 | Best-effort scratchpad update (gitignored)                                                         |

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1: Confirm the working directory, branch, and clean state**

```
pwd
git branch --show-current
git status --short
```

Expected: directory is `/Users/dan/workspace/vernacular`, branch is `feat/lighthouse-stryker-fixtures`, working tree is clean. If anything differs, STOP and report BLOCKED with what was found.

- [ ] **Step 2: Confirm prior milestone shipped**

```
git log --oneline -1 main
```

Expected: the latest main commit is the Storybook + Playwright + axe + visual regression merge (subject begins with `Merge pull request` referencing `feat/storybook-playwright-axe`). If main does not yet contain that work, STOP and report BLOCKED.

---

### Task 2: Install Lighthouse CI dependencies under cooldown

Cooldown is active (`.npmrc` `minimum-release-age=21600`). The current exclusion list (rollup native binaries, typescript-eslint monorepo, Babel infrastructure per ADR-0013) covers most transitive friction.

**If any package or transitive is refused for cooldown reasons and is not already in the exclusion list, STOP and report.** Do not edit `.npmrc` to add an exclusion as part of this plan: exclusions require an ADR-0013 amendment, which is a separate decision the controller will make. Before reporting blocked, consider:

- Try the immediately previous Lighthouse CI minor (releases roughly every 1 to 2 months; the prior minor reliably clears 15 days).
- Try the `pnpm.overrides` tactical pin pattern from the previous milestone if the blocker is a single transitive and a slightly older version is known-good.

- [ ] **Step 1: Install `@lhci/cli`**

```
pnpm add -D @lhci/cli
```

Expected: installs cleanly. If cooldown blocks, try `pnpm add -D @lhci/cli@~0.14.0` (or the next-most-recent minor). Document the chosen version for the ADR.

- [ ] **Step 2: Verify installed version**

```
pnpm ls @lhci/cli --depth=0
```

Expected: lists `@lhci/cli` with a resolved version. Capture that version for the ADR's Decision section.

- [ ] **Step 3: Verify the CLI is callable**

```
pnpm exec lhci --help
```

Expected: prints the Lighthouse CI help text including the `autorun`, `collect`, `assert`, and `upload` subcommands. Exit code 0.

- [ ] **Step 4: Check lockfile delta**

```
git status --short pnpm-lock.yaml package.json
```

Expected: `M package.json`, `M pnpm-lock.yaml`. No other anomalies.

---

### Task 3: Install Stryker dependencies under cooldown

- [ ] **Step 1: Install Stryker core, the Vitest runner, and the TypeScript checker**

```
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

Expected: installs cleanly. The TypeScript checker keeps type errors from inflating Stryker's "killed" count by failing fast on mutants that no longer typecheck.

If cooldown blocks: try the immediately previous Stryker minor across all three packages (versions must align across the Stryker monorepo). Document the chosen version.

- [ ] **Step 2: Verify installed versions**

```
pnpm ls @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker --depth=0
```

Expected: each package listed with a resolved version on the same major and minor. Capture the version triple for the ADR.

- [ ] **Step 3: Verify the CLI is callable**

```
pnpm exec stryker --help
```

Expected: prints the Stryker help including the `run` and `init` subcommands. Exit code 0.

- [ ] **Step 4: Confirm lockfile delta**

```
git status --short pnpm-lock.yaml package.json
```

Expected: `M package.json`, `M pnpm-lock.yaml`. No untracked Stryker sample config (we will write our own).

---

### Task 4: Create `lighthouserc.json`

The config drives `lhci autorun`, which chains `collect` (drive headless Chrome against the preview) and `assert` (compare against thresholds). No `upload` block is added at this stage; the temporary public storage server is not appropriate for a foundation scaffold, and we have no internal LHCI server yet.

- [ ] **Step 1: Create the file at the repo root**

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm preview --port 4173 --strictPort",
      "startServerReadyPattern": "Local:",
      "url": ["http://localhost:4173/"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "chromeFlags": "--no-sandbox --headless=new"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.8 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.8 }]
      }
    }
  }
}
```

Notes for the implementer:

- The `startServerCommand` uses `pnpm preview` so Lighthouse measures the production bundle, matching how Playwright runs E2E.
- `numberOfRuns: 3` is the Lighthouse-CI-recommended minimum to smooth performance variance; lower than 3 produces noisy assertions.
- `--no-sandbox` is required in the GitHub Actions Ubuntu runner; `--headless=new` selects the modern headless mode (the legacy mode is being deprecated upstream).
- Thresholds are intentionally lenient for the stub app: a single `<h1>` cannot exercise performance signal. Accessibility is the only category set to `error` because axe-core already covers it; Lighthouse should agree, so an `error` here is a meaningful guardrail rather than noise. Tighten the other categories as real surfaces appear.
- No `upload` block is configured; assertions print to stdout and fail the job on `error`-level violations.

- [ ] **Step 2: Verify the config parses**

```
pnpm exec lhci autorun --config=./lighthouserc.json --help
```

Expected: prints the autorun help. If the CLI complains about JSON shape, the file is malformed; fix and retry.

---

### Task 5: Add Lighthouse npm scripts

- [ ] **Step 1: Open `package.json` and add two scripts**

Append to the `scripts` block (preserve the existing alphabetical grouping where present):

```json
{
  "scripts": {
    "lhci": "lhci autorun --config=./lighthouserc.json",
    "lhci:collect": "lhci collect --config=./lighthouserc.json"
  }
}
```

- [ ] **Step 2: Build the production bundle**

```
pnpm build
```

Expected: emits `dist/` cleanly.

- [ ] **Step 3: Smoke `pnpm lhci` locally**

```
pnpm lhci
```

Expected outcomes:

- The preview server boots, three Lighthouse runs execute, assertions print.
- Accessibility category scores 0.9 or higher (the App shell with `<main>` and `<h1>` should pass).
- Performance, best-practices, and SEO are `warn`-level so they will not fail the run even if low for a stub.
- Exit code 0. If accessibility fails, fix the source (per the same posture as the axe-core scaffold), not the assertion.

If a Chrome launch error appears on the developer's macOS host because Lighthouse cannot find Chrome, install Chrome or set `CHROME_PATH` and retry. Document any workaround in the ADR.

- [ ] **Step 4: Confirm Lighthouse output is gitignored**

```
ls -la .lighthouseci 2>/dev/null
```

Expected: directory exists locally (from the run above); it will be added to `.gitignore` in Task 11. For now, do not stage it.

---

### Task 6: Create `stryker.conf.json`

Stryker targets `core/**/*.ts` per spec section 9.9. `core/` does not exist yet; the config is valid (the schema accepts globs that match zero files) and the workflow guards against the empty-target case.

- [ ] **Step 1: Create the file at the repo root**

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "vitest": {
    "configFile": "vite.config.ts"
  },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": ["core/**/*.ts", "!core/**/*.test.ts", "!core/**/*.spec.ts"],
  "reporters": ["progress", "clear-text", "html"],
  "htmlReporter": {
    "fileName": "reports/stryker/mutation.html"
  },
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  },
  "tempDirName": ".stryker-tmp",
  "cleanTempDir": true,
  "logLevel": "info"
}
```

Notes for the implementer:

- `mutate` excludes test files so Stryker does not mutate tests themselves.
- Threshold semantics: `break` is the minimum acceptable score (Stryker exits non-zero below it); `low` and `high` color the report. Defaults are placeholders; spec line 1232 calls these "open" and they will be revised once real `core/` code accumulates.
- The `typescript` checker discards mutants that cause type errors before running them through Vitest, saving substantial runtime.
- `tempDirName: ".stryker-tmp"` keeps Stryker's scratch space out of the project root globs.

- [ ] **Step 2: Verify the config parses**

```
pnpm exec stryker run --help
```

Expected: prints the run help. If Stryker complains about config shape, the JSON is malformed; fix and retry.

---

### Task 7: Add Stryker npm scripts

- [ ] **Step 1: Open `package.json` and add scripts**

Append to the `scripts` block:

```json
{
  "scripts": {
    "mutate": "stryker run",
    "mutate:check": "stryker run --dryRun"
  }
}
```

`mutate:check` exists so contributors can verify the Stryker setup boots without paying for a full mutation run.

- [ ] **Step 2: Smoke the config when `core/` is empty**

```
test -d core && pnpm exec stryker run --dryRun || echo "no core/ yet; scaffold parked"
```

Expected: prints `no core/ yet; scaffold parked`. If `core/` exists by mistake (e.g., from a stale branch), STOP and report; this milestone does not introduce `core/`.

- [ ] **Step 3: Sanity-check the schema-included path resolves**

```
test -f node_modules/@stryker-mutator/core/schema/stryker-schema.json && echo schema-ok || echo schema-missing
```

Expected: `schema-ok`. If the schema is missing, the package install is broken; reinstall and retry.

---

### Task 8: Scaffold `tests/fixtures/`

The spec describes three subdirectories (`projects/`, `assets/`, `registries/`) with distinct content lifetimes. The scaffold creates each as an empty directory anchored by a README so the layout is in source control before any test references it.

- [ ] **Step 1: Create the directory tree**

```
mkdir -p tests/fixtures/projects tests/fixtures/assets tests/fixtures/registries
```

- [ ] **Step 2: Create `tests/fixtures/README.md`**

```markdown
# Test fixtures

Static, reusable inputs that several tests can share. Each subtree below has a
narrow purpose; do not mix categories.

| Directory     | Holds                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `projects/`   | Hand-authored project JSONs that exercise specific domain configurations.          |
| `assets/`     | Tiny CC0 test assets (textures, models, audio if relevant) tagged with their SPDX. |
| `registries/` | Frozen registry snapshots used to pin schema and migration tests.                  |

Fixtures are append-only by convention: once a test depends on a fixture's
exact bytes, changes to that fixture invalidate the contract. Add a new
fixture rather than editing one in place; remove old fixtures only when no
test references them.

Do not import fixtures from production source; they belong to tests only.
```

- [ ] **Step 3: Create `tests/fixtures/projects/README.md`**

```markdown
# Project fixtures

Hand-authored `*.project.json` files that exercise specific domain
configurations. Typical uses:

- Deterministic input for scene-graph derivation tests.
- Round-trip targets for the schema migration framework.
- Inputs for 3D scene snapshot tests once the engine layer exists.

Each fixture should have a comment at the top of the file (when the schema
permits) or a short note here that explains what it pins down.
```

- [ ] **Step 4: Create `tests/fixtures/assets/README.md`**

```markdown
# Asset fixtures

Tiny CC0-licensed test assets. Every asset must record its SPDX identifier
either in a sibling `LICENSE.txt`, in the filename, or in this README. Assets
should be as small as possible; large binary blobs do not belong in version
control.

Do not add anything here without confirming its license is CC0 or another
license compatible with the project's Apache-2.0 export pipeline (see
ADR-0002).
```

- [ ] **Step 5: Create `tests/fixtures/registries/README.md`**

```markdown
# Registry fixtures

Frozen snapshots of the `ElementTypeRegistry` and `FinishRegistry` used to
exercise schema migrations. Each snapshot is named with its schema version
(for example `registry-v3.json`) and is never edited; new versions arrive as
new files.

The migration framework reads these snapshots, applies the migration chain,
and compares against the expected post-migration shape. Do not delete a
snapshot until its corresponding migration is removed from the chain.
```

- [ ] **Step 6: Verify the tree is in place**

```
find tests/fixtures -type f | sort
```

Expected:

```
tests/fixtures/README.md
tests/fixtures/assets/README.md
tests/fixtures/projects/README.md
tests/fixtures/registries/README.md
```

---

### Task 9: Scaffold `tests/factories/`

Factories produce throwaway domain objects for tests. The spec calls out `makeWall` and `makeProject`, but the underlying `Wall` and `Project` types live in `core/`, which is not scaffolded yet. The directory and README go in now; concrete factories follow when `core/` lands.

- [ ] **Step 1: Create the directory**

```
mkdir -p tests/factories
```

- [ ] **Step 2: Create `tests/factories/README.md`**

```markdown
# Test factories

Each factory exports a `make*` function that returns a fresh, fully-typed
domain object useful for tests. Conventions:

- One factory file per domain type. File name matches the factory name in
  camelCase plus `.ts`: `makeWall.ts`, `makeProject.ts`, `makeOpening.ts`.
- Each `make*` accepts an optional `Partial<T>` and spreads it over sensible
  defaults so individual tests can override exactly the fields they care
  about.
- Factories never share mutable state between calls; every call returns a
  fresh object.
- Property-based tests provide their own random fixtures via fast-check.
  Factories serve example-based tests.

This directory is empty by design until the `core/` layer introduces the
domain types it produces. Adding a factory here without a corresponding
domain type makes the factory's return type fictional; defer factories until
they have something real to instantiate.
```

- [ ] **Step 3: Verify the tree is in place**

```
find tests/factories -type f
```

Expected:

```
tests/factories/README.md
```

---

### Task 10: Update `.gitignore`

- [ ] **Step 1: Append a Lighthouse CI section**

Open `.gitignore`. After the existing Playwright block (`blob-report/` line), add:

```
# Lighthouse CI
.lighthouseci/

# Stryker
reports/stryker/
.stryker-tmp/
```

- [ ] **Step 2: Verify nothing new is staged accidentally**

```
git check-ignore -v .lighthouseci/ reports/stryker/ .stryker-tmp/
```

Expected: each path matches a rule from `.gitignore`. If `git check-ignore` returns non-zero for a path, the corresponding line is wrong; fix and retry.

---

### Task 11: Update `.prettierignore`

- [ ] **Step 1: Read the current file**

```
cat .prettierignore
```

Capture the contents.

- [ ] **Step 2: Append the Lighthouse and Stryker output directories**

Open `.prettierignore` and append:

```
.lighthouseci
reports/stryker
.stryker-tmp
```

(`reports/` is already covered by an existing ignore if present; double-check before adding `reports/stryker` to avoid duplication. The new lines only matter for the case where someone removes the broader `reports/` ignore later.)

- [ ] **Step 3: Verify Prettier ignores correctly**

```
pnpm exec prettier --check . 2>&1 | tail -5
```

Expected: clean check or only the same warnings present before this task. No new prettier complaints about Lighthouse or Stryker output paths.

---

### Task 12: Update `eslint.config.js`

- [ ] **Step 1: Open `eslint.config.js` and extend the top-level `ignores` array**

Locate the existing `ignores: [ 'dist', 'coverage', ... ]` block (around line 29-39). Append three new entries:

```javascript
ignores: [
  'dist',
  'coverage',
  'node_modules',
  '.superpowers',
  'pnpm-lock.yaml',
  'storybook-static',
  'playwright-report',
  'test-results',
  'e2e/.cache',
  '.lighthouseci',
  'reports',
  '.stryker-tmp',
],
```

- [ ] **Step 2: Run lint**

```
pnpm lint
```

Expected: zero violations. If any rule fires on the new fixtures or factory READMEs (markdown files are not in the lint glob, so this should not happen), STOP and report.

---

### Task 13: Confirm `vite.config.ts` test excludes still hold

The existing Vitest config excludes `node_modules`, `dist`, `.idea`, `.git`, `.cache`, and `e2e/**`. The new `tests/` tree contains only README files at this stage; Vitest will not match anything there. Confirm that holds.

- [ ] **Step 1: Dry-run Vitest**

```
pnpm exec vitest run --reporter=verbose --passWithNoTests
```

Expected: passes (existing src/ tests run, nothing from `tests/` is collected). If Vitest tries to collect `tests/factories/README.md` (impossible by default; `.md` is not in the include glob) or otherwise misbehaves, capture the output and adjust the test config.

- [ ] **Step 2: Confirm no edit was required**

```
git status --short vite.config.ts
```

Expected: empty (no diff). If a change was required to keep the existing tests green, capture the diff for the ADR's Consequences section.

---

### Task 14: Add the Lighthouse CI job to `.github/workflows/ci.yml`

Lighthouse CI runs on push to `main` and on tag pushes, not on every PR. The job depends on `check` so the production bundle is exercised by a known-good build before Lighthouse measures it. PRs run only `check`, `storybook-build`, and the existing `e2e` job; Lighthouse adds CI cost we do not want to pay per PR while the surface is a stub.

- [ ] **Step 1: Append the `lighthouse` job to `.github/workflows/ci.yml`**

Add after the existing `e2e` job block:

```yaml
lighthouse:
  name: Lighthouse CI
  if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/'))
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
```

Notes for the implementer:

- The `if` clause scopes the job to pushes on `main` and to tags; pull requests skip it.
- `browser-actions/setup-chrome@v1` installs Chrome stable on the runner; Lighthouse will pick it up via `CHROME_PATH` or by default.
- The artifact upload runs on success and failure so a failed assertion is debuggable from the workflow run page.

- [ ] **Step 2: Verify the workflow YAML parses**

```
pnpm exec js-yaml .github/workflows/ci.yml > /dev/null && echo yaml-ok
```

If `js-yaml` is not available locally, alternative:

```
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo yaml-ok
```

Expected: `yaml-ok`.

---

### Task 15: Add the Stryker weekly workflow

Stryker runs weekly per spec section 9.9. The workflow lives in its own file so its cron schedule does not interfere with the per-push CI pipeline.

- [ ] **Step 1: Create `.github/workflows/mutation.yml`**

```yaml
name: Mutation testing

on:
  schedule:
    # Sundays at 03:30 UTC (off-peak for both US and EU contributors).
    - cron: '30 3 * * 0'
  workflow_dispatch: {}

concurrency:
  group: mutation-${{ github.ref }}
  cancel-in-progress: true

jobs:
  stryker:
    name: Stryker
    runs-on: ubuntu-latest
    timeout-minutes: 90
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

      - name: Skip if core/ is empty
        id: guard
        run: |
          if [ -d core ] && find core -name '*.ts' -not -name '*.test.ts' -not -name '*.spec.ts' | grep -q .; then
            echo "should_run=true" >> "$GITHUB_OUTPUT"
          else
            echo "should_run=false" >> "$GITHUB_OUTPUT"
            echo "core/ is empty or absent; mutation scaffold present, skipping run."
          fi

      - name: Run Stryker
        if: steps.guard.outputs.should_run == 'true'
        run: pnpm mutate

      - name: Upload Stryker HTML report
        if: always() && steps.guard.outputs.should_run == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: stryker-report
          path: reports/stryker/
          retention-days: 14
```

Notes for the implementer:

- `workflow_dispatch: {}` lets maintainers trigger the workflow manually from the Actions tab while the cron schedule is the main driver.
- `cancel-in-progress: true` keeps a backlog from forming if a weekly run overlaps with a manual one.
- The `Skip if core/ is empty` step keeps the workflow green during the long stretch before `core/` is populated; the absence of source is not a failure.

- [ ] **Step 2: Verify the YAML parses**

```
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mutation.yml'))" && echo yaml-ok
```

Expected: `yaml-ok`.

---

### Task 16: Update `CONTRIBUTING.md`

Add two new sections after the existing "End-to-end testing" section (which closes with the "Visual regression baselines" subsection).

- [ ] **Step 1: Add a "Performance budgets" section**

Insert after the visual regression baseline subsection:

```markdown
## Performance budgets

[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) measures Vernacular's production bundle against category-level budgets:

- Accessibility is a hard gate (minimum score 0.9). Lighthouse and `@axe-core/playwright` should agree; if they disagree, treat both reports as data and fix the source.
- Performance, best-practices, and SEO are warn-only at this stage. Tighten them as real user surfaces arrive.

Local commands:

- `pnpm build` (Lighthouse measures the production preview, so a build is a prerequisite).
- `pnpm lhci` runs three Lighthouse passes against the preview, prints assertions, and exits non-zero on any error-level violation.

CI runs Lighthouse on pushes to `main` and on tag pushes; the per-PR loop intentionally skips it to keep iteration fast.
```

- [ ] **Step 2: Add a "Mutation testing" section**

Insert after the Performance budgets section:

```markdown
## Mutation testing

[Stryker](https://stryker-mutator.io/) runs weekly against `core/` and measures test quality. A mutation that survives means the tests do not catch the breakage Stryker introduced; treat surviving mutants as a backlog of missing tests rather than as a complaint about Stryker.

Local commands:

- `pnpm mutate:check` verifies the Stryker config without running mutants.
- `pnpm mutate` runs the full mutation suite. This is slow; expect it to take many minutes once `core/` has real code.

CI runs Stryker on a weekly schedule (`.github/workflows/mutation.yml`) and on manual dispatch. The workflow skips cleanly when `core/` is empty.
```

- [ ] **Step 3: Update the "Pull request checklist"**

Open the existing checklist and add the following bullet at the end:

```markdown
- [ ] If your change touches `core/`, run `pnpm mutate:check` locally to confirm the Stryker scaffold still configures cleanly (a full `pnpm mutate` run is not required; the weekly CI workflow owns that).
```

- [ ] **Step 4: Verify Prettier-clean**

```
pnpm format:check
```

Expected: no diff against CONTRIBUTING.md.

---

### Task 17: Update `ROADMAP.md`

In the Foundation work table, set the `Lighthouse CI, Stryker, performance harness, fixtures and factories` row to `in progress`. The `Storybook, Playwright, axe-core, visual regression baselines` row above it should already read `done`; verify and update if not. Subsequent rows stay `pending`.

- [ ] **Step 1: Edit the Markdown table directly**

Result for those two rows:

```markdown
| Storybook, Playwright, axe-core, visual regression baselines | done |
| Lighthouse CI, Stryker, performance harness, fixtures and factories | in progress |
```

- [ ] **Step 2: Verify Prettier-clean**

```
pnpm format:check
```

Expected: no diff. Markdown tables are Prettier-sensitive; if the check complains, run `pnpm format` and inspect the rewrite.

---

### Task 18: Write ADR-0016

- [ ] **Step 1: Ensure the local ADR directory exists**

```
mkdir -p docs/knowledge/decisions
```

Per CLAUDE.md, the entire `docs/knowledge/` tree is gitignored. The ADR remains in the working tree as a Claude-side cache; it is never committed.

- [ ] **Step 2: Create `docs/knowledge/decisions/ADR-0016-lighthouse-stryker-fixtures.md`**

```markdown
---
slug: decisions/ADR-0016-lighthouse-stryker-fixtures
title: 'ADR-0016: Lighthouse CI, Stryker, fixtures, and factories scaffold'
type: decision
tags: [tooling, testing, performance, mutation-testing, fixtures]
related:
  [
    decisions/ADR-0009-test-pyramid-rgb-tdd,
    decisions/ADR-0013-cooldown-exclusions,
    decisions/ADR-0015-storybook-playwright-axe,
  ]
sourceFiles:
  [
    lighthouserc.json,
    stryker.conf.json,
    tests/fixtures/README.md,
    tests/factories/README.md,
    .github/workflows/ci.yml,
    .github/workflows/mutation.yml,
    package.json,
  ]
status: current
updated: 2026-06-02
---

# ADR-0016: Lighthouse CI, Stryker, fixtures, and factories scaffold

## Status

Accepted.

## Context

The design spec's test pyramid (section 9) calls for three foundation-tier
scaffolds beyond the Storybook, Playwright, and axe-core work landed in
ADR-0015:

- Lighthouse CI for performance and accessibility regression tracking on
  main and tagged builds (section 9.3, 9.11).
- Stryker mutation testing on a weekly cadence against `core/` (section
  9.9).
- `tests/fixtures/{projects,assets,registries}/` and `tests/factories/`
  directory scaffolds (section 9.10).

Each of these is "scaffold" in the section 10 sense: structure and tooling
go in now; concrete content arrives as the corresponding application
surfaces land.

## Decision

### Lighthouse CI

`@lhci/cli` configured via `lighthouserc.json`. The preview server (`pnpm
preview` on port 4173) hosts the production bundle so Lighthouse measures
exactly what Playwright tests. Three runs per assertion smooth performance
variance.

Category-level assertions:

- `accessibility`: error at 0.9. Hard gate. Aligns with axe-core's per-page
  scans; the two tools should agree.
- `performance`, `best-practices`, `seo`: warn-only. The stub app cannot
  exercise meaningful performance signal yet; warnings let the pipeline run
  without false-positive failures.

CI scopes Lighthouse to pushes on `main` and to tag pushes; pull requests
skip it. Rationale: PR iteration cost is precious while there are no real
surfaces to optimize. When the first user-facing flow arrives, the
performance category will get tightened and the PR scope reconsidered.

No `upload` block is configured. The temporary public storage server is
not appropriate for a project artifact, and there is no internal LHCI
server. The HTML report is uploaded as a workflow artifact instead.

### Stryker

`@stryker-mutator/core` plus `@stryker-mutator/vitest-runner` (per the
spec's choice of Vitest as the unit runner) plus
`@stryker-mutator/typescript-checker` (discards mutants that fail
typecheck, saving substantial runtime).

Configuration at `stryker.conf.json`. Mutate target is `core/**/*.ts` with
test files excluded; per spec the mutation surface is the pure domain
layer. Thresholds are placeholders (`high: 80, low: 60, break: 50`) per
spec line 1232 calling specifics "open"; they will be revisited once
`core/` accumulates real code.

The weekly cadence lives in a dedicated workflow at
`.github/workflows/mutation.yml`. It runs Sundays at 03:30 UTC and is
manually dispatchable. A guard step skips the Stryker run while `core/` is
empty so the workflow stays green during the bootstrap stretch; the
skip-condition disappears as soon as one `core/**/*.ts` file lands.

### Fixtures and factories

`tests/fixtures/{projects,assets,registries}/` and `tests/factories/` are
scaffolded as directories anchored by README files that explain each
subtree's purpose. No JSON, asset, or factory function is committed yet:

- Project, asset, and registry fixtures require the domain types they
  conform to, which arrive when `core/` is scaffolded.
- Factories (`makeWall`, `makeProject`, etc. per spec line 959) need
  concrete domain types as their return type; writing them now would
  fabricate types that the application would then have to match later, an
  inversion of the natural dependency direction.

The READMEs codify conventions (append-only fixtures, one factory per
type, `Partial<T>` override pattern, no shared mutable state) so the
first contributor adding content has clear precedent.

## Consequences

- Two new CI surfaces: a `lighthouse` job in `.github/workflows/ci.yml`
  scoped to main/tags, and a separate weekly workflow at
  `.github/workflows/mutation.yml`. Together they raise total CI cost
  modestly per push; the weekly Stryker run consumes its own envelope.
- The empty `tests/factories/` directory invites adding factories
  prematurely (before the domain types exist). The README explicitly warns
  against this; the `pr-reviewer` agent should flag a factory that
  fabricates types as a finding.
- Lighthouse and axe-core overlap on accessibility but operate on
  different surfaces (Lighthouse on the built bundle in a real browser,
  axe-core during Playwright's E2E navigations). Keeping both is a
  defense-in-depth posture.
- The Stryker guard step (`Skip if core/ is empty`) is the kind of small
  CI workaround that future-Claude should remove once it stops applying;
  the ADR's Status will move to `superseded` and a follow-up ADR will
  document the removal.

## Alternatives considered

- **Run Lighthouse on every PR.** Rejected for now: PR iteration cost is
  high and the stub app has no signal to measure. Revisit once a real user
  flow exists.
- **Use the Lighthouse CI temporary public storage server for upload.**
  Rejected: the server is not promised long-term storage, and the report
  contains no secrets so the artifact-on-failure upload is sufficient.
- **Run Stryker on PRs that touch `core/`.** Rejected for now: full
  Stryker runs are minutes-to-hours depending on the codebase, far too
  slow for the inner loop. Per-PR mutation incrementality (diff-only
  mutants) is a separate decision deferred until `core/` is non-trivial.
- **Define a placeholder `makeFixture` factory in `tests/factories/` to
  prove the wiring.** Rejected: factories without a concrete return type
  set a bad precedent. The README is enough wiring proof.

## References

- Design specification, sections 9.3, 9.9, 9.10, 9.11.
- ADR-0009 (test pyramid and red-green-blue TDD).
- ADR-0013 (cooldown exclusions; applied unchanged here).
- ADR-0015 (Storybook, Playwright, axe-core, visual regression scaffold;
  this ADR extends the testing surface ADR-0015 began).
```

- [ ] **Step 3: Verify the ADR file is Prettier-clean**

```
pnpm exec prettier --check docs/knowledge/decisions/ADR-0016-lighthouse-stryker-fixtures.md
```

Expected: clean. The ADR file is under a gitignored tree, so global `prettier --check .` will not see it; check explicitly.

---

### Task 19: Regenerate the local knowledge index

The knowledge index lives under the gitignored `docs/knowledge/` tree and is regenerated locally only.

- [ ] **Step 1: Run the indexer**

```
pnpm knowledge:index
```

Expected: emits or updates `docs/knowledge/INDEX.md` and `docs/knowledge/index.json` to include ADR-0016.

- [ ] **Step 2: Confirm nothing under `docs/knowledge/` will be committed**

```
git status --short docs/knowledge/
```

Expected: empty (the whole tree is gitignored). If anything shows up, the gitignore rule has drifted; STOP and report.

---

### Task 20: Final verification

Run the full local check chain plus the new scaffolds.

- [ ] **Step 1: Local checks**

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

All should pass.

- [ ] **Step 2: Storybook build (no regression)**

```
pnpm build-storybook
```

Expected: clean build into `storybook-static/`.

- [ ] **Step 3: E2E (Chromium; no regression)**

```
pnpm e2e --project=chromium
```

Expected: smoke, accessibility, and visual-regression tests still pass.

- [ ] **Step 4: Lighthouse CI**

```
pnpm lhci
```

Expected: three Lighthouse runs, all assertions pass. Accessibility at or above 0.9; performance, best-practices, SEO are warn-only and will not fail the run.

- [ ] **Step 5: Stryker dry-check**

```
test -d core && pnpm exec stryker run --dryRun || echo "no core/ yet; scaffold parked"
```

Expected: prints `no core/ yet; scaffold parked`.

- [ ] **Step 6: Duplicate detection sane**

```
pnpm dup
```

Expected: jscpd report ends with 0 clones (or only known-acceptable clones); informational only.

- [ ] **Step 7: Capture the final `git status`**

```
git status --short
```

Expected files modified or added (the local knowledge graph diff is invisible because it is gitignored):

```
A  .github/workflows/mutation.yml
M  .github/workflows/ci.yml
M  .gitignore
M  .prettierignore
M  CONTRIBUTING.md
M  ROADMAP.md
M  eslint.config.js
M  package.json
M  pnpm-lock.yaml
A  lighthouserc.json
A  stryker.conf.json
A  tests/factories/README.md
A  tests/fixtures/README.md
A  tests/fixtures/assets/README.md
A  tests/fixtures/projects/README.md
A  tests/fixtures/registries/README.md
```

If unexpected files appear (Lighthouse runtime output, Stryker temp dirs, sample configs from `init` commands not in this plan), clean them up before committing.

---

### Task 21: Commit, push, and open PR

The repo's commit convention is Conventional Commits with sentence-case subjects. Group the work into focused commits.

- [ ] **Step 1: Commit dependencies and lockfile**

```
git add package.json pnpm-lock.yaml
git commit -m "build: add Lighthouse CI and Stryker devDeps"
```

- [ ] **Step 2: Commit Lighthouse configuration**

```
git add lighthouserc.json
git commit -m "test: add Lighthouse CI config for production-preview budgets"
```

- [ ] **Step 3: Commit Stryker configuration**

```
git add stryker.conf.json
git commit -m "test: add Stryker config targeting core/ with the Vitest runner"
```

- [ ] **Step 4: Commit fixture and factory scaffolds**

```
git add tests/
git commit -m "test: scaffold tests/fixtures and tests/factories directories"
```

- [ ] **Step 5: Commit ignore-file updates**

```
git add .gitignore .prettierignore eslint.config.js
git commit -m "chore: ignore Lighthouse CI and Stryker output directories"
```

- [ ] **Step 6: Commit CI workflow updates**

```
git add .github/workflows/ci.yml .github/workflows/mutation.yml
git commit -m "ci: add Lighthouse CI job and weekly Stryker workflow"
```

- [ ] **Step 7: Commit CONTRIBUTING and ROADMAP updates**

```
git add CONTRIBUTING.md ROADMAP.md
git commit -m "docs: document Lighthouse CI and mutation testing workflows"
```

- [ ] **Step 8: Push the branch and open the PR**

```
git push -u origin feat/lighthouse-stryker-fixtures
```

```
gh pr create --title "Lighthouse CI, Stryker, fixtures, and factories scaffold" --body "$(cat <<'EOF'
## Summary

This branch lands the remaining foundation-tier testing scaffolds:

- Lighthouse CI (`@lhci/cli`) against the Vite production preview. Accessibility is a hard gate (minimum 0.9); performance, best-practices, and SEO are warn-only for the stub-app stage.
- Stryker (`@stryker-mutator/core` + Vitest runner + TypeScript checker) configured to mutate `core/**/*.ts`. Weekly workflow at `.github/workflows/mutation.yml` with a clean skip when `core/` is empty.
- `tests/fixtures/{projects,assets,registries}/` and `tests/factories/` directory scaffolds anchored by README files documenting conventions.
- Lighthouse runs on push to `main` and on tag pushes; PRs intentionally skip it.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [x] `pnpm build-storybook` (no regression)
- [x] `pnpm e2e --project=chromium` (no regression)
- [x] `pnpm lhci` passes locally against the production preview
- [x] `pnpm exec stryker run --dryRun` is intentionally guarded: `core/` is empty, so the weekly workflow skips cleanly

## Out of scope

- The Three.js performance benchmark harness in `engine/profiling/` (deferred until the engine layer exists).
- Concrete factory functions (`makeWall`, `makeProject`); they require domain types from `core/` and arrive with that scaffold.
- Per-PR mutation testing (full Stryker is too slow for the inner loop; diff-only mutation is a separate later decision).
- Tightening Lighthouse performance / SEO / best-practices thresholds beyond warn-only (revisit once a real user flow exists).
EOF
)"
```

Capture the PR URL.

---

## Rollback notes

If a later branch needs to revert this work entirely:

1. `git revert` the seven commits in reverse order (CI workflow updates first, then ignore-file updates, then fixtures/factories, then Stryker config, then Lighthouse config, then deps + lockfile).
2. Remove any `.lighthouseci/`, `.stryker-tmp/`, or `reports/stryker/` directories that linger locally (gitignored, but worth cleaning).
3. The cooldown exclusion list is untouched by this plan, so no rollback is needed there.

## Implementer expectations

- Treat the cooldown as a hard gate. If install fails because a transitive is too fresh, STOP and report. The exclusion list is governed by ADR-0013.
- Treat any Lighthouse accessibility failure as a source bug, not an assertion bug. The home page is currently `<main><h1>Vernacular</h1></main>`; if Lighthouse disagrees with axe-core on accessibility, both reports inform the fix.
- Do not pre-create `makeWall` or `makeProject` factory files. The factories live in the same milestone as `core/`'s wall and project types.
- Keep the surface minimal: one Lighthouse config, one Stryker config, four fixture READMEs, one factory README, one ADR. Expansion is for later milestones.
