---
slug: decisions/ADR-0115-keyboard-plan-authoring
title: 'ADR-0115: Keyboard authoring path for plan drawing'
type: decision
tags: [editor, 2d-plan, accessibility, a11y, wcag, keyboard, authoring, input, commands]
related:
  [
    decisions/ADR-0112-minimum-interactive-target-sizes,
    decisions/ADR-0113-component-local-contrast-guards,
    decisions/ADR-0114-responsive-strategy-below-1024,
  ]
sourceFiles:
  [
    editor/plan/keyboard-candidate.ts,
    editor/plan/use-plan-authoring.ts,
    editor/plan/authoring-tool-handlers.ts,
    editor/plan/plan-view.tsx,
    editor/plan/plan-overlay.tsx,
  ]
status: current
updated: 2026-06-20
---

# ADR-0115: Keyboard authoring path for plan drawing

## Status

Accepted, landed. A keyboard user can now author every plan element, not only edit what already
exists. With a creative tool active, arrow keys move a candidate point by a grid step and Enter drops
geometry there, dispatching the same commands a pointer click dispatches. This is the input sibling
to the target-size pass in ADR-0112, the contrast pass in ADR-0113, and the responsive-layout pass in
ADR-0114, and it closes the last large accessibility gap in the alpha-hardening family.

## Context

Selection and editing were already keyboard accessible. The overlay listbox proxies expose each
entity as a focusable option, a roving tabindex walks them, and the arrow-key nudge, copy, cut,
paste, delete, and the inspector inputs all work from the keyboard. So an existing plan could be
navigated and changed without a pointer.

Authoring was the gap. The four creative tools each exposed only pointer handlers. The wall tool
advanced and finished from pointer clicks, the dimension tool dropped its two points on pointer down,
the opening tool placed on a pointer hit against a wall, and furniture dropped at the cursor when an
item was armed. The interaction layer surfaced `onPointerDown`, `onPointerMove`, and `onDoubleClick`,
with no key handler that started or committed a vertex. The existing wall keyboard handler only
finished or cancelled a run that a pointer had already begun. A keyboard, switch, or voice user could
press Enter to finish a wall they had no way to start.

The reason the gap existed is that the point a click would commit lived only in pointer-move state.
Each tool tracked the cursor as the user moved the mouse, and that cursor was the candidate the next
click consumed. Without a pointer move there was no candidate, so there was nothing for Enter to drop.

This is a WCAG 2.1.1 (Keyboard, Level A) failure on the application's core task. Authoring geometry is
the primary creative function, and it was operable only with a pointer, so it capped the editor's
accessibility grade regardless of the chrome fixes around it.

## Decision

Add a keyboard authoring path that mirrors the pointer path through the same commands. A new
`use-plan-authoring` hook is the keyboard sibling of the four pointer hooks. It owns a candidate point
seeded at the origin, gates a window keydown listener on the active creative tool, ignores keys while
a form control holds focus, and is inert under the select, pan, and calibrate tools.

### Move a candidate point with the arrow keys

A small pure module, `keyboard-candidate.ts`, moves the candidate one grid step per arrow key and
returns null for any other key, using the same step the selection nudge uses so authoring and editing
share one motion granularity. The candidate is the keyboard equivalent of the pointer cursor: it is
the point Enter will commit, and the plan overlay paints it as a marker while a creative tool is
active.

### Drop geometry on Enter through the existing commands

On Enter, each tool branch runs the existing pure transition and dispatches whatever command it
returns. The wall branch calls `advanceWallTool` and dispatches its `addWall` command, a second Enter
on the same candidate ends the run, and Escape cancels it. The dimension branch calls
`advanceDimensionTool` across two Enters. The opening branch projects the candidate onto the nearest
wall with `placeOpeningTarget` and dispatches `placeOpening` on a hit. The furniture branch builds an
instance with `createFurnitureInstance` and dispatches `placeFurniture` when an item is armed. Every
branch dispatches the identical command the pointer path dispatches, so undo, serialization, and
snapping stay single-sourced and the two input modes can never diverge.

### Announce each step through the existing live region

Each step writes the shared `plan-overlay__live` region. The authoring announcement takes priority
over the snap and selection text while a run is in progress, so a screen-reader user hears "Wall
vertex dropped" or the measured span rather than "snapped to grid". No second live region is added,
because two polite regions interrupt each other.

### Keep the authoring run self-owned rather than shared with the pointer path

The keyboard hook owns its own wall and dimension tool state instead of sharing one run with the
pointer interaction hook. WCAG 2.1.1 asks that a keyboard user be able to author a complete plan, and
self-owned state delivers that in full. Sharing one run between input modes would only add the ability
to begin a wall with the mouse and finish it with the keyboard mid-run, which is a refinement, not a
requirement, and it would have meant lifting state out of the proven, end-to-end-tested pointer hook.
Leaving that hook untouched removed the largest regression risk in the change. The cost is that a run
begun by pointer and a run begun by keyboard are separate runs.

## Consequences

- A keyboard user can author walls, dimensions, openings, and furniture, with each step announced.
  The end-to-end path is covered by a browser test that drives Enter and the arrow keys and asserts a
  wall lands and the live region updates.
- The keyboard and pointer paths converge on one set of commands. There is no parallel keyboard
  command, no schema change, and no new core code. The hook is a thin wire over the pure transitions
  the pointer path already used.
- The candidate marker never renders at rest. It appears only while a creative tool is active, and
  the home screenshot is the select tool idle, so the visual-regression baseline held with no refresh.
- Three refinements are deliberately deferred. The candidate seeds at the origin rather than the
  viewport center, so a keyboard user may need to nudge it into view on a panned canvas. Mixed-input
  runs are not shared, per the decision above. Furniture authoring drops an already-armed item, so it
  is fully keyboard-operable only once arming a library item is itself reachable from the keyboard;
  that arming path is the natural follow-up before furniture closes end to end.
- The hook stays small by keeping the per-tool handlers in a sibling module, `authoring-tool-handlers`,
  so the hook file reads as state plus a routing switch and each tool adds one case.
- A second window keydown listener under the wall tool exposed a latent fragility in the pointer wall
  tool. Its keyboard listener re-subscribed on every render, so a sibling listener that updated state
  inside a keystroke could re-add it mid-dispatch, and the DOM drops a listener re-added during
  dispatch, which silently swallowed the pointer Escape and Enter. The pointer wall keyboard listener
  now subscribes once per tool and reads its handlers through a ref, so it stays controllable no
  matter what else listens on the window.

## References

- ADR-0112, ADR-0113, ADR-0114 (the sibling accessibility passes in the same alpha-hardening family).
- WCAG 2.1.1 Keyboard (Level A): all functionality operable through a keyboard interface.
