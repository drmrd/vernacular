---
name: vernacular-rendering-defect-campaign
description: 'Use when a 3D rendering defect appears in Vernacular. Symptoms: z-fighting or flicker at surface contacts, wrong lighting or sky or ambient occlusion, geometry in the scene harness but missing in the live 3D pane (or the reverse), flaky scene screenshot captures, scene-webgl visual-regression failures, darwin versus linux baseline mismatches. Keywords: scene harness, framed-scene reconciler, depth-bias ladder, polygon offset, data-harness-ready, WebGPU, WebGL 2.'
---

# Rendering defect campaign

## Overview

Rendering defects here recur in six classes, and each class has a known lane with known traps. Classify the symptom with one discriminating experiment before touching code, then run the lane end to end. Every fix carries a proof obligation, lands through the red-green-blue cycle, and is judged by a measured pixel or numeric gate, never by eye.

## When to use

- Anything wrong in the 3D view: harness renders, the live editor pane, scene screenshots, scene baselines.
- A scene-webgl Playwright spec fails or flakes.
- A committed scene baseline diverges on one platform family.

## When NOT to use

- Quick one-symptom triage of build, test, storage, or CI failures: use vernacular-debugging-playbook.
- Non-rendering investigations (performance study, design question, hypothesis testing): use vernacular-research-methodology.
- Definitions of gates, tiers, and what counts as evidence: vernacular-validation-and-qa owns those; this skill only applies them.
- Running the app or harness in general: vernacular-run-and-operate.

## Quick reference

Two render paths exist. Most campaigns hinge on knowing which one is wrong.

| Path                  | Chain (entry to Three.js)                                                                                                                                                                                         | Backend                              | Pixel coverage                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Deterministic harness | `app/app.tsx` (`?fixture=scene-harness`) -> `bridge/react/scene-harness-view.tsx` -> `buildFramedScene` in `bridge/react/framed-scene.ts` -> `engine/scene/build-scene.ts` (full rebuild)                         | WebGL 2, forced (`forceWebGL: true`) | Committed baselines, `-darwin` and `-linux` families  |
| Live editor 3D pane   | `editor/shell/scene-pane.tsx` (WebGPU gate, issue #476) -> `bridge/react/webgpu-scene-view.tsx` -> `bridge/react/use-framed-scene.ts` -> `bridge/react/framed-scene-reconciler.ts` (incremental, per-floor cache) | WebGPU                               | NONE as of 2026-07-05 (issue #469); semantic e2e only |

Commands (repo root; production build required before e2e because Playwright serves `dist/` via `pnpm preview --port 4173 --strictPort`):

| Task                                        | Command                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Look at the harness by eye                  | `pnpm dev` then open `http://localhost:5173/?fixture=scene-harness&scene=junctions`                                       |
| All scene specs (12 files as of 2026-07-05) | `pnpm build && pnpm exec playwright test --project=scene-webgl`                                                           |
| One scene spec                              | `pnpm exec playwright test --project=scene-webgl e2e/tests/scene-visual-regression.spec.ts`                               |
| Flake check                                 | append `--repeat-each=5`                                                                                                  |
| Unit tests for one builder                  | `pnpm exec vitest run --project unit engine/scene/build-scene.test.ts` (NOT `pnpm test -- <path>`, which does not filter) |
| Refresh `-darwin` scene baselines           | `pnpm exec playwright test --project=scene-webgl --update-snapshots=all`                                                  |
| Refresh `-linux` scene baselines            | `gh workflow run refresh-scene-baselines.yml` on main, download the `scene-baselines` artifact, commit as `test(e2e)`     |
| Cycle audit before PR                       | `pnpm rgb:audit --range origin/main..HEAD`                                                                                |

Gate numbers (as of 2026-07-05):

| Tier                                                                             | maxDiffPixelRatio     | Per-pixel threshold | Committed families                                                                                              |
| -------------------------------------------------------------------------------- | --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scene WebGL (`e2e/tests/scene-visual-regression.spec.ts`, `scene-solar.spec.ts`) | 0.05                  | 0.35                | `-darwin` (dev-Mac Metal, authoritative) + `-linux` (runner SwiftShader, gates CI `scene-visual` job, ADR-0152) |
| App visual (`e2e/tests/visual-regression.spec.ts`)                               | 0.02 (config default) | Playwright default  | `-darwin` only; spec self-skips when the platform baseline is missing                                           |
| Stories (`playwright.stories.config.ts`)                                         | 0.01                  | Playwright default  | `-linux` only (87 PNGs)                                                                                         |

Harness `?scene=` keys (`app/harness-environment.ts`): geometry fixtures `junctions`, `furniture`, `adjacent-rooms`; named environment states `equinox-noon`, `winter-afternoon`, `color-check`, `overcast-noon`, `ambient-occlusion` (pairs the `furniture` geometry). Extra params: `&temp=2700` (color temperature), `&paint=demo`.

## Step 0: classify the symptom

Before anything: run `pnpm build` and kill any stale server on port 4173. `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so a leftover preview server serves an old bundle and every observation lies.

| #   | Symptom class                                                                 | Discriminating experiment                                                                                                                                    | Expected observation and lane                                                                                                                                         |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Geometry wrong: shape, position, missing faces, wrong footprint               | Run the owning builder's unit tests (`engine/scene/*-builder.test.ts`, `build-scene.test.ts`); they run in Node, no GPU                                      | Tests red: ordinary builder bug, fix in Lane A. Tests green but pixels wrong: assembly or material problem, Lane A                                                    |
| 2   | Shading, lighting, sky, color, or ambient occlusion wrong                     | Load each named environment state: `?fixture=scene-harness&scene=equinox-noon`, then `winter-afternoon`, `overcast-noon`, `color-check`, `ambient-occlusion` | One state wrong: Lane F, target that provider slice. All states plus the default lighting wrong: Lane A (material or renderer)                                        |
| 3   | Content present in one view, missing or different in the other                | Load `?fixture=scene-harness&scene=<name>`, then reproduce the same content in the live editor 3D pane                                                       | Harness correct, live pane wrong: Lane B (dual-path parity). Both wrong: Lane A (engine scene assembly). Live correct, harness wrong: Lane D or a harness fixture bug |
| 4   | Flicker, shimmer, or stitching where two surfaces touch, worse while orbiting | Orbit the camera; name the two touching surfaces and check whether they are coincident by design (shared datum or shared plane)                              | Coincident contact: Lane C (depth ladder). Not coincident: geometry overlap, Lane A                                                                                   |
| 5   | Scene screenshot flaky: sometimes a placeholder background or half-lit frame  | `pnpm exec playwright test --project=scene-webgl e2e/tests/scene-solar.spec.ts --repeat-each=5`                                                              | Intermittent: Lane D (readiness). Deterministic failure: reclassify as 1, 2, or 6                                                                                     |
| 6   | Fails on exactly one platform family                                          | Identify the failing suffix: `-darwin` (local Mac) vs `-linux` (CI `scene-visual` job)                                                                       | Lane E (platform/baseline)                                                                                                                                            |

If the symptom spans classes, run the lanes in this order: D (rule out capture lies), then B/A (establish which path is wrong), then C/F/E.

## Lane A: engine scene assembly

Both paths render from `engine/scene/build-scene.ts` output (the reconciler reuses the same builders), so a defect in both views lives in `engine/`.

1. Locate the owner: `build-scene.ts` (per-floor assembly, edge overlay, ground plane), `wall-builder.ts`, `room-builder.ts`, `opening-fill-builder.ts`, `junction-fill-builder.ts`, `furniture-builder.ts`, `ground-plane.ts`, `floor-subgroups.ts`, or `engine/materials/`.
2. RED: write a failing Node unit test pinning the correct geometry or material parameter. The geometry tests are the deterministic spec; the pixel baselines only absorb driver noise (that is why scene tolerance is loose, 0.35/0.05).
3. GREEN, then BLUE, per vernacular-change-control.
4. If the fix changes intended pixels, refresh BOTH scene baseline families (Lane E table) and review the diffs.

Proof obligation: unit test red-then-green, plus a baseline diff you can explain surface by surface.

## Lane B: dual-path parity (harness right, live pane wrong)

The reconciler (`bridge/react/framed-scene-reconciler.ts`, 444 lines) is a second scene-assembly code path that has diverged from `build-scene.ts` (78 lines) repeatedly. The method is enumeration, not spot-fixing:

1. Read `build-scene.ts` as the specification of correct assembly. List everything it does: iterate ALL `graph.nodes`, per-floor elevation, edge overlay over the whole tree, ground plane at grade.
2. Read `reconcile()` and `frameFloor()` in the reconciler. For each item in the list, record does-it-converge yes/no.
3. Known open divergences, as of 2026-07-05: issue #479 (reconciles `graph.nodes[0]` only, so whole-building scope shows one floor), #437 (near-wall fade targets prepared from the wall sub-group alone, so opening fills and wall-attached furniture never fade), #434 (no `dispose()` when cached sub-groups are discarded). Related gates: #476 (WebGPU hard gate in `scene-pane.tsx` though the engine has a WebGL 2 fallback), #469 (zero live-view pixel coverage).
4. Fix by making the reconciler converge on the enumerated behavior. Do not fork new behavior into the reconciler that `build-scene.ts` lacks; if the shared behavior belongs lower, move it into an `engine/` helper both paths call (the ground-plane fix imports `addGroundPlane` and `isGroundPlane` from `engine/`).
5. Coverage: reconciler unit tests (`bridge/react/framed-scene-reconciler.test.ts`) asserting the assembled root. Until #469 lands, pixel proof for the live pane is a documented manual comparison against the harness render of the same content.
6. If the fix touches a decision an ADR records, note the reconciler as a second seat of that decision in the ADR (precedent: commit cb03e821 for the ground plane).

Worked example with the full red-green-blue commit sequence: the #477 ground-plane fix (merged PR #484), in references/worked-examples.md.

Trap: the single-consumer blind spot. A fix landed only in `build-scene.ts` keeps every committed baseline green while the live view stays broken, because only the harness has pixel coverage. Always ask which path each consumer uses before declaring victory.

## Lane C: coincident-surface depth (the ladder)

Definitions. Coincident by design: two surfaces the spec places on the same plane (the Y = 0 finished-floor datum, a shared wall centerline). Depth-bias ladder: the single ordered sequence of material `polygonOffset` parameters in `engine/materials/role-appearance.ts` that decides which coincident surface wins the depth test.

Current rungs, front (wins) to back, as of 2026-07-05. This table is the one maintained home of the rung list; sibling skills point here instead of carrying copies. Re-verify with `grep -n DEPTH_BIAS engine/materials/role-appearance.ts`:

| Rung | Surface                                                  | Constant                    | factor/units               |
| ---- | -------------------------------------------------------- | --------------------------- | -------------------------- |
| wins | wall base cap, wall-junction fill base, window sash leaf | no bias                     | 0                          |
| 1    | slab top                                                 | `SLAB_TOP_DEPTH_BIAS`       | 1 / 1                      |
| 2    | ground plane                                             | `GROUND_PLANE_DEPTH_BIAS`   | 2 / 2 (slab + 1)           |
| 3    | furniture base                                           | `FURNITURE_BASE_DEPTH_BIAS` | 3 / 3 (ground + 1)         |
| 4    | window reveal                                            | `REVEAL_DEPTH_BIAS`         | 4 / 4 (furniture base + 1) |

The unbiased winners each win a different contest: wall base and junction fill base against the Y = 0 stack, the sash leaf against the reveal on its own plane inside the wall thickness (ADR-0141).

Solution menu, ranked:

1. **Join the ladder.** A new coincident-by-design surface of a DIFFERENT role gets a new rung, derived from its neighbor plus one, never a literal. Deliverables: the derived constant in `role-appearance.ts`, the strictly-increasing-order unit test in `engine/materials/role-appearance.test.ts` extended, and an ADR in the ADR-0102 -> ADR-0133 -> ADR-0141 lineage stating where the rung sits and why. History shows why: the one-sided ADR-0102 bias made the ground plane draw over the floor when ADR-0131 added a third coplanar surface; the ladder is the generalization that ended that whack-a-mole.
2. **Geometric step (ADR-0150 pattern).** When BOTH coincident faces draw the same role, the ladder cannot break the tie (the offset lands on both and cancels). Move one face off the shared plane in geometry, with a derived magnitude: above float32 resolution at the maximum plan extent, below the junction tolerance and any visible threshold (ADR-0150 uses 0.1 mm for slab side skirts). Precedents: ADR-0129 (slab edges stop at the wall centerline), ADR-0134 (corner snapping to a sub-micrometer grid).
3. **Remove the coincidence upstream** if the overlap is not by design (a builder emitting geometry past its boundary). That is Lane A.

Proof obligation: the derivation written into the ADR, the ladder-order unit test green, and a harness pixel baseline exhibiting the contact (the `adjacent-rooms` scene exists for exactly this; add a scene if none shows your contact). Orbit stability is proven by the baseline within existing tolerance, not by watching the screen.

## Lane D: readiness and capture flakes

The harness runs `frameloop="never"` and draws a deterministic frame set: one mount frame, one ready frame. Anything asynchronous (the lazily loaded sky chunk, ambient-occlusion settlement) must surface an explicit signal, or the screenshot captures a half-initialized frame. The wired chain (ADR-0149):

`LightingProvider.whenReady()` promise -> `SceneLighting` `onReady` -> `scene-harness-view.tsx` computes `harnessReady = lightingReady && (AO settled when the AO pass is active)` -> the wrapper publishes `data-harness-ready="true"` -> `scene-solar.spec.ts` awaits `toHaveAttribute('data-harness-ready', 'true')` before `toHaveScreenshot`.

Fix rule: a new asynchronous render resource joins this chain with its own explicit completion signal, gating the ready frame. Never a sleep. Never an in-page pixel poll: `preserveDrawingBuffer` is off, so a canvas 2D readback reads an already-cleared buffer; the compositor screenshot is the only truthful capture.

Proof obligation: the spec awaits the new signal, and the suite is stable under `--repeat-each=5`.

Separate capture trap that mimics readiness: a canvas that never leaves the HTML default 300x150 backing store is a LAYOUT failure, not a render failure. The live-view helpers poll for height above 200 (`SETTLED_CANVAS_MIN_HEIGHT` in `e2e/tests/scene-helpers.ts`); when that poll times out, measure `boundingBox()` before blaming the renderer. That exact misread cost a day on issue #457 (see references/worked-examples.md).

## Lane E: platform and baseline mismatch

Family map, as of 2026-07-05:

| Family               | Rendered where                                | Role                                                                                                             | Refresh                                                                                                                                                  |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scene `-darwin`      | dev Mac, Metal ANGLE (`--use-angle=metal`)    | Authoritative appearance record (ADR-0149)                                                                       | `pnpm exec playwright test --project=scene-webgl --update-snapshots=all` locally                                                                         |
| scene `-linux`       | ubuntu runner, SwiftShader (no flags)         | Gates the CI `scene-visual` job (ADR-0152); job runs only when `*-scene-webgl-linux.png` files exist in the tree | `gh workflow run refresh-scene-baselines.yml` (registers on main only), download the `scene-baselines` artifact, commit the PNGs as a `test(e2e)` commit |
| stories `-linux`     | docker amd64 or `refresh-story-baselines.yml` | Storybook story tier (ADR-0117)                                                                                  | `pnpm stories:update-snapshots` or the workflow                                                                                                          |
| app visual `-darwin` | local Mac                                     | Home-page tier; self-skips off-platform                                                                          | `pnpm e2e --update-snapshots=missing e2e/tests/visual-regression.spec.ts` (all three browser projects commit a baseline)                                 |

Decision rule:

- Intended visual change (fixture, material, lighting edit): regenerate BOTH scene families, review both diffs, land the PNGs with the change.
- One family drifts with NO code change: environment drift (browser, OS, driver). Investigate before refreshing anything; a refresh here destroys the evidence. Cross-check the other family and the harness by eye in `pnpm dev` only to orient, never to conclude.
- Failure only in CI `scene-visual`: reproduce the SwiftShader render via the dispatch workflow's artifact rather than guessing from a Mac.

Trap: the `scene-webgl` project's `testMatch: /scene-.*\.spec\.ts/` is an unanchored regex Playwright matches against the absolute file path. A checkout or worktree whose PATH contains `scene-` routes EVERY spec into the GPU project. Keep workspace directory names free of `scene-`.

## Lane F: shading and lighting

The named environment states pin the sun so lighting is the only variable: canonical site (latitude 40, longitude -75, Eastern time) with fixed observation instants in `app/harness-environment.ts`. The lighting spine, each slice with its ADR: ADR-0142 color-managed renderer, ADR-0143 environment model, ADR-0144 solar provider and sky, ADR-0146 environment panel and session contract, ADR-0147 per-mode tone mapping, ADR-0148 visible sky and SH light probe, ADR-0149 readiness, ADR-0151 ambient-occlusion pipeline.

1. Bisect by state: default lighting vs `equinox-noon` vs `overcast-noon` isolates direct sun vs sky/IBL; `color-check` isolates color management; `ambient-occlusion` isolates the AO pass; `&temp=` isolates color temperature.
2. Unit-test the responsible math in `core/` or `engine/lighting/` first (solar position, irradiance terms are pure functions), then confirm at the pixel gate.
3. Backend caution: every committed baseline exercises WebGL 2 only. The live pane renders WebGPU, and backend splits are a real class (issue #469 records the known pre-r174 MRT-clear divergence, three.js issue 30567; `three` is pinned at 0.184.0). Until #469 lands live pixel coverage, a shading fix needs a documented manual live-pane vs harness comparison of the same content (the technique issue #476 describes).

## Fenced wrong paths

| Wrong path                                                                                               | Why it is fenced                                                                                                          | Do instead                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Invent a new depth epsilon: ad hoc `polygonOffset`, tiny Y nudges, `renderOrder`, `depthTest` off        | Unordered offsets recreate the contest against the next surface; that is the exact failure ADR-0133 generalized away from | Lane C menu: join the ladder with a derivation, or the ADR-0150 geometric step                                          |
| Bump a screenshot tolerance (`SHELL_THRESHOLD`, `maxDiffPixelRatio`, `STORY_DIFF_TOLERANCE`) to go green | The tolerance IS the gate's meaning; raising it silently accepts every future defect of that size                         | Fix the render; if the tolerance itself is wrong, take a measured case through change control                           |
| Refresh a baseline to make red go away                                                                   | Refresh is promotion of an INTENDED change with reviewed diffs, not a mute button; it also destroys drift evidence        | Explain the diff first; refresh only what the decision rule in Lane E allows                                            |
| Declare fixed from one eyeballed frame                                                                   | Readiness and platform classes produce intermittently-correct frames by construction                                      | Measured gate: pixel baseline within existing tolerance, or numeric assertion, plus `--repeat-each=5` for flake classes |
| Add a sleep or timeout for a flaky capture                                                               | Masks the missing signal; waiting is not readiness (ADR-0149 exists because of this)                                      | Explicit completion signal joining the `data-harness-ready` chain                                                       |
| `test.skip` / longer poll to unblock a red spec                                                          | Coverage disappears silently; issue #457 sat exactly in such a blind window                                               | Fix it, or file an issue and surface the skip for sign-off                                                              |
| Fix only `build-scene.ts` or only the reconciler                                                         | Dual-path blind spot; the committed baselines only see the harness path                                                   | Lane B enumeration across both consumers                                                                                |

## Validation and promotion protocol

1. Land through the red-green-blue cycle (vernacular-change-control): failing test first, minimal fix, blue pass or empty marker. Verify `pnpm rgb:audit --range origin/main..HEAD` exits 0.
2. Architectural fixes require an ADR in the same change: any new ladder rung or geometric-step rule, any readiness-contract change, any reconciler-contract change, any backend or baseline-tier policy change. Amend the seated lineage (ladder: ADR-0102/0133/0141/0150; readiness: ADR-0149; baseline lanes: ADR-0117/0149/0152) rather than starting a parallel record.
3. Refresh only the baseline tier and family the decision rule calls for, and review every changed PNG side by side with its predecessor before committing. Scene fixture or appearance changes regenerate both `-darwin` (local) and `-linux` (dispatch workflow) families.
4. Full gate before the PR: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then `pnpm exec playwright test --project=scene-webgl` with every skip accounted for (WebGPU self-skips on non-Mac hardware are expected; anything else is not).
5. Success criterion, stated in the PR: the new test failed before the fix and passes after, and the pixel gates pass within EXISTING tolerances. "Looks right now" is not a closing statement.

## Common mistakes

- Blaming the renderer or the environment before measuring canvas client size. Issue #457: a split-pane flex-basis bug collapsed the live canvas to the 300x150 HTML default and read as environment drift for a full bisect across three known-good SHAs.
- Running `pnpm test -- <path>` and believing it filtered. It does not; use `pnpm exec vitest run --project unit <path>` (omitting `--project unit` also launches the browser-backed storybook project).
- Treating a green harness as certifying the live pane. Different backend (WebGL 2 vs WebGPU), different assembly path (full rebuild vs reconciler), different coverage (pixels vs none).
- Polling canvas pixels in-page for readiness with `preserveDrawingBuffer` off.
- Editing tolerance constants during a debugging session "temporarily". They have a way of landing.

## Worked examples

Four date-stamped campaigns, each mapped to its lane, in [references/worked-examples.md](references/worked-examples.md): the z-fighting ladder saga (Lane C), the issue #457 layout-bug-masquerading-as-renderer-drift postmortem (Lane D trap), the harness readiness fixes (Lane D), and the live-view parity cluster with the executed #477 fix (Lane B).

## Provenance and maintenance

All facts verified against the repo on 2026-07-05. Re-verify before trusting:

| Fact                                        | Re-verification one-liner                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Ladder rungs and values                     | `grep -n "DEPTH_BIAS" engine/materials/role-appearance.ts`                                                          |
| Ladder order pinned by test                 | `grep -n "strictly increasing\|ladder" engine/materials/role-appearance.test.ts`                                    |
| Scene tolerances 0.35 / 0.05                | `grep -n "SHELL_THRESHOLD\|SHELL_MAX_DIFF" e2e/tests/scene-visual-regression.spec.ts e2e/tests/scene-solar.spec.ts` |
| App 0.02 and stories 0.01 tolerances        | `grep -n "DIFF_TOLERANCE" playwright.config.ts playwright.stories.config.ts`                                        |
| Harness scene keys and env states           | `grep -n "HARNESS_GEOMETRY_SCENE_KEYS\|HARNESS_ENVIRONMENT_STATES" app/harness-environment.ts`                      |
| Readiness chain and attribute               | `grep -rn "data-harness-ready" bridge/react/scene-harness-view.tsx e2e/tests/scene-solar.spec.ts`                   |
| Reconciler still keys off `nodes[0]` (#479) | `grep -n "nodes\[0\]" bridge/react/framed-scene-reconciler.ts`                                                      |
| Open parity issues                          | `gh issue view 479 --json state,title` (repeat for 437, 434, 476, 469)                                              |
| Committed baseline families                 | `ls e2e/tests/scene-visual-regression.spec.ts-snapshots/ e2e/tests/scene-solar.spec.ts-snapshots/`                  |
| Scene spec count (12)                       | `ls e2e/tests/scene-*.spec.ts \| wc -l`                                                                             |
| CI scene lane wiring                        | `grep -n "scene-visual\|scene-webgl-linux" .github/workflows/ci.yml`                                                |
| Linux refresh workflow and artifact name    | `grep -n "update-snapshots\|scene-baselines" .github/workflows/refresh-scene-baselines.yml`                         |
| WebGPU gate still hard (#476)               | `grep -n "detectRenderBackend" editor/shell/scene-pane.tsx`                                                         |
