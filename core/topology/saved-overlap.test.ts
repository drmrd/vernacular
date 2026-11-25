import { expect, it } from 'vitest'
import parkingPlan from '../../tests/fixtures/projects/corpus/21-modern-cad-line-plan-30x35-parking-three-rooms.vernacular.json?raw'
import { decodeDocument } from '../format/codec/decode-document'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { faceOf, SIDES } from './plan-geometry-test-support'

it('keeps distinct rooms on both sides of the overlapping partition in the saved parking plan', () => {
  const decoded = decodeDocument(new TextEncoder().encode(parkingPlan))
  if (!decoded.ok) throw new Error(`the parking plan failed to decode: ${decoded.failure.kind}`)
  const floor = decoded.value.project.floors[0]
  if (floor === undefined) throw new Error('expected a floor in the parking plan')

  const { network, rooms } = deriveFloorPlanGeometry(floor)
  const [westRoomIndex, eastRoomIndex] = SIDES.map((side) => {
    const face = faceOf(network, 'w-hall-left', side)
    return face.stretches.find(({ fromMm, toMm }) => fromMm <= 1800 && 1800 < toMm)?.roomIndex
  })

  expect(rooms).toHaveLength(8)
  expect(rooms[westRoomIndex ?? -1]?.wallIds).toContain('w-left-vertical')
  expect(rooms[eastRoomIndex ?? -1]?.wallIds).toContain('w-right-vertical')
  expect(westRoomIndex).not.toBe(eastRoomIndex)
  for (const side of SIDES) {
    expect(faceOf(network, 'w-r3-hall-right', side).stretches).toEqual([])
  }
})
