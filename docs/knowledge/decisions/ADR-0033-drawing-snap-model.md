---
slug: decisions/ADR-0033-drawing-snap-model
title: 'ADR-0033: Drawing-snap model (candidate kinds, fixed priority, world-space tolerance)'
type: decision
tags: [architecture, editor, plan, snapping, wall-drawing, canvas, testability]
related:
  [
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0031-plan-viewport-projection-pan-zoom,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-06-drawing-snapping.md,
    editor/plan/snap.ts,
    editor/plan/draw-plan.ts,
    editor/plan/plan-view.tsx,
    editor/plan/use-snapping.ts,
  ]
status: current
updated: 2026-06-06
---

# ADR-0033: Drawing-snap model (candidate kinds, fixed priority, world-space tolerance)

## Status

Accepted, landed. Wall drawing now snaps the moving cursor to the best nearby
feature (a wall endpoint, a wall midpoint, a perpendicular or parallel line
through the in-progress start, or the grid) and paints a snap indicator at the
snapped point. This is slice 4 of Phase 1 (the 2D plan editor), implementing
behavior the design specification already mandates (sections 6.2, 6.6, and the
Phase 1 plan); no `docs/specs/` change was required. It extends the plan path
ADR-0021 established and reuses that record's pure-module and Canvas-seam
conventions; this ADR records the snap model itself.

## Context

ADR-0021 established the plan path as pure, unit-tested modules behind a thin
Canvas-and-pointer glue, and named the wall-tool state machine as the template
for future 2D tools and the `PlanDrawingContext` seam as the way to test Canvas
drawing. The specification asks Phase 1 wall drawing to snap (endpoint, midpoint,
perpendicular, parallel, grid) and to show a snap indicator (sections 6.2, 6.6).

This slice was built in parallel with the selection and hit-test slice
(ADR-0032), which owned `core/geometry/polygon.ts` and the spatial index. The
sequencing constraint was a clean merge: both slices touch `draw-plan.ts` and
`plan-view.tsx`, and only one should own `core/geometry`. The design therefore
kept this slice entirely inside `editor/plan/` and additive in the two shared
files.

## Decision

### A pure `snap.ts` computes the best snap from world-space inputs

`editor/plan/snap.ts` is a pure module (it imports only `Point` and
`WallSceneNode` from `core`; no React, no Canvas, no viewport). Its surface is:

- `snapPoint(cursor, context)`: the best `SnapResult` for a freely moving
  cursor, or `null` when nothing snaps.
- The `SnapKind` union (`'endpoint' | 'midpoint' | 'perpendicular' | 'parallel'
| 'grid'`), the `SnapResult` (the snapped world point, the kind, and an
  optional `referenceId` of the wall that produced a feature snap), and the
  `SnapContext` (the walls, a `gridSpacingMm` where `<= 0` disables the grid, a
  world-space `toleranceMm`, and an optional `origin` that enables the
  perpendicular and parallel kinds).
- The `DEFAULT_SNAP_GRID_MM` and `SNAP_PIXEL_TOLERANCE` default constants.

The tolerance arrives already in world millimeters, so `snap.ts` never sees the
viewport or the screen; the controller derives the world tolerance from a fixed
pixel tolerance (below).

### Candidates resolve in a fixed priority order, not by nearest distance

When several candidates are in range, `snapPoint` returns the highest-priority
one in a fixed order: **endpoint, then midpoint, then perpendicular, then
parallel, then grid.** The function is a flat sequence of early returns in that
order rather than a distance contest, so the order is deterministic and readable
(no nested ternary). Within a single kind, ties break by nearest candidate.
Endpoint, midpoint, perpendicular, and parallel snaps fire only when their
candidate lies within `toleranceMm` of the cursor.

The grid is the always-available fallback when `gridSpacingMm > 0`: the nearest
grid intersection (each axis rounded to the nearest multiple of the spacing) is
always within half a cell of the cursor, so it is never out of range and is what
`snapPoint` returns when no feature snap applies. `snapPoint` returns `null` only
when the grid is disabled and no feature is in range.

### Perpendicular and parallel projection math stays inside `snap.ts`

The perpendicular and parallel kinds project the cursor onto the line through
`origin` whose direction is perpendicular or parallel to the nearest reference
wall, accepting the candidate only when the cursor lies within `toleranceMm` of
that line. This point-onto-line projection is the only line-projection math in
the slice, and it lives inside `snap.ts` rather than in `core/geometry/`. That
keeps this slice fully decoupled from the parallel selection slice (ADR-0032),
which owned `core/geometry/polygon.ts`, so the two could merge without colliding
in `core/`.

### The indicator extends the existing Canvas seam; the controller bridges pixels to world

`draw-plan.ts` grows `drawSnapIndicator(ctx, snap, viewport)`, which projects
`snap.point` through `worldToScreen` and paints a small marker through the
existing narrow `PlanDrawingContext` seam (ADR-0021), gated by a new optional
`snap?: SnapResult` on `DrawPlanOptions`. The indicator paints above the walls
and the live preview but beneath the ruler bands. The marker uses only seam
members already present, so the seam did not grow.

`plan-view.tsx` (and the extracted `use-snapping.ts` glue hook, the same
glue-split pattern slices 3 and 5 used) derives a world-space tolerance from the
fixed pixel tolerance and the live viewport scale (`SNAP_PIXEL_TOLERANCE /
viewport.scale`), so a single pixel tolerance becomes a generous catch when
zoomed out and a tight one when zoomed in. It builds the `SnapContext` (the
scene walls, `DEFAULT_SNAP_GRID_MM`, the derived tolerance, and the wall tool's
in-progress start as `origin` while mid-draw), snaps the cursor before feeding it
to the wall tool, and passes the `SnapResult` to `drawPlan`. The wall-tool state
machine (ADR-0021) needs no change: it still receives a plain `Point`; only the
controller knows about snapping.

## Consequences

- Snapping is a pure function unit-tested in plain Node, exactly like the rest of
  the plan geometry. The browser-only surface stays the thin glue ADR-0021
  describes, validated by the wall-drawing end-to-end spec.
- The fixed priority chain (a flat sequence of early returns) is the readable
  alternative to a weighted distance contest, and the grid-as-fallback rule keeps
  `snapPoint` total: it always returns a snap when the grid is enabled, and a
  precise `null` only when it is not and nothing else is in range.
- The pixel-to-world tolerance derivation in the controller is the reusable
  pattern for any zoom-aware catch radius: keep the threshold in pixels, divide
  by the viewport scale at the call site, and pass world units into the pure
  module. The hit-test and marquee tolerances (ADR-0032) follow the same rule.
- The `PlanDrawingContext` seam absorbed the snap indicator without growing,
  confirming again the ADR-0021 guidance that plan rendering extends the narrow
  structural interface rather than reaching for the full DOM type.
- Snapping is wall-drawing-only. Snapping while editing a wall (dragging an
  endpoint or moving a wall) is deferred to the wall-editing slice. The five
  listed kinds are the only ones; wall-line intersections, on-wall nearest-point,
  and absolute angle/orthogonal snaps are deferred, as is a per-kind enable
  toggle and a configurable threshold (the slice ships fixed default constants
  pending the editor-preferences surface). The indicator is Canvas-painted; the
  DOM-overlay snap indicator is later polish.

## Alternatives considered

- **Resolve snap candidates by nearest distance.** Rejected: distance ordering
  would let a grid intersection nearer than an endpoint win, which is not what a
  user drawing to an endpoint wants. The fixed priority chain makes the precedence
  predictable.
- **Put the line-projection math in `core/geometry`.** It is small and pure, but
  the parallel selection slice (ADR-0032) owned `core/geometry/polygon.ts` for
  this round. Keeping the projection inside `snap.ts` let the two slices merge
  cleanly; the math can move to `core/geometry` later if another consumer needs
  it.
- **Pass the cursor into the wall-tool machine and snap inside it.** Rejected: it
  would couple the pure state machine to snapping context and the viewport. The
  controller snaps the `Point` before handing it to the unchanged machine, so the
  machine stays a pure `advance`.
- **A fixed world-space snap radius.** Rejected: a fixed millimeter radius would
  feel sticky when zoomed out and unreachable when zoomed in. Deriving the radius
  from a fixed pixel tolerance and the viewport scale keeps the catch feel
  constant on screen.

## References

- Design specification, sections 6.2 (snap indicators, the DOM overlay), 6.6
  (snapping on the 2D navigation surface), and the Phase 1 plan ("wall drawing
  with snapping").
- Implementation plan: `docs/plans/2026-06-06-drawing-snapping.md`.
- ADR-0021 (the parent record for the plan path; this slice reuses its
  pure-module convention, its wall-tool state machine, and its
  `PlanDrawingContext` Canvas seam).
- ADR-0031 (the viewport projection whose scale converts the pixel snap tolerance
  to world units and whose `worldToScreen` the indicator draw uses).
- ADR-0032 (the parallel selection and hit-test slice that owned
  `core/geometry/polygon.ts`; this slice kept its line-projection math in
  `editor/plan` to merge cleanly alongside it).
- ADR-0035 (wall editing reuses this snapping for the endpoint drag, resolving the
  moving cursor with the fixed endpoint as the snap origin).
  </content>
