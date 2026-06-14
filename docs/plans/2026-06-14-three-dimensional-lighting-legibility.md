# Plan: Three-Dimensional Lighting Legibility

Spec: `docs/specs/2026-06-14-three-dimensional-lighting-legibility.md`
ADR: `docs/knowledge/decisions/ADR-0079-three-dimensional-lighting-legibility.md`
Branch: `feat/three-dimensional-lighting-legibility` (off origin/main, worktree `../vernacular-pan`)

## Goal

Rebalance `BasicLightingProvider` so two perpendicular walls separate by value:
asymmetric raised sun azimuth + key-dominant ratio (sun intensity > fill intensity).
Render-only; only `engine/lighting/basic-lighting-provider.ts` constants change.
Refresh the 3 scene-webgl baselines and eyeball.

## Files in scope

- `engine/lighting/basic-lighting-provider.ts` (constants: `SUN_DIRECTION`,
  `SUN_INTENSITY`, `FILL_INTENSITY`).
- `engine/lighting/basic-lighting-provider.test.ts` (RED tests).
- `e2e/tests/scene-visual-regression.spec.ts-snapshots/*.png` (baseline refresh).
- Docs: spec, ADR-0079, this plan.

Do NOT touch: `lighting-rig.ts` (re-normalizes `SUN_DIRECTION`, direction-independent
tests stay green), `scene-lighting.tsx`, `create-renderer.ts` (no tone mapping this
slice), any model/geometry/paint/camera/2D code.

## RGB cycles (main-thread; test-author -> implementer -> clean-code-reviewer + refactorer)

### Cycle 1: key-dominant rig

- RED (`test:`): in `basic-lighting-provider.test.ts`, apply the provider to a scene,
  read the applied `DirectionalLight.intensity` and `HemisphereLight.intensity`, assert
  `sun.intensity > hemisphere.intensity`. Fails now (1 === 1).
- GREEN (`feat:`): drop `FILL_INTENSITY` below `SUN_INTENSITY` (and raise the sun).
- BLUE (`refactor:`): reviewer pass; likely an empty marker (3 constants).

### Cycle 2: perpendicular faces separate

- RED (`test:`): assert the applied sun lights two perpendicular vertical faces
  differently. Use the applied sun direction `dir = sun.position.clone().normalize()`;
  `lambert(n) = max(0, dir.dot(n))`; assert `lambert(+X)` not close to `lambert(+Z)`
  (both unit horizontal normals). Fails now: `(1,2,1)` gives equal X,Z projections.
- GREEN (`feat:`): make `SUN_DIRECTION` asymmetric (e.g. `(1, 2, 0.35)`), vertical
  component largest.
- BLUE (`refactor:`): reviewer pass; empty marker if nothing actionable.

### Visual tier (`test(e2e):`, audit-exempt)

- Pick final aesthetic values (`SUN_DIRECTION`, `SUN_INTENSITY`, `FILL_INTENSITY`) by
  regenerating the 3 scene-webgl baselines and reviewing by eye: the two visible walls
  must read as different values; the painted shell's green/gray/orange must stay clear;
  the warm tint must still read warm; the shell must not be darker overall. Adjust the
  constants (keeping cycle-1 and cycle-2 invariants true) until it reads well, then
  commit the refreshed PNGs.
- Regenerate: `pnpm build` then run the scene-webgl project with `--update-snapshots`
  (per memory `regenerating-the-visual-regression-baseline`, use `--update-snapshots=all`
  to force a pixel-exact refresh since the lighting change exceeds tolerance).

## Gate (before PR)

`pnpm typecheck && lint && format:check && test && integration:audit && build`, then
`pnpm rgb:audit origin/main..HEAD` clean, then full chromium + scene-webgl e2e after a
real `pnpm build` + preview on 4173 (kill stale 4173/5199 first). Iterate RED/GREEN
against `pnpm dev --port 5199` + `E2E_BASE_URL=http://localhost:5199`.

## After merge

Roadmap flip (add the lighting legibility item under the 3D preview polish subsection,
mark merged). Update the autonomous notes + memory. Next free ADR after 0079 = 0080.

## Watch

- Subagents default cwd to the MAIN clone -> drive RGB in `../vernacular-pan` or force
  absolute worktree paths.
- Harness LSP diagnostics index the stale MAIN clone; ignore, trust worktree typecheck.
- Pre-existing: 16 chrome-makeover lint warnings, firefox+webkit darwin home baseline
  drift (#140 token ramp). Not mine; leave them.
