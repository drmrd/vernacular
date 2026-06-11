---
slug: decisions/ADR-0053-along-wall-and-intersection-snaps
title: 'ADR-0053: On-edge and wall-line intersection snaps extend the drawing-snap model'
type: decision
tags: [editor, plan, snapping, wall-drawing, canvas, accessibility, testability]
related: [decisions/ADR-0033-drawing-snap-model, decisions/ADR-0049-integration-acceptance-gate]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-11-snap-along-wall.md,
    editor/plan/snap.ts,
    editor/plan/overlay-announce.ts,
    e2e/tests/journeys/snap-along-wall.spec.ts,
  ]
status: current
updated: 2026-06-11
---

# ADR-0053: On-edge and wall-line intersection snaps extend the drawing-snap model

## Status

Accepted. This extends ADR-0033 (the drawing-snap model), which shipped five snap
kinds and deferred the along-wall kinds. The makeover specification already mandates
the behavior in its "Wall drawing and editing" section, so no `docs/specs/` change is
needed. It lands in the snap-along-wall slice on this branch.

## Context

ADR-0033 gave wall drawing a pure `snap.ts` that resolves the moving cursor to the
best nearby feature through a fixed-priority chain (endpoint, midpoint, perpendicular,
parallel, grid), with a world tolerance derived from a fixed pixel tolerance. That
record deferred wall-line intersections, the on-wall nearest point, absolute angle
snaps, and per-kind toggles to later work.

The makeover finishes the along-wall kinds. A user squaring up a plan needs to land a
new wall's endpoint on an existing wall, and on the corner where two wall lines meet.
Smart angle snapping and the opt-in precision panel stay separate slices, so the
default chain here remains a fixed curated order rather than a configurable set.

## Decision

### Two new kinds in the pure resolver

`editor/plan/snap.ts` gains two kinds, both still computed from `Point` and
`WallSceneNode` alone and unit-tested in plain Node like the existing five:

- `edge`: the nearest point along a wall segment. The cursor projects onto the
  segment and clamps to its ends; the nearest such point across all walls is a
  candidate when it lies within tolerance. Its `referenceId` is the wall.
- `intersection`: the crossing of two wall lines. Each segment extends to an infinite
  line, and the crossing is a candidate when it lies within tolerance of the cursor.
  A near-parallel pair (a near-zero denominator) yields no candidate.

The point-onto-segment projection and the line-line intersection math live inside
`snap.ts`, consistent with ADR-0033's choice to keep snap projection local rather than
in `core/geometry`.

### Priority placement

The fixed-order chain becomes: endpoint, intersection, midpoint, edge, perpendicular,
parallel, grid. The two specific junctions (endpoint and intersection) outrank the
named midpoint. The generic on-edge nearest point sits below the midpoint but above
the perpendicular and parallel construction lines, because landing on a wall is a
stronger intent than landing on a construction line. The grid stays the
always-available fallback. Ties within one kind still break by nearest candidate, and
the chain stays a flat sequence of early returns, as ADR-0033 set out.

### The engaged snap stays observable

The plan overlay's live region already announces the engaged snap as
`Snapped to <kind>`. The two new kinds read as "Snapped to edge" and "Snapped to
intersection". This serves screen-reader users and gives the journey a deterministic
signal, so the snap-along-wall journey asserts the announcement instead of computing a
snapped length.

## Consequences

- When a real wall feature (endpoint, intersection, midpoint, or edge) and a
  construction line are both in range, the resolver now prefers the wall feature,
  which matches how a user draws toward existing geometry.
- The intersection scan is quadratic in the wall count per resolve. Walls per floor
  are few and the tolerance gate discards distant crossings, so this is acceptable; a
  spatial index can replace the pair scan if wall counts grow.
- The wall-tool state machine, the viewport, and the `PlanDrawingContext` seam do not
  change. The indicator paints `snap.point` whatever the kind, and the `SnapContext`
  already carries the walls.
- Smart angle snapping, absolute orthogonal snaps, and the per-kind precision toggles
  remain deferred to later makeover slices, so the curated chain stays fixed for now.

## Alternatives considered

- **Intersect only where segments physically cross.** Rejected: the specification
  asks for wall-line intersections so a user can snap to the projected corner where
  two walls would meet, which is the junction that helps square up a plan.
- **Rank the on-edge point above the midpoint.** Rejected: the midpoint is a specific
  point on the edge, so when the cursor is near it the more specific kind should win.
- **Resolve by nearest distance rather than fixed priority.** Rejected for ADR-0033's
  reason: a nearer grid point or construction line should not beat the wall feature
  the user is aiming for.

## References

- ADR-0033 (the drawing-snap model this extends, and the deferred kinds it named).
- Design specification: the makeover spec's "Wall drawing and editing" section, and
  the original design sections 6.2 and 6.6.
- ADR-0049 (the integration-acceptance gate; the snap-along-wall journey flips to
  required).
- Implementation plan: `docs/plans/2026-06-11-snap-along-wall.md`.
