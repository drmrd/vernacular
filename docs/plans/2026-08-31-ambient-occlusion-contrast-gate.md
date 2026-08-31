# Ambient-occlusion contrast gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); a pure `test(e2e)` gate commit is exempt from the cycle grammar but still gets the review passes.

**Goal:** Make the visual gate see ambient occlusion: a targeted contrast assertion that a wrong radius (the class of defect that shipped as a no-op pass) fails, and the shipped radius passes.

**Architecture:** A pure end-to-end gate with zero production-code change. A new `scene-webgl` Playwright spec renders the existing `?fixture=scene-harness&scene=ambient-occlusion` state, samples one patch inside the window head reveal and one on the open wall above it through `sampleCanvasColor`, converts both to OKLab, and asserts the reveal's L (lightness) sits below the open wall's by at least a derived minimum. No committed screenshot; no baseline moves.

**Tech Stack:** TypeScript, Playwright `scene-webgl` project (WebGL 2 harness, darwin Metal + linux SwiftShader), OKLab helpers already exported from `core/`.

**Spec:** `docs/specs/2026-08-31-rendering-realism-gates-occlusion-coverings.md` (slice A1, issue #522).

## Global Constraints

- **No production code changes.** Allowed files: create `e2e/tests/scene-ambient-occlusion.spec.ts`; modify `e2e/tests/scene-helpers.ts` only if a patch-position helper is genuinely missing. Any need to touch another file means STOP and report; do not edit shared config.
- **No baseline churn.** Every committed screenshot under `e2e/tests/*-snapshots/` stays byte-identical. Verify with `git status --short e2e/tests` before the final commit.
- **Tolerance is derived, then frozen** (spec locked decision 6): the threshold sits between the passing-probe reading and the failing-probe reading, with a margin of at least twice the noise band observed over five repeated captures. The derivation lives in a comment on the named constant.
- **Worktree name must not contain `scene-`** (an unanchored Playwright project regex routes every spec into `scene-webgl` otherwise). Use `vernacular.wt/ao-contrast-gate`, branch `feat/ambient-occlusion-contrast-gate`.
- **Repo rules:** Conventional Commits, no milestone tags, no em-dashes, no `Co-Authored-By` or `Claude-Session` trailers, author `Dan Moore <9156191+drmrd@users.noreply.github.com>`, ESLint zero problems (warnings count; `max-lines-per-function` 40, `no-magic-numbers` with named-const carve-out), `prettier --check .` gates the whole repo, no `git stash`.
- **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own. Gate runs: `pnpm exec playwright test --project=scene-webgl scene-ambient-occlusion`.

## Design decisions carried into this plan

1. **Guard on WebGL 2, not WebGPU**, exactly like `scene-color-accuracy.spec.ts`: the harness forces the WebGL 2 backend and this gate must run on both darwin and the linux SwiftShader CI lane, so it skips only when no WebGL 2 context exists.
2. **The failing probe is a temporary local edit, never a committed surface.** `AO_RADIUS_METERS` in `engine/postprocessing/ambient-occlusion-params.ts` is set to `2.5` only during derivation and probe verification, then restored before any commit. No query-parameter override lands; the gate asserts the shipped configuration.
3. **Contrast is OKLab L difference**, `openWallL - revealL`, not a full perceptual distance: occlusion darkens, so lightness is the physically meaningful axis and the assertion reads as one number.

## Task 1: Derive the patch positions and the threshold (nothing committed)

- [x] **Step 1:** Start the preview server the way the scene specs expect (`pnpm build` then `pnpm exec playwright test --project=scene-webgl scene-solar --list` confirms wiring). Open `?fixture=scene-harness&scene=ambient-occlusion` and pick two candidate patches in normalized canvas coordinates: one centered on a wall-floor junction shadow, one on the same wall half a wall-height higher. Record both.
- [x] **Step 2:** With a scratch spec in the scratchpad directory (not the repo), sample both patches five times at the shipped radius. Record the mean junction L, mean open-wall L, and the noise band (max minus min per patch).
- [x] **Step 3:** Set `AO_RADIUS_METERS` to `2.5` locally, rebuild, sample five more times, record the collapsed contrast. Restore the file and confirm `git diff --stat` is empty.
- [x] **Step 4:** Compute the threshold: above the wrong-radius contrast, below the shipped contrast, margin at least twice the noise band. If the two readings do not separate cleanly, STOP and report; the patch choice, not the threshold, gets revisited.

**Task 1 outcome (2026-08-31): stopped at Step 4 and revised the patch choice.** Six shipped-radius captures across a rebuild and three server restarts were byte-identical, so the noise band is zero. But no wall-floor junction separates the two radii under the state's exterior auto-frame camera: a 24 px sample patch spans about 1.3 m of wall at that framing, the 2500 mm gather darkens most junction patches as much as or more than the shipped 250 mm radius, and the best junction separation anywhere was +0.0035. The opening reveals separate cleanly: at the window head the shipped radius reads +0.0223 against +0.0029 for the probe, and the door head reads +0.0214 against +0.0087. The gate therefore samples the window head reveal against the open wall above it, which keeps the state, the camera, every committed baseline, and the acceptance brackets intact. The full derivation, including the candidate tables and the frame-wide separation map, lives in the lane's derivation notes.

## Task 2: The committed gate spec

**Files:** create `e2e/tests/scene-ambient-occlusion.spec.ts`.

**Interfaces:** consumes `sampleCanvasColor(page, canvas, {x, y})` from `./scene-helpers` and `srgbToOkLab` from `core/`; produces the named constants `AO_WINDOW_HEAD_PATCH`, `AO_OPEN_WALL_PATCH`, and `AO_CONTRAST_MINIMUM` (the derived threshold with its derivation comment).

- [x] **Step 1:** Write the spec: WebGL 2 guard and skip, navigate to the ambient-occlusion state, wait for `data-harness-ready`, sample both patches, assert `openWallL - revealL >= AO_CONTRAST_MINIMUM`.
- [x] **Step 2:** Run `pnpm exec playwright test --project=scene-webgl scene-ambient-occlusion` five consecutive times. Expected: five passes.
- [x] **Step 3:** Re-apply the `2.5` probe edit, rebuild, run once. Expected: FAIL on the contrast assertion. Restore the file, rebuild, run once more. Expected: PASS.
- [x] **Step 4:** Run the full check chain; verify `git status --short e2e/tests` shows only the new spec file.
- [x] **Step 5:** Commit as `test(e2e): gate ambient-occlusion contrast at the window head reveal`.

## Task 3: Reviews before the lane closes

- [x] **Step 1:** Dispatch `/clean-code-review` on the diff; fix must-fix findings.
- [x] **Step 2:** Run `pnpm rgb:audit --range origin/main..HEAD`; a lone `test(e2e)` commit is exempt but the audit must exit zero.
- [x] **Step 3:** Dispatch `/review` (pr-reviewer) and hold the branch for the landing window.
