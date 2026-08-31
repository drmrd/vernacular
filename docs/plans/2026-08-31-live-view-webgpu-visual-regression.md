# Live-view WebGPU visual regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); each task below maps onto one or more such cycles.

**Goal:** Put the first committed pixel baseline on the render path users actually see: the live 3D pane on the WebGPU backend, so the next backend split between WebGL 2 and WebGPU fails a test instead of shipping.

**Architecture:** The scene-session provider (ADR-0170) exposes a readiness attribute, `data-live-view-ready`, that flips true once the session is restored and the first frame after any pipeline build has drawn. A new Playwright spec drives the real editor: load the deterministic fixture project, enter the 3D view, apply a named camera preset, wait for readiness plus a stable frame, and compare against a committed `-darwin` screenshot at the shell tolerances. The spec runs on the development Mac tier and self-skips without WebGPU, so the CI SwiftShader lane keeps its WebGL 2 contract (ADR-0152).

**Tech Stack:** TypeScript, React (bridge provider), Vitest for the provider unit test, Playwright with `toHaveScreenshot` (`threshold` 0.35, `maxDiffPixelRatio` 0.05), existing e2e helpers `drawnRoomCanvas` and `stableFrame`.

**Spec:** `docs/specs/2026-08-31-rendering-realism-gates-occlusion-coverings.md` (slice A3, issue #469).

## Global Constraints

- **Allowed files:** modify `bridge/react/scene-session-provider.tsx` (and its unit test), `bridge/scene-session/scene-session-store.ts` (and its unit test), and the Task 2b producer seam files listed in that task; create `e2e/tests/scene-live-view-visual-regression.spec.ts` and its `-darwin` snapshot. Playwright config: STOP and report if the new spec does not fall into a suitable existing project by its current matching rules; do not edit shared config unilaterally.
- **No capture rests on a timeout.** Readiness is the attribute plus `stableFrame`; a `waitForTimeout` in the committed spec is a defect.
- **Existing baselines stay byte-identical.** Only the one new `-darwin` snapshot lands.
- **Tolerances are fixed up front** (spec slice A3): per-pixel `threshold` 0.35, `maxDiffPixelRatio` 0.05, five consecutive green runs required before the baseline commits.
- **Worktree name must not contain `scene-`.** Use `vernacular.wt/live-view-pixel-gate`, branch `feat/live-view-webgpu-visual-regression`. The trap applies to the worktree path only. The committed spec is deliberately named with the `scene-` prefix (see the Task 1 outcome) so the existing `testMatch` rule routes it into the `scene-webgl` project, which carries the WebGPU launch flags and already hosts live-view specs. No Playwright config change.
- **The browser pane freeze gotcha:** a hidden embedded pane never fires `requestAnimationFrame`, so all verification runs through Playwright, never through an embedded preview pane.
- **Repo rules:** Conventional Commits, no em-dashes, no `Co-Authored-By` or `Claude-Session` trailers, author `Dan Moore <9156191+drmrd@users.noreply.github.com>`, ESLint zero problems (warnings count), `prettier --check .` repo-wide, no `git stash`. RED briefs must retrofit sibling fixtures and run `pnpm typecheck` when a public surface changes.
- **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own.

## Design decisions carried into this plan

1. **Feasibility before code.** The spec's open question says WebGPU headless determinism is assumed, not proven. Task 1 proves or refutes it before any production code changes. On refutation the lane stops, files what it learned on #469, and the campaign proceeds gated by A1 and A2 (spec fallback); that outcome is a completed task, not a failure.
2. **Readiness lives in the session provider**, not a new global: ADR-0170 made the provider the owner of cross-view scene session state, and the ready fact is session state. The attribute rides on the element the provider already wraps.
3. **A deliberate-change probe validates the gate:** temporarily force the effective lighting mode (local edit of `effective-lighting-mode.ts`, never committed) and require the screenshot comparison to fail. The Task 3 run showed the drawn-room fixture already defaults to schematic with no site, so forcing schematic is a no-op; the working probe forces realistic, which switches on the occlusion pass and the realistic tone mapping.

## Task 1: Prove WebGPU headless capture determinism (nothing committed)

- [x] **Step 1:** With a scratch spec in the scratchpad directory, drive the existing live-view path (`drawnRoomCanvas`, a camera preset click as in `e2e/tests/scene-camera-presets.spec.ts`, `stableFrame`) and save five consecutive PNG captures.
- [x] **Step 2:** Diff the five captures pairwise with the shell tolerances. All pairs within tolerance means GO.
- [ ] **Step 3 (only on NO-GO):** Write up the observed divergence (which pixels, which pass), post it to issue #469, report the fallback to the owner, and end the lane cleanly.

**Task 1 outcome (2026-08-31): GO, with one routing amendment.** The plain `chromium` project exposes `navigator.gpu` but `requestAdapter()` resolves to null, so the live view silently falls back to SwiftShader WebGL 2 there; a baseline in that project would miss the backend split this gate exists to catch. In the existing `scene-webgl` project the live view runs on the real Metal WebGPU adapter and five separate probe runs produced byte-identical captures (all ten pairwise diff ratios 0.000000 against the 0.05 budget). The committed spec is therefore named `scene-live-view-visual-regression.spec.ts` so it routes into `scene-webgl` by the current matching rules, and the WebGPU guard must test the adapter, not `navigator.gpu` presence. The captured canvas region includes the overlaid empty-selection and controls-hint text; the baseline keeps that chrome deliberately, matching the existing live-view captures. On linux CI the `scene-webgl` lane has no WebGPU adapter, so the spec self-skips there and the WebGL 2 contract of ADR-0152 stands.

## Task 2: The readiness attribute (one red-green-blue cycle)

**Files:** modify `bridge/react/scene-session-provider.tsx`, test its provider unit test file beside it.

**Interfaces:** produces `data-live-view-ready="true"` on the provider's wrapper element, false until (a) session restore has applied and (b) the first frame after the latest pipeline build settlement has drawn; flips back to false while a rebuild is in flight. Consumed by the Task 3 spec via `page.locator('[data-live-view-ready="true"]')`.

- [x] **Step 1 (RED):** `/test-first` a failing provider test: the attribute is absent or false before restore, true after restore plus a drawn frame, false again during a simulated pipeline rebuild. Run `pnpm exec vitest run bridge/react`; expected FAIL.
- [x] **Step 2 (GREEN):** `/implement` the minimal attribute wiring. Expected PASS.
- [x] **Step 3 (BLUE):** `/clean-code-review` then `/refactor` (empty marker commit if clean).

**Task 2 outcome (2026-08-31):** the provider rendered no DOM element of its own, so the green phase adds a `display: contents` host that carries the attribute without touching the shell layout. The session store gained the two facts (`sessionRestored`, `frameDrawnSincePipelineSettled`), both defaulting to false, with no separate in-flight flag: clearing the drawn-frame fact at build start already encodes a rebuild. Nothing in the live app produces the two facts yet, which is what Task 2b adds.

## Task 2b: Producer wiring for the readiness facts (one red-green-blue cycle)

**Files:** modify `bridge/react/use-scene-navigation.ts`, `bridge/react/webgpu-scene-view.tsx`, `bridge/react/ambient-occlusion-render-takeover.tsx`, and `bridge/react/use-ambient-occlusion.ts` as the seams require, plus their unit test files; the Task 2 store and provider may gain minimal setters.

**Interfaces:** the live view maintains the two session facts. Applying the stored session sets `sessionRestored`. The ambient-occlusion pipeline clears `frameDrawnSincePipelineSettled` when a build starts, and the first frame drawn after settlement sets it again, so the first-frame signal re-arms on each settlement instead of latching once (`useAmbientOcclusion` already exposes `onSettled`; the live caller currently omits it).

- [x] **Step 1 (RED):** failing test pinning the producer lifecycle across a simulated restore, build, settlement, and drawn frame.
- [x] **Step 2 (GREEN):** minimal producer wiring through the seams above.
- [x] **Step 3 (BLUE):** review and refactor as in Task 2.

## Task 3: The committed visual spec and its baseline

**Files:** create `e2e/tests/scene-live-view-visual-regression.spec.ts` plus its snapshot directory.

**Interfaces:** consumes `drawnRoomCanvas`, `stableFrame`, the readiness attribute from Task 2, and a named camera preset; produces the committed `-darwin` baseline.

- [x] **Step 1:** Write the spec: WebGPU guard (request an adapter and skip with a named reason unless a non-null adapter arrives; `navigator.gpu` can be present while the adapter is null), load the fixture project, enter the 3D view, apply the top-down preset, wait for `data-live-view-ready="true"` then `stableFrame`, and `toHaveScreenshot` with `threshold: 0.35, maxDiffPixelRatio: 0.05`.
- [x] **Step 2:** Generate the baseline with `--update-snapshots=all`, then run five consecutive times; expected five passes.
- [x] **Step 3:** Probe: force the lighting-mode predicate to realistic (see design decision 3), rebuild, run once (FAILED at diff ratio 0.24 with the toolbar copy pinned, 0.29 unpinned), restore hash-verified, rebuild, run once (PASS).
- [x] **Step 4:** Full check chain; `git status --short` shows only the new spec, its one snapshot, and the Task 2 files.
- [x] **Step 5:** Commit as `test(e2e): pin the live-view WebGPU frame to a darwin baseline`.

**Task 3 outcome (2026-08-31):** committed as one exempt test(e2e) commit. The baseline is byte-identical to all five Task 1 probe captures. The readiness wait is a real gate, not a delay: the attribute walks absent, then false, then true on the drive path, and the false state is reachable while the pipeline builds. The original schematic probe could not fail on this fixture; the recorded probe forces realistic instead.

## Task 4: Reviews before the lane closes

- [ ] **Step 1:** `pnpm rgb:audit --range origin/main..HEAD` exits zero (one cycle plus one exempt `test(e2e)` commit).
- [ ] **Step 2:** `/clean-code-review` on the branch diff, then `/review`; hold the branch for the landing window.
