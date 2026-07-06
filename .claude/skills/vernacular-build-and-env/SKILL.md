---
name: vernacular-build-and-env
description: 'Use when setting up a Vernacular dev environment from scratch, creating a git worktree, or hitting environment failures. Symptoms: pnpm install blocked by the 30-day cooldown (minimum-release-age), a vite.config.ts edit that pnpm dev ignores (stale emitted vite.config.js), tsc -b not re-emitting (stale .tsbuildinfo), baseline mismatches across darwin, linux, arm64, amd64, scene-webgl GPU flags, or Playwright routing every spec into scene-webgl.'
---

# Vernacular build and environment

## Overview

Recreate a working Vernacular development environment from a bare clone, and recognize the environment traps that have cost real time here. Every command, path, version, and threshold below was verified against the repo on 2026-07-05 (main at commit 6b7d74c6); run commands from the repo root.

## When to use

- A fresh machine, clone, or worktree needs to install, build, and pass checks.
- `pnpm install` or `pnpm add` fails on the dependency cooldown, or you must add or bump a dependency.
- The dev server or build behaves as if your config edit never happened.
- Visual-regression baselines mismatch and you suspect platform or CPU-architecture drift.
- Playwright runs specs in the wrong project, or skips everything.

## When NOT to use

- Running the app, the deterministic scene harness, Storybook, or releases: see vernacular-run-and-operate.
- The catalog of configuration axes (URL params, storage keys, CI knobs, tolerances): see vernacular-config-and-flags.
- What gates a merge and how the baseline tiers act as evidence: see vernacular-validation-and-qa.
- Diagnosing failures that are not environment-caused: see vernacular-debugging-playbook.
- Running several worktree lanes in parallel: see vernacular-parallel-delivery.

## Quick reference

| Task                                      | Command                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pin Node                                  | `nvm use` (`.nvmrc` = `22`; `engines` require `>=22.18.0`)                                                                 |
| Activate pnpm                             | `corepack enable` (`packageManager` pins `pnpm@10.33.4`)                                                                   |
| Install deps                              | `pnpm install --frozen-lockfile`                                                                                           |
| Install browsers (CI parity)              | `pnpm exec playwright install --with-deps chromium`                                                                        |
| Install browsers (full local e2e)         | `pnpm exec playwright install --with-deps chromium firefox webkit`                                                         |
| Full check chain                          | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`                                              |
| Reset emitted configs and caches          | `rm -f vite.config.js vite.config.d.ts vitest.config.js vitest.config.d.ts tsconfig.tsbuildinfo tsconfig.node.tsbuildinfo` |
| Force a full tsc rebuild                  | `pnpm exec tsc -b --force`                                                                                                 |
| New worktree (sibling, outside the clone) | `git worktree add ../vernacular.wt/<short-name> -b feat/<short-name>`                                                      |

## From-scratch setup

1. **Node.** `.nvmrc` contains `22`. `package.json` `engines` require Node `>=22.18.0` and pnpm `>=10.33.0`. Use any `.nvmrc`-aware version manager. Note: CONTRIBUTING.md says "Node.js 20 or newer"; that line is stale, trust `engines`.
2. **pnpm via corepack.** `corepack enable` once; the `packageManager` field (`pnpm@10.33.4`) then activates the exact pnpm on any `pnpm` invocation. The cooldown setting in `.npmrc` requires pnpm 10 or newer.
3. **Install.** `pnpm install --frozen-lockfile`. This also runs the `prepare` script, which installs the husky git hooks. Never run a bare `pnpm install` casually: the frozen flag is what keeps the committed `pnpm-lock.yaml` authoritative.
4. **Playwright browsers.** `pnpm exec playwright install --with-deps chromium` is what every CI workflow runs and covers the chromium e2e project, the scene-webgl project (its `channel: 'chromium'` uses the full Chrome for Testing build that this install provides), and the Vitest storybook browser project. A full local `pnpm e2e` also runs the firefox and webkit projects, so add those browsers if you intend that. Browsers land in a per-user cache, so one install serves every clone and worktree on the machine.
5. **Verify.** Run the full check chain (next section). All five commands must exit 0.

## The check chain and git hooks

| Command             | Runs                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | `tsc --noEmit`                                                                                        |
| `pnpm lint`         | `eslint .` (warnings also count against you; see vernacular-change-control for the zero-problems bar) |
| `pnpm format:check` | `prettier --check .` (Prettier 3 also honors `.gitignore`)                                            |
| `pnpm test`         | `vitest run --project unit`                                                                           |
| `pnpm build`        | `tsc -b && vite build`                                                                                |

Git hooks (husky 9, installed by `pnpm install`):

- **pre-commit:** `lint-staged` (eslint --fix plus prettier on staged files), then `node scripts/hooks/commit-reminders.mjs` (advisory only, never blocks).
- **commit-msg:** `commitlint` (Conventional Commits).
- **pre-push:** exactly the five-command check chain above. Slow checks (Playwright, Lighthouse) intentionally stay in CI.

When scripting the chain, check each command's own exit code. `cmd | tail -5; echo $?` reports the exit code of `tail`, not of the gate, and has masked real failures here.

## Dependency policy mechanics

All policy lives in two committed files: `.npmrc` and `package.json`.

- **30-day cooldown.** `.npmrc` sets `minimum-release-age=43200` (minutes, so 30 days). pnpm refuses to install any package, direct or transitive, whose newest matching release is younger. This is a supply-chain defense: malicious releases are usually caught and yanked within days.
- **Exact pins, no ranges.** `.npmrc` sets `save-exact=true` and an empty `save-prefix=`, so `pnpm add` writes exact versions. Never hand-write `^` or `~` in `package.json`. Transitives are pinned by the committed `pnpm-lock.yaml`; CI installs with `--frozen-lockfile`.
- **Exclusion list.** `.npmrc` carries 56 `minimum-release-age-exclude[]` entries (as of 2026-07-05) in three categories: `@rollup/rollup-*` per-platform native binaries, the typescript-eslint monorepo packages, and `@babel/*` infrastructure. Each category's rationale is in the `.npmrc` comments. The comments cite `docs/knowledge/decisions/ADR-0013-cooldown-exclusions.md`, but that file is absent from the repo as of 2026-07-05; treat the `.npmrc` comment block as the effective record and do not go hunting for the ADR.
- **Version overrides.** `package.json` `pnpm.overrides` pins `rollup 4.60.4`, `esbuild 0.25.0`, `uuid 11.1.1`, `tmp 0.2.7` across the whole tree.

### The surgical-install escape hatch (needs sign-off)

A deliberate, approved bump can trip the cooldown on unrelated transitives that happen to have a too-young release available. The sanctioned pattern (recorded in ADR-0100, repeated in ADR-0105 and ADR-0110, all under `docs/knowledge/decisions/`) is:

```sh
pnpm add -D <pkg>@<exact-version> --config.prefer-frozen-lockfile=true --config.minimumReleaseAge=0
```

The flag suppresses the cooldown for that one command only; `.npmrc` stays unchanged. All three preconditions are mandatory:

1. Explicit owner sign-off for this exact pin. Do not use the flag on your own judgment.
2. The target version itself is verified older than 30 days (check its publish date first).
3. After the install, read the `pnpm-lock.yaml` diff and confirm only the intended keys and their pinned transitives moved.

## Environment traps

### Trap 1: emitted config artifacts shadow their sources

Story: `pnpm build` runs `tsc -b`, and the composite project `tsconfig.node.json` (which includes `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`) emits `vite.config.js`, `vite.config.d.ts`, `vitest.config.js`, and `vitest.config.d.ts` at the repo root. All four are gitignored and eslint-ignored. Vite resolves `vite.config.js` BEFORE `vite.config.ts` (verified in `node_modules/vite/dist/node/constants.js`, `DEFAULT_CONFIG_FILES`), so once the `.js` exists, `pnpm dev` and `vite build` load it and an edit to `vite.config.ts` silently does nothing. Vitest resolves `.ts` before `.js`, so Vitest is not fooled, but the same hygiene applies.

Rules: edit only the `.ts` sources. If a config edit seems ignored, delete the four emitted files (the reset one-liner in Quick reference); Vite then falls back to the `.ts` source, which is always safe.

### Trap 2: .tsbuildinfo staleness suppresses re-emit

Story: `tsc -b` trusts its incremental caches (`tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`, both gitignored). Verified 2026-07-05 with the pinned typescript 5.9.3: delete an emitted output while the cache says up to date, re-run `tsc -b`, and the output is NOT re-emitted. So after any manual deletion or odd branch switch, either delete both `.tsbuildinfo` files along with the emitted configs or run `pnpm exec tsc -b --force`.

### Trap 3: three baseline tiers, three render origins

The repo commits screenshot baselines in three tiers with per-platform filename suffixes. Rendering them on the wrong platform or CPU architecture produces pixel drift that no tolerance absorbs. Committed state as of 2026-07-05:

| Tier        | Location                                         | Committed suffixes                         | Rendered where                                  | Refresh path                                                                                                                                                                                             |
| ----------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App visual  | `e2e/tests/visual-regression.spec.ts-snapshots/` | `-darwin` only (chromium, firefox, webkit) | local dev Mac                                   | local `--update-snapshots` run; `pnpm e2e:update-snapshots` is the docker path for linux pixels (arch caveat below)                                                                                      |
| Scene WebGL | `e2e/tests/scene-*.spec.ts-snapshots/`           | `-darwin` AND `-linux`                     | darwin: dev Mac real GPU; linux: CI runner only | darwin: local `pnpm exec playwright test --project=scene-webgl --update-snapshots=all`; linux: dispatch `.github/workflows/refresh-scene-baselines.yml`, download the `scene-baselines` artifact, commit |
| Stories     | `e2e/stories/__screenshots__/` (87 PNGs)         | `-linux` only                              | CI runner (ubuntu amd64)                        | dispatch `.github/workflows/refresh-story-baselines.yml`, download the `story-baselines` artifact, commit; `pnpm stories:update-snapshots` only on an amd64 host                                         |

The architecture story (ADR-0117, `docs/knowledge/decisions/ADR-0117-storybook-story-visual-regression.md`): the docker refresh scripts run the `mcr.microsoft.com/playwright:v1.60.0-noble` container at the HOST architecture, because amd64 chromium cannot launch under qemu emulation on an arm64 host. Dev Macs are arm64, so docker there renders arm64 linux pixels that do not match the amd64 CI runner. Consequence: linux baselines for stories and scenes are rendered by the two `workflow_dispatch` refresh workflows on the ubuntu runner, never on a Mac.

Also by design: `playwright.stories.config.ts` pins `snapshotPathTemplate` to a `-linux` suffix regardless of host, so running `pnpm stories:test` on darwin diffs Mac renders against linux baselines and fails. It is not part of local verification.

### Trap 4: scene-webgl needs a real GPU on darwin

`playwright.config.ts` keys the scene-webgl project's launch flags on `process.platform`. On darwin it adds `--enable-unsafe-webgpu --use-angle=metal --use-gpu-in-tests --ignore-gpu-blocklist` with `channel: 'chromium'` (the full Chrome for Testing build, which carries the GPU stack the default headless shell omits), so WebGL 2 renders on the real GPU through the Apple Metal ANGLE backend. On linux the flag list is empty on purpose: the CI runner has no GPU and falls back to chromium's deterministic SwiftShader software rasterizer. Do not add the Metal flags on linux or strip them on darwin; each platform's committed baselines were rendered under its own path and would all invalidate.

### Trap 5: a checkout path containing "scene-" breaks Playwright project routing

Verified precisely on 2026-07-05: `playwright.config.ts` routes specs with the unanchored regex `/scene-.*\.spec\.ts/`, as `testMatch` on the scene-webgl project and as `testIgnore` on the chromium, firefox, and webkit projects. Playwright 1.60.0 tests regex matchers against the ABSOLUTE spec file path (`createFileMatcher` in `node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/lib/util.js` calls `re.test(filePath)` on the absolute path). So if the clone or worktree path contains the substring `scene-` anywhere (example: `../vernacular.wt/scene-lighting/`), every `*.spec.ts` path matches the regex: the three browser projects ignore every spec and scene-webgl claims them all, with GPU flags and wrong snapshot names. Symptom: `pnpm e2e` suddenly runs everything (or nothing) under scene-webgl. Fix: never put `scene-` in a clone or worktree directory name.

## Git worktrees in this repo

- **Sibling placement.** Feature worktrees live OUTSIDE the main clone, in a sibling directory. The committed convention (see `docs/plans/2026-06-10-app-layout-shell.md`, which builds in `vernacular.wt/app-layout-shell/`) is:

  ```sh
  git worktree add ../vernacular.wt/<short-name> -b feat/<short-name>
  ```

  `.gitignore` also reserves `.claude/worktrees/` for local session worktrees, but a worktree nested inside the working tree gets swept by repo-wide tooling; prefer the sibling location.

- **Naming.** Descriptive branch names per CLAUDE.md, and never the substring `scene-` in the path (Trap 5).
- **Per-worktree state.** Each worktree needs its own `pnpm install --frozen-lockfile` (node_modules is not shared). Playwright browsers are shared through the per-user cache. Emitted config artifacts and `.tsbuildinfo` caches are per-worktree; a fresh worktree has none until its first build.
- **Cleanup.** `git worktree remove ../vernacular.wt/<short-name>` after the branch merges.
- Multi-lane orchestration, scope fences, and merge order are covered by vernacular-parallel-delivery.

## Stale committed docs: trust the configs, not these lines

- CONTRIBUTING.md says "Node.js 20 or newer" and "the smoke test in src/App.test.tsx is the only test". Both stale: engines require Node >=22.18.0 and the test tree is large.
- `docs/specs/2026-06-01-vernacular-design.md` describes a 15-day cooldown (21600) with no exclusions. Superseded by `.npmrc`: 43200 minutes and 56 exclusions.
- `.npmrc` cites ADR-0013 for the exclusions; the ADR file does not exist in `docs/knowledge/decisions/` as of 2026-07-05.

## Common mistakes

- Editing or committing `vite.config.js` / `vitest.config.js`: they are regenerated `tsc -b` artifacts; edit the `.ts` sources.
- Deleting a stale emitted config but keeping the `.tsbuildinfo` caches, then wondering why `tsc -b` will not re-emit.
- Running bare `pnpm install` instead of `pnpm install --frozen-lockfile` and drifting the lockfile.
- Using `--config.minimumReleaseAge=0` without owner sign-off, without checking the target version's age, or without reading the lockfile diff.
- Rendering `-linux` story or scene baselines via docker on an arm64 Mac and committing arm64 pixels that CI rejects.
- Naming a worktree directory with `scene-` in it.
- Expecting `pnpm e2e` to run only chromium: it runs chromium, firefox, webkit, and scene-webgl; pass `--project=chromium` or install all browsers.
- Reading `$?` after a piped command (`cmd | tail`) and concluding a gate passed.

## Provenance and maintenance

All facts verified 2026-07-05 against main at commit 6b7d74c6. Re-verify before relying on anything that drifts:

- Node and pnpm pins: `cat .nvmrc && grep -E '"(node|pnpm)"|packageManager' package.json`
- Cooldown and pin policy: `grep -E '^(minimum-release-age|save-exact|save-prefix)' .npmrc`
- Exclusion count (was 56): `grep -c 'minimum-release-age-exclude' .npmrc`
- ADR-0013 absence: `ls docs/knowledge/decisions | grep 0013 || echo "still absent"`
- Overrides: `node -e "console.log(require('./package.json').pnpm.overrides)"`
- Check chain and pre-push parity: `cat .husky/pre-push`
- Emitted-artifact list: `grep -B1 -A4 'emitted by' .gitignore`
- Vite config resolution order: `grep -A7 'DEFAULT_CONFIG_FILES' node_modules/vite/dist/node/constants.js`
- Vitest config resolution order: `grep -rn -A8 'CONFIG_EXTENSIONS' node_modules/vitest/dist/chunks/constants.*.js`
- tsc -b no-re-emit behavior: repeat the mini experiment (composite project in a temp dir, build, delete the emitted `.js`, rebuild, observe no re-emit; `--force` re-emits).
- Scene GPU flags and routing regex: `grep -n 'use-angle=metal\|scene-' playwright.config.ts`
- Playwright absolute-path regex matching: `grep -rn -A6 'function createFileMatcher' node_modules/.pnpm/playwright@*/node_modules/playwright/lib/util.js`
- Baseline suffixes on disk: `ls e2e/tests/visual-regression.spec.ts-snapshots/ e2e/tests/scene-visual-regression.spec.ts-snapshots/ && ls e2e/stories/__screenshots__ | wc -l`
- Refresh workflows: `ls .github/workflows/`
- Docker image tag source: `grep -o 'mcr.microsoft.com/playwright:[^ ]*' package.json | head -1` plus `grep '"@playwright/test"' package.json`
- Surgical-install pattern: `grep -rn 'minimumReleaseAge=0' docs/knowledge/decisions/`
