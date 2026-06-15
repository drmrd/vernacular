import { describe, expect, it } from 'vitest'

import { distance } from '../geometry/point'
import { segmentIntersection } from '../geometry/segment'
import type { Point } from '../model/types'
import { signedArea } from '../scene/winding'
import { junctionFills, type JunctionFill } from './junction-fill'
import { buildWallGraph } from './wall-graph'

const sortPoints = (points: Point[]): Point[] => [...points].sort((p, q) => p.x - q.x || p.y - q.y)

const isSimplePolygon = (polygon: Point[]): boolean => {
  for (let i = 0; i < polygon.length; i += 1) {
    for (let j = i + 2; j < polygon.length; j += 1) {
      if (i === 0 && j === polygon.length - 1) continue // edges sharing the wrap vertex are adjacent
      const a1 = polygon[i] as Point
      const a2 = polygon[(i + 1) % polygon.length] as Point
      const b1 = polygon[j] as Point
      const b2 = polygon[(j + 1) % polygon.length] as Point
      if (segmentIntersection(a1, a2, b1, b2) !== null) return false
    }
  }
  return true
}

describe('junctionFills', () => {
  it('fills the uncovered core of a perpendicular T-junction', () => {
    // A partition tees into the middle of a through-wall. buildWallGraph splits
    // the through-wall at the partition foot (1000,0) into a left half and a
    // right half, so the shared vertex carries three incident edges. The three
    // walls' end caps stop at their resolved miter corners and leave a small
    // uncovered triangle around the vertex; that triangle is the fill.
    const graph = buildWallGraph([
      { id: 'through', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, thickness: 100 },
      { id: 'part', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    const fills: JunctionFill[] = junctionFills(
      graph,
      graph.edges.map(() => 100),
    )

    // One fill, at the T-junction only (the three free ends get none).
    expect(fills).toHaveLength(1)
    const [fill] = fills as [JunctionFill]

    // The core triangle, compared as an unordered set so winding and the
    // start vertex do not matter.
    expect(sortPoints(fill.polygon)).toEqual(
      sortPoints([
        { x: 1050, y: 50 },
        { x: 950, y: 50 },
        { x: 1000, y: -50 },
      ]),
    )

    // The core encloses real area, not a degenerate sliver.
    expect(Math.abs(signedArea(fill.polygon))).toBeGreaterThan(1)

    // It cites the three incident edges (the two through halves and the partition).
    expect(fill.edgeIndexes).toHaveLength(3)
    for (const edgeIndex of fill.edgeIndexes) {
      expect(edgeIndex).toBeGreaterThanOrEqual(0)
      expect(edgeIndex).toBeLessThan(graph.edges.length)
    }
  })

  it('fills the acute three-way bay apex with a simple triangle', () => {
    // A bay: a partition wall runs up to an apex where two bay walls splay out
    // toward a window. buildWallGraph leaves the apex (2000,2000) as the only
    // junction with three incident edges; the other three vertices are free
    // ends. The two outer wedges (about 166 degrees, partition against each bay
    // wall) miter cleanly and each contributes one shared miter point. In the
    // narrow wedge between the two bay walls (about 28 degrees) the two walls
    // overlap, so their near edges cross above the partition cap and that
    // crossing is the single point closing the core. A three-way junction has
    // one vertex per incident wall, so the uncovered core is a simple triangle.
    const graph = buildWallGraph([
      { id: 'part', start: { x: 2000, y: 0 }, end: { x: 2000, y: 2000 }, thickness: 100 },
      { id: 'bay-left', start: { x: 2000, y: 2000 }, end: { x: 1500, y: 4000 }, thickness: 100 },
      { id: 'bay-right', start: { x: 2000, y: 2000 }, end: { x: 2500, y: 4000 }, thickness: 100 },
    ])

    const fills: JunctionFill[] = junctionFills(
      graph,
      graph.edges.map(() => 100),
    )

    // Only the apex is a junction, so there is exactly one fill.
    expect(fills).toHaveLength(1)
    const [fill] = fills as [JunctionFill]

    // Two miter points from the obtuse wedges plus one crossing point where the
    // two acute-wedge walls' near edges meet: one vertex per incident wall.
    expect(fill.polygon).toHaveLength(3)

    // The triangle encloses real area, not a degenerate sliver.
    expect(Math.abs(signedArea(fill.polygon))).toBeGreaterThan(1)

    // Every corner of the fill hugs the apex.
    for (const p of fill.polygon) {
      expect(distance(p, { x: 2000, y: 2000 })).toBeLessThan(300)
    }

    // The triangle is simple: no two non-adjacent edges cross.
    expect(isSimplePolygon(fill.polygon)).toBe(true)
  })

  it('keeps the fill bounded when a near-parallel wedge meets at a three-way junction', () => {
    // Three walls leave the junction at the origin. The first two are nearly
    // collinear: one runs out to (1000,0) and the other to (1000,60), so the
    // wedge between them is only a few degrees wide. Their near-edge cap lines
    // run nearly parallel and, left unclamped, cross far from the vertex, which
    // would push that fill corner into a long spike. The third wall to
    // (-300,800) is well separated, so the junction core has area and a fill is
    // produced. Every corner of the fill must hug the junction core instead of
    // running away.
    const junctionVertex: Point = { x: 0, y: 0 }
    // Generous: well above the clamped corners (a few wall thicknesses) yet far
    // below the unclamped near-parallel runaway crossing (~845 from the vertex).
    const maxCornerDistanceFromVertex = 400

    const graph = buildWallGraph([
      { id: 'one', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
      { id: 'two', start: { x: 0, y: 0 }, end: { x: 1000, y: 60 }, thickness: 100 },
      { id: 'three', start: { x: 0, y: 0 }, end: { x: -300, y: 800 }, thickness: 100 },
    ])

    const fills: JunctionFill[] = junctionFills(
      graph,
      graph.edges.map(() => 100),
    )

    // The fill for the origin junction cites all three incident edges.
    const fill = fills.find((candidate) => candidate.edgeIndexes.length === 3)
    expect(fill).toBeDefined()
    const junctionFill = fill as JunctionFill

    // No corner escapes into a spike: every corner stays at the junction core.
    for (const corner of junctionFill.polygon) {
      expect(distance(corner, junctionVertex)).toBeLessThan(maxCornerDistanceFromVertex)
    }
  })

  it('gives a free-standing wall no fill', () => {
    // A single wall has only two free ends (incidence one each), so no junction
    // and nothing to fill.
    const graph = buildWallGraph([
      { id: 'w', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
    ])

    expect(
      junctionFills(
        graph,
        graph.edges.map(() => 100),
      ),
    ).toEqual([])
  })

  it('gives a clean two-way corner no fill', () => {
    // An L corner: two walls share one vertex (incidence two). A two-way corner
    // already joins solid (a clean miter or an overlapping clamp), so it leaves
    // no uncovered core and gets no fill.
    const graph = buildWallGraph([
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
      { id: 'b', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    expect(
      junctionFills(
        graph,
        graph.edges.map(() => 100),
      ),
    ).toEqual([])
  })
})
