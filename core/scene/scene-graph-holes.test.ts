import { describe, expect, it } from 'vitest'
import type { Floor } from '../model/types'
import { createFloor, createWall } from '../model/factories'
import { deriveRoomNodesForFloor } from './scene-graph'

const OUTER_LOOP_SIDE = 6000
const INNER_LOOP_NEAR = 2000
const INNER_LOOP_FAR = 4000
const INNER_LOOP_CORNERS = 4

function donutFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: OUTER_LOOP_SIDE, y: 0 }, { id: 'outer-bottom' }),
      createWall(
        { x: OUTER_LOOP_SIDE, y: 0 },
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { id: 'outer-right' },
      ),
      createWall(
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { x: 0, y: OUTER_LOOP_SIDE },
        { id: 'outer-top' },
      ),
      createWall({ x: 0, y: OUTER_LOOP_SIDE }, { x: 0, y: 0 }, { id: 'outer-left' }),
      createWall(
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_NEAR },
        { x: INNER_LOOP_FAR, y: INNER_LOOP_NEAR },
        { id: 'inner-bottom' },
      ),
      createWall(
        { x: INNER_LOOP_FAR, y: INNER_LOOP_NEAR },
        { x: INNER_LOOP_FAR, y: INNER_LOOP_FAR },
        { id: 'inner-right' },
      ),
      createWall(
        { x: INNER_LOOP_FAR, y: INNER_LOOP_FAR },
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_FAR },
        { id: 'inner-top' },
      ),
      createWall(
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_FAR },
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_NEAR },
        { id: 'inner-left' },
      ),
    ],
  })
}

function plainLoopFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: OUTER_LOOP_SIDE, y: 0 }, { id: 'south' }),
      createWall(
        { x: OUTER_LOOP_SIDE, y: 0 },
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { id: 'east' },
      ),
      createWall(
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { x: 0, y: OUTER_LOOP_SIDE },
        { id: 'north' },
      ),
      createWall({ x: 0, y: OUTER_LOOP_SIDE }, { x: 0, y: 0 }, { id: 'west' }),
    ],
  })
}

function largestAreaRoomNode(floor: Floor) {
  const nodes = deriveRoomNodesForFloor(floor)
  const container = nodes.reduce<(typeof nodes)[number] | undefined>((largest, node) => {
    if (largest === undefined || node.area > largest.area) {
      return node
    }
    return largest
  }, undefined)
  if (container === undefined) {
    throw new Error('expected at least one room node')
  }
  return container
}

describe('deriveRoomNodesForFloor with interior voids', () => {
  it('projects the inner loop as a single hole ring onto the container room node', () => {
    const container = largestAreaRoomNode(donutFloor())

    expect(container.holes).toHaveLength(1)
    expect(container.holes?.[0]).toHaveLength(INNER_LOOP_CORNERS)
  })

  it('omits the holes field for a floor with a single plain loop', () => {
    const nodes = deriveRoomNodesForFloor(plainLoopFloor())
    const node = nodes[0]
    if (node === undefined || nodes.length !== 1) {
      throw new Error('expected exactly one room node from a single loop')
    }

    expect(node.holes).toBeUndefined()
  })
})
