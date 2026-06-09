import { describe, it, expect } from 'vitest'
import type { SceneGraph, WallSceneNode } from '../../core'
import { placeOpeningTarget } from './place-opening'

const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const WALL_LENGTH_MM = 2000
const TOLERANCE_MM = 150
const NEAR_OFFSET_MM = 50
const FAR_OFFSET_MM = 500
const MIDPOINT_MM = 1000

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: FLOOR_ID, start, end, thickness: WALL_THICKNESS_MM }
}

function scene(walls: WallSceneNode[]): SceneGraph {
  return { nodes: [], walls, rooms: [], underlays: [], openings: [], dimensions: [] }
}

const horizontalWall = (id: string, y = 0): WallSceneNode =>
  wall(id, { x: 0, y }, { x: WALL_LENGTH_MM, y })

describe('placeOpeningTarget', () => {
  it('targets the wall within tolerance, stripping the node prefix and projecting the position', () => {
    const graph = scene([horizontalWall('wall:w1')])

    expect(placeOpeningTarget(graph, { x: MIDPOINT_MM, y: NEAR_OFFSET_MM }, TOLERANCE_MM)).toEqual({
      floorId: FLOOR_ID,
      hostWallId: 'w1',
      position: MIDPOINT_MM,
    })
  })

  it('returns null when no wall is within tolerance of the world point', () => {
    const graph = scene([horizontalWall('wall:w1')])

    expect(placeOpeningTarget(graph, { x: MIDPOINT_MM, y: FAR_OFFSET_MM }, TOLERANCE_MM)).toBeNull()
  })

  it('targets the nearest wall within tolerance when several are in range', () => {
    const graph = scene([horizontalWall('wall:far', FAR_OFFSET_MM), horizontalWall('wall:near', 0)])

    expect(placeOpeningTarget(graph, { x: MIDPOINT_MM, y: NEAR_OFFSET_MM }, TOLERANCE_MM)).toEqual({
      floorId: FLOOR_ID,
      hostWallId: 'near',
      position: MIDPOINT_MM,
    })
  })

  it('projects a position near the wall end while the point is still within tolerance', () => {
    const graph = scene([horizontalWall('wall:w1')])

    expect(placeOpeningTarget(graph, { x: 1950, y: 30 }, TOLERANCE_MM)).toEqual({
      floorId: FLOOR_ID,
      hostWallId: 'w1',
      position: 1950,
    })
  })
})
