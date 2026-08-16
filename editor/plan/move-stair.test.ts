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

function paramsOf(command: Command | null): MoveStairParams {
  return command?.params as MoveStairParams
}

describe('stairMoveCommand', () => {
  it('translates the stair by the displacement of the cursor from the grab point', () => {
    const command = stairMoveCommand(stairNode(), { x: 500, y: 500 }, { x: 800, y: 900 })

    expect(command?.type).toBe(MOVE_STAIR)
    expect(paramsOf(command).position).toEqual({ x: 1300, y: 2400 })
  })

  it('addresses the stair by its raw model id, without the scene-node prefix', () => {
    const command = stairMoveCommand(stairNode(), { x: 0, y: 0 }, { x: 100, y: 0 })

    expect(paramsOf(command).stairId).toBe('s1')
  })

  it('returns null when the cursor never left the grab point, so a bare click moves nothing', () => {
    expect(stairMoveCommand(stairNode(), { x: 500, y: 500 }, { x: 500, y: 500 })).toBeNull()
  })
})
