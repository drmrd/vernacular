---
slug: decisions/ADR-0197-scene-renderer-lifecycle
title: 'ADR-0197: The 3D canvas wrapper releases every renderer it builds and tells a failed load from a failed start'
type: decision
tags: [rendering, lifecycle, bridge, engine, three-js, react-three-fiber, webgpu, error-states]
related:
  [
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0174-live-pane-webgl-fallback,
    decisions/ADR-0124-scene-component-story-gap,
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
    decisions/ADR-0019-bridge-dispatch-boundary,
  ]
sourceFiles:
  [
    engine/renderer/release-renderer.ts,
    engine/index.ts,
    bridge/react/scene-renderer-canvas.tsx,
    bridge/react/scene-load-failed-status.tsx,
    bridge/react/scene-unsupported-status.tsx,
    bridge/react/scene-readiness.ts,
    editor/shell/scene-pane.tsx,
    app/use-before-unload-guard.ts,
    scripts/story-coverage/uncovered-components.ts,
  ]
status: current
updated: 2026-11-18
---

# ADR-0197: The 3D canvas wrapper releases every renderer it builds and tells a failed load from a failed start

## Status

Current. Landed with the fix for issue #746. This record extends ADR-0004 and its amendment of
2026-11-15, which made `SceneRendererCanvas` the one owner of the renderer's start. It replaces two
passages of that amendment ("The failed state" and two bullets of "What remains"), which now point
here. The same change corrected four older sentences of ADR-0004. ADR-0174 had made three of them
stale, and the amendment of 2026-11-15 the fourth, which named the async factory with an awaited
`init()` as the supported path. It supersedes nothing.

## Context

The ADR-0004 amendment put the 3D canvas wrapper (`bridge/react/scene-renderer-canvas.tsx`) in
charge of the renderer's start. The review of that change found gaps in the rest of the renderer's
life. Issue #746 collects them.

Nothing released the renderer. Once `init()` resolves, a three.js 0.184 renderer runs a
`requestAnimationFrame` loop for as long as it lives. Only `dispose()` stops that loop and frees the
GPU device, or the context on the WebGL 2 backend. No file in `bridge/` or `engine/` called
`dispose()`. The teardown of `@react-three/fiber` calls `renderLists.dispose()` and
`forceContextLoss()` on the renderer. The WebGPU renderer has neither member, so both calls do
nothing. Each unmount of the live view left one loop and one device behind, and each reopen of the
split view added another.

`dispose()` is not safe at every moment either. While `init()` is pending, `dispose()` skips its
release steps and then waits for the start. When the start resolves, the loop begins and nothing
stops it. After `init()` rejected, `dispose()` awaits the rejected start again and drops the result,
which the browser reports as an unhandled rejection. A failed `init()` never built the loop.

A factory that threw while it built the renderer was not caught. The throw rejected the library's
async setup, which nothing awaits, so it escaped as an unhandled rejection. The wrapper stayed in
its starting state behind a blank canvas with no message, and each later render of the canvas
called the factory again.

A failed load of the renderer module, usually a network error, showed "This browser cannot render
the 3D view." The browser can render. A reload of the page may work, and the message did not say
so.

The library asks for a renderer once per setup, and only while it holds none. Each setup waits one
microtask on the result of `gl` before it stores the renderer. A second setup that starts inside
that microtask therefore asks for a second renderer. This is the one-microtask window that the
ADR-0004 amendment named. The wrapper had nothing for that case: it would start `init()` on both
renderers and tie neither result to its renderer. The first renderer would never be released. Its
`init()` could mark the wrapper ready while the renderer the library kept was still starting, or
failed for a renderer that nothing used.

React StrictMode, which the app uses in development, does not open that window by itself. By the
source of `@react-three/fiber` 9.6.1, the canvas starts a setup only once it has a measured size,
and the size is still 0 when StrictMode runs the mount effects twice. The simulated unmount then
finds no root to tear down. Two requests need two setups in one task, and no path in the app is
known to do that. This was read from the source and not run.

On every failure the editor's scene pane kept its "Building the scene..." overlay, because the live
view's readiness node never turns ready. The overlay sat over the failure text and said the wrong
thing.

## Decision

### The engine owns the release rule

`releaseSceneRenderer(renderer, started)` in `engine/renderer/release-renderer.ts` frees a renderer
that its owner is done with. `started` is the promise that `init()` returned. The function waits for
it to settle. After a resolved start it calls `dispose()` once. After a failed start it calls
nothing, because no loop exists and `dispose()` would raise the unhandled rejection described above.
It may be called while the start is pending; `dispose()` never runs before the start settles. The
promise it returns never rejects. It does not reject for a failed start, and since 2026-11-18 it
does not reject when `dispose()` throws: the function reports the error with `console.error` and
resolves. The module imports three.js types only.

The rule depends on how this three.js version behaves, so it lives in the engine, beside the one
place that builds the renderer.

### The wrapper releases each renderer it builds exactly once

`SceneRendererCanvas` holds the renderer it built last, with its start. It hands each renderer to
`releaseSceneRenderer` once, at the first of these moments:

- its `init()` rejects;
- the library asks for a newer renderer, which replaces it;
- a later build fails while it is still held;
- the wrapper unmounts, also while `init()` is still pending.

A release clears what the wrapper holds, so a renderer released after a failed start is not
released again on unmount. The wrapper does not rely on the library's own unmount, which releases
nothing for this renderer.

### A factory that throws ends in the cannot-render state

The `gl` function catches a throw of the factory. It logs a failed build, releases any renderer it
still holds, and moves the wrapper to the cannot-render state. Then it returns a promise that never
settles.

It cannot return `undefined`. The library builds its own WebGL renderer on the canvas for any `gl`
result that is not a renderer. It cannot rethrow either, because the error would escape the
library's setup as an unhandled rejection. The pending promise stops the library's setup, and the
next render swaps the canvas for the status, so nothing waits on that promise. The library's types
allow a `gl` function that returns a renderer, or one that returns a promise, but not one that can
return either. This one can, so its return carries a type cast.

### Only the current renderer sets the state

The current renderer is the one the library asked for last, which is also the one the library
keeps. Only its `init()` can mark the wrapper ready or failed. The result of a renderer that a newer
one replaced changes nothing. After unmount nothing is current, so a late result changes nothing
either. This closes the window that the ADR-0004 amendment named, for any path that would open it.
The tests force that case with a stand-in canvas.

A failed build while an earlier renderer is still starting releases that earlier renderer. It is no
longer the one the canvas asked for last. Had it stayed held, its `init()` would have marked the
wrapper ready after the failure and mounted the canvas a second time, and nothing would have
released it.

### A failed load has its own message and reloads the page

The wrapper has two failed states. A module that did not load shows `SceneLoadFailedStatus`
(`bridge/react/scene-load-failed-status.tsx`). Its message, "Could not load the 3D view. Check your
network connection, then reload the page.", sits in an element with `role="alert"`, followed by one
button, "Reload page". The button calls the wrapper's optional `reloadPage` prop, which by default
reloads the browser page. The wrapper makes no second load attempt in place.

The reason is how the browser treats a failed dynamic import. In a live run in Chromium 148, after
the renderer chunk failed to load, a second `import()` of the same address sent no request and
rejected at once with "Failed to fetch dynamically imported module". A direct `import()` of that
address failed the same way while the network route was open again, and the same address with a
query string loaded. So a retry in place cannot recover. A new page starts without that record of
the failure and requests the chunk again.

The reload has a cost. Session state that is not part of the project, such as the camera, is lost.
While the project has unsaved changes, the application's unload guard
(`app/use-before-unload-guard.ts`) keeps a `beforeunload` listener armed, so the browser shows its
own prompt before the page leaves, and the user can stay.

A renderer that cannot be built or started shows the existing `SceneUnsupportedStatus`, "This
browser cannot render the 3D view.", with no button. A reload does not help a browser with no
usable backend. Each failed state stays until the page goes away or the wrapper mounts again.

Both views use plain elements. The bridge may import only `core/`, `storage/`, and `engine/`, so it
cannot reach the design system's banner or the notification hook. This change builds no error
boundary, no error taxonomy, and no notification channel. Issue #692 and section 5.10 of
`docs/specs/2026-11-14-architecture-refactor-round.md` own those. Failures still log through
`console.warn`.

### The scene pane drops its overlays over a failed renderer

Both failure views carry the attribute `data-scene-renderer-failed`. Its value is the failure kind:
`load` for a module that did not load, and `start` for a renderer that could not be built or
started. `bridge/react/scene-readiness.ts` names the attribute and the `SceneRendererFailureKind`
type, beside the readiness attribute that the bridge and the pane already share. `ScenePane`
(`editor/shell/scene-pane.tsx`) reads the attribute through its existing observer. Over a failed
renderer the pane shows neither "Building the scene..." nor the empty-floor guidance. The live view
itself does not change.

### The two status views have stories

`SceneUnsupportedStatus` and `SceneLoadFailedStatus` each have a Storybook story, and the allowlist
entry for `SceneUnsupportedStatus` is removed. ADR-0124 keeps on the allowlist the bridge components
that need a live canvas, a GPU context, or the editor's provider tree. These two are static
elements that need none of those, so that floor does not cover them.

## Alternatives considered

**The bridge calls `dispose()` itself.** A chain such as
`init().then(() => renderer.dispose(), () => {})` in the wrapper would save one engine export. It
was rejected because it puts knowledge of the three.js lifecycle in `bridge/`, and the engine is
where that knowledge can be tested against a fake renderer.

**Call `dispose()` after a failed start too**, as the issue first worded it. Rejected: no loop
exists then, and each failure would add an unhandled rejection to the console.

**Return `undefined` or rethrow from `gl` after a factory throw.** Rejected for the reasons above.
The library would build its own WebGL renderer, which could leak its context, or the error would
escape as an unhandled rejection.

**Keep the first renderer current and refuse later requests.** Rejected because the library keeps
the renderer it asked for last. The wrapper would follow a renderer the library had dropped.

**A design-system banner for the failed load, supplied by the editor.** It would match the rest of
the application. It needs a small failure channel, through a bridge context or a prop, and #692
would replace that channel. A prop would also pass through `bridge/react/webgpu-scene-view.tsx`,
which is close to its line limit. Rejected for now.

**A retry in place that imports the module a second time.** This was the first design, and it was
built. It would keep the page and its session state. Rejected because it does not work: in the live
run described above, the browser kept the failed import for that address, and the second `import()`
rejected at once without a request.

**A changed address on the second import**, for example the chunk's address with a query string.
The live run showed that such an address loads. Rejected for three reasons. The wrapper would need
the hashed address of the built chunk, which the bundler owns. The chunk's own imports keep their
addresses, so any of them that failed would stay failed. After a deploy the old chunk is gone from
the server, and only a reload reaches the new files.

**A way to retry a failed start as well.** Rejected: a second start does not help a browser with no
usable backend.

**Leave the overlay over the failure text and file a follow-up.** Rejected because the overlay hid
the message. The DOM marker extends a signal that the pane already reads.

**A second dated amendment inside ADR-0004.** That would keep one home for the renderer, but ADR-0004
would grow into a list of lifecycle patches. ADR-0004 is corrected in place instead and points here.

## Consequences

- Every renderer the wrapper builds reaches the engine's release once. Closing and reopening the 3D
  view no longer adds an animation loop and a GPU device each time.
- A failed load, a failed build, and a failed start each end in a visible state with words that fit
  the failure, and the pane's overlays no longer cover them.
- Recovering from a failed load costs a page reload. The camera and other session state outside the
  project are lost, and a user with unsaved edits sees the browser's leave prompt first.
- The engine exports one more function. The three test files of the wrapper stub it in their engine
  mock. Other bridge tests that mock the engine, such as `bridge/react/scene-lighting.test.tsx`,
  render no scene canvas and do not need it.
- The failure kind and the marker attribute are seams. Issue #692 may reuse or replace them when it
  routes failures into a pane boundary and the session's notification channel.
- The failure views are still unstyled. `.scene-canvas__fallback` has no CSS rule, as before.

## Evidence

`engine/renderer/release-renderer.test.ts` proves the release rule against a fake renderer with a
`dispose` spy. A resolved start leads to one `dispose()`. A pending start holds `dispose()` back
until it resolves. A failed start leads to no `dispose()`, the release promise resolves, and no
unhandled rejection is reported. A `dispose()` that throws after a resolved start leads to one
`console.error` call with the thrown error and a release promise that resolves, and a `dispose()`
that returns normally logs nothing.

`bridge/react/scene-renderer-canvas-release.test.tsx` covers the release-once rule. Three cycles of
open, start, and close build three renderers and release each one once, with never more than one
unreleased at a time and no running loop at the end. An unmount while `init()` is pending releases
the renderer once and logs no warning. A failed `init()` releases the renderer once while the wrapper
is mounted, and the unmount does not release it again. An unmount before the module loads builds
and releases nothing.

`bridge/react/scene-renderer-canvas.test.tsx` covers the failed states. A factory that throws ends
in the cannot-render status with the `start` marker. Its `gl` call returns a promise, nothing is
released, and no unhandled rejection is reported. A failed `init()` shows the same status with no
"Reload page" button. A failed load shows the alert, the "Reload page" button, and no cannot-render
status, with no unhandled rejection. A press on the button calls `reloadPage` exactly once, the
alert stays, and the wrapper does not ask the loader for the module a second time.

The failure of a retry in place was observed in a live run in Chromium 148, in the `scene-webgl`
project, before the reload replaced it. That run was not committed as a test. The reload is
covered end to end in `e2e/tests/scene-live-view-startup.spec.ts`, in the case "shows the live
canvas after Reload page once the renderer chunk can be fetched again". It aborts the renderer
chunk, opens the split view, and expects the alert and no canvas. Then it lets the chunk through
and presses "Reload page". After the reload the 3D pane shows one sized canvas and no alert, and the
browser has requested the chunk again. The case runs in one browser, in the `scene-webgl` project,
and skips itself without WebGPU.

`bridge/react/scene-renderer-canvas-strict-mode.test.tsx` renders the wrapper under StrictMode with a
stand-in canvas that calls `gl` in a plain effect, which StrictMode runs twice. The stand-in
therefore asks for two renderers. That is a worst case: by its source, the real library asks for one
here. The first renderer's resolved or rejected start does not
change the state. The first renderer is released once while the wrapper is mounted, and the second
once on unmount. The other outcomes still hold. When the second build fails, the cannot-render
status stays, the first renderer is released once whether its start then resolves or rejects, and
the canvas is not mounted again.

`editor/shell/scene-pane-renderer-failure.test.tsx` checks, for both failure kinds, that the pane
drops the loading overlay and the empty-floor guidance and keeps the failure view. A pane whose
renderer has not failed still shows the loading overlay.

The stories in `bridge/react/scene-load-failed-status.stories.tsx` and
`bridge/react/scene-unsupported-status.stories.tsx` check each view's role and text. The first also
presses "Reload page" and checks that the handler ran.

The bridge tests replace the engine's release with a stub that records which renderer it received,
and the library's `Canvas` with a stand-in that calls `gl` in an effect. They prove that the wrapper
hands each renderer over once. The engine test proves what the release then does.

## Limits

- No test runs a real three.js renderer. That `dispose()` after a resolved start stops the loop and
  frees the device, and that an early or late `dispose()` misbehaves, was read from the three.js
  0.184 source.
- That the real library asks for one renderer under StrictMode, and two only when two setups start
  in one task, was read from the source of `@react-three/fiber` 9.6.1 and not run. The StrictMode
  tests force two requests with a stand-in canvas that has no cleanup of its own, so the
  current-renderer rule is tested only against that forced case.
- No path is known on which `dispose()` throws after a resolved start. The release catches such a
  throw (see above), so the wrapper, which discards the release promise, gets no rejection. A
  `dispose()` that returns a rejected promise is not covered; the library types it as returning
  nothing.
- When a renderer cannot be built, the wrapper gives the canvas library one pending promise that is
  a constant of the module. The library attaches its handlers to it, so each failed build stays
  reachable for the life of the page. #819 keeps this point: the wrapper should return a new
  pending promise for each failed build.
- That the browser keeps a failed dynamic import was seen in one browser, Chromium 148. Other
  browsers were not run. The reload does not depend on it, since a new page fetches the chunk again.
- The end-to-end case for the reload runs in one browser only, and only where WebGPU exists. It does
  not cover unsaved edits, so the leave prompt on reload is not tested here.
- No CI job runs the reload case with WebGPU. The macOS live-view job, the one with WebGPU flags,
  runs only the specs it names, and this spec is not among them. The chromium e2e job ignores
  `scene-*` specs. The Linux scene-visual job runs the whole `scene-webgl` project, this spec
  included, but launches the browser without WebGPU flags, and the case skips itself where
  `navigator.gpu` is absent. Whether it is absent on that runner was not checked. The case ran on
  the development Mac only.
- Within one page, a later mount of the wrapper after a failed load imports the same address again.
  By the live run, that import fails at once, so reopening the 3D view shows the same alert. This
  is inferred and not tested; the unit test of a later mount uses a stubbed loader.
- The library tears down its own state 500 ms after unmount, which is after the wrapper's release.
  That teardown disposes scene objects, not the renderer, so no error is expected. No browser run
  has confirmed that the console stays clean.
- A start that fails after its backend took a GPU device or a WebGL context would keep it, because
  the release calls nothing after a failed start. This case is rare and not tested.
- Under StrictMode the library's simulated unmount runs while the canvas has no measured size and no
  root, so it tears nothing down. This was read from the source and not run.

## References

- Issue #746, and issue #692 for error containment.
- ADR-0004 and its amendment of 2026-11-15, which this record extends.
- ADR-0174 for the WebGL 2 backend of the live pane, and ADR-0124 and ADR-0111 for story coverage.
- `engine/renderer/release-renderer.ts`, `bridge/react/scene-renderer-canvas.tsx`, and
  `bridge/react/scene-readiness.ts`.
