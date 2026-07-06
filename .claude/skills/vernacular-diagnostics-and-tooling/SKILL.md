---
name: vernacular-diagnostics-and-tooling
description: Use when a Vernacular diagnostic command must be run or its output decoded; rgb:audit ping-pong violations (ordering, independence, blue), integration:audit journey gaps, CI test selection (select-tests.mjs, decide.mjs), schema:check drift, knowledge:index frontmatter errors, story-coverage allowlist failures, webgl2-probe JSON, Stryker mutation scores, lhci budgets, jscpd duplication, coverage runs, or when unsure which tool answers a question or what an exit code means.
---

# Vernacular diagnostics and tooling

## Overview

Measure instead of eyeball: this repo has a purpose-built diagnostic for nearly every quality question, each with a stable exit-code contract. Run the right tool, read its output literally, and trust its verdict over intuition.

## When to use

- A CI job failed and you need to reproduce or decode its verdict locally.
- Before opening a PR, to predict what CI will run and whether it will pass.
- You changed core model types, ADR frontmatter, a component module, or commit history shape and want the mechanical check.
- You need evidence (duplication, mutation score, coverage, WebGL capability) instead of a guess.

## When NOT to use

- Deciding whether a failing gate should be waived or a baseline refreshed: that is vernacular-validation-and-qa (gate map, baseline tiers, evidence standards).
- Fixing what a tool found (flaky test, rendering defect, layout bug): vernacular-debugging-playbook.
- Rules of the red-green-blue cycle itself and what commits are allowed: vernacular-change-control.
- Authoring or repairing ADRs, specs, and the knowledge graph content: vernacular-docs-and-writing.
- CI labels, URL params, and other knobs as a catalog: vernacular-config-and-flags.
- Repairing a violating branch history (rebuilds, marker commits, merge order): vernacular-parallel-delivery.

## Quick reference: which tool answers which question

All commands run from the repo root. "Exit" is the observed contract.

| Question                                                 | Command                                                                             | Exit                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Did this branch follow red-green-blue?                   | `pnpm rgb:audit --range origin/main..HEAD`                                          | 0 clean, 1 violations, 2 internal fault          |
| Is every required user journey proven by an e2e test?    | `pnpm integration:audit`                                                            | 0 clean, 1 missing, 2 internal fault             |
| Which unit tests will CI run for my branch?              | `node scripts/ci/select-tests.mjs --base origin/main`                               | always 0 (answer is in output), 2 internal fault |
| Will CI run e2e / visual / lighthouse for my PR?         | `GITHUB_EVENT_NAME=pull_request node scripts/ci/decide.mjs --base origin/main`      | always 0, 2 internal fault                       |
| Did I change the model without regenerating the schema?  | `pnpm schema:check`                                                                 | 0 up to date, 1 drift                            |
| Is every knowledge entry's frontmatter valid?            | `pnpm knowledge:index`                                                              | 0 indexed, 1 validation error (uncaught throw)   |
| Does a new component need a story or an allowlist entry? | `pnpm exec vitest run --project unit scripts/story-coverage/story-coverage.test.ts` | vitest: 0 pass, 1 fail                           |
| Can a GPU-less CI runner make a usable WebGL2 context?   | `node scripts/ci-probes/webgl2-probe.mjs`                                           | always 0 by design                               |
| How good are the core/ tests really?                     | `pnpm mutate` (slow; the weekly lane has never gone green, see mutate section)      | 0 if score >= 50, 1 below break or on failure    |
| Are performance and accessibility budgets met?           | `pnpm build && pnpm lhci`                                                           | 0 pass, nonzero on error-level assertion         |
| Where is copy-paste duplication?                         | `pnpm dup` (advisory)                                                               | 1 in practice; see below                         |
| What code is untested?                                   | `pnpm exec vitest run --project unit --coverage`                                    | test exit code; coverage never gates             |

`pnpm` wraps a failing script with an `ELIFECYCLE` line but preserves the script's exit code.

## rgb:audit: the TDD history auditor (ADR-0025)

Command: `pnpm rgb:audit --range <a>..<b>`. The range is also accepted as a positional argument; with no argument it defaults to `main..HEAD`. CI's ping-pong job (pull requests only) runs `pnpm rgb:audit --range "origin/<base>..HEAD"`, so audit against `origin/main..HEAD`, not local `main`, or a stale local main skews the verdict.

It walks `git log --reverse --no-merges` over the range and classifies each commit by Conventional Commit type. The classification table (which types count as RED, GREEN, BLUE, or exempt), the three cycle rules, and the `Infrastructure: <reason>` trailer policy have one home: vernacular-change-control (rgb:audit section). This section covers only invoking the auditor and decoding what it prints.

A `!` breaking marker (`feat!:`) parses fine. Violation types, with the exact message shapes:

| Rule           | Message                                                        | Meaning                                                                    |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ordering`     | `GREEN commit <sha> has no preceding RED test commit in range` | a `feat:`/`fix:` landed without an unconsumed `test:` commit before it     |
| `independence` | `GREEN commit <sha> modifies test file(s): <list>`             | a GREEN commit touched `*.test.{ts,tsx,mjs,js}`                            |
| `blue`         | `GREEN commit <sha> not closed by a BLUE refactor`             | no `refactor:` between that GREEN and the next RED or the end of the range |

Output is one line per violation prefixed `[rule]`, or `rgb:audit: clean (<range>)`. The auditor is static: it never runs the tests, so a GREEN that does not actually make its RED pass still slips through (ADR-0025 defers that to a possible `--deep` mode).

Range-boundary trap, demonstrated on this repo: auditing `7fc9cb23~4..7fc9cb23` reports a `[blue]` violation because the range ends on a GREEN commit, while `7fc9cb23~4..cdbe6a79` (one commit later, the closing `refactor:`) is clean. Before believing a `blue` violation on the final commit, check whether the closing BLUE sits just outside your range.

## integration:audit: the journey-coverage gate

Command: `pnpm integration:audit`. No flags. It reads `e2e/journey-coverage.json` (a `capabilities` array of `{ id, title, status }` where status is `required` or `pending`), extracts every `test('<title>')` string literal from `e2e/tests/journeys/*.spec.ts`, and fails if any `required` capability's `title` has no exactly matching journey test title.

- Clean output: `integration-audit: clean. 11 required capabilities covered, 0 pending.` (counts as of 2026-07-05).
- Failure output lists `<id>: no journey test titled "<title>"` per miss, exit 1.
- CI runs it inside the check job on every event, so it gates every PR.

Traps: the match is exact string equality on the title, so retitling a journey test breaks the audit until the matrix entry is updated in the same commit. The title extractor is a regex over `test(` calls with a plain quoted literal; a computed or interpolated title is invisible to it. When you ship a new user-facing capability, add both the matrix entry and the journey test together; use `pending` status for a capability that is specified but not yet testable.

## select-tests.mjs and decide.mjs: what CI will run for a branch

CI decides in two places (`.github/workflows/ci.yml`): the check job selects unit-test paths, and the decide job switches the heavy suites. Both are plain node scripts you can run locally; when `GITHUB_OUTPUT` is unset they print their `key=value` outputs to stdout followed by a human summary line.

### Unit selection: `node scripts/ci/select-tests.mjs --base origin/main`

Reads `git diff --name-only origin/main...HEAD` plus `ci-coupling.json`, and emits `mode` and `paths`:

- `mode=all`: a global input changed. The `runAll` list is `vite.config.ts`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `.nvmrc`; the `runAllPrefixes` list is `src/`. CI runs the full `pnpm test`.
- `mode=some`: CI runs `pnpm exec vitest run --project unit <paths>`. Paths are layer directories computed as the reverse-dependency closure over the linear layer chain `core, storage, engine, bridge, editor, app` (change core/ and everything above it runs; change app/ and only app/ runs). This is sound because eslint-plugin-boundaries forbids upward imports. Coupling edges add layers for non-code inputs: `schema/` pulls in `core`, `resources/` pulls in `engine`. Changes under `tests/` or `scripts/` add those directories themselves.
- `mode=none`: no unit-bearing file changed; the PR skips unit tests and the merge queue backstop runs the full suite.

`pnpm test:select` invokes the same script; the direct node form shown above is the unambiguous way to pass `--base`.

### Heavy suites: `GITHUB_EVENT_NAME=pull_request node scripts/ci/decide.mjs --base origin/main`

Decision rules, in order:

1. Event is not `pull_request` (push to main, merge_group): e2e, visual, and lighthouse are all true. The merge queue is the backstop that keeps main green.
2. PR label `ci:full`: all true. Label `ci:skip-heavy`: all false.
3. Otherwise: `e2e` = label `run:e2e`, or (PR not draft AND a changed file starts with `app/`, `editor/`, `bridge/`, `engine/`, or `e2e/`). `visual` = label `run:visual`, or (not draft AND (any changed `*.stories.tsx` OR a path under `editor/`, `bridge/react/`, or `.storybook/`)). `lighthouse` = false, always, on PRs.

Labels are applied by issue comments `/test e2e`, `/test visual`, `/ci full`, `/ci skip-heavy` (see vernacular-config-and-flags). Locally, without `PR_NUMBER` set, labels read as empty and draft as false, which is the right approximation for a non-draft unlabeled PR. To include live label and draft state: `GITHUB_EVENT_NAME=pull_request GITHUB_REPOSITORY=drmrd/vernacular PR_NUMBER=<n> node scripts/ci/decide.mjs --base origin/main` (needs `gh` auth).

The decide _job_ also emits a fourth output the script does not: `scene`, true when any `*-scene-webgl-linux.png` baseline is committed under `e2e/tests`. As of 2026-07-05 eleven are committed, so the scene-visual lane runs; the ci.yml comment saying no tree has them is stale.

## schema:check: schema drift

Command: `pnpm schema:check`. Rebuilds the project JSON Schema in memory from `core` (the version number is `CURRENT_SCHEMA_VERSION` in `core/model/factories.ts`, 16 as of 2026-07-05) and byte-compares it with the committed `schema/16/vernacular.schema.json`.

- Up to date: `schema/16/vernacular.schema.json is up to date.`, exit 0.
- Drift: `Schema drift: ... Run \`pnpm schema:generate\`.`, exit 1.

Reach for it after touching core model types or `scripts/schema/build-schema.mjs`. The fix is `pnpm schema:generate` plus committing the result; whether the change needs a version bump and a migration is a design question (see vernacular-domain-reference for the format, vernacular-change-control for gating). Note `ci-coupling.json` couples `schema/` changes to the `core` unit tests.

## knowledge:index: the local ADR index (and the issue #440 failure mode)

Command: `pnpm knowledge:index`. Regenerates `docs/knowledge/INDEX.md` and `docs/knowledge/index.json`, both gitignored local caches (`docs/knowledge/*` is ignored except `decisions/`). Success prints `indexed N entries; wrote ...`.

It validates every entry's frontmatter and dies on the first offender with an uncaught throw (exit 1): required keys `slug title type tags related sourceFiles status updated`; `type` in `decision, pattern, anti-pattern, component, runbook, incident, glossary`; `status` in `proposed, current, superseded, deprecated`; `slug` must equal the path under `docs/knowledge/` minus `.md`; `updated` must be `YYYY-MM-DD`.

The issue #440 failure mode (issue still open as of 2026-07-05): ADRs naturally say "Accepted" in their Status body section, and five ADRs once carried `status: accepted` in frontmatter too, which the enum rejects, killing index regeneration for every future session with `<file>: invalid status accepted; allowed: proposed, current, superseded, deprecated`. The five were normalized to `current` (commit 07690206) and `proposed` was added to the enum (commit 96165aa1), but the enum still has no `accepted` alias. Rule: the body heading may read Accepted; the frontmatter status must be `current`. ADR authoring conventions live in vernacular-docs-and-writing.

## Story-coverage guardrail (ADR-0111, ADR-0124)

This is not a script but a live unit test: `scripts/story-coverage/story-coverage.test.ts`, part of the unit suite. Note the selection nuance: a PR that adds an uncovered component under `editor/` selects `editor/` (not `scripts/`), so the guard may first fire in the merge queue's full run rather than on the PR. Run it alone with `pnpm exec vitest run --project unit scripts/story-coverage/story-coverage.test.ts`.

It walks `app/`, `editor/`, and `bridge/` for `.tsx` modules that export a PascalCase component (regex signal, no AST; hooks and contexts excluded) and fails three ways:

| Failure list   | Meaning                                                                         | Fix                                                                                                            |
| -------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `unlisted`     | component module with no co-located `<name>.stories.tsx` and no allowlist entry | write a story, or add an entry to `scripts/story-coverage/uncovered-components.ts` with a full-sentence reason |
| `staleCovered` | allowlist entry that now has a story                                            | delete the entry                                                                                               |
| `staleMissing` | allowlist entry whose file no longer exists                                     | delete the entry                                                                                               |

The allowlist is a ratchet (ADR-0111): it only shrinks as stories land. ADR-0124 settled that the remaining bridge/scene and full-tree-orchestrator entries are permanent: they need a live R3F canvas, WebGPU, or the whole provider tree, so do not try to "fix" them with contrived stories. Entries store repo-relative POSIX paths.

## webgl2-probe.mjs: what it probes and how to read its JSON

Command: `node scripts/ci-probes/webgl2-probe.mjs` (needs Playwright chromium installed). On CI: manually dispatch `.github/workflows/webgl2-probe.yml`. It is the standing investigation tool for issue #401: can a GPU-less linux runner produce a usable WebGL2 context via a software rasterizer.

It launches headless chromium under three flag configs (`default`, `angle-swiftshader`, `gl-swiftshader`) and, only if none is usable, two `--enable-unsafe-swiftshader` follow-ups. Each config prints one JSON line as it completes (so partial results survive a crash), then a summary array and a verdict line. Fields per line:

- `config`, `args`: which flag set ran.
- `contextCreated`: false means `canvas.getContext('webgl2')` returned null under those flags.
- `renderer`, `vendor`: the unmasked strings; this is how you tell SwiftShader from ANGLE from a real GPU.
- `glVersion`, `shadingLanguageVersion`: context version strings.
- `renderSmokeTest.checksum`: a weighted checksum of the full 64x64 readback, for cross-run comparison.
- `renderSmokeTest.firstPixelMatchesClearColor`: the actual usability test; the probe clears to a known color and reads back pixel zero within a tolerance of 2 per channel.
- `error`: launch or evaluate failure text.

"Usable" means `contextCreated` true AND `firstPixelMatchesClearColor` true. The script always exits 0 by design: a config failing to make a context is a valid result, not a script failure. Never gate anything on its exit code; read the verdict line.

## mutate / mutate:check: Stryker mutation testing on core/

`pnpm mutate` runs Stryker (config `stryker.conf.json`) over `core/**/*.ts` (tests excluded) with the vitest runner and the TypeScript checker. It is slow (tens of minutes); the weekly `mutation.yml` workflow (Sundays 03:30 UTC, plus manual dispatch, 90-minute timeout) owns routine runs and is supposed to upload a `stryker-report` artifact for 14 days. It never gates PRs.

Lane health, verified 2026-07-05: the weekly lane has never gone green. All five scheduled runs since 2026-06-07 completed FAILURE within 3 to 34 seconds, a Stryker startup crash (latest: `Cannot find Checker plugin "typescript"`, a plugin-resolution failure; `@stryker-mutator/typescript-checker` is in devDependencies). No `stryker-report` artifact and no mutation score has ever been published, so do not go hunting for either. File or verify a tracking issue and fix the plugin loading before relying on the lane. Re-check with `gh run list --workflow=mutation.yml --limit 3`.

Reading a mutation score, applicable only once the lane actually runs: Stryker mutates the source and reruns the tests; the score is the percentage of mutants your tests detect. Thresholds in `stryker.conf.json`: `high: 80` (healthy), `low: 60` (report flags it), `break: 50`. The break trip is strict: final score < 50 logs `Final mutation score ... under breaking threshold 50, setting exit code to 1` and the run fails. A surviving mutant is a missing-test backlog item, not a Stryker complaint. Human-readable report: `reports/stryker/mutation.html` (gitignored). Survived-mutant analysis method: vernacular-proof-and-analysis-toolkit, recipe 7.

`pnpm mutate:check` is broken as committed (verified statically 2026-07-05, not executed): the script runs `stryker run --dryRun`, but the installed Stryker 8.7.1 CLI defines only `--dryRunOnly`, and its commander 12.1.0 parser rejects unknown options. Expect an immediate `error: unknown option '--dryRun'` and exit 1 before any work happens. The working config-validation command is `pnpm exec stryker run --dryRunOnly` (initial test run only, no mutants). CONTRIBUTING.md (the PR checklist and the mutation section) still tells contributors to run `pnpm mutate:check`; treat that as stale until the script is fixed.

## lhci: Lighthouse budgets

Command sequence: `pnpm build && pnpm lhci` (lhci starts `pnpm preview --port 4173 --strictPort` itself and measures the built bundle three times, desktop preset). Config: `lighthouserc.json`.

Exactly one assertion is a hard gate: `categories:accessibility` at `error` severity, minimum score 0.9. Performance (0.8), best-practices (0.9), and SEO (0.8) are `warn` only. `pnpm lhci` exits nonzero only on an error-level violation. Results land in `.lighthouseci/` (gitignored). On CI, lighthouse runs on push to main and in the merge queue; PRs skip it unless labeled `ci:full` (see decide.mjs above). `pnpm lhci:collect` runs collection without assertions.

## dup: jscpd duplication scan (advisory)

Command: `pnpm dup` (`jscpd --silent .`, config `.jscpd.json`: min 50 tokens or 5 lines, honors .gitignore, skips lockfile, changelogs, specs, plans, workflows). Console summary plus a JSON report at `reports/jscpd/jscpd-report.json` (gitignored).

Exit-code contract, verified 2026-07-05: the configured `threshold` is 0, so any duplication at all exceeds it and jscpd exits 1 (observed: 374 clones, 8.6% duplicated lines on the working tree of that day; the number moves with untracked files present). Advisory means no CI job and no hook runs it, and its exit code must never be scripted as a gate. Use the JSON report to rank refactor targets; the Clean Code rubric's line (real duplication: eliminate; coincidental similarity: leave) governs what to act on. CONTRIBUTING.md calls the threshold "informational", which is true of CI but obscures that the local command itself exits 1.

## Coverage: measured, not gated

Command: `pnpm exec vitest run --project unit --coverage`. Provider v8; reporters text, html, lcov; output in `coverage/` (gitignored). The include list spans `src/` and all six layers; the exclude list in `vite.config.ts` drops tests, stories, and a named set of thin React glue modules. There is no `thresholds` block anywhere: coverage never fails a build here. Use it to find untested regions, then let mutation score (above) tell you whether the tested regions are tested well. To filter to a path, pass it to the same `pnpm exec vitest run --project unit <path>` form CI uses; do not rely on `pnpm test -- <path>` argument passing.

## Common mistakes

- Believing a `[blue]` violation on the last commit of a hand-picked range: the closing `refactor:` is often one commit past your endpoint. Re-run with the full `origin/main..HEAD` range first.
- Auditing against local `main` after origin moved: CI audits `origin/<base>..HEAD`; fetch first.
- Forgetting the `Infrastructure: <reason>` trailer on glue commits, then reading the resulting ordering/blue violations as auditor bugs.
- Treating `pnpm dup` exit 1 as a regression signal. It exits 1 on any duplication; only the report content is meaningful.
- Running `pnpm mutate:check` and concluding Stryker is misconfigured: the flag is wrong in package.json; use `pnpm exec stryker run --dryRunOnly`.
- Hunting for a `stryker-report` artifact or a published mutation score: none has ever existed; the weekly lane fails at startup (see mutate above).
- Retitling a journey test without updating `e2e/journey-coverage.json`, or vice versa: integration:audit matches titles by exact string.
- Writing `status: accepted` in ADR frontmatter, which kills `pnpm knowledge:index` for everyone (issue #440).
- Running `pnpm lhci` against a stale or missing `dist/`: it measures whatever `pnpm preview` serves; build first.
- Expecting coverage percentages to gate anything, or quoting them as a quality bar; only the accessibility lhci assertion and the weekly mutation break are score gates, and only the latter is about tests.
- Gating on webgl2-probe's exit code: it always exits 0; parse the JSON verdict.

## Provenance and maintenance

All facts verified against the repo at commit 6b7d74c6 on 2026-07-05 (version 0.3.1). Volatile numbers (journey counts, duplication percentage, scene-baseline count, open issues) are stamped inline. Re-verification one-liners:

- Script inventory and package scripts: `ls scripts/rgb-audit scripts/ci scripts/integration-audit scripts/story-coverage scripts/ci-probes scripts/schema && grep -n '"rgb:audit"\|"integration:audit"\|"schema:check"\|"knowledge:index"\|"dup"\|"mutate' package.json`
- rgb:audit rules, classification, and exit codes: `grep -n "EXIT_\|rule: '\|scope === 'e2e'\|infra" scripts/rgb-audit/rgb-audit.mjs scripts/rgb-audit/cycle-audit.mjs`
- CI wiring of the audits and deciders: `grep -n "rgb:audit\|integration:audit\|select-tests\|decide.mjs\|scene-webgl-linux" .github/workflows/ci.yml`
- Selection inputs: `cat ci-coupling.json && grep -n "LAYERS\|EXTRA_TEST_DIRS" scripts/ci/layers.mjs scripts/ci/select-tests.mjs`
- Decide paths and label names: `grep -n "E2E_PATHS\|VISUAL_PATHS\|ci:full\|ci:skip-heavy\|run:e2e\|run:visual" scripts/ci/decide.mjs .github/workflows/slash-command.yml`
- Journey matrix state: `pnpm integration:audit`
- Schema version: `grep -n "CURRENT_SCHEMA_VERSION" core/model/factories.ts && ls schema/`
- Knowledge status enum and #440: `grep -n "ALLOWED_STATUS" scripts/knowledge-index.mjs && gh issue view 440 --json state -q .state`
- Story-coverage roots and allowlist: `sed -n '19,22p' scripts/story-coverage/story-coverage.test.ts && head -25 scripts/story-coverage/uncovered-components.ts`
- Stryker thresholds and the mutate:check flag mismatch: `cat stryker.conf.json && grep -n '"mutate:check"' package.json && grep -c "dryRunOnly" node_modules/@stryker-mutator/core/dist/src/stryker-cli.js`
- Mutation lane health (red at startup as of 2026-07-05): `gh run list --workflow=mutation.yml --limit 3`
- Lighthouse assertions: `cat lighthouserc.json`
- jscpd threshold and ignore list: `cat .jscpd.json`
- Coverage config has no thresholds: `grep -n "coverage\|thresholds" vite.config.ts`
- Linux scene baselines committed: `git ls-files 'e2e/tests/*' | grep -c 'scene-webgl-linux.png'`
