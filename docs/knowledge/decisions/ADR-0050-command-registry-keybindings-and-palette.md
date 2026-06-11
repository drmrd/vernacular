---
slug: decisions/ADR-0050-command-registry-keybindings-and-palette
title: 'ADR-0050: A single command registry behind keybindings, a palette, and controls'
type: decision
tags:
  [
    editor,
    commands,
    keybindings,
    command-palette,
    undo-redo,
    delete,
    interaction,
    accessibility,
    wiring,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0049-integration-acceptance-gate,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-11-command-palette-and-keybindings.md,
    editor/commands/command.ts,
    editor/commands/editor-commands.ts,
    editor/commands/keybinding.ts,
    editor/commands/use-keybindings.ts,
    editor/commands/command-bar.tsx,
    editor/commands/command-palette.tsx,
    editor/commands/command-context.tsx,
    editor/shell/editor-shell.tsx,
    bridge/session/editor-session.ts,
    e2e/tests/journeys/undo-redo.spec.ts,
    e2e/tests/journeys/delete-selection.spec.ts,
  ]
status: current
updated: 2026-06-11
---

# ADR-0050: A single command registry behind keybindings, a palette, and controls

## Status

Accepted. The third slice of the editor experience makeover
(`docs/specs/2026-06-10-editor-experience-makeover.md`) adds the interaction layer
the assembled editor lacked: a command model that the keybinding layer, the command
palette, and the toolbar controls all read from, wired through the existing dispatch
boundary. It makes undo, redo, delete, and deselect reachable and flips the
`undo-redo` and `delete-selection` capabilities to `required` under the
integration-acceptance gate (ADR-0049).

## Context

The domain already owned undo and redo history (the `core` `Dispatcher`) and a
`deleteEntities` command, and the bridge `EditorSession` surfaced `undo`/`redo`.
None of it was reachable: the shell had no keybindings, no undo/redo controls, no
delete affordance, and no command palette. Worse, `createEditorSession` never
registered the transform command handlers, so a `deleteEntities` dispatch would have
thrown in the assembled application even though every unit test passed. This is the
built-but-unwired failure mode ADR-0049 exists to catch.

The makeover spec calls for a single registry that the tool-rail buttons, the
keybinding layer, and the command palette all read, so that no action can exist as a
keybinding without also being discoverable in the palette, and the reverse.

## Decision

Add an `editor/commands/` module with a plain command model and three readers over
one source of truth.

1. The model. An `EditorCommand` carries an `id`, a `label`, a list of keybinding
   strings, an `isEnabled(context)` predicate, and a `run(context)` function. A
   `CommandContext` injects the live editor stores (the session, the selection, the
   derived scene graph, the active floor id, and a palette opener). `run` routes all
   model changes through `context.session.dispatch(command)`; only ephemeral UI state
   (the selection) is touched directly. `createEditorCommands()` returns the concrete
   set: undo, redo, delete-selection, deselect, and open-command-palette.

2. The keybinding layer. `keybinding.ts` parses a platform-neutral chord ("Mod+Z",
   where Mod is Cmd on mac and Ctrl elsewhere) into a normalized keystroke and matches
   it against a keyboard event. `use-keybindings.ts` attaches one window listener,
   ignores keystrokes typed into form fields, and runs the first enabled command whose
   binding matches.

3. The surfaces. A command bar renders undo, redo, and a palette opener as controls
   whose enabled state and effect come straight from the commands. A command palette
   (opened with the platform command-search chord) lists the enabled commands, filters
   by label, and runs one on Enter or click. Both read the same `createEditorCommands()`
   set, so the registry is the single spine.

The bridge `EditorSession` gains `canUndo()`/`canRedo()` (delegating to the
dispatcher) so controls and predicates can reflect availability, and
`createEditorSession` now registers the transform handlers it had omitted.

## Consequences

- Undo, redo, delete, and deselect are reachable by keyboard, by control, and by
  palette, proven by two journey tests over the assembled application. The gate now
  enforces three required capabilities.
- The `CommandContext` is a deliberate interface seam. Later slices (the view-mode
  keys, the floor commands, the snapping toggles) add commands to the same registry
  rather than wiring bespoke handlers, so they inherit a keybinding and a palette
  entry for free.
- The palette contains its own keystrokes (it stops propagation on the keys it
  handles) so closing it with Escape does not also fire the global deselect command,
  and its search input is labeled for assistive technology.
- The keybinding layer reads platform from `navigator`, so it is inert under jsdom
  (Mod resolves to Ctrl), which keeps the unit tests deterministic and lets the
  journeys press the platform-appropriate modifier.
