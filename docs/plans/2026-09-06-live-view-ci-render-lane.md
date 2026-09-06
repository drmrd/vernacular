# Live-view CI render lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every committed change is CI infrastructure, a docs file, or a temporary defect commit that never merges, so the role-separated red-green-blue cycle does not apply on the happy path.

**Goal:** Run the existing live-view WebGPU visual spec in CI on a macOS runner so a live-render regression fails a required job, prove it with a seeded live-view-only defect, and record the lane shape and run cost in ADR-0171.

**Architecture:** The spec (`e2e/tests/scene-live-view-visual-regression.spec.ts`), its readiness gating, and its darwin baseline all exist on main; on linux CI the spec self-skips because no WebGPU adapter exists, so today no CI job pixel-tests the render path users see. A probe on this branch (run 34067553157) established the facts the lane rests on: the `macos-14` runner's chromium exposes a real WebGPU adapter, the spec runs there rather than skipping, it passes against the committed development-Mac baseline at the standing tolerances, and the spec step itself takes about 7 seconds inside a roughly 4-minute job. So the lane adds one `macos-14` job to `ci.yml`, gated on the existing `decide.outputs.e2e` key (the captured frame includes editor overlay text, so the paths that trigger e2e are exactly the paths that can move this frame; no `decide.mjs` change), aggregated by `ci-complete` like every other heavy job.

**Tech Stack:** GitHub Actions `macos-14` runner (arm64, Metal-backed WebGPU adapter; macOS minutes bill at 10x linux), Playwright `scene-webgl` project, the existing spec and baseline, `decide.outputs.e2e` gating.

**Spec:** `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md` (lane 3, issue #469).

## Global Constraints

- **Allowed files:** `.github/workflows/ci.yml`, deletion of `.github/workflows/probe-macos-webgpu.yml`, `docs/knowledge/decisions/ADR-0171-live-view-ci-render-lane.md`, this plan file. The temporary defect commit may touch `bridge/react/webgpu-scene-view.tsx` only, and it never merges. Anything else means STOP and report.
- **Repo rules:** Conventional Commits (`build:` for workflow changes, `docs:` for documents); no em-dashes; no trailers; author `Dan Moore <9156191+drmrd@users.noreply.github.com>`; ADR prose passes the humanizer standard; weekend timestamps need no windowing.
- **Full check chain before the pull request:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code on its own (the workflow edit cannot break them, but the chain is the standing gate).

## Design decisions carried into this plan

1. **Reuse `decide.outputs.e2e`; add no new decide key.** The live view composites editor overlays into the captured frame, so the e2e path set (`app/`, `editor/`, `bridge/`, `engine/`, `e2e/`) is the right trigger set, and `ci:full`, `ci:skip-heavy`, `run:e2e`, and draft-state handling come along for free. The ADR records this as the lane's cost control: the job runs only when a PR touches code that can move the frame.
2. **One baseline serves the development Mac and the runner.** The probe passed against the committed `-darwin` baseline at the standing 0.35 and 0.05 tolerances, so the lane commits no new pixels and introduces no new snapshot suffix. If the runner image ever drifts past the tolerances, the job fails and the failure artifact carries the actual render; that is the standing deliberate-refresh discipline, recorded in the ADR.
3. **The defect for the red proof lives in `bridge/react/webgpu-scene-view.tsx`.** The harness fixture never mounts that component, so a seeded render defect there must fail the new job while the harness specs stay green, which is exactly lane 3's acceptance sentence. The defect commit is dropped with `git reset --hard HEAD~1` and a `--force-with-lease` push, the lane 1 and 2 recipe.
4. **ADR-0171 documents the lane, the probe evidence, and the cost:** roughly 4 macOS-runner minutes per triggered run, billed at 10x, gated as decision 1 describes.

---

### Task 1: Worktree and probe

- [x] **Step 1:** Worktree `../vernacular.wt/live-view-ci-render-lane`, branch `feat/live-view-ci-render-lane`.
- [x] **Step 2:** Push the temporary push-triggered probe workflow; observe run 34067553157: `1 passed (7.0s)` on `macos-14`, no skip, against the committed darwin baseline.
- [ ] **Step 3:** Commit this plan: `git add docs/plans/2026-09-06-live-view-ci-render-lane.md && git commit -m "docs: plan the live-view CI render lane"`.

### Task 2: The ci.yml job

**Files:** modify `.github/workflows/ci.yml`; delete `.github/workflows/probe-macos-webgpu.yml`.

- [ ] **Step 1:** Add a `live-view-visual` job after `scene-visual`: name `Live-view visual regression (macOS/WebGPU)`, `runs-on: macos-14`, `needs: [check, decide]`, `if: needs.decide.outputs.e2e == 'true'`, steps mirroring the probe (checkout, pnpm 10.33.4, node from `.nvmrc` with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, `pnpm build`, `pnpm exec playwright test --project=scene-webgl e2e/tests/scene-live-view-visual-regression.spec.ts --reporter=list`), plus a failure-only artifact upload of `test-results/` named `live-view-visual-report`, retention 7 days. A header comment states the probe facts and the 10x minute cost.
- [ ] **Step 2:** Add `live-view-visual` to `ci-complete`'s `needs`, its echo line, and its result loop, exactly matching the existing pattern.
- [ ] **Step 3:** Delete the probe workflow file.
- [ ] **Step 4:** Run the full check chain, each exit code on its own. Commit `build: run the live-view WebGPU visual spec on a macOS CI lane` and push.
- [ ] **Step 5:** Open the pull request: title `build: add the live-view WebGPU visual CI lane (rendering-realism lane 3)`, body with the probe evidence and `Closes #469`. Watch the PR run: the new job must appear, run (this branch touches `.github/` and `e2e/`-adjacent paths through the plan only, so confirm the gate fired; if the job skipped because the diff touches no e2e path, note that the gate works as designed and rely on the defect commit to exercise it), and `ci-complete` must aggregate it.

### Task 3: Red proof

- [ ] **Step 1:** Seed a live-view-only defect in `bridge/react/webgpu-scene-view.tsx` (pick a one-line change that visibly moves the rendered frame, for example offsetting the camera target the view passes to its scene setup; verify locally first: the live-view spec fails, the harness specs pass: `pnpm exec playwright test --project=scene-webgl`). Commit `test(e2e): prove the live-view lane rejects a live-view-only render defect`, push.
- [ ] **Step 2:** Watch the PR run: `live-view-visual` fails, `scene-visual` and every harness test pass, `ci-complete` fails. Record the run URL and the reported diff.
- [ ] **Step 3:** Drop the defect: `git reset --hard HEAD~1 && git push --force-with-lease --no-verify`. Watch CI return to green.

### Task 4: ADR-0171

- [ ] **Step 1:** Write `docs/knowledge/decisions/ADR-0171-live-view-ci-render-lane.md`: status current; context (the live view had no CI pixel coverage, ADR-0151's known backend-split risk, issue #469); decision (the macos-14 job, the e2e-key gate, one shared baseline); the probe and red-proof evidence with run links; consequences (cost per triggered run at 10x minutes, the deliberate-refresh rule if the runner image drifts, the thin-margin watch item does not apply here since the standing tolerances hold). Humanizer pass on the prose. `pnpm knowledge:index` must exit 0.
- [ ] **Step 2:** Commit `docs: record the live-view CI render lane in ADR-0171`, push, watch CI green.

### Task 5: Reviews, merge, cleanup

- [ ] **Step 1:** `/clean-code-review` on the branch diff (sonnet); address findings.
- [ ] **Step 2:** `/review` (pr-reviewer, sonnet); address findings.
- [ ] **Step 3:** Merge with `gh pr merge --merge` (in-session authorization, 2026-09-06 autonomous session). Confirm #469 closed.
- [ ] **Step 4:** Pull main; remove the worktree and both branch copies; update the campaign memory and the owner scratch file.

## Self-review notes

- Lane 3's acceptance evidence: a live-view baseline set (exists on main; the ADR records that the lane reuses it), a seeded reconciler-class defect the spec catches while harness specs stay green (Task 3), the CI render lane with its cost documented in its own ADR (Tasks 2 and 4). Covered.
- Commit types: `docs:`, `build:`, and a dropped `test(e2e)` commit; nothing the ping-pong audit orders.
- The probe workflow never reaches main: created and deleted on this branch.
