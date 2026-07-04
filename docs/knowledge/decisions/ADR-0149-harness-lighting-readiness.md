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
    e2e/tests/scene-solar.spec.ts,
  ]
status: current
updated: 2026-07-04
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

Nobody has built a GPU-capable CI path for the scene tier yet. Until someone does, a
scene-baseline change means a local regeneration with
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
