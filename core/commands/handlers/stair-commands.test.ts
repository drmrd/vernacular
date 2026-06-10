import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createStair } from '../../model/factories'
import type { Project } from '../../model/types'
import { addStair, registerStairCommands, removeStair } from './stair-commands'

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
})
