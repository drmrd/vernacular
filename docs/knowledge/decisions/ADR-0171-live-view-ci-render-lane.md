---
slug: decisions/ADR-0171-live-view-ci-render-lane
title: 'ADR-0171: Live-view WebGPU visual regression runs on a macOS CI lane'
type: decision
tags: [ci, visual-regression, webgpu, 3d-preview, testing]
related:
  [
    decisions/ADR-0149-scene-baseline-platform-split,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0152-linux-scene-baseline-lane,
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
  ]
sourceFiles:
  [
    .github/workflows/ci.yml,
    e2e/tests/scene-live-view-visual-regression.spec.ts,
    scripts/ci/decide.mjs,
  ]
status: current
updated: 2026-09-06
---

# ADR-0171: Live-view WebGPU visual regression runs on a macOS CI lane

## Status

Current. Rendering-realism lane 3 (issue #469), decided in the gates-first spec of 2026-09-06.

## Context

The live-view visual spec (`e2e/tests/scene-live-view-visual-regression.spec.ts`) pixel-tests
the render path a user actually sees: the editor's live pane through `WebGPUSceneView` on a
real WebGPU adapter. It landed with one darwin baseline and ran only on the development Mac,
because the linux CI runners expose no WebGPU adapter and the spec self-skips there. So no CI
job covered the live render path, which is how the session-state regression fixed by #603
reached main unseen, and ADR-0151 had already recorded the backend-split risk as uncovered.

## Decision

CI runs the live-view spec in a dedicated `live-view-visual` job on the `macos-14` runner,
aggregated by `ci-complete` like every other heavy job.

1. **The runner is `macos-14`.** A probe on the lane branch (run 34067553157) showed its
   chromium exposes a Metal-backed WebGPU adapter: the spec ran there rather than
   self-skipping, and passed in 7 seconds.
2. **One baseline serves the development Mac and the runner.** The probe passed against the
   committed `-darwin` baseline at the standing tolerances (per-pixel 0.35, ratio 0.05), and
   the seeded-defect run reported the same 31579-pixel diff the development Mac measured
   locally, so the two environments render the frame alike. The lane committed no new pixels
   and no new snapshot suffix. If a runner image update ever drifts past the tolerances, the
   job fails with the actual render attached, and the fix is a deliberate baseline refresh,
   the standing scene-tier rule.
3. **The job shares the e2e decide gate** (`decide.outputs.e2e`). The captured frame
   composites editor overlay text over the canvas, so the paths that can move the frame are
   the e2e set (`app/`, `editor/`, `bridge/`, `engine/`, `e2e/`), and the gate brings
   `ci:full`, `ci:skip-heavy`, `run:e2e`, and draft handling with it. `decide.mjs` is
   unchanged.

## Evidence

The red proof (run 34067973637) seeded a live-view-only transform defect, a 0.35 radian yaw
around the live scene contents in `bridge/react/webgpu-scene-view.tsx`. The new job failed at
31579 differing pixels (ratio 0.12) while the harness jobs, the e2e suite, and the scene
visual job all stayed green, and `ci-complete` failed on the aggregate. The defect commit was
dropped before merge. A camera-seed defect was tried first and the spec masked it: the capture
applies the top-down preset after mount, so the initial camera never reaches the frame. Defects
for this gate must move the rendered scene, not the opening vantage.

## Consequences

- A triggered run costs about four macOS-runner minutes (install and build dominate; the spec
  itself takes seconds), and macOS minutes bill at ten times linux minutes. The e2e gate keeps
  the job off docs-only and config-only pull requests; this lane's own first head demonstrated
  the skip.
- The live path now has the same drift discipline as the harness tier: an intentional visual
  change refreshes the baseline deliberately, on the development Mac, in the pull request that
  makes the change.
- The spec still self-skips where no adapter exists, so a future runner-image change that
  removes the adapter would surface as a silent skip, not a failure. The job's `--reporter=list`
  output names the skip when it happens; a skip on a pull request that should exercise the
  live view is a signal to investigate the runner image, and a follow-up gate that fails on
  an unexpected skip is open as a hardening option.

## References

- Issue #469 (the lane), issue #603 (the regression class that motivated it).
- `docs/specs/2026-09-06-rendering-realism-gates-and-slices.md`, lane 3.
- Probe run 34067553157; red-proof run 34067973637.
- ADR-0149 (platform-split baselines), ADR-0152 (the linux scene lane this complements).
