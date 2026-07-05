---
slug: decisions/ADR-0152-linux-scene-baseline-lane
title: 'ADR-0152: A linux scene-baseline lane that gates the harness on CI'
type: decision
tags: [architecture, testing, visual-regression, playwright, ci, 3d-preview, webgl]
related:
  [
    decisions/ADR-0149-harness-lighting-readiness,
    decisions/ADR-0117-storybook-story-visual-regression,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
  ]
sourceFiles:
  [
    .github/workflows/refresh-scene-baselines.yml,
    .github/workflows/ci.yml,
    playwright.config.ts,
    e2e/tests/scene-visual-regression.spec.ts,
    e2e/tests/scene-solar.spec.ts,
  ]
status: current
updated: 2026-07-05
---

# ADR-0152: A linux scene-baseline lane that gates the harness on CI

## Status

Accepted, lands with issue #401. [[ADR-0149-harness-lighting-readiness]] recorded that no
GPU-capable CI path existed for the scene tier and that every committed scene baseline was a
development-Mac Metal render. This adds a second baseline family rendered on the ubuntu runner and
a CI job that checks it, so a harness regression fails a pull request instead of waiting for a
manual local render.

## Context

The scene visual-regression specs, `scene-visual-regression.spec.ts` and `scene-solar.spec.ts`,
drive the render harness under `frameloop="never"` and screenshot one deterministic frame
(ADR-0149). Their baselines are `-darwin.png` files rendered on the development Mac's Metal ANGLE
backend, and CI never ran them: the end-to-end job uses `--project=chromium`, which ignores the
`scene-*.spec.ts` pattern, and no workflow ran the `scene-webgl` project. A harness regression
surfaced only when the owner regenerated baselines by hand.

Two runner experiments on issue #401 removed the blocker. A dispatch-only probe on ubuntu-latest
showed that headless chromium creates a usable WebGL 2 context under default flags, with no
software-GL switches: its built-in SwiftShader rasterizer engages on the GPU-less runner and
reports WebGL 2.0 for every configuration tested. A second probe built the app, loaded the real
scene-harness fixture, screenshotted the canvas, closed the browser, and rendered again from a
fresh launch. Both the default shell and the sky-lit equinox-noon state came back byte-identical
across the two launches. SwiftShader is pure CPU, so it renders the harness deterministically run
to run. That is the whole requirement for a committed baseline family: a context the runner can
make, and a render it repeats exactly.

The SwiftShader render does not match the Metal render pixel for pixel, so a `-linux` family cannot
reuse the `-darwin` baselines. It has to be its own set, rendered on the same runner that later
checks it, the way the story suite renders its baselines on the runner that gates them (ADR-0117).

## Decision

### The scene-webgl project keys its launch flags on the host platform

`playwright.config.ts` splits the `scene-webgl` project's browser flags by `process.platform`. On
darwin it keeps the existing Metal set, `--use-angle=metal` with the WebGPU and GPU-forcing
switches, so the render, and therefore every `-darwin` baseline, stays byte-for-byte what it was.
On any other platform it passes no flags, which lets the ubuntu runner fall back to SwiftShader.
The two platform families coexist through Playwright's per-platform snapshot suffix, a
`-scene-webgl-darwin.png` file next to its `-scene-webgl-linux.png` sibling.

### Two skip layers guard two different things

A harness spec self-skips only when the page cannot create a WebGL 2 context at all. It probes
`canvas.getContext('webgl2')` and skips on null, so it runs on the Metal Mac and on the SwiftShader
runner and steps aside only on a machine with no usable GL stack. This guard is deliberately
narrower than the one on the live-view scene specs, which skip whenever `navigator.gpu` is absent:
those exercise the WebGPU live pane, which SwiftShader does not provide, so they stay skipped on the
runner while the harness specs run.

The CI job carries the second layer. The decide job scans the tree for any `*-scene-webgl-linux.png`
file and sets an output; the `scene-visual` job runs only when that output is true. Both layers are
needed because they answer different questions. The spec guard asks whether this environment can
render the harness, which keeps the spec from failing on a context-less box and from vacuously
skipping everywhere. The job gate asks whether committed `-linux` baselines exist to compare
against, which keeps the lane dormant on any tree that has not been seeded rather than running the
specs against missing snapshots.

### The lane seeds after it merges, by dispatch

`refresh-scene-baselines.yml` is a manually dispatched workflow that builds the app on
ubuntu-latest, runs `playwright test --project=scene-webgl --update-snapshots=all`, and uploads the
`-linux` PNGs as an artifact to download and commit. `workflow_dispatch` registers only on the
default branch, so the workflow cannot run until it merges. That staging is on purpose: this pull
request commits no baselines and the `scene-visual` job stays skipped, because the detection step
finds none in the tree. Once the branch is on main, one dispatch renders the family and a
`test(e2e)` commit lands the PNGs, which flips the detection and turns the gate on. This mirrors the
story suite's seeding step for step (ADR-0117): render on the runner that gates, upload an artifact,
commit the result.

## Consequences

- A harness regression on the checked states fails CI on the runner instead of waiting for a manual
  local render. On a drift the `scene-visual` job reports and uploads the Playwright diff report.
- Two baseline families now exist for the harness specs. `-darwin` stays the authoritative
  development-Mac render (ADR-0149) and is unchanged by this work; `-linux` is the runner-rendered
  SwiftShader family that CI checks. A change to a harness fixture regenerates both, the darwin
  family locally and the linux family through the dispatch workflow.
- The lane covers only the WebGL 2 harness path. The live WebGPU render a user's browser may select
  still has no pixel coverage, tracked in issue #469, because SwiftShader gives the runner WebGL 2
  and not WebGPU.
- Until the post-merge dispatch seeds the `-linux` baselines, nothing changes for a contributor: the
  `scene-visual` job skips and the darwin render stays the only committed family.

## References

- [[ADR-0149-harness-lighting-readiness]]: recorded that scene baselines are darwin renders and that
  no CI path gated them, the gap this closes.
- [[ADR-0117-storybook-story-visual-regression]]: the story suite's render-on-the-runner-that-gates
  pattern this lane mirrors, including the dispatch-and-commit seeding.
- [[ADR-0151-ambient-occlusion-render-pipeline]]: named WebGL 2 the only baselined backend and filed
  the live-view WebGPU follow-up this lane leaves uncovered.
- Issue #401: the runner evidence that WebGL 2 works under default flags and renders the harness
  deterministically, and the umbrella this closes.
- Issue #469: the live WebGPU visual-regression follow-up outside this lane's scope.
