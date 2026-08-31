# Live-view WebGPU visual regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); each task below maps onto one or more such cycles.

**Goal:** Put the first committed pixel baseline on the render path users actually see: the live 3D pane on the WebGPU backend, so the next backend split between WebGL 2 and WebGPU fails a test instead of shipping.

**Architecture:** The scene-session provider (ADR-0170) exposes a readiness attribute, `data-live-view-ready`, that flips true once the session is restored and the first frame after any pipeline build has drawn. A new Playwright spec drives the real editor: load the deterministic fixture project, enter the 3D view, apply a named camera preset, wait for readiness plus a stable frame, and compare against a committed `-darwin` screenshot at the shell tolerances. The spec runs on the development Mac tier and self-skips without WebGPU, so the CI SwiftShader lane keeps its WebGL 2 contract (ADR-0152).

**Tech Stack:** TypeScript, React (bridge provider), Vitest for the provider unit test, Playwright with `toHaveScreenshot` (`threshold` 0.35, `maxDiffPixelRatio` 0.05), existing e2e helpers `drawnRoomCanvas` and `stableFrame`.

**Spec:** `docs/specs/2026-08-31-rendering-realism-gates-occlusion-coverings.md` (slice A3, issue #469).

## Global Constraints

- **Allowed files:** modify `bridge/react/scene-session-provider.tsx` (and its unit test) plus, only if the readiness fact must originate beside the render seam, `bridge/scene-session/scene-session-store.ts`; create `e2e/tests/live-view-visual-regression.spec.ts` and its `-darwin` snapshot. Playwright config: STOP and report if the new spec does not fall into a suitable existing project by its current matching rules; do not edit shared config unilaterally.
- **No capture rests on a timeout.** Readiness is the attribute plus `stableFrame`; a `waitForTimeout` in the committed spec is a defect.
- **Existing baselines stay byte-identical.** Only the one new `-darwin` snapshot lands.
- **Tolerances are fixed up front** (spec slice A3): per-pixel `threshold` 0.35, `maxDiffPixelRatio` 0.05, five consecutive green runs required before the baseline commits.
- **Worktree name must not contain `scene-`.** Use `vernacular.wt/live-view-pixel-gate`, branch `feat/live-view-webgpu-visual-regression`. Note the trap directly: the spec filename also avoids the `scene-` prefix so it stays out of the `scene-webgl` harness project.
- **The browser pane freeze gotcha:** a hidden embedded pane never fires `requestAnimationFrame`, so all verification runs through Playwright, never through an embedded preview pane.
- **Repo rules:** Conventional Commits, no em-dashes, no `Co-Authored-By` or `Claude-Session` trailers, author `Dan Moore <9156191+drmrd@users.noreply.github.com>`, ESLint zero problems (warnings count), `prettier --check .` repo-wide, no `git stash`. RED briefs must retrofit sibling fixtures and run `pnpm typecheck` when a public surface changes.
- **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own.

## Design decisions carried into this plan

1. **Feasibility before code.** The spec's open question says WebGPU headless determinism is assumed, not proven. Task 1 proves or refutes it before any production code changes. On refutation the lane stops, files what it learned on #469, and the campaign proceeds gated by A1 and A2 (spec fallback); that outcome is a completed task, not a failure.
2. **Readiness lives in the session provider**, not a new global: ADR-0170 made the provider the owner of cross-view scene session state, and the ready fact is session state. The attribute rides on the element the provider already wraps.
3. **A deliberate-change probe validates the gate:** temporarily force the effective lighting mode to schematic (local edit of `effective-lighting-mode.ts`, never committed), which removes the occlusion pass from the drawn frame; the screenshot comparison must fail.

## Task 1: Prove WebGPU headless capture determinism (nothing committed)

- [ ] **Step 1:** With a scratch spec in the scratchpad directory, drive the existing live-view path (`drawnRoomCanvas`, a camera preset click as in `e2e/tests/scene-camera-presets.spec.ts`, `stableFrame`) and save five consecutive PNG captures.
- [ ] **Step 2:** Diff the five captures pairwise with the shell tolerances. All pairs within tolerance means GO.
- [ ] **Step 3 (only on NO-GO):** Write up the observed divergence (which pixels, which pass), post it to issue #469, report the fallback to the owner, and end the lane cleanly.

## Task 2: The readiness attribute (one red-green-blue cycle)

**Files:** modify `bridge/react/scene-session-provider.tsx`, test its provider unit test file beside it.

**Interfaces:** produces `data-live-view-ready="true"` on the provider's wrapper element, false until (a) session restore has applied and (b) the first frame after the latest pipeline build settlement has drawn; flips back to false while a rebuild is in flight. Consumed by the Task 3 spec via `page.locator('[data-live-view-ready="true"]')`.

- [ ] **Step 1 (RED):** `/test-first` a failing provider test: the attribute is absent or false before restore, true after restore plus a drawn frame, false again during a simulated pipeline rebuild. Run `pnpm exec vitest run bridge/react`; expected FAIL.
- [ ] **Step 2 (GREEN):** `/implement` the minimal attribute wiring. Expected PASS.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor` (empty marker commit if clean).

## Task 3: The committed visual spec and its baseline

**Files:** create `e2e/tests/live-view-visual-regression.spec.ts` plus its snapshot directory.

**Interfaces:** consumes `drawnRoomCanvas`, `stableFrame`, the readiness attribute from Task 2, and a named camera preset; produces the committed `-darwin` baseline.

- [ ] **Step 1:** Write the spec: WebGPU guard (probe `navigator.gpu` and skip with a named reason when absent), load the fixture project, enter the 3D view, apply the top-down preset, wait for `data-live-view-ready="true"` then `stableFrame`, and `toHaveScreenshot` with `threshold: 0.35, maxDiffPixelRatio: 0.05`.
- [ ] **Step 2:** Generate the baseline with `--update-snapshots=all`, then run five consecutive times; expected five passes.
- [ ] **Step 3:** Apply the schematic-mode probe edit, rebuild, run once (expected FAIL on the comparison), restore, rebuild, run once (expected PASS).
- [ ] **Step 4:** Full check chain; `git status --short` shows only the new spec, its one snapshot, and the Task 2 files.
- [ ] **Step 5:** Commit as `test(e2e): pin the live-view WebGPU frame to a darwin baseline`.

## Task 4: Reviews before the lane closes

- [ ] **Step 1:** `pnpm rgb:audit --range origin/main..HEAD` exits zero (one cycle plus one exempt `test(e2e)` commit).
- [ ] **Step 2:** `/clean-code-review` on the branch diff, then `/review`; hold the branch for the landing window.
