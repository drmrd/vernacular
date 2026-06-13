import { describe, expect, it } from 'vitest'
import { createFloor, createWall } from '../model/factories'
import type { Floor, RoomOverride } from '../model/types'
import { ROOM_ID_PREFIX } from '../topology/rooms'
import { deriveRoomNodesForFloor } from './scene-graph'

const ROOM_WIDTH = 4000
const ROOM_HEIGHT = 3000
const FLOOR_DEFAULT_CEILING_HEIGHT_MM = 2438
const OVERRIDE_CEILING_HEIGHT_MM = 3200

function oneRoomFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    defaultCeilingHeight: FLOOR_DEFAULT_CEILING_HEIGHT_MM,
    walls: [
      createWall({ x: 0, y: 0 }, { x: ROOM_WIDTH, y: 0 }),
      createWall({ x: ROOM_WIDTH, y: 0 }, { x: ROOM_WIDTH, y: ROOM_HEIGHT }),
      createWall({ x: ROOM_WIDTH, y: ROOM_HEIGHT }, { x: 0, y: ROOM_HEIGHT }),
      createWall({ x: 0, y: ROOM_HEIGHT }, { x: 0, y: 0 }),
    ],
  })
}

function soleRoomNode(floor: Floor, overrides?: Readonly<Record<string, RoomOverride>>) {
  const nodes = deriveRoomNodesForFloor(floor, overrides)
  const node = nodes[0]
  if (node === undefined) {
    throw new Error('expected one room node')
  }
  return node
}

function overrideKeyFor(floor: Floor): string {
  return soleRoomNode(floor).id.slice(ROOM_ID_PREFIX.length)
}

describe('deriveRoomNodesForFloor ceiling height', () => {
  it('applies a stored ceiling-height override to the derived room node', () => {
    const floor = oneRoomFloor()
    const key = overrideKeyFor(floor)

    const node = soleRoomNode(floor, { [key]: { ceilingHeight: OVERRIDE_CEILING_HEIGHT_MM } })

    expect(node.ceilingHeight).toBe(OVERRIDE_CEILING_HEIGHT_MM)
  })

  it('falls back to the floor default ceiling height when no override carries one', () => {
    const floor = oneRoomFloor()
    const key = overrideKeyFor(floor)

    const withoutOverride = soleRoomNode(floor)
    const withNamedOnlyOverride = soleRoomNode(floor, { [key]: { name: 'Parlor' } })

    expect(withoutOverride.ceilingHeight).toBe(FLOOR_DEFAULT_CEILING_HEIGHT_MM)
    expect(withNamedOnlyOverride.ceilingHeight).toBe(FLOOR_DEFAULT_CEILING_HEIGHT_MM)
  })
})
