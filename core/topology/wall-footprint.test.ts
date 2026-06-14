import { describe, expect, it } from 'vitest'

import { buildWallGraph } from './wall-graph'
import { wallFootprints } from './wall-footprint'

describe('wallFootprints', () => {
  it('squares both ends of a free-standing wall', () => {
    // A 1000mm horizontal wall, thickness 200. Its left-hand normal is (0, 1),
    // so each end's corners sit half the thickness above and below the centerline.
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

  it('miters the shared end of a right-angle corner to the inner and outer points', () => {
    // L corner: wall A runs east, wall B runs north from A's far end, both 100 thick.
    // A's free end at (0,0) stays square; its shared end at (1000,0) miters. A's
    // +normal (interior) side is north, so its +normal corner takes the inner miter
    // (950, 50) and its -normal corner the outer miter (1050, -50).
    const graph = buildWallGraph([
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
      { id: 'b', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map(() => 100),
    )
    const a = footprints[graph.edges.findIndex((edge) => edge.wallId === 'a')]

    expect(a).toEqual({
      aPlus: { x: 0, y: 50 },
      aMinus: { x: 0, y: -50 },
      bPlus: { x: 950, y: 50 },
      bMinus: { x: 1050, y: -50 },
    })
  })

  it('joins walls of different thickness on each wall own face lines', () => {
    // Wall A is 200 thick, wall B is 100 thick. A's faces sit at +/-100 and B's at
    // +/-50, so the shared corner lands where A's -normal face line (y = -100) meets
    // B's outer face line (x = 1050), and where A's +normal face (y = 100) meets B's
    // inner face (x = 950).
    const graph = buildWallGraph([
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 200 },
      { id: 'b', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map((edge) => (edge.wallId === 'a' ? 200 : 100)),
    )
    const a = footprints[graph.edges.findIndex((edge) => edge.wallId === 'a')]

    expect(a).toEqual({
      aPlus: { x: 0, y: 100 },
      aMinus: { x: 0, y: -100 },
      bPlus: { x: 950, y: 100 },
      bMinus: { x: 1050, y: -100 },
    })
  })

  it('squares ends at a junction where three or more edges meet', () => {
    // A wall tees into the middle of a longer wall. buildWallGraph splits the long
    // wall at the tee, so the shared vertex carries three incident edges and the
    // stub keeps a square end there (the busy junction stays an overlapping solid).
    const graph = buildWallGraph([
      { id: 'through', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, thickness: 100 },
      { id: 'stub', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map(() => 100),
    )
    const stub = footprints[graph.edges.findIndex((edge) => edge.wallId === 'stub')]

    expect(stub).toEqual({
      aPlus: { x: 950, y: 0 },
      aMinus: { x: 1050, y: 0 },
      bPlus: { x: 950, y: 1000 },
      bMinus: { x: 1050, y: 1000 },
    })
  })

  it('squares a collinear continuation where two walls run straight through', () => {
    // Two walls in a straight line share a vertex (incidence two) but have no corner
    // to cut: their face lines are parallel, so the shared end stays square.
    const graph = buildWallGraph([
      { id: 'west', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
      { id: 'east', start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map(() => 100),
    )
    const west = footprints[graph.edges.findIndex((edge) => edge.wallId === 'west')]

    expect(west?.bPlus).toEqual({ x: 1000, y: 50 })
    expect(west?.bMinus).toEqual({ x: 1000, y: -50 })
  })

  it('squares an end where the miter would spike past the limit', () => {
    // Two walls leave the shared origin in nearly the same direction (a ~6 degree
    // wedge), so the true miter point sits roughly 1000mm out, far past the limit.
    // The shared end falls back to a square cap rather than draw a long spike.
    const graph = buildWallGraph([
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100 },
      { id: 'b', start: { x: 0, y: 0 }, end: { x: 1000, y: 100 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map(() => 100),
    )
    const a = footprints[graph.edges.findIndex((edge) => edge.wallId === 'a')]

    expect(a?.aPlus).toEqual({ x: 0, y: 50 })
    expect(a?.aMinus).toEqual({ x: 0, y: -50 })
  })
})
