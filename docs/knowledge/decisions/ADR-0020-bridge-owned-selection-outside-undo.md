---
slug: decisions/ADR-0020-bridge-owned-selection-outside-undo
title: 'ADR-0020: Bridge-owned selection state, outside the undo history'
type: decision
tags: [architecture, bridge, selection, react-context, use-sync-external-store, undo]
related:
  [
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    bridge/selection/selection-store.ts,
    bridge/react/selection-context.ts,
    bridge/react/selection-provider.tsx,
    bridge/index.ts,
    app/app.tsx,
    editor/plan/plan-view.tsx,
  ]
status: current
updated: 2026-06-03
---

# ADR-0020: Bridge-owned selection state, outside the undo history

## Status

Accepted. The selection store and its React context are implemented in
`bridge/selection/` and `bridge/react/`, and consumed by the 2D plan view and
the inspector. The design specification (sections 6.5, 6.9, and 7.1) is
authoritative; this ADR records the implementation interpretation. It resolves
the selection question that ADR-0019 deferred when there was nothing selectable.

## Context

The design specification is explicit about where selection lives and how it
relates to the command history:

- Selection state is shared across views and lives in `bridge/` (section 6.5).
- Selection is shared across views and persisted with autosave (section 6.9).
- "Selection is NOT in undo history. Selection state lives in `bridge/`,
  persists with autosave separately" (section 7.1).

The first selectable entity (walls) arrives with the wall-drawing path, so
selection now needs a concrete home. Two questions had to be settled: where the
state lives relative to the command/undo machinery, and how React components
observe it without tearing.

ADR-0019 made the editor session the single dispatch boundary and deliberately
deferred selection, noting it "arrives with the first selectable entity, at
which point the session is the natural place to hold it alongside the
dispatcher." On building it out, selection landed as a sibling store in
`bridge/` rather than inside the session, because it is deliberately not part of
the model and must not be entangled with dispatch, undo, or redo.

## Decision

### Selection is a bridge store, not a command

`createSelectionStore()` (`bridge/selection/selection-store.ts`) is a small
observable store with no dependency on the editor session, the dispatcher, or
`core/`. Its surface is `getSelectedIds()`, `isSelected(id)`, `select(id)`,
`clear()`, and `subscribe(listener)`. Mutating the selection never goes through
`dispatch`, so it produces no undo entry, which is exactly the section 7.1
requirement. The store and the session are independent siblings under `bridge/`;
neither imports the other.

### Immutable `ReadonlySet` snapshots for tear-free reads

The store holds the current selection as a `ReadonlySet<string>` and replaces it
wholesale on every change (`select` installs `new Set([id])`, `clear` reinstalls
a frozen shared empty set). It never mutates the live set in place. This gives
each change a fresh, stable reference and lets the store short-circuit notify
when the next set is reference-identical to the current one.

That immutable-reference discipline is what makes the store a correct
`useSyncExternalStore` source. `useSelectionIds()`
(`bridge/react/selection-context.ts`) passes `store.subscribe` and
`store.getSelectedIds` straight to `useSyncExternalStore`: because the getter
returns a stable reference between changes, React does not see a new snapshot on
every render and does not tear. A single frozen `EMPTY_SELECTION` constant backs
both the initial state and every `clear()`, so the empty case also has a stable
identity. This mirrors the version-memoized `getSceneGraph()` snapshot the
session exposes (ADR-0019): both bridge observables earn the right to be
`useSyncExternalStore` sources by returning referentially stable snapshots.

### A two-file React context, like the session context

The context follows the same split ADR-0019 established for the session context,
to satisfy `react-refresh/only-export-components`:

- `bridge/react/selection-context.ts` owns the `SelectionContext` object, the
  `useSelection()` hook (throws outside a provider), and the `useSelectionIds()`
  snapshot hook.
- `bridge/react/selection-provider.tsx` owns the `SelectionProvider` component.

`app/app.tsx` creates one selection store per editor workspace (memoized for the
session's lifetime) and wraps the tree in `SelectionProvider` inside
`EditorSessionProvider`, so the session and the selection are provided
side-by-side rather than nested in a parent/child data relationship. The plan
view reads the store imperatively through `useSelection()` to mutate it on
clicks and subscribes to ids through `useSelectionIds()` to redraw highlights
(ADR-0021).

## Consequences

- Selecting or deselecting a wall never appears in undo/redo, satisfying the
  section 7.1 invariant by construction: the path simply does not touch the
  dispatcher.
- Because the store is a plain bridge observable independent of the model,
  selection survives across the 2D and (future) 3D views that share the one
  store instance, matching the "shared across views" requirement.
- Single-select only was implemented first (`select` replaces rather than adds),
  but the `ReadonlySet` surface was already multi-select-shaped. Group selection
  later landed exactly as predicted (ADR-0032): `toggle` and `setSelection` grew
  the store's surface for additive shift-click and marquee replacement without
  changing its contract, its immutable-replacement discipline, or its consumers.
- Selection is not yet wired into autosave snapshots. Section 6.9 calls for
  selection to persist with autosave "separately"; that persistence is deferred
  until there is a multi-entity selection worth restoring, and it will attach to
  the autosave path (ADR-0003) rather than to the command history.

## Alternatives considered

- **Hold selection inside the editor session.** ADR-0019 anticipated this. It was
  rejected because the session is the dispatch boundary, and co-locating
  selection there invites accidental coupling to dispatch, undo, and the derived
  scene graph. A separate store keeps the "selection is not a command" invariant
  visible in the type system.
- **Model selection as a command on the project.** This would put selection in
  the undo history, directly violating section 7.1, and would force selection
  changes through the inverse-capture machinery for no benefit.
- **A mutable selection set with change events.** Mutating a `Set` in place would
  break the `useSyncExternalStore` snapshot contract (the getter would return the
  same reference after a content change) and risk tearing. Immutable replacement
  is the cheaper and correct choice.

## References

- Design specification, sections 6.5 (2D/3D sync, selection shared in `bridge/`),
  6.9 (selection, hit testing), and 7.1 (selection is not in undo history).
- ADR-0019 (the editor session and the bridge dispatch boundary that this
  selection store sits beside, and whose deferred selection note this resolves).
- ADR-0005 (the command/undo machinery that selection deliberately stays out of).
- ADR-0021 (the 2D plan path that drives and reads this store).
- ADR-0032 (the broad-then-narrow hit test and the marquee that grew this store's
  surface with `toggle` and `setSelection` for additive multi-select, still
  outside undo).
- ADR-0035 (wall editing reads this store to find the single selected wall to
  edit; the edits dispatch undoable commands while selection itself stays out of
  undo).
  </content>
  </invoke>
