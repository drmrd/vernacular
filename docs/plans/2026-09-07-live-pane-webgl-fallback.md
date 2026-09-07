# Live pane WebGL 2 fallback Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Every application change here runs the role-separated red-green-blue cycle: a failing `test:` commit, a minimal `feat:` commit, and a closing `refactor:` commit (empty when the review finds nothing).

**Goal:** Stop telling WebGL 2 browsers that the 3D preview is unavailable. The preview mounts and renders through the renderer's own WebGL 2 fallback, and a dismissible notice near the pane says the preview is running without WebGPU. Issue #476.

**Architecture:** Two gates refuse the live view today. `editor/shell/scene-pane.tsx` shows a design-system `EmptyState` reading "Your browser does not support WebGPU", and `bridge/react/scene-canvas.tsx` shows a bare `role="status"` message reading "This 3D view requires a WebGPU-capable browser". Both ask `detectRenderBackend()`, which returns `'webgpu'` when `navigator.gpu` is present and `'unsupported'` otherwise. Meanwhile `engine/renderer/create-renderer.ts` builds a `WebGPURenderer`, which selects WebGPU when it is there and falls back to its own WebGL 2 backend when it is not; the deterministic harness pins that same WebGL 2 backend with `forceWebGL` for every committed scene baseline. So the render path the gates refuse is the path CI already exercises.

Neither gate can simply be deleted. Removing the bridge gate outright would mount the R3F `<Canvas>` in jsdom, where `react-use-measure` needs a `ResizeObserver` the unit environment does not define, so `editor-shell` and app tests would fail on a rendering environment they never meant to exercise. The gates need a wider question instead of no question: can this runtime render 3D at all. That is WebGPU, or a `webgl2` canvas context, and jsdom has neither.

**Tech Stack:** React 19, `@react-three/fiber`, the existing `editor/design-system` `Banner` and `EmptyState` primitives, vitest with jsdom.

**Spec:** Issue #476. Its precondition, live-view pixel coverage in CI, landed as issue #469 and ADR-0171.

## Global Constraints

- **Allowed files:** `editor/shell/scene-pane.tsx`, `editor/shell/scene-pane.css`, `editor/shell/scene-pane.test.tsx`, `bridge/react/live-preview-backend.ts` and its test, `bridge/react/scene-canvas.tsx` and its test, one export line in `bridge/index.ts`, this plan, and `docs/knowledge/decisions/ADR-0174-live-pane-webgl-fallback.md`. Anything under `engine/`, `core/`, `app/`, `storage/`, `e2e/`, or the build configuration means stop and report.
- **Repo rules:** Conventional Commits; no em-dashes; no trailers; author `Dan Moore <9156191+drmrd@users.noreply.github.com>`; ADR prose passes the humanizer standard.
- **Full check chain before the branch is done:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm rgb:audit`, each exit code read on its own.

## Design decisions carried into this plan

1. **The capability probe lives in `bridge/react/`, not in `engine/`.** Widening `RenderBackend` in `engine/renderer/detect-backend.ts` would be the natural home, and the ADR records that as the follow-up. This branch is fenced out of `engine/`, and the probe needs no Three.js: it asks `navigator.gpu` through the engine's existing `detectRenderBackend()` and then asks a throwaway canvas for a `webgl2` context. Bridge is the layer that decides whether the R3F canvas mounts, and it is the lowest layer both consumers can import from, since `editor/` may import `bridge/` but `bridge/` may not import `editor/`.
2. **`detectLivePreviewBackend()` returns three values, not two.** `'webgpu'`, `'webgl2'`, and `'unsupported'`. The pane needs all three: only `'unsupported'` still earns the empty state, and only `'webgl2'` raises the notice.
3. **The notice is the design system's `Banner`, rendered inline in the pane.** It is the shell's existing notice vocabulary, it already carries a dismiss control and the design-language styling, and rendering it directly rather than through the notification store keeps the message next to the pane it describes instead of in the app frame's banner row. The pane owns the dismissed flag as component state, so the notice appears once per session and stays gone after a dismissal.
4. **The notice overlays the pane rather than taking a layout row.** A layout row would change the pane's height and every measurement built on it. The overlay wrapper is pointer-inert so an orbit drag passes through it, and the banner itself takes pointer events back so the dismiss button works. This mirrors the existing `.scene-pane__overlay` treatment.
5. **No e2e file changes.** The notice and the widened gate only reach a runtime that lacks WebGPU. The `scene-*` specs run in the `scene-webgl` project, where `navigator.gpu` is present on the development Mac and the macOS CI runner, so those runs take the `'webgpu'` branch and render exactly what they render today. The `home.png` baseline is captured on the default view, which has no 3D region at all (`toggle-three-d.spec.ts` asserts the count is zero before the toggle). The chromium, firefox, and webkit projects now mount the live view where they previously showed the fallback text; the one spec that visits the pane there, `three-d-preview-canvas.spec.ts`, measures the region height and says in its own header that it holds either way.

---

### Task 1: The probe

**Files:** `bridge/react/live-preview-backend.ts`, `bridge/react/live-preview-backend.test.ts`.

- [ ] **Step 1 (RED):** A failing test that `detectLivePreviewBackend()` reports `'webgpu'` with `navigator.gpu` present, `'webgl2'` with no `navigator.gpu` but an obtainable `webgl2` canvas context, and `'unsupported'` when neither is there.
- [ ] **Step 2 (GREEN):** The module. It delegates the WebGPU question to the engine's `detectRenderBackend()` and probes a detached canvas for the WebGL 2 context, treating a throw as no support.
- [ ] **Step 3 (BLUE):** Clean-code review and a closing `refactor:` commit.

### Task 2: The bridge gate

**Files:** `bridge/react/scene-canvas.tsx`, `bridge/react/scene-canvas.test.tsx`, `bridge/index.ts`.

- [ ] **Step 1 (RED):** A failing test that `SceneCanvas` mounts the live scene view on a WebGL 2 runtime, alongside the existing test that it keeps the accessible fallback when neither backend exists. The live view is mocked at the module edge so jsdom never mounts an R3F canvas.
- [ ] **Step 2 (GREEN):** The gate asks `detectLivePreviewBackend() === 'unsupported'`. The barrel exports the probe and its type.
- [ ] **Step 3 (BLUE):** Review and a closing `refactor:` commit.

### Task 3: The pane gate

**Files:** `editor/shell/scene-pane.tsx`, `editor/shell/scene-pane.test.tsx`.

- [ ] **Step 1 (RED):** A failing test that `ScenePane` renders the live canvas rather than the unavailable empty state when the runtime falls back to WebGL 2, and keeps the empty state when nothing can render.
- [ ] **Step 2 (GREEN):** The pane asks the probe and gates on `'unsupported'`.
- [ ] **Step 3 (BLUE):** Review and a closing `refactor:` commit.

### Task 4: The notice

**Files:** `editor/shell/scene-pane.tsx`, `editor/shell/scene-pane.css`, `editor/shell/scene-pane.test.tsx`.

- [ ] **Step 1 (RED):** A failing test that the pane shows a notice saying the preview is running without WebGPU on the WebGL 2 branch, and shows no notice on WebGPU.
- [ ] **Step 2 (GREEN):** The inline `Banner` and its overlay rule.
- [ ] **Step 3 (BLUE):** Review and a closing `refactor:` commit.

### Task 5: Dismissal

**Files:** `editor/shell/scene-pane.tsx`, `editor/shell/scene-pane.test.tsx`.

- [ ] **Step 1 (RED):** A failing test that pressing the notice's dismiss control removes it and leaves the live canvas mounted.
- [ ] **Step 2 (GREEN):** The dismissed flag.
- [ ] **Step 3 (BLUE):** Review and a closing `refactor:` commit.

### Task 6: ADR-0174 and the check chain

**Files:** `docs/knowledge/decisions/ADR-0174-live-pane-webgl-fallback.md`.

- [ ] **Step 1:** Write the ADR: the reversal of the gate ADR-0004 deferred and ADR-0019 recorded, what made the reversal safe (ADR-0171's live-view CI lane, and ADR-0151's note that WebGL 2 is the only baselined backend), the three-value probe and why it sits in bridge, the notice, and the follow-ups. `pnpm knowledge:index` must exit 0 and every `related` slug must resolve to a file.
- [ ] **Step 2:** Run the full check chain, each exit code read on its own, and `pnpm rgb:audit` against `origin/main`.
