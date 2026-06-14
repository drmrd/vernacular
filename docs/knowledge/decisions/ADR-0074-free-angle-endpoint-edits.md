---
slug: decisions/ADR-0074-free-angle-endpoint-edits
title: 'ADR-0074: Free-angle modifier for wall endpoint edits'
type: decision
tags: [architecture, editor, two-dimensional, interaction, wall, endpoint, snap, angle, modifier]
related:
  [
    decisions/ADR-0054-smart-angle-snap,
    decisions/ADR-0072-live-drag-readouts,
    decisions/ADR-0073-opening-resize-handles,
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-free-angle-endpoint-edits.md,
    docs/plans/2026-06-13-free-angle-endpoint-edits.md,
    editor/plan/use-held-alt-key.ts,
    editor/plan/use-wall-editing.ts,
    editor/plan/use-plan-interaction.ts,
    editor/plan/use-snapping.ts,
    editor/plan/snap.ts,
    e2e/tests/journeys/free-angle-endpoint.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0074: Free-angle modifier for wall endpoint edits

## Status

Accepted. Fifth and final story in the edit-feedback cluster raised from owner
feedback (issues #116 through #120), after the default-interaction work
([[ADR-0070-two-dimensional-pan-and-default-interaction]]), the Select-mode hover
preview ([[ADR-0071-select-mode-hover-preview]]), the cursor-adjacent live drag
readouts ([[ADR-0072-live-drag-readouts]]), and the opening resize handles
([[ADR-0073-opening-resize-handles]]).

## Context

The smart angle snap ([[ADR-0054-smart-angle-snap]]) squares a drawn wall to the
nearest right or forty-five degree ray, and a held Alt (Option) modifier suspends
that lock so a wall can take a free angle. The plumbing is small and already in
place. The pure `angleSnap` step in `snap.ts` returns no candidate when the snap
context carries a `freeAngle` flag, so the cursor falls through to the lower
snaps or to its raw position. The wall tool tracks Alt with `useFreeAngleModifier`
while the draw-wall tool is active, threads the flag through `useSnapping` into the
snap context, and re-resolves the rubber-band ghost when the key toggles so the
preview updates without a pointer move.

Editing an existing wall reshapes the same geometry. `use-wall-editing.ts` grabs a
selected wall's endpoint, drags it, previews the reshaped wall, and dispatches an
undoable `moveWallEndpoint` on release. It resolves the dragged point through the
same `useSnapping`, so the angle lock applies, but it never passes `freeAngle`,
so there is no way to suspend the lock while editing. Drawing has the escape hatch
and editing does not, for two gestures that change the same thing.

The decision is how to give endpoint editing the same modifier without two copies
of the key tracking drifting apart, and how much of the drawing modifier's feel to
carry over.

## Decision

### Reuse the angle-lock flag, not a new mechanism

Endpoint editing threads the same `freeAngle` flag into its existing `useSnapping`
call. The flag already gates exactly the angle lock in the pure `angleSnap` and
nothing else, so a freed endpoint still snaps to the grid, to other endpoints, and
to the rest of the chain, identically to a freed drawn wall. No new flag, no new
snap behavior, and no change to the snap resolver are introduced. A separate
editing-only key (for example Ctrl) was rejected: the two gestures reshape the same
geometry and a power user should not learn a second key for the second one.

### One shared key tracker

The Alt-held state is tracked by a single hook, `useHeldAltKey(active)`, that
attaches keydown and keyup listeners while `active` and reports whether Alt is
down. The wall tool's `useFreeAngleModifier` becomes a thin call to it with
`active = tool is draw-wall`, and endpoint editing calls it with `active = a wall
is selected`, which already implies the Select tool. Folding the duplicated
listener effect into one hook keeps the drawing and editing modifiers from
drifting apart and is the change the clean-code pass asks for. Lifting the flag up
to the plan view and threading it into both hooks was rejected as a wider refactor
with no benefit over a shared tracker each hook calls for itself.

### Carry the preview re-resolve, not the announcement

Endpoint editing re-resolves its live preview when Alt toggles, without a pointer
move, the way the wall tool re-resolves its ghost. The committed edit already
honors the current modifier because the release resolves the point afresh; the
re-resolve is what makes the preview, and the length-and-bearing readout that reads
from it ([[ADR-0072-live-drag-readouts]]), settle onto the free angle in place when
the user presses the key after positioning the endpoint. Carrying it is what makes
editing feel the same as drawing rather than half-wired.

The wall tool's spoken "Locked to N degrees" announcement is not carried to
endpoint editing in this slice. Endpoint editing has never announced its angle
state, and adding angle-lock announcements to it is a separate accessibility
improvement with its own scope; it is recorded as a follow-up rather than bundled
here.

### No model or command change

The modifier changes only which point the drag resolves to. The endpoint move
still dispatches the existing `moveWallEndpoint` with the resolved point and lands
as one undoable step. Nothing new is stored and there is no migration.

## Consequences

Reshaping a wall gains the free-angle escape hatch drawing has, on the same key and
with the same live preview, so a user nudges an endpoint to an off-square angle
without fighting the lock or typing coordinates.
The cost is one small shared hook and a re-resolve effect in the coverage-excluded
editing glue; the snap resolver, the angle-lock flag, the command, and the readout
are all reused unchanged. Because the wall tool and endpoint editing now track the
key through one hook, the two modifiers stay in step. Spoken angle-lock feedback
during an endpoint edit, and routing the freed endpoint through any future snap
refinements, are left as recorded follow-ups. This closes the edit-feedback cluster
(#116 through #120).
