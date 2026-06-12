---
slug: decisions/ADR-0054-smart-angle-snap
title: 'ADR-0054: Smart angle snap locks the drawn direction to 45-degree increments'
type: decision
tags: [editor, plan, snapping, wall-drawing, canvas, accessibility, testability]
related:
  [
    decisions/ADR-0033-drawing-snap-model,
    decisions/ADR-0053-along-wall-and-intersection-snaps,
    decisions/ADR-0043-dom-overlay-and-accessibility,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-11-smart-angle-snap.md,
    editor/plan/snap.ts,
    editor/plan/use-plan-interaction.ts,
    editor/plan/plan-overlay.tsx,
    editor/plan/overlay-announce.ts,
  ]
status: current
updated: 2026-06-11
---

# ADR-0054: Smart angle snap locks the drawn direction to 45-degree increments

## Status

Accepted. This extends ADR-0033 (the drawing-snap model) and sits beside ADR-0053
(the along-wall and intersection kinds). The makeover specification already mandates
the behavior in its "Wall drawing and editing" section ("smart angle snapping is the
default"), so no `docs/specs/` change is needed. It lands in the smart-angle-snap slice
on a branch off `main`. ADR-0053 ships on a separate branch off the same `main`, so the
two snap extensions reconcile when both merge; the priority note below records how the
angle kind slots into the chain ADR-0053 leaves.

## Context

ADR-0033 gave wall drawing a pure `snap.ts` that resolves the moving cursor to the best
nearby feature through a fixed-priority chain (endpoint, midpoint, perpendicular,
parallel, grid), and it deferred absolute angle snaps. The makeover finishes that
deferral. Period work is mostly square, with the occasional angled bay or addition, so a
drawn wall should square up to the world axes and to nearby walls by default while
staying easy to free for the odd angle.

The chain already carries the in-progress segment start as `context.origin`, which the
perpendicular and parallel kinds read, so the inputs an angle lock needs are present.
What is missing is a kind that constrains the drawn direction rather than pulling toward
a single feature point, a way to release that constraint, and a readout of the live
length and bearing so the user can see what the lock chose.

## Decision

### A pure `angle` kind constrains the drawn direction

`editor/plan/snap.ts` gains an `angle` kind, computed from `origin`, the cursor, and the
walls alone and unit-tested in plain Node like the others. It builds a set of candidate
ray directions and projects the cursor onto the one nearest the current origin-to-cursor
bearing:

- World directions: every 45 degrees from the world axes (0, 45, 90, and so on).
- Wall-relative directions: every 45 degrees measured from the nearest wall's direction,
  so a new run can square up to an angled bay. The nearest wall is the one whose midpoint
  is closest to the cursor, the same reference the perpendicular and parallel kinds use.
  Its `referenceId` is that wall; a world-relative lock carries no reference.

With no walls present the world directions still apply, so drawing squares up from an
empty plan. A zero-length segment (the cursor sitting on the origin) has no bearing and
yields no angle candidate.

### Default on, with a held modifier to free the angle

The lock is on by default. `SnapContext` gains a `freeAngle` flag; while it is set the
angle kind returns no candidate and the chain behaves exactly as it did before this
slice. The interaction layer tracks a held modifier (Alt, which is Option on a Mac) as a
transient input state, the way additive selection tracks Shift, rather than as a command
in the registry. Pressing or releasing the modifier re-resolves at the last cursor
position so the ghost updates without a pointer move.

### Priority placement

The angle kind sits in the directional tier, above the perpendicular, parallel, and grid
kinds and below the feature kinds (endpoint and midpoint, and the edge and intersection
kinds ADR-0053 adds). Landing on real geometry is a stronger intent than holding an
angle, so a feature within tolerance still wins and the user can end a wall exactly on an
existing corner at any angle. Because the default lock returns a candidate whenever a
segment is being drawn, the perpendicular, parallel, and grid kinds below it act as the
free-mode fallback: holding the modifier drops the chain through to them, which is the
prior behavior. The angle lock generalizes the perpendicular and parallel kinds (their
lines are the wall-relative 90 and 0 cases), so the precision panel slice will reconcile
the overlap when it exposes a toggle per kind.

### The lock stays observable

A near-cursor chip in the plan overlay shows the live length in adaptive units and the
bearing in degrees, computed from the in-progress segment by a small pure formatter. When
the angle kind is engaged the overlay's polite live region announces "Locked to N
degrees" rather than the generic "Snapped to angle", which serves screen-reader users and
gives the journey a deterministic signal, the same approach ADR-0053 took for its kinds.

## Consequences

- By default a drawn wall squares to the nearest 45 degrees off the world axes or a
  nearby wall, which suits period plans and removes the need to nudge a near-square wall
  into line by hand.
- The perpendicular and parallel kinds no longer fire in the default mode, since the
  angle lock above them always resolves while drawing. They remain reachable in free mode
  and stay in the chain until the precision panel governs the kinds explicitly.
- The candidate scan is linear in the wall count per resolve (one nearest-wall pass), in
  line with the existing kinds; the tolerance gate and the single reference keep it cheap.
- The wall-tool state machine and the `PlanDrawingContext` seam do not change. The
  indicator paints `snap.point` whatever the kind, and the overlay gains the chip and the
  announcement branch.
- This slice and the ADR-0053 slice both extend `snap.ts` off the same `main`. The
  `SnapKind` union and the resolve chain are the shared edit; the priority order above
  places the angle kind unambiguously relative to both the existing and the ADR-0053
  kinds, so the merge is a union of disjoint additions.

## Alternatives considered

- **Engage the lock only within an angular tolerance of a 45-degree line.** Rejected: a
  tolerance gate would need no free modifier, yet the specification calls for one, which
  reads as an always-on lock that the user releases deliberately. The always-on lock is
  also the more predictable behavior for squaring up a plan.
- **Replace the perpendicular and parallel kinds outright.** Rejected for this slice: the
  precision panel owns per-kind toggles, so removing kinds now would pre-empt that slice's
  model. Leaving them as the free-mode fallback is the smaller, reversible change.
- **Carry the locked angle on the `SnapResult`.** Rejected: the bearing is derived from
  the in-progress segment where the readout already has the origin and the snapped point,
  so the result stays the existing point, kind, and reference triple.
- **Snap to finer increments (15 or 30 degrees).** Rejected: 45 degrees covers the square
  and diagonal cases period work needs; finer increments belong to the precision panel if
  a user wants them.

## References

- ADR-0033 (the drawing-snap model this extends, and the deferred absolute angle snap it
  named).
- ADR-0053 (the along-wall and intersection kinds extending the same chain).
- ADR-0043 (the DOM overlay and the live region the readout and announcement reuse).
- Design specification: the makeover spec's "Wall drawing and editing" section, and the
  original design sections 6.2 and 6.6.
- Implementation plan: `docs/plans/2026-06-11-smart-angle-snap.md`.
