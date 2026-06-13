---
slug: decisions/ADR-0071-select-mode-hover-preview
title: 'ADR-0071: Select-mode hover preview of the hit-test pick'
type: decision
tags:
  [architecture, editor, two-dimensional, interaction, selection, hover, hit-test, feedback, canvas]
related:
  [
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
    decisions/ADR-0020-selection-state-outside-undo,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-select-mode-hover-preview.md,
    docs/plans/2026-06-13-select-mode-hover-preview.md,
    editor/plan/hover-target.ts,
    editor/plan/draw-plan.ts,
    editor/plan/use-plan-hover.ts,
    editor/plan/plan-view.tsx,
    e2e/tests/select-hover-preview.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0071: Select-mode hover preview of the hit-test pick

## Status

Accepted. Second story in the edit-feedback cluster raised from owner feedback
(issues #116 through #120), on top of the default-interaction work
([[ADR-0070-two-dimensional-pan-and-default-interaction]]), which already
forward-referenced this slice.

## Context

The Select tool resolves a click through `hitTest`, which returns the single
entity a click would pick: openings first, then walls, then dimensions, then the
room containing the point. That ranking is deliberate but invisible. Until the
click lands, nothing on the canvas tells the user which entity their cursor is
over, so a pointer near a wall that runs along a room boundary gives no hint
whether the wall or the room is about to be selected.

The owner asked for a hover highlight that previews that pick before the click.
The pick logic exists; what is missing is the feedback layer over it.

## Decision

### The hover highlight renders on the canvas

The selection highlight already draws on the plan canvas through `drawPlan`,
keyed off `selectedIds`. The hover highlight is the same kind of cue on the same
entities, so it renders the same way: `drawPlan` gains a single `hoveredId`
option and each entity layer draws a hover style when its id matches. Putting it
on the canvas reuses the existing world-to-screen projection and keeps the hover
and selection cues visually consistent. The accessibility overlay is a separate
concern and stays untouched; hover is a pointer-only affordance with no keyboard
analog.

### A pure resolver wraps the hit test

A small pure function, `hoverTarget(graph, point, tolerance, selectedIds)`,
returns the id to highlight. It runs the existing `hitTest` and then drops the
result when the pick is already selected, because the selection style already
marks that entity and a second cue on top would only clutter it. The resolver
adds no new hit-test path; it is the existing pick plus one suppression rule, and
it is unit-tested without React or a canvas.

### Hover is resting-pointer state, gated on no button down

The hovered id is transient view state, held in a thin hook and never stored or
undone, the same standing as the selection set ([[ADR-0020-selection-state-outside-undo]])
and the viewport. The hook recomputes the hover only when no pointer button is
pressed. That single rule excludes every drag (pan, marquee, selection move, and
any other-tool gesture) without the hover hook having to reach into those other
hooks' state, because a drag always holds a button down. The pointer leaving the
canvas clears the hover too.

### The cursor does not change this slice

Select mode keeps its open-hand cursor at rest. The highlight carries
what-is-under-you, and a press over a non-selected entity can still become a pan,
so flipping the cursor to a pointer there would misstate the gesture. A
cursor-aware-of-target refinement is left for later.

## Consequences

The user now sees the exact entity a click will pick, which removes the guesswork
near overlapping geometry and makes the hit-test ranking legible instead of
hidden. The cost is one extra draw option and a recompute of the pick on each
resting move; both are cheap, and the gating on no-button-down keeps hover work
off the hot path during drags. Because the hovered id is view-only, the change
adds no command, no migration, and nothing to undo. The hover style is defined
as a lighter cue than selection, so the two never read alike, and suppressing
hover over an already-selected entity keeps the preview to its one job: showing
what a click would newly select. The cursor-adjacent readout the same cluster
calls for (#118) builds on this hover state rather than replacing it.
