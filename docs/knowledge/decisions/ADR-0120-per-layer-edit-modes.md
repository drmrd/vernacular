---
slug: decisions/ADR-0120-per-layer-edit-modes
title: 'ADR-0120: Per-layer edit modes scope plan selection'
type: decision
tags: [editor, selection, hit-test, layers, tools, accessibility]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0043-dom-overlay-and-accessibility,
    decisions/ADR-0071-select-mode-hover-preview,
  ]
sourceFiles:
  [
    editor/plan/edit-layer-scope.ts,
    editor/tools/edit-layer-context.ts,
    editor/tools/edit-layer-provider.tsx,
    editor/tools/edit-layer-panel.tsx,
    editor/plan/plan-view.tsx,
    editor/shell/editor-shell.tsx,
    app/app.tsx,
  ]
status: current
updated: 2026-06-23
---

# ADR-0120: Per-layer edit modes scope plan selection

## Status

Accepted, landed. The tool rail carries an edit-layer selector. Picking a layer narrows pointer
selection to that layer's elements; everything else stays drawn on the canvas but stops responding to
clicks, hover, and move-drag. The default layer is "All", which leaves the editor behaving exactly as it
did before.

## Context

Everything in the plan is selectable at once, so it is easy to grab the wrong thing. You reach for a wall
and catch the door sitting in it, or you click a chair that happens to overlap the wall behind it. When
you are working on one kind of element the rest keeps getting in the way (#289).

Hiding a layer or locking individual elements would each help, but neither gives the quick "I am only
touching walls right now" focus. Hiding loses the context you are working against, and locking is a
per-element chore. A mode that scopes what is selectable keeps the whole plan in view while it gets out of
your way.

The issue proposed walls, fixtures, and decor as a starting set and left the taxonomy open. That set does
not map onto the scene graph, which has no "fixture" or "decor" node. The selectable kinds are walls,
openings, dimensions, rooms, and furniture. So the taxonomy had to be settled against what the model
actually carries rather than against the aspirational names.

Selection itself runs through a few seams. A pointer click resolves to an entity through the broad-then-
narrow hit-test (ADR-0032), the select-mode hover highlight resolves the same way (ADR-0071), and a press
on an already-selected entity begins a move-drag. All three read the scene graph the plan view hands them.
The selection set lives in the bridge, outside undo (ADR-0020).

## Decision

An edit layer is a small enum, `'all' | 'walls' | 'openings' | 'furniture' | 'annotations'`, mapped from
the issue's intent onto the real node kinds. Walls answers the "I clicked the wall" complaint, openings
(doors and windows) is the "fixture" the issue meant, furniture is its "decor", and annotations is the
dimension layer the issue flagged as a likely future mode. The "All" layer is the default and the
no-op: it leaves every kind selectable.

The furniture layer's chip reads "Decor", the issue's own word for it, rather than "Furniture". The tool
rail already has a "Furniture" button that opens the furniture library, and two buttons with the same name
doing different things would be ambiguous to a screen reader. The enum value stays `'furniture'`; only the
display label differs.

Rooms travel with walls rather than getting their own layer. A room is the region a closed wall loop
encloses, so naming a room or setting its style is structural work alongside the walls that bound it. The
walls layer keeps both walls and rooms selectable; every other specific layer empties rooms.

The mechanism is two pure functions, `scopeSceneToLayer` and `scopeFurnitureToLayer`. Given the active
layer they return a copy of the scene graph (and the furniture list) with the off-layer collections
emptied. The "All" layer returns the inputs unchanged. The plan view narrows the graph and furniture once
and hands the narrowed copies to the three selection seams, click selection, hover, and move-drag, while
the rendered graph stays whole. Emptying a collection makes its elements inert because the hit-test finds
no candidates there, and leaving the render path on the full graph keeps them visible. Visible but inert
is exactly the behavior the issue asked for, and it falls out of feeding selection a narrower graph than
the renderer sees, with no new flag threaded through the hit-test.

The layer lives in a context provider beside the active-tool provider (ADR-0001 keeps this kind of editor
state at the React seam), and the selector is a segmented control in the tool rail that mirrors the
existing tools panel.

### Rejected: gate the hit-test with a layer argument

Passing the active layer into `hitTest`, `entitiesInRect`, and the furniture pick, then skipping the
off-layer collections inside each, would work without copying the graph. It was rejected because it spreads
the layer concept across every selection function and couples those pure picks to a mode they should not
need to know about. Narrowing the graph once at the plan-view seam keeps the hit-test exactly as it was
and puts the whole scoping decision in one tested place.

### Rejected: clear the selection when the layer changes

Switching to a layer that no longer contains the current selection could clear it. It is left as-is. The
selection stays visible so you can see what you had, and it is simply no longer grabbable until you switch
back. Clearing on every layer change would lose work for the common case of glancing at another layer and
returning.

## Consequences

- The scoping covers pointer selection: click, marquee, hover highlight, and move-drag. The keyboard path
  through the accessibility proxies (ADR-0043) still reaches every entity, since those proxies are built
  from the full graph. A follow-up can narrow the proxy set to the active layer if keyboard scoping turns
  out to matter; the pointer complaint in #289 is addressed today.
- The segmented selector uses `aria-pressed` toggle buttons, matching the tools panel. For a mutually
  exclusive control a `radiogroup` would read better to a screen reader. Both panels share the pattern, so
  the right fix is one accessibility pass over both rather than letting this one diverge. Tracked as a
  follow-up.
- Furniture is scoped through its own function because selection reads the model furniture list, not the
  scene graph's furniture nodes. The two stay in step: a layer that empties one empties the other.
- Adding a layer is a one-line change to the enum and the selector's list, and the narrowing function's
  exhaustive switch makes the typechecker flag the new case until it is handled.
- The full graph still renders under every layer, so no committed visual baseline changes. The off-layer
  elements are not dimmed; a later refinement could fade them to signal inertness, which would touch the
  canvas render and its baselines.

## References

- ADR-0001 (the layer boundaries that keep the edit-layer state at the React seam).
- ADR-0020 (the bridge-owned selection store the scoped picks write into).
- ADR-0032 (the broad-then-narrow hit-test the narrowed graph feeds).
- ADR-0071 (the select-mode hover preview that reads the same narrowed graph).
- ADR-0043 (the DOM overlay proxies whose keyboard path is not yet scoped).
- Issues: #289 (per-layer edit modes).
