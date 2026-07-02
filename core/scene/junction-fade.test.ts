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

  it('holds a mixed junction fill unconditionally when a non-fading interior wall meets it', () => {
    // Same T-junction fixture: an exterior "bar" wall and an interior "leg"
    // partition meet at a three-way tee with two rooms north of the bar.
    //
    // Near-wall transparency only fades exterior walls, so the interior leg
    // never fades at any camera angle. The junction therefore always keeps a
    // solid neighbor whose mitered end the fill covers and whose mass divides
    // the two rooms, so the fill must hold opaque no matter the camera (issue
    // #227). The fade group records that structural fact, and it still
    // enumerates its member exterior wall ids so the engine can read the policy
    // without re-deriving membership.
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

    expect(groups).toHaveLength(1)
    const [group] = groups as [JunctionFadeGroup]

    // The interior leg never fades, so this junction always keeps a solid
    // neighbor and its fill holds opaque unconditionally.
    expect(group.exteriorWallIds.length).toBeGreaterThanOrEqual(1)
    expect(group.fillHoldsUnconditionally).toBe(true)

    // The member exterior wall ids stay available alongside the policy.
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:bar'])
  })

  it('leaves a pure-exterior junction fill hold conditional on the live camera', () => {
    // Three separate exterior walls meet at the corner (1000,0): a "west" wall
    // and an "east" wall running along the x-axis, plus a "north" wall rising
    // from the corner. Two rooms touch only at that corner, each bordering the
    // walls on one side, so every incident wall has open air on its other side
    // and classifies as exterior:
    //
    //   - 'west' bounds room A to its north, open air to the south.
    //   - 'north' bounds room A to its west, open air to the east.
    //   - 'east' bounds room B to its south, open air to the north.
    //
    // No incident wall is an interior partition, so a camera can sit outside all
    // three at once and fade every one. With no non-fading neighbor guaranteed,
    // the fill's hold cannot be unconditional; whether it holds is decided later
    // per-frame by the engine against the live camera. The group still
    // enumerates all three incident exterior walls the engine tracks.
    const graph = buildWallGraph([
      { id: 'west', start: point(0, 0), end: point(1000, 0), thickness: WALL_THICKNESS },
      { id: 'east', start: point(1000, 0), end: point(2000, 0), thickness: WALL_THICKNESS },
      { id: 'north', start: point(1000, 0), end: point(1000, 1000), thickness: WALL_THICKNESS },
    ])

    const walls = [
      wall('wall:west', point(0, 0), point(1000, 0)),
      wall('wall:east', point(1000, 0), point(2000, 0)),
      wall('wall:north', point(1000, 0), point(1000, 1000)),
    ]
    const rooms = [
      room('room:a', [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)]),
      room('room:b', [point(1000, 0), point(2000, 0), point(2000, -1000), point(1000, -1000)]),
    ]

    const groups: JunctionFadeGroup[] = junctionFadeGroups(graph, walls, rooms)

    expect(groups).toHaveLength(1)
    const [group] = groups as [JunctionFadeGroup]

    // Every incident wall is exterior, so no neighbor is guaranteed solid and
    // the fill's hold stays conditional on the camera.
    expect(group.fillHoldsUnconditionally).toBe(false)

    // All three incident exterior walls are enumerated for the engine to test.
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:east', 'wall:north', 'wall:west'])
  })
})
