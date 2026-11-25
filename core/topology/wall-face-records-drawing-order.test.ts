import { describe, expect, it } from 'vitest'
import type { Wall } from '../model/types'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry, type WallFaceRecord, type WallSide } from './floor-plan-geometry'
import { faceOf, floorOf, SIDES, twoRoomWalls } from './plan-geometry-test-support'
import { deriveRooms } from './rooms'

const OUTER_MIN_MM = 0
const OUTER_MAX_MM = 10000
const COURTYARD_MIN_MM = 3000
const COURTYARD_MAX_MM = 7000
const SHARED_WALL_LENGTH_MM = 3000

/** The four walls of a square drawn clockwise from its lower left corner, ids `<prefix>-0` to `-3`. */
function clockwiseRing(prefix: string, min: number, max: number): Wall[] {
  const corners = [pt(min, min), pt(min, max), pt(max, max), pt(max, min)]
  return corners.map((corner, index) =>
    wall(`${prefix}-${index}`, corner, corners[(index + 1) % corners.length] ?? corner),
  )
}

function roomIndexesOf(faces: readonly WallFaceRecord[]): (number | undefined)[] {
  return faces.map((face) => face.stretches[0]?.roomIndex)
}

describe('the faces of a courtyard and its outer walls that all run clockwise', () => {
  const courtyard = clockwiseRing('courtyard', COURTYARD_MIN_MM, COURTYARD_MAX_MM)
  const outer = clockwiseRing('outer', OUTER_MIN_MM, OUTER_MAX_MM)
  const { network, rooms } = deriveFloorPlanGeometry(floorOf([...courtyard, ...outer]))
  const facesOf = (ring: readonly Wall[], side: WallSide) =>
    ring.map((ringWall) => faceOf(network, ringWall.id, side))
  const [ringRoom] = roomIndexesOf(facesOf(outer, 'negative'))

  it('bounds no room, with one stretch per face, on the outside faces of the outer walls', () => {
    expect(facesOf(outer, 'positive').map((face) => face.stretches.length)).toEqual(
      Array(outer.length).fill(1),
    )
    expect(roomIndexesOf(facesOf(outer, 'positive'))).toEqual(Array(outer.length).fill(undefined))
  })

  it('bounds the ring room inside the outer walls and around the courtyard walls', () => {
    expect(ringRoom).toBeDefined()
    expect(roomIndexesOf(facesOf(outer, 'negative'))).toEqual(Array(outer.length).fill(ringRoom))
    expect(roomIndexesOf(facesOf(courtyard, 'positive'))).toEqual(
      Array(courtyard.length).fill(ringRoom),
    )
  })

  it('bounds the courtyard room on the inside faces of the courtyard walls', () => {
    const [courtyardRoom] = roomIndexesOf(facesOf(courtyard, 'negative'))

    expect(courtyardRoom).toBeDefined()
    expect(courtyardRoom).not.toBe(ringRoom)
    expect(roomIndexesOf(facesOf(courtyard, 'negative'))).toEqual(
      Array(courtyard.length).fill(courtyardRoom),
    )
    expect(rooms).toHaveLength(2)
  })
})

describe('the faces of two walls that run between the same pair of junctions', () => {
  it('bounds no room along two copies of one wall of a room, matching deriveRooms', () => {
    const walls = [...counterClockwiseWalls(), wall('south-copy', pt(0, 0), pt(4000, 0))]

    const { network, rooms } = deriveFloorPlanGeometry(floorOf(walls))

    expect(rooms).toHaveLength(deriveRooms(walls).length)
    for (const wallId of ['south', 'south-copy']) {
      for (const side of SIDES) {
        expect(faceOf(network, wallId, side).stretches).toEqual([
          { fromMm: 0, toMm: 4000, roomIndex: undefined },
        ])
      }
    }
  })

  it('bounds no room along two copies of the wall that two rooms share', () => {
    const walls = [...twoRoomWalls(), wall('shared-copy', pt(4000, 0), pt(4000, 3000))]

    const { network, rooms } = deriveFloorPlanGeometry(floorOf(walls))

    expect(rooms).toHaveLength(deriveRooms(walls).length)
    for (const wallId of ['shared', 'shared-copy']) {
      for (const side of SIDES) {
        expect(faceOf(network, wallId, side).stretches).toEqual([
          { fromMm: 0, toMm: SHARED_WALL_LENGTH_MM, roomIndex: undefined },
        ])
      }
    }
  })
})
