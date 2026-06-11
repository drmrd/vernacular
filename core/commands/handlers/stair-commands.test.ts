import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createStair } from '../../model/factories'
import type { Project } from '../../model/types'
import {
  addStair,
  moveStair,
  registerStairCommands,
  removeStair,
  setStairRunType,
} from './stair-commands'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function stairDispatcher(state: Project): Dispatcher<Project> {
  return new Dispatcher(state, registerStairCommands(new CommandRegistry<Project>()))
}

describe('stair commands', () => {
  it('appends a stair to the project and removes it on undo', () => {
    const state = newProject()
    const dispatcher = stairDispatcher(state)
    const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })

    dispatcher.dispatch(addStair(stair))
    expect(state.stairs).toHaveLength(1)
    expect(state.stairs[0]?.id).toBe('s1')

    dispatcher.undo()
    expect(state.stairs).toHaveLength(0)
  })

  it('removes the target stair from the project and restores it on undo', () => {
    const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
    const state: Project = { ...newProject(), stairs: [stair] }
    const dispatcher = stairDispatcher(state)

    dispatcher.dispatch(removeStair('s1'))
    expect(state.stairs).toHaveLength(0)

    dispatcher.undo()
    expect(state.stairs.map((s) => s.id)).toEqual(['s1'])
  })

  it('repositions a stair footprint and restores the prior position on undo', () => {
    const stair = createStair({
      id: 's1',
      position: { x: 0, y: 0 },
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    const state: Project = { ...newProject(), stairs: [stair] }
    const dispatcher = stairDispatcher(state)

    dispatcher.dispatch(moveStair('s1', { x: 1500, y: 2500 }))
    expect(state.stairs[0]?.position).toEqual({ x: 1500, y: 2500 })

    dispatcher.undo()
    expect(state.stairs[0]?.position).toEqual({ x: 0, y: 0 })
  })

  it('coalesces consecutive moves of the same stair into one undo step', () => {
    const stair = createStair({
      id: 's1',
      position: { x: 0, y: 0 },
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    const state: Project = { ...newProject(), stairs: [stair] }
    const dispatcher = stairDispatcher(state)

    dispatcher.dispatch(moveStair('s1', { x: 100, y: 100 }))
    dispatcher.dispatch(moveStair('s1', { x: 200, y: 200 }))
    expect(state.stairs[0]?.position).toEqual({ x: 200, y: 200 })

    dispatcher.undo()
    expect(state.stairs[0]?.position).toEqual({ x: 0, y: 0 })
  })

  it('changes the stair run type and restores the prior value on undo', () => {
    const stair = createStair({
      id: 's1',
      runType: 'straight',
      connection: { fromFloorId: 'f1', toFloorId: 'f2' },
    })
    const state: Project = { ...newProject(), stairs: [stair] }
    const dispatcher = stairDispatcher(state)

    dispatcher.dispatch(setStairRunType('s1', 'u-turn'))
    expect(state.stairs[0]?.runType).toBe('u-turn')

    dispatcher.undo()
    expect(state.stairs[0]?.runType).toBe('straight')
  })
})
