---
slug: decisions/ADR-0070-two-dimensional-pan-and-default-interaction
title: 'ADR-0070: Drag-to-pan is the default two-dimensional interaction'
type: decision
tags:
  [
    architecture,
    editor,
    two-dimensional,
    interaction,
    pan,
    select,
    marquee,
    default-tool,
    cursor,
    pointer,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0020-selection-state-outside-undo,
    decisions/ADR-0054-smart-angle-snap,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-two-dimensional-pan-and-default-interaction.md,
    docs/plans/2026-06-13-two-dimensional-pan-and-default-interaction.md,
    editor/tools/active-tool-context.ts,
    editor/tools/tools-panel.tsx,
    editor/plan/use-plan-selection.ts,
    editor/plan/plan-view.tsx,
    e2e/tests/canvas-pan-alignment.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0070: Drag-to-pan is the default two-dimensional interaction

## Status

Accepted. Editor-experience work on the two-dimensional plan surface, on top of the
makeover ([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]) and the slice-5
selection model ([[ADR-0020-selection-state-outside-undo]]). It is the first of the
edit-feedback cluster raised from owner feedback (issues #116 through #120).

## Context

The editor opened with the wall tool active, so the first canvas click dropped a wall
vertex. Panning the plan existed only as middle-mouse drag and spacebar-held drag, both
invisible. The result was that a new plan greeted the user with an unexpected drawing
gesture and no obvious way to just move around.

The owner asked for three things: looking around should be the default, click-drag
panning should be discoverable, and a held modifier should let someone pan without losing
an in-progress operation (drag the spacebar mid-wall, reposition, release, keep drawing).

The first two reshape what a primary-button press means when no specialized gesture
claims it. The third already works through the existing spacebar pan, so it needs pinning,
not building.

## Decision

### Select is the default tool; drawing is explicit

The editor boots with the Select tool. The wall tool is chosen deliberately. This is the
interaction-model change the issue flagged for confirmation, and the owner confirmed it.

### One state machine resolves the Select-mode primary press

A primary-button press in Select mode is ambiguous: it can become a click, a pan, or a
marquee, and the choice depends on how far the pointer travels and whether Shift is held.
Three separate hooks cannot each own a slice of one gesture without fighting over the same
pointer, so the resolution lives in one place, the select-tool pointer hook. It already
owned click-versus-marquee through a travel threshold; pan joins as the third branch.

- Below the threshold: a click (select, or clear on empty space). Unchanged.
- Past the threshold, no Shift: a pan.
- Past the threshold, Shift held: a marquee, which is where the old plain-drag marquee
  moved to.

The pan-versus-marquee choice is read once, when the drag first crosses the threshold, so
a gesture does not flip between them midway.

A press that lands on an already-selected entity begins a move of the selection. That is
decided earlier in the pointer routing and is untouched here.

### Pan reuses the pure `panBy`; it does not become a command

The select-tool drag pan applies the same pure `panBy` the viewport controls use, so
there is one pan implementation. Panning stays view state and the tool choice stays editor
state: neither is undoable and neither touches the project model
([[ADR-0020-selection-state-outside-undo]] keeps selection out of undo for the same
reason). The viewport controls keep middle-mouse and spacebar pan exactly as they were, so
the spring-loaded mid-operation pan is preserved; a regression test pins it.

### The open-hand cursor advertises the gesture

Select mode shows the open-hand cursor at rest and the closed-hand cursor while panning,
the conventional drag-the-surface affordance, and the tools panel leads with Select and
describes its gestures. A later hover-preview slice (#117) will make the resting cursor
aware of what is under it; until then the open hand is a uniform invitation to drag.

## Consequences

Opening the editor and dragging now pans, which is what most first sessions want, and the
gesture is visible through the cursor and the panel copy. Wall drawing costs one extra
click to enter, the deliberate trade for not surprising the viewer. The marquee moved onto
Shift-drag, a change existing users will need to learn once; the cursor and panel copy
carry that signal. Consolidating the press resolution in one hook keeps the three outcomes
from racing, and reusing `panBy` keeps a single source of pan math. The change is
view-and-editor-state only, so it adds no command, no migration, and nothing to undo.
