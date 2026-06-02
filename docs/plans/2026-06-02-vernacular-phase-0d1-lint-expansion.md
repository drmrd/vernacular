# Vernacular: Phase 0d.1 Lint Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the ESLint configuration from the minimal Phase 0a baseline to the full Clean Code guardrail set specified in `.claude/rules.md` and the design specification section 9.8. Add `eslint-plugin-boundaries` to enforce the six-layer dependency direction (with rules sized to match the current empty state, growing strict once Phase 0f introduces real source directories). Add `eslint-plugin-unused-imports` for the unused-imports rule. Add `jscpd` for duplicate-code detection.

**Architecture:** All configuration is in `eslint.config.js` (flat config) plus a `.jscpd.json` for the duplicate-detection settings. The Vitest test files override a small number of rules that are too strict for tests (`no-magic-numbers` is the main one). No runtime code changes.

**Tech Stack:** Markdown only, plus pnpm dev dependencies. The cooldown applies; pin to versions older than 15 days.

**Scope boundary:** This plan does NOT add Husky pre-commit hooks (Phase 0d.2), commitlint (0d.2), release-please (0d.2), PR or issue templates (0d.2), or any custom local ESLint rules (deferred to 0d.x follow-up). It also does NOT add Playwright, Storybook, axe-core, Lighthouse, Stryker, or any test scaffolds (Phase 0e). And it does NOT introduce any `core/`, `engine/`, `bridge/`, `editor/`, `app/`, or `storage/` source directories (Phase 0f).

---

## File Structure

| File                                                     | Purpose                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `eslint.config.js`                                       | Replaced with the full guardrail set; per-file overrides for tests and config files |
| `.jscpd.json`                                            | jscpd configuration (min token threshold, ignore patterns)                          |
| `package.json`                                           | New devDependencies; new `pnpm dup` script                                          |
| `pnpm-lock.yaml`                                         | Updated lockfile                                                                    |
| `CONTRIBUTING.md`                                        | Note that lint is stricter now                                                      |
| `docs/knowledge/decisions/ADR-0012-eslint-guardrails.md` | New ADR documenting the rule set and the boundaries plugin choice                   |
| `docs/knowledge/INDEX.md`, `docs/knowledge/index.json`   | Regenerated to reflect ADR-0012                                                     |
| `ROADMAP.md`                                             | Marks 0d.1 in progress                                                              |

No source files are modified. If a lint rule fires on the existing tiny source (App.tsx, App.test.tsx, main.tsx, setupTests.ts), the plan either tunes the rule or adjusts the source.

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1: Confirm working directory and branch**

```
pwd
git branch --show-current
git status --short
```

Expected: `/Users/dan/workspace/vernacular`, branch `feat/phase-0d1-lint-expansion`, clean tree.

If wrong, STOP and report BLOCKED.

---

### Task 2: Install new devDependencies under cooldown

The 15-day cooldown is in effect (`.npmrc` `minimum-release-age=21600`). pnpm will refuse any package whose newest matching version is younger than 15 days; for established packages this is rarely an issue.

- [ ] **Step 1: Install the packages**

```
pnpm add -D eslint-plugin-boundaries eslint-plugin-unused-imports jscpd
```

If any install fails because the only available matching version is too new, fall back to an explicit older version (use `pnpm view <pkg> versions | tail -10` to find an older one and pin with `pnpm add -D <pkg>@<version>`). Report which package and which version was used.

- [ ] **Step 2: Verify**

```
pnpm ls eslint-plugin-boundaries eslint-plugin-unused-imports jscpd --depth=0
```

Expected: each package listed with a version. Capture the version each resolved to (cooldown may have selected older patches).

---

### Task 3: Update `eslint.config.js` with the full guardrail set

**Files:**

- Modify: `eslint.config.js` (REPLACE entire content)

The new config keeps the Phase 0a base (TS, React Hooks, React Refresh) and adds:

- `@typescript-eslint/naming-convention` strict for types, interfaces, classes, enums, variables, functions
- `max-lines-per-function`: 40 warn / 80 error (skip blank lines and comments)
- `max-lines`: 300 warn / 500 error
- `max-params`: 3 warn / 5 error
- `complexity`: 10 warn / 15 error
- `max-depth`: 3 warn / 4 error
- `no-nested-ternary`: error
- `no-magic-numbers`: warn, with reasonable exemptions; overridden off in test files
- `no-console`: warn (`console.error` and `console.warn` allowed; `console.log` is the target)
- `unused-imports/no-unused-imports`: error
- `unused-imports/no-unused-vars`: warn
- `eslint-plugin-boundaries` configured with the six element types; rules sized to match the current empty layer state but ready to enforce as soon as Phase 0f introduces directories

Per-file overrides:

- `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}`: turn off `no-magic-numbers` (literals are natural in test assertions); relax `max-lines-per-function` to 120
- `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`: relax `no-magic-numbers` (config values often are magic numbers); use Node globals

- [ ] **Step 1: Write the new `eslint.config.js`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import boundaries from 'eslint-plugin-boundaries'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'

const layerElements = [
  { type: 'core', pattern: 'core/*' },
  { type: 'storage', pattern: 'storage/*' },
  { type: 'engine', pattern: 'engine/*' },
  { type: 'bridge', pattern: 'bridge/*' },
  { type: 'editor', pattern: 'editor/*' },
  { type: 'app', pattern: 'app/*' },
]

const layerRules = [
  { from: ['core'], allow: [] },
  { from: ['storage'], allow: ['core'] },
  { from: ['engine'], allow: ['core', 'storage'] },
  { from: ['bridge'], allow: ['core', 'storage', 'engine'] },
  { from: ['editor'], allow: ['core', 'storage', 'engine', 'bridge'] },
  { from: ['app'], allow: ['core', 'storage', 'engine', 'bridge', 'editor'] },
]

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.superpowers', 'pnpm-lock.yaml'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      boundaries,
      'unused-imports': unusedImports,
    },
    settings: {
      'boundaries/elements': layerElements,
      'boundaries/include': [
        'core/**',
        'storage/**',
        'engine/**',
        'bridge/**',
        'editor/**',
        'app/**',
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Naming
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
      ],

      // Size and shape limits
      'max-lines-per-function': [
        'warn',
        { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 3],
      complexity: ['warn', 10],
      'max-depth': ['warn', 3],
      'no-nested-ternary': 'error',
      'no-magic-numbers': [
        'warn',
        { ignore: [-1, 0, 1, 2, 100], ignoreArrayIndexes: true, enforceConst: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Unused
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Layer boundaries
      'boundaries/element-types': ['error', { default: 'disallow', rules: layerRules }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'no-magic-numbers': 'off',
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      'no-magic-numbers': 'off',
    },
  },
)
```

- [ ] **Step 2: Verify the config parses**

```
pnpm exec eslint --print-config eslint.config.js > /dev/null && echo ok
```

Expected: `ok`.

---

### Task 4: Update `package.json` with the `dup` script and confirm new devDeps

- [ ] **Step 1: Add the script**

Add a `"dup": "jscpd --silent ."` entry in the `scripts` block, right after `knowledge:index`. The resulting `scripts` block should look like:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "knowledge:index": "node scripts/knowledge-index.mjs",
    "dup": "jscpd --silent ."
  },
```

- [ ] **Step 2: Verify**

```
node -e "const p=require('./package.json'); console.log(p.scripts.dup);"
```

Expected: `jscpd --silent .`.

---

### Task 5: Create `.jscpd.json` configuration

**Files:**

- Create: `.jscpd.json`

- [ ] **Step 1: Write the file**

```json
{
  "$schema": "https://raw.githubusercontent.com/kucherenko/jscpd/master/jscpd.schema.json",
  "threshold": 0,
  "minTokens": 50,
  "minLines": 5,
  "reporters": ["console", "json"],
  "output": "./reports/jscpd",
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.superpowers/**",
    "**/pnpm-lock.yaml",
    "**/CHANGELOG.md",
    "**/LICENSE",
    "**/CODE_OF_CONDUCT.md",
    "**/docs/specs/**",
    "**/docs/plans/**",
    "**/docs/knowledge/INDEX.md",
    "**/docs/knowledge/index.json"
  ],
  "absolute": false,
  "noSymlinks": true,
  "gitignore": true
}
```

- [ ] **Step 2: Add `reports/` to `.gitignore`**

Append `reports/` to `.gitignore`.

- [ ] **Step 3: Verify**

```
pnpm dup 2>&1 | tail -5
```

Expected: jscpd runs and reports either no duplicates or a small number; exits with code 0 because `threshold: 0` permits any duplicate fraction. We track the trend; this is the baseline.

---

### Task 6: Run the new lint config and fix any incidental violations

The Phase 0a source is tiny: `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, `src/setupTests.ts`, plus config files. The new rules should mostly not fire. The likely candidate is `unused-imports/no-unused-imports`, which might flag nothing in the current code.

- [ ] **Step 1: Run lint**

```
pnpm lint
```

If clean: proceed to Task 7. If violations:

- For ESLint _errors_: fix the source. Common fix: remove unused imports, rename to satisfy naming-convention.
- For ESLint _warnings_: report them as informational; warnings are not blocking but we want them at zero on first commit. Either fix the source or tune the rule for that file.

Capture the original output and any fixes you make.

- [ ] **Step 2: Re-run lint until clean**

```
pnpm lint
```

Expected: exits 0 with no output.

---

### Task 7: Create ADR-0012 documenting the lint guardrails

**Files:**

- Create: `docs/knowledge/decisions/ADR-0012-eslint-guardrails.md`

- [ ] **Step 1: Write the ADR**

```markdown
---
slug: decisions/ADR-0012-eslint-guardrails
title: 'ADR-0012: ESLint guardrails and layer boundary enforcement'
type: decision
tags: [linting, eslint, clean-code, boundaries, code-quality]
related: [decisions/ADR-0001-six-layer-architecture, decisions/ADR-0009-test-pyramid-rgb-tdd]
sourceFiles: [eslint.config.js, .claude/rules.md, .jscpd.json]
status: current
updated: 2026-06-02
---

# ADR-0012: ESLint guardrails and layer boundary enforcement

## Status

Accepted. Implemented in Phase 0d.1.

## Context

The Phase 0a ESLint configuration covered only TypeScript correctness, React Hooks, and React Refresh. The Clean Code rubric in `.claude/rules.md` calls for size and complexity limits, naming consistency, unused-symbol detection, and most importantly the six-layer dependency direction. Without mechanical enforcement, these intents drift; a contributor (human or agent) writes a 200-line function or imports Three.js from a `core/` file and the violation is only caught at code review.

## Decision

Three plugin additions and one rule expansion:

- `eslint-plugin-boundaries` enforces the six-layer dependency direction. The `boundaries/elements` settings map each layer name to its directory; the `boundaries/element-types` rule whitelists allowed cross-layer imports. `core/` may import nothing else; `app/` may import everything below it.
- `eslint-plugin-unused-imports` cleans up unused imports (error) and unused locals (warn with `_` prefix exemption).
- `jscpd` is configured for repository-wide duplicate detection via `pnpm dup`. Reports go to `reports/jscpd/`.
- The full Clean Code rule set lands: `max-lines-per-function`, `max-lines`, `max-params`, `complexity`, `max-depth`, `no-nested-ternary`, `no-magic-numbers`, `no-console`, plus `@typescript-eslint/naming-convention` for type-and-identifier shape.

Test files and config files get per-file overrides (notably `no-magic-numbers` off for tests where literal expectations are natural).

## Consequences

- The mechanical guard catches most layer violations before code review. The boundaries plugin is configured today against directories that do not yet exist (Phase 0f introduces them); it simply matches nothing today and starts enforcing as soon as `core/` and friends appear.
- A function approaching the size limit forces a decomposition decision, which is the right pressure for the project's architecture.
- Test files keep the literal numeric expectations the FIRST discipline calls for (`expect(x).toBe(42)`), without rule noise.
- The custom rules `no-direct-three-imports-outside-engine` and `no-direct-storage-API-outside-storage` listed in the design specification are not implemented yet. The boundaries plugin covers the layer-direction half of their intent; the import-path-specific half is deferred to a follow-up (0d.x) when Phase 0f introduces the imports in question.

## References

- Design specification, section 9.8 (Automated guardrails).
- `.claude/rules.md` (the rubric the rules realize).
- ADR-0001 (the six-layer architecture).
```

- [ ] **Step 2: Verify**

```
head -3 docs/knowledge/decisions/ADR-0012-eslint-guardrails.md
```

Expected: the slug line.

---

### Task 8: Regenerate the knowledge index

- [ ] **Step 1: Run**

```
pnpm knowledge:index
```

Expected output: `indexed 13 entries; wrote docs/knowledge/INDEX.md and docs/knowledge/index.json`.

- [ ] **Step 2: Verify**

```
node -e "console.log(JSON.parse(require('fs').readFileSync('docs/knowledge/index.json','utf8')).entries.length)"
```

Expected: `13`.

---

### Task 9: Update `CONTRIBUTING.md` to note the stricter lint

- [ ] **Step 1: Locate the conventions block**

Find the `Code style` bullet that currently reads:

```
- **Code style** is enforced by ESLint and Prettier. Run
  `pnpm lint` and `pnpm format:check` before pushing; `pnpm format`
  fixes most issues automatically. Stricter Clean Code rules
  (complexity caps, function length caps, layer-boundary rules) land
  in Phase 0d.
```

Replace it with:

```
- **Code style** is enforced by ESLint and Prettier. Run
  `pnpm lint` and `pnpm format:check` before pushing; `pnpm format`
  fixes most issues automatically. The Clean Code rule set (function
  length, parameter count, cyclomatic complexity, nesting depth,
  layer boundaries, naming convention, unused imports) lands as
  warnings or errors per `eslint.config.js`. Test files relax
  `no-magic-numbers` and lift the function-length cap so literal
  expectations remain natural.
- **Duplicate detection.** Run `pnpm dup` for a jscpd duplicate
  report. The configured threshold is informational (no CI fail);
  use the report to spot refactor opportunities.
```

- [ ] **Step 2: Verify**

```
grep -c "Duplicate detection" CONTRIBUTING.md
```

Expected: `1`.

---

### Task 10: Update ROADMAP

- [ ] **Step 1: Promote 0d.1**

In `ROADMAP.md`, replace the row:

```
| 0d    | Lint rule expansion, Husky, commitlint, release-please  | pending     |
```

with two rows:

```
| 0d.1  | ESLint guardrails + boundaries plugin + jscpd           | in progress |
| 0d.2  | Husky + commitlint + release-please + PR/issue templates | pending     |
```

- [ ] **Step 2: Verify**

```
grep -c "0d.1.*in progress" ROADMAP.md
```

Expected: `1`.

---

### Task 11: Apply Prettier formatting

- [ ] **Step 1: Format**

```
pnpm format
```

- [ ] **Step 2: Verify**

```
pnpm format:check
```

Expected: `All matched files use Prettier code style!`.

---

### Task 12: All-checks rehearsal

- [ ] **Step 1: Run**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 2: Verify the knowledge index is in sync**

```
pnpm knowledge:index
git diff --quiet docs/knowledge/INDEX.md docs/knowledge/index.json && echo "index in sync" || echo "OUT OF SYNC"
```

Expected: `index in sync`.

---

### Task 13: Commit

- [ ] **Step 1: Stage**

```
git add \
  eslint.config.js \
  package.json \
  pnpm-lock.yaml \
  .jscpd.json \
  .gitignore \
  CONTRIBUTING.md \
  ROADMAP.md \
  docs/knowledge/decisions/ADR-0012-eslint-guardrails.md \
  docs/knowledge/INDEX.md \
  docs/knowledge/index.json
```

If any source files (`src/*.ts`, `src/*.tsx`) needed fixes in Task 6, also stage them.

- [ ] **Step 2: Verify staged set**

```
git status --short
```

Expected: only the files listed plus any Task 6 fixes.

- [ ] **Step 3: Pre-commit check chain**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```
git commit -m "$(cat <<'EOF'
chore(lint): expand ESLint to the full Clean Code guardrail set (Phase 0d.1)

Adds the full guardrail set called for by .claude/rules.md and the
design specification section 9.8:

* Size and shape limits: max-lines-per-function (40 warn, 80 error),
  max-lines (300/500), max-params (3 warn), complexity (10 warn),
  max-depth (3 warn), no-nested-ternary (error)
* Hygiene: no-magic-numbers (warn with sensible exemptions; off in
  test files), no-console (warn; warn/error allowed)
* Naming: @typescript-eslint/naming-convention strict for variables,
  functions, types, enums
* Unused: eslint-plugin-unused-imports for unused-imports error and
  unused-vars warn
* Layer direction: eslint-plugin-boundaries with six elements
  matching the planned core/storage/engine/bridge/editor/app
  directories. Today the directories do not exist so the rule
  matches nothing; once Phase 0f introduces them it enforces.

Per-file overrides keep test files practical (no-magic-numbers off,
function-length cap relaxed) and config files unfettered by
no-magic-numbers.

Also:

* jscpd duplicate detection via `pnpm dup`; reports land in
  reports/ (gitignored). Threshold is informational today.
* ADR-0012 documents the rule set, the boundaries plugin choice,
  and what was deferred to a 0d.x follow-up (the custom
  no-direct-three-imports-outside-engine and
  no-direct-storage-API-outside-storage rules).
* CONTRIBUTING.md and ROADMAP.md updates.

Phase 0d.2 (Husky pre-commit hooks, commitlint, release-please,
PR and issue templates) builds on this.
EOF
)"
```

- [ ] **Step 5: Verify**

```
git log --oneline -3
git log -1 --format=%B | grep -c "^Co-Authored-By:"
```

Expected: new commit at top; trailer count `0`.

---

### Task 14: Push and open PR

- [ ] **Step 1: Push**

```
git push -u origin feat/phase-0d1-lint-expansion
```

- [ ] **Step 2: Open the PR**

```
gh pr create --base main --head feat/phase-0d1-lint-expansion --title "Phase 0d.1: ESLint guardrails + boundaries plugin + jscpd" --body "$(cat <<'EOF'
## Summary

Phase 0d.1 of the Vernacular implementation per `docs/plans/2026-06-02-vernacular-phase-0d1-lint-expansion.md`. Expands ESLint to the full Clean Code guardrail set with the six-layer boundary plugin sized to match the current empty layer state (it begins enforcing automatically as soon as Phase 0f introduces the directories). Adds jscpd for duplicate detection.

## Files

* `eslint.config.js`: full rule set (size, complexity, depth, naming, unused, boundaries)
* `package.json`: new dev dependencies (eslint-plugin-boundaries, eslint-plugin-unused-imports, jscpd); new `pnpm dup` script
* `.jscpd.json`: duplicate detection config
* `.gitignore`: `reports/`
* `docs/knowledge/decisions/ADR-0012-eslint-guardrails.md`: ADR
* `docs/knowledge/INDEX.md` + `index.json`: regenerated
* `CONTRIBUTING.md`: lint-stricter note
* `ROADMAP.md`: 0d.1 promoted to in progress

## Test plan

- [ ] CI green
- [ ] `pnpm lint` exits 0 with no output on the existing tiny source
- [ ] `pnpm dup` runs and produces a baseline report (informational)
- [ ] `pnpm knowledge:index` is idempotent (no diff after a re-run)
- [ ] Manual: review ADR-0012 for accuracy

## Out of scope

Phase 0d.2 (Husky, commitlint, release-please, PR/issue templates), Phase 0d.x (custom local ESLint rules: no-direct-three-imports-outside-engine and no-direct-storage-API-outside-storage), Phase 0e (testing scaffolds), Phase 0f+ (source skeleton).
EOF
)"
```

- [ ] **Step 3: Verify**

```
gh pr view --json url,state --jq '"\(.state) \(.url)"'
```

Expected: state OPEN with the PR URL.

---

## What Phase 0d.1 explicitly does NOT include

- Husky pre-commit hooks (Phase 0d.2)
- commitlint enforcement of Conventional Commits (Phase 0d.2)
- release-please workflow and configuration (Phase 0d.2)
- `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/*` (Phase 0d.2)
- Custom local ESLint rules `no-direct-three-imports-outside-engine` and `no-direct-storage-API-outside-storage` (deferred to a Phase 0d.x follow-up once Phase 0f's source skeleton lands and the imports in question begin appearing)
- Phase 0e testing scaffolds (Playwright, Storybook, Lighthouse, axe-core, Stryker, perf harness)

---

## Self-review notes (planning author only)

Spec coverage of this plan vs. spec section 9.8:

- `max-lines-per-function`: 40 warn, 80 error -> matches.
- `max-lines`: 300 warn, 500 error -> matches.
- `max-params`: 3 warn -> matches (5 error implied by escalating tier; ESLint does not support two thresholds natively, so we land at warn 3).
- `complexity`: 10 warn -> matches.
- `max-depth`: 3 warn -> matches.
- `@typescript-eslint/naming-convention` strict: implemented with sensible variant allowances per identifier kind.
- `no-magic-numbers`: warn with exemptions -> matches.
- `no-nested-ternary`: error -> matches.
- `no-console`: warn -> matches.
- `import/no-cycle`: not implemented yet because Phase 0f source directories do not exist; `eslint-plugin-boundaries` covers the import-direction half. Add `import/no-cycle` as a Phase 0d.x or Phase 0f follow-up when there is a non-trivial import graph.
- `import/no-internal-modules`: same reasoning; deferred.
- `boundaries/element-types`: implemented.
- Custom no-direct-three-imports-outside-engine and no-direct-storage-API-outside-storage: deferred (documented in ADR-0012).
- `jsdoc/require-jsdoc` on public APIs: deferred until Phase 0f introduces public APIs.
- `unused-imports`: implemented.
- `jscpd`: implemented as informational `pnpm dup`.

Placeholder scan: none.

Type consistency: layer element names (`core`, `storage`, `engine`, `bridge`, `editor`, `app`) match the six-layer architecture in ADR-0001 and the spec.

Em-dash audit on this plan: ran before commit.
