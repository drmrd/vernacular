# Glossy finish contrast gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); each task below maps onto one or more such cycles.

**Goal:** Give the harness a glossy surface and a pixel gate over it, so a regression that erases the specular difference between finishes (the #520 defect class) fails a committed test.

**Architecture:** A gate-only harness state, `finish-contrast`, paints the shell floor `semi-gloss` and the walls `matte` in the same base color, under the color-check reference lighting, so the only difference between a floor patch and a wall patch is the finish response. A new `scene-webgl` spec samples both patches and asserts they differ by at least a derived minimum perceptual distance. The state follows the exact shape of the color-accuracy gate: a paint store in `app/harness-paint.ts`, an environment state in `app/harness-environment.ts`, a sampled assertion, no committed screenshot.

**Tech Stack:** TypeScript, Vitest for the two app modules, Playwright `scene-webgl` project (WebGL 2, darwin + linux), `perceptualDistance` and OKLab helpers from `core/`, the finish registry (`core/registries/finishes.ts`: `matte` roughness 0.9 sheen 0, `semi-gloss` roughness 0.3 sheen 0.5 specular 0.4).

**Spec:** `docs/specs/2026-08-31-rendering-realism-gates-occlusion-coverings.md` (slice A2, issue #541).

## Global Constraints

- **Allowed files:** modify `app/harness-paint.ts`, `app/harness-paint.test.ts`, `app/harness-environment.ts`, `app/harness-environment.test.ts`; create `e2e/tests/scene-finish-contrast.spec.ts`. Nothing else; a need elsewhere means STOP and report.
- **No change to the shipped lighting rig or the finish registry.** The reference condition stays as ADR-0156 fixed it; registry values stay as committed. A gate that only passes by moving either is a spec revision, not this slice.
- **No baseline churn.** No new screenshot lands and every existing one stays byte-identical (`git status --short e2e/tests` before the final commit).
- **Tolerance is derived, then frozen** (spec locked decision 6), recorded in a comment on the named constant.
- **Worktree name must not contain `scene-`.** Use `vernacular.wt/finish-contrast-gate`, branch `feat/glossy-finish-contrast-gate`.
- **Repo rules:** Conventional Commits, no em-dashes, no `Co-Authored-By` or `Claude-Session` trailers, author `Dan Moore <9156191+drmrd@users.noreply.github.com>`, ESLint zero problems (warnings count), `prettier --check .` repo-wide, no `git stash`. RED briefs must retrofit sibling fixtures and run `pnpm typecheck` when a public surface changes.
- **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own. Gate runs: `pnpm exec playwright test --project=scene-webgl scene-finish-contrast`.

## Design decisions carried into this plan

1. **Same base color, different finish.** Both stores paint the identical `srgbHex`, so the sampled delta is purely the specular and sheen response, never a hue difference.
2. **Floor versus wall, one state.** The shell fixture already puts a floor and walls in frame under the color-check interior camera; a second room or fixture is unnecessary. If no camera pose yields a measurable specular separation at derivation time, STOP and report (the fallback surface choice is the owner's call, not the lane's).
3. **The failing probe is a temporary local edit:** set the `semi-gloss` registry entry to the `matte` values (roughness 0.9, sheen 0, specular 0.04) during verification only, restore before any commit. This reproduces the #520 defect class exactly.

## Task 1: The `finish-contrast` paint store (one red-green-blue cycle)

**Files:** modify `app/harness-paint.ts`, test `app/harness-paint.test.ts`.

**Interfaces:** produces a `finish-contrast` branch in `resolveHarnessPaint(paintParam)` returning a surface-treatment store that assigns the floor surface `finishId: 'semi-gloss'` and the wall faces `finishId: 'matte'`, all with one shared base `srgbHex`.

- [ ] **Step 1 (RED):** `/test-first` a failing unit test: `resolveHarnessPaint('finish-contrast')` yields floor `semi-gloss`, walls `matte`, and one identical hex on both. Run `pnpm exec vitest run app/harness-paint.test.ts`; expected FAIL.
- [ ] **Step 2 (GREEN):** `/implement` the minimal branch. Same command; expected PASS.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor` (empty marker commit if no findings).

## Task 2: The `finish-contrast` environment state (one red-green-blue cycle)

**Files:** modify `app/harness-environment.ts`, test `app/harness-environment.test.ts`.

**Interfaces:** produces a named `finish-contrast` environment state resolving to the color-check reference lighting and the shell geometry fixture, with a camera pose read from the state (reuse the color-accuracy interior pose as the starting point).

- [ ] **Step 1 (RED):** failing unit test: the state resolves, pins the reference lighting values, and pairs with the shell fixture. `pnpm exec vitest run app/harness-environment.test.ts`; expected FAIL.
- [ ] **Step 2 (GREEN):** minimal state entry; expected PASS.
- [ ] **Step 3 (BLUE):** review and refactor as in Task 1.

## Task 3: Derive the patches and the minimum delta (nothing committed)

- [ ] **Step 1:** Render `?fixture=scene-harness&scene=finish-contrast&paint=finish-contrast`. Pick a floor patch inside the specular response and a wall patch away from it; if the pose shows no specular lobe, adjust the state's camera pose (Task 2 files only) until it does.
- [ ] **Step 2:** Sample both patches five times; record the mean `perceptualDistance` between them and the noise band.
- [ ] **Step 3:** Apply the matte-values probe edit to the registry, rebuild, sample five times, record the collapsed delta, restore the file, confirm `git diff --stat` is empty.
- [ ] **Step 4:** Set `FINISH_CONTRAST_MINIMUM` between the two readings with a margin of at least twice the noise band.

## Task 4: The committed gate spec

**Files:** create `e2e/tests/scene-finish-contrast.spec.ts`.

**Interfaces:** consumes `sampleCanvasColor` from `./scene-helpers`, `srgbToOkLab`, `colorFromOkLab`, `perceptualDistance` from `core/`; produces `FLOOR_SPECULAR_PATCH`, `WALL_MATTE_PATCH`, `FINISH_CONTRAST_MINIMUM` with the derivation comment.

- [ ] **Step 1:** Write the spec: WebGL 2 guard, navigate, wait for `data-harness-ready`, sample both patches, assert the perceptual distance is at least `FINISH_CONTRAST_MINIMUM`.
- [ ] **Step 2:** Five consecutive runs of `pnpm exec playwright test --project=scene-webgl scene-finish-contrast`; expected five passes.
- [ ] **Step 3:** Re-apply the registry probe, rebuild, run once (expected FAIL), restore, rebuild, run once (expected PASS).
- [ ] **Step 4:** Full check chain; `git status --short e2e/tests` shows only the new spec.
- [ ] **Step 5:** Commit as `test(e2e): gate the specular contrast between semi-gloss and matte finishes`.

## Task 5: Reviews before the lane closes

- [ ] **Step 1:** `pnpm rgb:audit --range origin/main..HEAD` exits zero (two cycles plus one exempt `test(e2e)` commit).
- [ ] **Step 2:** `/clean-code-review` on the branch diff, then `/review`; hold the branch for the landing window.
