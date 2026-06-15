import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { exteriorWalls, type ExteriorWall } from './exterior-walls'
import type { RoomSceneNode, WallSceneNode } from './scene-graph'

const FLOOR_ID = 'g'
const WALL_THICKNESS = 200

function wall(id: string, start: Point, end: Point): WallSceneNode {
  return { id, kind: 'wall', floorId: FLOOR_ID, start, end, thickness: WALL_THICKNESS }
}

function room(id: string, ring: Point[]): RoomSceneNode {
  return { id, kind: 'room', floorId: FLOOR_ID, polygon: ring, clearPolygon: ring, area: 1 }
}

function point(x: number, y: number): Point {
  return { x, y }
}

const SQUARE: Point[] = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)]
const ROOM_CENTER = point(2000, 2000)

function midpoint(node: WallSceneNode): Point {
  return point((node.start.x + node.end.x) / 2, (node.start.y + node.end.y) / 2)
}

describe('exteriorWalls', () => {
  it('returns all four walls of a single rectangular room as exterior with outward-pointing normals', () => {
    const rooms = [room('room:r1', SQUARE)]
    const walls = [
      wall('wall:bottom', point(0, 0), point(4000, 0)),
      wall('wall:right', point(4000, 0), point(4000, 4000)),
      wall('wall:top', point(4000, 4000), point(0, 4000)),
      wall('wall:left', point(0, 4000), point(0, 0)),
    ]

    const result = exteriorWalls(walls, rooms)

    expect(result.map((exterior) => exterior.wallId).sort()).toEqual([
      'wall:bottom',
      'wall:left',
      'wall:right',
      'wall:top',
    ])

    for (const exterior of result) {
      const wallNode = walls.find((candidate) => candidate.id === exterior.wallId)
      if (wallNode === undefined) {
        throw new Error(`unexpected wall id ${exterior.wallId}`)
      }
      const mid = midpoint(wallNode)
      const outward = point(mid.x - ROOM_CENTER.x, mid.y - ROOM_CENTER.y)
      const dot = exterior.outwardNormal.x * outward.x + exterior.outwardNormal.y * outward.y
      expect(dot).toBeGreaterThan(0)

      const magnitude = Math.hypot(exterior.outwardNormal.x, exterior.outwardNormal.y)
      expect(magnitude).toBeCloseTo(1)
    }
  })

  it('does not return a wall with a room on both sides (an interior partition)', () => {
    const roomA = room('room:a', SQUARE)
    const roomB = room('room:b', [
      point(4000, 0),
      point(8000, 0),
      point(8000, 4000),
      point(4000, 4000),
    ])
    const partition = wall('wall:partition', point(4000, 0), point(4000, 4000))

    const result: ExteriorWall[] = exteriorWalls([partition], [roomA, roomB])

    expect(result.map((exterior) => exterior.wallId)).not.toContain('wall:partition')
  })
})
