import { describe, expect, it } from 'vitest'

import type { Point } from '../../core'

import { buildAdjacentRoomsFixture } from './adjacent-rooms-fixture'

function averageX(polygon: readonly Point[]): number {
  return polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length
}

describe('adjacent-rooms harness fixture', () => {
  it('derives two adjacent rooms through the real room pipeline', () => {
    const graph = buildAdjacentRoomsFixture()

    // Two rooms, not one hand-authored polygon, so the fixture exercises
    // deriveRooms and its centerline-stop rule (ADR-0129) rather than baking the
    // result in by hand (issue #402).
    expect(graph.rooms).toHaveLength(2)
  })

  it('stops the two rooms at the shared wall centerline so their slabs meet without overlap', () => {
    const graph = buildAdjacentRoomsFixture()

    const [leftRoom, rightRoom] = [...graph.rooms].sort(
      (a, b) => averageX(a.clearPolygon) - averageX(b.clearPolygon),
    )
    if (leftRoom?.outerPolygon === undefined || rightRoom?.outerPolygon === undefined) {
      throw new Error('expected a left and a right room, each with an outer boundary')
    }

    const leftOuterMaxX = Math.max(...leftRoom.outerPolygon.map((p) => p.x))
    const rightOuterMinX = Math.min(...rightRoom.outerPolygon.map((p) => p.x))

    // The shared edge stays on the centerline for both rooms, so the two outer
    // boundaries abut there with no overlapping area (the formerly z-fighting pair).
    expect(leftOuterMaxX).toBe(4000)
    expect(rightOuterMinX).toBe(4000)
    expect(leftOuterMaxX).toBeLessThanOrEqual(rightOuterMinX)
  })

  it('cuts a doorway in the shared wall so the meeting slab edge is exposed', () => {
    const graph = buildAdjacentRoomsFixture()

    // A single doorway hosted on the shared wall: the only place the shared slab
    // boundary is exposed rather than hidden under the wall mass (issue #402).
    expect(graph.openings).toHaveLength(1)
    expect(graph.openings[0]?.hostWallId).toBe('shared')
  })
})
