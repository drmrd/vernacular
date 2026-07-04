# Ambient-occlusion pass implementation plan

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author, commits
> `test:`), `/implement` (implementer, commits `feat:`), `/clean-code-review`, `/refactor`
> (commits `refactor:`, possibly an empty marker). Do NOT use the generic subagent-driven harness.
> One behavior equals one full test -> feat -> refactor cycle; close every GREEN with a BLUE
> BEFORE the next `test:` commit, and run `node scripts/rgb-audit/rgb-audit.mjs --range
origin/main..HEAD` before every push. Feat-only commits need an `Infrastructure:` trailer.
> `test(e2e):` scene-tier commits are cycle-exempt. Source current-state facts from MERGED main:
> read `engine/renderer/create-renderer.ts`, `bridge/react/webgpu-scene-view.tsx`,
> `bridge/react/scene-harness-view.tsx`, `bridge/react/scene-lighting.tsx`,
> `app/harness-environment.ts`, `e2e/tests/scene-solar.spec.ts`, issue #442, the slice spec
> `docs/specs/2026-07-04-gtao-ambient-occlusion.md`, and ADR-0142/0147/0148/0149.

**Goal:** Realistic mode renders interiors with contact darkening at wall-floor seams and around
placed furniture, from a screen-space ambient-occlusion pass on the realistic render path.
Schematic mode is untouched. Closes issue #442.

**Architecture:** The occlusion node runs through three's `RenderPipeline`, the WebGPU-native
post-processing entry with an automatic WebGL 2 fallback. The pass is Three.js and lives in a new
`engine/postprocessing/` module: a factory builds the pipeline from a renderer, scene, and camera
and returns render, resize, and dispose handles. A bridge hook owns the React lifecycle and hands
both canvases one render function that draws through the pipeline when AO is active and falls back
to `gl.render(scene, camera)` when it is off. The live view takes over its per-frame draw with a
`useFrame(priority)`; the harness routes its two static-frame draws through the same function.
Gating is a pure engine function keyed on the effective lighting mode, so schematic and a
realistic request without a site location keep today's path exactly.

**Tech stack:** TypeScript, Three.js r184 (`three/addons/tsl/display/GTAONode.js`, `RenderPipeline`
from `three/webgpu`, `pass`/`mrt`/`output` from `three/tsl`), React Three Fiber 9 (`useFrame` render
priority), Vitest, Playwright scene-webgl tier (dev-Mac baselines only, per ADR-0149).

## Global constraints

- core/ imports no React/Three.js; engine/ is the only Three.js importer (addon imports from
  `three/addons/` and `three/tsl` count as Three.js and live in engine only). The bridge hook is
  the only layer that touches both React and the engine.
- The `RenderPipeline` and `GTAONode` imports pull in `three/webgpu`. Load them through a lazy
  dynamic import so the WebGPU build stays out of the entry chunk (ADR-0148 records why); a
  source-reading guard test keeps a static import from returning.
- All model mutations flow through `dispatch(command)`; nothing here touches the model or undo. AO
  is view/render state only.
- ESLint zero-problems gate (warnings count): max-lines-per-function 40, max-lines 300, max-params
  3, complexity 10, no-magic-numbers (name a `const`). Test files relax no-magic-numbers and get
  120-line functions.
- Vitest filter: `pnpm exec vitest run <path>` (never `pnpm test -- <x>`). Full gate:
  `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, checking each
  command's own exit code (no piped tail).
- Conventional Commits; NO Co-Authored-By, NO session trailers, NO em-dash in new text. Author
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`. Window commit dates off employer hours
  before the first push.
- Branch `docs/gtao-ambient-occlusion-spec` carries the spec and this plan; the code lands on a
  `feat/gtao-ambient-occlusion` branch off main.
- This slice adds NO dependencies.
- Scene visual baselines render only on the development Mac's Metal tier (`--project=scene-webgl`);
  never generate them on CI, which does not run the scene tier.

## Locked decisions (pending owner review of the spec)

These are the spec's proposed defaults. If the owner's spec review changes one, update it here
before the cycle it affects, and route any architectural change through ADR-0151, not silent drift.

1. **AO is on by default whenever the effective mode is realistic**, including under the color
   check (it is achromatic, so it does not skew the swatch hue). Schematic is untouched. Open
   question 1 in the spec can flip the color-check case.
2. **The first slice reconstructs normals from depth, with no multiple-render-target output.**
   `GTAONode` reconstructs normals from depth when no normal node is supplied. This keeps the pass
   clear of the multiple-render-target clear divergence that differed between backends before r174
   (three.js issue #30567), which is the top backend-parity risk. Higher-quality normals from a
   dedicated target are a later refinement.
3. **The blend is a whole-frame multiply of the occlusion term**, matching the addon's own example.
   The physically cleaner indirect-only split (occlusion applied only to the light probe's
   contribution) needs a second render-target channel and is deferred.
4. **AO has no user-facing control**; it is an internal always-on constant within realistic mode,
   so nothing here touches the Environment panel or the `EnvironmentState` contract.
5. **WebGL 2 is the only baselined backend.** The WebGPU path gets a manual spot check on the dev
   Mac before shipping; a first live-view visual-regression spec is filed as a separate issue.
6. **Tuning is r184-only.** The `GTAONode` tuning surface is superseded in r185 and r186; the next
   three.js bump forces a re-tune and a re-baseline. That migration is out of scope here.

## File structure

Created (engine, pure/unit-testable without a GPU):

- `engine/postprocessing/ambient-occlusion-params.ts` : `AmbientOcclusionParams`,
  `AO_DEFAULT_PARAMS`, `ambientOcclusionParamsFor(mode)`.
- `engine/postprocessing/ambient-occlusion-params.test.ts`
- `engine/postprocessing/render-scene-frame.ts` : `renderSceneFrame`.
- `engine/postprocessing/render-scene-frame.test.ts`

Created (engine, GPU-path, proven on the scene tier; unit test is the static-import guard):

- `engine/postprocessing/ambient-occlusion.ts` : `AmbientOcclusionPipeline`,
  `buildAmbientOcclusionPipeline`.
- `engine/postprocessing/ambient-occlusion.test.ts` (guard test only).

Created (bridge):

- `bridge/react/use-ambient-occlusion.ts` : `useAmbientOcclusion(active)` returning a `renderFrame`.

Modified:

- `engine/index.ts` : export the params, the dispatcher, and the pipeline factory that consumers
  outside engine use (the bridge hook needs the factory and the dispatcher; export only those).
- `bridge/react/webgpu-scene-view.tsx` : `LiveSceneCanvas` gains a `useFrame(priority)` render
  takeover through `renderFrame`, gated on the effective realistic mode.
- `bridge/react/scene-harness-view.tsx` : `StaticFrame`'s two `gl.render(scene, camera)` calls route
  through `renderFrame`.
- `app/harness-environment.ts` : add the `ambient-occlusion` named state and an optional fixture
  selector on `HarnessEnvironmentState`.
- `app/app.tsx` (or wherever the `?scene=` query resolves) : forward a named state's fixture
  selection to `SceneHarnessView`'s `scene` prop.
- `e2e/tests/scene-solar.spec.ts` : add the `ambient-occlusion` capture case.
- `docs/knowledge/decisions/ADR-0151-ambient-occlusion-render-pipeline.md` (new; 0150 is the highest
  on main at the time of writing, re-verify before landing).

---

## Task 1: AO tuning parameters and mode gating (engine, pure)

**Files:** Create `engine/postprocessing/ambient-occlusion-params.ts` + test. Modify
`engine/index.ts`.

**Interfaces:**

- Consumes: `LightingMode` from core (`'realistic' | 'schematic'`).
- Produces:

```ts
export interface AmbientOcclusionParams {
  radius: number
  scale: number
  thickness: number
  distanceExponent: number
  distanceFallOff: number
  sampleCount: number
}
/** r184 GTAONode tuning; superseded in r185/r186 (see the slice spec's tuning caveat). */
export const AO_DEFAULT_PARAMS: AmbientOcclusionParams
/** The AO tuning for a mode, or null when AO does not run (schematic). */
export function ambientOcclusionParamsFor(mode: LightingMode): AmbientOcclusionParams | null
```

**Steps:**

- [ ] **Step 1: RED.** `ambient-occlusion-params.test.ts`: `ambientOcclusionParamsFor('realistic')`
      returns `AO_DEFAULT_PARAMS`; `ambientOcclusionParamsFor('schematic')` returns `null`;
      `AO_DEFAULT_PARAMS` fields are the named r184 constants (assert each against its constant, not
      a magic number). Commit `test: gate ambient-occlusion tuning on the lighting mode`.
- [ ] **Step 2: GREEN.** Implement with every field as a named `const`. Full gate. Commit
      `feat: add ambient-occlusion tuning parameters gated by mode`.
- [ ] **Step 3: BLUE.** `/clean-code-review` then `/refactor` (or empty marker).

---

## Task 2: The render dispatcher (engine, pure)

**Files:** Create `engine/postprocessing/render-scene-frame.ts` + test. Modify `engine/index.ts`.

**Interfaces:**

- Produces:

```ts
/** Minimal shapes so the dispatcher unit-tests without a real renderer or pipeline. */
export interface FrameRenderer {
  render(scene: object, camera: object): void
}
export interface AmbientOcclusionPipeline {
  render(): void
  setSize(width: number, height: number): void
  dispose(): void
}
/**
 * Draws one frame: through the AO pipeline when one is supplied, otherwise straight
 * through the renderer. The one seam both canvases call so the takeover has a single owner.
 */
export function renderSceneFrame(
  renderer: FrameRenderer,
  scene: object,
  camera: object,
  pipeline: AmbientOcclusionPipeline | null,
): void
```

**Steps:**

- [ ] **Step 1: RED.** `render-scene-frame.test.ts` with spy fakes: given a pipeline, it calls
      `pipeline.render()` once and never `renderer.render`; given `null`, it calls
      `renderer.render(scene, camera)` once and never a pipeline. Commit
      `test: route a scene frame through the ambient-occlusion pipeline when present`.
- [ ] **Step 2: GREEN.** Implement the branch. Full gate. Commit
      `feat: render a scene frame through the ambient-occlusion pipeline when present`.
- [ ] **Step 3: BLUE.**

---

## Task 3: The lazy pipeline factory and static-import guard (engine, GPU-path)

**Files:** Create `engine/postprocessing/ambient-occlusion.ts` + test. Modify `engine/index.ts`.

**Interfaces:**

- Consumes: a `WebGPURenderer`, a `THREE.Scene`, a `THREE.Camera`, `AmbientOcclusionParams`.
- Produces:

```ts
/**
 * Builds a RenderPipeline that renders the scene and multiplies in the GTAONode
 * occlusion term. Normals are reconstructed from depth (no MRT output; see the slice
 * spec's backend-parity posture). The pipeline's output node carries the renderer's
 * active tone-mapping operator so realistic AgX (ADR-0147) still applies after takeover.
 * three/webgpu, three/tsl, and the GTAONode addon load through a lazy import.
 */
export function buildAmbientOcclusionPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  params: AmbientOcclusionParams,
): Promise<AmbientOcclusionPipeline>
```

**Steps:**

- [ ] **Step 1: RED.** `ambient-occlusion.test.ts` is a source-reading guard, mirroring the sky
      slice's static-import guard: read the module source and assert it contains no static
      `from 'three/webgpu'` and no static `from 'three/tsl'` import, so the WebGPU build stays out
      of the entry graph. (Pipeline behavior needs a GPU and is proven on the scene tier, not here.)
      Commit `test: keep the WebGPU build out of the ambient-occlusion entry graph`.
- [ ] **Step 2: GREEN.** Implement: lazy-import `RenderPipeline` from `three/webgpu`, `pass`,
      `output`, `vec3`, `vec4` from `three/tsl`, and `ao` from
      `three/addons/tsl/display/GTAONode.js`. Build `pass(scene, camera)`, read its color and depth
      texture nodes, call `ao(depth, null, camera)` (null normal node forces depth reconstruction),
      apply the `params` fields to the ao node's uniforms, compose
      `outputNode = color.mul(vec4(vec3(aoTerm.r), 1))` routed through the pipeline output so tone
      mapping applies, and return `{ render, setSize, dispose }`. Full gate. Commit
      `feat: build the ambient-occlusion render pipeline from GTAONode`.
- [ ] **Step 3: BLUE.**

---

## Task 4: The bridge hook drives both canvases through the pass (bridge, scene-tier proof)

**Files:** Create `bridge/react/use-ambient-occlusion.ts`. Modify
`bridge/react/webgpu-scene-view.tsx` and `bridge/react/scene-harness-view.tsx`.

**Design:**

- `useAmbientOcclusion(active: boolean)` reads `scene`/`camera`/`gl` from `useThree`, builds the
  pipeline through `buildAmbientOcclusionPipeline` when `active` flips true (guarding the async
  build against unmount and against a stale build after a fast toggle), calls `setSize` on canvas
  resize, disposes on deactivate and on unmount, and returns a stable
  `renderFrame(gl, scene, camera)` that calls `renderSceneFrame` with the current pipeline or
  `null`.
- `active` is computed by the caller as `ambientOcclusionParamsFor(effectiveMode) !== null`, where
  `effectiveMode = (realistic && site?.latLong !== undefined) ? 'realistic' : 'schematic'`. This is
  the same effective-mode predicate `scene-lighting.tsx` uses for `solar` and the tone-mapping
  operator, so AO, the solar provider, and AgX turn on together.
- Live view: a small component inside `LiveSceneCanvas` calls `useFrame(() => renderFrame(gl, scene,
camera), AO_RENDER_PRIORITY)` with a nonzero priority constant, which disables React Three Fiber's
  automatic render for that canvas. When `active` is false the pipeline is null and `renderFrame`
  falls back to `gl.render`, so schematic is byte-identical to today.
- Harness: `StaticFrame` takes `renderFrame` and calls it in place of both `gl.render(scene, camera)`
  calls (mount and ready). When AO is off the fallback keeps the schematic and existing solar frames
  unchanged apart from the AO term the active states add.

**Steps:**

- [ ] **Step 1.** Because both canvases mount only under a real renderer (the live view never runs
      under jsdom; the harness runs on the scene tier), this task has no new jsdom unit test. Wire
      the hook and the two canvases. Keep the effective-mode predicate identical to
      `scene-lighting.tsx`. Verify the DOM journey stays green:
      `pnpm exec playwright test e2e/tests/environment-panel.spec.ts` (it never reads pixels).
      Commit `feat: render realistic scenes through the ambient-occlusion pass` with an
      `Infrastructure:` trailer (feat-only, no unit test; the scene baselines in Task 6 are the
      proof).
- [ ] **Step 2: BLUE.** `/clean-code-review` then `/refactor`. Confirm by reading that schematic
      and the no-location fallback still take the `gl.render` branch.

---

## Task 5: The canonical AO harness state (app, unit-testable)

**Files:** Modify `app/harness-environment.ts` and its test; modify the `?scene=` resolution in
`app/app.tsx` (read the current wiring first).

**Design:**

- Extend `HarnessEnvironmentState` with an optional `scene?: HarnessScene` fixture selector.
- Add the `ambient-occlusion` state: the canonical site (40 N, 75 W, Eastern), the equinox civil
  noon instant already shared by `equinox-noon`, `realistic: true`, and `scene: 'furniture'`, so the
  baseline shows contact darkening at the wall-floor seams and around the furniture base under a
  fixed sun.
- In the App, when a named environment state resolves, forward its optional fixture to
  `SceneHarnessView`'s `scene` prop (the component already accepts geometry and environment as
  independent props). Keep the `scene` query-param keyspace disjoint: `ambient-occlusion` must not
  collide with the geometry fixture keys (`shell`, `junctions`, `furniture`) or the other env keys.

**Steps:**

- [ ] **Step 1: RED.** `app/harness-environment.test.ts`: the `ambient-occlusion` state resolves to
      the canonical site, the equinox-noon instant, `realistic: true`, and the `furniture` fixture.
      Commit `test: resolve the canonical ambient-occlusion harness state`.
- [ ] **Step 2: GREEN.** Add the state and the fixture forwarding. Full gate. Commit
      `feat: add the canonical ambient-occlusion harness state`.
- [ ] **Step 3: BLUE.**

---

## Task 6: Acceptance and baselines (`test(e2e):`, cycle-exempt; dev Mac only)

**Files:** Modify `e2e/tests/scene-solar.spec.ts`.

**Steps:**

- [ ] Add one `captureShell` case for `&scene=ambient-occlusion` writing
      `scene-ambient-occlusion-webgl.png`, reusing the existing `SHELL_THRESHOLD` and
      `SHELL_MAX_DIFF_PIXEL_RATIO`. Commit `test(e2e): pin the ambient-occlusion interior baseline`.
- [ ] Before touching any baseline, run the schematic tier without an update and confirm it does not
      move: `pnpm exec playwright test e2e/tests/scene-visual-regression.spec.ts --project=scene-webgl`.
      AO is gated to realistic, so the five schematic baselines must stay green untouched. If any
      moves, stop: the render takeover leaked into the schematic path.
- [ ] Regenerate the AO and solar baselines on the dev Mac (the four solar states now carry the AO
      term):

      ```
      pnpm exec playwright test e2e/tests/scene-solar.spec.ts --project=scene-webgl --update-snapshots=all
      ```

      Review each regenerated PNG by eye: contact darkening at the seams, no haloing on open wall,
      the color-check swatch still reads its reference hue.

- [ ] Frame-time check on the dev Mac live view at the canonical interior, AO off versus on. If the
      full-resolution 16-sample default misses the design-spec 6.10 budget (sixty fps on integrated
      graphics), step down in order: lower `sampleCount`, then a half-resolution AO buffer with an
      upsample, then a tighter `radius`. Record the chosen settings in `AO_DEFAULT_PARAMS` and in the
      ADR.
- [ ] Manual WebGPU spot check: load the live view on a WebGPU-capable browser and confirm the AO
      term reads the same as the WebGL 2 baseline (the parity check CI cannot run).

---

## Task 7: Knowledge, ADR-0151

- [ ] **Step 1:** Re-verify 0151 is the next free number across origin/main and open branches (0150
      is the highest on main at the time of writing).
- [ ] **Step 2:** Write `ADR-0151-ambient-occlusion-render-pipeline.md`: the GTAONode-through-
      RenderPipeline path and why the legacy EffectComposer/GTAOPass is unusable with a
      WebGPURenderer; the live-view `useFrame(priority)` takeover and the harness `StaticFrame` swap
      through one shared render function; depth-reconstructed normals to stay clear of the r174
      multiple-render-target divergence category (three.js issue #30567); the whole-frame multiply
      blend and the deferred indirect-only split; WebGL 2 as the only baselined backend with a manual
      WebGPU spot check and a filed follow-up for a live-view visual-regression spec; the r184 tuning
      caveat and the deferred r185/r186 migration. Note it advances the indirect-light step ADR-0148
      named next. Humanizer pass (ADRs are human-read); no em-dashes. Commit
      `docs: record ADR-0151 for the ambient-occlusion render pipeline`.
- [ ] **Step 3:** Update the epic checklist and close #442 via the PR (`Closes #442`). File the
      deferred-work issues (live-view visual-regression spec; indirect-only AO blend; normals from a
      dedicated target) and hand the `gh` commands to the owner, since this session does not write to
      GitHub.

---

## Baseline-refresh reference

- Scene baselines render only on the development Mac's Metal tier; CI neither renders nor checks
  them (ADR-0149). Never generate them elsewhere.
- Regenerate: `pnpm exec playwright test e2e/tests/<spec> --project=scene-webgl
--update-snapshots=all`. New baselines land as `-darwin.png`.
- A worktree or checkout whose directory name contains `scene-` routes every spec into the
  `scene-webgl` project (the playwright selector matches unanchored against the absolute path). Name
  the code worktree without `scene-` in it (ADR-0149's trap).
- The regenerated baselines are the owner's visual acceptance; there is no automated scene-tier gate.

## Out of scope

- No schematic-mode AO. Schematic keeps its exact render path; the render takeover falls back to
  `gl.render` there.
- No r185 or r186 GTAONode parameter migration. Tuning is r184-only; the next three.js bump re-tunes.
- No screen-space global illumination (`SSGINode`); reserved for a separate high-quality toggle.
- No indirect-only (light-probe-only) AO blend; the first slice multiplies the whole frame.
- No user-facing AO toggle or intensity control; AO is internal and always on in realistic mode.
- No live-view visual-regression spec in this slice; filed as a follow-up issue.

## Self-review

- Issue #442 scope bullets: the AO pass on the realistic path only, schematic untouched (Tasks 1-4,
  locked decision 1); performance budget confirmed with resolution and sample settings chosen on the
  dev Mac (Task 6); an interior canonical state pinned in the visual baseline (Tasks 5-6). SSGI
  explicitly deferred (out of scope), matching the issue's own note.
- Type flow: `AmbientOcclusionParams` is produced in Task 1, consumed by the factory in Task 3, and
  its non-null result is the `active` gate in Task 4. `AmbientOcclusionPipeline` is defined in Task 2,
  produced in Task 3, and consumed by the hook and both canvases in Task 4. `renderSceneFrame` is the
  one render seam both canvases call.
- Layering: engine holds every Three.js import (params, dispatcher, factory); the bridge hook is the
  only cross-layer glue; the app wires the harness state. core is untouched. The `EnvironmentState`
  contract and the model are untouched, so no schema bump and no migration.
- Backend parity is handled by construction: depth-reconstructed normals avoid the multiple-render-
  target category three fixed at r174, and the WebGL-2-only baseline limitation is stated and
  accepted with a manual WebGPU spot check plus a filed follow-up, not left implicit.
