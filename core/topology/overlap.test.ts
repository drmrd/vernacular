import { expect, it } from 'vitest'
import { pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { floorOf, squareLoopWalls } from './plan-geometry-test-support'
import { deriveRooms } from './rooms'

it('keeps one room with the same clear area when a wall is drawn along its edge', () => {
  const square = squareLoopWalls(0, 4000, 'square')
  const expectedAreas = [(4000 - 114) ** 2]
  const layouts = [
    { name: 'plain square', walls: square },
    { name: 'inside one edge', walls: [...square, wall('overdraw', pt(1000, 0), pt(3000, 0))] },
    { name: 'past the corner', walls: [...square, wall('overdraw', pt(1000, 0), pt(5000, 0))] },
    { name: 'exact copy', walls: [...square, wall('overdraw', pt(0, 0), pt(4000, 0))] },
    { name: 'reversed copy', walls: [...square, wall('overdraw', pt(4000, 0), pt(0, 0))] },
  ]

  for (const { name, walls } of layouts) {
    const planAreas = deriveFloorPlanGeometry(floorOf(walls)).rooms.map((room) => room.area)
    const roomAreas = deriveRooms(walls).map((room) => room.area)

    expect.soft(planAreas, `deriveFloorPlanGeometry: ${name}`).toEqual(expectedAreas)
    expect.soft(roomAreas, `deriveRooms: ${name}`).toEqual(expectedAreas)
  }
})
