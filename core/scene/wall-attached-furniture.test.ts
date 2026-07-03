import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { exteriorWalls } from './exterior-walls'
import type { FurnitureSceneNode, RoomSceneNode, WallSceneNode } from './scene-graph'
import {
  furnitureAttachedToWall,
  withAttachedFurniture,
  type WallPlanSegment,
} from './wall-attached-furniture'

const WALL_THICKNESS = 200

/** A horizontal wall along y = 0, spanning x in [0, 4000], centerline coordinates. */
const horizontalWall = (): WallPlanSegment => ({
  start: { x: 0, y: 0 },
  end: { x: 4000, y: 0 },
  thickness: WALL_THICKNESS,
})

/** An axis-aligned rectangular footprint from its min and max plan-space corners. */
const footprint = (min: Point, max: Point): Point[] => [
  { x: min.x, y: min.y },
  { x: max.x, y: min.y },
  { x: max.x, y: max.y },
  { x: min.x, y: max.y },
]

describe('furnitureAttachedToWall', () => {
  it('attaches a footprint flush against the wall face', () => {
    // The wall face sits at y = 100 (half the 200 thickness); the footprint touches it.
    const flush = footprint({ x: 1700, y: 100 }, { x: 2300, y: 700 })

    expect(furnitureAttachedToWall(flush, horizontalWall())).toBe(true)
  })

  it('attaches a footprint within the proximity tolerance of the wall face', () => {
    // An 80 mm gap between the wall face (y = 100) and the footprint: inside the tolerance.
    const nearby = footprint({ x: 1700, y: 180 }, { x: 2300, y: 780 })

    expect(furnitureAttachedToWall(nearby, horizontalWall())).toBe(true)
  })

  it('rejects a footprint farther from the wall than the tolerance', () => {
    // A 250 mm gap between the wall face and the footprint: beyond the tolerance.
    const detached = footprint({ x: 1700, y: 350 }, { x: 2300, y: 950 })

    expect(furnitureAttachedToWall(detached, horizontalWall())).toBe(false)
  })

  it('attaches a footprint whose edges cross the wall centerline', () => {
    // Every corner is farther from the centerline than the attachment reach, so only
    // the side edges crossing y = 0 can decide this one.
    const straddling = footprint({ x: 1000, y: -500 }, { x: 1600, y: 500 })

    expect(furnitureAttachedToWall(straddling, horizontalWall())).toBe(true)
  })

  it('attaches a footprint just past the wall end but within reach of it', () => {
    // Wholly beyond the wall end at x = 4000: no corner is within reach of the
    // centerline and no edge crosses it, but the wall end is 50 mm from the left edge.
    const pastTheEnd = footprint({ x: 4050, y: -300 }, { x: 4650, y: 300 })

    expect(furnitureAttachedToWall(pastTheEnd, horizontalWall())).toBe(true)
  })

  it('attaches a footprint that swallows the whole wall segment', () => {
    // The footprint contains the entire centerline; no edge crosses it and every
    // corner sits beyond the attachment reach.
    const surrounding = footprint({ x: -500, y: -400 }, { x: 4500, y: 400 })

    expect(furnitureAttachedToWall(surrounding, horizontalWall())).toBe(true)
  })

  it('honors a caller-supplied tolerance', () => {
    // A 400 mm gap: outside the default tolerance, inside a caller's 500 mm one.
    const distant = footprint({ x: 1700, y: 500 }, { x: 2300, y: 1100 })

    expect(furnitureAttachedToWall(distant, horizontalWall())).toBe(false)
    expect(furnitureAttachedToWall(distant, horizontalWall(), 500)).toBe(true)
  })
})

const ROOM_SIDE = 4000

/** The square room's ring, counter-clockwise. */
const roomSquare: Point[] = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE, y: 0 },
  { x: ROOM_SIDE, y: ROOM_SIDE },
  { x: 0, y: ROOM_SIDE },
]

const wallNode = (id: string, start: Point, end: Point): WallSceneNode => ({
  id,
  kind: 'wall',
  floorId: 'g',
  start,
  end,
  thickness: WALL_THICKNESS,
  height: 2400,
})

/** Four exterior walls ringing one square room, mirroring the near-wall fixtures. */
const squareRoomWalls = (): WallSceneNode[] => [
  wallNode('wall:bottom', { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
  wallNode('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
  wallNode('wall:top', { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
  wallNode('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
]

const squareRoom = (): RoomSceneNode => ({
  id: 'room:r1',
  kind: 'room',
  floorId: 'g',
  polygon: roomSquare,
  clearPolygon: roomSquare,
  area: ROOM_SIDE * ROOM_SIDE,
})

const furnitureNode = (id: string, corners: Point[]): FurnitureSceneNode => ({
  id,
  kind: 'furniture',
  floorId: 'g',
  footprintCorners: corners as [Point, Point, Point, Point],
  elevationZ: 0,
  height: 1800,
  assetRef: { scope: 'user', contentHash: 'hash-of-a-test-piece' },
})

describe('withAttachedFurniture', () => {
  it('pairs each exterior wall with the furniture standing against it', () => {
    const walls = squareRoomWalls()
    const exterior = exteriorWalls(walls, [squareRoom()])
    // A wardrobe flush against the bottom wall's interior face at y = 100.
    const wardrobe = furnitureNode(
      'furniture:wardrobe',
      footprint({ x: 1700, y: 100 }, { x: 2300, y: 700 }),
    )

    const annotated = withAttachedFurniture(exterior, walls, [wardrobe])

    const bottom = annotated.find((wall) => wall.wallId === 'wall:bottom')
    const top = annotated.find((wall) => wall.wallId === 'wall:top')
    expect(bottom?.furnitureIds).toEqual(['furniture:wardrobe'])
    expect(top?.furnitureIds).toEqual([])
  })

  it('pairs a free-standing piece in the middle of the room with no wall', () => {
    const walls = squareRoomWalls()
    const exterior = exteriorWalls(walls, [squareRoom()])
    const table = furnitureNode(
      'furniture:table',
      footprint({ x: 1700, y: 1700 }, { x: 2300, y: 2300 }),
    )

    const annotated = withAttachedFurniture(exterior, walls, [table])

    for (const wall of annotated) {
      expect(wall.furnitureIds).toEqual([])
    }
  })

  it('pairs a corner piece with only the first attached wall, so it never enrolls twice', () => {
    const walls = squareRoomWalls()
    const exterior = exteriorWalls(walls, [squareRoom()])
    // Tucked into the bottom-right corner, touching both faces (y = 100 and x = 3900).
    const cornerPiece = furnitureNode(
      'furniture:corner-cabinet',
      footprint({ x: 3300, y: 100 }, { x: 3900, y: 700 }),
    )

    const annotated = withAttachedFurniture(exterior, walls, [cornerPiece])

    const attachedTo = annotated.filter((wall) => (wall.furnitureIds ?? []).length > 0)
    expect(attachedTo.map((wall) => wall.wallId)).toEqual(['wall:bottom'])
  })
})
