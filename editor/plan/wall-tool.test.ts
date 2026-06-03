import { describe, it, expect } from 'vitest'
import { advanceWallTool, IDLE_WALL_TOOL } from './wall-tool'
import { ADD_WALL, type AddWallParams, type Command } from '../../core'

describe('advanceWallTool', () => {
  it('anchors the start on the first click without emitting a command', () => {
    const result = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g')

    expect(result.state).toEqual({ phase: 'drawing', start: { x: 100, y: 100 } })
    expect(result.command).toBeUndefined()
  })

  it('emits an addWall command and resets on the second click', () => {
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g').state
    const result = advanceWallTool(drawing, { x: 500, y: 100 }, 'g')

    expect(result.state).toEqual(IDLE_WALL_TOOL)
    const command = result.command as Command<AddWallParams>
    expect(command.type).toBe(ADD_WALL)
    expect(command.params.floorId).toBe('g')
    expect(command.params.wall.start).toEqual({ x: 100, y: 100 })
    expect(command.params.wall.end).toEqual({ x: 500, y: 100 })
  })

  it('discards a zero-length wall', () => {
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g').state
    const result = advanceWallTool(drawing, { x: 100, y: 100 }, 'g')

    expect(result.state).toEqual(IDLE_WALL_TOOL)
    expect(result.command).toBeUndefined()
  })
})
