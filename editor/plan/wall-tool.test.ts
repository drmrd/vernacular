import { describe, it, expect } from 'vitest'
import {
  advanceWallTool,
  backspaceWallTool,
  cancelWallTool,
  finishWallTool,
  wallGhostSegments,
  wallPreviewSegment,
  IDLE_WALL_TOOL,
} from './wall-tool'
import { ADD_WALL, type AddWallParams, type Command } from '../../core'

const p = (x: number, y: number) => ({ x, y })
const wallOf = (command: Command | undefined) => (command as Command<AddWallParams>).params.wall

describe('advanceWallTool', () => {
  it('anchors the first corner without emitting a command', () => {
    const result = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g')

    expect(result.state).toEqual({ phase: 'drawing', vertices: [p(100, 100)] })
    expect(result.commands).toBeUndefined()
  })

  it('commits one wall as each further corner is placed and keeps drawing', () => {
    const start = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const placed = advanceWallTool(start, p(500, 100), 'g')

    expect(placed.state).toEqual({ phase: 'drawing', vertices: [p(100, 100), p(500, 100)] })
    const commands = placed.commands ?? []
    expect(commands).toHaveLength(1)
    expect(wallOf(commands[0]).start).toEqual(p(100, 100))
    expect(wallOf(commands[0]).end).toEqual(p(500, 100))
  })

  it('ends the run on a click back on the active corner without committing', () => {
    const start = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const drawn = advanceWallTool(start, p(500, 100), 'g').state
    const ended = advanceWallTool(drawn, p(500, 100), 'g')

    expect(ended.state).toEqual(IDLE_WALL_TOOL)
    expect(ended.commands).toBeUndefined()
  })

  it('closes the loop on a click on the first corner with a single closing segment', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state
    const closed = advanceWallTool(state, p(0, 0), 'g')

    expect(closed.state).toEqual(IDLE_WALL_TOOL)
    const commands = closed.commands ?? []
    expect(commands).toHaveLength(1)
    expect(commands[0]?.type).toBe(ADD_WALL)
    expect(wallOf(commands[0]).start).toEqual(p(400, 400))
    expect(wallOf(commands[0]).end).toEqual(p(0, 0))
  })
})

describe('finishWallTool', () => {
  it('ends a run without a command because each segment is already committed', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    const finished = finishWallTool(state)

    expect(finished.state).toEqual(IDLE_WALL_TOOL)
    expect(finished.commands).toBeUndefined()
  })

  it('is inert on idle', () => {
    expect(finishWallTool(IDLE_WALL_TOOL)).toEqual({ state: IDLE_WALL_TOOL })
  })
})

describe('backspaceWallTool', () => {
  it('steps the draw-from corner back while two or more remain', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state

    expect(backspaceWallTool(state)).toEqual({ phase: 'drawing', vertices: [p(0, 0), p(400, 0)] })
  })

  it('returns to idle when the last remaining corner is removed', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state

    expect(backspaceWallTool(one)).toEqual(IDLE_WALL_TOOL)
  })

  it('is idempotent on idle', () => {
    expect(backspaceWallTool(IDLE_WALL_TOOL)).toEqual(IDLE_WALL_TOOL)
  })
})

describe('cancelWallTool', () => {
  it('abandons a run to idle', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(1, 2), 'g').state

    expect(cancelWallTool(one)).toEqual(IDLE_WALL_TOOL)
  })

  it('is idempotent on idle', () => {
    expect(cancelWallTool(IDLE_WALL_TOOL)).toEqual(IDLE_WALL_TOOL)
  })
})

describe('wallPreviewSegment', () => {
  it('previews from the last corner to the cursor while drawing', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state

    expect(wallPreviewSegment(state, p(400, 240))).toEqual({ start: p(400, 0), end: p(400, 240) })
    expect(wallPreviewSegment(IDLE_WALL_TOOL, p(400, 240))).toBeUndefined()
  })
})

describe('wallGhostSegments', () => {
  it('is empty because the placed segments render as committed walls', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state

    expect(wallGhostSegments(state)).toEqual([])
    expect(wallGhostSegments(IDLE_WALL_TOOL)).toEqual([])
  })
})
