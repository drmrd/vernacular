import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import type { GraphEdge } from './wall-graph'
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

  it('miters a T-junction onto the through-wall face', () => {
    // A partition tees into the middle of a through-wall. buildWallGraph splits the
    // through-wall at the tee into a left half (b is the shared vertex) and a right
    // half (a is the shared vertex), so the shared vertex (1000,0) carries three
    // incident edges. Resolving the fan, the partition's shared end miters onto the
    // through-wall near face (y = 50) instead of squaring at the centerline (y = 0),
    // the near face splits around the partition, and the back face runs straight
    // through at y = -50 (the collinear fallback of the two through-wall halves).
    const graph = buildWallGraph([
      { id: 'through', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, thickness: 100 },
      { id: 'partition', start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 }, thickness: 100 },
    ])

    const footprints = wallFootprints(
      graph,
      graph.edges.map(() => 100),
    )
    const sharedAt = (point: Point) => (edge: GraphEdge) => {
      const a = graph.vertices[edge.a]
      const b = graph.vertices[edge.b]
      return (a?.x === point.x && a?.y === point.y) || (b?.x === point.x && b?.y === point.y)
    }
    const partition = footprints[graph.edges.findIndex((edge) => edge.wallId === 'partition')]
    const throughLeft =
      footprints[
        graph.edges.findIndex(
          (edge) =>
            edge.wallId === 'through' &&
            graph.vertices[edge.b]?.x === 1000 &&
            graph.vertices[edge.b]?.y === 0,
        )
      ]
    const throughRight =
      footprints[
        graph.edges.findIndex(
          (edge) =>
            edge.wallId === 'through' &&
            graph.vertices[edge.a]?.x === 1000 &&
            graph.vertices[edge.a]?.y === 0,
        )
      ]
    // Pin the helper down to the shared vertex so an accidental swap is caught.
    expect(graph.edges.filter(sharedAt({ x: 1000, y: 0 })).length).toBe(3)

    // The partition's shared end miters onto the through-wall near face (y = 50):
    expect(partition?.aPlus).toEqual({ x: 950, y: 50 })
    expect(partition?.aMinus).toEqual({ x: 1050, y: 50 })
    // The partition's free far end stays square:
    expect(partition?.bPlus).toEqual({ x: 950, y: 1000 })
    expect(partition?.bMinus).toEqual({ x: 1050, y: 1000 })
    // The through-wall near face splits around the partition:
    expect(throughLeft?.bPlus).toEqual({ x: 950, y: 50 })
    expect(throughRight?.aPlus).toEqual({ x: 1050, y: 50 })
    // The through-wall back face runs straight at y = -50 (collinear continuation):
    expect(throughLeft?.bMinus).toEqual({ x: 1000, y: -50 })
    expect(throughRight?.aMinus).toEqual({ x: 1000, y: -50 })
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
