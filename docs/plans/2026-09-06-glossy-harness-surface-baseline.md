# Glossy harness surface baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository runs its own red-green-blue TDD cycle through role-separated subagents dispatched from the main thread (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`); in this lane every committed change is an e2e spec or a generated baseline, so the cycle applies only if the camera-pose fallback task activates.

**Goal:** Commit a whole-frame scene baseline that contains the glossy harness floor, with a tolerance derived so a seeded roughness defect turns the scene-visual CI job red.

**Architecture:** The `finish-contrast` harness state already exists (paint store, environment state, and a sampled contrast gate, all from the glossy finish contrast gate lane). What is missing is baseline pixels: no committed screenshot contains a specular surface, so a roughness drift that spreads or erases the lobe without collapsing the sampled patch average passes CI unseen. This lane adds one baseline capture of `?fixture=scene-harness&scene=finish-contrast&paint=finish-contrast` to `e2e/tests/scene-solar.spec.ts` (whose capture helper already waits for `data-harness-ready`, and whose snapshot directory the refresh workflow already uploads), derives the capture's tolerance from measured defect probes, seeds the darwin baseline locally and the linux baseline through the `refresh-scene-baselines` workflow dispatched on the lane branch, and proves the gate by pushing a temporary roughness defect that CI must reject.

**Tech Stack:** Playwright `scene-webgl` project (chromium; Apple Metal ANGLE on darwin, SwiftShader on linux), `toHaveScreenshot` pixel comparison, the finish registry (`core/registries/finishes.ts`: `semi-gloss` roughness 0.3 sheen 0.5 specular 0.4, `matte` roughness 0.9 sheen 0 specular 0.04), GitHub workflow dispatch for runner renders.

**Spec:** `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md` (lane 1, issue #541).

## Global Constraints

- **Allowed files:** modify `e2e/tests/scene-solar.spec.ts`; create `e2e/tests/scene-solar.spec.ts-snapshots/scene-finish-contrast-webgl-scene-webgl-darwin.png` and `...-linux.png`; create this plan file. Fallback task only: `app/harness-environment.ts`, `app/harness-environment.test.ts`, and the patch constants in `e2e/tests/scene-finish-contrast.spec.ts`. Anything else (the refresh workflow, `playwright.config.ts`, the lighting rig, the registries) means STOP and report.
- **The registry probe is a temporary local edit.** `core/registries/finishes.ts` is edited only during derivation and the CI proof, and restored before every durable commit. Confirm with `git status --short` before each commit.
- **Every existing baseline stays byte-identical.** Verify with `cmp` when the runner artifact comes back; unexpected drift means STOP and report.
- **Tolerances are derived, then frozen** (the ADR-0157 midpoint rule), recorded in a comment on the named constants.
- **Worktree:** `../vernacular.wt/glossy-harness-baseline`, branch `feat/glossy-harness-baseline`. The path must never contain the substring `scene-` (Playwright routes projects on the absolute path).
- **Repo rules:** Conventional Commits; no em-dashes; no `Co-Authored-By` or `Claude-Session` trailers; author `Dan Moore <9156191+drmrd@users.noreply.github.com>`; ESLint zero problems (warnings count); `prettier --check .` repo-wide; no `git stash`; GitHub writes only outside weekday 08:30-18:30 local, and commit timestamps windowed out of those hours before the first push.
- **Full check chain before push:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, each exit code verified on its own.

## Design decisions carried into this plan

1. **The baseline lives in `scene-solar.spec.ts`.** The finish-contrast state is a named environment state under the color-check reference lighting; the solar spec's `captureShell` already waits for `data-harness-ready` (the reference lighting arrives through a lazily loaded chunk), and `refresh-scene-baselines.yml` already uploads this spec's snapshot directory. A new spec file would need a workflow edit; this home needs none.
2. **The seeded defect is roughness-only:** `semi-gloss` roughness 0.3 to 0.9 with sheen and specular kept. That is the drift the sampled contrast gate is least able to see (patch-average specular energy roughly survives a lobe spread), so it is the honest signal to derive from. The full collapse to matte values (the #520 defect class) is measured as a secondary signal; the tolerance derives from the weaker of the two.
3. **Per-capture tolerance overrides.** The standing `SHELL_THRESHOLD` 0.35 and `SHELL_MAX_DIFF_PIXEL_RATIO` 0.05 were chosen to absorb driver variation, not to see a specular lobe. `captureShell` moves to a single capture-description object (also keeps ESLint `max-params` at 3), and the new test carries its own derived pair. The other six captures keep the standing values.
4. **Linux pixels come from the runner, in this pull request.** `refresh-scene-baselines.yml` is dispatched with `--ref` the lane branch (the workflow file already exists on main, so branch dispatch works; the daylight-through-glass lane landed its linux pixels the same way). Only the new PNG is committed from the artifact.
5. **The CI proof is a temporary commit on the pull request.** Push the roughness defect, let the scene-visual job go red, record the run link, then drop the commit with `git reset --hard HEAD~1` and `git push --force-with-lease --no-verify`. If the classifier or a hook refuses the force push, `git revert` the defect commit instead (test(e2e) commits are exempt from the ping-pong audit, so the pair is legal history).
6. **Camera-pose fallback.** If no tolerance separates the roughness defect from noise at any candidate threshold, the finish-contrast state gets its own camera pose (the environment module reserves this right in the comment on `COLOR_ACCURACY_LIGHTING`). That is an app change: one red-green-blue cycle on `app/harness-environment.ts`, and the sampled gate's patch fractions in `scene-finish-contrast.spec.ts` must be re-derived for the new framing. If no pose shows a usable signal either, STOP; the surface choice becomes an owner decision, not the lane's.

---

### Task 1: Worktree and environment

**Files:** none committed except this plan.

- [ ] **Step 1:** `git worktree add ../vernacular.wt/glossy-harness-baseline -b feat/glossy-harness-baseline` from the main clone, then `pnpm install --frozen-lockfile` inside the worktree.
- [ ] **Step 2:** Confirm chromium is present: `pnpm exec playwright install chromium` is a no-op when the per-user cache already has it.
- [ ] **Step 3:** Kill any stale preview server so Playwright's `reuseExistingServer` cannot serve a stale bundle: `lsof -ti:4173 | xargs kill -9` (ignore a nonzero exit when the port is free).
- [ ] **Step 4:** `pnpm build` and confirm exit 0.
- [ ] **Step 5:** Commit this plan file: `git add docs/plans/2026-09-06-glossy-harness-surface-baseline.md && git commit -m "docs: plan the glossy harness surface baseline lane"`.

### Task 2: The baseline capture test

**Files:**

- Modify: `e2e/tests/scene-solar.spec.ts`

**Interfaces:**

- Consumes: the `finish-contrast` environment state and paint store (`app/harness-environment.ts`, `app/harness-paint.ts`, unchanged).
- Produces: a `ShellCapture` parameter object for `captureShell`, the constants `FINISH_CONTRAST_THRESHOLD` and `FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO` (values fixed in Task 3), and the test `renders the finish-contrast glossy floor to its baseline` writing `scene-finish-contrast-webgl.png`.

- [ ] **Step 1:** Replace `captureShell`'s three positional parameters with one object, keeping the body otherwise unchanged:

```ts
interface ShellCapture {
  readonly query: string
  readonly snapshot: string
  readonly threshold?: number
  readonly maxDiffPixelRatio?: number
}

async function captureShell(page: Page, capture: ShellCapture): Promise<void> {
  await page.goto(`/?fixture=scene-harness${capture.query}`)
  // ... existing body unchanged ...
  await expect(canvas).toHaveScreenshot(capture.snapshot, {
    threshold: capture.threshold ?? SHELL_THRESHOLD,
    maxDiffPixelRatio: capture.maxDiffPixelRatio ?? SHELL_MAX_DIFF_PIXEL_RATIO,
  })
}
```

Mechanically convert the six existing call sites, for example:

```ts
await captureShell(page, { query: '&scene=equinox-noon', snapshot: 'scene-equinox-noon-webgl.png' })
```

- [ ] **Step 2:** Add the new constants (placeholder values; Task 3 fixes them and writes the derivation comment) and the new test inside the existing describe block:

```ts
const FINISH_CONTRAST_THRESHOLD = 0.35
const FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO = 0.05

test('renders the finish-contrast glossy floor to its baseline', async ({ page }) => {
  await captureShell(page, {
    query: '&scene=finish-contrast&paint=finish-contrast',
    snapshot: 'scene-finish-contrast-webgl.png',
    threshold: FINISH_CONTRAST_THRESHOLD,
    maxDiffPixelRatio: FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO,
  })
})
```

- [ ] **Step 3:** Refresh the stale paragraph in the spec's header comment: "continuous integration neither renders nor checks them" predates the scene-visual job; the `-linux` family is now rendered by `refresh-scene-baselines.yml` and checked by the scene-visual CI job (ADR-0152). Keep the darwin sentence.
- [ ] **Step 4:** Run the six pre-existing captures against their committed darwin baselines to prove the refactor changed nothing: `pnpm exec playwright test --project=scene-webgl scene-solar`. Expected: six pass, one fails with a missing `scene-finish-contrast-webgl-scene-webgl-darwin.png` snapshot. That missing-snapshot failure is this lane's RED.

### Task 3: Derive the tolerance, seed darwin, commit

**Files:**

- Modify: `e2e/tests/scene-solar.spec.ts` (constants and derivation comment only)
- Create: `e2e/tests/scene-solar.spec.ts-snapshots/scene-finish-contrast-webgl-scene-webgl-darwin.png`

- [ ] **Step 1 (seed):** `pnpm exec playwright test --project=scene-webgl -g "finish-contrast glossy floor" --update-snapshots=all` writes the darwin PNG. Eyeball the PNG: the frame must show the floor with a visible specular response (the straight-down interior pose; the sampled gate measured OKLab separation 0.012 from this framing, so a lobe is expected).
- [ ] **Step 2 (noise):** Re-run the same test five times without `--update-snapshots`, with a temporary local override `maxDiffPixelRatio: 0`. Expected: five passes (darwin Metal captures have come back byte-identical in every prior derivation). Record the largest observed diff ratio as N (expected 0).
- [ ] **Step 3 (signal, roughness-only):** Edit `core/registries/finishes.ts`, `semi-gloss` roughness `0.3` to `0.9` (sheen and specular kept). `pnpm build`, kill the stale preview server, re-run the test with the temporary `maxDiffPixelRatio: 0` override at each candidate threshold 0.35, 0.2, 0.1, 0.05, 0.02. From each failure message record the reported diff ratio; call the value at the chosen threshold R1.
- [ ] **Step 4 (signal, full collapse):** Set the `semi-gloss` entry to the matte values (roughness 0.9, sheen 0, specular 0.04), rebuild, and record the same readings; call it R2. Restore `core/registries/finishes.ts`, rebuild, and confirm `git status --short core` is empty.
- [ ] **Step 5 (fix the constants):** Choose the largest candidate threshold T at which min(R1, R2) is at least 0.01. Set `FINISH_CONTRAST_THRESHOLD = T` and `FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO = min(R1, R2) / 2` rounded to three decimals. The margin rule: the chosen ratio must be at least twice N above N and at most half the weaker signal; with N = 0 the midpoint rule from ADR-0157 is satisfied by construction. If no candidate threshold yields min(R1, R2) at or above 0.01, go to Task 7 (camera-pose fallback). Write the derivation comment on the constants: both probe definitions, the five noise readings, R1 and R2 at each threshold, the date, and the platform (darwin Metal), mirroring the `FINISH_CONTRAST_MINIMUM` comment in `scene-finish-contrast.spec.ts`.
- [ ] **Step 6 (verify the gate bites):** With the final constants, one clean run passes and one roughness-defect run fails on darwin. Restore the registry after the defect run and confirm `git status --short` shows only the spec and the new PNG.
- [ ] **Step 7 (commit):** Two commits: `test(e2e): gate the finish-contrast glossy floor on a scene baseline` (the spec change) and `test(e2e): seed the darwin finish-contrast scene baseline` (the PNG). Run the full check chain first; verify each exit code on its own.

### Task 4: Push, open the pull request, seed the linux baseline

**Files:**

- Create: `e2e/tests/scene-solar.spec.ts-snapshots/scene-finish-contrast-webgl-scene-webgl-linux.png`

- [ ] **Step 1:** Confirm every commit timestamp falls outside weekday 08:30-18:30 local (`git log --format='%ad %cd'`); if any falls inside, window with the `git meta rewrite` recipe before pushing.
- [ ] **Step 2:** `git push --no-verify -u origin feat/glossy-harness-baseline` (the pre-push chain already ran by hand in Task 3; `--no-verify` avoids the known worktree hook failures).
- [ ] **Step 3:** Open the pull request against main: title `test(e2e): baseline the glossy harness floor (rendering-realism lane 1)`, body describing the gate, the derivation, and `Closes #541`. No session links.
- [ ] **Step 4:** The pull request's scene-visual job is expected red at this point (the linux snapshot does not exist yet). Dispatch the runner render on the lane branch: `gh workflow run refresh-scene-baselines.yml --ref feat/glossy-harness-baseline`, then watch it finish.
- [ ] **Step 5:** `gh run download <run-id> -n scene-baselines -D <scratch>/scene-baselines`. Copy ONLY `scene-finish-contrast-webgl-scene-webgl-linux.png` into `e2e/tests/scene-solar.spec.ts-snapshots/`. `cmp` every other artifact PNG against its committed counterpart; any difference means STOP and report drift.
- [ ] **Step 6:** Commit `test(e2e): seed the linux finish-contrast scene baseline from the runner render`, push, and watch `gh pr checks <n> --watch` until ci-complete is green.

### Task 5: Prove the gate on CI

- [ ] **Step 1:** On the lane branch, apply the roughness defect (`semi-gloss` roughness 0.9), commit `test(e2e): prove the finish-contrast baseline rejects a roughness defect`, push.
- [ ] **Step 2:** Wait for the scene-visual job. Expected: it fails, the failure names `renders the finish-contrast glossy floor to its baseline`, and every other scene test in that run passes (the red is targeted). Record the run URL.
- [ ] **Step 3:** Drop the defect: `git reset --hard HEAD~1 && git push --force-with-lease --no-verify origin feat/glossy-harness-baseline` (or `git revert` if the force push is refused). Watch CI return to green.
- [ ] **Step 4:** Add the acceptance evidence to the pull request body: the baseline set name, the red run URL, and the note that sibling scene tests stayed green in the red run.

### Task 6: Reviews and handoff to the owner

- [ ] **Step 1:** Dispatch `/clean-code-review` on the branch diff (sonnet). Address must-fix and should-fix findings as further `test(e2e)` commits.
- [ ] **Step 2:** Dispatch `/review` (the pr-reviewer, sonnet). Address findings; surface any deviation that would need an ADR to the owner before merge.
- [ ] **Step 3:** Take the pull request to green and MERGEABLE, then hand it to the owner for the merge decision. After the merge: remove the worktree (`git worktree remove ../vernacular.wt/glossy-harness-baseline`), delete the local branch, and hand the owner the remote-branch deletion command.

### Task 7: Camera-pose fallback (only if Task 3 Step 5 fails)

**Files:**

- Modify: `app/harness-environment.ts`, `app/harness-environment.test.ts` (one red-green-blue cycle, role-separated subagents, sonnet override)
- Modify: `e2e/tests/scene-finish-contrast.spec.ts` (re-derived patch fractions and minimum)

- [ ] **Step 1 (RED):** `/test-first` a failing unit test: the `finish-contrast` state carries its own camera pose distinct from the color-accuracy pose. `pnpm exec vitest run app/harness-environment.test.ts`; expected FAIL.
- [ ] **Step 2 (GREEN):** `/implement` a dedicated `FINISH_CONTRAST_CAMERA_POSE`. Starting geometry: stand low near the west wall at eye height, aim across the floor centre at a grazing angle, so the sky's reflection lobe crosses many more floor pixels than the straight-down view. For example `position { x: 600, y: 1500, z: -1500 }`, `target { x: 3400, y: 0, z: -1500 }`, near 100, far 10000; tune against the render.
- [ ] **Step 3 (BLUE):** `/clean-code-review` then `/refactor` (empty marker commit if no findings).
- [ ] **Step 4:** Re-derive the sampled gate's patch fractions and `FINISH_CONTRAST_MINIMUM` for the new framing (same five-capture procedure recorded in that spec's comment), then return to Task 3 Step 1.
- [ ] **Step 5:** If no pose yields min(R1, R2) at or above 0.01 either, STOP and put the surface choice to the owner.

## Self-review notes

- Spec coverage: lane 1 asks for a specular surface in the harness (exists since the contrast-gate lane), a named baseline set that includes it (Tasks 3 and 4), seeding through the refresh workflow (Task 4), and a seeded roughness defect turning the scene-visual job red (Task 5). Covered.
- The plan changes no production source on the happy path, so the ping-pong audit sees only `docs:` and `test(e2e)` commits, both exempt from ordering.
- Type consistency: `ShellCapture` is defined once in Task 2 and used by every capture; the constant names in Tasks 2, 3, and 5 match.
