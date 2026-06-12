import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import { createWall } from '../model/factories'
import type { Room } from './rooms'
import { deriveRooms } from './rooms'

function squareLoopWalls(min: number, max: number, idPrefix: string): Wall[] {
  const corners: Point[] = [
    { x: min, y: min },
    { x: max, y: min },
    { x: max, y: max },
    { x: min, y: max },
  ]
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    if (next === undefined) {
      throw new Error('expected a closing corner')
    }
    return createWall(corner, next, { id: `${idPrefix}-${index}` })
  })
}

function largestRoom(rooms: Room[]): Room {
  const largest = [...rooms].sort((a, b) => b.area - a.area)[0]
  if (largest === undefined) {
    throw new Error('expected at least one derived room')
  }
  return largest
}

describe('deriveRooms with a free-standing inner loop', () => {
  it('carries the inner loop as an interior void that reduces the containing room area', () => {
    const outerWalls = squareLoopWalls(0, 6000, 'outer')
    const innerWalls = squareLoopWalls(2000, 4000, 'inner')

    const outerOnly = deriveRooms(outerWalls)
    const withInner = deriveRooms([...outerWalls, ...innerWalls])

    const outerOnlyRoom = outerOnly[0]
    if (outerOnlyRoom === undefined || outerOnly.length !== 1) {
      throw new Error('expected exactly one room from the outer loop alone')
    }

    // The inner loop stays its own derived room, so the outer loop and the inner
    // loop are two rooms; the larger one is the container that carries the void.
    expect(withInner).toHaveLength(2)
    const containingRoom = largestRoom(withInner)

    expect(containingRoom.holes).toHaveLength(1)
    expect(containingRoom.holes?.[0]).toHaveLength(4)
    expect(containingRoom.area).toBeLessThan(outerOnlyRoom.area)
  })

  it('derives a plain single-loop room with no interior voids', () => {
    const rooms = deriveRooms(squareLoopWalls(0, 6000, 'plain'))

    const room = rooms[0]
    if (room === undefined || rooms.length !== 1) {
      throw new Error('expected exactly one room from a single loop')
    }
    expect(room.holes ?? []).toHaveLength(0)
  })
})
