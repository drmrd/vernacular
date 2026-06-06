# Wall Topology and Room Derivation Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (`/test-first` dispatches the `test-author` to write one failing test and commit `test:`), GREEN (`/implement` dispatches the `implementer` to write the minimal pass and commit `feat:`), then BLUE (`/clean-code-review` audits the diff, `/refactor` applies fixes or lands an empty `refactor:` marker commit). The test and implementation code shown in each task are the **controller's reference blueprint**, not handed to the agents verbatim: the `test-author` authors its test independently from the behavior description plus the public signatures, and the `implementer` writes minimal code from the failing-test output, so test/implementation independence is preserved. Tasks marked `(infrastructure)` are controller-authored glue (barrels, React/Canvas glue, docs) with no RGB triple; they are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the rooms a floor's walls enclose (polygon + area) as a pure, memoized projection of the existing model, and render room fills in the 2D plan, with zero new stored model state.

**Architecture:** Two new pure `core/` modules. `core/geometry/` holds reusable 2D primitives (distance, signed polygon area, segment intersection, point-on-segment). `core/topology/` builds a properly _noded_ planar graph from wall centerlines (merging coincident endpoints, splitting walls at T-junctions and X-crossings) and enumerates its bounded faces into rooms via angle-sorted half-edge traversal. The scene graph gains a `rooms` sibling array (the pattern ADR-0018/ADR-0021 established for `walls`), derived per-floor and memoized by floor reference. The 2D plan's `drawPlan` fills room polygons beneath the wall strokes. Rooms stay derived, never stored, honoring design spec §3.2.

**Tech Stack:** TypeScript (strict), the existing pure command/scene-graph core, Canvas 2D for the plan, Vitest for units. No new dependencies.

**Status: complete.** All sections landed on `feat/foundation-acceptance` via the red-green-blue cycle (full check chain green, `eslint .` at zero problems, `rgb:audit` clean, wall-drawing end-to-end spec passing on Chromium/Firefox/WebKit). ADR-0026 (room derivation via planar-face enumeration) was recorded in the local knowledge graph and `ROADMAP.md` records the Phase 1 decomposition and slice-1 deferrals. One in-flight deviation from the blueprint below: the planned `dropCollinear` step (Task C5) was not needed and not shipped — the dangling-stub case is handled entirely by `removeSpikes`, since the shipped test uses a non-collinear interior stub (collinear-overlapping walls are out of scope). The sub-namespace barrels (Tasks A5, C8) were also dropped in favor of direct imports, matching the house convention of a single `core/index.ts` barrel.

---

## Scope boundary (design spec §10, Phase 1; this is slice 1 of ~12)

Phase 1 (the two-dimensional plan editor) is delivered as ~12 independent slices, each its own plan in `docs/plans/` and its own RGB cycle. This plan is **slice 1: wall topology and room derivation**. The full decomposition and per-slice ownership is recorded in `ROADMAP.md`.

**In scope for slice 1:**

- `core/geometry/`: `distance`, `polygonArea` (signed shoelace), `segmentIntersection`, `pointOnSegment`.
- `core/topology/`: `buildWallGraph` (junction merge + T-junction split + X-crossing split) and `deriveRooms` (bounded-face enumeration → polygon + area + bounding wall ids).
- `core/scene/`: `RoomSceneNode`, a `rooms` array on `SceneGraph`, `deriveRoomNodes`, and per-floor-reference memoization in the deriver.
- `editor/plan/`: `drawPlan` fills room polygons beneath walls; `PlanView` threads `graph.rooms` through.

**Out of scope for slice 1, deferred with intent (also recorded in `ROADMAP.md`):**

- **No model/schema change.** Rooms remain derived. The `customPolygon` override, room naming, and room labeling are **slice 8 (room naming/labeling + override)**.
- **Centerline polygons.** Room polygons and area use wall _centerlines_. Thickness-aware interior inset (clear-area polygons) is a refinement for **slice 9 (dimensions + area)**.
- **No formatted area label** (for example `"12.5 m²"`). The numeric `area` is carried for later consumers; human-readable formatting needs the unit formatters from **slice 2 (units & measurement)**. Slice 1 renders the fill only.
- **No room selection/hit-testing.** Selecting a room and a room quadtree index belong with **slice 5 (selection + hit index)**.
- **Best-effort only, documented:** collinear overlapping walls, polygons-with-holes (courtyard/island), self-touching/figure-eight topologies. Zero-length walls are ignored.

**Acceptance for slice 1:** A closed loop of walls derives exactly one room with the correct centerline polygon and shoelace area; two rooms sharing a partition derive two rooms; an open chain derives none; a dangling stub is excluded from the room polygon; the unbounded outer face is never a room; room nodes are memoized by floor reference; `drawPlan` fills rooms beneath walls. Full check chain green; ESLint clean.

---

## File structure

New and modified files, grouped by responsibility:

```
core/
  geometry/point.ts          (create)  distance
  geometry/polygon.ts        (create)  polygonArea (signed shoelace)
  geometry/segment.ts        (create)  segmentIntersection, pointOnSegment
  topology/wall-graph.ts     (create)  PlanarGraph, GraphEdge, buildWallGraph
  topology/rooms.ts          (create)  Room, deriveRooms (face enumeration)
  scene/scene-graph.ts       (modify)  RoomSceneNode, rooms on SceneGraph, deriveRoomNodes
  scene/scene-graph-deriver.ts (modify) memoize room nodes by Floor reference
  index.ts                   (modify, infra)  barrel exports

editor/
  plan/draw-plan.ts          (modify)  fill rooms beneath walls; PlanDrawingContext.closePath
  plan/plan-view.tsx         (modify, infra)  thread graph.rooms into drawPlan

ROADMAP.md                   (modify, infra)  Phase 1 decomposition + slice-1 scope/deferrals
```

Memoization note: `bridge/session/editor-session.ts` returns the deriver's `SceneGraph` verbatim through the version-memoized `getSceneGraph()`, so the new `rooms` array reaches `PlanView` with **no bridge change**.

Public contract introduced by this plan (the signatures the `test-author` writes against and the `implementer` implements):

```ts
// core/geometry/point.ts
export function distance(a: Point, b: Point): number

// core/geometry/polygon.ts
/** Signed area by the shoelace formula; positive for counter-clockwise winding, in squared world units (mm²). */
export function polygonArea(points: readonly Point[]): number

// core/geometry/segment.ts
/** Intersection point of closed segments [a1,a2] and [b1,b2], or null when they are parallel, collinear, or disjoint. Collinear overlap returns null (out of scope). */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null
/** True when p lies on segment [a,b] within tolerance (world units). */
export function pointOnSegment(p: Point, a: Point, b: Point, tolerance: number): boolean

// core/topology/wall-graph.ts
export interface GraphEdge {
  a: number
  b: number
  wallId: string
}
export interface PlanarGraph {
  vertices: Point[]
  edges: GraphEdge[]
}
export const DEFAULT_JUNCTION_TOLERANCE_MM = 1
export function buildWallGraph(
  walls: readonly Wall[],
  options?: { tolerance?: number },
): PlanarGraph

// core/topology/rooms.ts
export interface Room {
  id: string
  polygon: Point[]
  area: number
  wallIds: string[]
}
export function deriveRooms(walls: readonly Wall[], options?: { tolerance?: number }): Room[]

// core/scene/scene-graph.ts
export interface RoomSceneNode {
  id: string
  kind: 'room'
  floorId: string
  polygon: Point[]
  area: number
}
export function deriveRoomNodes(floor: Floor): RoomSceneNode[]
// SceneGraph gains: rooms: RoomSceneNode[]
```

---

## Section A: geometry primitives (`core/geometry/`)

### Task A1: `distance`

**Files:**

- Create: `core/geometry/point.ts`
- Test: `core/geometry/point.test.ts`

- [ ] **Step 1: Write the failing test** (`/test-first` — behavior: "Euclidean distance between two points")

```ts
import { describe, expect, it } from 'vitest'
import { distance } from './point'

describe('distance', () => {
  it('returns the Euclidean distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000)
    expect(distance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run core/geometry/point.test.ts`
Expected: FAIL (`distance` is not exported / module not found).

- [ ] **Step 3: Minimal implementation** (`/implement`)

```ts
import type { Point } from '../model/types'

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm exec vitest run core/geometry/point.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE + commit**

`/clean-code-review` then `/refactor`. The `implementer` commits `feat:`; the `refactorer` lands the BLUE marker.

### Task A2: `polygonArea`

**Files:**

- Create: `core/geometry/polygon.ts`
- Test: `core/geometry/polygon.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "signed polygon area, positive CCW and negative CW")

```ts
import { describe, expect, it } from 'vitest'
import { polygonArea } from './polygon'

describe('polygonArea', () => {
  it('is positive for a counter-clockwise polygon and equals its area', () => {
    // 4000 x 3000 rectangle, counter-clockwise with y increasing upward.
    const ccw = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    expect(polygonArea(ccw)).toBe(12_000_000)
  })

  it('is negative for the same polygon wound clockwise', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ]
    expect(polygonArea(cw)).toBe(-12_000_000)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run core/geometry/polygon.test.ts`
Expected: FAIL (`polygonArea` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
import type { Point } from '../model/types'

export function polygonArea(points: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A3: `segmentIntersection`

**Files:**

- Create: `core/geometry/segment.ts`
- Test: `core/geometry/segment.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "intersection point of two crossing segments; null when parallel or disjoint")

```ts
import { describe, expect, it } from 'vitest'
import { segmentIntersection } from './segment'

describe('segmentIntersection', () => {
  it('returns the crossing point of two segments that intersect', () => {
    const p = segmentIntersection(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    )
    expect(p).toEqual({ x: 50, y: 50 })
  })

  it('returns null for parallel segments and for non-touching segments', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 }),
    ).toBeNull()
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`segmentIntersection` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
import type { Point } from '../model/types'

const EPSILON = 1e-9

export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < EPSILON) {
    return null // parallel or collinear
  }
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null
  }
  return { x: a1.x + t * r.x, y: a1.y + t * r.y }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A4: `pointOnSegment`

**Files:**

- Modify: `core/geometry/segment.ts`
- Test: `core/geometry/segment.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "point lies on a segment within tolerance, including the interior, excluding points beyond the ends")

```ts
import { pointOnSegment } from './segment'

describe('pointOnSegment', () => {
  it('is true for a point on the segment interior within tolerance', () => {
    expect(pointOnSegment({ x: 2000, y: 0 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(true)
    expect(pointOnSegment({ x: 2000, y: 0.5 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(true)
  })

  it('is false for a point off the segment or beyond its ends', () => {
    expect(pointOnSegment({ x: 2000, y: 50 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(false)
    expect(pointOnSegment({ x: 5000, y: 0 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`pointOnSegment` not exported).

- [ ] **Step 3: Minimal implementation** (append to `core/geometry/segment.ts`)

```ts
export function pointOnSegment(p: Point, a: Point, b: Point, tolerance: number): boolean {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSquared = abx * abx + aby * aby
  if (lengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y) <= tolerance
  }
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  const closest = { x: a.x + t * abx, y: a.y + t * aby }
  return Math.hypot(p.x - closest.x, p.y - closest.y) <= tolerance
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task A5: no geometry sub-barrel (house convention)

`core/` has exactly one barrel, the top-level `core/index.ts`; sub-modules import directly from specific sibling files (verified: no `index.ts` exists under any `core/` subdirectory). So there is **no** `core/geometry/index.ts`. Consumers import directly: topology uses `import { distance } from '../geometry/point'`, `import { pointOnSegment, segmentIntersection } from '../geometry/segment'`, `import { polygonArea } from '../geometry/polygon'`. The public surface reaches the rest of the app through `core/index.ts` in Task F1.

---

## Section B: wall graph (`core/topology/wall-graph.ts`)

### Task B1: `buildWallGraph` merges coincident endpoints

**Files:**

- Create: `core/topology/wall-graph.ts`
- Test: `core/topology/wall-graph.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "four walls forming a closed loop share corner vertices; zero-length walls are dropped")

```ts
import { describe, expect, it } from 'vitest'
import { createWall } from '../model/factories'
import { buildWallGraph } from './wall-graph'

const rect = () => [
  createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
  createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
  createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
  createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
]

describe('buildWallGraph', () => {
  it('merges coincident wall endpoints into shared vertices', () => {
    const graph = buildWallGraph(rect())
    expect(graph.vertices).toHaveLength(4)
    expect(graph.edges).toHaveLength(4)
    // every edge references a wall and two distinct vertices
    for (const edge of graph.edges) {
      expect(edge.a).not.toBe(edge.b)
      expect(typeof edge.wallId).toBe('string')
    }
  })

  it('drops zero-length walls', () => {
    const graph = buildWallGraph([createWall({ x: 0, y: 0 }, { x: 0, y: 0 })])
    expect(graph.edges).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`buildWallGraph` not exported).

- [ ] **Step 3: Minimal implementation**

```ts
import { distance } from '../geometry/point'
import type { Point, Wall } from '../model/types'

export interface GraphEdge {
  a: number
  b: number
  wallId: string
}

export interface PlanarGraph {
  vertices: Point[]
  edges: GraphEdge[]
}

export const DEFAULT_JUNCTION_TOLERANCE_MM = 1

export function buildWallGraph(
  walls: readonly Wall[],
  options: { tolerance?: number } = {},
): PlanarGraph {
  const tolerance = options.tolerance ?? DEFAULT_JUNCTION_TOLERANCE_MM
  const vertices: Point[] = []

  const vertexIndex = (point: Point): number => {
    for (let i = 0; i < vertices.length; i += 1) {
      if (distance(vertices[i], point) <= tolerance) {
        return i
      }
    }
    vertices.push(point)
    return vertices.length - 1
  }

  const edges: GraphEdge[] = []
  for (const wall of walls) {
    if (distance(wall.start, wall.end) <= tolerance) {
      continue
    }
    const a = vertexIndex(wall.start)
    const b = vertexIndex(wall.end)
    if (a !== b) {
      edges.push({ a, b, wallId: wall.id })
    }
  }

  return { vertices, edges }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task B2: T-junction splitting

**Files:**

- Modify: `core/topology/wall-graph.ts`
- Test: `core/topology/wall-graph.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "a wall endpoint landing on another wall's span splits that wall")

```ts
it('splits a wall where another wall ends on its interior (T-junction)', () => {
  const graph = buildWallGraph([
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), // base
    createWall({ x: 2000, y: 0 }, { x: 2000, y: 3000 }), // partition meeting the base mid-span
  ])
  // vertices: (0,0), (4000,0), (2000,0), (2000,3000)
  expect(graph.vertices).toHaveLength(4)
  // base is split into (0,0)-(2000,0) and (2000,0)-(4000,0); partition is one edge -> 3 edges
  expect(graph.edges).toHaveLength(3)
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (base edge is not split; `edges` has length 2).

- [ ] **Step 3: Minimal implementation** — split each edge by every vertex on its interior. Add a `splitEdges` pass and call it before returning:

```ts
import { distance } from '../geometry/point'
import { pointOnSegment, segmentIntersection } from '../geometry/segment'
// ...
  // before `return { vertices, edges }`:
  return { vertices, edges: splitEdges(vertices, edges, tolerance) }
}

function splitEdges(vertices: Point[], edges: GraphEdge[], tolerance: number): GraphEdge[] {
  const result: GraphEdge[] = []
  for (const edge of edges) {
    const a = vertices[edge.a]
    const b = vertices[edge.b]
    const interior = vertices
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index !== edge.a && index !== edge.b)
      .filter(({ point }) => pointOnSegment(point, a, b, tolerance))
      .sort((p, q) => paramAlong(a, b, p.point) - paramAlong(a, b, q.point))
    const chain = [edge.a, ...interior.map(({ index }) => index), edge.b]
    for (let i = 0; i < chain.length - 1; i += 1) {
      result.push({ a: chain[i], b: chain[i + 1], wallId: edge.wallId })
    }
  }
  return result
}

/** Monotonic projection of p onto the direction a->b; used only to order split points. */
function paramAlong(a: Point, b: Point, p: Point): number {
  return (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
}
```

(The `segmentIntersection` import is unused until Task B3; the `implementer` adds imports as the test requires them.)

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task B3: X-crossing splitting

**Files:**

- Modify: `core/topology/wall-graph.ts`
- Test: `core/topology/wall-graph.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "two walls crossing mid-span are split at the crossing")

```ts
it('splits both walls at an interior crossing (X-junction)', () => {
  const graph = buildWallGraph([
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
    createWall({ x: 2000, y: -1500 }, { x: 2000, y: 1500 }),
  ])
  // a crossing vertex at (2000,0) is added; each wall is split into two -> 5 vertices, 4 edges
  expect(graph.vertices).toHaveLength(5)
  expect(graph.edges).toHaveLength(4)
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (no crossing vertex; 4 vertices, 2 edges).

- [ ] **Step 3: Minimal implementation** — register interior crossings as vertices before splitting. Insert a crossing pass into `buildWallGraph` after the initial edges are built and before `splitEdges`:

```ts
// register interior crossings so splitEdges picks them up on both edges
for (let i = 0; i < edges.length; i += 1) {
  for (let j = i + 1; j < edges.length; j += 1) {
    const crossing = segmentIntersection(
      vertices[edges[i].a],
      vertices[edges[i].b],
      vertices[edges[j].a],
      vertices[edges[j].b],
    )
    if (crossing) {
      vertexIndex(crossing)
    }
  }
}
return { vertices, edges: splitEdges(vertices, edges, tolerance) }
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Re-run the whole file to confirm B1 and B2 still pass.

Run: `pnpm exec vitest run core/topology/wall-graph.test.ts`

- [ ] **Step 5: BLUE + commit**

---

## Section C: room derivation (`core/topology/rooms.ts`)

### Task C1: a closed loop derives one room polygon

**Files:**

- Create: `core/topology/rooms.ts`
- Test: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "four walls in a closed loop derive exactly one room whose polygon is the four corners")

```ts
import { describe, expect, it } from 'vitest'
import { createWall } from '../model/factories'
import type { Point } from '../model/types'
import { deriveRooms } from './rooms'

const rect = () => [
  createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
  createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
  createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
  createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
]

const sortPoints = (points: Point[]): Point[] => [...points].sort((p, q) => p.x - q.x || p.y - q.y)

describe('deriveRooms', () => {
  it('derives one room from a closed loop of walls', () => {
    const rooms = deriveRooms(rect())
    expect(rooms).toHaveLength(1)
    expect(sortPoints(rooms[0].polygon)).toEqual(
      sortPoints([
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ]),
    )
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`deriveRooms` not exported).

- [ ] **Step 3: Minimal implementation** — build the graph, enumerate faces, keep bounded (positive-area) faces. This is the general half-edge traversal; it is introduced here and reused unchanged by C2–C7.

```ts
import { polygonArea } from '../geometry/polygon'
import type { Point, Wall } from '../model/types'
import { buildWallGraph, type PlanarGraph } from './wall-graph'

export interface Room {
  id: string
  polygon: Point[]
  area: number
  wallIds: string[]
}

const AREA_EPSILON = 1e-6

export function deriveRooms(walls: readonly Wall[], options: { tolerance?: number } = {}): Room[] {
  const graph = buildWallGraph(walls, options)
  return enumerateFaces(graph)
    .map((face) => buildRoom(face, graph))
    .filter((room) => room.area > AREA_EPSILON)
}

interface HalfEdge {
  from: number
  to: number
  wallId: string
}

function enumerateFaces(graph: PlanarGraph): HalfEdge[][] {
  const halfEdges: HalfEdge[] = []
  for (const edge of graph.edges) {
    halfEdges.push({ from: edge.a, to: edge.b, wallId: edge.wallId })
    halfEdges.push({ from: edge.b, to: edge.a, wallId: edge.wallId })
  }

  const keyOf = (from: number, to: number): string => `${from}->${to}`
  const indexByKey = new Map<string, number>()
  halfEdges.forEach((he, index) => indexByKey.set(keyOf(he.from, he.to), index))

  const outgoing = new Map<number, number[]>()
  halfEdges.forEach((he, index) => {
    const list = outgoing.get(he.from) ?? []
    list.push(index)
    outgoing.set(he.from, list)
  })
  const angle = (index: number): number => {
    const he = halfEdges[index]
    return Math.atan2(
      graph.vertices[he.to].y - graph.vertices[he.from].y,
      graph.vertices[he.to].x - graph.vertices[he.from].x,
    )
  }
  for (const list of outgoing.values()) {
    list.sort((i, j) => angle(i) - angle(j))
  }

  const nextOf = (index: number): number => {
    const he = halfEdges[index]
    const twin = indexByKey.get(keyOf(he.to, he.from)) as number
    const around = outgoing.get(he.to) as number[]
    const position = around.indexOf(twin)
    return around[(position - 1 + around.length) % around.length]
  }

  const visited = new Set<number>()
  const faces: HalfEdge[][] = []
  for (let i = 0; i < halfEdges.length; i += 1) {
    if (visited.has(i)) {
      continue
    }
    const face: HalfEdge[] = []
    let current = i
    while (!visited.has(current)) {
      visited.add(current)
      face.push(halfEdges[current])
      current = nextOf(current)
    }
    faces.push(face)
  }
  return faces
}

function buildRoom(face: HalfEdge[], graph: PlanarGraph): Room {
  const loop = removeSpikes(face.map((he) => he.from))
  const polygon = loop.map((index) => graph.vertices[index])
  const wallIds = [...new Set(face.map((he) => he.wallId))].sort()
  return {
    id: `room:${wallIds.join('-')}`,
    polygon,
    area: polygonArea(polygon),
    wallIds,
  }
}

/** Collapses dangling-stub excursions (v, s, v) so a stub does not appear in the room polygon. */
function removeSpikes(loop: number[]): number[] {
  const result = [...loop]
  let changed = true
  while (changed && result.length > 2) {
    changed = false
    for (let i = 0; i < result.length; i += 1) {
      const previous = result[(i - 1 + result.length) % result.length]
      const next = result[(i + 1) % result.length]
      if (previous === next) {
        result.splice(i, 1)
        result.splice(i % result.length, 1)
        changed = true
        break
      }
    }
  }
  return result
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C2: room area is the shoelace area

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the derived room reports its centerline shoelace area")

```ts
it('reports the room area as the shoelace area of its centerline polygon', () => {
  const rooms = deriveRooms(rect())
  expect(rooms[0].area).toBe(12_000_000) // 4000mm x 3000mm
})
```

- [ ] **Step 2: Run to verify RED**

Expected: PASS or FAIL depending on the face winding the C1 implementation produced. If the single face came out clockwise (`area` negative), this test fails and pins the orientation. If it is already positive, this test still adds the area assertion as a regression guard. Run and observe:

Run: `pnpm exec vitest run core/topology/rooms.test.ts`

- [ ] **Step 3: Minimal implementation** — if RED, ensure bounded faces are emitted counter-clockwise (positive area). The `AREA_EPSILON` filter already keeps only positive-area faces; if the traversal produced the bounded face clockwise, normalize in `buildRoom` by reversing when `polygonArea(polygon) < 0`:

```ts
function buildRoom(face: HalfEdge[], graph: PlanarGraph): Room {
  const loop = removeSpikes(face.map((he) => he.from))
  let polygon = loop.map((index) => graph.vertices[index])
  if (polygonArea(polygon) < 0) {
    polygon = [...polygon].reverse()
  }
  // ...unchanged...
}
```

(If C2 was already GREEN, land an empty `refactor:` BLUE marker and move on — no code change needed.)

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C3: two rooms sharing a wall

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "a partition wall splitting an enclosure derives two rooms")

```ts
it('derives two rooms when a partition wall splits an enclosure', () => {
  const rooms = deriveRooms([
    createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }), // bottom
    createWall({ x: 0, y: 3000 }, { x: 6000, y: 3000 }), // top
    createWall({ x: 0, y: 0 }, { x: 0, y: 3000 }), // left
    createWall({ x: 6000, y: 0 }, { x: 6000, y: 3000 }), // right
    createWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 }), // partition
  ])
  expect(rooms).toHaveLength(2)
  const areas = rooms.map((room) => room.area).sort((a, b) => a - b)
  expect(areas).toEqual([9_000_000, 9_000_000]) // two 3000 x 3000 cells
})
```

- [ ] **Step 2: Run to verify RED** — Expected: PASS if T-junction splitting (B2) plus general face enumeration (C1) already cover this; otherwise FAIL. Run and observe. (The partition's endpoints land on the top and bottom walls' interiors, so B2 splits them and the graph has two cells.) This test is the integration guard that the topology and face enumeration compose.

- [ ] **Step 3: Minimal implementation** — if FAIL, the most likely cause is the face traversal `while (!visited.has(current))` guard terminating a face early on shared edges; the correct loop terminates when it returns to the starting half-edge. Confirm the loop condition is `while (!visited.has(current))` and that `nextOf` uses the clockwise-previous neighbor as written in C1; no new code is expected. If GREEN, land an empty `refactor:` marker.

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Re-run the whole file.

- [ ] **Step 5: BLUE + commit**

### Task C4: an open chain derives no room

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "walls that do not close derive no rooms")

```ts
it('derives no rooms from an open (non-closed) wall chain', () => {
  const rooms = deriveRooms([
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
    createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
    // no closing wall back to (0,0)
  ])
  expect(rooms).toHaveLength(0)
})
```

- [ ] **Step 2: Run to verify RED** — Expected: PASS or FAIL. An open chain has a single unbounded face whose only signed area is the back-and-forth excursion (≈ 0 after spike removal), so `area > AREA_EPSILON` excludes it. If GREEN already, this is a regression guard; if FAIL, observe what area the open chain produced.

- [ ] **Step 3: Minimal implementation** — if FAIL, ensure the open-chain face collapses to near-zero area after `removeSpikes` and is filtered by `AREA_EPSILON`. No new code expected if C1's spike removal and area filter are correct. Otherwise land an empty `refactor:` marker.

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C5: a dangling stub is excluded from the room polygon

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "a stub wall attached to a closed room does not appear in the room polygon")

```ts
it('excludes a dangling stub wall from the room polygon', () => {
  const rooms = deriveRooms([
    ...rect(),
    // a stub jutting inward from the (4000,0) corner, sharing that vertex
    createWall({ x: 4000, y: 0 }, { x: 3000, y: 0 }),
  ])
  expect(rooms).toHaveLength(1)
  // polygon is still the four corners; the stub tip (3000,0) is not a vertex
  expect(rooms[0].polygon).toHaveLength(4)
  expect(rooms[0].area).toBe(12_000_000)
})
```

Note: the stub `(4000,0)-(3000,0)` is collinear with the bottom wall. Because the stub's far endpoint `(3000,0)` lands on the bottom wall's interior, B2 splits the bottom wall at `(3000,0)`; the face traversal then walks out to `(3000,0)` and back, which `removeSpikes` collapses. The polygon keeps four geometric corners (the extra collinear point at `(3000,0)` is removed as a spike only if it is a true back-and-forth excursion; if it remains as a collinear vertex, see Step 3).

- [ ] **Step 2: Run to verify RED** — Expected: FAIL if the collinear split point survives as a fifth polygon vertex (`polygon` length 5).

- [ ] **Step 3: Minimal implementation** — drop collinear vertices when building the room polygon so a split point on a straight run is not reported as a corner. Extend `buildRoom` to remove collinear points after spike removal:

```ts
import { distance } from '../geometry/point'
import { polygonArea } from '../geometry/polygon'
import { pointOnSegment } from '../geometry/segment'
// ...
function buildRoom(face: HalfEdge[], graph: PlanarGraph): Room {
  const loop = removeSpikes(face.map((he) => he.from))
  let polygon = dropCollinear(loop.map((index) => graph.vertices[index]))
  if (polygonArea(polygon) < 0) {
    polygon = [...polygon].reverse()
  }
  const wallIds = [...new Set(face.map((he) => he.wallId))].sort()
  return { id: `room:${wallIds.join('-')}`, polygon, area: polygonArea(polygon), wallIds }
}

/** Removes vertices that lie on the segment between their neighbors (no turn). */
function dropCollinear(polygon: Point[]): Point[] {
  if (polygon.length < 3) {
    return polygon
  }
  const kept: Point[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const previous = polygon[(i - 1 + polygon.length) % polygon.length]
    const next = polygon[(i + 1) % polygon.length]
    if (!pointOnSegment(polygon[i], previous, next, 1e-6) || distance(previous, next) < 1e-6) {
      kept.push(polygon[i])
    }
  }
  return kept
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Re-run the whole file to confirm C1–C4 still pass (a clean rectangle has no collinear interior points, so `dropCollinear` leaves it unchanged).

- [ ] **Step 5: BLUE + commit**

### Task C6: the unbounded outer face is never a room

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "a single closed loop yields one room, not also its outer boundary")

```ts
it('never reports the unbounded outer face as a room', () => {
  // The clockwise outer boundary of the rectangle has negative signed area and
  // must be filtered out; only the one interior room remains.
  const rooms = deriveRooms(rect())
  expect(rooms).toHaveLength(1)
  expect(rooms.every((room) => room.area > 0)).toBe(true)
})
```

- [ ] **Step 2: Run to verify RED** — Expected: PASS (the `AREA_EPSILON` positive-area filter already drops the negative-area outer face). This is the explicit regression guard for the outer-face exclusion. If it FAILS, the filter or winding is wrong.

- [ ] **Step 3: Minimal implementation** — none expected; the positive-area filter from C1 handles it. Land an empty `refactor:` BLUE marker if GREEN.

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C7: room id is stable and derived from its bounding walls

**Files:**

- Modify: `core/topology/rooms.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "re-deriving the same walls yields the same room id; the id is derived from the bounding wall ids")

```ts
it('gives a room a stable id derived from its bounding wall ids', () => {
  const walls = rect()
  const first = deriveRooms(walls)
  const second = deriveRooms(walls)
  expect(first[0].id).toBe(second[0].id)
  expect(first[0].id).toContain('room:')
  // every wall bounding the room is in its wallIds
  for (const wall of walls) {
    expect(first[0].wallIds).toContain(wall.id)
  }
})
```

- [ ] **Step 2: Run to verify RED** — Expected: PASS (C1 already derives `id` from sorted `wallIds`). Regression guard for id stability, which downstream selection relies on. If it FAILS, make `id` deterministic from the sorted `wallIds`.

- [ ] **Step 3: Minimal implementation** — none expected; land an empty `refactor:` marker if GREEN.

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS.

- [ ] **Step 5: BLUE + commit**

### Task C8: no topology sub-barrel (house convention)

As with geometry (Task A5), there is **no** `core/topology/index.ts`. `core/scene/scene-graph.ts` imports `deriveRooms` directly via `import { deriveRooms } from '../topology/rooms'`, and `core/index.ts` (Task F1) re-exports the topology surface from the specific files.

---

## Section D: scene-graph rooms (`core/scene/`)

### Task D1: `deriveSceneGraph` includes room nodes

**Files:**

- Modify: `core/scene/scene-graph.ts`
- Test: `core/scene/scene-graph.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the derived scene graph carries a room node per derived room")

```ts
import { createFloor, createWall } from '../model/factories'
import { deriveSceneGraph } from './scene-graph'

it('derives a room scene node for each room a floor encloses', () => {
  const floor = createFloor('Ground', {
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ],
  })
  const graph = deriveSceneGraph({
    meta: {
      name: 'p',
      units: 'metric',
      era: 'contemporary',
      schemaVersion: 1,
      appVersion: '0.0.0',
      registryVersions: {},
    },
    floors: [floor],
  })
  expect(graph.rooms).toHaveLength(1)
  expect(graph.rooms[0]).toMatchObject({ kind: 'room', floorId: floor.id, area: 12_000_000 })
  expect(graph.rooms[0].polygon).toHaveLength(4)
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`graph.rooms` is undefined; `RoomSceneNode` / `deriveRoomNodes` not exported).

- [ ] **Step 3: Minimal implementation** — add the type, `deriveRoomNodes`, and the `rooms` array in `core/scene/scene-graph.ts`:

```ts
import { deriveRooms } from '../topology/rooms'
// ...
export interface RoomSceneNode {
  id: string
  kind: 'room'
  floorId: string
  polygon: Point[]
  area: number
}

export interface SceneGraph {
  nodes: SceneNode[]
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
}

export function deriveRoomNodes(floor: Floor): RoomSceneNode[] {
  return deriveRooms(floor.walls).map((room) => ({
    id: room.id,
    kind: 'room',
    floorId: floor.id,
    polygon: room.polygon,
    area: room.area,
  }))
}

export function deriveSceneGraph(project: Project): SceneGraph {
  return {
    nodes: project.floors.map(deriveFloorNode),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => deriveWallNode(floor, wall)),
    ),
    rooms: project.floors.flatMap(deriveRoomNodes),
  }
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Run `pnpm exec vitest run core/scene/scene-graph.test.ts`.

- [ ] **Step 5: BLUE + commit**

### Task D2: room nodes memoize by floor reference

**Files:**

- Modify: `core/scene/scene-graph-deriver.ts`
- Test: `core/scene/scene-graph-deriver.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "the deriver reuses a floor's room nodes while the floor reference is unchanged and rebuilds them when it changes")

```ts
import { createFloor, createWall } from '../model/factories'
import { createSceneGraphDeriver } from './scene-graph-deriver'
import type { Project } from '../model/types'

const projectWith = (floors: Project['floors']): Project => ({
  meta: {
    name: 'p',
    units: 'metric',
    era: 'contemporary',
    schemaVersion: 1,
    appVersion: '0.0.0',
    registryVersions: {},
  },
  floors,
})

it('reuses room nodes for an unchanged floor and rebuilds them for a replaced floor', () => {
  const floor = createFloor('Ground', {
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ],
  })
  const derive = createSceneGraphDeriver()
  const first = derive(projectWith([floor]))
  const second = derive(projectWith([floor])) // same floor reference
  expect(second.rooms[0]).toBe(first.rooms[0]) // memoized: same node object

  const replaced = { ...floor, walls: [...floor.walls] } // new floor reference
  const third = derive(projectWith([replaced]))
  expect(third.rooms[0]).not.toBe(first.rooms[0]) // rebuilt
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`second.rooms` is built fresh each call; nodes are not reference-equal).

- [ ] **Step 3: Minimal implementation** — add a per-`Floor` room-node cache to the deriver:

```ts
import { deriveFloorNode, deriveRoomNodes, deriveWallNode } from './scene-graph'
import type { RoomSceneNode, SceneGraph, SceneNode, WallSceneNode } from './scene-graph'
// ...
export function createSceneGraphDeriver(): (project: Project) => SceneGraph {
  const floorCache = new WeakMap<Floor, SceneNode>()
  const wallCache = new WeakMap<Wall, WallSceneNode>()
  const roomCache = new WeakMap<Floor, RoomSceneNode[]>()
  // ...existing floorNodeFor / wallNodeFor...

  const roomNodesFor = (floor: Floor): RoomSceneNode[] => {
    const cached = roomCache.get(floor)
    if (cached !== undefined) {
      return cached
    }
    const nodes = deriveRoomNodes(floor)
    roomCache.set(floor, nodes)
    return nodes
  }

  return (project) => ({
    nodes: project.floors.map(floorNodeFor),
    walls: project.floors.flatMap((floor) => floor.walls.map((wall) => wallNodeFor(floor, wall))),
    rooms: project.floors.flatMap(roomNodesFor),
  })
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Run `pnpm exec vitest run core/scene/scene-graph-deriver.test.ts`.

- [ ] **Step 5: BLUE + commit**

---

## Section E: 2D plan room rendering (`editor/plan/draw-plan.ts`)

### Task E1: `drawPlan` fills room polygons beneath walls

**Files:**

- Modify: `editor/plan/draw-plan.ts`
- Test: `editor/plan/draw-plan.test.ts`

- [ ] **Step 1: Write the failing test** (behavior: "drawPlan fills each room polygon, beneath the wall strokes")

```ts
import { describe, expect, it } from 'vitest'
import { drawPlan } from './draw-plan'
import { DEFAULT_PLAN_SCALE } from './viewport'

interface Call {
  op: string
  args: number[]
}

function recordingContext() {
  const calls: Call[] = []
  const record =
    (op: string) =>
    (...args: number[]) => {
      calls.push({ op, args })
    }
  return {
    calls,
    ctx: {
      lineWidth: 0,
      lineCap: 'butt' as CanvasLineCap,
      strokeStyle: '' as string,
      fillStyle: '' as string,
      clearRect: record('clearRect'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      stroke: record('stroke'),
      fill: record('fill'),
      closePath: record('closePath'),
    },
  }
}

describe('drawPlan room fills', () => {
  it('fills each room polygon before stroking walls', () => {
    const { ctx, calls } = recordingContext()
    drawPlan(ctx, {
      walls: [
        {
          id: 'w1',
          kind: 'wall',
          floorId: 'f',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
          thickness: 114,
        },
      ],
      rooms: [
        {
          id: 'room:r',
          kind: 'room',
          floorId: 'f',
          polygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          area: 12_000_000,
        },
      ],
      viewport: { scale: DEFAULT_PLAN_SCALE },
      width: 800,
      height: 600,
      selectedIds: new Set<string>(),
    })

    const ops = calls.map((call) => call.op)
    expect(ops).toContain('fill')
    expect(ops).toContain('closePath')
    // the room fill happens before the wall stroke (rooms render beneath walls)
    expect(ops.indexOf('fill')).toBeLessThan(ops.indexOf('stroke'))
  })
})
```

- [ ] **Step 2: Run to verify RED** — Expected: FAIL (`rooms` is not an accepted option; `closePath` is not on `PlanDrawingContext`; no room fill is drawn).

- [ ] **Step 3: Minimal implementation** — extend `PlanDrawingContext` and `DrawPlanOptions`, and draw rooms first:

```ts
import type { Point, RoomSceneNode, WallSceneNode } from '../../core'
// ...
export interface PlanDrawingContext {
  // ...existing members...
  closePath(): void
}

export interface DrawPlanOptions {
  walls: WallSceneNode[]
  rooms: readonly RoomSceneNode[]
  // ...existing members...
}

const ROOM_FILL_COLOR = '#eef2f6'

export function drawPlan(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  ctx.clearRect(0, 0, options.width, options.height)
  for (const room of options.rooms) {
    drawRoom(ctx, room, options.viewport)
  }
  for (const wall of options.walls) {
    drawWall(ctx, wall, options)
  }
  if (options.preview) {
    drawPreview(ctx, options.preview, options.viewport)
  }
}

function drawRoom(ctx: PlanDrawingContext, room: RoomSceneNode, viewport: Viewport): void {
  if (room.polygon.length < 3) {
    return
  }
  ctx.fillStyle = ROOM_FILL_COLOR
  ctx.beginPath()
  const first = worldToScreen(room.polygon[0], viewport)
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < room.polygon.length; i += 1) {
    const point = worldToScreen(room.polygon[i], viewport)
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.fill()
}
```

- [ ] **Step 4: Run to verify GREEN** — Expected: PASS. Run `pnpm exec vitest run editor/plan/draw-plan.test.ts`.

- [ ] **Step 5: BLUE + commit**

---

## Section F: glue and documentation (infrastructure)

### Task F1: barrels and PlanView wiring (infrastructure)

**Files:**

- Modify: `core/index.ts`
- Modify: `editor/plan/plan-view.tsx`

- [ ] **Step 1: Export the new surface from `core/index.ts`**

```ts
// geometry (no sub-barrel; export from the specific files)
export { distance } from './geometry/point'
export { polygonArea } from './geometry/polygon'
export { pointOnSegment, segmentIntersection } from './geometry/segment'
// topology
export type { GraphEdge, PlanarGraph } from './topology/wall-graph'
export { DEFAULT_JUNCTION_TOLERANCE_MM, buildWallGraph } from './topology/wall-graph'
export type { Room } from './topology/rooms'
export { deriveRooms } from './topology/rooms'
// scene rooms
export type { RoomSceneNode } from './scene/scene-graph'
export { deriveRoomNodes } from './scene/scene-graph'
```

- [ ] **Step 2: Thread `graph.rooms` into the plan redraw** — in `editor/plan/plan-view.tsx`, add `rooms` to the `PlanScene` interface and the `usePlanRedraw` `drawPlan` call, sourcing it from `graph.rooms`:

```tsx
interface PlanScene {
  walls: DrawPlanOptions['walls']
  rooms: DrawPlanOptions['rooms']
  selectedIds: ReadonlySet<string>
  preview: PreviewSegment | undefined
}

// inside usePlanRedraw's drawPlan(ctx, { ... }) call:
//   walls: scene.walls,
//   rooms: scene.rooms,
//   ...

// inside PlanView:
usePlanRedraw(canvasRef, { walls: graph.walls, rooms: graph.rooms, selectedIds, preview })
```

Update the `usePlanRedraw` `useEffect` dependency array to include `scene.rooms`.

- [ ] **Step 3: Verify** — Run the full check chain:

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all green. `PlanView` is coverage-excluded glue (jsdom has no 2D Canvas), validated by the existing wall-drawing end-to-end spec, which must still pass.

- [ ] **Step 4: Reviewed by `/clean-code-review`; commit `build:` (or `refactor:` if only wiring).**

### Task F2: roadmap update (infrastructure)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Add a Phase 1 decomposition block** under the MVP path documenting the ~12 slices, that each has its own plan, slice 1's status as in progress, and the slice-1 deferrals (centerline polygons; no formatted labels until the units slice; `customPolygon`/naming in the room-labeling slice; collinear-overlap and polygons-with-holes out of scope). This satisfies the standing requirement that anything omitted from a slice is documented in a planning/roadmap doc.

- [ ] **Step 2: Verify** — `pnpm format:check` passes on the Markdown. Reviewed by `/clean-code-review`. Commit `docs:`.

### Task F3: knowledge curation (post-merge, controller-run)

- [ ] After the section-level work lands, run the `knowledge-curator` to add local **ADR-0026: room derivation via planar-face enumeration** (the algorithm, the centerline-polygon decision, the deferred refinements) and to refresh ADR-0018/ADR-0021 cross-links for the new `rooms` array. Regenerate the local index with `pnpm knowledge:index`. No `docs/specs/` change is required because this implements the behavior the spec already mandates.

---

## Self-review

**Spec coverage:** Phase 1 deliverable "wall topology (junction detection, connection, room polygon derivation)" is covered by Sections B (junction detection + connection via merge/T/X) and C (room polygon derivation). Design spec §3.2 ("rooms are derived, not authored") is honored: no stored `rooms[]` is added. §6.1/§6.4 (scene graph as the memoized projection both renderers consume) is covered by Section D. §6.2 (Canvas plan rendering) is covered by Section E. The remaining Phase 1 deliverables are explicitly assigned to later slices in the Scope boundary and `ROADMAP.md` (Task F2).

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders. Every code step shows concrete code; every run step shows the exact `pnpm exec vitest run <path>` command and the expected PASS/FAIL. Tasks C2/C3/C4/C6/C7 are written as "may already be GREEN" regression guards with an explicit instruction to land an empty `refactor:` marker when no code change is needed (this is the project's BLUE-phase convention from CLAUDE.md, not a placeholder).

**Type consistency:** `Point`, `Wall`, `Floor`, `Project` come from `core/model/types.ts` unchanged. `GraphEdge.wallId` (singular `string`) is used consistently across `buildWallGraph`, `splitEdges`, `HalfEdge`, and `buildRoom`. `Room` (`id`, `polygon`, `area`, `wallIds`) maps field-for-field to `RoomSceneNode` (`id`, `kind`, `floorId`, `polygon`, `area`) in `deriveRoomNodes`. `SceneGraph` gains `rooms: RoomSceneNode[]`; `DrawPlanOptions` gains `rooms: readonly RoomSceneNode[]`; `PlanDrawingContext` gains `closePath(): void`. `deriveRooms`/`buildWallGraph` share the `{ tolerance?: number }` options shape and `DEFAULT_JUNCTION_TOLERANCE_MM`.

**Ordering:** geometry (A) precedes topology (B/C) which precedes scene (D) which precedes render (E); the T-junction split (B2) precedes the two-room test (C3) that depends on it; barrels (A5, C8, F1) follow the modules they export.
