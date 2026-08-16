import { describe, it, expect } from 'vitest'
import {
  MOVE_STAIR,
  STAIR_NODE_PREFIX,
  type Command,
  type MoveStairParams,
  type StairSceneNode,
} from '../../core'
import { stairMoveCommand } from './move-stair'

const STAIR_ORIGIN = { x: 1000, y: 2000 }
const GRAB_POINT = { x: 500, y: 500 }
const DROP_POINT = { x: 800, y: 900 }

function stairNode(): StairSceneNode {
  return {
    id: `${STAIR_NODE_PREFIX}s1`,
    kind: 'stair',
    floorId: 'ground',
    wellFloorId: 'upper',
    runType: 'straight',
    position: STAIR_ORIGIN,
    width: 1000,
    length: 3000,
    rotation: 0,
  }
}

// Fail here on a null command rather than handing back an undefined dressed as
// MoveStairParams, which would surface as a confusing property read downstream.
function paramsOf(command: Command | null): MoveStairParams {
  if (command === null) {
    throw new Error('expected stairMoveCommand to build a command, but it returned null')
  }
  return command.params as MoveStairParams
}

describe('stairMoveCommand', () => {
  it('translates the stair by the displacement of the cursor from the grab point', () => {
    const command = stairMoveCommand(stairNode(), GRAB_POINT, DROP_POINT)

    expect(command?.type).toBe(MOVE_STAIR)
    expect(paramsOf(command).position).toEqual({
      x: STAIR_ORIGIN.x + (DROP_POINT.x - GRAB_POINT.x),
      y: STAIR_ORIGIN.y + (DROP_POINT.y - GRAB_POINT.y),
    })
  })

  it('addresses the stair by its raw model id, without the scene-node prefix', () => {
    const command = stairMoveCommand(stairNode(), { x: 0, y: 0 }, { x: 100, y: 0 })

    expect(paramsOf(command).stairId).toBe('s1')
  })

  it('returns null when the cursor never left the grab point, so a bare click moves nothing', () => {
    expect(stairMoveCommand(stairNode(), GRAB_POINT, GRAB_POINT)).toBeNull()
  })
})
