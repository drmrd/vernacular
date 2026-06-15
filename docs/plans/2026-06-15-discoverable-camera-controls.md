# Plan: discoverable three-dimensional camera controls (#125)

Spec: `docs/specs/2026-06-15-discoverable-camera-controls.md`
ADR: `ADR-0084-discoverable-camera-controls`
Branch: `feat/discoverable-camera-controls` (off origin/main f9b82037, worktree `~/workspace/vernacular.wt/discoverable-camera-controls`)

## Design summary

Two additive affordances in the 3D preview pane, no control behavior change:

1. A grab/grabbing cursor on the pane (mirrors the 2D pan affordance).
2. A small per-mode controls hint caption over the canvas, inert to pointer events.

The hint text comes from a pure `cameraControlsHint(mode)` (bridge), rendered by a
small `CameraControlsHint` component. Both live in `bridge/react/camera-controls-hint.tsx`.
The cursor and the hint are wired into `bridge/react/webgpu-scene-view.tsx` (coverage-excluded glue).

### The hint data (orbit: left-drag rotates, right-drag pans, wheel zooms; walk: WASD + drag-to-look, verified in source)

`cameraControlsHint(mode: NavMode): readonly string[]`:

- `'orbit'` -> `['Drag to orbit', 'Right-drag to pan', 'Scroll to zoom']`
- `'walk'` -> `['Drag to look', 'W A S D to move']`

`NavMode` is imported from `./scene-nav-toolbar`.

### The component

`CameraControlsHint({ mode }: { mode: NavMode })` renders the lines as a small caption:
a container with an accessible name (e.g. `aria-label="Camera controls"`, role group or a
`<ul>`/`<li>`) and `className="camera-controls-hint"`. It is inert to pointer events
(inline `pointerEvents: 'none'`) so it never blocks a drag. Keep the function under the
40-line limit.

### The cursor + wiring (webgpu-scene-view.tsx)

- Track a `dragging` boolean in the pane: the relative wrapper `<div>` (the one holding
  `LiveSceneCanvas` + `SceneProxyOverlay`) gets `onPointerDown` -> set true,
  `onPointerUp` + `onPointerLeave` -> set false. Native canvas pointer events bubble to
  this div, so the orbit/look drag flips it. Hold the state in a small `useDragging` hook
  to keep `WebGPUSceneView` within the line limit.
- The wrapper `<div>` style gains `cursor: dragging ? 'grabbing' : 'grab'`.
- Render `<CameraControlsHint mode={mode} />` inside that wrapper, after `SceneProxyOverlay`.

## Cycles (each: test -> feat -> refactor; commit from main thread)

1. **Pure hint data.** RED (test-author, `bridge/react/camera-controls-hint.test.tsx`):
   `cameraControlsHint('orbit')` equals the orbit lines and `cameraControlsHint('walk')`
   equals the walk lines. GREEN (implementer, `bridge/react/camera-controls-hint.tsx`). BLUE.
2. **Hint component.** RED (`bridge/react/camera-controls-hint.test.tsx`, RTL): rendering
   `<CameraControlsHint mode="orbit" />` shows the three orbit lines under an accessible
   "Camera controls" group; `mode="walk"` shows the two walk lines; the caption is present
   in the DOM. GREEN (`camera-controls-hint.tsx`). BLUE.
3. **Wiring + cursor + e2e.** RED (`e2e/tests/scene-camera-controls.spec.ts`, committed
   `test:`, scene-webgl project, WebGPU self-skip): open the 3D view; the controls hint
   shows the active-mode lines (e.g. text "Drag to orbit"); switching to Walk shows
   "W A S D to move"; and the preview pane reports a grab cursor
   (`getComputedStyle(pane).cursor === 'grab'`). GREEN (`webgpu-scene-view.tsx` wiring +
   cursor + `useDragging`; coverage-excluded glue). BLUE marker.

## Gate (run in the worktree)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit --range origin/main..HEAD` clean (each cycle test->feat->refactor; e2e RED as `test:`)
- e2e: chromium project + scene-webgl project, after a fresh `pnpm build` and killing any stale 4173.
- Real commit times. Touches no editor/app/shell -> do NOT refresh the home darwin baseline (pre-existing drift).

## Notes / deferred (in the spec + ADR-0084)

- No on-screen gizmo / view cube; no change to the default orbit drag.
- No dismiss / auto-hide for the hint (would need persisted view state).
- The cursor goes on the whole pane wrapper (over the a11y proxies too); acceptable.

## Subagent file scope (state exactly; STOP rather than edit shared config)

- Cycles 1-2: test in `bridge/react/camera-controls-hint.test.tsx`; impl in `bridge/react/camera-controls-hint.tsx`.
- Cycle 3: e2e in `e2e/tests/scene-camera-controls.spec.ts`; wiring in `bridge/react/webgpu-scene-view.tsx`. No edits to eslint/vite/tsconfig/playwright config.
