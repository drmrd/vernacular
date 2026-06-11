import { describe, it, expect } from 'vitest'
import { advanceWallTool, cancelWallTool, wallPreviewSegment, IDLE_WALL_TOOL } from './wall-tool'
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

describe('cancelWallTool', () => {
  it('cancels a drawing to idle', () => {
    expect(cancelWallTool({ phase: 'drawing', start: { x: 1, y: 2 } })).toEqual(IDLE_WALL_TOOL)
  })

  it('is idempotent on idle', () => {
    expect(cancelWallTool(IDLE_WALL_TOOL)).toEqual(IDLE_WALL_TOOL)
  })
})

describe('wallPreviewSegment', () => {
  it('previews from the anchored start to the cursor while drawing and nothing while idle', () => {
    const drawing = advanceWallTool(IDLE_WALL_TOOL, { x: 100, y: 100 }, 'g').state

    expect(wallPreviewSegment(drawing, { x: 500, y: 240 })).toEqual({
      start: { x: 100, y: 100 },
      end: { x: 500, y: 240 },
    })
    expect(wallPreviewSegment(IDLE_WALL_TOOL, { x: 500, y: 240 })).toBeUndefined()
  })
})
