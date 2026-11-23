---
slug: decisions/ADR-0232-the-editor-fills-the-failure-view-slot-of-the-3d-pane
title: 'ADR-0232: The editor fills the failure view slot of the 3D pane'
type: decision
tags: [rendering, error-states, accessibility, bridge, editor, design-system, live-view]
related:
  [
    decisions/ADR-0197-scene-renderer-lifecycle,
    decisions/ADR-0174-live-pane-webgl-fallback,
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
    decisions/ADR-0225-green-commits-are-proven-by-their-red-tests,
  ]
sourceFiles:
  [
    bridge/react/scene-failure-view-context.ts,
    bridge/react/plain-scene-failure-view.tsx,
    bridge/react/scene-failure-host.tsx,
    bridge/react/scene-chrome-context.ts,
    bridge/react/scene-chrome.tsx,
    bridge/react/scene-canvas.tsx,
    bridge/react/scene-renderer-canvas.tsx,
    bridge/react/scene-pane-shell.tsx,
    bridge/react/scene-proxy-overlay.tsx,
    bridge/react/live-scene-view.tsx,
    editor/shell/scene-failure-copy.ts,
    editor/shell/scene-pane-failure-view.tsx,
    editor/shell/scene-pane.tsx,
    e2e/tests/scene-live-view-startup.spec.ts,
  ]
status: current
updated: 2026-11-22
---

# ADR-0232: The editor fills the failure view slot of the 3D pane

## Status

Accepted on 2026-11-22 for issue #822. It amends ADR-0197 in four places, which now point here, and
takes up in a new form an alternative that ADR-0197 rejected. It supersedes nothing.

## Context

ADR-0197 gave the 3D pane two failure views: one for a renderer module that did not load and one
for a renderer that could not be built or started. Both were plain, unstyled elements, because the
bridge cannot import the design system.

Each view carried its own live role. The load view put its sentence in a `role="alert"` paragraph,
and the start view was a `role="status"` element. Both arrived in the page already holding their
text. Screen readers do not reliably announce a live region that is inserted with its content
already in it, so a user who could not see the pane might never hear about the failure.

The scene chrome also stayed in place over a failed renderer. The 3D navigation toolbar, the camera
controls hint, and the proxy overlay with its selection status were still there, and the pane still
showed the grab cursor. None of them does anything when no scene is drawn.

ADR-0197 rejected a design-system banner supplied by the editor "for now". It would have needed a
small failure channel, and issue #692 would replace that channel later. Issue #822 reopens the
question.

## Decision

### The bridge has a slot for the failure view

`SceneFailureViewContext` in `bridge/react/scene-failure-view-context.ts` holds the component that
stands in for the pane when the renderer fails. Its props are `{ kind: 'start' }` or
`{ kind: 'load', onReload }`. Its default value is `PlainSceneFailureView`, which picks one of the
two plain views of ADR-0197. Nothing in the bridge provides the context, so the scene harness and
the timing page get the plain views. The bridge's own stories render the two plain views directly.

`SceneFailureHost` (`bridge/react/scene-failure-host.tsx`) reads the slot and renders its view. The
host's own wrapper carries the `data-scene-renderer-failed` marker with the failure kind, and keeps
the `scene-canvas__fallback` class. The plain views no longer carry the marker. A view that fills the
slot does not need to know about the marker and cannot leave it out. `SceneRendererCanvas` renders
the host for both failed states, and `SceneCanvas` renders it with the `start` kind when the
runtime has no backend at all.

### The editor's pane fills the slot

`ScenePane` (`editor/shell/scene-pane.tsx`) wraps `SceneCanvas` in a provider whose value is
`ScenePaneFailureView` (`editor/shell/scene-pane-failure-view.tsx`). That view uses the design
system's `EmptyState` with `asRegion={false}`, so it adds no landmark inside the pane's region. The
title is a heading, and the load view adds a primary "Reload page" button that calls `onReload`.
`editor/shell/scene-failure-copy.ts` holds the wording the owner chose:

| Kind    | Title                                  | Description                                                                                    |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `load`  | Could not load the 3D view             | Check your network connection, then reload the page. After the reload, open the 3D view again. |
| `start` | This browser cannot render the 3D view | Your plan and the 2D editor are unaffected.                                                    |

### Two empty live regions announce the failure

The pane mounts two visually hidden live regions on its first render: an empty `role="status"`
element and an empty `role="alert"` element. When a failure view appears, the pane writes the title
and the description, joined as `<title>. <description>`, into one of them. A renderer that cannot
start goes into the polite status region. A module that did not load goes into the assertive alert
region, because the user has something to do: reload the page. The pane learns the failure kind by
reading the host's marker through the observer it already runs for the readiness attribute.

The visible view has no live role, and focus does not move.

This has a known cost. A screen reader user who browses the pane meets the failure text twice, once
in the visible view and once in the hidden region.

The pane's own "3D preview unavailable" state, which it shows in place of `SceneCanvas` when the
browser has no usable backend, does not change and mounts no regions.

### A mounted failure host hides the scene chrome

`SceneChromeProvider` (`bridge/react/scene-chrome.tsx`) wraps `LiveSceneView` inside `SceneCanvas`.
`SceneFailureHost` calls `useHideSceneChrome`, which sets the provider's flag in a layout effect
while the host is mounted and clears it on unmount. While the flag is set:

- `SceneChrome` removes the 3D navigation toolbar and the camera controls hint.
- `ScenePaneShell` sets no cursor, so the grab cursor goes away.
- `SceneProxyOverlay` renders nothing, which also removes its selection status.

The editor's pane also drops its WebGL 2 notice (ADR-0174) while a failure view is in it. The shell's
view switch is outside the pane and stays. Without a provider, as in the scene harness, the context
default keeps the chrome visible and hiding is a no-op. The hook assumes one failure host per
provider.

## Consequences

- Assistive technology gets the failure through a region that was in the page before the text
  arrived. A sighted user sees a styled message, without the scene controls that do nothing when no
  scene is drawn.
- `editor/shell/scene-pane-failure-view.stories.tsx` adds two stories, "Could not load" and "Cannot
  render", and each one gets a story baseline. The two bridge story baselines do not move, since the
  plain views keep their look.
- `bridge/react/live-scene-view.tsx` is excluded from unit coverage (ADR-0225). It gains only the
  `SceneChrome` wrapper around the toolbar and its import. Every rule lives in modules that unit tests
  run, and the e2e case "shows only the announced failure view when the renderer chunk cannot be
  fetched" in `e2e/tests/scene-live-view-startup.spec.ts` is the one run of those glue lines. The
  `start` kind has no e2e case, because a real browser cannot be made to fail `init()` on demand.
- The story coverage allowlist (ADR-0111) gains `PlainSceneFailureView`, `SceneChrome`,
  `SceneChromeProvider`, `SceneFailureHost`, and the test-only `FailureProbe`. None of them draws
  anything that the existing stories do not already show.
- The slot, the marker on the host, and the pane's two regions are local seams. Issue #692 may reuse
  or replace them when failures move into a pane boundary and the session's notification channel.

## Alternatives considered

- **A live region in the bridge's view.** The bridge cannot use the design system, so the styled
  view could not live there. A region that mounts together with the failure text is also the defect
  this record fixes.
- **A failure callback through props.** The callback would pass through `live-scene-view.tsx`, which
  is excluded from coverage, so no unit test would run it.
- **Hiding the chrome from the editor with CSS over the bridge's class names.** That is a selector
  that crosses layers, and the hidden nodes would stay in the accessibility tree.
- **The visible message as the live region.** It would show and announce the text from one element.
  But that element mounts with its text, which is the timing that screen readers miss, and the
  owner chose the empty regions instead.

## References

- Issue #822, and issue #692 for error containment and the notification channel.
- ADR-0197 for the renderer lifecycle and the two failed states, ADR-0174 for the WebGL 2 notice,
  ADR-0111 for story coverage, and ADR-0225 for the coverage rule.
- `bridge/react/scene-readiness.ts` for the marker attribute and the failure kind type.
