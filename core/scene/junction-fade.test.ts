import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import { buildWallGraph } from '../topology/wall-graph'
import { junctionFadeGroups, type JunctionFadeGroup } from './junction-fade'
import type { RoomSceneNode, WallSceneNode } from './scene-graph'

const FLOOR_ID = 'g'
const WALL_THICKNESS = 100

function wall(id: string, start: Point, end: Point): WallSceneNode {
  return { id, kind: 'wall', floorId: FLOOR_ID, start, end, thickness: WALL_THICKNESS }
}

function room(id: string, ring: Point[]): RoomSceneNode {
  return { id, kind: 'room', floorId: FLOOR_ID, polygon: ring, clearPolygon: ring, area: 1 }
}

function point(x: number, y: number): Point {
  return { x, y }
}

describe('junctionFadeGroups', () => {
  it('pairs a three-way junction with only the exterior walls meeting it', () => {
    // A through "bar" wall (0,0)->(2000,0) with a "leg" wall teed up from its
    // midpoint at (1000,0). buildWallGraph splits the bar at the tee foot into a
    // left half and a right half, so the vertex at (1000,0) carries three
    // incident edges (two bar halves and the leg). Two rooms sit north of the
    // bar, divided by the leg: Room A west of the leg, Room B east of it.
    //
    //   - The bar is exterior: a room is north of it, open air to the south.
    //   - The leg is an interior partition: Room A on its west, Room B on its
    //     east, so it bounds no outside face and never fades.
    //
    // The fade group for the three-way junction must enumerate only the exterior
    // wall(s) meeting it (the bar), so the junction fill knows which walls' fade
    // it tracks, and must exclude the interior leg.
    const graph = buildWallGraph([
      { id: 'bar', start: point(0, 0), end: point(2000, 0), thickness: WALL_THICKNESS },
      { id: 'leg', start: point(1000, 0), end: point(1000, 1000), thickness: WALL_THICKNESS },
    ])

    const walls = [
      wall('wall:bar', point(0, 0), point(2000, 0)),
      wall('wall:leg', point(1000, 0), point(1000, 1000)),
    ]
    const rooms = [
      room('room:a', [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)]),
      room('room:b', [point(1000, 0), point(2000, 0), point(2000, 1000), point(1000, 1000)]),
    ]

    const groups: JunctionFadeGroup[] = junctionFadeGroups(graph, walls, rooms)

    // Exactly one three-way junction, hence exactly one fade group.
    expect(groups).toHaveLength(1)
    const [group] = groups as [JunctionFadeGroup]

    // The group cites the junction's three incident edges (its identity).
    expect([...group.edgeIndexes].sort((left, right) => left - right)).toEqual(
      [...graph.edges.keys()].sort((left, right) => left - right),
    )

    // It enumerates only the exterior wall meeting the junction (the bar), not
    // the interior leg partition.
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:bar'])
  })
})
