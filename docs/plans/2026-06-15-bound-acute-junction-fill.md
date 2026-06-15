# Plan: bound the junction fill at a near-parallel wedge (#190)

Spec: `docs/specs/2026-06-15-bound-acute-junction-fill.md`
ADR: `ADR-0085-bound-junction-fill-near-parallel-wedge`
Branch: `feat/bound-acute-junction-fill` (off origin/main 6eb73f4f, worktree `~/workspace/vernacular.wt/bound-acute-junction-fill`)

## Design summary

Pure, local change in `core/topology/junction-fill.ts`. The cap-crossing step (`capCrossing`)
keeps its line intersection, but when the crossing lands far from the corners it bridges
(the near-parallel runaway), it falls back to the bounded midpoint the exactly-parallel
case already uses.

```
function capCrossing(a, b): Point {
  const fallback = midpoint(a.ccwCorner, b.cwCorner)
  const crossing = lineIntersection(a.ccwCorner, subtract(a.cwCorner, a.ccwCorner),
                                     b.ccwCorner, subtract(b.cwCorner, b.ccwCorner))
  if (crossing === null) return fallback
  const span = distance(a.ccwCorner, b.cwCorner)               // the wedge's bounding-corner span
  if (distance(crossing, fallback) > span * MAX_CROSSING_SPANS) return fallback
  return crossing
}
```

- `MAX_CROSSING_SPANS` is a named module const chosen so the near-parallel runaway is
  clamped while clean miters, tees, and acute bays (which cross within a small multiple
  of the span) keep their exact corners. The existing junction-fill tests pin those, so
  the value must keep them all green.
- `distance(p, q)` = `Math.hypot(q.x - p.x, q.y - p.y)`; reuse a core geometry helper if one
  exists (check `core/geometry/vector.ts`), else a small local helper.
- Everything else (the spokes, the fan order, `wallCap`, `cornerOf`, the incidence rule,
  the prism, the fill builder) is unchanged.

## Cycle (test -> feat -> refactor; commit from main thread)

1. **Bound the near-parallel crossing.** RED (test-author, `core/topology/junction-fill.test.ts`):
   build a three-way junction where two angularly-adjacent walls are nearly collinear (a
   near-zero or near-straight wedge), so the unclamped cap-line crossing lands far from the
   vertex. Assert every corner of that junction's fill polygon lies within a small bound of
   the junction vertex (no spike) -- e.g. within a few wall thicknesses, comfortably below
   the runaway distance. (Optionally also assert a clean multi-way junction keeps a corner
   at its shared miter, but the existing tests already pin the clean cases.) GREEN
   (implementer, `core/topology/junction-fill.ts`): add the runaway bound to `capCrossing`,
   choosing `MAX_CROSSING_SPANS` so the new test passes and every existing junction-fill
   test stays green. BLUE.

## Gate (run in the worktree)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit --range origin/main..HEAD` clean.
- e2e: chromium + scene-webgl (after a fresh build, killing any stale 4173). The junction
  scene baseline is expected to be UNCHANGED (its wedges already cross near the vertex), so
  do not refresh it; if it changes, stop and investigate. Touches no shell -> do not refresh
  the home darwin baseline (pre-existing drift).
- Real commit times.

## Subagent file scope (state exactly; STOP rather than edit shared config)

- Cycle 1: test in `core/topology/junction-fill.test.ts`; impl in `core/topology/junction-fill.ts`. No edits to config or other files.
