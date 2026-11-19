---
slug: decisions/ADR-0149-harness-lighting-readiness
title: 'ADR-0149: Harness lighting readiness and where scene baselines render'
type: decision
tags: [architecture, engine, bridge, lighting, testing, visual-regression, 3d-preview]
related:
  [
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0117-storybook-story-visual-regression,
  ]
sourceFiles:
  [
    engine/lighting/lighting-provider.ts,
    engine/lighting/solar-lighting-provider.ts,
    bridge/react/scene-lighting.tsx,
    bridge/react/scene-harness-view.tsx,
    bridge/react/scene-harness-ready-frame.ts,
    bridge/react/scene-harness-state-key.ts,
    engine/renderer/draw-on-next-renderer-frame.ts,
    e2e/tests/scene-solar.spec.ts,
    e2e/tests/scene-harness-ready-frame.spec.ts,
  ]
status: current
updated: 2026-11-19
---

# ADR-0149: Harness lighting readiness and where scene baselines render

## Status

Accepted. Completes the solar-baseline acceptance that issue #436 deferred, and corrects the
plan-level record of where scene baselines come from.

## Context

[[ADR-0148-visible-sky-and-sh-light-probe]] moved the visible sky behind a lazily imported
chunk so `three/webgpu` stays out of the entry bundle. The solar provider fires that attach
and returns; the live views pick the sky up on their next frame, so nothing there needed to
wait. The render harness is different: it runs `frameloop="never"` and draws exactly one frame
on mount, which is what keeps its screenshots deterministic. That one frame always ran before
the sky chunk resolved. Every solar baseline captured a correctly lit shell in front of the
harness's placeholder clear color, and the acceptance point of #436, seeing the sky, was
unverifiable.

Generating those baselines also exposed a wrong assumption the slice plans had been carrying.
The 1a and 1b plans both said scene baselines "render on the CI runner" under the `run:visual`
label. They do not. The label forces the Storybook story suite, whose baselines do render on
the runner (ADR-0117). The scene specs are a separate tier: the CI end-to-end job runs
`--project=chromium`, which ignores `scene-*.spec.ts` entirely, and no workflow runs the
`scene-webgl` project. The only place that project runs is the development Mac, whose Metal
ANGLE backend the playwright config selects on purpose, and the committed
`scene-visual-regression` baselines have been darwin renders all along.

## Decision

### Providers may expose readiness; the harness gates its captured frame on it

`LightingProvider` gains an optional `whenReady(): Promise<void>`. The solar provider keeps
the promise its sky attach already returned and hands it out; the basic provider, with no
asynchronous resources, does not implement the member at all. `apply` stays synchronous.

`SceneLighting` accepts an optional `onReady` callback settled from `provider.whenReady`,
with a cancelled flag so a provider swap or unmount cannot report a disposed provider's
readiness. Live views omit the prop and behave exactly as before.

The harness draws two frames: the mount frame, unchanged, so the canvas never sits blank, and
a second frame when readiness flips. The wrapper advertises the flip as `data-harness-ready`.
React commits the attribute in the same pass whose layout effect renders the ready frame, so
by the time a test can observe `data-harness-ready="true"`, the sky-lit frame exists. The
solar spec waits for the attribute before screenshotting instead of polling pixels or
sleeping on a timer; the attribute is the whole synchronization contract.

A failed chunk load keeps the contract honest rather than hanging it: the attach resolves
after its catch-and-warn fallback, readiness still flips, and the baseline diff shows a
missing sky instead of the spec timing out.

### Scene baselines are darwin renders from the development Mac, by convention

The four solar baselines land as `-darwin.png` files rendered on the Metal tier, matching the
existing `scene-visual-regression` baselines. This is now the stated convention, not an
accident: CI neither renders nor checks scene baselines today. The story tier keeps its
linux-on-the-runner convention from ADR-0117; the two tiers differ because story rendering is
DOM-deterministic while the scene tier needs a real GPU, which the runners do not have.

[[ADR-0152-linux-scene-baseline-lane]] has since built a GPU-capable CI path for the scene tier, a
SwiftShader `-linux` baseline family rendered and checked on the ubuntu runner, though the
authoritative `-darwin` family stays a development-Mac render with no CI gate of its own. Until
someone does, a scene-baseline change means a local regeneration with
`pnpm exec playwright test e2e/tests/<spec> --project=scene-webgl --update-snapshots=all`.

## Consequences

- Solar baselines show the sky they are lit by: a bright horizon at equinox noon, a warm low
  band on a winter afternoon, flat grey under overcast, and a neutral sky under the color
  check.
- The readiness member is optional, so no other provider or fixture changed.
- The harness renders two frames instead of one. The mount frame is identical to the old
  single frame, so schematic baselines did not move.
- One trap worth knowing: the playwright project selectors match unanchored against absolute
  paths, so a checkout or worktree whose directory name contains `scene-` routes every spec
  into the `scene-webgl` project. A worktree named for this branch hit exactly that; name
  worktrees accordingly.

## Update (2026-11-19): the ready frame is drawn on a fresh frame of the renderer

The harness drew each frame in a React layout effect, so it drew whenever a commit changed what the
frame depends on. The renderer of `three` resets its render counts, and advances the frame counter
that its once-per-frame work is keyed on, at the start of each frame of its own animation loop, and
a draw does neither. When two harness draws fell inside one animation frame, the second one skipped
that work. On the ambient occlusion path the passes of the pipeline did not run again, so the frame
only composited the textures of the earlier draw. On every path the light colors and the shadow map
were the ones that the earlier draw had computed. A change of readiness made two commits, so this
happened in ordinary loads: one set of runs saw it in 44 of 54 loads and a second, independent set
in 9 of 72, so its rate depends on the load of the machine. The captured pictures were still
correct, because nothing changed between the two draws. But a change that takes effect at readiness
through that work could be missing from a capture.

The harness hands each draw to the renderer's own animation loop through `drawOnNextRendererFrame`
(`engine/renderer/draw-on-next-renderer-frame.ts`). The renderer calls that loop right after it
starts a new frame. Requests made before that frame replace one another, so a frame draws one
time. `data-harness-ready` turns true in the commit after the ready frame was drawn. The wrapper
reports the render calls and the draw calls of that frame in `data-harness-ready-render-calls` and
`data-harness-ready-draw-calls`, and `e2e/tests/scene-harness-ready-frame.spec.ts` expects the
full number of render calls for a state with ambient occlusion and for a plain one. No baseline
moved.

Two related faults went with it. The default of the `paint` prop was a new object on each render,
which rebuilt the whole fixture on each change of readiness in every state with no paint
parameter; a constant replaced it. The readiness flags were never reset, so a harness that got
another state without a remount would have stayed ready before its new scene was drawn. The
harness view renders its stage with a key made from its props (`harnessStateKey`), so a change of
state remounts the stage and every flag starts again. Only a full page load changes the state
today, so no capture was wrong.

One limit follows from the change. The harness depends on the browser's animation frames. On a
hidden page the renderer's loop does not run, so the harness never draws and never turns ready,
and a run there ends at its time limit and does not capture a wrong frame. Issue #759 tracked the
change.
