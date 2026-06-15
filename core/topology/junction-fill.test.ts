import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import { signedArea } from '../scene/winding'
import { junctionFills, type JunctionFill } from './junction-fill'
import { buildWallGraph } from './wall-graph'

const sortPoints = (points: Point[]): Point[] => [...points].sort((p, q) => p.x - q.x || p.y - q.y)

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
