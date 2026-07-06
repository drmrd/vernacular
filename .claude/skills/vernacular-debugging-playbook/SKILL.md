---
name: vernacular-debugging-playbook
description: Use when triaging a Vernacular failure symptom, z-fighting flicker where 3D surfaces meet, a screenshot baseline diff failing, the live 3D preview missing content the harness renders, a blank or tiny 3D canvas, a test flaking under full-suite load, OPFS storage silently becoming IndexedDB, vite or vitest config edits not taking effect, pnpm test not filtering, piped commands hiding exit codes, every e2e spec routing into scene-webgl, or pnpm knowledge:index aborting on an ADR status.
---

# Vernacular debugging playbook

## Overview

Every recurring failure mode in this repo has a known story, a discriminating experiment, and a sanctioned fix lane. Match the symptom, run the experiment BEFORE editing anything, then take the fix lane; do not improvise a fix for a problem this table already solves.

## When to use

- A test, gate, baseline, or render is failing and you have not yet identified the cause.
- Something behaves differently in the app, the harness, CI, or a worktree than you expect.

## When NOT to use

- Deep-diving a real 3D rendering defect after triage points at engine or reconciler code: switch to vernacular-rendering-defect-campaign.
- Wanting the full history of an investigation, reversal, or revert: vernacular-failure-archaeology.
- Baseline and gate policy questions (what counts as evidence, how to add a tier): vernacular-validation-and-qa.
- Measuring instead of eyeballing (probes, readouts, diagnostics): vernacular-diagnostics-and-tooling.
- Environment setup failures (installs, browsers, docker): vernacular-build-and-env.

## Quick reference

| #   | Symptom                                                             | Likely cause                                                 | First experiment                                                      |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | Flicker or stitching where two 3D surfaces meet                     | Coincident surfaces z-fighting outside the depth-bias ladder | Identify both surfaces and their material roles                       |
| 2   | Visual-baseline screenshot diff fails                               | Wrong-platform render, or a real visual change               | Identify the tier from the snapshot dir and the -darwin/-linux suffix |
| 3   | Live 3D view missing or wrong content, harness looks right          | Reconciler path diverges from the engine build path          | Load `?fixture=scene-harness` and compare                             |
| 4   | Blank or tiny 3D pane                                               | Collapsed CSS layout, not the renderer                       | Check the canvas client size FIRST                                    |
| 5   | Test flakes in the full suite, passes alone                         | Load-induced timing, not the test's logic                    | Rerun the single file in isolation, repeatedly                        |
| 6   | Storage uses IndexedDB where OPFS expected; e2e ignores your change | Stale preview server on port 4173 serving an old build       | Kill 4173, rebuild, rerun                                             |
| 7   | Edits to vite/vitest config have no effect                          | Stale emitted `.js` artifact shadows the `.ts` source        | `ls vite.config.js vitest.config.js`                                  |
| 8   | `pnpm test -- <path>` runs everything                               | pnpm-to-vitest arg passing does not filter                   | Use `pnpm exec vitest run --project unit <path>`                      |
| 9   | Gate "passed" but the failure is real                               | Piped exit code masked by `tail`/`head`                      | Rerun each gate alone, read its own exit                              |
| 10  | Every e2e spec runs in the scene-webgl project                      | Worktree path contains `scene-`, unanchored testMatch        | `pnpm exec playwright test --list`                                    |
| 11  | `pnpm knowledge:index` aborts on an ADR                             | Frontmatter status outside the indexer vocabulary            | `grep -n "ALLOWED_STATUS" scripts/knowledge-index.mjs`                |

## 1. Flicker where surfaces meet (z-fighting)

Story: one fix (bias the slab top so the wall base wins, ADR-0102) created the next fight (the ground plane then drew over the floor), which forced the generalization to an ordered ladder (ADR-0133), extended per-section (ADR-0141) and capped by a geometry inset for same-role pairs (ADR-0150). Issue #391 tracked the class.

Likely cause: two surfaces coplanar by design (walls, slabs, ground plane, furniture base caps all share the Y = 0 datum) with no defined depth order between them.

Discriminating experiment: name both fighting surfaces and their material roles. Then check whether each already has a rung in `engine/materials/role-appearance.ts`:

```
grep -n "DEPTH_BIAS" engine/materials/role-appearance.ts
```

The current rung table has one maintained home: vernacular-rendering-defect-campaign, Lane C (five rungs as of 2026-07-05, ending at `REVEAL_DEPTH_BIAS`, the window-reveal rung). Read the rungs from source with the grep above; each rung derives from the previous rung's constant, so the strict ordering is visible in code.

Fix lane:

- Different roles at a shared plane: join the ladder. Add a constant in `engine/materials/role-appearance.ts` derived from the rung it must lose to (previous factor + 1, previous units + 1), keyed on the surface role, applied through a `*DepthBiasParameters()` helper like the existing ones.
- Same role on both surfaces (a role-keyed offset lands on both and cancels): the ladder cannot help. Use the geometry lane of ADR-0150 instead: inset the faces off the shared plane, as `slabSidePositions` in `engine/scene/room-builder.ts` does for adjacent rooms' slab skirts.

Never: invent a free-standing epsilon, hand-tune a polygonOffset outside the ladder, or nudge geometry off the datum ad hoc. That is exactly how ADR-0102's fix caused the ADR-0133 bug.

## 2. Visual-baseline diff failing

Story: the cross-platform baseline saga (SwiftShader nondeterminism, arm64 vs amd64) settled into three tiers, each rendered on exactly one canonical channel per platform; a linux scene lane landed with ADR-0152 (PR #478). Wrong-platform render is the usual cause of a surprise diff. Full chronicle: vernacular-failure-archaeology.

Tier map as of 2026-07-05 (details and policy: vernacular-validation-and-qa):

| Tier    | Snapshot location                                                                                  | Platforms committed   | Canonical render channel                                                                                                                                          | Tolerance                                                             |
| ------- | -------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| App     | `e2e/tests/visual-regression.spec.ts-snapshots/`                                                   | -darwin only (3 PNGs) | Local dev Mac; spec self-skips where the platform baseline is missing                                                                                             | maxDiffPixelRatio 0.02 (`playwright.config.ts`)                       |
| Scene   | `e2e/tests/scene-visual-regression.spec.ts-snapshots/`, `e2e/tests/scene-solar.spec.ts-snapshots/` | -darwin AND -linux    | -darwin: dev Mac, real GPU via ANGLE Metal. -linux: ubuntu runner SwiftShader via the `refresh-scene-baselines.yml` workflow_dispatch, artifact `scene-baselines` | threshold 0.35, maxDiffPixelRatio 0.05 (constants in each scene spec) |
| Stories | `e2e/stories/__screenshots__/` (87 PNGs)                                                           | -linux only           | CI amd64 via `refresh-story-baselines.yml`, or docker amd64 via `pnpm stories:update-snapshots`                                                                   | maxDiffPixelRatio 0.01 (`playwright.stories.config.ts`)               |

Decision tree:

1. Identify the tier from the failing spec's snapshot directory and the platform from the filename suffix.
2. Was this diff produced on the platform and channel that rendered the baseline? If not, it is a wrong-platform render: discard the diff, rerun on the canonical channel. Scene -linux baselines come ONLY from the ubuntu runner workflow; never render them on a Mac and never under docker on Apple Silicon (amd64 chromium crashes under qemu, the constraint behind ADR-0117's CI-render design). Scene -darwin baselines come only from the dev Mac.
3. Intentional visual change? Refresh through the tier's canonical channel:
   - App (darwin): `pnpm e2e --update-snapshots=missing` for a missing baseline; targeted `--update-snapshots` runs for changed ones.
   - Scene (darwin): `pnpm exec playwright test --project=scene-webgl --update-snapshots=all` locally (pixel-exact refresh per ADR-0149 practice).
   - Scene (linux): dispatch `refresh-scene-baselines.yml`, download the `scene-baselines` artifact, commit its PNGs.
   - Stories: `pnpm stories:update-snapshots` (docker) or the refresh workflow.
4. Unintentional and reproducible on the right platform: a real regression. For scene-content defects switch to vernacular-rendering-defect-campaign.
5. Intermittent scene diff on identical code: suspect harness readiness (capture before sky, lighting, and ambient-occlusion settle). That class was closed by explicit readiness gating (ADR-0149); if it reappears, check the readiness signals in `e2e/tests/scene-helpers.ts` before touching baselines.

CI runs `--project=chromium` for e2e and a separate `scene-visual` job (`--project=scene-webgl`) that activates only while -linux scene baselines are committed (gate in `.github/workflows/ci.yml`).

## 3. Live 3D view wrong while the harness looks right

Story: the live preview is a second scene-construction path that has repeatedly diverged from the engine build path, and it has no pixel coverage of its own. The divergence cluster's current status and per-issue fix sketches have one maintained home: vernacular-rendering-defect-campaign, references/worked-examples.md (the live-view parity cluster); re-verify issue states with the gh one-liner in Provenance below.

The two paths:

| Path         | Entry                                                                                                           | Scene construction                                                                                                                 | Backend                       |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Harness      | `?fixture=scene-harness` URL param, handled in `app/app.tsx`, rendered by `bridge/react/scene-harness-view.tsx` | `buildFramedScene` (`bridge/react/framed-scene.ts`) calls engine `buildScene` (`engine/scene/build-scene.ts`): one-shot full build | Deterministic WebGL 2         |
| Live preview | Editor preview/split pane (`WebGPUSceneView`, `bridge/react/webgpu-scene-view.tsx`)                             | `useFramedScene` > `createFramedSceneReconciler` (`bridge/react/framed-scene-reconciler.ts`): incremental reconcile of subgroups   | WebGPU (hard gate, #476 open) |

Discriminating experiment: build and serve (`pnpm build`, `pnpm preview`), then load `http://localhost:4173/?fixture=scene-harness` (add `&scene=<name>` for a named fixture; param catalog: vernacular-config-and-flags). Compare against the live pane on the same content.

- Harness right, live wrong: the defect is in the reconciler lane. Check the parity cluster's open issues (maintained home above) before assuming a new bug.
- Both wrong: the defect is in the engine builders. Switch to vernacular-rendering-defect-campaign.

Fix lane: fix the reconciler to match the engine path, never the reverse; the harness build is the reference behavior and the baseline-pinned one.

## 4. Blank or tiny 3D pane

Story: incident #457 burned real time as suspected renderer or environment drift; the actual bug was `SplitBody` setting `flexBasis` on only one pane, collapsing the preview pane so the canvas fell back to the 300x150 replaced-element default. Fixed in PR #459 (`editor/viewport/view-mode-viewport.tsx`, both panes now get complementary flexBasis). Lesson: layout bugs masquerade as renderer failures.

Check in this order:

1. Canvas client size FIRST. In the browser console:
   ```
   document.querySelector('canvas')?.getBoundingClientRect()
   ```
   A 300x150 (or near-zero) rect means the CSS layout collapsed. Fix the layout; the renderer is innocent.
2. Fallback message "Your browser does not support WebGPU..." (`editor/shell/scene-pane.tsx`): the live pane hard-gates on `detectRenderBackend() === 'webgpu'` (also `bridge/react/scene-canvas.tsx`). Issue #476 (open as of 2026-07-05) tracks falling back to WebGL 2 instead.
3. Empty state "Nothing to show in 3D yet" (`editor/shell/scene-pane.tsx`): the canvas only mounts once the floor has geometry. Draw a wall first.
4. Only then suspect the render path (entry 3, then vernacular-rendering-defect-campaign).

## 5. Test flakes under full-suite load, passes in isolation

Story: issue #472 (open as of 2026-07-05): the `app/app.test.tsx` unsaved-changes discard dialog times out on `findByRole('alertdialog')` under full `pnpm test` load, yet passed 19 of 19 in isolation, reproduced across unrelated branches and an unmodified baseline. The load, not the change, owns the flake.

Discriminating experiment, ALWAYS before touching the test:

```
pnpm exec vitest run --project unit app/app.test.tsx
```

(substitute the flaking file; repeat several times). For a Playwright spec:

```
pnpm exec playwright test e2e/tests/<spec>.spec.ts --project=chromium --repeat-each=10
```

- Fails in isolation too: a real bug in the test or the code. Debug normally.
- Consistently green in isolation: load-induced timing. Do not blindly bump timeouts or rewrite the test. Check whether a flake issue already exists (search open issues), link your reproduction there, or file one. A stash-verified reproduction on an unmodified baseline is the strongest evidence your change is innocent.

## 6. Storage silently falls back from OPFS to IndexedDB

Story: an e2e storage investigation found the app under test was an OLD build served by a leftover preview server; `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so any process already on port 4173 wins and your rebuilt code never runs.

OPFS (origin-private file system, the browser's private durable directory) is preferred; `storage/select-project-store.ts` picks OPFS, then IndexedDB, and never throws. Detection is `typeof navigator.storage?.getDirectory === 'function'` (`storage/storage-capabilities.ts`).

Fix lane, in order:

1. Kill any stale preview server and rebuild:
   ```
   lsof -ti :4173 | xargs kill
   pnpm build
   ```
   then rerun the e2e or manual check.
2. Still on IndexedDB: check capability in the page console (`typeof navigator.storage?.getDirectory`) and whether a remembered backend preference is overriding the default (`selectProjectStoreBackend` honors a supported `preferred` backend).
3. The durable-storage e2e spec exercises adapters through the `?e2e-storage` hook (`src/e2e-storage-hook.ts`); use it to test adapters directly.

## 7. Stale emitted config artifacts

Story: root `vite.config.js`, `vite.config.d.ts`, `vitest.config.js`, `vitest.config.d.ts` are tsc build artifacts, not sources: `tsconfig.node.json` (composite) includes `vite.config.ts` and `vitest.config.ts` and emits alongside. All four are gitignored. Vite loads `vite.config.js` in preference to the `.ts` when both exist, so a stale `.js` silently shadows your edit.

Symptom: an edit to `vite.config.ts` or `vitest.config.ts` has no effect on dev server, build, or tests.

Fix lane: edit ONLY the `.ts` sources, then delete the stale artifacts (they re-emit on the next `pnpm build` / `tsc -b`):

```
rm -f vite.config.js vite.config.d.ts vitest.config.js vitest.config.d.ts
```

## 8. Vitest path filtering

Story: `pnpm test` is `vitest run --project unit`. Appending `-- <path>` through pnpm does not reach vitest as a filter (and mangles flags like `--coverage`), so the "filtered" run silently runs everything.

Fix lane: invoke vitest directly, keeping the project selection (the config defines a second `storybook` project that launches a real browser if you omit it):

```
pnpm exec vitest run --project unit <path-or-pattern>
```

## 9. Masked exit codes

Story: `cmd | tail -20; echo $?` prints tail's exit status, not cmd's. Gate failures (tsc, vitest) have been declared green this way.

Fix lane: run each gate on its own line and let the shell report its own exit; the full chain is:

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

If you must pipe, `set -o pipefail` first, and verify the exit of the command you care about, not the last pipe stage. Also remember pnpm test uses the unit project only; a green chain says nothing about e2e or story tiers.

## 10. Worktree path containing "scene-" hijacks Playwright routing

Story: a worktree named after a scene feature routed EVERY spec into the GPU project because Playwright matches `testMatch`/`testIgnore` regexes against the absolute file path, unanchored.

Precise mechanics in `playwright.config.ts` as of 2026-07-05: the `chromium`/`firefox`/`webkit` projects carry `testIgnore: /scene-.*\.spec\.ts/` and the `scene-webgl` project carries `testMatch: /scene-.*\.spec\.ts/`. If any directory segment of the worktree's absolute path contains `scene-`, every `*.spec.ts` path matches both patterns: the whole suite lands in `scene-webgl` (which wants a real GPU) and vanishes from the browser projects.

Discriminating experiment:

```
pnpm exec playwright test --list
```

and check which project each spec is assigned to.

Fix lane: name worktree directories so no path segment contains `scene-`. Do not hot-edit the config regex to compensate; anchoring `testMatch` to the tests directory is a real change that must go through the red-green-blue cycle (baselines and CI jobs key off the project names).

## 11. pnpm knowledge:index aborts on an ADR status

Story: issue #440: five committed ADRs carried `status: accepted` while the indexer only accepted a smaller vocabulary, so `pnpm knowledge:index` aborted at the first offender and the whole regeneration path was dead. The frontmatter was normalized to `current` and PR #466 taught the indexer `proposed`. Issue #440 remains open as of 2026-07-05 (alias decision unresolved), but no committed ADR carries a disallowed status today.

Mechanics: `scripts/knowledge-index.mjs` validates frontmatter `status` against `ALLOWED_STATUS = {proposed, current, superseded, deprecated}` and throws on anything else, killing the entire index run.

Fix lane: normalize the offending ADR's frontmatter `status:` to the indexer vocabulary (a one-line docs change; use `current` for an accepted-and-landed decision). Do not widen `ALLOWED_STATUS` ad hoc; that is a tooling change that goes through normal change control. ADR writing conventions: vernacular-docs-and-writing.

## Common mistakes

- Inventing a new depth epsilon or moving geometry off the datum instead of joining the ordered ladder (entry 1).
- Refreshing a baseline on the wrong platform or channel and committing the resulting diff (entry 2).
- Debugging renderer internals while the canvas is 300x150 because a flex layout collapsed (entry 4, the #457 lesson).
- Editing the emitted `vite.config.js` instead of the `.ts` source (entry 7).
- Bumping a flaky test's timeout without the isolation experiment and an issue link (entry 5).
- Treating `pnpm test -- <path>` as a filter (entry 8).
- Trusting the exit code of a piped gate (entry 9).
- Hot-editing the Playwright `testMatch` regex to rescue a badly named worktree (entry 10).
- Fixing the harness path to match the live view; the engine build path is the reference, fix the reconciler (entry 3).

## Provenance and maintenance

All facts verified against the repo and GitHub on 2026-07-05. Issue/PR states (open, closed, merged) and the tier platform map are the most drift-prone claims. Re-verify with:

- Depth-bias ladder rungs: `grep -n "DEPTH_BIAS" engine/materials/role-appearance.ts`
- Playwright projects, routing regexes, app tolerance: `grep -n "testMatch\|testIgnore\|SCREENSHOT_DIFF_TOLERANCE\|reuseExistingServer" playwright.config.ts`
- Scene tolerances: `grep -n "SHELL_" e2e/tests/scene-visual-regression.spec.ts e2e/tests/scene-solar.spec.ts`
- Stories tolerance: `grep -n "STORY_DIFF_TOLERANCE" playwright.stories.config.ts`
- Committed baseline platforms per tier: `git ls-files e2e/tests/visual-regression.spec.ts-snapshots e2e/tests/scene-visual-regression.spec.ts-snapshots e2e/stories/__screenshots__ | sed 's/.*-\(darwin\|linux\)\.png/\1/' | sort | uniq -c`
- CI scene lane gate: `grep -n "scene" .github/workflows/ci.yml`
- Dual render path wiring: `grep -n "buildScene" bridge/react/framed-scene.ts && grep -n "createFramedSceneReconciler" bridge/react/use-framed-scene.ts`
- Reconciler divergence and flake issue states: `for i in 434 437 440 469 472 476 477 479; do gh issue view $i --json number,state,title -q '"\(.number) \(.state) \(.title)"'; done`
- Indexer vocabulary: `grep -n "ALLOWED_STATUS" scripts/knowledge-index.mjs`
- ADR statuses on disk: `grep -rh "^status:" docs/knowledge/decisions/*.md | sort | uniq -c`
- Emitted config artifacts gitignored: `grep -n "vite.config\|vitest.config" .gitignore`
- Test script shape: `grep -n '"test"' package.json`
