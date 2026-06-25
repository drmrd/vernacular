---
slug: decisions/ADR-0124-scene-component-story-gap
title: 'ADR-0124: The scene and bridge components stay permanently on the story-coverage allowlist'
type: decision
tags: [tooling, testing, storybook, stories, coverage, allowlist, scene, bridge, r3f, webgpu]
related:
  [
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
    decisions/ADR-0117-storybook-story-visual-regression,
    decisions/ADR-0105-storybook-browser-mode-component-tests,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles: [scripts/story-coverage/uncovered-components.ts]
status: current
updated: 2026-06-25
---

# ADR-0124: The scene and bridge components stay permanently on the story-coverage allowlist

## Status

Accepted, landed. The bridge and scene components keep their entries on the story-coverage
allowlist for good, and that is now written down as a deliberate choice rather than left as the
shape the backfill happened to settle into. A scene-snapshot harness that could give them visual
coverage is deferred, with a stated trigger for building it.

## Context

ADR-0111 set up the story-coverage guard and the per-area backfill that drove the allowlist down to
its floor. ADR-0117 added the visual-regression gate that screenshots every testable story. The
backfill is finished. What is left on the allowlist in `scripts/story-coverage/uncovered-components.ts`
is the floor those two ADRs anticipated: components that cannot earn a meaningful isolated story.

Two groups make up that floor. The first is the bridge and scene layer in `bridge/react`: the scene
canvas and its WebGPU view, the camera controls, the lighting and selection nodes, the scene proxy
projector and overlay, and the context providers (editor session, active floor, selection, surface
selection) that only carry meaning inside a live editor session. The second is the orchestrators and
full-tree surfaces that wrap that layer: the editor shell, the scene pane, the plan view and its
overlay, the view-mode viewport, the asset provider tree, the library launcher panel, and the
`EntityProxy` accessibility overlay. None of them render anything an isolated browser-mode story can
assert. Each needs a live R3F canvas, a WebGPU context, or the full editor provider tree to do
anything at all.

ADR-0111's 2026-06-23 update already recorded that the bridge and scene slice would not get
integration-style stories, and it gave the reason. It left one thread open: whether a different
harness might later cover those components some other way. Issue #286 asked the project to settle that
question so the allowlist reads as an intentional contract and not an oversight a future contributor
might try to "fix" by forcing contrived stories. This ADR is that settlement.

## Decision

The bridge and scene components, and the orchestrators that compose them, stay on the story-coverage
allowlist permanently. Each entry keeps the plain-English reason it cannot be isolated. The allowlist
plus those reasons is the contract: a reader who finds these modules uncovered is meant to understand
the gap is deliberate.

A browser-mode Storybook story is the wrong tool for these modules. Standing up a story for any of
them means rebuilding the editor session, a WebGPU renderer, or an R3F canvas around the subject. That
scaffolding produces a render that asserts nothing the modules' own tests do not already cover. The
scene behavior is tested where it lives, through the engine and bridge tests and the end-to-end scene
journeys, not through a mounted story. `EntityProxy` is an invisible accessibility overlay; its
keyboard selection is covered by `entity-proxy.test.tsx`. Forcing any of these into a story would add a
maintenance surface and a flaky screenshot baseline in exchange for no new signal.

This does not close the door on visual coverage of the live scene forever. It rules out the
browser-mode story as the mechanism and names a different mechanism as the future option.

### The deferred scene-snapshot harness

If the project later wants visual coverage of the live-canvas components, the way to get it is a
scene-snapshot harness: render a canvas or R3F component headless, drive it to a known frame, and
snapshot the output for a pixel diff. That is a separate piece of tooling from the browser-mode story
harness in ADR-0105 and the static-build screenshot gate in ADR-0117. ADR-0045 already established the
three-dimensional render conventions and a Playwright baseline for the full scene, so a component-level
scene-snapshot harness would build on that rather than start from nothing.

This harness is deferred, not designed. The trigger to build it is a concrete want for per-component
visual regression on the scene layer, for example a recurring class of bug where a scene component
renders wrong without any of the existing tests catching it. Absent that trigger, the cost of a headless
WebGPU render path and its baselines is not worth carrying. The end-to-end scene journeys and the
existing full-scene Playwright baseline from ADR-0045 cover the live canvas at the level the project
needs today.

## Consequences

- The allowlist entries for the bridge, scene, and full-tree modules are understood as permanent and
  intentional. A future contributor reading the guard knows not to "fix" the gap by forcing a contrived
  story, and the guard still fails if any of these modules ever gains a real story (the entry must then
  be removed) or is renamed or deleted (the stale entry must be removed). The contract stays honest.
- The story-coverage floor is fixed for these modules. The allowlist grows again only when a brand-new
  component arrives without a story, which is the regression the guard exists to catch. The scene
  entries are not part of that signal.
- Visual coverage of the live scene stays at the end-to-end level. A scene component can change its
  rendered pixels without a per-component baseline catching it; the full-scene Playwright baseline from
  ADR-0045 and the scene journeys are the safety net until and unless the deferred harness is built.
- When the trigger for the scene-snapshot harness arrives, this ADR is the starting point. The harness
  gets its own ADR and its own design; this one records why it was deferred and what would justify it.

## References

- ADR-0111 (the story-coverage guard, the backfill policy, and the allowlist these entries live on).
- ADR-0117 (the visual-regression gate for browser-mode stories, which these modules cannot join).
- ADR-0105 (the browser-mode component-test harness these modules cannot stand up in isolation).
- ADR-0045 (the three-dimensional render conventions a future scene-snapshot harness would build on).
