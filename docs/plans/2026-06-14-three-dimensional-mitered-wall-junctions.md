# Three-dimensional mitered wall junctions implementation plan

> **For agentic workers:** drive this with the project red-green-blue cycle from the
> main thread (test-author RED, implementer GREEN, clean-code-reviewer + refactorer
> BLUE). Each cycle is test -> feat -> refactor. Subagents do not commit; the
> orchestrator commits on the branch `feat/three-dimensional-mitered-wall-junctions`.

**Goal:** Miter the ends of walls that meet two at a time at a shared corner in the
three-dimensional preview, so corners read as one clean solid instead of square
boxes that overlap inside and leave an outer notch.

**Architecture:** A pure core pass over the floor's wall graph produces, per edge, a
plan-space footprint with square or mitered ends. The engine wall builder extrudes
the footprint into a prism (same faces, roles, paint refs, entity id as the box).
Two-way corners miter; free ends, multi-way junctions, collinear splits, opening
walls, and over-limit acute corners keep square ends. No model, schema, scene-graph
data, or two-dimensional plan change. See the spec and ADR-0077 for rationale.

**Tech stack:** TypeScript, three.js (engine only), Vitest (Node), Playwright
(scene-webgl visual tier).

---

## File structure

- Create `core/topology/wall-footprint.ts`: `WallFootprint`, `MITER_LIMIT`,
  `wallFootprints(graph, thicknessByEdge)`. Pure plan geometry over the graph.
- Create `core/topology/wall-footprint.test.ts`.
- Modify `core/geometry/segment.ts`: add `lineIntersection(pointA, dirA, pointB, dirB)`.
- Modify `core/geometry/segment.test.ts`.
- Modify `core/index.ts`: export `lineIntersection`, `WallFootprint`, `MITER_LIMIT`,
  `wallFootprints`.
- Modify `engine/scene/wall-builder.ts`: replace the box path with a footprint-prism
  builder; `buildWalls` computes footprints and routes plain edges to it; opening
  edges unchanged.
- Modify `engine/scene/wall-builder.test.ts`.
- Modify the scene-webgl harness baseline (refresh in the visual cycle).

## Conventions to preserve (from `engine/scene/wall-builder.ts`)

- A wall edge's normal is the left-hand normal of its direction: for endpoints
  `a -> b`, `dir = unit(b - a)`, `n = (-dir.y, dir.x)`. The `+n` side is the
  interior face (`interiorFace` role, paint side `left`); the `-n` side is the
  exterior face (`exteriorFace` role, paint side `right`).
- Place every vertex through `planToWorld(plan, v)` where `v` is the height (`0` at
  base, `wallHeight(node)` at top). Plan x -> world X, plan y -> world Z, height ->
  world Y.
- The mesh carries `userData.entityId = node.id`. The long-face paint refs are
  `{ kind: 'wall-face', wallId, side: 'left' | 'right' }`; end caps, top, base carry
  no ref.

---

### Task 1: `lineIntersection` infinite-line crossing

**Files:** Modify `core/geometry/segment.ts`, `core/geometry/segment.test.ts`,
`core/index.ts`.

- [ ] **Step 1: failing test** in `segment.test.ts`:

```ts
describe('lineIntersection', () => {
  it('crosses two non-parallel infinite lines beyond their anchor points', () => {
    // x-axis line through origin, and a vertical line through (5, 0) pointing up.
    const hit = lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -3 }, { x: 0, y: 1 })
    expect(hit).toEqual({ x: 5, y: 0 })
  })

  it('returns null for parallel lines', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 0 }),
    ).toBeNull()
  })

  it('returns null for collinear lines', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }, { x: 2, y: 0 }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2:** run, expect FAIL (not exported).
- [ ] **Step 3: implement** in `segment.ts`:

```ts
/**
 * Intersection point of the two infinite lines through `pointA` with direction
 * `dirA` and through `pointB` with direction `dirB`, or null when the directions
 * are parallel (or the lines are collinear). Unlike {@link segmentIntersection}
 * this does not clamp to a segment; the miter builder needs the crossing of two
 * offset face lines that may lie beyond either wall's span.
 */
// eslint-disable-next-line max-params -- two point/direction pairs is the conventional line-line form
export function lineIntersection(
  pointA: Point,
  dirA: Point,
  pointB: Point,
  dirB: Point,
): Point | null {
  const denominator = dirA.x * dirB.y - dirA.y * dirB.x
  if (Math.abs(denominator) < PARALLEL_EPSILON) return null
  const t = ((pointB.x - pointA.x) * dirB.y - (pointB.y - pointA.y) * dirB.x) / denominator
  return { x: pointA.x + t * dirA.x, y: pointA.y + t * dirA.y }
}
```

Export from `core/index.ts` (alongside `segmentIntersection`).

- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5: commit** `test:` (RED) then `feat:` (GREEN) then `refactor:` (BLUE marker).

---

### Task 2: free-standing wall footprint (square ends)

**Files:** Create `core/topology/wall-footprint.ts`, `core/topology/wall-footprint.test.ts`;
export from `core/index.ts`.

Behavior: a single wall has both ends free (one incident edge each), so its
footprint is the centerline endpoints offset to each side by half thickness.

- [ ] **Step 1: failing test**:

```ts
// A 1000mm horizontal wall, thickness 200, from (0,0) to (1000,0).
// n = leftPerp(unit(b-a)) = (0, 1). +n corner = endpoint + 100*n; -n = endpoint - 100*n.
it('squares both ends of a free-standing wall', () => {
  const graph = buildWallGraph([
    { id: 'w', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 200 },
  ])
  const [footprint] = wallFootprints(graph, [200])
  expect(footprint).toEqual({
    aPlus: { x: 0, y: 100 },
    aMinus: { x: 0, y: -100 },
    bPlus: { x: 1000, y: 100 },
    bMinus: { x: 1000, y: -100 },
  })
})
```

- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3: implement** the module skeleton plus the square path:

```ts
export interface WallFootprint {
  aPlus: Point // +normal side at endpoint a
  aMinus: Point // -normal side at endpoint a
  bPlus: Point // +normal side at endpoint b
  bMinus: Point // -normal side at endpoint b
}

/** Miter falls back to a square cap past this multiple of the wall half-thickness. */
export const MITER_LIMIT = 4

export function wallFootprints(graph: PlanarGraph, thicknessByEdge: number[]): WallFootprint[] {
  const incidence = vertexIncidence(graph) // Map<vertexIndex, edgeIndex[]>
  return graph.edges.map((edge, index) =>
    footprintForEdge(graph, index, thicknessByEdge, incidence),
  )
}
```

Helpers: `vertexIncidence` builds `Map<number, number[]>` from `graph.edges`
(`edge.a` and `edge.b` each push the edge index). `footprintForEdge` reads `a`,
`b`, `t = thicknessByEdge[index]`, computes `dir`, `n`, and the two ends. Each end
classifies via incidence count (Task 4); for now both ends are square:
`endpoint + (t/2)*n`, `endpoint - (t/2)*n`.

- [ ] **Step 4:** run, expect PASS. **Step 5:** commit RED/GREEN/BLUE.

---

### Task 3: two-way right-angle corner miters

**Files:** Modify `wall-footprint.ts`, `wall-footprint.test.ts`.

Behavior: two walls meeting at a right angle share a vertex with exactly two
incident edges; the shared end miters to the outer and inner corner points.

- [ ] **Step 1: failing test** (the L from the spec, equal thickness 100):

```ts
it('miters the shared end of a right-angle corner to the outer and inner points', () => {
  // A: (0,0)->(1000,0); B: (1000,0)->(1000,1000); both thickness 100.
  const walls = [
    { id: 'a', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
    { id: 'b', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
  ]
  const graph = buildWallGraph(walls)
  const footprints = wallFootprints(
    graph,
    graph.edges.map((e) => (e.wallId === 'a' ? 100 : 100)),
  )
  const a = footprints[graph.edges.findIndex((e) => e.wallId === 'a')]
  // A's b-end is the shared corner (1000,0). n_A = (0,1): +n is top (y=+50), -n is bottom (y=-50).
  // Outer corner of the L is bottom-outer (1050,-50) on the -n side; inner is top-inner (950,50) on +n.
  expect(a.bPlus).toEqual({ x: 950, y: 50 }) // +n (interior/top) -> inner miter
  expect(a.bMinus).toEqual({ x: 1050, y: -50 }) // -n (exterior/bottom) -> outer miter
})
```

(Confirm the exact expected corners by hand from the formula before committing the
RED; the assertion encodes the directed-polyline result derived in spec section 3.2.)

- [ ] **Step 2:** run, expect FAIL (currently squares to `{1000,50}` / `{1000,-50}`).
- [ ] **Step 3: implement** the miter path inside `footprintForEdge`'s per-end logic:

```ts
// For end at vertex V of THIS edge, when incidence[V].length === 2:
// neighbor = the other edge index; nbrFar = neighbor's other endpoint.
// thisFar = this edge's other endpoint.
// dOut = unit(thisFar - V); dIn = unit(V - nbrFar).
// tHalf = t/2; nbrHalf = thicknessByEdge[neighbor]/2.
// leftLine:  point V + tHalf * leftPerp(dOut), dir dOut
//            crossed with point V + nbrHalf * leftPerp(dIn), dir dIn  -> leftMiter
// rightLine: point V - tHalf * leftPerp(dOut), dir dOut
//            crossed with point V - nbrHalf * leftPerp(dIn), dir dIn  -> rightMiter
// leftPerp(d) = { x: -d.y, y: d.x }.
// Map polyline left/right to this edge's +n/-n via sign(dot(leftPerp(dOut), n)):
//   if dot > 0: cornerPlus = leftMiter, cornerMinus = rightMiter
//   else:       cornerPlus = rightMiter, cornerMinus = leftMiter
// (At the a-end leftPerp(dOut) == n so dot>0; at the b-end it == -n so dot<0.)
// If either lineIntersection is null -> square fallback for this end.
```

`leftPerp(dOut)` equals `n` at the a-end and `-n` at the b-end, so the dot is `+1`
or `-1` and the mapping is exact.

- [ ] **Step 4:** run, expect PASS. Re-run the Task 2 free-wall test (still square,
      both ends have one incident edge). **Step 5:** commit RED/GREEN/BLUE.

---

### Task 4: mixed-thickness corner and the deferred junctions stay square

**Files:** Modify `wall-footprint.ts`, `wall-footprint.test.ts`.

Two behaviors, one cycle each (split if the reviewer prefers):

**4a mixed thickness:** a 200-thick wall meeting a 100-thick wall at a right angle.
Each wall's miter lands on its own face lines. Assert the shared corners sit on the
expected offset lines (the thick wall's faces at +/-100, the thin wall's at +/-50).

```ts
it('joins walls of different thickness on each wall own face lines', () => {
  // A: (0,0)->(1000,0) thickness 200; B: (1000,0)->(1000,1000) thickness 100.
  // A's -n outer corner x stays on B's outer face line x = 1000 + 50 = 1050;
  // A's -n corner y stays on A's outer face line y = -100.
  // Expected A.bMinus = { x: 1050, y: -100 }; A.bPlus = { x: 950, y: 100 }.
})
```

(Derive and pin the exact values from the formula before the RED.)

**4b multi-way + collinear stay square:** a T-junction (three incident edges at the
tee vertex) and a straight wall split into two collinear edges both keep square
ends at the shared vertex.

```ts
it('squares ends at a junction with three or more incident edges', () => {
  // through-wall (0,0)->(2000,0) plus a stub (1000,0)->(1000,1000): buildWallGraph
  // splits the through wall at (1000,0), so that vertex has 3 incident edges.
  // The stub end and both through halves keep square corners at (1000,0).
})
```

- [ ] Each: failing test -> run FAIL -> implement (incidence-count guard already
      routes `!== 2` to square; collinear is the null-intersection square fallback) ->
      run PASS -> commit RED/GREEN/BLUE.

---

### Task 5: acute corner past the miter limit falls back to square

**Files:** Modify `wall-footprint.ts`, `wall-footprint.test.ts`.

- [ ] **Step 1: failing test:** two walls meeting at a very acute angle (well under
      30 degrees included) keep square ends because the miter would exceed
      `MITER_LIMIT * (t/2)` from the vertex.

```ts
it('falls back to a square end when the miter exceeds the limit', () => {
  // A nearly back-to-back pair: directions ~10 degrees apart. The miter point would
  // sit far out (> MITER_LIMIT half-thicknesses); assert the shared end is square.
})
```

- [ ] **Step 2:** FAIL (miter spike). **Step 3:** add the limit check: after
      computing `leftMiter`/`rightMiter`, if `distance(V, miter) > MITER_LIMIT * (t/2)`
      for either, use the square corners for that end. **Step 4:** PASS. **Step 5:**
      commit RED/GREEN/BLUE.

---

### Task 6: extrude a footprint into a prism (engine)

**Files:** Modify `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.

Replace the `THREE.BoxGeometry` path with `buildWallPrism(node, footprint, materials)`
that builds the six sections from the footprint. Reuse `geometry-utils`
(`thicknessSpanningQuad`, `COMPONENTS_PER_VERTEX`) and the section/material-group
machinery (`geometryFromSections`).

- [ ] **Step 1: failing test:** a free-standing wall (square footprint) extrudes to
      the same dimensions and face roles as the box did. Assert: six material groups in
      order interiorFace, exteriorFace, exteriorFace (end caps as one or two groups -
      match the chosen section layout), top, base; bounding box equals
      `length x height x thickness`; `mesh.userData.entityId === node.id`; the two long
      faces carry the `left` / `right` paint refs via the provider.

(Carry over the existing `buildWallMesh` dimension/winding assertions, adapted to the
prism. The winding characterization test that pinned top=+Y and opposite long faces
moves onto the prism's computed normals.)

- [ ] **Step 2:** FAIL. **Step 3: implement** `buildWallPrism`. Sections, each a flat
      position array of two triangles per quad via `thicknessSpanningQuad`:

```
// plan corners: aPlus,aMinus,bPlus,bMinus ; world(corner, v) = planToWorld(corner, v)
// +n long face (interiorFace, ref left):   [ (aPlus,0),(bPlus,0),(bPlus,h),(aPlus,h) ]
// -n long face (exteriorFace, ref right):  [ (bMinus,0),(aMinus,0),(aMinus,h),(bMinus,h) ]
// a-end cap (exteriorFace, no ref):        [ (aMinus,0),(aPlus,0),(aPlus,h),(aMinus,h) ]
// b-end cap (exteriorFace, no ref):        [ (bPlus,0),(bMinus,0),(bMinus,h),(bPlus,h) ]
// top (top):   footprint at v=h wound to face +Y
// base (base): footprint at v=0 wound to face -Y
```

Get each winding so `computeVertexNormals` points the face outward; verify against
the Node normal assertions and flip corner order where a normal points inward.
Keep the long-face roles/refs identical to `longFaceRefAt` so paint is unchanged.

- [ ] **Step 4:** PASS (and the existing wall-builder suite green). **Step 5:**
      commit RED/GREEN/BLUE.

---

### Task 7: wire `buildWalls` to footprints

**Files:** Modify `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.

- [ ] **Step 1: failing test:** an L-room of two plain walls (no openings) builds two
      prisms whose shared-corner footprints meet at the same outer and inner points (no
      notch). Assert via the two meshes' geometry that wall A's `-n` corner column and
      wall B's corner column coincide at the outer miter point.

- [ ] **Step 2:** FAIL (boxes still). **Step 3: implement:** in `buildWalls`,
      compute `const footprints = wallFootprints(input.graph, input.graph.edges.map(
(e) => wallsByModelId.get(e.wallId)?.thickness ?? 0))`. For each edge index, if it
      has no openings, `group.add(buildWallPrism(edgeNode, footprints[index], materials))`;
      edges with openings keep `buildOpeningWallMesh` unchanged. Remove the now-unused box
      path (or keep `buildWallMesh` as a thin square-footprint wrapper if other tests need
      it; prefer removing it and updating its tests onto `buildWallPrism`).

- [ ] **Step 4:** PASS; full `wall-builder.test.ts` green. **Step 5:** commit
      RED/GREEN/BLUE.

---

### Task 8: visual tier baseline refresh (`test(e2e):`)

**Files:** the scene-webgl harness fixture/baseline.

- [ ] Rebuild, run the `scene-webgl` Playwright project against the shell fixture.
      The plain-wall corners are now mitered; refresh the committed baseline
      (`--update-snapshots`) and confirm by eye the walls draw as a solid shell with
      clean corners. Commit as `test(e2e):` (audit-exempt; not a cycle RED). Confirm the
      door wall's corners still read solid (the plain neighbor miters against it).

---

## Gate before PR

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit
&& pnpm build`, then `pnpm rgb:audit` over `origin/main..HEAD` (each cycle
test->feat->refactor), then the full chromium + scene-webgl e2e after a rebuild with
port 4173 killed. Re-fetch `origin/main` and rebase before the final gate (a parallel
session may advance main). Then docs commit (spec + ADR-0077 + this plan), PR, wait CI,
merge with `--merge`, re-detach the worktree at `origin/main`, roadmap flip PR.

## Self-review notes

- Spec coverage: line helper (T1), square footprint (T2), two-way miter (T3),
  mixed thickness + multi-way/collinear deferral (T4), miter limit (T5), prism with
  preserved roles/refs/entity id (T6), graph wiring with opening walls untouched
  (T7), visual baseline (T8). All spec sections map to a task.
- Type consistency: `WallFootprint` fields `aPlus/aMinus/bPlus/bMinus`,
  `wallFootprints(graph, thicknessByEdge)`, `MITER_LIMIT`, `lineIntersection(pointA,
dirA, pointB, dirB)`, `buildWallPrism(node, footprint, materials)` used uniformly.
- No placeholders: every cycle has the behavior, the formula, and the commit shape.
  The two "derive and pin the exact corner values before the RED" notes are for the
  test-author to compute from the stated formula, not deferred implementation.
