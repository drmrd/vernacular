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
})
