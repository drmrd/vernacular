# Wall-junction fill implementation plan

> **For agentic workers:** drive this with the project red-green-blue cycle from the
> main thread (test-author RED, implementer GREEN, clean-code-reviewer + refactorer
> BLUE). Each cycle is test -> feat -> refactor. Subagents do not commit; the
> orchestrator commits on the branch `feat/three-dimensional-wall-junction-fill`.

**Goal:** Fill the uncovered core of a junction where three or more walls meet, so a
T-junction's triangular core and a multi-way bay's central polygon (with the acute
wedge chamfered) read as solid, closing the gaps ADR-0080's clamp left. Two-way corners
and free ends are untouched.

**Architecture:** A new pure core pass `junctionFills(graph, thicknessByEdge)` reads the
same resolved corners ADR-0080's `wallFootprints` stops the walls at, and returns one
fill polygon per three-or-more-way junction whose core has area. A new engine builder
`buildJunctionFill` extrudes each polygon into a prism from `Y = 0` to the tallest
incident wall's height, mirroring the room slab prism, with neutral roles and no entity
id. `buildWalls` builds the fills beside the wall prisms. A new neutral `junction`
SurfaceRole carries the fill's side faces. No model, schema, scene-graph-data,
wall-prism, opening, or two-dimensional-plan change. See the spec and ADR-0082.

**Tech stack:** TypeScript, three.js (engine only), Vitest (Node), Playwright
(scene-webgl visual tier).

---

## File structure

- Add `core/topology/junction-fill.ts`: `JunctionFill` (`{ polygon: Point[]; edgeIndexes:
number[] }`) and `junctionFills(graph, thicknessByEdge): JunctionFill[]`. Calls
  `wallFootprints` for the resolved corners; derives the per-vertex CCW spoke order and
  reads each spoke's two corners to build the core polygon.
- Add `core/topology/junction-fill.test.ts`.
- Modify `core/index.ts`: export `junctionFills` and `JunctionFill`.
- Modify `engine/materials/material-provider.ts`: add `'junction'` to the `SurfaceRole`
  union (the neutral default in `role-appearance.ts` already colors it `NEUTRAL_COLOR`).
- Modify `engine/materials/neutral-material-provider.test.ts` and
  `engine/materials/paint-material-provider.test.ts`: cover the `'junction'` role.
- Add `engine/scene/junction-fill-builder.ts`: `buildJunctionFill(fill, height,
materials): THREE.Mesh`, a polygon prism from `Y = 0` to `height`, modeled on the room
  slab prism in `room-builder.ts`.
- Add `engine/scene/junction-fill-builder.test.ts`.
- Modify `engine/scene/wall-builder.ts`: compute `junctionFills` and add one fill mesh
  per fill to the group, height = max incident wall height.
- Modify `engine/scene/wall-builder.test.ts`: integration assertion.
- Refresh the `scene-junctions-webgl` baseline (visual cycle). The existing
  `JUNCTION_FIXTURE` already has a T-junction and an acute three-way bay; no fixture
  change is needed.

## Conventions to preserve

- An edge's `+normal` is `leftNormal(a, b)` of its `a -> b` direction; `aPlus`/`bPlus`
  sit on `+normal`, `aMinus`/`bMinus` on `-normal`. `wallFootprints(graph,
thicknessByEdge)` returns one footprint per edge in graph edge order.
- `planToWorld(point, height) = { x: point.x, y: height, z: point.y }`.
- `signedArea(loop)` (core barrel), `lineIntersection`, `leftPerp`, `shift`, `unit`,
  `subtract`, `dot`, `distance` (core/geometry). `MITER_LIMIT` is exported from
  `core/topology/wall-footprint.ts`.
- `wallHeight(node)` is the single read point for a wall's height.
- The room slab prism (`room-builder.ts`) is the template: caps via
  `THREE.ShapeUtils.triangulateShape`, every vertex through `planToWorld`, the top cap
  reverses the triangulation winding to face `+Y` and the base keeps it to face `-Y`,
  vertical side quads per boundary edge, one material group per section.

---

### Task 1: the junction-fill core pass

**Files:** Add `core/topology/junction-fill.ts`, `core/topology/junction-fill.test.ts`;
modify `core/index.ts`.

The pass returns one fill polygon per junction with three or more incident edges whose
core has area. It reads `wallFootprints` for the resolved corners, so the polygon's
points are exactly the corners the walls stop at.

**Worked T-junction (the RED's main case).** Through-wall `(0,0) -> (2000,0)` thickness
100, split by `buildWallGraph` at `(1000,0)` into a left edge `(0,0)-(1000,0)` and a
right edge `(1000,0)-(2000,0)`; partition `(1000,0) -> (1000,1000)` thickness 100. All
thicknesses 100. At the shared vertex `(1000,0)` the three end caps cut back to the
through-wall's shared back corner `(1000,-50)` and the partition's two front jambs
`(950,50)` and `(1050,50)`, leaving the uncovered core triangle:

```
{ (1050, 50), (950, 50), (1000, -50) }
```

These are the resolved footprint corners: `(1050,50)` is the right half's `aPlus` and
the partition's `aMinus` (the right miter), `(950,50)` is the left half's `bPlus` and
the partition's `aPlus` (the left miter), `(1000,-50)` is both through-halves' shared
back corner (the collinear fallback).

- [ ] **Step 1: failing test** in `junction-fill.test.ts`.

```ts
const graph = buildWallGraph([
  { id: 'through', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 } },
  { id: 'part', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 } },
])
const fills = junctionFills(
  graph,
  graph.edges.map(() => 100),
)

// One fill, at the T-junction only (the three free ends get none):
expect(fills).toHaveLength(1)
const [fill] = fills
// The core triangle, compared as an unordered set so winding does not matter:
expect(sortPoints(fill.polygon)).toEqual(
  sortPoints([
    { x: 1050, y: 50 },
    { x: 950, y: 50 },
    { x: 1000, y: -50 },
  ]),
)
expect(Math.abs(signedArea(fill.polygon))).toBeGreaterThan(1)
// It cites the three incident edges (the two through halves + the partition):
expect(fill.edgeIndexes).toHaveLength(3)
```

Add a free-standing wall (`junctionFills` returns `[]`) and a clean right-angle
two-way L corner (two walls sharing one vertex, `junctionFills` returns `[]`: a
two-way corner gets no fill). `sortPoints` is a local helper sorting by `x` then `y`.

- [ ] **Step 2:** run, expect FAIL (module absent).

Run: `pnpm exec vitest run core/topology/junction-fill.test.ts`

- [ ] **Step 3: implement** `junction-fill.ts`. Algorithm:

```
junctionFills(graph, thicknessByEdge):
  footprints = wallFootprints(graph, thicknessByEdge)
  fills = []
  for [vertexIndex, edgeIndexes] of vertexIncidence(graph):     // Map<vertex, edge[]>
    if edgeIndexes.length < 3: continue                          // free end + two-way: no fill
    V = graph.vertices[vertexIndex]
    spokes = edgeIndexes.map(ei => spokeAt(graph, ei, vertexIndex))
    sort spokes by atan2(out.y, out.x) ascending                 // CCW fan order
    ring = []
    for s in spokes:                                             // each spoke's near edge
      ring.push(cornerOf(footprints[s.ei], s, neg(leftPerp(s.out))))  // toward previous wedge
      ring.push(cornerOf(footprints[s.ei], s, leftPerp(s.out)))       // toward next wedge
    polygon = dedupeAdjacent(ring)                               // collapse shared miters (and wrap)
    if Math.abs(signedArea(polygon)) > AREA_EPSILON:
      fills.push({ polygon, edgeIndexes })
  return fills

spokeAt(graph, ei, V):
  edge = graph.edges[ei]; atA = edge.a === V
  far = graph.vertices[atA ? edge.b : edge.a]
  out = unit(subtract(far, graph.vertices[V]))
  normal = leftNormal(graph.vertices[edge.a], graph.vertices[edge.b])
  return { ei, atA, out, normal }

cornerOf(fp, spoke, sideDir):           // read the footprint corner on a side
  isPlus = dot(sideDir, spoke.normal) > 0
  return spoke.atA ? (isPlus ? fp.aPlus : fp.aMinus)
                   : (isPlus ? fp.bPlus : fp.bMinus)

dedupeAdjacent(points):  // drop a point equal (within epsilon) to the one before it, and
                         // the last if it equals the first
```

```ts
const AREA_EPSILON = 1 // mm^2; a junction whose core collapses to a line gets no fill
```

Notes: `vertexIncidence`, `spokeAt`'s spoke fields, and `leftPerp` mirror
`wall-footprint.ts`. The corner read inverts `assignCorner`: a spoke's corner toward
its counter-clockwise (next) wedge is on `+leftPerp(out)`, toward its clockwise
(previous) wedge on `-leftPerp(out)`. Reading both per spoke and walking the fan gives
the core polygon; a shared miter appears twice (this spoke's next, the neighbor's
previous) and `dedupeAdjacent` collapses it.

- [ ] **Step 4:** run, expect PASS.

- [ ] **Step 5: commit** `test:` / `feat:` / `refactor:`. BLUE: if `vertexIncidence` or
      the spoke build is duplicated verbatim from `wall-footprint.ts`, extract the shared
      part into a small internal module both import (one source of truth for the fan),
      keeping `wallFootprints`' public signature unchanged. Keep each function under 40
      lines and the file under 300; `AREA_EPSILON` and the `< 3` incidence are the only
      bare numbers.

---

### Task 2: the acute three-way bay produces a simple core polygon

**Files:** Modify `core/topology/junction-fill.test.ts` (and `junction-fill.ts` only if
the assertion fails).

The fan resolves any incidence, so this is most likely a characterization test that
passes on arrival. Commit it as `test:` (rgb:audit allows an unconsumed RED). If it
fails, run a full test -> feat -> refactor cycle.

- [ ] **Step 1: add the test.** A three-way bay: partition `(2000,0) -> (2000,2000)`,
      bay-left `(2000,2000) -> (1500,4000)`, bay-right `(2000,2000) -> (2500,4000)`, all
      thickness 100. The apex `(2000,2000)` is a three-way junction whose two outer
      wedges miter and whose narrow wedge between the bay walls is acute (clamped).
      Assert at the apex: exactly one fill, its polygon has four distinct points
      (two miter points + two clamp points), `Math.abs(signedArea) > 1`, and it does not
      self-intersect:

```ts
const apexFill = fills.find((f) => /* polygon encloses (2000,2000) */)
expect(apexFill.polygon).toHaveLength(4)
expect(simplePolygon(apexFill.polygon)).toBe(true) // no two non-adjacent edges cross
```

      `simplePolygon` checks each pair of non-adjacent edges with `segmentIntersection`
      (returns null when two segments do not cross). Also assert the two clamp points on
      the acute wedge differ (the bay walls did not miter there) while the two outer
      wedges contributed shared miter points (a corner shared between adjacent walls).

- [ ] **Step 2:** run.

- [ ] **Step 3:** if it passed, commit as `test:`. If it failed, fix minimally (`feat:`),
      rerun to PASS, then `refactor:` BLUE.

---

### Task 3: the neutral `junction` surface role

**Files:** Modify `engine/materials/material-provider.ts`,
`engine/materials/neutral-material-provider.test.ts`,
`engine/materials/paint-material-provider.test.ts`.

- [ ] **Step 1: failing test.** In `neutral-material-provider.test.ts`, add `'junction'`
      to the named-roles list (or a dedicated case) and assert the provider returns a
      `MeshStandardMaterial` named `'junction'` with `color.getHex() === NEUTRAL_COLOR`.
      In `paint-material-provider.test.ts`, assert `material('junction')` with no surface
      ref returns a neutral material (a corner post is never painted).

- [ ] **Step 2:** run, expect FAIL (`'junction'` not in the `SurfaceRole` union, so the
      test does not type-check / the role is unhandled).

Run: `pnpm exec vitest run engine/materials`

- [ ] **Step 3: implement.** Add `| 'junction'` to the `SurfaceRole` union in
      `material-provider.ts`. The `role-appearance.ts` default branch already returns
      `{ color: NEUTRAL_COLOR, name: role }`, so no other change is needed; confirm both
      providers route an unmatched role through it.

- [ ] **Step 4:** run, expect PASS.

- [ ] **Step 5: commit** `test:` / `feat:` / `refactor:` (BLUE likely an empty marker).

---

### Task 4: the junction-fill prism builder

**Files:** Add `engine/scene/junction-fill-builder.ts`,
`engine/scene/junction-fill-builder.test.ts`.

`buildJunctionFill(fill, height, materials)` extrudes the core polygon into a prism from
`Y = 0` to `height`, modeled on the room slab (`room-builder.ts`) but rising rather than
sinking, with roles `top` (cap at `height`), `base` (cap at `0`), and `junction` (the
vertical sides), and no entity id.

- [ ] **Step 1: failing test.** Build a fill from a triangle polygon (the T-junction's
      `{ (1050,50), (950,50), (1000,-50) }`) at `height = 2600`, and assert via the
      geometry assertions helper (`readPositions`, `materialGroups`, `findByEntityId`):
  - the mesh has three material groups for roles in order `top`, `base`, `junction`
    (read the section roles off the materials' `name`);
  - the top cap's first triangle normal points `+Y` (`> 0.99`) and the base's `-Y`;
  - the top-cap vertices sit at world `y === 2600`, the base at `y === 0`;
  - every vertex maps through `planToWorld` (a plan point `(x, y)` lands at world
    `(x, *, y)`): the top cap's plan-`x` set matches `{1050, 950, 1000}` and plan-`y`
    (world z) matches `{50, 50, -50}`;
  - `mesh.userData.entityId` is `undefined`.

- [ ] **Step 2:** run, expect FAIL (module absent).

Run: `pnpm exec vitest run engine/scene/junction-fill-builder.test.ts`

- [ ] **Step 3: implement** `junction-fill-builder.ts`. Reuse the slab pattern:
      triangulate the polygon with `THREE.ShapeUtils.triangulateShape` (no holes); top
      cap at `height` with the triangulation winding reversed to face `+Y`; base cap at
      `0` in natural order to face `-Y`; vertical side quads per polygon edge from `0` to
      `height`; one material group per section (roles `top`, `base`, `junction`); every
      vertex through `planToWorld`; `computeVertexNormals`. Do not set
      `mesh.userData.entityId`. Where the slab helpers (`slabCapPositions`,
      side-quad emit, `geometryFromPositions`, `addSlabGroups`) would be copied verbatim,
      prefer extracting them into a shared module in the BLUE so the slab and the fill
      share one polygon-prism builder; the GREEN may inline.

- [ ] **Step 4:** run, expect PASS.

- [ ] **Step 5: commit** `test:` / `feat:` / `refactor:`. BLUE: extract the shared
      polygon-prism helpers (`room-builder.ts` and `junction-fill-builder.ts` both build
      a capped prism) if the duplication is verbatim; keep functions under 40 lines.

---

### Task 5: build the fills beside the walls

**Files:** Modify `engine/scene/wall-builder.ts`, `engine/scene/wall-builder.test.ts`.

- [ ] **Step 1: failing test** in `wall-builder.test.ts`. Build a three-way junction
      graph (the T-junction from Task 1) through `buildWalls`, and assert the returned
      group contains a fill mesh: a child whose materials include the `junction` role and
      whose `userData.entityId` is undefined, beside the wall meshes (which carry entity
      ids). Add a negative case: a plain four-wall rectangle room (all two-way corners)
      yields no fill mesh (every child carries an entity id). Assert the fill's top-cap
      vertices sit at the walls' height (2600) to pin the max-height wiring.

- [ ] **Step 2:** run, expect FAIL (`buildWalls` adds no fills yet).

Run: `pnpm exec vitest run engine/scene/wall-builder.test.ts`

- [ ] **Step 3: implement.** In `buildWalls`, after the wall loop, compute
      `junctionFills(input.graph, thicknessByEdge)` (reuse the same `thicknessByEdge`
      array already built for `wallFootprints`; lift it to a `const`). For each fill,
      `height = Math.max(...fill.edgeIndexes.map(ei => wallHeight(node for edge ei)))`
      where the node is `wallsByModelId.get(graph.edges[ei].wallId)` (skip a fill whose
      edges have no node, mirroring `edgeWallNode`'s null guard); then
      `group.add(buildJunctionFill(fill, height, input.materials))`.

- [ ] **Step 4:** run, expect PASS, and the wall-builder suite green.

- [ ] **Step 5: commit** `test:` / `feat:` / `refactor:`. BLUE: extract the
      `thicknessByEdge` build and the per-fill height resolution into named helpers if
      `buildWalls` runs past 40 lines.

---

### Task 6: visual tier baseline refresh

**Files:** the `scene-junctions-webgl` baseline.

- [ ] **Step 1:** rebuild, then run the `scene-webgl` Playwright project. Confirm by eye
      that the T-junction's core and the acute bay's apex now read as filled solid (no
      open notch), and that the shell-room baseline (all two-way corners) is unchanged
      and gained no fill.

Run: `pnpm build && pnpm exec playwright test --project=scene-webgl`

- [ ] **Step 2:** refresh the committed junction baseline with
      `--update-snapshots=all` (scoped to the junction spec) and commit as `test(e2e):`
      (audit-exempt; not a cycle RED). Confirm the shell baselines did not change.

---

## Gate before PR

Re-fetch `origin/main` and rebase before the final gate (a parallel session may advance
main). Then:

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit
&& pnpm build`, then `pnpm rgb:audit` over `origin/main..HEAD` (each cycle
test -> feat -> refactor), then the full chromium + scene-webgl e2e after a rebuild with
port 4173 killed.

Then PR (body links the spec, ADR-0082, ADR-0080, and issue #180), wait for CI, merge
with `--merge`, move issue #180 to Merged on board #3 (no roadmap-flip PR), and remove
the worktree.

## Self-review notes

- Spec coverage: the core fill pass and the T-junction (Task 1, spec 3.1/3.2), the acute
  three-way bay without self-intersection (Task 2, spec 3.2/4), the neutral `junction`
  role (Task 3, spec 3.4), the floor-to-ceiling prism at the tallest incident wall with
  no entity id and neutral caps (Task 4, spec 3.3/3.4), building the fills beside the
  walls and the two-way negative case (Task 5, spec 3.1/4), the visual baseline (Task 6,
  spec 4). Openings need no task: the opening path is untouched and the fill reads the
  same footprint corners (spec 3.5).
- Type consistency: `JunctionFill` fields `polygon`/`edgeIndexes`, `junctionFills(graph,
thicknessByEdge)`, `wallFootprints`, `signedArea`, `wallHeight`, `planToWorld`,
  `buildJunctionFill(fill, height, materials)`, `SurfaceRole` plus `'junction'` used as
  defined.
- Scope guard: the fill is built only at incidence >= 3 with core area > epsilon, so
  free ends and two-way corners (clean or acute) get no fill; the sharpest two-way corner
  is deferred (spec 5). This keeps the two-way bowtie out by construction.
- No placeholders: every cycle carries the behavior, the algorithm or the assertions, the
  run command, and the commit shape.
