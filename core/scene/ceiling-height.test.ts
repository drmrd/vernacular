import { describe, expect, it } from 'vitest'
import {
  createFloor,
  createWall,
  DEFAULT_CEILING_HEIGHT_MM,
  deriveRoomNodesForFloor,
  type RoomSceneNode,
} from '../../core'
import { ceilingHeight } from './ceiling-height'

const CEILING_HEIGHT_MM = 2600
const FLOOR_CEILING_HEIGHT_MM = 2900
const ROOM_WIDTH = 4000
const ROOM_HEIGHT = 3000

function roomNode(overrides?: Partial<RoomSceneNode>): RoomSceneNode {
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: 'g',
    polygon: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    clearPolygon: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    area: 1000 * 1000,
    ...overrides,
  }
}

describe('ceilingHeight', () => {
  it('reports the height a room scene node carries', () => {
    const node = roomNode({ ceilingHeight: CEILING_HEIGHT_MM })

    expect(ceilingHeight(node)).toBe(CEILING_HEIGHT_MM)
  })

  it('falls back to the default ceiling height when a node omits it', () => {
    const node = roomNode()

    expect(ceilingHeight(node)).toBe(DEFAULT_CEILING_HEIGHT_MM)
  })

  it("carries the host floor's default ceiling height onto a derived room node", () => {
    const floor = createFloor('Ground', {
      id: 'g',
      defaultCeilingHeight: FLOOR_CEILING_HEIGHT_MM,
      walls: [
        createWall({ x: 0, y: 0 }, { x: ROOM_WIDTH, y: 0 }),
        createWall({ x: ROOM_WIDTH, y: 0 }, { x: ROOM_WIDTH, y: ROOM_HEIGHT }),
        createWall({ x: ROOM_WIDTH, y: ROOM_HEIGHT }, { x: 0, y: ROOM_HEIGHT }),
        createWall({ x: 0, y: ROOM_HEIGHT }, { x: 0, y: 0 }),
      ],
    })

    const node = deriveRoomNodesForFloor(floor)[0]

    expect(node?.ceilingHeight).toBe(FLOOR_CEILING_HEIGHT_MM)
  })
})
