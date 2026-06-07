---
slug: decisions/ADR-0005-command-pattern-framework-captured-inverse
title: 'ADR-0005: Command pattern with framework-captured inverse'
type: decision
tags: [architecture, commands, undo-redo, mutation-boundary, dispatcher]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/commands/command.ts,
    core/commands/command-registry.ts,
    core/commands/dispatcher.ts,
    core/commands/inverse-capture.ts,
    core/commands/handlers/project-commands.ts,
  ]
status: current
updated: 2026-06-02
---

# ADR-0005: Command pattern with framework-captured inverse

## Status

Accepted. The command interfaces, the registry, the single `Dispatcher`
mutation boundary, the inverse-capture proxy, and the first concrete project
commands are implemented and unit-tested in `core/commands/`. The design
specification (section 7.1) remains authoritative; this ADR records the
implementation interpretation chosen where the spec left choices open.

## Context

Hard invariant 3 (CLAUDE.md, ADR-0001) requires that every mutation of the
project model flow through `dispatch(command)`. The model needs full undo and
redo, and continuous gestures (such as dragging a slider) must collapse into a
single undoable step rather than flooding history with one entry per frame.
History is persisted with the project, so it must stay bounded. A command that
fails partway must leave no partial mutation behind.

The naive way to support undo is to make every command author its own inverse by
hand. That is error-prone: an author must remember the exact prior value of
everything the forward command touched. We want the framework to capture the
inverse automatically so handlers only describe the forward edit.

The design specification describes the command pattern and a framework-captured
inverse but does not pin down how the recording layer observes mutations. The
open question was how the recording proxy should wrap the state.

## Decision

### Command and handler interfaces

`core/commands/command.ts` defines:

- `Command<P> { type; params; description; coalesceWith?(previous): Command | null }`.
  A command names the change by a string `type` and carries serializable
  `params` plus a human-readable `description`. The optional `coalesceWith`
  merges this command with the immediately preceding one for gesture collapsing.
- `CommandHandler<S, P> { apply(state, params): void }`. A handler mutates the
  working `state` according to `params`. It never authors an inverse.

`core/commands/command-registry.ts` maps a command `type` string to its handler.
`register` is fluent and returns `this`; `handlerFor` returns the handler or
`undefined`. Registration is data-driven, so callers name a change rather than
reaching into the model.

### The single mutation boundary

`core/commands/dispatcher.ts` is the only place the model mutates. `Dispatcher<S>`
holds the live `state`, the registry, an undo stack of history entries, and a
redo stack of commands. `dispatch` runs the command, clears the redo branch
(linear history), and records a bounded history entry.

- Linear undo and redo. Committing a new edit abandons any redo branch
  (`redoStack.length = 0`). `undo` pops the top entry and replays its inverse;
  `redo` re-runs the command and captures a fresh inverse for the replay.
- Atomic on error. `run` wraps `handler.apply` in a try/catch; if the handler
  throws, the captured inverse is reverted so a failed command leaves no trace,
  and a wrapped error (`Command "<type>" failed and was rolled back`, with the
  original as `cause`) is rethrown.
- Bounded history. `DEFAULT_MAX_HISTORY = 200`; when the undo stack exceeds the
  cap, the oldest entry is shifted off. The bound keeps autosave snapshots small.
- Gesture coalescing. When an incoming command's `coalesceWith` merges with the
  top of the undo stack, the top entry is replaced by the merged command paired
  with a combined inverse that reverts the newer effect before the older one, so
  one undo unwinds the whole gesture. The first concrete example is
  `setFloorCeilingHeight`, which coalesces consecutive height edits to the same
  floor.

### Framework-captured inverse via a root-level recording proxy

This is the interpretation chosen where the spec was open.
`core/commands/inverse-capture.ts` exposes
`captureInverse(root) -> { state, inverse }`. `state` is a recording `Proxy` over
the root; `inverse` is a `CapturedInverse { revert() }`. On the first `set` or
`delete` of each top-level key, the proxy records whether the key existed and its
prior value; `revert` restores or deletes those keys.

The proxy is ROOT-LEVEL (shallow), not deep. It traps `set` and `deleteProperty`
on the root only. It is paired with an immutable-update handler convention:
handlers reassign whole top-level slices of the root rather than mutating nested
objects in place. The concrete handlers in
`core/commands/handlers/project-commands.ts` follow this convention, for example
`state.floors = [...state.floors, floor]` and
`state.meta = { ...state.meta, name }`.

## Why a root-level proxy plus immutable updates, not a deep proxy

A deep recording proxy looks attractive because a handler could then mutate
anything anywhere and be recorded. It leaks in practice. Reading a nested object
through a deep proxy returns a proxy for that nested object. During a normal
immutable update a handler spreads that nested value into a new container
(`{ ...state.meta, name }`), which would copy proxy objects into the new state.
The stored model would then contain live proxies instead of plain data, which
corrupts equality, serialization, and any later capture.

A root-level proxy paired with immutable updates sidesteps this entirely. Only
the root's own properties are ever trapped, and handlers only ever read plain
nested data and write back fresh plain containers. For a pure-data model this is
foolproof: there is no path by which a proxy can be stored back into the state.

As a deliberate bonus, the immutable-update convention preserves referential
identity for unchanged entities. A handler that rebuilds the `floors` array with
`map` returns the same object for floors it did not touch, so an untouched
floor's reference is stable across the edit. This is exactly the property the
memoized scene-graph deriver keys on (ADR-0018), so the mutation layer and the
derivation layer compose for free.

The cost is that the convention is a discipline, not a type-level guarantee: a
handler that mutates a nested object in place would have its change go unrecorded
and therefore not be undoable. The handlers carry a comment stating the rule, and
the inverse-capture module documents it at the boundary.

The wall-editing commands (ADR-0035) are the first handlers to follow the
convention for a nested edit: `moveWallEndpoint` and `setWallThickness` reassign
the whole `floors` slice and rebuild the target floor's inner `walls` array with
`map`, through a shared `updateWall(floors, floorId, wallId, update)` traversal,
so the shallow proxy records the change and untouched floors and walls keep their
references. They author no inverse; the dispatcher captures it, and the
referential identity feeds the memoized deriver (ADR-0018).

## Deferred

The design specification mentions a `customRevert` escape hatch for commands
whose inverse cannot be captured automatically. No command needs it yet, so it is
deferred under YAGNI. It can be added to `Command` and consulted by the
dispatcher when a concrete command requires a hand-authored inverse, without
disturbing the captured-inverse path.

## Consequences

- Handlers describe only the forward edit; the framework captures the inverse.
  This removes the most error-prone part of undo support.
- The single `Dispatcher` boundary makes hard invariant 3 enforceable: nothing
  outside the dispatcher mutates the model.
- The immutable-update convention is load-bearing for both correctness (the
  shallow proxy records every change) and performance (referential identity
  powers memoized derivation). Future handlers must follow it.
- History is bounded and persistable, and gestures collapse to one undo step.

## References

- Design specification, section 7.1 (command pattern, framework-captured
  inverse, history). This ADR records the interpretation; the spec is
  authoritative.
- ADR-0001 (six-layer architecture and the `dispatch` mutation-boundary
  invariant this realizes).
- ADR-0018 (scene-graph derivation, which consumes the referential-identity
  property the immutable-update convention preserves).
- ADR-0035 (the wall-editing commands `moveWallEndpoint` and `setWallThickness`,
  the first nested edits to follow the immutable whole-floors reassignment
  convention through the shared `updateWall` helper).
  </content>
  </invoke>
