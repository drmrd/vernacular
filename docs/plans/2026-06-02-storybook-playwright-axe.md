# Vernacular: Storybook, Playwright, axe-core, and Visual Regression Baselines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the testing-scaffold tooling for Vernacular's first interactive surface: Storybook for component-level visual documentation and component tests, Playwright for cross-browser E2E (configured for Chromium, Firefox, and WebKit), `@axe-core/playwright` for automated accessibility checks on page transitions, and an initial committed visual-regression baseline so the existing single-page React shell has a screenshot contract.

**Architecture:** Storybook 8 (or 9 if cooldown permits) on the `@storybook/react-vite` framework, configured under `.storybook/`. A single starter story for `App` proves the pipeline. Playwright sits under `e2e/` with its config at `playwright.config.ts`; three browser projects map to chromium / firefox / webkit. Tests live under `e2e/tests/`. Visual regression baselines live under `e2e/tests/__screenshots__/` and are committed. CI gains two jobs alongside the existing `check`: `storybook-build` (verifies `pnpm build-storybook` succeeds) and `e2e` (runs Playwright in a Playwright-pinned container so local baselines and CI baselines match). The CI matrix runs Chromium on PR; Firefox and WebKit run on main and on release tags.

**Tech Stack:** Storybook (`storybook`, `@storybook/react-vite`, `@storybook/addon-essentials`, `@storybook/test`), Playwright (`@playwright/test`), `@axe-core/playwright`. All under the 15-day cooldown; if a fresh transitive blocks install, STOP and report instead of expanding `.npmrc` silently (the exclusion list is governed by ADR-0013, and additions require an ADR amendment).

**Scope boundary:** This plan does NOT add Lighthouse CI, Stryker mutation testing, the performance benchmark harness, or `tests/fixtures` and `tests/factories` scaffolds; those belong to a follow-on plan. It does NOT introduce the Storybook test-runner integration that turns stories into Playwright tests (deferred as a follow-on once the component surface grows). It does NOT introduce source code from the six-layer source skeleton (separate plan) or any user-facing flows (separate plan). It does NOT alter the existing Vitest unit-test setup beyond declaring a non-overlap with the new Playwright `e2e/` directory.

---

## File structure

| File                                                            | Purpose                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `.storybook/main.ts`                                            | Storybook config: framework, stories glob, addons                                |
| `.storybook/preview.ts`                                         | Storybook preview parameters: layout, viewports, a11y defaults                   |
| `src/App.stories.tsx`                                           | Starter story for the `App` shell                                                |
| `playwright.config.ts`                                          | Playwright config: 3 browser projects, baseURL, retries, screenshot tolerance    |
| `e2e/tests/smoke.spec.ts`                                       | First E2E test: app loads and renders an expected heading                        |
| `e2e/tests/accessibility.spec.ts`                               | `@axe-core/playwright` scan of the home page                                     |
| `e2e/tests/visual-regression.spec.ts`                           | `toHaveScreenshot` baseline test for the home page                               |
| `e2e/tests/__screenshots__/visual-regression.spec.ts/*.png`     | Committed baselines (Linux containerized, per browser)                           |
| `e2e/global-setup.ts`                                           | Optional global setup (e.g., ensure preview server is reachable). Empty stub OK. |
| `package.json`                                                  | New devDeps; new scripts: `storybook`, `build-storybook`, `e2e`, etc.            |
| `pnpm-lock.yaml`                                                | Updated lockfile                                                                 |
| `.gitignore`                                                    | Ignore `storybook-static/`, `playwright-report/`, `test-results/`, caches        |
| `.prettierignore`                                               | Same outputs                                                                     |
| `eslint.config.js`                                              | Add ignores for `storybook-static`, `playwright-report`, `test-results`          |
| `.github/workflows/ci.yml`                                      | Add `storybook-build` job and `e2e` job (Chromium on PR, all 3 on main+tags)     |
| `CONTRIBUTING.md`                                               | Storybook section, Playwright section, baseline-regeneration workflow            |
| `docs/knowledge/decisions/ADR-0015-storybook-playwright-axe.md` | ADR documenting the choice and the visual-regression baseline strategy           |
| `ROADMAP.md`                                                    | Move the in-progress marker to the storybook/playwright/axe row                  |
| `.superpowers/scratch/progress.md`                              | Update merge SHAs and capture prep notes (gitignored)                            |

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1: Confirm the working directory and branch**

```
pwd
git branch --show-current
git status --short
```

Expected: directory is `/Users/dan/workspace/vernacular`, branch is `feat/storybook-playwright-axe`, working tree is clean. If anything differs, STOP and report BLOCKED with what was found.

---

### Task 2: Install Storybook and Playwright dev dependencies under cooldown

Cooldown is active (`.npmrc` `minimum-release-age=21600`). The current exclusion list (rollup native binaries, typescript-eslint monorepo, Babel infrastructure per ADR-0013) covers most transitive friction.

**If any package or transitive is refused for cooldown reasons and is not already in the exclusion list, STOP and report.** Do not edit `.npmrc` to add an exclusion as part of this plan: exclusions require an ADR-0013 amendment, which is a separate decision the controller will make. Fallback options the implementer should consider before reporting blocked:

- Try the second-most-recent minor of the offending direct dependency (often the transitive that triggered the block is from a newer minor).
- Try Storybook 8.x stable rather than Storybook 9.x latest if 9.x's transitives are too fresh.
- Try the previous Playwright minor (Playwright releases roughly monthly, so the second-most-recent minor reliably clears the 15-day window).

- [ ] **Step 1: Install Storybook framework and addons**

Try the latest stable Storybook first:

```
pnpm add -D storybook @storybook/react-vite @storybook/addon-essentials @storybook/test
```

If the cooldown blocks: try Storybook 8.x stable:

```
pnpm add -D storybook@^8 @storybook/react-vite@^8 @storybook/addon-essentials@^8 @storybook/test@^8
```

- [ ] **Step 2: Install Playwright and axe-core integration**

```
pnpm add -D @playwright/test @axe-core/playwright
```

If a transitive blocks: try the immediately previous Playwright minor (e.g., `@playwright/test@~1.49.0` if `1.50.0` is too fresh). Document the version chosen.

- [ ] **Step 3: Verify installed versions**

```
pnpm ls storybook @storybook/react-vite @storybook/addon-essentials @storybook/test @playwright/test @axe-core/playwright --depth=0
```

Expected: each package listed with a resolved version. Capture the versions for the ADR.

- [ ] **Step 4: Verify lockfile is clean**

```
git status --short pnpm-lock.yaml
```

Expected: shows `M pnpm-lock.yaml`. No other lockfile-related anomalies.

---

### Task 3: Initialize Storybook configuration

Skip Storybook's interactive `init` command (it would overwrite scripts and introduce sample stories we do not want). Hand-write the config so we control the surface exactly.

- [ ] **Step 1: Create `.storybook/main.ts`**

```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
}

export default config
```

- [ ] **Step 2: Create `.storybook/preview.ts`**

```typescript
import type { Preview } from '@storybook/react'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'fullscreen',
  },
}

export default preview
```

- [ ] **Step 3: Verify the config files parse**

```
pnpm exec tsc --noEmit -p . 2>&1 | head -40 || true
```

Expected: no errors referencing `.storybook/*`. If TypeScript complains about Storybook types not being resolvable, ensure the project's `tsconfig.json` `include` covers `.storybook/`. If `include` is too narrow, add `.storybook/**/*.ts` to it.

---

### Task 4: Write the App starter story

Storybook is a documentation surface for components. The App shell is the only meaningful component today; the story is a smoke test for the Storybook pipeline.

- [ ] **Step 1: Create `src/App.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

const meta: Meta<typeof App> = {
  title: 'App/Shell',
  component: App,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof App>

export const Default: Story = {}
```

- [ ] **Step 2: Verify the story file lints**

```
pnpm lint
```

Expected: clean. If `react-refresh/only-export-components` warns on the story file's mixed export shape, add a per-file ESLint override in `eslint.config.js` for `**/*.stories.{ts,tsx}` that disables `react-refresh/only-export-components` and tightens `max-lines-per-function` similarly to the existing test override.

---

### Task 5: Add Storybook scripts to `package.json`

- [ ] **Step 1: Add `storybook` and `build-storybook` scripts**

Open `package.json` and add to the `scripts` object (preserve alphabetical or existing-block ordering as it already exists):

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

- [ ] **Step 2: Verify with `pnpm build-storybook`**

```
pnpm build-storybook
```

Expected: produces a `storybook-static/` directory; exit code 0. Capture any warnings; framework-version-mismatch warnings are tolerable, Vite build errors are not.

- [ ] **Step 3: Smoke `pnpm storybook` briefly (manual or with timeout)**

```
( pnpm storybook & PID=$!; sleep 8; curl -fsS http://localhost:6006/ > /dev/null && echo storybook-ok; kill $PID ) || true
```

Expected output line: `storybook-ok`. If `curl` fails, capture the storybook dev-server log and adjust port or config. (This step is best-effort: if the sandbox cannot run a background process, document the omission and proceed; CI's `build-storybook` job will catch broken setups.)

---

### Task 6: Initialize Playwright configuration

- [ ] **Step 1: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const SCREENSHOT_DIFF_TOLERANCE = 0.02

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: SCREENSHOT_DIFF_TOLERANCE,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

Notes for the implementer:

- The webServer uses `pnpm preview` (Vite's production preview) rather than `pnpm dev` so that visual baselines reflect production output. This requires `pnpm build` before the first E2E run; CI runs build as a separate step.
- The default port `4173` matches Vite's preview default; if the host has another service on that port, change both the webServer command and the `baseURL` default.
- `forbidOnly` + `retries: 2` + `workers: 1` on CI is a deliberate trade for snapshot stability; relax these once the suite has real volume.

- [ ] **Step 2: Add a `.gitignore` carve-out and a top-level `e2e/` directory**

```
mkdir -p e2e/tests
```

Verify the directory exists:

```
ls -la e2e/
```

Expected: `tests/` subdirectory exists, otherwise empty.

- [ ] **Step 3: Verify the Playwright config parses**

```
pnpm exec playwright --version
```

Expected: prints the installed Playwright version.

```
pnpm exec playwright test --list
```

Expected: lists zero tests (no test files yet); no syntax errors against `playwright.config.ts`.

---

### Task 7: Install Playwright browser binaries

- [ ] **Step 1: Install all three browsers**

```
pnpm exec playwright install --with-deps chromium firefox webkit
```

On macOS, `--with-deps` is a no-op (system deps come from Xcode CLT). On Linux CI, `--with-deps` installs the system libraries required by each browser. If the install fails, fall back to:

```
pnpm exec playwright install chromium firefox webkit
```

and accept that Linux CI will need to install system deps via the workflow.

- [ ] **Step 2: Verify the install**

```
pnpm exec playwright --version
ls "$(pnpm exec playwright install --help | grep -o '~/.*Library/Caches/ms-playwright' | head -1)" 2>/dev/null || echo "(cache path inspection skipped)"
```

Best-effort verification. If a browser binary is missing, re-run install; if it's still missing, capture the error and report BLOCKED.

---

### Task 8: Write the smoke E2E test (red-green-blue)

- [ ] **Step 1 (RED): Write the failing test**

Create `e2e/tests/smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('App shell smoke', () => {
  test('loads the home page and renders the application root', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
  })
})
```

- [ ] **Step 2 (RED): Run and confirm it passes**

Because the App shell already exists and renders into `#root`, this test should pass immediately, which is correct: the "behavior" being tested is "the existing app shell still loads in a browser." A passing first run proves the harness works.

```
pnpm build
pnpm exec playwright test --project=chromium e2e/tests/smoke.spec.ts
```

Expected: 1 passed. If it fails for environmental reasons (e.g., preview server didn't start), debug the `webServer` config; if it fails because the app shell broke, that is a different issue and should be reported.

- [ ] **Step 3: Commit the failing-then-passing test**

```
git add e2e/tests/smoke.spec.ts playwright.config.ts e2e/
git status --short
```

Defer the commit until the full task's tests are all in place; the Playwright config + smoke test commit together.

---

### Task 9: Write the accessibility E2E test

- [ ] **Step 1 (RED): Write the failing test**

Create `e2e/tests/accessibility.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Home page accessibility', () => {
  test('has no axe-core violations on initial render', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
```

- [ ] **Step 2 (RED): Run the test**

```
pnpm exec playwright test --project=chromium e2e/tests/accessibility.spec.ts
```

If the current App shell has a real axe violation (e.g., missing `<html lang>`, no document title, contrast issue), the test will fail. The expected fix is to add the missing attribute or content in `src/`, NOT to weaken the assertion. Typical fixes the implementer may need to apply:

- `index.html`: ensure `<html lang="en">`, a `<title>`, and a `<meta name="viewport">` are present.
- `src/App.tsx`: ensure the root element has at least one heading (`<h1>`) for screen-reader navigation.

After fixing the underlying violations, re-run:

```
pnpm build
pnpm exec playwright test --project=chromium e2e/tests/accessibility.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Capture remediation in the App shell**

If the App shell needed source edits to clear axe, those edits go into the same commit batch as this task's test. Do not split them.

---

### Task 10: Write the visual-regression test

- [ ] **Step 1: Write the test**

Create `e2e/tests/visual-regression.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Home page visual baseline', () => {
  test('matches the committed screenshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('home.png', { fullPage: true })
  })
})
```

- [ ] **Step 2: Generate initial baselines (Linux container, for CI parity)**

Local macOS rendering will not match Linux CI rendering. Capture baselines inside the Playwright Docker image so the committed PNGs match what CI will see.

```
PLAYWRIGHT_VERSION=$(node -e "console.log(require('@playwright/test/package.json').version)")
docker run --rm \
  -v "$(pwd)":/work \
  -w /work \
  -e HOME=/tmp \
  mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble \
  sh -c 'corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm install --frozen-lockfile && pnpm build && pnpm exec playwright test --project=chromium --update-snapshots e2e/tests/visual-regression.spec.ts'
```

This is the canonical baseline-regeneration command; add it as the `e2e:update-snapshots` script in Task 11.

If Docker is unavailable in the implementer's sandbox, FALLBACK: capture baselines locally with `pnpm exec playwright test --update-snapshots --project=chromium e2e/tests/visual-regression.spec.ts` and note in the PR that CI may need a baseline refresh. The PR reviewer can re-capture via the docker command before merge.

- [ ] **Step 3: Verify the visual regression test now passes**

```
pnpm build
pnpm exec playwright test --project=chromium e2e/tests/visual-regression.spec.ts
```

Expected: 1 passed. The baseline PNG should be committed under `e2e/tests/__screenshots__/visual-regression.spec.ts/`.

- [ ] **Step 4: Inspect the baseline before committing**

Open the generated PNG and confirm it shows the expected App shell. A blank-white PNG or a Vite error overlay is a baseline bug, not a passing test: re-run with `pnpm dev` interactively to debug.

---

### Task 11: Add Playwright and visual-regression scripts to `package.json`

- [ ] **Step 1: Extend the `scripts` block**

Add:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:update-snapshots": "PLAYWRIGHT_VERSION=$(node -e \"console.log(require('@playwright/test/package.json').version)\") && docker run --rm -v \"$(pwd)\":/work -w /work -e HOME=/tmp mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble sh -c 'corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm install --frozen-lockfile && pnpm build && pnpm exec playwright test --update-snapshots'"
  }
}
```

Notes:

- `e2e` is the default invocation (uses the `webServer` block in `playwright.config.ts`).
- `e2e:ui` is the developer-facing interactive UI; not invoked in CI.
- `e2e:update-snapshots` is the canonical baseline-regeneration command; it runs inside the Playwright-pinned Linux container so baselines match CI exactly.

- [ ] **Step 2: Verify `pnpm e2e` runs end-to-end (Chromium project only for the smoke check)**

```
pnpm e2e --project=chromium
```

Expected: smoke, accessibility, and visual-regression tests all pass.

- [ ] **Step 3: Verify the project list includes all three browsers**

```
pnpm exec playwright test --list | head -20
```

Expected: smoke, accessibility, and visual-regression tests are listed under each of `chromium`, `firefox`, `webkit`.

---

### Task 12: Update `.gitignore`, `.prettierignore`, and ESLint ignores

- [ ] **Step 1: Append to `.gitignore`**

Add these entries (preserve existing content; append a single new block):

```
# Storybook
storybook-static/

# Playwright
playwright-report/
test-results/
e2e/.cache/
blob-report/
```

Verify with `git status --short`: confirm previously-untracked Playwright/Storybook directories no longer appear.

- [ ] **Step 2: Append the same paths to `.prettierignore`**

This prevents Prettier from rewriting binary or generated artifacts:

```
storybook-static/
playwright-report/
test-results/
e2e/.cache/
blob-report/
e2e/tests/__screenshots__/
```

Note: `e2e/tests/__screenshots__/` IS committed (the baselines), but contains PNG files, so Prettier should skip the directory entirely.

- [ ] **Step 3: Extend `eslint.config.js` ignores**

In the top-level `{ ignores: [...] }` entry, add the new paths so ESLint does not attempt to parse generated artifacts:

```javascript
{
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
  ],
},
```

- [ ] **Step 4: Verify lint and format checks still pass**

```
pnpm lint
pnpm format:check
```

Both should be clean.

---

### Task 13: Update CI workflow

The existing `.github/workflows/ci.yml` has a single `check` job. This plan adds two more: `storybook-build` and `e2e`. The `e2e` job uses the Playwright container so baselines match the committed ones.

- [ ] **Step 1: Append the `storybook-build` job to `.github/workflows/ci.yml`**

Add after the existing `check` job (keep the file's top section unchanged):

```yaml
storybook-build:
  name: Storybook build
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

    - name: Build Storybook
      run: pnpm build-storybook

    - name: Upload static Storybook
      uses: actions/upload-artifact@v4
      with:
        name: storybook-static
        path: storybook-static
        retention-days: 7
```

- [ ] **Step 2: Append the `e2e` job to `.github/workflows/ci.yml`**

The job runs inside the Playwright container (`mcr.microsoft.com/playwright:v<version>-noble`). The container image version is pinned to the Playwright minor we installed; the workflow reads it from `package.json` at runtime so a future Playwright bump does not break this workflow.

```yaml
e2e:
  name: End-to-end (${{ matrix.project }})
  runs-on: ubuntu-latest
  needs: check
  strategy:
    fail-fast: false
    matrix:
      project: [chromium]
      include:
        - project: chromium
      # Firefox and WebKit run only on main pushes and tag refs; PRs run Chromium only.
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Read Playwright version
      id: pw
      run: |
        v=$(node -e "console.log(require('./node_modules/@playwright/test/package.json').version)" 2>/dev/null \
          || node -e "console.log(require('./package.json').devDependencies['@playwright/test'].replace(/^[\\^~]/, ''))")
        echo "version=$v" >> "$GITHUB_OUTPUT"

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

    - name: Build production bundle
      run: pnpm build

    - name: Run Playwright (${{ matrix.project }})
      run: pnpm exec playwright test --project=${{ matrix.project }}
      env:
        CI: '1'

    - name: Upload Playwright HTML report on failure
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-${{ matrix.project }}
        path: playwright-report
        retention-days: 7
```

Notes:

- The matrix is intentionally Chromium-only on PR for cycle-time reasons. A follow-up plan introduces a conditional matrix expansion for Firefox + WebKit on `push: branches: [main]` and tag refs.
- Browser installs run via `pnpm exec playwright install --with-deps chromium` implicitly when the runner image is the GitHub-hosted ubuntu-latest. If the implementer pulls the Playwright Docker image into the job (alternative pattern: `container: mcr.microsoft.com/playwright:v...`), the install step becomes a no-op. Choose ONE approach and document the choice in CONTRIBUTING.md.

- [ ] **Step 3: Verify the workflow YAML is syntactically valid**

```
pnpm exec --silent js-yaml .github/workflows/ci.yml > /dev/null 2>&1 && echo yaml-ok || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml-ok')"
```

Expected: `yaml-ok`. If neither command runs, fall back to `gh workflow view ci.yml --repo drmrd/vernacular --yaml 2>/dev/null || echo "(skipped)"` and proceed; CI will validate on push.

---

### Task 14: Update `CONTRIBUTING.md`

Add two new sections after the existing "Hooks and release engineering" section.

- [ ] **Step 1: Add a "Storybook" section**

Insert the following H2 section:

```markdown
## Storybook

The component visual documentation surface runs on [Storybook](https://storybook.js.org/) with the `@storybook/react-vite` framework. Start the dev server with `pnpm storybook` (default port `6006`) and build a static deployable copy with `pnpm build-storybook` (output in `storybook-static/`, gitignored).

Each new presentational component should ship with at least one story (`*.stories.tsx` next to the component) covering the default state. Stories double as visual baselines for later phases of the visual-regression suite.
```

- [ ] **Step 2: Add a "End-to-end testing" section**

````markdown
## End-to-end testing

Cross-browser E2E tests use [Playwright](https://playwright.dev/) configured for Chromium, Firefox, and WebKit. Tests live under `e2e/tests/`.

Common commands:

- `pnpm e2e` runs every Playwright test against every configured browser project.
- `pnpm e2e --project=chromium` scopes a run to Chromium (the CI default for PRs).
- `pnpm e2e:ui` opens Playwright's interactive UI runner for local debugging.

Accessibility coverage uses `@axe-core/playwright`: each navigation in an E2E test should pair with an axe scan (see `e2e/tests/accessibility.spec.ts` for the pattern). Treat any new violation as a build break: fix the underlying source, do not weaken the assertion.

### Visual regression baselines

`toHaveScreenshot` baselines are committed under `e2e/tests/__screenshots__/`. To keep local and CI baselines pixel-identical, generate baselines inside the Playwright-pinned Linux container:

```sh
pnpm e2e:update-snapshots
```
````

This pulls `mcr.microsoft.com/playwright:v<installed-version>-noble`, mounts the working tree, runs `pnpm install`, builds the production bundle, and runs `pnpm exec playwright test --update-snapshots`. The resulting PNGs are committed.

If you only have macOS Chromium handy and Docker is not available, you can run `pnpm e2e --update-snapshots --project=chromium` locally and note the discrepancy in your PR: a reviewer or CI maintainer will regenerate via Docker before merge.

````

- [ ] **Step 3: Update the "Pull request checklist" block**

The current checklist references `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Add a new line item:

```markdown
- [ ] `pnpm e2e --project=chromium` passes locally (or note that baselines need a CI refresh in your PR description).
````

- [ ] **Step 4: Verify CONTRIBUTING.md renders cleanly**

```
pnpm format:check
```

Expected: no Prettier diffs against CONTRIBUTING.md.

---

### Task 15: Write ADR-0015

- [ ] **Step 1: Create the file**

`docs/knowledge/decisions/ADR-0015-storybook-playwright-axe.md`:

```markdown
---
slug: decisions/ADR-0015-storybook-playwright-axe
title: 'ADR-0015: Storybook, Playwright, axe-core, and visual regression baselines'
type: decision
tags: [tooling, testing, accessibility, visual-regression, storybook, playwright]
related:
  [
    decisions/ADR-0009-test-pyramid-rgb-tdd,
    decisions/ADR-0012-eslint-guardrails,
    decisions/ADR-0014-hooks-release-tooling,
  ]
sourceFiles:
  [
    .storybook/main.ts,
    .storybook/preview.ts,
    playwright.config.ts,
    e2e/tests/smoke.spec.ts,
    e2e/tests/accessibility.spec.ts,
    e2e/tests/visual-regression.spec.ts,
    .github/workflows/ci.yml,
    package.json,
  ]
status: current
updated: 2026-06-02
---

# ADR-0015: Storybook, Playwright, axe-core, and visual regression baselines

## Status

Accepted.

## Context

The design spec's test pyramid (section 9) calls for:

- Component tests on top of React Testing Library and Storybook play functions.
- End-to-end tests across Chromium, Firefox, and WebKit.
- Visual regression via Playwright's `toHaveScreenshot`, with Storybook stories doubling as baselines as the component surface grows.
- Accessibility coverage via `@axe-core/playwright` on every page transition.

This plan lands the scaffolding for all four with the minimal surface that proves each pipeline end-to-end. A follow-on plan brings Lighthouse, Stryker, performance benchmarks, and the fixtures/factories scaffolds. Later phases expand the visual regression matrix as real components arrive.

## Decision

### Storybook

The framework is `@storybook/react-vite`. Configuration lives under `.storybook/main.ts` and `.storybook/preview.ts`; we hand-wrote both instead of running `storybook init` so we control the surface (no sample stories, no auto-added scripts beyond what we declared). Stories live next to their components (`src/**/*.stories.tsx`). The starter story for `App` proves the pipeline; expansion is component-driven once real components arrive.

Two scripts in `package.json`: `pnpm storybook` for the dev server, `pnpm build-storybook` for the static build (CI artifact, also the future deployment target).

### Playwright

`@playwright/test` configured at `playwright.config.ts` with three browser projects (Chromium, Firefox, WebKit). Tests live under `e2e/tests/`, separate from Vitest unit tests under `src/`. Playwright's webServer block boots `pnpm preview` (Vite production preview) so the suite tests the production bundle, not the dev server.

CI matrix runs Chromium on PRs; Firefox and WebKit are wired into the config but not yet in the CI matrix (a follow-up plan turns them on for main + tag refs).

### axe-core

`@axe-core/playwright` integrates into the E2E suite via `AxeBuilder`. The initial surface is one test scanning the App shell. As real user flows arrive, each navigation in an E2E test pairs with an axe scan; any violation is a build break, and the fix is in the source, not the assertion.

### Visual regression baselines

`toHaveScreenshot` with `maxDiffPixelRatio: 0.02`. Baselines are committed under `e2e/tests/__screenshots__/`. To keep CI and local baselines pixel-identical, we standardize baseline generation on the `mcr.microsoft.com/playwright:v<version>-noble` Docker image, exposed via the `pnpm e2e:update-snapshots` script. Per-platform suffixed baselines (the Playwright default) ARE NOT used; the single committed baseline assumes a Linux noble container, which matches CI.

## Consequences

- Three new CI jobs (`storybook-build`, `e2e (chromium)`, and the existing `check`) raise CI surface area but each job's failure pinpoints a different class of regression.
- Visual regression flakiness will appear as the component surface grows; the `maxDiffPixelRatio: 0.02` budget is a starting point and will be revisited.
- Contributors without Docker need a reviewer to regenerate baselines before merge. Documented in CONTRIBUTING.md.
- Storybook's `addon-essentials` includes the controls, actions, viewport, backgrounds, toolbars, measure, outline, and a11y addons; the `@storybook/addon-a11y` integration overlaps with our `@axe-core/playwright` coverage but operates at a different layer (story-level scan, manual) and is retained.
- The Playwright config's webServer uses `pnpm preview` (production), which requires `pnpm build` to run before E2E. This is wired in the CI job; locally, `pnpm e2e` will boot preview itself if a build artifact exists, otherwise it errors clearly.

## Alternatives considered

- **Cypress.** Rejected: Playwright's multi-browser engine support, faster cold-start, and first-class WebKit testing fit the project's "cross-browser by default" stance better.
- **Per-platform baselines (Playwright default with `-linux.png`, `-darwin.png` suffixes).** Rejected: explodes baseline count without benefit; CI is the source of truth for visual contracts.
- **Storybook test-runner as the primary visual regression channel.** Deferred: the test-runner adds a Storybook-to-Playwright bridge that pays off when there are many stories; one starter story does not justify the moving parts. The plan to revisit this lives in the 0e follow-up backlog.

## References

- Design specification, sections 9.1 through 9.3 (test pyramid, layer details).
- ADR-0009 (test pyramid and red-green-blue TDD).
- ADR-0012 (ESLint guardrails that the scaffolds inherit).
- Playwright snapshot stability guidance (`maxDiffPixelRatio`, containerized baseline generation).
```

- [ ] **Step 2: Verify the ADR file lints (Prettier)**

```
pnpm format:check
```

Expected: no Prettier diff.

---

### Task 16: Update ROADMAP.md

In the foundation work table, locate the row labeled "Storybook, Playwright, axe-core, visual regression baselines" and ensure its status is `in progress`. The row labeled "Lighthouse CI, Stryker, performance harness, fixtures and factories" should read `next`. Earlier rows stay `done`; later rows stay `pending`.

- [ ] **Step 2: Verify Prettier-clean**

```
pnpm format:check
```

Expected: no diff. Tables in Markdown are Prettier-sensitive; if `pnpm format:check` complains, run `pnpm format` and inspect.

---

### Task 17: Update `.superpowers/scratch/progress.md`

Append a new "Storybook + Playwright + axe + visual regression prep notes" block. Capture the chosen versions, the cooldown override (rollup pin), any axe remediations, and the Docker baseline workflow.

- [ ] **Step 1: Edit the scratchpad**

This file is gitignored; do not commit it. Just update it locally so the next loop iteration recovers context faster. Include in the prep notes:

- Storybook version chosen (8.x or 9.x).
- Playwright version chosen.
- Whether docker-based baseline regeneration was used or the macOS fallback.
- Any axe-core violations that required source edits to the App shell.
- The CI workflow choice (`pnpm exec playwright install` vs container image).

---

### Task 18: Regenerate the knowledge index

The knowledge index covers ADR-0015 once the file exists. The pre-commit hook would regenerate automatically but only when `docs/knowledge/**` is staged; regenerate explicitly here to make CI green on first push.

- [ ] **Step 1: Run the indexer**

```
pnpm knowledge:index
```

- [ ] **Step 2: Confirm INDEX.md and index.json updated**

```
git status --short docs/knowledge/
```

Expected: `docs/knowledge/INDEX.md` and `docs/knowledge/index.json` show as modified (and the new `ADR-0015-*.md` shows as untracked).

---

### Task 19: Final verification

Run the full local check chain (matches the pre-push hook), plus the new scaffolds.

- [ ] **Step 1: Local checks**

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

All should pass.

- [ ] **Step 2: Storybook build**

```
pnpm build-storybook
```

Expected: clean build into `storybook-static/`.

- [ ] **Step 3: E2E (Chromium)**

```
pnpm e2e --project=chromium
```

Expected: smoke, accessibility, and visual-regression tests all pass.

- [ ] **Step 4: Re-confirm `pnpm dup` is sane**

```
pnpm dup
```

Expected: jscpd report ends with 0 clones (or only known-acceptable clones); informational only.

- [ ] **Step 5: Capture the final `git status`**

```
git status --short
```

Expected files modified or added (representative; exact list may vary based on installed Storybook version):

```
A  .storybook/main.ts
A  .storybook/preview.ts
A  docs/knowledge/decisions/ADR-0015-storybook-playwright-axe.md
M  docs/knowledge/INDEX.md
M  docs/knowledge/index.json
A  e2e/tests/accessibility.spec.ts
A  e2e/tests/smoke.spec.ts
A  e2e/tests/visual-regression.spec.ts
A  e2e/tests/__screenshots__/visual-regression.spec.ts/home-chromium-linux.png
M  .github/workflows/ci.yml
M  .gitignore
M  .prettierignore
M  CONTRIBUTING.md
M  ROADMAP.md
M  eslint.config.js
M  package.json
M  pnpm-lock.yaml
A  playwright.config.ts
A  src/App.stories.tsx
```

If unexpected files appear (e.g., a Storybook-init sample story leak), clean them up before committing.

---

### Task 20: Commit, push, and open PR

The repo's commit convention is Conventional Commits with sentence-case subjects.

- [ ] **Step 1: Stage and commit dependencies and lockfile**

Group the work into one cohesive commit (this is hand-coded scaffolding, not application code; no red-green-blue cycle is required).

```
git add package.json pnpm-lock.yaml
git commit -m "build: add Storybook, Playwright, and axe-core devDeps"
```

- [ ] **Step 2: Commit Storybook scaffolding**

```
git add .storybook/ src/App.stories.tsx
git commit -m "test: add Storybook config and starter App story"
```

- [ ] **Step 3: Commit Playwright config and E2E tests**

```
git add playwright.config.ts e2e/
git commit -m "test: add Playwright config, smoke, a11y, and visual-regression tests"
```

- [ ] **Step 4: Commit ignore-file updates**

```
git add .gitignore .prettierignore eslint.config.js
git commit -m "chore: ignore Storybook and Playwright build artifacts"
```

- [ ] **Step 5: Commit CI workflow updates**

```
git add .github/workflows/ci.yml
git commit -m "ci: add Storybook build and Playwright E2E jobs"
```

- [ ] **Step 6: Commit CONTRIBUTING and ROADMAP updates**

```
git add CONTRIBUTING.md ROADMAP.md
git commit -m "docs: document Storybook, Playwright, and the baseline workflow"
```

- [ ] **Step 7: Commit ADR-0015 and regenerated index**

```
git add docs/knowledge/decisions/ADR-0015-storybook-playwright-axe.md docs/knowledge/INDEX.md docs/knowledge/index.json
git commit -m "docs: add ADR-0015 for Storybook, Playwright, axe-core, visual regression"
```

- [ ] **Step 8: Push the branch and open the PR**

```
git push -u origin feat/storybook-playwright-axe
```

```
gh pr create --title "Storybook, Playwright, axe-core, and visual regression baselines" --body "$(cat <<'EOF'
## Summary

This branch lands the testing scaffolds called for by the design spec's test pyramid:

- Storybook (`@storybook/react-vite`) with a starter `App.Shell` story; `pnpm storybook` and `pnpm build-storybook` scripts.
- Playwright (`@playwright/test`) configured for Chromium, Firefox, and WebKit; tests under `e2e/tests/`.
- `@axe-core/playwright` integrated into a baseline accessibility test on the home page.
- A first committed visual regression baseline via `toHaveScreenshot` (Linux noble container, Chromium project).
- New CI jobs: `storybook-build` and `e2e (chromium)`; Firefox + WebKit baselines and CI matrix expansion are tracked for a follow-up plan.
- ADR-0015 documenting the choices.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [x] `pnpm build-storybook` produces a clean `storybook-static/`
- [x] `pnpm e2e --project=chromium` passes (smoke, accessibility, visual-regression)
- [x] `pnpm knowledge:index` is clean

## Knowledge graph

- New ADR: `docs/knowledge/decisions/ADR-0015-storybook-playwright-axe.md`
- Regenerated `docs/knowledge/INDEX.md` and `docs/knowledge/index.json`

## Out of scope

- Lighthouse CI, Stryker, performance benchmark harness, `tests/fixtures` and `tests/factories` scaffolds (follow-on plan).
- Storybook test-runner integration that turns stories into Playwright tests (follow-up once the component surface grows).
- Firefox + WebKit in the CI matrix (follow-up; the Playwright config already supports the projects).
- Source code for the six-layer architecture (separate plan).
EOF
)"
```

Capture the PR URL.

---

## Rollback notes

If a later branch needs to revert this work entirely:

1. `git revert` the seven commits in reverse order (ADR, docs, CI, ignores, Playwright, Storybook, deps).
2. Remove `e2e/tests/__screenshots__/` so future baselines do not collide with stale PNGs.
3. Restore CI's single-job configuration (the original was a single `check` job).

The cooldown exclusion list is untouched by this plan (per the boundary: any new exclusion required an ADR-0013 amendment, which would be a separate PR), so no rollback is needed there.

## Implementer expectations

- Treat the cooldown as a hard gate. If install fails because a transitive is too fresh, STOP and report. The exclusion list is governed by ADR-0013.
- Treat axe violations as source bugs, not assertion bugs. If the home page has a violation, fix the home page.
- Treat visual baseline mismatches between CI and local as a workflow problem, not a test problem. The canonical baseline generator is `pnpm e2e:update-snapshots` (Docker).
- Keep the surface minimal: one starter story, one smoke test, one accessibility test, one visual regression test. Expansion is for later phases.
