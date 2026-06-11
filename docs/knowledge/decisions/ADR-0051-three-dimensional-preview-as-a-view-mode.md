---
slug: decisions/ADR-0051-three-dimensional-preview-as-a-view-mode
title: 'ADR-0051: The three-dimensional preview as a view mode, and feature command sets'
type: decision
tags:
  [editor, viewport, view-mode, split-pane, commands, keybindings, three-dimensional, interaction]
related:
  [
    decisions/ADR-0050-command-registry-keybindings-and-palette,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-11-split-pane-viewport-and-view-modes.md,
    editor/viewport/view-mode.tsx,
    editor/viewport/view-mode-viewport.tsx,
    editor/commands/view-commands.ts,
    editor/shell/editor-shell.tsx,
    editor/commands/command-palette.tsx,
    e2e/tests/journeys/toggle-three-d.spec.ts,
  ]
status: current
updated: 2026-06-11
---

# ADR-0051: The three-dimensional preview as a view mode, and feature command sets

## Status

Accepted. The fourth slice of the editor experience makeover
(`docs/specs/2026-06-10-editor-experience-makeover.md`) turns the three-dimensional
preview from an always-on side panel into one of three view modes and flips the
`toggle-three-d` capability to `required` under the integration-acceptance gate
(ADR-0049). It builds directly on the command registry of ADR-0050.

## Context

The shell rendered the plan and a three-dimensional preview side by side at all
times. The makeover calls for a split-pane workspace where the plan is primary, the
preview is a collapsible pane, and view-mode keys select two-dimensional full, split,
and three-dimensional full. The interaction had to read from the single command
registry (ADR-0050) so the view modes get keybindings and palette entries like every
other action, without every feature widening the shared `CommandContext`.

Selection synchronization between the two surfaces and active-floor-aware
three-dimensional scene derivation are deliberately not part of this slice. They are
three-dimensional convergence work (the makeover spec non-goals) and per-floor
rendering (the next slice).

## Decision

1. A `ViewModeProvider` holds the current mode (`plan`, `split`, `preview`), default
   `plan`, so the editor opens on the two-dimensional plan with a visible control to
   reveal the preview. A `ViewModeViewport` renders plan-only, preview-only, or a flex
   split with a keyboard-resizable separator (reusing the design-system `usePaneResize`).

2. Feature command sets close over their own controls rather than widening the shared
   context. `createViewCommands(view)` returns three commands whose `run` calls
   `view.setMode(...)` from the closed-over controls and ignores the `CommandContext`
   argument. The shell merges them into the registry at the call sites
   (`[...createEditorCommands(), ...createViewCommands(view)]`) so they gain keybindings
   (1, 2, 3) and palette entries with no change to `CommandContext` and no ripple into
   the existing command tests.

## Consequences

- Entering the three-dimensional view is selecting a mode, by control, by key, or
  from the palette, proven by the `toggle-three-d` journey over the assembled editor.
- The close-over-controls convention is the template for later feature command sets
  (the floor switcher commands, the precision-snapping toggles): add a provider, a
  `createXxxCommands(controls)` factory, and merge it into the registry. The shared
  `CommandContext` stays lean and only carries genuinely cross-cutting state.
- The default `plan` mode means the preview region is absent on first render; tests
  and journeys assert it appears on mode change rather than on load.
