# Generalized wall-junction geometry implementation plan

> **For agentic workers:** drive this with the project red-green-blue cycle from the
> main thread (test-author RED, implementer GREEN, clean-code-reviewer + refactorer
> BLUE). Each cycle is test -> feat -> refactor. Subagents do not commit; the
> orchestrator commits on the branch `feat/wall-junction-geometry`.

**Goal:** Generalize three-dimensional wall-junction resolution beyond the two-way
corner so T-junctions, multi-way and acute junctions resolve cleanly and acute
corners stop spiking, and wind wall tops from the footprint so they never read
see-through.

**Architecture:** The pure core pass `wallFootprints` is rewritten to resolve each
junction as a fan of its incident edges sorted by angle, sharing one miter point per
wedge between angular neighbors so the walls tile the joint at any incidence. A
parallel (collinear) or over-limit (acute) wedge falls back to each wall's own
face-offset point. The engine wall prism winds its top and base caps from the
footprint's signed area instead of a fixed corner order. No model, schema,
scene-graph data, or two-dimensional plan change. See the spec and ADR-0080.

**Tech stack:** TypeScript, three.js (engine only), Vitest (Node), Playwright
(scene-webgl visual tier).

---

## File structure

- Modify `core/topology/wall-footprint.ts`: rewrite the per-end resolution
  (`endCorners`, `miterCorners`, `neighborAt`) as a per-vertex fan resolver. Keep the
  exported `WallFootprint`, `MITER_LIMIT`, and `wallFootprints(graph, thicknessByEdge)`
  signatures unchanged. Reuse `lineIntersection` from `core/geometry/segment.ts`.
- Modify `core/topology/wall-footprint.test.ts`: update the two superseded tests and
  add the new junction tests.
- Modify `engine/scene/wall-prism.ts`: wind the top and base caps from the footprint's
  signed area; skip a degenerate (near-zero-area) footprint's caps.
- Modify `engine/scene/wall-prism.test.ts` (or `engine/scene/wall-builder.test.ts`
  where the cap assertions live; check both and put the new assertions where the prism
  is unit-tested).
- Modify the scene-webgl harness fixture and baseline (refresh in the visual cycle).

## Conventions to preserve

- An edge's `+normal` is the left-hand normal of its `a -> b` direction
  (`leftNormal(a, b)`); `aPlus`/`bPlus` sit on `+normal`, `aMinus`/`bMinus` on
  `-normal`. The `+normal` long face is `interiorFace` / paint side `left`, the
  `-normal` is `exteriorFace` / paint side `right`.
- `lineIntersection(pointA, dirA, pointB, dirB)` returns the infinite-line crossing or
  null when the directions are parallel. `shift(point, dir, dist)`, `leftPerp(dir)`,
  `unit(v)`, `subtract(a, b)`, `dot(a, b)`, `leftNormal(a, b)`, `distance(a, b)` are in
  `core/geometry`. `signedArea(loop)` is in `core/scene/winding` and exported from the
  core barrel.
- `planToWorld(point, height) = { x: point.x, y: height, z: point.y }`: plan x to world
  X, plan y to world Z, height to world Y.
- The prism keeps its six sections, roles, paint refs, and `userData.entityId`. Only
  the cap winding changes.

---

### Task 1: fan-based junction resolution

**Files:** Modify `core/topology/wall-footprint.ts`,
`core/topology/wall-footprint.test.ts`.

This cycle rewrites the resolver. Incidence-two corners, free ends, collinear splits,
and mixed thickness keep their existing results (the fan reduces to ADR-0077's miter
for two edges). One existing test is superseded by the generalization and must be
updated in this cycle's RED:

- `squares ends at a junction where three or more edges meet` becomes a T-junction
  that miters (see expected corners below). The stub no longer squares at the
  through-wall centerline (`y = 0`); it miters onto the through-wall near face
  (`y = 50`).

Keep green (the fan reproduces all of these): `squares both ends of a free-standing
wall`, `miters the shared end of a right-angle corner to the inner and outer points`,
`joins walls of different thickness on each wall own face lines`, `squares a collinear
continuation where two walls run straight through`, and `squares an end where the miter
would spike past the limit`. The acute test stays green because a symmetric two-way
corner spikes on both sides together (both wedges exceed the limit), so the per-wedge
clamp squares both corners exactly as before. The per-side clamp (an acute wedge
squaring while an adjacent obtuse wedge keeps its miter) only differs at a multi-way
junction, and is exercised in Task 2.

- [ ] **Step 1: failing test** in `wall-footprint.test.ts`. Replace the
      three-or-more-edges test with a T-junction. Through-wall `(0,0) -> (2000,0)`
      thickness 100, partition `(1000,0) -> (1000,1000)` thickness 100. `buildWallGraph`
      splits the through-wall at `(1000,0)` into a left edge `(0,0)-(1000,0)` and a right
      edge `(1000,0)-(2000,0)`; the partition is the third incident edge at `(1000,0)`.
      All thicknesses 100, so `thicknessByEdge` is `100` for every edge. Find each edge
      by `wallId` and which endpoint is the shared vertex, and assert (hand-derived from
      the fan in spec 3.2, all corners on the through-wall faces `y = +/-50`):

```ts
// partition end at (1000,0) miters onto the through-wall near face y = 50:
expect(partition.aPlus).toEqual({ x: 950, y: 50 })
expect(partition.aMinus).toEqual({ x: 1050, y: 50 })
// the through-wall near face splits around the partition:
expect(throughLeft.bPlus).toEqual({ x: 950, y: 50 })
expect(throughRight.aPlus).toEqual({ x: 1050, y: 50 })
// the through-wall back face runs straight at y = -50 (collinear fallback):
expect(throughLeft.bMinus).toEqual({ x: 1000, y: -50 })
expect(throughRight.aMinus).toEqual({ x: 1000, y: -50 })
```

The graph orders the edges as: edge `through` left half `a = (0,0)`, `b = (1000,0)`;
edge `through` right half `a = (1000,0)`, `b = (2000,0)`; edge `part` `a = (1000,0)`,
`b = (1000,1000)`. So the shared vertex `(1000,0)` is the partition's `a` end, the
left half's `b` end, and the right half's `a` end (verified against `buildWallGraph`).
Keep the partition's far-end (`b`, the free end at `(1000,1000)`) square at
`(950,1000)` / `(1050,1000)`.

- [ ] **Step 2:** run, expect FAIL (incidence != 2 currently squares both corners).

Run: `pnpm exec vitest run core/topology/wall-footprint.test.ts`

- [ ] **Step 3: implement** the fan resolver in `wall-footprint.ts`. Replace
      `endCorners`/`miterCorners`/`neighborAt` with a per-vertex pass. Algorithm:

```
wallFootprints(graph, thicknessByEdge):
  // Start every edge square at both ends (the free-end default).
  result = graph.edges.map((edge, i) => squareFootprint(edge, vertices, thicknessByEdge[i]))
  incidence = vertexIncidence(graph)               // Map<vertexIndex, edgeIndex[]> (exists)
  for [vertexIndex, edgeIndexes] of incidence:
    resolveVertex(graph, vertexIndex, edgeIndexes, thicknessByEdge, result)
  return result

squareFootprint(edge, vertices, thickness):
  a = vertices[edge.a]; b = vertices[edge.b]; n = leftNormal(a, b); h = thickness / 2
  return { aPlus: shift(a, n, h), aMinus: shift(a, n, -h),
           bPlus: shift(b, n, h), bMinus: shift(b, n, -h) }

resolveVertex(graph, V, edgeIndexes, thickness, result):
  if edgeIndexes.length < 2: return                // free end keeps the square default
  Vpt = graph.vertices[V]
  spokes = edgeIndexes.map(ei => {
     edge = graph.edges[ei]; atA = edge.a === V
     far = graph.vertices[atA ? edge.b : edge.a]
     out = unit(subtract(far, Vpt))
     return { ei, atA, out, half: thickness[ei] / 2,
              normal: leftNormal(graph.vertices[edge.a], graph.vertices[edge.b]) }
  })
  sort spokes by atan2(out.y, out.x) ascending
  for i in 0..spokes.length-1:
     s = spokes[i]; t = spokes[(i + 1) % spokes.length]      // t is s's CCW neighbor
     // s's face on its +leftPerp(out) side; t's face on its -leftPerp(out) side.
     aS = shift(Vpt, leftPerp(s.out), s.half)
     aT = shift(Vpt, leftPerp(t.out), -t.half)
     miter = lineIntersection(aS, s.out, aT, t.out)
     shared = miter !== null && distance(Vpt, miter) <= MITER_LIMIT * Math.min(s.half, t.half)
     assignCorner(result, s, leftPerp(s.out),  shared ? miter : aS)
     assignCorner(result, t, neg(leftPerp(t.out)), shared ? miter : aT)

assignCorner(result, spoke, sideDir, point):
  isPlus = dot(sideDir, spoke.normal) > 0
  fp = result[spoke.ei]
  if spoke.atA:  isPlus ? fp.aPlus = point : fp.aMinus = point
  else:          isPlus ? fp.bPlus = point : fp.bMinus = point
```

Notes: `neg(v) = { x: -v.x, y: -v.y }`. For two incident edges the loop runs the two
wedges (`i=0` and the wrap `i=1`), reproducing ADR-0077's left/right miter, so the
preserved tests stay green. A parallel/collinear wedge (`miter === null`) and an
over-limit wedge both fall back to each wall's own offset point (`aS`, `aT`); for a
collinear continuation `aS` and `aT` coincide, so the face runs straight. The per-
wedge fallback is the per-side clamp the acute test now expects.

- [ ] **Step 4:** run, expect PASS, and the whole `wall-footprint.test.ts` green.

Run: `pnpm exec vitest run core/topology/wall-footprint.test.ts`

- [ ] **Step 5: commit** the cycle: `test:` (RED), `feat:` (GREEN), `refactor:` (BLUE).
      BLUE: extract the spoke build and the wedge loop into named helpers so each stays
      under 40 lines, keep the file under 300 lines, and keep `MITER_LIMIT` the only
      magic number.

---

### Task 2: multi-way and acute bay produce simple footprints

**Files:** Modify `core/topology/wall-footprint.test.ts` (and `wall-footprint.ts` only
if the assertion fails).

The fan resolves any incidence, so this is most likely a characterization test that
passes on arrival. Commit it as `test:` (the rgb:audit allows an unconsumed RED; a
`test:` is not flagged as a GREEN without a RED). If it fails, run a full
test -> feat -> refactor cycle.

- [ ] **Step 1: add the test.** Build an acute bay: a vertex where three or more walls
      meet with at least one acute wedge (for example, from `(0,0)`, walls to
      `(1000,100)`, to `(1000,0)`, and to `(1000,-100)`, all thickness 100, so the upper
      and lower wedges are acute). Assert, for every edge's footprint, that the quad is
      simple (does not self-intersect): the two long sides `aPlus->bPlus` and
      `aMinus->bMinus` do not cross, and the two ends `aPlus->aMinus` and
      `bPlus->bMinus` do not cross. Use `segmentIntersection` (returns null when two
      segments do not cross):

```ts
const fp = footprints[i]
expect(segmentIntersection(fp.aPlus, fp.bPlus, fp.aMinus, fp.bMinus)).toBeNull()
expect(segmentIntersection(fp.aPlus, fp.aMinus, fp.bPlus, fp.bMinus)).toBeNull()
```

      Also assert that adjacent walls sharing an under-limit wedge meet at the same
      point (pick one shared corner pair and assert equality), and that an over-limit
      acute wedge clamps each wall to its own offset (the two walls' corners on that
      wedge differ).

- [ ] **Step 2:** run.

Run: `pnpm exec vitest run core/topology/wall-footprint.test.ts`

- [ ] **Step 3:** if it passed, commit as `test:` and skip to Task 3. If it failed,
      fix the resolver minimally (`feat:`), rerun to PASS, then `refactor:` BLUE.

---

### Task 3: wind wall caps from the footprint

**Files:** Modify `engine/scene/wall-prism.ts`, and the prism cap unit test (check
`engine/scene/wall-prism.test.ts` and `engine/scene/wall-builder.test.ts`; add the
assertions where `buildWallPrism` is unit-tested).

The top and base caps are wound from a fixed corner order today
(`capQuad([aMinus, aPlus, bPlus, bMinus], height)` and the reverse for the base),
which only faces the right way for a rectangle. Wind them from the footprint instead.

- [ ] **Step 1: failing test.** Build a prism from a footprint whose perimeter
      `[aPlus, bPlus, bMinus, aMinus]` winds the opposite way from a plain wall's (for
      example a mitered corner footprint, or a footprint with the plus/minus corners
      swapped), and assert the top cap's triangle normal points `+Y` and the base
      cap's points `-Y`. Read the cap section positions via the geometry assertions
      helper (`readPositions` / `materialGroups`) and compute the normal of the first
      cap triangle. Keep a plain square wall in the same test to pin the regression (its
      top normal stays `+Y`). Add a degenerate case: a footprint whose four corners are
      within an epsilon of one point yields no top or base cap section.

```ts
// top cap triangle normal, from the first three vertices of the 'top' group:
const n = triangleNormal(topPositions[0], topPositions[1], topPositions[2])
expect(n.y).toBeGreaterThan(0.99) // faces +Y regardless of footprint winding
```

- [ ] **Step 2:** run, expect FAIL (fixed order flips the normal for the swapped
      footprint).

Run: `pnpm exec vitest run engine/scene/wall-prism.test.ts`

- [ ] **Step 3: implement.** In `prismSections`/`capQuad`, compute the footprint
      perimeter loop `[aPlus, bPlus, bMinus, aMinus]` and its `signedArea`. Choose the
      cap corner order from the sign so the top cap's world normal is `+Y` and the base
      `-Y` (with `planToWorld` mapping plan y to world Z, the top cap faces `+Y` when the
      plan loop is wound clockwise; verify against the existing square wall's normal and
      flip the order if needed). When `Math.abs(signedArea(loop)) < AREA_EPSILON`,
      contribute no top or base section (the `sections` array simply omits them; the
      material map is per-section, so a shorter list is fine).

```ts
const AREA_EPSILON = 1e-6 // mm^2; a footprint flatter than this draws no cap
```

- [ ] **Step 4:** run, expect PASS, and the prism/builder suites green.

Run: `pnpm exec vitest run engine/scene/wall-prism.test.ts engine/scene/wall-builder.test.ts`

- [ ] **Step 5: commit** `test:` / `feat:` / `refactor:`. BLUE: factor the orientation
      choice into one helper shared by the top and base caps.

---

### Task 4: visual tier baseline refresh

**Files:** the scene-webgl harness fixture and baseline.

- [ ] **Step 1:** extend the shell harness fixture with a T-junction (a partition
      teeing into one of the room walls) and an acute bay (three short walls meeting at
      an angle), so the render exercises the new joints and the caps over them.
- [ ] **Step 2:** rebuild, then run the `scene-webgl` Playwright project. Confirm by eye
      that the T-junction and bay read as one solid with clean corners and opaque tops,
      and that the existing room corners and door wall are unchanged.

Run: `pnpm build && pnpm exec playwright test --project=scene-webgl`

- [ ] **Step 3:** refresh the committed baseline with `--update-snapshots` and commit as
      `test(e2e):` (audit-exempt; not a cycle RED).

---

## Gate before PR

Re-fetch `origin/main` and rebase before the final gate (a parallel session may advance
main). Then:

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit
&& pnpm build`, then `pnpm rgb:audit` over `origin/main..HEAD` (each cycle
test -> feat -> refactor), then the full chromium + scene-webgl e2e after a rebuild with
port 4173 killed.

Then PR (body links the spec, ADR-0080, issue #167, and the deferred bevel issue #180),
wait for CI, merge with `--merge`, move issue #167 to Merged on board #3 (no roadmap-flip
PR), and re-detach the worktree at `origin/main`.

## Self-review notes

- Spec coverage: fan resolution and the T-junction (Task 1, spec 3.1/3.2), multi-way
  and acute bay without self-intersection (Task 2, spec 3.2/4), per-side acute clamp
  (Task 1, spec 3.2), cap winding from signed area and the degenerate guard (Task 3,
  spec 3.4), opening walls untouched (no change needed; the opening path is not
  modified, spec 3.5), visual baseline with a T-junction and acute bay (Task 4, spec 4).
- Type consistency: `WallFootprint` fields `aPlus/aMinus/bPlus/bMinus`,
  `wallFootprints(graph, thicknessByEdge)`, `MITER_LIMIT`, `lineIntersection`,
  `signedArea`, `buildWallPrism(node, footprint, materials)` used as defined.
- Superseded tests: Task 1 updates the one ADR-0077 test the generalization changes
  (three-or-more-edges, now a mitered T-junction) and lists the five that stay green
  (including the acute spike fallback, unchanged because a symmetric two-way corner
  spikes on both sides together). The test-author owns these edits; the implementer
  never touches tests.
- No placeholders: every cycle carries the behavior, the algorithm or formula, the run
  command, and the commit shape. The "confirm a/b orientation before pinning" notes are
  for the test-author to read off `buildWallGraph`, not deferred implementation.
