---
slug: decisions/ADR-0019-bridge-dispatch-boundary
title: 'ADR-0019: Editor session as the bridge dispatch boundary'
type: decision
tags: [architecture, bridge, dispatcher, react-context, mutation-boundary, session]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    bridge/index.ts,
    bridge/session/editor-session.ts,
    bridge/react/editor-session-context.ts,
    bridge/react/editor-session-provider.tsx,
    bridge/react/scene-canvas.tsx,
    bridge/react/webgpu-scene-view.tsx,
    bridge/react/use-scene-graph.ts,
    editor/shell/editor-shell.tsx,
    app/app.tsx,
  ]
status: current
updated: 2026-06-03
---

# ADR-0019: Editor session as the bridge dispatch boundary

## Status

Accepted. The `bridge/`, `editor/`, and `app/` layers are implemented and
tested, completing the source skeleton on top of `core/`, `storage/`, and
`engine/`. This ADR records how the bridge realizes the single mutation boundary
(hard invariant 3) for the React tree.

## Context

Hard invariant 3 (CLAUDE.md, ADR-0001) requires every model mutation to flow
through `dispatch(command)`, and the command machinery lives entirely in
`core/commands/` (ADR-0005). The React side of the application needs a single,
typed entry point to that machinery so that `editor/` and `app/` can drive the
model and read derived state without reaching into `core/` directly and without
any path that mutates the project in place.

The bridge is also where React Three Fiber lives (ADR-0004): the same object
that owns the dispatcher must expose the derived scene graph that the R3F canvas
renders.

## Decision

### The editor session wraps the dispatcher

`createEditorSession(project)` (`bridge/session/editor-session.ts`) is the only
place outside `core/commands/` that constructs and drives a `Dispatcher`. It
builds a `CommandRegistry<Project>`, seeds it with `registerProjectCommands` and
`registerWallCommands`, constructs the `Dispatcher`, and creates a memoized
scene-graph deriver (`createSceneGraphDeriver`, ADR-0018). The returned
`EditorSession` exposes:

- `dispatch(command)`, `undo()`, `redo()`, delegating to the dispatcher and
  notifying subscribers on a state change. These are the only mutation entry
  points the React tree sees.
- `getProject(): Readonly<Project>`. The `Readonly` return type is a signal, not
  just a convenience: consumers must dispatch a command to change anything rather
  than mutating the returned project.
- `getSceneGraph(): SceneGraph`, memoized by an internal version counter that the
  session bumps on each change. The deriver is invoked lazily and its output is
  cached until the next change, so the returned reference is stable between
  mutations. The deriver itself reuses unchanged floor and wall nodes by object
  reference (ADR-0018); the version counter layers a stable whole-graph reference
  on top.
- `subscribe(listener)`, the change signal that powers the React snapshot hooks
  and the autosave (ADR-0003).

The version-memoized `getSceneGraph()` is what makes the scene graph a safe
`useSyncExternalStore` source: `useSceneGraph` (`bridge/react/use-scene-graph.ts`)
passes `session.subscribe` and `session.getSceneGraph` straight to
`useSyncExternalStore`, and because the snapshot reference does not change between
mutations, React does not tear or loop. Both the R3F canvas and the 2D plan view
read the graph through this hook (ADR-0021).

This keeps the dispatch boundary in exactly one bridge module and satisfies hard
invariant 3 for the entire UI.

### A React context exposes the session

The session reaches the tree through a React context, deliberately split across
two files to satisfy `react-refresh/only-export-components` (a component module
must not also export non-component values):

- `bridge/react/editor-session-context.ts` owns the `Context` object and the
  `useEditorSession()` hook, which throws if used outside a provider.
- `bridge/react/editor-session-provider.tsx` owns the `EditorSessionProvider`
  component.

`WebGPUSceneView` (`bridge/react/webgpu-scene-view.tsx`) reads the session via
`useEditorSession`, calls `getSceneGraph()`, hands it to the engine's
`buildScene`, applies `BasicLightingProvider`, and mounts the result under the
R3F `<Canvas>` (ADR-0004).

### Composition: app over editor over bridge

`app/app.tsx` composes the whole tree. It loads or creates the project from the
durable store (`loadOrCreateProject`, ADR-0003), seeding a ground floor so the
wall tool has a target, then builds a session over it and nests the providers:
`EditorSessionProvider` over `SelectionProvider` (ADR-0020) over the editor's
`ActiveToolProvider`, with `EditorShell` inside. The selection and active-tool
stores sit beside the session rather than inside it. `EditorShell`
(`editor/shell/editor-shell.tsx`) lays out accessible landmark regions (a
`banner` toolbar, a labelled tools `nav`, a labelled viewport `main`, and a
labelled inspector `aside`) and hosts the 2D plan view (ADR-0021) in the
viewport. The bridge's `SceneCanvas` remains the WebGPU gate for the 3D path: it
renders `WebGPUSceneView` when `detectRenderBackend()` reports WebGPU and an
accessible fallback message otherwise (ADR-0004).

## Resolved: selection landed beside the session

This ADR previously deferred selection because nothing was selectable. With walls
now selectable, selection landed as a separate bridge store rather than inside the
session, to keep it out of the command/undo machinery. ADR-0020 records that
decision and its mechanism.

## Consequences

- Hard invariant 3 is enforceable across the UI: the only React-visible path to
  a model change is `session.dispatch`, and `getProject()` is read-only by type.
- The bridge owns both the dispatcher and the derived scene graph, so the R3F
  canvas renders from the same session that mutates the model, with no second
  source of truth.
- The context split is a deliberate accommodation of the fast-refresh lint rule;
  future bridge context modules should follow the same two-file shape.
- `editor/` and `app/` depend only on the session interface and the shell, not
  on `core/commands/` or `three`, keeping the layer direction clean.

## References

- Design specification, section 6.4 (data flow: user interaction to command to
  model mutation).
- ADR-0005 (command pattern; the dispatcher and registry this session wraps).
- ADR-0004 (renderer stack; the R3F canvas and WebGPU gate this session feeds).
- ADR-0001 (six-layer architecture; hard invariant 3, the dispatch boundary).
- ADR-0018 (scene-graph derivation; the memoized deriver `getSceneGraph` uses).
- ADR-0020 (the bridge selection store that sits beside this session).
- ADR-0021 (the 2D plan view that subscribes to `getSceneGraph` and dispatches).
- ADR-0003 (the autosave path that subscribes to this session's change signal).
