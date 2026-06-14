# Plan: three-dimensional preview camera fit (#123)

Spec: `docs/specs/2026-06-14-three-dimensional-preview-camera-fit.md`
ADR: `ADR-0075-three-dimensional-preview-camera-fit`
Branch: `fix/three-dimensional-preview-camera-fit` (off origin/main, worktree ../vernacular-pan)

## Root cause (confirmed empirically)

`frameSceneCamera(bounds)` puts the camera at `target + (D,D,D)` (distance `D*sqrt(3)`,
`D` = bounds diagonal) with the renderer default 75-degree fov and no aspect input.
The bounding sphere (radius `D/2`) subtends only `asin(0.5/1.732) ~= 16.8deg` of the
37.5-degree vertical half-angle, so the model fills ~45% of the half-frame, centered.
A narrow split pane has a far tighter horizontal half-angle, so the model runs off
the sides. Probe on a 4-wall room: full view model-center span ~0.09 of canvas
height; split pane model X span 0.35..0.95 while Y stays ~0.46..0.57.

## Design

- Pure: extend `frameSceneCamera(bounds, viewport?)`, `viewport = { aspect, fovRadians, margin? }`.
  - target = bounds center (unchanged). direction = normalize(1,1,1) (unchanged).
  - radius = diagonal / 2.
  - halfV = fovRadians / 2; halfH = atan(tan(halfV) \* aspect); half = min(halfV, halfH).
  - distance = radius / sin(half) \* margin (margin default ~1.1).
  - position = target + direction \* distance. near/far stay diagonal-based (unchanged).
  - No viewport arg -> current loose behavior (back-compat; empty/degenerate -> DEFAULT_CAMERA_POSE).
- Glue: a shared in-canvas reframe that reads aspect (from canvas size) + fov (from the
  PerspectiveCamera, deg->rad) and applies `frameSceneCamera(bounds, {aspect, fovRadians})`.
  - Live `FrameCamera`: take `bounds` instead of a pre-baked `pose`; reactive on size; still
    gated on `active` (yields to user control; reset refits).
  - Harness `StaticFrame`: refit from `bounds` + live size before its single render.

## Cycles

### Cycle 1 (core, pure) - aspect/fov-aware fit

- RED (test-author, core/scene/camera-framing.test.ts only): with a viewport,
  (a) the sphere fits both half-angles: `asin(r/d) <= halfV` and `<= halfH`;
  (b) it fills the limiting half-angle: `asin(r/d) >= min(halfV,halfH) * 0.8`;
  (c) narrower aspect -> larger distance (monotonic);
  (d) target still bounds center; existing no-viewport tests stay green.
- GREEN (implementer, core/scene/camera-framing.ts only): viewport branch.
- BLUE: reviewer + refactorer (name FRAME_MARGIN, extract half-angle helper if it reads cleaner).

### Cycle 2 (bridge glue + harness, e2e/visual RED) - reframe on live aspect

- RED (orchestrator, e2e/tests/scene-camera-fit.spec.ts, committed `test:`): in scene-webgl,
  draw a room, 3D view; assert the model's proxy spread fills a healthy fraction of the
  canvas (threshold chosen against a GREEN probe, comfortably above the ~0.18 pre-fix max
  pairwise / canvas-height); and in split the model stays on screen. (Verify exact numbers
  with a throwaway probe during GREEN before pinning the threshold.)
- GREEN (orchestrator glue; coverage-excluded): rewire FrameCamera (bounds + live aspect/fov,
  reactive on size) + harness StaticFrame refit. Refresh the 3 scene-webgl baselines
  (`scene-shell-webgl`, `scene-shell-warm-webgl`, `scene-shell-painted-webgl`) with
  `--update-snapshots=all` in the scene-webgl project.
- BLUE: tidy; empty marker if nothing actionable.

## Gate (in ../vernacular-pan)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit` (origin/main..HEAD clean: each cycle test->feat->refactor; e2e RED as `test:`)
- e2e: chromium project + scene-webgl project (rebuild + kill 4173 first)
- Real commit times. PR -> wait CI -> merge --merge -> re-detach worktree -> roadmap flip PR.

## Notes / deferred

- Toolbar-above-canvas top offset (24px full, ~79px split because the nav toolbar wraps in the
  slim pane) -> separate chrome item, deferred + flagged in PR + autonomous notes.
- 7b wall-paint left/right convention still unconfirmed (leave it).
