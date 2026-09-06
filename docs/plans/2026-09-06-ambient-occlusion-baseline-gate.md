# Ambient-occlusion baseline gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. On the happy path every committed change is an e2e spec edit or a generated baseline PNG, so the repository's role-separated red-green-blue cycle applies only if the cropped-capture fallback task activates.

**Goal:** Tighten the `scene-ambient-occlusion` whole-frame baseline so a seeded GTAO parameter change turns the scene-visual CI job red, with the tolerance derived from measured noise on both platforms, and true up the seven stale linux baselines from issue #656 in the same deliberate refresh.

**Architecture:** The `ambient-occlusion` harness state (equinox-noon sun over the `furniture` fixture), its sampled OKLab contrast gate (`e2e/tests/scene-ambient-occlusion.spec.ts`), and its darwin and linux whole-frame baselines all landed with the earlier contrast-gate slice. What is missing is teeth on the pixels: the whole-frame capture still runs at the standing shell tolerances (per-pixel threshold 0.35, diff ratio 0.05), which issue #522 measured absorbing even a 10x GTAO radius defect. This lane derives a per-capture tolerance pair for that capture from two seeded radius probes (the historical no-op class and the 10x class), exactly the way lane 1 derived the finish-contrast pair, and proves it on CI with a droppable defect commit. Because a tight tolerance derived against stale pixels derives from fiction, the lane first trues up the seven `-linux` baselines that issue #656 found stale (six scene-solar lighting states plus the painted shell), and measures linux render noise by dispatching the refresh workflow twice and comparing the two artifacts byte for byte.

**Tech Stack:** Playwright `scene-webgl` project (chromium; Apple Metal ANGLE on darwin, SwiftShader on linux), `toHaveScreenshot`, the GTAO tuning constants in `engine/postprocessing/ambient-occlusion-params.ts` (`AO_RADIUS_METERS = 0.25`), `refresh-scene-baselines.yml` dispatched on the lane branch.

**Spec:** `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md` (lane 2, issue #522; issue #656 folded in).

## Global Constraints

- **Allowed files:** modify `e2e/tests/scene-solar.spec.ts`; replace stale PNGs under `e2e/tests/scene-solar.spec.ts-snapshots/` and `e2e/tests/scene-visual-regression.spec.ts-snapshots/`; create this plan file. Fallback task only: the clip constants in `e2e/tests/scene-solar.spec.ts`. Anything else (the refresh workflow, `playwright.config.ts`, the engine, the registries) means STOP and report.
- **The GTAO probe is a temporary local edit.** `engine/postprocessing/ambient-occlusion-params.ts` is edited only during derivation and the CI proof, and restored before every durable commit. Confirm with `git status --short` before each commit.
- **Baseline replacements are deliberate and listed.** Every replaced PNG is named in its commit message's body and in the pull request body, with issue #656 cited. Any baseline that was expected byte-identical but differs means STOP and report drift.
- **Tolerances are derived, then frozen** (the ADR-0157 midpoint rule), recorded in a comment on the named constants, with readings from both platforms.
- **Worktree:** `../vernacular.wt/ambient-occlusion-baseline-gate`, branch `feat/ambient-occlusion-baseline-gate`. The path must never contain the substring `scene-` (Playwright routes projects on the absolute path).
- **Repo rules:** Conventional Commits; no em-dashes; no `Co-Authored-By` or `Claude-Session` trailers; author `Dan Moore <9156191+drmrd@users.noreply.github.com>`; ESLint zero problems (warnings count); `prettier --check .` repo-wide; no `git stash`; GitHub writes only outside weekday 08:30-18:30 local, and commit timestamps windowed out of those hours before the first push (weekend timestamps are already outside the window).
- **Full check chain before push:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own.

## Design decisions carried into this plan

1. **The gate lives on the existing capture.** `scene-solar.spec.ts` already captures `&scene=ambient-occlusion` through `captureShell`, whose `ShellCapture` object accepts per-capture `threshold` and `maxDiffPixelRatio` overrides since lane 1. No new test; the existing test gets a derived constant pair, mirroring `FINISH_CONTRAST_THRESHOLD`.
2. **Two radius-only probes, both from the documented defect record.** Probe A is the historical no-op class (ADR-0158: the addon default read as 0.25 in a millimetre world, so `AO_RADIUS_METERS = 0.00025`); probe B is the 10x recalibration probe from issue #522 (`AO_RADIUS_METERS = 2.5`). The tolerance derives from the weaker of the two signals, midpoint rule, per ADR-0157.
3. **The linux side is measured, not assumed.** The refresh workflow is dispatched twice on the lane branch; byte-comparing the two artifacts measures the runner's render noise. The CI red run's reported diff ratio measures the linux probe signal. The derived ratio must sit at or below half the weaker signal on BOTH platforms; if the linux red-run reading breaks the midpoint rule, the constants are re-derived with that reading folded in before merge.
4. **Issue #656's true-up rides in front.** The seven stale `-linux` PNGs (equinox-noon, winter-afternoon, color-check, overcast-noon, ambient-occlusion, window-light, and the painted shell) are replaced from the first workflow artifact in one commit. A tight ambient-occlusion tolerance only means something against fresh pixels. The darwin baselines get the same staleness measurement locally; any that differ at ratio 0 are refreshed in the same deliberate pass and listed.
5. **The CI proof uses the weaker probe.** If the job goes red on the weaker signal, the stronger defect class is caught a fortiori. Expected red: exactly two failures, the whole-frame ambient-occlusion capture and the sampled contrast gate (which the same probe drives under its 0.0126 minimum); every other scene test stays green. The defect commit is dropped afterward with `git reset --hard HEAD~1 && git push --force-with-lease --no-verify` (allowed on a feature branch), or `git revert` if the force push is refused.
6. **Cropped-capture fallback.** If no candidate threshold separates the weaker probe from noise on the whole frame, the capture gains a `clip` on the screenshot call: a 96 x 96 px region centred on the window head reveal (`{ x: 176, y: 68, width: 96, height: 96 }` on the 320 x 240 canvas, covering the sampled gate's reveal and open-wall patches), which concentrates the occlusion signal. That adds a new snapshot name (`scene-ambient-occlusion-reveal-webgl.png`), seeded on both platforms the same way, derivation re-run. If the crop shows no separable signal either, STOP; the gate design goes to the owner as a numeric occlusion-buffer statistic decision, noted in the owner scratch file.

---

### Task 1: Worktree and environment

**Files:** none committed except this plan.

- [ ] **Step 1:** From the main clone: `git worktree add ../vernacular.wt/ambient-occlusion-baseline-gate -b feat/ambient-occlusion-baseline-gate`, then `pnpm install --frozen-lockfile` inside the worktree.
- [ ] **Step 2:** Confirm chromium is present: `pnpm exec playwright install chromium` (no-op when cached).
- [ ] **Step 3:** Kill any stale preview server: `lsof -ti:4173 | xargs kill -9` (a nonzero exit when the port is free is fine).
- [ ] **Step 4:** `pnpm build`; confirm exit 0.
- [ ] **Step 5:** Commit this plan: `git add docs/plans/2026-09-06-ambient-occlusion-baseline-gate.md && git commit -m "docs: plan the ambient-occlusion baseline gate lane"`.

### Task 2: Derive the tolerance on darwin, commit the spec change

**Files:**

- Modify: `e2e/tests/scene-solar.spec.ts` (constants and derivation comment only)
- Possibly replace: `e2e/tests/scene-solar.spec.ts-snapshots/scene-ambient-occlusion-webgl-scene-webgl-darwin.png` (only if Step 1 shows the committed darwin baseline is stale)

**Interfaces:**

- Consumes: `ShellCapture` (lane 1) and the existing test `renders the ambient-occlusion interior to its baseline`.
- Produces: `AMBIENT_OCCLUSION_THRESHOLD` and `AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO`, wired into that test's `captureShell` call.

- [ ] **Step 1 (noise and freshness):** Run the ambient-occlusion test five times against the committed darwin baseline with a temporary local override `threshold: 0, maxDiffPixelRatio: 0`: `pnpm exec playwright test --project=scene-webgl -g "ambient-occlusion interior"`. Five passes mean the committed darwin PNG is fresh and the noise band N is 0. Any failure: re-seed the darwin PNG with `--update-snapshots=all`, eyeball it (interior, furniture box, darkened window head reveal), record the pre-refresh diff ratio for the pull request body, and repeat the five runs.
- [ ] **Step 2 (probe A, no-op radius):** Edit `engine/postprocessing/ambient-occlusion-params.ts`: `AO_RADIUS_METERS` from `0.25` to `0.00025`. `pnpm build`, kill the stale preview server, run the test with the ratio-0 override once per candidate threshold 0.35, 0.2, 0.1, 0.05, 0.02, 0. Record the reported diff ratio at each; call the series RA.
- [ ] **Step 3 (probe B, 10x radius):** Set `AO_RADIUS_METERS` to `2.5`, rebuild, kill the server, record the same series; call it RB. Restore `AO_RADIUS_METERS = 0.25`, rebuild, and confirm `git status --short engine` is empty.
- [ ] **Step 4 (fix the constants):** Choose the largest candidate threshold T at which min(RA, RB) is at least 0.01. Set `AMBIENT_OCCLUSION_THRESHOLD = T` and `AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO = min(RA, RB) / 2`, rounded to three decimals. With N = 0 the ADR-0157 midpoint rule is satisfied by construction; if N > 0 the ratio must also sit at least 2N above N. If no candidate T qualifies, go to Task 6 (cropped-capture fallback). Write the derivation comment on the constants: both probe definitions with the ADR-0158 and issue #522 provenance, the five noise readings, RA and RB at each threshold, the date, the platform, and a placeholder line for the linux red-run reading that Task 5 fills in.
- [ ] **Step 5 (the gate bites locally):** With the final constants wired into the test's `captureShell` call: one clean run passes; one probe-A run fails. Restore the engine file, rebuild, confirm `git status --short` shows only the spec (and the darwin PNG if Step 1 re-seeded it).
- [ ] **Step 6 (commit):** Run the full check chain, each exit code checked on its own. Commit `test(e2e): derive a pixel tolerance for the ambient-occlusion baseline` (spec edit; plus a separate `test(e2e): refresh the stale darwin ambient-occlusion baseline` commit first if Step 1 re-seeded).

### Task 3: Darwin staleness sweep for the remaining baselines

**Files:**

- Possibly replace: stale `-darwin` PNGs in `e2e/tests/scene-solar.spec.ts-snapshots/` and `e2e/tests/scene-visual-regression.spec.ts-snapshots/`

- [ ] **Step 1:** Run every scene-webgl test once with a temporary ratio-0, threshold-0 override in both spec files: `pnpm exec playwright test --project=scene-webgl`. List which captures differ from their committed darwin baselines and by how much (the failure output reports pixel counts).
- [ ] **Step 2:** For each stale darwin PNG: re-seed with `--update-snapshots=all`, eyeball the new frame, and verify the standing-tolerance run passes afterward. Revert the temporary overrides so the specs read exactly as committed plus the Task 2 change.
- [ ] **Step 3:** If any darwin PNG was replaced: commit `test(e2e): true up stale darwin scene baselines before the tolerance gate`, listing every replaced file and its measured pre-refresh diff in the body, citing issue #656's mechanism. If none were stale, skip and note that in the pull request body.

### Task 4: Push, open the pull request, measure linux noise, true up the linux baselines

**Files:**

- Replace: `scene-equinox-noon-`, `scene-winter-afternoon-`, `scene-color-check-`, `scene-overcast-noon-`, `scene-ambient-occlusion-`, `scene-window-light-` `webgl-scene-webgl-linux.png` under `e2e/tests/scene-solar.spec.ts-snapshots/`, and `scene-shell-painted-webgl-scene-webgl-linux.png` under `e2e/tests/scene-visual-regression.spec.ts-snapshots/`

- [ ] **Step 1:** Confirm every commit timestamp falls outside weekday 08:30-18:30 local (`git log --format='%ad %cd'`); window with `git meta rewrite` if not.
- [ ] **Step 2:** `git push --no-verify -u origin feat/ambient-occlusion-baseline-gate`.
- [ ] **Step 3:** Open the pull request: title `test(e2e): gate ambient-occlusion drift on a derived baseline tolerance (rendering-realism lane 2)`, body describing the gate, the derivation, the #656 true-up, with `Closes #522` and `Closes #656`. No session links. The scene-visual job is expected red at this head (the tightened tolerance against the stale linux PNG); say so in the body.
- [ ] **Step 4:** Dispatch the runner render twice: `gh workflow run refresh-scene-baselines.yml --ref feat/ambient-occlusion-baseline-gate`, wait for completion, then dispatch again. Download both artifacts to separate scratch directories.
- [ ] **Step 5 (linux noise):** `cmp` every PNG in artifact 1 against its counterpart in artifact 2. All byte-identical: linux noise is 0; record that in the derivation comment. Any pair differing: measure the diff ratio, and fold 2x that noise into the ratio constant if it sits above the current value (then re-run Task 2 Step 5 locally).
- [ ] **Step 6 (true-up):** Copy the seven stale `-linux` PNGs from artifact 1 into the tree. `cmp` every remaining artifact PNG against its committed counterpart; the five geometry states and finish-contrast must be byte-identical (drift there means STOP and report). Commit `test(e2e): true up the stale linux scene baselines from a fresh runner render`, listing all seven files and citing issue #656; push; watch `gh pr checks --watch` until ci-complete is green.

### Task 5: Prove the gate on CI, finish the derivation record

- [ ] **Step 1:** Apply probe A (`AO_RADIUS_METERS = 0.00025`), commit `test(e2e): prove the ambient-occlusion baseline rejects a no-op radius defect`, push.
- [ ] **Step 2:** Wait for the scene-visual job. Expected: red, with exactly two failures (the whole-frame ambient-occlusion capture and the sampled contrast gate) and every other scene test green. Record the run URL and the reported linux diff ratio for the whole-frame failure.
- [ ] **Step 3 (midpoint check on linux):** The reported linux ratio must be at least twice `AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO`. If it is not, lower the ratio constant to half the linux reading (it must still clear 2x the measured noise; if it cannot, activate Task 6), update the derivation comment, and amend before the defect drop.
- [ ] **Step 4:** Drop the defect commit: `git reset --hard HEAD~1 && git push --force-with-lease --no-verify origin feat/ambient-occlusion-baseline-gate` (or `git revert` if refused). Fill the linux reading into the derivation comment's placeholder line, commit `test(e2e): record the linux probe reading in the derivation comment`, push, watch CI back to green.
- [ ] **Step 5:** Add the acceptance evidence to the pull request body: the tolerance pair with both platforms' readings, the red run URL, the note that the two ambient-occlusion gates were the only failures, and the list of trued-up baselines.

### Task 6: Cropped-capture fallback (only if Task 2 Step 4 or Task 5 Step 3 fails)

**Files:**

- Modify: `e2e/tests/scene-solar.spec.ts`
- Create: `e2e/tests/scene-solar.spec.ts-snapshots/scene-ambient-occlusion-reveal-webgl-scene-webgl-darwin.png` and `...-linux.png`

- [ ] **Step 1:** Extend `ShellCapture` with an optional `clip?: { x: number; y: number; width: number; height: number }` passed through to `toHaveScreenshot`. Add a second capture to the ambient-occlusion test: snapshot `scene-ambient-occlusion-reveal-webgl.png`, `clip: { x: 176, y: 68, width: 96, height: 96 }` (the window head reveal and the open wall above it; the sampled gate's patch centres 224,116 and 224,100 both sit inside).
- [ ] **Step 2:** Seed the darwin crop PNG, then re-run the Task 2 derivation for the crop (its 9216-pixel frame makes the ratio scale different; same probes, same ladder, same midpoint rule).
- [ ] **Step 3:** Seed the linux crop PNG through the Task 4 workflow-dispatch path, then run the Task 5 proof against the crop gate.
- [ ] **Step 4:** If the crop shows no separable signal either, STOP: restore the tree to the Task 4 state, note the numeric occlusion-buffer statistic decision in the owner scratch file, and leave the true-up pull request (still a complete #656 fix) for review as-is with `Closes #656` only.

### Task 7: Reviews, merge, cleanup

- [ ] **Step 1:** Dispatch `/clean-code-review` on the branch diff (sonnet). Address must-fix and should-fix findings as further `test(e2e)` commits.
- [ ] **Step 2:** Dispatch `/review` (the pr-reviewer, sonnet). Address findings; surface any deviation that would need an ADR before merging.
- [ ] **Step 3:** With ci-complete green and MERGEABLE: `gh pr merge --merge` (merge commit; in-session owner authorization for this autonomous session, 2026-09-06). Confirm issues #522 and #656 closed.
- [ ] **Step 4:** From the main clone: `git pull --ff-only`, `git worktree remove ../vernacular.wt/ambient-occlusion-baseline-gate`, `git branch -D feat/ambient-occlusion-baseline-gate`, `git push --no-verify origin --delete feat/ambient-occlusion-baseline-gate`.
- [ ] **Step 5:** Update the memory file `rendering-realism-spec-status.md` (lane 2 done, lane 3 next) and the owner scratch file.

## Self-review notes

- Spec coverage: lane 2 asks for a harness state emphasising contact occlusion (exists since the contrast-gate slice; recorded in the Architecture paragraph), a baseline set for the occlusion state (exists; Task 4 trues it up and Task 2 possibly re-seeds darwin), a tolerance derived from measured cross-platform noise (Tasks 2, 4, and 5 measure darwin noise, linux noise, and both probe signals), and a seeded GTAO parameter change turning the job red (Task 5). Issue #656's seven-baseline true-up is Tasks 3 and 4. Covered.
- Happy path commits are `docs:` and `test(e2e)` only, both exempt from ping-pong ordering; the engine probe never lands in a durable commit.
- Type consistency: `ShellCapture` and `captureShell` match lane 1's landed shapes; the constant names in Tasks 2 and 5 match; the fallback's `clip` extension names the one new field in both tasks that use it.
