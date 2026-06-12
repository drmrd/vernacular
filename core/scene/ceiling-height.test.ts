import { describe, expect, it } from 'vitest'
import { DEFAULT_CEILING_HEIGHT_MM, type RoomSceneNode } from '../../core'
import { ceilingHeight } from './ceiling-height'

const CEILING_HEIGHT_MM = 2600

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
})
