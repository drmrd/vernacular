import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { exteriorWalls } from './exterior-walls'
import type { FurnitureSceneNode } from './scene-graph'
import { withAttachedFurniture } from './wall-attached-furniture'
import { centeredEllFloor, nodesOf } from './wall-runs-test-fixtures'

const WALL_FACE_MM = 57
const PIECE_DEPTH_MM = 600
const PIECE_WIDTH_MM = 600
const PIECE_HEIGHT_MM = 1500

/** A rectangular piece standing against the north face of the long south wall. */
function pieceAt(id: string, fromX: number): FurnitureSceneNode {
  const south = WALL_FACE_MM
  const north = WALL_FACE_MM + PIECE_DEPTH_MM
  const east = fromX + PIECE_WIDTH_MM
  const corners: [Point, Point, Point, Point] = [
    { x: fromX, y: south },
    { x: east, y: south },
    { x: east, y: north },
    { x: fromX, y: north },
  ]
  return {
    id,
    kind: 'furniture',
    floorId: 'g',
    footprintCorners: corners,
    elevationZ: 0,
    height: PIECE_HEIGHT_MM,
    assetRef: { scope: 'project', contentHash: 'test' },
  }
}

/** Positions, in the exterior runs of the centered ell floor, of the runs that hold the piece. */
function runsHolding(piece: FurnitureSceneNode): { holding: number[]; firstLongSouth: number } {
  const { walls, rooms } = nodesOf(centeredEllFloor())
  const exterior = exteriorWalls(walls, rooms)
  const annotated = withAttachedFurniture(exterior, walls, [piece])
  return {
    holding: annotated.flatMap((run, index) =>
      run.furnitureIds?.includes(piece.id) ? [index] : [],
    ),
    firstLongSouth: exterior.findIndex((run) => run.wallId === 'wall:long-south'),
  }
}

describe('withAttachedFurniture on a block with an ell in the middle of its long wall', () => {
  it('pairs a piece beside the first stretch of the long wall with that run only', () => {
    const { holding, firstLongSouth } = runsHolding(pieceAt('furniture:near-run', 1000))

    expect(holding).toEqual([firstLongSouth])
    expect(holding).toEqual([0])
  })

  it('pairs a piece standing between the main room and the ell with no run', () => {
    const { holding } = runsHolding(pieceAt('furniture:between-rooms', 4500))

    expect(holding).toEqual([])
  })
  it('pairs a piece that spans the end of the first run and the stretch between the rooms with that run only', () => {
    const { holding, firstLongSouth } = runsHolding(pieceAt('furniture:across-run-end', 2700))

    expect(holding.length).toBeLessThanOrEqual(1)
    expect(holding.filter((index) => index !== firstLongSouth)).toEqual([])
  })
})
