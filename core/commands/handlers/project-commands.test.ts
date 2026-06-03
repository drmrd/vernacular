import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { DEFAULT_CEILING_HEIGHT_MM, createEmptyProject } from '../../model/factories'
import type { Project } from '../../model/types'
import {
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameProject,
  setFloorCeilingHeight,
} from './project-commands'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
}

function projectDispatcher(state: Project): Dispatcher<Project> {
  return new Dispatcher(state, registerProjectCommands(new CommandRegistry<Project>()))
}

describe('project commands', () => {
  it('adds a floor and undoes it', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)

    dispatcher.dispatch(addFloor('Ground'))
    expect(state.floors.map((floor) => floor.name)).toEqual(['Ground'])

    dispatcher.undo()
    expect(state.floors).toEqual([])
  })

  it('renames the project and restores the prior name on undo', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)

    dispatcher.dispatch(renameProject('Cottage'))
    expect(state.meta.name).toBe('Cottage')

    dispatcher.undo()
    expect(state.meta.name).toBe('House')
  })

  it('removes a floor by id and restores it on undo', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    const floorId = state.floors[0]!.id

    dispatcher.dispatch(removeFloor(floorId))
    expect(state.floors).toEqual([])

    dispatcher.undo()
    expect(state.floors.map((floor) => floor.id)).toEqual([floorId])
  })

  it('coalesces successive ceiling-height adjustments on the same floor', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    const floorId = state.floors[0]!.id

    dispatcher.dispatch(setFloorCeilingHeight(floorId, 2600))
    dispatcher.dispatch(setFloorCeilingHeight(floorId, 2700))
    expect(state.floors[0]!.defaultCeilingHeight).toBe(2700)

    dispatcher.undo()
    expect(state.floors[0]!.defaultCeilingHeight).toBe(DEFAULT_CEILING_HEIGHT_MM)
  })

  it('leaves untouched floors referentially identical after an edit', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    dispatcher.dispatch(addFloor('Upper'))
    const untouched = state.floors[0]!
    const editedId = state.floors[1]!.id

    dispatcher.dispatch(setFloorCeilingHeight(editedId, 2600))

    expect(state.floors[0]).toBe(untouched)
  })
})
