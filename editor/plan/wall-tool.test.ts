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

  it('appends each further corner and keeps drawing without committing', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const two = advanceWallTool(one, p(500, 100), 'g')

    expect(two.state).toEqual({ phase: 'drawing', vertices: [p(100, 100), p(500, 100)] })
    expect(two.commands).toBeUndefined()
  })

  it('ignores a click on the last corner so a repeat press adds nothing', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(100, 100), 'g').state
    const two = advanceWallTool(one, p(500, 100), 'g').state
    const repeat = advanceWallTool(two, p(500, 100), 'g')

    expect(repeat.state).toBe(two)
    expect(repeat.commands).toBeUndefined()
  })

  it('closes the loop on a click back on the first corner once it has three corners', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state
    const closed = advanceWallTool(state, p(0, 0), 'g')

    expect(closed.state).toEqual(IDLE_WALL_TOOL)
    const commands = closed.commands ?? []
    expect(commands).toHaveLength(3)
    expect(commands.every((command) => command.type === ADD_WALL)).toBe(true)
    expect(wallOf(commands[0]).start).toEqual(p(0, 0))
    expect(wallOf(commands[2]).start).toEqual(p(400, 400))
    expect(wallOf(commands[2]).end).toEqual(p(0, 0))
  })

  it('does not close on the first corner before there are three corners', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    const two = advanceWallTool(one, p(400, 0), 'g').state
    const back = advanceWallTool(two, p(0, 0), 'g')

    expect(back.commands).toBeUndefined()
    expect(back.state).toEqual({ phase: 'drawing', vertices: [p(0, 0), p(400, 0), p(0, 0)] })
  })
})

describe('finishWallTool', () => {
  it('commits one wall per segment of the open run and returns to idle', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state
    const finished = finishWallTool(state, 'g')

    expect(finished.state).toEqual(IDLE_WALL_TOOL)
    const commands = finished.commands ?? []
    expect(commands).toHaveLength(2)
    expect(wallOf(commands[0]).start).toEqual(p(0, 0))
    expect(wallOf(commands[0]).end).toEqual(p(400, 0))
    expect(wallOf(commands[1]).end).toEqual(p(400, 400))
  })

  it('commits nothing for a run of fewer than two corners', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    const finished = finishWallTool(one, 'g')

    expect(finished.state).toEqual(IDLE_WALL_TOOL)
    expect(finished.commands).toBeUndefined()
  })

  it('is inert on idle', () => {
    expect(finishWallTool(IDLE_WALL_TOOL, 'g')).toEqual({ state: IDLE_WALL_TOOL })
  })
})

describe('backspaceWallTool', () => {
  it('removes the last corner while two or more remain', () => {
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
  it('returns the committed-so-far segments of the open run', () => {
    let state = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state
    state = advanceWallTool(state, p(400, 0), 'g').state
    state = advanceWallTool(state, p(400, 400), 'g').state

    expect(wallGhostSegments(state)).toEqual([
      { start: p(0, 0), end: p(400, 0) },
      { start: p(400, 0), end: p(400, 400) },
    ])
  })

  it('is empty for a single anchored corner and for idle', () => {
    const one = advanceWallTool(IDLE_WALL_TOOL, p(0, 0), 'g').state

    expect(wallGhostSegments(one)).toEqual([])
    expect(wallGhostSegments(IDLE_WALL_TOOL)).toEqual([])
  })
})
