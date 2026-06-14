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
})
