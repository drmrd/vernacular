---
slug: decisions/ADR-0186-performance-gated-on-counts-and-reported-as-times
title: 'ADR-0186: Performance is gated on counts of work and reported as times'
type: decision
tags: [performance, testing, ci, plan-rendering, three-dimensional, baseline]
related:
  [
    decisions/ADR-0088-three-dimensional-incremental-scene-updates,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0177-open-transactions-for-changes-in-progress,
    decisions/ADR-0016-lighthouse-stryker-fixtures,
  ]
sourceFiles:
  [
    editor/plan/draw-plan.ts,
    editor/plan/draw-plan-test-fixtures.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/floor-build.ts,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-11-15
---

# ADR-0186: Performance is gated on counts of work and reported as times

## Status

Current. The owner chose on 2026-11-14 that CI gates on counts and that times are reported, not
gated. The owner approved the rest the same day, with section 5.6 of
`docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, and chose their development machine
for the first baseline of times. The count tests and the timing command arrive with #684.

## Context

Section 6.10 of the design specification budgets 8 ms for the scene update and 8 ms for the render
on a project of a stated size. It names a profiling harness in `engine/profiling/`, and section 9.3
names a benchmark harness in the same place. Neither exists, and nothing measures the budgets.

The architecture refactor round changes the code that runs on every pointer move. Without a
baseline, a stage cannot show that it did not make editing slower.

A time measured in CI depends on the runner and varies between runs. A check that fails at random
is soon ignored or switched off. A harness in `engine/` could not measure the plan in any case,
because the plan is drawn in `editor/`.

## Decision

- One deterministic generator builds a reference project that meets section 6.10: 4 floors, 200
  furniture instances, 50 openings and stairs, and paint on surfaces.
- CI gates on two counts for that project, compared for exact equality with a committed baseline:
  the drawing-context calls of one plan redraw per floor, and the 3D groups rebuilt by each edit in
  a fixed list.
- A pull request that changes a count updates the baseline and says why. That holds for a lower
  count too.
- One local command measures plan redraw time, 3D scene update time, and 3D render time in a real
  browser. It prints them beside a committed baseline with a description of both machines. It never
  fails on a time, and no CI job runs it.
- A baseline comes from a machine with a hardware GPU. The command refuses to write one from a
  software renderer.
- The counts are defined by what can be observed, not by function names, so the tests move with the
  code when a later stage replaces it.

## Consequences

- The gate cannot fail at random, because the counts are the same on every machine.
- A count does not prove a time. A change can keep every count and still be slower. The reported
  times cover that, and they depend on a person running the command on `main` and on the branch on
  one machine.
- A deliberate change to drawing has one more file to update.
- Sections 6.10 and 9.3 of the design specification point to this mechanism in place of
  `engine/profiling/`.
- The counts show today's behavior as it is. An edit to one wall rebuilds every wall on its floor,
  and a paint edit rebuilds the groups of every floor (4 wall groups, 40 rooms, 44 openings, and
  200 furniture groups on the reference project), because the paint reference belongs to the
  project. Every edit except a rename rebuilds all four floor wrapper groups. The gate records three
  numbers for each edit and kind: rebuilt, removed, and added. Later stages can lower those numbers
  on purpose.

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.6.
- `docs/specs/2026-06-01-vernacular-design.md`, sections 6.10 and 9.3.
- Issues #684 and #502.
