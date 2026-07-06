# Worked examples, date-stamped 2026-07-05

Four campaigns from this repo, each mapped to a lane in SKILL.md. Cite these as precedent when arguing a fix shape; re-verify issue states before relying on anything marked open.

## 1. The z-fighting ladder saga (Lane C)

The longest-running rendering campaign in the repo. Read it as one arc: every partial fix created the next contest until the ordered ladder generalized the rule, and the final chapter shows where the ladder itself ends.

| Step                  | Record                              | What happened                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First contest         | ADR-0102 (issue #224)               | Slab top cap and wall base cap are both on the Y = 0 finished-floor datum by spec (`core/scene/vertical-datum.ts`); after ADR-0076 grew the slab to the wall outer faces they overlapped in plan and z-fought. Fix: bias the slab top back with material `polygonOffset` (`SLAB_TOP_DEPTH_BIAS`), keyed on the `top` surface role. Geometry stays on the datum.                                                                                                               |
| Geometric sibling     | ADR-0129                            | Shared interior slab edges stop at the wall centerline, a geometry decision, not a bias.                                                                                                                                                                                                                                                                                                                                                                                      |
| The bias backfires    | ADR-0131 then ADR-0133 (issue #391) | ADR-0131 seated the building on a ground plane at grade, coplanar with the slab top at elevation zero. The slab was already pushed back, the lawn carried no bias, so grass drew over every ground-floor room. A one-sided rule orders two surfaces and says nothing about a third. ADR-0133 generalized to the ordered ladder: each coplanar-by-design role gets a rung derived from its neighbor plus one, one strictly increasing sequence.                                |
| Numeric hygiene       | ADR-0134                            | Polygon-offset corner positions snapped to a sub-micrometer grid so derived geometry does not defeat the ladder with float noise.                                                                                                                                                                                                                                                                                                                                             |
| Ladder grows          | ADR-0141                            | Furniture base and window reveal join as rungs 3 and 4, each derived from the previous rung plus one. The order is pinned by a unit test in `engine/materials/role-appearance.test.ts`.                                                                                                                                                                                                                                                                                       |
| Where the ladder ends | ADR-0150                            | Two adjacent rooms' slab side skirts share the wall centerline plane and BOTH draw the same role, so any role-keyed offset lands on both and cancels: the tie is unbreakable by bias. Fix: a geometric step, each skirt inset 0.1 mm toward its own interior, magnitude derived (above float32 resolution at the maximum plan extent, below the junction tolerance and any visible threshold). The `adjacent-rooms` harness scene and its committed baselines pin the result. |

Distilled rule: a coincident-surface fix is either a derived rung on the one ladder (different roles) or a derived geometric step (same role). It is never a free-standing epsilon, and it always ships with the derivation in an ADR and a pixel baseline showing the contact. Issue #391 is CLOSED; the ladder constants live in `engine/materials/role-appearance.ts`.

## 2. Issue #457: a layout bug masquerading as renderer drift (Lane D trap)

Filed 2026-07-04. The scene-webgl spec `scene-live-view.spec.ts` ("reflects a drawn wall in the split-view 3D pane") failed on the development Mac: the live canvas mounted but never resized past the 300x150 HTML default, so the settle poll timed out.

What made the misdiagnosis convincing: the failure reproduced identically at the then-current main, at the pre-merge main, and at v0.3.0 from before the lighting epic, each freshly built in a clean worktree, while the other scene-webgl specs passed in the same runs. Three known-good SHAs failing pointed everyone at environment drift (a Chrome for Testing or macOS update), and the issue was filed as such.

The real cause was a product bug in the split view: the layout gave one pane a flex-basis and left the preview pane without the complementary one, collapsing the live canvas. Fixed the same day by PR #459 ("fix: give the split-view preview pane the complementary flex-basis") in `editor/viewport/view-mode-viewport.tsx`, with a regression test.

Lessons, in triage order:

1. Measure canvas client size (`boundingBox()`) BEFORE blaming the renderer or the environment. A canvas stuck at the HTML default is a layout failure by definition.
2. A bisect that fails at every known-good commit does not prove environment drift; it proves the reproduction is measuring something the bisect axis does not vary. Here the spec was measuring layout, and the layout bug predated all three SHAs.
3. This lived in a coverage blind window: the CI e2e job runs `--project=chromium`, which ignores `scene-*.spec.ts`, so nothing external gated it. Blind windows are where flakes ferment; see issue #469 for the standing gap.

## 3. Harness readiness fixes (Lane D)

Two rounds, one pattern: gate the captured frame on an explicit completion signal.

Round one (ADR-0149): ADR-0148 moved the visible sky behind a lazily imported chunk. The live views pick the sky up on a later frame, but the harness runs `frameloop="never"` and drew its single mount frame before the chunk resolved, so every solar baseline captured a correctly lit shell in front of the placeholder clear color. Fix: `LightingProvider` gained an optional `whenReady(): Promise<void>` (the solar provider hands out the promise its sky attach already produced), `SceneLighting` reports it through an `onReady` callback with unmount cancellation, and the harness draws a second, ready frame and publishes `data-harness-ready="true"` on the wrapper. `e2e/tests/scene-solar.spec.ts` awaits that attribute before `toHaveScreenshot`, so the capture provably contains the sky-lit frame.

Round two (ambient occlusion, ADR-0151 era): the AO pass settles asynchronously too, so `scene-harness-view.tsx` extends the gate to `harnessReady = lightingReady && (AO settled when the AO pass is active)`. One attribute, every async term joins it.

Also corrected in ADR-0149: the plans had claimed scene baselines "render on the CI runner" under the `run:visual` label. False at the time; that label forces the Storybook story tier (ADR-0117). The scene tier rendered only on the development Mac. Since then ADR-0152 added the runner-rendered `-linux` family and the CI `scene-visual` job, so the current map is: `-darwin` authoritative dev-Mac Metal render, `-linux` SwiftShader render that gates CI.

## 4. The live-view parity cluster (Lane B), one executed example plus the open set

The reconciler (`bridge/react/framed-scene-reconciler.ts`) is the live pane's incremental second path around `engine/scene/build-scene.ts`, and it repeatedly lacks behaviors the engine path has. The pattern is the single-consumer blind spot: only the harness path has pixel coverage, so a reconciler gap stays green everywhere until a user looks.

This section is the one maintained home of the cluster's current status and fix sketches; the architecture-contract, debugging-playbook, and proof-and-analysis-toolkit skills point here instead of carrying their own status copies. Update this section when a member issue opens or closes.

Executed example, issue #477 (ground plane never rendered in the live view), merged as PR #484 on 2026-07-05. The full red-green-blue sequence, useful as a template for the remaining cluster:

| Commit   | Role                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| c89516c0 | test: assert the live reconciler seats the scene on a ground plane at grade                                                                                                          |
| 27e1357c | fix: seat the live reconciler scene on the ground plane at grade (imports `addGroundPlane` / `isGroundPlane` from `engine/`, converging on the shared helper instead of forking one) |
| 0771d53a | refactor: extract the reconciler cache key and sub-group collectors                                                                                                                  |
| 9b6d3960 | test: assert a grade-only edit reuses the floor sub-groups while refreshing the ground                                                                                               |
| ef4d6502 | fix: refresh the ground plane per-scene so a grade edit keeps the floor cache                                                                                                        |
| 2909c68e | refactor: restore the reconciler doc adjacency                                                                                                                                       |
| cb03e821 | docs: note the reconciler as a second seat of the ground-plane decision (the ADR now names both consumers)                                                                           |

Open members of the cluster, as of 2026-07-05 (re-verify with `gh issue view <n> --json state`):

- **#479**: `reconcile()` keys off `graph.nodes[0]` and narrows entities to that floor, so whole-building scope renders one floor. A two-floor probe during the #477 pre-merge audit produced a root whose only child was the ground floor's group. Fix sketch from the issue: iterate graph floors, keep the per-floor cache entries, assemble the stacked root at per-floor elevations the way `buildScene` does, size the shared ground plane from the whole-building footprint.
- **#437**: near-wall fade targets are prepared from the wall sub-group alone, so reconciler-built opening fills and wall-attached furniture never fade with their host wall. Fix shape from ADR-0145's consequences: enroll over the assembled floor root, with privatization that survives sub-group reuse without capturing a faded state as the baseline material.
- **#434**: no `dispose()` of geometries and materials when cached sub-group trees are discarded (both discard sites: cache eviction and full rebuilds). The edge-overlay toggle discards every floor's cache in one click. Wants a leak-oriented test counting `renderer.info` resources across repeated toggles.
- **#476**: the live pane hard-gates on WebGPU in `editor/shell/scene-pane.tsx` although `createSceneRenderer` auto-falls back to WebGL 2. Held deliberately until live pixel coverage exists.
- **#469**: zero pixel coverage of the live WebGPU path; the known backend-divergence class (pre-r174 MRT clears, three.js issue 30567) is avoided by construction today, but nothing would catch the next split. This is the gate blocking #476.

Campaign guidance: work #479-style structural gaps by first writing the enumeration (what `build-scene.ts` does that `reconcile()` does not), then converge one behavior per red-green-blue cycle, seating any touched ADR in both paths as cb03e821 did.
